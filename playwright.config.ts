import { defineConfig, devices } from '@playwright/test';

/* Tests run against the production build served by `vite preview`, with the GitHub API mocked
   per test (tests/e2e/harness.ts). No real token or repo is ever used. */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Desktop Chrome'],
    reducedMotion: 'reduce',
    timezoneId: 'Europe/Bratislava',
    locale: 'en-GB',
  },
  projects: [
    { name: 'smoke', testMatch: /smoke\.spec\.ts/ },
    { name: 'shots', testMatch: /shots\.spec\.ts/ },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
