import { describe, expect, it } from 'vitest';
import {
  allActivities, dayTotals, draftToSession, e1rm, fmtDur, goals, newDraft, parseDur, prFlags, recentSessionNames,
  riegel10k, rollingAvg, tenKProjection, weekStrip, weightSeries, presentMetrics,
} from './calc';
import { CSV_DATASETS, toCsv } from './csv';
import { stressFor, stressLevel, withStress } from './calc';
import { addDays, mondayOf } from './dates';
import { defaults } from './ops';
import type { Session } from './types';

const sess = (id: string, date: string, name: string, kg: number, reps: number): Session =>
  ({ id, date, name, exercises: [{ name: 'Bench press', kind: 'weight', sets: [{ kg, reps }] }] });

describe('formulas', () => {
  it('Epley e1RM', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 5)).toBeCloseTo(116.667, 3);
  });
  it('Riegel 10 km projection', () => {
    expect(riegel10k(1500, 5)).toBeCloseTo(1500 * Math.pow(2, 1.06), 6);
    expect(fmtDur(riegel10k(22 * 60, 5))).toBe('45:52');
  });
  it('durations', () => {
    expect(parseDur('25:30')).toBe(1530);
    expect(parseDur('1:02:03')).toBe(3723);
    expect(parseDur('30')).toBe(1800);
    expect(parseDur('x')).toBeNull();
    expect(fmtDur(3723)).toBe('1:02:03');
  });
  it('7-day weight average uses the last 7 calendar days', () => {
    const s = [{ date: '2026-10-10', kg: 90 }, { date: '2026-10-18', kg: 86 }, { date: '2026-10-25', kg: 85 }];
    expect(rollingAvg(s, '2026-10-25')).toBe(85);
    expect(rollingAvg(s, '2026-10-24')).toBe(86);
  });
  it('goal defaults', () => {
    expect(goals(defaults().settings)).toEqual({ kcal: 2350, protein: 160, goalWeight: 79, tenKGoalMin: 45, stepsGoal: 8000, sleepGoalH: 7 });
  });
});

describe('data helpers', () => {
  it('logged weigh-ins win over Apple Health on the same day', () => {
    const d = defaults();
    d.health.days = { '2026-10-01': { weightKg: 88 }, '2026-10-02': { weightKg: 87.5 } };
    d.body.weighins = [{ id: 'w', date: '2026-10-02', kg: 87 }];
    expect(weightSeries(d)).toEqual([
      { date: '2026-10-01', kg: 88, src: 'Apple Health' },
      { date: '2026-10-02', kg: 87, src: 'Logged', id: 'w' },
    ]);
  });
  it('day totals', () => {
    const meals = [{ id: 'a', date: 'd', meal: 'x', kcal: 500, protein: 40 }, { id: 'b', date: 'd', meal: 'y', kcal: 250, protein: 20.5 }];
    expect(dayTotals(meals, 'd')).toMatchObject({ kcal: 750, protein: 60.5, n: 2, carbs: null, fat: null });
    const withMacros = [{ id: 'a', date: 'd', meal: 'x', kcal: 500, protein: 40, carbs: 50, fat: 10.5 }, { id: 'b', date: 'd', meal: 'y', kcal: 250, protein: 20, carbs: 20 }];
    expect(dayTotals(withMacros, 'd')).toMatchObject({ carbs: 70, fat: 10.5, sugar: null });
  });
  it('PR flags mark sessions that beat the previous best', () => {
    const s = [sess('1', '2026-10-01', 'Upper A', 80, 8), sess('2', '2026-10-08', 'Upper A', 82.5, 8), sess('3', '2026-10-15', 'Upper A', 80, 8)];
    expect([...prFlags(s)]).toEqual(['2|bench press']);
  });
  it('workout picker lists recent names first; drafts prefill from the last session of that name', () => {
    const s = [sess('1', '2026-10-01', 'Upper A', 80, 8), sess('2', '2026-10-08', 'Lower A', 100, 5)];
    expect(recentSessionNames(s)).toEqual(['Lower A', 'Upper A']);
    const d = newDraft(s, 'Upper A', '2026-10-25');
    expect(d.exercises.map(e => [e.name, e.sets.length])).toEqual([['Bench press', 1]]);
    expect(newDraft(s, '', '2026-10-25').exercises).toEqual([]);
  });
  it('draftToSession drops empty sets and validates', () => {
    const d = newDraft([], 'X', '2026-10-25');
    expect(draftToSession(d, () => 'id')).toBe('Fill in at least one set.');
    d.exercises.push({ name: 'Dips', kind: 'bw', sets: [{ reps: '10', kg: '', sec: '' }, { reps: '', kg: '', sec: '' }] });
    expect(draftToSession(d, () => 'abc')).toEqual({ id: '2026-10-25_abc', date: '2026-10-25', name: 'X', notes: '', exercises: [{ name: 'Dips', kind: 'bw', sets: [{ reps: 10 }] }] });
  });
});

