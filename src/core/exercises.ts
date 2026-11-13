/* Exercise library: names, muscle group, equipment and which pictogram to draw.
   Every pictogram is one specific body position (standing, seated on a bench, lying, bent over,
   hanging) with its equipment, so an exercise never borrows the pose of a different movement.
   Names the library doesn't know are classified by keywords, most specific first, so any exercise
   still gets the right group and pose (or a generated monogram). */
import type { ExerciseKind } from './types';

export type Muscle = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'full';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'other';
export type Pictogram =
  // chest
  | 'benchBB' | 'benchDB' | 'inclineBB' | 'inclineDB' | 'flyDB' | 'cableFly' | 'chestMachine'
  | 'pushup' | 'pushupClose' | 'pushupIncline' | 'pushupDecline' | 'pike' | 'dip' | 'benchDip'
  // back
  | 'deadlift' | 'rdl' | 'rowBB' | 'rowDB' | 'rowSupported' | 'cableRow' | 'pulldown' | 'pullup' | 'muscleup'
  | 'hang' | 'shrug' | 'facepull' | 'backExt'
  // legs
  | 'squatBB' | 'squatFront' | 'squatGoblet' | 'pistol' | 'hackSquat' | 'legpress' | 'splitSquat' | 'lunge'
  | 'legcurl' | 'legext' | 'hipthrust' | 'calf' | 'boxjump' | 'broadjump'
  // shoulders
  | 'ohpBB' | 'ohpDB' | 'ohpSeated' | 'lateral' | 'frontRaise' | 'rearFly' | 'handstand'
  // arms
  | 'curlDB' | 'curlSeated' | 'curlIncline' | 'curlBB' | 'hammer' | 'preacher' | 'pushdown' | 'skull'
  | 'tricepsOH' | 'tricepsOHSeated'
  // core
  | 'plank' | 'hollow' | 'lyingLegRaise' | 'hangLegRaise' | 'crunch' | 'abwheel' | 'lever' | 'leverTuck' | 'lsit'
  // full body
  | 'swing' | 'carry' | 'burpee' | 'run';

export type ExerciseInfo = { name: string; muscle: Muscle; equipment: Equipment; icon: Pictogram | null; kind: ExerciseKind };

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', back: 'Back', legs: 'Legs', shoulders: 'Shoulders', arms: 'Arms', core: 'Core', full: 'Full body',
};
export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', machine: 'Machine', cable: 'Cable', bodyweight: 'Bodyweight', kettlebell: 'Kettlebell', other: 'Other',
};

const E = (name: string, muscle: Muscle, equipment: Equipment, icon: Pictogram, kind: ExerciseKind = 'weight'): ExerciseInfo => ({ name, muscle, equipment, icon, kind });

