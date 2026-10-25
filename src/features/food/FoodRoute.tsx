import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useMatch, useNavigate, useParams } from 'react-router';
import { engine, useData, useGoals, useToday } from '@/app/store';
import { avg, dayTotals, mealsOn, weeklyFood } from '@/core/calc';
import { addDays, fmtDay, fmtLong, fmtRelative, fmtShort } from '@/core/dates';
import { TimeChart } from '@/components/charts';
import { EmptyState, KV, Meter, PageHeader, RowLink } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/misc';
import { Confirm, useIsDesktop } from '@/components/ui/sheet';
import { NotFound } from '@/app/NotFound';
import { cn, fmt, signed } from '@/lib/utils';
import { MealSheet } from './MealSheet';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export function FoodRoute() {
  const params = useParams();
  const isTrends = !!useMatch('/food/trends');
  const desktop = useIsDesktop();
  const data = useData();
  const today = useToday();
  const meal = params.id ? data.food.meals.find(m => m.id === params.id) ?? null : null;
  if (params.id && !meal) return <NotFound />;
  if (params.date && !dateRe.test(params.date)) return <NotFound />;
  const date = meal?.date ?? params.date ?? today;

  if (!desktop) {
    if (meal) return <MealDetail mealId={meal.id} standalone />;
    if (isTrends) return <FoodTrends standalone />;
    return <FoodDay date={date} />;
  }
  return (
    <div className="grid grid-cols-12 items-start gap-5">
      <div className="col-span-12 lg:col-span-6 xl:col-span-5">
        <FoodDay date={date} selectedId={meal?.id} />
      </div>
      <div className="col-span-12 lg:sticky lg:top-6 lg:col-span-6 xl:col-span-7">
        {meal ? <MealDetail mealId={meal.id} /> : <FoodTrends />}
      </div>
    </div>
  );
}

