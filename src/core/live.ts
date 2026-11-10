/* Live Apple Health data from the iPhone Shortcut.
   The Shortcut runs when Prime is opened and writes inbox/health_<date>[_HHMMSS].json to the data
   repo. Most values are the raw samples of the day joined by newlines (e.g. steps per interval), so
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

export type LiveDay = {
  /** day the values belong to (YYYY-MM-DD) */
  date: string;
  /** when the Shortcut exported them (ISO) */
  at: string;
  /** inbox file they came from */
  file: string;
  day: HealthDay;
};

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

  // Sleep: stage names and durations come as two parallel lists.
  const stages = String(t.sleep ?? '').split(/\r?\n/);
  const durs = String(t.sleep_duration ?? '').split(/\r?\n/);
  if (t.sleep_duration && stages.length === durs.length) {
    const h: Record<string, number> = {};
    stages.forEach((s, i) => {
      const k = stageKey(s);
      const sec = durationSec(durs[i]!);
      if (k && sec != null) h[k] = (h[k] ?? 0) + sec / 3600;
    });
    for (const k of ['sleepCoreH', 'sleepDeepH', 'sleepRemH', 'sleepAwakeH'] as const) if (h[k]) put(k, r(h[k], 2));
    const asleep = (h.sleepCoreH ?? 0) + (h.sleepDeepH ?? 0) + (h.sleepRemH ?? 0) + (h.asleep ?? 0);
    if (asleep > 0) put('sleepH', r(asleep, 2));
  }

  if (!Object.keys(day).length) return null;
  return { date, at: typeof x.exported_at === 'string' ? x.exported_at : '', file, day };
}

/** health.json days with the live day laid over its date. When health.json was imported after the
    Shortcut ran (a full Apple Health export), its values win and the live ones only fill gaps. */
export function mergeLive(days: Record<string, HealthDay>, live: LiveDay | null, importedAt?: string): Record<string, HealthDay> {
  if (!live) return days;
  const base = days[live.date] ?? {};
  const importNewer = !!importedAt && !!live.at && Date.parse(importedAt) > Date.parse(live.at);
  return { ...days, [live.date]: importNewer ? { ...live.day, ...base } : { ...base, ...live.day } };
}