export const LIBRARY: ExerciseInfo[] = [
  // Chest
  E('Bench press', 'chest', 'barbell', 'benchBB'),
  E('Incline bench press', 'chest', 'barbell', 'inclineBB'),
  E('Dumbbell bench press', 'chest', 'dumbbell', 'benchDB'),
  E('Incline dumbbell press', 'chest', 'dumbbell', 'inclineDB'),
  E('Chest fly', 'chest', 'dumbbell', 'flyDB'),
  E('Cable fly', 'chest', 'cable', 'cableFly'),
  E('Chest press machine', 'chest', 'machine', 'chestMachine'),
  E('Push-ups', 'chest', 'bodyweight', 'pushup', 'bw'),
  E('Incline push-ups', 'chest', 'bodyweight', 'pushupIncline', 'bw'),
  E('Decline push-ups', 'chest', 'bodyweight', 'pushupDecline', 'bw'),
  E('Diamond push-ups', 'arms', 'bodyweight', 'pushupClose', 'bw'),
  E('Dips', 'chest', 'bodyweight', 'dip', 'bw'),
  E('Weighted dips', 'chest', 'bodyweight', 'dip', 'bw'),
  // Back
  E('Deadlift', 'back', 'barbell', 'deadlift'),
  E('Barbell row', 'back', 'barbell', 'rowBB'),
  E('Dumbbell row', 'back', 'dumbbell', 'rowDB'),
  E('Chest-supported row', 'back', 'machine', 'rowSupported'),
  E('T-bar row', 'back', 'barbell', 'rowBB'),
  E('Cable row', 'back', 'cable', 'cableRow'),
  E('Seated cable row', 'back', 'cable', 'cableRow'),
  E('Lat pulldown', 'back', 'cable', 'pulldown'),
  E('Pull-ups', 'back', 'bodyweight', 'pullup', 'bw'),
  E('Weighted pull-ups', 'back', 'bodyweight', 'pullup', 'bw'),
  E('Chin-ups', 'back', 'bodyweight', 'pullup', 'bw'),
  E('Muscle-ups', 'back', 'bodyweight', 'muscleup', 'bw'),
  E('Dead hang', 'back', 'bodyweight', 'hang', 'hold'),
  E('Back extension', 'back', 'bodyweight', 'backExt', 'bw'),
  E('Shrugs', 'back', 'dumbbell', 'shrug'),
  E('Face pull', 'shoulders', 'cable', 'facepull'),
  // Legs
  E('Squat', 'legs', 'barbell', 'squatBB'),
  E('Front squat', 'legs', 'barbell', 'squatFront'),
  E('Hack squat', 'legs', 'machine', 'hackSquat'),
  E('Goblet squat', 'legs', 'dumbbell', 'squatGoblet'),
  E('Leg press', 'legs', 'machine', 'legpress'),
  E('Romanian deadlift', 'legs', 'barbell', 'rdl'),
  E('Bulgarian split squat', 'legs', 'dumbbell', 'splitSquat'),
  E('Lunges', 'legs', 'dumbbell', 'lunge'),
  E('Leg curl', 'legs', 'machine', 'legcurl'),
  E('Leg extension', 'legs', 'machine', 'legext'),
  E('Hip thrust', 'legs', 'barbell', 'hipthrust'),
  E('Calf raise', 'legs', 'machine', 'calf'),
  E('Pistol squat', 'legs', 'bodyweight', 'pistol', 'bw'),
  E('Box jump', 'legs', 'bodyweight', 'boxjump', 'bw'),
  E('Broad jump', 'legs', 'bodyweight', 'broadjump', 'bw'),
  // Shoulders
  E('Overhead press', 'shoulders', 'barbell', 'ohpBB'),
  E('Dumbbell shoulder press', 'shoulders', 'dumbbell', 'ohpDB'),
  E('Seated dumbbell shoulder press', 'shoulders', 'dumbbell', 'ohpSeated'),
  E('Arnold press', 'shoulders', 'dumbbell', 'ohpSeated'),
  E('Lateral raise', 'shoulders', 'dumbbell', 'lateral'),
  E('Front raise', 'shoulders', 'dumbbell', 'frontRaise'),
  E('Rear delt fly', 'shoulders', 'dumbbell', 'rearFly'),
  E('Pike push-ups', 'shoulders', 'bodyweight', 'pike', 'bw'),
  E('Wall handstand push-ups', 'shoulders', 'bodyweight', 'handstand', 'bw'),
  E('Wall handstand hold', 'shoulders', 'bodyweight', 'handstand', 'hold'),
  // Arms
  E('Biceps curl', 'arms', 'dumbbell', 'curlDB'),
  E('Seated dumbbell curl', 'arms', 'dumbbell', 'curlSeated'),
  E('Incline dumbbell curl', 'arms', 'dumbbell', 'curlIncline'),
  E('Barbell curl', 'arms', 'barbell', 'curlBB'),
  E('Hammer curl', 'arms', 'dumbbell', 'hammer'),
  E('Preacher curl', 'arms', 'machine', 'preacher'),
  E('Triceps pushdown', 'arms', 'cable', 'pushdown'),
  E('Skull crusher', 'arms', 'barbell', 'skull'),
  E('Overhead triceps extension', 'arms', 'dumbbell', 'tricepsOH'),
  E('Seated overhead triceps extension', 'arms', 'dumbbell', 'tricepsOHSeated'),
  E('Bench dips', 'arms', 'bodyweight', 'benchDip', 'bw'),
  // Core
  E('Plank', 'core', 'bodyweight', 'plank', 'hold'),
  E('Hollow hold', 'core', 'bodyweight', 'hollow', 'hold'),
  E('Lying leg raise', 'core', 'bodyweight', 'lyingLegRaise', 'bw'),
  E('Hanging leg raise', 'core', 'bodyweight', 'hangLegRaise', 'bw'),
  E('Crunch', 'core', 'bodyweight', 'crunch', 'bw'),
  E('Ab wheel rollout', 'core', 'other', 'abwheel', 'bw'),
  E('Tuck front lever hold', 'core', 'bodyweight', 'leverTuck', 'hold'),
  E('Front lever hold', 'core', 'bodyweight', 'lever', 'hold'),
  E('L-sit hold', 'core', 'bodyweight', 'lsit', 'hold'),
  // Full body
  E('Kettlebell swing', 'full', 'kettlebell', 'swing'),
  E("Farmer's carry", 'full', 'dumbbell', 'carry'),
  E('Burpees', 'full', 'bodyweight', 'burpee', 'bw'),
];

