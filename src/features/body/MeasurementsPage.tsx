import { Pencil, Plus, Ruler, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { engine, useData } from '@/app/store';
import { byDateAsc } from '@/core/calc';
import { fmtDay } from '@/core/dates';
import type { Measurement, MeasureKey } from '@/core/types';
import { EmptyState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Confirm } from '@/components/ui/sheet';
import { cn, fmt } from '@/lib/utils';
import { MEASURES, MeasurementSheet } from './sheets';

export function useMeasureChanges() {
  const ms = [...useData().body.measurements].sort(byDateAsc);
  const firstOf = (k: MeasureKey) => ms.find(m => m[k] != null);
  const lastOf = (k: MeasureKey) => [...ms].reverse().find(m => m[k] != null);
  const rows = MEASURES.filter(([k]) => firstOf(k)).map(([k, l]) => {
    const a = firstOf(k)![k]!, b = lastOf(k)![k]!;
    return { k, l, a, b, d: b - a };
  });
  return { ms, rows };
}

export function ChangeTable({ rows }: { rows: ReturnType<typeof useMeasureChanges>['rows'] }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[300px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[12px] tracking-wide text-muted uppercase">
            <th scope="col" className="px-1 py-2 font-semibold"><span className="sr-only">Measurement</span></th>
            <th scope="col" className="px-1 py-2 text-right font-semibold">First</th>
            <th scope="col" className="px-1 py-2 text-right font-semibold">Latest</th>
            <th scope="col" className="px-1 py-2 text-right font-semibold">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.k} className="border-b border-line/70 last:border-0">
              <th scope="row" className="px-1 py-2.5 font-semibold">{r.l}</th>
              <td className="num px-1 py-2.5 text-right text-[16px]">{fmt(r.a, 1)}</td>
              <td className="num px-1 py-2.5 text-right text-[16px]">{fmt(r.b, 1)}</td>
              <td className={cn('num px-1 py-2.5 text-right text-[16px] font-semibold', r.k === 'waist' && r.d < 0 && 'text-good', r.k === 'waist' && r.d > 0 && 'text-bad')}>
                {r.d > 0 ? '+' : r.d < 0 ? '−' : ''}{fmt(Math.abs(r.d), 1)} cm
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MeasurementsPage() {
  const { ms, rows } = useMeasureChanges();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Measurement | null>(null);
  const [deleting, setDeleting] = useState<Measurement | null>(null);
  return (
    <div>
      <PageHeader back="/body" kicker="Body" title="Measurements" actions={<Button variant="primary" onClick={() => setAdding(true)}><Plus /> Add measurements</Button>} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <Card className="lg:col-span-5">
          <CardHeader title="Change since first" />
          <CardBody>
            {rows.length ? <ChangeTable rows={rows} /> : (
              <EmptyState icon={<Ruler />} title="No measurements yet" action={<Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus /> Take a baseline</Button>}>
                Take a first set as your baseline, then repeat every 2–4 weeks.
              </EmptyState>
            )}
          </CardBody>
        </Card>
        <Card className="lg:col-span-7">
          <CardHeader title="History" meta={`${ms.length} entries`} />
          <CardBody className="pt-1">
            {ms.length ? (
              <ul className="-mx-2">
                {[...ms].reverse().map(m => (
                  <li key={m.id} className="flex min-h-14 items-center gap-2 rounded-xl px-2 py-2 hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{fmtDay(m.date)}</div>
                      <div className="text-[13px] text-muted">{MEASURES.filter(([k]) => m[k] != null).map(([k, l]) => `${l} ${fmt(m[k], 1)}`).join(' · ')}</div>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Edit measurements ${fmtDay(m.date)}`} onClick={() => setEditing(m)}><Pencil /></Button>
                    <Button variant="ghost" size="icon" className="text-bad" aria-label={`Delete measurements ${fmtDay(m.date)}`} onClick={() => setDeleting(m)}><Trash2 /></Button>
                  </li>
                ))}
              </ul>
            ) : <p className="py-6 text-center text-sm text-muted">Nothing here yet.</p>}
          </CardBody>
        </Card>
      </div>
      <MeasurementSheet open={adding} onOpenChange={setAdding} />
      <MeasurementSheet open={!!editing} onOpenChange={o => { if (!o) setEditing(null); }} measurement={editing} />
      <Confirm open={!!deleting} onOpenChange={o => { if (!o) setDeleting(null); }} title="Delete these measurements?" description={deleting ? fmtDay(deleting.date) : ''}
        onConfirm={() => { if (deleting) engine.commit('body', [{ t: 'remove', c: 'measurements', id: deleting.id }], 'Deleted'); setDeleting(null); }} />
    </div>
  );
}
