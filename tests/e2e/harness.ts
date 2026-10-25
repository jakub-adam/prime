/* Shared Playwright setup: fixed clock, synthetic fixture data, in-memory GitHub API. */
import type { BrowserContext, Page } from '@playwright/test';
import { sampleData } from '../../src/core/sample';
import { MockGitHub } from '../mock-github';

export const TODAY = '2026-10-25';

/** Synthetic data in the real file formats (built from the demo generator for a fixed day, plus a nightly-task meal). */
export function fixtures() {
  const d = sampleData(TODAY);
  d.food.meals.push({ id: `${TODAY}_chat_01`, date: TODAY, time: '13:05', meal: 'Snack', items: 'Protein shake with oat milk', kcal: 240, protein: 32 });
  return {
    'food.json': d.food,
    'training.json': d.training,
    'body.json': d.body,
    'activities.json': d.activities,
    'health.json': d.health,
    'settings.json': { ...d.settings, schedule: { mon: 'Rest · walk', tue: 'Rest', wed: 'Rest', thu: 'Upper B', fri: 'Lower B + athletics', sat: 'Upper A', sun: 'Lower A' } },
  };
}

export async function setup(page: Page, opts: { theme?: 'light' | 'dark'; connected?: boolean; gh?: MockGitHub; draft?: unknown } = {}) {
  const gh = opts.gh ?? new MockGitHub(fixtures());
  await page.clock.setFixedTime(new Date(`${TODAY}T10:30:00`));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request();
    const r = gh.handle({ method: req.method(), url: req.url(), body: req.postData(), auth: req.headers()['authorization'] ?? null });
    await route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) });
  });
  const init = {
    gh: opts.connected === false ? null : { owner: gh.owner, repo: gh.repo, token: gh.token },
    theme: opts.theme ?? 'light',
    draft: opts.draft ?? null,
  };
  await page.addInitScript(i => {
    if (sessionStorage.getItem('__init')) return;
    sessionStorage.setItem('__init', '1');
    if (i.gh) localStorage.setItem('prime.gh', JSON.stringify(i.gh));
    localStorage.setItem('prime.theme', JSON.stringify(i.theme));
    if (i.draft) localStorage.setItem('prime.draft', JSON.stringify(i.draft));
  }, init);
  return gh;
}

export async function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  return errors;
}

export async function waitReady(page: Page) {
  await page.waitForSelector('main#main h1');
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600); // let the page fade (exit + enter) finish
}

export const ROUTES: [string, string][] = [
  ['today', '/today'],
  ['food', '/food'],
  ['food-day', '/food/2026-10-22'],
  ['food-trends', '/food/trends'],
  ['food-meal', '/food/meal/2026-10-25_s0'],
  ['train', '/train'],
  ['train-session', '/train/session/2026-10-21_t0'],
  ['train-progress', '/train/progress'],
  ['train-exercise', '/train/exercise/Bench%20press'],
  ['train-log', '/train/log'],
  ['body', '/body'],
  ['body-weight', '/body/weight'],
  ['body-measurements', '/body/measurements'],
  ['move', '/move'],
  ['move-activity-run', '/move/activity/2026-10-21_sa5'],
  ['move-activity-watch', `/move/activity/${encodeURIComponent('w2026-10-23 18:20:00 +0200')}`],
  ['metric-steps', '/metric/steps'],
  ['metric-sleep', '/metric/sleepH'],
  ['metric-stress', '/metric/stress'],
  ['metric-restinghr', '/metric/restingHr'],
  ['metric-hrv', '/metric/hrv'],
  ['metric-activekcal', '/metric/activeKcal'],
  ['metric-exercise', '/metric/exerciseMin'],
  ['metric-distance', '/metric/distanceKm'],
  ['metric-walkinghr', '/metric/walkingHr'],
  ['metric-vo2max', '/metric/vo2max'],
  ['settings', '/settings'],
];

export type Ctx = BrowserContext;
