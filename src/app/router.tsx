import { createHashRouter, Navigate, useParams, useRouteError } from 'react-router';
import { NotFound } from './NotFound';
import { Button } from '@/components/ui/button';
import { ActivityDetail } from '@/features/activity/ActivityDetail';
import { ActivityFeed } from '@/features/activity/ActivityFeed';
import { ProgressPage } from '@/features/activity/ProgressPage';
import { MeasurementsPage } from '@/features/body/MeasurementsPage';
import { WeightPage } from '@/features/body/WeightPage';
import { DayPage } from '@/features/day/DayPage';
import { FoodRoute } from '@/features/food/FoodRoute';
import { CategoryPage } from '@/features/health/CategoryPage';
import { HealthSummary } from '@/features/health/HealthSummary';
import { SleepPage } from '@/features/health/SleepPage';
import { MetricPage } from '@/features/metrics/MetricPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TodayPage } from '@/features/today/TodayPage';
import { LogPage } from '@/features/train/LogPage';
import { TrainRoute } from '@/features/train/TrainRoute';
import { Shell } from './Shell';

function RouteError() {
  const err = useRouteError() as Error | undefined;
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="font-display text-4xl font-bold uppercase">Something broke</h1>
      <p className="mt-2 text-muted">{err?.message || 'Unexpected error.'} Your data is safe.</p>
      <Button variant="primary" className="mt-6" onClick={() => { location.hash = '#/today'; location.reload(); }}>Reload</Button>
    </div>
  );
}

/* Links from before Body and Move were merged into Health, and from before the Activity tab, keep working. */
function Redirect({ to }: { to: (p: Record<string, string | undefined>) => string }) {
  return <Navigate to={to(useParams())} replace />;
}

export const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: 'today', element: <TodayPage /> },
      { path: 'food', element: <FoodRoute /> },
      { path: 'food/trends', element: <FoodRoute /> },
      { path: 'food/meal/:id', element: <FoodRoute /> },
      { path: 'food/:date', element: <FoodRoute /> },
      { path: 'train', element: <TrainRoute /> },
      { path: 'train/log', element: <LogPage /> },
      { path: 'train/progress', element: <TrainRoute /> },
      { path: 'train/exercises', element: <TrainRoute /> },
      { path: 'train/exercise/:name', element: <TrainRoute /> },
      { path: 'train/session/:id', element: <TrainRoute /> },
      { path: 'day/:date', element: <DayPage /> },
      { path: 'health', element: <HealthSummary /> },
      { path: 'health/day/:date', element: <DayPage /> },
      { path: 'health/sleep', element: <SleepPage /> },
      { path: 'health/weight', element: <WeightPage /> },
      { path: 'health/measurements', element: <MeasurementsPage /> },
      { path: 'activity', element: <ActivityFeed /> },
      { path: 'activity/progress', element: <ProgressPage /> },
      { path: 'activity/:id', element: <ActivityDetail /> },
      { path: 'health/workouts', element: <Navigate to="/activity" replace /> },
      { path: 'health/workout/:id', element: <Redirect to={p => `/activity/${encodeURIComponent(p.id ?? '')}`} /> },
      { path: 'health/metric/:key', element: <MetricPage /> },
      { path: 'health/:cat', element: <CategoryPage /> },
      { path: 'body', element: <Navigate to="/health/body" replace /> },
      { path: 'body/weight', element: <Navigate to="/health/weight" replace /> },
      { path: 'body/measurements', element: <Navigate to="/health/measurements" replace /> },
      { path: 'move', element: <Navigate to="/health/activity" replace /> },
      { path: 'move/activity/:id', element: <Redirect to={p => `/activity/${encodeURIComponent(p.id ?? '')}`} /> },
      { path: 'metric/:key', element: <Redirect to={p => (p.key === 'sleepH' ? '/health/sleep' : `/health/metric/${p.key}`)} /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
