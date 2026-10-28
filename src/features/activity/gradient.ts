/* Colour ramps for the route line and its legend (plain hex: the map draws on a canvas). */
export type RouteMetric = 'pace' | 'hr';

const RAMPS: Record<RouteMetric, string[]> = {
  // slow → fast
  pace: ['#3b7dd8', '#20a39e', '#e7b416', '#e5582b', '#c81e3a'],
  // low → high
  hr: ['#3a9a4b', '#9cc23a', '#e7b416', '#e5702b', '#c81e3a'],
};

const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
export function rampColor(metric: RouteMetric, f: number) {
  const r = RAMPS[metric], x = Math.max(0, Math.min(1, f)) * (r.length - 1), i = Math.min(r.length - 2, Math.floor(x)), t = x - i;
  const a = hex(r[i]!), b = hex(r[i + 1]!);
  return `rgb(${a.map((v, k) => Math.round(v + (b[k]! - v) * t)).join(',')})`;
}
export const rampCss = (metric: RouteMetric) => `linear-gradient(90deg, ${RAMPS[metric].join(', ')})`;

/** Robust range (5th–95th percentile) so a GPS glitch doesn't flatten the colours. */
export function valueRange(values: (number | null)[]) {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))]!;
  const lo = q(0.05), hi = q(0.95);
  return { lo, hi: hi > lo ? hi : lo + 1 };
}
/** 0 = slow / low, 1 = fast / high */
export function fraction(metric: RouteMetric, v: number, r: { lo: number; hi: number }) {
  return metric === 'pace' ? (r.hi - v) / (r.hi - r.lo) : (v - r.lo) / (r.hi - r.lo);
}
