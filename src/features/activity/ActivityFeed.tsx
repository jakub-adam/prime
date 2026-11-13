import { Bike, Footprints, HeartPulse, MapPinOff, Plus, TrendingUp, Upload, Watch, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useData, useGoals, useToday } from '@/app/store';
import { fmtDur, sum } from '@/core/calc';
import { addDays, fmtDay, fmtRelative, mondayOf } from '@/core/dates';
import { Legend, TimeChart } from '@/components/charts';
import { EmptyState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { HealthImporter } from '@/features/health/HealthImporter';
import { ActivitySheet } from '@/features/move/ActivitySheet';
import { cn, fmt } from '@/lib/utils';
import { easyPaceTrend, feedItems, fmtClock, fmtPace, SPORT_FILTERS, watchRuns, weeklyDistance, type FeedItem, type Sport } from './activity-data';
import { RoutePreview } from './RoutePreview';

/* The Activity tab is cardio only: runs, walks and rides with their route, pace and heart rate.
   Strength sessions live in Train. */

const ICON: Record<Sport, LucideIcon> = { run: Footprints, walk: Footprints, ride: Bike, strength: HeartPulse, other: HeartPulse };
const SPORT_TAG: Record<Sport, string> = { run: 'Run', walk: 'Walk', ride: 'Ride', strength: 'Strength', other: 'Workout' };

function CardStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="num truncate text-[20px] leading-tight font-semibold">{value}{unit ? <span className="ml-0.5 text-[12px] font-normal text-muted">{unit}</span> : null}</div>
    </div>
  );
}

