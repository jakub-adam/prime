import { macroSplit, NUTRIENTS, type DayTotals } from '@/core/calc';
import type { Meal } from '@/core/types';
import { cn, fmt } from '@/lib/utils';

const g1 = (v: number | null | undefined) => (v == null ? '–' : `${fmt(v, v % 1 ? 1 : 0)} g`);

/** "C 52 · F 14 · fibre 6" under a meal, only for what was recorded. */
export function macroLine(m: Meal) {
  const parts: string[] = [];
  if (typeof m.carbs === 'number') parts.push(`C ${fmt(m.carbs, m.carbs % 1 ? 1 : 0)}`);
  if (typeof m.fat === 'number') parts.push(`F ${fmt(m.fat, m.fat % 1 ? 1 : 0)}`);
  if (typeof m.fiber === 'number') parts.push(`fibre ${fmt(m.fiber, m.fiber % 1 ? 1 : 0)}`);
  return parts.join(' · ');
}

/** Split of calories between protein, carbs and fat, plus the other nutrients for the day. */
export function NutrientSummary({ t, className }: { t: DayTotals; className?: string }) {
  const split = macroSplit(t);
  const any = NUTRIENTS.some(n => t[n.key] != null);
  if (!t.n) return null;
  return (
    <div className={cn('rounded-xl bg-surface-2 p-3', className)}>
      {split ? (
        <div className="mb-3">
          <div className="flex h-2.5 overflow-hidden rounded-full" aria-hidden>
            <div className="bg-lane" style={{ width: `${split.protein * 100}%` }} />
            <div className="bg-[var(--cat-mobility)]" style={{ width: `${split.carbs * 100}%` }} />
            <div className="bg-[var(--cat-body)]" style={{ width: `${split.fat * 100}%` }} />
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-muted">
            <span><span aria-hidden className="mr-1 inline-block size-2 rounded-full bg-lane" />Protein {fmt(split.protein * 100)}%</span>
            <span><span aria-hidden className="mr-1 inline-block size-2 rounded-full bg-[var(--cat-mobility)]" />Carbs {fmt(split.carbs * 100)}%</span>
            <span><span aria-hidden className="mr-1 inline-block size-2 rounded-full bg-[var(--cat-body)]" />Fat {fmt(split.fat * 100)}%</span>
            <span className="sr-only">of calories</span>
          </p>
        </div>
      ) : null}
      <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
        {NUTRIENTS.map(n => (
          <div key={n.key} className="min-w-0">
            <dt className="truncate text-[11px] font-semibold tracking-wide text-muted uppercase">{n.short}</dt>
            <dd className={cn('num text-lg leading-tight font-semibold', t[n.key] == null && 'text-muted')}>{g1(t[n.key])}</dd>
          </div>
        ))}
      </dl>
      {!any ? <p className="mt-2 text-[12px] text-muted">Add carbs, fat and more under “More nutrients” when logging a meal.</p> : null}
    </div>
  );
}

/** EU nutrition-label style table for one meal. */
export function NutritionTable({ m }: { m: Meal }) {
  const rows: [string, string, boolean][] = [
    ['Energy', `${fmt(+m.kcal)} kcal`, false],
    ['Protein', g1(+m.protein), false],
    ...NUTRIENTS.map(n => [n.label, g1(typeof m[n.key] === 'number' ? (m[n.key] as number) : null), !!n.sub] as [string, string, boolean]),
  ];
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Nutrition for this meal</caption>
      <tbody>
        {rows.map(([k, v, sub]) => (
          <tr key={k} className="border-b border-line/70 last:border-0">
            <th scope="row" className={cn('py-2 text-left font-semibold', sub && 'pl-4 font-normal text-muted')}>{k}</th>
            <td className={cn('num py-2 text-right text-[16px]', v === '–' && 'text-muted')}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
