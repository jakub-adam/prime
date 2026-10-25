import { HeartPulse, Loader2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { engine, useData } from '@/app/store';
import { fmtShort } from '@/core/dates';
import type { HealthImport } from '@/core/health-import';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';

type Msg = { type: 'progress'; p: number } | { type: 'done'; res: HealthImport } | { type: 'error'; message: string };

/** Choose export.zip / export.xml, parse it in a worker, merge the daily totals into health.json. */
export function HealthImporter({ onDone }: { onDone?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const run = () => {
    if (!file) { toast.error('Choose your export.zip first.'); return; }
    setProgress(0); setStatus('Reading…');
    const w = new Worker(new URL('../../core/health.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (m.type === 'progress') { setProgress(m.p); setStatus(`Reading… ${Math.round(m.p * 100)}%`); return; }
      w.terminate();
      setProgress(null);
      if (m.type === 'error') { setStatus(`Import failed: ${m.message}`); toast.error(`Import failed: ${m.message}`); return; }
      setStatus(`Imported ${Object.keys(m.res.days).length} days and ${m.res.workouts.length} workouts.`);
      engine.commit('health', [{ t: 'health', days: m.res.days, workouts: m.res.workouts, at: new Date().toISOString() }], 'Apple Health imported');
      onDone?.();
    };
    w.onerror = ev => { w.terminate(); setProgress(null); setStatus(`Import failed: ${ev.message}`); };
    w.postMessage(file);
  };
  return (
    <div>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>iPhone: Health app → your profile picture → Export All Health Data.</li>
        <li>Save export.zip to Files or send it to your PC.</li>
        <li>Choose it below and press Import. It stays on your device; only daily totals, sleep stages and workouts are saved.</li>
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3 text-sm hover:bg-surface-2 focus-within:ring-[3px] focus-within:ring-lane/25">
          <HeartPulse aria-hidden className="size-4 shrink-0 text-track" />
          <span className="truncate">{file ? file.name : 'Choose export.zip or export.xml'}</span>
          <input type="file" accept=".zip,.xml,application/zip,text/xml" className="sr-only" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <Button variant="lane" onClick={run} disabled={progress != null}>{progress != null ? <Loader2 className="animate-spin" /> : <Upload />} Import</Button>
      </div>
      {progress != null ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Import progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full bg-lane transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
      ) : null}
      <p className="mt-2 text-sm text-muted" aria-live="polite">{status}</p>
    </div>
  );
}

export function ImportButton() {
  const [open, setOpen] = useState(false);
  const data = useData();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Upload /> Import</Button>
      <Sheet open={open} onOpenChange={setOpen} title="Import Apple Health"
        description={data.health.importedAt ? `Last import ${fmtShort(data.health.importedAt.slice(0, 10))}` : 'Not imported yet'}>
        <HealthImporter />
      </Sheet>
    </>
  );
}
