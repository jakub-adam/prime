import { ArrowLeft, ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { engine, useSnapshot, useToday } from '@/app/store';
import { fmtClock, fmtShort } from '@/core/dates';
import { cn, fmt } from '@/lib/utils';
import { Button } from './ui/button';
import { Skeleton } from './ui/misc';

/* ---------- page header ---------- */
export function PageHeader({ title, kicker, back, actions, className }: {
  title: ReactNode;
  kicker?: ReactNode;
  /** Fallback route for the back button when there is no in-app history (deep link). */
  back?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const nav = useNavigate();
  const loc = useLocation();
  return (
    <header className={cn('mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 lg:mb-6', className)}>
      <div className="flex min-w-0 items-center gap-2">
        {back ? (
          <Button variant="ghost" size="icon" aria-label="Back" className="-ml-2.5 shrink-0" onClick={() => (loc.key !== 'default' ? nav(-1) : nav(back))}>
            <ArrowLeft className="size-[22px]!" />
          </Button>
        ) : null}
        <div className="min-w-0">
          {kicker ? <div className="text-[13px] font-semibold text-muted">{kicker}</div> : null}
          <h1 className="truncate text-[34px] leading-[1.1] font-bold tracking-tight lg:text-[40px]">{title}</h1>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/* ---------- online status ---------- */
function subOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
}
export function useOnline() {
  return useSyncExternalStore(subOnline, () => navigator.onLine, () => true);
}

/* ---------- status line: saved state and data freshness in one quiet place ---------- */
export function StatusLine({ className, rail, compact }: { className?: string; rail?: boolean; compact?: boolean }) {
  const s = useSnapshot();
  const online = useOnline();
  const today = useToday();
  const pending = engine.pendingCount();
  let label: string, dot: string, ok = false;
  if (s.mode === 'sample') { label = 'Demo data'; dot = 'bg-muted'; }
  else if (!online || s.sync.kind === 'offline') { label = 'Offline'; dot = 'bg-warn'; }
  else if (s.sync.kind === 'loading') { label = 'Loading'; dot = 'bg-muted animate-pulse'; }
  else if (s.sync.kind === 'saving') { label = 'Saving'; dot = 'bg-accent animate-pulse'; }
  else if (s.sync.kind === 'conflict') { label = 'Conflict'; dot = 'bg-bad'; }
  else if (s.sync.kind === 'error') { label = 'Sync error'; dot = 'bg-bad'; }
  else { const at = s.syncedAt ?? s.cachedAt; label = at ? `Synced ${fmtClock(at)}` : 'Synced'; dot = 'bg-good'; ok = true; }
  if (pending && s.mode === 'github' && s.sync.kind !== 'saving') label += ` · ${pending} unsaved`;
  // Apple Health freshness: the Shortcut's export today, else the day of the last export or import.
  const liveAt = s.live?.at ? Date.parse(s.live.at) : NaN;
  const health = s.mode !== 'github' ? null
    : s.live && Number.isFinite(liveAt) ? (s.live.date === today ? fmtClock(liveAt) : fmtShort(s.live.date))
    : s.data.health.importedAt ? fmtShort(s.data.health.importedAt.slice(0, 10)) : null;
  const detail = s.mode === 'sample' ? 'Demo data. Nothing is saved.' : `${s.sync.msg || label}${health ? `. Apple Health data from ${health}` : ''}`;
  return (
    <Link
      to="/settings"
      title={detail}
      aria-label={`Sync status: ${label}. ${detail}`}
      className={cn('flex items-center gap-2 rounded-lg text-[12px] leading-tight text-muted transition-colors hover:text-ink', compact && 'h-11 px-2', className)}
    >
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', dot)} />
      <span role="status" aria-live="polite" className={cn('flex flex-col', rail && 'max-xl:sr-only')}>
        {compact ? <span>{ok && health ? `Health ${health}` : label}</span> : <><span className="text-ink/90">{label}</span>{health ? <span>Apple Health {health}</span> : null}</>}
      </span>
    </Link>
  );
}
/** @deprecated use StatusLine */
export const SyncChip = StatusLine;

/* ---------- stat tile ---------- */
export function StatTile({ to, label, value, unit, sub, chart, tone, className }: {
  to: string;
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  chart?: ReactNode;
  tone?: 'good' | 'bad' | null;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group relative flex min-h-[124px] flex-col rounded-card bg-surface p-4 shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-muted">{label}</span>
        <ChevronRight aria-hidden className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="num text-[34px] leading-none font-semibold">{value}</span>
        {unit ? <span className="text-sm font-medium text-muted">{unit}</span> : null}
      </div>
      {sub ? <div className={cn('mt-1 text-[13px] text-muted', tone === 'good' && 'text-good', tone === 'bad' && 'text-bad')}>{sub}</div> : null}
      {chart ? <div className="mt-auto pt-2">{chart}</div> : null}
    </Link>
  );
}

/* ---------- meter (kcal / protein vs target) ---------- */
export function Meter({ label, value, target, unit, color, to }: { label: string; value: number; target: number; unit: string; color: 'track' | 'lane'; to?: string }) {
  const reduced = useReducedMotion();
  const pct = target ? value / target : 0;
  const left = target - value;
  const inner = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-sm text-muted">
          <span className="num text-[26px] leading-none font-semibold text-ink">{fmt(value)}</span> / {fmt(target)} {unit}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.round(value)}
        aria-valuetext={`${fmt(value)} of ${fmt(target)} ${unit}`}
        className="lane-track relative mt-2 h-3 overflow-hidden rounded-full"
      >
        <motion.div
          className={cn('absolute inset-y-0 left-0 rounded-full', color === 'track' ? 'bg-track' : 'bg-lane')}
          initial={reduced ? false : { width: 0 }}
          animate={{ width: `${Math.min(100, pct * 100)}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
        {pct > 1 ? <div className="absolute inset-y-0 right-0 bg-[repeating-linear-gradient(135deg,transparent_0_4px,rgb(0_0_0/0.28)_4px_7px)]" style={{ width: `${Math.min(100, ((pct - 1) / pct) * 100)}%` }} /> : null}
      </div>
      <div className={cn('mt-1.5 text-[13px]', left >= 0 ? 'text-muted' : 'font-semibold text-track-ink')}>
        {left >= 0 ? `${fmt(left)} ${unit} left` : `${fmt(-left)} ${unit} over`}
      </div>
    </>
  );
  return to ? <Link to={to} className="-mx-2 block rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-2">{inner}</Link> : <div className="py-1.5">{inner}</div>;
}

/* ---------- empty state ---------- */
export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong/70 px-5 py-8 text-center', className)}>
      {icon ? <div aria-hidden className="mb-1 grid size-11 place-items-center rounded-full bg-surface-3 text-muted [&_svg]:size-5">{icon}</div> : null}
      <p className="font-semibold">{title}</p>
      {children ? <p className="max-w-sm text-sm text-muted">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ---------- list rows ---------- */
export function RowLink({ to, children, className, active }: { to: string; children: ReactNode; className?: string; active?: boolean }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2 aria-[current=page]:bg-lane-soft/70',
        className,
      )}
    >
      {children}
      <ChevronRight aria-hidden className="ml-auto size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function KV({ k, v, sub }: { k: string; v: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-3.5 py-3">
      <div className="text-[12px] font-semibold text-muted">{k}</div>
      <div className="num mt-0.5 truncate text-[26px] leading-tight font-semibold">{v}</div>
      {sub ? <div className="line-clamp-2 text-[13px] leading-snug text-muted">{sub}</div> : null}
    </div>
  );
}

/* ---------- loading ---------- */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your data" className="space-y-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-56" />
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-64 rounded-card lg:col-span-5" />
        <Skeleton className="h-64 rounded-card lg:col-span-7" />
        <Skeleton className="h-40 rounded-card lg:col-span-4" />
        <Skeleton className="h-40 rounded-card lg:col-span-4" />
        <Skeleton className="h-40 rounded-card lg:col-span-4" />
      </div>
    </div>
  );
}
