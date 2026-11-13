/* Live Apple Health data from the iPhone Shortcut.
   The Shortcut runs when Prime is opened and writes inbox/latest.json (older versions wrote
   inbox/health_<date>[_HHMMSS].json) to the data repo. Most values are the raw samples of the day joined by newlines (e.g. steps per interval), so
   they are summed or averaged here. The result is display only: it is merged over that day's
   health.json values in the app and never written back. */
import type { HealthDay } from './types';

export type ShortcutExport = {
  exported_at?: string;
  vo2max?: string | number;
  weight_kg?: string | number;
  today?: Record<string, string | number | null | undefined>;
  [k: string]: unknown;
};

/** One reading and, when the Shortcut sends sample times, when it was taken (ISO). */
export type Reading = { v: number; at?: string };
/** One sample of today's list; `t` (epoch ms) only when the Shortcut sends sample times. */
export type Sample = { v: number; t?: number };

export type LiveDay = {
  /** day the values belong to (YYYY-MM-DD) */
  date: string;
  /** when the Shortcut exported them (ISO) */
  at: string;
  /** inbox file they came from */
  file: string;
  day: HealthDay;
  /** latest value per health.json key: the newest sample for readings (needs sample times), the
      running total as of the export for counted things like steps */
  latest?: Record<string, Reading>;
  /** today's samples per health.json key, for the hourly view */
  series?: Record<string, Sample[]>;
};

/* Sample lists in the export: field, health.json key, how the day value is built, decimals.
   Sample times come as a parallel list in "<field>_at" (same date formats as sleep_start). */
const SAMPLED: [string, string, 'sum' | 'mean', number][] = [
  ['steps', 'steps', 'sum', 0], ['distance_km', 'distanceKm', 'sum', 2], ['flights', 'flights', 'sum', 0],
  ['active_kcal', 'activeKcal', 'sum', 0], ['resting_kcal', 'basalKcal', 'sum', 0], ['exercise_min', 'exerciseMin', 'sum', 0],
  ['heart_rate', 'hrAvg', 'mean', 0], ['resting_hr_bpm', 'restingHr', 'mean', 0], ['walking_hr_avg', 'walkingHr', 'mean', 0],
  ['hrv_ms', 'hrv', 'mean', 0], ['respiratory_rate', 'respiratoryRate', 'mean', 1], ['blood_oxygen', 'spo2', 'mean', 0],
];
const MAX_SAMPLES = 720;

/** Latest readings and today's samples from the export's lists. */
export function parseSamples(t: Record<string, string | number | null | undefined>, exportedAt: string) {
  const latest: Record<string, Reading> = {}, series: Record<string, Sample[]> = {};
  for (const [field, key, mode, dp] of SAMPLED) {
    const vals = numbers(t[field]).map(v => (key === 'spo2' && v <= 1 ? v * 100 : v));
    if (!vals.length) continue;
    const times = String(t[field + '_at'] ?? '').split(/\r?\n/).filter(s => s.trim()).map(shortcutDate);
    const timed = times.length === vals.length && times.every(x => x != null);
    const samples: Sample[] = vals.map((v, i) => (timed ? { v, t: times[i]! } : { v }));
    if (timed) samples.sort((a, b) => a.t! - b.t!);
    series[key] = samples.slice(-MAX_SAMPLES);
    if (mode === 'sum') {
      latest[key] = { v: r(total(vals), dp)!, ...(exportedAt ? { at: exportedAt } : {}) };
    } else if (timed) {
      const last = samples[samples.length - 1]!;
      latest[key] = { v: r(last.v, dp)!, at: new Date(last.t!).toISOString() };
    }
    // Readings without sample times have no known order, so no "latest" is claimed for them.
  }
  return { latest, series };
}

export const INBOX_DIR = 'inbox';
const INBOX_FILE = /^health_(\d{4}-\d{2}-\d{2})(?:_(\d{2})(\d{2})(\d{2}))?\.json$/;

/** The Shortcut can also overwrite one file instead of adding a new one each time. */
export const LATEST_FILE = 'latest.json';

/** The newest Shortcut export among inbox file names, or null: latest.json when it exists, else the
    newest dated file. Test and other files are ignored. */
