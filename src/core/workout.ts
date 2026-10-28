/* Workout detail from raw Apple Health samples: stable ids in UTC, splits, HR series and zones,
   recovery HR, best efforts, HR by pace, GPS route downsampling and the route privacy trim.
   Pure functions with no dependencies, shared by the importer, the data layer and the UI. */
import type { BestEfforts, HealthWorkout, HrZones, RoutePoint, Split, WorkoutDetail } from './types';

export const DEFAULT_MAX_HR = 202;
export const DEFAULT_PRIVACY_M = 200;
/** Zone floors as a share of max HR (5-zone %HRmax model): Z1 < 60 %, Z2 60–70, Z3 70–80, Z4 80–90, Z5 ≥ 90. */
export const ZONE_FLOORS = [0, 0.6, 0.7, 0.8, 0.9] as const;
export const EFFORTS: [keyof BestEfforts, number][] = [['1k', 1], ['3k', 3], ['5k', 5], ['10k', 10]];

/** Parses Apple Health's "2026-10-12 11:11:41 +0200" (and ISO strings) to epoch ms. */
export function hkTime(s: string) {
  if (/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d [+-]\d{4}$/.test(s)) return Date.parse(`${s.slice(0, 10)}T${s.slice(11, 19)}${s.slice(20, 23)}:${s.slice(23, 25)}`);
  return Date.parse(s);
}
/** "2026-10-12T09:11:41Z" */
export const isoUtc = (ms: number) => new Date(Math.round(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
/** Stable workout id: type + start in UTC, safe as a file name. "Running_20261012T091141Z" */
export const workoutId = (type: string, startMs: number) => `${type}_${isoUtc(startMs).replace(/[-:]/g, '')}`;
/** Id of a stored workout row; older rows have no `id` and get it from type + start. */
export function idOf(w: Pick<HealthWorkout, 'type' | 'start'> & { id?: unknown }) {
  if (typeof w.id === 'string' && w.id) return w.id;
  const ms = hkTime(w.start);
  return Number.isFinite(ms) ? workoutId(w.type, ms) : `${w.type}_${String(w.start).replace(/\W/g, '')}`;
}
const startKey = (w: HealthWorkout) => { const ms = hkTime(w.start); return Number.isFinite(ms) ? ms : 0; };
export const detailPath = (id: string) => `workouts/${id}.json`;

/** One row per workout id, oldest first. Duplicates (the same run exported with different UTC offsets)
    are merged field by field, later rows winning, so keys written by other tools survive. */
export function mergeWorkouts(existing: HealthWorkout[], incoming: HealthWorkout[] = []) {
  const byId = new Map<string, HealthWorkout>();
  for (const w of [...existing, ...incoming]) {
    const id = idOf(w);
    byId.set(id, { ...byId.get(id), ...w, id });
  }
  return [...byId.values()].sort((a, b) => startKey(a) - startKey(b) || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/* ---------- geometry ---------- */
const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Cumulative distance in metres at each point. */
export function cumDist(pts: { lat: number; lng: number }[]) {
  const out = new Array<number>(pts.length);
  let d = 0;
  pts.forEach((p, i) => { if (i) d += haversineM(pts[i - 1]!, p); out[i] = d; });
  return out;
}
/** Drops the first and last `m` metres of a route (privacy zone around home). Never returns
    any of the hidden points, so nothing downstream (line, markers, bounds, hover) can show them. */
export function trimRoute<T extends { lat: number; lng: number }>(pts: T[], m: number): T[] {
  if (!m || pts.length < 2) return pts;
  const cd = cumDist(pts), total = cd[cd.length - 1]!;
  if (total <= 2 * m) return [];
  return pts.filter((_, i) => cd[i]! >= m && cd[i]! <= total - m);
}

/* Google encoded polyline (precision 5), used for the small route preview in health.json. */
export function encodePolyline(pts: { lat: number; lng: number }[]) {
  let out = '', pl = 0, pg = 0;
  const enc = (v: number) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    while (v >= 0x20) { out += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    out += String.fromCharCode(v + 63);
  };
  for (const p of pts) {
    const la = Math.round(p.lat * 1e5), lg = Math.round(p.lng * 1e5);
    enc(la - pl); enc(lg - pg);
    pl = la; pg = lg;
  }
  return out;
}
export function decodePolyline(s: string) {
  const pts: { lat: number; lng: number }[] = [];
  let i = 0, la = 0, lg = 0;
  const dec = () => {
    let r = 0, sh = 0, b: number;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
    return r & 1 ? ~(r >> 1) : r >> 1;
  };
  while (i < s.length) { la += dec(); lg += dec(); pts.push({ lat: la / 1e5, lng: lg / 1e5 }); }
  return pts;
}

/* ---------- series helpers ---------- */
type Sample = { t: number; v: number };
/** Interpolated value of a monotonic series [t, v] at time t. */
function at(ts: number[], vs: number[], t: number) {
  if (!ts.length) return 0;
  if (t <= ts[0]!) return vs[0]!;
  if (t >= ts[ts.length - 1]!) return vs[vs.length - 1]!;
  let lo = 0, hi = ts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid]! <= t) lo = mid; else hi = mid; }
  const f = (t - ts[lo]!) / (ts[hi]! - ts[lo]! || 1);
  return vs[lo]! + f * (vs[hi]! - vs[lo]!);
}
/** First time the series reaches value v (series non-decreasing). */
function timeAt(ts: number[], vs: number[], v: number) {
  let lo = 0, hi = vs.length - 1;
  if (v <= vs[0]!) return ts[0]!;
  if (v > vs[hi]!) return null;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (vs[mid]! < v) lo = mid; else hi = mid; }
  const f = (v - vs[lo]!) / (vs[hi]! - vs[lo]! || 1);
  return ts[lo]! + f * (ts[hi]! - ts[lo]!);
}
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

