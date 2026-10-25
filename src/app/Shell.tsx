import { Dumbbell, Footprints, House, Monitor, Moon, Scale, Settings, Sun, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Toaster } from 'sonner';
import { PageSkeleton, SyncChip } from '@/components/common';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { themes, useResolvedTheme, useSnapshot, useTheme } from './store';

export const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/today', label: 'Today', icon: House },
  { to: '/food', label: 'Food', icon: UtensilsCrossed },
  { to: '/train', label: 'Train', icon: Dumbbell },
  { to: '/body', label: 'Body', icon: Scale },
  { to: '/move', label: 'Move', icon: Footprints },
  { to: '/settings', label: 'Settings', icon: Settings },
];
const isActive = (pathname: string, to: string) => pathname === to || pathname.startsWith(to + '/') || (to === '/move' && pathname.startsWith('/metric/'));

function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={className}>
      <rect width="512" height="512" rx="112" fill="var(--track)" />
      <g fill="none" stroke="#fff" strokeWidth="30" strokeLinecap="round">
        <path d="M96 420V236a160 160 0 0 1 320 0v184" opacity=".35" />
        <path d="M156 420V236a100 100 0 0 1 200 0v184" opacity=".6" />
        <path d="M216 420V236a40 40 0 0 1 80 0v184" />
      </g>
    </svg>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const pref = useTheme();
  const next = pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system';
  const Icon = pref === 'system' ? Monitor : pref === 'light' ? Sun : Moon;
  return (
    <Button variant="ghost" size="icon" className={className} aria-label={`Theme: ${pref}. Switch to ${next}`} title={`Theme: ${pref}`} onClick={() => themes.set(next)}>
      <Icon />
    </Button>
  );
}

function Sidebar() {
  const { pathname } = useLocation();
  return (
    <aside className="hidden shrink-0 self-stretch border-r border-line bg-surface/70 md:block md:w-[88px] xl:w-[248px]">
      <div className="sticky top-0 flex h-dvh flex-col">
      <Link to="/today" className="flex h-[72px] items-center gap-3 px-6 max-xl:justify-center max-xl:px-0" aria-label="Prime home">
        <BrandMark className="size-9 shrink-0" />
        <span className="font-display text-[26px] font-bold tracking-wide uppercase max-xl:hidden">Prime</span>
      </Link>
      <nav aria-label="Sections" className="flex flex-1 flex-col gap-1 px-3 pt-2">
        {NAV.map(({ to, label, icon: Icon }, i) => {
          const active = isActive(pathname, to);
          return (
            <NavLink
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-3 rounded-xl font-semibold text-muted transition-colors hover:bg-surface-3/70 hover:text-ink',
                'h-11 px-3.5 max-xl:h-auto max-xl:flex-col max-xl:gap-1 max-xl:px-1 max-xl:py-2.5 max-xl:text-[11px]',
                active && 'bg-track-soft text-track-ink hover:bg-track-soft hover:text-track-ink',
                i === NAV.length - 1 && 'mt-auto mb-2',
              )}
            >
              <Icon aria-hidden className="size-5 shrink-0" />
              <span>{label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3 max-xl:flex-col max-xl:px-2">
        <SyncChip rail />
        <ThemeToggle />
      </div>
      </div>
    </aside>
  );
}

function TopBar() {
  return (
    <div className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur-md pt-safe md:hidden">
      <div className="flex h-14 items-center justify-between gap-2 px-4">
        <Link to="/today" className="flex items-center gap-2.5" aria-label="Prime home">
          <BrandMark className="size-8" />
          <span className="font-display text-[22px] font-bold tracking-wide uppercase">Prime</span>
        </Link>
        <div className="flex items-center gap-1">
          <SyncChip />
          <ThemeToggle className="-mr-2" />
        </div>
      </div>
    </div>
  );
}

function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/92 backdrop-blur-md pb-safe md:hidden">
      <div className="mx-auto grid max-w-xl grid-cols-[repeat(5,1fr)_0.78fr] pl-safe pr-safe">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = isActive(pathname, to);
          return (
            <NavLink
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={cn('relative flex h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted transition-colors', active && 'text-track-ink')}
            >
              {active ? <motion.span layoutId="tab-pill" className="absolute top-0 h-[3px] w-8 rounded-b-full bg-track" transition={{ type: 'spring', stiffness: 500, damping: 40 }} /> : null}
              <Icon aria-hidden className="size-[22px]" strokeWidth={active ? 2.4 : 2} />
              <span className={cn(to === '/settings' && 'max-[380px]:sr-only')}>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

function DemoBanner() {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-warn/30 bg-warn-soft px-4 py-2.5 text-sm text-ink">
      <span><b>Demo data.</b> Nothing you enter is saved.</span>
      <Link to="/settings" className="font-semibold text-lane-ink underline underline-offset-4">Connect your data</Link>
    </div>
  );
}

export function Shell() {
  const snap = useSnapshot();
  const loc = useLocation();
  const resolved = useResolvedTheme();
  const main = useRef<HTMLElement>(null);
  const section = '/' + (loc.pathname.split('/')[1] || 'today');
  // Move focus to the page on navigation so keyboard and screen-reader users start at the new content.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    main.current?.focus({ preventScroll: true });
  }, [loc.pathname]);

  return (
    <MotionConfig reducedMotion="user">
      <a href="#main" onClick={e => { e.preventDefault(); main.current?.focus(); }} className="sr-only z-50 rounded-lg bg-surface px-4 py-2 font-semibold shadow-pop focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main
            id="main"
            ref={main}
            tabIndex={-1}
            className="mx-auto w-full max-w-[1680px] flex-1 px-4 pt-4 pb-[calc(84px+env(safe-area-inset-bottom))] outline-none sm:px-6 md:pt-6 md:pb-10 lg:px-8 xl:px-10"
          >
            {snap.mode === 'sample' && section !== '/settings' ? <DemoBanner /> : null}
            {snap.loading ? <PageSkeleton /> : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={section}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            )}
          </main>
        </div>
      </div>
      <TabBar />
      <ScrollRestoration />
      <Toaster
        theme={resolved}
        position="top-center"
        richColors
        closeButton
        offset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
        toastOptions={{ className: 'font-sans' }}
      />
    </MotionConfig>
  );
}
