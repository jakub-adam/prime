/* Forms open as a bottom sheet on phones and as a centred dialog on larger screens. */
import { AlertDialog, Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { Drawer } from 'vaul';
import { useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

const phoneQuery = '(max-width: 767.98px)';
function subscribe(cb: () => void) {
  const m = window.matchMedia(phoneQuery);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}
export function useIsPhone() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(phoneQuery).matches, () => false);
}
const desktopQuery = '(min-width: 1024px)';
function subscribeDesktop(cb: () => void) {
  const m = window.matchMedia(desktopQuery);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}
export function useIsDesktop() {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(desktopQuery).matches, () => true);
}

export function Sheet({ open, onOpenChange, title, description, children, footer, wide }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const phone = useIsPhone();
  if (phone) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[20px] border-t border-line bg-surface shadow-pop outline-none">
            <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-11 shrink-0 rounded-full bg-line-strong" />
            <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
              <div>
                <Drawer.Title className="font-display text-[22px] leading-tight font-semibold uppercase">{title}</Drawer.Title>
                {description ? <Drawer.Description className="text-sm text-muted">{description}</Drawer.Description> : <Drawer.Description className="sr-only">{title}</Drawer.Description>}
              </div>
              <Drawer.Close asChild><Button variant="ghost" size="icon" aria-label="Close"><X /></Button></Drawer.Close>
            </div>
            <div className="overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
            {footer ? <div className="flex gap-2 border-t border-line px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div> : <div className="pb-safe" />}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[88dvh] w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[18px] border border-line bg-surface shadow-pop outline-none data-[state=open]:animate-[pop-in_180ms_var(--ease-out-soft)]',
            wide ? 'max-w-2xl' : 'max-w-lg',
          )}
        >
          <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-2">
            <div>
              <Dialog.Title className="font-display text-[24px] leading-tight font-semibold uppercase">{title}</Dialog.Title>
              {description ? <Dialog.Description className="text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close asChild><Button variant="ghost" size="icon-sm" aria-label="Close"><X /></Button></Dialog.Close>
          </div>
          <div className="overflow-y-auto px-6 pb-5">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Confirm({ open, onOpenChange, title, description, confirmLabel = 'Delete', onConfirm, destructive = true }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-line bg-surface p-5 shadow-pop data-[state=open]:animate-[pop-in_160ms_var(--ease-out-soft)]">
          <AlertDialog.Title className="font-display text-[22px] leading-tight font-semibold uppercase">{title}</AlertDialog.Title>
          <AlertDialog.Description className={cn('mt-1 text-sm text-muted', !description && 'sr-only')}>{description || title}</AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild><Button variant="secondary">Cancel</Button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
