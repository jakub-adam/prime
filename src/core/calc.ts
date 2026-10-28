/* Domain calculations. Formulas are unchanged from Prime v1:
   Epley e1RM, Riegel 10 km projection, 7-day rolling weight average. */
import { addDays, daysBetween, mondayOf, range } from './dates';
import { DEFAULT_SLEEP_GOAL_H, DEFAULT_STEPS_GOAL } from './ops';
import { DEFAULT_MAX_HR, DEFAULT_PRIVACY_M, idOf, mergeWorkouts } from './workout';
import type { Activity, DataFiles, HealthWorkout, Exercise, ExerciseKind, HealthDay, Meal, Session, SetEntry, Settings } from './types';

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
    maxHr: s.maxHr || DEFAULT_MAX_HR,
    easyPaceSec: s.easyPaceSec || 390,
    importRoutes: s.importRoutes !== false,
    routePrivacyM: s.routePrivacyM ?? DEFAULT_PRIVACY_M,
  };
}

/* ---------- food ---------- */
export function mealsOn(meals: Meal[], day: string) {
  return meals.filter(m => m.date === day).sort((a, b) => ((a.time || '99') < (b.time || '99') ? -1 : 1));
}
export type NutrientKey = 'fat' | 'satFat' | 'carbs' | 'sugar' | 'fiber' | 'salt';
/** Extra nutrients, tracked without targets. `sub` = "of which" rows on an EU label. */
export const NUTRIENTS: { key: NutrientKey; label: string; short: string; sub?: boolean }[] = [
  { key: 'carbs', label: 'Carbohydrates', short: 'Carbs' },
  { key: 'sugar', label: 'of which sugars', short: 'Sugars', sub: true },
  { key: 'fiber', label: 'Fibre', short: 'Fibre' },
  { key: 'fat', label: 'Fat', short: 'Fat' },
  { key: 'satFat', label: 'of which saturates', short: 'Sat. fat', sub: true },
  { key: 'salt', label: 'Salt', short: 'Salt' },
];
export type DayTotals = { kcal: number; protein: number; n: number } & Record<NutrientKey, number | null>;
/** Totals for a day. A nutrient is null when no meal that day recorded it. */
export function dayTotals(meals: Meal[], day: string): DayTotals {
  const ms = mealsOn(meals, day);
  const t = { kcal: sum(ms.map(m => +m.kcal || 0)), protein: sum(ms.map(m => +m.protein || 0)), n: ms.length } as DayTotals;
  for (const { key } of NUTRIENTS) {
    const vals = ms.map(m => m[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    t[key] = vals.length ? Math.round(sum(vals) * 10) / 10 : null;
  }
  return t;
}
/** Share of calories from protein, carbs and fat (4/4/9 kcal per gram), when carbs and fat are known. */
export function macroSplit(t: { protein: number; carbs: number | null; fat: number | null }) {
  if (t.carbs == null || t.fat == null) return null;
  const p = t.protein * 4, c = t.carbs * 4, f = t.fat * 9, all = p + c + f;
  return all ? { protein: p / all, carbs: c / all, fat: f / all } : null;
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
/** Readable set: "150 kg × 9", "9 reps +20 kg", "12 s +5 kg". The unit always sits next to the number it belongs to. */
export function fmtSet(kind: ExerciseKind, st: SetEntry) {
  const plus = st.kg ? ` +${kgStr(+st.kg)} kg` : '';
  if (kind === 'weight') return `${kgStr(+(st.kg ?? 0))} kg × ${st.reps ?? ''}`;
  if (kind === 'hold') return `${st.sec ?? ''} s${plus}`;
  return `${st.reps ?? ''} ${st.reps === 1 ? 'rep' : 'reps'}${plus}`;
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
/* done, rest, startedAt and durationMin are optional so drafts saved by older versions still load. */
export type DraftSet = { reps: string | number; kg: string | number; sec: string | number; done?: boolean };
export type DraftExercise = { name: string; kind: ExerciseKind; sets: DraftSet[]; rest?: number };
export type Draft = { id: string | null; date: string; name: string; notes: string; exercises: DraftExercise[]; startedAt?: number; durationMin?: number };

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
    exercises: s.exercises.map(ex => ({ name: ex.name, kind: ex.kind, sets: ex.sets.map(st => ({ reps: st.reps ?? '', kg: st.kg ?? '', sec: st.sec ?? '', done: true })) })),
    ...(s.durationMin != null ? { durationMin: s.durationMin } : {}),
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
  const durationMin = d.durationMin ?? (d.startedAt ? Math.max(1, Math.round((Date.now() - d.startedAt) / 60000)) : undefined);
  return { id: d.id || `${d.date}_${makeId()}`, date: d.date, name: d.name.trim() || 'Session', notes: d.notes.trim(), exercises, ...(durationMin != null ? { durationMin } : {}) };
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
  /** the Apple Health row behind it (watch workouts and merged activities) */
  workout?: HealthWorkout;
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
  // mergeWorkouts drops rows that are the same workout (same id) written with different UTC offsets.
  for (const w of mergeWorkouts(data.health.workouts || [])) {
    const v: ActivityView = {
      id: idOf(w),
      date: w.start.slice(0, 10),
      type: w.type.replace(/([a-z])([A-Z])/g, '$1 $2'),
      durationSec: Math.round(w.durationMin * 60),
      ...(w.distanceKm != null ? { distanceKm: w.distanceKm } : {}),
      ...(w.avgHr != null ? { avgHr: w.avgHr } : {}),
      kcal: w.activeKcal,
      source: 'Apple Watch',
      watchStart: w.start,
      workout: w,
    };
    const twin = logged.find(a => !a.merged && a.date === v.date && typeKey(a.type) === typeKey(v.type) &&
      (close(a.distanceKm, v.distanceKm) || close(a.durationSec, v.durationSec)));
    if (twin) {
      twin.merged = true;
      twin.watchStart = w.start;
      twin.workout = w;
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
      ...acts.filter(a => a.date === date).map(a => ({ kind: 'activity' as const, id: a.id, label: activityLabel(a), href: `/activity/${encodeURIComponent(a.id)}` })),
    ];
    const state = items.length ? 'logged' : date < today ? 'rest' : 'empty';
    return { date, items, state, isToday: date === today, isFuture: date > today };
  });
}

/* ---------- Apple Health daily metrics, grouped like the Health app ---------- */
export type CategoryKey = 'activity' | 'body' | 'heart' | 'mind' | 'sleep' | 'respiratory' | 'mobility' | 'hearing';
export type MetricKey =
  | 'steps' | 'distanceKm' | 'flights' | 'activeKcal' | 'basalKcal' | 'exerciseMin' | 'standHours' | 'standMin' | 'cyclingKm'
  | 'bodyFatPct' | 'wristTempC'
  | 'hrAvg' | 'restingHr' | 'walkingHr' | 'hrv' | 'hrRecovery' | 'vo2max'
  | 'stress' | 'mindfulMin' | 'daylightMin'
  | 'sleepH'
  | 'respiratoryRate' | 'spo2'
  | 'walkingSpeed' | 'stepLengthCm' | 'walkingAsymmetry' | 'doubleSupport' | 'sixMinWalkM'
  | 'envAudioDb' | 'headphoneDb';

export type MetricDef = {
  key: MetricKey;
  label: string;
  unit: string;
  dp: number;
  /** range = daily min–max with the average (heart rate) */
  chart: 'bar' | 'line' | 'range';
  category: CategoryKey;
  /** how days combine into a week: summed totals are shown as a daily average either way */
  higherIsBetter: boolean | null;
  blurb: string;
};

const M = (key: MetricKey, label: string, unit: string, dp: number, chart: MetricDef['chart'], category: CategoryKey, higherIsBetter: boolean | null, blurb: string): MetricDef =>
  ({ key, label, unit, dp, chart, category, higherIsBetter, blurb });

export const METRICS: Record<MetricKey, MetricDef> = {
  steps: M('steps', 'Steps', 'steps', 0, 'bar', 'activity', true, 'Daily step count, the larger of iPhone and Watch.'),
  distanceKm: M('distanceKm', 'Walking + running distance', 'km', 1, 'bar', 'activity', true, 'Distance walked and run during the day.'),
  flights: M('flights', 'Flights climbed', 'floors', 0, 'bar', 'activity', true, 'One flight is about 3 m (10 ft) of elevation gained on foot.'),
  activeKcal: M('activeKcal', 'Active energy', 'kcal', 0, 'bar', 'activity', true, 'Energy burned through movement, on top of resting energy. This is the Move ring.'),
  basalKcal: M('basalKcal', 'Resting energy', 'kcal', 0, 'bar', 'activity', null, 'Energy your body uses at rest, estimated by Apple Watch from your profile and heart rate.'),
  exerciseMin: M('exerciseMin', 'Exercise minutes', 'min', 0, 'bar', 'activity', true, 'Minutes of brisk activity or workouts. This is the Exercise ring.'),
  standHours: M('standHours', 'Stand hours', 'h', 0, 'bar', 'activity', true, 'Hours in which you stood and moved for at least a minute. This is the Stand ring.'),
  standMin: M('standMin', 'Stand minutes', 'min', 0, 'bar', 'activity', true, 'Total minutes standing and moving.'),
  cyclingKm: M('cyclingKm', 'Cycling distance', 'km', 1, 'bar', 'activity', true, 'Distance cycled, from workouts and the Watch.'),

  bodyFatPct: M('bodyFatPct', 'Body fat', '%', 1, 'line', 'body', false, 'Body fat percentage from a smart scale or manual entry.'),
  wristTempC: M('wristTempC', 'Sleeping wrist temperature', '°C', 1, 'line', 'body', null, 'Wrist temperature measured during sleep. Changes from your normal matter more than the number itself.'),

  hrAvg: M('hrAvg', 'Heart rate', 'bpm', 0, 'range', 'heart', null, 'Daily range from lowest to highest heart rate, with the average of all readings.'),
  restingHr: M('restingHr', 'Resting heart rate', 'bpm', 0, 'line', 'heart', false, 'Your heart rate at rest. A rising trend over several days can mean you need more recovery.'),
  walkingHr: M('walkingHr', 'Walking heart rate', 'bpm', 0, 'line', 'heart', false, 'Average heart rate while walking. It drops as fitness improves.'),
  hrv: M('hrv', 'Heart rate variability', 'ms', 0, 'line', 'heart', true, 'Variation between heartbeats (SDNN). Higher is generally better; compare with your own baseline, not others.'),
  hrRecovery: M('hrRecovery', 'Cardio recovery', 'bpm', 0, 'line', 'heart', true, 'How much your heart rate drops in the first minute after a workout. Higher means fitter.'),
  vo2max: M('vo2max', 'Cardio fitness (VO₂ max)', 'ml/kg/min', 1, 'line', 'heart', true, 'Apple Watch estimate of maximal oxygen uptake from outdoor walks and runs.'),

  stress: M('stress', 'Stress', 'score', 0, 'bar', 'mind', false, 'An estimate, not a measurement: Apple Watch does not record stress. Calculated each day from HRV and resting heart rate against your own previous 4 weeks. 50 is your normal; higher means lower HRV and/or higher resting HR than usual.'),
  mindfulMin: M('mindfulMin', 'Mindful minutes', 'min', 0, 'bar', 'mind', true, 'Time in breathing and reflection sessions (Mindfulness app or other apps).'),
  daylightMin: M('daylightMin', 'Time in daylight', 'min', 0, 'bar', 'mind', true, 'Minutes outdoors in daylight, measured by Apple Watch. Daylight supports sleep and mood.'),

  sleepH: M('sleepH', 'Sleep', 'h', 1, 'bar', 'sleep', true, 'Time asleep, credited to the morning you woke up.'),

  respiratoryRate: M('respiratoryRate', 'Respiratory rate', 'breaths/min', 1, 'line', 'respiratory', null, 'Breaths per minute, measured while you sleep.'),
  spo2: M('spo2', 'Blood oxygen', '%', 0, 'line', 'respiratory', true, 'Oxygen saturation measured by Apple Watch. 95–100% is typical at rest.'),

  walkingSpeed: M('walkingSpeed', 'Walking speed', 'km/h', 1, 'line', 'mobility', true, 'Average speed when walking steadily on flat ground, measured by iPhone.'),
  stepLengthCm: M('stepLengthCm', 'Walking step length', 'cm', 0, 'line', 'mobility', null, 'Distance between your feet when walking steadily.'),
  walkingAsymmetry: M('walkingAsymmetry', 'Walking asymmetry', '%', 1, 'line', 'mobility', false, 'How often steps with one foot are faster or slower than with the other. Lower is better.'),
  doubleSupport: M('doubleSupport', 'Double support time', '%', 1, 'line', 'mobility', false, 'Share of walking time with both feet on the ground. Lower usually means better balance.'),
  sixMinWalkM: M('sixMinWalkM', 'Six-minute walk', 'm', 0, 'line', 'mobility', true, 'Estimated distance you could walk in six minutes on flat ground.'),

  envAudioDb: M('envAudioDb', 'Environmental sound', 'dB', 0, 'line', 'hearing', false, 'Average sound level around you. Long exposure above 80 dB can affect hearing.'),
  headphoneDb: M('headphoneDb', 'Headphone audio', 'dB', 0, 'line', 'hearing', false, 'Average headphone volume. Keep it under 80 dB for long listening.'),
};

export type CategoryDef = { key: CategoryKey; label: string; blurb: string; metrics: MetricKey[] };
export const CATEGORIES: CategoryDef[] = [
  { key: 'activity', label: 'Activity', blurb: 'Rings, steps, energy and workouts', metrics: ['activeKcal', 'exerciseMin', 'standHours', 'steps', 'distanceKm', 'flights', 'basalKcal', 'standMin', 'cyclingKm'] },
  { key: 'body', label: 'Body Measurements', blurb: 'Weight, body fat, measurements, wrist temperature', metrics: ['bodyFatPct', 'wristTempC'] },
  { key: 'heart', label: 'Heart', blurb: 'Heart rate, HRV, cardio fitness', metrics: ['hrAvg', 'restingHr', 'hrv', 'walkingHr', 'hrRecovery', 'vo2max'] },
  { key: 'mind', label: 'Mental Wellbeing', blurb: 'Stress, mindful minutes, daylight', metrics: ['stress', 'mindfulMin', 'daylightMin'] },
  { key: 'sleep', label: 'Sleep', blurb: 'Sleep, stages and schedule', metrics: ['sleepH'] },
  { key: 'respiratory', label: 'Respiratory', blurb: 'Breathing rate and blood oxygen', metrics: ['respiratoryRate', 'spo2'] },
  { key: 'mobility', label: 'Mobility', blurb: 'Walking speed, steadiness and gait', metrics: ['walkingSpeed', 'stepLengthCm', 'walkingAsymmetry', 'doubleSupport', 'sixMinWalkM'] },
  { key: 'hearing', label: 'Hearing', blurb: 'Sound and headphone levels', metrics: ['envAudioDb', 'headphoneDb'] },
];
export const CATEGORY: Record<CategoryKey, CategoryDef> = Object.fromEntries(CATEGORIES.map(c => [c.key, c])) as Record<CategoryKey, CategoryDef>;
export const METRIC_ORDER: MetricKey[] = CATEGORIES.flatMap(c => c.metrics);
export const isMetricKey = (k: string | undefined): k is MetricKey => !!k && k in METRICS;

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

/* ---------- stress estimate (derived, never saved) ----------
   Apple Watch has no stress metric. This scores each day 0–100 from how far HRV (lower = more
   stress) and resting HR (higher = more stress) are from your own baseline: the previous 28 days,
   at least 5 values. z-scores are averaged; 50 is normal, each standard deviation moves 20 points. */
export const STRESS = { baselineDays: 28, minBaseline: 5, pointsPerSd: 20, minSd: { hrv: 3, restingHr: 1.5 } } as const;
export type StressLevel = 'low' | 'moderate' | 'high';
export const stressLevel = (v: number): StressLevel => (v >= 65 ? 'high' : v > 35 ? 'moderate' : 'low');
export const STRESS_LABEL: Record<StressLevel, string> = { low: 'Low', moderate: 'Moderate', high: 'High' };

function baseline(days: Record<string, HealthDay>, date: string, key: 'hrv' | 'restingHr') {
  const from = addDays(date, -STRESS.baselineDays);
  const vals = Object.keys(days).filter(d => d >= from && d < date).map(d => days[d]![key]).filter((v): v is number => v != null);
  if (vals.length < STRESS.minBaseline) return null;
  const mean = sum(vals) / vals.length;
  return { mean, sd: Math.max(stdev(vals) ?? 0, STRESS.minSd[key]), n: vals.length };
}

export type StressDrivers = {
  score: number;
  hrv: { value: number; mean: number; z: number } | null;
  restingHr: { value: number; mean: number; z: number } | null;
};
export function stressFor(days: Record<string, HealthDay>, date: string): StressDrivers | null {
  const day = days[date];
  if (!day) return null;
  const part = (key: 'hrv' | 'restingHr') => {
    const value = day[key];
    const b = value != null ? baseline(days, date, key) : null;
    return value != null && b ? { value, mean: b.mean, z: (value - b.mean) / b.sd } : null;
  };
  const hrv = part('hrv'), restingHr = part('restingHr');
  const zs = [hrv ? -hrv.z : null, restingHr ? restingHr.z : null].filter((z): z is number => z != null);
  if (!zs.length) return null;
  const score = Math.round(Math.min(100, Math.max(0, 50 + STRESS.pointsPerSd * (sum(zs) / zs.length))));
  return { score, hrv, restingHr };
}
/** Health days with the derived `stress` score added. Returns a copy; health.json is never changed. */
export function withStress(days: Record<string, HealthDay>): Record<string, HealthDay> {
  const out: Record<string, HealthDay> = {};
  for (const d of Object.keys(days)) {
    const st = stressFor(days, d);
    out[d] = st ? { ...days[d], stress: st.score } : days[d]!;
  }
  return out;
}

/* ---------- training summaries (Train tab) ---------- */
export function weeklyTraining(sessions: Session[], today: string, weeks = 8) {
  const thisMon = mondayOf(today);
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisMon, -7 * (weeks - 1 - i));
    const end = addDays(start, 6);
    const ss = sessions.filter(s => s.date >= start && s.date <= end);
    return { date: start, sessions: ss.length, volume: sum(ss.map(sessionVolume)), sets: sum(ss.map(sessionSets)), minutes: sum(ss.map(s => s.durationMin ?? 0)) };
  });
}
/** Consecutive weeks (ending this week or last) with at least one session. */
export function weekStreak(sessions: Session[], today: string) {
  const weeks = new Set(sessions.map(s => mondayOf(s.date)));
  let mon = mondayOf(today);
  if (!weeks.has(mon)) mon = addDays(mon, -7);
  let n = 0;
  while (weeks.has(mon)) { n++; mon = addDays(mon, -7); }
  return n;
}
/** Saved workouts grouped by name, most recent first: the "routines" you can start again. */
export function routines(sessions: Session[]) {
  const out: { name: string; last: Session; count: number }[] = [];
  for (const s of [...sessions].sort(byDateDesc)) {
    if (!s.name) continue;
    const r = out.find(x => x.name === s.name);
    if (r) r.count++; else out.push({ name: s.name, last: s, count: 1 });
  }
  return out;
}
export function bestSet(ex: Exercise) {
  let best: SetEntry | null = null, bm = -Infinity;
  for (const st of ex.sets) { const m = setMetric(ex.kind, st) ?? -Infinity; if (m > bm) { bm = m; best = st; } }
  return best;
}
export function sessionPrCount(sessions: Session[], s: Session, flags = prFlags(sessions)) {
  return s.exercises.filter(e => flags.has(s.id + '|' + e.name.toLowerCase())).length;
}
/** Personal records for one exercise. */
export function exerciseRecords(sessions: Session[], name: string) {
  const h = exHistory(sessions, name);
  if (!h.length) return null;
  const kind = h[h.length - 1]!.ex.kind;
  let bestM: (typeof h)[number] | null = null, mostVol: (typeof h)[number] | null = null, mostReps: { date: string; reps: number } | null = null, heaviest: { date: string; kg: number } | null = null;
  for (const x of h) {
    if (Number.isFinite(x.m) && (!bestM || x.m > bestM.m)) bestM = x;
    if (!mostVol || exVolume(x.ex) > exVolume(mostVol.ex)) mostVol = x;
    for (const st of x.ex.sets) {
      if (st.reps != null && (!mostReps || st.reps > mostReps.reps)) mostReps = { date: x.date, reps: st.reps };
      if (st.kg != null && (!heaviest || st.kg > heaviest.kg)) heaviest = { date: x.date, kg: st.kg };
    }
  }
  return { kind, best: bestM, mostVolume: mostVol && exVolume(mostVol.ex) > 0 ? { date: mostVol.date, volume: exVolume(mostVol.ex) } : null, mostReps, heaviest, sessions: h.length };
}
