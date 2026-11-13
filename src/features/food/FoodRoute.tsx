import { ChevronDown, ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { engine, useData, useGoals, useToday } from '@/app/store';
import { avg, dayTotals, mealsOn, num } from '@/core/calc';
import { addDays, fmtDay, fmtLong, fmtShort, mondayOf, nowHM, range } from '@/core/dates';
import { uid } from '@/core/ops';
import type { Meal } from '@/core/types';
import { TimeChart, type ChartColor } from '@/components/charts';
import { EmptyState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { Segmented } from '@/components/ui/misc';
import { Confirm } from '@/components/ui/sheet';
import { NotFound } from '@/app/NotFound';
import { cn, fmt, signed } from '@/lib/utils';
import { guessMeal, MealSheet } from './MealSheet';
import { NutritionTable } from './nutrition';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const g0 = (v: number) => fmt(v, v % 1 ? 1 : 0);

/** "Toast, chicken ham 100 g, milk (3.5%) 200 ml" → [{ name, amount }], split on commas outside brackets. */
export function ingredients(items: string | undefined): { name: string; amount: string }[] {
  if (!items?.trim()) return [];
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const ch of items) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts.map(p => p.trim()).filter(Boolean).map(p => {
    const m = /^(.*\S)\s+(~?\d[\d.,]*\s?(?:g|kg|ml|l|pcs?|pieces?|slices?|tbsp|tsp|cups?|x)?)$/i.exec(p);
    return m ? { name: m[1]!.replace(/[:,]$/, ''), amount: m[2]! } : { name: p, amount: '' };
  });
}

export function FoodRoute() {
  const params = useParams();
  const data = useData();
  const today = useToday();
  const meal = params.id ? data.food.meals.find(m => m.id === params.id) ?? null : null;
  if (params.id && !meal) return <NotFound />;
  if (params.date && !dateRe.test(params.date)) return <NotFound />;
  const date = meal?.date ?? params.date ?? today;
  return <FoodPage key={date} date={date} openId={meal?.id} />;
}

function FoodPage({ date, openId }: { date: string; openId?: string | undefined }) {
  const today = useToday();
  const nav = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const isToday = date === today;
  const go = (d: string) => { if (d <= today) nav(d === today ? '/food' : `/food/${d}`); };
  // "n" from anywhere lands here with ?log=1
  useEffect(() => {
    if (search.get('log')) { setAdding(true); setSearch({}, { replace: true }); }
  }, [search, setSearch]);
  // ← → change the day (desktop); a sideways swipe does the same on a phone
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || el?.closest('input, textarea, select, [role="dialog"], [role="radiogroup"], [role="group"]')) return;
      if (e.key === 'ArrowLeft') go(addDays(date, -1));
      if (e.key === 'ArrowRight') go(addDays(date, 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const touch = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      onTouchStart={e => { const t = e.touches[0]!; touch.current = { x: t.clientX, y: t.clientY }; }}
      onTouchEnd={e => {
        const s = touch.current, t = e.changedTouches[0]!;
        touch.current = null;
        if (!s || (e.target as HTMLElement).closest('[data-noswipe]')) return;
        const dx = t.clientX - s.x, dy = t.clientY - s.y;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) go(addDays(date, dx > 0 ? -1 : 1));
      }}
    >
      <PageHeader
        kicker={isToday ? fmtLong(date) : 'Food'}
        title={isToday ? 'Food' : fmtDay(date)}
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="icon" aria-label="Previous day" onClick={() => go(addDays(date, -1))}><ChevronLeft /></Button>
              <Button variant="secondary" disabled={isToday} onClick={() => go(today)}>Today</Button>
              <Button variant="secondary" size="icon" aria-label="Next day" disabled={isToday} onClick={() => go(addDays(date, 1))}><ChevronRight /></Button>
            </div>
            <Button variant="primary" onClick={() => setAdding(true)}><Plus /> Log meal</Button>
          </>
        }
      />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-5">
          <DaySummary date={date} />
          <MealsCard date={date} openId={openId} onAdd={() => setAdding(true)} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-7">
          <TrendCard date={date} onOpenDay={go} />
          <WeeklyTable />
        </div>
      </div>
      <MealSheet open={adding} onOpenChange={setAdding} date={date} />
    </div>
  );
}

