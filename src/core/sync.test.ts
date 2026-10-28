import { beforeEach, describe, expect, it } from 'vitest';
import { MockGitHub } from '../../tests/mock-github';
import { applyOps, defaults } from './ops';
import { KEYS, type Cache, type KV } from './storage';
import { SyncEngine } from './sync';
import type { Meal, Op } from './types';

function memKV(init: Record<string, unknown> = {}): KV & { map: Map<string, string> } {
  const map = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: k => void map.delete(k) };
}
const meal = (id: string, kcal = 500): Meal => ({ id, date: id.slice(0, 10), time: '12:00', meal: 'Lunch', items: 'Test', kcal, protein: 40 });

let gh: MockGitHub;
let kv: ReturnType<typeof memKV>;
let toasts: string[];
const cfg = () => ({ owner: gh.owner, repo: gh.repo, token: gh.token });
const engine = () => new SyncEngine({ kv, fetch: gh.fetch, sample: defaults, toast: m => toasts.push(m) });

beforeEach(() => {
  gh = new MockGitHub({ 'food.json': { meals: [meal('2026-10-24_01')] }, 'settings.json': { targets: { kcal: 2350, protein: 160 }, goalWeight: 79, tenKGoalMin: 45, schedule: { mon: 'Rest' } } });
  kv = memKV();
  toasts = [];
});

describe('applyOps', () => {
  it('upserts, removes and sets', () => {
    const d = { meals: [meal('a'), meal('b')] } as Record<string, unknown>;
    applyOps(d, [
      { t: 'upsert', c: 'meals', r: meal('a', 900) },
      { t: 'upsert', c: 'meals', r: meal('c') },
      { t: 'remove', c: 'meals', id: 'b' },
      { t: 'set', k: 'note', v: 1 },
    ]);
    expect((d.meals as Meal[]).map(m => [m.id, m.kcal])).toEqual([['a', 900], ['c', 500]]);
    expect(d.note).toBe(1);
  });
  it('merges health imports by day and workout id, sorted', () => {
    const d = { days: { '2026-10-02': { steps: 1 }, '2026-10-01': { steps: 2 } }, workouts: [{ start: '2026-10-02 08:00:00 +0200', type: 'Walking' }, { start: '2026-10-01 08:00:00 +0200', type: 'Running', note: 'old' }] } as Record<string, unknown>;
    applyOps(d, [{ t: 'health', days: { '2026-10-02': { steps: 9 } }, workouts: [{ start: '2026-10-01 07:00:00 +0100', type: 'Running', durationMin: 1, distanceKm: null, activeKcal: null, avgHr: null }], at: 'now' }]);
    expect(Object.keys(d.days as object)).toEqual(['2026-10-01', '2026-10-02']);
    expect((d.days as Record<string, { steps: number }>)['2026-10-02']!.steps).toBe(9);
    // the same instant at another UTC offset is one row: the new fields win, the old note stays
    expect((d.workouts as { type: string; note?: string; durationMin?: number }[]).map(w => [w.type, w.note, w.durationMin])).toEqual([['Running', 'old', 1], ['Walking', undefined, undefined]]);
    expect(d.importedAt).toBe('now');
  });
});

