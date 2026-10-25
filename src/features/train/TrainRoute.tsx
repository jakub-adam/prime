import { Copy, Dumbbell, Pencil, Play, Trash2, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useMatch, useNavigate, useParams } from 'react-router';
import { drafts, engine, useData, useDraft, useToday } from '@/app/store';
import { NotFound } from '@/app/NotFound';
import {
  bests, byDateAsc, byDateDesc, draftFromSession, exerciseNames, exHistory, exMetric, fmtSet, KIND_LABEL, metricUnit, newDraft,
  prFlags, sessionSets, sessionVolume, setMetric, type Draft,
} from '@/core/calc';
import { fmtDay, fmtRelative, fmtShort, parseYmd } from '@/core/dates';
import type { Session } from '@/core/types';
import { TimeChart } from '@/components/charts';
import { EmptyState, KV, PageHeader, RowLink } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { Badge, Segmented } from '@/components/ui/misc';
import { Confirm, useIsDesktop } from '@/components/ui/sheet';
import { cn, fmt, fmtKg } from '@/lib/utils';
import { StartWorkoutSheet } from './StartWorkoutSheet';
import { format } from 'date-fns';

export function TrainRoute() {
  const params = useParams();
  const isProgress = !!useMatch('/train/progress');
  const desktop = useIsDesktop();
  const sessions = useData().training.sessions;
  const sorted = useMemo(() => [...sessions].sort(byDateDesc), [sessions]);
  const session = params.id ? sessions.find(s => s.id === params.id) : undefined;
  if (params.id && !session) return <NotFound />;
  const exName = params.name;

  const detail = session ? <SessionDetail session={session} standalone={!desktop} />
    : exName ? <ExerciseDetail name={exName} standalone={!desktop} />
    : isProgress ? <Progress standalone={!desktop} />
    : null;

  if (!desktop) return detail ?? <TrainHome />;
  return (
    <div>
      <PageHeader kicker="Training" title="Train" actions={<TrainHeaderActions />} />
    <div className="grid grid-cols-12 items-start gap-5">
      <div className="col-span-5 xl:col-span-4"><TrainHome selectedId={session?.id} compact /></div>
      <div className="col-span-7 xl:col-span-8 lg:sticky lg:top-6">
        {detail ?? (sorted[0] ? <SessionDetail session={sorted[0]} /> : <Progress />)}
      </div>
    </div>
    </div>
  );
}

