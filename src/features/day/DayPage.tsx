import { CalendarDays, ChevronLeft, ChevronRight, Dumbbell, Footprints, Moon, Plus, UtensilsCrossed } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useMatch, useNavigate, useParams } from 'react-router';
import { useData, useGoals, useHealthDays, useToday } from '@/app/store';
import { NotFound } from '@/app/NotFound';
import {
  activityLabel, allActivities, avg, CATEGORIES, dayTotals, fmtDur, mealsOn, METRICS, sessionSets, sessionVolume, STRESS_LABEL, stressFor,
  stressLevel, weightSeries, type MetricKey,
} from '@/core/calc';
import { addDays, fmtDay, fmtLong, fmtRelative } from '@/core/dates';
import type { HealthDay } from '@/core/types';
import { EmptyState, Meter, PageHeader, RowLink } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { MealSheet } from '@/features/food/MealSheet';
import { macroLine, NutrientSummary } from '@/features/food/nutrition';
import { ActivityRings, CategoryIcon, formatMetric, metricHref, RingsLegend, shortLabel } from '@/features/health/health-ui';
import { clock, hm } from '@/features/health/SleepPage';
import { cn, fmt } from '@/lib/utils';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const STAGES = [
  ['sleepAwakeH', 'Awake', 'var(--stage-awake)'],
  ['sleepRemH', 'REM', 'var(--stage-rem)'],
  ['sleepCoreH', 'Core', 'var(--stage-core)'],
  ['sleepDeepH', 'Deep', 'var(--stage-deep)'],
] as const;

/** Picker for jumping to any day. */
export function DayPicker({ base, className }: { base: '/day' | '/health/day'; className?: string }) {
  const today = useToday();
  const nav = useNavigate();
  const [v, setV] = useState('');
  return (
    <form className={cn('flex items-center gap-2', className)} onSubmit={e => { e.preventDefault(); if (dateRe.test(v)) nav(`${base}/${v}`); }}>
      <label className="sr-only" htmlFor="day-pick">Go to day</label>
      <Input id="day-pick" type="date" max={today} value={v} onChange={e => { setV(e.target.value); if (dateRe.test(e.target.value)) nav(`${base}/${e.target.value}`); }} className="w-[11.5rem]" />
    </form>
  );
}

/** Seven recent days as quick links. */
export function RecentDayLinks({ base, active }: { base: '/day' | '/health/day'; active?: string }) {
  const today = useToday();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  return (
    <nav aria-label="Recent days" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none">
      {days.map(d => (
        <Link key={d} to={`${base}/${d}`} aria-current={d === active ? 'page' : undefined}
          className="flex min-h-11 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-surface px-3 py-1.5 text-center transition-colors hover:border-line-strong aria-[current=page]:border-track aria-[current=page]:bg-track-soft">
          <span className="text-[11px] font-semibold text-muted uppercase">{fmtRelative(d, today) === 'Today' ? 'Today' : fmtDay(d).split(' ')[0]}</span>
          <span className="num text-base leading-none font-semibold">{d.slice(8).replace(/^0/, '')}</span>
        </Link>
      ))}
    </nav>
  );
}

