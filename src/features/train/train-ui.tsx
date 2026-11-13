import { ChevronRight, Dumbbell, Play, Plus, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { drafts, useData, useDraft, useToday } from '@/app/store';
import {
  fmtSet, newDraft, overload, prFlags, routines, sessionPrCount, sessionSets, sessionVolume, sum, watchStrength, weekStreak, weeklyTraining,
} from '@/core/calc';
import { fmtClock, fmtRelative, fmtShort } from '@/core/dates';
import { exerciseInfo, MUSCLE_LABEL } from '@/core/exercises';
import type { Session } from '@/core/types';
import { TimeChart } from '@/components/charts';
import { ExerciseIcon } from '@/components/ExerciseIcon';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/misc';
import { cn, fmt } from '@/lib/utils';

export const fmtMin = (m: number | null | undefined) => (m == null ? '–' : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
export const fmtVolume = (kg: number) => (kg >= 10000 ? `${fmt(kg / 1000, 1)} t` : `${fmt(kg)} kg`);
const sessionReps = (s: Session) => sum(s.exercises.flatMap(e => e.sets.map(st => st.reps ?? 0)));

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

/** Small rounded label: a gain, a first time, a record. */
export function Pill({ tone = 'neutral', children }: { tone?: 'up' | 'down' | 'neutral' | 'accent'; children: React.ReactNode }) {
  const cls = tone === 'up' ? 'bg-good-soft text-good' : tone === 'down' ? 'bg-bad-soft text-bad' : tone === 'accent' ? 'bg-accent-soft text-accent-ink' : 'bg-surface-3 text-muted';
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-px text-[12px] font-medium whitespace-nowrap', cls)}>{children}</span>;
}

/** The last few sessions as rising or falling bars, newest solid. */
function Trend({ values, label }: { values: number[]; label: string }) {
  const top = Math.max(...values, 1);
  return (
    <span role="img" aria-label={label} className="flex h-8 w-10 shrink-0 items-end gap-1">
      {values.map((v, i) => <span key={i} className={cn('flex-1 rounded-[2px] bg-ink', i < values.length - 1 && 'opacity-35')} style={{ height: `${Math.max(12, (v / top) * 100)}%` }} />)}
    </span>
  );
}

/* ---------- this week ---------- */
/** This week's numbers, with the workout in progress when there is one. */
export function WeekCard({ className }: { className?: string }) {
  const sessions = useData().training.sessions;
  const today = useToday();
  const draft = useDraft();
  const weeks = useMemo(() => weeklyTraining(sessions, today, 1), [sessions, today]);
  const flags = useMemo(() => prFlags(sessions), [sessions]);
  const w = weeks[0]!;
  const streak = weekStreak(sessions, today);
  const records = sum(sessions.filter(s => s.date >= w.date).map(s => sessionPrCount(sessions, s, flags)));
  const done = draft ? draft.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0) : 0;
  const total = draft ? draft.exercises.reduce((n, e) => n + e.sets.length, 0) : 0;
  const stat = (label: string, value: string, unit?: string) => (
    <div><dt className="text-[12px] text-muted">{label}</dt><dd className="num mt-1 text-[26px] leading-none font-semibold">{value}{unit ? <span className="text-[12px] font-normal text-muted"> {unit}</span> : null}</dd></div>
  );
  return (
    <Card className={cn('flex flex-col', className)} aria-labelledby="week-h">
      <CardHeader id="week-h" title="This week" action={<span className="text-[12px] text-muted">{streak ? `${streak}-week streak` : 'Start a streak this week'}</span>} />
      <CardBody className="flex flex-1 flex-col gap-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          {stat('Workouts', String(w.sessions))}
          {stat('Sets', String(w.sets))}
          {w.volume ? stat('Volume', fmt(w.volume), 'kg') : stat('Volume', '–')}
          {stat('Records', String(records))}
        </dl>
        {draft ? (
          <Link to="/train/log" className="mt-auto flex min-h-14 items-center gap-3 rounded-[10px] bg-surface-2 px-3 py-2.5 shadow-card transition-colors hover:bg-surface-3">
            {draft.exercises[0] ? <ExerciseIcon name={draft.exercises[0].name} kind={draft.exercises[0].kind} size={36} /> : null}
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-muted">In progress{draft.startedAt ? ` · started ${fmtClock(draft.startedAt)}` : ''}</span>
              <span className="block truncate font-medium">{draft.name || 'Workout'}</span>
            </span>
            <span className="num shrink-0 text-[12px] text-muted">{done} of {total} sets</span>
          </Link>
        ) : null}
      </CardBody>
    </Card>
  );
}

/** Eight weeks of training load. Sets by default, because bodyweight work has no kilograms. */
export function LoadCard({ className }: { className?: string }) {
  const sessions = useData().training.sessions;
  const today = useToday();
  const weeks = useMemo(() => weeklyTraining(sessions, today, 8), [sessions, today]);
  const [metric, setMetric] = useState<'sets' | 'volume'>('sets');
  const [picked, setPicked] = useState<string | null>(null);
  const sel = weeks.find(w => w.date === picked) ?? weeks[weeks.length - 1]!;
  return (
    <Card className={cn('flex flex-col', className)} aria-labelledby="load-h">
      <CardHeader id="load-h" title="Weekly load" meta="Last 8 weeks" action={<Segmented label="Load measure" size="sm" value={metric} onChange={setMetric} options={[['sets', 'Sets'], ['volume', 'Volume']]} />} />
      <CardBody className="flex flex-1 flex-col gap-3">
        <TimeChart data={weeks} height={150} zero selected={sel.date} onSelect={setPicked}
          ariaLabel={`Training ${metric} per week for the last 8 weeks. Select a week to read it.`}
          series={[{ key: metric, label: metric === 'sets' ? 'Sets' : 'Volume', kind: 'bar', color: 'track', format: v => (metric === 'sets' ? `${fmt(v)} sets` : fmtVolume(v)) }]}
          yFormat={v => (v >= 1000 ? `${v / 1000}k` : String(v))} empty="Log a workout to see your weeks." />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[10px] bg-surface-2 px-3.5 py-2.5 shadow-card" aria-live="polite">
          <span className="text-[13px] text-muted">Week of {fmtShort(sel.date)}</span>
          <span className="num"><span className="font-semibold">{metric === 'sets' ? `${fmt(sel.sets)} sets` : sel.volume ? fmtVolume(sel.volume) : 'Bodyweight only'}</span><span className="ml-3 text-[12px] text-muted">{sel.sessions} {sel.sessions === 1 ? 'workout' : 'workouts'}</span></span>
        </div>
      </CardBody>
    </Card>
  );
}

/* ---------- progressive overload ---------- */
/** One row per exercise: icon, name, the last best set, the change since the time before, a small
    trend and the next target. Rows are tall enough to tap between sets. */
export function OverloadList({ className, limit = 6 }: { className?: string; limit?: number }) {
  const sessions = useData().training.sessions;
  const today = useToday();
  const rows = useMemo(() => overload(sessions, limit), [sessions, limit]);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="overload-h" className={className}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="overload-h" className="text-[17px] font-semibold tracking-tight">Progressive overload</h2>
        <span className="text-[12px] text-muted">Best set last time, the change since the time before, and what to aim for next</span>
      </div>
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {rows.map(r => (
          <li key={r.name}>
            <Link to={`/train/exercise/${encodeURIComponent(r.name)}`} className="flex min-h-[76px] items-center gap-3.5 rounded-card bg-surface p-3 pr-4 shadow-card transition-shadow hover:shadow-pop">
              <ExerciseIcon name={r.name} kind={r.kind} size={48} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{r.name}</span>
                <span className="block truncate text-[12px] text-muted">{MUSCLE_LABEL[exerciseInfo(r.name, r.kind).muscle]} · {fmtRelative(r.last.date, today)} · next {r.next}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="num text-[17px] leading-none font-semibold">{fmtSet(r.kind, r.last.set)}</span>
                {r.change == null ? <Pill>First time</Pill> : <Pill tone={r.up == null ? 'neutral' : r.up ? 'up' : 'down'}>{r.change}</Pill>}
              </span>
              <Trend values={r.trend} label={`Last ${r.trend.length === 1 ? 'session' : `${r.trend.length} sessions`}: ${r.trend.map(v => fmt(v, v % 1 ? 1 : 0)).join(', ')}`} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- routines ---------- */
/** Saved workouts by name ("routines") with their exercises as icons, one tap to start. */
export function Routines({ className }: { className?: string }) {
  const sessions = useData().training.sessions;
  const today = useToday();
  const start = useStartWorkout();
  const list = useMemo(() => routines(sessions).slice(0, 8), [sessions]);
  return (
    <section aria-labelledby="routines-h" className={className}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="routines-h" className="text-[17px] font-semibold tracking-tight">Routines</h2>
        <Button onClick={() => start('')}><Plus /> Empty workout</Button>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {list.map(r => (
          <li key={r.name} className="flex flex-col gap-3.5 rounded-card bg-surface p-4 shadow-card">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-medium">{r.name}</h3>
              <p className="truncate text-[12px] text-muted">{fmtRelative(r.last.date, today)} · {r.last.exercises.length} exercises · {sessionSets(r.last)} sets</p>
            </div>
            <div className="flex flex-1 items-start" aria-label={r.last.exercises.map(e => e.name).join(', ')} role="img">
              {r.last.exercises.slice(0, 5).map((ex, i) => <ExerciseIcon key={ex.name} name={ex.name} kind={ex.kind} size={38} className={cn('ring-2 ring-surface', i && '-ml-2')} />)}
              {r.last.exercises.length > 5 ? <span className="num -ml-2 grid size-[38px] place-items-center rounded-[11px] bg-surface-2 text-[12px] text-muted shadow-card ring-2 ring-surface">+{r.last.exercises.length - 5}</span> : null}
            </div>
            <Button className="h-11 w-full" aria-label={`Start ${r.name}`} onClick={() => start(r.name)}><Play /> Start</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- history ---------- */
/** Summary card for one saved workout: icon, title, date and duration, sets, volume, records. */
export function SessionCard({ s, flags, active, compact }: { s: Session; flags?: Set<string>; active?: boolean; compact?: boolean }) {
  const data = useData();
  const today = useToday();
  const prs = sessionPrCount(data.training.sessions, s, flags ?? prFlags(data.training.sessions));
  const vol = sessionVolume(s);
  const watch = useMemo(() => watchStrength(data).get(s.date)?.[0], [data, s.date]);
  const minutes = s.durationMin ?? (watch ? Math.round(watch.durationSec / 60) : null);
  const first = s.exercises[0];
  return (
    <Link to={`/train/session/${encodeURIComponent(s.id)}`} aria-current={active ? 'page' : undefined}
      className={cn('group flex flex-col gap-3.5 rounded-card bg-surface p-4 shadow-card transition-shadow hover:shadow-pop aria-[current=page]:shadow-[0_0_0_1px_var(--accent)]', compact && 'gap-2.5 p-3')}>
      <div className="flex items-center gap-3">
        {first ? <ExerciseIcon name={first.name} kind={first.kind} size={compact ? 40 : 44} /> : <span className="grid size-11 place-items-center rounded-[11px] bg-surface-2 text-muted shadow-card"><Dumbbell aria-hidden className="size-5" /></span>}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-medium">{s.name}</h3>
          <p className="num truncate text-[12px] text-muted">{fmtRelative(s.date, today)}{minutes ? ` · ${fmtMin(minutes)}` : ''}</p>
        </div>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </div>
      <dl className="flex items-end gap-6">
        <div><dd className="num text-[18px] leading-tight font-semibold">{sessionSets(s)}</dd><dt className="text-[12px] text-muted">Sets</dt></div>
        {vol
          ? <div><dd className="num text-[18px] leading-tight font-semibold">{fmt(vol)}<span className="text-[12px] font-normal text-muted"> kg</span></dd><dt className="text-[12px] text-muted">Volume</dt></div>
          : <div><dd className="num text-[18px] leading-tight font-semibold">{fmt(sessionReps(s))}<span className="text-[12px] font-normal text-muted"> reps</span></dd><dt className="text-[12px] text-muted">Bodyweight</dt></div>}
        <div className="ml-auto self-center">{prs ? <Pill tone="accent"><Trophy aria-hidden className="size-3" /> {prs} {prs === 1 ? 'record' : 'records'}</Pill> : null}</div>
      </dl>
    </Link>
  );
}
