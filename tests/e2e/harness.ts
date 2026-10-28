/* Shared Playwright setup: fixed clock, synthetic fixture data, in-memory GitHub API. */
import type { BrowserContext, Page } from '@playwright/test';
import { sampleData, sampleDetails } from '../../src/core/sample';
import { MockGitHub } from '../mock-github';

// Fixture workout ids are built from local clock times; use the same zone as the browser (playwright.config.ts).
process.env.TZ = 'Europe/Bratislava';

const BLANK_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

export const TODAY = '2026-10-25';
/* Demo watch workouts (src/core/sample.ts) on TODAY, in Europe/Bratislava. */
export const TODAY_RUN = 'Running_20261025T084900Z';
export const TREADMILL = 'Running_20261017T171500Z';

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
    ...Object.fromEntries(Object.entries(sampleDetails(TODAY)).map(([id, det]) => [`workouts/${id}.json`, det])),
  };
}

export async function setup(page: Page, opts: { theme?: 'light' | 'dark'; connected?: boolean; gh?: MockGitHub; draft?: unknown } = {}) {
  const gh = opts.gh ?? new MockGitHub(fixtures());
  await page.clock.setFixedTime(new Date(`${TODAY}T10:30:00`));
  // Map tiles: a blank tile, so tests never load from tile.openstreetmap.org
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_TILE }));
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
  ['train-exercises', '/train/exercises'],
  ['day', '/day/2026-10-21'],
  ['health-day', '/health/day/2026-10-24'],
  ['health', '/health'],
  ['health-activity', '/health/activity'],
  ['health-body', '/health/body'],
  ['health-heart', '/health/heart'],
  ['health-mind', '/health/mind'],
  ['health-sleep', '/health/sleep'],
  ['health-respiratory', '/health/respiratory'],
  ['health-mobility', '/health/mobility'],
  ['health-hearing', '/health/hearing'],
  ['health-weight', '/health/weight'],
  ['health-measurements', '/health/measurements'],
  ['activity', '/activity'],
  ['activity-runs', '/activity?type=run'],
  ['activity-progress', '/activity/progress'],
  ['activity-today', `/activity/${TODAY_RUN}`],
  ['activity-treadmill', `/activity/${TREADMILL}`],
  ['activity-logged', '/activity/2026-10-21_sa5'],
  ['metric-steps', '/health/metric/steps'],
  ['metric-stress', '/health/metric/stress'],
  ['metric-heartrate', '/health/metric/hrAvg'],
  ['metric-hrv', '/health/metric/hrv'],
  ['metric-spo2', '/health/metric/spo2'],
  ['metric-walkingspeed', '/health/metric/walkingSpeed'],
  ['metric-activekcal', '/health/metric/activeKcal'],
  ['metric-nodata', '/health/metric/sixMinWalkM'],
  ['settings', '/settings'],
];

export type Ctx = BrowserContext;
