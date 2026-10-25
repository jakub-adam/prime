import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { engine, useData, useToday } from '@/app/store';
import { num, recentMeals } from '@/core/calc';
import { nowHM } from '@/core/dates';
import { uid } from '@/core/ops';
import type { Meal } from '@/core/types';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';

const MEALS = ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Other'];
function guessMeal() {
  const hr = new Date().getHours();
  return hr < 11 ? 'Breakfast' : hr < 15 ? 'Lunch' : hr < 18 ? 'Snack' : 'Dinner';
}

/** Add a meal for `date`, or edit `meal`. */
export function MealSheet({ open, onOpenChange, date, meal }: { open: boolean; onOpenChange: (o: boolean) => void; date: string; meal?: Meal | null }) {
  const data = useData();
  const today = useToday();
  const [f, setF] = useState({ meal: '', time: '', items: '', kcal: '', protein: '', date });
  useEffect(() => {
    if (!open) return;
    setF(meal
      ? { meal: meal.meal, time: meal.time || '', items: meal.items || '', kcal: String(meal.kcal ?? ''), protein: String(meal.protein ?? ''), date: meal.date }
      : { meal: guessMeal(), time: date === today ? nowHM() : '', items: '', kcal: '', protein: '', date });
  }, [open, meal, date, today]);
  const recent = meal ? [] : recentMeals(data.food.meals);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }));

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
    engine.commit('food', [{ t: 'upsert', c: 'meals', r: rec }], meal ? 'Meal updated' : 'Meal logged');
    onOpenChange(false);
  };

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
        {recent.length ? (
          <div className="col-span-2">
            <div className="mb-1.5 text-[13px] font-semibold text-muted">Recent</div>
            <div className="flex flex-wrap gap-1.5">
              {recent.map(m => (
                <Button key={m.id} size="sm" variant="subtle" className="max-w-full font-medium" title={m.items}
                  onClick={() => setF(s => ({ ...s, items: m.items || '', kcal: String(m.kcal), protein: String(m.protein), meal: m.meal }))}>
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