export function latestInboxFile(names: string[]) {
  if (names.includes(LATEST_FILE)) return LATEST_FILE;
  return names.filter(n => INBOX_FILE.test(n)).sort().pop() ?? null;
}

/** Numbers in a Shortcut value: one per line, decimal comma allowed. */
export function numbers(v: unknown): number[] {
  if (typeof v === 'number') return Number.isFinite(v) ? [v] : [];
  return String(v ?? '')
    .split(/\r?\n/)
    .map(s => parseFloat(s.trim().replace(/\s/g, '').replace(',', '.')))
    .filter(Number.isFinite);
}

/** Shortcut durations: "30" (s), "28:02" (min:s), "1:05:05" (h:min:s), or "1 hr 5 min" style. Seconds. */
export function durationSec(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d+(:\d{1,2}){0,2}$/.test(t)) return t.split(':').reduce((n, p) => n * 60 + Number(p), 0);
  let sec = 0, hit = false;
  for (const m of t.matchAll(/([\d.,]+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b/gi)) {
    const n = parseFloat(m[1]!.replace(',', '.'));
    const u = m[2]!.toLowerCase();
    sec += u.startsWith('h') ? n * 3600 : u.startsWith('m') ? n * 60 : n;
    hit = true;
  }
  return hit ? sec : null;
}

const total = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) : null);
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r = (n: number | null, dp = 0) => (n == null ? null : Math.round(n * 10 ** dp) / 10 ** dp);

