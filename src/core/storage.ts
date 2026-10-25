/* localStorage keys. The first three are shared with Prime v1 and must keep their names and
   shapes so a saved token and any unsaved edits survive the upgrade. */
import type { DataFiles, Pending, Shas } from './types';

export const KEYS = {
  gh: 'prime.gh',
  cache: 'prime.cache',
  draft: 'prime.draft',
  theme: 'prime.theme',
} as const;

export type GhConfig = { owner?: string; repo?: string; token?: string };
export type Cache = { data: Partial<DataFiles>; sha: Shas; pending: Pending; at: number };

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memory = new Map<string, string>();
const memoryKV: KV = {
  getItem: k => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: k => void memory.delete(k),
};

export function browserKV(): KV {
  try {
    const ls = globalThis.localStorage;
    if (ls) return ls;
  } catch { /* blocked storage */ }
  return memoryKV;
}

/** Reads (val omitted) or writes a JSON value. Never throws, like v1's store(). */
export function readJSON<T>(kv: KV, key: string): T | null {
  try { return JSON.parse(kv.getItem(key) || 'null') as T | null; } catch { return null; }
}
export function writeJSON(kv: KV, key: string, val: unknown) {
  try { kv.setItem(key, JSON.stringify(val)); } catch { /* quota or blocked */ }
}
export function remove(kv: KV, key: string) {
  try { kv.removeItem(key); } catch { /* ignore */ }
}
