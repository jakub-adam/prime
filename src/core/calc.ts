/* Domain calculations. Formulas are unchanged from Prime v1:
   Epley e1RM, Riegel 10 km projection, 7-day rolling weight average. */
import { addDays, daysBetween, mondayOf, range } from './dates';
import { DEFAULT_SLEEP_GOAL_H, DEFAULT_STEPS_GOAL } from './ops';
import type { Activity, DataFiles, Exercise, ExerciseKind, HealthDay, Meal, Session, SetEntry, Settings } from './types';

export const sum = (a: (number | null | undefined)[]) => a.reduce<number>((s, x) => s + (x || 0), 0);
export const avg = (a: (number | null | undefined)[]) => {
  const v = a.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? sum(v) / v.length : null;
};
export const num = (v: unknown) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
export const round1 = (n: number) => Math.round(n * 10) / 10;

/* ---------- settings with defaults ---------- */
export function goals(s: Settings) {
  return {
    kcal: s.targets?.kcal || 2350,
    protein: s.targets?.protein || 160,
    goalWeight: s.goalWeight || 79,
    tenKGoalMin: s.tenKGoalMin || 45,
    stepsGoal: s.stepsGoal || DEFAULT_STEPS_GOAL,
    sleepGoalH: s.sleepGoalH || DEFAULT_SLEEP_GOAL_H,
  };
}

/* ---------- food ---------- */
export function mealsOn(meals: Meal[], day: string) {
  return meals.filter(m => m.date === day).sort((a, b) => ((a.time || '99') < (b.time || '99') ? -1 : 1));
}
export function dayTotals(meals: Meal[], day: string) {
  const ms = mealsOn(meals, day);
  return { kcal: sum(ms.map(m => +m.kcal || 0)), protein: sum(ms.map(m => +m.protein || 0)), n: ms.length };
}
export function weeklyFood(meals: Meal[], today: string, weeks = 4) {
  const out: { start: string; n: number; kcal: number | null; protein: number | null }[] = [];
  for (let w = 0; w < weeks; w++) {
    const start = addDays(mondayOf(today), -7 * w);
    const ds = range(start, 7).filter(d => d <= today).map(d => dayTotals(meals, d)).filter(x => x.n);
    if (ds.length) out.push({ start, n: ds.length, kcal: avg(ds.map(x => x.kcal)), protein: avg(ds.map(x => x.protein)) });
  }
  return out;
}
export function recentMeals(meals: Meal[], limit = 6) {
  const out: Meal[] = [];
  const seen = new Set<string>();
  for (const m of [...meals].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    const key = (m.items || m.meal).toLowerCase();
    if (!m.items || seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}

/* ---------- weight ---------- */
export type WeightPoint = { date: string; kg: number; src: 'Apple Health' | 'Logged'; id?: string };
export function weightSeries(data: Pick<DataFiles, 'health' | 'body'>): WeightPoint[] {
  const byDay: Record<string, Omit<WeightPoint, 'date'>> = {};
  for (const [d, v] of Object.entries(data.health.days || {})) if (v.weightKg) byDay[d] = { kg: v.weightKg, src: 'Apple Health' };
  for (const w of data.body.weighins) byDay[w.date] = { kg: +w.kg, src: 'Logged', id: w.id };
  return Object.entries(byDay).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, v]) => ({ date, ...v }));
}
export function rollingAvg(series: { date: string; kg: number }[], day: string, n = 7) {
  const from = addDays(day, -(n - 1));
  return avg(series.filter(p => p.date >= from && p.date <= day).map(p => p.kg));
}