/* ---------- the day: calories and macros ---------- */
function Bar({ pct, color, className }: { pct: number; color: string; className?: string }) {
  return <div aria-hidden className={cn('h-1 overflow-hidden rounded-full bg-surface-3', className)}><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%`, background: color }} /></div>;
}

function DaySummary({ date }: { date: string }) {
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const t = dayTotals(data.food.meals, date);
  const left = g.kcal - t.kcal;
  const share = (grams: number | null, kcalPerG: number) => (grams != null && t.kcal ? Math.round(((grams * kcalPerG) / t.kcal) * 100) : null);
  const macros: [string, number | null, string, string, number][] = [
    ['Protein', t.protein, 'var(--protein)', `${fmt(Math.max(0, g.protein - t.protein))} g left`, t.protein / g.protein],
    ['Carbs', t.carbs, 'var(--carbs)', share(t.carbs, 4) != null ? `${share(t.carbs, 4)}% of kcal` : 'Not recorded', (share(t.carbs, 4) ?? 0) / 100],
    ['Fat', t.fat, 'var(--fat)', share(t.fat, 9) != null ? `${share(t.fat, 9)}% of kcal` : 'Not recorded', (share(t.fat, 9) ?? 0) / 100],
  ];
  const minor: [string, number | null][] = [['Sugars', t.sugar], ['Fibre', t.fiber], ['Saturates', t.satFat], ['Salt', t.salt]];
  return (
    <Card aria-labelledby="day-h">
      <CardHeader id="day-h" title={date === today ? 'Today' : fmtDay(date)} action={<span className="text-[12px] text-muted">{t.n} {t.n === 1 ? 'meal' : 'meals'}</span>} />
      <CardBody className="flex flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <div><span className="num text-[36px] leading-none font-semibold">{fmt(t.kcal)}</span><span className="text-[13px] text-muted"> / {fmt(g.kcal)} kcal</span></div>
            <span className={cn('num text-[13px]', left < 0 ? 'font-medium text-bad' : 'text-muted')}>{left >= 0 ? `${fmt(left)} kcal left` : `${fmt(-left)} kcal over`}</span>
          </div>
          <div role="progressbar" aria-label="Calories" aria-valuemin={0} aria-valuemax={g.kcal} aria-valuenow={Math.round(t.kcal)} aria-valuetext={`${fmt(t.kcal)} of ${fmt(g.kcal)} kcal`}>
            <Bar className="mt-3 h-1.5" color="var(--kcal)" pct={t.kcal / g.kcal} />
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-4">
          {macros.map(([label, v, color, sub, pct]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[12px] text-muted">{label}</dt>
              <dd>
                <span className="num text-[18px] font-semibold">{v == null ? '–' : g0(v)}</span><span className="text-[12px] text-muted">{label === 'Protein' ? ` / ${fmt(g.protein)} g` : ' g'}</span>
                <Bar className="mt-2" color={color} pct={pct} />
                <span className="num mt-1.5 block truncate text-[12px] text-muted">{sub}</span>
              </dd>
            </div>
          ))}
        </dl>
        <dl className="grid grid-cols-4 gap-3 border-t border-line pt-3">
          {minor.map(([label, v]) => <div key={label} className="min-w-0"><dt className="truncate text-[12px] text-muted">{label}</dt><dd className={cn('num text-sm', v == null && 'text-muted')}>{v == null ? '–' : `${g0(v)} g`}</dd></div>)}
        </dl>
      </CardBody>
    </Card>
  );
}

/* ---------- meals: name, time, calories and macro pills up front; ingredients on demand ---------- */
function Pill({ color, label, v }: { color: string; label: string; v: number | undefined }) {
  if (typeof v !== 'number') return null;
  return <span className="num inline-flex items-center gap-1.5 rounded-full px-2 py-px text-[12px] text-muted shadow-card"><span aria-hidden className="size-1.5 rounded-full" style={{ background: color }} />{label} {fmt(v)}</span>;
}

function MealRow({ m, open, onToggle }: { m: Meal; open: boolean; onToggle: () => void }) {
  const today = useToday();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const list = useMemo(() => ingredients(m.items), [m.items]);
  const again = () => {
    const { id: _id, ...rest } = m;
    engine.commit('food', [{ t: 'upsert', c: 'meals', r: { ...rest, id: `${today}_${uid()}`, date: today, time: nowHM() } }], 'Logged again for today');
    if (m.date !== today) nav('/food');
  };
  return (
    <li className="border-t border-line first:border-t-0">
      <button type="button" aria-expanded={open} onClick={onToggle} className="-mx-2 flex min-h-14 w-[calc(100%+1rem)] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-2">
        <span className="num w-10 shrink-0 text-[12px] text-muted">{m.time || '—'}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{m.meal}{list.length ? <span className="ml-2 text-[12px] font-normal text-muted">{list.length} {list.length === 1 ? 'item' : 'items'}</span> : null}</span>
        <span className="num shrink-0 text-right"><span className="font-semibold">{fmt(+m.kcal)}</span><span className="text-[12px] text-muted"> kcal</span></span>
        <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
        <span className="flex w-full flex-wrap gap-1.5 pl-[3.25rem]">
          <Pill color="var(--protein)" label="P" v={+m.protein} /><Pill color="var(--carbs)" label="C" v={m.carbs} /><Pill color="var(--fat)" label="F" v={m.fat} />
        </span>
      </button>
      {open ? (
        <div className="mb-3 ml-[3.25rem] rounded-[10px] bg-surface-2 p-3.5 shadow-card max-sm:ml-0">
          {list.length ? (
            <ul className="mb-3 divide-y divide-line text-[13px]">
              {list.map((it, i) => <li key={i} className="flex justify-between gap-4 py-2 first:pt-0"><span>{it.name}</span>{it.amount ? <span className="num shrink-0 text-muted">{it.amount}</span> : null}</li>)}
            </ul>
          ) : <p className="mb-3 text-[13px] text-muted">No ingredients written down for this meal.</p>}
          <NutritionTable m={m} />
          {/_chat_/.test(m.id) ? <p className="mt-2 text-[12px] text-muted">Added by the nightly meal-chat task.</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
            <Button size="sm" onClick={again}><Copy /> Log again</Button>
            <Button size="sm" variant="danger-ghost" className="ml-auto" onClick={() => setDeleting(true)}><Trash2 /> Delete</Button>
          </div>
        </div>
      ) : null}
      <MealSheet open={editing} onOpenChange={setEditing} date={m.date} meal={m} />
      <Confirm open={deleting} onOpenChange={setDeleting} title="Delete this meal?" description={`${m.meal}, ${fmt(+m.kcal)} kcal on ${fmtDay(m.date)}.`}
        onConfirm={() => engine.commit('food', [{ t: 'remove', c: 'meals', id: m.id }], 'Meal deleted')} />
    </li>
  );
}

/** One-line logging for the desktop: what, calories, protein, Enter. */
function QuickAdd({ date }: { date: string }) {
  const today = useToday();
  const [f, setF] = useState({ items: '', kcal: '', protein: '' });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const kcal = num(f.kcal), protein = num(f.protein);
    if (kcal == null || protein == null) { toast.error('Enter calories and protein.'); return; }
    const rec: Meal = { id: `${date}_${uid()}`, date, time: date === today ? nowHM() : '', meal: guessMeal(), items: f.items.trim(), kcal: Math.round(kcal), protein: Math.round(protein * 10) / 10 };
    engine.commit('food', [{ t: 'upsert', c: 'meals', r: rec }], 'Meal logged');
    setF({ items: '', kcal: '', protein: '' });
  };
  return (
    <form onSubmit={submit} className="mt-1 hidden gap-2 border-t border-line pt-3 lg:flex" aria-label="Quick add a meal">
      <label className="sr-only" htmlFor="qa-items">What you ate</label>
      <Input id="qa-items" className="h-10 min-w-0 flex-1" placeholder="Chicken, rice and salad" autoComplete="off" value={f.items} onChange={e => setF(s => ({ ...s, items: e.target.value }))} />
      <label className="sr-only" htmlFor="qa-kcal">Calories</label>
      <Input id="qa-kcal" className="h-10 w-20" inputMode="numeric" placeholder="kcal" value={f.kcal} onChange={e => setF(s => ({ ...s, kcal: e.target.value }))} />
      <label className="sr-only" htmlFor="qa-protein">Protein in grams</label>
      <Input id="qa-protein" className="h-10 w-24" inputMode="decimal" placeholder="g protein" value={f.protein} onChange={e => setF(s => ({ ...s, protein: e.target.value }))} />
      <Button type="submit" className="h-10">Add</Button>
    </form>
  );
}

function MealsCard({ date, openId, onAdd }: { date: string; openId?: string | undefined; onAdd: () => void }) {
  const data = useData();
  const meals = mealsOn(data.food.meals, date);
  const [open, setOpen] = useState<string | null>(openId ?? null);
  return (
    <Card aria-labelledby="meals-h" id="meals">
      <CardHeader id="meals-h" title="Meals" action={meals.length ? <span className="text-[12px] text-muted">Select a meal for its ingredients</span> : null} />
      <CardBody className="pt-1">
        {meals.length ? (
          <ul>{meals.map(m => <MealRow key={m.id} m={m} open={open === m.id} onToggle={() => setOpen(o => (o === m.id ? null : m.id))} />)}</ul>
        ) : (
          <EmptyState icon={<UtensilsCrossed />} title="Nothing logged for this day" action={<Button variant="primary" size="sm" onClick={onAdd}><Plus /> Log a meal</Button>}>
            Add meals here, or tell Claude in the meal chat and the bedtime task fills them in.
          </EmptyState>
        )}
        <QuickAdd date={date} />
      </CardBody>
    </Card>
  );
}

/* ---------- trend: daily or weekly, any bar can be selected ---------- */
type Metric = 'kcal' | 'protein' | 'carbs' | 'fat';
const META: Record<Metric, { label: string; unit: string; color: ChartColor }> = {
  kcal: { label: 'Calories', unit: 'kcal', color: 'track' }, protein: { label: 'Protein', unit: 'g', color: 'lane' },
  carbs: { label: 'Carbs', unit: 'g', color: 'carbs' }, fat: { label: 'Fat', unit: 'g', color: 'fat' },
};

function useFoodRows(view: 'day' | 'week') {
  const data = useData();
  const today = useToday();
  return useMemo(() => {
    const meals = data.food.meals;
    const one = (d: string) => { const t = dayTotals(meals, d); return { date: d, n: t.n, kcal: t.n ? t.kcal : null, protein: t.n ? t.protein : null, carbs: t.carbs, fat: t.fat }; };
    if (view === 'day') return Array.from({ length: 14 }, (_, i) => one(addDays(today, i - 13)));
    return Array.from({ length: 6 }, (_, i) => {
      const start = addDays(mondayOf(today), -7 * (5 - i));
      const ds = range(start, 7).filter(d => d <= today).map(one).filter(x => x.n);
      const mean = (k: Metric) => { const a = avg(ds.map(x => x[k])); return a == null ? null : Math.round(a); };
      return { date: start, n: ds.length, kcal: mean('kcal'), protein: mean('protein'), carbs: mean('carbs'), fat: mean('fat') };
    });
  }, [data.food.meals, today, view]);
}

function TrendCard({ date, onOpenDay }: { date: string; onOpenDay: (d: string) => void }) {
  const g = useGoals();
  const [view, setView] = useState<'day' | 'week'>('day');
  const [metric, setMetric] = useState<Metric>('kcal');
  const [picked, setPicked] = useState<string | null>(null);
  const rows = useFoodRows(view);
  const m = META[metric];
  const target = metric === 'kcal' ? g.kcal : metric === 'protein' ? g.protein : null;
  const logged = rows.filter(r => r[metric] != null);
  const a = avg(logged.map(r => r[metric]));
  const hit = logged.filter(r => (metric === 'kcal' ? Math.abs((r.kcal ?? 0) - g.kcal) <= g.kcal * 0.1 : (r.protein ?? 0) >= g.protein)).length;
  const sel = logged.find(r => r.date === picked) ?? (view === 'day' ? logged.find(r => r.date === date) : undefined) ?? logged[logged.length - 1] ?? null;
  const stat = (k: string, v: string, sub: string) => <div className="min-w-0"><dt className="truncate text-[12px] text-muted">{k}</dt><dd><span className="num text-[24px] leading-tight font-semibold">{v}</span><span className="text-[12px] text-muted"> {sub}</span></dd></div>;
  return (
    <Card aria-labelledby="trend-h" data-noswipe>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <h2 id="trend-h" className="sr-only">Trend</h2>
        <Segmented label="Period" size="sm" value={view} onChange={v => { setView(v); setPicked(null); }} options={[['day', 'Daily'], ['week', 'Weekly']]} />
        <Segmented label="Nutrient" size="sm" value={metric} onChange={setMetric} options={[['kcal', 'Calories'], ['protein', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fat']]} />
      </div>
      <CardBody className="flex flex-col gap-4">
        <dl className="grid grid-cols-3 gap-3">
          {stat(view === 'day' ? '14-day average' : '6-week average', fmt(a), m.unit)}
          {target != null ? stat('Target', fmt(target), m.unit) : stat('Highest', logged.length ? fmt(Math.max(...logged.map(r => r[metric] ?? 0))) : '–', m.unit)}
          {target != null
            ? stat(metric === 'kcal' ? 'Within 10% of target' : 'Hit target', `${hit} / ${logged.length}`, view === 'day' ? 'days' : 'weeks')
            : stat(view === 'day' ? 'Days logged' : 'Weeks logged', `${logged.length} / ${rows.length}`, '')}
        </dl>
        <TimeChart
          data={rows}
          height={250}
          zero
          selected={sel?.date ?? null}
          goal={target != null ? { value: target, label: `Target ${fmt(target)}` } : null}
          series={[{ key: metric, label: m.label, kind: 'bar', color: m.color, format: v => `${fmt(v)} ${m.unit}` }]}
          ariaLabel={`${view === 'day' ? 'Daily' : 'Weekly average'} ${m.label.toLowerCase()}${target != null ? ' against the target' : ''}. Select a bar to read it.`}
          onSelect={setPicked}
          empty={metric === 'carbs' || metric === 'fat' ? `Add ${m.label.toLowerCase()} to meals (More nutrients) to see this chart.` : 'Log a few days of meals to see the chart.'}
        />
        {sel ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[10px] bg-surface-2 px-3.5 py-2.5 shadow-card" aria-live="polite">
            <span className="text-[13px] text-muted">{view === 'day' ? fmtDay(sel.date) : `Week of ${fmtShort(sel.date)} · ${sel.n} ${sel.n === 1 ? 'day' : 'days'} logged`}</span>
            <span className="num">
              <span className="text-[17px] font-semibold">{fmt(sel[metric])}</span><span className="text-[12px] text-muted"> {m.unit}{view === 'week' ? ' a day' : ''}</span>
              {target != null && sel[metric] != null ? <span className="ml-2 text-[13px] text-muted">{signed(sel[metric]! - target, 0)} vs target</span> : null}
            </span>
            {view === 'day' && sel.date !== date ? <Button variant="ghost" size="sm" className="-mr-2 text-lane-ink" onClick={() => onOpenDay(sel.date)}>Open day</Button> : <span className="text-[12px] text-muted">{view === 'day' ? 'This day' : ''}</span>}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function WeeklyTable() {
  const g = useGoals();
  const weeks = useFoodRows('week').filter(w => w.n).reverse();
  return (
    <Card aria-labelledby="weeks-h">
      <CardHeader id="weeks-h" title="Weekly averages" action={<span className="text-[12px] text-muted">Judge progress by weeks, not single days</span>} />
      <CardBody className="pt-2">
        {weeks.length ? (
          <div className="-mx-1 overflow-x-auto" data-noswipe>
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead>
                <tr className="text-[12px] text-muted">
                  <th scope="col" className="px-1 py-2 font-normal">Week of</th>
                  <th scope="col" className="px-1 py-2 text-right font-normal">Days</th>
                  <th scope="col" className="px-1 py-2 text-right font-normal">kcal</th>
                  <th scope="col" className="px-1 py-2 text-right font-normal">vs target</th>
                  <th scope="col" className="px-1 py-2 text-right font-normal">Protein</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map(w => (
                  <tr key={w.date} className="border-t border-line">
                    <td className="px-1 py-2.5">{fmtShort(w.date)}</td>
                    <td className="num px-1 py-2.5 text-right">{w.n}</td>
                    <td className="num px-1 py-2.5 text-right">{fmt(w.kcal)}</td>
                    <td className="num px-1 py-2.5 text-right text-muted">{w.kcal != null ? signed(w.kcal - g.kcal, 0) : '–'}</td>
                    <td className={cn('num px-1 py-2.5 text-right', w.protein != null && w.protein >= g.protein && 'text-good')}>{w.protein != null ? `${fmt(w.protein)} g` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No weeks to average yet">Log meals for a few days.</EmptyState>}
        <p className="mt-3 text-[12px] text-muted lg:hidden">Swipe left or right anywhere above to change the day.</p>
        <Link to="/food" className="sr-only">Back to today</Link>
      </CardBody>
    </Card>
  );
}
