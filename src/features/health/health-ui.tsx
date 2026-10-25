import { Brain, ChevronRight, Ear, Flame, Footprints, Heart, Moon, PersonStanding, Wind, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useData, useHealthDays, useToday } from '@/app/store';
import { avg, CATEGORY, healthDays, METRICS, metricSeries, rollingAvg, STRESS_LABEL, stressLevel, weightSeries, type CategoryKey, type MetricKey } from '@/core/calc';
import { addDays, fmtRelative } from '@/core/dates';
import type { HealthDay } from '@/core/types';
import { COLOR, Sparkline } from '@/components/charts';
import { cn, fmt, signed } from '@/lib/utils';

export const CAT_ICON: Record<CategoryKey, LucideIcon> = {
  activity: Flame, body: PersonStanding, heart: Heart, mind: Brain, sleep: Moon, respiratory: Wind, mobility: Footprints, hearing: Ear,
};

export function CategoryIcon({ cat, size = 'md', className }: { cat: CategoryKey; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const Icon = CAT_ICON[cat];
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-[10px]', size === 'sm' ? 'size-7 [&_svg]:size-4' : size === 'lg' ? 'size-12 rounded-2xl [&_svg]:size-6' : 'size-9 [&_svg]:size-[18px]', className)}
      style={{ color: COLOR[cat], background: `color-mix(in srgb, ${COLOR[cat]} 15%, transparent)` }}
    >
      <Icon strokeWidth={2.3} />
    </span>
  );
}

/** Card titles short enough to fit a phone-width card. */
export const SHORT_LABEL: Partial<Record<MetricKey, string>> = {
  distanceKm: 'Distance', activeKcal: 'Active energy', basalKcal: 'Resting energy', restingHr: 'Resting HR', walkingHr: 'Walking HR',
  hrv: 'HRV', hrRecovery: 'Cardio recovery', vo2max: 'VO₂ max', respiratoryRate: 'Respiratory rate', spo2: 'Blood oxygen',
  exerciseMin: 'Exercise', standHours: 'Stand hours', standMin: 'Stand minutes', hrAvg: 'Heart rate', wristTempC: 'Wrist temperature',
  walkingAsymmetry: 'Asymmetry', doubleSupport: 'Double support', stepLengthCm: 'Step length', sixMinWalkM: '6-min walk',
  envAudioDb: 'Environmental sound', headphoneDb: 'Headphone audio', daylightMin: 'Daylight', mindfulMin: 'Mindful minutes', flights: 'Flights climbed',
};
export const shortLabel = (k: MetricKey) => SHORT_LABEL[k] ?? METRICS[k].label;

export function metricHref(key: MetricKey) {
  return key === 'sleepH' ? '/health/sleep' : `/health/metric/${key}`;
}

/** Value formatted with its unit, e.g. "8,450 steps", "52–171 bpm", "61 · Moderate". */
export function formatMetric(key: MetricKey, v: number | null | undefined, day?: HealthDay) {
  const def = METRICS[key];
  if (v == null) return { value: '–', unit: '' };
  if (key === 'hrAvg' && day?.hrMin != null && day?.hrMax != null) return { value: `${fmt(day.hrMin)}–${fmt(day.hrMax)}`, unit: 'bpm' };
  if (key === 'stress') return { value: fmt(v), unit: STRESS_LABEL[stressLevel(v)] };
  if (key === 'sleepH') {
    const t = Math.round(v * 60);
    return { value: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, unit: 'h' };
  }
  return { value: fmt(v, def.dp), unit: def.unit === 'score' ? '' : def.unit };
}

export function useMetricSummary(key: MetricKey) {
  const days = useHealthDays();
  return useMemo(() => {
    const dates = healthDays(days).filter(d => days[d]?.[key] != null);
    const last = dates[dates.length - 1] ?? null;
    const lastDay = last ? days[last]! : undefined;
    const week = last ? dates.filter(d => d > addDays(last, -7)).map(d => days[d]![key]!) : [];
    const spark = last ? metricSeries(days, key, addDays(last, -13), last).map(p => p.v) : [];
    return { last, value: lastDay?.[key] ?? null, lastDay, weekAvg: avg(week), spark, count: dates.length };
  }, [days, key]);
}

/** Apple Health style summary card: coloured icon and label, date, big latest value, small trend. */
export function HealthCard({ k, className }: { k: MetricKey; className?: string }) {
  const def = METRICS[k];
  const s = useMetricSummary(k);
  const today = useToday();
  const f = formatMetric(k, s.value, s.lastDay);
  const avgF = formatMetric(k, s.weekAvg);
  return (
    <Link
      to={metricHref(k)}
      className={cn('group flex min-h-[132px] flex-col rounded-card border border-line/80 bg-surface p-4 shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop', className)}
    >
      <div className="flex items-center gap-2">
        <CategoryIcon cat={def.category} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={def.label}>{shortLabel(k)}</span>
        <span className="shrink-0 text-[12px] text-muted">{s.last ? fmtRelative(s.last, today) : ''}</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-1">
            <span className="num text-[30px] leading-none font-semibold">{f.value}</span>
            {f.unit ? <span className="text-sm font-medium text-muted">{f.unit}</span> : null}
          </div>
          <div className="mt-1 truncate text-[12px] text-muted">{s.weekAvg != null ? `7-day avg ${avgF.value}${avgF.unit && k !== 'stress' ? ` ${avgF.unit}` : ''}` : s.last ? 'Latest' : 'No data'}</div>
        </div>
        <Sparkline values={s.spark} color={k === 'stress' ? 'track' : def.category} kind={def.chart === 'bar' ? 'bar' : 'line'} className="h-9 w-24 shrink-0" />
      </div>
    </Link>
  );
}

