import { ChevronLeft, ChevronRight, Dumbbell, Footprints } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useData, useToday } from '@/app/store';
import { allActivities, isRun, sessionVolume, weekStrip, type WeekDay } from '@/core/calc';
import { addDays, fmtDay, fmtDom, fmtDow, fmtShort, mondayOf, parseYmd } from '@/core/dates';
import { cn, fmt } from '@/lib/utils';
import { Button } from './ui/button';

function weekLabel(monday: string, thisMonday: string) {
  if (monday === thisMonday) return 'This week';
  if (monday === addDays(thisMonday, -7)) return 'Last week';
  if (monday === addDays(thisMonday, 7)) return 'Next week';
  const sun = addDays(monday, 6);
  const sameMonth = parseYmd(monday).getMonth() === parseYmd(sun).getMonth();
  return `${sameMonth ? fmtDom(monday) : fmtShort(monday)}–${fmtShort(sun)}`;
}

const ItemIcon = ({ kind }: { kind: 'session' | 'activity' }) =>
  kind === 'session' ? <Dumbbell aria-hidden className="size-3.5 shrink-0" /> : <Footprints aria-hidden className="size-3.5 shrink-0" />;

function emptyText(d: WeekDay) {
  return d.state === 'rest' ? 'Rest' : '–';
}

