import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { importHealthStream } from './health-import';

// expected.json is the output of tools/import_health.py on export.xml (synthetic data).
const dir = fileURLToPath(new URL('../../tests/fixtures/health/', import.meta.url));
const xml = readFileSync(dir + 'export.xml', 'utf8');
const expected = JSON.parse(readFileSync(dir + 'expected.json', 'utf8')) as { days: unknown; workouts: Record<string, unknown>[] };
/* The Python tool writes the base workout fields; the app adds splits, zones and the rest on top. */
const BASE = ['type', 'start', 'durationMin', 'distanceKm', 'activeKcal', 'avgHr', 'id', 'endTime', 'durationSec', 'maxHr', 'minHr'];
const base = (ws: object[]) => ws.map(w => Object.fromEntries(Object.entries(w).filter(([k]) => BASE.includes(k))));

function streamOf(bytes: Uint8Array, chunk = 97) {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i >= bytes.length) return c.close();
      c.enqueue(bytes.subarray(i, i + chunk));
      i += chunk;
    },
  });
}

describe('Apple Health import', () => {
  it('matches tools/import_health.py on export.xml, even in tiny chunks', async () => {
    const bytes = strToU8(xml);
    const res = await importHealthStream(streamOf(bytes, 13), { size: bytes.length, zip: false });
    expect(res.days).toEqual(expected.days);
    expect(base(res.workouts)).toEqual(expected.workouts);
  });

  it('reads export.xml from inside export.zip', async () => {
    const zip = zipSync({ 'apple_health_export/export.xml': strToU8(xml), 'apple_health_export/export_cda.xml': strToU8('<x/>') });
    const progress: number[] = [];
    const res = await importHealthStream(streamOf(zip, 512), { size: zip.length, zip: true, onProgress: p => progress.push(p) });
    expect(res.days).toEqual(expected.days);
    expect(base(res.workouts)).toEqual(expected.workouts);
    expect(progress.at(-1)).toBe(1);
  });

  it('rejects a zip without export.xml', async () => {
    const zip = zipSync({ 'other.txt': strToU8('hi') });
    await expect(importHealthStream(streamOf(zip), { size: zip.length, zip: true })).rejects.toThrow(/No export.xml/);
  });
});
