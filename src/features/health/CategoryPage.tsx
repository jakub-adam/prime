import { useParams } from 'react-router';
import { useHealthDays } from '@/app/store';
import { NotFound } from '@/app/NotFound';
import { CATEGORY, METRICS, type CategoryKey } from '@/core/calc';
import { PageHeader, RowLink } from '@/components/common';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { CategoryIcon, HealthCard, metricHref, WeightCard } from './health-ui';
import { MeasurementsCard, RingsCard, WorkoutsCard } from './HealthSummary';
import { SleepPage } from './SleepPage';

export function CategoryPage() {
  const { cat } = useParams();
  const days = useHealthDays();
  if (!cat || !(cat in CATEGORY)) return <NotFound />;
  const c = CATEGORY[cat as CategoryKey];
  if (c.key === 'sleep') return <SleepPage />;
  const has = c.metrics.filter(k => Object.values(days).some(d => d[k] != null));
  const missing = c.metrics.filter(k => !has.includes(k));
  return (
    <div>
      <PageHeader back="/health" kicker="Health" title={<span className="flex items-center gap-3"><CategoryIcon cat={c.key} size="lg" />{c.label}</span>} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        {c.key === 'activity' ? (
          <>
            <RingsCard className="lg:col-span-5" />
            <WorkoutsCard className="lg:col-span-7" limit={3} />
          </>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-12 xl:grid-cols-3">
          {c.key === 'body' ? <><WeightCard /><MeasurementsCard /></> : null}
          {has.map(k => <HealthCard key={k} k={k} />)}
        </div>
        {missing.length ? (
          <Card className="lg:col-span-12">
            <CardHeader title="No data yet" meta="These appear after an Apple Health import that includes them." />
            <CardBody className="pt-1">
              <ul className="-mx-2 grid grid-cols-1 md:grid-cols-2">
                {missing.map(k => (
                  <li key={k}>
                    <RowLink to={metricHref(k)}>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-muted">{METRICS[k].label}</div>
                        <div className="line-clamp-1 text-[13px] text-muted">{METRICS[k].blurb}</div>
                      </div>
                    </RowLink>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
