import { Plus, Ruler } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useGoals, useToday } from '@/app/store';
import { rollingAvg } from '@/core/calc';
import { addDays, fmtShort } from '@/core/dates';
import { Legend, TimeChart } from '@/components/charts';
import { EmptyState, KV, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { fmt, signed } from '@/lib/utils';
import { ChangeTable, useMeasureChanges } from './MeasurementsPage';
import { MeasurementSheet, WeighinSheet } from './sheets';
import { useWeightChart } from './WeightPage';

export function BodyOverview() {
  const g = useGoals();
  const today = useToday();
  const { ws, rows } = useWeightChart('90');
  const { ms, rows: changes } = useMeasureChanges();
  const [weighing, setWeighing] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const now = rollingAvg(ws, today), prev = rollingAvg(ws, addDays(today, -7));
  const last = ws[ws.length - 1];
  const waist = changes.find(r => r.k === 'waist');
  return (
    <div>
      <PageHeader kicker="Body" title="Body" actions={<Button variant="primary" onClick={() => setWeighing(true)}><Plus /> Add weigh-in</Button>} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-12">
          <KV k="7-day avg" v={now ? fmt(now, 1) : '–'} sub={now && prev ? `${signed(now - prev)} kg vs last week` : 'kg'} />
          <KV k={`To ${fmt(g.goalWeight)} kg`} v={now ? fmt(Math.max(0, now - g.goalWeight), 1) : '–'} sub="kg to go" />
          <KV k="Last weigh-in" v={last ? fmt(last.kg, 1) : '–'} sub={last ? fmtShort(last.date) : 'none yet'} />
          <KV k="Waist" v={waist ? fmt(waist.b, 1) : '–'} sub={waist ? `${waist.d > 0 ? '+' : waist.d < 0 ? '−' : ''}${fmt(Math.abs(waist.d), 1)} cm since first` : 'cm'} />
        </div>
        <Card className="lg:col-span-8">
          <CardHeader title={<Link to="/body/weight" className="hover:underline hover:underline-offset-4">Weight, 90 days</Link>}
            action={<Button asChild variant="secondary" size="sm"><Link to="/body/weight">Weight details</Link></Button>} />
          <CardBody>
            <TimeChart data={rows} height={300} goal={{ value: g.goalWeight, label: `Goal ${fmt(g.goalWeight)} kg` }}
              series={[
                { key: 'kg', label: 'Weigh-in', kind: 'dots', color: 'lane', format: v => `${fmt(v, 1)} kg` },
                { key: 'avg', label: '7-day avg', kind: 'line', color: 'lane', format: v => `${fmt(v, 1)} kg` },
              ]}
              ariaLabel="Bodyweight over 90 days with 7-day average" empty="Log weigh-ins to see your trend." />
            <div className="mt-3"><Legend items={[{ label: 'Weigh-in', color: 'lane', kind: 'dot' }, { label: '7-day average', color: 'lane', kind: 'line' }, { label: 'Goal', color: 'muted', kind: 'dash' }]} /></div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader title={<Link to="/body/measurements" className="hover:underline hover:underline-offset-4">Measurements</Link>} meta={ms.length ? `${ms.length} entries` : undefined}
            action={<Button variant="secondary" size="sm" onClick={() => setMeasuring(true)}><Plus /> Add</Button>} />
          <CardBody>
            {changes.length ? (
              <>
                <ChangeTable rows={changes} />
                <Button asChild variant="ghost" size="sm" className="mt-2 w-full text-lane-ink"><Link to="/body/measurements">All measurements</Link></Button>
              </>
            ) : (
              <EmptyState icon={<Ruler />} title="No measurements yet" action={<Button variant="primary" size="sm" onClick={() => setMeasuring(true)}><Plus /> Take a baseline</Button>}>
                Waist, chest, arm and more. Repeat every 2–4 weeks.
              </EmptyState>
            )}
          </CardBody>
        </Card>
      </div>
      <WeighinSheet open={weighing} onOpenChange={setWeighing} />
      <MeasurementSheet open={measuring} onOpenChange={setMeasuring} />
    </div>
  );
}
