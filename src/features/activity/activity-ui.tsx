import { useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { fmtDur } from '@/core/calc';
import type { HrZones, Split } from '@/core/types';
import { ZONE_FLOORS } from '@/core/workout';
import { cn, fmt } from '@/lib/utils';
import { fmtPace, ZONES } from './activity-data';

/* ---------- headline stats ---------- */
export function Stat({ label, value, unit, className }: { label: string; value: ReactNode; unit?: string; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-[12px] font-semibold tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="num text-[28px] leading-none font-semibold sm:text-[32px]">{value}</span>
        {unit ? <span className="text-[13px] font-medium text-muted">{unit}</span> : null}
      </div>
    </div>
  );
}

/* ---------- splits ---------- */
export function SplitsTable({ splits }: { splits: Split[] }) {
  const paces = splits.map(s => s.paceSecPerKm);
  const fast = Math.min(...paces), slow = Math.max(...paces);
  const hasHr = splits.some(s => s.avgHr != null);
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Splits per kilometre. Longer bars are faster.</caption>
      <thead>
        <tr className="text-left text-[12px] font-semibold tracking-wide text-muted uppercase">
          <th scope="col" className="w-12 py-2 font-semibold">Km</th>
          <th scope="col" className="py-2 font-semibold">Pace</th>
          {hasHr ? <th scope="col" className="w-16 py-2 text-right font-semibold">HR</th> : null}
          {hasHr ? <th scope="col" className="w-16 py-2 text-right font-semibold max-sm:hidden">Max</th> : null}
        </tr>
      </thead>
      <tbody>
        {splits.map((s, i) => {
          const whole = Number.isInteger(s.km);
          const f = slow === fast ? 1 : 0.35 + (0.65 * (slow - s.paceSecPerKm)) / (slow - fast);
          return (
            <tr key={i} className="border-t border-line/70">
              <td className="num py-2 text-[15px] font-semibold">{whole ? s.km : fmt(s.km - Math.floor(s.km), 2)}</td>
              <td className="py-2 pr-2">
                <div className="flex items-center gap-3">
                  <span className="num w-11 shrink-0 text-[15px] font-semibold">{fmtPace(s.paceSecPerKm)}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <span className={cn('block h-full rounded-full', s.paceSecPerKm === fast ? 'bg-track' : 'bg-track/55')} style={{ width: `${f * 100}%` }} />
                  </span>
                </div>
                {!whole ? <div className="text-[12px] text-muted">{fmtDur(s.durationSec)} for {fmt((s.km - Math.floor(s.km)) * 1000)} m</div> : null}
              </td>
              {hasHr ? <td className="num py-2 text-right text-[15px]">{s.avgHr ?? '–'}</td> : null}
              {hasHr ? <td className="num py-2 text-right text-[15px] text-muted max-sm:hidden">{s.maxHr ?? '–'}</td> : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ---------- HR zones ---------- */
export function ZonesBar({ zones, maxHr }: { zones: HrZones; maxHr: number }) {
  const total = ZONES.reduce((s, z) => s + zones[z.key], 0) || 1;
  const bpm = (i: number) => Math.round((ZONE_FLOORS[i] ?? 0) * maxHr);
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-surface-3" role="img"
        aria-label={`Time in zones: ${ZONES.map(z => `${z.label} ${Math.round((zones[z.key] / total) * 100)}%`).join(', ')}`}>
        {ZONES.map(z => zones[z.key] ? <span key={z.key} style={{ width: `${(zones[z.key] / total) * 100}%`, background: z.color }} /> : null)}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {ZONES.map((z, i) => (
          <li key={z.key} className="flex items-center gap-3">
            <span aria-hidden className="size-3 shrink-0 rounded-[4px]" style={{ background: z.color }} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="font-semibold">{z.label}</span> <span className="num text-[14px] text-muted">{i === 0 ? `< ${bpm(1)}` : i === 4 ? `${bpm(4)}+` : `${bpm(i)}–${bpm(i + 1) - 1}`}</span>
              <span className="block truncate text-[12px] text-muted">{z.name}</span>
            </span>
            <span className="num w-12 text-right text-[15px] font-semibold">{fmtDur(zones[z.key])}</span>
            <span className="num w-10 text-right text-[15px] text-muted">{Math.round((zones[z.key] / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- pace + HR over time ---------- */
export type PaceHrRow = { tSec: number; km: number | null; pace: number | null; bpm: number | null };

function PaceHrTooltip({ active, payload }: TooltipContentProps<number, string>) {
  const row = payload?.[0]?.payload as PaceHrRow | undefined;
  if (!active || !row) return null;
  return (
    <div className="min-w-32 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] shadow-pop">
      <div className="mb-1 font-semibold">{fmtDur(row.tSec)}{row.km != null ? ` · ${fmt(row.km, 2)} km` : ''}</div>
      {row.pace != null ? <div className="flex justify-between gap-4"><span className="text-muted">Pace</span><span className="num text-[15px] font-semibold">{fmtPace(row.pace)} /km</span></div> : null}
      {row.bpm != null ? <div className="flex justify-between gap-4"><span className="text-muted">Heart rate</span><span className="num text-[15px] font-semibold">{row.bpm} bpm</span></div> : null}
    </div>
  );
}

export function PaceHrChart({ rows, active, onActive, height = 260 }: { rows: PaceHrRow[]; active: number | null; onActive: (t: number | null) => void; height?: number }) {
  const reduced = useReducedMotion();
  const paces = rows.map(r => r.pace).filter((v): v is number => v != null).sort((a, b) => a - b);
  const bpms = rows.map(r => r.bpm).filter((v): v is number => v != null);
  const hasPace = paces.length > 2, hasHr = bpms.length > 2;
  if (!hasPace && !hasHr) return <div className="grid place-items-center rounded-xl border border-dashed border-line-strong/70 text-sm text-muted" style={{ height }}>No pace or heart-rate samples for this workout.</div>;
  // clip pace outliers (stops) so the line stays readable
  const pLo = paces[Math.floor(paces.length * 0.03)] ?? 0, pHi = paces[Math.floor(paces.length * 0.97)] ?? 600;
  const end = rows[rows.length - 1]?.tSec ?? 0;
  const step = [60, 120, 300, 600, 900, 1800].find(s => end / s <= 6) ?? 3600;
  const ticks = Array.from({ length: Math.floor(end / step) + 1 }, (_, i) => i * step);
  const data = rows.map(r => ({ ...r, pace: r.pace != null ? Math.min(pHi + 20, Math.max(pLo - 20, r.pace)) : null }));
  return (
    <div className="w-full select-none" style={{ height }} role="img" aria-label="Pace and heart rate over the workout">
      <ResponsiveContainer width="100%" height="100%" debounce={60}>
        <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}
          onMouseMove={(s: { activeLabel?: string | number }) => { if (s?.activeLabel != null) onActive(Number(s.activeLabel)); }}
          onMouseLeave={() => onActive(null)}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="tSec" type="number" domain={[0, end]} ticks={ticks} tickFormatter={v => fmtDur(v)} tickLine={false} axisLine={false} tickMargin={8} height={26} />
          {hasPace ? <YAxis yAxisId="pace" reversed domain={[Math.floor((pLo - 20) / 30) * 30, Math.ceil((pHi + 20) / 30) * 30]} tickFormatter={v => fmtDur(v)} tickLine={false} axisLine={false} width={44} tickCount={5} /> : null}
          {hasHr ? <YAxis yAxisId="hr" orientation="right" domain={['dataMin - 8', 'dataMax + 5']} tickFormatter={v => String(Math.round(v))} tickLine={false} axisLine={false} width={36} tickCount={5} /> : null}
          <Tooltip content={p => <PaceHrTooltip {...(p as TooltipContentProps<number, string>)} />} cursor={{ stroke: 'var(--line-strong)' }} isAnimationActive={false} />
          {active != null ? <ReferenceLine x={active} yAxisId={hasPace ? 'pace' : 'hr'} stroke="var(--lane)" strokeWidth={1.5} /> : null}
          {hasPace ? <Line yAxisId="pace" dataKey="pace" name="Pace" type="monotone" stroke="var(--track)" strokeWidth={2.25} dot={false} connectNulls
            activeDot={{ r: 4.5, fill: 'var(--track)', stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={!reduced} animationDuration={500} /> : null}
          {hasHr ? <Line yAxisId="hr" dataKey="bpm" name="Heart rate" type="monotone" stroke="var(--cat-heart)" strokeWidth={2} dot={false} connectNulls
            activeDot={{ r: 4.5, fill: 'var(--cat-heart)', stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={!reduced} animationDuration={500} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
