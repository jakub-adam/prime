import { Download, ExternalLink, FileJson, FileSpreadsheet, FolderGit2, KeyRound, Link2Off, Loader2, Monitor, Moon, PlugZap, RefreshCw, Sun, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { engine, themes, useData, useGoals, useSnapshot, useTheme } from '@/app/store';
import { fmtDur, num, parseDur } from '@/core/calc';
import { CSV_DATASETS } from '@/core/csv';
import { fmtShort, todayStr } from '@/core/dates';
import type { Op } from '@/core/types';
import { PageHeader } from '@/components/common';
import { HealthImporter } from '@/features/health/HealthImporter';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { Badge, Segmented } from '@/components/ui/misc';
import { Confirm } from '@/components/ui/sheet';
import { download, fmt } from '@/lib/utils';

const SECTIONS = [
  ['connection', 'GitHub connection'],
  ['goals', 'Targets and goals'],
  ['appearance', 'Appearance'],
  ['activity', 'Activity'],
  ['health', 'Apple Health'],
  ['data', 'Your data'],
  ['about', 'About'],
] as const;

function Section({ id, title, meta, action, children }: { id: string; title: string; meta?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6">
      <CardHeader id={`${id}-h`} title={title} meta={meta} action={action} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function ConnectionSection() {
  const snap = useSnapshot();
  const cfg = engine.gh();
  const connected = engine.connected();
  const [owner, setOwner] = useState(cfg.owner || 'jakub-adam');
  const [repo, setRepo] = useState(cfg.repo || 'health-data');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'' | 'connect' | 'test'>('');
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'warn'; text: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const status = !connected ? { tone: 'neutral' as const, label: 'Not connected' }
    : snap.sync.kind === 'error' ? { tone: 'bad' as const, label: 'Error' }
    : snap.sync.kind === 'offline' ? { tone: 'warn' as const, label: 'Offline' }
    : { tone: 'good' as const, label: 'Connected' };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = token.trim() || (connected && owner === cfg.owner && repo === cfg.repo ? cfg.token! : '');
    if (!owner.trim() || !repo.trim() || !t) { setMsg({ tone: 'bad', text: 'Fill in the user, repo and token.' }); return; }
    setBusy('connect'); setMsg(null);
    const res = await engine.connect({ owner: owner.trim(), repo: repo.trim(), token: t });
    setBusy('');
    if (!res.ok) setMsg({ tone: 'bad', text: res.msg });
    else {
      setToken('');
      setMsg(res.warn ? { tone: 'warn', text: `Connected. ${res.warn}` } : { tone: 'good', text: 'Connected.' });
      toast.success('Connected');
    }
  };
  const test = async () => {
    setBusy('test'); setMsg(null);
    const res = await engine.testConnection();
    setBusy('');
    setMsg(res.ok ? { tone: res.warn ? 'warn' : 'good', text: res.warn ? `Works. ${res.warn}` : 'Connection works: the token can read and write the repo.' } : { tone: 'bad', text: res.msg });
  };

  return (
    <Section id="connection" title="GitHub connection" meta="Your data lives in a private GitHub repo. The token stays in this browser."
      action={<Badge tone={status.tone}>{status.label}</Badge>}>
      {connected ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <span className="flex items-center gap-2"><FolderGit2 aria-hidden className="size-4" /> <a className="font-semibold text-lane-ink hover:underline" href={`https://github.com/${cfg.owner}/${cfg.repo}`} target="_blank" rel="noopener noreferrer">{cfg.owner}/{cfg.repo}<ExternalLink aria-hidden className="ml-1 inline size-3.5" /></a></span>
          <span className="flex items-center gap-2"><KeyRound aria-hidden className="size-4" /> Token saved on this device</span>
          {snap.sync.msg && snap.sync.kind !== 'synced' ? <span className="text-muted">{snap.sync.msg}</span> : null}
        </div>
      ) : null}
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="GitHub user">{id => <Input id={id} value={owner} onChange={e => setOwner(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />}</Field>
        <Field label="Data repo">{id => <Input id={id} value={repo} onChange={e => setRepo(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />}</Field>
        <Field label="Access token" className="sm:col-span-2" hint={connected ? 'Leave empty to keep the saved token.' : undefined}>
          {id => <Input id={id} type="password" value={token} onChange={e => setToken(e.target.value)} placeholder={connected ? '••••••••••••' : 'github_pat_…'} autoComplete="off" spellCheck={false} />}
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={!!busy}>{busy === 'connect' ? <Loader2 className="animate-spin" /> : <PlugZap />} {connected ? 'Save and reconnect' : 'Connect'}</Button>
          {connected ? <Button variant="secondary" onClick={test} disabled={!!busy}>{busy === 'test' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Test connection</Button> : null}
          {connected ? <Button variant="danger-ghost" onClick={() => setDisconnecting(true)}><Link2Off /> Disconnect</Button> : null}
        </div>
        {msg ? <p role="status" className={msg.tone === 'good' ? 'text-sm text-good sm:col-span-2' : msg.tone === 'warn' ? 'text-sm text-warn sm:col-span-2' : 'text-sm text-bad sm:col-span-2'}>{msg.text}</p> : null}
      </form>
      <details className="mt-4 rounded-xl border border-line px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold">How to make the token</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Open <a className="text-lane-ink underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">github.com/settings/personal-access-tokens/new</a>.</li>
          <li>Name it “Prime”, expiration 1 year.</li>
          <li>Repository access: Only select repositories → health-data.</li>
          <li>Permissions → Repository → Contents: Read and write. Nothing else.</li>
          <li>Generate, copy, paste above. Do this once on your phone and once on your PC.</li>
        </ol>
      </details>
      <Confirm open={disconnecting} onOpenChange={setDisconnecting} title="Disconnect this device?"
        description={engine.pendingCount() ? `${engine.pendingCount()} unsaved changes on this device will be lost.` : 'The token and the local copy of your data are removed from this browser. Your GitHub repo is not touched.'}
        confirmLabel="Disconnect" onConfirm={() => { engine.disconnect(); toast('Disconnected from this device'); }} />
    </Section>
  );
}

function GoalsSection() {
  const data = useData();
  const g = useGoals();
  const [f, setF] = useState({ kcal: '', protein: '', goalWeight: '', tenK: '', steps: '', sleep: '' });
  useEffect(() => {
    setF({ kcal: String(g.kcal), protein: String(g.protein), goalWeight: String(g.goalWeight), tenK: fmtDur(g.tenKGoalMin * 60), steps: String(g.stepsGoal), sleep: String(g.sleepGoalH) });
  }, [g]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const tenKSec = parseDur(f.tenK);
    const next = {
      targets: { ...data.settings.targets, kcal: num(f.kcal) || 2350, protein: num(f.protein) || 160 },
      goalWeight: num(f.goalWeight) || 79,
      tenKGoalMin: tenKSec ? Math.round((tenKSec / 60) * 100) / 100 : 45,
      stepsGoal: Math.round(num(f.steps) || 8000),
      sleepGoalH: num(f.sleep) || 7,
    };
    // Only changed keys are written, so other keys in settings.json (like the old schedule) stay as they are.
    const ops: Op[] = Object.entries(next)
      .filter(([k, v]) => JSON.stringify(data.settings[k]) !== JSON.stringify(v))
      .map(([k, v]) => ({ t: 'set', k, v }));
    if (!ops.length) { toast('Nothing changed'); return; }
    engine.commit('settings', ops, 'Settings saved');
  };
  return (
    <Section id="goals" title="Targets and goals" meta="Saved to settings.json in your data repo.">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Field label="Calories (kcal/day)">{id => <Input id={id} type="number" inputMode="numeric" min={1200} step={10} value={f.kcal} onChange={set('kcal')} />}</Field>
        <Field label="Protein (g/day)">{id => <Input id={id} type="number" inputMode="numeric" min={0} step={5} value={f.protein} onChange={set('protein')} />}</Field>
        <Field label="Goal weight (kg)">{id => <Input id={id} type="number" inputMode="decimal" step={0.5} value={f.goalWeight} onChange={set('goalWeight')} />}</Field>
        <Field label="10 km goal (mm:ss)">{id => <Input id={id} inputMode="numeric" pattern="[0-9:]*" value={f.tenK} onChange={set('tenK')} />}</Field>
        <Field label="Steps goal (per day)">{id => <Input id={id} type="number" inputMode="numeric" step={500} min={0} value={f.steps} onChange={set('steps')} />}</Field>
        <Field label="Sleep goal (hours)">{id => <Input id={id} type="number" inputMode="decimal" step={0.25} min={0} max={14} value={f.sleep} onChange={set('sleep')} />}</Field>
        <div className="col-span-2 md:col-span-3"><Button type="submit" variant="primary">Save targets</Button></div>
      </form>
    </Section>
  );
}

function AppearanceSection() {
  const pref = useTheme();
  return (
    <Section id="appearance" title="Appearance">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">Theme</span>
        <Segmented label="Theme" value={pref} onChange={themes.set} options={[
          ['system', <span key="s" className="flex items-center gap-1.5"><Monitor aria-hidden className="size-4" />System</span>],
          ['light', <span key="l" className="flex items-center gap-1.5"><Sun aria-hidden className="size-4" />Light</span>],
          ['dark', <span key="d" className="flex items-center gap-1.5"><Moon aria-hidden className="size-4" />Dark</span>],
        ]} />
      </div>
    </Section>
  );
}

function ActivitySection() {
  const data = useData();
  const g = useGoals();
  const [f, setF] = useState({ maxHr: '', easy: '', privacy: '' });
  useEffect(() => { setF({ maxHr: String(g.maxHr), easy: fmtDur(g.easyPaceSec), privacy: String(g.routePrivacyM) }); }, [g]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }));
  const save = (next: Record<string, unknown>) => {
    const ops: Op[] = Object.entries(next).filter(([k, v]) => JSON.stringify(data.settings[k]) !== JSON.stringify(v)).map(([k, v]) => ({ t: 'set', k, v }));
    if (!ops.length) { toast('Nothing changed'); return; }
    engine.commit('settings', ops, 'Settings saved');
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const easy = parseDur(f.easy);
    save({
      maxHr: Math.round(num(f.maxHr) || 202),
      easyPaceSec: easy && easy > 120 && easy < 1200 ? easy : 390,
      routePrivacyM: Math.max(0, Math.min(2000, Math.round(num(f.privacy) ?? 200))),
    });
  };
  return (
    <Section id="activity" title="Activity" meta="Heart-rate zones, the easy-pace trend and route privacy.">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Field label="Max heart rate (bpm)" hint="Zones are % of this.">{id => <Input id={id} type="number" inputMode="numeric" min={140} max={230} value={f.maxHr} onChange={set('maxHr')} />}</Field>
        <Field label="Easy pace (mm:ss /km)" hint="For HR at easy pace.">{id => <Input id={id} inputMode="numeric" pattern="[0-9:]*" value={f.easy} onChange={set('easy')} />}</Field>
        <Field label="Hide route ends (m)" hint="Start and finish are cut off the map. 0 = show all.">{id => <Input id={id} type="number" inputMode="numeric" min={0} max={2000} step={50} value={f.privacy} onChange={set('privacy')} />}</Field>
        <div className="col-span-2 md:col-span-3"><Button type="submit" variant="primary">Save</Button></div>
      </form>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Store GPS routes on import</div>
          <p className="text-[13px] text-muted">Routes go to workouts/&lt;id&gt;.json in your private data repo only. Zones use the max HR at import time.</p>
        </div>
        <Segmented label="Store GPS routes on import" value={g.importRoutes ? 'on' : 'off'} onChange={v => save({ importRoutes: v === 'on' })} options={[['on', 'On'], ['off', 'Off']]} />
      </div>
    </Section>
  );
}

function HealthSection() {
  const data = useData();
  return (
    <Section id="health" title="Apple Health import" meta={data.health.importedAt ? `Last import ${fmtShort(data.health.importedAt.slice(0, 10))} · ${Object.keys(data.health.days).length} days` : 'Not imported yet'}>
      <HealthImporter />
    </Section>
  );
}

function DataSection() {
  const snap = useSnapshot();
  const data = snap.data;
  const pending = engine.pendingCount();
  const cfg = engine.gh();
  return (
    <Section id="data" title="Your data" meta="Your data repo keeps full history. Exports are extra copies.">
      <dl className="grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
        {[
          ['Mode', snap.mode === 'github' ? 'GitHub repo' : 'Demo data (nothing saved)'],
          ['Repo', snap.mode === 'github' ? `${cfg.owner}/${cfg.repo}` : '–'],
          ['Last synced', snap.cachedAt ? new Date(snap.cachedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '–'],
          ['Unsaved changes', String(pending)],
          ['Meals', fmt(data.food.meals.length)],
          ['Sessions', fmt(data.training.sessions.length)],
          ['Weigh-ins', fmt(data.body.weighins.length)],
          ['Activities', fmt(data.activities.activities.length)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-line/70 py-2"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>
        ))}
      </dl>
      {pending && snap.mode === 'github' ? <Button className="mt-3" variant="secondary" size="sm" onClick={() => engine.retryPending()}><RefreshCw /> Retry saving now</Button> : null}
      <div className="mt-5">
        <div className="mb-2 text-[13px] font-semibold text-muted">Backup</div>
        <Button variant="secondary" onClick={() => download(`prime-backup-${todayStr()}.json`, JSON.stringify(data, null, 1), 'application/json')}><FileJson /> Download JSON backup</Button>
      </div>
      <div className="mt-5">
        <div className="mb-2 text-[13px] font-semibold text-muted">CSV export</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
          {CSV_DATASETS.map(ds => (
            <Button key={ds.key} variant="secondary" className="justify-start" onClick={() => download(`prime-${ds.key}-${todayStr()}.csv`, ds.build(data), 'text/csv')}>
              <FileSpreadsheet /> <span className="truncate">{ds.label}</span> <span className="ml-auto text-xs font-medium text-muted">{fmt(ds.count(data))}</span>
            </Button>
          ))}
        </div>
      </div>
    </Section>
  );
}

function AboutSection() {
  const [clearing, setClearing] = useState(false);
  const pending = engine.pendingCount();
  return (
    <Section id="about" title="About">
      <dl className="text-sm">
        <div className="flex justify-between gap-4 border-b border-line/70 py-2"><dt className="text-muted">Version</dt><dd className="font-semibold">{__APP_VERSION__} <span className="font-normal text-muted">({__APP_COMMIT__})</span></dd></div>
        <div className="flex justify-between gap-4 border-b border-line/70 py-2"><dt className="text-muted">Source</dt><dd><a className="font-semibold text-lane-ink hover:underline" href="https://github.com/jakub-adam/prime" target="_blank" rel="noopener noreferrer">github.com/jakub-adam/prime</a></dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="danger-ghost" onClick={() => setClearing(true)} disabled={!engine.connected()}><Trash2 /> Clear local cache</Button>
        <span className="text-[13px] text-muted">Re-downloads everything from GitHub. Keeps your token.</span>
      </div>
      <Confirm open={clearing} onOpenChange={setClearing} title="Clear the local cache?"
        description={pending ? `${pending} unsaved change${pending === 1 ? '' : 's'} on this device will be lost.` : 'Your data is downloaded again from GitHub.'}
        confirmLabel="Clear cache" onConfirm={() => { engine.clearCache(); toast('Local cache cleared'); }} />
    </Section>
  );
}

export function SettingsPage() {
  return (
    <div>
      <PageHeader kicker="Settings" title="Settings" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden xl:block">
          <ul className="sticky top-6 flex flex-col gap-0.5">
            {SECTIONS.map(([id, label]) => (
              <li key={id}><a href={`#/settings`} onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="block rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-3/70 hover:text-ink">{label}</a></li>
            ))}
          </ul>
        </nav>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-5">
          <div className="space-y-4 lg:space-y-5"><ConnectionSection /><GoalsSection /><AppearanceSection /></div>
          <div className="space-y-4 lg:space-y-5"><ActivitySection /><HealthSection /><DataSection /><AboutSection /></div>
        </div>
      </div>
      <p className="mt-6 flex items-center gap-1.5 text-[13px] text-muted"><Download aria-hidden className="size-3.5" /> Install: in Safari, Share → Add to Home Screen.</p>
    </div>
  );
}
