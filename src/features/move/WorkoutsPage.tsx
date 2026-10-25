import { Footprints, Plus, Watch } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData, useGoals, useToday } from '@/app/store';
import { activityLabel, allActivities, fmtDur, isRun, pace, sum, tenKProjection } from '@/core/calc';
import { addDays, fmtRelative, fmtShort } from '@/core/dates';
import { TimeChart } from '@/components/charts';
import { EmptyState, KV, PageHeader, RowLink } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/misc';
import { cn, fmt } from '@/lib/utils';
import { ActivitySheet } from './ActivitySheet';

export function WorkoutsPage() {
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const [adding, setAdding] = useState(false);
  const acts = useMemo(() => allActivities(data), [data]);
  const runs = acts.filter(a => isRun(a.type) && pace(a)).slice().reverse();
  const proj = tenKProjection(acts, today);
  const goalSec = g.tenKGoalMin * 60;
  const last4 = runs.filter(r => r.date >= addDays(today, -27));
  const paceRows = runs.map(r => ({ date: r.date, pace: Math.round(pace(r)!) }));

  return (
    <div>
      <PageHeader back="/health/activity" kicker="Activity" title="Workouts" actions={<Button variant="primary" onClick={() => setAdding(true)}><Plus /> Log activity</Button>} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-12">
          <KV k="10 km goal" v={fmtDur(goalSec)} sub={`${fmtDur(goalSec / 10)} /km`} />
          <KV k="Projected 10 km" v={<span className={cn(proj && proj.sec <= goalSec && 'text-good')}>{proj ? fmtDur(proj.sec) : '–'}</span>} sub={proj ? `from ${activityLabel(proj.from)}, ${fmtShort(proj.from.date)}` : 'log a run of 2 km+'} />
          <KV k="Runs, 4 weeks" v={last4.length} sub={`${fmt(sum(last4.map(r => r.distanceKm)), 1)} km total`} />
          <KV k="Best pace, 6 weeks" v={(() => { const ps = runs.filter(r => r.date >= addDays(today, -41)).map(r => pace(r)!); return ps.length ? fmtDur(Math.min(...ps)) : '–'; })()} sub="min/km" />
        </div>
        <Card className="lg:col-span-7">
          <CardHeader title="Run pace" meta="min per km, lower is faster" />
          <CardBody>
            <TimeChart data={paceRows} height={300} goal={{ value: goalSec / 10, label: `Goal ${fmtDur(goalSec / 10)}` }}
              series={[{ key: 'pace', label: 'Pace', kind: 'line', color: 'track', format: v => `${fmtDur(v)} /km` }]}
              yFormat={v => fmtDur(v)} timeAxis ariaLabel="Running pace per run against the goal pace" empty="Log a run to see your pace trend." />
            <p className="mt-3 text-[13px] text-muted">The projection uses Riegel’s formula (T₂ = T₁ × (10 / d)^1.06) on your best run of 2 km+ in the last 6 weeks. It is optimistic for runs much shorter than 10 km.</p>
          </CardBody>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader title="Activities" meta={`${acts.length} total`} />
          <CardBody className="pt-1">
            {acts.length ? (
              <ul className="-mx-2 max-h-[520px] overflow-y-auto">
                {acts.slice(0, 40).map(a => (
                  <li key={a.id}>
                    <RowLink to={`/health/workout/${encodeURIComponent(a.id)}`}>
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lane-soft text-lane-ink">
                        {a.source === 'Apple Watch' ? <Watch aria-hidden className="size-5" /> : <Footprints aria-hidden className="size-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-semibold"><span className="truncate">{a.type}</span>{a.merged ? <Badge tone="lane" className="h-5 px-2">+ Watch</Badge> : null}</div>
                        <div className="truncate text-[13px] text-muted">{fmtRelative(a.date, today)}{a.avgHr ? ` · ${a.avgHr} bpm` : ''}{a.source === 'Apple Watch' ? ' · Apple Watch' : ''}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="num text-lg leading-none font-semibold">{a.distanceKm ? `${fmt(a.distanceKm, 2)} km` : fmtDur(a.durationSec)}</div>
                        <div className="text-[13px] text-muted">{pace(a) ? `${fmtDur(pace(a))} /km` : a.distanceKm ? fmtDur(a.durationSec) : ''}</div>
                      </div>
                    </RowLink>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Footprints />} title="No activities yet" action={<Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus /> Log a run</Button>}>
                Log runs here, or import Apple Health to pull in watch workouts.
              </EmptyState>
            )}
          </CardBody>
        </Card>
      </div>
      <ActivitySheet open={adding} onOpenChange={setAdding} />
    </div>
  );
}
