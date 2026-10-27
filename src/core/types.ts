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

export type HealthWorkout = {
  type: string;
  start: string;
  durationMin: number;
  distanceKm: number | null;
  activeKcal: number | null;
  avgHr: number | null;
};

export type Settings = {
  targets: { kcal: number; protein: number };
  goalWeight: number;
  tenKGoalMin: number;
  stepsGoal?: number;
  sleepGoalH?: number;
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
