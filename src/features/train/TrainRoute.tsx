import { DropdownMenu } from 'radix-ui';
import { Clock, Copy, Dumbbell, Layers, MoreHorizontal, Pencil, Play, Search, Trash2, Trophy, Weight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useMatch, useNavigate, useParams } from 'react-router';
import { drafts, engine, useData, useDraft, useToday } from '@/app/store';
import { NotFound } from '@/app/NotFound';
import {
  bests, byDateDesc, draftFromSession, exerciseNames, exerciseRecords, exHistory, exMetric, fmtSet, KIND_LABEL, metricUnit, newDraft,
  prFlags, sessionPrCount, sessionSets, sessionVolume, setMetric, type Draft,
} from '@/core/calc';
import { fmtDay, fmtRelative, fmtShort } from '@/core/dates';
import { EQUIPMENT_LABEL, exerciseInfo, MUSCLE_LABEL, type Muscle } from '@/core/exercises';
import type { Session } from '@/core/types';
import { TimeChart } from '@/components/charts';
import { EmptyState, KV, PageHeader, RowLink } from '@/components/common';
import { ExerciseIcon } from '@/components/ExerciseIcon';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { Badge, Segmented } from '@/components/ui/misc';
import { Confirm, useIsDesktop } from '@/components/ui/sheet';
import { cn, fmt, fmtKg } from '@/lib/utils';
import { MuscleFilter, useExerciseList } from './ExercisePicker';
import { StartWorkoutSheet } from './StartWorkoutSheet';
import { fmtMin, fmtVolume, Routines, SessionCard, TrainStats } from './train-ui';

/* ---------- shell ---------- */
function TrainActions() {
  const [picking, setPicking] = useState(false);
  const draft = useDraft();
  return (
    <>
      {draft
        ? <Button asChild variant="primary"><Link to="/train/log"><Play /> Resume workout</Link></Button>
        : <Button variant="primary" onClick={() => setPicking(true)}><Play /> Start workout</Button>}
      <StartWorkoutSheet open={picking} onOpenChange={setPicking} />
    </>
  );
}

function TrainTabs() {
  const nav = useNavigate();
  const progress = !!useMatch('/train/progress');
  const lib = !!useMatch('/train/exercises');
  const ex = !!useMatch('/train/exercise/:name');
  const value = progress ? 'progress' : lib || ex ? 'exercises' : 'overview';
  return (
    <Segmented label="Training view" value={value} onChange={v => nav(v === 'overview' ? '/train' : `/train/${v}`)}
      options={[['overview', 'Overview'], ['progress', 'Progress'], ['exercises', 'Exercises']]} />
  );
}

function TrainHeader({ title = 'Train' }: { title?: string }) {
  return (
    <>
      <PageHeader kicker="Training" title={title} actions={<TrainActions />} />
      <div className="mb-5"><TrainTabs /></div>
    </>
  );
}

export function TrainRoute() {
  const params = useParams();
  const isProgress = !!useMatch('/train/progress');
  const isLibrary = !!useMatch('/train/exercises');
  const desktop = useIsDesktop();
  const sessions = useData().training.sessions;
  const session = params.id ? sessions.find(s => s.id === params.id) : undefined;
  if (params.id && !session) return <NotFound />;

  if (session) {
    if (!desktop) return <SessionDetail session={session} standalone />;
    return (
      <div>
        <TrainHeader />
        <div className="grid grid-cols-12 items-start gap-5">
          <div className="col-span-5 xl:col-span-4"><HistoryList selectedId={session.id} /></div>
          <div className="col-span-7 lg:sticky lg:top-6 xl:col-span-8"><SessionDetail session={session} /></div>
        </div>
      </div>
    );
  }
  if (params.name) return <ExerciseDetail name={params.name} />;
  if (isProgress) return <div><TrainHeader /><Progress /></div>;
  if (isLibrary) return <div><TrainHeader /><Library /></div>;
  return <TrainHome />;
}

