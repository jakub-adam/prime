/* Data shapes of the private health-data repo. These match the JSON files exactly;
   extra keys written by other tools are kept untouched (every type allows them). */

export type Meal = {
  id: string;
  date: string;
  time?: string;
  meal: string;
  items?: string;
  kcal: number;
  protein: number;
  /* Optional extra nutrients in grams (EU label order). Older meals and the nightly task may leave them out. */
  fat?: number;
  satFat?: number;
  carbs?: number;
  sugar?: number;
  fiber?: number;
  salt?: number;
  [k: string]: unknown;
};

export type ExerciseKind = 'weight' | 'bw' | 'hold';
export type SetEntry = { reps?: number; kg?: number; sec?: number };
export type Exercise = { name: string; kind: ExerciseKind; sets: SetEntry[] };
export type Session = {
  id: string;
  date: string;
  name: string;
  notes?: string;
  exercises: Exercise[];
  /** Optional: minutes from starting to finishing the workout in the app. */
  durationMin?: number;
  [k: string]: unknown;
};

export type Weighin = { id: string; date: string; kg: number; [k: string]: unknown };
export type MeasureKey = 'waist' | 'chest' | 'arm' | 'thigh' | 'hips' | 'neck';
export type Measurement = { id: string; date: string; [k: string]: unknown } & Partial<Record<MeasureKey, number>>;

export type Activity = {
  id: string;
  date: string;
  type: string;
  distanceKm?: number;
  durationSec: number;
  avgHr?: number;
  notes?: string;
  [k: string]: unknown;
};

export type HealthDay = {
  steps?: number;
  distanceKm?: number;
  activeKcal?: number;
  exerciseMin?: number;
  restingHr?: number;
  hrv?: number;
  walkingHr?: number;
  vo2max?: number;
  weightKg?: number;
  sleepH?: number;
  [k: string]: number | undefined;
};

/** One km split; the last one can be partial (`km` is then the total distance, e.g. 2.54). */
export type Split = { km: number; durationSec: number; paceSecPerKm: number; avgHr?: number; maxHr?: number };
/** Seconds in each heart-rate zone (% of `hrZonesMaxHr`: <60, 60–70, 70–80, 80–90, ≥90). */
export type HrZones = { z1: number; z2: number; z3: number; z4: number; z5: number };
/** Fastest time (s) for each distance anywhere inside a run. */
export type BestEfforts = Partial<Record<'1k' | '3k' | '5k' | '10k', number>>;
export type RoutePoint = { lat: number; lng: number; tSec: number; ele?: number };

/** Apple Health workout. The first six keys are the original format; everything after them is
    optional and only present for workouts imported by v2.1 or later. */
export type HealthWorkout = {
  type: string;
  /** start as written by the export (local time with offset); the UTC instant is in `id` */
  start: string;
  durationMin: number;
  distanceKm: number | null;
  activeKcal: number | null;
  avgHr: number | null;
  /** type + start in UTC, e.g. "Running_20261028T084946Z"; rows without it get it computed */
  id?: string;
  /** ISO 8601 in UTC */
  endTime?: string;
  durationSec?: number;
  maxHr?: number;
  minHr?: number;
  elevationGainM?: number;
  /** steps per minute (running) */
  avgCadence?: number;
  avgPaceSecPerKm?: number;
  splits?: Split[];
  hrZones?: HrZones;
  hrZonesMaxHr?: number;
  recoveryHr?: { after1Min?: number; after2Min?: number };
  bestEfforts?: BestEfforts;
  /** [pace s/km bucket, avg HR, seconds] for "HR at a fixed easy pace" */
  paceHr?: [number, number, number][];
  /** about 48 route points as a Google encoded polyline, for list previews */
  routePreview?: string;
  /** path of the file with the full series in the data repo, e.g. "workouts/<id>.json" */
  detail?: string;
  indoor?: boolean;
  source?: string;
  steps?: number;
  basalKcal?: number;
  avgPowerW?: number;
  avgGroundContactMs?: number;
  avgVerticalOscCm?: number;
  avgStrideM?: number;
  avgSpeedKmh?: number;
  maxSpeedKmh?: number;
  avgMets?: number;
  timeZone?: string;
  [k: string]: unknown;
};

/** workouts/<id>.json in the data repo: the heavy per-workout series, loaded on the detail page only. */
export type WorkoutDetail = {
  id: string;
  /** heart rate, one point per 10 s */
  hrSeries: { tSec: number; bpm: number }[];
  /** cumulative distance, one point per 10 s (pace is derived from it) */
  distSeries: { tSec: number; km: number }[];
  /** GPS route, about one point per 4 s */
  route?: RoutePoint[];
  [k: string]: unknown;
};

export type Settings = {
  targets: { kcal: number; protein: number };
  goalWeight: number;
  tenKGoalMin: number;
  stepsGoal?: number;
  sleepGoalH?: number;
  /** max heart rate for workout zones (default 202) */
  maxHr?: number;
  /** easy pace (s/km) for the "HR at easy pace" trend (default 390 = 6:30) */
  easyPaceSec?: number;
  /** store GPS routes on import (default true) */
  importRoutes?: boolean;
  /** metres hidden at both ends of every route on maps (default 200, 0 = off) */
  routePrivacyM?: number;
  [k: string]: unknown;
};

export type DataFiles = {
  food: { meals: Meal[]; [k: string]: unknown };
  training: { sessions: Session[]; [k: string]: unknown };
  body: { weighins: Weighin[]; measurements: Measurement[]; [k: string]: unknown };
  activities: { activities: Activity[]; [k: string]: unknown };
  health: { days: Record<string, HealthDay>; workouts: HealthWorkout[]; importedAt?: string; [k: string]: unknown };
  settings: Settings;
};
export type FileName = keyof DataFiles;

/* Pending edit operations. This exact shape is persisted in localStorage (prime.cache.pending),
   so it must not change: older unsaved edits have to replay after an upgrade. */
export type UpsertOp = { t: 'upsert'; c: string; r: { id: string; [k: string]: unknown } };
export type RemoveOp = { t: 'remove'; c: string; id: string };
export type SetOp = { t: 'set'; k: string; v: unknown };
export type HealthOp = { t: 'health'; days: Record<string, HealthDay>; workouts: HealthWorkout[]; at: string };
export type Op = UpsertOp | RemoveOp | SetOp | HealthOp;

export type Pending = Partial<Record<FileName, Op[]>>;
export type Shas = Partial<Record<FileName, string | null>>;
