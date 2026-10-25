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
        await page.screenshot({ path: `tests/screenshots/out/${theme}/${width}/${name}.png`, fullPage: true });
      }
      expect(errors, 'console errors').toEqual([]);
    });
  }
}
