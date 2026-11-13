import { useNavigate } from 'react-router';
import { drafts, useData, useToday } from '@/app/store';
import { newDraft } from '@/core/calc';
import type { Session } from '@/core/types';

/** Start a workout named `name` (prefilled from its last session), or blank. */
export function useStartWorkout() {
  const data = useData();
  const today = useToday();
  const nav = useNavigate();
  return (name: string, from?: Session) => {
    drafts.set({ ...newDraft(data.training.sessions, name, today, from), startedAt: Date.now() });
    nav('/train/log');
  };
}