/* ---------- training ---------- */
export const KIND_LABEL: Record<ExerciseKind, string> = { weight: 'Weight × reps', bw: 'Bodyweight reps', hold: 'Hold (seconds)' };
export function guessKind(name: string): ExerciseKind {
  const n = name.toLowerCase();
  if (/push-?up|hspu|dip|pull-?up|chin-?up|muscle-?up|pistol|leg raise|toes to bar|burpee|jump/.test(n)) return 'bw';
  if (/hold|lever|plank|handstand|l-?sit|hang\b|dead hang/.test(n)) return 'hold';
  return 'weight';
}
export const EXERCISES = [
  'Bench press', 'Incline dumbbell press', 'Dumbbell shoulder press', 'Overhead press', 'Dips', 'Weighted dips', 'Push-ups',
  'Pull-ups', 'Weighted pull-ups', 'Chin-ups', 'Muscle-ups', 'Lat pulldown', 'Chest-supported row', 'Cable row', 'Face pull',
  'Hack squat', 'Leg press', 'Bulgarian split squat', 'Romanian deadlift', 'Leg curl', 'Leg extension', 'Hip thrust',
  'Hanging leg raise', 'Tuck front lever hold', 'Front lever hold', 'Wall handstand hold', 'Wall handstand push-ups', 'Plank',
  'Biceps curl', 'Box jump', 'Broad jump',
];
export const e1rm = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30));
export function setMetric(kind: ExerciseKind, st: SetEntry) {
  if (kind === 'weight') return st.kg && st.reps ? e1rm(+st.kg, +st.reps) : null;
  if (kind === 'hold') return st.sec ? +st.sec : null;
  return st.reps ? +st.reps : null;
}
export function exMetric(ex: Exercise) {
  return Math.max(-Infinity, ...ex.sets.map(st => setMetric(ex.kind, st)).filter((v): v is number => v != null));
}
const kgStr = (kg: number) => (kg % 1 ? kg.toFixed(1) : String(kg));
export function fmtSet(kind: ExerciseKind, st: SetEntry) {
  const plus = st.kg ? ` +${kgStr(+st.kg)}` : '';
  if (kind === 'weight') return `${kgStr(+(st.kg ?? 0))}×${st.reps ?? ''}`;
  if (kind === 'hold') return `${st.sec ?? ''}s${plus}`;
  return `${st.reps ?? ''}${plus}`;
}
export const metricUnit = (kind: ExerciseKind) => (kind === 'weight' ? 'kg e1RM' : kind === 'hold' ? 's best hold' : 'best reps');
export function exVolume(ex: Exercise) {
  if (ex.kind !== 'weight') return 0;
  return sum(ex.sets.map(st => (st.kg || 0) * (st.reps || 0)));
}
export function sessionVolume(s: Session) { return sum(s.exercises.map(exVolume)); }
export function sessionSets(s: Session) { return sum(s.exercises.map(e => e.sets.length)); }

export const byDateAsc = <T extends { date: string }>(a: T, b: T) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
export const byDateDesc = <T extends { date: string }>(a: T, b: T) => byDateAsc(b, a);

export function exHistory(sessions: Session[], name: string) {
  const out: { date: string; sess: Session; ex: Exercise; m: number }[] = [];
  for (const sess of [...sessions].sort(byDateAsc))
    for (const ex of sess.exercises) if (ex.name.toLowerCase() === name.toLowerCase()) out.push({ date: sess.date, sess, ex, m: exMetric(ex) });
  return out;
}
export function lastOf(sessions: Session[], name: string, beforeDate?: string) {
  const h = exHistory(sessions, name).filter(x => !beforeDate || x.date < beforeDate);
  return h[h.length - 1] || null;
}
/** Set of `${sessionId}|${exercise lowercased}` where the exercise beat its previous best. */
export function prFlags(sessions: Session[]) {
  const best: Record<string, number> = {};
  const flags = new Set<string>();
  for (const sess of [...sessions].sort(byDateAsc))
    for (const ex of sess.exercises) {
      const k = ex.name.toLowerCase();
      const m = exMetric(ex);
      if (!Number.isFinite(m)) continue;
      if (best[k] != null && m > best[k]! + 1e-9) flags.add(sess.id + '|' + k);
      if (best[k] == null || m > best[k]!) best[k] = m;
    }
  return flags;
}
export function exerciseNames(sessions: Session[]) {
  return [...new Set(sessions.flatMap(x => x.exercises.map(e => e.name)))].sort((a, b) => a.localeCompare(b));
}
export function bests(sessions: Session[]) {
  return exerciseNames(sessions).map(n => {
    const hs = exHistory(sessions, n).filter(x => Number.isFinite(x.m));
    if (!hs.length) return null;
    const b = hs.reduce((a, x) => (x.m > a.m ? x : a));
    const topSet = b.ex.sets.reduce((a, st) => ((setMetric(b.ex.kind, st) || 0) > (setMetric(b.ex.kind, a) || 0) ? st : a));
    return { name: n, best: b, topSet, count: hs.length, kind: b.ex.kind };
  }).filter(<T,>(x: T | null): x is T => x != null);
}
/** Session names for the workout picker, most recently used first. */
export function recentSessionNames(sessions: Session[]) {
  const out: string[] = [];
  for (const s of [...sessions].sort(byDateDesc)) if (s.name && !out.includes(s.name)) out.push(s.name);
  return out;
}

