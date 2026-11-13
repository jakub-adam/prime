/* Today, hour by hour, from the Shortcut's sample list. With sample times each hour shows its
   lowest-to-highest range and average (or its total for counted things like steps); every bar can
   be selected to read it. Without sample times the samples are shown in the order they were sent. */
import { useMemo, useState } from 'react';
import type { Sample } from '@/core/live';
import { cn, fmt } from '@/lib/utils';

const pad = (n: number) => String(n).padStart(2, '0');

type Bucket = { label: string; tick: string; lo: number; hi: number; avg: number; sum: number; n: number } | null;

export function HourlyChart({ samples, counted, unit, dp, color, height = 300 }: {
  samples: Sample[];
  /** true for things that add up over the day (steps, energy); false for readings (heart rate) */
  counted: boolean;
  unit: string;
  dp: number;
  color: string;
  height?: number;
}) {
  const timed = samples.length > 0 && samples.every(s => s.t != null);
  const items: Bucket[] = useMemo(() => {
    const make = (vs: number[], label: string, tick: string): Bucket => {
      if (!vs.length) return null;
      const sum = vs.reduce((a, b) => a + b, 0);
      return { label, tick, lo: Math.min(...vs), hi: Math.max(...vs), avg: sum / vs.length, sum, n: vs.length };
    };
    if (timed) {
      const byHour: number[][] = Array.from({ length: 24 }, () => []);
      for (const s of samples) byHour[new Date(s.t!).getHours()]!.push(s.v);
      return byHour.map((vs, h) => make(vs, `${pad(h)}:00 to ${pad((h + 1) % 24)}:00`, h % 6 === 0 ? `${pad(h)}:00` : ''));
    }
    // no times: one column per sample, thinned to at most 96 columns by averaging neighbours
    const per = Math.max(1, Math.ceil(samples.length / 96));
    const out: Bucket[] = [];
    for (let i = 0; i < samples.length; i += per) out.push(make(samples.slice(i, i + per).map(s => s.v), per === 1 ? `Sample ${i + 1} of ${samples.length}` : `Samples ${i + 1} to ${Math.min(samples.length, i + per)}`, ''));
    return out;
  }, [samples, timed]);
  const have = items.map((b, i) => (b ? i : -1)).filter(i => i >= 0);
  const [picked, setPicked] = useState(-1);
  const sel = picked >= 0 && items[picked] ? picked : have[have.length - 1] ?? -1;
  const cur = sel >= 0 ? items[sel]! : null;
  const top = Math.max(...items.map(b => (b ? (counted ? b.sum : b.hi) : 0)), 1);
  const bottom = counted ? 0 : Math.min(...items.map(b => (b ? b.lo : Infinity)));
  const padY = counted ? top * 0.08 : Math.max(1, (top - bottom) * 0.12);
  const lo = counted ? 0 : Math.max(0, bottom - padY), hi = top + padY;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const ticks = [0.2, 0.5, 0.8].map(f => lo + (hi - lo) * f);
  const f = (v: number) => fmt(v, dp);
  const width = items.length > 60 ? 3 : items.length > 30 ? 6 : 10;

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative w-9 shrink-0" style={{ height }} aria-hidden>
          {ticks.map(t => <span key={t} className="num absolute right-0 translate-y-1/2 text-[11px] text-muted" style={{ bottom: `${pct(t)}%` }}>{fmt(t, hi - lo < 10 ? 1 : 0)}</span>)}
        </div>
        <div className="relative min-w-0 flex-1 border-b border-line" style={{ height }}>
          {ticks.map(t => <div key={t} aria-hidden className="absolute inset-x-0 border-t border-line/70" style={{ bottom: `${pct(t)}%` }} />)}
          <div className="relative flex h-full" role="group" aria-label={timed ? 'Hours of today' : 'Samples of today'}>
            {items.map((b, i) => (
              <button
                key={i}
                type="button"
                disabled={!b}
                aria-pressed={i === sel}
                aria-label={b ? `${b.label}: ${counted ? `${f(b.sum)} ${unit}` : `${f(b.lo)} to ${f(b.hi)} ${unit}, average ${f(b.avg)}`}` : `${timed ? `${pad(i)}:00` : 'Sample'}: no readings`}
                onClick={() => setPicked(i)}
                className={cn('relative min-w-0 flex-1 cursor-pointer disabled:cursor-default', i === sel && 'bg-ink/5')}
              >
                {b ? (
                  <>
                    <span className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{
                      bottom: `${counted ? 0 : pct(b.lo)}%`, height: `max(3px, ${counted ? pct(b.sum) : pct(b.hi) - pct(b.lo)}%)`, width, background: color, opacity: i === sel ? 1 : 0.45,
                      ...(counted ? { borderRadius: '3px 3px 0 0' } : {}),
                    }} />
                    {!counted && b.n > 1 ? <span className="absolute left-1/2 h-0.5 -translate-x-1/2 bg-ink" style={{ bottom: `${pct(b.avg)}%`, width: width + 6, opacity: i === sel ? 1 : 0.6 }} /> : null}
                  </>
                ) : <span className="absolute bottom-0 left-1/2 size-0.5 -translate-x-1/2 rounded-full bg-line-strong" />}
              </button>
            ))}
          </div>
        </div>
      </div>
      {timed ? (
        <div className="mt-2 ml-11 flex" aria-hidden>
          {items.map((_, i) => <span key={i} className="num min-w-0 flex-1 text-center text-[11px] whitespace-nowrap text-muted">{i % 6 === 0 ? `${pad(i)}:00` : ''}</span>)}
        </div>
      ) : null}
      {cur ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-[10px] bg-surface-2 px-3.5 py-3 shadow-card sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1"><dt className="text-[12px] text-muted">Selected</dt><dd className="num text-sm font-medium">{cur.label}</dd></div>
          {counted
            ? <div><dt className="text-[12px] text-muted">Total</dt><dd className="num text-[17px] font-semibold">{f(cur.sum)}<span className="text-[12px] font-normal text-muted"> {unit}</span></dd></div>
            : <>
                <div><dt className="text-[12px] text-muted">Range</dt><dd className="num text-[17px] font-semibold">{cur.n > 1 ? `${f(cur.lo)}–${f(cur.hi)}` : f(cur.avg)}<span className="text-[12px] font-normal text-muted"> {unit}</span></dd></div>
                <div><dt className="text-[12px] text-muted">Average</dt><dd className="num text-[17px] font-semibold">{f(cur.avg)}<span className="text-[12px] font-normal text-muted"> {unit}</span></dd></div>
              </>}
          <div><dt className="text-[12px] text-muted">Readings</dt><dd className="num text-[17px] font-semibold">{fmt(cur.n)}</dd></div>
        </dl>
      ) : null}
      {!timed ? <p className="mt-3 text-[13px] text-muted">The Shortcut export has no sample times, so these are today’s {fmt(samples.length)} samples in the order they were sent. Add the matching “_at” time list to the Shortcut for a true hour-by-hour view and a “latest reading” with its time.</p> : null}
    </div>
  );
}
