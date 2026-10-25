import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-[background-color,color,box-shadow,transform] duration-150 select-none disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] [&_svg]:size-[18px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-track text-on-accent shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_1px_2px_rgb(0_0_0/0.15)] hover:brightness-[1.06]',
        lane: 'bg-lane text-on-accent shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_1px_2px_rgb(0_0_0/0.15)] hover:brightness-[1.06]',
        secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
        ghost: 'text-ink hover:bg-surface-3/70',
        subtle: 'bg-surface-3/70 text-ink hover:bg-surface-3',
        danger: 'bg-bad text-on-accent hover:brightness-[1.06]',
        'danger-ghost': 'text-bad hover:bg-bad-soft',
        link: 'h-auto px-0 text-lane-ink underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-[15px]',
        lg: 'h-12 px-5 text-base',
        icon: 'size-11',
        'icon-sm': 'size-9',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...(asChild ? {} : { type: type ?? 'button' })} {...props} />;
}
