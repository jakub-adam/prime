import { useEffect, useState } from 'react';
import { engine, useSnapshot } from '@/app/store';
import type { HealthWorkout, WorkoutDetail } from '@/core/types';

export type DetailState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; detail: WorkoutDetail }
  | { status: 'missing' }
  | { status: 'error'; message: string };

/** Loads workouts/<id>.json for a watch workout (memory → offline cache → GitHub). */
export function useWorkoutDetail(w: HealthWorkout | undefined): DetailState {
  const mode = useSnapshot().mode;
  const id = w?.id, has = !!w?.detail;
  const [state, setState] = useState<DetailState>({ status: has ? 'loading' : 'none' });
  useEffect(() => {
    if (!id || !has) { setState({ status: 'none' }); return; }
    let live = true;
    setState({ status: 'loading' });
    engine.workoutDetail(id).then(
      d => { if (live) setState(d ? { status: 'ready', detail: d } : { status: 'missing' }); },
      (e: unknown) => { if (live) setState({ status: 'error', message: (e as Error)?.message || 'Could not load the workout.' }); },
    );
    return () => { live = false; };
  }, [id, has, mode]);
  return state;
}
