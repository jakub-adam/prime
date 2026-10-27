/* Exercise pictograms: one side-on stick figure per movement pattern, drawn on a 48×48 grid with
   the same stroke, head size and equipment shapes so they read as one set. Coloured by muscle group.
   Exercises without a pictogram get a generated monogram tile in the same style. */
import type { ReactNode } from 'react';
import { exerciseInfo, monogram, type Muscle, type Pictogram } from '@/core/exercises';
import type { ExerciseKind } from '@/core/types';
import { cn } from '@/lib/utils';

export const MUSCLE_COLOR: Record<Muscle, string> = {
  chest: 'var(--cat-heart)', back: 'var(--cat-respiratory)', legs: 'var(--cat-activity)', shoulders: 'var(--cat-mobility)',
  arms: 'var(--cat-body)', core: 'var(--cat-mind)', full: 'var(--cat-sleep)',
};

/* ---- building blocks ---- */
const Head = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={3.6} fill="currentColor" stroke="none" />;
const P = ({ d }: { d: string }) => <polyline points={d} />;
/** Barbell seen from the side: a plate with the bar end in the middle. */
const Plate = ({ x, y, r = 4.6 }: { x: number; y: number; r?: number }) => (
  <g><circle cx={x} cy={y} r={r} /><circle cx={x} cy={y} r={1} fill="currentColor" stroke="none" /></g>
);
/** Dumbbell: two blocks on a short handle, horizontal or vertical. */
const DB = ({ x, y, v }: { x: number; y: number; v?: boolean }) => v ? (
  <g><line x1={x} y1={y - 4} x2={x} y2={y + 4} /><rect x={x - 2.6} y={y - 6.5} width={5.2} height={3} rx={1} fill="currentColor" stroke="none" /><rect x={x - 2.6} y={y + 3.5} width={5.2} height={3} rx={1} fill="currentColor" stroke="none" /></g>
) : (
  <g><line x1={x - 4} y1={y} x2={x + 4} y2={y} /><rect x={x - 6.5} y={y - 2.6} width={3} height={5.2} rx={1} fill="currentColor" stroke="none" /><rect x={x + 3.5} y={y - 2.6} width={3} height={5.2} rx={1} fill="currentColor" stroke="none" /></g>
);
const Floor = ({ y = 43, x1 = 6, x2 = 42 }: { y?: number; x1?: number; x2?: number }) => <line x1={x1} y1={y} x2={x2} y2={y} strokeOpacity={0.45} />;

