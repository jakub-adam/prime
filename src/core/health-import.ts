/* Apple Health export → daily totals and workouts. Same rules as tools/import_health.py:
   steps, distances and flights take the larger source per day (iPhone and Watch overlap), energy and
   minutes are summed, body and heart metrics are daily means (heart rate also min/max), percentages
   are stored as 0–100, sleep uses the source with the most records, merges overlaps and credits each
   night (gaps under 3 h join) to the wake-up day, with time per stage and bed/wake clock times.
   Workouts also get an id (type + start in UTC), end time and max/min HR (the base fields, also written by
   tools/import_health.py) and, from the heart-rate and distance samples and the GPX routes in the zip,
   splits, HR zones, recovery HR, best efforts and the series for workouts/<id>.json (app only). */
import { Unzip, UnzipInflate } from 'fflate';
import type { HealthDay, HealthWorkout, WorkoutDetail } from './types';
import { analyzeWorkout, detailPath, isoUtc, workoutId, type DistanceSample, type RawRoutePoint } from './workout';

const ASLEEP = new Set([
  'HKCategoryValueSleepAnalysisAsleepUnspecified', 'HKCategoryValueSleepAnalysisAsleepCore', 'HKCategoryValueSleepAnalysisAsleepDeep',
  'HKCategoryValueSleepAnalysisAsleepREM', 'HKCategoryValueSleepAnalysisAsleep',
]);
const STAGES: Record<string, string> = {
  HKCategoryValueSleepAnalysisAsleepCore: 'sleepCoreH',
  HKCategoryValueSleepAnalysisAsleepDeep: 'sleepDeepH',
  HKCategoryValueSleepAnalysisAsleepREM: 'sleepRemH',
  HKCategoryValueSleepAnalysisAwake: 'sleepAwakeH',
};
type Conv = 'km' | 'm' | 'kmh' | 'cm' | 'pct' | 'degC';
const H_BYSRC: Record<string, [string, Conv?]> = {
  StepCount: ['steps'], DistanceWalkingRunning: ['distanceKm', 'km'], DistanceCycling: ['cyclingKm', 'km'], FlightsClimbed: ['flights'],
};
const H_SUM: Record<string, string> = {
  ActiveEnergyBurned: 'activeKcal', BasalEnergyBurned: 'basalKcal', AppleExerciseTime: 'exerciseMin', AppleStandTime: 'standMin', TimeInDaylight: 'daylightMin',
};
const H_MEAN: Record<string, [string, Conv?]> = {
  RestingHeartRate: ['restingHr'], HeartRateVariabilitySDNN: ['hrv'], WalkingHeartRateAverage: ['walkingHr'], VO2Max: ['vo2max'],
  HeartRateRecoveryOneMinute: ['hrRecovery'], BodyMass: ['weightKg'], BodyFatPercentage: ['bodyFatPct', 'pct'],
  RespiratoryRate: ['respiratoryRate'], OxygenSaturation: ['spo2', 'pct'], AppleSleepingWristTemperature: ['wristTempC', 'degC'],
  WalkingSpeed: ['walkingSpeed', 'kmh'], WalkingStepLength: ['stepLengthCm', 'cm'], WalkingAsymmetryPercentage: ['walkingAsymmetry', 'pct'],
  WalkingDoubleSupportPercentage: ['doubleSupport', 'pct'], SixMinuteWalkTestDistance: ['sixMinWalkM', 'm'],
  EnvironmentalAudioExposure: ['envAudioDb'], HeadphoneAudioExposure: ['headphoneDb'],
};
const BYSRC_2DP = new Set(['distanceKm', 'cyclingKm']);
const shortType = (t: string) => t.replace(/^HK(QuantityTypeIdentifier|CategoryTypeIdentifier|DataType)/, '');
const toKm = (v: number, u?: string) => (u === 'mi' ? v * 1.609344 : u === 'm' ? v / 1000 : v);
function convert(v: number, c: Conv | undefined, u?: string) {
  switch (c) {
    case 'km': return toKm(v, u);
    case 'm': return u === 'km' ? v * 1000 : u === 'mi' ? v * 1609.344 : u === 'ft' ? v * 0.3048 : v;
    case 'kmh': return u === 'mi/hr' ? v * 1.609344 : u === 'm/s' ? v * 3.6 : v;
    case 'cm': return u === 'in' ? v * 2.54 : u === 'm' ? v * 100 : v;
    case 'pct': return v * 100;
    case 'degC': return u === 'degF' ? ((v - 32) * 5) / 9 : v;
    default: return v;
  }
}
const hkDate = (s: string) => Date.parse(`${s.slice(0, 10)}T${s.slice(11, 19)}${s.slice(20, 23)}:${s.slice(23, 25)}`);
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
/** Clock time of `s` in minutes after midnight of `day` (negative = the evening before). */
const clockMin = (s: string, day: string) => +s.slice(11, 13) * 60 + +s.slice(14, 16) - (s.slice(0, 10) < day ? 1440 : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

type Attrs = Record<string, string>;
export function attrs(str: string): Attrs {
  const o: Attrs = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str))) o[m[1]!] = m[2]!.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return o;
}

