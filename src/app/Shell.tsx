import { Activity, Dumbbell, HeartPulse, House, Monitor, Moon, Settings, Sun, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { Toaster } from 'sonner';
import { PageSkeleton, StatusLine } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { themes, useResolvedTheme, useSnapshot, useTheme } from './store';

/** The five sections. Settings sits apart: a gear in the header on phones, the sidebar foot on desktop. */
export const NAV: { to: string; label: string; icon: LucideIcon; key: string }[] = [
  { to: '/today', label: 'Today', icon: House, key: 't' },
  { to: '/food', label: 'Food', icon: UtensilsCrossed, key: 'f' },
  { to: '/train', label: 'Train', icon: Dumbbell, key: 'r' },
  { to: '/activity', label: 'Activity', icon: Activity, key: 'a' },
  { to: '/health', label: 'Health', icon: HeartPulse, key: 'h' },
];
const isActive = (pathname: string, to: string) => pathname === to || pathname.startsWith(to + '/') || (to === '/today' && pathname.startsWith('/day/'));

function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={className}>
      <rect width="512" height="512" rx="120" fill="var(--ink)" />
      <g fill="none" stroke="var(--bg)" strokeWidth="34" strokeLinecap="round">
        <path d="M116 400V250a140 140 0 0 1 280 0v150" opacity=".4" />
        <path d="M186 400V250a70 70 0 0 1 140 0v150" />
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
  const item = 'relative flex items-center gap-3 rounded-lg font-medium text-muted transition-colors hover:bg-surface hover:text-ink h-10 px-3 max-xl:h-auto max-xl:flex-col max-xl:gap-1 max-xl:px-1 max-xl:py-2.5 max-xl:text-[11px]';
  return (
    <aside className="hidden shrink-0 self-stretch border-r border-line md:block md:w-[84px] xl:w-[228px]">
      <div className="sticky top-0 flex h-dvh flex-col">
        <Link to="/today" className="flex h-[68px] items-center gap-2.5 px-5 max-xl:justify-center max-xl:px-0" aria-label="Prime home">
          <BrandMark className="size-7 shrink-0" />
          <span className="text-[18px] font-semibold tracking-tight max-xl:hidden">Prime</span>
        </Link>
        <nav aria-label="Sections" className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = isActive(pathname, to);
            return (
              <NavLink key={to} to={to} aria-current={active ? 'page' : undefined} className={cn(item, active && 'bg-surface-2 text-ink hover:bg-surface-2')}>
                <Icon aria-hidden className="size-[18px] shrink-0" />
                <span>{label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="flex flex-col gap-0.5 px-3 pb-3">
          <StatusLine className="px-3 py-2 max-xl:justify-center max-xl:px-0" rail />
          <div className="flex items-center gap-1 max-xl:flex-col">
            <NavLink to="/settings" aria-current={isActive(pathname, '/settings') ? 'page' : undefined} className={cn(item, 'flex-1 max-xl:w-full', isActive(pathname, '/settings') && 'bg-surface-2 text-ink hover:bg-surface-2')}>
              <Settings aria-hidden className="size-[18px] shrink-0" />
              <span>Settings</span>
            </NavLink>
            <ThemeToggle className="size-10" />
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  return (
    <div className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-xl pt-safe md:hidden">
      <div className="flex h-13 items-center justify-between gap-2 pr-1 pl-4">
        <Link to="/today" className="flex items-center gap-2" aria-label="Prime home">
          <BrandMark className="size-6" />
          <span className="text-[17px] font-semibold tracking-tight">Prime</span>
        </Link>
        <div className="flex items-center gap-0.5">
          <StatusLine compact />
          <Button asChild variant="ghost" size="icon" aria-label="Settings"><Link to="/settings"><Settings /></Link></Button>
        </div>
      </div>
    </div>
  );
}

function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-xl pb-safe md:hidden">
      <div className="mx-auto grid max-w-xl grid-cols-5 pl-safe pr-safe">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = isActive(pathname, to);
          return (
            <NavLink
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={cn('flex h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted transition-colors', active && 'text-ink')}
            >
              <Icon aria-hidden className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
              <span>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

function DemoBanner() {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink">
      <span><b className="font-semibold">Demo data.</b> Nothing you enter is saved.</span>
      <Link to="/settings" className="font-medium text-accent-ink underline underline-offset-4">Connect your data</Link>
    </div>
  );
}

/* ---------- keyboard shortcuts (desktop) ---------- */
const SHORTCUTS: [string, string][] = [
  ['g then t', 'Today'], ['g then f', 'Food'], ['g then r', 'Train'], ['g then a', 'Activity'], ['g then h', 'Health'], ['g then s', 'Settings'],
  ['n', 'Log a meal'], ['w', 'Start or resume a workout'], ['← →', 'Previous or next day (Food and day pages)'], ['?', 'Show this list'],
];

function useShortcuts(onHelp: () => void) {
  const nav = useNavigate();
  useEffect(() => {
    let g = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || !el) return;
      if (el.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return;
      const k = e.key.toLowerCase();
      if (Date.now() - g < 1200) {
        g = 0;
        const hit = NAV.find(n => n.key === k);
        if (hit) { e.preventDefault(); nav(hit.to); return; }
        if (k === 's') { e.preventDefault(); nav('/settings'); return; }
      }
      if (k === 'g') { g = Date.now(); return; }
      if (k === 'n') { e.preventDefault(); nav('/food?log=1'); }
      else if (k === 'w') { e.preventDefault(); nav('/train/log'); }
      else if (e.key === '?') { e.preventDefault(); onHelp(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav, onHelp]);
}

export function Shell() {
  const snap = useSnapshot();
  const loc = useLocation();
  const resolved = useResolvedTheme();
  const main = useRef<HTMLElement>(null);
  const [help, setHelp] = useState(false);
  const section = '/' + (loc.pathname.split('/')[1] || 'today');
  const openHelp = useRef(() => setHelp(true)).current;
  useShortcuts(openHelp);
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
            className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-4 pb-[calc(82px+env(safe-area-inset-bottom))] outline-none sm:px-6 md:pt-7 md:pb-10 lg:px-8"
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
      <Sheet open={help} onOpenChange={setHelp} title="Keyboard shortcuts">
        <dl className="divide-y divide-line">
          {SHORTCUTS.map(([k, what]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-sm">{what}</dt>
              <dd><kbd className="rounded-md border border-line-strong bg-surface-2 px-2 py-0.5 font-sans text-[13px] text-muted">{k}</kbd></dd>
            </div>
          ))}
        </dl>
      </Sheet>
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