/** Sleep stage name from the Shortcut ("Core", "Deep", "REM", "Awake", "Asleep", "In Bed") to a health.json key. */
function stageKey(name: string): 'sleepCoreH' | 'sleepDeepH' | 'sleepRemH' | 'sleepAwakeH' | 'asleep' | null {
  const n = name.trim().toLowerCase();
  if (n.startsWith('core') || n === 'light') return 'sleepCoreH';
  if (n.startsWith('deep')) return 'sleepDeepH';
  if (n.startsWith('rem')) return 'sleepRemH';
  if (n.startsWith('awake')) return 'sleepAwakeH';
  if (n.startsWith('asleep') || n === 'unspecified') return 'asleep';
  return null; // "In Bed" is not sleep
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Shortcut date text such as "9 Nov 2026 at 22:48", "Nov 9, 2026 at 10:48 PM" or ISO, as local
    epoch milliseconds, or null. */
export function shortcutDate(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) { const v = Date.parse(t); return Number.isFinite(v) ? v : null; }
  const dm = /(\d{1,2})\.?\s+([A-Za-z]{3})[A-Za-z]*\.?,?\s+(\d{4})/.exec(t);
  const md = dm ? null : /([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(t);
  const day = dm ? +dm[1]! : md ? +md[2]! : NaN;
  const mon = MONTHS.indexOf((dm ? dm[2]! : md ? md[1]! : '').toLowerCase());
  const year = dm ? +dm[3]! : md ? +md[3]! : NaN;
  if (!Number.isFinite(day) || mon < 0 || !Number.isFinite(year)) return null;
  const tm = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/.exec(t.slice((dm ?? md)!.index + (dm ?? md)![0].length));
  let hh = tm ? +tm[1]! : 0;
  const ap = tm?.[4]?.toLowerCase();
  if (ap === 'pm' && hh < 12) hh += 12;
  if (ap === 'am' && hh === 12) hh = 0;
  return new Date(year, mon, day, hh, tm ? +tm[2]! : 0, tm?.[3] ? +tm[3] : 0).getTime();
}

const ymd = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Indexes of the sleep samples that make up the night ending on `date`: samples are grouped into
    sessions split by gaps over 3 h, and the last session that ends on `date` is kept. Null when the
    start times are missing or unreadable, so the caller falls back to counting every sample. */
export function lastNight(starts: string[], durs: string[], date: string): Set<number> | null {
  if (starts.length !== durs.length) return null;
  const rows: { i: number; a: number; b: number }[] = [];
  for (let i = 0; i < starts.length; i++) {
    const a = shortcutDate(starts[i]!);
    const sec = durationSec(durs[i]!);
    if (a == null || sec == null) return null;
    rows.push({ i, a, b: a + sec * 1000 });
  }
  if (!rows.length) return null;
  rows.sort((x, y) => x.a - y.a);
  const sessions: (typeof rows)[] = [];
  let end = -Infinity;
  for (const row of rows) {
    if (row.a - end > 3 * 3600 * 1000) sessions.push([]);
    sessions[sessions.length - 1]!.push(row);
    end = Math.max(end, row.b);
  }
  const night = sessions.reverse().find(ss => ymd(Math.max(...ss.map(x => x.b))) === date);
  return new Set((night ?? []).map(x => x.i));
}

/** Turns one Shortcut export into a health.json style day. Keys without data are left out. */
export function parseShortcutExport(x: ShortcutExport, file = ''): LiveDay | null {
  const t = x.today ?? {};
  const date = typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : INBOX_FILE.exec(file)?.[1];
  if (!date) return null;
  const day: HealthDay = {};
  const put = (k: string, v: number | null) => { if (v != null && Number.isFinite(v)) day[k] = v; };

  put('steps', r(total(numbers(t.steps))));
  put('distanceKm', r(total(numbers(t.distance_km)), 2));
  put('flights', r(total(numbers(t.flights))));
  put('activeKcal', r(total(numbers(t.active_kcal))));
  put('basalKcal', r(total(numbers(t.resting_kcal))));
  put('exerciseMin', r(total(numbers(t.exercise_min))));

  const hr = numbers(t.heart_rate);
  if (hr.length) {
    put('hrAvg', r(mean(hr)));
    put('hrMin', Math.round(Math.min(...hr)));
    put('hrMax', Math.round(Math.max(...hr)));
  }
  put('restingHr', r(mean(numbers(t.resting_hr_bpm))));
  put('walkingHr', r(mean(numbers(t.walking_hr_avg))));
  put('hrv', r(mean(numbers(t.hrv_ms))));
  put('respiratoryRate', r(mean(numbers(t.respiratory_rate)), 1));
  const spo2 = mean(numbers(t.blood_oxygen));
  put('spo2', spo2 == null ? null : r(spo2 <= 1 ? spo2 * 100 : spo2));
  put('vo2max', r(mean(numbers(x.vo2max ?? t.vo2max)), 1));
  // weight_kg is the latest weigh-in, which may be days old: it is not credited to today, or every
  // export would add a weigh-in. Weight comes from logged weigh-ins and full imports.

  // Sleep: stage names, durations and (optionally) start times come as parallel lists. The export
  // reaches back two days, so with start times only last night's samples are counted.
  const stages = String(t.sleep ?? '').split(/\r?\n/);
  const durs = String(t.sleep_duration ?? '').split(/\r?\n/);
  if (t.sleep_duration && stages.length === durs.length) {
    const h: Record<string, number> = {};
    const keep = lastNight(String(t.sleep_start ?? '').split(/\r?\n/), durs, date);
    stages.forEach((s, i) => {
      if (keep && !keep.has(i)) return;
      const k = stageKey(s);
      const sec = durationSec(durs[i]!);
      if (k && sec != null) h[k] = (h[k] ?? 0) + sec / 3600;
    });
    for (const k of ['sleepCoreH', 'sleepDeepH', 'sleepRemH', 'sleepAwakeH'] as const) if (h[k]) put(k, r(h[k], 2));
    const asleep = (h.sleepCoreH ?? 0) + (h.sleepDeepH ?? 0) + (h.sleepRemH ?? 0) + (h.asleep ?? 0);
    if (asleep > 0) put('sleepH', r(asleep, 2));
  }

  if (!Object.keys(day).length) return null;
  const at = typeof x.exported_at === 'string' ? x.exported_at : '';
  return { date, at, file, day, ...parseSamples(t, at) };
}

/** health.json days with the live day laid over its date. When health.json was imported after the
    Shortcut ran (a full Apple Health export), its values win and the live ones only fill gaps. */
export function mergeLive(days: Record<string, HealthDay>, live: LiveDay | null, importedAt?: string): Record<string, HealthDay> {
  if (!live) return days;
  const base = days[live.date] ?? {};
  const importNewer = !!importedAt && !!live.at && Date.parse(importedAt) > Date.parse(live.at);
  return { ...days, [live.date]: importNewer ? { ...live.day, ...base } : { ...base, ...live.day } };
}
