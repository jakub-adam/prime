/* Minimal GitHub contents API client for the data repo. */
import { clone, defaults } from './ops';
import type { DataFiles, FileName } from './types';
import type { GhConfig } from './storage';

export class GhError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

export function b64encode(str: string) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function b64decode(b64: string) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type RepoInfo = { private?: boolean; permissions?: { push?: boolean }; full_name?: string; html_url?: string };

export class GitHubClient {
  constructor(private cfg: GhConfig, private fetchImpl: FetchLike = (u, i) => fetch(u, i)) {}

  async api<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const { owner, repo, token } = this.cfg;
    const r = await this.fetchImpl(`https://api.github.com/repos/${owner}/${repo}${path}`, {
      ...opts,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...((opts.headers as Record<string, string>) || {}),
      },
    });
    if (!r.ok) {
      let msg = r.statusText;
      try { msg = ((await r.json()) as { message?: string }).message || msg; } catch { /* keep statusText */ }
      throw new GhError(r.status, msg);
    }
    return (r.status === 204 ? null : await r.json()) as T;
  }

  repoInfo() { return this.api<RepoInfo>(''); }

  async getFile<F extends FileName>(file: F): Promise<{ data: DataFiles[F]; sha: string | null }> {
    try {
      const j = await this.api<{ content: string; sha: string }>(`/contents/${file}.json`);
      return { data: Object.assign(clone(defaults()[file]), JSON.parse(b64decode(j.content))), sha: j.sha };
    } catch (e) {
      if (e instanceof GhError && e.status === 404) return { data: clone(defaults()[file]), sha: null };
      throw e;
    }
  }

  putFile(file: FileName, body: string, sha: string | null | undefined) {
    return this.api<{ content: { sha: string } }>(`/contents/${file}.json`, {
      method: 'PUT',
      body: JSON.stringify({ message: `Update ${file} from app`, content: b64encode(body), ...(sha ? { sha } : {}) }),
    });
  }
}

export function isNetworkError(e: unknown) {
  return e instanceof TypeError;
}

export function explain(e: unknown) {
  if (e instanceof GhError) {
    if (e.status === 401) return 'The token was refused. Make a new one in Settings.';
    if (e.status === 403) return 'The token can’t write to this repo. Give it Contents: Read and write.';
    if (e.status === 404) return 'Repo not found, or the token can’t see it.';
  }
  if (isNetworkError(e)) return 'No connection. Your change is kept here and will save when you’re back online.';
  return (e as Error)?.message || 'Something went wrong.';
}