describe('SyncEngine', () => {
  it('runs on sample data when not connected', async () => {
    const e = new SyncEngine({ kv, fetch: gh.fetch, sample: () => ({ ...defaults(), food: { meals: [meal('2026-01-01_x')] } }) });
    await e.load();
    expect(e.getSnapshot().mode).toBe('sample');
    expect(e.commit('food', [{ t: 'upsert', c: 'meals', r: meal('2026-01-02_y') }])).toBe(false);
    expect(gh.log).toHaveLength(0);
  });

  it('loads all files, defaulting missing ones, and keeps unknown keys', async () => {
    kv.setItem(KEYS.gh, JSON.stringify(cfg()));
    const e = engine();
    await e.load();
    const s = e.getSnapshot();
    expect(s.mode).toBe('github');
    expect(s.data.food.meals).toHaveLength(1);
    expect(s.data.training.sessions).toEqual([]);
    expect(s.data.settings.schedule).toEqual({ mon: 'Rest' });
    expect(s.sync.kind).toBe('synced');
  });

  it('saves a commit with the v1 file format and op format', async () => {
    kv.setItem(KEYS.gh, JSON.stringify(cfg()));
    const e = engine();
    await e.load();
    e.commit('food', [{ t: 'upsert', c: 'meals', r: meal('2026-10-25_abc') }], 'Meal logged');
    const cache = JSON.parse(kv.getItem(KEYS.cache)!) as Cache;
    expect(cache.pending.food).toEqual([{ t: 'upsert', c: 'meals', r: meal('2026-10-25_abc') }]);
    await e.idle();
    expect(gh.read<{ meals: Meal[] }>('food.json').meals.map(m => m.id)).toEqual(['2026-10-24_01', '2026-10-25_abc']);
    expect(gh.raw('food.json')).toMatch(/^\{\n "meals": \[\n  \{\n   "id"/);
    expect(gh.raw('food.json')!.endsWith('}\n')).toBe(true);
    expect(e.getSnapshot().pending.food).toEqual([]);
    expect(toasts).toContain('Meal logged');
  });

  it('on 409 refetches, reapplies pending ops and retries without losing the other writer', async () => {
    kv.setItem(KEYS.gh, JSON.stringify(cfg()));
    const e = engine();
    await e.load();
    // The nightly task writes a meal after we loaded, so our sha is stale.
    let once = true;
    gh.beforePut = name => {
      if (name === 'food.json' && once) {
        once = false;
        const cur = gh.read<{ meals: Meal[] }>('food.json');
        cur.meals.push(meal('2026-10-25_chat_01', 610));
        gh.write('food.json', JSON.stringify(cur, null, 1) + '\n');
      }
    };
    e.commit('food', [{ t: 'upsert', c: 'meals', r: meal('2026-10-25_app') }]);
    await e.idle();
    expect(gh.puts().map(p => p.status)).toEqual([409, 200]);
    const ids = gh.read<{ meals: Meal[] }>('food.json').meals.map(m => m.id);
    expect(ids).toEqual(['2026-10-24_01', '2026-10-25_chat_01', '2026-10-25_app']);
    expect(e.getSnapshot().data.food.meals.map(m => m.id)).toEqual(ids);
    expect(e.getSnapshot().sync.kind).toBe('synced');
  });

  it('treats 422 (missing sha) like a conflict', async () => {
    kv.setItem(KEYS.gh, JSON.stringify(cfg()));
    const e = engine();
    await e.load();
    // Training did not exist at load time; someone creates it before our first save.
    gh.beforePut = name => { if (name === 'training.json' && !gh.files.has('training.json')) gh.write('training.json', '{"sessions":[{"id":"x","date":"2026-10-20","name":"Old","exercises":[]}]}'); };
    e.commit('training', [{ t: 'upsert', c: 'sessions', r: { id: 'y', date: '2026-10-25', name: 'New', exercises: [] } }]);
    await e.idle();
    expect(gh.puts().map(p => p.status)).toEqual([422, 200]);
    expect(gh.read<{ sessions: { id: string }[] }>('training.json').sessions.map(s => s.id)).toEqual(['x', 'y']);
  });

  it('gives up after 3 conflict retries, keeps the ops queued and reports a conflict', async () => {
    kv.setItem(KEYS.gh, JSON.stringify(cfg()));
    const e = engine();
    await e.load();
    gh.beforePut = name => gh.write(name, gh.raw(name)!); // the file changes before every write
    e.commit('food', [{ t: 'upsert', c: 'meals', r: meal('2026-10-25_z') }]);
    await e.idle();
    expect(gh.puts()).toHaveLength(4);
    expect(e.getSnapshot().sync.kind).toBe('conflict');
    expect(e.getSnapshot().pending.food).toHaveLength(1);
    const cache = JSON.parse(kv.getItem(KEYS.cache)!) as Cache;
    expect(cache.pending.food).toHaveLength(1);
  });

  it('keeps edits offline and saves them when back online', async () => {
    kv.setItem(KEYS.gh, JSON.stringify(cfg()));
    const e = engine();
    await e.load();
    gh.offline = true;
    e.commit('food', [{ t: 'upsert', c: 'meals', r: meal('2026-10-25_off') }]);
    await e.idle();
    expect(e.getSnapshot().sync.kind).toBe('offline');
    expect(e.getSnapshot().pending.food).toHaveLength(1);
    gh.offline = false;
    e.retryPending();
    await e.idle();
    expect(gh.read<{ meals: Meal[] }>('food.json').meals.some(m => m.id === '2026-10-25_off')).toBe(true);
    expect(e.getSnapshot().pending.food).toEqual([]);
  });

  it('replays v1 pending ops from localStorage after an upgrade', async () => {
    const v1Pending: Op[] = [{ t: 'upsert', c: 'meals', r: meal('2026-10-23_v1') }, { t: 'remove', c: 'meals', id: '2026-10-24_01' }];
    kv = memKV({ [KEYS.gh]: cfg(), [KEYS.cache]: { data: { food: { meals: [] } }, sha: { food: 'stale' }, pending: { food: v1Pending }, at: 1 } });
    const e = engine();
    const loading = e.load();
    expect(e.getSnapshot().loading).toBe(false); // cached data is shown immediately
    await loading;
    await e.idle();
    expect(gh.read<{ meals: Meal[] }>('food.json').meals.map(m => m.id)).toEqual(['2026-10-23_v1']);
  });

  it('shows cached data read from localStorage when the network is down', async () => {
    kv = memKV({ [KEYS.gh]: cfg(), [KEYS.cache]: { data: { food: { meals: [meal('2026-10-20_c')] } }, sha: {}, pending: {}, at: 5 } });
    gh.offline = true;
    const e = engine();
    await e.load();
    const s = e.getSnapshot();
    expect(s.data.food.meals.map(m => m.id)).toEqual(['2026-10-20_c']);
    expect(s.sync.kind).toBe('offline');
    expect(s.cachedAt).toBe(5);
  });

  it('connect rejects a bad token and restores the previous config', async () => {
    const e = engine();
    const res = await e.connect({ ...cfg(), token: 'nope' });
    expect(res.ok).toBe(false);
    expect(kv.getItem(KEYS.gh)).toBe('{}');
  });

  it('connect warns on a public repo but connects', async () => {
    gh.repoPrivate = false;
    const e = engine();
    const res = await e.connect(cfg());
    expect(res.ok).toBe(true);
    expect(res.ok && res.warn).toMatch(/public/);
    expect(e.getSnapshot().mode).toBe('github');
  });
});
