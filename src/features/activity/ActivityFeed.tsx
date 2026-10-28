import { Dumbbell, Footprints, HeartPulse, Plus, TrendingUp, Upload, Watch } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useData, useGoals, useToday } from '@/app/store';
import { fmtDur, sum } from '@/core/calc';
import { addDays, fmtDay, fmtRelative, mondayOf } from '@/core/dates';
import { EmptyState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { HealthImporter } from '@/features/health/HealthImporter';
import { ActivitySheet } from '@/features/move/ActivitySheet';
import { cn, fmt } from '@/lib/utils';
import { bestEffort, easyPaceTrend, feedItems, fmtClock, fmtPace, SPORT_FILTERS, watchRuns, type FeedItem, type Sport } from './activity-data';
import { RoutePreview } from './RoutePreview';

const ICON: Record<Sport, typeof Footprints> = { run: Footprints, walk: Footprints, strength: Dumbbell, other: HeartPulse };

function CardStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</div>
      <div className="num truncate text-[22px] leading-tight font-semibold">{value}{unit ? <span className="ml-0.5 font-sans text-[12px] font-medium text-muted">{unit}</span> : null}</div>
    </div>
  );
}

export function ActivityCard({ item, privacyM, today }: { item: FeedItem; privacyM: number; today: string }) {
  const Icon = ICON[item.sport];
  const when = `${fmtRelative(item.date, today)}${item.startMs != null ? ` at ${fmtClock(item.startMs)}` : ''}`;
  const stats: [string, string, string?][] = [];
  if (item.distanceKm) stats.push(['Distance', fmt(item.distanceKm, 2), 'km']);
  if (item.pace) stats.push(['Pace', fmtPace(item.pace), '/km']);
  if (item.durationSec) stats.push(['Time', fmtDur(item.durationSec)]);
  if (item.avgHr) stats.push(['Avg HR', String(item.avgHr), 'bpm']);
  const preview = item.workout?.routePreview;
  return (
    <Link to={item.to}
      className="group flex gap-4 rounded-card border border-line/80 bg-surface p-4 shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop sm:p-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-track-soft text-track-ink"><Icon aria-hidden className="size-5" /></span>
          <div className="min-w-0">
            <h3 className="truncate text-[17px] leading-tight font-semibold">{item.title}</h3>
            <p className="truncate text-[13px] text-muted">
              {when}
              {item.workout ? <><span aria-hidden> · </span><Watch aria-hidden className="mb-0.5 inline size-3.5" /><span className="sr-only">Apple Watch</span></> : null}
              {item.act?.source === 'Logged' ? ' · Logged' : ''}
            </p>
          </div>
        </div>
        {stats.length ? (
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 min-[420px]:grid-cols-4">
            {stats.map(([l, v, u]) => <CardStat key={l} label={l} value={v} {...(u ? { unit: u } : {})} />)}
          </div>
        ) : null}
        {item.extra ? <p className="mt-3 text-sm text-muted">{item.extra}</p> : null}
      </div>
      {preview ? <RoutePreview encoded={preview} privacyM={privacyM} className="size-[84px] shrink-0 self-center rounded-xl bg-surface-2 sm:size-24" /> : null}
    </Link>
  );
}

function WeekCard({ items, today }: { items: FeedItem[]; today: string }) {
  const mon = mondayOf(today);
  const wk = items.filter(i => i.date >= mon && i.date <= today);
  const last = items.filter(i => i.date >= addDays(mon, -7) && i.date < mon);
  const km = sum(wk.map(i => i.distanceKm)), lastKm = sum(last.map(i => i.distanceKm));
  return (
    <Card>
      <CardHeader title="This week" meta={`Since Monday · last week ${fmt(lastKm, 1)} km`} />
      <CardBody className="grid grid-cols-3 gap-3">
        <CardStat label="Distance" value={fmt(km, 1)} unit="km" />
        <CardStat label="Time" value={fmtDur(sum(wk.map(i => i.durationSec)))} />
        <CardStat label="Activities" value={String(wk.length)} />
      </CardBody>
    </Card>
  );
}

function ProgressTeaser() {
  const data = useData();
  const g = useGoals();
  const runs = useMemo(() => watchRuns(data), [data]);
  const trend = easyPaceTrend(runs, g.easyPaceSec);
  const best3 = bestEffort(runs, '3k');
  return (
    <Card>
      <CardHeader title="Progress" meta={`HR at ${fmtPace(g.easyPaceSec)} /km, best efforts, weekly distance`}
        action={<Button asChild variant="ghost" size="sm" className="-mr-2 text-lane-ink"><Link to="/activity/progress"><TrendingUp /> Open</Link></Button>} />
      <CardBody className="grid grid-cols-2 gap-3">
        <CardStat label={`HR at ${fmtPace(g.easyPaceSec)}`} value={trend.length ? String(Math.round(trend[trend.length - 1]!.bpm)) : '–'} unit={trend.length ? 'bpm' : undefined} />
        <CardStat label="Best 3 km" value={best3 ? fmtDur(best3.sec) : '–'} />
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

  return (
    <div>
      <PageHeader kicker={data.health.importedAt ? `Apple Health · imported ${fmtDay(data.health.importedAt.slice(0, 10))}` : 'Apple Health and logged'} title="Activity"
        actions={<>
          <Button asChild variant="secondary"><Link to="/activity/progress"><TrendingUp /> Progress</Link></Button>
          <Button variant="secondary" onClick={() => setImporting(true)}><Upload /> Import</Button>
          <Button variant="primary" onClick={() => setAdding(true)}><Plus /> Log</Button>
        </>} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <Segmented label="Activity type" value={filter} options={SPORT_FILTERS} className="mb-4"
            onChange={v => { setLimit(30); setParams(v === 'all' ? {} : { type: v }, { replace: true }); }} />
          {items.length ? (
            <>
              <ul className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
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
        <aside className={cn('space-y-4 max-lg:order-first max-lg:grid max-lg:grid-cols-1 max-lg:gap-3 max-lg:space-y-0 sm:max-lg:grid-cols-2 lg:sticky lg:top-6 lg:self-start', !all.length && 'max-lg:hidden')} aria-label="Summary">
          <WeekCard items={all} today={today} />
          <ProgressTeaser />
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
