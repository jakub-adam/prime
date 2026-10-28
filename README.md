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
src/features/   today, food, train, activity (feed, workout detail with map, progress), health (summary, categories, sleep),
                body, move (log-activity sheet), metrics, settings
tests/          mock GitHub API, fixtures, Playwright specs
```

### Data and sync

- Files in the data repo: `food.json`, `training.json`, `body.json`, `activities.json`, `health.json`, `settings.json` (schema in the data repo's README), plus one `workouts/<id>.json` per imported watch workout (heart-rate, distance and GPS series; written by the importer in one commit through the Git Data API, read only on the workout's page). Shapes and id formats are unchanged from v1, so the nightly food task keeps working.
- Every edit is an operation (`upsert`, `remove`, `set`, `health`) applied locally at once and queued per file. Saving PUTs the whole file. On a 409/422 conflict the app refetches, reapplies the queued operations and retries. The queue is kept in `localStorage` (`prime.cache`), so unsaved edits survive reloads and going offline.
- `localStorage` keys: `prime.gh` (token), `prime.cache` (data, shas, pending ops), `prime.draft` (workout in progress), `prime.theme`, `prime.details` (the last 8 opened `workouts/<id>.json`, for offline viewing).
- Settings adds optional keys: `stepsGoal`, `sleepGoalH`, and for Activity `maxHr` (zones, default 202), `easyPaceSec` (default 390 = 6:30 /km), `importRoutes` (default true) and `routePrivacyM` (metres hidden at each end of a route, default 200). Only changed keys are written; anything else in `settings.json` is left alone.

## Health tab and Apple Health import

The Health tab works like the Health app: pinned highlights, activity rings, workouts, and categories (Activity, Body Measurements, Heart, Mental Wellbeing, Sleep, Respiratory, Mobility, Hearing), each metric with its own page (W / M / 6M / Y / All). Sleep has stages (Awake, REM, Core, Deep), averages and a bedtime/wake-up schedule. Stress is an estimate calculated in the app from HRV and resting heart rate against your previous 4 weeks; it is never saved.

Import: Health → Import (or Settings → Apple Health import) → choose `export.zip` from *Health → profile → Export All Health Data*. Parsing runs in a Web Worker. Daily values and workout summaries are saved to `health.json`, and each workout's series to `workouts/<id>.json` (see the Activity tab below):

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

`tools/import_health.py` does the same from the command line (daily values and the base workout fields; see “Workout import details” below). The unit tests check that it and the app give identical results:

```
python3 tools/import_health.py export.zip path/to/health-data/health.json
```

## Activity tab

`#/activity` is a feed of every workout, newest first: Apple Watch workouts, activities logged by hand and strength sessions from Train (a Train session and a watch strength workout on the same day show as one card). Filter: All / Running / Walking / Strength (`?type=run`).

- **Workout page** (`#/activity/<id>`): a map of the route coloured by pace or heart rate (toggle), with start, finish and km markers; headline stats (distance, time, pace, avg/max HR, elevation, cadence, energy); pace and HR over time; splits with bars (faster = longer); HR zones; recovery HR at 1 and 2 minutes; best efforts; running power, stride, ground contact and the rest the watch saved. Hovering or tapping the chart moves a dot along the route, and hovering the route moves the chart. Treadmill and other indoor workouts show everything except the map.
- **Progress** (`#/activity/progress`): average heart rate at a fixed easy pace over time (pace buckets within ±20 s/km after a 3-minute warm-up; the target is `easyPaceSec`, with ±30 s shortcuts), best 1 / 3 / 5 / 10 km efforts (fastest stretch inside any run) and weekly running and walking distance.
- **Map**: Leaflet with OpenStreetMap's standard tiles (no API key). Loaded lazily, only on a workout page with a route. Following the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/): only the visible tiles are loaded, nothing is prefetched or stored offline, the attribution is always shown, and the browser's normal Referer is sent. CARTO basemaps now need an API key, so they are not used. Dark mode inverts the tiles with a CSS filter. Tests replace tiles with a blank image.
- **Privacy**: the first and last `routePrivacyM` metres (default 200) of every route are dropped before anything is drawn: the line, the markers, the map bounds, the hover dot and the feed previews never get those points. The full route stays only in the private data repo.
- Old links (`#/health/workouts`, `#/health/workout/<id>`, `w<start>` ids) redirect to the Activity tab.

### Workout import details

Each workout row in `health.json` keeps its six original keys and gains (all optional): `id` (type + start in UTC, e.g. `Running_20261028T084946Z`), `endTime` (UTC), `durationSec`, `maxHr`, `minHr`, `avgPaceSecPerKm`, `elevationGainM`, `avgCadence`, `splits[]`, `hrZones` + `hrZonesMaxHr`, `recoveryHr`, `bestEfforts`, `paceHr`, `routePreview` (about 48 points, encoded polyline), `detail` (path of the series file) and the watch's extras (`steps`, `basalKcal`, `avgPowerW`, `avgStrideM`, `avgGroundContactMs`, `avgVerticalOscCm`, `avgSpeedKmh`, `maxSpeedKmh`, `avgMets`, `indoor`, `source`, `timeZone`). See the data repo's README for the exact shapes.

- **Ids and duplicates.** Apple Health writes times with the phone's *current* UTC offset, so an export made after the clocks change writes the same workout with another offset (`10:11 +0100` vs `11:11 +0200`). Rows are now matched by `id`, which uses the UTC instant, so re-importing replaces a row instead of adding a second one, and duplicates already in `health.json` collapse on the next import (they are also hidden in the app straight away). Rows are merged field by field, so keys written by other tools survive.
- **Where the numbers come from.** Heart rate: the watch's summary if present, otherwise the HR samples during the workout (some workouts have none; the page says so). Splits, best efforts and pace use the watch's own distance samples (the phone's are ignored), or the GPS route when there are none. Zones use 5 bands of `maxHr` at import time (<60, 60–70, 70–80, 80–90, ≥90 %). Recovery is the HR sample nearest 1 and 2 minutes after the end (±20 s). The route is the export's `workout-routes/*.gpx`, about 1 point per 4 s (at most about 1500 points).
- `tools/import_health.py` writes the same base fields (`id`, `endTime`, `durationSec`, `maxHr`, `minHr`, HR from samples) and the same id merge, so it never duplicates rows either. Splits, zones, routes and the series files come from the in-app importer only.
