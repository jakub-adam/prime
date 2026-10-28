import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useData, useGoals, useToday } from '@/app/store';
import { fmtDur } from '@/core/calc';
import { fmtShort } from '@/core/dates';
import { Legend, TimeChart } from '@/components/charts';
import { EmptyState, PageHeader } from '@/components/common';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/misc';
import { fmt, signed } from '@/lib/utils';
import { bestEffort, easyPaceTrend, fmtPace, watchRuns, weeklyDistance, weeklySlope } from './activity-data';
import { Stat } from './activity-ui';

const EFFORTS = [['3k', '3 km'], ['10k', '10 km'], ['5k', '5 km'], ['1k', '1 km']] as const;

export function ProgressPage() {
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const nav = useNavigate();
  const runs = useMemo(() => watchRuns(data), [data]);
  const paceOptions = useMemo(() => {
    const base = [g.easyPaceSec - 30, g.easyPaceSec, g.easyPaceSec + 30];
    return base.map(p => [String(p), `${fmtPace(p)} /km`] as const);
  }, [g.easyPaceSec]);
  const [target, setTarget] = useState(String(g.easyPaceSec));
  const trend = useMemo(() => easyPaceTrend(runs, +target), [runs, target]);
  const slope = weeklySlope(trend);
  const first = trend[0], last = trend[trend.length - 1];
  const weeks = useMemo(() => weeklyDistance(data, today, 12), [data, today]);
  const thisWeek = weeks[weeks.length - 1]!;
  const avg4 = weeks.slice(-5, -1).reduce((s, w) => s + w.run, 0) / 4;
  const [effort, setEffort] = useState<'3k' | '10k' | '5k' | '1k'>('3k');
  const effortRows = runs.filter(r => r.workout.bestEfforts?.[effort]).map(r => ({ date: r.date, id: r.id, sec: r.workout.bestEfforts![effort]! }));

  return (
    <div>
      <PageHeader back="/activity" kicker="Activity" title="Progress" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <Card className="lg:col-span-12">
          <CardHeader title={`Heart rate at ${fmtPace(+target)} /km`} meta="Average HR while running at this pace (±20 s), after a 3-minute warm-up. Lower means fitter."
            action={<Segmented size="sm" label="Easy pace" value={target} onChange={setTarget} options={paceOptions} />} />
          <CardBody>
            {trend.length ? (
              <>
                <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Latest" value={Math.round(last!.bpm)} unit="bpm" />
                  <Stat label="First" value={Math.round(first!.bpm)} unit="bpm" />
                  <Stat label="Change" value={trend.length > 1 ? signed(last!.bpm - first!.bpm, 0) : '–'} unit="bpm" />
                  <Stat label="Trend" value={slope != null ? signed(slope, 1) : '–'} unit="bpm/week" />
                </div>
                <TimeChart data={trend.map(t => ({ date: t.date, bpm: t.bpm }))} height={280} onSelect={d => { const t = trend.find(x => x.date === d); if (t) nav(`/activity/${encodeURIComponent(t.id)}`); }}
                  series={[{ key: 'bpm', label: 'HR', kind: 'line', color: 'heart', format: v => `${fmt(v)} bpm` }]}
                  ariaLabel={`Average heart rate at ${fmtPace(+target)} per km, per run`} />
              </>
            ) : (
              <EmptyState title={`No runs at about ${fmtPace(+target)} /km yet`}>
                Each imported watch run with heart rate adds a point here when at least a minute of it was within 20 s/km of this pace. Try another pace above, or change the default in Settings.
              </EmptyState>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader title="Best efforts" meta="Fastest stretch of each distance inside any run"
            action={<Segmented size="sm" label="Distance" value={effort} onChange={setEffort} options={EFFORTS} />} />
          <CardBody>
            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {EFFORTS.map(([k, label]) => {
                const b = bestEffort(runs, k);
                return (
                  <div key={k}>
                    <Stat label={label} value={b ? fmtDur(b.sec) : '–'} />
                    <div className="text-[13px] text-muted">{b ? <Link className="hover:underline" to={`/activity/${encodeURIComponent(b.run.id)}`}>{fmtShort(b.run.date)} · {fmtPace(b.sec / parseFloat(k))} /km</Link> : 'no run that long yet'}</div>
                  </div>
                );
              })}
            </div>
            <TimeChart data={effortRows.map(r => ({ date: r.date, sec: r.sec }))} height={240} timeAxis
              series={[{ key: 'sec', label: EFFORTS.find(([k]) => k === effort)![1], kind: 'line', color: 'track', format: v => fmtDur(v) }]}
              yFormat={v => fmtDur(v)} ariaLabel={`Best ${effort} time per run`}
              onSelect={d => { const r = effortRows.find(x => x.date === d); if (r) nav(`/activity/${encodeURIComponent(r.id)}`); }}
              empty={`No run of ${EFFORTS.find(([k]) => k === effort)![1]} or longer yet.`} />
          </CardBody>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="Weekly distance" meta="Last 12 weeks, Monday to Sunday" />
          <CardBody>
            <div className="mb-4 grid grid-cols-3 gap-4">
              <Stat label="This week" value={fmt(thisWeek.run, 1)} unit="km run" />
              <Stat label="4-week avg" value={fmt(avg4, 1)} unit="km" />
              <Stat label="Walked" value={fmt(thisWeek.walk, 1)} unit="km" />
            </div>
            <TimeChart data={weeks} height={240} zero
              series={[
                { key: 'run', label: 'Running', kind: 'bar', color: 'track', format: v => `${fmt(v, 1)} km` },
                { key: 'walk', label: 'Walking', kind: 'bar', color: 'muted', format: v => `${fmt(v, 1)} km` },
              ]}
              ariaLabel="Running and walking distance per week" />
            <div className="mt-2"><Legend items={[{ label: 'Running', color: 'track', kind: 'bar' }, { label: 'Walking', color: 'muted', kind: 'bar' }]} /></div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
