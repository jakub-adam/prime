# Handoff: Activity tab and detailed workout import

State as of 28 Oct 2026. What was built, where it lives, what is verified and what is still open.

## What changed

| Area | Files |
|---|---|
| Workout maths (ids in UTC, dedupe, splits, HR series, zones, recovery, best efforts, HR by pace, route downsampling and privacy trim, polyline) | `src/core/workout.ts` |
| Importer: HR and distance samples, workout metadata, GPX routes from the zip | `src/core/health-import.ts`, `src/core/health.worker.ts` |
| Merge by `id` in the `health` operation (fixes the 12 Oct duplicate) | `src/core/ops.ts` |
| `workouts/<id>.json`: read through the contents API, write all files of one import in one commit (Git Data API) | `src/core/github.ts`, `src/core/sync.ts` (`workoutDetail`, `saveWorkoutDetails`) |
| Types for the new fields and settings | `src/core/types.ts` |
| Activity tab: feed, workout page, progress, lazy Leaflet map, preview, charts | `src/features/activity/*` |
| Settings → Activity (max HR, easy pace, hidden route ends, store routes) | `src/features/settings/SettingsPage.tsx` |
| Demo and test data (synthetic, never real GPS) | `src/core/synthetic.ts`, `src/core/sample.ts`, `tests/fixtures/health/synthetic-export.ts` |
| Python CLI: `id`, `endTime`, `durationSec`, `maxHr`, `minHr`, HR from samples, merge by id, UTF-8/LF output | `tools/import_health.py` |
| Removed (replaced by the Activity tab; old URLs redirect) | `src/features/move/WorkoutsPage.tsx`, `src/features/move/ActivityPage.tsx` |

Data shapes are documented in the data repo's README (`health-data/README.md`); the app README has the behaviour.

## Decisions

- **Heavy series live outside `health.json`.** `health.json` is loaded on every start, cached in `localStorage` (about 5 MB limit) and read through the contents API (1 MB limit). A 30-minute run's series are about 20–30 KB, so they go to `workouts/<id>.json` and load only on the workout page. Small things the feed and progress need (splits, zones, best efforts, HR-by-pace buckets, a 48-point route preview) stay in the row, at about 1–2 KB each.
- **`start` keeps the export's original string** for compatibility; the UTC instant is in `id` and `endTime`. Sorting and matching use the instant.
- **Tiles:** OpenStreetMap standard tiles (no key). CARTO basemaps now require an API key. The OSM policy suits a low-traffic personal app; if usage grows or offline maps are wanted, switch to a hosted provider or self-hosted vector tiles.
- **Privacy trim** is applied to the data before drawing, not as a visual mask.

## Verified

- Unit tests (`npm test`): ids and dedupe, merge keeps other writers' keys, the full importer on a synthetic copy of today's run (2.54 km, 17:12, HR 175, 3 splits, zones, recovery, about 260 route points), routes off, treadmill, HR at easy pace, Python/app parity on base fields.
- E2E (`npm run e2e`): UI import makes one commit with `workouts/<id>.json`, the 12 Oct pair collapses, and the run page shows map, splits and chart; feed filter; treadmill fallback; redirects; axe WCAG 2 AA on all pages in both themes; screenshots at 360–1920 px without horizontal overflow.
- Real data, in memory only: the real 24 Oct `export.zip` plus the synthetic 28 Oct run were imported into the real `health.json`. 4 rows → 3 (the duplicate collapses), all 24 days kept, the walk unchanged.

## Not done / next

- **Re-import from the phone** to get the real routes, splits and HR for 28 Oct (the export with that run is on the phone; the PC export is from 24 Oct). After that import, `health.json` loses the duplicate row and `workouts/` appears in the data repo.
- The 12 Oct run has no HR samples during the run (the watch recorded none), so its page shows pace, splits, recovery and route, but no zones.
- The first full import with many workouts writes 40 files per commit; a year of workouts is a handful of commits.
- `health.json` days grow about 300 KB a year; around the 1 MB contents-API limit, `getFile` should switch to the raw media type. This is not urgent.
