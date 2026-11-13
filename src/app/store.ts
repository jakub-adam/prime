/* App-wide state: the sync engine (data + GitHub), the in-progress workout draft and the theme. */
import { useMemo, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { goals, withStress, type Draft } from '@/core/calc';
import { todayStr } from '@/core/dates';
import { mergeLive } from '@/core/live';
import { sampleData, sampleDetails, sampleLive } from '@/core/sample';
import { KEYS, browserKV, readJSON, writeJSON } from '@/core/storage';
import { SyncEngine } from '@/core/sync';

const kv = browserKV();

export const engine = new SyncEngine({
  kv,
  sample: () => sampleData(),
  sampleDetails: () => sampleDetails(),
  sampleLive: () => sampleLive(),
  toast: (msg, kind) => (kind === 'error' ? toast.error(msg, { id: 'sync-error' }) : toast.success(msg)),
});

export function useSnapshot() {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot);
}
export function useData() {
  return useSnapshot().data;
}
export function useGoals() {
  const settings = useData().settings;
  return useMemo(() => goals(settings), [settings]);
}

/** Apple Health days with today's live Shortcut values laid over them, plus derived metrics
    (stress). Display only; never written back. */
export function useHealthDays() {
  const { data, live } = useSnapshot();
  const days = data.health.days, importedAt = data.health.importedAt;
  return useMemo(() => withStress(mergeLive(days, live, importedAt)), [days, live, importedAt]);
}

/** Live status for the Today header: when the Shortcut last exported and whether a check is running. */
export function useLive() {
  const s = useSnapshot();
  return { live: s.live, checking: s.liveChecking, checkedAt: s.liveCheckedAt, connected: s.mode === 'github' };
}

/* ---- following the Shortcut: it runs as Prime opens and commits a few seconds later, so check
   now and then every 15 s for 2 minutes while the app is in front ---- */
let liveTimer: ReturnType<typeof setInterval> | undefined;
export function followLive() {
  clearInterval(liveTimer);
  void engine.refreshLive();
  let n = 0;
  liveTimer = setInterval(() => {
    if (document.visibilityState !== 'visible' || ++n > 8) { clearInterval(liveTimer); return; }
    void engine.refreshLive();
  }, 15_000);
}

/* ---- today (updates at midnight and when the app is reopened) ---- */
let today = todayStr();
const todayListeners = new Set<() => void>();
function checkToday() {
  const t = todayStr();
  if (t !== today) {
    today = t;
    todayListeners.forEach(fn => fn());
  }
}
if (typeof window !== 'undefined') {
  setInterval(checkToday, 60_000);
  document.addEventListener('visibilitychange', checkToday);
}
export function useToday() {
  return useSyncExternalStore(
    cb => { todayListeners.add(cb); return () => { todayListeners.delete(cb); }; },
    () => today,
  );
}

/* ---- now, ticking once a minute: keeps "14 min ago" honest without re-rendering every second ---- */
let nowMs = Date.now();
const nowListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  const tick = () => { nowMs = Date.now(); nowListeners.forEach(fn => fn()); };
  setInterval(tick, 60_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
}
export function useNow() {
  return useSyncExternalStore(cb => { nowListeners.add(cb); return () => { nowListeners.delete(cb); }; }, () => nowMs);
}

/* ---- workout draft (prime.draft, same shape as v1) ---- */
let draft: Draft | null = readJSON<Draft>(kv, KEYS.draft);
const draftListeners = new Set<() => void>();
export const drafts = {
  get: () => draft,
  set(d: Draft | null) {
    draft = d ? { ...d } : null;
    writeJSON(kv, KEYS.draft, draft);
    draftListeners.forEach(fn => fn());
  },
};
export function useDraft() {
  return useSyncExternalStore(cb => { draftListeners.add(cb); return () => { draftListeners.delete(cb); }; }, drafts.get);
}

/* ---- theme (prime.theme: 'system' | 'light' | 'dark') ---- */
export type ThemePref = 'system' | 'light' | 'dark';
let theme: ThemePref = readJSON<ThemePref>(kv, KEYS.theme) || 'system';
const themeListeners = new Set<() => void>();
const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
export function applyTheme() {
  const dark = theme === 'dark' || (theme === 'system' && !!darkQuery?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#09090b' : '#fafafa');
}
darkQuery?.addEventListener('change', () => { if (theme === 'system') applyTheme(); themeListeners.forEach(fn => fn()); });
export const themes = {
  get: () => theme,
  set(t: ThemePref) {
    theme = t;
    writeJSON(kv, KEYS.theme, t);
    applyTheme();
    themeListeners.forEach(fn => fn());
  },
};
export function useTheme() {
  return useSyncExternalStore(cb => { themeListeners.add(cb); return () => { themeListeners.delete(cb); }; }, themes.get);
}
export function useResolvedTheme() {
  useTheme();
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
