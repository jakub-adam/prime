import { Pencil, Plus, Scale, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { engine, useData, useGoals, useToday } from '@/app/store';
import { rollingAvg, weightSeries, type WeightPoint } from '@/core/calc';
import { addDays, daysBetween, fmtDay, fmtShort } from '@/core/dates';
import type { Weighin } from '@/core/types';
import { Legend, TimeChart } from '@/components/charts';
import { EmptyState, KV, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, Segmented } from '@/components/ui/misc';
import { Confirm } from '@/components/ui/sheet';
import { cn, fmt, signed } from '@/lib/utils';
import { WeighinSheet } from './sheets';

type Range = '7' | '30' | '90' | 'all';

export function useWeightChart(range: Range) {
  const data = useData();
  const today = useToday();
  const ws = useMemo(() => weightSeries(data), [data]);
  return useMemo(() => {
    const first = ws[0];
    const n = range === 'all' ? Math.max(14, first ? daysBetween(first.date, today) + 1 : 14) : +range;
    const start = addDays(today, -(n - 1));
    const byDay = Object.fromEntries(ws.map(p => [p.date, p.kg]));
    const rows = Array.from({ length: n }, (_, i) => {
      const d = addDays(start, i);
      const has = ws.some(p => p.date <= d && p.date > addDays(d, -7));
      return { date: d, kg: byDay[d] ?? null, avg: has ? Math.round(rollingAvg(ws, d)! * 10) / 10 : null };
    });
    return { ws, rows };
  }, [ws, range, today]);
}

export function WeightPage() {
  const g = useGoals();
  const today = useToday();
  const [range, setRange] = useState<Range>('30');
  const { ws, rows } = useWeightChart(range);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Weighin | null>(null);
  const [deleting, setDeleting] = useState<WeightPoint | null>(null);
  const data = useData();
  const now = rollingAvg(ws, today), prev = rollingAvg(ws, addDays(today, -7)), month = rollingAvg(ws, addDays(today, -28));
  const first = ws[0];
  const toGo = now != null ? now - g.goalWeight : null;
  const weekly = now != null && month != null ? (now - month) / 4 : null;
  const eta = toGo != null && toGo > 0 && weekly != null && weekly < -0.05 ? Math.ceil(toGo / -weekly) : null;
  const inRange = rows.map(r => r.kg).filter((v): v is number => v != null);

  return (
    <div>
      <PageHeader back="/body" kicker="Body" title="Weight" actions={<Button variant="primary" onClick={() => setAdding(true)}><Plus /> Add weigh-in</Button>} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-12">
          <KV k="7-day avg" v={now ? `${fmt(now, 1)}` : '–'} sub={now && prev ? `${signed(now - prev)} kg in a week` : 'needs a few weigh-ins'} />
          <KV k={`To ${fmt(g.goalWeight)} kg`} v={toGo != null ? fmt(Math.max(0, toGo), 1) : '–'} sub={toGo != null && toGo <= 0 ? 'Goal reached' : eta ? `about ${eta} weeks at this pace` : 'kg to go'} />
          <KV k="Since start" v={now && first ? signed(now - first.kg) : '–'} sub={first ? `from ${fmt(first.kg, 1)} on ${fmtShort(first.date)}` : ''} />
          <KV k="Weekly rate" v={weekly != null ? signed(weekly, 2) : '–'} sub="kg/week, last 4 weeks" />
        </div>
        <Card className="lg:col-span-8">
          <CardHeader title="Trend" meta={inRange.length ? `Range ${fmt(Math.min(...inRange), 1)}–${fmt(Math.max(...inRange), 1)} kg` : undefined}
            action={<Segmented label="Range" value={range} onChange={setRange} options={[['7', '7d'], ['30', '30d'], ['90', '90d'], ['all', 'All']]} />} />
          <CardBody>
            <TimeChart data={rows} height={320} goal={{ value: g.goalWeight, label: `Goal ${fmt(g.goalWeight)} kg` }}
              series={[
                { key: 'kg', label: 'Weigh-in', kind: 'dots', color: 'lane', format: v => `${fmt(v, 1)} kg` },
                { key: 'avg', label: '7-day avg', kind: 'line', color: 'lane', format: v => `${fmt(v, 1)} kg` },
              ]}
              ariaLabel="Bodyweight with 7-day average and goal line" empty="Log weigh-ins to see your trend." />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <Legend items={[{ label: 'Weigh-in', color: 'lane', kind: 'dot' }, { label: '7-day average', color: 'lane', kind: 'line' }, { label: 'Goal', color: 'muted', kind: 'dash' }]} />
            </div>
            <p className="mt-3 text-[13px] text-muted">Daily weight swings 1–2 kg with water and food. Aim for the average to drop about 0.3–0.5 kg a week.</p>
          </CardBody>
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader title="Weigh-ins" meta={`${ws.length} total`} />
          <CardBody className="pt-1">
            {ws.length ? (
              <ul className="-mx-2 max-h-[560px] overflow-y-auto">
                {[...ws].reverse().map((p, i, arr) => {
                  const older = arr[i + 1];
                  const d = older ? p.kg - older.kg : null;
                  const w = p.id ? data.body.weighins.find(x => x.id === p.id) : undefined;
                  return (
                    <li key={p.date} className="flex min-h-14 items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{fmtDay(p.date)}</div>
                        <div className="text-[13px] text-muted">{p.src === 'Logged' ? 'Logged' : <Badge className="h-5 px-2">Apple Health</Badge>}</div>
                      </div>
                      <div className="text-right">
                        <div className="num text-xl leading-none font-semibold">{fmt(p.kg, 1)}</div>
                        {d != null ? <div className={cn('text-[12px]', d < 0 ? 'text-good' : d > 0 ? 'text-bad' : 'text-muted')}>{signed(d)}</div> : null}
                      </div>
                      {w ? (
                        <div className="flex">
                          <Button variant="ghost" size="icon" aria-label={`Edit weigh-in ${fmtDay(p.date)}`} onClick={() => setEditing(w)}><Pencil /></Button>
                          <Button variant="ghost" size="icon" className="text-bad" aria-label={`Delete weigh-in ${fmtDay(p.date)}`} onClick={() => setDeleting(p)}><Trash2 /></Button>
                        </div>
                      ) : <div className="w-[88px]" aria-hidden />}
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyState icon={<Scale />} title="No weigh-ins yet" action={<Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus /> Add weigh-in</Button>}>Weigh in a few mornings a week to see the trend.</EmptyState>}
          </CardBody>
        </Card>
      </div>
      <WeighinSheet open={adding} onOpenChange={setAdding} />
      <WeighinSheet open={!!editing} onOpenChange={o => { if (!o) setEditing(null); }} weighin={editing} />
      <Confirm open={!!deleting} onOpenChange={o => { if (!o) setDeleting(null); }} title="Delete this weigh-in?" description={deleting ? `${fmt(deleting.kg, 1)} kg on ${fmtDay(deleting.date)}.` : ''}
        onConfirm={() => { if (deleting?.id) engine.commit('body', [{ t: 'remove', c: 'weighins', id: deleting.id }], 'Weigh-in deleted'); setDeleting(null); }} />
    </div>
  );
}
