/* Activity tab data: one feed of watch workouts, logged activities and strength sessions,
   plus the progress numbers (HR at easy pace, best efforts, weekly distance). */
import { allActivities, fmtDur, isRun, pace, sessionSets, type ActivityView } from '@/core/calc';
import { addDays, mondayOf, parseYmd } from '@/core/dates';
import type { BestEfforts, DataFiles, HealthWorkout, Session } from '@/core/types';
import { hkTime, hrAtPace, trimRoute } from '@/core/workout';

export type Sport = 'run' | 'walk' | 'strength' | 'other';
export const SPORT_FILTERS: readonly (readonly ['all' | Sport, string])[] = [['all', 'All'], ['run', 'Running'], ['walk', 'Walking'], ['strength', 'Strength']];

export const sportOf = (type: string): Sport =>
  isRun(type) ? 'run' : /walk|hik/i.test(type) ? 'walk' : /strength|lift|core|weights?|upper|lower/i.test(type) ? 'strength' : 'other';

const SPORT_NAME: Record<Sport, string> = { run: 'Run', walk: 'Walk', strength: 'Strength', other: 'Workout' };
const niceType = (t: string) => t.replace(/([a-z])([A-Z])/g, '$1 $2');
export function partOfDay(ms: number) {
  const h = new Date(ms).getHours();
  return h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night';
}

export type FeedItem = {
  key: string;
  sport: Sport;
  title: string;
  date: string;
  /** start instant when known (watch workouts) */
  startMs: number | null;
  to: string;
  distanceKm: number | null;
  durationSec: number | null;
  pace: number | null;
  avgHr: number | null;
  /** for cards: exercises and sets of a strength session */
  extra?: string;
  workout?: HealthWorkout;
  act?: ActivityView;
  session?: Session;
};

/** Newest first. Strength sessions from Train are merged with a watch strength workout the same day. */
export function feedItems(data: Pick<DataFiles, 'activities' | 'health' | 'training'>): FeedItem[] {
  const out: FeedItem[] = [];
  const strengthWatch = new Map<string, ActivityView[]>();
  for (const a of allActivities(data)) {
    const sport = sportOf(a.type);
    if (sport === 'strength' && a.source === 'Apple Watch') {
      const list = strengthWatch.get(a.date) ?? [];
      list.push(a);
      strengthWatch.set(a.date, list);
    }
    const startMs = a.watchStart ? hkTime(a.watchStart) : null;
    const name = sport === 'other' ? niceType(a.workout?.type ?? a.type) : SPORT_NAME[sport];
    out.push({
      key: `a:${a.id}`, sport, date: a.date, startMs: Number.isFinite(startMs) ? startMs : null,
      title: startMs != null && Number.isFinite(startMs) ? `${partOfDay(startMs)} ${name}` : a.source === 'Logged' && sport === 'other' ? a.type : name,
      to: `/activity/${encodeURIComponent(a.id)}`,
      distanceKm: a.distanceKm ?? null, durationSec: a.durationSec ?? null, pace: sport === 'run' || sport === 'walk' ? pace(a) : null, avgHr: a.avgHr ?? null,
      workout: a.workout, act: a,
    });
  }
  for (const s of data.training.sessions) {
    const twins = strengthWatch.get(s.date);
    const twin = twins?.shift();
    if (twin) {
      // the watch saw this session: one card, the Train entry with the watch's time and heart rate
      const i = out.findIndex(x => x.act === twin);
      if (i >= 0) out.splice(i, 1);
    }
    const sets = sessionSets(s);
    out.push({
      key: `s:${s.id}`, sport: 'strength', date: s.date,
      startMs: twin?.watchStart ? hkTime(twin.watchStart) : null,
      title: s.name || 'Strength', to: `/train/session/${encodeURIComponent(s.id)}`,
      distanceKm: null, durationSec: twin?.durationSec ?? (s.durationMin ? s.durationMin * 60 : null), pace: null, avgHr: twin?.avgHr ?? null,
      extra: `${s.exercises.length} exercise${s.exercises.length === 1 ? '' : 's'} · ${sets} set${sets === 1 ? '' : 's'}`,
      session: s, ...(twin ? { workout: twin.workout, act: twin } : {}),
    });
  }
  const at = (x: FeedItem) => x.startMs ?? parseYmd(x.date).getTime();
  return out.sort((a, b) => at(b) - at(a));
}

