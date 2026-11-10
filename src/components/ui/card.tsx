import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-card bg-surface shadow-card', className)} {...props} />;
}

export function CardHeader({ title, meta, action, className, id }: { title: ReactNode; meta?: ReactNode; action?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn('flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-3.5 sm:px-5 sm:pt-4', className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-[17px] leading-tight font-semibold tracking-tight">{title}</h2>
        {meta ? <p className="text-[13px] text-muted">{meta}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-4 pt-3 pb-4 sm:px-5 sm:pb-5', className)} {...props} />;
}
