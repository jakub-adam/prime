/* Synthetic watch workouts (1 Hz GPS, HR every 5 s, distance every 3 s) for the demo data and tests.
   Deterministic for the same input. The loop is drawn around a public park, never real data. */
import type { WorkoutInput } from './workout';

export type SyntheticRun = {
  type?: string;
  startMs: number;
  km: number;
  sec: number;
  avgHr: number;
  /** loop centre; default: Prater, Vienna */
  center?: { lat: number; lng: number };
  seed?: number;
  indoor?: boolean;
};

export function syntheticWorkout(r: SyntheticRun): WorkoutInput {
  let seed = r.seed ?? 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const c = r.center ?? { lat: 48.2105, lng: 16.4005 };
  const dur = r.sec, t0 = r.startMs;
  // speed varies around the average: a slow first km, a faster middle, a fade at the end
  const shape = (f: number) => 1 + 0.07 * Math.sin(f * Math.PI * 2.2 + 0.6) - 0.05 * (f < 0.12 ? 1 - f / 0.12 : 0);
  const steps = 600;
  let norm = 0;
  for (let i = 0; i < steps; i++) norm += shape(i / steps);
  norm /= steps;
  const kmAt: number[] = [0];
  for (let s = 1; s <= dur; s++) kmAt.push(kmAt[s - 1]! + (r.km / dur) * (shape(s / dur) / norm));
  const scale = r.km / kmAt[dur]!;
  for (let s = 0; s <= dur; s++) kmAt[s] = kmAt[s]! * scale;

  // loop: an ellipse whose perimeter is the distance, with a little wobble
  const a = (r.km * 1000) / (2 * Math.PI) * 1.25, b = a * 0.62;
  const mPerLat = 111320, mPerLng = 111320 * Math.cos((c.lat * Math.PI) / 180);
  const route = r.indoor ? undefined : Array.from({ length: dur + 1 }, (_, s) => {
    const th = (kmAt[s]! / r.km) * Math.PI * 2;
    const wob = 1 + 0.03 * Math.sin(th * 7);
    return {
      t: t0 + s * 1000,
      lat: c.lat + (b * wob * Math.sin(th)) / mPerLat,
      lng: c.lng + (a * wob * Math.cos(th) - a) / mPerLng,
      ele: 160 + 6 * Math.sin(th * 2) + rnd() * 0.3,
    };
  });

  const hr: { t: number; v: number }[] = [];
  for (let s = 0; s <= dur; s += 5) {
    const f = s / dur, warm = Math.min(1, s / 240);
    hr.push({ t: t0 + s * 1000, v: Math.round(r.avgHr - 16 + 22 * warm + 6 * f + (rnd() - 0.5) * 4) });
  }
  // recovery: HR drops after the end
  for (let s = 5; s <= 180; s += 5) hr.push({ t: t0 + (dur + s) * 1000, v: Math.round(r.avgHr + 8 - s * 0.32) });
  // re-centre so the in-workout mean equals avgHr
  const inside = hr.filter(h => h.t <= t0 + dur * 1000);
  const off = r.avgHr - inside.reduce((x, h) => x + h.v, 0) / inside.length;
  for (const h of inside) h.v = Math.round(h.v + off);

  const dist: { start: number; end: number; km: number }[] = [];
  for (let s = 0; s < dur; s += 3) {
    const e = Math.min(dur, s + 3);
    dist.push({ start: t0 + s * 1000, end: t0 + e * 1000, km: kmAt[e]! - kmAt[s]! });
  }
  const run = /run/i.test(r.type ?? 'Running');
  return {
    type: r.type ?? 'Running', startMs: t0, endMs: t0 + dur * 1000, durationSec: dur, hr, dist,
    ...(route ? { route } : {}),
    steps: Math.round((dur / 60) * (run ? 164 : 112)),
  };
}
