/* Apple Health export → daily totals and workouts. Same rules as tools/import_health.py:
   steps and distance take the larger source per day (iPhone and Watch overlap), active energy and
   exercise minutes are summed, heart metrics are daily means, sleep uses the source with the most
   records, merges overlaps and credits each night (gaps under 3 h join) to the wake-up day. */
import { Unzip, UnzipInflate } from 'fflate';
import type { HealthDay, HealthWorkout } from './types';

const ASLEEP = new Set([
  'HKCategoryValueSleepAnalysisAsleepUnspecified', 'HKCategoryValueSleepAnalysisAsleepCore', 'HKCategoryValueSleepAnalysisAsleepDeep',
  'HKCategoryValueSleepAnalysisAsleepREM', 'HKCategoryValueSleepAnalysisAsleep',
]);
const H_BYSRC: Record<string, string> = { StepCount: 'steps', DistanceWalkingRunning: 'distanceKm' };
const H_SUM: Record<string, string> = { ActiveEnergyBurned: 'activeKcal', AppleExerciseTime: 'exerciseMin' };
const H_MEAN: Record<string, string> = { RestingHeartRate: 'restingHr', HeartRateVariabilitySDNN: 'hrv', WalkingHeartRateAverage: 'walkingHr', VO2Max: 'vo2max', BodyMass: 'weightKg' };
const shortType = (t: string) => t.replace(/^HK(QuantityTypeIdentifier|CategoryTypeIdentifier|DataType)/, '');
const toKm = (v: number, u?: string) => (u === 'mi' ? v * 1.609344 : u === 'm' ? v / 1000 : v);
const hkDate = (s: string) => Date.parse(`${s.slice(0, 10)}T${s.slice(11, 19)}${s.slice(20, 23)}:${s.slice(23, 25)}`);
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

type Attrs = Record<string, string>;
export function attrs(str: string): Attrs {
  const o: Attrs = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str))) o[m[1]!] = m[2]!.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return o;
}

export type HealthImport = { days: Record<string, HealthDay>; workouts: HealthWorkout[] };

