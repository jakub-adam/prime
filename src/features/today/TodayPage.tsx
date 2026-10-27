import { Dumbbell, Footprints, HeartPulse, Play, Plus, Timer, UtensilsCrossed } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useData, useDraft, useGoals, useHealthDays, useToday } from '@/app/store';
import {
  activityLabel, allActivities, avg, byDateDesc, dayTotals, fmtDur, lastNDays, mealsOn, METRICS, metricSeries, presentMetrics,
  rollingAvg, sessionSets, STRESS_LABEL, stressLevel, tenKProjection, weightSeries, type MetricKey,
} from '@/core/calc';
import { addDays, fmtLong, fmtRelative, fmtShort } from '@/core/dates';
import { Legend, Sparkline, TimeChart } from '@/components/charts';
import { EmptyState, Meter, PageHeader, RowLink, StatTile } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useIsDesktop } from '@/components/ui/sheet';
import { WeekStrip } from '@/components/WeekStrip';
import { MealSheet } from '@/features/food/MealSheet';
import { metricHref, shortLabel } from '@/features/health/health-ui';
import { StartWorkoutSheet } from '@/features/train/StartWorkoutSheet';
import { cn, fmt, signed } from '@/lib/utils';

/** Health metrics shown on Today, in order, when they have data. */
const TODAY_METRICS: MetricKey[] = ['stress', 'restingHr', 'hrv', 'activeKcal', 'spo2', 'respiratoryRate'];

export function useMetricTile(key: MetricKey) {
  const days = useHealthDays();
  return useMemo(() => {
    const def = METRICS[key];
    const { last, values } = lastNDays(days, key, 7);
    const a = avg(values);
    const spark = last ? metricSeries(days, key, addDays(last, -13), last).map(p => p.v) : [];
    return { def, last, avg: a, spark };
  }, [days, key]);
}

export function MetricTile({ k, className }: { k: MetricKey; className?: string }) {
  const t = useMetricTile(k);
  return (
    <StatTile
      to={metricHref(k)}
      label={shortLabel(k)}
      value={t.avg == null ? '–' : fmt(t.avg, t.def.dp)}
      unit={t.def.unit === 'steps' || t.def.unit === 'score' ? undefined : t.def.unit}
      sub={t.last ? `${k === 'stress' && t.avg != null ? `${STRESS_LABEL[stressLevel(t.avg)]} · ` : ''}7-day avg · to ${fmtShort(t.last)}` : 'Import Apple Health'}
      chart={<Sparkline values={t.spark} color={k === 'stress' ? 'track' : t.def.category} kind={t.def.chart === 'bar' ? 'bar' : 'line'} className="h-7 w-full" />}
      className={className}
    />
  );
}

export function WeightTile({ className }: { className?: string }) {
  const data = useData();
  const today = useToday();
  const ws = useMemo(() => weightSeries(data), [data]);
  const now = rollingAvg(ws, today), prev = rollingAvg(ws, addDays(today, -7));
  const spark = ws.slice(-14).map(p => p.kg);
  return (
    <StatTile
      to="/health/weight"
      label="Weight"
      value={now ? fmt(now, 1) : '–'}
      unit="kg"
      sub={now && prev ? `${signed(now - prev)} kg vs last week` : ws.length ? '7-day average' : 'Log a weigh-in'}
      tone={now && prev ? (now - prev <= 0 ? 'good' : 'bad') : null}
      chart={<Sparkline values={spark} color="lane" className="h-7 w-full" />}
      className={className}
    />
  );
}

