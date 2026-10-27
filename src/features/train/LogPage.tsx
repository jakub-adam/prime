import { DropdownMenu } from 'radix-ui';
import { Check, ChevronDown, Clock, Layers, MoreHorizontal, Plus, Timer, Trash2, Weight, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { drafts, engine, useData, useDraft } from '@/app/store';
import { blankEx, draftToSession, fmtSet, KIND_LABEL, lastOf, num, recentSessionNames, type Draft, type DraftExercise, type DraftSet } from '@/core/calc';
import { fmtShort } from '@/core/dates';
import { exerciseInfo, MUSCLE_LABEL } from '@/core/exercises';
import { uid } from '@/core/ops';
import type { ExerciseKind, SetEntry } from '@/core/types';
import { ExerciseIcon } from '@/components/ExerciseIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Confirm, Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { WorkoutPicker } from './StartWorkoutSheet';
import { ExercisePicker } from './ExercisePicker';
import { fmtVolume } from './train-ui';

const REST_OPTIONS = [0, 60, 90, 120, 150, 180, 240];
const DEFAULT_REST = 120;
const pad = (n: number) => String(n).padStart(2, '0');
const clockOf = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}` : `${Math.floor(sec / 60)}:${pad(sec % 60)}`);
const restLabel = (s: number) => (s ? (s % 60 ? `${Math.floor(s / 60)}:${pad(s % 60)}` : `${s / 60} min`) : 'Off');

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const setVolume = (kind: ExerciseKind, st: DraftSet) => (kind === 'weight' ? (num(st.kg) ?? 0) * (num(st.reps) ?? 0) : 0);
const hasValue = (kind: ExerciseKind, st: DraftSet) => (kind === 'hold' ? num(st.sec) != null : num(st.reps) != null);

export function LogPage() {
  const draft = useDraft();
  if (!draft) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="font-display text-[32px] font-bold uppercase lg:text-[40px]">Start workout</h1>
          <Button asChild variant="ghost"><Link to="/train">Cancel</Link></Button>
        </div>
        <Card className="p-4 sm:p-5">
          <p className="mb-3 text-sm text-muted">Exercises from your last session with the same name are filled in, with last time’s numbers as hints.</p>
          <WorkoutPicker />
        </Card>
      </div>
    );
  }
  return <Logger draft={draft} />;
}

/* ---------- rest timer ---------- */
type Rest = { endsAt: number; total: number } | null;
function RestBar({ rest, setRest }: { rest: Rest; setRest: (r: Rest) => void }) {
  const now = useNow(!!rest);
  const left = rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0;
  const fired = useRef(false);
  useEffect(() => {
    if (!rest) { fired.current = false; return; }
    if (left === 0 && !fired.current) {
      fired.current = true;
      navigator.vibrate?.([180, 80, 180]);
      toast('Rest done. Next set!', { id: 'rest' });
      setRest(null);
    }
  }, [left, rest, setRest]);
  if (!rest) return null;
  const pct = Math.min(100, ((rest.total - left) / rest.total) * 100);
  const bump = (d: number) => setRest({ endsAt: rest.endsAt + d * 1000, total: Math.max(5, rest.total + d) });
  return (
    <div role="timer" aria-live="off" aria-label={`Rest timer ${clockOf(left)}`}
      className="fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-pop md:bottom-6">
      <div className="absolute inset-y-0 left-0 bg-lane-soft transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} aria-hidden />
      <div className="relative flex items-center gap-2 px-3 py-2">
        <Timer aria-hidden className="size-5 text-lane-ink" />
        <div className="flex-1">
          <div className="text-[12px] font-semibold tracking-wide text-muted uppercase">Rest</div>
          <div className="num text-[26px] leading-none font-semibold">{clockOf(left)}</div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => bump(-15)} aria-label="15 seconds less">−15</Button>
        <Button variant="secondary" size="sm" onClick={() => bump(15)} aria-label="15 seconds more">+15</Button>
        <Button variant="lane" size="sm" onClick={() => setRest(null)}>Skip</Button>
      </div>
    </div>
  );
}

/* ---------- logger ---------- */
function Logger({ draft: d }: { draft: Draft }) {
  const data = useData();
  const nav = useNavigate();
  const sessions = data.training.sessions;
  const [picking, setPicking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [details, setDetails] = useState(!!d.notes);
  const [rest, setRest] = useState<Rest>(null);
  const now = useNow(!!d.startedAt);
  const update = (fn: (x: Draft) => void) => {
    const next: Draft = structuredClone(d);
    fn(next);
    drafts.set(next);
  };
  const elapsed = d.startedAt ? Math.max(0, Math.floor((now - d.startedAt) / 1000)) : null;
  const stats = useMemo(() => {
    let volume = 0, sets = 0;
    for (const ex of d.exercises) for (const st of ex.sets) if (st.done) { sets++; volume += setVolume(ex.kind, st); }
    return { volume, sets };
  }, [d]);

  const addExercises = (names: string[]) => {
    update(x => {
      for (const n of names) {
        const ex = blankEx(sessions, n);
        if (!lastOf(sessions, n)) ex.kind = exerciseInfo(n).kind; // new exercises: type from the library
        x.exercises.push(ex);
      }
    });
  };

  const save = () => {
    const rec = draftToSession(d, uid);
    if (typeof rec === 'string') { toast.error(rec); setFinishing(false); return; }
    drafts.set(null);
    engine.commit('training', [{ t: 'upsert', c: 'sessions', r: rec }], d.id ? 'Workout updated' : 'Workout saved. Nice work!');
    nav(`/train/session/${encodeURIComponent(rec.id)}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl pb-28">
      {/* Top bar */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-line/70 bg-bg/90 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6 md:top-0">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Minimize workout"><Link to="/train"><ChevronDown /></Link></Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[12px] font-semibold tracking-wide text-muted uppercase">{d.id ? 'Edit workout' : 'Log workout'}</h1>
            {elapsed != null ? <div className="num text-xl leading-none font-semibold" role="timer" aria-label={`Workout time ${clockOf(elapsed)}`}>{clockOf(elapsed)}</div> : <div className="text-sm font-semibold">{fmtShort(d.date)}</div>}
          </div>
          <Button variant="primary" onClick={() => setFinishing(true)}>Finish</Button>
        </div>
      </div>

      <label htmlFor="w-name" className="sr-only">Workout name</label>
      <input id="w-name" value={d.name} placeholder="Workout name" list="dl-sessions" onChange={e => update(x => { x.name = e.target.value; })}
        className="w-full rounded-lg bg-transparent font-display text-[34px] leading-tight font-bold uppercase outline-none placeholder:text-muted/60 focus-visible:ring-2 focus-visible:ring-lane/40" />

      <dl className="mt-2 grid grid-cols-3 gap-2">
        {[
          [<Clock key="c" />, 'Duration', elapsed != null ? clockOf(elapsed) : d.durationMin ? `${d.durationMin} min` : '–'],
          [<Weight key="w" />, 'Volume', stats.volume ? fmtVolume(stats.volume) : '0 kg'],
          [<Layers key="l" />, 'Sets', String(stats.sets)],
        ].map(([icon, k, v]) => (
          <div key={k as string} className="rounded-xl bg-surface-2 px-3 py-2">
            <dt className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-muted uppercase [&_svg]:size-3.5">{icon}{k}</dt>
            <dd className="num text-xl leading-tight font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <button type="button" aria-expanded={details} onClick={() => setDetails(o => !o)} className="mt-3 flex min-h-10 items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        Date and notes <ChevronDown aria-hidden className={cn('size-4 transition-transform', details && 'rotate-180')} />
      </button>
      {details ? (
        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]">
          <Field label="Date">{id => <Input id={id} type="date" value={d.date} onChange={e => update(x => { x.date = e.target.value; })} />}</Field>
          <Field label="Notes">{id => <Textarea id={id} value={d.notes} placeholder="How it felt, RPE, anything to remember" onChange={e => update(x => { x.notes = e.target.value; })} className="min-h-11" />}</Field>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {d.exercises.map((ex, ei) => (
          <ExerciseCard key={`${ei}-${ex.name}`} ex={ex} ei={ei} date={d.date} update={update}
            onDone={secs => { if (secs > 0) setRest({ endsAt: Date.now() + secs * 1000, total: secs }); }} />
        ))}
        {!d.exercises.length ? (
          <div className="rounded-card border border-dashed border-line-strong px-5 py-10 text-center">
            <p className="font-semibold">No exercises yet</p>
            <p className="mt-1 text-sm text-muted">Add the first one to start logging sets.</p>
          </div>
        ) : null}
        <Button variant="lane" size="lg" className="w-full" onClick={() => setPicking(true)}><Plus /> Add exercise</Button>
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <Button variant="danger-ghost" onClick={() => setDiscarding(true)}><Trash2 /> Discard workout</Button>
          <Button variant="primary" onClick={() => setFinishing(true)}>Finish workout</Button>
        </div>
      </div>

      <datalist id="dl-sessions">{recentSessionNames(sessions).map(n => <option key={n} value={n} />)}</datalist>
      <ExercisePicker open={picking} onOpenChange={setPicking} onPick={addExercises} exclude={d.exercises.map(e => e.name)} />
      <RestBar rest={rest} setRest={setRest} />
      <FinishSheet open={finishing} onOpenChange={setFinishing} d={d} elapsed={elapsed} stats={stats} onSave={save} />
      <Confirm open={discarding} onOpenChange={setDiscarding} title="Discard this workout?" description="Nothing from it will be saved." confirmLabel="Discard"
        onConfirm={() => { drafts.set(null); nav('/train', { replace: true }); }} />
    </div>
  );
}

function FinishSheet({ open, onOpenChange, d, elapsed, stats, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; d: Draft; elapsed: number | null; stats: { volume: number; sets: number }; onSave: () => void;
}) {
  const filled = d.exercises.reduce((n, ex) => n + ex.sets.filter(st => hasValue(ex.kind, st)).length, 0);
  const notDone = d.exercises.reduce((n, ex) => n + ex.sets.filter(st => hasValue(ex.kind, st) && !st.done).length, 0);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={d.id ? 'Save changes?' : 'Finish workout?'}
      footer={<>
        <Button variant="secondary" className="max-md:flex-1" onClick={() => onOpenChange(false)}>Keep going</Button>
        <Button variant="primary" className="max-md:flex-1" onClick={onSave}><Check /> Save workout</Button>
      </>}>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-surface-2 px-3 py-2"><div className="text-[11px] font-semibold text-muted uppercase">Duration</div><div className="num text-xl font-semibold">{elapsed != null ? clockOf(elapsed) : d.durationMin ? `${d.durationMin} min` : '–'}</div></div>
        <div className="rounded-xl bg-surface-2 px-3 py-2"><div className="text-[11px] font-semibold text-muted uppercase">Exercises</div><div className="num text-xl font-semibold">{d.exercises.length}</div></div>
        <div className="rounded-xl bg-surface-2 px-3 py-2"><div className="text-[11px] font-semibold text-muted uppercase">Sets</div><div className="num text-xl font-semibold">{filled}</div></div>
      </div>
      <p className="mt-3 text-sm text-muted">
        {filled ? `${filled} sets with numbers will be saved${notDone ? ` (${notDone} not ticked off yet)` : ''}. Empty sets are skipped.` : 'Fill in at least one set to save.'}
        {stats.volume ? ` Volume ${fmtVolume(stats.volume)}.` : ''}
      </p>
    </Sheet>
  );
}

function ExerciseCard({ ex, ei, date, update, onDone }: {
  ex: DraftExercise; ei: number; date: string; update: (fn: (x: Draft) => void) => void; onDone: (restSec: number) => void;
}) {
  const sessions = useData().training.sessions;
  const last = lastOf(sessions, ex.name, date);
  const info = exerciseInfo(ex.name, ex.kind);
  const restSec = ex.rest ?? DEFAULT_REST;
  const [aKey, aLbl, bKey, bLbl] = ex.kind === 'weight' ? (['kg', 'KG', 'reps', 'REPS'] as const) : ex.kind === 'hold' ? (['sec', 'SEC', 'kg', '+KG'] as const) : (['reps', 'REPS', 'kg', '+KG'] as const);
  const setEx = (fn: (e: DraftExercise) => void) => update(x => { fn(x.exercises[ei]!); });
  const prevText = (st: SetEntry | undefined) => (st ? fmtSet(last!.ex.kind, st) : '–');

  const toggleDone = (si: number) => {
    const st = ex.sets[si]!;
    if (st.done) { setEx(e => { e.sets[si]!.done = false; }); return; }
    const prev = last?.ex.sets[si] ?? last?.ex.sets[last.ex.sets.length - 1];
    const fill = { ...st };
    if (!hasValue(ex.kind, fill) && prev) {
      if (fill.reps === '' && prev.reps != null) fill.reps = prev.reps;
      if (fill.kg === '' && prev.kg != null) fill.kg = prev.kg;
      if (fill.sec === '' && prev.sec != null) fill.sec = prev.sec;
    }
    if (!hasValue(ex.kind, fill)) { toast.error(`Enter ${ex.kind === 'hold' ? 'seconds' : 'reps'} first.`); return; }
    setEx(e => { e.sets[si] = { ...fill, done: true }; });
    onDone(restSec);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-3 pt-3 sm:px-4">
        <ExerciseIcon name={ex.name} kind={ex.kind} size={44} />
        <div className="min-w-0 flex-1">
          <Link to={`/train/exercise/${encodeURIComponent(ex.name)}`} className="block truncate text-[17px] font-semibold text-lane-ink hover:underline">{ex.name}</Link>
          <div className="truncate text-[12px] text-muted">{MUSCLE_LABEL[info.muscle]} · {KIND_LABEL[ex.kind]}</div>
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild><Button variant="ghost" size="icon" aria-label={`Options for ${ex.name}`}><MoreHorizontal /></Button></DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-56 rounded-xl border border-line bg-surface p-1 shadow-pop">
              <DropdownMenu.Label className="px-2 py-1.5 text-[12px] font-semibold text-muted uppercase">Type</DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={ex.kind} onValueChange={v => setEx(e => { e.kind = v as ExerciseKind; })}>
                {(Object.entries(KIND_LABEL) as [ExerciseKind, string][]).map(([k, l]) => (
                  <DropdownMenu.RadioItem key={k} value={k} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm outline-none data-[highlighted]:bg-surface-2">
                    <span className="grid w-4 place-items-center"><DropdownMenu.ItemIndicator><Check className="size-4" /></DropdownMenu.ItemIndicator></span>{l}
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Label className="px-2 py-1.5 text-[12px] font-semibold text-muted uppercase">Rest timer</DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={String(restSec)} onValueChange={v => setEx(e => { e.rest = +v; })}>
                <div className="grid grid-cols-4 gap-1 px-1 pb-1">
                  {REST_OPTIONS.map(s => (
                    <DropdownMenu.RadioItem key={s} value={String(s)} className="grid min-h-9 cursor-pointer place-items-center rounded-lg text-[13px] font-semibold outline-none data-[highlighted]:bg-surface-2 data-[state=checked]:bg-lane-soft data-[state=checked]:text-lane-ink">
                      {restLabel(s)}
                    </DropdownMenu.RadioItem>
                  ))}
                </div>
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item onSelect={() => update(x => { x.exercises.splice(ei, 1); })} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-semibold text-bad outline-none data-[highlighted]:bg-bad-soft">
                <Trash2 className="size-4" /> Remove exercise
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <div className="flex items-center gap-1.5 px-3 pt-2 text-[13px] font-semibold text-lane-ink sm:px-4">
        <Timer aria-hidden className="size-4" /> Rest timer: {restLabel(restSec)}
        {last ? <span className="ml-auto truncate font-normal text-muted">Last {fmtShort(last.date)}</span> : <span className="ml-auto font-normal text-muted">First time</span>}
      </div>

      <div className="mt-2" role="table" aria-label={`${ex.name} sets`}>
        <div role="row" className="grid grid-cols-[34px_minmax(0,1fr)_64px_64px_44px] items-center gap-1.5 px-3 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase sm:grid-cols-[40px_minmax(0,1fr)_88px_88px_48px] sm:px-4">
          <span role="columnheader" className="text-center">Set</span>
          <span role="columnheader">Previous</span>
          <span role="columnheader" className="text-center">{aLbl}</span>
          <span role="columnheader" className="text-center">{bLbl}</span>
          <span role="columnheader" className="text-center"><Check aria-label="Done" className="mx-auto size-4" /></span>
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
              placeholder={prev && prev[key] != null ? `${prev[key]}` : '–'}
              aria-label={`Set ${si + 1} ${lbl.toLowerCase()}`}
              className={cn('num h-10 px-1 text-center text-[18px] font-semibold', st.done && 'border-transparent bg-transparent')}
              onChange={e => setEx(x => { x.sets[si]![key] = e.target.value; })}
            />
          );
          return (
            <div role="row" key={si} className={cn('grid grid-cols-[34px_minmax(0,1fr)_64px_64px_44px] items-center gap-1.5 px-3 py-1 transition-colors sm:grid-cols-[40px_minmax(0,1fr)_88px_88px_48px] sm:px-4', st.done && 'bg-good-soft')}>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" aria-label={`Set ${si + 1} options`} className="num grid h-9 place-items-center rounded-lg text-[17px] font-semibold hover:bg-surface-3">{si + 1}</button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="start" sideOffset={4} className="z-50 min-w-44 rounded-xl border border-line bg-surface p-1 shadow-pop">
                    <DropdownMenu.Item onSelect={() => setEx(x => { x.sets.splice(si, 1); })} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-semibold text-bad outline-none data-[highlighted]:bg-bad-soft">
                      <X className="size-4" /> Remove set
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <button type="button" role="cell" disabled={!prev} title={prev ? 'Use last time’s numbers' : undefined}
                onClick={() => prev && setEx(x => { const t = x.sets[si]!; t.kg = prev.kg ?? ''; t.reps = prev.reps ?? ''; t.sec = prev.sec ?? ''; })}
                className="min-w-0 truncate rounded-lg px-1 py-2 text-left text-[14px] text-muted enabled:hover:bg-surface-3 enabled:hover:text-ink">
                {prevText(prev)}
              </button>
              <div role="cell">{input(aKey, aLbl, 'a')}</div>
              <div role="cell">{input(bKey, bLbl, 'b')}</div>
              <div role="cell" className="grid place-items-center">
                <button type="button" aria-pressed={!!st.done} aria-label={`Set ${si + 1} done`} onClick={() => toggleDone(si)}
                  className={cn('grid size-9 place-items-center rounded-lg border-2 transition-colors', st.done ? 'border-good bg-good text-on-accent' : 'border-line-strong text-transparent hover:border-good hover:text-good')}>
                  <Check className="size-5" strokeWidth={3} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-3 pt-2 pb-3 sm:px-4">
        <Button variant="subtle" size="sm" className="w-full" onClick={() => setEx(x => {
          const p = x.sets[x.sets.length - 1] ?? { reps: '', kg: '', sec: '' };
          x.sets.push({ reps: p.reps || '', kg: p.kg || '', sec: p.sec || '' });
        })}><Plus /> Add set</Button>
      </div>
    </Card>
  );
}
