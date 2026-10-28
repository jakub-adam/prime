import { describe, expect, it } from 'vitest';
import { RUN_START, syntheticExport, syntheticRun } from '../../tests/fixtures/health/synthetic-export';
import { importHealthStream } from './health-import';
import { applyOps } from './ops';
import { syntheticWorkout } from './synthetic';
import type { HealthWorkout } from './types';
import {
  analyzeWorkout, cumDist, decodePolyline, encodePolyline, hkTime, hrAtPace, idOf, isoUtc, mergeWorkouts, paceSeries, trimRoute, workoutId,
} from './workout';

/* Today's run: 28 Oct, 09:49:46 (+0100, after the clocks went back), 2.54 km, ~17.2 min, avg HR 175. */
const START = RUN_START;
const run = syntheticRun();
const exportZip = () => syntheticExport();
function streamOf(bytes: Uint8Array, chunk = 4096) {
  let i = 0;
  return new ReadableStream<Uint8Array>({ pull(c) { if (i >= bytes.length) return c.close(); c.enqueue(bytes.subarray(i, i + chunk)); i += chunk; } });
}

describe('workout ids and dedupe', () => {
  it('builds the id from type and the UTC start', () => {
    expect(workoutId('Running', hkTime(START))).toBe('Running_20261028T084946Z');
    expect(isoUtc(hkTime('2026-10-12 11:11:41 +0200'))).toBe('2026-10-12T09:11:41Z');
  });

  it('the 12 Oct run exported at +0100 and +0200 is one row, newest wins, extra keys survive', () => {
    const a = { type: 'Running', start: '2026-10-12 10:11:41 +0100', durationMin: 6.8, distanceKm: 1.14, activeKcal: 79, avgHr: null };
    const b = { ...a, start: '2026-10-12 11:11:41 +0200', note: 'from another tool' };
    const walk = { type: 'Walking', start: '2026-10-27 17:55:20 +0100', durationMin: 33.8, distanceKm: 2.78, activeKcal: 318, avgHr: 142 };
    const out = mergeWorkouts([a, b, walk]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'Running_20261012T091141Z', start: '2026-10-12 11:11:41 +0200', note: 'from another tool' });
    // re-importing with the richer row keeps the note and adds the new fields
    const again = mergeWorkouts(out, [{ ...a, id: idOf(a), maxHr: 181 } as HealthWorkout]);
    expect(again).toHaveLength(2);
    expect(again[0]).toMatchObject({ note: 'from another tool', maxHr: 181, start: a.start });
  });

  it('the health op merges by id and keeps every day and other workouts', () => {
    const d = {
      days: { '2026-10-12': { steps: 5 }, '2026-10-28': { steps: 9 } },
      workouts: [
        { type: 'Running', start: '2026-10-12 10:11:41 +0100', durationMin: 6.8, distanceKm: 1.14, activeKcal: 79, avgHr: null },
        { type: 'Running', start: '2026-10-12 11:11:41 +0200', durationMin: 6.8, distanceKm: 1.14, activeKcal: 79, avgHr: null },
        { type: 'Running', start: START, durationMin: 17.2, distanceKm: 2.54, activeKcal: 197, avgHr: 175 },
      ],
      importedAt: 'x',
    } as Record<string, unknown>;
    applyOps(d, [{ t: 'health', days: { '2026-10-28': { steps: 10 } }, workouts: [{ type: 'Running', start: START, durationMin: 17.2, distanceKm: 2.54, activeKcal: 197, avgHr: 175, id: 'Running_20261028T084946Z', maxHr: 190 }], at: 'y' }]);
    const ws = d.workouts as HealthWorkout[];
    expect(ws.map(w => w.id)).toEqual(['Running_20261012T091141Z', 'Running_20261028T084946Z']);
    expect(ws[1]!.maxHr).toBe(190);
    expect(d.days).toEqual({ '2026-10-12': { steps: 5 }, '2026-10-28': { steps: 10 } });
  });
});

describe('route helpers', () => {
  it('polyline round trip', () => {
    const pts = [{ lat: 48.21052, lng: 16.40051 }, { lat: 48.21049, lng: 16.401 }, { lat: 48.2, lng: 16.39 }];
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts);
  });
  it('privacy trim drops the first and last 200 m, and everything on short routes', () => {
    const pts = run.route!;
    const cd = cumDist(pts), total = cd[cd.length - 1]!;
    const kept = trimRoute(pts, 200);
    const kd = cumDist(pts.slice(0, pts.indexOf(kept[0]!) + 1));
    expect(kd[kd.length - 1]).toBeGreaterThanOrEqual(200);
    expect(kept.length).toBeLessThan(pts.length);
    expect(cd[pts.indexOf(kept[kept.length - 1]!)]).toBeLessThanOrEqual(total - 200);
    expect(trimRoute(pts.slice(0, 60), 200)).toEqual([]);
    expect(trimRoute(pts, 0)).toBe(pts);
  });
});

