import { ChevronRight, Footprints, HeartPulse, Ruler, Watch } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useData, useGoals, useHealthDays, useToday } from '@/app/store';
import { activityLabel, allActivities, CATEGORIES, fmtDur, healthDays, pace, tenKProjection, type MetricKey } from '@/core/calc';
import { fmtRelative, fmtShort } from '@/core/dates';
import { EmptyState, PageHeader, RowLink } from '@/components/common';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useMeasureChanges } from '@/features/body/MeasurementsPage';
import { cn, fmt } from '@/lib/utils';
import { ActivityRings, CategoryIcon, categoryHasData, HealthCard, RingsLegend, WeightCard } from './health-ui';
import { ImportButton } from './HealthImporter';

const PINNED: MetricKey[] = ['stress', 'sleepH', 'steps', 'activeKcal', 'restingHr', 'hrv', 'spo2', 'respiratoryRate', 'vo2max', 'walkingSpeed'];

export function RingsCard({ className }: { className?: string }) {
  const days = useHealthDays();
  const today = useToday();
  const last = healthDays(days).filter(d => days[d]?.activeKcal != null || days[d]?.exerciseMin != null).pop();
  const day = last ? days[last] : undefined;
  return (
    <Card className={className}>
      <CardHeader title={<Link to="/health/activity" className="hover:underline hover:underline-offset-4">Activity rings</Link>} meta={last ? fmtRelative(last, today) : 'No data yet'} />
      <CardBody className="flex items-center gap-5">
        <ActivityRings day={day} />
        <RingsLegend day={day} />
      </CardBody>
    </Card>
  );
}

export function WorkoutsCard({ className, limit = 4 }: { className?: string; limit?: number }) {
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const acts = useMemo(() => allActivities(data), [data]);
  const proj = tenKProjection(acts, today);
  return (
    <Card className={className}>
      <CardHeader title={<Link to="/health/workouts" className="hover:underline hover:underline-offset-4">Workouts</Link>}
        meta={proj ? `10 km projection ${fmtDur(proj.sec)} · goal ${fmtDur(g.tenKGoalMin * 60)}` : `${acts.length} total`} />
      <CardBody className="pt-1">
        {acts.length ? (
          <ul className="-mx-2">
            {acts.slice(0, limit).map(a => (
              <li key={a.id}>
                <RowLink to={`/health/workout/${encodeURIComponent(a.id)}`}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] text-[var(--cat-activity)]" style={{ background: 'color-mix(in srgb, var(--cat-activity) 15%, transparent)' }}>
                    {a.source === 'Apple Watch' ? <Watch aria-hidden className="size-[18px]" /> : <Footprints aria-hidden className="size-[18px]" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{activityLabel(a)}</div>
                    <div className="truncate text-[13px] text-muted">{fmtRelative(a.date, today)} · {fmtDur(a.durationSec)}{pace(a) ? ` · ${fmtDur(pace(a))} /km` : ''}</div>
                  </div>
                </RowLink>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<Footprints />} title="No workouts yet">Log a run, or import Apple Health to pull in watch workouts.</EmptyState>}
        <Link to="/health/workouts" className="mt-1 flex min-h-11 items-center justify-center gap-1 rounded-xl text-sm font-semibold text-lane-ink hover:bg-surface-2">All workouts and runs <ChevronRight aria-hidden className="size-4" /></Link>
      </CardBody>
    </Card>
  );
}

export function MeasurementsCard({ className }: { className?: string }) {
  const { ms, rows } = useMeasureChanges();
  const today = useToday();
  const waist = rows.find(r => r.k === 'waist');
  const last = ms[ms.length - 1];
  return (
    <Link to="/health/measurements" className={cn('group flex min-h-[132px] flex-col rounded-card border border-line/80 bg-surface p-4 shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-pop', className)}>
      <div className="flex items-center gap-2">
        <span aria-hidden className="grid size-7 place-items-center rounded-[10px] text-[var(--cat-body)]" style={{ background: 'color-mix(in srgb, var(--cat-body) 15%, transparent)' }}><Ruler className="size-4" /></span>
        <span className="flex-1 text-sm font-semibold">Measurements</span>
        <span className="text-[12px] text-muted">{last ? fmtRelative(last.date, today) : ''}</span>
        <ChevronRight aria-hidden className="size-4 text-muted" />
      </div>
      <div className="mt-auto pt-3">
        {waist ? (
          <>
            <span className="num text-[30px] leading-none font-semibold">{fmt(waist.b, 1)}</span><span className="ml-1 text-sm text-muted">cm waist</span>
            <div className="mt-1 text-[12px] text-muted">{waist.d > 0 ? '+' : waist.d < 0 ? '−' : ''}{fmt(Math.abs(waist.d), 1)} cm since first</div>
          </>
        ) : <span className="text-sm text-muted">No measurements yet. Add a baseline.</span>}
      </div>
    </Link>
  );
}

export function HealthSummary() {
  const data = useData();
  const days = useHealthDays();
  const hasHealth = Object.keys(days).length > 0;
  const pinned = PINNED.filter(k => Object.values(days).some(d => d[k] != null));
  return (
    <div>
      <PageHeader kicker={data.health.importedAt ? `Last import ${fmtShort(data.health.importedAt.slice(0, 10))}` : 'Apple Health'} title="Health" actions={<ImportButton />} />
      {!hasHealth ? (
        <Card className="mb-5"><CardBody className="pt-4"><EmptyState icon={<HeartPulse />} title="Bring in your Apple Health data" action={<ImportButton />}>Export from the Health app on your iPhone and import it here: sleep and stages, heart, activity, mobility and more, all in one place.</EmptyState></CardBody></Card>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <section aria-labelledby="pinned-h" className="lg:col-span-8">
          <h2 id="pinned-h" className="mb-3 font-display text-[22px] font-semibold uppercase">Pinned</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <WeightCard />
            {pinned.map((k, i) => <HealthCard key={k} k={k} className={i >= 5 ? 'max-sm:hidden' : undefined} />)}
          </div>
        </section>
        <div className="flex flex-col gap-4 lg:col-span-4 lg:pt-[44px]">
          <RingsCard />
          <WorkoutsCard />
        </div>
        <section aria-labelledby="cats-h" className="lg:col-span-12">
          <h2 id="cats-h" className="mb-3 font-display text-[22px] font-semibold uppercase">Categories</h2>
          <Card>
            <CardBody className="pt-3">
              <ul className="-mx-2 grid grid-cols-1 md:grid-cols-2 md:gap-x-4">
                {CATEGORIES.map(c => {
                  const has = c.key === 'body' ? true : categoryHasData(days, c.key);
                  return (
                    <li key={c.key}>
                      <RowLink to={`/health/${c.key}`}>
                        <CategoryIcon cat={c.key} />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">{c.label}</div>
                          <div className="truncate text-[13px] text-muted">{has ? c.blurb : 'No data yet'}</div>
                        </div>
                      </RowLink>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </section>
      </div>
    </div>
  );
}
