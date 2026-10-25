import type { DataFiles } from './types';

const cell = (v: unknown) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(header: string[], rows: unknown[][]) {
  return [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export type CsvDataset = { key: string; label: string; build: (d: DataFiles) => string; count: (d: DataFiles) => number };

export const CSV_DATASETS: CsvDataset[] = [
  {
    key: 'meals', label: 'Meals', count: d => d.food.meals.length,
    build: d => toCsv(['id', 'date', 'time', 'meal', 'items', 'kcal', 'protein'],
      d.food.meals.map(m => [m.id, m.date, m.time, m.meal, m.items, m.kcal, m.protein])),
  },
  {
    key: 'sets', label: 'Training sets', count: d => d.training.sessions.reduce((n, s) => n + s.exercises.reduce((k, e) => k + e.sets.length, 0), 0),
    build: d => toCsv(['session_id', 'date', 'session', 'exercise', 'kind', 'set', 'reps', 'kg', 'sec'],
      d.training.sessions.flatMap(s => s.exercises.flatMap(e => e.sets.map((st, i) => [s.id, s.date, s.name, e.name, e.kind, i + 1, st.reps, st.kg, st.sec])))),
  },
  {
    key: 'weighins', label: 'Weigh-ins', count: d => d.body.weighins.length,
    build: d => toCsv(['id', 'date', 'kg'], d.body.weighins.map(w => [w.id, w.date, w.kg])),
  },
  {
    key: 'measurements', label: 'Measurements', count: d => d.body.measurements.length,
    build: d => toCsv(['id', 'date', 'waist', 'chest', 'arm', 'thigh', 'hips', 'neck'],
      d.body.measurements.map(m => [m.id, m.date, m.waist, m.chest, m.arm, m.thigh, m.hips, m.neck])),
  },
  {
    key: 'activities', label: 'Activities', count: d => d.activities.activities.length,
    build: d => toCsv(['id', 'date', 'type', 'distanceKm', 'durationSec', 'avgHr', 'notes'],
      d.activities.activities.map(a => [a.id, a.date, a.type, a.distanceKm, a.durationSec, a.avgHr, a.notes])),
  },
  {
    key: 'health-days', label: 'Apple Health days', count: d => Object.keys(d.health.days || {}).length,
    build: d => {
      const known = ['steps', 'distanceKm', 'activeKcal', 'exerciseMin', 'sleepH', 'restingHr', 'hrv', 'walkingHr', 'vo2max', 'weightKg'];
      const seen = new Set(Object.values(d.health.days || {}).flatMap(v => Object.keys(v)));
      const cols = [...known, ...[...seen].filter(k => !known.includes(k)).sort()];
      return toCsv(['date', ...cols], Object.entries(d.health.days || {}).sort().map(([date, v]) => [date, ...cols.map(c => v[c])]));
    },
  },
  {
    key: 'health-workouts', label: 'Apple Health workouts', count: d => (d.health.workouts || []).length,
    build: d => toCsv(['type', 'start', 'durationMin', 'distanceKm', 'activeKcal', 'avgHr'],
      (d.health.workouts || []).map(w => [w.type, w.start, w.durationMin, w.distanceKm, w.activeKcal, w.avgHr])),
  },
];
