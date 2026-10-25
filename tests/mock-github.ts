/* In-memory stand-in for the GitHub contents API, used by unit tests (as a fetch) and by
   Playwright (through page.route). It never talks to the network. */

export type MockFile = { content: string; sha: number };
export type MockRequest = { method: string; url: string; body?: string | null; auth?: string | null };
export type MockResponse = { status: number; body: unknown };

const enc = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const dec = (s: string) => Buffer.from(s, 'base64').toString('utf8');

export class MockGitHub {
  files = new Map<string, MockFile>();
  token = 'test-token';
  owner = 'test-owner';
  repo = 'test-data';
  private shaSeq = 1;
  log: { method: string; path: string; status: number }[] = [];
  /** Called before each PUT is handled; lets a test simulate another writer (e.g. the nightly task). */
  beforePut: ((file: string) => void) | null = null;
  offline = false;
  repoPrivate = true;
  canPush = true;

  constructor(initial: Record<string, unknown> = {}) {
    for (const [name, data] of Object.entries(initial)) this.write(name, JSON.stringify(data, null, 1) + '\n');
  }

  write(name: string, text: string) {
    this.files.set(name, { content: text, sha: this.shaSeq++ });
  }
  read<T = unknown>(name: string): T {
    const f = this.files.get(name);
    if (!f) throw new Error(`no ${name}`);
    return JSON.parse(f.content) as T;
  }
  raw(name: string) { return this.files.get(name)?.content; }
  puts() { return this.log.filter(l => l.method === 'PUT'); }

  handle(req: MockRequest): MockResponse {
    const u = new URL(req.url);
    const prefix = `/repos/${this.owner}/${this.repo}`;
    const res = (status: number, body: unknown): MockResponse => {
      this.log.push({ method: req.method, path: u.pathname, status });
      return { status, body };
    };
    if (req.auth !== `Bearer ${this.token}`) return res(401, { message: 'Bad credentials' });
    if (!u.pathname.startsWith(prefix)) return res(404, { message: 'Not Found' });
    const rest = u.pathname.slice(prefix.length);
    if (rest === '' && req.method === 'GET') {
      return res(200, { full_name: `${this.owner}/${this.repo}`, private: this.repoPrivate, permissions: { push: this.canPush }, html_url: `https://github.com/${this.owner}/${this.repo}` });
    }
    const m = /^\/contents\/([\w.-]+)$/.exec(rest);
    if (!m) return res(404, { message: 'Not Found' });
    const name = m[1]!;
    if (req.method === 'GET') {
      const f = this.files.get(name);
      if (!f) return res(404, { message: 'Not Found' });
      return res(200, { name, content: enc(f.content), sha: String(f.sha), encoding: 'base64' });
    }
    if (req.method === 'PUT') {
      this.beforePut?.(name);
      const body = JSON.parse(req.body || '{}') as { content: string; sha?: string; message: string };
      const cur = this.files.get(name);
      if (cur && !body.sha) return res(422, { message: '"sha" wasn\'t supplied.' });
      if (cur && body.sha !== String(cur.sha)) return res(409, { message: `${name} does not match ${body.sha}` });
      if (!cur && body.sha) return res(409, { message: 'File does not exist' });
      this.write(name, dec(body.content));
      return res(200, { content: { name, sha: String(this.files.get(name)!.sha) } });
    }
    return res(405, { message: 'Method not allowed' });
  }

  /** fetch-compatible function for unit tests. */
  fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    if (this.offline) throw new TypeError('Failed to fetch');
    const headers = (init.headers || {}) as Record<string, string>;
    const r = this.handle({ method: init.method || 'GET', url, body: (init.body as string) ?? null, auth: headers.Authorization ?? null });
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
}