export type DistanceSample = { start: number; end: number; km: number };
export type RawRoutePoint = { t: number; lat: number; lng: number; ele?: number };
export type WorkoutInput = {
  type: string;
  startMs: number;
  endMs: number;
  durationSec: number;
  /** heart rate samples (ms, bpm), any order, may extend past the end (recovery) */
  hr: Sample[];
  /** distance samples from the workout's own source, inside the workout */
  dist: DistanceSample[];
  route?: RawRoutePoint[];
  steps?: number;
  elevationGainM?: number;
  maxHr?: number;
  /** keep the GPS route (setting); the preview and the detail file then include it */
  withRoute?: boolean;
};
/** The named workout fields (minus the index signature and `detail`), plus the series for the detail file. */
export type WorkoutStreams = { [K in keyof HealthWorkout as string extends K ? never : K extends 'detail' ? never : K]?: HealthWorkout[K] } & { series?: WorkoutDetail };

/** Everything derived from samples for one workout. Fields without data are left out. */
export function analyzeWorkout(w: WorkoutInput): WorkoutStreams {
  const out: WorkoutStreams = {};
  const dur = w.durationSec, t0 = w.startMs, endSec = (w.endMs - t0) / 1000;
  const run = /run/i.test(w.type);
  const maxHr = w.maxHr || DEFAULT_MAX_HR;

  /* route: GPS points relative to the start */
  const gps = (w.route ?? []).filter(p => p.t >= t0 - 5000 && p.t <= w.endMs + 5000).sort((a, b) => a.t - b.t);

  /* cumulative distance timeline (seconds from start, km): watch distance samples, else GPS */
  const ts: number[] = [0], ks: number[] = [0];
  const dist = w.dist.filter(d => d.end > t0 && d.start < w.endMs + 1000).sort((a, b) => a.start - b.start);
  if (dist.length) {
    let k = 0;
    for (const d of dist) { k += d.km; ts.push(Math.min(endSec, Math.max(0, (d.end - t0) / 1000))); ks.push(k); }
  } else if (gps.length > 1) {
    const cd = cumDist(gps);
    gps.forEach((p, i) => { ts.push(Math.max(0, (p.t - t0) / 1000)); ks.push(cd[i]! / 1000); });
  }
  // keep time strictly increasing for interpolation
  for (let i = 1; i < ts.length; i++) if (ts[i]! <= ts[i - 1]!) ts[i] = ts[i - 1]! + 0.001;
  const totalKm = ks[ks.length - 1]!;

  /* heart rate */
  const hrAll = w.hr.slice().sort((a, b) => a.t - b.t);
  const hrIn = hrAll.filter(s => s.t >= t0 && s.t <= w.endMs);
  const hrRel = hrIn.map(s => ({ t: (s.t - t0) / 1000, v: s.v }));
  if (hrIn.length) {
    out.avgHr = Math.round(mean(hrIn.map(s => s.v)));
    out.maxHr = Math.round(Math.max(...hrIn.map(s => s.v)));
    out.minHr = Math.round(Math.min(...hrIn.map(s => s.v)));
    const z = [0, 0, 0, 0, 0];
    hrRel.forEach((s, i) => {
      const next = hrRel[i + 1]?.t ?? endSec;
      const dt = Math.max(0, Math.min(15, next - s.t));
      let zi = 0;
      for (let k = 0; k < ZONE_FLOORS.length; k++) if (s.v >= ZONE_FLOORS[k]! * maxHr) zi = k;
      z[zi]! += dt;
    });
    out.hrZones = { z1: Math.round(z[0]!), z2: Math.round(z[1]!), z3: Math.round(z[2]!), z4: Math.round(z[3]!), z5: Math.round(z[4]!) } satisfies HrZones;
    out.hrZonesMaxHr = maxHr;
  }
  /* recovery: the sample nearest 1 and 2 minutes after the end, within 20 s */
  const near = (t: number) => {
    let best: Sample | null = null;
    for (const s of hrAll) if (Math.abs(s.t - t) <= 20000 && (!best || Math.abs(s.t - t) < Math.abs(best.t - t))) best = s;
    return best ? Math.round(best.v) : undefined;
  };
  const r1 = near(w.endMs + 60000), r2 = near(w.endMs + 120000);
  if (r1 != null || r2 != null) out.recoveryHr = { ...(r1 != null ? { after1Min: r1 } : {}), ...(r2 != null ? { after2Min: r2 } : {}) };

  const hrBetween = (a: number, b: number) => hrRel.filter(s => s.t >= a && s.t < b).map(s => s.v);

  /* splits per km, including the partial last one */
  if (totalKm >= 0.05 && ts.length > 1) {
    const splits: Split[] = [];
    let prevT = 0;
    const whole = Math.floor(totalKm + 1e-9);
    for (let k = 1; k <= whole; k++) {
      const t = timeAt(ts, ks, k)!;
      splits.push(split(k, 1, prevT, t));
      prevT = t;
    }
    const rest = totalKm - whole;
    if (rest >= 0.01) splits.push(split(Math.round(totalKm * 100) / 100, rest, prevT, Math.max(prevT + 1, Math.min(endSec, ts[ts.length - 1]! + 5))));
    out.splits = splits;
  }
  function split(km: number, len: number, a: number, b: number): Split {
    const hs = hrBetween(a, b);
    return {
      km,
      durationSec: Math.round(b - a),
      paceSecPerKm: Math.round((b - a) / len),
      ...(hs.length ? { avgHr: Math.round(mean(hs)), maxHr: Math.round(Math.max(...hs)) } : {}),
    };
  }

  /* best efforts: fastest stretch of each distance anywhere in the run */
  if (run && totalKm >= 1) {
    const be: BestEfforts = {};
    for (const [key, d] of EFFORTS) {
      if (totalKm + 1e-9 < d) continue;
      let best = Infinity;
      for (let i = 0; i < ts.length; i++) {
        if (ks[i]! < d) continue;
        const start = timeAt(ts, ks, ks[i]! - d);
        if (start != null) best = Math.min(best, ts[i]! - start);
      }
      if (Number.isFinite(best)) be[key] = Math.round(best);
    }
    out.bestEfforts = be;
  }

  /* 10 s series for the charts and the map link */
  const step = 10;
  const hrSeries: { tSec: number; bpm: number }[] = [];
  const distSeries: { tSec: number; km: number }[] = [];
  for (let t = 0; t <= endSec; t += step) {
    const hs = hrBetween(t, t + step);
    if (hs.length) hrSeries.push({ tSec: t, bpm: Math.round(mean(hs)) });
    if (ts.length > 1) distSeries.push({ tSec: t, km: Math.round(at(ts, ks, t) * 1000) / 1000 });
  }

  /* average HR per pace (10 s/km buckets, 30 s windows, after a 3 min warm-up) for "HR at easy pace" */
  if (run && distSeries.length > 20 && hrSeries.length) {
    const acc = new Map<number, [number, number]>();
    for (let t = 180; t + 30 <= endSec; t += 30) {
      const dk = at(ts, ks, t + 30) - at(ts, ks, t);
      if (dk < 0.03) continue;
      const p = 30 / dk;
      if (p < 180 || p > 900) continue;
      const hs = hrBetween(t, t + 30);
      if (!hs.length) continue;
      const b = Math.round(p / 10) * 10, cur = acc.get(b) ?? [0, 0];
      acc.set(b, [cur[0] + mean(hs) * 30, cur[1] + 30]);
    }
    if (acc.size) out.paceHr = [...acc.entries()].sort(([a], [b]) => a - b).map(([p, [s, n]]) => [p, Math.round((s / n) * 10) / 10, n]);
  }

  if (w.steps && run && dur > 0) out.avgCadence = Math.round(w.steps / (dur / 60));

  /* route: ~1 point per 4 s, at most ~1500 points; elevation gain from GPS when the watch gave none */
  let route: RoutePoint[] | undefined;
  if (gps.length > 1) {
    const every = Math.max(4, Math.ceil(dur / 1500));
    const kept: RawRoutePoint[] = [];
    for (const p of gps) if (!kept.length || p.t - kept[kept.length - 1]!.t >= every * 1000) kept.push(p);
    if (kept[kept.length - 1] !== gps[gps.length - 1]) kept.push(gps[gps.length - 1]!);
    route = kept.map(p => ({
      lat: Math.round(p.lat * 1e6) / 1e6,
      lng: Math.round(p.lng * 1e6) / 1e6,
      tSec: Math.max(0, Math.round((p.t - t0) / 1000)),
      ...(p.ele != null ? { ele: Math.round(p.ele * 10) / 10 } : {}),
    }));
    if (w.elevationGainM == null) {
      let gain = 0, base: number | null = null;
      for (const p of gps) {
        if (p.ele == null) continue;
        if (base == null || p.ele < base) base = p.ele;
        else if (p.ele - base >= 2) { gain += p.ele - base; base = p.ele; }
      }
      if (gps.some(p => p.ele != null)) out.elevationGainM = Math.round(gain);
    }
  }
  if (w.elevationGainM != null) out.elevationGainM = w.elevationGainM;

  const withRoute = w.withRoute !== false && !!route;
  if (withRoute) {
    const n = 48, r = route!;
    const pick = r.length <= n ? r : Array.from({ length: n }, (_, i) => r[Math.round((i * (r.length - 1)) / (n - 1))]!);
    out.routePreview = encodePolyline(pick);
  }
  if (hrSeries.length || distSeries.length || withRoute) {
    out.series = { id: '', hrSeries, distSeries, ...(withRoute ? { route } : {}) };
  }
  return out;
}

