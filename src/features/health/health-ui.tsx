import {
  Activity, Brain, ChevronRight, Droplet, Ear, Flame, Footprints, Gauge, Headphones, Heart, HeartPulse, Moon, Percent, PersonStanding,
  Route, Scale, Sun, Thermometer, Timer, TrendingUp, Waves, Wind, type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useData, useHealthDays, useNow, useSnapshot, useToday } from '@/app/store';
import { avg, CATEGORY, healthDays, METRICS, metricSeries, rollingAvg, STRESS_LABEL, stressLevel, weightSeries, type CategoryKey, type MetricKey } from '@/core/calc';
import { addDays, fmtAgo, fmtClock, fmtRelative } from '@/core/dates';
import type { HealthDay } from '@/core/types';
import { COLOR, Sparkline } from '@/components/charts';
import { cn, fmt, signed } from '@/lib/utils';

export const CAT_ICON: Record<CategoryKey, LucideIcon> = {
  activity: Flame, body: PersonStanding, heart: Heart, mind: Brain, sleep: Moon, respiratory: Wind, mobility: Footprints, hearing: Ear,
};
/** One icon per metric, in its category's tint, so a card is recognisable before it is read. */
const METRIC_ICON: Partial<Record<MetricKey, LucideIcon>> = {
  hrAvg: Heart, restingHr: HeartPulse, hrv: Activity, walkingHr: Footprints, hrRecovery: HeartPulse, vo2max: TrendingUp,
  spo2: Droplet, respiratoryRate: Wind, stress: Waves, mindfulMin: Brain, daylightMin: Sun, sleepH: Moon,
  steps: Footprints, activeKcal: Flame, basalKcal: Flame, exerciseMin: Timer, standHours: PersonStanding, standMin: PersonStanding,
  distanceKm: Route, cyclingKm: Route, flights: TrendingUp, bodyFatPct: Percent, wristTempC: Thermometer,
  walkingSpeed: Gauge, stepLengthCm: Footprints, walkingAsymmetry: Footprints, doubleSupport: Footprints, sixMinWalkM: Route,
  envAudioDb: Ear, headphoneDb: Headphones,
};

