import { ChevronDown } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { engine, useData, useToday } from '@/app/store';
import { num, NUTRIENTS, recentMeals, type NutrientKey } from '@/core/calc';
import { nowHM } from '@/core/dates';
import { uid } from '@/core/ops';
import type { Meal } from '@/core/types';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const MEALS = ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Other'];
function guessMeal() {
  const hr = new Date().getHours();
  return hr < 11 ? 'Breakfast' : hr < 15 ? 'Lunch' : hr < 18 ? 'Snack' : 'Dinner';
}
type Form = { meal: string; time: string; items: string; kcal: string; protein: string; date: string } & Record<NutrientKey, string>;
const emptyNutrients = () => Object.fromEntries(NUTRIENTS.map(n => [n.key, ''])) as Record<NutrientKey, string>;
const str = (v: unknown) => (typeof v === 'number' ? String(v) : '');

/** Add a meal for `date`, or edit `meal`. Calories and protein are required; other nutrients are optional. */
export function MealSheet({ open, onOpenChange, date, meal }: { open: boolean; onOpenChange: (o: boolean) => void; date: string; meal?: Meal | null }) {
  const data = useData();
  const today = useToday();
  const [f, setF] = useState<Form>({ meal: '', time: '', items: '', kcal: '', protein: '', date, ...emptyNutrients() });
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (meal) {
      setF({
        meal: meal.meal, time: meal.time || '', items: meal.items || '', kcal: str(meal.kcal), protein: str(meal.protein), date: meal.date,
        ...(Object.fromEntries(NUTRIENTS.map(n => [n.key, str(meal[n.key])])) as Record<NutrientKey, string>),
      });
      setMore(NUTRIENTS.some(n => typeof meal[n.key] === 'number'));
    } else {
      setF({ meal: guessMeal(), time: date === today ? nowHM() : '', items: '', kcal: '', protein: '', date, ...emptyNutrients() });
      setMore(false);
    }
  }, [open, meal, date, today]);
  const recent = meal ? [] : recentMeals(data.food.meals);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const kcal = num(f.kcal), protein = num(f.protein);
    if (kcal == null || protein == null) { toast.error('Enter calories and protein.'); return; }
    if (!f.date) { toast.error('Pick a date.'); return; }
    const rec: Meal = {
      ...(meal ?? {}),
      id: meal ? meal.id : `${f.date}_${uid()}`,
      date: f.date,
      time: f.time || '',
      meal: f.meal,
      items: f.items.trim(),
      kcal: Math.round(kcal),
      protein: Math.round(protein * 10) / 10,
    };
    for (const n of NUTRIENTS) {
      const v = num(f[n.key]);
      if (v != null) rec[n.key] = Math.round(v * 10) / 10;
      else delete rec[n.key];
    }
    engine.commit('food', [{ t: 'upsert', c: 'meals', r: rec }], meal ? 'Meal updated' : 'Meal logged');
    onOpenChange(false);
  };

  const pick = (m: Meal) => setF(s => ({
    ...s, items: m.items || '', kcal: str(m.kcal), protein: str(m.protein), meal: m.meal,
    ...(Object.fromEntries(NUTRIENTS.map(n => [n.key, str(m[n.key])])) as Record<NutrientKey, string>),
  }));

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={meal ? 'Edit meal' : 'Log a meal'}
      footer={<>
        <Button variant="secondary" className="max-md:flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" type="submit" form="meal-form" className="max-md:flex-1">{meal ? 'Save' : 'Add meal'}</Button>
      </>}
    >
      <form id="meal-form" onSubmit={submit} className="grid grid-cols-2 gap-3 pt-1">
        <Field label="Meal">{id => <Select id={id} value={f.meal} onChange={set('meal')}>{MEALS.map(m => <option key={m}>{m}</option>)}</Select>}</Field>
        <Field label="Time">{id => <Input id={id} type="time" value={f.time} onChange={set('time')} />}</Field>
        {meal ? <Field label="Date" className="col-span-2">{id => <Input id={id} type="date" value={f.date} onChange={set('date')} />}</Field> : null}
        <Field label="What" className="col-span-2">{id => <Input id={id} value={f.items} onChange={set('items')} placeholder="2 pulled pork wraps, yogurt sauce" autoComplete="off" />}</Field>
        <Field label="Calories (kcal)">{id => <Input id={id} type="number" inputMode="numeric" min={0} step={1} required value={f.kcal} onChange={set('kcal')} placeholder="0" />}</Field>
        <Field label="Protein (g)">{id => <Input id={id} type="number" inputMode="decimal" min={0} step={0.5} required value={f.protein} onChange={set('protein')} placeholder="0" />}</Field>

        <div className="col-span-2 rounded-xl border border-line">
          <button type="button" aria-expanded={more} onClick={() => setMore(o => !o)}
            className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-sm font-semibold">
            <span>More nutrients <span className="font-normal text-muted">carbs, fat, sugars, fibre, salt</span></span>
            <ChevronDown aria-hidden className={cn('size-4 text-muted transition-transform', more && 'rotate-180')} />
          </button>
          {more ? (
            <div className="grid grid-cols-2 gap-3 border-t border-line px-3 pt-3 pb-3 sm:grid-cols-3">
              {NUTRIENTS.map(n => (
                <Field key={n.key} label={`${n.short} (g)`}>
                  {id => <Input id={id} type="number" inputMode="decimal" min={0} step={0.1} value={f[n.key]} onChange={set(n.key)} placeholder="–" />}
                </Field>
              ))}
            </div>
          ) : null}
        </div>

        {recent.length ? (
          <div className="col-span-2">
            <div className="mb-1.5 text-[13px] font-semibold text-muted">Recent</div>
            <div className="flex flex-wrap gap-1.5">
              {recent.map(m => (
                <Button key={m.id} size="sm" variant="subtle" className="max-w-full font-medium" title={m.items} onClick={() => pick(m)}>
                  <span className="truncate">{m.items}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}
