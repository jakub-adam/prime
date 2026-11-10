import { describe, expect, it } from 'vitest';
import { durationSec, lastNight, latestInboxFile, mergeLive, numbers, parseShortcutExport, shortcutDate, type ShortcutExport } from './live';

/* Same shape as the Shortcut writes to inbox/ (synthetic values). */
const EXPORT: ShortcutExport = {
  exported_at: '2026-11-10T13:25:52+01:00',
  vo2max: '39.2',
  weight_kg: '83',
  workouts: '8.5\n2.5',
  today: {
    date: '2026-11-10',
    steps: '80\n540\n178\n8',
    distance_km: '0.06306000000000006\n0.5825399999999999\n0.16726',
    flights: '1\n1\n3',
    active_kcal: '',
    resting_kcal: '',
    exercise_min: '',
    heart_rate: '62\n71\n95',
    resting_hr_bpm: '',
    hrv_ms: '41',
    walking_hr_avg: '',
    respiratory_rate: '',
    blood_oxygen: '0.97\n0.99',
    sleep: 'Core\nDeep\nCore\nAwake\nREM\nIn Bed',
    sleep_duration: '28:02\n30\n1:00:00\n2:30\n29:32\n8:00:00',
  },
};

describe('Shortcut inbox', () => {
  it('picks the newest export and ignores other files', () => {
    expect(latestInboxFile(['health_test.json', 'health_2026-11-10.json', 'health_2026-11-10_131537.json', 'health_2026-11-09_235959.json', 'notes.md']))
      .toBe('health_2026-11-10_131537.json');
    expect(latestInboxFile(['health_test.json'])).toBeNull();
    expect(latestInboxFile(['health_2026-11-10_131537.json', 'latest.json'])).toBe('latest.json');
  });

  it('reads newline lists and durations', () => {
    expect(numbers('1\n2,5\n\nx')).toEqual([1, 2.5]);
    expect(durationSec('30')).toBe(30);
    expect(durationSec('28:02')).toBe(28 * 60 + 2);
    expect(durationSec('1:05:05')).toBe(3905);
    expect(durationSec('1 hr 5 min')).toBe(3900);
    expect(durationSec('')).toBeNull();
  });

  it('turns an export into a health day', () => {
    const live = parseShortcutExport(EXPORT, 'health_2026-11-10_132552.json')!;
    expect(live.date).toBe('2026-11-10');
    expect(live.at).toBe('2026-11-10T13:25:52+01:00');
    const d = live.day;
    expect(d.steps).toBe(806);
    expect(d.distanceKm).toBe(0.81);
    expect(d.flights).toBe(5);
    expect(d.hrAvg).toBe(76);
    expect(d.hrMin).toBe(62);
    expect(d.hrMax).toBe(95);
    expect(d.hrv).toBe(41);
    expect(d.spo2).toBe(98);
    expect(d.vo2max).toBe(39.2);
    expect(d.weightKg).toBeUndefined(); // latest weigh-in, not today's
    // empty lists stay out instead of becoming 0
    expect(d.activeKcal).toBeUndefined();
    expect(d.restingHr).toBeUndefined();
    // sleep: Core 28:02 + 1:00:00, Deep 0:30, REM 29:32, Awake 2:30; In Bed is not sleep
    expect(d.sleepCoreH).toBeCloseTo(1.47, 2);
    expect(d.sleepRemH).toBeCloseTo(0.49, 2);
    expect(d.sleepAwakeH).toBeCloseTo(0.04, 2);
    expect(d.sleepH).toBeCloseTo((28 * 60 + 2 + 30 + 3600 + 29 * 60 + 32) / 3600, 2);
  });

  it('counts only last night when the export reaches back several nights', () => {
    const live = parseShortcutExport({
      ...EXPORT,
      today: {
        ...EXPORT.today,
        // night 8-9 Nov (1 h Core), then night 9-10 Nov (2 h Core + 30 min REM)
        sleep: 'Core\nCore\nREM',
        sleep_duration: '1:00:00\n2:00:00\n30:00',
        sleep_start: '8 Nov 2026 at 23:00\n9 Nov 2026 at 23:00\n10 Nov 2026 at 01:00',
      },
    }, 'latest.json')!;
    expect(live.day.sleepCoreH).toBe(2);
    expect(live.day.sleepRemH).toBe(0.5);
    expect(live.day.sleepH).toBe(2.5);
  });

  it('reads Shortcut dates and falls back when start times are missing', () => {
    expect(new Date(shortcutDate('9 Nov 2026 at 22:48')!).getHours()).toBe(22);
    expect(new Date(shortcutDate('Nov 9, 2026 at 10:48 PM')!).getHours()).toBe(22);
    expect(shortcutDate('Core')).toBeNull();
    expect(lastNight(['Core', 'Deep'], ['1:00', '2:00'], '2026-11-10')).toBeNull();
  });

  it('takes the date from the export when the file is latest.json', () => {
    expect(parseShortcutExport(EXPORT, 'latest.json')?.date).toBe('2026-11-10');
    expect(parseShortcutExport({ ...EXPORT, today: { ...EXPORT.today, date: undefined } }, 'latest.json')).toBeNull();
  });

  it('returns null for the test export', () => {
    expect(parseShortcutExport({ message: 'hi', exported_at: 'x' } as ShortcutExport, 'health_test.json')).toBeNull();
  });

  it('lays live values over health.json unless a full import is newer', () => {
    const live = parseShortcutExport(EXPORT, 'health_2026-11-10_132552.json')!;
    const days = { '2026-11-09': { steps: 9000 }, '2026-11-10': { steps: 300, restingHr: 55 } };
    const merged = mergeLive(days, live, '2026-11-09T20:00:00Z');
    expect(merged['2026-11-10']).toMatchObject({ steps: 806, restingHr: 55 });
    expect(merged['2026-11-09']).toEqual({ steps: 9000 });
    expect(days['2026-11-10'].steps).toBe(300); // input untouched
    const newer = mergeLive(days, live, '2026-11-10T20:00:00Z');
    expect(newer['2026-11-10']).toMatchObject({ steps: 300, restingHr: 55, hrv: 41 });
  });
});
