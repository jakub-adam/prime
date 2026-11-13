/* Chart colours and the dependency-free sparkline. Kept apart from charts.tsx so pages that only
   need these (Today, the Health cards) do not load the charting library. */
export type ChartColor = 'track' | 'lane' | 'muted' | 'good' | 'ink' | 'carbs' | 'fat'
  | 'activity' | 'body' | 'heart' | 'mind' | 'sleep' | 'respiratory' | 'mobility' | 'hearing'
  | 'awake' | 'rem' | 'core' | 'deep';
export const COLOR: Record<ChartColor, string> = {
  track: 'var(--track)', lane: 'var(--lane)', muted: 'var(--muted)', good: 'var(--good)', ink: 'var(--ink)', carbs: 'var(--carbs)', fat: 'var(--fat)',
  activity: 'var(--cat-activity)', body: 'var(--cat-body)', heart: 'var(--cat-heart)', mind: 'var(--cat-mind)',
  sleep: 'var(--cat-sleep)', respiratory: 'var(--cat-respiratory)', mobility: 'var(--cat-mobility)', hearing: 'var(--cat-hearing)',
  awake: 'var(--stage-awake)', rem: 'var(--stage-rem)', core: 'var(--stage-core)', deep: 'var(--stage-deep)',
};

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