function FoodDay({ date, selectedId }: { date: string; selectedId?: string }) {
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const nav = useNavigate();
  const [adding, setAdding] = useState(false);
  const tot = dayTotals(data.food.meals, date);
  const meals = mealsOn(data.food.meals, date);
  const isToday = date === today;
  const go = (d: string) => nav(d === today ? '/food' : `/food/${d}`);
  return (
    <div>
      <PageHeader
        kicker={isToday ? fmtLong(date) : 'Food'}
        title={isToday ? 'Food' : fmtDay(date)}
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon" aria-label="Previous day" onClick={() => go(addDays(date, -1))}><ChevronLeft /></Button>
            <Button variant="secondary" disabled={isToday} onClick={() => go(today)}>Today</Button>
            <Button variant="secondary" size="icon" aria-label="Next day" disabled={isToday} onClick={() => go(addDays(date, 1))}><ChevronRight /></Button>
          </div>
        }
      />
      <div className="space-y-4">
        <Card>
          <CardHeader title={fmtRelative(date, today)} meta={`${tot.n} ${tot.n === 1 ? 'meal' : 'meals'}`}
            action={<Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus /> Log meal</Button>} />
          <CardBody className="space-y-1">
            <Meter label="Calories" value={tot.kcal} target={g.kcal} unit="kcal" color="track" to="/food/trends" />
            <Meter label="Protein" value={tot.protein} target={g.protein} unit="g" color="lane" to="/food/trends" />
          </CardBody>
        </Card>
        <Card aria-labelledby="meals-h">
          <CardHeader id="meals-h" title="Meals" meta={fmtDay(date)} />
          <CardBody className="pt-1">
            {meals.length ? (
              <ul className="-mx-2 flex flex-col">
                {meals.map(m => (
                  <li key={m.id}>
                    <RowLink to={`/food/meal/${encodeURIComponent(m.id)}`} active={m.id === selectedId}>
                      <div className="w-12 shrink-0 text-[13px] font-semibold text-muted tabular-nums">{m.time || '—'}</div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{m.meal}</div>
                        <div className="line-clamp-2 text-[13px] text-muted">{m.items || 'No description'}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="num text-lg leading-none font-semibold text-track-ink">{fmt(+m.kcal)}<span className="ml-0.5 font-sans text-xs font-medium text-muted">kcal</span></div>
                        <div className="text-[13px] text-lane-ink">{fmt(+m.protein, +m.protein % 1 ? 1 : 0)} g protein</div>
                      </div>
                    </RowLink>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<UtensilsCrossed />} title="Nothing logged for this day" action={<Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus /> Log a meal</Button>}>
                Add meals here, or tell Claude in the meal chat and the bedtime task fills them in.
              </EmptyState>
            )}
          </CardBody>
        </Card>
        <RecentDays date={date} />
        <div className="lg:hidden">
          <Button asChild variant="secondary" className="w-full"><Link to="/food/trends">Last 14 days and weekly averages</Link></Button>
        </div>
      </div>
      <MealSheet open={adding} onOpenChange={setAdding} date={date} />
    </div>
  );
}

function RecentDays({ date }: { date: string }) {
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  return (
    <Card aria-labelledby="recent-days-h">
      <CardHeader id="recent-days-h" title="Last 7 days" />
      <CardBody className="pt-1">
        <ul className="-mx-2 flex flex-col">
          {days.map(d => {
            const t = dayTotals(data.food.meals, d);
            return (
              <li key={d}>
                <RowLink to={d === today ? '/food' : `/food/${d}`} active={d === date}>
                  <div className="w-24 shrink-0 font-semibold">{fmtRelative(d, today)}</div>
                  <div className="min-w-0 flex-1 space-y-1" aria-hidden>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-track" style={{ width: `${Math.min(100, (t.kcal / g.kcal) * 100)}%` }} /></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-lane" style={{ width: `${Math.min(100, (t.protein / g.protein) * 100)}%` }} /></div>
                  </div>
                  <div className="w-28 shrink-0 text-right text-[13px]">
                    {t.n ? <><span className="num text-base font-semibold text-track-ink">{fmt(t.kcal)}</span> kcal<br /><span className="text-lane-ink">{fmt(t.protein)} g</span></> : <span className="text-muted">Nothing logged</span>}
                  </div>
                </RowLink>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

function MealDetail({ mealId, standalone }: { mealId: string; standalone?: boolean }) {
  const data = useData();
  const g = useGoals();
  const nav = useNavigate();
  const today = useToday();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const m = data.food.meals.find(x => x.id === mealId);
  if (!m) return <NotFound />;
  const tot = dayTotals(data.food.meals, m.date);
  const kcalShare = tot.kcal ? (+m.kcal / tot.kcal) * 100 : 0;
  return (
    <div>
      {standalone ? <PageHeader back={`/food/${m.date}`} kicker={fmtDay(m.date)} title={m.meal} /> : null}
      <Card>
        <CardHeader
          title={standalone ? 'Meal' : `${m.meal} · ${fmtRelative(m.date, today)}`}
          meta={[m.time, fmtDay(m.date)].filter(Boolean).join(' · ')}
          action={
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
              <Button variant="danger-ghost" size="sm" onClick={() => setDeleting(true)}><Trash2 /> Delete</Button>
            </div>
          }
        />
        <CardBody>
          <p className="text-[17px] leading-snug">{m.items || <span className="text-muted">No description</span>}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <KV k="Calories" v={<span className="text-track-ink">{fmt(+m.kcal)}</span>} sub={`${fmt(kcalShare)}% of the day · ${fmt((+m.kcal / g.kcal) * 100)}% of target`} />
            <KV k="Protein" v={<span className="text-lane-ink">{fmt(+m.protein, +m.protein % 1 ? 1 : 0)} g</span>} sub={`${fmt((+m.protein / g.protein) * 100)}% of target`} />
          </div>
          <div className="mt-4 text-[13px] text-muted">
            Day total: {fmt(tot.kcal)} kcal · {fmt(tot.protein)} g protein ·{' '}
            <Link className="font-semibold text-lane-ink hover:underline" to={m.date === today ? '/food' : `/food/${m.date}`}>Open day</Link>
          </div>
          {/_chat_/.test(m.id) ? <p className="mt-2 text-[13px] text-muted">Added by the nightly meal-chat task.</p> : null}
        </CardBody>
      </Card>
      <MealSheet open={editing} onOpenChange={setEditing} date={m.date} meal={m} />
      <Confirm open={deleting} onOpenChange={setDeleting} title="Delete this meal?" description={`${m.meal}, ${fmt(+m.kcal)} kcal on ${fmtDay(m.date)}.`}
        onConfirm={() => { engine.commit('food', [{ t: 'remove', c: 'meals', id: m.id }], 'Meal deleted'); nav(m.date === today ? '/food' : `/food/${m.date}`, { replace: true }); }} />
    </div>
  );
}

function FoodTrends({ standalone }: { standalone?: boolean }) {
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const nav = useNavigate();
  const [metric, setMetric] = useState<'kcal' | 'protein'>('kcal');
  const days14 = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)), [today]);
  const rows = days14.map(d => { const t = dayTotals(data.food.meals, d); return { date: d, kcal: t.n ? t.kcal : null, protein: t.n ? t.protein : null }; });
  const weeks = weeklyFood(data.food.meals, today, 6);
  const target = metric === 'kcal' ? g.kcal : g.protein;
  const logged = rows.filter(r => r.kcal != null);
  const a = avg(logged.map(r => r[metric]));
  const hit = logged.filter(r => metric === 'kcal' ? Math.abs((r.kcal ?? 0) - g.kcal) <= g.kcal * 0.1 : (r.protein ?? 0) >= g.protein).length;
  const unit = metric === 'kcal' ? 'kcal' : 'g';
  return (
    <div>
      {standalone ? <PageHeader back="/food" kicker="Food" title="Last 14 days" /> : null}
      <div className="space-y-4">
        <Card>
          <CardHeader title={standalone ? 'Daily totals' : 'Last 14 days'} meta="Tap a bar to open that day"
            action={<Segmented label="Metric" value={metric} onChange={setMetric} options={[['kcal', 'Calories'], ['protein', 'Protein']]} />} />
          <CardBody>
            <div className="mb-3 grid grid-cols-3 gap-2 sm:gap-3">
              <KV k="14-day avg" v={fmt(a)} sub={unit} />
              <KV k="Target" v={fmt(target)} sub={unit} />
              <KV k={metric === 'kcal' ? 'Within 10%' : 'Hit target'} v={`${hit}/${logged.length}`} sub="logged days" />
            </div>
            <TimeChart
              data={rows}
              height={standalone ? 240 : 300}
              zero
              goal={{ value: target, label: `Target ${fmt(target)}` }}
              series={[{
                key: metric, label: metric === 'kcal' ? 'Calories' : 'Protein', kind: 'bar', color: metric === 'kcal' ? 'track' : 'lane',
                format: v => `${fmt(v)} ${metric === 'kcal' ? 'kcal' : 'g protein'}`,
              }]}
              ariaLabel={`Daily ${metric === 'kcal' ? 'calories' : 'protein'} for the last 14 days against the target`}
              onSelect={d => nav(d === today ? '/food' : `/food/${d}`)}
              empty="Log a few days of meals to see the chart."
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Weekly averages" meta="Judge progress by weekly averages, not single days." />
          <CardBody className="pt-2">
            {weeks.length ? (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[320px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-[12px] tracking-wide text-muted uppercase">
                      <th scope="col" className="px-1 py-2 font-semibold">Week of</th>
                      <th scope="col" className="px-1 py-2 text-right font-semibold">Days</th>
                      <th scope="col" className="px-1 py-2 text-right font-semibold">kcal</th>
                      <th scope="col" className="px-1 py-2 text-right font-semibold">vs target</th>
                      <th scope="col" className="px-1 py-2 text-right font-semibold">Protein</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map(w => (
                      <tr key={w.start} className="border-b border-line/70 last:border-0">
                        <td className="px-1 py-2.5 font-semibold">{fmtShort(w.start)}</td>
                        <td className="num px-1 py-2.5 text-right text-[16px]">{w.n}</td>
                        <td className="num px-1 py-2.5 text-right text-[16px]">{fmt(w.kcal)}</td>
                        <td className={cn('num px-1 py-2.5 text-right text-[16px]', w.kcal != null && w.kcal > g.kcal ? 'text-track-ink' : 'text-muted')}>{w.kcal != null ? signed(w.kcal - g.kcal, 0) : '–'}</td>
                        <td className={cn('num px-1 py-2.5 text-right text-[16px]', w.protein != null && w.protein >= g.protein ? 'text-good' : '')}>{w.protein != null ? `${fmt(w.protein)} g` : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title="No weeks to average yet">Log meals for a few days.</EmptyState>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