const byName = new Map(LIBRARY.map(e => [e.name.toLowerCase(), e]));

/* Keyword rules for names outside the library, checked in order: a variation always comes before
   the general movement ("pike push-up" before "push-up", "hanging leg raise" before "leg raise"). */
const RULES: [RegExp, Pictogram, Muscle][] = [
  // levers, handstands, hangs
  [/tuck.*lever/, 'leverTuck', 'core'],
  [/front lever|back lever|\blever\b/, 'lever', 'core'],
  [/handstand|hspu/, 'handstand', 'shoulders'],
  [/l-?sit/, 'lsit', 'core'],
  [/hollow/, 'hollow', 'core'],
  // leg raises: only "hanging" hangs from a bar
  [/hanging.*(leg|knee) raise|toes to bar|knees to/, 'hangLegRaise', 'core'],
  [/leg raise|leg lift|flutter/, 'lyingLegRaise', 'core'],
  [/ab wheel|rollout/, 'abwheel', 'core'],
  [/plank/, 'plank', 'core'],
  [/crunch|sit-?up|russian twist/, 'crunch', 'core'],
  // push-up family, by body angle
  [/pike/, 'pike', 'shoulders'],
  [/decline push|feet-?elevated/, 'pushupDecline', 'chest'],
  [/incline push|hands-?elevated/, 'pushupIncline', 'chest'],
  [/diamond|close-?grip push|narrow push|triangle push/, 'pushupClose', 'arms'],
  [/push-?up|press-?up/, 'pushup', 'chest'],
  [/bench dip/, 'benchDip', 'arms'],
  [/\bdips?\b/, 'dip', 'chest'],
  // pulls
  [/muscle-?up/, 'muscleup', 'back'],
  [/pull-?up|chin-?up/, 'pullup', 'back'],
  [/dead hang|\bhang\b/, 'hang', 'back'],
  [/pulldown|pull-down/, 'pulldown', 'back'],
  // legs before arm curls and presses ("leg curl", "leg press")
  [/hip thrust|glute bridge/, 'hipthrust', 'legs'],
  [/leg press/, 'legpress', 'legs'],
  [/leg curl|hamstring curl|nordic/, 'legcurl', 'legs'],
  [/leg extension/, 'legext', 'legs'],
  [/calf/, 'calf', 'legs'],
  [/bulgarian|split squat/, 'splitSquat', 'legs'],
  [/lunge|step-?up/, 'lunge', 'legs'],
  [/front squat/, 'squatFront', 'legs'],
  [/goblet/, 'squatGoblet', 'legs'],
  [/pistol/, 'pistol', 'legs'],
  [/hack/, 'hackSquat', 'legs'],
  [/squat/, 'squatBB', 'legs'],
  [/romanian|\brdl\b|stiff-?leg|good morning/, 'rdl', 'legs'],
  [/deadlift/, 'deadlift', 'back'],
  [/back extension|hyperextension/, 'backExt', 'back'],
  [/box jump/, 'boxjump', 'legs'],
  [/broad jump|long jump/, 'broadjump', 'legs'],
  [/burpee/, 'burpee', 'full'],
  [/jump|plyo/, 'boxjump', 'legs'],
  // curls: hammer is the only one with the dumbbell upright
  [/hammer/, 'hammer', 'arms'],
  [/preacher/, 'preacher', 'arms'],
  [/incline.*curl/, 'curlIncline', 'arms'],
  [/seated.*curl|concentration/, 'curlSeated', 'arms'],
  [/barbell curl|ez.*curl|\bbar curl/, 'curlBB', 'arms'],
  [/curl/, 'curlDB', 'arms'],
  // triceps
  [/skull|lying triceps/, 'skull', 'arms'],
  [/seated.*(triceps|extension)/, 'tricepsOHSeated', 'arms'],
  [/overhead.*(triceps|extension)|triceps extension|french press/, 'tricepsOH', 'arms'],
  [/pushdown|push-down|pressdown/, 'pushdown', 'arms'],
  [/triceps|tricep/, 'pushdown', 'arms'],
  // flies and raises
  [/cable fly|crossover/, 'cableFly', 'chest'],
  [/rear delt|reverse fly/, 'rearFly', 'shoulders'],
  [/\bfly|flye|pec deck/, 'flyDB', 'chest'],
  [/front raise/, 'frontRaise', 'shoulders'],
  [/lateral|side raise|\braise\b/, 'lateral', 'shoulders'],
  // rows
  [/chest-?supported|seal row|incline row/, 'rowSupported', 'back'],
  [/dumbbell row|one-?arm|single-?arm row/, 'rowDB', 'back'],
  [/seated.*row|cable row|low row/, 'cableRow', 'back'],
  [/face pull/, 'facepull', 'shoulders'],
  [/\brow\b|rows\b/, 'rowBB', 'back'],
  // presses
  [/seated.*(shoulder|overhead|dumbbell) press|arnold/, 'ohpSeated', 'shoulders'],
  [/(dumbbell|\bdb\b).*(shoulder|overhead) press|(shoulder|overhead) press.*(dumbbell|\bdb\b)/, 'ohpDB', 'shoulders'],
  [/overhead|shoulder press|military|\bohp\b|push press/, 'ohpBB', 'shoulders'],
  [/incline.*(dumbbell|\bdb\b)|(dumbbell|\bdb\b).*incline/, 'inclineDB', 'chest'],
  [/incline/, 'inclineBB', 'chest'],
  [/(dumbbell|\bdb\b).*(bench|press)|floor press/, 'benchDB', 'chest'],
  [/chest press|machine press/, 'chestMachine', 'chest'],
  [/bench/, 'benchBB', 'chest'],
  [/shrug/, 'shrug', 'back'],
  [/swing|kettlebell|snatch|clean/, 'swing', 'full'],
  [/carry|farmer/, 'carry', 'full'],
  [/run|sprint|jog|treadmill/, 'run', 'full'],
];