/** Tinted icon badge: a category, or one metric (its own icon in its category's colour). */
export function CategoryIcon({ cat, metric, icon, size = 'md', className }: { cat: CategoryKey; metric?: MetricKey; icon?: LucideIcon; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const Icon = icon ?? (metric ? METRIC_ICON[metric] : undefined) ?? CAT_ICON[cat];
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-[8px]', size === 'sm' ? 'size-6 [&_svg]:size-3.5' : size === 'lg' ? 'size-12 rounded-[12px] [&_svg]:size-6' : 'size-9 rounded-[10px] [&_svg]:size-[18px]', className)}
      style={{ color: COLOR[cat], background: `color-mix(in srgb, ${COLOR[cat]} 14%, transparent)` }}
    >
      <Icon strokeWidth={2} />
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

export type MetricSummary = ReturnType<typeof useMetricSummary>;

/** Everything a card needs for one metric: the latest reading and when it was taken, today's range,
    the 7-day baseline and a 14-day sparkline. The latest reading comes from the Shortcut's newest
    sample when it carries sample times; otherwise it is the newest day's value, labelled with how
    fresh that is ("as of 16:22", "Mon"). */
export function useMetricSummary(key: MetricKey) {
  const days = useHealthDays();
  const { live } = useSnapshot();
  const today = useToday();
  const now = useNow();
  return useMemo(() => {
    const dates = healthDays(days).filter(d => days[d]?.[key] != null);
    const last = dates[dates.length - 1] ?? null;
    const lastDay = last ? days[last]! : undefined;
    const week = last ? dates.filter(d => d > addDays(last, -7)).map(d => days[d]![key]!) : [];
    const spark = last ? metricSeries(days, key, addDays(last, -13), last).map(p => p.v) : [];
    const fresh = live && live.date === today ? live : null;
    const reading = fresh?.latest?.[key];
    const exportedAt = fresh?.at ? Date.parse(fresh.at) : NaN;
    const readAt = reading?.at ? Date.parse(reading.at) : NaN;
    // exact = the value is one timed reading (or a running total as of the export), not a day's average
    const exact = !!reading && Number.isFinite(readAt);
    const value = exact ? reading!.v : lastDay?.[key] ?? null;
    const when = !last ? '' : exact ? fmtAgo(readAt, now)
      : last === today ? (Number.isFinite(exportedAt) ? `as of ${fmtClock(exportedAt)}` : 'Today')
      : fmtRelative(last, today);
    const range = last === today && key === 'hrAvg' && lastDay?.hrMin != null && lastDay?.hrMax != null ? `${fmt(lastDay.hrMin)}–${fmt(lastDay.hrMax)}` : null;
    return { last, value, lastDay, weekAvg: avg(week), spark, count: dates.length, when, exact, range, isToday: last === today };
  }, [days, key, live, today, now]);
}

/** A single reading with its unit ("72 bpm", "7:41 h", "49 Moderate"); never a range. */
export function formatReading(key: MetricKey, v: number | null | undefined) {
  return formatMetric(key, v);
}

/** Health summary card: icon and name, when the value was read, the latest value large, then
    today's range and the 7-day baseline as quiet context beside a small trend. */
export function HealthCard({ k, className }: { k: MetricKey; className?: string }) {
  const def = METRICS[k];
  const s = useMetricSummary(k);
  const f = formatReading(k, s.value);
  const avgF = formatReading(k, s.weekAvg);
  const context = [
    s.range ? `Today ${s.range}` : !s.exact && s.isToday && k === 'hrAvg' ? 'Average today' : null,
    s.weekAvg != null ? `7-day avg ${avgF.value}${avgF.unit && k !== 'stress' ? ` ${avgF.unit}` : ''}` : null,
  ].filter(Boolean);
  return (
    <Link
      to={metricHref(k)}
      className={cn('@container group flex min-h-[132px] flex-col rounded-card bg-surface p-4 shadow-card transition-shadow duration-200 hover:shadow-pop', className)}
    >
      <div className="flex items-center gap-2">
        <CategoryIcon cat={def.category} metric={k} size="sm" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={def.label}>{shortLabel(k)}</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
        <span className="num text-[28px] leading-none font-semibold">{f.value}</span>
        {f.unit ? <span className="text-[13px] text-muted">{f.unit}</span> : null}
        <span className="ml-auto text-[12px] whitespace-nowrap text-muted">{s.when || 'No data'}</span>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <div className="min-w-0 text-[12px] leading-snug text-muted">
          {context.length ? context.map(c => <div key={c} className="truncate">{c}</div>) : <div>{s.last ? 'Latest reading' : 'No data yet'}</div>}
        </div>
        <Sparkline values={s.spark} color={def.category} kind={def.chart === 'bar' ? 'bar' : 'line'} className="h-7 w-16 shrink-0 @[13.5rem]:w-20" />
      </div>
    </Link>
  );
}

/* ---------- activity rings ---------- */
export const RING_GOALS = { move: 500, exercise: 30, stand: 12 };
export function Ring({ r, pct, color, w }: { r: number; pct: number; color: string; w: number }) {
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
  const w = size * 0.1;
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
    <dl className="flex min-w-0 flex-1 flex-col gap-2">
      {rows.map(([label, color, v, goal, unit]) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <dt className="flex items-center gap-2 text-[13px] text-muted"><span aria-hidden className="size-2 rounded-full" style={{ background: color }} />{label}</dt>
          <dd className="num text-[15px] font-semibold">{fmt(v)}<span className="text-[12px] font-normal text-muted"> / {goal} {unit}</span></dd>
        </div>
      ))}
    </dl>
  );
}

export function categoryHasData(days: Record<string, HealthDay>, cat: CategoryKey) {
  return CATEGORY[cat].metrics.some(k => Object.values(days).some(d => d[k] != null));
}

/** Weight: the latest weigh-in and its date first, the 7-day average and weekly change as context. */
export function WeightCard({ className }: { className?: string }) {
  const data = useData();
  const today = useToday();
  const ws = useMemo(() => weightSeries(data), [data]);
  const now = rollingAvg(ws, today), prev = rollingAvg(ws, addDays(today, -7));
  const last = ws[ws.length - 1];
  return (
    <Link to="/health/weight" className={cn('@container group flex min-h-[132px] flex-col rounded-card bg-surface p-4 shadow-card transition-shadow duration-200 hover:shadow-pop', className)}>
      <div className="flex items-center gap-2">
        <CategoryIcon cat="body" icon={Scale} size="sm" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">Weight</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
        <span className="num text-[28px] leading-none font-semibold">{last ? fmt(last.kg, 1) : '–'}</span>
        <span className="text-[13px] text-muted">kg</span>
        <span className="ml-auto text-[12px] whitespace-nowrap text-muted">{last ? fmtRelative(last.date, today) : 'No weigh-ins'}</span>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <div className="min-w-0 text-[12px] leading-snug text-muted">
          {now ? <div className="truncate">7-day avg {fmt(now, 1)} kg</div> : null}
          {now && prev ? <div className={cn('truncate', now - prev <= 0 ? 'text-good' : 'text-bad')}>{signed(now - prev)} kg vs last week</div> : null}
        </div>
        <Sparkline values={ws.slice(-14).map(p => p.kg)} color="body" className="h-7 w-16 shrink-0 @[13.5rem]:w-20" />
      </div>
    </Link>
  );
}
