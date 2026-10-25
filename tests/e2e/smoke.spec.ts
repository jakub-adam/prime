import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { MockGitHub } from '../mock-github';
import type { Meal } from '../../src/core/types';
import { collectErrors, fixtures, ROUTES, setup, TODAY, waitReady } from './harness';

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
  await expect(page.getByRole('button', { name: 'Repeat this workout' })).toBeVisible();
  await page.goto('/#/today');
  await waitReady(page);
  await page.getByRole('link', { name: /Steps/ }).first().click();
  await expect(page).toHaveURL(/#\/metric\/steps$/);
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
  await expect(page.getByLabel('Exercise 1')).toHaveValue('Hack squat');
  await expect(page.getByLabel('Set 1 kg').first()).toHaveAttribute('placeholder', /\d/);
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
