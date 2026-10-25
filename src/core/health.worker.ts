/// <reference lib="webworker" />
import { importHealthStream, isZipFile } from './health-import';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (e: MessageEvent<File>) => {
  const file = e.data;
  try {
    let last = 0;
    const res = await importHealthStream(file.stream(), {
      size: file.size,
      zip: isZipFile(file),
      onProgress: p => { if (p - last > 0.01 || p === 1) { last = p; self.postMessage({ type: 'progress', p }); } },
    });
    self.postMessage({ type: 'done', res });
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error)?.message || String(err) });
  }
};
