import { Play, Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useData, useDraft, useToday } from '@/app/store';
import { routines } from '@/core/calc';
import { fmtRelative } from '@/core/dates';
import { ExerciseIcon } from '@/components/ExerciseIcon';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useStartWorkout } from './train-ui';

/** Recent workouts by name (plus empty). Picking one prefills exercises from the last session of that name. */
export function WorkoutPicker({ onPicked }: { onPicked?: () => void }) {
  const data = useData();
  const today = useToday();
  const draft = useDraft();
  const nav = useNavigate();
  const start = useStartWorkout();
  const list = routines(data.training.sessions).slice(0, 8);
  const go = (name: string) => { onPicked?.(); start(name); };
  return (
    <div>
      {draft ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2.5 text-sm">
          <span><b>{draft.name || 'Workout'}</b> is in progress. Starting another replaces it.</span>
          <Button size="sm" variant="secondary" onClick={() => { onPicked?.(); nav('/train/log'); }}>Resume</Button>
        </div>
      ) : null}
      <ul className="flex flex-col gap-2">
        {list.map(r => (
          <li key={r.name}>
            <button type="button" onClick={() => go(r.name)} className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-3/60">
              <span className="flex -space-x-2" aria-hidden>
                {r.last.exercises.slice(0, 3).map(ex => <ExerciseIcon key={ex.name} name={ex.name} kind={ex.kind} size={36} className="ring-2 ring-surface-2" />)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.name}</span>
                <span className="block truncate text-[13px] text-muted">{r.last.exercises.length} exercises · last {fmtRelative(r.last.date, today).toLowerCase()}</span>
              </span>
              <Play aria-hidden className="size-5 shrink-0 text-lane-ink" />
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => go('')} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-dashed border-line-strong px-3 text-left transition-colors hover:bg-surface-2">
            <span className="grid size-9 place-items-center rounded-lg bg-surface-3 text-muted"><Plus aria-hidden className="size-[18px]" /></span>
            <span className="font-semibold">Empty workout</span>
          </button>
        </li>
      </ul>
    </div>
  );
}

export function StartWorkoutSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Start workout" description="Exercises from your last session with the same name are filled in, with last time’s numbers as hints.">
      <WorkoutPicker onPicked={() => onOpenChange(false)} />
    </Sheet>
  );
}
