import { ChevronRight, Clock, Dumbbell, Flame, Layers, Play, Plus, Trophy, Weight } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, type TooltipContentProps } from 'recharts';
import { drafts, useData, useDraft, useToday } from '@/app/store';
import {
  bestSet, fmtSet, newDraft, prFlags, routines, sessionPrCount, sessionSets, sessionVolume, weekStreak, weeklyTraining,
} from '@/core/calc';
import { fmtRelative, fmtShort } from '@/core/dates';
import type { Session } from '@/core/types';
import { ExerciseIcon } from '@/components/ExerciseIcon';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/misc';
import { cn, fmt } from '@/lib/utils';

export const fmtMin = (m: number | null | undefined) => (m == null ? '–' : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
export const fmtVolume = (kg: number) => (kg >= 10000 ? `${fmt(kg / 1000, 1)} t` : `${fmt(kg)} kg`);

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

function Stat({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase [&_svg]:size-3.5">{icon}{label}</div>
      <div className="num text-[28px] leading-tight font-semibold">{value}</div>
      {sub ? <div className="truncate text-[12px] text-muted">{sub}</div> : null}
    </div>
  );
}

function WeekTip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const r = payload[0]!.payload as { date: string; volume: number; sessions: number };
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] shadow-pop">
      <div className="font-semibold">Week of {fmtShort(r.date)}</div>
      <div className="text-muted">{r.sessions} workouts · {fmtVolume(r.volume)}</div>
    </div>
  );
}

/** This week at a glance plus 8 weeks of volume. */
export function TrainStats({ className }: { className?: string }) {
  const sessions = useData().training.sessions;
  const today = useToday();
  const weeks = useMemo(() => weeklyTraining(sessions, today, 8), [sessions, today]);
  const thisWeek = weeks[weeks.length - 1]!;
  const streak = weekStreak(sessions, today);
  return (
    <Card className={className}>
      <CardHeader title="This week" meta={streak ? `${streak}-week streak` : 'Start a streak this week'} />
      <CardBody className="grid grid-cols-1 items-end gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat icon={<Dumbbell />} label="Workouts" value={String(thisWeek.sessions)} />
          <Stat icon={<Weight />} label="Volume" value={thisWeek.volume ? fmtVolume(thisWeek.volume) : '–'} />
          <Stat icon={<Layers />} label="Sets" value={String(thisWeek.sets)} />
          <Stat icon={<Flame />} label="Streak" value={`${streak}`} sub={streak === 1 ? 'week' : 'weeks'} />
        </div>
        <div className="h-[110px]" role="img" aria-label="Training volume per week, last 8 weeks">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <XAxis dataKey="date" tickFormatter={fmtShort} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} height={20} />
              <Tooltip content={p => <WeekTip {...(p as TooltipContentProps<number, string>)} />} cursor={{ fill: 'var(--surface-3)', fillOpacity: 0.6 }} isAnimationActive={false} />
              <Bar dataKey="volume" fill="var(--track)" radius={[4, 4, 0, 0]} maxBarSize={34} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardBody>
    </Card>
  );
}