function FuelCard({ date }: { date: string }) {
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const [adding, setAdding] = useState(false);
  const t = dayTotals(data.food.meals, date);
  const meals = mealsOn(data.food.meals, date);
  return (
    <Card>
      <CardHeader title={<Link to={date === today ? '/food' : `/food/${date}`} className="hover:underline hover:underline-offset-4">Food</Link>} meta={`${t.n} ${t.n === 1 ? 'meal' : 'meals'}`}
        action={<Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus /> Add meal</Button>} />
      <CardBody className="space-y-1">
        {t.n ? (
          <>
            <Meter label="Calories" value={t.kcal} target={g.kcal} unit="kcal" color="track" />
            <Meter label="Protein" value={t.protein} target={g.protein} unit="g" color="lane" />
            <NutrientSummary t={t} className="mt-3" />
            <ul className="-mx-2 mt-2">
              {meals.map(m => (
                <li key={m.id}>
                  <RowLink to={`/food/meal/${encodeURIComponent(m.id)}`}>
                    <div className="w-12 shrink-0 text-[13px] font-semibold text-muted tabular-nums">{m.time || '—'}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{m.meal}</div>
                      <div className="truncate text-[13px] text-muted">{m.items}</div>
                      {macroLine(m) ? <div className="text-[12px] font-semibold text-muted">{macroLine(m)}</div> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="num text-lg leading-none font-semibold text-track-ink">{fmt(+m.kcal)}<span className="ml-0.5 font-sans text-xs text-muted">kcal</span></div>
                      <div className="text-[13px] text-lane-ink">{fmt(+m.protein)} g</div>
                    </div>
                  </RowLink>
                </li>
              ))}
            </ul>
          </>
        ) : <EmptyState icon={<UtensilsCrossed />} title="No meals logged" action={<Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus /> Add a meal</Button>} />}
      </CardBody>
      <MealSheet open={adding} onOpenChange={setAdding} date={date} />
    </Card>
  );
}

function TrainingCard({ date }: { date: string }) {
  const data = useData();
  const today = useToday();
  const sessions = data.training.sessions.filter(s => s.date === date);
  const acts = useMemo(() => allActivities(data).filter(a => a.date === date), [data, date]);
  return (
    <Card>
      <CardHeader title="Training" meta={sessions.length + acts.length ? `${sessions.length + acts.length} logged` : date < today ? 'Rest day' : 'Nothing yet'} />
      <CardBody className="pt-1">
        {sessions.length + acts.length ? (
          <ul className="-mx-2">
            {sessions.map(s => (
              <li key={s.id}>
                <RowLink to={`/train/session/${encodeURIComponent(s.id)}`}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-track-soft text-track-ink"><Dumbbell aria-hidden className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{s.name}</div>
                    <div className="truncate text-[13px] text-muted">{s.exercises.length} exercises · {sessionSets(s)} sets{sessionVolume(s) ? ` · ${fmt(sessionVolume(s))} kg` : ''}</div>
                  </div>
                </RowLink>
              </li>
            ))}
            {acts.map(a => (
              <li key={a.id}>
                <RowLink to={`/health/workout/${encodeURIComponent(a.id)}`}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lane-soft text-lane-ink"><Footprints aria-hidden className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{activityLabel(a)}</div>
                    <div className="truncate text-[13px] text-muted">{fmtDur(a.durationSec)}{a.avgHr ? ` · ${a.avgHr} bpm` : ''}{a.source === 'Apple Watch' || a.merged ? ' · Apple Watch' : ''}</div>
                  </div>
                </RowLink>
              </li>
            ))}
          </ul>
        ) : <p className="py-4 text-center text-sm text-muted">{date < today ? 'No workouts or activities this day.' : 'Nothing logged yet.'}</p>}
      </CardBody>
    </Card>
  );
}

function SleepCard({ d }: { d: HealthDay | undefined }) {
  if (d?.sleepH == null) return null;
  const parts = STAGES.map(([k, label, color]) => ({ k, label, color, h: d[k] ?? 0 })).filter(p => p.h > 0);
  const total = parts.reduce((n, p) => n + p.h, 0);
  return (
    <Card>
      <CardHeader title={<Link to="/health/sleep" className="flex items-center gap-2 hover:underline hover:underline-offset-4"><CategoryIcon cat="sleep" size="sm" />Sleep</Link>}
        meta={d.sleepStartMin != null && d.sleepEndMin != null ? `Night before · ${clock(d.sleepStartMin)} – ${clock(d.sleepEndMin)}` : 'Night before'} />
      <CardBody>
        <div className="num text-[36px] leading-none font-semibold">{hm(d.sleepH)}</div>
        {total ? (
          <>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full" aria-hidden>
              {[...parts].reverse().map(p => <div key={p.k} style={{ width: `${(p.h / total) * 100}%`, background: p.color }} />)}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STAGES.map(([k, label, color]) => (
                <li key={k}>
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-muted"><span aria-hidden className="size-2 rounded-full" style={{ background: color }} />{label}</div>
                  <div className="num text-base font-semibold">{hm(d[k])}</div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}

function HealthSections({ date }: { date: string }) {
  const days = useHealthDays();
  const data = useData();
  const d = days[date];
  const weigh = weightSeries(data).find(p => p.date === date);
  const stress = stressFor(days, date);
  const prev7 = (k: MetricKey) => avg(Array.from({ length: 7 }, (_, i) => days[addDays(date, -1 - i)]?.[k]));
  const cats = CATEGORIES.filter(c => c.key !== 'sleep').map(c => ({ c, ks: c.metrics.filter(k => d?.[k] != null) })).filter(x => x.ks.length);
  if (!d && !weigh) {
    return (
      <Card><CardBody className="pt-4"><EmptyState icon={<CalendarDays />} title="No Apple Health data for this day" action={<Button asChild variant="secondary" size="sm"><Link to="/health">Import Apple Health</Link></Button>}>Import a newer export to fill it in.</EmptyState></CardBody></Card>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {d && (d.activeKcal != null || d.exerciseMin != null || d.standHours != null) ? (
          <Card>
            <CardHeader title="Activity rings" />
            <CardBody className="flex items-center gap-5"><ActivityRings day={d} size={120} /><RingsLegend day={d} /></CardBody>
          </Card>
        ) : null}
        <SleepCard d={d} />
        {stress ? (
          <Card>
            <CardHeader title={<Link to="/health/metric/stress" className="flex items-center gap-2 hover:underline hover:underline-offset-4"><CategoryIcon cat="mind" size="sm" />Stress</Link>} meta="Estimate from HRV and resting heart rate" />
            <CardBody>
              <div className="flex items-baseline gap-2"><span className="num text-[36px] leading-none font-semibold">{stress.score}</span><span className={cn('text-sm font-semibold', stressLevel(stress.score) === 'high' ? 'text-track-ink' : stressLevel(stress.score) === 'low' ? 'text-lane-ink' : 'text-muted')}>{STRESS_LABEL[stressLevel(stress.score)]}</span></div>
              <p className="mt-2 text-[13px] text-muted">
                {stress.hrv ? `HRV ${fmt(stress.hrv.value)} ms vs usual ${fmt(stress.hrv.mean)}` : ''}{stress.hrv && stress.restingHr ? ' · ' : ''}{stress.restingHr ? `resting HR ${fmt(stress.restingHr.value)} vs usual ${fmt(stress.restingHr.mean)}` : ''}
              </p>
            </CardBody>
          </Card>
        ) : null}
        {weigh ? (
          <Card>
            <CardHeader title={<Link to="/health/weight" className="flex items-center gap-2 hover:underline hover:underline-offset-4"><CategoryIcon cat="body" size="sm" />Weight</Link>} meta={weigh.src} />
            <CardBody><span className="num text-[36px] leading-none font-semibold">{fmt(weigh.kg, 1)}</span><span className="ml-1 text-muted">kg</span></CardBody>
          </Card>
        ) : null}
      </div>
      {cats.map(({ c, ks }) => (
        <section key={c.key} aria-labelledby={`day-${c.key}`}>
          <h2 id={`day-${c.key}`} className="mb-2 flex items-center gap-2 font-display text-[20px] font-semibold uppercase"><CategoryIcon cat={c.key} size="sm" />{c.label}</h2>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {ks.filter(k => k !== 'stress').map(k => {
              const f = formatMetric(k, d![k], d);
              const p = prev7(k);
              const diff = p != null && d![k] != null && k !== 'hrAvg' ? d![k]! - p : null;
              const good = diff != null && METRICS[k].higherIsBetter != null && Math.abs(diff) > 0 ? (diff > 0) === METRICS[k].higherIsBetter : null;
              return (
                <li key={k}>
                  <Link to={metricHref(k)} className="block h-full rounded-xl border border-line/80 bg-surface p-3 shadow-card transition-colors hover:border-line-strong">
                    <div className="truncate text-[12px] font-semibold text-muted">{shortLabel(k)}</div>
                    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1"><span className="num text-[24px] leading-tight font-semibold">{f.value}</span>{f.unit ? <span className="text-[12px] text-muted">{f.unit}</span> : null}</div>
                    {diff != null ? (
                      <div className={cn('text-[12px]', good === true && 'text-good', good === false && 'text-bad', good == null && 'text-muted')}>
                        {diff >= 0 ? '+' : '−'}{fmt(Math.abs(diff), METRICS[k].dp)} vs 7-day avg
                      </div>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Everything for one day. /day/:date leads with food and training, /health/day/:date with health. */
export function DayPage() {
  const { date } = useParams();
  const healthFirst = !!useMatch('/health/day/:date');
  const today = useToday();
  const nav = useNavigate();
  if (!date || !dateRe.test(date)) return <NotFound />;
  const base = healthFirst ? '/health/day' : '/day';
  const go = (d: string) => nav(`${base}/${d}`, { replace: true });
  return (
    <div>
      <PageHeader
        back={healthFirst ? '/health' : '/today'}
        kicker={fmtLong(date)}
        title={fmtRelative(date, today)}
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon" aria-label="Previous day" onClick={() => go(addDays(date, -1))}><ChevronLeft /></Button>
            <DayPicker base={base} />
            <Button variant="secondary" size="icon" aria-label="Next day" disabled={date >= today} onClick={() => go(addDays(date, 1))}><ChevronRight /></Button>
          </div>
        }
      />
      {healthFirst ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12 lg:gap-5">
          <div className="lg:col-span-8"><HealthSections date={date} /></div>
          <div className="space-y-4 lg:col-span-4"><FuelCard date={date} /><TrainingCard date={date} /></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12 lg:gap-5">
          <div className="space-y-4 lg:col-span-5"><FuelCard date={date} /><TrainingCard date={date} /></div>
          <section aria-labelledby="day-health-h" className="lg:col-span-7">
            <h2 id="day-health-h" className="mb-3 flex items-center gap-2 font-display text-[22px] font-semibold uppercase"><Moon aria-hidden className="size-5 text-muted" />Health</h2>
            <HealthSections date={date} />
          </section>
        </div>
      )}
    </div>
  );
}
