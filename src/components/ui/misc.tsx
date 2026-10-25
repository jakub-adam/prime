import { ToggleGroup } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-surface-3', className)} {...props} />;
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'track' | 'lane';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-muted',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  track: 'bg-track-soft text-track-ink',
  lane: 'bg-lane-soft text-lane-ink',
};
export function Badge({ tone = 'neutral', className, ...props }: ComponentProps<'span'> & { tone?: Tone }) {
  return <span className={cn('inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap', tones[tone], className)} {...props} />;
}

/** Segmented control (single choice). */
export function Segmented<T extends string>({ value, onChange, options, label, className, size = 'md' }: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, ReactNode])[];
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={v => { if (v) onChange(v as T); }}
      aria-label={label}
      className={cn('inline-flex max-w-full overflow-x-auto rounded-[10px] bg-surface-3 p-1 scrollbar-none', className)}
    >
      {options.map(([v, l]) => (
        <ToggleGroup.Item
          key={v}
          value={v}
          className={cn(
            'rounded-[7px] px-3 font-semibold whitespace-nowrap text-muted transition-colors hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-[0_1px_2px_rgb(0_0_0/0.12)]',
            size === 'sm' ? 'h-8 text-[13px]' : 'h-9 text-sm',
          )}
        >
          {l}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-line', className)} />;
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
