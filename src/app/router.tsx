import { createHashRouter, Navigate, useRouteError } from 'react-router';
import { NotFound } from './NotFound';
import { Button } from '@/components/ui/button';
import { BodyOverview } from '@/features/body/BodyOverview';
import { MeasurementsPage } from '@/features/body/MeasurementsPage';
import { WeightPage } from '@/features/body/WeightPage';
import { FoodRoute } from '@/features/food/FoodRoute';
import { MetricPage } from '@/features/metrics/MetricPage';
import { ActivityPage } from '@/features/move/ActivityPage';
import { MoveOverview } from '@/features/move/MoveOverview';
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
      { path: 'train/exercise/:name', element: <TrainRoute /> },
      { path: 'train/session/:id', element: <TrainRoute /> },
      { path: 'body', element: <BodyOverview /> },
      { path: 'body/weight', element: <WeightPage /> },
      { path: 'body/measurements', element: <MeasurementsPage /> },
      { path: 'move', element: <MoveOverview /> },
      { path: 'move/activity/:id', element: <ActivityPage /> },
      { path: 'metric/:key', element: <MetricPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

