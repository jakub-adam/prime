/* A synthetic Apple Health export.zip with one watch run (HR, distance, a GPX route), shaped like
   the real thing. Default: today's run on 28 Oct, 09:49:46 +0100, 2.54 km in 17:12, avg HR 175. */
import { strToU8, zipSync } from 'fflate';
import { syntheticWorkout } from '../../../src/core/synthetic';
import { hkTime } from '../../../src/core/workout';

export const RUN_START = '2026-10-28 09:49:46 +0100';

/** Export-style local time at +0100. */
const hk = (ms: number) => {
  const d = new Date(ms + 3600e3).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 19)} +0100`;
};

export function syntheticRun(start = RUN_START) {
  return syntheticWorkout({ startMs: hkTime(start), km: 2.54, sec: 1032, avgHr: 175 });
}

export function syntheticExport(start = RUN_START, extraXml = '') {
  const run = syntheticRun(start);
  const recs = [
    ...run.hr.map(h => `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" startDate="${hk(h.t)}" endDate="${hk(h.t)}" value="${h.v}"/>`),
    ...run.dist.map(d => `<Record type="HKQuantityTypeIdentifierDistanceWalkingRunning" sourceName="Watch" unit="km" startDate="${hk(d.start)}" endDate="${hk(d.end)}" value="${d.km.toFixed(5)}"/>`),
    // the phone also counted distance during the run; it must not be added to the watch's
    `<Record type="HKQuantityTypeIdentifierDistanceWalkingRunning" sourceName="iPhone" unit="km" startDate="${hk(run.startMs)}" endDate="${hk(run.endMs)}" value="2.31"/>`,
  ];
  const end = hk(run.endMs);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_SK">
 ${recs.join('\n ')}
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="17.2" durationUnit="min" sourceName="Watch" startDate="${start}" endDate="${end}">
  <MetadataEntry key="HKIndoorWorkout" value="0"/>
  <MetadataEntry key="HKElevationAscended" value="1210 cm"/>
  <MetadataEntry key="HKTimeZone" value="Europe/Bratislava"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierStepCount" startDate="${start}" endDate="${end}" sum="2820" unit="count"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="${start}" endDate="${end}" sum="197.2" unit="kcal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="${start}" endDate="${end}" sum="2.54" unit="km"/>
  <WorkoutRoute sourceName="Watch" startDate="${start}" endDate="${end}">
   <MetadataEntry key="HKMetadataKeySyncVersion" value="2"/>
   <FileReference path="/workout-routes/route_2026-10-28_10.07am.gpx"/>
  </WorkoutRoute>
 </Workout>
 ${extraXml}
</HealthData>`;
  const gpx = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"><trk><trkseg>
${run.route!.map(p => `<trkpt lon="${p.lng.toFixed(6)}" lat="${p.lat.toFixed(6)}"><ele>${p.ele!.toFixed(3)}</ele><time>${new Date(p.t).toISOString().replace('.000', '')}</time></trkpt>`).join('\n')}
</trkseg></trk></gpx>`;
  return zipSync({ 'apple_health_export/export.xml': strToU8(xml), 'apple_health_export/workout-routes/route_2026-10-28_10.07am.gpx': strToU8(gpx) });
}