/* ---------- drafts (in-progress workout, stored in prime.draft) ---------- */
export type DraftSet = { reps: string | number; kg: string | number; sec: string | number };
export type DraftExercise = { name: string; kind: ExerciseKind; sets: DraftSet[] };
export type Draft = { id: string | null; date: string; name: string; notes: string; exercises: DraftExercise[] };

export function blankEx(sessions: Session[], name: string): DraftExercise {
  const last = lastOf(sessions, name);
  const count = last ? last.ex.sets.length : 3;
  return { name, kind: last ? last.ex.kind : guessKind(name), sets: Array.from({ length: count }, () => ({ reps: '', kg: '', sec: '' })) };
}
/** New draft named `name`, prefilled with the exercises of the last session with that name (v1 behaviour). */
export function newDraft(sessions: Session[], name: string, today: string, from?: Session): Draft {
  const last = from ?? [...sessions].filter(x => x.name === name).sort(byDateAsc).pop();
  return { id: null, date: today, name, notes: '', exercises: last ? last.exercises.map(ex => blankEx(sessions, ex.name)) : [] };
}
export function draftFromSession(s: Session): Draft {
  return {
    id: s.id, date: s.date, name: s.name, notes: s.notes || '',
    exercises: s.exercises.map(ex => ({ name: ex.name, kind: ex.kind, sets: ex.sets.map(st => ({ reps: st.reps ?? '', kg: st.kg ?? '', sec: st.sec ?? '' })) })),
  };
}
export function draftToSession(d: Draft, makeId: () => string): Session | string {
  const exercises = d.exercises.map(ex => ({
    name: ex.name.trim(),
    kind: ex.kind,
    sets: ex.sets
      .map(st => ({ reps: num(st.reps), kg: num(st.kg), sec: num(st.sec) }))
      .filter(st => (ex.kind === 'hold' ? st.sec : st.reps) != null)
      .map(st => Object.fromEntries(Object.entries(st).filter(([, v]) => v != null)) as SetEntry),
  })).filter(ex => ex.name && ex.sets.length);
  if (!exercises.length) return 'Fill in at least one set.';
  if (!d.date) return 'Pick a date.';
  return { id: d.id || `${d.date}_${makeId()}`, date: d.date, name: d.name.trim() || 'Session', notes: d.notes.trim(), exercises };
}

/* ---------- activities ---------- */
export function parseDur(str: string) {
  const p = String(str || '').trim().split(':').map(Number);
  if (!p.length || p.some(x => !Number.isFinite(x))) return null;
  if (p.length === 1) return p[0]! * 60;
  if (p.length === 2) return p[0]! * 60 + p[1]!;
  return p[0]! * 3600 + p[1]! * 60 + p[2]!;
}
export function fmtDur(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec)) return '–';
  sec = Math.round(sec);
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}
export const pace = (a: { distanceKm?: number | null; durationSec?: number | null }) =>
  a.distanceKm && a.durationSec ? a.durationSec / a.distanceKm : null;
/** Riegel: T2 = T1 × (D2 / D1)^1.06 */
export const riegel10k = (durationSec: number, distanceKm: number) => durationSec * Math.pow(10 / distanceKm, 1.06);

export type ActivityView = Activity & {
  source: 'Logged' | 'Apple Watch';
  kcal?: number | null;
  watchStart?: string;
  /** Apple Health workout merged into a logged activity (same run in both sources). */
  merged?: boolean;
};
export const isRun = (type: string) => /run/i.test(type);
export const watchId = (start: string) => 'w' + start;
const typeKey = (t: string) => (isRun(t) ? 'run' : /walk/i.test(t) ? 'walk' : /cycl|bike/i.test(t) ? 'bike' : /swim/i.test(t) ? 'swim' : /hik/i.test(t) ? 'hike' : t.toLowerCase());
const close = (a: number | null | undefined, b: number | null | undefined, tol = 0.1) =>
  a != null && b != null && a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) <= tol;