function guessEquipment(n: string): Equipment {
  if (/dumbbell|\bdb\b|goblet|arnold|hammer/.test(n)) return 'dumbbell';
  if (/kettlebell|\bkb\b/.test(n)) return 'kettlebell';
  if (/cable|pulldown|pushdown|face pull/.test(n)) return 'cable';
  if (/machine|press machine|hack|leg press|leg curl|leg extension|smith|pec deck/.test(n)) return 'machine';
  if (/push-?up|pull-?up|chin-?up|dip|plank|lever|handstand|muscle-?up|pistol|jump|burpee|leg raise|crunch|sit-?up|l-?sit|hollow|hang/.test(n)) return 'bodyweight';
  if (/barbell|bench|squat|deadlift|row|press|curl|thrust/.test(n)) return 'barbell';
  return 'other';
}

/** "Push-up" and "Push-ups", "Dip" and "Dips" are the same library entry. */
const singular = (n: string) => n.replace(/s\b/g, '');

/** Library entry, or a best guess from the name. `icon: null` means draw a monogram. */
export function exerciseInfo(name: string, kind?: ExerciseKind): ExerciseInfo {
  const n = name.trim().toLowerCase();
  const hit = byName.get(n) ?? LIBRARY.find(e => singular(e.name.toLowerCase()) === singular(n));
  if (hit) return kind ? { ...hit, kind } : hit;
  const rule = RULES.find(([re]) => re.test(n));
  const fallbackKind: ExerciseKind = kind ?? (/hold|lever|plank|handstand|l-?sit|hang\b/.test(n) ? 'hold' : /push-?up|pull-?up|chin-?up|dip|muscle-?up|pistol|jump|burpee|leg raise/.test(n) ? 'bw' : 'weight');
  return { name: name.trim(), muscle: rule?.[2] ?? 'full', equipment: guessEquipment(n), icon: rule?.[1] ?? null, kind: fallbackKind };
}

/** Two-letter monogram for exercises without a pictogram ("Zercher squat" → "ZS"). */
export function monogram(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length === 1 ? words[0]!.slice(0, 2) : words[0]![0]! + words[1]![0]!).toUpperCase();
}