function TrainHeaderActions() {
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

function TrainTabs({ value }: { value: 'history' | 'progress' }) {
  const nav = useNavigate();
  return <Segmented label="Training view" value={value} onChange={v => nav(v === 'history' ? '/train' : '/train/progress')} options={[['history', 'History'], ['progress', 'Progress']]} />;
}

function TrainHome({ selectedId, compact }: { selectedId?: string; compact?: boolean }) {
  const data = useData();
  const today = useToday();
  const progressMatch = useMatch('/train/progress');
  const exerciseMatch = useMatch('/train/exercise/:name');
  const isProgress = !!progressMatch || !!exerciseMatch;
  const sessions = data.training.sessions;
  const prs = useMemo(() => prFlags(sessions), [sessions]);
  const groups = useMemo(() => {
    const out: { month: string; items: Session[] }[] = [];
    for (const s of [...sessions].sort(byDateDesc)) {
      const month = format(parseYmd(s.date), 'MMMM yyyy');
      const g = out[out.length - 1];
      if (g && g.month === month) g.items.push(s); else out.push({ month, items: [s] });
    }
    return out;
  }, [sessions]);
  return (
    <div>
      {!compact ? <PageHeader kicker="Training" title="Train" actions={<TrainHeaderActions />} /> : null}
      <div className="mb-4 flex items-center justify-between gap-2">
        <TrainTabs value={compact && isProgress ? 'progress' : 'history'} />
        <span className="text-[13px] text-muted">{sessions.length} sessions</span>
      </div>
      {compact && isProgress ? <ExerciseList /> : (
        <Card>
          <CardBody className="pt-3">
            {groups.length ? groups.map(g => (
              <section key={g.month} className="mb-2 last:mb-0" aria-label={g.month}>
                <h3 className="px-1 pt-1 pb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">{g.month}</h3>
                <ul className="-mx-2 flex flex-col">
                  {g.items.map(s => {
                    const prCount = s.exercises.filter(e => prs.has(s.id + '|' + e.name.toLowerCase())).length;
                    const vol = sessionVolume(s);
                    return (
                      <li key={s.id}>
                        <RowLink to={`/train/session/${encodeURIComponent(s.id)}`} active={s.id === selectedId}>
                          <div className="grid w-11 shrink-0 place-items-center rounded-xl bg-surface-2 py-1 text-center">
                            <span className="text-[11px] font-semibold text-muted uppercase">{format(parseYmd(s.date), 'EEE')}</span>
                            <span className="num text-lg leading-none font-semibold">{format(parseYmd(s.date), 'd')}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-semibold">{s.name}</span>
                              {prCount ? <Badge tone="track"><Trophy aria-hidden className="size-3" /> {prCount} PR</Badge> : null}
                            </div>
                            <div className="truncate text-[13px] text-muted">
                              {fmtRelative(s.date, today)} · {s.exercises.length} exercises · {sessionSets(s)} sets{vol ? ` · ${fmt(vol)} kg` : ''}
                            </div>
                          </div>
                        </RowLink>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )) : (
              <EmptyState icon={<Dumbbell />} title="No sessions yet" action={<TrainHeaderActions />}>Your first session sets the baseline.</EmptyState>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function ExerciseList() {
  const sessions = useData().training.sessions;
  const rows = useMemo(() => bests(sessions), [sessions]);
  const { name } = useParams();
  return (
    <Card>
      <CardBody className="pt-3">
        {rows.length ? (
          <ul className="-mx-2 flex flex-col">
            {rows.map(r => (
              <li key={r.name}>
                <RowLink to={`/train/exercise/${encodeURIComponent(r.name)}`} active={name?.toLowerCase() === r.name.toLowerCase()}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.name}</div>
                    <div className="truncate text-[13px] text-muted">Best {fmtSet(r.kind, r.topSet)} · {fmtShort(r.best.date)} · {r.count} sessions</div>
                  </div>
                  <div className="num text-lg font-semibold">{fmt(r.best.m, r.kind === 'weight' ? 1 : 0)}<span className="ml-1 font-sans text-xs text-muted">{r.kind === 'weight' ? 'kg' : r.kind === 'hold' ? 's' : 'reps'}</span></div>
                </RowLink>
              </li>
            ))}
          </ul>
        ) : <EmptyState title="Nothing to show yet">Progress appears after you log sessions.</EmptyState>}
      </CardBody>
    </Card>
  );
}

/** Start editing `next` as the draft, asking first if another workout is in progress. */
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
  const prs = useMemo(() => prFlags(sessions), [sessions]);
  const [deleting, setDeleting] = useState(false);
  const replace = useReplaceDraft();
  const vol = sessionVolume(s);
  const prCount = s.exercises.filter(e => prs.has(s.id + '|' + e.name.toLowerCase())).length;
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="lane" size="sm" onClick={() => replace.request(newDraft(sessions, s.name, today, s))}><Copy /> Repeat this workout</Button>
      <Button variant="secondary" size="sm" onClick={() => replace.request(draftFromSession(s))}><Pencil /> Edit</Button>
      <Button variant="danger-ghost" size="sm" onClick={() => setDeleting(true)}><Trash2 /> Delete</Button>
    </div>
  );
  return (
    <div>
      {standalone ? <PageHeader back="/train" kicker={fmtDay(s.date)} title={s.name} /> : null}
      <Card>
        {!standalone ? <CardHeader title={s.name} meta={`${fmtDay(s.date)} · ${fmtRelative(s.date, today)}`} action={actions} /> : null}
        <CardBody className={cn(standalone && 'pt-4')}>
          {standalone ? <div className="mb-4">{actions}</div> : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <KV k="Exercises" v={s.exercises.length} />
            <KV k="Sets" v={sessionSets(s)} />
            <KV k="Volume" v={vol ? fmt(vol) : '–'} sub={vol ? 'kg lifted' : 'no weighted sets'} />
            <KV k="PRs" v={<span className={prCount ? 'text-track-ink' : ''}>{prCount}</span>} />
          </div>
          {s.notes ? <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[15px]">{s.notes}</p> : null}
          <ol className="mt-4 flex flex-col gap-3">
            {s.exercises.map((ex, i) => {
              const isPr = prs.has(s.id + '|' + ex.name.toLowerCase());
              const hist = exHistory(sessions, ex.name).filter(h => h.date < s.date || (h.date === s.date && h.sess.id !== s.id && h.sess.id < s.id));
              const prev = hist[hist.length - 1];
              const m = exMetric(ex);
              const diff = prev && Number.isFinite(m) && Number.isFinite(prev.m) ? m - prev.m : null;
              const unit = ex.kind === 'weight' ? 'kg' : ex.kind === 'hold' ? 's' : 'reps';
              return (
                <li key={i} className="rounded-xl border border-line p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/train/exercise/${encodeURIComponent(ex.name)}`} className="font-semibold hover:underline hover:underline-offset-4">{ex.name}</Link>
                      <div className="text-[13px] text-muted">{KIND_LABEL[ex.kind]}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isPr ? <Badge tone="track"><Trophy aria-hidden className="size-3" /> PR</Badge> : null}
                      {Number.isFinite(m) ? (
                        <div className="text-right">
                          <div className="num text-xl leading-none font-semibold">{fmt(m, ex.kind === 'weight' ? 1 : 0)} <span className="font-sans text-xs font-medium text-muted">{metricUnit(ex.kind)}</span></div>
                          {diff != null ? <div className={cn('text-[12px] font-semibold', diff > 0 ? 'text-good' : diff < 0 ? 'text-bad' : 'text-muted')}>{diff > 0 ? '+' : diff < 0 ? '−' : '±'}{fmt(Math.abs(diff), ex.kind === 'weight' ? 1 : 0)} vs {fmtShort(prev!.date)}</div> : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`${ex.name} sets`}>
                    {ex.sets.map((st, j) => {
                      const sm = setMetric(ex.kind, st);
                      return (
                        <li key={j} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-center">
                          <div className="num text-[17px] leading-tight font-semibold">{fmtSet(ex.kind, st)}</div>
                          {ex.kind === 'weight' && sm ? <div className="text-[11px] text-muted">e1RM {fmtKg(Math.round(sm * 10) / 10)}</div> : <div className="text-[11px] text-muted">set {j + 1}</div>}
                        </li>
                      );
                    })}
                  </ul>
                  {ex.kind === 'weight' ? <div className="mt-2 text-[12px] text-muted">Volume {fmt(ex.sets.reduce((a, st) => a + (st.kg || 0) * (st.reps || 0), 0))} {unit}</div> : null}
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>
      {replace.dialog}
      <Confirm open={deleting} onOpenChange={setDeleting} title="Delete this session?" description={`${s.name} on ${fmtDay(s.date)}. This can’t be undone here (GitHub keeps the history).`}
        onConfirm={() => { engine.commit('training', [{ t: 'remove', c: 'sessions', id: s.id }], 'Session deleted'); nav('/train', { replace: true }); }} />
    </div>
  );
}

function ExerciseChart({ name }: { name: string }) {
  const sessions = useData().training.sessions;
  const hist = exHistory(sessions, name).filter(x => Number.isFinite(x.m));
  const kind = hist.length ? hist[hist.length - 1]!.ex.kind : 'weight';
  const rows = hist.map(h => ({ date: h.date, m: Math.round(h.m * 10) / 10 }));
  return (
    <>
      <TimeChart data={rows} height={280} ariaLabel={`${name} progress over time`}
        series={[{ key: 'm', label: metricUnit(kind), kind: 'line', color: 'lane', format: v => `${fmt(v, v % 1 ? 1 : 0)} ${metricUnit(kind)}` }]}
        empty="Log this exercise twice to see a trend." />
      {kind === 'weight' ? <p className="mt-2 text-[13px] text-muted">e1RM is an estimated one-rep max from your best set (Epley: kg × (1 + reps / 30)). It tracks progress without testing a true max.</p> : null}
    </>
  );
}

function Progress({ standalone }: { standalone?: boolean }) {
  const sessions = useData().training.sessions;
  const names = exerciseNames(sessions);
  const [ex, setEx] = useState('');
  const current = names.includes(ex) ? ex : names[0] ?? '';
  return (
    <div>
      {standalone ? <PageHeader back="/train" kicker="Training" title="Progress" /> : null}
      {standalone ? <div className="mb-4"><TrainTabs value="progress" /></div> : null}
      <div className="space-y-4">
        <Card>
          <CardHeader title={current || 'Progress'} meta="Best set per session" action={names.length ? (
            <div className="w-56 max-w-full"><Select aria-label="Exercise" value={current} onChange={e => setEx(e.target.value)}>{names.map(n => <option key={n}>{n}</option>)}</Select></div>
          ) : null} />
          <CardBody>{current ? <ExerciseChart name={current} /> : <EmptyState title="Nothing to show yet">Progress appears after you log sessions.</EmptyState>}</CardBody>
        </Card>
        {standalone ? <><h2 className="font-display text-xl font-semibold uppercase">Bests</h2><ExerciseList /></> : null}
      </div>
    </div>
  );
}

function ExerciseDetail({ name, standalone }: { name: string; standalone?: boolean }) {
  const sessions = useData().training.sessions;
  const today = useToday();
  const hist = exHistory(sessions, name);
  if (!hist.length) return <NotFound />;
  const display = hist[hist.length - 1]!.ex.name;
  const kind = hist[hist.length - 1]!.ex.kind;
  const valid = hist.filter(h => Number.isFinite(h.m));
  const best = valid.reduce<(typeof valid)[number] | null>((a, x) => (!a || x.m > a.m ? x : a), null);
  const first = valid[0], last = valid[valid.length - 1];
  return (
    <div>
      {standalone ? <PageHeader back="/train/progress" kicker="Exercise" title={display} /> : null}
      <div className="space-y-4">
        <Card>
          {!standalone ? <CardHeader title={display} meta={KIND_LABEL[kind]} /> : null}
          <CardBody className={cn(standalone && 'pt-4')}>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <KV k="Best" v={best ? fmt(best.m, kind === 'weight' ? 1 : 0) : '–'} sub={metricUnit(kind)} />
              <KV k="Latest" v={last ? fmt(last.m, kind === 'weight' ? 1 : 0) : '–'} sub={last ? fmtShort(last.date) : ''} />
              <KV k="Change" v={first && last ? `${last.m - first.m >= 0 ? '+' : '−'}${fmt(Math.abs(last.m - first.m), kind === 'weight' ? 1 : 0)}` : '–'} sub={first ? `since ${fmtShort(first.date)}` : ''} />
              <KV k="Sessions" v={hist.length} />
            </div>
            <ExerciseChart name={name} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="History" />
          <CardBody className="pt-1">
            <ul className="-mx-2 flex flex-col">
              {[...hist].sort(byDateAsc).reverse().map(h => (
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
    </div>
  );
}
