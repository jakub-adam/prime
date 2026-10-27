/* Exercise library: names, muscle group, equipment and which pictogram to draw.
   Names the library doesn't know are classified by keywords, so any exercise still gets a
   sensible group and icon (or a generated monogram). */
import type { ExerciseKind } from './types';

export type Muscle = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'full';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'other';
export type Pictogram =
  | 'bench' | 'incline' | 'squat' | 'deadlift' | 'ohp' | 'row' | 'pullup' | 'dip' | 'pushup' | 'lunge' | 'legpress'
  | 'legext' | 'legcurl' | 'hipthrust' | 'curl' | 'raise' | 'pulldown' | 'cable' | 'plank' | 'lever' | 'handstand'
  | 'jump' | 'legraise' | 'calf' | 'crunch' | 'swing' | 'carry' | 'run' | 'fly' | 'pushdown' | 'shrug';

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
  E('Bench press', 'chest', 'barbell', 'bench'),
  E('Incline bench press', 'chest', 'barbell', 'incline'),
  E('Dumbbell bench press', 'chest', 'dumbbell', 'bench'),
  E('Incline dumbbell press', 'chest', 'dumbbell', 'incline'),
  E('Chest fly', 'chest', 'dumbbell', 'fly'),
  E('Cable fly', 'chest', 'cable', 'fly'),
  E('Chest press machine', 'chest', 'machine', 'bench'),
  E('Push-ups', 'chest', 'bodyweight', 'pushup', 'bw'),
  E('Dips', 'chest', 'bodyweight', 'dip', 'bw'),
  E('Weighted dips', 'chest', 'bodyweight', 'dip', 'bw'),
  // Back
  E('Deadlift', 'back', 'barbell', 'deadlift'),
  E('Barbell row', 'back', 'barbell', 'row'),
  E('Dumbbell row', 'back', 'dumbbell', 'row'),
  E('Chest-supported row', 'back', 'machine', 'row'),
  E('T-bar row', 'back', 'barbell', 'row'),
  E('Cable row', 'back', 'cable', 'cable'),
  E('Lat pulldown', 'back', 'cable', 'pulldown'),
  E('Pull-ups', 'back', 'bodyweight', 'pullup', 'bw'),
  E('Weighted pull-ups', 'back', 'bodyweight', 'pullup', 'bw'),
  E('Chin-ups', 'back', 'bodyweight', 'pullup', 'bw'),
  E('Muscle-ups', 'back', 'bodyweight', 'pullup', 'bw'),
  E('Shrugs', 'back', 'dumbbell', 'shrug'),
  E('Face pull', 'shoulders', 'cable', 'cable'),
  // Legs
  E('Squat', 'legs', 'barbell', 'squat'),
  E('Front squat', 'legs', 'barbell', 'squat'),
  E('Hack squat', 'legs', 'machine', 'squat'),
  E('Goblet squat', 'legs', 'dumbbell', 'squat'),
  E('Leg press', 'legs', 'machine', 'legpress'),
  E('Romanian deadlift', 'legs', 'barbell', 'deadlift'),
  E('Bulgarian split squat', 'legs', 'dumbbell', 'lunge'),
  E('Lunges', 'legs', 'dumbbell', 'lunge'),
  E('Leg curl', 'legs', 'machine', 'legcurl'),
  E('Leg extension', 'legs', 'machine', 'legext'),
  E('Hip thrust', 'legs', 'barbell', 'hipthrust'),
  E('Calf raise', 'legs', 'machine', 'calf'),
  E('Pistol squat', 'legs', 'bodyweight', 'squat', 'bw'),
  E('Box jump', 'legs', 'bodyweight', 'jump', 'bw'),
  E('Broad jump', 'legs', 'bodyweight', 'jump', 'bw'),
  // Shoulders
  E('Overhead press', 'shoulders', 'barbell', 'ohp'),
  E('Dumbbell shoulder press', 'shoulders', 'dumbbell', 'ohp'),
  E('Arnold press', 'shoulders', 'dumbbell', 'ohp'),
  E('Lateral raise', 'shoulders', 'dumbbell', 'raise'),
  E('Rear delt fly', 'shoulders', 'dumbbell', 'raise'),
  E('Wall handstand push-ups', 'shoulders', 'bodyweight', 'handstand', 'bw'),
  E('Wall handstand hold', 'shoulders', 'bodyweight', 'handstand', 'hold'),
  // Arms
  E('Biceps curl', 'arms', 'dumbbell', 'curl'),
  E('Barbell curl', 'arms', 'barbell', 'curl'),
  E('Hammer curl', 'arms', 'dumbbell', 'curl'),
  E('Preacher curl', 'arms', 'machine', 'curl'),
  E('Triceps pushdown', 'arms', 'cable', 'pushdown'),
  E('Skull crusher', 'arms', 'barbell', 'bench'),
  E('Overhead triceps extension', 'arms', 'dumbbell', 'ohp'),
  // Core
  E('Plank', 'core', 'bodyweight', 'plank', 'hold'),
  E('Hanging leg raise', 'core', 'bodyweight', 'legraise', 'bw'),
  E('Crunch', 'core', 'bodyweight', 'crunch', 'bw'),
  E('Ab wheel rollout', 'core', 'other', 'plank', 'bw'),
  E('Tuck front lever hold', 'core', 'bodyweight', 'lever', 'hold'),
  E('Front lever hold', 'core', 'bodyweight', 'lever', 'hold'),
  E('L-sit hold', 'core', 'bodyweight', 'dip', 'hold'),
  // Full body
  E('Kettlebell swing', 'full', 'kettlebell', 'swing'),
  E("Farmer's carry", 'full', 'dumbbell', 'carry'),
  E('Burpees', 'full', 'bodyweight', 'jump', 'bw'),
];

