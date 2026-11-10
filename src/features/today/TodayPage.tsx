import { ChevronRight, Dumbbell, Footprints, HeartPulse, Moon, Play, Plus, RefreshCw, Timer, UtensilsCrossed } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { followLive, useData, useDraft, useGoals, useHealthDays, useLive, useToday } from '@/app/store';
import {
  activityLabel, allActivities, byDateDesc, dayTotals, fmtDur, mealsOn, metricSeries, presentMetrics,
  rollingAvg, sessionSets, tenKProjection, weightSeries, type MetricKey,
} from '@/core/calc';
import { addDays, fmtLong, fmtRelative, fmtShort } from '@/core/dates';
import type { HealthDay } from '@/core/types';
import { Legend, TimeChart } from '@/components/charts';
import { EmptyState, Meter, PageHeader, RowLink } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useIsDesktop } from '@/components/ui/sheet';
import { WeekStrip } from '@/components/WeekStrip';
import { MealSheet } from '@/features/food/MealSheet';
import { HealthCard, RING_GOALS, Ring, WeightCard } from '@/features/health/health-ui';
import { StageBar } from '@/features/health/SleepPage';
import { StartWorkoutSheet } from '@/features/train/StartWorkoutSheet';
import { cn, fmt } from '@/lib/utils';

/* Today shows each number once: today's activity in the rings, last night in Sleep, the latest
   heart, breathing and body values in the Health grid, food in Fuel. History lives in the trend
   charts and on the detail pages. */

/** Heart, breathing and fitness values shown in the Health grid, in order, when they have data. */
const VITALS: MetricKey[] = ['hrAvg', 'restingHr', 'hrv', 'walkingHr', 'spo2', 'respiratoryRate', 'vo2max', 'stress'];

const timeOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/* ---------- live status ---------- */
function LiveBadge() {
  const { live, checking, connected } = useLive();
  const today = useToday();
  if (!connected) return null;
  const fresh = live?.date === today;
  const label = fresh ? `Live · ${timeOf(live!.at)}` : live ? `Last export ${fmtShort(live.date)}` : 'Waiting for Shortcut';
  return (
    <button
      type="button"
      onClick={followLive}
      title="The Apple Health Shortcut sends new data each time Prime opens. Tap to check now."
      aria-label={`${label}. Check for new Apple Health data`}
      className="inline-flex h-9 items-center gap-2 rounded-full bg-surface px-3.5 text-[13px] font-semibold shadow-card transition-colors hover:bg-surface-2"
    >
      <span aria-hidden className={cn('relative size-2 rounded-full', fresh ? 'bg-good' : 'bg-muted')}>
        {fresh ? <span className="absolute inset-0 animate-ping rounded-full bg-good opacity-60" /> : null}
      </span>
      <span role="status" aria-live="polite">{label}</span>
      <RefreshCw aria-hidden className={cn('size-3.5 text-muted', checking && 'animate-spin')} />
    </button>
  );
}