export type HealthImport = { days: Record<string, HealthDay>; workouts: HealthWorkout[]; details: Record<string, WorkoutDetail> };
export type ImportOptions = { maxHr?: number; routes?: boolean };

/* Workout distance comes from the sample type matching the sport. */
const DIST_TYPES = ['DistanceWalkingRunning', 'DistanceCycling', 'DistanceSwimming'] as const;
const distTypeFor = (type: string, stats: Record<string, Attrs>) =>
  DIST_TYPES.find(t => stats[t]?.sum) ?? (/cycl/i.test(type) ? 'DistanceCycling' : /swim/i.test(type) ? 'DistanceSwimming' : 'DistanceWalkingRunning');
const statNum = (a: Attrs | undefined, k: string) => (a && a[k] != null && a[k] !== '' ? +a[k]! : undefined);
const rnd = (v: number | undefined, dp = 0) => (v == null || !Number.isFinite(v) ? undefined : Math.round(v * 10 ** dp) / 10 ** dp);
/** Drops keys whose value is undefined. */
const defined = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
/** "132 cm" → metres */
const metaMetres = (v: string) => { const [n, u] = v.split(' '); const x = parseFloat(n || ''); return u === 'cm' ? x / 100 : u === 'ft' ? x * 0.3048 : u === 'km' ? x * 1000 : x; };

/** Time-stamped samples in parallel arrays, sorted by time once at the end. */
function samples() {
  const t: number[] = [], v: number[] = [], e: number[] = [], src: string[] = [];
  return {
    push(start: number, value: number, end = start, source = '') { t.push(start); v.push(value); e.push(end); src.push(source); },
    sorted() {
      const idx = t.map((_, i) => i).sort((a, b) => t[a]! - t[b]!);
      return { t: idx.map(i => t[i]!), v: idx.map(i => v[i]!), e: idx.map(i => e[i]!), src: idx.map(i => src[i]!) };
    },
  };
}
type Sorted = ReturnType<ReturnType<typeof samples>['sorted']>;
function lowerBound(a: number[], x: number) {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m]! < x) lo = m + 1; else hi = m; }
  return lo;
}

/** Streams GPX text (workout-routes/*.gpx in the export) into points. */
export function gpxFeeder(onPoint: (p: RawRoutePoint) => void) {
  let buf = '';
  const re = /<trkpt\s([^>]*)>([\s\S]*?)<\/trkpt>/g;
  return (text: string) => {
    buf += text;
    const cut = buf.lastIndexOf('</trkpt>');
    if (cut < 0) return;
    const chunk = buf.slice(0, cut + 8);
    buf = buf.slice(cut + 8);
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(chunk))) {
      const a = attrs(m[1]!), inner = m[2]!;
      const time = /<time>([^<]+)<\/time>/.exec(inner)?.[1], ele = /<ele>([^<]+)<\/ele>/.exec(inner)?.[1];
      const lat = parseFloat(a.lat || ''), lng = parseFloat(a.lon || ''), t = time ? Date.parse(time) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(t)) onPoint({ t, lat, lng, ...(ele ? { ele: parseFloat(ele) } : {}) });
    }
  };
}
/** start ms, end ms, end day, start string, end string */
type SleepIv = [number, number, string, string, string];