/* ---------- overview ---------- */
function TrainHome() {
  const sessions = useData().training.sessions;
  const flags = useMemo(() => prFlags(sessions), [sessions]);
  const sorted = useMemo(() => [...sessions].sort(byDateDesc), [sessions]);
  const [shown, setShown] = useState(9);
  return (
    <div>
      <TrainHeader />
      {sessions.length ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <TrainStats className="lg:col-span-12" />
          <Routines className="lg:col-span-12" />
          <section aria-labelledby="history-h" className="lg:col-span-12">
            <div className="mb-3 flex items-end justify-between">
              <h2 id="history-h" className="font-display text-[22px] font-semibold uppercase">History</h2>
              <span className="text-[13px] text-muted">{sessions.length} workouts</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sorted.slice(0, shown).map(s => <SessionCard key={s.id} s={s} flags={flags} />)}
            </div>
            {sorted.length > shown ? <Button variant="secondary" className="mt-4 w-full" onClick={() => setShown(n => n + 12)}>Show more</Button> : null}
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-12">
            <CardBody className="pt-4">
              <EmptyState icon={<Dumbbell />} title="Log your first workout" action={<TrainActions />}>
                Start an empty workout and add exercises as you go. Next time, it becomes a routine you can repeat with last time’s numbers filled in.
              </EmptyState>
            </CardBody>
          </Card>
          <section className="lg:col-span-12" aria-labelledby="lib-h">
            <h2 id="lib-h" className="mb-3 font-display text-[22px] font-semibold uppercase">Exercise library</h2>
            <Library compact />
          </section>
        </div>
      )}
    </div>
  );
}

function HistoryList({ selectedId }: { selectedId?: string }) {
  const sessions = useData().training.sessions;
  const flags = useMemo(() => prFlags(sessions), [sessions]);
  const sorted = useMemo(() => [...sessions].sort(byDateDesc), [sessions]);
  return (
    <div className="space-y-2.5">
      {sorted.slice(0, 40).map(s => <SessionCard key={s.id} s={s} flags={flags} active={s.id === selectedId} compact />)}
    </div>
  );
}

/* ---------- session detail ---------- */
function useReplaceDraft() {
  const draft = useDraft();
  const nav = useNavigate();
  const [pending, setPending] = useState<Draft | null>(null);
  const go = (d: Draft) => { drafts.set(d); nav('/train/log'); };
  return {
    request: (d: Draft) => (draft ? setPending(d) : go(d)),
    dialog: (
      <Confirm open={!!pending} onOpenChange={o => { if (!o) setPending(null); }} title="Replace the workout in progress?"
        description={`${draft?.name || 'A workout'} is not saved yet. It will be discarded.`} confirmLabel="Replace"
        onConfirm={() => { if (pending) go(pending); setPending(null); }} />
    ),
  };
}

