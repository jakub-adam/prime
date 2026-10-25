/* App-wide state: the sync engine (data + GitHub), the in-progress workout draft and the theme. */
import { useMemo, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { goals, withStress, type Draft } from '@/core/calc';
import { todayStr } from '@/core/dates';
import { sampleData } from '@/core/sample';
import { KEYS, browserKV, readJSON, writeJSON } from '@/core/storage';
import { SyncEngine } from '@/core/sync';

const kv = browserKV();

export const engine = new SyncEngine({
  kv,
  sample: () => sampleData(),
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

/** Apple Health days plus derived metrics (stress). Display only; never written back. */
export function useHealthDays() {
  const days = useData().health.days;
  return useMemo(() => withStress(days), [days]);
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
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0f151b' : '#eef1f3');
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
