import { Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { engine, useData, useGoals, useToday } from '@/app/store';
import { NotFound } from '@/app/NotFound';
import { allActivities, fmtDur, isRun, pace, riegel10k } from '@/core/calc';
import { fmtDay, fmtRelative, fmtShort } from '@/core/dates';
import { TimeChart } from '@/components/charts';
import { KV, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/misc';
import { Confirm } from '@/components/ui/sheet';
import { cn, fmt } from '@/lib/utils';
import { ActivitySheet } from './ActivitySheet';

export function ActivityPage() {
  const { id } = useParams();
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const acts = useMemo(() => allActivities(data), [data]);
  const a = acts.find(x => x.id === id);
  if (!a) return <NotFound />;
  const logged = a.source === 'Logged' ? data.activities.activities.find(x => x.id === a.id) : undefined;
  const p = pace(a);
  const run = isRun(a.type);
  const proj = run && a.distanceKm ? riegel10k(a.durationSec, a.distanceKm) : null;
  const goalSec = g.tenKGoalMin * 60;
  const sameType = acts.filter(x => x.type === a.type && pace(x)).slice().reverse();
  const rank = p ? sameType.filter(x => pace(x)! < p).length + 1 : null;
  const rows = sameType.map(x => ({ date: x.date, pace: Math.round(pace(x)!), sel: x.id === a.id ? Math.round(pace(x)!) : null }));

  return (
    <div>
      <PageHeader back="/move" kicker={`${fmtDay(a.date)} · ${fmtRelative(a.date, today)}`} title={a.distanceKm ? `${a.type} ${fmt(a.distanceKm, 1)} km` : a.type}
        actions={logged ? <>
          <Button variant="secondary" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
          <Button variant="danger-ghost" onClick={() => setDeleting(true)}><Trash2 /> Delete</Button>
        </> : <Badge tone="lane">From Apple Watch · read-only</Badge>} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-12">
          <KV k="Distance" v={a.distanceKm ? fmt(a.distanceKm, 2) : '–'} sub="km" />
          <KV k="Time" v={fmtDur(a.durationSec)} sub={a.watchStart ? `started ${a.watchStart.slice(11, 16)}` : ' '} />
          <KV k="Pace" v={p ? fmtDur(p) : '–'} sub={p && rank ? `min/km · #${rank} of ${sameType.length}` : 'min/km'} />
          <KV k="Avg HR" v={a.avgHr ?? '–'} sub={a.kcal ? `bpm · ${fmt(a.kcal)} kcal` : 'bpm'} />
        </div>
        {run ? (
          <Card className="lg:col-span-5">
            <CardHeader title="10 km projection" meta="Riegel’s formula from this run" />
            <CardBody>
              <div className="num text-[52px] leading-none font-semibold">{proj ? fmtDur(proj) : '–'}</div>
              {proj ? (
                <p className={cn('mt-1 font-semibold', proj <= goalSec ? 'text-good' : 'text-track-ink')}>
                  {proj <= goalSec ? `${fmtDur(goalSec - proj)} under your ${fmtDur(goalSec)} goal` : `${fmtDur(proj - goalSec)} slower than your ${fmtDur(goalSec)} goal`}
                </p>
              ) : <p className="mt-1 text-sm text-muted">Needs a distance.</p>}
              <p className="mt-3 text-[13px] text-muted">Goal pace {fmtDur(goalSec / 10)} /km. {a.distanceKm && a.distanceKm < 5 ? 'Projections from runs under 5 km tend to be optimistic.' : ''}</p>
            </CardBody>
          </Card>
        ) : null}
        <Card className={run ? 'lg:col-span-7' : 'lg:col-span-12'}>
          <CardHeader title={`${a.type} pace history`} meta={rows.length > 1 ? 'This activity highlighted' : undefined} />
          <CardBody>
            <TimeChart data={rows} height={260} goal={run ? { value: goalSec / 10, label: `Goal ${fmtDur(goalSec / 10)}` } : null}
              series={[
                { key: 'pace', label: 'Pace', kind: 'line', color: 'track', format: v => `${fmtDur(v)} /km` },
                { key: 'sel', label: 'This one', kind: 'dots', color: 'lane', format: v => `${fmtDur(v)} /km` },
              ]}
              yFormat={v => fmtDur(v)} ariaLabel={`${a.type} pace history`} empty="Needs distance and time to chart pace." />
          </CardBody>
        </Card>
        <Card className="lg:col-span-12">
          <CardHeader title="Details" />
          <CardBody>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4 border-b border-line/70 py-1.5"><dt className="text-muted">Source</dt><dd className="font-semibold">{a.source}{a.merged ? ' + Apple Watch' : ''}</dd></div>
              <div className="flex justify-between gap-4 border-b border-line/70 py-1.5"><dt className="text-muted">Date</dt><dd className="font-semibold">{fmtDay(a.date)}</dd></div>
              {a.notes ? <div className="flex justify-between gap-4 border-b border-line/70 py-1.5 sm:col-span-2"><dt className="text-muted">Notes</dt><dd className="text-right font-semibold">{a.notes}</dd></div> : null}
            </dl>
            {a.merged ? <p className="pt-2 text-[13px] text-muted">The same session was also recorded by Apple Watch ({fmtShort(a.date)}); it is shown once.</p> : null}
          </CardBody>
        </Card>
      </div>
      {logged ? <ActivitySheet open={editing} onOpenChange={setEditing} activity={logged} /> : null}
      <Confirm open={deleting} onOpenChange={setDeleting} title="Delete this activity?" description={`${a.type} on ${fmtDay(a.date)}.`}
        onConfirm={() => { engine.commit('activities', [{ t: 'remove', c: 'activities', id: a.id }], 'Activity deleted'); nav('/move', { replace: true }); }} />
    </div>
  );
}
