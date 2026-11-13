import type { ComponentType } from 'react';
import { createHashRouter, Navigate, useParams, useRouteError, type RouteObject } from 'react-router';
import { NotFound } from './NotFound';
import { Button } from '@/components/ui/button';
import { PageSkeleton } from '@/components/common';
import { TodayPage } from '@/features/today/TodayPage';
import { Shell } from './Shell';

function RouteError() {
  const err = useRouteError() as Error | undefined;
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Something broke</h1>
      <p className="mt-2 text-muted">{err?.message || 'Unexpected error.'} Your data is safe.</p>
      <Button variant="primary" className="mt-6" onClick={() => { location.hash = '#/today'; location.reload(); }}>Reload</Button>
    </div>
  );
}

/* Links from before Body and Move were merged into Health, and from before the Activity tab, keep working. */
function Redirect({ to }: { to: (p: Record<string, string | undefined>) => string }) {
  return <Navigate to={to(useParams())} replace />;
}

/* Today ships in the first bundle. Every other page (and the charting library most of them use)
   loads the first time it is opened; the service worker has them all cached for offline use. */
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => async () => ({ Component: (await load())[name] });
const food = page(() => import('@/features/food/FoodRoute'), 'FoodRoute');
const train = page(() => import('@/features/train/TrainRoute'), 'TrainRoute');
const day = page(() => import('@/features/day/DayPage'), 'DayPage');

const children: RouteObject[] = [
  { index: true, element: <Navigate to="/today" replace /> },
  { path: 'today', element: <TodayPage /> },
  { path: 'food', lazy: food },
  { path: 'food/trends', lazy: food },
  { path: 'food/meal/:id', lazy: food },
  { path: 'food/:date', lazy: food },
  { path: 'train', lazy: train },
  { path: 'train/log', lazy: page(() => import('@/features/train/LogPage'), 'LogPage') },
  { path: 'train/progress', lazy: train },
  { path: 'train/exercises', lazy: train },
  { path: 'train/exercise/:name', lazy: train },
  { path: 'train/session/:id', lazy: train },
  { path: 'day/:date', lazy: day },
  { path: 'health', lazy: page(() => import('@/features/health/HealthSummary'), 'HealthSummary') },
  { path: 'health/day/:date', lazy: day },
  { path: 'health/sleep', lazy: page(() => import('@/features/health/SleepPage'), 'SleepPage') },
  { path: 'health/weight', lazy: page(() => import('@/features/body/WeightPage'), 'WeightPage') },
  { path: 'health/measurements', lazy: page(() => import('@/features/body/MeasurementsPage'), 'MeasurementsPage') },
  { path: 'activity', lazy: page(() => import('@/features/activity/ActivityFeed'), 'ActivityFeed') },
  { path: 'activity/progress', lazy: page(() => import('@/features/activity/ProgressPage'), 'ProgressPage') },
  { path: 'activity/:id', lazy: page(() => import('@/features/activity/ActivityDetail'), 'ActivityDetail') },
  { path: 'health/workouts', element: <Navigate to="/activity" replace /> },
  { path: 'health/workout/:id', element: <Redirect to={p => `/activity/${encodeURIComponent(p.id ?? '')}`} /> },
  { path: 'health/metric/:key', lazy: page(() => import('@/features/metrics/MetricPage'), 'MetricPage') },
  { path: 'health/:cat', lazy: page(() => import('@/features/health/CategoryPage'), 'CategoryPage') },
  { path: 'body', element: <Navigate to="/health/body" replace /> },
  { path: 'body/weight', element: <Navigate to="/health/weight" replace /> },
  { path: 'body/measurements', element: <Navigate to="/health/measurements" replace /> },
  { path: 'move', element: <Navigate to="/health/activity" replace /> },
  { path: 'move/activity/:id', element: <Redirect to={p => `/activity/${encodeURIComponent(p.id ?? '')}`} /> },
  { path: 'metric/:key', element: <Redirect to={p => (p.key === 'sleepH' ? '/health/sleep' : `/health/metric/${p.key}`)} /> },
  { path: 'settings', lazy: page(() => import('@/features/settings/SettingsPage'), 'SettingsPage') },
  ...(import.meta.env.DEV ? [{ path: 'dev/icons', lazy: page(() => import('@/features/train/IconGallery'), 'IconGallery') }] : []),
  { path: '*', element: <NotFound /> },
];

export const router = createHashRouter([
  { path: '/', element: <Shell />, errorElement: <RouteError />, hydrateFallbackElement: <div className="p-6"><PageSkeleton /></div>, children },
]);