/* ---------- activity rings ---------- */
function ActivityCard({ day, className }: { day: HealthDay | undefined; className?: string }) {
  const g = useGoals();
  const rings = [
    { label: 'Move', v: day?.activeKcal, goal: RING_GOALS.move, unit: 'kcal', color: 'var(--ring-move)', to: '/health/metric/activeKcal' },
    { label: 'Exercise', v: day?.exerciseMin, goal: RING_GOALS.exercise, unit: 'min', color: 'var(--ring-exercise)', to: '/health/metric/exerciseMin' },
    { label: 'Steps', v: day?.steps, goal: g.stepsGoal, unit: 'steps', color: 'var(--ring-stand)', to: '/health/metric/steps' },
  ];
  const extras = ([
    ['distanceKm', 'Distance', 'km', 2],
    ['flights', 'Flights', 'floors', 0],
    ['basalKcal', 'Resting energy', 'kcal', 0],
  ] as const).filter(([k]) => day?.[k] != null);
  const size = 164, w = 17;
  return (
    <Card className={cn('flex flex-col', className)} aria-labelledby="activity-h">
      <CardHeader id="activity-h" title="Activity" meta={day ? 'Today so far' : 'No Apple Health data yet today'}
        action={<Button asChild variant="ghost" size="sm" className="-mr-2 text-lane-ink"><Link to="/health/activity">Details</Link></Button>} />
      <CardBody className="flex flex-1 flex-col items-center gap-6 sm:flex-row sm:items-center">
        <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} width={size} height={size} role="img" className="shrink-0 [&_circle]:transition-[stroke-dasharray] [&_circle]:duration-700"
          aria-label={rings.map(r => `${r.label} ${r.v == null ? 'no data' : fmt(r.v)} of ${fmt(r.goal)} ${r.unit}`).join(', ')}>
          {rings.map((r, i) => <Ring key={r.label} r={size / 2 - w / 2 - 1 - i * (w + 3)} pct={(r.v ?? 0) / r.goal} color={r.color} w={w} />)}
        </svg>
        <ul className="grid w-full flex-1 gap-1">
          {rings.map(r => (
            <li key={r.label}>
              <Link to={r.to} className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-2">
                <span aria-hidden className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-muted">{r.label}</span>
                  <span className="flex items-baseline gap-1">
                    <span className="num text-[26px] leading-none font-semibold">{r.v == null ? '–' : fmt(r.v)}</span>
                    <span className="text-sm text-muted">/ {fmt(r.goal)} {r.unit}</span>
                  </span>
                </span>
                {r.v != null ? <span className="num text-lg font-semibold text-muted">{Math.round((r.v / r.goal) * 100)}%</span> : null}
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
      {extras.length ? (
        <dl className="grid border-t border-line" style={{ gridTemplateColumns: `repeat(${extras.length}, minmax(0, 1fr))` }}>
          {extras.map(([k, label, unit, dp], i) => (
            <div key={k} className={cn('px-4 py-3 sm:px-5', i > 0 && 'border-l border-line')}>
              <dt className="truncate text-[12px] font-medium text-muted">{label}</dt>
              <dd className="flex items-baseline gap-1"><span className="num text-xl font-semibold">{fmt(day![k], dp)}</span><span className="text-[12px] text-muted">{unit}</span></dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Card>
  );
}

/* ---------- last night ---------- */
function SleepCard({ className }: { className?: string }) {
  const days = useHealthDays();
  const today = useToday();
  const g = useGoals();
  const last = useMemo(() => Object.keys(days).filter(k => days[k]?.sleepH != null).sort().pop(), [days]);
  const d = last ? days[last] : undefined;
  const mins = d?.sleepH != null ? Math.round(d.sleepH * 60) : null;
  const staged = !!d && (d.sleepCoreH != null || d.sleepDeepH != null || d.sleepRemH != null);
  return (
    <Card className={cn('flex flex-col', className)} aria-labelledby="sleep-h">
      <CardHeader id="sleep-h" title="Sleep" meta={last ? (last === today ? 'Last night' : `Latest night: ${fmtRelative(last, today)}`) : 'No sleep data yet'}
        action={<Button asChild variant="ghost" size="sm" className="-mr-2 text-lane-ink"><Link to="/health/sleep">Details</Link></Button>} />
      <CardBody className="flex flex-1 flex-col gap-4">
        {mins != null ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-baseline gap-1">
                <span className="num text-[44px] leading-none font-semibold">{Math.floor(mins / 60)}</span><span className="text-sm text-muted">h</span>
                <span className="num ml-1 text-[44px] leading-none font-semibold">{String(mins % 60).padStart(2, '0')}</span><span className="text-sm text-muted">min</span>
              </div>
              <span className={cn('text-[13px] font-semibold', mins >= g.sleepGoalH * 60 ? 'text-good' : 'text-muted')}>Goal {fmt(g.sleepGoalH, g.sleepGoalH % 1 ? 1 : 0)} h</span>
            </div>
            {staged ? <StageBar d={d!} /> : <p className="text-sm text-muted">No sleep stages for this night.</p>}
          </>
        ) : (
          <EmptyState icon={<Moon />} title="No sleep yet">Wear your Watch to bed. Sleep shows up here after the Shortcut runs in the morning.</EmptyState>
        )}
      </CardBody>
    </Card>
  );
}

/* ---------- heart, breathing, body ---------- */
function HealthGrid({ className }: { className?: string }) {
  const days = useHealthDays();
  const keys = useMemo(() => { const p = presentMetrics(days); return VITALS.filter(k => p.includes(k)); }, [days]);
  return (
    <section aria-labelledby="vitals-h" className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h2 id="vitals-h" className="text-lg font-semibold tracking-tight">Health</h2>
        <Link to="/health" className="text-sm font-semibold text-lane-ink hover:underline hover:underline-offset-4">All health data</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {keys.map(k => <HealthCard key={k} k={k} />)}
        <WeightCard />
        {!keys.length ? (
          <Link to="/health" className="flex min-h-[132px] flex-col items-center justify-center gap-1 rounded-card bg-surface-2 p-4 text-center text-sm font-semibold text-lane-ink hover:bg-surface-3">
            <HeartPulse aria-hidden className="size-6" /> Heart rate, HRV and more appear after the Shortcut runs
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/* ---------- food ---------- */
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

/* ---------- trends (desktop): history only, no repeat of today's numbers ---------- */
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
  const days = useHealthDays();
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
  const lastH = Object.keys(days).sort().pop() ?? today;
  const hFrom = addDays(lastH, -13);
  const steps = metricSeries(days, 'steps', hFrom, lastH).map(p => ({ date: p.date, steps: p.v }));
  const sleep = metricSeries(days, 'sleepH', hFrom, lastH).map(p => ({ date: p.date, sleepH: p.v }));
  return (
    <>
      <TrendCard title="Steps" to="/health/metric/steps" className="lg:col-span-4" meta={`Last 14 days · goal ${fmt(g.stepsGoal)}`}>
        <TimeChart data={steps} height={190} zero onSelect={d => nav(`/health/day/${d}`)} ariaLabel="Daily steps for the last 14 days" goal={{ value: g.stepsGoal, label: fmt(g.stepsGoal) }}
          series={[{ key: 'steps', label: 'Steps', kind: 'bar', color: 'lane', format: v => fmt(v), colorAt: v => (v >= g.stepsGoal ? 'lane' : 'muted') }]}
          yFormat={v => (v >= 1000 ? `${v / 1000}k` : String(v))} empty="Steps appear after the Shortcut runs." />
      </TrendCard>
      <TrendCard title="Sleep" to="/health/sleep" className="lg:col-span-4" meta={`Last 14 nights · goal ${fmt(g.sleepGoalH, 1)} h`}>
        <TimeChart data={sleep} height={190} zero onSelect={d => nav(`/health/day/${d}`)} ariaLabel="Nightly sleep for the last 14 nights" goal={{ value: g.sleepGoalH, label: `${fmt(g.sleepGoalH)} h` }}
          series={[{ key: 'sleepH', label: 'Sleep', kind: 'bar', color: 'lane', format: v => `${fmt(v, 1)} h`, colorAt: v => (v >= g.sleepGoalH ? 'lane' : 'muted') }]}
          empty="Sleep appears after the Shortcut runs." />
      </TrendCard>
      <TrendCard title="Weight" to="/health/weight" className="lg:col-span-4" meta={`Last 30 days · goal ${fmt(g.goalWeight)} kg`}>
        <TimeChart data={weightRows} height={190} onSelect={d => nav(`/health/day/${d}`)} ariaLabel="Bodyweight over the last 30 days with 7-day average"
          series={[{ key: 'kg', label: 'Weigh-in', kind: 'dots', color: 'lane', format: v => `${fmt(v, 1)} kg` }, { key: 'avg', label: '7-day avg', kind: 'line', color: 'lane', format: v => `${fmt(v, 1)} kg` }]}
          empty="Log weigh-ins to see your trend." />
        <div className="mt-2"><Legend items={[{ label: 'Weigh-in', color: 'lane', kind: 'dot' }, { label: '7-day average', color: 'lane', kind: 'line' }]} /></div>
      </TrendCard>
    </>
  );
}

/* ---------- training ---------- */
function RecentWorkouts({ className }: { className?: string }) {
  const data = useData();
  const today = useToday();
  const items = useMemo(() => {
    const s = data.training.sessions.map(x => ({ date: x.date, id: x.id, to: `/train/session/${encodeURIComponent(x.id)}`, title: x.name, sub: `${x.exercises.length} exercises · ${sessionSets(x)} sets`, kind: 'session' as const }));
    const a = allActivities(data).map(x => ({ date: x.date, id: x.id, to: `/activity/${encodeURIComponent(x.id)}`, title: activityLabel(x), sub: [fmtDur(x.durationSec), x.source === 'Apple Watch' || x.merged ? 'Apple Watch' : null].filter(Boolean).join(' · '), kind: 'activity' as const }));
    return [...s, ...a].sort(byDateDesc).slice(0, 5);
  }, [data]);
  return (
    <Card className={className}>
      <CardHeader title="Recent workouts" action={<Button asChild variant="ghost" size="sm" className="-mr-2 text-lane-ink"><Link to="/activity">All</Link></Button>} />
      <CardBody className="pt-1">
        {items.length ? (
          <ul className="-mx-2 flex flex-col">
            {items.map(i => (
              <li key={i.kind + i.id}>
                <RowLink to={i.to}>
                  <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', i.kind === 'session' ? 'bg-track-soft text-track-ink' : 'bg-lane-soft text-lane-ink')}>
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
        <div className="text-[13px] font-medium text-muted">Projected</div>
        <div className="num text-[48px] leading-none font-semibold">{proj ? fmtDur(proj.sec) : '–'}</div>
        {proj && gap != null ? (
          <>
            <div className={cn('mt-1 text-sm font-semibold', gap <= 0 ? 'text-good' : 'text-track-ink')}>
              {gap <= 0 ? `${fmtDur(-gap)} under goal` : `${fmtDur(gap)} to go`}
            </div>
            <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div className="absolute inset-y-0 left-0 rounded-full bg-track" style={{ width: `${Math.max(4, Math.min(100, (goalSec / proj.sec) * 100))}%` }} />
            </div>
            <Link to={`/activity/${encodeURIComponent(proj.from.id)}`} className="mt-3 text-[13px] text-muted hover:text-ink hover:underline">
              From {activityLabel(proj.from)} on {fmtShort(proj.from.date)} (Riegel)
            </Link>
          </>
        ) : <p className="mt-2 text-sm text-muted">Log a run of 2 km or more in the last 6 weeks to get a projection.</p>}
        <div className="mt-auto pt-3">
          <Button asChild variant="secondary" size="sm" className="w-full"><Link to="/activity/progress"><Timer /> Runs and pace</Link></Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function TodayPage() {
  const today = useToday();
  const desktop = useIsDesktop();
  const days = useHealthDays();
  return (
    <div>
      <PageHeader kicker={fmtLong(today)} title="Today" actions={<LiveBadge />} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <ActivityCard day={days[today]} className="lg:col-span-7" />
        <SleepCard className="lg:col-span-5" />
        <HealthGrid className="lg:col-span-12" />
        <FuelCard className="lg:col-span-5 xl:col-span-4" />
        <WeekCard className="lg:col-span-7 xl:col-span-8" />
        {desktop ? <TrendCharts /> : null}
        <RecentWorkouts className="lg:col-span-7" />
        <TenKCard className="lg:col-span-5" />
      </div>
    </div>
  );
}
