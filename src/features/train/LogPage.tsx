import { Plus, Save, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { drafts, engine, useData, useDraft } from '@/app/store';
import { blankEx, draftToSession, EXERCISES, fmtSet, KIND_LABEL, lastOf, recentSessionNames, type Draft, type DraftExercise } from '@/core/calc';
import { fmtShort } from '@/core/dates';
import { uid } from '@/core/ops';
import type { ExerciseKind } from '@/core/types';
import { PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Confirm } from '@/components/ui/sheet';
import { WorkoutPicker } from './StartWorkoutSheet';

export function LogPage() {
  const draft = useDraft();
  if (!draft) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader back="/train" kicker="Training" title="Start workout" />
        <Card>
          <CardHeader title="Pick a session" meta="Exercises from your last session with the same name are filled in, with last time’s numbers as hints." />
          <CardBody><WorkoutPicker /></CardBody>
        </Card>
      </div>
    );
  }
  return <DraftEditor draft={draft} />;
}

function DraftEditor({ draft: d }: { draft: Draft }) {
  const data = useData();
  const nav = useNavigate();
  const sessions = data.training.sessions;
  const [newEx, setNewEx] = useState('');
  const [discarding, setDiscarding] = useState(false);
  const update = (fn: (x: Draft) => void) => {
    const next: Draft = structuredClone(d);
    fn(next);
    drafts.set(next);
  };
  const addEx = () => {
    const v = newEx.trim();
    if (!v) return;
    update(x => { x.exercises.push(blankEx(sessions, v)); });
    setNewEx('');
    setTimeout(() => document.getElementById(`ex${d.exercises.length}-s0-a`)?.focus(), 30);
  };
  const save = () => {
    const rec = draftToSession(d, uid);
    if (typeof rec === 'string') { toast.error(rec); return; }
    drafts.set(null);
    engine.commit('training', [{ t: 'upsert', c: 'sessions', r: rec }], d.id ? 'Session updated' : 'Session saved');
    nav(`/train/session/${encodeURIComponent(rec.id)}`, { replace: true });
  };
  const exOptions = [...new Set([...sessions.flatMap(x => x.exercises.map(e => e.name)), ...EXERCISES])];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back="/train" kicker={d.id ? 'Edit session' : 'Log session'} title={d.name || 'Workout'}
        actions={<>
          <Button variant="danger-ghost" onClick={() => setDiscarding(true)}><Trash2 /> Discard</Button>
          <Button variant="primary" onClick={save} className="max-sm:hidden"><Save /> Save session</Button>
        </>} />
      <div className="space-y-4">
        <Card>
          <CardBody className="grid grid-cols-2 gap-3 pt-4">
            <Field label="Date">{id => <Input id={id} type="date" value={d.date} onChange={e => update(x => { x.date = e.target.value; })} />}</Field>
            <Field label="Session">{id => <Input id={id} list="dl-sessions" value={d.name} placeholder="Upper A" onChange={e => update(x => { x.name = e.target.value; })} />}</Field>
          </CardBody>
        </Card>

        {d.exercises.map((ex, ei) => (
          <ExerciseBlock key={ei} ex={ex} ei={ei} date={d.date} update={update} exOptions={exOptions} />
        ))}

        <Card>
          <CardBody className="pt-4">
            <div className="flex gap-2">
              <Input list="dl-ex" value={newEx} onChange={e => setNewEx(e.target.value)} placeholder="Add exercise, e.g. Weighted dips" aria-label="Exercise to add" autoComplete="off"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEx(); } }} />
              <Button variant="secondary" onClick={addEx}><Plus /> Add</Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="pt-4">
            <Field label="Notes">{id => <Textarea id={id} value={d.notes} placeholder="How it felt, RPE, anything to remember" onChange={e => update(x => { x.notes = e.target.value; })} />}</Field>
          </CardBody>
        </Card>

        <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 sm:hidden">
          <Button variant="primary" size="lg" className="w-full shadow-pop" onClick={save}><Save /> Save session</Button>
        </div>
      </div>
      <datalist id="dl-ex">{exOptions.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="dl-sessions">{recentSessionNames(sessions).map(n => <option key={n} value={n} />)}</datalist>
      <Confirm open={discarding} onOpenChange={setDiscarding} title="Discard this workout?" description="Nothing from it will be saved." confirmLabel="Discard"
        onConfirm={() => { drafts.set(null); nav('/train', { replace: true }); }} />
    </div>
  );
}