/* ---------- display helpers ---------- */
/** Pace over time from the cumulative distance series, smoothed over `win` seconds. */
export function paceSeries(dist: { tSec: number; km: number }[], win = 30) {
  const out: { tSec: number; pace: number | null }[] = [];
  const ts = dist.map(d => d.tSec), ks = dist.map(d => d.km);
  for (const d of dist) {
    const a = Math.max(0, d.tSec - win / 2), b = Math.min(ts[ts.length - 1] ?? 0, d.tSec + win / 2);
    const dk = at(ts, ks, b) - at(ts, ks, a);
    const p = dk > 0.0005 ? (b - a) / dk : null;
    out.push({ tSec: d.tSec, pace: p != null && p <= 1200 ? Math.round(p) : null });
  }
  return out;
}

/** HR at a target pace for one run: weighted mean of the pace buckets within ±20 s/km. Needs 60 s of data. */
export function hrAtPace(paceHr: [number, number, number][] | undefined, target: number, tol = 20) {
  if (!paceHr?.length) return null;
  const near = paceHr.filter(([p]) => Math.abs(p - target) <= tol);
  const n = near.reduce((s, [, , sec]) => s + sec, 0);
  if (n < 60) return null;
  return { bpm: near.reduce((s, [, hr, sec]) => s + hr * sec, 0) / n, sec: n };
}