export function healthAccumulator() {
  const bySrc: Record<string, Record<string, number>> = {};
  const sums: Record<string, number> = {};
  const means: Record<string, number[]> = {};
  const sleep: Record<string, [number, number, string][]> = {};
  const workouts: HealthWorkout[] = [];
  let wk: { a: Attrs; stats: Record<string, Attrs> } | null = null;

  const endWorkout = () => {
    if (!wk) return;
    const st = wk.stats, dist = st.DistanceWalkingRunning, en = st.ActiveEnergyBurned, hr = st.HeartRate;
    let dur = parseFloat(wk.a.duration || '0');
    if (wk.a.durationUnit === 's') dur /= 60;
    workouts.push({
      type: (wk.a.workoutActivityType || '').replace('HKWorkoutActivityType', ''),
      start: wk.a.startDate || '',
      durationMin: Math.round(dur * 10) / 10,
      distanceKm: dist && dist.sum ? Math.round(toKm(+dist.sum, dist.unit) * 100) / 100 : null,
      activeKcal: en && en.sum ? Math.round(+en.sum) : null,
      avgHr: hr && hr.average ? Math.round(+hr.average) : null,
    });
    wk = null;
  };

  return {
    tag(name: string, a: Attrs, selfClosing: boolean) {
      if (name === 'Record') {
        const t = shortType(a.type || ''), day = (a.startDate || '').slice(0, 10);
        if (!day) return;
        if (H_BYSRC[t]) {
          let v = parseFloat(a.value || '0');
          if (t === 'DistanceWalkingRunning') v = toKm(v, a.unit);
          const k = `${day}|${H_BYSRC[t]}`, src = a.sourceName || '?';
          const per = (bySrc[k] = bySrc[k] || {});
          per[src] = (per[src] || 0) + v;
        } else if (H_SUM[t]) {
          const k = `${day}|${H_SUM[t]}`;
          sums[k] = (sums[k] || 0) + parseFloat(a.value || '0');
        } else if (H_MEAN[t]) {
          const k = `${day}|${H_MEAN[t]}`;
          (means[k] = means[k] || []).push(parseFloat(a.value || '0'));
        } else if (t === 'SleepAnalysis' && ASLEEP.has(a.value || '')) {
          const src = a.sourceName || '?';
          (sleep[src] = sleep[src] || []).push([hkDate(a.startDate!), hkDate(a.endDate!), a.endDate!.slice(0, 10)]);
        }
      } else if (name === 'Workout') {
        endWorkout();
        wk = { a, stats: {} };
        if (selfClosing) endWorkout();
      } else if (name === 'WorkoutStatistics' && wk) {
        wk.stats[shortType(a.type || '')] = a;
      }
    },
    endWorkout,
    finish(): HealthImport {
      endWorkout();
      const days: Record<string, HealthDay> = {};
      const put = (k: string, v: number) => {
        const [d, key] = k.split('|') as [string, string];
        (days[d] = days[d] || {})[key] = v;
      };
      for (const [k, per] of Object.entries(bySrc)) {
        const v = Math.max(...Object.values(per));
        put(k, k.endsWith('distanceKm') ? Math.round(v * 100) / 100 : Math.round(v));
      }
      for (const [k, v] of Object.entries(sums)) put(k, Math.round(v));
      for (const [k, vs] of Object.entries(means)) put(k, Math.round(mean(vs) * 10) / 10);
      const srcs = Object.keys(sleep);
      if (srcs.length) {
        const best = srcs.sort((a, b) => sleep[b]!.length - sleep[a]!.length)[0]!;
        const iv = sleep[best]!.sort((a, b) => a[0] - b[0]);
        const merged: [number, number, string][] = [];
        for (const x of iv) {
          const l = merged[merged.length - 1];
          if (l && x[0] <= l[1]) {
            if (x[1] > l[1]) { l[1] = x[1]; l[2] = x[2]; }
          } else merged.push([...x]);
        }
        const nights: { end: number; day: string; mins: number }[] = [];
        for (const [st, en, endDay] of merged) {
          const n = nights[nights.length - 1];
          if (n && st - n.end < 3 * 3600e3) { n.end = en; n.day = endDay; n.mins += (en - st) / 6e4; }
          else nights.push({ end: en, day: endDay, mins: (en - st) / 6e4 });
        }
        for (const n of nights) if (n.mins >= 60) {
          const d = (days[n.day] = days[n.day] || {});
          d.sleepH = Math.round(((d.sleepH || 0) + n.mins / 60) * 100) / 100;
        }
      }
      return { days, workouts };
    },
  };
}

/** Feeds XML text in arbitrary chunks into the accumulator. */
export function xmlFeeder(acc: ReturnType<typeof healthAccumulator>) {
  let buf = '';
  const re = /<(Record|Workout|WorkoutStatistics)\s([^>]*?)(\/?)>|<\/Workout>/g;
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
      else acc.tag(m[1]!, attrs(m[2]!), m[3] === '/');
    }
  };
}

/** Streams an export.zip or export.xml and returns the summary. Runs in a worker or in tests. */
export async function importHealthStream(
  stream: ReadableStream<Uint8Array>,
  opts: { size: number; zip: boolean; onProgress?: (p: number) => void },
): Promise<HealthImport> {
  const acc = healthAccumulator();
  const feed = xmlFeeder(acc);
  const dec = new TextDecoder();
  const reader = stream.getReader();
  const progress = opts.onProgress ?? (() => {});
  let read = 0;
  if (opts.zip) {
    let found = false, failed: Error | null = null, done = false;
    const uz = new Unzip();
    uz.register(UnzipInflate);
    uz.onfile = f => {
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
    if (!done) throw new Error('The zip ended early. Export again and retry.');
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