const byName = new Map(LIBRARY.map(e => [e.name.toLowerCase(), e]));

/* Keyword rules for names outside the library, checked in order. */
const RULES: [RegExp, Pictogram, Muscle][] = [
  [/front lever|back lever|\blever\b/, 'lever', 'core'],
  [/handstand|hspu/, 'handstand', 'shoulders'],
  [/plank|hollow|l-?sit|ab wheel|rollout/, 'plank', 'core'],
  [/leg raise|toes to bar|knee raise/, 'legraise', 'core'],
  [/crunch|sit-?up|russian twist/, 'crunch', 'core'],
  [/pull-?up|chin-?up|muscle-?up/, 'pullup', 'back'],
  [/pulldown|pull-down/, 'pulldown', 'back'],
  [/push-?up|press-?up/, 'pushup', 'chest'],
  [/\bdips?\b/, 'dip', 'chest'],
  [/incline/, 'incline', 'chest'],
  [/\bfly|flye|pec deck/, 'fly', 'chest'],
  [/bench|chest press|floor press|skull/, 'bench', 'chest'],
  [/romanian|rdl|deadlift|good morning/, 'deadlift', 'back'],
  [/hip thrust|glute bridge/, 'hipthrust', 'legs'],
  [/leg press/, 'legpress', 'legs'],
  [/leg curl|hamstring curl|nordic/, 'legcurl', 'legs'],
  [/leg extension/, 'legext', 'legs'],
  [/calf/, 'calf', 'legs'],
  [/split squat|lunge|step-?up/, 'lunge', 'legs'],
  [/squat/, 'squat', 'legs'],
  [/jump|burpee|plyo/, 'jump', 'legs'],
  [/pushdown|push-down/, 'pushdown', 'arms'],
  [/curl/, 'curl', 'arms'],
  [/triceps|tricep/, 'pushdown', 'arms'],
  [/lateral|rear delt|front raise|\braise\b/, 'raise', 'shoulders'],
  [/overhead|shoulder press|military|\bohp\b|arnold|push press/, 'ohp', 'shoulders'],
  [/face pull|cable/, 'cable', 'back'],
  [/\brow\b|rows\b/, 'row', 'back'],
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
  if (/push-?up|pull-?up|chin-?up|dip|plank|lever|handstand|muscle-?up|pistol|jump|burpee|leg raise|crunch|sit-?up|l-?sit/.test(n)) return 'bodyweight';
  if (/barbell|bench|squat|deadlift|row|press|curl|thrust/.test(n)) return 'barbell';
  return 'other';
}

/** Library entry, or a best guess from the name. `icon: null` means draw a monogram. */
export function exerciseInfo(name: string, kind?: ExerciseKind): ExerciseInfo {
  const n = name.trim().toLowerCase();
  const hit = byName.get(n);
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
