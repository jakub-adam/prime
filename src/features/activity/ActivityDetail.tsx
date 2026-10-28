import { MapPinOff, Pencil, Trash2, TriangleAlert, Watch } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound';
import { engine, useData, useGoals, useResolvedTheme, useToday } from '@/app/store';
import { fmtDur, isRun, pace, riegel10k } from '@/core/calc';
import { fmtLong, fmtRelative } from '@/core/dates';
import type { BestEfforts, WorkoutDetail } from '@/core/types';
import { hkTime, paceSeries } from '@/core/workout';
import { PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, Segmented, Skeleton } from '@/components/ui/misc';
import { Confirm } from '@/components/ui/sheet';
import { ActivitySheet } from '@/features/move/ActivitySheet';
import { cn, fmt } from '@/lib/utils';
import { findActivity, fmtClock, fmtPace, partOfDay, sportOf, visibleRoute } from './activity-data';
import { PaceHrChart, SplitsTable, Stat, ZonesBar, type PaceHrRow } from './activity-ui';
import { rampCss, valueRange, type RouteMetric } from './gradient';
import type { KmMark } from './RouteMap';
import { useWorkoutDetail } from './useWorkoutDetail';

const RouteMap = lazy(() => import('./RouteMap'));
const MAP_H = 'h-[280px] sm:h-[360px] lg:h-[440px]';

function series(d: WorkoutDetail | null) {
  if (!d) return { rows: [] as PaceHrRow[] };
  const ps = paceSeries(d.distSeries);
  const by = new Map<number, PaceHrRow>();
  d.distSeries.forEach((x, i) => by.set(x.tSec, { tSec: x.tSec, km: x.km, pace: ps[i]!.pace, bpm: null }));
  for (const h of d.hrSeries) by.set(h.tSec, { ...(by.get(h.tSec) ?? { tSec: h.tSec, km: null, pace: null }), bpm: h.bpm });
  return { rows: [...by.values()].sort((a, b) => a.tSec - b.tSec) };
}

function MapPlaceholder({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex h-24 items-center gap-3 rounded-card border border-dashed border-line-strong/70 bg-surface-2 px-5 text-sm text-muted">
      {icon}<span>{children}</span>
    </div>
  );
}

