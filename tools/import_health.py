#!/usr/bin/env python3
"""Turn an Apple Health export (export.zip or export.xml) into health.json for the app.

Usage:
    python3 import_health.py <export.zip|export.xml> <path/to/health.json>

The output keeps days already in health.json and overwrites any day the new
export covers, so weekly exports can be imported one after another.

Per day (only what the export contains):
  activity   steps, walking+running distance (km), cycling distance (km), flights climbed,
             active and resting energy (kcal), exercise, stand and daylight minutes, stand hours
  heart      resting, walking and average/min/max heart rate, HRV (SDNN), cardio recovery, VO2 max
  body       weight, body fat %
  vitals     respiratory rate, blood oxygen %, sleeping wrist temperature
  mobility   walking speed, step length, asymmetry %, double support %, six-minute walk
  hearing    environmental and headphone audio levels (dB)
  mindful    mindful minutes
  sleep      hours asleep (credited to the morning you woke up), hours per stage
             (core, deep, REM, awake) and bed/wake clock times
Workouts: type, start, duration, distance, energy, average heart rate.

The app's in-browser importer (src/core/health-import.ts) follows the same rules.
"""
import json
import math
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
STAGES = {
    "HKCategoryValueSleepAnalysisAsleepCore": "sleepCoreH",
    "HKCategoryValueSleepAnalysisAsleepDeep": "sleepDeepH",
    "HKCategoryValueSleepAnalysisAsleepREM": "sleepRemH",
    "HKCategoryValueSleepAnalysisAwake": "sleepAwakeH",
}
# Summed per source; the largest source wins (iPhone and Watch overlap).
SUM_BY_SOURCE = {
    "StepCount": ("steps", None),
    "DistanceWalkingRunning": ("distanceKm", "km"),
    "DistanceCycling": ("cyclingKm", "km"),
    "FlightsClimbed": ("flights", None),
}
TWO_DP = {"distanceKm", "cyclingKm"}
SUM_ALL = {
    "ActiveEnergyBurned": "activeKcal",
    "BasalEnergyBurned": "basalKcal",
    "AppleExerciseTime": "exerciseMin",
    "AppleStandTime": "standMin",
    "TimeInDaylight": "daylightMin",
}
MEAN = {
    "RestingHeartRate": ("restingHr", None),
    "HeartRateVariabilitySDNN": ("hrv", None),
    "WalkingHeartRateAverage": ("walkingHr", None),
    "VO2Max": ("vo2max", None),
    "HeartRateRecoveryOneMinute": ("hrRecovery", None),
    "BodyMass": ("weightKg", None),
    "BodyFatPercentage": ("bodyFatPct", "pct"),
    "RespiratoryRate": ("respiratoryRate", None),
    "OxygenSaturation": ("spo2", "pct"),
    "AppleSleepingWristTemperature": ("wristTempC", "degC"),
    "WalkingSpeed": ("walkingSpeed", "kmh"),
    "WalkingStepLength": ("stepLengthCm", "cm"),
    "WalkingAsymmetryPercentage": ("walkingAsymmetry", "pct"),
    "WalkingDoubleSupportPercentage": ("doubleSupport", "pct"),
    "SixMinuteWalkTestDistance": ("sixMinWalkM", "m"),
    "EnvironmentalAudioExposure": ("envAudioDb", None),
    "HeadphoneAudioExposure": ("headphoneDb", None),
}


def rnd(v, nd=0):
    """Round half up, like JavaScript's Math.round (Python's round() rounds half to even)."""
    f = 10 ** nd
    r = math.floor(v * f + 0.5) / f
    return int(r) if nd == 0 else r


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


def convert(v, conv, unit):
    if conv == "km":
        return km(v, unit)
    if conv == "m":
        return v * {"km": 1000, "mi": 1609.344, "ft": 0.3048}.get(unit, 1)
    if conv == "kmh":
        return v * {"mi/hr": 1.609344, "m/s": 3.6}.get(unit, 1)
    if conv == "cm":
        return v * {"in": 2.54, "m": 100}.get(unit, 1)
    if conv == "pct":
        return v * 100
    if conv == "degC":
        return (v - 32) * 5 / 9 if unit == "degF" else v
    return v


def clock_min(s, day):
    """Clock time of s in minutes after midnight of day (negative = the evening before)."""
    m = int(s[11:13]) * 60 + int(s[14:16])
    return m - 1440 if s[:10] < day else m


