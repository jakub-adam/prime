/* Lighthouse accessibility audit of the production build (demo data, no token).
   Usage: npm run build && npx vite preview --port 4173 (in another terminal), then npm run lighthouse */
import { chromium } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { existsSync } from 'node:fs';

const BASE = process.env.LH_URL || 'http://localhost:4173/';
const PAGES = ['today', 'food', 'food/trends', 'train', 'train/progress', 'body', 'body/weight', 'move', 'metric/steps', 'metric/sleepH', 'settings'];

// Prefer Playwright's headless shell (always runnable in CI and sandboxes), else its full Chromium.
const full = chromium.executablePath();
const shell = full
  .replace(/chromium-(\d+)/, 'chromium_headless_shell-$1')
  .replace(/chrome-(win64|linux64|linux|mac-arm64|mac)([\\/]).*$/, (_m, plat, sep) => `chrome-headless-shell-${plat === 'linux' ? 'linux64' : plat}${sep}chrome-headless-shell${process.platform === 'win32' ? '.exe' : ''}`);
const chromePath = process.env.CHROME_PATH || (existsSync(shell) ? shell : full);
const chrome = await launch({ chromePath, chromeFlags: ['--headless=new'] });
let failed = false;
try {
  for (const formFactor of ['mobile', 'desktop']) {
    for (const p of PAGES) {
      const res = await lighthouse(`${BASE}#/${p}`, { port: chrome.port, onlyCategories: ['accessibility'], logLevel: 'error' }, {
        extends: 'lighthouse:default',
        settings: formFactor === 'desktop'
          ? { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false } }
          : { formFactor: 'mobile' },
      });
      const lhr = res.lhr;
      const score = Math.round(lhr.categories.accessibility.score * 100);
      const fails = Object.values(lhr.audits).filter(a => a.score === 0 && a.scoreDisplayMode === 'binary').map(a => a.id);
      console.log(`${formFactor.padEnd(8)} ${p.padEnd(16)} ${score}${fails.length ? '  failing: ' + fails.join(', ') : ''}`);
      if (score < 95) failed = true;
    }
  }
} finally {
  await chrome.kill();
}
process.exit(failed ? 1 : 0);
