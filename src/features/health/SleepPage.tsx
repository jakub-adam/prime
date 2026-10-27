import { useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { useGoals, useHealthDays, useToday } from '@/app/store';
import { avg, healthDays, stdev } from '@/core/calc';
import { addDays, fmtDay, fmtRelative, fmtShort } from '@/core/dates';
import type { HealthDay } from '@/core/types';
import { COLOR, Legend, type ChartColor } from '@/components/charts';
import { EmptyState, KV, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/misc';
import { cn, fmt } from '@/lib/utils';
import { CategoryIcon, HealthCard } from './health-ui';

type Range = '7' | '30' | '90';
const STAGES: { key: 'sleepAwakeH' | 'sleepRemH' | 'sleepCoreH' | 'sleepDeepH'; label: string; color: ChartColor }[] = [
  { key: 'sleepAwakeH', label: 'Awake', color: 'awake' },
  { key: 'sleepRemH', label: 'REM', color: 'rem' },
  { key: 'sleepCoreH', label: 'Core', color: 'core' },
  { key: 'sleepDeepH', label: 'Deep', color: 'deep' },
];
export const hm = (h: number | null | undefined) => {
  if (h == null || !Number.isFinite(h)) return '–';
  const t = Math.round(h * 60);
  return `${Math.floor(t / 60)} h ${String(t % 60).padStart(2, '0')} min`;
};
export const clock = (m: number | null | undefined) => {
  if (m == null || !Number.isFinite(m)) return '–';
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};
const hasStages = (d: HealthDay | undefined) => !!d && (d.sleepCoreH != null || d.sleepDeepH != null || d.sleepRemH != null);

type NightRow = { date: string; sleepH: number | null; sleepDeepH: number | null; sleepCoreH: number | null; sleepRemH: number | null; sleepAwakeH: number | null; unspecH: number | null; span: [number, number] | null };

function nightRow(date: string, d: HealthDay | undefined): NightRow {
  const staged = (d?.sleepDeepH ?? 0) + (d?.sleepCoreH ?? 0) + (d?.sleepRemH ?? 0);
  const unspec = d?.sleepH != null ? Math.max(0, d.sleepH - staged) : null;
  return {
    date,
    sleepH: d?.sleepH ?? null,
    sleepDeepH: d?.sleepDeepH ?? null,
    sleepCoreH: d?.sleepCoreH ?? null,
    sleepRemH: d?.sleepRemH ?? null,
    sleepAwakeH: d?.sleepAwakeH ?? null,
    unspecH: unspec != null && unspec > 0.05 ? Math.round(unspec * 100) / 100 : null,
    span: d?.sleepStartMin != null && d?.sleepEndMin != null ? [d.sleepStartMin, d.sleepEndMin] : null,
  };
}

function StageTooltip({ active, payload, label }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const r = payload[0]!.payload as NightRow;
  if (r.sleepH == null) return null;
  return (
    <div className="min-w-44 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] shadow-pop">
      <div className="mb-1 font-semibold">{fmtDay(String(label))}</div>
      <div className="flex justify-between gap-4"><span className="text-muted">Asleep</span><span className="num text-[15px] font-semibold">{hm(r.sleepH)}</span></div>
      {STAGES.map(s => r[s.key] != null ? (
        <div key={s.key} className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted"><span aria-hidden className="size-2.5 rounded-full" style={{ background: COLOR[s.color] }} />{s.label}</span>
          <span className="num text-[15px] font-semibold">{hm(r[s.key])}</span>
        </div>
      ) : null)}
      {r.unspecH ? <div className="flex justify-between gap-4"><span className="text-muted">Asleep (no stage)</span><span className="num text-[15px] font-semibold">{hm(r.unspecH)}</span></div> : null}
      {r.span ? <div className="mt-1 text-muted">{clock(r.span[0])} – {clock(r.span[1])}</div> : null}
    </div>
  );
}

function StagesChart({ rows, goal, height }: { rows: NightRow[]; goal: number; height: number }) {
  const reduced = useReducedMotion();
  const nav = useNavigate();
  const max = Math.max(goal, ...rows.map(r => (r.sleepH ?? 0) + (r.sleepAwakeH ?? 0)));
  const top = Math.ceil(max + 0.5);
  const ticks = Array.from({ length: Math.floor(top / 2) + 1 }, (_, i) => i * 2);
  return (
    <div role="img" aria-label="Sleep per night split into Deep, Core, REM and Awake" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 12, right: 52, bottom: 0, left: 0 }} accessibilityLayer={false} style={{ cursor: 'pointer' }}
          onClick={(e: { activeLabel?: string | number; activeIndex?: number | string | null; activeTooltipIndex?: number | string | null }) => {
            const i = e?.activeIndex ?? e?.activeTooltipIndex;
            const d = e?.activeLabel ?? (i != null ? rows[Number(i)]?.date : undefined);
            if (d) nav(`/health/day/${d}`);
          }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtShort} tickLine={false} axisLine={false} minTickGap={28} interval="preserveStartEnd" tickMargin={8} height={26} />
          <YAxis domain={[0, ticks[ticks.length - 1]!]} ticks={ticks} tickFormatter={v => `${v} h`} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={p => <StageTooltip {...(p as TooltipContentProps<number, string>)} />} cursor={{ fill: 'var(--surface-3)', fillOpacity: 0.6 }} isAnimationActive={false} />
          <ReferenceLine y={goal} stroke="var(--muted)" strokeDasharray="5 4" label={{ value: `${fmt(goal, goal % 1 ? 1 : 0)} h goal`, position: 'right', fill: 'var(--muted)', fontSize: 12, fontWeight: 600 }} />
          {[...STAGES].reverse().map(s => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="s" fill={COLOR[s.color]} maxBarSize={rows.length > 45 ? 10 : 28} isAnimationActive={!reduced} />
          ))}
          <Bar dataKey="unspecH" name="Asleep" stackId="s" fill="var(--muted)" fillOpacity={0.6} radius={[4, 4, 0, 0]} maxBarSize={rows.length > 45 ? 10 : 28} isAnimationActive={!reduced} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ScheduleChart({ rows, height }: { rows: NightRow[]; height: number }) {
  const spans = rows.filter(r => r.span).map(r => r.span!);
  if (!spans.length) return <p className="py-6 text-center text-sm text-muted">Bed and wake times appear after your next Apple Health import.</p>;
  const lo = Math.floor((Math.min(...spans.map(s => s[0])) - 30) / 120) * 120;
  const hi = Math.ceil((Math.max(...spans.map(s => s[1])) + 30) / 120) * 120;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 120) ticks.push(t);
  return (
    <div role="img" aria-label="Bedtime to wake time per night" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 6, bottom: 0, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtShort} tickLine={false} axisLine={false} minTickGap={28} interval="preserveStartEnd" tickMargin={8} height={26} />
          <YAxis reversed domain={[lo, hi]} ticks={ticks} tickFormatter={clock} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={p => <StageTooltip {...(p as TooltipContentProps<number, string>)} />} cursor={{ fill: 'var(--surface-3)', fillOpacity: 0.6 }} isAnimationActive={false} />
          <Bar dataKey="span" name="In bed" fill="var(--cat-sleep)" radius={6} maxBarSize={rows.length > 45 ? 8 : 18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StageBar({ d }: { d: HealthDay }) {
  const parts = STAGES.map(s => ({ ...s, h: d[s.key] ?? 0 })).filter(p => p.h > 0);
  const total = parts.reduce((n, p) => n + p.h, 0);
  if (!total) return null;
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full" aria-hidden>
        {[...parts].reverse().map(p => <div key={p.key} style={{ width: `${(p.h / total) * 100}%`, background: COLOR[p.color] }} />)}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        {STAGES.map(s => (
          <li key={s.key}>
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-muted"><span aria-hidden className="size-2.5 rounded-full" style={{ background: COLOR[s.color] }} />{s.label}</div>
            <div className="num text-lg leading-tight font-semibold">{hm(d[s.key])}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SleepPage() {
  const days = useHealthDays();
  const g = useGoals();
  const today = useToday();
  const [range, setRange] = useState<Range>('30');
  const sleepDates = useMemo(() => healthDays(days).filter(d => days[d]?.sleepH != null), [days]);
  const last = sleepDates[sleepDates.length - 1];
  const n = +range;
  const rows = useMemo(() => (last ? Array.from({ length: n }, (_, i) => addDays(last, i - n + 1)).map(d => nightRow(d, days[d])) : []), [days, last, n]);
  const lastDay = last ? days[last] : undefined;

  if (!last || !lastDay) {
    return (
      <div>
        <PageHeader back="/health" kicker="Health" title={<span className="flex items-center gap-3"><CategoryIcon cat="sleep" size="lg" />Sleep</span>} />
        <Card><CardBody className="pt-4"><EmptyState title="No sleep data yet" action={<Button asChild variant="primary" size="sm"><Link to="/health">Import Apple Health</Link></Button>}>Wear your Apple Watch to bed with Sleep Focus on, then import your export here.</EmptyState></CardBody></Card>
      </div>
    );
  }

  const asleep = rows.map(r => r.sleepH).filter((v): v is number => v != null);
  const starts = rows.map(r => r.span?.[0]).filter((v): v is number => v != null);
  const ends = rows.map(r => r.span?.[1]).filter((v): v is number => v != null);
  const hit = asleep.filter(v => v >= g.sleepGoalH).length;
  const staged = rows.filter(r => r.sleepCoreH != null || r.sleepDeepH != null || r.sleepRemH != null);
  const stageAvg = STAGES.map(s => ({ ...s, h: avg(staged.map(r => r[s.key] ?? 0)) }));
  const stagedTotal = stageAvg.filter(s => s.key !== 'sleepAwakeH').reduce((n2, s) => n2 + (s.h ?? 0), 0);
  const bedSd = stdev(starts);

  return (
    <div>
      <PageHeader back="/health" kicker="Health" title={<span className="flex items-center gap-3"><CategoryIcon cat="sleep" size="lg" />Sleep</span>}
        actions={<Segmented label="Range" value={range} onChange={setRange} options={[['7', 'W'], ['30', 'M'], ['90', '3M']]} />} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <Card className="lg:col-span-5">
          <CardHeader title={fmtRelative(last, today) === 'Today' ? 'Last night' : `Night to ${fmtDay(last)}`} meta={lastDay.sleepStartMin != null && lastDay.sleepEndMin != null ? `${clock(lastDay.sleepStartMin)} – ${clock(lastDay.sleepEndMin)}` : fmtDay(last)} />
          <CardBody>
            <div className="text-[13px] font-semibold tracking-wide text-muted uppercase">Time asleep</div>
            <div className="num text-[44px] leading-none font-semibold">{hm(lastDay.sleepH)}</div>
            <div className={cn('mt-1 text-sm font-semibold', (lastDay.sleepH ?? 0) >= g.sleepGoalH ? 'text-good' : 'text-muted')}>
              {(lastDay.sleepH ?? 0) >= g.sleepGoalH ? 'Goal reached' : `${hm(g.sleepGoalH - (lastDay.sleepH ?? 0))} under your ${fmt(g.sleepGoalH, 1)} h goal`}
            </div>
            <div className="mt-5">{hasStages(lastDay) ? <StageBar d={lastDay} /> : <p className="text-sm text-muted">No stage data for this night (older watchOS or sleep logged by another app).</p>}</div>
          </CardBody>
        </Card>
        <div className="grid grid-cols-2 content-start gap-3 lg:col-span-7">
          <KV k="Avg asleep" v={hm(avg(asleep))} sub={`${asleep.length} nights`} />
          <KV k="Goal reached" v={`${hit}/${asleep.length}`} sub={`nights ≥ ${fmt(g.sleepGoalH, 1)} h`} />
          <KV k="Avg bedtime" v={clock(avg(starts))} sub={bedSd != null ? `±${fmt(bedSd, 0)} min night to night` : ' '} />
          <KV k="Avg wake-up" v={clock(avg(ends))} sub={stdev(ends) != null ? `±${fmt(stdev(ends), 0)} min` : ' '} />
        </div>
        <Card className="lg:col-span-8">
          <CardHeader title="Sleep stages" meta={`${fmtShort(rows[0]!.date)} – ${fmtShort(last)} · tap a night for that day`} />
          <CardBody>
            <StagesChart rows={rows} goal={g.sleepGoalH} height={300} />
            <div className="mt-3"><Legend items={[...STAGES.map(s => ({ label: s.label, color: s.color, kind: 'bar' as const })), { label: 'Asleep (no stage)', color: 'muted', kind: 'bar' }, { label: 'Goal', color: 'muted', kind: 'dash' }]} /></div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader title="Average night" meta={staged.length ? `${staged.length} nights with stages` : 'No stage data in this range'} />
          <CardBody>
            <ul className="flex flex-col gap-3">
              {stageAvg.map(s => (
                <li key={s.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-semibold"><span aria-hidden className="size-2.5 rounded-full" style={{ background: COLOR[s.color] }} />{s.label}</span>
                    <span className="text-sm"><span className="num text-lg font-semibold">{hm(s.h)}</span>{s.key !== 'sleepAwakeH' && stagedTotal ? <span className="ml-1.5 text-muted">{fmt(((s.h ?? 0) / stagedTotal) * 100)}%</span> : null}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${stagedTotal ? Math.min(100, ((s.h ?? 0) / stagedTotal) * 100) : 0}%`, background: COLOR[s.color] }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[13px] text-muted">Adults typically spend about 13–23% of sleep in Deep and 20–25% in REM. Most sleep is Core.</p>
          </CardBody>
        </Card>
        <Card className="lg:col-span-12">
          <CardHeader title="Schedule" meta="Bedtime to wake-up, each night" />
          <CardBody><ScheduleChart rows={rows} height={260} /></CardBody>
        </Card>
        <section aria-labelledby="sleep-related-h" className="lg:col-span-12">
          <h2 id="sleep-related-h" className="mb-3 font-display text-[22px] font-semibold uppercase">During sleep</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(['respiratoryRate', 'spo2', 'wristTempC', 'hrv'] as const).filter(k => Object.values(days).some(d => d[k] != null)).map(k => <HealthCard key={k} k={k} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
