# Prime

Food, training, body and activity in one place. A static app for GitHub Pages at <https://prime.jakubadam.com>.

- **App code** lives here (public). **Your data** lives in a separate private repo (`health-data`), read and written through the GitHub API with a fine-grained token that stays in your browser.
- Without a token the app shows demo data and saves nothing.
- Add it to your iPhone home screen from Safari (Share → Add to Home Screen) to use it like an app. It opens on Today and works offline with the last data it loaded.

## Run locally

Needs Node.js 22 or newer.

```
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Type-check (strict) and build to `dist/` |
| `npm run preview` | Serve the production build at http://localhost:4173 |
| `npm test` | Unit tests for the data layer (sync, conflicts, calculations, Apple Health import) |
| `npm run e2e` | Playwright smoke, accessibility and screenshot tests (builds and serves the app itself) |
| `npm run shots` | Screenshots of every page at 360–1920 px, light and dark, into `tests/screenshots/out/` |
| `npm run lighthouse` | Lighthouse accessibility audit; run `npm run preview` first |

First time only for Playwright: `npx playwright install chromium`.

All tests use an in-memory mock of the GitHub API (`tests/mock-github.ts`) and synthetic fixtures. They never touch a real token or repo.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: type-check, unit tests, build, then publish `dist/` to GitHub Pages. The repo's Pages source must be set to **GitHub Actions** (Settings → Pages → Build and deployment → Source), and the custom domain `prime.jakubadam.com` is set in Settings → Pages → Custom domain. GitHub ignores CNAME files for Actions deployments; `public/CNAME` is kept only as a record of the domain.

## How it's built

Vite, React, TypeScript (strict), Tailwind CSS 4 with Radix primitives (shadcn/ui style), Recharts, motion, date-fns, fflate, self-hosted Barlow fonts and vite-plugin-pwa.

```
src/core/       data layer, no UI: types, sync engine, GitHub client, calculations, Health import, CSV
src/app/        store hooks, router (hash URLs, e.g. #/train/session/<id>), layout shell
src/components/ shared UI, charts, week strip
src/features/   today, food, train, health (summary, categories, sleep), body, move (workouts), metrics, settings
tests/          mock GitHub API, fixtures, Playwright specs
```

### Data and sync

- Files in the data repo: `food.json`, `training.json`, `body.json`, `activities.json`, `health.json`, `settings.json` (schema in the data repo's README). Shapes and id formats are unchanged from v1, so the nightly food task keeps working.
- Every edit is an operation (`upsert`, `remove`, `set`, `health`) applied locally at once and queued per file. Saving PUTs the whole file. On a 409/422 conflict the app refetches, reapplies the queued operations and retries. The queue is kept in `localStorage` (`prime.cache`), so unsaved edits survive reloads and going offline.
- `localStorage` keys: `prime.gh` (token), `prime.cache` (data, shas, pending ops), `prime.draft` (workout in progress), `prime.theme`.
- Settings adds two optional keys, `stepsGoal` and `sleepGoalH`. Only changed keys are written; anything else in `settings.json` is left alone.

## Health tab and Apple Health import

The Health tab works like the Health app: pinned highlights, activity rings, workouts, and categories (Activity, Body Measurements, Heart, Mental Wellbeing, Sleep, Respiratory, Mobility, Hearing), each metric with its own page (W / M / 6M / Y / All). Sleep has stages (Awake, REM, Core, Deep), averages and a bedtime/wake-up schedule. Stress is an estimate calculated in the app from HRV and resting heart rate against your previous 4 weeks; it is never saved.

Import: Health → Import (or Settings → Apple Health import) → choose `export.zip` from *Health → profile → Export All Health Data*. Parsing runs in a Web Worker and only daily values and workouts are saved to `health.json`:

| Group | Keys in `health.json` days |
|---|---|
| Activity | `steps`, `distanceKm`, `cyclingKm`, `flights`, `activeKcal`, `basalKcal`, `exerciseMin`, `standMin`, `standHours`, `daylightMin` |
| Heart | `hrAvg`, `hrMin`, `hrMax`, `restingHr`, `walkingHr`, `hrv`, `hrRecovery`, `vo2max` |
| Body | `weightKg`, `bodyFatPct`, `wristTempC` |
| Respiratory | `respiratoryRate`, `spo2` (%) |
| Mobility | `walkingSpeed` (km/h), `stepLengthCm`, `walkingAsymmetry` (%), `doubleSupport` (%), `sixMinWalkM` |
| Hearing | `envAudioDb`, `headphoneDb` |
| Mindfulness | `mindfulMin` |
| Sleep | `sleepH`, `sleepCoreH`, `sleepDeepH`, `sleepRemH`, `sleepAwakeH`, `sleepStartMin` / `sleepEndMin` (minutes from midnight of the wake-up day; negative = the evening before) |

All keys are optional and only written when the export has the data; the original keys are unchanged.

`tools/import_health.py` does the same from the command line. The unit tests check that it and the app give identical results:

```
python3 tools/import_health.py export.zip path/to/health-data/health.json
```