function FuelCard({ className }: { className?: string }) {
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const [adding, setAdding] = useState(false);
  const tot = dayTotals(data.food.meals, today);
  const meals = mealsOn(data.food.meals, today);
  return (
    <Card className={className} aria-labelledby="fuel-h">
      <CardHeader id="fuel-h" title="Fuel" meta={`${tot.n} ${tot.n === 1 ? 'meal' : 'meals'} logged today`}
        action={<Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus /> Log meal</Button>} />
      <CardBody className="space-y-1">
        <Meter label="Calories" value={tot.kcal} target={g.kcal} unit="kcal" color="track" to="/food/trends" />
        <Meter label="Protein" value={tot.protein} target={g.protein} unit="g" color="lane" to="/food/trends" />
        {meals.length ? (
          <ul className="mt-2 divide-y divide-line border-t border-line">
            {meals.map(m => (
              <li key={m.id}>
                <RowLink to={`/food/meal/${encodeURIComponent(m.id)}`} className="-mx-2 rounded-lg">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 font-semibold">{m.meal}{m.time ? <span className="text-[13px] font-normal text-muted">{m.time}</span> : null}</div>
                    <div className="truncate text-[13px] text-muted">{m.items}</div>
                  </div>
                  <div className="text-right">
                    <div className="num text-lg leading-none font-semibold text-track-ink">{fmt(+m.kcal)}<span className="ml-0.5 font-sans text-xs font-medium text-muted">kcal</span></div>
                    <div className="text-[13px] text-lane-ink">{fmt(+m.protein)} g</div>
                  </div>
                </RowLink>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState className="mt-3 py-6" icon={<UtensilsCrossed />} title="No meals yet today" action={<Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus /> Log your first meal</Button>}>
            Log meals here, or tell Claude in the meal chat and the bedtime task fills them in.
          </EmptyState>
        )}
      </CardBody>
      <MealSheet open={adding} onOpenChange={setAdding} date={today} />
    </Card>
  );
}

function WeekCard({ className }: { className?: string }) {
  const [picking, setPicking] = useState(false);
  const draft = useDraft();
  return (
    <Card className={cn('flex flex-col', className)} aria-labelledby="week-h">
      <CardHeader id="week-h" title="This week" action={
        draft
          ? <Button asChild variant="lane" size="sm"><Link to="/train/log"><Play /> Resume workout</Link></Button>
          : <Button variant="lane" size="sm" onClick={() => setPicking(true)}><Play /> Start workout</Button>
      } />
      <CardBody className="flex-1"><WeekStrip /></CardBody>
      <StartWorkoutSheet open={picking} onOpenChange={setPicking} />
    </Card>
  );
}

function TrendCard({ title, to, children, meta, className }: { title: string; to: string; children: ReactNode; meta?: ReactNode; className?: string }) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title={<Link to={to} className="hover:underline hover:underline-offset-4">{title}</Link>} meta={meta}
        action={<Button asChild variant="ghost" size="sm" className="-mr-2 text-lane-ink"><Link to={to}>Details<span className="sr-only"> for {title}</span></Link></Button>} />
      <CardBody className="flex-1 pt-1">{children}</CardBody>
    </Card>
  );
}

function TrendCharts() {
  const nav = useNavigate();
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const ws = useMemo(() => weightSeries(data), [data]);
  const from = addDays(today, -29);
  const weightRows = useMemo(() => {
    const byDay = Object.fromEntries(ws.map(p => [p.date, p.kg]));
    return Array.from({ length: 30 }, (_, i) => {
      const d = addDays(from, i);
      const has = ws.some(p => p.date <= d && p.date > addDays(d, -7));
      return { date: d, kg: byDay[d] ?? null, avg: has ? Math.round(rollingAvg(ws, d)! * 10) / 10 : null };
    });
  }, [ws, from]);
  const days = data.health.days;
  const lastH = Object.keys(days).sort().pop() ?? today;
  const hFrom = addDays(lastH, -13);
  const steps = metricSeries(days, 'steps', hFrom, lastH).map(p => ({ date: p.date, steps: p.v }));
  const sleep = metricSeries(days, 'sleepH', hFrom, lastH).map(p => ({ date: p.date, sleepH: p.v }));
  const now = rollingAvg(ws, today);
  return (
    <>
      <TrendCard title="Weight" to="/health/weight" className="lg:col-span-4" meta={now ? `${fmt(now, 1)} kg avg · ${fmt(Math.max(0, now - g.goalWeight), 1)} kg to ${fmt(g.goalWeight)}` : 'Last 30 days'}>
        <TimeChart data={weightRows} height={190} onSelect={d => nav(`/health/day/${d}`)} ariaLabel="Bodyweight over the last 30 days with 7-day average"
          series={[{ key: 'kg', label: 'Weigh-in', kind: 'dots', color: 'lane', format: v => `${fmt(v, 1)} kg` }, { key: 'avg', label: '7-day avg', kind: 'line', color: 'lane', format: v => `${fmt(v, 1)} kg` }]}
          empty="Log weigh-ins to see your trend." />
        <div className="mt-2"><Legend items={[{ label: 'Weigh-in', color: 'lane', kind: 'dot' }, { label: '7-day average', color: 'lane', kind: 'line' }]} /></div>
      </TrendCard>
      <TrendCard title="Steps" to="/health/metric/steps" className="lg:col-span-4" meta={`Last 14 days · goal ${fmt(g.stepsGoal)}`}>
        <TimeChart data={steps} height={190} zero onSelect={d => nav(`/health/day/${d}`)} ariaLabel="Daily steps for the last 14 days" goal={{ value: g.stepsGoal, label: fmt(g.stepsGoal) }}
          series={[{ key: 'steps', label: 'Steps', kind: 'bar', color: 'lane', format: v => fmt(v), colorAt: v => (v >= g.stepsGoal ? 'lane' : 'muted') }]}
          yFormat={v => (v >= 1000 ? `${v / 1000}k` : String(v))} empty="Import Apple Health to see steps." />
      </TrendCard>
      <TrendCard title="Sleep" to="/health/sleep" className="lg:col-span-4" meta={`Last 14 nights · goal ${fmt(g.sleepGoalH, 1)} h`}>
        <TimeChart data={sleep} height={190} zero onSelect={d => nav(`/health/day/${d}`)} ariaLabel="Nightly sleep for the last 14 nights" goal={{ value: g.sleepGoalH, label: `${fmt(g.sleepGoalH)} h` }}
          series={[{ key: 'sleepH', label: 'Sleep', kind: 'bar', color: 'lane', format: v => `${fmt(v, 1)} h`, colorAt: v => (v >= g.sleepGoalH ? 'lane' : 'muted') }]}
          empty="Import Apple Health to see sleep." />
      </TrendCard>
    </>
  );
}

function RecentWorkouts({ className }: { className?: string }) {
  const data = useData();
  const today = useToday();
  const items = useMemo(() => {
    const s = data.training.sessions.map(x => ({ date: x.date, id: x.id, to: `/train/session/${encodeURIComponent(x.id)}`, title: x.name, sub: `${x.exercises.length} exercises · ${sessionSets(x)} sets`, kind: 'session' as const }));
    const a = allActivities(data).map(x => ({ date: x.date, id: x.id, to: `/health/workout/${encodeURIComponent(x.id)}`, title: activityLabel(x), sub: [fmtDur(x.durationSec), x.source === 'Apple Watch' || x.merged ? 'Apple Watch' : null].filter(Boolean).join(' · '), kind: 'activity' as const }));
    return [...s, ...a].sort(byDateDesc).slice(0, 6);
  }, [data]);
  return (
    <Card className={className}>
      <CardHeader title="Recent workouts" action={<Button asChild variant="ghost" size="sm" className="-mr-2 text-lane-ink"><Link to="/train">All</Link></Button>} />
      <CardBody className="pt-1">
        {items.length ? (
          <ul className="-mx-2 flex flex-col">
            {items.map(i => (
              <li key={i.kind + i.id}>
                <RowLink to={i.to}>
                  <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', i.kind === 'session' ? 'bg-track-soft text-track-ink' : 'bg-lane-soft text-lane-ink')}>
                    {i.kind === 'session' ? <Dumbbell aria-hidden className="size-5" /> : <Footprints aria-hidden className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{i.title}</div>
                    <div className="truncate text-[13px] text-muted">{fmtRelative(i.date, today)} · {i.sub}</div>
                  </div>
                </RowLink>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<Dumbbell />} title="No workouts yet">Start a workout or log a run. They show up here and in the week strip.</EmptyState>}
      </CardBody>
    </Card>
  );
}

function TenKCard({ className }: { className?: string }) {
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const proj = useMemo(() => tenKProjection(allActivities(data), today), [data, today]);
  const goalSec = g.tenKGoalMin * 60;
  const gap = proj ? proj.sec - goalSec : null;
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title="10 km" meta={`Goal ${fmtDur(goalSec)} · ${fmtDur(goalSec / 10)} /km`} />
      <CardBody className="flex flex-1 flex-col pt-2">
        <div className="text-[13px] font-semibold tracking-wide text-muted uppercase">Projected</div>
        <div className="num text-[48px] leading-none font-semibold">{proj ? fmtDur(proj.sec) : '–'}</div>
        {proj && gap != null ? (
          <>
            <div className={cn('mt-1 text-sm font-semibold', gap <= 0 ? 'text-good' : 'text-track-ink')}>
              {gap <= 0 ? `${fmtDur(-gap)} under goal` : `${fmtDur(gap)} to go`}
            </div>
            <div className="lane-track relative mt-3 h-2.5 overflow-hidden rounded-full" aria-hidden>
              <div className="absolute inset-y-0 left-0 rounded-full bg-track" style={{ width: `${Math.max(4, Math.min(100, (goalSec / proj.sec) * 100))}%` }} />
            </div>
            <Link to={`/health/workout/${encodeURIComponent(proj.from.id)}`} className="mt-3 text-[13px] text-muted hover:text-ink hover:underline">
              From {activityLabel(proj.from)} on {fmtShort(proj.from.date)} (Riegel)
            </Link>
          </>
        ) : <p className="mt-2 text-sm text-muted">Log a run of 2 km or more in the last 6 weeks to get a projection.</p>}
        <div className="mt-auto pt-3">
          <Button asChild variant="secondary" size="sm" className="w-full"><Link to="/health/workouts"><Timer /> Runs and pace</Link></Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function TodayPage() {
  const today = useToday();
  const desktop = useIsDesktop();
  const healthDays = useHealthDays();
  const metrics = presentMetrics(healthDays);
  const extra = TODAY_METRICS.filter(k => metrics.includes(k));
  return (
    <div>
      <PageHeader kicker={fmtLong(today)} title="Today" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <FuelCard className="lg:col-span-5 xl:col-span-4" />
        <WeekCard className="lg:col-span-7 xl:col-span-8" />
        {desktop ? <TrendCharts /> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <WeightTile />
            <MetricTile k="steps" />
            <MetricTile k="sleepH" />
            {extra.slice(0, 3).map(k => <MetricTile key={k} k={k} />)}
            <Link to="/health" className="flex min-h-[124px] flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line-strong text-sm font-semibold text-lane-ink hover:bg-surface-2">
              <HeartPulse aria-hidden className="size-6" /> All health data
            </Link>
          </div>
        )}
        <RecentWorkouts className="lg:col-span-6 xl:col-span-5" />
        <TenKCard className="lg:col-span-6 xl:col-span-3" />
        {desktop ? (
          <div className="grid grid-cols-3 content-start gap-3 lg:col-span-12 xl:col-span-4 xl:grid-cols-2">
            {extra.length ? extra.slice(0, 6).map(k => <MetricTile key={k} k={k} />) : (
              <Card className="col-span-2"><CardBody className="pt-4"><EmptyState title="More health metrics" action={<Button asChild size="sm"><Link to="/health">Import Apple Health</Link></Button>}>Resting heart rate, HRV, active energy and more appear here after an Apple Health import.</EmptyState></CardBody></Card>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
