import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useGoals, useHealthDays } from '@/app/store';
import { NotFound } from '@/app/NotFound';
import { avg, CATEGORY, healthDays, isMetricKey, METRICS, metricSeries, rolling, STRESS_LABEL, stressFor, stressLevel } from '@/core/calc';
import { addDays, daysBetween, fmtDay, fmtShort, mondayOf } from '@/core/dates';
import { Legend, TimeChart, type ChartColor, type Series } from '@/components/charts';
import { EmptyState, KV, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/misc';
import { CategoryIcon } from '@/features/health/health-ui';
import { cn, fmt } from '@/lib/utils';

type Range = '7' | '30' | '182' | '365' | 'all';

const stressColor = (v: number): ChartColor => { const l = stressLevel(v); return l === 'high' ? 'track' : l === 'moderate' ? 'muted' : 'lane'; };

function StressDrivers({ date }: { date: string }) {
  const days = useHealthDays();
  const st = stressFor(days, date);
  if (!st) return null;
  const level = stressLevel(st.score);
  const row = (label: string, d: { value: number; mean: number; z: number } | null, unit: string, higherIsStress: boolean) => {
    if (!d) return <li className="flex justify-between gap-4 border-b border-line/70 py-2 text-sm"><span className="text-muted">{label}</span><span className="text-muted">no baseline yet</span></li>;
    const diff = d.value - d.mean;
    const stressful = higherIsStress ? diff > 0 : diff < 0;
    return (
      <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line/70 py-2 text-sm">
        <span className="text-muted">{label}</span>
        <span>
          <span className="num text-lg font-semibold">{fmt(d.value, 0)} {unit}</span>
          <span className={cn('ml-2 font-semibold', Math.abs(d.z) < 0.5 ? 'text-muted' : stressful ? 'text-track-ink' : 'text-good')}>
            {diff >= 0 ? '+' : '−'}{fmt(Math.abs(diff), 0)} vs your usual {fmt(d.mean, 0)}
          </span>
        </span>
      </li>
    );
  };
  return (
    <Card className="lg:col-span-12">
      <CardHeader title="What drives it" meta={`${fmtDay(date)} · score ${st.score}, ${STRESS_LABEL[level].toLowerCase()}`} />
      <CardBody className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ul>
          {row('HRV (lower = more stress)', st.hrv, 'ms', false)}
          {row('Resting heart rate (higher = more stress)', st.restingHr, 'bpm', true)}
        </ul>
        <div className="text-sm text-muted">
          <ul className="mb-3 flex flex-wrap gap-2">
            <li className="rounded-lg bg-lane-soft px-2.5 py-1 font-semibold text-lane-ink">0–35 Low</li>
            <li className="rounded-lg bg-surface-3 px-2.5 py-1 font-semibold text-ink">36–64 Moderate</li>
            <li className="rounded-lg bg-track-soft px-2.5 py-1 font-semibold text-track-ink">65–100 High</li>
          </ul>
          <p>Your usual values are the averages of the previous 4 weeks. Illness, alcohol, poor sleep, hard training and stress all push HRV down and resting HR up, so read a high score as “body under load”, not just mental stress. It is not a medical measurement.</p>
        </div>
      </CardBody>
    </Card>
  );
}

type DailyRow = { date: string; v: number | null; avg: number | null; lo: number | null; hi: number | null };
function weeklyRows(daily: DailyRow[], dp: number) {
  const out: DailyRow[] = [];
  for (const r of daily) {
    const m = mondayOf(r.date);
    if (!out.some(x => x.date === m)) out.push({ date: m, v: null, avg: null, lo: null, hi: null });
  }
  for (const w of out) {
    const inWeek = daily.filter(r => mondayOf(r.date) === w.date);
    const a = avg(inWeek.map(r => r.v));
    w.v = a == null ? null : Math.round(a * 10 ** dp) / 10 ** dp;
    const los = inWeek.map(r => r.lo).filter((x): x is number => x != null);
    const his = inWeek.map(r => r.hi).filter((x): x is number => x != null);
    w.lo = los.length ? Math.min(...los) : null;
    w.hi = his.length ? Math.max(...his) : null;
  }
  return out;
}

export function MetricPage() {
  const { key } = useParams();
  const g = useGoals();
  const [range, setRange] = useState<Range>('30');
  const nav = useNavigate();
  const days = useHealthDays();
  const k = isMetricKey(key) ? key : null;
  const all = useMemo(() => (k ? healthDays(days).filter(d => days[d]?.[k] != null) : []), [days, k]);
  if (!k) return <NotFound />;
  const def = METRICS[k];
  const cat = CATEGORY[def.category];
  const back = def.category === 'sleep' ? '/health/sleep' : `/health/${def.category}`;
  const lastDay = all[all.length - 1];
  const firstDay = all[0];
  const goal = k === 'steps' ? g.stepsGoal : k === 'sleepH' ? g.sleepGoalH : null;
  const f = (v: number | null | undefined) => fmt(v, def.dp);
  const unitStr = def.unit === 'steps' || def.unit === 'score' ? '' : ` ${def.unit}`;
  const color: ChartColor = def.category;
  const avgColor: ChartColor = k === 'stress' ? 'good' : def.chart === 'bar' ? (def.category === 'activity' ? 'lane' : 'track') : color;
  const title = <span className="flex items-center gap-3"><CategoryIcon cat={def.category} size="lg" />{def.label}</span>;

  if (!lastDay) {
    return (
      <div>
        <PageHeader back={back} kicker={cat.label} title={title} />
        <Card><CardBody className="pt-4"><EmptyState title={`No ${def.label.toLowerCase()} data yet`} action={<Button asChild variant="primary" size="sm"><Link to="/health">Import Apple Health</Link></Button>}>{def.blurb}</EmptyState></CardBody></Card>
      </div>
    );
  }

  const n = range === 'all' ? Math.max(7, daysBetween(firstDay!, lastDay) + 1) : +range;
  const weekly = n > 92;
  const from = addDays(lastDay, -(n - 1));
  const series = metricSeries(days, k, from, lastDay);
  const roll = rolling(metricSeries(days, k, addDays(from, -6), lastDay), 7).slice(6);
  const daily: DailyRow[] = series.map((p, i) => ({
    date: p.date,
    v: p.v,
    avg: roll[i]?.v != null ? Math.round(roll[i]!.v! * 10 ** def.dp) / 10 ** def.dp : null,
    lo: days[p.date]?.hrMin ?? null,
    hi: days[p.date]?.hrMax ?? null,
  }));
  const rows = weekly ? weeklyRows(daily, def.dp) : daily;
  const vals = series.map(p => p.v).filter((v): v is number => v != null);
  const a = avg(vals);
  const prevAvg = avg(metricSeries(days, k, addDays(from, -n), addDays(from, -1)).map(p => p.v));
  const withV = series.filter(p => p.v != null);
  const better = (x: number, y: number) => (def.higherIsBetter === false ? x < y : x > y);
  const best = withV.length ? withV.reduce((x, y) => (better(y.v!, x.v!) ? y : x)) : null;
  const worst = withV.length ? withV.reduce((x, y) => (better(x.v!, y.v!) ? y : x)) : null;
  const lowest = withV.length ? withV.reduce((x, y) => (y.v! < x.v! ? y : x)) : null;
  const highest = withV.length ? withV.reduce((x, y) => (y.v! > x.v! ? y : x)) : null;
  const hit = goal != null ? vals.filter(v => v >= goal).length : null;
  const trendGood = a != null && prevAvg != null && def.higherIsBetter != null ? (a > prevAvg) === def.higherIsBetter : null;
  const rangeLabel = range === 'all' ? 'All-time' : range === '7' ? 'Week' : range === '30' ? '30-day' : range === '182' ? '6-month' : '1-year';
  const fmtV = (v: number) => (k === 'stress' ? `${f(v)} · ${STRESS_LABEL[stressLevel(v)]}` : `${f(v)}${unitStr}`);

  const weeks: { start: string; avg: number | null; n: number }[] = [];
  for (const d of all) {
    const m = mondayOf(d);
    if (!weeks.some(x => x.start === m)) weeks.push({ start: m, avg: null, n: 0 });
  }
  for (const w of weeks) {
    const vs = all.filter(d => mondayOf(d) === w.start).map(d => days[d]![k]!);
    w.avg = avg(vs);
    w.n = vs.length;
  }
  weeks.sort((x, y) => (x.start < y.start ? 1 : -1));

  const mainSeries: Series[] = def.chart === 'range'
    ? [{ key: 'lo', key2: 'hi', label: 'Range', kind: 'range', color, format: v => `${f(v)} bpm` }, { key: 'v', label: 'Average', kind: 'dots', color: 'ink', format: v => `${f(v)} bpm` }]
    : def.chart === 'bar'
      ? [{ key: 'v', label: weekly ? 'Daily avg' : def.label, kind: 'bar', color, format: fmtV, colorAt: k === 'stress' ? stressColor : goal != null ? v => (v >= goal ? color : 'muted') : undefined }]
      : [{ key: 'v', label: weekly ? 'Weekly avg' : def.label, kind: weekly ? 'line' : 'dots', color, format: fmtV }];
  const avgSeries: Series[] = weekly || def.chart === 'range' ? [] : [{ key: 'avg', label: '7-day avg', kind: 'line', color: avgColor, format: fmtV }];
  const stat = (p: { date: string; v: number | null } | null) => (p ? { v: f(p.v), sub: fmtDay(p.date) } : { v: '–', sub: '' });
  const rangeLow = k === 'hrAvg' ? withV.map(p => ({ date: p.date, v: days[p.date]?.hrMin ?? null })).filter(p => p.v != null).reduce<{ date: string; v: number | null } | null>((x, y) => (!x || y.v! < x.v! ? y : x), null) : null;
  const rangeHigh = k === 'hrAvg' ? withV.map(p => ({ date: p.date, v: days[p.date]?.hrMax ?? null })).filter(p => p.v != null).reduce<{ date: string; v: number | null } | null>((x, y) => (!x || y.v! > x.v! ? y : x), null) : null;
  const third = rangeLow ? { k: 'Lowest', ...stat(rangeLow) } : def.higherIsBetter == null ? { k: 'Lowest', ...stat(lowest) } : { k: def.higherIsBetter ? 'Best day' : 'Lowest', ...stat(best) };
  const fourth = rangeHigh ? { k: 'Highest', ...stat(rangeHigh) } : def.higherIsBetter == null ? { k: 'Highest', ...stat(highest) } : { k: def.higherIsBetter ? 'Lowest day' : 'Highest', ...stat(worst) };

  return (
    <div>
      <PageHeader back={back} kicker={cat.label} title={title}
        actions={<Segmented label="Range" value={range} onChange={setRange} options={[['7', 'W'], ['30', 'M'], ['182', '6M'], ['365', 'Y'], ['all', 'All']]} />} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-12">
          <KV k={`${rangeLabel} avg`} v={f(a)} sub={prevAvg != null && a != null ? <span className={cn(trendGood === true && 'text-good', trendGood === false && 'text-bad')}>{a - prevAvg >= 0 ? '+' : '−'}{fmt(Math.abs(a - prevAvg), def.dp)} vs previous period</span> : unitStr.trim()} />
          {goal != null ? (
            <KV k="Goal" v={f(goal)} sub={`${hit}/${vals.length} days hit`} />
          ) : (
            <KV k="Latest" v={k === 'hrAvg' && days[lastDay]?.hrMin != null ? `${f(days[lastDay]!.hrMin)}–${f(days[lastDay]!.hrMax)}` : f(days[lastDay]![k])} sub={fmtShort(lastDay)} />
          )}
          <KV k={third.k} v={third.v} sub={third.sub} />
          <KV k={fourth.k} v={fourth.v} sub={fourth.sub} />
        </div>
        <Card className="lg:col-span-8">
          <CardHeader title={weekly ? `${def.label} by week` : `${def.label} per day`} meta={`${fmtShort(from)} – ${fmtShort(lastDay)}${def.unit && def.unit !== 'score' ? ` · ${def.unit}` : ''}${weekly ? '' : ' · tap a day for all its stats'}`} />
          <CardBody>
            <TimeChart
              data={rows}
              height={320}
              zero={def.chart === 'bar'}
              maxY={k === 'stress' ? 100 : undefined}
              goal={goal != null ? { value: goal, label: k === 'sleepH' ? `${fmt(goal, 1)} h` : fmt(goal) } : null}
              series={[...mainSeries, ...avgSeries]}
              yFormat={k === 'steps' ? v => (v >= 1000 ? `${v / 1000}k` : String(v)) : undefined}
              ariaLabel={`${def.label} ${weekly ? 'by week' : 'per day'}`}
              onSelect={weekly ? undefined : d => nav(`/health/day/${d}`)}
            />
            <div className="mt-3">
              <Legend items={[
                ...(k === 'stress'
                  ? [{ label: 'Low', color: 'lane' as const, kind: 'bar' as const }, { label: 'Moderate', color: 'muted' as const, kind: 'bar' as const }, { label: 'High', color: 'track' as const, kind: 'bar' as const }]
                  : def.chart === 'range'
                    ? [{ label: 'Daily range', color, kind: 'bar' as const }, { label: 'Average', color: 'ink' as const, kind: 'dot' as const }]
                    : [{ label: weekly ? 'Weekly average of days' : goal != null ? 'Day (grey = under goal)' : 'Day', color, kind: def.chart === 'bar' ? 'bar' as const : 'dot' as const }]),
                ...(avgSeries.length ? [{ label: '7-day average', color: avgColor, kind: 'line' as const }] : []),
                ...(goal != null ? [{ label: 'Goal', color: 'muted' as const, kind: 'dash' as const }] : []),
              ]} />
            </div>
            <p className="mt-3 text-[13px] text-muted">{def.blurb}{goal != null ? ' Change the goal in Settings.' : ''}</p>
          </CardBody>
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader title="By week" meta="Daily average" />
          <CardBody className="pt-2">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[12px] tracking-wide text-muted uppercase">
                  <th scope="col" className="px-1 py-2 font-semibold">Week of</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">Days</th>
                  <th scope="col" className="px-1 py-2 text-right font-semibold">Avg</th>
                </tr>
              </thead>
              <tbody>
                {weeks.slice(0, 10).map(w => (
                  <tr key={w.start} className="border-b border-line/70 last:border-0">
                    <td className="px-1 py-2.5 font-semibold">{fmtShort(w.start)}</td>
                    <td className="num px-1 py-2.5 text-right text-[16px]">{w.n}</td>
                    <td className={cn('num px-1 py-2.5 text-right text-[16px] font-semibold', goal != null && w.avg != null && (w.avg >= goal ? 'text-good' : 'text-muted'))}>{f(w.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
        {k === 'stress' ? <StressDrivers date={lastDay} /> : null}
        <nav aria-label={`More in ${cat.label}`} className="lg:col-span-12">
          <div className="flex flex-wrap gap-2">
            {cat.metrics.filter(m => m !== k && Object.values(days).some(d => d[m] != null)).map(m => (
              <Button key={m} asChild variant="secondary" size="sm"><Link to={m === 'sleepH' ? '/health/sleep' : `/health/metric/${m}`}>{METRICS[m].label}</Link></Button>
            ))}
            <Button asChild variant="ghost" size="sm" className="text-lane-ink"><Link to={back}>All {cat.label}</Link></Button>
          </div>
        </nav>
      </div>
    </div>
  );
}
