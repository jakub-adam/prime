/* Demo data, shown only when no data repo is connected. Deterministic for a given day. */
import { addDays, pad, parseYmd, todayStr } from './dates';
import { defaults } from './ops';
import { syntheticWorkout } from './synthetic';
import type { DataFiles, ExerciseKind, HealthWorkout, WorkoutDetail } from './types';
import { analyzeWorkout, detailPath, isoUtc, workoutId } from './workout';

/** "2026-10-21 07:05:00 +0200" for a local day and clock time, with the real offset that day. */
function hkLocal(day: string, hm: string) {
  const d = parseYmd(day);
  d.setHours(+hm.slice(0, 2), +hm.slice(3, 5), 0, 0);
  const off = -d.getTimezoneOffset();
  return { ms: d.getTime(), str: `${day} ${hm}:00 ${off < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(off) / 60))}${pad(Math.abs(off) % 60)}` };
}

type SampleWorkout = { row: HealthWorkout; detail?: WorkoutDetail };
const sampleCache = new Map<string, SampleWorkout[]>();
/** Watch workouts for the demo: runs for the progress charts, a treadmill run (no GPS), a walk and a strength session. */
export function sampleWorkouts(t = todayStr()): SampleWorkout[] {
  const hit = sampleCache.get(t);
  if (hit) return hit;
  const plan: [number, string, string, number, number, number, boolean?][] = [
    // day offset, type, clock, km, seconds, avg HR, indoor
    [-33, 'Running', '07:10', 3.0, 1290, 176],
    [-25, 'Running', '07:05', 5.0, 2190, 168],
    [-18, 'Running', '18:30', 3.1, 1215, 171],
    [-11, 'Running', '07:00', 8.2, 3420, 164],
    [-8, 'Running', '19:15', 3.0, 1140, 166, true],
    [-6, 'Running', '07:20', 4.0, 1580, 163],
    [-4, 'Running', '07:05', 5.18, 1914, 158],
    [-2, 'Walking', '18:20', 3.4, 2550, 104],
    [0, 'Running', '09:49', 2.54, 1032, 175],
  ];
  const out: SampleWorkout[] = plan.filter(([o]) => o <= 0).map(([o, type, hm, km, sec, hr, indoor], i) => {
    const { ms, str } = hkLocal(addDays(t, o), hm);
    const input = syntheticWorkout({ type, startMs: ms, km, sec, avgHr: hr, seed: 3 + i, ...(indoor ? { indoor } : {}) });
    const { series, ...an } = analyzeWorkout({ ...input, elevationGainM: indoor ? 0 : Math.round(8 + km * 3) });
    const id = workoutId(type, ms);
    const base = { type, start: str, durationMin: Math.round(sec / 6) / 10, distanceKm: km, activeKcal: Math.round(km * (type === 'Walking' ? 55 : 78)), avgHr: an.avgHr ?? hr };
    const row: HealthWorkout = {
      ...base, id, endTime: isoUtc(ms + sec * 1000), durationSec: sec,
      ...an, avgPaceSecPerKm: Math.round(sec / km), indoor: !!indoor, source: 'Apple Watch', steps: input.steps,
      ...(series ? { detail: detailPath(id) } : {}),
    };
    return { row, ...(series ? { detail: { ...series, id } } : {}) };
  });
  const s = hkLocal(addDays(t, -3), '17:30');
  out.push({ row: { type: 'TraditionalStrengthTraining', start: s.str, durationMin: 52, distanceKm: null, activeKcal: 290, avgHr: 121, id: workoutId('TraditionalStrengthTraining', s.ms), endTime: isoUtc(s.ms + 52 * 60e3), durationSec: 3120, maxHr: 158, minHr: 88, source: 'Apple Watch' } });
  out.sort((a, b) => (a.row.id! < b.row.id! ? -1 : 1));
  sampleCache.set(t, out);
  return out;
}
export function sampleDetails(t = todayStr()) {
  return Object.fromEntries(sampleWorkouts(t).filter(x => x.detail).map(x => [x.row.id!, x.detail!]));
}

