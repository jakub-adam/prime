import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { MockGitHub } from '../mock-github';
import type { Meal } from '../../src/core/types';
import { syntheticExport } from '../fixtures/health/synthetic-export';
import { collectErrors, fixtures, ROUTES, setup, TODAY, TREADMILL, waitReady } from './harness';

const RUN_ID = 'Running_20261028T084946Z';

test.describe('accessibility (axe, WCAG 2 AA)', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 1440]) {
      test(`${theme} ${width}`, async ({ page }) => {
        test.setTimeout(240_000);
        await page.setViewportSize({ width, height: 900 });
        await setup(page, { theme });
        const problems: string[] = [];
        for (const [name, path] of ROUTES) {
          await page.goto(`/#${path}`);
          await waitReady(page);
          const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
          for (const v of res.violations) problems.push(`${name}: ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`);
        }
        expect(problems).toEqual([]);
      });
    }
  }
});

test('legacy #today link and home-screen start_url open Today', async ({ page }) => {
  await setup(page);
  await page.goto('/#today');
  await waitReady(page);
  await expect(page).toHaveURL(/#\/today$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
});

test('adds a meal: saved to food.json with the v1 id format and file format', async ({ page }) => {
  const errors = await collectErrors(page);
  const gh = await setup(page);
  await page.goto('/#/food');
  await waitReady(page);
  await page.getByRole('button', { name: 'Log meal' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('What').fill('Test wrap');
  await dialog.getByLabel('Calories (kcal)').fill('612');
  await dialog.getByLabel('Protein (g)').fill('41.5');
  await dialog.getByRole('button', { name: 'Add meal' }).click();
  await expect(page.getByText('Test wrap')).toBeVisible();
  await expect.poll(() => gh.read<{ meals: Meal[] }>('food.json').meals.find(m => m.items === 'Test wrap')).toBeTruthy();
  const m = gh.read<{ meals: Meal[] }>('food.json').meals.find(x => x.items === 'Test wrap')!;
  expect(m.id).toMatch(new RegExp(`^${TODAY}_[a-z0-9]+$`));
  expect(m).toMatchObject({ date: TODAY, kcal: 612, protein: 41.5 });
  expect(gh.raw('food.json')).toMatch(/^\{\n "meals": \[\n  \{/);
  await expect(page.getByRole('link', { name: /Sync status: Synced/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('409 conflict: the nightly task’s meal and the app’s meal both survive', async ({ page }) => {
  const gh = new MockGitHub(fixtures());
  await setup(page, { gh });
  await page.goto('/#/food');
  await waitReady(page);
  let once = true;
  gh.beforePut = name => {
    if (name !== 'food.json' || !once) return;
    once = false;
    const cur = gh.read<{ meals: Meal[] }>('food.json');
    cur.meals.push({ id: `${TODAY}_chat_02`, date: TODAY, time: '19:00', meal: 'Dinner', items: 'From the nightly task', kcal: 700, protein: 50 });
    gh.write('food.json', JSON.stringify(cur, null, 1) + '\n');
  };
  await page.getByRole('button', { name: 'Log meal' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Calories (kcal)').fill('300');
  await dialog.getByLabel('Protein (g)').fill('20');
  await dialog.getByRole('button', { name: 'Add meal' }).click();
  await expect.poll(() => gh.puts().map(p => p.status)).toEqual([409, 200]);
  const ids = gh.read<{ meals: Meal[] }>('food.json').meals.map(m => m.id);
  expect(ids).toContain(`${TODAY}_chat_02`);
  expect(ids.filter(i => i.startsWith(TODAY)).length).toBeGreaterThanOrEqual(5);
  await expect(page.getByText('From the nightly task')).toBeVisible();
});

test('drill-downs: week strip, workout, activity and metric pages are reachable and back works', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await page.goto('/#/today');
  await waitReady(page);
  await page.getByRole('link', { name: 'Workout: Upper A' }).first().click();
  await expect(page).toHaveURL(/#\/train\/session\//);
  await expect(page.getByRole('button', { name: 'Repeat' })).toBeVisible();
  await page.goto('/#/today');
  await waitReady(page);
  await page.getByRole('link', { name: /Steps/ }).first().click();
  await expect(page).toHaveURL(/#\/health\/metric\/steps$/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/#\/today$/);
});

test('start workout prefills from the last session of that name', async ({ page }) => {
  await setup(page);
  await page.goto('/#/train');
  await waitReady(page);
  await page.getByRole('button', { name: 'Start workout' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Lower A/ }).click();
  await expect(page).toHaveURL(/#\/train\/log$/);
  await waitReady(page);
  await expect(page.getByRole('link', { name: 'Hack squat' })).toBeVisible();
  await expect(page.getByLabel('Set 1 kg').first()).toHaveAttribute('placeholder', /\d/);
  // Ticking an empty set copies last time's numbers and starts the rest timer.
  await page.getByRole('button', { name: 'Set 1 done' }).first().click();
  await expect(page.getByLabel('Set 1 kg').first()).not.toHaveValue('');
  await expect(page.getByRole('timer', { name: /Rest timer/ })).toBeVisible();
  // Add an exercise from the picker and finish.
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await page.getByRole('dialog').getByLabel('Search exercises').fill('lateral');
  await page.getByRole('dialog').getByRole('button', { name: /^Lateral raise/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Add 1 exercise/ }).click();
  await expect(page.getByRole('link', { name: 'Lateral raise' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Save workout/ }).click();
  await expect(page).toHaveURL(/#\/train\/session\//);
});

test('week strip day and chart bars open that day', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await page.goto('/#/today');
  await waitReady(page);
  await page.getByRole('link', { name: /^Open Wed\s*21$/ }).click();
  await expect(page).toHaveURL(/#\/day\/2026-10-21$/);
  await expect(page.getByRole('heading', { name: 'Food' })).toBeVisible();
  await expect(page.getByText('Upper A').first()).toBeVisible();
  await page.goto('/#/health/metric/steps');
  await waitReady(page);
  await page.locator('.recharts-bar-rectangle').last().click();
  await expect(page).toHaveURL(/#\/health\/day\/\d{4}-\d{2}-\d{2}$/);
});

test('meals can carry carbs, fat and other nutrients', async ({ page }) => {
  const gh = await setup(page);
  await page.goto('/#/food');
  await waitReady(page);
  await page.getByRole('button', { name: 'Log meal' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Calories (kcal)').fill('500');
  await dialog.getByLabel('Protein (g)').fill('30');
  await dialog.getByRole('button', { name: /More nutrients/ }).click();
  await dialog.getByLabel('Carbs (g)').fill('55.5');
  await dialog.getByLabel('Fat (g)', { exact: true }).fill('12');
  await dialog.getByRole('button', { name: 'Add meal' }).click();
  await expect.poll(() => gh.read<{ meals: Meal[] }>('food.json').meals.find(m => m.kcal === 500 && m.carbs === 55.5)).toMatchObject({ protein: 30, fat: 12 });
  const saved = gh.read<{ meals: Meal[] }>('food.json').meals.find(m => m.carbs === 55.5)!;
  expect(saved).not.toHaveProperty('sugar');
});

test('keyboard: skip link and visible focus', async ({ page }) => {
  await setup(page);
  await page.goto('/#/today');
  await waitReady(page);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe('none');
});

test('offline: last-loaded data still shows after a reload', async ({ page, context }) => {
  await setup(page);
  await page.goto('/#/today');
  await waitReady(page);
  await page.evaluate(async () => { await navigator.serviceWorker?.ready; });
  await page.reload();
  await waitReady(page);
  await context.setOffline(true);
  await page.reload();
  await waitReady(page);
  await expect(page.getByText('Overnight oats with yogurt and banana')).toBeVisible();
  await expect(page.getByRole('link', { name: /Sync status: Offline/ })).toBeVisible();
  await context.setOffline(false);
});

test('demo mode without a token, with a clear way to connect', async ({ page }) => {
  await setup(page, { connected: false });
  await page.goto('/#/today');
  await waitReady(page);
  await expect(page.getByText('Demo data.')).toBeVisible();
  await page.getByRole('link', { name: 'Connect your data' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
});

test('old Body, Move and metric links redirect into Health', async ({ page }) => {
  await setup(page);
  for (const [from, to] of [['/body/weight', /#\/health\/weight$/], ['/move', /#\/health\/activity$/], ['/metric/stress', /#\/health\/metric\/stress$/], ['/metric/sleepH', /#\/health\/sleep$/]] as const) {
    await page.goto(`/#${from}`);
    await waitReady(page);
    await expect(page).toHaveURL(to);
  }
});

test('health summary links to categories, sleep stages and metrics', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await page.goto('/#/health');
  await waitReady(page);
  await page.getByRole('link', { name: /^Sleep Sleep, stages and schedule/ }).click();
  await expect(page).toHaveURL(/#\/health\/sleep$/);
  await expect(page.getByRole('heading', { name: 'Sleep stages' })).toBeVisible();
  await expect(page.getByText('Deep').first()).toBeVisible();
  await page.goto('/#/health/heart');
  await waitReady(page);
  await page.getByRole('link', { name: /^HRV/ }).click();
  await expect(page).toHaveURL(/#\/health\/metric\/hrv$/);
});

test('Apple Health import: one commit of workout files, the 12 Oct duplicate collapses, today’s run has map, splits and HR chart', async ({ page }) => {
  const errors = await collectErrors(page);
  const files = fixtures();
  // health.json as it is in the data repo today: the same run twice, written with two UTC offsets
  files['health.json'].workouts.push(
    { type: 'Running', start: '2026-10-12 10:11:41 +0100', durationMin: 6.8, distanceKm: 1.14, activeKcal: 79, avgHr: null },
    { type: 'Running', start: '2026-10-12 11:11:41 +0200', durationMin: 6.8, distanceKm: 1.14, activeKcal: 79, avgHr: null },
  );
  const before = files['health.json'].workouts.length;
  const gh = new MockGitHub(files);
  await setup(page, { gh });
  await page.goto('/#/activity');
  await waitReady(page);
  await page.getByRole('button', { name: 'Import' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'export.zip', mimeType: 'application/zip', buffer: Buffer.from(syntheticExport()) });
  await dialog.getByRole('button', { name: 'Import' }).click();
  await expect.poll(() => gh.commits.flatMap(c => c.paths)).toContain(`workouts/${RUN_ID}.json`);
  await expect.poll(() => gh.read<{ workouts: { id?: string }[] }>('health.json').workouts.some(w => w.id === RUN_ID)).toBe(true);
  const ws = gh.read<{ workouts: { id?: string; start: string; type: string }[] }>('health.json').workouts;
  // every earlier workout is still there, the 12 Oct pair is one row, today's run is added once
  expect(ws).toHaveLength(before - 1 + 1);
  expect(ws.filter(w => w.start.startsWith('2026-10-12'))).toHaveLength(1);
  expect(ws.filter(w => w.id === RUN_ID)).toHaveLength(1);
  const detail = gh.read<{ route: unknown[]; hrSeries: unknown[] }>(`workouts/${RUN_ID}.json`);
  expect(detail.route.length).toBeGreaterThan(200);
  expect(detail.hrSeries.length).toBeGreaterThan(95);

  await page.goto(`/#/activity/${RUN_ID}`);
  await waitReady(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Morning Run' })).toBeVisible();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
  await expect(page.getByRole('img', { name: 'Pace and heart rate over the workout' })).toBeVisible();
  await expect(page.getByText('Heart-rate zones')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Activity: feed filters, treadmill run without GPS, legacy workout links redirect', async ({ page }) => {
  await setup(page);
  await page.goto('/#/activity?type=walk');
  await waitReady(page);
  await expect(page.getByRole('link', { name: /Evening Walk/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Morning Run/ })).toHaveCount(0);
  await page.goto(`/#/activity/${TREADMILL}`);
  await waitReady(page);
  await expect(page.getByText(/No GPS for this workout \(indoor\)/)).toBeVisible();
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
  await page.goto('/#/health/workouts');
  await expect(page).toHaveURL(/#\/activity$/);
  await page.goto('/#/health/workout/2026-10-21_sa5');
  await expect(page).toHaveURL(/#\/activity\/2026-10-21_sa5$/);
});