function SessionDetail({ session: s, standalone }: { session: Session; standalone?: boolean }) {
  const data = useData();
  const today = useToday();
  const nav = useNavigate();
  const sessions = data.training.sessions;
  const flags = useMemo(() => prFlags(sessions), [sessions]);
  const [deleting, setDeleting] = useState(false);
  const replace = useReplaceDraft();
  const vol = sessionVolume(s);
  const prs = sessionPrCount(sessions, s, flags);
  const actions = (
    <div className="flex items-center gap-2">
      <Button variant="lane" size="sm" onClick={() => replace.request({ ...newDraft(sessions, s.name, today, s), startedAt: Date.now() })}><Copy /> Repeat</Button>
      <Button variant="secondary" size="sm" onClick={() => replace.request(draftFromSession(s))}><Pencil /> Edit</Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild><Button variant="ghost" size="icon-sm" aria-label="More options"><MoreHorizontal /></Button></DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-xl border border-line bg-surface p-1 shadow-pop">
            <DropdownMenu.Item onSelect={() => setDeleting(true)} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-semibold text-bad outline-none data-[highlighted]:bg-bad-soft">
              <Trash2 className="size-4" /> Delete workout
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
  return (
    <div>
      {standalone ? <PageHeader back="/train" kicker={`${fmtDay(s.date)} · ${fmtRelative(s.date, today)}`} title={s.name} /> : null}
      <Card>
        {!standalone ? <CardHeader title={s.name} meta={`${fmtDay(s.date)} · ${fmtRelative(s.date, today)}`} action={actions} /> : null}
        <CardBody className={cn(standalone && 'pt-4')}>
          {standalone ? <div className="mb-4">{actions}</div> : null}
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {[
              [<Clock key="c" />, 'Duration', s.durationMin ? fmtMin(s.durationMin) : '–'],
              [<Weight key="w" />, 'Volume', vol ? fmtVolume(vol) : '–'],
              [<Layers key="l" />, 'Sets', String(sessionSets(s))],
              [<Trophy key="t" />, 'Records', String(prs)],
            ].map(([icon, k, v]) => (
              <div key={k as string} className="rounded-xl bg-surface-2 px-3.5 py-2.5">
                <dt className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-muted uppercase [&_svg]:size-3.5">{icon}{k}</dt>
                <dd className={cn('num text-[24px] leading-tight font-semibold', k === 'Records' && prs ? 'text-track-ink' : '')}>{v}</dd>
              </div>
            ))}
          </dl>
          {s.notes ? <p className="mt-4 rounded-xl border-l-4 border-lane bg-surface-2 px-4 py-3 text-[15px]">{s.notes}</p> : null}
          <ol className="mt-4 flex flex-col gap-3">
            {s.exercises.map((ex, i) => {
              const isPr = flags.has(s.id + '|' + ex.name.toLowerCase());
              const prevH = exHistory(sessions, ex.name).filter(h => h.sess.id !== s.id && (h.date < s.date || (h.date === s.date && h.sess.id < s.id)));
              const prev = prevH[prevH.length - 1];
              const m = exMetric(ex);
              const diff = prev && Number.isFinite(m) && Number.isFinite(prev.m) ? m - prev.m : null;
              const topIdx = ex.sets.reduce((bi, st, j) => ((setMetric(ex.kind, st) ?? -1) > (setMetric(ex.kind, ex.sets[bi]!) ?? -1) ? j : bi), 0);
              const info = exerciseInfo(ex.name, ex.kind);
              return (
                <li key={i} className="overflow-hidden rounded-xl border border-line">
                  <div className="flex items-center gap-3 px-3 pt-3 sm:px-4">
                    <ExerciseIcon name={ex.name} kind={ex.kind} size={44} />
                    <div className="min-w-0 flex-1">
                      <Link to={`/train/exercise/${encodeURIComponent(ex.name)}`} className="block truncate font-semibold text-lane-ink hover:underline">{ex.name}</Link>
                      <div className="truncate text-[12px] text-muted">{MUSCLE_LABEL[info.muscle]} · {KIND_LABEL[ex.kind]}</div>
                    </div>
                    {isPr ? <Badge tone="track"><Trophy aria-hidden className="size-3" /> PR</Badge> : null}
                  </div>
                  <table className="mt-2 w-full text-sm">
                    <thead>
                      <tr className="text-[11px] tracking-wide text-muted uppercase">
                        <th scope="col" className="w-12 py-1 text-center font-semibold">Set</th>
                        <th scope="col" className="py-1 text-left font-semibold">{ex.kind === 'weight' ? 'Weight × reps' : ex.kind === 'hold' ? 'Hold' : 'Reps'}</th>
                        <th scope="col" className="py-1 pr-4 text-right font-semibold">{ex.kind === 'weight' ? 'e1RM' : ''}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ex.sets.map((st, j) => {
                        const sm = setMetric(ex.kind, st);
                        return (
                          <tr key={j} className={cn('border-t border-line/60', j === topIdx && isPr && 'bg-track-soft/50')}>
                            <td className="num py-2 text-center text-[16px] font-semibold text-muted">{j + 1}</td>
                            <td className="num py-2 text-[17px] font-semibold">
                              {fmtSet(ex.kind, st).replace('×', ' × ')}{ex.kind === 'weight' ? <span className="font-sans text-xs text-muted"> kg</span> : ex.kind === 'hold' ? null : <span className="font-sans text-xs text-muted"> reps</span>}
                              {j === topIdx && isPr ? <Trophy aria-label="Best set, personal record" className="ml-1.5 inline size-3.5 text-track-ink" /> : null}
                            </td>
                            <td className="num py-2 pr-4 text-right text-[15px] text-muted">{ex.kind === 'weight' && sm ? fmtKg(Math.round(sm * 10) / 10) : ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="flex flex-wrap justify-between gap-2 border-t border-line/60 bg-surface-2/60 px-4 py-2 text-[12px] text-muted">
                    <span>{ex.kind === 'weight' ? `Volume ${fmt(ex.sets.reduce((a, st) => a + (st.kg || 0) * (st.reps || 0), 0))} kg` : `${ex.sets.length} sets`}</span>
                    {diff != null ? <span className={cn('font-semibold', diff > 0 ? 'text-good' : diff < 0 ? 'text-bad' : '')}>{diff > 0 ? '+' : diff < 0 ? '−' : '±'}{fmt(Math.abs(diff), ex.kind === 'weight' ? 1 : 0)} {metricUnit(ex.kind)} vs {fmtShort(prev!.date)}</span> : <span>First time</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>
      {replace.dialog}
      <Confirm open={deleting} onOpenChange={setDeleting} title="Delete this workout?" description={`${s.name} on ${fmtDay(s.date)}. GitHub keeps the history if you need it back.`}
        onConfirm={() => { engine.commit('training', [{ t: 'remove', c: 'sessions', id: s.id }], 'Workout deleted'); nav('/train', { replace: true }); }} />
    </div>
  );
}

/* ---------- progress ---------- */
function ExerciseChart({ name, height = 280 }: { name: string; height?: number }) {
  const sessions = useData().training.sessions;
  const nav = useNavigate();
  const hist = exHistory(sessions, name).filter(x => Number.isFinite(x.m));
  const kind = hist.length ? hist[hist.length - 1]!.ex.kind : 'weight';
  const rows = hist.map(h => ({ date: h.date, m: Math.round(h.m * 10) / 10, id: h.sess.id }));
  return (
    <>
      <TimeChart data={rows} height={height} ariaLabel={`${name} progress over time`}
        onSelect={d => { const r = rows.find(x => x.date === d); if (r) nav(`/train/session/${encodeURIComponent(r.id)}`); }}
        series={[{ key: 'm', label: metricUnit(kind), kind: 'line', color: 'lane', format: v => `${fmt(v, v % 1 ? 1 : 0)} ${metricUnit(kind)}` }]}
        empty="Log this exercise twice to see a trend." />
      {kind === 'weight' ? <p className="mt-2 text-[13px] text-muted">e1RM is an estimated one-rep max from your best set (Epley: kg × (1 + reps / 30)). It tracks progress without testing a true max.</p> : null}
    </>
  );
}

function Progress() {
  const sessions = useData().training.sessions;
  const names = exerciseNames(sessions);
  const rows = useMemo(() => bests(sessions), [sessions]);
  const [ex, setEx] = useState('');
  const current = names.includes(ex) ? ex : names[0] ?? '';
  if (!names.length) return <Card><CardBody className="pt-4"><EmptyState icon={<Dumbbell />} title="Nothing to show yet">Progress appears after you log workouts.</EmptyState></CardBody></Card>;
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
      <Card className="lg:col-span-7">
        <CardHeader title={<span className="flex items-center gap-3"><ExerciseIcon name={current} size={36} />{current}</span>} meta="Best set per workout · tap a point to open it"
          action={<div className="w-56 max-w-full"><Select aria-label="Exercise" value={current} onChange={e => setEx(e.target.value)}>{names.map(n => <option key={n}>{n}</option>)}</Select></div>} />
        <CardBody><ExerciseChart name={current} /></CardBody>
      </Card>
      <Card className="lg:col-span-5">
        <CardHeader title="Personal bests" meta={`${rows.length} exercises`} />
        <CardBody className="pt-1">
          <ul className="-mx-2">
            {rows.map(r => (
              <li key={r.name}>
                <RowLink to={`/train/exercise/${encodeURIComponent(r.name)}`}>
                  <ExerciseIcon name={r.name} kind={r.kind} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.name}</div>
                    <div className="truncate text-[13px] text-muted">Best {fmtSet(r.kind, r.topSet).replace('×', ' × ')} · {fmtShort(r.best.date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="num text-lg leading-none font-semibold">{fmt(r.best.m, r.kind === 'weight' ? 1 : 0)}</div>
                    <div className="text-[11px] text-muted">{r.kind === 'weight' ? 'kg e1RM' : r.kind === 'hold' ? 's' : 'reps'}</div>
                  </div>
                </RowLink>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

/* ---------- exercise library ---------- */
function Library({ compact }: { compact?: boolean }) {
  const { all, count } = useExerciseList();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all');
  const query = q.trim().toLowerCase();
  const visible = all.filter(n => (!query || n.toLowerCase().includes(query)) && (muscle === 'all' || exerciseInfo(n).muscle === muscle));
  return (
    <Card>
      <CardBody className="space-y-3 pt-4">
        {!compact ? null : <p className="text-sm text-muted">Every exercise gets an icon by movement and a colour by muscle group.</p>}
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input aria-label="Search exercises" placeholder="Search exercises" value={q} onChange={e => setQ(e.target.value)} className="pl-9" autoComplete="off" />
        </div>
        <MuscleFilter value={muscle} onChange={setMuscle} />
        <ul className="-mx-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(n => {
            const info = exerciseInfo(n);
            const c = count(n);
            return (
              <li key={n}>
                <RowLink to={`/train/exercise/${encodeURIComponent(n)}`}>
                  <ExerciseIcon name={n} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{n}</div>
                    <div className="truncate text-[12px] text-muted">{MUSCLE_LABEL[info.muscle]} · {EQUIPMENT_LABEL[info.equipment]}{c ? ` · ${c}×` : ''}</div>
                  </div>
                </RowLink>
              </li>
            );
          })}
        </ul>
        {!visible.length ? <p className="py-6 text-center text-sm text-muted">No exercises match.</p> : null}
      </CardBody>
    </Card>
  );
}

/* ---------- exercise detail ---------- */
function ExerciseDetail({ name }: { name: string }) {
  const sessions = useData().training.sessions;
  const today = useToday();
  const hist = exHistory(sessions, name);
  const rec = exerciseRecords(sessions, name);
  const info = exerciseInfo(hist[hist.length - 1]?.ex.name ?? name, hist[hist.length - 1]?.ex.kind);
  const display = hist[hist.length - 1]?.ex.name ?? info.name;
  const kind = rec?.kind ?? info.kind;
  return (
    <div>
      <PageHeader back="/train/exercises" kicker={`${MUSCLE_LABEL[info.muscle]} · ${EQUIPMENT_LABEL[info.equipment]}`}
        title={<span className="flex items-center gap-3"><ExerciseIcon name={display} kind={kind} size={52} /><span className="truncate">{display}</span></span>} />
      {!rec ? (
        <Card><CardBody className="pt-4"><EmptyState icon={<Dumbbell />} title="Not logged yet">Add it to a workout and your records and progress show up here.</EmptyState></CardBody></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-12">
            <KV k={kind === 'weight' ? 'Best e1RM' : kind === 'hold' ? 'Longest hold' : 'Most reps'} v={rec.best ? fmt(rec.best.m, kind === 'weight' ? 1 : 0) : '–'} sub={rec.best ? `${metricUnit(kind)} · ${fmtShort(rec.best.date)}` : ''} />
            <KV k="Heaviest" v={rec.heaviest ? `${fmtKg(rec.heaviest.kg)} kg` : '–'} sub={rec.heaviest ? fmtShort(rec.heaviest.date) : kind === 'weight' ? '' : 'bodyweight'} />
            <KV k="Best volume" v={rec.mostVolume ? fmtVolume(rec.mostVolume.volume) : '–'} sub={rec.mostVolume ? fmtShort(rec.mostVolume.date) : 'one workout'} />
            <KV k="Workouts" v={rec.sessions} sub={hist.length ? `since ${fmtShort(hist[0]!.date)}` : ''} />
          </div>
          <Card className="lg:col-span-8">
            <CardHeader title="Progress" meta="Best set per workout" />
            <CardBody><ExerciseChart name={name} height={300} /></CardBody>
          </Card>
          <Card className="lg:col-span-4">
            <CardHeader title="History" />
            <CardBody className="pt-1">
              <ul className="-mx-2 max-h-[520px] overflow-y-auto">
                {[...hist].reverse().map(h => (
                  <li key={h.sess.id}>
                    <RowLink to={`/train/session/${encodeURIComponent(h.sess.id)}`}>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{h.sess.name} <span className="font-normal text-muted">· {fmtRelative(h.date, today)}</span></div>
                        <div className="truncate text-[13px] text-muted">{h.ex.sets.map(st => fmtSet(h.ex.kind, st)).join(' · ')}</div>
                      </div>
                      <div className="num text-lg font-semibold">{Number.isFinite(h.m) ? fmt(h.m, kind === 'weight' ? 1 : 0) : '–'}</div>
                    </RowLink>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