describe('activities and the week strip', () => {
  const d = defaults();
  d.activities.activities = [{ id: 'r1', date: '2026-10-21', type: 'Run', distanceKm: 5.2, durationSec: 1900 }];
  d.health.workouts = [
    { type: 'Running', start: '2026-10-21 07:00:00 +0200', durationMin: 31.5, distanceKm: 5.18, activeKcal: 400, avgHr: 158 },
    { type: 'Walking', start: '2026-10-22 18:00:00 +0200', durationMin: 40, distanceKm: 3.1, activeKcal: 150, avgHr: 100 },
    { type: 'Running', start: '2026-10-22 07:00:00 +0200', durationMin: 25, distanceKm: 4, activeKcal: 300, avgHr: 150 },
  ];
  d.training.sessions = [sess('s1', '2026-10-20', 'Lower A', 100, 5)];

  it('merges the same run from both sources', () => {
    const acts = allActivities(d);
    expect(acts.map(a => a.id)).toEqual(['w2026-10-22 18:00:00 +0200', 'w2026-10-22 07:00:00 +0200', 'r1']);
    const r1 = acts.find(a => a.id === 'r1')!;
    expect(r1.merged).toBe(true);
    expect(r1.avgHr).toBe(158);
  });
  it('builds Monday–Sunday from real data only', () => {
    const today = '2026-10-23';
    const wk = weekStrip(d, mondayOf(today), today);
    expect(wk.map(x => x.date)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(wk.map(x => x.state)).toEqual(['rest', 'logged', 'logged', 'logged', 'empty', 'empty', 'empty']);
    expect(wk[1]!.items.map(i => i.label)).toEqual(['Lower A']);
    expect(wk[2]!.items.map(i => i.label)).toEqual(['Run 5.2 km']);
    expect(wk[3]!.items.map(i => i.label)).toEqual(['Walk 3.1 km', 'Run 4.0 km']);
    expect(wk[4]!.isToday).toBe(true);
  });
  it('10 km projection uses the best run of 2 km+ in the last 6 weeks', () => {
    const p = tenKProjection(allActivities(d), '2026-10-25');
    expect(p?.from.id).toBe('r1');
    expect(tenKProjection(allActivities(d), addDays('2026-10-25', 60))).toBeNull();
  });
  it('lists only health metrics that have data', () => {
    expect(presentMetrics({ a: { steps: 1, hrv: 50 }, b: { vo2max: 40 } })).toEqual(['steps', 'hrv', 'vo2max']);
  });
});

describe('csv', () => {
  it('escapes cells', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], [null, 3]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n,3\r\n');
  });
  it('flattens training sets', () => {
    const d = defaults();
    d.training.sessions = [sess('s', '2026-10-01', 'U', 80, 8)];
    expect(CSV_DATASETS.find(x => x.key === 'sets')!.build(d)).toContain('s,2026-10-01,U,Bench press,weight,1,8,80,');
  });
});

describe('stress estimate', () => {
  const days: Record<string, { hrv?: number; restingHr?: number }> = {};
  for (let i = 1; i <= 14; i++) days[`2026-10-${String(i).padStart(2, '0')}`] = { hrv: i % 2 ? 50 : 60, restingHr: i % 2 ? 60 : 64 };
  it('is 50 on a normal day and rises with low HRV and high resting HR', () => {
    expect(stressFor({ ...days, '2026-10-15': { hrv: 55, restingHr: 62 } }, '2026-10-15')!.score).toBe(50);
    const bad = stressFor({ ...days, '2026-10-15': { hrv: 40, restingHr: 70 } }, '2026-10-15')!;
    expect(bad.score).toBeGreaterThan(80);
    expect(bad.hrv!.z).toBeLessThan(0);
    expect(stressLevel(bad.score)).toBe('high');
    const good = stressFor({ ...days, '2026-10-15': { hrv: 70, restingHr: 56 } }, '2026-10-15')!;
    expect(good.score).toBeLessThan(20);
  });
  it('needs a baseline of 5 earlier days and works with one signal', () => {
    expect(stressFor(days, '2026-10-03')).toBeNull();
    expect(stressFor({ ...days, '2026-10-15': { restingHr: 62 } }, '2026-10-15')!.hrv).toBeNull();
  });
  it('adds stress without changing the input', () => {
    const copy = JSON.parse(JSON.stringify(days));
    const out = withStress(days);
    expect(days).toEqual(copy);
    expect(out['2026-10-14']!.stress).toBeTypeOf('number');
    expect(out['2026-10-02']!.stress).toBeUndefined();
  });
});
