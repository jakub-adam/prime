import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { engine, useData, useToday } from '@/app/store';
import { num } from '@/core/calc';
import { uid } from '@/core/ops';
import type { Measurement, MeasureKey, Weighin } from '@/core/types';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';

export function WeighinSheet({ open, onOpenChange, weighin }: { open: boolean; onOpenChange: (o: boolean) => void; weighin?: Weighin | null }) {
  const data = useData();
  const today = useToday();
  const [date, setDate] = useState(today);
  const [kg, setKg] = useState('');
  useEffect(() => {
    if (!open) return;
    setDate(weighin?.date ?? today);
    setKg(weighin ? String(weighin.kg) : '');
  }, [open, weighin, today]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = num(kg);
    if (!v) { toast.error('Enter your weight.'); return; }
    if (!date) { toast.error('Pick a date.'); return; }
    // One weigh-in per day: same as v1, saving on a day that has one replaces it.
    const existing = weighin && weighin.date === date ? weighin : data.body.weighins.find(w => w.date === date);
    const ops = [];
    if (weighin && weighin.date !== date) ops.push({ t: 'remove' as const, c: 'weighins', id: weighin.id });
    ops.push({ t: 'upsert' as const, c: 'weighins', r: { ...(existing ?? {}), id: existing ? existing.id : `${date}_${uid()}`, date, kg: Math.round(v * 10) / 10 } });
    engine.commit('body', ops, weighin ? 'Weigh-in updated' : 'Weigh-in saved');
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={weighin ? 'Edit weigh-in' : 'Add weigh-in'} description="Weigh in the morning after the toilet, before food or water."
      footer={<>
        <Button variant="secondary" className="max-md:flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" type="submit" form="w-form" className="max-md:flex-1">Save</Button>
      </>}>
      <form id="w-form" onSubmit={submit} className="grid grid-cols-2 gap-3 pt-1">
        <Field label="Date">{id => <Input id={id} type="date" value={date} max={today} onChange={e => setDate(e.target.value)} />}</Field>
        <Field label="Weight (kg)">{id => <Input id={id} type="number" inputMode="decimal" step={0.1} min={30} max={250} placeholder="85.0" required value={kg} onChange={e => setKg(e.target.value)} className="num text-[18px]" autoFocus />}</Field>
      </form>
    </Sheet>
  );
}

export const MEASURES: [MeasureKey, string][] = [['waist', 'Waist'], ['chest', 'Chest'], ['arm', 'Arm'], ['thigh', 'Thigh'], ['hips', 'Hips'], ['neck', 'Neck']];

export function MeasurementSheet({ open, onOpenChange, measurement }: { open: boolean; onOpenChange: (o: boolean) => void; measurement?: Measurement | null }) {
  const today = useToday();
  const [date, setDate] = useState(today);
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setDate(measurement?.date ?? today);
    setVals(Object.fromEntries(MEASURES.map(([k]) => [k, measurement?.[k] != null ? String(measurement[k]) : ''])));
  }, [open, measurement, today]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const rec: Measurement = { ...(measurement ?? {}), id: measurement ? measurement.id : `${date}_${uid()}`, date };
    for (const [k] of MEASURES) { const v = num(vals[k]); if (v != null) rec[k] = v; else delete rec[k]; }
    if (!MEASURES.some(([k]) => rec[k] != null)) { toast.error('Enter at least one measurement.'); return; }
    engine.commit('body', [{ t: 'upsert', c: 'measurements', r: rec }], measurement ? 'Measurements updated' : 'Measurements saved');
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={measurement ? 'Edit measurements' : 'Add measurements'} description="Measure relaxed, same time of day, tape snug but not tight. Waist at the navel."
      footer={<>
        <Button variant="secondary" className="max-md:flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" type="submit" form="m-form" className="max-md:flex-1">Save</Button>
      </>}>
      <form id="m-form" onSubmit={submit} className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-3">
        <Field label="Date" className="col-span-2 sm:col-span-3">{id => <Input id={id} type="date" value={date} max={today} onChange={e => setDate(e.target.value)} />}</Field>
        {MEASURES.map(([k, l]) => (
          <Field key={k} label={`${l} (cm)`}>{id => <Input id={id} type="number" inputMode="decimal" step={0.1} min={0} placeholder="cm" value={vals[k] ?? ''} onChange={e => setVals(s => ({ ...s, [k]: e.target.value }))} />}</Field>
        ))}
      </form>
    </Sheet>
  );
}