function ExerciseBlock({ ex, ei, date, update, exOptions }: {
  ex: DraftExercise; ei: number; date: string; update: (fn: (x: Draft) => void) => void; exOptions: string[];
}) {
  const sessions = useData().training.sessions;
  const last = lastOf(sessions, ex.name, date);
  const [aKey, aLbl, bKey, bLbl] = ex.kind === 'weight' ? (['kg', 'kg', 'reps', 'reps'] as const) : ex.kind === 'hold' ? (['sec', 'seconds', 'kg', '+kg'] as const) : (['reps', 'reps', 'kg', '+kg'] as const);
  const setEx = (fn: (e: DraftExercise) => void) => update(x => { fn(x.exercises[ei]!); });
  void exOptions;
  return (
    <Card>
      <CardBody className="pt-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label={`Exercise ${ei + 1}`} className="min-w-[180px] flex-1">
            {id => <Input id={id} list="dl-ex" defaultValue={ex.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== ex.name) setEx(x => { x.name = v; }); }} />}
          </Field>
          <Field label="Type" className="w-[170px]">
            {id => <Select id={id} value={ex.kind} onChange={e => setEx(x => { x.kind = e.target.value as ExerciseKind; })}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}
          </Field>
          <Button variant="ghost" size="icon" aria-label={`Remove ${ex.name}`} onClick={() => update(x => { x.exercises.splice(ei, 1); })}><Trash2 /></Button>
        </div>
        <p className="mt-2 text-[13px] text-muted">
          {last ? <>Last ({fmtShort(last.date)}): <span className="font-semibold text-ink">{last.ex.sets.map(st => fmtSet(last.ex.kind, st)).join(' · ')}</span></> : 'First time logging this one.'}
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <div className="grid grid-cols-[28px_1fr_1fr_44px] gap-2 px-0.5 text-[12px] font-semibold tracking-wide text-muted uppercase" aria-hidden>
            <span>Set</span><span>{aLbl}</span><span>{bLbl}</span><span />
          </div>
          {ex.sets.map((st, si) => {
            const prev = last?.ex.sets[si];
            const input = (key: 'kg' | 'reps' | 'sec', lbl: string, suffix: string) => (
              <Input
                id={`ex${ei}-s${si}-${suffix}`}
                type="number"
                inputMode="decimal"
                min={0}
                step={key === 'kg' ? 0.5 : 1}
                value={st[key] ?? ''}
                placeholder={prev && prev[key] != null ? `${prev[key]}` : lbl}
                aria-label={`Set ${si + 1} ${lbl}`}
                className="num text-[18px]"
                onChange={e => setEx(x => { x.sets[si]![key] = e.target.value; })}
              />
            );
            return (
              <div key={si} className="grid grid-cols-[28px_1fr_1fr_44px] items-center gap-2">
                <span className="num text-center text-lg font-semibold text-muted">{si + 1}</span>
                {input(aKey, aLbl, 'a')}
                {input(bKey, bLbl, 'b')}
                <Button variant="ghost" size="icon" aria-label={`Remove set ${si + 1}`} onClick={() => setEx(x => { x.sets.splice(si, 1); })}><X /></Button>
              </div>
            );
          })}
        </div>
        <Button variant="subtle" size="sm" className="mt-3" onClick={() => setEx(x => {
          const p = x.sets[x.sets.length - 1] ?? { reps: '', kg: '', sec: '' };
          x.sets.push({ reps: p.reps || '', kg: p.kg || '', sec: p.sec || '' });
        })}><Plus /> Set</Button>
      </CardBody>
    </Card>
  );
}