function mergeSleep(iv: SleepIv[]) {
  const out: SleepIv[] = [];
  for (const x of [...iv].sort((a, b) => a[0] - b[0])) {
    const l = out[out.length - 1];
    if (l && x[0] <= l[1]) {
      if (x[1] > l[1]) { l[1] = x[1]; l[2] = x[2]; l[4] = x[4]; }
    } else out.push([...x]);
  }
  return out;
}
function mergeSpans(iv: [number, number][]) {
  const out: [number, number][] = [];
  for (const x of [...iv].sort((a, b) => a[0] - b[0])) {
    const l = out[out.length - 1];
    if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]);
    else out.push([...x]);
  }
  return out;
}

export function healthAccumulator(opts: ImportOptions = {}) {
  const bySrc: Record<string, Record<string, number>> = {};
  const sums: Record<string, number> = {};
  const means: Record<string, number[]> = {};
  const hr: Record<string, number[]> = {};
  const standHours: Record<string, number> = {};
  const sleep: Record<string, SleepIv[]> = {};
  const stages: Record<string, Record<string, [number, number][]>> = {}; // source -> stage key -> spans
  type RawWorkout = { a: Attrs; stats: Record<string, Attrs>; meta: Attrs; routePath?: string };
  const rawWorkouts: RawWorkout[] = [];
  let wk: RawWorkout | null = null;
  let inRoute = false;
  const hrS = samples();
  const distS: Record<string, ReturnType<typeof samples>> = Object.fromEntries(DIST_TYPES.map(t => [t, samples()]));
  const routes = new Map<string, RawRoutePoint[]>();

  const endWorkout = () => {
    if (!wk) return;
    rawWorkouts.push(wk);
    wk = null;
    inRoute = false;
  };

  /** Base fields (the same in tools/import_health.py) plus everything derived from the samples. */
  function buildWorkout(w: RawWorkout, hr: Sorted, dist: Record<string, Sorted>): { row: HealthWorkout; detail?: WorkoutDetail } {
    const st = w.stats, en = st.ActiveEnergyBurned, h = st.HeartRate;
    const type = (w.a.workoutActivityType || '').replace('HKWorkoutActivityType', '');
    const dType = distTypeFor(type, st), dist0 = st[dType];
    let dur = parseFloat(w.a.duration || '0');
    if (w.a.durationUnit === 's') dur /= 60;
    const startMs = hkDate(w.a.startDate || ''), endMs = w.a.endDate ? hkDate(w.a.endDate) : startMs + dur * 6e4;
    const durationSec = Math.round(dur * 60);
    // heart rate during the workout: the watch's summary if it has one, else the samples
    const inside = hr.v.slice(lowerBound(hr.t, startMs), lowerBound(hr.t, endMs + 1));
    const distanceKm = dist0 && dist0.sum ? Math.round(toKm(+dist0.sum, dist0.unit) * 100) / 100 : null;
    const row: HealthWorkout = {
      type,
      start: w.a.startDate || '',
      durationMin: Math.round(dur * 10) / 10,
      distanceKm,
      activeKcal: en && en.sum ? Math.round(+en.sum) : null,
      avgHr: h && h.average ? Math.round(+h.average) : inside.length ? Math.round(mean(inside)) : null,
      id: workoutId(type, startMs),
      endTime: isoUtc(endMs),
      durationSec,
      ...defined({
        maxHr: h && h.maximum ? Math.round(+h.maximum) : inside.length ? Math.round(Math.max(...inside)) : undefined,
        minHr: h && h.minimum ? Math.round(+h.minimum) : inside.length ? Math.round(Math.min(...inside)) : undefined,
      }),
    };
    if (!Number.isFinite(startMs)) return { row };

    // HR from 30 s before to 3 min after the workout (recovery); distance from the workout's own source
    const a = lowerBound(hr.t, startMs - 30000), b = lowerBound(hr.t, endMs + 180000);
    const hrWin = hr.t.slice(a, b).map((t, i) => ({ t, v: hr.v[a + i]! }));
    const ds = dist[dType]!, da = lowerBound(ds.t, startMs - 1000), db = lowerBound(ds.t, endMs + 1000);
    const bySrc: Record<string, DistanceSample[]> = {};
    for (let i = da; i < db; i++) if (ds.e[i]! <= endMs + 1000) (bySrc[ds.src[i]!] ??= []).push({ start: ds.t[i]!, end: ds.e[i]!, km: ds.v[i]! });
    const srcName = w.a.sourceName || '';
    const kmOf = (x: DistanceSample[]) => x.reduce((s, d) => s + d.km, 0);
    const own = bySrc[srcName] ?? Object.values(bySrc).sort((x, y) => kmOf(y) - kmOf(x))[0] ?? [];
    const steps = statNum(st.StepCount, 'sum');
    const elevationGainM = w.meta.HKElevationAscended ? rnd(metaMetres(w.meta.HKElevationAscended), 1) : undefined;
    const indoor = w.meta.HKIndoorWorkout === '1';
    const route = w.routePath && !indoor && opts.routes !== false ? routes.get(w.routePath) : undefined;
    const { series: detail, avgHr: _avg, maxHr: _max, minHr: _min, ...derived } = analyzeWorkout({
      type, startMs, endMs, durationSec, hr: hrWin, dist: own,
      ...(route ? { route } : {}), ...(steps ? { steps } : {}), ...(elevationGainM != null ? { elevationGainM } : {}),
      ...(opts.maxHr ? { maxHr: opts.maxHr } : {}), withRoute: opts.routes !== false,
    });
    const speed = st.RunningSpeed ?? st.WalkingSpeed ?? st.CyclingSpeed;
    const kmh = (v: number | undefined) => (v == null ? undefined : speed?.unit === 'm/s' ? v * 3.6 : speed?.unit === 'mi/hr' ? v * 1.609344 : v);
    Object.assign(row, defined({
      avgPaceSecPerKm: distanceKm && /run|walk|hik/i.test(type) ? Math.round(durationSec / distanceKm) : undefined,
      ...derived,
      indoor: w.meta.HKIndoorWorkout != null ? indoor : undefined,
      source: srcName || undefined,
      steps: rnd(steps),
      basalKcal: rnd(statNum(st.BasalEnergyBurned, 'sum')),
      avgPowerW: rnd(statNum(st.RunningPower, 'average')),
      avgGroundContactMs: rnd(statNum(st.RunningGroundContactTime, 'average')),
      avgVerticalOscCm: rnd(statNum(st.RunningVerticalOscillation, 'average'), 1),
      avgStrideM: rnd(statNum(st.RunningStrideLength, 'average'), 2),
      avgSpeedKmh: rnd(kmh(statNum(speed, 'average')), 1),
      maxSpeedKmh: rnd(kmh(statNum(speed, 'maximum')), 1),
      avgMets: rnd(w.meta.HKAverageMETs ? parseFloat(w.meta.HKAverageMETs) : undefined, 1),
      timeZone: w.meta.HKTimeZone,
    }));
    if (!detail) return { row };
    row.detail = detailPath(row.id!);
    return { row, detail: { ...detail, id: row.id! } };
  }

  return {
    tag(name: string, a: Attrs, selfClosing: boolean) {
      if (name === 'Record') {
        const t = shortType(a.type || ''), day = (a.startDate || '').slice(0, 10);
        if (!day) return;
        const v0 = parseFloat(a.value || '0');
        if (distS[t]) distS[t]!.push(hkDate(a.startDate!), toKm(v0, a.unit), hkDate(a.endDate || a.startDate!), a.sourceName || '?');
        if (H_BYSRC[t]) {
          const [key, conv] = H_BYSRC[t]!;
          const k = `${day}|${key}`, src = a.sourceName || '?';
          const per = (bySrc[k] = bySrc[k] || {});
          per[src] = (per[src] || 0) + convert(v0, conv, a.unit);
        } else if (H_SUM[t]) {
          const k = `${day}|${H_SUM[t]}`;
          sums[k] = (sums[k] || 0) + v0;
        } else if (H_MEAN[t]) {
          const [key, conv] = H_MEAN[t]!;
          const k = `${day}|${key}`;
          (means[k] = means[k] || []).push(convert(v0, conv, a.unit));
        } else if (t === 'HeartRate') {
          (hr[day] = hr[day] || []).push(v0);
          hrS.push(hkDate(a.startDate!), v0);
        } else if (t === 'AppleStandHour') {
          if (a.value === 'HKCategoryValueAppleStandHourStood') standHours[day] = (standHours[day] || 0) + 1;
        } else if (t === 'MindfulSession') {
          const k = `${day}|mindfulMin`;
          sums[k] = (sums[k] || 0) + (hkDate(a.endDate!) - hkDate(a.startDate!)) / 6e4;
        } else if (t === 'SleepAnalysis') {
          const src = a.sourceName || '?';
          const s0 = hkDate(a.startDate!), e0 = hkDate(a.endDate!);
          if (ASLEEP.has(a.value || '')) (sleep[src] = sleep[src] || []).push([s0, e0, a.endDate!.slice(0, 10), a.startDate!, a.endDate!]);
          const stage = STAGES[a.value || ''];
          if (stage) {
            const per = (stages[src] = stages[src] || {});
            (per[stage] = per[stage] || []).push([s0, e0]);
          }
        }
      } else if (name === 'Workout') {
        endWorkout();
        wk = { a, stats: {}, meta: {} };
        if (selfClosing) endWorkout();
      } else if (name === 'WorkoutStatistics' && wk) {
        wk.stats[shortType(a.type || '')] = a;
      } else if (name === 'MetadataEntry' && wk && !inRoute && a.key) {
        wk.meta[a.key] = a.value || '';
      } else if (name === 'WorkoutRoute' && wk) {
        inRoute = !selfClosing;
      } else if (name === 'FileReference' && wk && a.path) {
        wk.routePath = a.path;
      }
    },
    endRoute() { inRoute = false; },
    endWorkout,
    /** Collects the points of one workout-routes/*.gpx file; `path` as in the export's FileReference. */
    routeFeeder(path: string) {
      const pts: RawRoutePoint[] = [];
      routes.set(path, pts);
      return gpxFeeder(p => pts.push(p));
    },
    finish(): HealthImport {
      endWorkout();
      const days: Record<string, HealthDay> = {};
      const put = (k: string, v: number) => {
        const [d, key] = k.split('|') as [string, string];
        (days[d] = days[d] || {})[key] = v;
      };
      for (const [k, per] of Object.entries(bySrc)) {
        const v = Math.max(...Object.values(per));
        put(k, BYSRC_2DP.has(k.split('|')[1]!) ? r2(v) : Math.round(v));
      }
      for (const [k, v] of Object.entries(sums)) put(k, Math.round(v));
      for (const [k, vs] of Object.entries(means)) put(k, r1(mean(vs)));
      for (const [d, vs] of Object.entries(hr)) {
        put(`${d}|hrAvg`, Math.round(mean(vs)));
        put(`${d}|hrMin`, Math.round(Math.min(...vs)));
        put(`${d}|hrMax`, Math.round(Math.max(...vs)));
      }
      for (const [d, n] of Object.entries(standHours)) put(`${d}|standHours`, n);
      const srcs = Object.keys(sleep);
      if (srcs.length) {
        const best = srcs.sort((a, b) => sleep[b]!.length - sleep[a]!.length)[0]!;
        const nights: { start: number; end: number; day: string; mins: number; startStr: string; endStr: string }[] = [];
        for (const [st, en, endDay, startStr, endStr] of mergeSleep(sleep[best]!)) {
          const n = nights[nights.length - 1];
          if (n && st - n.end < 3 * 3600e3) { n.end = en; n.day = endDay; n.mins += (en - st) / 6e4; n.endStr = endStr; }
          else nights.push({ start: st, end: en, day: endDay, mins: (en - st) / 6e4, startStr, endStr });
        }
        const stageSpans = Object.entries(stages[best] || {}).map(([k, iv]) => [k, mergeSpans(iv)] as const).sort(([a], [b]) => (a < b ? -1 : 1));
        for (const n of nights) if (n.mins >= 60) {
          const d = (days[n.day] = days[n.day] || {});
          d.sleepH = r2((d.sleepH || 0) + n.mins / 60);
          for (const [key, spans] of stageSpans) {
            const mins = spans.reduce((s, [a, b]) => s + Math.max(0, Math.min(b, n.end) - Math.max(a, n.start)) / 6e4, 0);
            if (mins > 0) d[key] = r2((d[key] || 0) + mins / 60);
          }
          if (d.sleepStartMin == null) d.sleepStartMin = clockMin(n.startStr, n.day);
          d.sleepEndMin = clockMin(n.endStr, n.day);
        }
      }
      const hrSorted = hrS.sorted();
      const distSorted = Object.fromEntries(Object.entries(distS).map(([k, v]) => [k, v.sorted()]));
      const workouts: HealthWorkout[] = [];
      const details: Record<string, WorkoutDetail> = {};
      for (const w of rawWorkouts) {
        const { row, detail } = buildWorkout(w, hrSorted, distSorted);
        workouts.push(row);
        if (detail) details[detail.id] = detail;
      }
      return { days, workouts, details };
    },
  };
}

