import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useGoals, useHealthDays } from '@/app/store';
import { NotFound } from '@/app/NotFound';
import { avg, healthDays, METRIC_ORDER, METRICS, metricSeries, rolling, stdev, STRESS_LABEL, stressFor, stressLevel, type MetricKey } from '@/core/calc';
import type { ChartColor } from '@/components/charts';
import { addDays, daysBetween, fmtDay, fmtShort, mondayOf } from '@/core/dates';
import { Legend, TimeChart } from '@/components/charts';
import { EmptyState, KV, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/misc';
import { cn, fmt } from '@/lib/utils';

type Range = '7' | '30' | '90' | 'all';

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

export function MetricPage() {
  const { key } = useParams();
  const g = useGoals();
  const [range, setRange] = useState<Range>('30');
  const isKey = (k: string | undefined): k is MetricKey => !!k && (METRIC_ORDER as string[]).includes(k);
  const days = useHealthDays();
  const k = isKey(key) ? key : null;
  const all = useMemo(() => (k ? healthDays(days).filter(d => days[d]?.[k] != null) : []), [days, k]);
  if (!k) return <NotFound />;
  const def = METRICS[k];
  const lastDay = all[all.length - 1];
  const firstDay = all[0];
  const goal = k === 'steps' ? g.stepsGoal : k === 'sleepH' ? g.sleepGoalH : null;
  const f = (v: number | null | undefined) => fmt(v, def.dp);
  const unitStr = def.unit === 'steps' || def.unit === 'score' ? '' : ` ${def.unit}`;
  const avgColor: ChartColor = k === 'stress' ? 'good' : def.chart === 'bar' ? 'track' : def.color;

  if (!lastDay) {
    return (
      <div>
        <PageHeader back="/move" kicker="Apple Health" title={def.label} />
        <Card><CardBody className="pt-4"><EmptyState title={`No ${def.label.toLowerCase()} data yet`} action={<Button asChild variant="primary" size="sm"><Link to="/settings">Import Apple Health</Link></Button>}>{def.blurb}</EmptyState></CardBody></Card>
      </div>
    );
  }

  const n = range === 'all' ? Math.max(7, daysBetween(firstDay!, lastDay) + 1) : +range;
  const from = addDays(lastDay, -(n - 1));
  const series = metricSeries(days, k, from, lastDay);
  const roll = rolling(metricSeries(days, k, addDays(from, -6), lastDay), 7).slice(6);
  const rows = series.map((p, i) => ({ date: p.date, v: p.v, avg: roll[i]?.v != null ? Math.round(roll[i]!.v! * 10 ** def.dp) / 10 ** def.dp : null }));
  const vals = series.map(p => p.v).filter((v): v is number => v != null);
  const a = avg(vals);
  const prevSeries = metricSeries(days, k, addDays(from, -n), addDays(from, -1)).map(p => p.v);
  const prevAvg = avg(prevSeries);
  const best = vals.length ? series.filter(p => p.v != null).reduce((x, y) => ((def.higherIsBetter === false ? y.v! < x.v! : y.v! > x.v!) ? y : x)) : null;
  const worst = vals.length ? series.filter(p => p.v != null).reduce((x, y) => ((def.higherIsBetter === false ? y.v! > x.v! : y.v! < x.v!) ? y : x)) : null;
  const hit = goal != null ? vals.filter(v => v >= goal).length : null;
  const sd = stdev(vals);
  const trendGood = a != null && prevAvg != null && def.higherIsBetter != null ? (a > prevAvg) === def.higherIsBetter : null;

  // Weekly averages (newest first)
  const weeks: { start: string; avg: number | null; n: number }[] = [];
  for (const d of all) {
    const m = mondayOf(d);
    let w = weeks.find(x => x.start === m);
    if (!w) { w = { start: m, avg: null, n: 0 }; weeks.push(w); }
  }
  for (const w of weeks) {
    const vs = all.filter(d => mondayOf(d) === w.start).map(d => days[d]![k]!);
    w.avg = avg(vs); w.n = vs.length;
  }
  weeks.sort((x, y) => (x.start < y.start ? 1 : -1));

  return (
    <div>
      <PageHeader back="/move" kicker="Apple Health" title={def.label}
        actions={<Segmented label="Range" value={range} onChange={setRange} options={[['7', '7d'], ['30', '30d'], ['90', '90d'], ['all', 'All']]} />} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-12">
          <KV k={`${range === 'all' ? 'All-time' : `${n}-day`} avg`} v={f(a)} sub={prevAvg != null && a != null ? <span className={cn(trendGood === true && 'text-good', trendGood === false && 'text-bad')}>{a - prevAvg >= 0 ? '+' : '−'}{fmt(Math.abs(a - prevAvg), def.dp)} vs previous {n} days</span> : def.unit} />
          {goal != null ? (
            <KV k="Goal" v={f(goal)} sub={`${hit}/${vals.length} days hit`} />
          ) : (
            <KV k="Latest" v={f(days[lastDay]![k])} sub={fmtShort(lastDay)} />
          )}
          <KV k={def.higherIsBetter === false ? 'Lowest' : 'Best day'} v={best ? f(best.v) : '–'} sub={best ? fmtDay(best.date) : ''} />
          {k === 'sleepH' ? (
            <KV k="Consistency" v={sd != null ? `±${fmt(sd, 1)}` : '–'} sub="h std. deviation (lower is steadier)" />
          ) : (
            <KV k={def.higherIsBetter === false ? 'Highest' : 'Worst day'} v={worst ? f(worst.v) : '–'} sub={worst ? fmtDay(worst.date) : ''} />
          )}
        </div>
        <Card className="lg:col-span-8">
          <CardHeader title={`${def.label} per day`} meta={`${fmtShort(from)} – ${fmtShort(lastDay)}${def.unit ? ` · ${def.unit}` : ''}`} />
          <CardBody>
            <TimeChart
              data={rows}
              height={320}
              zero={def.chart === 'bar'}
              maxY={k === 'stress' ? 100 : undefined}
              goal={goal != null ? { value: goal, label: k === 'sleepH' ? `${fmt(goal, 1)} h target` : `Goal ${fmt(goal)}` } : null}
              series={[
                def.chart === 'bar'
                  ? { key: 'v', label: def.label, kind: 'bar', color: def.color, format: v => k === 'stress' ? `${f(v)} · ${STRESS_LABEL[stressLevel(v)]}` : `${f(v)}${unitStr}`, colorAt: k === 'stress' ? stressColor : goal != null ? v => (v >= goal ? def.color : 'muted') : undefined }
                  : { key: 'v', label: def.label, kind: 'dots', color: def.color, format: v => `${f(v)}${unitStr}` },
                { key: 'avg', label: '7-day avg', kind: 'line', color: avgColor, format: v => `${f(v)}${unitStr}` },
              ]}
              yFormat={k === 'steps' ? v => (v >= 1000 ? `${v / 1000}k` : String(v)) : undefined}
              ariaLabel={`${def.label} per day with 7-day average`}
            />
            <div className="mt-3">
              <Legend items={[
                { label: k === 'stress' ? 'Low' : def.chart === 'bar' ? (goal != null ? 'Day (grey = under goal)' : 'Day') : 'Day', color: k === 'stress' ? 'lane' : def.color, kind: def.chart === 'bar' ? 'bar' : 'dot' },
                ...(k === 'stress' ? [{ label: 'Moderate', color: 'muted' as const, kind: 'bar' as const }, { label: 'High', color: 'track' as const, kind: 'bar' as const }] : []),
                { label: '7-day average', color: avgColor, kind: 'line' },
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
        <nav aria-label="Other metrics" className="lg:col-span-12">
          <div className="flex flex-wrap gap-2">
            {METRIC_ORDER.filter(m => m !== k && healthDays(days).some(d => days[d]?.[m] != null)).map(m => (
              <Button key={m} asChild variant="secondary" size="sm"><Link to={`/metric/${m}`}>{METRICS[m].label}</Link></Button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
