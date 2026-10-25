import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { engine, useToday } from '@/app/store';
import { fmtDur, num, pace, parseDur } from '@/core/calc';
import { uid } from '@/core/ops';
import type { Activity } from '@/core/types';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';

const TYPES = ['Run', 'Walk', 'Sprints', 'Hike', 'Swim', 'Bike', 'Other'];

export function ActivitySheet({ open, onOpenChange, activity, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; activity?: Activity | null; onSaved?: (id: string) => void }) {
  const today = useToday();
  const [f, setF] = useState({ date: today, type: 'Run', dist: '', dur: '', hr: '', notes: '' });
  useEffect(() => {
    if (!open) return;
    setF(activity
      ? { date: activity.date, type: activity.type, dist: activity.distanceKm != null ? String(activity.distanceKm) : '', dur: fmtDur(activity.durationSec), hr: activity.avgHr != null ? String(activity.avgHr) : '', notes: activity.notes || '' }
      : { date: today, type: 'Run', dist: '', dur: '', hr: '', notes: '' });
  }, [open, activity, today]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }));
  const p = pace({ distanceKm: num(f.dist), durationSec: parseDur(f.dur) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const durationSec = parseDur(f.dur);
    if (!durationSec) { toast.error('Enter the time as mm:ss.'); return; }
    const rec: Activity = { ...(activity ?? {}), id: activity ? activity.id : `${f.date}_${uid()}`, date: f.date, type: f.type, durationSec };
    const dkm = num(f.dist), hr = num(f.hr);
    if (dkm) rec.distanceKm = dkm; else delete rec.distanceKm;
    if (hr) rec.avgHr = Math.round(hr); else delete rec.avgHr;
    if (f.notes.trim()) rec.notes = f.notes.trim(); else delete rec.notes;
    engine.commit('activities', [{ t: 'upsert', c: 'activities', r: rec }], activity ? 'Activity updated' : 'Activity saved');
    onOpenChange(false);
    onSaved?.(rec.id);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={activity ? 'Edit activity' : 'Log activity'}
      footer={<>
        <span className="mr-auto self-center text-sm text-muted max-md:hidden" aria-live="polite">{p ? `Pace ${fmtDur(p)} /km` : ''}</span>
        <Button variant="secondary" className="max-md:flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" type="submit" form="a-form" className="max-md:flex-1">Save</Button>
      </>}>
      <form id="a-form" onSubmit={submit} className="grid grid-cols-2 gap-3 pt-1">
        <Field label="Date">{id => <Input id={id} type="date" value={f.date} max={today} onChange={set('date')} />}</Field>
        <Field label="Type">{id => <Select id={id} value={f.type} onChange={set('type')}>{[...new Set([...TYPES, f.type])].map(t => <option key={t}>{t}</option>)}</Select>}</Field>
        <Field label="Distance (km)">{id => <Input id={id} type="number" inputMode="decimal" step={0.01} min={0} placeholder="5.00" value={f.dist} onChange={set('dist')} />}</Field>
        <Field label="Time" hint={p ? <span className="md:hidden">Pace {fmtDur(p)} /km</span> : undefined}>{id => <Input id={id} inputMode="numeric" placeholder="mm:ss" pattern="[0-9:]*" required value={f.dur} onChange={set('dur')} />}</Field>
        <Field label="Avg HR (bpm)">{id => <Input id={id} type="number" inputMode="numeric" min={40} max={230} placeholder="bpm" value={f.hr} onChange={set('hr')} />}</Field>
        <Field label="Notes">{id => <Input id={id} placeholder="Easy pace, felt good" value={f.notes} onChange={set('notes')} />}</Field>
      </form>
    </Sheet>
  );
}
