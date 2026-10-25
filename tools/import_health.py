#!/usr/bin/env python3
"""Turn an Apple Health export (export.zip or export.xml) into health.json for the app.

Usage:
    python3 import_health.py <export.zip|export.xml> <path/to/health.json>

The output keeps days already in health.json and overwrites any day the new
export covers, so weekly exports can be imported one after another.

Per day: steps, walking+running distance (km), active energy (kcal),
exercise minutes, sleep (hours, credited to the morning you woke up),
resting heart rate, HRV (SDNN mean), walking heart rate, VO2 max.
Workouts: type, start, duration, distance, energy, average heart rate.
"""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timedelta

PREFIXES = ("HKQuantityTypeIdentifier", "HKCategoryTypeIdentifier", "HKDataType")
ASLEEP = {
    "HKCategoryValueSleepAnalysisAsleepUnspecified",
    "HKCategoryValueSleepAnalysisAsleepCore",
    "HKCategoryValueSleepAnalysisAsleepDeep",
    "HKCategoryValueSleepAnalysisAsleepREM",
    "HKCategoryValueSleepAnalysisAsleep",
}
SUM_BY_SOURCE = {"StepCount": "steps", "DistanceWalkingRunning": "distanceKm"}
SUM_ALL = {"ActiveEnergyBurned": "activeKcal", "AppleExerciseTime": "exerciseMin"}
MEAN = {
    "RestingHeartRate": "restingHr",
    "HeartRateVariabilitySDNN": "hrv",
    "WalkingHeartRateAverage": "walkingHr",
    "VO2Max": "vo2max",
    "BodyMass": "weightKg",
}


def short(t):
    for p in PREFIXES:
        if t.startswith(p):
            return t[len(p):]
    return t


def parse_dt(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S %z")


def open_xml(path):
    if path.endswith(".zip"):
        z = zipfile.ZipFile(path)
        name = next(n for n in z.namelist() if n.endswith("/export.xml") or n == "export.xml")
        return z.open(name)
    return open(path, "rb")


def km(value, unit):
    v = float(value)
    if unit == "mi":
        return v * 1.609344
    if unit == "m":
        return v / 1000
    return v


def merge_intervals(iv):
    iv.sort()
    out = []
    for s, e in iv:
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out


def main(src, dst):
    by_source = defaultdict(lambda: defaultdict(float))  # (day, key) -> source -> sum
    sums = defaultdict(float)
    means = defaultdict(list)
    sleep = defaultdict(list)  # source -> intervals
    workouts = []

    with open_xml(src) as fh:
        for _, el in ET.iterparse(fh, events=("end",)):
            if el.tag == "Record":
                t = short(el.get("type", ""))
                start = el.get("startDate")
                day = start[:10] if start else None
                if t in SUM_BY_SOURCE and day:
                    v = float(el.get("value", 0))
                    if t == "DistanceWalkingRunning":
                        v = km(v, el.get("unit"))
                    by_source[(day, SUM_BY_SOURCE[t])][el.get("sourceName", "?")] += v
                elif t in SUM_ALL and day:
                    sums[(day, SUM_ALL[t])] += float(el.get("value", 0))
                elif t in MEAN and day:
                    means[(day, MEAN[t])].append(float(el.get("value", 0)))
                elif t == "SleepAnalysis" and el.get("value") in ASLEEP:
                    sleep[el.get("sourceName", "?")].append(
                        (parse_dt(el.get("startDate")), parse_dt(el.get("endDate")))
                    )
                el.clear()
            elif el.tag == "Workout":
                stats = {short(s.get("type", "")): s for s in el.findall("WorkoutStatistics")}
                dist = stats.get("DistanceWalkingRunning")
                energy = stats.get("ActiveEnergyBurned")
                hr = stats.get("HeartRate")
                dur = float(el.get("duration", 0))
                if el.get("durationUnit") == "s":
                    dur /= 60
                workouts.append({
                    "type": el.get("workoutActivityType", "").replace("HKWorkoutActivityType", ""),
                    "start": el.get("startDate"),
                    "durationMin": round(dur, 1),
                    "distanceKm": round(km(dist.get("sum"), dist.get("unit")), 2) if dist is not None and dist.get("sum") else None,
                    "activeKcal": round(float(energy.get("sum"))) if energy is not None and energy.get("sum") else None,
                    "avgHr": round(float(hr.get("average"))) if hr is not None and hr.get("average") else None,
                })
                el.clear()

    days = defaultdict(dict)
    for (day, key), per_src in by_source.items():
        v = max(per_src.values())  # watch and phone overlap, so take the larger, not the sum
        days[day][key] = round(v, 2) if key == "distanceKm" else round(v)
    for (day, key), v in sums.items():
        days[day][key] = round(v)
    for (day, key), vals in means.items():
        days[day][key] = round(sum(vals) / len(vals), 1)

    # Sleep: use the source with the most data, merge overlaps, credit to the wake-up day.
    if sleep:
        src_name = max(sleep, key=lambda k: len(sleep[k]))
        merged = merge_intervals([[s, e] for s, e in sleep[src_name]])
        # Group into nights: gaps over 3 h start a new night.
        nights = []
        for s, e in merged:
            if nights and s - nights[-1]["end"] < timedelta(hours=3):
                nights[-1]["end"] = e
                nights[-1]["mins"] += (e - s).total_seconds() / 60
            else:
                nights.append({"end": e, "mins": (e - s).total_seconds() / 60})
        for n in nights:
            if n["mins"] >= 60:
                d = n["end"].strftime("%Y-%m-%d")
                days[d]["sleepH"] = round(days[d].get("sleepH", 0) + n["mins"] / 60, 2)

    try:
        with open(dst) as f:
            existing = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        existing = {"days": {}, "workouts": []}

    existing.setdefault("days", {}).update({d: days[d] for d in sorted(days)})
    seen = {w["start"] for w in workouts}
    existing["workouts"] = sorted(
        [w for w in existing.get("workouts", []) if w["start"] not in seen] + workouts,
        key=lambda w: w["start"],
    )
    existing["importedAt"] = datetime.now().astimezone().isoformat(timespec="seconds")
    existing["days"] = dict(sorted(existing["days"].items()))

    with open(dst, "w") as f:
        json.dump(existing, f, indent=1, ensure_ascii=False)
    print(f"{len(days)} days, {len(workouts)} workouts -> {dst}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
