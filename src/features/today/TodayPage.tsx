import { Play, Plus } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useData, useDraft, useGoals, useHealthDays, useToday } from '@/app/store';
import { dayTotals, mealsOn, METRICS, sessionSets, STRESS_LABEL, stressFor, stressLevel, weekStreak, weekStrip, type MetricKey } from '@/core/calc';
import { fmtClock, fmtDow, fmtLong, mondayOf } from '@/core/dates';
import { PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { WeighinSheet } from '@/features/body/sheets';
import { MealSheet } from '@/features/food/MealSheet';
import { formatReading, metricHref, shortLabel, useMetricSummary } from '@/features/health/health-ui';
import { ActivitySheet } from '@/features/move/ActivitySheet';
import { StartWorkoutSheet } from '@/features/train/StartWorkoutSheet';
import { cn, fmt, signed } from '@/lib/utils';

/* Today is the daily action hub: how recovered you are, what you have eaten and moved, the workout
   in hand, and the quickest way to log the next thing. Each number appears once; the full vitals
   grid, charts and history live on their own tabs. */

const MoreLink = ({ to, children }: { to: string; children: ReactNode }) => <Link to={to} className="text-[13px] font-medium text-accent-ink hover:underline hover:underline-offset-4">{children}</Link>;

function Bar({ pct, color = 'var(--kcal)', className }: { pct: number; color?: string; className?: string }) {
  return <div aria-hidden className={cn('h-1 overflow-hidden rounded-full bg-surface-3', className)}><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%`, background: color }} /></div>;
}

/* ---------- readiness: last night and this morning ---------- */
function Figure({ label, value, unit, sub, tone, to }: { label: string; value: ReactNode; unit?: string; sub?: string; tone?: 'good' | 'bad'; to: string }) {
  return (
    <Link to={to} className="-m-1.5 block rounded-lg p-1.5 transition-colors hover:bg-surface-2">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1"><span className="num text-[26px] leading-none font-semibold">{value}</span>{unit ? <span className="text-[12px] text-muted">{unit}</span> : null}</div>
      {sub ? <div className={cn('mt-1.5 truncate text-[12px]', tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-muted')}>{sub}</div> : null}
    </Link>
  );
}

function ReadinessCard({ className }: { className?: string }) {
  const days = useHealthDays();
  const today = useToday();
  const g = useGoals();
  const sleep = useMetricSummary('sleepH'), rest = useMetricSummary('restingHr'), hrv = useMetricSummary('hrv'), stress = useMetricSummary('stress');
  const base = useMemo(() => (hrv.last ? stressFor(days, hrv.last) : null), [days, hrv.last]);
  const sleepMin = sleep.value != null ? Math.round(sleep.value * 60) : null;
  const restDelta = rest.value != null && rest.weekAvg != null ? Math.round(rest.value - rest.weekAvg) : null;
  const hrvDelta = hrv.value != null && base?.hrv ? Math.round(hrv.value - base.hrv.mean) : null;
  const notes = [
    hrvDelta != null ? (hrvDelta === 0 ? 'HRV is at your 4-week baseline' : `HRV is ${Math.abs(hrvDelta)} ms ${hrvDelta > 0 ? 'above' : 'below'} your 4-week baseline`) : null,
    restDelta != null ? (restDelta === 0 ? 'resting heart rate matches your 7-day average' : `resting heart rate is ${Math.abs(restDelta)} bpm ${restDelta > 0 ? 'above' : 'below'} your 7-day average`) : null,
  ].filter(Boolean).join(' and ');
  const any = sleep.last || rest.last || hrv.last || stress.last;
  return (
    <Card className={cn('flex flex-col', className)} aria-labelledby="ready-h">
      <CardHeader id="ready-h" title="Readiness" action={<span className="text-[12px] text-muted">Last night and this morning</span>} />
      <CardBody className="flex flex-1 flex-col gap-4">
        {any ? (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
              <Figure to="/health/sleep" label="Sleep"
                value={sleepMin != null ? <>{Math.floor(sleepMin / 60)}<span className="text-[12px] font-normal text-muted"> h </span>{String(sleepMin % 60).padStart(2, '0')}</> : '–'}
                {...(sleepMin != null ? { unit: 'min', sub: sleep.last === today ? `Goal ${fmt(g.sleepGoalH, g.sleepGoalH % 1 ? 1 : 0)} h` : sleep.when, ...(sleep.last === today && sleepMin >= g.sleepGoalH * 60 ? { tone: 'good' as const } : {}) } : { sub: 'No data' })} />
              <Figure to={metricHref('restingHr')} label="Resting heart rate" value={rest.value != null ? fmt(rest.value) : '–'} unit="bpm"
                sub={restDelta != null ? `${signed(restDelta, 0)} vs 7-day average` : rest.when || 'No data'} />
              <Figure to={metricHref('hrv')} label="HRV" value={hrv.value != null ? fmt(hrv.value) : '–'} unit="ms"
                sub={hrvDelta != null ? `${signed(hrvDelta, 0)} vs 4-week baseline` : hrv.when || 'No data'} {...(hrvDelta != null && hrvDelta !== 0 ? { tone: hrvDelta > 0 ? 'good' as const : 'bad' as const } : {})} />
              <Figure to={metricHref('stress')} label="Stress" value={stress.value != null ? fmt(stress.value) : '–'}
                sub={stress.value != null ? `${STRESS_LABEL[stressLevel(stress.value)]} · estimate` : 'Needs HRV and resting HR'} />
            </div>
            {notes ? <p className="mt-auto border-t border-line pt-3 text-[13px] text-muted">{notes[0]!.toUpperCase() + notes.slice(1)}.</p> : null}
          </>
        ) : <p className="py-6 text-center text-sm text-muted">Sleep, resting heart rate and HRV appear here after the Apple Health Shortcut runs.</p>}
      </CardBody>
    </Card>
  );
}

/* ---------- latest readings ---------- */
function ReadingRow({ k }: { k: MetricKey }) {
  const s = useMetricSummary(k);
  if (!s.last) return null;
  const f = formatReading(k, s.value);
  return (
    <li>
      <Link to={metricHref(k)} className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 transition-colors hover:bg-surface-2">
        <span className="truncate text-sm">{shortLabel(k)}{!s.exact && s.isToday && k === 'hrAvg' ? <span className="text-muted"> · average</span> : null}</span>
        <span className="flex shrink-0 items-baseline gap-1"><span className="num font-semibold">{f.value}</span><span className="text-[12px] text-muted">{f.unit || METRICS[k].unit}</span><span className="num w-[5.75rem] text-right text-[12px] text-muted">{s.when}</span></span>
      </Link>
    </li>
  );
}

function LatestCard({ className }: { className?: string }) {
  const data = useData();
  const today = useToday();
  const lastWeigh = useMemo(() => [...data.body.weighins].sort((a, b) => (a.date < b.date ? -1 : 1)).pop(), [data.body.weighins]);
  return (
    <Card className={className} aria-labelledby="latest-h">
      <CardHeader id="latest-h" title="Latest readings" action={<MoreLink to="/health">All health data</MoreLink>} />
      <CardBody className="pt-1 pb-3">
        <ul className="divide-y divide-line">
          {(['hrAvg', 'spo2', 'respiratoryRate', 'vo2max'] as MetricKey[]).map(k => <ReadingRow key={k} k={k} />)}
          {lastWeigh ? (
            <li>
              <Link to="/health/weight" className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 transition-colors hover:bg-surface-2">
                <span className="text-sm">Weight</span>
                <span className="flex items-baseline gap-1"><span className="num font-semibold">{fmt(+lastWeigh.kg, 1)}</span><span className="text-[12px] text-muted">kg</span><span className="num w-[5.75rem] text-right text-[12px] text-muted">{lastWeigh.date === today ? 'Today' : fmtDow(lastWeigh.date) + ' ' + lastWeigh.date.slice(8).replace(/^0/, '')}</span></span>
              </Link>
            </li>
          ) : null}
        </ul>
      </CardBody>
    </Card>
  );
}

/* ---------- energy: eaten against target ---------- */
function EnergyCard({ className }: { className?: string }) {
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const tot = dayTotals(data.food.meals, today);
  const meals = mealsOn(data.food.meals, today);
  const left = g.kcal - tot.kcal;
  const macro = (label: string, value: number | null, target: number | null, color: string) => (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1 text-[12px] text-muted"><span>{label}</span><span className="num">{value == null ? '–' : target ? `${fmt(value)} / ${fmt(target)} g` : `${fmt(value)} g`}</span></div>
      <Bar className="mt-2" color={color} pct={value == null ? 0 : target ? value / target : tot.kcal ? (value * (label === 'Fat' ? 9 : 4)) / tot.kcal : 0} />
    </div>
  );
  return (
    <Card className={cn('flex flex-col', className)} aria-labelledby="energy-h">
      <CardHeader id="energy-h" title="Energy" action={<MoreLink to="/food">Food</MoreLink>} />
      <CardBody className="flex flex-1 flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <div><span className="num text-[30px] leading-none font-semibold">{fmt(tot.kcal)}</span><span className="text-[13px] text-muted"> / {fmt(g.kcal)} kcal</span></div>
            <span className={cn('num text-[13px]', left < 0 ? 'font-medium text-bad' : 'text-muted')}>{left >= 0 ? `${fmt(left)} kcal left` : `${fmt(-left)} kcal over`}</span>
          </div>
          <div role="progressbar" aria-label="Calories" aria-valuemin={0} aria-valuemax={g.kcal} aria-valuenow={Math.round(tot.kcal)} aria-valuetext={`${fmt(tot.kcal)} of ${fmt(g.kcal)} kcal`}><Bar className="mt-3 h-1.5" pct={tot.kcal / g.kcal} /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {macro('Protein', tot.protein, g.protein, 'var(--protein)')}
          {macro('Carbs', tot.carbs, null, 'var(--carbs)')}
          {macro('Fat', tot.fat, null, 'var(--fat)')}
        </div>
        {meals.length ? (
          <ul className="mt-auto divide-y divide-line border-t border-line">
            {meals.map(m => (
              <li key={m.id}>
                <Link to={`/food/meal/${encodeURIComponent(m.id)}`} className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-surface-2">
                  <span className="num w-11 shrink-0 text-[12px] text-muted">{m.time || '—'}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{m.meal}</span>
                  <span className="num shrink-0 font-semibold">{fmt(+m.kcal)}<span className="text-[12px] font-normal text-muted"> kcal</span></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="mt-auto border-t border-line pt-3 text-[13px] text-muted">No meals logged yet today.</p>}
      </CardBody>
    </Card>
  );
}

/* ---------- training: the workout in hand and the week ---------- */
function TrainingCard({ className }: { className?: string }) {
  const data = useData();
  const today = useToday();
  const draft = useDraft();
  const [picking, setPicking] = useState(false);
  const week = useMemo(() => weekStrip(data, mondayOf(today), today), [data, today]);
  const sessions = data.training.sessions.filter(s => s.date >= mondayOf(today) && s.date <= today);
  const sets = sessions.reduce((n, s) => n + sessionSets(s), 0);
  const streak = weekStreak(data.training.sessions, today);
  const done = draft ? draft.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0) : 0;
  const total = draft ? draft.exercises.reduce((n, e) => n + e.sets.length, 0) : 0;
  return (
    <Card className={cn('flex flex-col', className)} aria-labelledby="training-h">
      <CardHeader id="training-h" title="Training" action={<MoreLink to="/train">Train</MoreLink>} />
      <CardBody className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-[10px] bg-surface-2 p-3.5 shadow-card">
          {draft ? (
            <>
              <div>
                <div className="text-[12px] text-muted">Workout in progress</div>
                <div className="truncate text-[15px] font-medium">{draft.name || 'Workout'}</div>
                <div className="num text-[12px] text-muted">{draft.startedAt ? `Started ${fmtClock(draft.startedAt)} · ` : ''}{done} of {total} sets done</div>
              </div>
              <Button asChild variant="primary"><Link to="/train/log"><Play /> Resume workout</Link></Button>
            </>
          ) : (
            <>
              <div>
                <div className="text-[12px] text-muted">{week.find(d => d.isToday)?.items.length ? 'Trained today' : 'Nothing logged today'}</div>
                <div className="text-[15px] font-medium">{week.find(d => d.isToday)?.items.map(i => i.label).join(', ') || 'Start a workout'}</div>
              </div>
              <Button variant="primary" onClick={() => setPicking(true)}><Play /> Start workout</Button>
            </>
          )}
        </div>
        <ul className="grid grid-cols-7 gap-1.5 text-center" aria-label="This week">
          {week.map(d => (
            <li key={d.date}>
              <Link to={`/day/${d.date}`} aria-label={`${fmtLong(d.date)}: ${d.items.length ? d.items.map(i => i.label).join(', ') : 'nothing logged'}`}
                className={cn('flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-lg bg-surface-2 shadow-card transition-colors hover:bg-surface-3', d.isToday && 'shadow-[0_0_0_1px_var(--accent)]')}>
                <span className={cn('text-[11px]', d.isToday ? 'text-ink' : 'text-muted')}>{fmtDow(d.date)}</span>
                <span className="num text-sm font-medium">{d.date.slice(8).replace(/^0/, '')}</span>
                <span aria-hidden className={cn('size-1.5 rounded-full', d.items.length ? 'bg-ink' : 'bg-transparent')} />
              </Link>
            </li>
          ))}
        </ul>
        <p className="num mt-auto text-[12px] text-muted">This week: {sessions.length} {sessions.length === 1 ? 'workout' : 'workouts'} · {sets} sets{streak ? ` · ${streak}-week streak` : ''}</p>
      </CardBody>
      <StartWorkoutSheet open={picking} onOpenChange={setPicking} />
    </Card>
  );
}

/* ---------- movement so far today ---------- */
function MovementCard({ className }: { className?: string }) {
  const days = useHealthDays();
  const today = useToday();
  const g = useGoals();
  const d = days[today];
  const rows: [string, number | undefined, number, string, string][] = [
    ['Move', d?.activeKcal, 500, 'kcal', '/health/metric/activeKcal'],
    ['Exercise', d?.exerciseMin, 30, 'min', '/health/metric/exerciseMin'],
    ['Steps', d?.steps, g.stepsGoal, '', '/health/metric/steps'],
  ];
  const extra = [d?.distanceKm != null ? `${fmt(d.distanceKm, 2)} km` : null, d?.flights != null ? `${fmt(d.flights)} flights climbed` : null].filter(Boolean).join(' · ');
  return (
    <Card className={cn('flex flex-col', className)} aria-labelledby="move-h">
      <CardHeader id="move-h" title="Movement" action={<span className="text-[12px] text-muted">{d ? 'So far today' : 'No data yet today'}</span>} />
      <CardBody className="flex flex-1 flex-col gap-4">
        {rows.map(([label, v, goal, unit, to]) => (
          <Link key={label} to={to} className="-m-1.5 block rounded-lg p-1.5 transition-colors hover:bg-surface-2">
            <div className="flex items-baseline justify-between gap-2"><span className="text-[12px] text-muted">{label}</span><span className="num text-sm"><span className="font-semibold">{fmt(v)}</span><span className="text-[12px] text-muted"> / {fmt(goal)}{unit ? ` ${unit}` : ''}</span></span></div>
            <Bar className="mt-2" pct={(v ?? 0) / goal} />
          </Link>
        ))}
        {extra ? <p className="num mt-auto border-t border-line pt-3 text-[12px] text-muted">{extra}</p> : null}
      </CardBody>
    </Card>
  );
}

export function TodayPage() {
  const today = useToday();
  const [sheet, setSheet] = useState<'meal' | 'weight' | 'activity' | null>(null);
  return (
    <div>
      <PageHeader kicker={fmtLong(today)} title="Today" actions={
        <>
          <Button onClick={() => setSheet('meal')}><Plus /> Meal</Button>
          <Button onClick={() => setSheet('weight')}><Plus /> Weight</Button>
          <Button onClick={() => setSheet('activity')}><Plus /> Activity</Button>
        </>
      } />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <ReadinessCard className="lg:col-span-7" />
        <LatestCard className="max-lg:order-5 lg:col-span-5" />
        <EnergyCard className="lg:col-span-5" />
        <TrainingCard className="max-lg:order-first lg:col-span-4" />
        <MovementCard className="lg:col-span-3" />
      </div>
      <MealSheet open={sheet === 'meal'} onOpenChange={o => setSheet(o ? 'meal' : null)} date={today} />
      <WeighinSheet open={sheet === 'weight'} onOpenChange={o => setSheet(o ? 'weight' : null)} />
      <ActivitySheet open={sheet === 'activity'} onOpenChange={o => setSheet(o ? 'activity' : null)} />
    </div>
  );
}