/** Saved workouts by name ("routines") with their exercises, one tap to start. */
export function Routines({ className }: { className?: string }) {
  const sessions = useData().training.sessions;
  const today = useToday();
  const draft = useDraft();
  const start = useStartWorkout();
  const list = useMemo(() => routines(sessions).slice(0, 6), [sessions]);
  return (
    <section aria-labelledby="routines-h" className={className}>
      <div className="mb-3 flex items-end justify-between gap-2">
        <h2 id="routines-h" className="font-display text-[22px] font-semibold uppercase">Routines</h2>
        {draft ? <Link to="/train/log" className="text-sm font-semibold text-lane-ink hover:underline">{draft.name || 'Workout'} in progress</Link> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {list.map(r => (
          <Card key={r.name} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-[17px] font-semibold">{r.name}</h3>
                <p className="truncate text-[13px] text-muted">{fmtRelative(r.last.date, today)} · {r.count}×</p>
              </div>
              <Button variant="lane" size="sm" aria-label={`Start ${r.name}`} onClick={() => start(r.name)}><Play /> Start</Button>
            </div>
            <div className="mt-3 flex -space-x-1.5" aria-hidden>
              {r.last.exercises.slice(0, 6).map(ex => <ExerciseIcon key={ex.name} name={ex.name} kind={ex.kind} size={34} className="ring-2 ring-surface" />)}
            </div>
            <p className="mt-2 line-clamp-2 text-[13px] text-muted">{r.last.exercises.map(e => e.name).join(', ')}</p>
          </Card>
        ))}
        <button type="button" onClick={() => start('')}
          className="flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong p-4 text-muted transition-colors hover:border-track hover:text-track-ink">
          <Plus aria-hidden className="size-6" />
          <span className="font-semibold">Empty workout</span>
          <span className="text-[13px]">Pick exercises as you go</span>
        </button>
      </div>
    </section>
  );
}

/** Feed card for one saved workout, like a post in a workout app. */
export function SessionCard({ s, flags, active, compact }: { s: Session; flags?: Set<string>; active?: boolean; compact?: boolean }) {
  const data = useData();
  const today = useToday();
  const prs = sessionPrCount(data.training.sessions, s, flags ?? prFlags(data.training.sessions));
  const vol = sessionVolume(s);
  const show = compact ? 0 : 3;
  return (
    <Link to={`/train/session/${encodeURIComponent(s.id)}`} aria-current={active ? 'page' : undefined}
      className={cn('group block rounded-card border border-line/80 bg-surface p-4 shadow-card transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop aria-[current=page]:border-lane aria-[current=page]:ring-2 aria-[current=page]:ring-lane/25')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[17px] font-semibold">{s.name}</h3>
          <p className="text-[13px] text-muted">{fmtRelative(s.date, today)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {prs ? <Badge tone="track"><Trophy aria-hidden className="size-3" /> {prs} PR{prs > 1 ? 's' : ''}</Badge> : null}
          <ChevronRight aria-hidden className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {s.durationMin ? <div><dt className="sr-only">Duration</dt><dd className="flex items-center gap-1 text-muted"><Clock aria-hidden className="size-3.5" /><span className="font-semibold text-ink">{fmtMin(s.durationMin)}</span></dd></div> : null}
        <div><dt className="sr-only">Volume</dt><dd className="flex items-center gap-1 text-muted"><Weight aria-hidden className="size-3.5" /><span className="font-semibold text-ink">{vol ? fmtVolume(vol) : 'Bodyweight'}</span></dd></div>
        <div><dt className="sr-only">Sets</dt><dd className="flex items-center gap-1 text-muted"><Layers aria-hidden className="size-3.5" /><span className="font-semibold text-ink">{sessionSets(s)} sets</span></dd></div>
      </dl>
      {show ? (
        <ul className="mt-3 space-y-2 border-t border-line pt-3">
          {s.exercises.slice(0, show).map(ex => {
            const b = bestSet(ex);
            return (
              <li key={ex.name} className="flex items-center gap-3">
                <ExerciseIcon name={ex.name} kind={ex.kind} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{ex.name}</div>
                  <div className="truncate text-[12px] text-muted">{ex.sets.length} sets{b ? ` · best ${fmtSet(ex.kind, b)}` : ''}</div>
                </div>
                {flags?.has(s.id + '|' + ex.name.toLowerCase()) ? <Trophy aria-label="Personal record" className="size-4 text-track-ink" /> : null}
              </li>
            );
          })}
          {s.exercises.length > show ? <li className="pl-12 text-[12px] font-semibold text-muted">+{s.exercises.length - show} more</li> : null}
        </ul>
      ) : (
        <div className="mt-3 flex -space-x-1.5" aria-hidden>
          {s.exercises.slice(0, 7).map(ex => <ExerciseIcon key={ex.name} name={ex.name} kind={ex.kind} size={30} className="ring-2 ring-surface" />)}
        </div>
      )}
    </Link>
  );
}