describe('today’s run through the full importer', () => {
  it('has splits, HR series, zones, recovery and a route', async () => {
    const zip = exportZip();
    const res = await importHealthStream(streamOf(zip), { size: zip.length, zip: true, maxHr: 202 });
    expect(res.workouts).toHaveLength(1);
    const w = res.workouts[0]!;
    expect(w).toMatchObject({
      id: 'Running_20261028T084946Z', type: 'Running', start: START, durationMin: 17.2, durationSec: 1032,
      distanceKm: 2.54, activeKcal: 197, avgHr: 175, elevationGainM: 12.1, avgCadence: 164, avgPaceSecPerKm: 406,
      endTime: '2026-10-28T09:06:58Z', hrZonesMaxHr: 202, detail: 'workouts/Running_20261028T084946Z.json', timeZone: 'Europe/Bratislava',
    });
    // 2 whole km and the partial 0.54 km; watch distance only (the phone's 2.31 km is ignored)
    expect(w.splits!.map(s => s.km)).toEqual([1, 2, 2.54]);
    expect(w.splits!.reduce((s, x) => s + x.durationSec, 0)).toBeGreaterThan(1020);
    for (const s of w.splits!) expect(s).toEqual({ km: s.km, durationSec: expect.any(Number), paceSecPerKm: expect.any(Number), avgHr: expect.any(Number), maxHr: expect.any(Number) });
    expect(w.maxHr).toBeGreaterThan(175);
    const z = w.hrZones!;
    expect(z.z1 + z.z2 + z.z3 + z.z4 + z.z5).toBeGreaterThan(1020);
    expect(z.z4).toBeGreaterThan(z.z2); // 175 bpm is 87 % of 202
    expect(w.recoveryHr!.after1Min).toBeLessThan(w.maxHr!);
    expect(w.recoveryHr!.after2Min).toBeLessThan(w.recoveryHr!.after1Min!);
    expect(w.bestEfforts!['1k']).toBeLessThan(w.splits![1]!.durationSec + 30);
    expect(w.bestEfforts!['3k']).toBeUndefined();
    expect(decodePolyline(w.routePreview!).length).toBe(48);

    const d = res.details[w.id!]!;
    expect(d.hrSeries.length).toBeGreaterThan(95); // one point per 10 s
    expect(d.hrSeries[1]!.tSec - d.hrSeries[0]!.tSec).toBe(10);
    expect(d.distSeries.at(-1)!.km).toBeCloseTo(2.54, 1);
    expect(d.route!.length).toBeGreaterThan(200);
    expect(d.route!.length).toBeLessThan(300); // ~1 point per 4 s from 1 Hz GPS
    expect(d.route![0]).toEqual({ lat: expect.any(Number), lng: expect.any(Number), tSec: 0, ele: expect.any(Number) });
    expect(JSON.stringify(d).length).toBeLessThan(30000);
    expect(JSON.stringify(w).length).toBeLessThan(2500);

    const ps = paceSeries(d.distSeries).filter(p => p.pace != null);
    expect(ps.length).toBeGreaterThan(90);
  });

  it('routes are left out when the setting is off', async () => {
    const zip = exportZip();
    const res = await importHealthStream(streamOf(zip), { size: zip.length, zip: true, routes: false });
    expect(res.workouts[0]!.routePreview).toBeUndefined();
    expect(res.details[res.workouts[0]!.id!]!.route).toBeUndefined();
    expect(res.workouts[0]!.splits).toHaveLength(3);
  });
});

describe('HR at easy pace', () => {
  it('averages the buckets near the target pace', () => {
    const a = analyzeWorkout(syntheticWorkout({ startMs: 0, km: 6, sec: 6 * 390, avgHr: 150 }));
    expect(a.paceHr!.length).toBeGreaterThan(2);
    const r = hrAtPace(a.paceHr, 390)!;
    expect(r.bpm).toBeGreaterThan(140);
    expect(r.bpm).toBeLessThan(162);
    expect(hrAtPace(a.paceHr, 250)).toBeNull();
  });
  it('treadmill: no route, still splits from the watch distance', () => {
    const a = analyzeWorkout(syntheticWorkout({ startMs: 0, km: 3, sec: 1100, avgHr: 160, indoor: true }));
    expect(a.routePreview).toBeUndefined();
    expect(a.series!.route).toBeUndefined();
    expect(a.splits).toHaveLength(3);
    expect(a.bestEfforts!['3k']).toBeGreaterThan(1000);
  });
});
