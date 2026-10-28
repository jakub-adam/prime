import { useMemo } from 'react';
import { decodePolyline } from '@/core/workout';
import { cn } from '@/lib/utils';
import { visibleRoute } from './activity-data';

/** Small route outline for feed cards, from the encoded preview in health.json. No map tiles. */
export function RoutePreview({ encoded, privacyM, className }: { encoded?: string; privacyM: number; className?: string }) {
  const d = useMemo(() => {
    if (!encoded) return null;
    const pts = visibleRoute(decodePolyline(encoded), privacyM);
    if (pts.length < 2) return null;
    const midLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const kx = Math.cos((midLat * Math.PI) / 180);
    const xs = pts.map(p => p.lng * kx), ys = pts.map(p => -p.lat);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const span = Math.max(x1 - x0, y1 - y0) || 1e-6;
    const S = 100, pad = 10, k = (S - 2 * pad) / span;
    const ox = pad + (S - 2 * pad - (x1 - x0) * k) / 2, oy = pad + (S - 2 * pad - (y1 - y0) * k) / 2;
    const P = pts.map((_, i) => [ox + (xs[i]! - x0) * k, oy + (ys[i]! - y0) * k] as const);
    return { path: P.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(''), a: P[0]!, b: P[P.length - 1]! };
  }, [encoded, privacyM]);
  if (!d) return null;
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn('block', className)}>
      <path d={d.path} fill="none" stroke="var(--track)" strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={d.a[0]} cy={d.a[1]} r={4} fill="var(--good)" stroke="var(--surface)" strokeWidth={1.5} />
      <circle cx={d.b[0]} cy={d.b[1]} r={4} fill="var(--ink)" stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}
