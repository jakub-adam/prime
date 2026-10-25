import { ChevronDown } from 'lucide-react';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const control =
  'h-11 w-full min-w-0 rounded-[10px] border border-line-strong/70 bg-surface px-3 text-[16px] text-ink transition-[border-color,box-shadow] placeholder:text-muted/80 hover:border-line-strong focus-visible:border-lane focus-visible:ring-[3px] focus-visible:ring-lane/20 focus-visible:outline-none disabled:opacity-50 aria-[invalid=true]:border-bad';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-20 py-2.5 leading-snug', className)} {...props} />;
}

/** Native select: best on phones (system picker) and fully accessible. */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(control, 'appearance-none pr-9')} {...props}>{children}</select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function Field({ label, hint, children, className, id: idProp }: {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  id?: string;
  children: (id: string) => ReactNode;
}) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-muted">{label}</label>
      {children(id)}
      {hint ? <p className="text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-[13px] font-semibold text-muted', className)} {...props} />;
}
