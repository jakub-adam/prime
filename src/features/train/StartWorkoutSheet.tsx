import { Dumbbell, Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { drafts, useData, useDraft, useToday } from '@/app/store';
import { byDateDesc, newDraft, recentSessionNames } from '@/core/calc';
import { fmtRelative } from '@/core/dates';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';

/** Recent session names (plus blank). Picking one prefills exercises from the last session of that name. */
export function WorkoutPicker({ onPicked }: { onPicked?: () => void }) {
  const data = useData();
  const today = useToday();
  const draft = useDraft();
  const nav = useNavigate();
  const sessions = data.training.sessions;
  const names = recentSessionNames(sessions).slice(0, 8);
  const start = (name: string) => {
    drafts.set(newDraft(sessions, name, today));
    onPicked?.();
    nav('/train/log');
  };
  return (
    <div>
      {draft ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2.5 text-sm">
          <span><b>{draft.name || 'Workout'}</b> is in progress. Starting another replaces it.</span>
          <Button size="sm" variant="secondary" onClick={() => { onPicked?.(); nav('/train/log'); }}>Resume</Button>
        </div>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {names.map(n => {
          const last = [...sessions].filter(s => s.name === n).sort(byDateDesc)[0]!;
          return (
            <li key={n}>
              <button type="button" onClick={() => start(n)} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2 text-left transition-colors hover:border-line-strong hover:bg-surface-3/60">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-track-soft text-track-ink"><Dumbbell aria-hidden className="size-[18px]" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{n}</span>
                  <span className="block truncate text-[13px] text-muted">Last: {fmtRelative(last.date, today)} · {last.exercises.length} exercises</span>
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={() => start('')} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-dashed border-line-strong px-3 text-left transition-colors hover:bg-surface-2">
            <span className="grid size-9 place-items-center rounded-lg bg-surface-3 text-muted"><Plus aria-hidden className="size-[18px]" /></span>
            <span className="font-semibold">Blank workout</span>
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