export function ActivityDetail() {
  const { id = '' } = useParams();
  const data = useData();
  const g = useGoals();
  const today = useToday();
  const nav = useNavigate();
  const dark = useResolvedTheme() === 'dark';
  const [metric, setMetric] = useState<RouteMetric>('pace');
  const [active, setActive] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const a = useMemo(() => findActivity(data, id), [data, id]);
  const w = a?.workout;
  const det = useWorkoutDetail(w);
  const detail = det.status === 'ready' ? det.detail : null;
  const { rows } = useMemo(() => series(detail), [detail]);

  const route = useMemo(() => visibleRoute(detail?.route, g.routePrivacyM), [detail, g.routePrivacyM]);
  const values = useMemo(() => {
    const at = new Map(rows.map(r => [r.tSec, r]));
    return route.map(p => {
      const r = at.get(Math.round(p.tSec / 10) * 10);
      return (metric === 'pace' ? r?.pace : r?.bpm) ?? null;
    });
  }, [route, rows, metric]);
  const kmMarks = useMemo(() => {
    const out: KmMark[] = [];
    if (!detail || route.length < 2) return out;
    const ds = detail.distSeries;
    for (let k = 1; k <= Math.floor(ds[ds.length - 1]?.km ?? 0); k++) {
      const i = ds.findIndex(x => x.km >= k);
      if (i < 0) break;
      const t = ds[i]!.tSec;
      if (t < route[0]!.tSec || t > route[route.length - 1]!.tSec) continue; // inside the hidden ends
      const p = route.reduce((b, x) => (Math.abs(x.tSec - t) < Math.abs(b.tSec - t) ? x : b));
      out.push({ km: k, lat: p.lat, lng: p.lng });
    }
    return out;
  }, [detail, route]);
  const range = valueRange(values);

  if (!a) return <NotFound />;
  if (a.id !== id) return <Navigate to={`/activity/${encodeURIComponent(a.id)}`} replace />;

  const logged = a.source === 'Logged' ? data.activities.activities.find(x => x.id === a.id) : undefined;
  const sport = sportOf(w?.type ?? a.type);
  const startMs = a.watchStart ? hkTime(a.watchStart) : null;
  const p = w?.avgPaceSecPerKm ?? pace(a);
  const run = isRun(a.type);
  const title = startMs != null ? `${partOfDay(startMs)} ${sport === 'run' ? 'Run' : sport === 'walk' ? 'Walk' : sport === 'strength' ? 'Strength' : a.type}` : a.type;
  const hasGps = !!w?.routePreview || !!detail?.route?.length;
  const indoor = w?.indoor || (!!w && !w.routePreview && sport !== 'strength');

  const headline: [string, string, string?][] = [];
  if (a.distanceKm) headline.push(['Distance', fmt(a.distanceKm, 2), 'km']);
  headline.push(['Time', fmtDur(w?.durationSec ?? a.durationSec)]);
  if (p && (sport === 'run' || sport === 'walk')) headline.push(['Pace', fmtPace(p), '/km']);
  if (a.avgHr) headline.push(['Avg HR', String(a.avgHr), 'bpm']);
  if (w?.maxHr) headline.push(['Max HR', String(w.maxHr), 'bpm']);
  if (w?.elevationGainM != null) headline.push(['Elevation', fmt(w.elevationGainM), 'm']);
  if (w?.avgCadence) headline.push(['Cadence', String(w.avgCadence), 'spm']);
  if (a.kcal) headline.push(['Energy', fmt(a.kcal), 'kcal']);

  const proj = run && a.distanceKm && a.distanceKm >= 1 ? riegel10k(a.durationSec, a.distanceKm) : null;
  const efforts = (w?.bestEfforts ?? {}) as BestEfforts;
  const dynamics: [string, string][] = [
    ['Avg power', w?.avgPowerW ? `${w.avgPowerW} W` : ''],
    ['Stride length', w?.avgStrideM ? `${fmt(w.avgStrideM, 2)} m` : ''],
    ['Ground contact', w?.avgGroundContactMs ? `${w.avgGroundContactMs} ms` : ''],
    ['Vertical oscillation', w?.avgVerticalOscCm ? `${fmt(w.avgVerticalOscCm, 1)} cm` : ''],
    ['Max speed', w?.maxSpeedKmh ? `${fmt(w.maxSpeedKmh, 1)} km/h` : ''],
    ['Steps', w?.steps ? fmt(w.steps) : ''],
    ['Min HR', w?.minHr ? `${w.minHr} bpm` : ''],
    ['Avg METs', w?.avgMets ? fmt(w.avgMets, 1) : ''],
    ['Resting energy', w?.basalKcal ? `${w.basalKcal} kcal` : ''],
    ['Source', a.source === 'Logged' ? (a.merged ? 'Logged + Apple Watch' : 'Logged') : (w?.source ?? 'Apple Watch')],
  ].filter((x): x is [string, string] => !!x[1]);
  const endHr = detail?.hrSeries.length ? detail.hrSeries[detail.hrSeries.length - 1]!.bpm : null;
  const rec = w?.recoveryHr;

  return (
    <div>
      <PageHeader back="/activity"
        kicker={<>{fmtLong(a.date)}{startMs != null ? ` · ${fmtClock(startMs)}` : ''} · {fmtRelative(a.date, today)}</>}
        title={title}
        actions={logged ? <>
          <Button variant="secondary" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
          <Button variant="danger-ghost" onClick={() => setDeleting(true)}><Trash2 /> Delete</Button>
        </> : w ? <Badge tone="lane"><Watch aria-hidden className="size-3.5" /> Apple Watch</Badge> : null} />

      {/* map */}
      {hasGps ? (
        det.status === 'ready' && route.length > 1 ? (
          <Card className="relative mb-4 overflow-hidden">
            <Suspense fallback={<Skeleton className={cn('rounded-none', MAP_H)} />}>
              <RouteMap route={route} values={values} metric={metric} kmMarks={kmMarks} active={active} onActive={setActive} dark={dark}
                className={cn('route-map z-0 w-full', MAP_H)} />
            </Suspense>
            <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex justify-end">
              <Segmented size="sm" label="Colour the route by" value={metric} onChange={setMetric} className="pointer-events-auto shadow-pop"
                options={[['pace', 'Pace'], ['hr', 'Heart rate']]} />
            </div>
            {range ? (
              <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg bg-surface/90 px-2.5 py-1.5 text-[12px] shadow-pop">
                <div className="h-1.5 w-28 rounded-full" style={{ background: rampCss(metric) }} />
                <div className="num mt-0.5 flex justify-between gap-3 text-[12px] text-muted">
                  {metric === 'pace' ? <><span>{fmtPace(range.hi)}</span><span>{fmtPace(range.lo)}</span></> : <><span>{Math.round(range.lo)}</span><span>{Math.round(range.hi)} bpm</span></>}
                </div>
              </div>
            ) : null}
          </Card>
        ) : det.status === 'ready' && route.length <= 1 ? (
          <div className="mb-4"><MapPlaceholder icon={<MapPinOff aria-hidden className="size-5 shrink-0" />}>This route is shorter than the {g.routePrivacyM} m hidden at each end, so no map is shown. Change it in Settings → Activity.</MapPlaceholder></div>
        ) : det.status === 'loading' ? (
          <Skeleton className={cn('mb-4 rounded-card', MAP_H)} aria-label="Loading map" />
        ) : (
          <div className="mb-4"><MapPlaceholder icon={<TriangleAlert aria-hidden className="size-5 shrink-0" />}>
            {det.status === 'missing' ? 'The route and samples for this workout aren’t in your data repo yet. Import Apple Health again to add them.' : det.status === 'error' ? `Couldn’t load the route: ${det.message}` : 'No route.'}
          </MapPlaceholder></div>
        )
      ) : indoor && sport !== 'strength' ? (
        <div className="mb-4"><MapPlaceholder icon={<MapPinOff aria-hidden className="size-5 shrink-0" />}>No GPS for this workout{w?.indoor ? ' (indoor)' : ''}. Pace and splits come from the watch’s distance.</MapPlaceholder></div>
      ) : null}

      {/* headline stats */}
      <Card className="mb-4 lg:mb-5">
        <CardBody className="grid grid-cols-3 gap-x-4 gap-y-5 pt-4 sm:grid-cols-4 sm:pt-5 xl:grid-cols-8">
          {headline.map(([l, v, u]) => <Stat key={l} label={l} value={v} {...(u ? { unit: u } : {})} />)}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="space-y-4 lg:col-span-7 lg:space-y-5">
          {w?.detail ? (
            <Card>
              <CardHeader title="Pace and heart rate" meta={<span className="inline-flex flex-wrap gap-x-3"><span><span aria-hidden className="mr-1 inline-block h-[3px] w-3 rounded bg-track align-middle" />Pace (faster up)</span><span><span aria-hidden className="mr-1 inline-block h-[3px] w-3 rounded align-middle" style={{ background: 'var(--cat-heart)' }} />Heart rate</span></span>} />
              <CardBody>
                {det.status === 'ready' ? <PaceHrChart rows={rows} active={active} onActive={setActive} />
                  : det.status === 'loading' ? <Skeleton className="h-[260px]" />
                  : <p className="py-8 text-center text-sm text-muted">No samples saved for this workout.</p>}
              </CardBody>
            </Card>
          ) : null}
          {w?.splits?.length ? (
            <Card>
              <CardHeader title="Splits" meta="Per kilometre · longer bars are faster" />
              <CardBody className="pt-1"><SplitsTable splits={w.splits} /></CardBody>
            </Card>
          ) : null}
          {!w ? (
            <Card>
              <CardHeader title="Logged by hand" />
              <CardBody className="text-sm text-muted">No route, splits or heart-rate samples. Watch workouts imported from Apple Health have them.{a.notes ? <p className="mt-2 text-ink">{a.notes}</p> : null}</CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4 lg:col-span-5 lg:space-y-5">
          {w?.hrZones ? (
            <Card>
              <CardHeader title="Heart-rate zones" meta={`Max HR ${w.hrZonesMaxHr ?? g.maxHr} bpm`} />
              <CardBody><ZonesBar zones={w.hrZones} maxHr={w.hrZonesMaxHr ?? g.maxHr} /></CardBody>
            </Card>
          ) : w && sport !== 'strength' ? (
            <Card>
              <CardHeader title="Heart-rate zones" />
              <CardBody className="text-sm text-muted">The watch recorded no heart rate during this workout (it was probably loose).</CardBody>
            </Card>
          ) : null}
          {rec ? (
            <Card>
              <CardHeader title="Recovery" meta="Heart rate after you stopped" />
              <CardBody className="grid grid-cols-3 gap-3">
                <Stat label="At finish" value={endHr ?? w?.maxHr ?? '–'} unit="bpm" />
                <Stat label="After 1 min" value={rec.after1Min ?? '–'} unit="bpm" />
                <Stat label="After 2 min" value={rec.after2Min ?? '–'} unit="bpm" />
                {endHr && rec.after1Min ? <p className="col-span-3 text-[13px] text-muted">Dropped <b className="num text-[15px] text-ink">{endHr - rec.after1Min}</b> bpm in the first minute{rec.after2Min ? <> and <b className="num text-[15px] text-ink">{endHr - rec.after2Min}</b> in two</> : null}.</p> : null}
              </CardBody>
            </Card>
          ) : null}
          {run && (Object.keys(efforts).length || proj) ? (
            <Card>
              <CardHeader title="Best efforts" meta="Fastest stretch inside this run" />
              <CardBody className="grid grid-cols-3 gap-3">
                {(['1k', '3k', '5k', '10k'] as const).filter(k => efforts[k]).map(k => <Stat key={k} label={k.replace('k', ' km')} value={fmtDur(efforts[k])} />)}
                {proj ? <Stat label="10 km projection" value={fmtDur(proj)} className="col-span-2" /> : null}
              </CardBody>
            </Card>
          ) : null}
          {dynamics.length > 1 ? (
            <Card>
              <CardHeader title="More from the watch" />
              <CardBody className="pt-1">
                <dl className="text-sm">
                  {dynamics.map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-line/70 py-2 last:border-0"><dt className="text-muted">{k}</dt><dd className="num text-[15px] font-semibold">{v}</dd></div>)}
                </dl>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
      {logged ? <ActivitySheet open={editing} onOpenChange={setEditing} activity={logged} /> : null}
      <Confirm open={deleting} onOpenChange={setDeleting} title="Delete this activity?" description={`${a.type} on ${fmtLong(a.date)}.`}
        onConfirm={() => { engine.commit('activities', [{ t: 'remove', c: 'activities', id: a.id }], 'Activity deleted'); nav('/activity', { replace: true }); }} />
    </div>
  );
}