/** Logged activities plus Apple Watch workouts, newest first. A watch workout that is the same
    session as a logged one (same day, same sport, distance or duration within 10%) is merged into
    the logged entry instead of being listed twice. */
export function allActivities(data: Pick<DataFiles, 'activities' | 'health'>): ActivityView[] {
  const logged: ActivityView[] = data.activities.activities.map(a => ({ ...a, source: 'Logged' }));
  const out = [...logged];
  for (const w of data.health.workouts || []) {
    const v: ActivityView = {
      id: watchId(w.start),
      date: w.start.slice(0, 10),
      type: w.type.replace(/([a-z])([A-Z])/g, '$1 $2'),
      durationSec: Math.round(w.durationMin * 60),
      ...(w.distanceKm != null ? { distanceKm: w.distanceKm } : {}),
      ...(w.avgHr != null ? { avgHr: w.avgHr } : {}),
      kcal: w.activeKcal,
      source: 'Apple Watch',
      watchStart: w.start,
    };
    const twin = logged.find(a => !a.merged && a.date === v.date && typeKey(a.type) === typeKey(v.type) &&
      (close(a.distanceKm, v.distanceKm) || close(a.durationSec, v.durationSec)));
    if (twin) {
      twin.merged = true;
      twin.watchStart = w.start;
      if (twin.avgHr == null && v.avgHr != null) twin.avgHr = v.avgHr;
      if (twin.kcal == null) twin.kcal = v.kcal ?? null;
    } else out.push(v);
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.watchStart || '').localeCompare(a.watchStart || '')));
}
const SHORT_TYPE: Record<string, string> = { Running: 'Run', Walking: 'Walk', Cycling: 'Ride', Hiking: 'Hike', Swimming: 'Swim' };
export const shortType = (t: string) => SHORT_TYPE[t] ?? t;
export function activityLabel(a: { type: string; distanceKm?: number | null; durationSec?: number }) {
  const t = shortType(a.type);
  if (a.distanceKm) return `${t} ${a.distanceKm.toFixed(1)} km`;
  return `${t} ${Math.round((a.durationSec || 0) / 60)} min`;
}
export function tenKProjection(acts: ActivityView[], today: string) {
  const runs = acts.filter(a => isRun(a.type) && pace(a) && a.date >= addDays(today, -42) && (a.distanceKm || 0) >= 2);
  let best: { sec: number; from: ActivityView } | null = null;
  for (const r of runs) {
    const sec = riegel10k(r.durationSec, r.distanceKm!);
    if (!best || sec < best.sec) best = { sec, from: r };
  }
  return best;
}

/* ---------- week strip (real data only) ---------- */
export type WeekItem = { kind: 'session' | 'activity'; id: string; label: string; href: string };
export type WeekDay = { date: string; items: WeekItem[]; state: 'logged' | 'rest' | 'empty'; isToday: boolean; isFuture: boolean };
export function weekStrip(data: DataFiles, monday: string, today: string): WeekDay[] {
  const acts = allActivities(data);
  return range(monday, 7).map(date => {
    const items: WeekItem[] = [
      ...data.training.sessions.filter(s => s.date === date).map(s => ({ kind: 'session' as const, id: s.id, label: s.name, href: `/train/session/${encodeURIComponent(s.id)}` })),
      ...acts.filter(a => a.date === date).map(a => ({ kind: 'activity' as const, id: a.id, label: activityLabel(a), href: `/move/activity/${encodeURIComponent(a.id)}` })),
    ];
    const state = items.length ? 'logged' : date < today ? 'rest' : 'empty';
    return { date, items, state, isToday: date === today, isFuture: date > today };
  });
}