/** Looks an activity up by id, also by the ids older links used ("w" + start). */
export function findActivity(data: Pick<DataFiles, 'activities' | 'health'>, id: string) {
  const acts = allActivities(data);
  return acts.find(a => a.id === id) ?? acts.find(a => a.watchStart && 'w' + a.watchStart === id) ?? null;
}

/* ---------- formatting ---------- */
export const fmtPace = (sec: number | null | undefined) => (sec ? fmtDur(sec) : '–');
export const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const fmtElapsed = (sec: number) => fmtDur(sec);

/* ---------- route privacy ---------- */
export const visibleRoute = <T extends { lat: number; lng: number }>(pts: T[] | undefined, privacyM: number) => (pts?.length ? trimRoute(pts, privacyM) : []);

/* ---------- zones ---------- */
export const ZONES = [
  { key: 'z1', label: 'Zone 1', name: 'Recovery', color: 'var(--zone-1)' },
  { key: 'z2', label: 'Zone 2', name: 'Endurance', color: 'var(--zone-2)' },
  { key: 'z3', label: 'Zone 3', name: 'Tempo', color: 'var(--zone-3)' },
  { key: 'z4', label: 'Zone 4', name: 'Threshold', color: 'var(--zone-4)' },
  { key: 'z5', label: 'Zone 5', name: 'Max', color: 'var(--zone-5)' },
] as const;

/* ---------- progress ---------- */
export type RunRow = { id: string; date: string; workout: HealthWorkout };
export function watchRuns(data: Pick<DataFiles, 'activities' | 'health'>): RunRow[] {
  return allActivities(data)
    .filter(a => a.workout && isRun(a.workout.type))
    .map(a => ({ id: a.id, date: a.date, workout: a.workout! }))
    .reverse();
}

export function easyPaceTrend(runs: RunRow[], target: number) {
  return runs
    .map(r => ({ r, v: hrAtPace(r.workout.paceHr, target) }))
    .filter((x): x is { r: RunRow; v: { bpm: number; sec: number } } => !!x.v)
    .map(({ r, v }) => ({ date: r.date, id: r.id, bpm: Math.round(v.bpm * 10) / 10, sec: v.sec }));
}

/** Least-squares slope in bpm per week, from dated points. */
export function weeklySlope(pts: { date: string; bpm: number }[]) {
  if (pts.length < 3) return null;
  const xs = pts.map(p => parseYmd(p.date).getTime() / (7 * 864e5)), ys = pts.map(p => p.bpm);
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = ys.reduce((s, y) => s + y, 0) / ys.length;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0), den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return den ? num / den : null;
}

export function bestEffort(runs: RunRow[], key: keyof BestEfforts) {
  let best: { sec: number; run: RunRow } | null = null;
  for (const r of runs) {
    const sec = r.workout.bestEfforts?.[key];
    if (sec && (!best || sec < best.sec)) best = { sec, run: r };
  }
  return best;
}

/** Distance per week (Monday start), oldest first, running and walking separately. */
export function weeklyDistance(data: Pick<DataFiles, 'activities' | 'health'>, today: string, weeks = 12) {
  const start = addDays(mondayOf(today), -7 * (weeks - 1));
  const rows = Array.from({ length: weeks }, (_, i) => ({ date: addDays(start, i * 7), run: 0, walk: 0 }));
  for (const a of allActivities(data)) {
    if (!a.distanceKm || a.date < start) continue;
    const s = sportOf(a.type);
    if (s !== 'run' && s !== 'walk') continue;
    const row = rows.find(r => a.date >= r.date && a.date < addDays(r.date, 7));
    if (row) row[s] += a.distanceKm;
  }
  return rows.map(r => ({ date: r.date, run: Math.round(r.run * 10) / 10, walk: Math.round(r.walk * 10) / 10 }));
}
