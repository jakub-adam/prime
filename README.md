# Prime

Food, training, body and activity in one place. A static app for GitHub Pages.

- **App code** lives here (public). **Your data** lives in a separate private repo (`health-data`), read and written through the GitHub API with a fine-grained token that stays in your browser.
- Without a token the app shows sample data and saves nothing.
- Add it to your iPhone home screen from Safari (Share → Add to Home Screen) to use it like an app.

## Apple Health

In the app: Move → Health → choose `export.zip` from *Health → profile → Export All Health Data* → Import. Only daily totals (steps, distance, active kcal, exercise minutes, sleep, resting HR, HRV, walking HR, VO2 max, weight) and workouts are saved.

`tools/import_health.py` does the same from the command line:

```
python3 tools/import_health.py export.zip path/to/health-data/health.json
```