/** Feeds XML text in arbitrary chunks into the accumulator. */
export function xmlFeeder(acc: ReturnType<typeof healthAccumulator>) {
  let buf = '';
  const re = /<(Record|Workout|WorkoutStatistics|MetadataEntry|WorkoutRoute|FileReference)\s([^>]*?)(\/?)>|<\/Workout>|<\/WorkoutRoute>/g;
  return (text: string) => {
    buf += text;
    const cut = buf.lastIndexOf('>') + 1;
    if (!cut) return;
    const chunk = buf.slice(0, cut);
    buf = buf.slice(cut);
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(chunk))) {
      if (m[0] === '</Workout>') acc.endWorkout();
      else if (m[0] === '</WorkoutRoute>') acc.endRoute();
      else acc.tag(m[1]!, attrs(m[2]!), m[3] === '/');
    }
  };
}

/** Streams an export.zip or export.xml and returns the summary. Runs in a worker or in tests. */
export async function importHealthStream(
  stream: ReadableStream<Uint8Array>,
  opts: { size: number; zip: boolean; onProgress?: (p: number) => void } & ImportOptions,
): Promise<HealthImport> {
  const acc = healthAccumulator(opts);
  const feed = xmlFeeder(acc);
  const dec = new TextDecoder();
  const reader = stream.getReader();
  const progress = opts.onProgress ?? (() => {});
  let read = 0;
  if (opts.zip) {
    let found = false, failed: Error | null = null, done = false, routesOpen = 0;
    const uz = new Unzip();
    uz.register(UnzipInflate);
    uz.onfile = f => {
      const gpx = /(\/workout-routes\/[^/]+\.gpx)$/.exec(f.name);
      if (gpx && opts.routes !== false) {
        const feedGpx = acc.routeFeeder(gpx[1]!), gdec = new TextDecoder();
        routesOpen++;
        f.ondata = (err, chunk, final) => {
          if (err) { failed = err; return; }
          feedGpx(gdec.decode(chunk, { stream: !final }));
          if (final) routesOpen--;
        };
        f.start();
        return;
      }
      if (!/(^|\/)export\.xml$/.test(f.name)) return;
      found = true;
      f.ondata = (err, chunk, final) => {
        if (err) { failed = err; return; }
        feed(dec.decode(chunk, { stream: !final }));
        if (final) done = true;
      };
      f.start();
    };
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) { uz.push(new Uint8Array(0), true); break; }
      read += value.length;
      progress(read / opts.size);
      uz.push(value, false);
      if (failed) throw failed;
    }
    if (failed) throw failed;
    if (!found) throw new Error('No export.xml inside this zip. Use the zip from “Export All Health Data”.');
    if (!done || routesOpen) throw new Error('The zip ended early. Export again and retry.');
  } else {
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) { feed(dec.decode()); break; }
      read += value.length;
      progress(read / opts.size);
      feed(dec.decode(value, { stream: true }));
    }
  }
  return acc.finish();
}

export const isZipFile = (f: { name: string; type: string }) => /\.zip$/i.test(f.name) || f.type.includes('zip');