const PICTOS: Record<Pictogram, ReactNode> = {
  bench: (<>
    <line x1={7} y1={34} x2={33} y2={34} strokeOpacity={0.45} /><line x1={11} y1={34} x2={11} y2={42} strokeOpacity={0.45} /><line x1={29} y1={34} x2={29} y2={42} strokeOpacity={0.45} />
    <Head x={10} y={28.5} /><P d="14,30 30,30 36,24 37,41" /><P d="18,30 18,19" /><Plate x={18} y={14.5} />
  </>),
  incline: (<>
    <line x1={11} y1={27} x2={30} y2={37} strokeOpacity={0.45} /><line x1={24} y1={34} x2={24} y2={42} strokeOpacity={0.45} />
    <Head x={12} y={18} /><P d="15,21 29,30 36,26 38,41" /><P d="18,23 18,12" /><Plate x={18} y={8} />
  </>),
  squat: (<>
    <Floor /><Head x={19} y={9} /><P d="20,13 25,26 15,30 18,42" /><P d="21,15 26,18 28,15" /><Plate x={27} y={13} />
  </>),
  deadlift: (<>
    <Floor /><Head x={12} y={15} /><P d="15,18 30,22 27,32 29,42" /><P d="17,19 20,33" /><Plate x={21} y={37.5} />
  </>),
  ohp: (<>
    <Floor /><Head x={23} y={15} /><P d="23,19 24,32 20,42" /><P d="24,32 28,42" /><P d="24,21 27,15 28,10" /><Plate x={28} y={7} r={4} />
  </>),
  row: (<>
    <Floor /><Head x={11} y={17} /><P d="14,19 30,25 27,33 29,42" /><P d="17,21 16,29 22,29" /><Plate x={23} y={33} r={4} />
  </>),
  pullup: (<>
    <line x1={8} y1={6} x2={40} y2={6} /><Head x={24} y={12} /><P d="18,6 18,14 22,17" /><P d="30,6 30,14 26,17" /><P d="24,16 24,30 22,36 27,41" />
  </>),
  dip: (<>
    <line x1={10} y1={24} x2={38} y2={24} strokeOpacity={0.45} /><line x1={13} y1={24} x2={13} y2={43} strokeOpacity={0.45} /><line x1={35} y1={24} x2={35} y2={43} strokeOpacity={0.45} />
    <Head x={24} y={8} /><P d="24,12 24,28 21,35 25,40" /><P d="24,14 19,19 23,24" />
  </>),
  pushup: (<>
    <Floor y={38} /><Head x={10} y={21} /><P d="13,23 40,36" /><P d="17,25 17,37" />
  </>),
  lunge: (<>
    <Floor /><Head x={22} y={8} /><P d="22,12 22,26 31,29 31,42" /><P d="22,26 16,35 8,38" /><P d="22,14 23,24" /><DB x={23} y={28} v />
  </>),
  legpress: (<>
    <line x1={6} y1={28} x2={18} y2={38} strokeOpacity={0.45} /><line x1={34} y1={14} x2={42} y2={30} />
    <Head x={9} y={21} /><P d="12,25 20,33 28,23 37,22" /><P d="14,27 21,31" />
  </>),
  legext: (<>
    <line x1={14} y1={31} x2={28} y2={31} strokeOpacity={0.45} /><line x1={13} y1={31} x2={11} y2={14} strokeOpacity={0.45} /><line x1={21} y1={31} x2={21} y2={42} strokeOpacity={0.45} />
    <Head x={16} y={10} /><P d="17,14 18,29 30,29 39,22" /><circle cx={40} cy={22} r={2.4} /><P d="18,17 25,22" />
  </>),
  legcurl: (<>
    <line x1={6} y1={31} x2={34} y2={31} strokeOpacity={0.45} /><line x1={12} y1={31} x2={12} y2={42} strokeOpacity={0.45} /><line x1={28} y1={31} x2={28} y2={42} strokeOpacity={0.45} />
    <Head x={9} y={25} /><P d="12,27 28,27 37,27 34,15" /><circle cx={34} cy={13} r={2.4} /><P d="14,27 12,33" />
  </>),
  hipthrust: (<>
    <line x1={4} y1={27} x2={14} y2={27} strokeOpacity={0.45} /><line x1={9} y1={27} x2={9} y2={42} strokeOpacity={0.45} /><Floor />
    <Head x={10} y={21} /><P d="13,23 27,23 34,25 34,42" /><Plate x={26} y={18} />
  </>),
  curl: (<>
    <Floor /><Head x={21} y={8} /><P d="21,12 21,28 18,42" /><P d="21,28 25,42" /><P d="21,14 22,24 29,18" /><DB x={30} y={16} v />
  </>),
  raise: (<>
    <Floor /><Head x={24} y={9} /><P d="24,13 24,29 20,42" /><P d="24,29 28,42" /><P d="11,18 24,15 37,18" /><DB x={9} y={18} v /><DB x={39} y={18} v />
  </>),
  fly: (<>
    <line x1={8} y1={34} x2={40} y2={34} strokeOpacity={0.45} /><line x1={24} y1={34} x2={24} y2={42} strokeOpacity={0.45} />
    <Head x={24} y={27} /><P d="12,22 18,29 30,29 36,22" /><DB x={11} y={20} /><DB x={37} y={20} />
  </>),
  pulldown: (<>
    <line x1={8} y1={6} x2={34} y2={6} /><line x1={21} y1={6} x2={21} y2={2} strokeOpacity={0.45} /><line x1={14} y1={33} x2={30} y2={33} strokeOpacity={0.45} />
    <Head x={20} y={15} /><P d="20,19 22,32 33,31 33,42" /><P d="21,20 15,13 13,6" /><P d="22,20 27,12 29,6" />
  </>),
  cable: (<>
    <Floor /><line x1={41} y1={4} x2={41} y2={43} strokeOpacity={0.45} /><line x1={41} y1={17} x2={29} y2={17} strokeDasharray="2 2.5" />
    <Head x={18} y={8} /><P d="18,12 19,28 15,42" /><P d="19,28 23,42" /><P d="19,14 24,19 29,17" />
  </>),
  pushdown: (<>
    <Floor /><line x1={38} y1={4} x2={38} y2={43} strokeOpacity={0.45} /><line x1={38} y1={6} x2={30} y2={6} strokeOpacity={0.45} /><line x1={30} y1={6} x2={30} y2={25} strokeDasharray="2 2.5" />
    <Head x={20} y={9} /><P d="20,13 20,29 17,42" /><P d="20,29 24,42" /><P d="20,15 22,22 29,26" />
  </>),
  plank: (<>
    <Floor y={36} /><Head x={10} y={23} /><P d="13,25 39,31" /><P d="15,26 15,35 21,35" />
  </>),
  lever: (<>
    <line x1={8} y1={6} x2={40} y2={6} /><Head x={9} y={19} /><P d="16,6 16,19" /><P d="12,19 29,19 24,26 32,27" />
  </>),
  handstand: (<>
    <line x1={38} y1={4} x2={38} y2={43} strokeOpacity={0.45} /><Floor x2={38} /><Head x={19} y={36.5} /><P d="25,33 31,18 36,5" /><P d="31,18 34,9" /><P d="25,33 21,42" /><P d="25,33 29,42" />
  </>),
  jump: (<>
    <rect x={29} y={30} width={13} height={13} rx={1.5} strokeOpacity={0.45} /><Floor x2={29} /><Head x={16} y={9} /><P d="16,13 18,25 25,24 22,31" /><P d="16,15 10,22" /><P d="18,25 14,31 18,34" />
  </>),
  legraise: (<>
    <line x1={10} y1={6} x2={38} y2={6} /><Head x={22} y={12} /><P d="17,6 18,15" /><P d="27,6 26,15" /><P d="22,16 22,30 38,30" />
  </>),
  calf: (<>
    <rect x={13} y={38} width={22} height={5} rx={1} strokeOpacity={0.45} /><Head x={24} y={6} /><P d="24,10 24,25 24,34 22,37 28,38" /><P d="24,13 20,23" /><P d="24,13 28,23" />
  </>),
  crunch: (<>
    <Floor y={40} /><Head x={12} y={25} /><P d="15,28 25,38 31,27 39,36" /><P d="16,27 22,24" />
  </>),
  swing: (<>
    <Floor /><Head x={13} y={12} /><P d="15,15 27,22 25,32 27,42" /><P d="17,17 26,21 33,21" /><circle cx={36} cy={22} r={3.4} /><path d="M33.5 18.5a2.6 2.6 0 0 1 5 0" />
  </>),
  carry: (<>
    <Floor /><Head x={23} y={7} /><P d="23,11 23,27 18,42" /><P d="23,27 29,42" /><P d="23,13 22,25" /><DB x={22} y={29} v />
  </>),
  run: (<>
    <Floor /><Head x={26} y={8} /><P d="25,12 21,26 28,32 26,42" /><P d="21,26 14,33 9,31" /><P d="24,15 30,20 34,17" /><P d="24,15 17,19 14,16" />
  </>),
  shrug: (<>
    <Floor /><Head x={24} y={12} /><P d="24,16 24,30 20,42" /><P d="24,30 28,42" /><P d="18,16 17,27" /><P d="30,16 31,27" /><DB x={17} y={31} v /><DB x={31} y={31} v />
  </>),
};

export function ExerciseIcon({ name, kind, size = 44, className }: { name: string; kind?: ExerciseKind; size?: number; className?: string }) {
  const info = exerciseInfo(name, kind);
  const color = MUSCLE_COLOR[info.muscle];
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-[12px]', className)}
      style={{ width: size, height: size, color, background: `color-mix(in srgb, ${color} 14%, var(--surface))`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 22%, transparent)` }}
    >
      {info.icon ? (
        <svg viewBox="0 0 48 48" width={size * 0.86} height={size * 0.86} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          {PICTOS[info.icon]}
        </svg>
      ) : (
        <span className="font-display font-bold tracking-wide" style={{ fontSize: size * 0.38 }}>{monogram(name)}</span>
      )}
    </span>
  );
}
