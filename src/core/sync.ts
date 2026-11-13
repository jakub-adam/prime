/* Sync engine: same model as Prime v1, moved out of the UI.
   - Every edit is a list of operations applied locally right away and queued per file.
   - The queue is flushed with a PUT of the whole file. On 409/422 (someone else wrote the file,
     for example the nightly food task), refetch, reapply the queued ops, retry (up to 3 times).
   - The queue, data and file shas are persisted in localStorage (prime.cache) so unsaved edits
     survive reloads and going offline. */
import { GhError, GitHubClient, explain, isNetworkError, type FetchLike } from './github';
import { FILES, applyOps, clone, defaults, serialize } from './ops';
import { KEYS, readJSON, remove, writeJSON, type Cache, type GhConfig, type KV } from './storage';
import type { DataFiles, FileName, Op, Pending, Shas, WorkoutDetail } from './types';
import { detailPath } from './workout';
import { INBOX_DIR, latestInboxFile, parseShortcutExport, type LiveDay, type ShortcutExport } from './live';

/** Workout details kept in localStorage for offline viewing (most recently opened). */
const DETAIL_CACHE_MAX = 8;

export type SyncKind = 'idle' | 'loading' | 'saving' | 'synced' | 'offline' | 'conflict' | 'error';
export type SyncState = { kind: SyncKind; msg: string };
export type Mode = 'sample' | 'github';

export type Snapshot = {
  mode: Mode;
  loading: boolean;
  data: DataFiles;
  sha: Shas;
  pending: Pending;
  sync: SyncState;
  cachedAt: number | null;
  /** when the data was last loaded from or saved to GitHub in this session */
  syncedAt: number | null;
  /** newest Shortcut export from inbox/ (display only) */
  live: LiveDay | null;
  liveChecking: boolean;
  liveCheckedAt: number | null;
};

export type ToastFn = (msg: string, kind: 'info' | 'error') => void;

export type EngineOptions = {
  kv: KV;
  sample: () => DataFiles;
  /** demo workouts/<id>.json files for sample mode */
  sampleDetails?: () => Record<string, WorkoutDetail>;
  /** demo Shortcut export for sample mode */
  sampleLive?: () => LiveDay | null;
  fetch?: FetchLike;
  toast?: ToastFn;
};

export class SyncEngine {
  private state: Snapshot;
  private listeners = new Set<() => void>();
  private flushing: Partial<Record<FileName, boolean | 'again'>> = {};
  private inflight = new Set<Promise<void>>();
  private kv: KV;
  private sample: () => DataFiles;
  private fetchImpl: FetchLike | undefined;
  private toastFn: ToastFn;
  private sampleDetails: () => Record<string, WorkoutDetail>;
  private sampleLive: () => LiveDay | null;
  /** workouts/<id>.json already loaded or written this session; sample mode keeps imports here too */
  private details = new Map<string, WorkoutDetail>();

  constructor(opts: EngineOptions) {
    this.sampleDetails = opts.sampleDetails ?? (() => ({}));
    this.sampleLive = opts.sampleLive ?? (() => null);
    this.kv = opts.kv;
    this.sample = opts.sample;
    this.fetchImpl = opts.fetch;
    this.toastFn = opts.toast ?? (() => {});
    this.state = { mode: 'sample', loading: false, data: defaults(), sha: {}, pending: {}, sync: { kind: 'idle', msg: '' }, cachedAt: null, syncedAt: null, live: null, liveChecking: false, liveCheckedAt: null };
  }

  /* ---- store interface (useSyncExternalStore) ---- */
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  private set(patch: Partial<Snapshot>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }
  private setData(file: FileName, value: DataFiles[FileName]) {
    this.set({ data: { ...this.state.data, [file]: value } });
  }

  /* ---- connection ---- */
  gh(): GhConfig { return readJSON<GhConfig>(this.kv, KEYS.gh) || {}; }
  connected() { const g = this.gh(); return !!(g.owner && g.repo && g.token); }
  private client(cfg = this.gh()) { return new GitHubClient(cfg, this.fetchImpl); }

  private persistCache() {
    if (this.state.mode !== 'github') return;
    const c: Cache = { data: this.state.data, sha: this.state.sha, pending: this.state.pending, at: Date.now() };
    writeJSON(this.kv, KEYS.cache, c);
  }

  private setSync(kind: SyncKind, msg: string) {
    this.set({ sync: { kind, msg } });
    if (kind === 'offline' || kind === 'conflict' || kind === 'error') this.toastFn(msg, 'error');
  }
  private fail(e: unknown, conflict = false) {
    if (isNetworkError(e)) this.setSync('offline', explain(e));
    else if (conflict) this.setSync('conflict', 'Someone else keeps changing this file. Your edit is kept here; it will retry.');
    else this.setSync('error', explain(e));
  }

