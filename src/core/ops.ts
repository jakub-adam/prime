import type { DataFiles, FileName, Op } from './types';

export const FILES: FileName[] = ['food', 'training', 'body', 'activities', 'health', 'settings'];

export const DEFAULT_SETTINGS = { targets: { kcal: 2350, protein: 160 }, goalWeight: 79, tenKGoalMin: 45 };
export const DEFAULT_STEPS_GOAL = 8000;
export const DEFAULT_SLEEP_GOAL_H = 7;

export function defaults(): DataFiles {
  return {
    food: { meals: [] },
    training: { sessions: [] },
    body: { weighins: [], measurements: [] },
    activities: { activities: [] },
    health: { days: {}, workouts: [] },
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

/** Applies edit operations to one file's data, in place, and returns it. */
export function applyOps<T extends Record<string, unknown>>(data: T, ops: Op[]): T {
  const d = data as Record<string, unknown>;
  for (const op of ops) {
    if (op.t === 'upsert') {
      const arr = (d[op.c] as { id: string }[] | undefined) ?? (d[op.c] = []) as { id: string }[];
      const i = arr.findIndex(r => r.id === op.r.id);
      if (i >= 0) arr[i] = op.r; else arr.push(op.r);
    } else if (op.t === 'remove') {
      d[op.c] = ((d[op.c] as { id: string }[] | undefined) ?? []).filter(r => r.id !== op.id);
    } else if (op.t === 'set') {
      d[op.k] = op.v;
    } else if (op.t === 'health') {
      const days = Object.assign((d.days as Record<string, unknown>) ?? {}, op.days);
      d.days = Object.fromEntries(Object.entries(days).sort());
      const seen = new Set(op.workouts.map(w => w.start));
      d.workouts = ((d.workouts as { start: string }[] | undefined) ?? [])
        .filter(w => !seen.has(w.start))
        .concat(op.workouts)
        .sort((a, b) => (a.start < b.start ? -1 : 1));
      d.importedAt = op.at;
    }
  }
  return data;
}

/** File body exactly as the app has always written it (1-space indent, trailing newline). */
export const serialize = (data: unknown) => JSON.stringify(data, null, 1) + '\n';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
