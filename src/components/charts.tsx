import { useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import {
  Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipContentProps,
} from 'recharts';
import { fmtDay, fmtShort } from '@/core/dates';
import { cn } from '@/lib/utils';

export type ChartColor = 'track' | 'lane' | 'muted' | 'good';
const COLOR: Record<ChartColor, string> = { track: 'var(--track)', lane: 'var(--lane)', muted: 'var(--muted)', good: 'var(--good)' };

export type Series = {
  key: string;
  label: string;
  kind: 'bar' | 'line' | 'dots';
  color: ChartColor;
  format?: (v: number) => string;
  /** per-point colour for bars */
  colorAt?: (v: number, i: number) => ChartColor;
};
export type Row = { date: string } & Record<string, number | null | string>;

function niceDomain(values: number[], zero: boolean): [number, number] {
  if (!values.length) return [0, 1];
  let lo = Math.min(...values), hi = Math.max(...values);
  if (zero) lo = Math.min(0, lo);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  if (!zero) lo -= pad;
  hi += pad;
  const raw = (hi - lo) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag;
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

function ChartTooltip({ active, payload, label, series }: TooltipContentProps<number, string> & { series: Series[] }) {
  if (!active || !payload?.length) return null;
  const rows = series
    .map(s => ({ s, v: payload.find(p => p.dataKey === s.key)?.value as number | null | undefined }))
    .filter(r => r.v != null);
  if (!rows.length) return null;
  return (
    <div className="min-w-36 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] shadow-pop">
      <div className="mb-1 font-semibold">{fmtDay(String(label))}</div>
      {rows.map(({ s, v }) => (
        <div key={s.key} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            <span aria-hidden className={cn('inline-block size-2.5', s.kind === 'line' ? 'h-0.5 w-3 rounded' : 'rounded-full')} style={{ background: COLOR[s.color] }} />
            {s.label}
          </span>
          <span className="num text-[15px] font-semibold">{s.format ? s.format(v!) : v}</span>
        </div>
      ))}
    </div>
  );
}

export function TimeChart({ data, series, goal, zero, height = 220, ariaLabel, onSelect, yFormat, empty, className }: {
  data: Row[];
  series: Series[];
  goal?: { value: number; label: string } | null;
  zero?: boolean;
  height?: number;
  ariaLabel: string;
  onSelect?: (date: string) => void;
  yFormat?: (v: number) => string;
  empty?: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const values = data.flatMap(r => series.map(s => r[s.key])).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!values.length) {
    return (
      <div className={cn('grid place-items-center rounded-xl border border-dashed border-line-strong/70 px-4 text-center text-sm text-muted', className)} style={{ height }}>
        {empty ?? 'Nothing to chart yet.'}
      </div>
    );
  }
  const domain = niceDomain(goal ? [...values, goal.value] : values, !!zero);
  const many = data.length > 45;
  return (
    <div role="img" aria-label={ariaLabel} className={cn('w-full select-none', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" debounce={60}>
        <ComposedChart
          data={data}
          margin={{ top: 12, right: goal ? 52 : 6, bottom: 0, left: 0 }}
          accessibilityLayer={false}
          onClick={onSelect ? (s: { activeLabel?: string | number }) => { if (s?.activeLabel) onSelect(String(s.activeLabel)); } : undefined}
          style={onSelect ? { cursor: 'pointer' } : undefined}
        >
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis dataKey="date" tickFormatter={fmtShort} tickLine={false} axisLine={false} minTickGap={28} interval="preserveStartEnd" tickMargin={8} height={26} />
          <YAxis domain={domain} tickFormatter={yFormat ?? (v => String(+v.toFixed(1)))} tickLine={false} axisLine={false} width={44} tickCount={5} allowDecimals />
          <Tooltip
            content={p => <ChartTooltip {...(p as TooltipContentProps<number, string>)} series={series} />}
            cursor={{ fill: 'var(--surface-3)', fillOpacity: 0.6, stroke: 'var(--line-strong)' }}
            isAnimationActive={false}
          />
          {goal ? (
            <ReferenceLine y={goal.value} stroke="var(--muted)" strokeDasharray="5 4" ifOverflow="extendDomain"
              label={{ value: goal.label, position: 'right', fill: 'var(--muted)', fontSize: 12, fontWeight: 600, width: 50 }} />
          ) : null}
          {series.map(s => {
            if (s.kind === 'bar') {
              return (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLOR[s.color]} radius={[4, 4, 0, 0]} maxBarSize={many ? 10 : 30} isAnimationActive={!reduced} animationDuration={500}>
                  {s.colorAt ? data.map((r, i) => <Cell key={r.date} fill={COLOR[s.colorAt!(Number(r[s.key] ?? 0), i)]} />) : null}
                </Bar>
              );
            }
            if (s.kind === 'dots') {
              return (
                <Line key={s.key} dataKey={s.key} name={s.label} stroke="none" isAnimationActive={false} legendType="circle"
                  dot={{ r: many ? 2.5 : 3.5, fill: COLOR[s.color], fillOpacity: 0.45, stroke: 'none' }}
                  activeDot={{ r: 5, fill: COLOR[s.color], stroke: 'var(--surface)', strokeWidth: 2 }} />
              );
            }
            return (
              <Line key={s.key} dataKey={s.key} name={s.label} type="monotone" stroke={COLOR[s.color]} strokeWidth={2.5} connectNulls
                dot={data.length <= 16 ? { r: 3.5, fill: COLOR[s.color], stroke: 'var(--surface)', strokeWidth: 1.5 } : false}
                activeDot={{ r: 5.5, fill: COLOR[s.color], stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={!reduced} animationDuration={600} />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: ChartColor; kind: 'line' | 'dot' | 'bar' | 'dash' }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
      {items.map(i => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.kind === 'dash'
            ? <span aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: COLOR[i.color] }} />
            : <span aria-hidden className={cn('inline-block', i.kind === 'line' ? 'h-[3px] w-4 rounded' : i.kind === 'dot' ? 'size-2.5 rounded-full opacity-60' : 'size-2.5 rounded-[3px]')} style={{ background: COLOR[i.color] }} />}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Tiny dependency-free sparkline for stat tiles. */
export function Sparkline({ values, color = 'lane', kind = 'line', className }: { values: (number | null)[]; color?: ChartColor; kind?: 'line' | 'bar'; className?: string }) {
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return <div className={className} />;
  const W = 100, H = 28;
  let lo = Math.min(...v), hi = Math.max(...v);
  if (kind === 'bar') lo = 0;
  if (lo === hi) hi = lo + 1;
  const X = (i: number) => (values.length === 1 ? W / 2 : (i / (values.length - 1)) * W);
  const Y = (x: number) => H - 2 - ((x - lo) / (hi - lo)) * (H - 4);
  if (kind === 'bar') {
    const bw = (W / values.length) * 0.62;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className={className}>
        {values.map((x, i) => x == null ? null : (
          <rect key={i} x={(i / values.length) * W + (W / values.length - bw) / 2} y={Y(x)} width={bw} height={H - Y(x)} rx={1.2} fill={COLOR[color]} opacity={i === values.length - 1 ? 1 : 0.45} />
        ))}
      </svg>
    );
  }
  let d = '';
  values.forEach((x, i) => { if (x != null) d += `${d ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x).toFixed(1)}`; });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className={className}>
      <path d={d} fill="none" stroke={COLOR[color]} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