  /* ---- loading ---- */
  async load() {
    if (!this.connected()) {
      this.details = new Map(Object.entries(this.sampleDetails()));
      this.set({ mode: 'sample', data: this.sample(), loading: false, sha: {}, pending: {}, sync: { kind: 'idle', msg: '' }, cachedAt: null, live: this.sampleLive() });
      return;
    }
    const cache = readJSON<Cache>(this.kv, KEYS.cache);
    const liveCache = readJSON<{ live: LiveDay; sha: string }>(this.kv, KEYS.live);
    if (liveCache?.live && !this.state.live) { this.liveSha = liveCache.sha; this.set({ live: liveCache.live }); }
    if (cache && cache.data) {
      this.set({
        mode: 'github',
        data: Object.assign(defaults(), cache.data),
        sha: cache.sha || {},
        pending: cache.pending || {},
        loading: false,
        cachedAt: cache.at ?? null,
      });
    } else {
      this.set({ mode: 'github', loading: true, data: defaults(), sha: {}, pending: {}, cachedAt: null });
    }
    // A refresh over data that is already on screen stays quiet: only a first load shows "Loading".
    if (!(cache && cache.data)) this.setSync('loading', 'Loading…');
    try {
      const client = this.client();
      await client.repoInfo();
      const results = await Promise.all(FILES.map(f => client.getFile(f)));
      const data = { ...this.state.data } as Record<FileName, unknown>;
      const sha: Shas = { ...this.state.sha };
      FILES.forEach((f, i) => {
        const r = results[i]!;
        data[f] = applyOps(r.data as Record<string, unknown>, this.state.pending[f] || []);
        sha[f] = r.sha;
      });
      this.set({ data: data as DataFiles, sha, loading: false, cachedAt: Date.now(), syncedAt: Date.now() });
      this.persistCache();
      this.setSync('synced', 'Synced');
      for (const f of FILES) if ((this.state.pending[f] || []).length) void this.flush(f);
    } catch (e) {
      this.set({ loading: false });
      this.fail(e);
    }
  }

  /* ---- saving ---- */
  flush(file: FileName): Promise<void> {
    if (this.flushing[file]) { this.flushing[file] = 'again'; return Promise.resolve(); }
    this.flushing[file] = true;
    const p = this.runFlush(file);
    this.inflight.add(p);
    void p.finally(() => this.inflight.delete(p));
    return p;
  }

  private async runFlush(file: FileName) {
    this.setSync('saving', 'Saving…');
    let conflict = false;
    try {
      let tries = 0;
      while ((this.state.pending[file] || []).length) {
        const n = this.state.pending[file]!.length;
        const body = serialize(this.state.data[file]);
        try {
          const res = await this.client().putFile(file, body, this.state.sha[file]);
          this.set({
            sha: { ...this.state.sha, [file]: res.content.sha },
            pending: { ...this.state.pending, [file]: this.state.pending[file]!.slice(n) },
          });
          tries = 0;
        } catch (e) {
          if (e instanceof GhError && (e.status === 409 || e.status === 422)) {
            if (tries++ < 3) {
              const fresh = await this.client().getFile(file);
              this.setData(file, applyOps(fresh.data as Record<string, unknown>, this.state.pending[file] || []) as DataFiles[FileName]);
              this.set({ sha: { ...this.state.sha, [file]: fresh.sha } });
              continue;
            }
            conflict = true;
          }
          throw e;
        }
      }
      this.set({ syncedAt: Date.now() });
      this.setSync('synced', 'Saved');
    } catch (e) {
      this.fail(e, conflict);
    } finally {
      const again = this.flushing[file] === 'again';
      this.flushing[file] = false;
      this.persistCache();
      if (again) void this.flush(file);
    }
  }

  /** Applies ops locally and queues them for GitHub. Returns false in sample mode (nothing saved). */
  commit(file: FileName, ops: Op[], message?: string) {
    this.setData(file, applyOps(clone(this.state.data[file]) as Record<string, unknown>, ops) as DataFiles[FileName]);
    if (this.state.mode === 'github') {
      this.set({ pending: { ...this.state.pending, [file]: (this.state.pending[file] || []).concat(ops) } });
      this.persistCache();
      void this.flush(file);
      if (message) this.toastFn(message, 'info');
      return true;
    }
    this.toastFn('Sample mode: not saved. Connect your data in Settings.', 'info');
    return false;
  }

  /** Resolves once no flush is running (used by tests and before reloads). */
  async idle() {
    while (this.inflight.size) await Promise.allSettled([...this.inflight]);
  }

  pendingCount() {
    return FILES.reduce((n, f) => n + (this.state.pending[f] || []).length, 0);
  }
  isBusy() {
    return FILES.some(f => this.flushing[f] || (this.state.pending[f] || []).length);
  }

  retryPending() {
    if (this.state.mode !== 'github') return;
    for (const f of FILES) if ((this.state.pending[f] || []).length) void this.flush(f);
  }
  /** v1: reload from GitHub when the app comes back to the foreground, unless edits are in flight. */
  onVisible() {
    if (this.state.mode === 'github' && !this.isBusy()) void this.load();
  }