def main(src, dst):
    by_source = defaultdict(lambda: defaultdict(float))  # (day, key) -> source -> sum
    sums = defaultdict(float)
    means = defaultdict(list)
    hr = defaultdict(list)
    stand_hours = defaultdict(int)
    sleep = defaultdict(list)  # source -> [start, end, start string, end string]
    stages = defaultdict(lambda: defaultdict(list))  # source -> stage key -> [start, end]
    workouts = []

    with open_xml(src) as fh:
        for _, el in ET.iterparse(fh, events=("end",)):
            if el.tag == "Record":
                t = short(el.get("type", ""))
                start = el.get("startDate")
                day = start[:10] if start else None
                if not day:
                    el.clear()
                    continue
                unit = el.get("unit")
                if t in SUM_BY_SOURCE:
                    key, conv = SUM_BY_SOURCE[t]
                    by_source[(day, key)][el.get("sourceName", "?")] += convert(float(el.get("value", 0)), conv, unit)
                elif t in SUM_ALL:
                    sums[(day, SUM_ALL[t])] += float(el.get("value", 0))
                elif t in MEAN:
                    key, conv = MEAN[t]
                    means[(day, key)].append(convert(float(el.get("value", 0)), conv, unit))
                elif t == "HeartRate":
                    hr[day].append(float(el.get("value", 0)))
                elif t == "AppleStandHour":
                    if el.get("value") == "HKCategoryValueAppleStandHourStood":
                        stand_hours[day] += 1
                elif t == "MindfulSession":
                    sums[(day, "mindfulMin")] += (parse_dt(el.get("endDate")) - parse_dt(start)).total_seconds() / 60
                elif t == "SleepAnalysis":
                    s, e = parse_dt(start), parse_dt(el.get("endDate"))
                    if el.get("value") in ASLEEP:
                        sleep[el.get("sourceName", "?")].append([s, e, start, el.get("endDate")])
                    if el.get("value") in STAGES:
                        stages[el.get("sourceName", "?")][STAGES[el.get("value")]].append([s, e])
                el.clear()
            elif el.tag == "Workout":
                stats = {short(s.get("type", "")): s for s in el.findall("WorkoutStatistics")}
                dist = stats.get("DistanceWalkingRunning")
                energy = stats.get("ActiveEnergyBurned")
                whr = stats.get("HeartRate")
                dur = float(el.get("duration", 0))
                if el.get("durationUnit") == "s":
                    dur /= 60
                workouts.append({
                    "type": el.get("workoutActivityType", "").replace("HKWorkoutActivityType", ""),
                    "start": el.get("startDate"),
                    "durationMin": rnd(dur, 1),
                    "distanceKm": rnd(km(dist.get("sum"), dist.get("unit")), 2) if dist is not None and dist.get("sum") else None,
                    "activeKcal": rnd(float(energy.get("sum"))) if energy is not None and energy.get("sum") else None,
                    "avgHr": rnd(float(whr.get("average"))) if whr is not None and whr.get("average") else None,
                })
                el.clear()

    days = defaultdict(dict)
    for (day, key), per_src in by_source.items():
        v = max(per_src.values())  # watch and phone overlap, so take the larger, not the sum
        days[day][key] = rnd(v, 2) if key in TWO_DP else rnd(v)
    for (day, key), v in sums.items():
        days[day][key] = rnd(v)
    for (day, key), vals in means.items():
        days[day][key] = rnd(sum(vals) / len(vals), 1)
    for day, vals in hr.items():
        days[day]["hrAvg"] = rnd(sum(vals) / len(vals))
        days[day]["hrMin"] = rnd(min(vals))
        days[day]["hrMax"] = rnd(max(vals))
    for day, n in stand_hours.items():
        days[day]["standHours"] = n

    # Sleep: use the source with the most data, merge overlaps, credit to the wake-up day.
    if sleep:
        src_name = max(sleep, key=lambda k: len(sleep[k]))
        merged = []
        for s, e, s_str, e_str in sorted(sleep[src_name], key=lambda x: x[0]):
            if merged and s <= merged[-1][1]:
                if e > merged[-1][1]:
                    merged[-1][1] = e
                    merged[-1][3] = e_str
            else:
                merged.append([s, e, s_str, e_str])
        # Group into nights: gaps under 3 h join the same night.
        nights = []
        for s, e, s_str, e_str in merged:
            if nights and s - nights[-1]["end"] < timedelta(hours=3):
                nights[-1]["end"] = e
                nights[-1]["end_str"] = e_str
                nights[-1]["mins"] += (e - s).total_seconds() / 60
            else:
                nights.append({"start": s, "end": e, "start_str": s_str, "end_str": e_str, "mins": (e - s).total_seconds() / 60})
        stage_spans = {}
        for key, iv in sorted(stages.get(src_name, {}).items()):
            out = []
            for s, e in sorted(iv, key=lambda x: x[0]):
                if out and s <= out[-1][1]:
                    out[-1][1] = max(out[-1][1], e)
                else:
                    out.append([s, e])
            stage_spans[key] = out
        for n in nights:
            if n["mins"] >= 60:
                d = n["end_str"][:10]
                days[d]["sleepH"] = rnd(days[d].get("sleepH", 0) + n["mins"] / 60, 2)
                for key, spans in stage_spans.items():
                    mins = sum(max(0, (min(e, n["end"]) - max(s, n["start"])).total_seconds()) / 60 for s, e in spans)
                    if mins > 0:
                        days[d][key] = rnd(days[d].get(key, 0) + mins / 60, 2)
                days[d].setdefault("sleepStartMin", clock_min(n["start_str"], d))
                days[d]["sleepEndMin"] = clock_min(n["end_str"], d)

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