export function sampleData(t = todayStr()): DataFiles {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const d = defaults();
  const menu: [string, string, string, number, number][] = [
    ['Breakfast', '07:10', 'Overnight oats with yogurt and banana', 460, 35],
    ['Lunch', '12:30', '2 pulled pork wraps, yogurt sauce', 900, 80],
    ['Snack', '16:00', '250 g cottage cheese, apple', 330, 30],
    ['Dinner', '18:15', 'Chicken, rice, salad', 640, 52],
  ];
  for (let i = 34; i >= 0; i--) {
    const day = addDays(t, -i);
    menu.forEach(([meal, time, items, k, p], j) => {
      if (i === 0 && j > 1) return;
      const kcal = Math.round(k * (0.85 + rnd() * 0.3)), protein = Math.round(p * (0.85 + rnd() * 0.3));
      // Recent meals also carry the optional nutrients; older ones (like real v1 data) only have kcal and protein.
      const fat = Math.round(((kcal - protein * 4) * 0.3) / 9), carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
      const extra = i < 14 ? { carbs, sugar: Math.round(carbs * 0.25), fiber: Math.round(3 + rnd() * 6), fat, satFat: Math.round(fat * 0.35), salt: Math.round((0.6 + rnd()) * 10) / 10 } : {};
      d.food.meals.push({ id: `${day}_s${j}`, date: day, time, meal, items, kcal, protein, ...extra });
    });
    if (rnd() > 0.2) d.body.weighins.push({ id: `${day}_w`, date: day, kg: Math.round((87.6 - (34 - i) * 0.07 + (rnd() - 0.5) * 1.2) * 10) / 10 });
    const steps = Math.round(4000 + rnd() * 9000);
    const r2 = (v: number) => Math.round(v * 100) / 100, r1 = (v: number) => Math.round(v * 10) / 10;
    const sleepH = r2(5.5 + rnd() * 2.5);
    const deep = r2(sleepH * (0.12 + rnd() * 0.06)), rem = r2(sleepH * (0.2 + rnd() * 0.06));
    const bed = -Math.round(20 + rnd() * 90);
    const restingHr = Math.round(66 + rnd() * 16);
    d.health.days[day] = {
      steps,
      distanceKm: r2(steps * 0.00078),
      flights: Math.round(2 + rnd() * 14),
      activeKcal: Math.round(250 + rnd() * 600),
      basalKcal: Math.round(1780 + rnd() * 60),
      exerciseMin: Math.round(10 + rnd() * 60),
      standHours: Math.round(6 + rnd() * 8),
      standMin: Math.round(60 + rnd() * 120),
      daylightMin: Math.round(10 + rnd() * 80),
      ...(i % 6 === 2 ? { mindfulMin: Math.round(5 + rnd() * 10) } : {}),
      ...(i % 5 === 1 ? { cyclingKm: r2(4 + rnd() * 10) } : {}),
      sleepH,
      sleepDeepH: deep,
      sleepRemH: rem,
      sleepCoreH: r2(sleepH - deep - rem),
      sleepAwakeH: r2(0.2 + rnd() * 0.5),
      sleepStartMin: bed,
      sleepEndMin: Math.round(bed + sleepH * 60 + 30),
      hrAvg: Math.round(78 + rnd() * 10),
      hrMin: Math.round(48 + rnd() * 8),
      hrMax: Math.round(140 + rnd() * 40),
      restingHr,
      hrv: r1(40 + rnd() * 40),
      walkingHr: Math.round(105 + rnd() * 25),
      ...(i % 3 === 0 ? { hrRecovery: Math.round(20 + rnd() * 12) } : {}),
      respiratoryRate: r1(13.5 + rnd() * 3),
      spo2: Math.round(95 + rnd() * 4),
      wristTempC: r1(35.3 + rnd() * 0.8),
      walkingSpeed: r1(4.6 + rnd() * 0.9),
      stepLengthCm: Math.round(68 + rnd() * 8),
      walkingAsymmetry: r1(rnd() * 4),
      doubleSupport: r1(25 + rnd() * 5),
      envAudioDb: Math.round(58 + rnd() * 18),
      headphoneDb: Math.round(55 + rnd() * 20),
      ...(i % 4 === 0 ? { vo2max: r1(37 + (34 - i) * 0.05 + rnd()) } : {}),
      ...(i % 7 === 0 ? { bodyFatPct: r1(19.4 - (34 - i) * 0.03 + rnd() * 0.4) } : {}),
    };
  }
  const plan: [string, [string, ExerciseKind, number, number][]][] = [
    ['Upper A', [['Bench press', 'weight', 80, 8], ['Chest-supported row', 'weight', 70, 10], ['Weighted dips', 'bw', 10, 8], ['Pull-ups', 'bw', 0, 8]]],
    ['Lower A', [['Hack squat', 'weight', 140, 8], ['Romanian deadlift', 'weight', 80, 10], ['Leg curl', 'weight', 45, 12]]],
    ['Upper B', [['Pull-ups', 'bw', 0, 9], ['Dumbbell shoulder press', 'weight', 28, 10], ['Dips', 'bw', 0, 20], ['Tuck front lever hold', 'hold', 0, 12]]],
  ];
  for (let w = 0; w < 5; w++) plan.forEach(([name, exs], j) => {
    const day = addDays(t, -32 + w * 7 + j * 2);
    if (day > t) return;
    d.training.sessions.push({
      id: `${day}_t${j}`, date: day, name, durationMin: 48 + j * 6 + w * 2, notes: w === 4 && j === 0 ? 'Felt strong, RPE 8 on the last bench set.' : '',
      exercises: exs.map(([n, kind, kg, reps]) => ({
        name: n, kind,
        sets: [0, 1, 2].map(si => kind === 'hold'
          ? { sec: reps + w * 2 - si * 2 }
          : { reps: reps + (w > 2 ? 1 : 0) - (si > 1 ? 1 : 0), ...(kg ? { kg: kg + w * 2.5 } : {}) }),
      })),
    });
  });
  const runs: [number, number, number][] = [[-30, 3, 1140], [-23, 3.2, 1150], [-16, 4, 1500], [-12, 3, 1050], [-9, 5, 1880], [-4, 5.2, 1910], [-1, 6, 2200]];
  runs.forEach(([o, km, sec], i) => d.activities.activities.push({ id: `${addDays(t, o)}_sa${i}`, date: addDays(t, o), type: 'Run', distanceKm: km, durationSec: sec, avgHr: 150 + i * 2 }));
  // Watch workouts with full detail (synthetic GPS and HR). One duplicates a logged run (merged in the UI).
  d.health.workouts.push(...sampleWorkouts(t).map(x => x.row));
  d.health.importedAt = `${addDays(t, -1)}T21:00:00+02:00`;
  d.body.measurements.push(
    { id: `${addDays(t, -30)}_m1`, date: addDays(t, -30), waist: 92, chest: 104, arm: 37.5, thigh: 60 },
    { id: `${addDays(t, -2)}_m2`, date: addDays(t, -2), waist: 90.5, chest: 104, arm: 37.5, thigh: 59.5 },
  );
  return d;
}