function WeekSummary({ days }: { days: WeekDay[] }) {
  const data = useData();
  const acts = useMemo(() => allActivities(data), [data]);
  const dates = new Set(days.map(d => d.date));
  const sessions = data.training.sessions.filter(s => dates.has(s.date));
  const weekActs = acts.filter(a => dates.has(a.date));
  const runKm = weekActs.filter(a => isRun(a.type)).reduce((n, a) => n + (a.distanceKm || 0), 0);
  const volume = sessions.reduce((n, s) => n + sessionVolume(s), 0);
  const rest = days.filter(d => d.state === 'rest').length;
  const items: [string, string][] = [
    ['Sessions', String(sessions.length)],
    ['Activities', String(weekActs.length)],
    ['Run', `${fmt(runKm, 1)} km`],
    ['Volume', volume ? `${fmt(volume / 1000, 1)} t` : '–'],
    ['Rest days', String(rest)],
  ];
  return (
    <dl className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
      {items.map(([k, v], i) => (
        <div key={k} className={cn('rounded-xl bg-surface-2 px-3 py-2', i > 2 && 'max-sm:hidden')}>
          <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{k}</dt>
          <dd className="num text-xl leading-tight font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Monday–Sunday from real data only: training sessions, logged activities and Apple Health workouts. */
export function WeekStrip({ title }: { title?: ReactNode }) {
  const data = useData();
  const today = useToday();
  const thisMonday = mondayOf(today);
  const [monday, setMonday] = useState(thisMonday);
  const days = useMemo(() => weekStrip(data, monday, today), [data, monday, today]);
  const defaultSel = days.find(d => d.isToday)?.date ?? [...days].reverse().find(d => d.items.length)?.date ?? days[0]!.date;
  const [selected, setSelected] = useState<string | null>(null);
  const sel = days.find(d => d.date === selected) ?? days.find(d => d.date === defaultSel)!;
  const count = days.reduce((n, d) => n + d.items.length, 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        {title}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => { setMonday(addDays(monday, -7)); setSelected(null); }}><ChevronLeft /></Button>
          <button
            type="button"
            className="h-9 min-w-24 rounded-lg px-2 text-sm font-semibold hover:bg-surface-3/70 disabled:hover:bg-transparent"
            disabled={monday === thisMonday}
            onClick={() => { setMonday(thisMonday); setSelected(null); }}
            aria-label={monday === thisMonday ? 'This week' : 'Back to this week'}
          >
            <span aria-live="polite">{weekLabel(monday, thisMonday)}</span>
          </button>
          <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => { setMonday(addDays(monday, 7)); setSelected(null); }}><ChevronRight /></Button>
        </div>
      </div>

      <ol className="mt-2 grid grid-cols-7 gap-1.5 md:gap-2" aria-label={`${weekLabel(monday, thisMonday)}: ${count} logged`}>
        {days.map(d => (
          <li key={d.date} className="min-w-0">
            {/* Phone: compact day buttons; details for the chosen day show underneath. */}
            <button
              type="button"
              onClick={() => setSelected(d.date)}
              aria-pressed={sel.date === d.date}
              className={cn(
                'flex h-[72px] w-full flex-col items-center justify-center gap-0.5 rounded-xl border text-center transition-colors md:hidden',
                d.isToday ? 'border-track bg-track-soft/60' : 'border-line bg-surface-2',
                sel.date === d.date && 'ring-2 ring-lane/60',
              )}
            >
              <span className={cn('text-[11px] font-semibold uppercase', d.isToday ? 'text-track-ink' : 'text-muted')}>{fmtDow(d.date)}</span>
              <span className="num text-lg leading-none font-semibold">{fmtDom(d.date)}</span>
              <span className="sr-only">{fmtDay(d.date)}: {d.items.length ? d.items.map(i => i.label).join(', ') : d.state === 'rest' ? 'rest' : 'nothing logged'}</span>
              {d.items.length ? (
                <span className="mt-0.5 flex gap-0.5" aria-hidden>
                  {d.items.slice(0, 3).map(i => <span key={i.id} className={cn('size-1.5 rounded-full', i.kind === 'session' ? 'bg-track' : 'bg-lane')} />)}
                </span>
              ) : <span className="text-[11px] text-muted">{emptyText(d)}</span>}
            </button>

            {/* Tablet and up: full labels, each item clickable. */}
            <div className={cn(
              'hidden h-full min-h-[132px] flex-col rounded-xl border p-2 md:flex',
              d.isToday ? 'border-track bg-track-soft/50' : 'border-line bg-surface-2',
            )}>
              <div className="flex items-baseline justify-between px-1">
                <span className={cn('text-xs font-semibold uppercase', d.isToday ? 'text-track-ink' : 'text-muted')}>{fmtDow(d.date)}</span>
                <span className="num text-lg leading-none font-semibold">{fmtDom(d.date)}</span>
              </div>
              <div className="mt-2 flex flex-1 flex-col gap-1">
                {d.items.length ? d.items.map(i => (
                  <Link
                    key={i.id}
                    to={i.href}
                    title={i.label}
                    className={cn(
                      'flex min-h-8 items-center gap-1.5 rounded-lg px-1.5 py-1 text-[13px] leading-tight font-semibold transition-colors',
                      i.kind === 'session' ? 'bg-track-soft text-track-ink hover:bg-track/15' : 'bg-lane-soft text-lane-ink hover:bg-lane/15',
                    )}
                  >
                    <ItemIcon kind={i.kind} />
                    <span className="line-clamp-2 break-words">{i.label}</span>
                  </Link>
                )) : (
                  <span className={cn('grid flex-1 place-items-center text-sm', d.state === 'rest' ? 'text-muted' : 'text-muted/80')}>{emptyText(d)}</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <WeekSummary days={days} />

      <div className="mt-3 md:hidden">
        <div className="mb-1 text-[13px] font-semibold text-muted">{fmtDay(sel.date)}</div>
        {sel.items.length ? (
          <ul className="flex flex-col gap-1.5">
            {sel.items.map(i => (
              <li key={i.id}>
                <Link to={i.href} className={cn('flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold', i.kind === 'session' ? 'bg-track-soft text-track-ink' : 'bg-lane-soft text-lane-ink')}>
                  <ItemIcon kind={i.kind} /> {i.label}
                  <ChevronRight aria-hidden className="ml-auto size-4" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">{sel.state === 'rest' ? 'Rest day. Nothing logged.' : sel.isToday ? 'Nothing logged yet today.' : 'Nothing logged.'}</p>
        )}
      </div>
    </div>
  );
}