  /* ---- live Apple Health data (inbox/ from the iPhone Shortcut) ---- */
  private liveSha: string | null = null;
  /** tree sha of inbox/ at the last listing (memory only, so a new session always lists once) */
  private inboxSha: string | null = null;
  private liveBusy = false;
  /** Fetches the newest Shortcut export if it changed. Quiet on failure: the sync chip reports real errors. */
  async refreshLive() {
    if (this.state.mode !== 'github' || this.liveBusy) return;
    this.liveBusy = true;
    this.set({ liveChecking: true });
    try {
      const client = this.client();
      // The root listing gives inbox/'s tree sha: unchanged folder = nothing new, and a repo
      // without inbox/ costs no 404 (which browsers log as a console error).
      const inbox = (await client.listDir('')).find(e => e.name === INBOX_DIR && e.type === 'dir');
      if (!inbox || inbox.sha === this.inboxSha) { this.set({ liveCheckedAt: Date.now() }); return; }
      const files = (await client.listDir(INBOX_DIR)).filter(f => f.type === 'file');
      const name = latestInboxFile(files.map(f => f.name));
      const f = name ? files.find(x => x.name === name)! : null;
      if (f && !(this.state.live?.file === f.name && this.liveSha === f.sha)) {
        const x = await client.getJSON<ShortcutExport>(`${INBOX_DIR}/${f.name}`);
        const live = x ? parseShortcutExport(x, f.name) : null;
        if (live) {
          this.liveSha = f.sha;
          this.set({ live });
          writeJSON(this.kv, KEYS.live, { live, sha: f.sha });
        }
      }
      this.inboxSha = inbox.sha;
      this.set({ liveCheckedAt: Date.now() });
    } catch { /* offline or no access to inbox/: keep the last live values */ }
    finally {
      this.liveBusy = false;
      this.set({ liveChecking: false });
    }
  }
  private dropLive() {
    remove(this.kv, KEYS.live);
    this.liveSha = null;
    this.inboxSha = null;
    this.set({ live: null, liveCheckedAt: null });
  }

  /* ---- settings actions ---- */
  async testConnection(cfg = this.gh()) {
    try {
      const info = await this.client(cfg).repoInfo();
      if (!info.permissions || !info.permissions.push) throw new GhError(403, '');
      return { ok: true as const, warn: info.private ? undefined : 'This repo is public. Make it private in its GitHub settings so your data stays yours.' };
    } catch (e) {
      return { ok: false as const, msg: explain(e) };
    }
  }

  /* ---- workout details (workouts/<id>.json, outside the six data files) ---- */
  /** Loads one workout's series: memory, then the offline cache, then GitHub. null = not in the repo. */
  async workoutDetail(id: string): Promise<WorkoutDetail | null> {
    const hit = this.details.get(id);
    if (hit) return hit;
    if (this.state.mode !== 'github') return null;
    const cached = (readJSON<WorkoutDetail[]>(this.kv, KEYS.details) || []).find(d => d.id === id);
    if (cached) { this.details.set(id, cached); return cached; }
    const d = await this.client().getJSON<WorkoutDetail>(detailPath(id));
    if (d) this.remember(d);
    return d;
  }
  private remember(d: WorkoutDetail) {
    this.details.set(d.id, d);
    const list = (readJSON<WorkoutDetail[]>(this.kv, KEYS.details) || []).filter(x => x.id !== d.id);
    writeJSON(this.kv, KEYS.details, [d, ...list].slice(0, DETAIL_CACHE_MAX));
  }
  /** Writes workout detail files, up to 40 per commit. In sample mode they stay in memory. */
  async saveWorkoutDetails(details: Record<string, WorkoutDetail>) {
    const all = Object.values(details);
    for (const d of all) this.details.set(d.id, d);
    if (this.state.mode !== 'github' || !all.length) return { saved: 0 };
    let saved = 0;
    for (let i = 0; i < all.length; i += 40) {
      const part = all.slice(i, i + 40);
      await this.client().commitFiles(part.map(d => ({ path: detailPath(d.id), content: serialize(d) })),
        part.length === 1 ? `Add workout ${part[0]!.id} from app` : `Add ${part.length} workouts from app`);
      saved += part.length;
    }
    return { saved };
  }

  async connect(cfg: Required<GhConfig>) {
    const prev = this.gh();
    writeJSON(this.kv, KEYS.gh, cfg);
    const res = await this.testConnection(cfg);
    if (!res.ok) {
      writeJSON(this.kv, KEYS.gh, prev);
      return res;
    }
    if (prev.owner !== cfg.owner || prev.repo !== cfg.repo) {
      remove(this.kv, KEYS.cache);
      remove(this.kv, KEYS.details);
      this.details.clear();
      this.dropLive();
      this.set({ pending: {}, sha: {} });
    }
    await this.load();
    return res;
  }

  disconnect() {
    remove(this.kv, KEYS.gh);
    remove(this.kv, KEYS.cache);
    remove(this.kv, KEYS.details);
    this.details.clear();
    this.dropLive();
    void this.load();
  }

  /** Drops the local copy of the data (not the token) and reloads from GitHub. Unsaved edits are lost. */
  clearCache() {
    remove(this.kv, KEYS.cache);
    remove(this.kv, KEYS.details);
    this.details.clear();
    this.set({ pending: {}, sha: {} });
    void this.load();
  }
}