/* ---------- activity rings ---------- */
export const RING_GOALS = { move: 500, exercise: 30, stand: 12 };
function Ring({ r, pct, color, w }: { r: number; pct: number; color: string; w: number }) {
  const c = 2 * Math.PI * r;
  const shown = Math.min(pct, 1);
  return (
    <g>
      <circle r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={w} />
      <circle r={r} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeDasharray={`${shown * c} ${c}`} transform="rotate(-90)" />
      {pct > 1 ? <circle r={r} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeDasharray={`${Math.min(pct - 1, 1) * c} ${c}`} transform="rotate(-90)" style={{ filter: 'brightness(0.8)' }} /> : null}
    </g>
  );
}
export function ActivityRings({ day, size = 132 }: { day: HealthDay | undefined; size?: number }) {
  const move = (day?.activeKcal ?? 0) / RING_GOALS.move, ex = (day?.exerciseMin ?? 0) / RING_GOALS.exercise, st = (day?.standHours ?? 0) / RING_GOALS.stand;
  const w = size * 0.11;
  return (
    <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} width={size} height={size} role="img"
      aria-label={`Move ${fmt(day?.activeKcal)} of ${RING_GOALS.move} kcal, Exercise ${fmt(day?.exerciseMin)} of ${RING_GOALS.exercise} min, Stand ${fmt(day?.standHours)} of ${RING_GOALS.stand} hours`}>
      <Ring r={size / 2 - w / 2 - 1} pct={move} color="var(--ring-move)" w={w} />
      <Ring r={size / 2 - w * 1.5 - 3} pct={ex} color="var(--ring-exercise)" w={w} />
      <Ring r={size / 2 - w * 2.5 - 5} pct={st} color="var(--ring-stand)" w={w} />
    </svg>
  );
}
export function RingsLegend({ day }: { day: HealthDay | undefined }) {
  const rows: [string, string, number | undefined, number, string][] = [
    ['Move', 'var(--ring-move)', day?.activeKcal, RING_GOALS.move, 'kcal'],
    ['Exercise', 'var(--ring-exercise)', day?.exerciseMin, RING_GOALS.exercise, 'min'],
    ['Stand', 'var(--ring-stand)', day?.standHours, RING_GOALS.stand, 'h'],
  ];
  return (
    <dl className="flex flex-col gap-2">
      {rows.map(([label, color, v, goal, unit]) => (
        <div key={label}>
          <dt className="flex items-center gap-1.5 text-[13px] font-semibold text-muted"><span aria-hidden className="size-2.5 rounded-full" style={{ background: color }} />{label}</dt>
          <dd className="num text-xl leading-tight font-semibold">{fmt(v)}<span className="font-sans text-sm font-medium text-muted">/{goal} {unit}</span></dd>
        </div>
      ))}
    </dl>
  );
}

export function categoryHasData(days: Record<string, HealthDay>, cat: CategoryKey) {
  return CATEGORY[cat].metrics.some(k => Object.values(days).some(d => d[k] != null));
}

export function WeightCard({ className }: { className?: string }) {
  const data = useData();
  const today = useToday();
  const ws = useMemo(() => weightSeries(data), [data]);
  const now = rollingAvg(ws, today), prev = rollingAvg(ws, addDays(today, -7));
  const last = ws[ws.length - 1];
  return (
    <Link to="/health/weight" className={cn('group flex min-h-[132px] flex-col rounded-card border border-line/80 bg-surface p-4 shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop', className)}>
      <div className="flex items-center gap-2">
        <CategoryIcon cat="body" size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">Weight</span>
        <span className="shrink-0 text-[12px] text-muted">{last ? fmtRelative(last.date, today) : ''}</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1"><span className="num text-[30px] leading-none font-semibold">{now ? fmt(now, 1) : '–'}</span><span className="text-sm font-medium text-muted">kg</span></div>
          <div className={cn('mt-1 truncate text-[12px]', now && prev ? (now - prev <= 0 ? 'text-good' : 'text-bad') : 'text-muted')}>{now && prev ? `${signed(now - prev)} kg vs last week` : '7-day average'}</div>
        </div>
        <Sparkline values={ws.slice(-14).map(p => p.kg)} color="body" className="h-9 w-24 shrink-0" />
      </div>
    </Link>
  );
}
