/* Screenshot matrix: every tab and drill-down page at 6 widths, light and dark.
   Also fails on horizontal overflow and console errors. Output: tests/screenshots/out/ */
import { expect, test } from '@playwright/test';
import { collectErrors, ROUTES, setup, waitReady } from './harness';

const WIDTHS = [360, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'] as const;

const draft = {
  id: null, date: '2026-10-25', name: 'Lower A', notes: '',
  exercises: [
    { name: 'Hack squat', kind: 'weight', sets: [{ reps: '9', kg: '150', sec: '' }, { reps: '', kg: '', sec: '' }, { reps: '', kg: '', sec: '' }] },
    { name: 'Romanian deadlift', kind: 'weight', sets: [{ reps: '', kg: '', sec: '' }, { reps: '', kg: '', sec: '' }, { reps: '', kg: '', sec: '' }] },
  ],
};


const only = process.env.SHOTS_ONLY?.split(',');
const widths = process.env.SHOTS_WIDTHS ? process.env.SHOTS_WIDTHS.split(',').map(Number) : WIDTHS;

for (const theme of THEMES) {
  for (const width of widths) {
    test(`${theme} ${width}`, async ({ page }) => {
      test.setTimeout(240_000);
      const errors = await collectErrors(page);
      await page.setViewportSize({ width, height: width < 768 ? 800 : width < 1440 ? 900 : 1080 });
      await setup(page, { theme, draft });
      for (const [name, path] of ROUTES) {
        if (only && !only.includes(name)) continue;
        await page.goto(`/#${path}`);
        await waitReady(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect.soft(overflow, `${name} @${width} ${theme}: horizontal overflow`).toBeLessThanOrEqual(0);
        // Full-page captures: pin the fixed tab bar to the end of the page instead of mid-image.
        await page.addStyleTag({ content: 'html{position:relative} nav.fixed{position:absolute!important}' });
        await page.screenshot({ path: `tests/screenshots/out/${theme}/${width}/${name}.png`, fullPage: true });
      }
      expect(errors, 'console errors').toEqual([]);
    });
  }
}

/* Forms: bottom sheet on phones, dialog on larger screens. Viewport captures. */
for (const theme of THEMES) {
  for (const width of [390, 1440]) {
    test(`sheets ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await setup(page, { theme });
      const shots: [string, string, string][] = [
        ['sheet-meal', '/food', 'Log meal'],
        ['sheet-workout', '/today', 'Start workout'],
        ['sheet-weighin', '/health/weight', 'Add weigh-in'],
        ['sheet-activity', '/activity', 'Log'],
        ['sheet-import', '/health', 'Import'],
      ];
      for (const [name, path, button] of shots) {
        await page.goto(`/#${path}`);
        await waitReady(page);
        await page.getByRole('button', { name: button }).first().click();
        await page.getByRole('dialog').waitFor();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `tests/screenshots/out/${theme}/${width}/${name}.png` });
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
      }
    });
  }
}
