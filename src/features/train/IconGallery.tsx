/* Development only (#/dev/icons): every exercise icon, large, to check the poses while drawing them. */
import { LIBRARY, MUSCLE_LABEL } from '@/core/exercises';
import { ExerciseIcon } from '@/components/ExerciseIcon';

const EXTRA = ['Strict pull-up', 'Dip', 'Push-up', 'Pike push-up (parallettes)', 'Diamond push-up', 'Slow leg raise', 'Dumbbell curl (per hand)', 'Chest-supported row (machine)', 'Overhead press (dumbbell, per hand)', 'Running'];

export function IconGallery() {
  const names = [...LIBRARY.map(e => e.name), ...EXTRA];
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Exercise icons ({names.length})</h1>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-3">
        {names.map(n => (
          <li key={n} className="flex flex-col items-center gap-1.5 text-center">
            <ExerciseIcon name={n} size={96} />
            <span className="text-[11px] leading-tight">{n}</span>
            <span className="text-[10px] text-muted">{MUSCLE_LABEL[LIBRARY.find(e => e.name === n)?.muscle ?? 'full']}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
