import { ChevronRight, HeartPulse, Moon, Ruler } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useData, useGoals, useHealthDays, useSnapshot, useToday } from '@/app/store';
import { CATEGORIES, healthDays, type MetricKey } from '@/core/calc';
import { fmtClock, fmtDay, fmtRelative } from '@/core/dates';
import { EmptyState, PageHeader } from '@/components/common';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useMeasureChanges } from '@/features/body/MeasurementsPage';
import { cn, fmt } from '@/lib/utils';
import { DayPicker, RecentDayLinks } from '@/features/day/DayPage';
import { ActivityRings, CategoryIcon, categoryHasData, HealthCard, RingsLegend, WeightCard } from './health-ui';
import { ImportButton } from './HealthImporter';
import { StageBar } from './SleepPage';

/** The vitals grid, in reading order: heart, breathing, fitness, mind, then (after Weight) sleep and movement. */
const VITALS: MetricKey[] = ['hrAvg', 'restingHr', 'hrv', 'walkingHr', 'spo2', 'respiratoryRate', 'vo2max', 'stress'];
const DAILY: MetricKey[] = ['sleepH', 'steps', 'activeKcal', 'walkingSpeed'];

export function RingsCard({ className }: { className?: string }) {
  const days = useHealthDays();
  const today = useToday();
  const last = healthDays(days).filter(d => days[d]?.activeKcal != null || days[d]?.exerciseMin != null).pop();
  const day = last ? days[last] : undefined;
  return (
    <Card className={className}>
      <CardHeader title={<Link to="/health/activity" className="hover:underline hover:underline-offset-4">Activity rings</Link>} meta={last ? fmtRelative(last, today) : 'No data yet'} />
      <CardBody className="flex items-center gap-5">
        <ActivityRings day={day} size={116} />
        <RingsLegend day={day} />
      </CardBody>
    </Card>
  );
}

/** Last night's stages, the one place sleep detail shows outside the Sleep page. */
export function SleepStagesCard({ className }: { className?: string }) {
  const days = useHealthDays();
  const today = useToday();
  const g = useGoals();
  const last = useMemo(() => Object.keys(days).filter(k => days[k]?.sleepH != null).sort().pop(), [days]);
  const d = last ? days[last] : undefined;
  const mins = d?.sleepH != null ? Math.round(d.sleepH * 60) : null;
  const staged = !!d && (d.sleepCoreH != null || d.sleepDeepH != null || d.sleepRemH != null);
  return (
    <Card className={className}>
      <CardHeader title={<Link to="/health/sleep" className="hover:underline hover:underline-offset-4">Sleep</Link>}
        meta={last ? (last === today ? 'Last night' : `Night to ${fmtRelative(last, today)}`) : 'No sleep data yet'} />
      <CardBody className="flex flex-col gap-3">
        {mins != null ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div><span className="num text-[28px] leading-none font-semibold">{Math.floor(mins / 60)}</span><span className="text-[13px] text-muted"> h </span><span className="num text-[28px] leading-none font-semibold">{String(mins % 60).padStart(2, '0')}</span><span className="text-[13px] text-muted"> min</span></div>
              <span className={cn('text-[12px]', mins >= g.sleepGoalH * 60 ? 'text-good' : 'text-muted')}>Goal {fmt(g.sleepGoalH, g.sleepGoalH % 1 ? 1 : 0)} h</span>
            </div>
            {staged ? <StageBar d={d!} /> : <p className="text-[13px] text-muted">No sleep stages for this night.</p>}
          </>
        ) : <EmptyState icon={<Moon />} title="No sleep yet">Wear your Watch to bed. Sleep shows up after the Shortcut runs in the morning.</EmptyState>}
      </CardBody>
    </Card>
  );
}