export function ActivityCard({ item, privacyM, today }: { item: FeedItem; privacyM: number; today: string }) {
  const Icon = ICON[item.sport];
  const when = `${fmtRelative(item.date, today)}${item.startMs != null ? ` · ${fmtClock(item.startMs)}` : ''}`;
  const stats: [string, string, string?][] = [];
  if (item.distanceKm) stats.push(['Distance', fmt(item.distanceKm, 2), 'km']);
  if (item.pace) stats.push(['Pace', fmtPace(item.pace), '/km']);
  if (item.durationSec) stats.push(['Time', fmtDur(item.durationSec)]);
  stats.push(['Avg HR', item.avgHr ? String(item.avgHr) : '–', item.avgHr ? 'bpm' : undefined]);
  const preview = item.workout?.routePreview;
  return (
    <Link to={item.to} className="group flex min-h-[112px] items-center gap-4 rounded-card bg-surface p-3.5 shadow-card transition-shadow duration-200 hover:shadow-pop sm:gap-5 sm:p-4">
      {preview ? (
        <RoutePreview encoded={preview} privacyM={privacyM} className="size-[88px] shrink-0 rounded-[10px] bg-surface-2 text-ink shadow-card sm:h-24 sm:w-32" />
      ) : (
        <span aria-hidden className="grid size-[88px] shrink-0 place-items-center rounded-[10px] bg-surface-2 text-muted shadow-card sm:h-24 sm:w-32">
          {item.workout ? <MapPinOff className="size-5" /> : <Icon className="size-5" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <h3 className="truncate text-[15px] leading-tight font-medium first-letter:uppercase">{item.title}</h3>
          <span className="rounded-[5px] px-1.5 text-[11px] leading-[18px] text-muted shadow-card">{SPORT_TAG[item.sport]}</span>
          <span className="num ml-auto flex items-center gap-1.5 text-[12px] text-muted">
            {when}
            {item.workout ? <><Watch aria-hidden className="size-3.5" /><span className="sr-only">Apple Watch</span></> : <span>· Logged</span>}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 min-[440px]:grid-cols-4">
          {stats.map(([l, v, u]) => <CardStat key={l} label={l} value={v} {...(u ? { unit: u } : {})} />)}
        </div>
      </div>
    </Link>
  );
}

function WeekCard({ items, today }: { items: FeedItem[]; today: string }) {
  const mon = mondayOf(today);
  const wk = items.filter(i => i.date >= mon && i.date <= today);
  const last = items.filter(i => i.date >= addDays(mon, -7) && i.date < mon);
  return (
    <Card>
      <CardHeader title="This week" action={<span className="text-[12px] text-muted">Last week {fmt(sum(last.map(i => i.distanceKm)), 1)} km</span>} />
      <CardBody className="grid grid-cols-3 gap-3">
        <CardStat label="Distance" value={fmt(sum(wk.map(i => i.distanceKm)), 1)} unit="km" />
        <CardStat label="Time" value={fmtDur(sum(wk.map(i => i.durationSec)))} />
        <CardStat label="Activities" value={String(wk.length)} />
      </CardBody>
    </Card>
  );
}

function DistanceCard() {
  const data = useData();
  const today = useToday();
  const rows = useMemo(() => weeklyDistance(data, today, 8), [data, today]);
  return (
    <Card>
      <CardHeader title="Weekly distance" action={<span className="text-[12px] text-muted">Last 8 weeks</span>} />
      <CardBody>
        <TimeChart data={rows} height={150} zero ariaLabel="Running and walking distance per week for the last 8 weeks"
          series={[{ key: 'run', label: 'Run', kind: 'bar', color: 'track', format: v => `${fmt(v, 1)} km` }, { key: 'walk', label: 'Walk', kind: 'bar', color: 'muted', format: v => `${fmt(v, 1)} km` }]}
          empty="Distance appears after your first run or walk." />
        <div className="mt-2"><Legend items={[{ label: 'Run', color: 'track', kind: 'bar' }, { label: 'Walk', color: 'muted', kind: 'bar' }]} /></div>
      </CardBody>
    </Card>
  );
}

function RunningCard() {
  const data = useData();
  const g = useGoals();
  const runs = useMemo(() => watchRuns(data), [data]);
  const trend = easyPaceTrend(runs, g.easyPaceSec);
  const longest = runs.reduce<(typeof runs)[number] | null>((b, r) => (!b || (r.workout.distanceKm ?? 0) > (b.workout.distanceKm ?? 0) ? r : b), null);
  const row = (k: string, v: string, sub?: string) => (
    <div className="flex items-baseline justify-between gap-3 py-2"><dt className="text-[13px] text-muted">{k}</dt><dd className="num text-sm"><span className="font-semibold">{v}</span>{sub ? <span className="text-[12px] text-muted"> {sub}</span> : null}</dd></div>
  );
  return (
    <Card>
      <CardHeader title="Running" action={<Link to="/activity/progress" className="text-[13px] font-medium text-accent-ink hover:underline hover:underline-offset-4">Progress</Link>} />
      <CardBody className="pt-1 pb-3">
        <dl className="divide-y divide-line">
          {row(`Heart rate at ${fmtPace(g.easyPaceSec)} /km`, trend.length ? String(Math.round(trend[trend.length - 1]!.bpm)) : '–', trend.length ? 'bpm' : '')}
          {row('Longest run', longest?.workout.distanceKm ? fmt(longest.workout.distanceKm, 2) : '–', longest?.workout.distanceKm ? `km · ${fmtRelative(longest.date)}` : '')}
          {row('Runs recorded', String(runs.length))}
        </dl>
      </CardBody>
    </Card>
  );
}

export function ActivityFeed() {
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [limit, setLimit] = useState(30);
  const filter = (SPORT_FILTERS.find(([k]) => k === params.get('type'))?.[0] ?? 'all') as 'all' | Sport;
  const all = useMemo(() => feedItems(data), [data]);
  const items = filter === 'all' ? all : all.filter(i => i.sport === filter);
  // only offer filters that have something behind them
  const filters = SPORT_FILTERS.filter(([k]) => k === 'all' || k === 'run' || k === 'walk' || all.some(i => i.sport === k));

  return (
    <div>
      <PageHeader kicker="Runs, walks and rides" title="Activity"
        actions={<>
          <Button asChild variant="secondary"><Link to="/activity/progress"><TrendingUp /> Progress</Link></Button>
          <Button variant="secondary" onClick={() => setImporting(true)}><Upload /> Import</Button>
          <Button variant="primary" onClick={() => setAdding(true)}><Plus /> Log activity</Button>
        </>} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Segmented label="Activity type" value={filter} options={filters}
              onChange={v => { setLimit(30); setParams(v === 'all' ? {} : { type: v }, { replace: true }); }} />
            <span className="num text-[12px] text-muted">{items.length} {items.length === 1 ? 'activity' : 'activities'}</span>
          </div>
          {items.length ? (
            <>
              <ul className="grid grid-cols-1 gap-3">
                {items.slice(0, limit).map(i => <li key={i.key}><ActivityCard item={i} privacyM={g.routePrivacyM} today={today} /></li>)}
              </ul>
              {items.length > limit ? <Button variant="secondary" className="mt-4 w-full" onClick={() => setLimit(l => l + 30)}>Show more ({items.length - limit})</Button> : null}
            </>
          ) : (
            <EmptyState icon={<Footprints />} title={filter === 'all' ? 'No activities yet' : `No ${SPORT_FILTERS.find(([k]) => k === filter)![1].toLowerCase()} yet`}
              action={<div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" size="sm" onClick={() => setImporting(true)}><Upload /> Import Apple Health</Button>
                <Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus /> Log one</Button>
              </div>}>
              Import your Apple Health export to bring in every watch workout with its route, splits and heart rate.
            </EmptyState>
          )}
        </div>
        <aside className={cn('flex flex-col gap-4 max-lg:order-first lg:sticky lg:top-6 lg:self-start', !all.length && 'max-lg:hidden')} aria-label="Summary">
          <WeekCard items={all} today={today} />
          <div className="flex flex-col gap-4 max-lg:hidden"><DistanceCard /><RunningCard /></div>
        </aside>
      </div>
      <ActivitySheet open={adding} onOpenChange={setAdding} />
      <Sheet open={importing} onOpenChange={setImporting} title="Import Apple Health"
        description={data.health.importedAt ? `Last import ${fmtDay(data.health.importedAt.slice(0, 10))}` : 'Not imported yet'}>
        <HealthImporter onDone={() => setImporting(false)} />
      </Sheet>
    </div>
  );
}
