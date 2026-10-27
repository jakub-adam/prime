import { Check, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useData } from '@/app/store';
import { byDateDesc } from '@/core/calc';
import { EQUIPMENT_LABEL, exerciseInfo, LIBRARY, MUSCLE_LABEL, type Muscle } from '@/core/exercises';
import { ExerciseIcon } from '@/components/ExerciseIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/** Every exercise you've logged plus the library, recently used first. */
export function useExerciseList() {
  const sessions = useData().training.sessions;
  return useMemo(() => {
    const recent: string[] = [];
    for (const s of [...sessions].sort(byDateDesc)) for (const e of s.exercises) if (!recent.some(r => r.toLowerCase() === e.name.toLowerCase())) recent.push(e.name);
    const lib = LIBRARY.map(e => e.name).filter(n => !recent.some(r => r.toLowerCase() === n.toLowerCase()));
    const count = (n: string) => sessions.filter(s => s.exercises.some(e => e.name.toLowerCase() === n.toLowerCase())).length;
    return { recent, all: [...recent, ...lib.sort((a, b) => a.localeCompare(b))], count };
  }, [sessions]);
}

const MUSCLES = Object.keys(MUSCLE_LABEL) as Muscle[];

export function MuscleFilter({ value, onChange }: { value: Muscle | 'all'; onChange: (m: Muscle | 'all') => void }) {
  return (
    <div role="group" aria-label="Muscle group" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none">
      {(['all', ...MUSCLES] as const).map(m => (
        <button key={m} type="button" aria-pressed={value === m} onClick={() => onChange(m)}
          className="h-9 shrink-0 rounded-full border border-line px-3.5 text-[13px] font-semibold text-muted transition-colors hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-bg">
          {m === 'all' ? 'All' : MUSCLE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

export function ExercisePicker({ open, onOpenChange, onPick, exclude = [] }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (names: string[]) => void;
  exclude?: string[];
}) {
  const { recent, all } = useExerciseList();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all');
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { if (open) { setQ(''); setMuscle('all'); setPicked([]); } }, [open]);
  const query = q.trim().toLowerCase();
  const visible = all.filter(n => (!query || n.toLowerCase().includes(query)) && (muscle === 'all' || exerciseInfo(n).muscle === muscle));
  const recentSet = new Set(recent.slice(0, 8));
  const toggle = (n: string) => setPicked(p => (p.includes(n) ? p.filter(x => x !== n) : [...p, n]));
  const exact = all.some(n => n.toLowerCase() === query);
  const done = () => { if (picked.length) onPick(picked); onOpenChange(false); };

  const row = (n: string) => {
    const info = exerciseInfo(n);
    const on = picked.includes(n);
    const already = exclude.some(e => e.toLowerCase() === n.toLowerCase());
    return (
      <li key={n}>
        <button type="button" aria-pressed={on} onClick={() => toggle(n)}
          className={cn('flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2', on && 'bg-lane-soft hover:bg-lane-soft')}>
          <ExerciseIcon name={n} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{n}</span>
            <span className="block truncate text-[12px] text-muted">{MUSCLE_LABEL[info.muscle]} · {EQUIPMENT_LABEL[info.equipment]}{already ? ' · in this workout' : ''}</span>
          </span>
          <span aria-hidden className={cn('grid size-7 shrink-0 place-items-center rounded-full border-2', on ? 'border-lane bg-lane text-on-accent' : 'border-line-strong')}>{on ? <Check className="size-4" strokeWidth={3} /> : null}</span>
        </button>
      </li>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add exercises" wide
      footer={<>
        <Button variant="secondary" className="max-md:flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" className="max-md:flex-1" disabled={!picked.length} onClick={done}>Add {picked.length ? `${picked.length} exercise${picked.length > 1 ? 's' : ''}` : ''}</Button>
      </>}>
      <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-surface px-1 pt-1 pb-2">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input aria-label="Search exercises" placeholder="Search exercises" value={q} onChange={e => setQ(e.target.value)} className="pl-9" autoComplete="off" />
        </div>
        <MuscleFilter value={muscle} onChange={setMuscle} />
      </div>
      {query && !exact ? (
        <button type="button" onClick={() => { const name = q.trim().replace(/^./, c => c.toUpperCase()); setPicked(p => (p.includes(name) ? p : [...p, name])); setQ(''); }}
          className="mb-2 flex min-h-12 w-full items-center gap-3 rounded-xl border border-dashed border-line-strong px-3 text-left text-sm font-semibold hover:bg-surface-2">
          <Plus aria-hidden className="size-4" /> Add “{q.trim()}” as a new exercise
        </button>
      ) : null}
      {!query && muscle === 'all' && recentSet.size ? (
        <>
          <h3 className="px-2 pt-1 pb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Recent</h3>
          <ul>{[...recentSet].map(row)}</ul>
          <h3 className="px-2 pt-3 pb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">All exercises</h3>
          <ul>{visible.filter(n => !recentSet.has(n)).map(row)}</ul>
        </>
      ) : (
        <ul>{visible.map(row)}</ul>
      )}
      {!visible.length && !query ? <p className="py-8 text-center text-sm text-muted">No exercises in this group yet.</p> : null}
    </Sheet>
  );
}