/* ---------- Apple Health daily metrics ---------- */
export type MetricKey = 'steps' | 'sleepH' | 'restingHr' | 'hrv' | 'activeKcal' | 'distanceKm' | 'exerciseMin' | 'walkingHr' | 'vo2max';
export type MetricDef = {
  key: MetricKey;
  label: string;
  unit: string;
  dp: number;
  chart: 'bar' | 'line';
  color: 'track' | 'lane';
  higherIsBetter: boolean | null;
  blurb: string;
};
export const METRICS: Record<MetricKey, MetricDef> = {
  steps: { key: 'steps', label: 'Steps', unit: 'steps', dp: 0, chart: 'bar', color: 'lane', higherIsBetter: true, blurb: 'Daily step count, the larger of iPhone and Watch.' },
  sleepH: { key: 'sleepH', label: 'Sleep', unit: 'h', dp: 1, chart: 'bar', color: 'lane', higherIsBetter: true, blurb: 'Time asleep, credited to the morning you woke up.' },
  restingHr: { key: 'restingHr', label: 'Resting HR', unit: 'bpm', dp: 0, chart: 'line', color: 'track', higherIsBetter: false, blurb: 'A rising resting heart rate over several days can mean you need more rest.' },
  hrv: { key: 'hrv', label: 'HRV', unit: 'ms', dp: 0, chart: 'line', color: 'lane', higherIsBetter: true, blurb: 'Heart rate variability (SDNN). Compare against your own baseline, not others.' },
  activeKcal: { key: 'activeKcal', label: 'Active energy', unit: 'kcal', dp: 0, chart: 'bar', color: 'track', higherIsBetter: true, blurb: 'Calories burned through movement, on top of resting energy.' },
  distanceKm: { key: 'distanceKm', label: 'Distance', unit: 'km', dp: 1, chart: 'bar', color: 'lane', higherIsBetter: true, blurb: 'Walking and running distance for the day.' },
  exerciseMin: { key: 'exerciseMin', label: 'Exercise', unit: 'min', dp: 0, chart: 'bar', color: 'track', higherIsBetter: true, blurb: 'Apple Exercise minutes (brisk movement or workouts).' },
  walkingHr: { key: 'walkingHr', label: 'Walking HR', unit: 'bpm', dp: 0, chart: 'line', color: 'track', higherIsBetter: false, blurb: 'Average heart rate while walking. Drops as fitness improves.' },
  vo2max: { key: 'vo2max', label: 'VO₂ max', unit: 'ml/kg/min', dp: 1, chart: 'line', color: 'lane', higherIsBetter: true, blurb: 'Apple Watch cardio fitness estimate from outdoor walks and runs.' },
};
export const METRIC_ORDER: MetricKey[] = ['steps', 'sleepH', 'restingHr', 'hrv', 'activeKcal', 'exerciseMin', 'distanceKm', 'walkingHr', 'vo2max'];

export function healthDays(days: Record<string, HealthDay>) {
  return Object.keys(days).sort();
}
/** Metrics that have at least one value, in display order. */
export function presentMetrics(days: Record<string, HealthDay>) {
  return METRIC_ORDER.filter(k => Object.values(days).some(d => d[k] != null));
}
export function metricSeries(days: Record<string, HealthDay>, key: MetricKey, from: string, to: string) {
  const n = Math.max(0, daysBetween(from, to)) + 1;
  return range(from, n).map(date => ({ date, v: days[date]?.[key] ?? null }));
}
export function stdev(a: number[]) {
  if (a.length < 2) return null;
  const m = sum(a) / a.length;
  return Math.sqrt(sum(a.map(x => (x - m) ** 2)) / (a.length - 1));
}
export function lastNDays(days: Record<string, HealthDay>, key: MetricKey, n: number) {
  const ds = healthDays(days).filter(d => days[d]?.[key] != null);
  const last = ds[ds.length - 1];
  if (!last) return { last: null as string | null, values: [] as number[] };
  const from = addDays(last, -(n - 1));
  return { last, values: ds.filter(d => d >= from).map(d => days[d]![key]!) };
}
export function rolling(series: { date: string; v: number | null }[], n = 7) {
  return series.map((p, i) => {
    const win = series.slice(Math.max(0, i - n + 1), i + 1).map(x => x.v);
    const a = avg(win);
    return { date: p.date, v: a == null ? null : a };
  });
}