/** Where the numbers on this page come from and how fresh each source is. */
export function FreshnessCard({ className }: { className?: string }) {
  const s = useSnapshot();
  const today = useToday();
  const liveAt = s.live?.at ? Date.parse(s.live.at) : NaN;
  const rows: [string, string][] = [
    ['Shortcut export', s.live && Number.isFinite(liveAt) ? (s.live.date === today ? `Today ${fmtClock(liveAt)}` : fmtDay(s.live.date)) : 'Not received yet'],
    ['Full Apple Health import', s.data.health.importedAt ? fmtDay(s.data.health.importedAt.slice(0, 10)) : 'Never'],
    ['Saved to your data repo', s.mode !== 'github' ? 'Demo data, not saved' : s.syncedAt ? `Today ${fmtClock(s.syncedAt)}` : 'Not yet this session'],
  ];
  return (
    <Card className={className}>
      <CardHeader title="Data freshness" action={<ImportButton />} />
      <CardBody className="pt-1 pb-3">
        <dl className="divide-y divide-line text-[13px]">
          {rows.map(([k, v]) => <div key={k} className="flex items-baseline justify-between gap-3 py-2"><dt className="text-muted">{k}</dt><dd className="num text-right">{v}</dd></div>)}
        </dl>
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
    <Link to="/health/measurements" className={cn('group flex min-h-[132px] flex-col rounded-card bg-surface p-4 shadow-card transition-shadow hover:shadow-pop', className)}>
      <div className="flex items-center gap-2">
        <CategoryIcon cat="body" icon={Ruler} size="sm" />
        <span className="flex-1 text-[13px] font-medium">Measurements</span>
        <ChevronRight aria-hidden className="size-4 text-muted" />
      </div>
      <div className="mt-3">
        {waist ? (
          <>
            <div className="flex items-baseline gap-1.5"><span className="num text-[28px] leading-none font-semibold">{fmt(waist.b, 1)}</span><span className="text-[13px] text-muted">cm waist</span><span className="ml-auto text-[12px] text-muted">{last ? fmtRelative(last.date, today) : ''}</span></div>
            <div className="mt-3 text-[12px] text-muted">{waist.d > 0 ? '+' : waist.d < 0 ? '−' : ''}{fmt(Math.abs(waist.d), 1)} cm since first</div>
          </>
        ) : <span className="text-sm text-muted">No measurements yet. Add a baseline.</span>}
      </div>
    </Link>
  );
}

export function HealthSummary() {
  const days = useHealthDays();
  const data = useData();
  const hasHealth = Object.keys(days).length > 0;
  const present = (keys: MetricKey[]) => keys.filter(k => Object.values(days).some(d => d[k] != null));
  return (
    <div>
      <PageHeader kicker="Latest readings from Apple Health" title="Health" actions={<DayPicker base="/health/day" />} />
      {!hasHealth ? (
        <Card className="mb-5"><CardBody className="pt-4"><EmptyState icon={<HeartPulse />} title="Bring in your Apple Health data" action={<ImportButton />}>Export from the Health app on your iPhone and import it here: sleep and stages, heart, activity, mobility and more, all in one place.</EmptyState></CardBody></Card>
      ) : null}
      <section aria-label="Recent days" className="mb-5"><RecentDayLinks base="/health/day" /></section>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section aria-labelledby="vitals-h" className="lg:col-span-8">
          <h2 id="vitals-h" className="sr-only">Vitals</h2>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {present(VITALS).map(k => <HealthCard key={k} k={k} />)}
            {data.body.weighins.length || Object.values(days).some(d => d.weightKg != null) ? <WeightCard /> : null}
            {present(DAILY).map(k => <HealthCard key={k} k={k} />)}
          </div>
        </section>
        <div className="flex flex-col gap-4 lg:col-span-4">
          <RingsCard />
          <SleepStagesCard />
          <FreshnessCard />
        </div>
        <section aria-labelledby="cats-h" className="lg:col-span-12">
          <h2 id="cats-h" className="mt-2 mb-3 text-[17px] font-semibold tracking-tight">Categories</h2>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {CATEGORIES.map(c => {
              const has = c.key === 'body' ? true : categoryHasData(days, c.key);
              return (
                <li key={c.key}>
                  <Link to={`/health/${c.key}`} className="flex min-h-[64px] items-center gap-3 rounded-card bg-surface-2 p-3 shadow-card transition-shadow hover:shadow-pop">
                    <CategoryIcon cat={c.key} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{c.label}</span>
                      <span className="block truncate text-[12px] text-muted">{has ? c.blurb : 'No data yet'}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
