/* Exercise pictograms as line art, all seen from one three-quarter camera.
   Every pose is a small 3D skeleton (x = forward, y = up, z = across the body, in a 48-unit box)
   plus its equipment, pushed through the same projection, so benches, bars and the two arms keep
   their depth instead of flattening into one line. The far arm and leg are drawn fainter.
   Exercises without a pictogram get a monogram tile in the same style. */
import type { ReactNode } from 'react';
import { exerciseInfo, monogram, type Muscle, type Pictogram } from '@/core/exercises';
import type { ExerciseKind } from '@/core/types';
import { cn } from '@/lib/utils';

/** Muscle-group colours, used for filters and legends (the icons themselves are neutral). */
export const MUSCLE_COLOR: Record<Muscle, string> = {
  chest: 'var(--cat-heart)', back: 'var(--cat-respiratory)', legs: 'var(--cat-activity)', shoulders: 'var(--cat-mobility)',
  arms: 'var(--cat-body)', core: 'var(--cat-mind)', full: 'var(--cat-sleep)',
};

type V = [number, number, number?];
type Limb = [V, V];
const WS = 4.2; // half shoulder width
const WH = 2.6; // half hip width
const FAR = 0.5; // opacity of the far-side limbs
const GEAR = 0.55; // opacity of benches, frames and posts

function kit(yawDeg: number) {
  const yaw = (yawDeg * Math.PI) / 180, c = Math.cos(yaw), s = Math.sin(yaw);
  const p = ([x, y, z = 0]: V): [number, number] => [24 + x * c + z * s, 40 - y - (z * c - x * s) * 0.26];
  const pts = (vs: V[]) => vs.map(v => p(v).map(n => n.toFixed(1)).join(',')).join(' ');
  const line = (a: V, b: V, o = 1, dash?: string) => <polyline points={pts([a, b])} strokeOpacity={o} {...(dash ? { strokeDasharray: dash } : {})} />;
  const path = (vs: V[], o = 1, close = false) => (close ? <polygon points={pts(vs)} strokeOpacity={o} /> : <polyline points={pts(vs)} strokeOpacity={o} />);
  const dot = (at: V, r: number, o = 1, fill = false) => { const [x, y] = p(at); return <circle cx={x} cy={y} r={r} strokeOpacity={o} {...(fill ? { fill: 'currentColor', stroke: 'none', fillOpacity: o } : {})} />; };
  return {
    p, line, path, dot,
    floor: (x1 = -15, x2 = 15) => <g strokeWidth={1.2}>{path([[x1, 0, -6], [x2, 0, -6], [x2, 0, 6], [x1, 0, 6]], 0.28, true)}</g>,
    /** Flat bench: a padded top seen in depth, on legs. */
    bench: (x1: number, x2: number, y: number, w = 3.2, zc = 0) => (<>
      {path([[x1, y, zc - w], [x2, y, zc - w], [x2, y, zc + w], [x1, y, zc + w]], GEAR, true)}
      {line([x1 + 1.5, y, zc - w], [x1 + 1.5, 0, zc - w], GEAR)}
      {line([x2 - 1.5, y, zc - w], [x2 - 1.5, 0, zc - w], GEAR)}
      {line([x2 - 1.5, y, zc + w], [x2 - 1.5, 0, zc + w], GEAR * 0.6)}
    </>),
    /** Angled pad (backrest, preacher pad) between two points of the side profile. */
    slab: (a: [number, number], b: [number, number], w = 3.2, zc = 0) =>
      path([[a[0], a[1], zc - w], [b[0], b[1], zc - w], [b[0], b[1], zc + w], [a[0], a[1], zc + w]], GEAR, true),
    /** Barbell across the body with a plate at each end. */
    bar: (x: number, y: number, half = 10.5, r = 3.4) => (<>
      {line([x, y, -half], [x, y, half])}
      {dot([x, y, half], r, 0.6)}
      {dot([x, y, -half], r)}
      {dot([x, y, -half], 0.7, 1, true)}
    </>),
    /** Dumbbell with its handle along x (forward), y (upright) or z (across the body). */
    db: (at: V, axis: 'x' | 'y' | 'z', o = 1) => {
      const [x, y, z = 0] = at;
      if (axis === 'z') return (<>{line([x, y, z - 3.8], [x, y, z + 3.8], o)}{dot([x, y, z - 3.8], 2, o, true)}{dot([x, y, z + 3.8], 2, o, true)}</>);
      const ends: V[] = axis === 'x' ? [[x - 3, y, z], [x + 3, y, z]] : [[x, y - 3, z], [x, y + 3, z]];
      const cap = (e: V): [V, V] => (axis === 'x' ? [[e[0], e[1] - 2, z], [e[0], e[1] + 2, z]] : [[e[0] - 2, e[1], z], [e[0] + 2, e[1], z]]);
      return (<>
        {line(ends[0]!, ends[1]!, o)}
        <g strokeWidth={3.4}>{line(...cap(ends[0]!), o)}{line(...cap(ends[1]!), o)}</g>
      </>);
    },
    /** Pull-up bar across the body on two posts. */
    pullbar: (x: number, y: number, half = 13) => (<>
      {line([x, y, -half], [x, 0, -half], GEAR * 0.8)}
      {line([x, y, half], [x, 0, half], GEAR * 0.55)}
      {line([x, y, -half], [x, y, half])}
    </>),
    post: (x: number, y1: number, y2: number, z = 0, o = GEAR) => line([x, y1, z], [x, y2, z], o),
    cable: (a: V, b: V) => line(a, b, 0.8, '1.6 2.6'),
    /** Box or step: front face and top. */
    box: (x1: number, x2: number, y: number, w = 4.5) => (<>
      {path([[x1, 0, -w], [x1, y, -w], [x2, y, -w], [x2, 0, -w]], GEAR, true)}
      {path([[x1, y, -w], [x1, y, w], [x2, y, w], [x2, y, -w]], GEAR)}
      {line([x2, y, w], [x2, 0, w], GEAR * 0.6)}
    </>),
  };
}
type Kit = ReturnType<typeof kit>;

type Pose = {
  /** how far the body is turned towards the camera; the same for all but the side-to-side moves */
  yaw?: number;
  head: [number, number];
  sh: [number, number];
  hip: [number, number];
  /** near arm: elbow, hand. z defaults to the near shoulder. */
  a: Limb;
  /** far arm; defaults to the mirror image of the near one */
  af?: Limb;
  /** near leg: knee, foot */
  l: Limb;
  lf?: Limb;
  gear?: (g: Kit) => ReactNode;
  floor?: [number, number] | false;
};

const near = (j: V, w: number): V => [j[0], j[1], j[2] ?? -w];
const far = (j: V, w: number): V => [j[0], j[1], j[2] ?? w];
const mirror = (j: V, w: number): V => [j[0], j[1], -(j[2] ?? -w)];

function Figure({ pose }: { pose: Pose }) {
  const g = kit(pose.yaw ?? 35);
  const sh = (z: number): V => [pose.sh[0], pose.sh[1], z], hip = (z: number): V => [pose.hip[0], pose.hip[1], z];
  const aN = pose.a.map(j => near(j, WS)), aF = pose.af ? pose.af.map(j => far(j, WS)) : pose.a.map(j => mirror(j, WS));
  const lN = pose.l.map(j => near(j, WH)), lF = pose.lf ? pose.lf.map(j => far(j, WH)) : pose.l.map(j => mirror(j, WH));
  return (<>
    {pose.floor === false ? null : g.floor(...(pose.floor ?? [-15, 15]))}
    {g.path([hip(WH), ...(lF as V[])], FAR)}
    {g.path([sh(WS), ...(aF as V[])], FAR)}
    {pose.gear?.(g)}
    {g.path([sh(-WS), sh(WS)])}
    {g.path([hip(-WH), hip(WH)])}
    {g.path([sh(0), hip(0)])}
    {g.path([hip(-WH), ...(lN as V[])])}
    {g.path([sh(-WS), ...(aN as V[])])}
    {g.dot([pose.head[0], pose.head[1], 0], 3.1, 1, true)}
  </>);
}

/* ---- shared body positions ---- */
const STAND = { head: [0.6, 34.4], sh: [0, 29], hip: [0, 17], l: [[0.5, 8.5], [0, 0]] } satisfies Partial<Pose>;
/** standing a little shorter, leaving room for a weight overhead */
const STAND_LOW = { head: [0.6, 31.6], sh: [0, 26.5], hip: [0, 15.5], l: [[0.4, 7.8], [0, 0]] } satisfies Partial<Pose>;
/** lying face up on a flat bench, feet on the floor */
const SUPINE = { head: [-11.5, 12.6], sh: [-6, 12], hip: [6, 11.2], l: [[12.5, 12], [13.5, 0]] } satisfies Partial<Pose>;
/** lying back on an incline bench */
const INCLINED = { head: [-9.6, 24.6], sh: [-6.5, 20], hip: [1.5, 11], l: [[8.5, 11.5], [10, 0]] } satisfies Partial<Pose>;
/** sitting upright on a bench */
const SEATED = { head: [-1.9, 28.5], sh: [-2.5, 23], hip: [-2, 11], l: [[5.5, 11], [6.5, 0]] } satisfies Partial<Pose>;
/** hanging from a bar at y = 37 with straight arms */
const HANG_ARMS: Limb = [[0, 30.7, -5], [0, 37, -5.5]];
const inclineBench = (g: Kit) => (<>{g.slab([0, 9], [-9.5, 20.5])}{g.bench(0, 7, 9)}{g.post(-6, 15.5, 0, 0, GEAR * 0.7)}</>);
const seatWithBack = (g: Kit, top = 25) => (<>{g.bench(-5, 3, 9)}{g.slab([-5, 9], [-5.6, top])}</>);

const POSES: Record<Pictogram, Pose> = {
  /* ---------- chest ---------- */
  benchBB: { ...SUPINE, a: [[-6, 18.5, -6], [-6, 25, -6.5]], gear: g => (<>{g.bench(-14, 8, 9)}{g.bar(-6, 25)}</>) },
  benchDB: { ...SUPINE, a: [[-6, 18.5, -6.5], [-6, 25, -6.5]], gear: g => (<>{g.bench(-14, 8, 9)}{g.db([-6, 25, 6.5], 'z', 0.6)}{g.db([-6, 25, -6.5], 'z')}</>) },
  inclineBB: { ...INCLINED, a: [[-6.5, 26.5, -6], [-6.5, 33, -6.5]], gear: g => (<>{inclineBench(g)}{g.bar(-6.5, 33, 10, 3.2)}</>) },
  inclineDB: { ...INCLINED, a: [[-6.5, 26.5, -6.5], [-6.5, 33, -6.5]], gear: g => (<>{inclineBench(g)}{g.db([-6.5, 33, 6.5], 'z', 0.6)}{g.db([-6.5, 33, -6.5], 'z')}</>) },
  flyDB: { ...SUPINE, yaw: 55, a: [[-6, 16.5, -8.5], [-6, 19, -13.5]], gear: g => (<>{g.bench(-14, 8, 9)}{g.db([-6, 19, 13.5], 'x', 0.6)}{g.db([-6, 19, -13.5], 'x')}</>) },
  cableFly: {
    ...STAND, yaw: 55, floor: false, sh: [1, 28.6], head: [2.4, 33.8], a: [[5, 22, -7], [8, 19.5, -1.2]],
    gear: g => (<>{g.post(0, 0, 36, -15)}{g.post(0, 0, 36, 15, GEAR * 0.6)}{g.cable([0, 34, -15], [8, 19.5, -1.2])}{g.cable([0, 34, 15], [8, 19.5, 1.2])}</>),
  },
  chestMachine: {
    head: [-4, 28.5], sh: [-4.5, 23], hip: [-3, 11], l: [[5, 11], [6, 0]], a: [[1.5, 21.5, -6], [8.5, 22, -5.5]],
    gear: g => (<>{g.bench(-6, 2, 9)}{g.slab([-6, 9], [-7, 25])}{g.line([8.5, 18.5, 5.5], [8.5, 25.5, 5.5], 0.6)}{g.line([8.5, 18.5, -5.5], [8.5, 25.5, -5.5])}{g.line([8.5, 25.5, -5.5], [8.5, 25.5, 5.5], GEAR)}</>),
  },
  pushup: { head: [14.6, 15.2], sh: [10, 12.5], hip: [-2.5, 7], l: [[-9, 3.6], [-15.5, 0.5]], a: [[10, 6.2, -4.5], [10, 0, -4.5]], floor: [-17, 15] },
  pushupClose: { head: [14.6, 15.2], sh: [10, 12.5], hip: [-2.5, 7], l: [[-9, 3.6], [-15.5, 0.5]], a: [[9.5, 6, -5.5], [11, 0, -0.9]], floor: [-17, 15] },
  pushupIncline: { head: [13.5, 24.5], sh: [9.5, 21], hip: [-2, 11.5], l: [[-8.5, 6], [-14.5, 0.5]], a: [[10, 15, -4.5], [10, 9, -4.5]], floor: [-17, 15], gear: g => g.box(7, 14, 9) },
  pushupDecline: { head: [14.6, 13], sh: [10, 11.5], hip: [-2, 10.2], l: [[-8, 9.8], [-14, 9.5]], a: [[10, 5.8, -4.5], [10, 0, -4.5]], floor: [-17, 15], gear: g => g.box(-17, -11, 9) },
  pike: { head: [9.2, 8.6], sh: [6.8, 10.2], hip: [-0.5, 21], l: [[-6.5, 10.6], [-12.5, 0.3]], a: [[10.2, 5.2, -4.5], [13.5, 0, -4.5]], floor: [-15, 16] },
  dip: {
    yaw: 45, head: [2.2, 33], sh: [1, 27.8], hip: [-1.2, 15.8], l: [[1.5, 8.5], [-4.5, 5.5]], a: [[-1.6, 22.4, -6], [0, 17, -6]], floor: [-9, 9],
    gear: g => (<>{g.line([-9, 17, 6], [7, 17, 6], 0.6)}{g.post(-9, 17, 0, 6, GEAR * 0.6)}{g.line([-9, 17, -6], [7, 17, -6])}{g.post(-9, 17, 0, -6)}</>),
  },
  benchDip: { head: [0.5, 22.5], sh: [0, 17], hip: [2.5, 7.5], l: [[9, 9.5], [15, 0]], a: [[-4.5, 14.5, -4.5], [-1, 9, -4.5]], gear: g => g.bench(-9, 0, 9, 4.8) },

  /* ---------- back ---------- */
  deadlift: { head: [8.6, 26.4], sh: [4.5, 23], hip: [-5, 15.5], l: [[1.5, 9], [-1, 0]], a: [[4.5, 14, -5.5], [4.5, 5.5, -6]], gear: g => g.bar(4.5, 4.2, 10.5, 4) },
  rdl: { head: [9.4, 24.2], sh: [5, 21.5], hip: [-6, 17], l: [[-2.5, 8.6], [-2, 0]], a: [[5.3, 16.3, -5.5], [5, 11.5, -6]], gear: g => g.bar(5, 11.5, 10.5, 3.4) },
  rowBB: { head: [8.5, 26], sh: [4.5, 22.5], hip: [-6, 16.5], l: [[-1.5, 9], [-3, 0]], a: [[0, 24.5, -6], [2.5, 17.5, -6.5]], gear: g => g.bar(2.5, 17.5, 10.5, 3.2) },
  rowDB: {
    head: [11.6, 19.8], sh: [7, 17.5], hip: [-5, 16.5],
    a: [[3.5, 21.5, -5.5], [5.5, 14.5, -5.5]], af: [[7.5, 13, 3], [7.5, 9, 3]],
    l: [[-5.5, 8.5, -4.5], [-6, 0, -4.5]], lf: [[-2, 9.2, 3], [-10, 10, 3]],
    gear: g => (<>{g.bench(-12, 11, 8.5, 2.6, 3)}{g.db([5.5, 12.6, -5.5], 'x')}</>),
  },
  rowSupported: {
    head: [10.6, 26.6], sh: [7, 22.5], hip: [-1.5, 12.5], l: [[-6.5, 6.5], [-11, 0.3]], a: [[3.5, 24.5, -6], [5.5, 16.5, -6]],
    gear: g => (<>{g.slab([-1, 9.5], [8, 21])}{g.post(4, 15, 0)}{g.db([5.5, 16.5, 6], 'z', 0.6)}{g.db([5.5, 16.5, -6], 'z')}</>),
  },
  cableRow: {
    head: [-6.4, 26.5], sh: [-7, 21], hip: [-6, 9], l: [[2.5, 11.5], [9, 7.5]], a: [[-9.5, 16.5, -5.5], [-1, 15.5, -3]], floor: [-14, 17],
    gear: g => (<>{g.bench(-11, 1, 7)}{g.path([[10, 3, -4], [10, 11, -4], [10, 11, 4], [10, 3, 4]], GEAR, true)}{g.post(16, 0, 24)}{g.cable([-1, 15.5, 0], [16, 15.5, 0])}{g.line([-1, 15.5, -3], [-1, 15.5, 3])}</>),
  },
  pulldown: {
    head: [-1.2, 28.4], sh: [-2, 23], hip: [-1, 11], l: [[6, 11], [6.5, 0]], a: [[-3, 29.5, -8], [-1, 35, -8.5]],
    gear: g => (<>{g.bench(-5, 3, 9)}{g.line([3.5, 13.6, -4], [3.5, 13.6, 4], GEAR)}{g.line([-1, 35, -11], [-1, 35, 11])}{g.cable([-1, 35, 0], [-1, 40.5, 0])}</>),
  },
  pullup: { yaw: 52, head: [0.8, 31.6], sh: [0, 26.5], hip: [-0.5, 14.5], l: [[1.5, 7.5], [-3, 3]], a: [[1.2, 31.5, -6.5], [0, 37, -5.5]], floor: [-6, 6], gear: g => g.pullbar(0, 37) },
  muscleup: { yaw: 52, head: [2, 36.4], sh: [1, 31.2], hip: [-1.2, 20], l: [[1.5, 13], [-3, 9.5]], a: [[0.5, 26.4, -5], [0, 21.5, -5]], floor: [-6, 6], gear: g => g.pullbar(0, 21.5) },
  hang: { yaw: 52, head: [0.6, 29.4], sh: [0, 24.5], hip: [0, 12.5], l: [[1, 4.5], [-4.5, 2]], a: HANG_ARMS, floor: [-6, 6], gear: g => g.pullbar(0, 37) },
  shrug: { ...STAND, a: [[0, 22, -5], [0.3, 15, -5.5]], gear: g => (<>{g.db([0.3, 13.2, 5.5], 'x', 0.6)}{g.db([0.3, 13.2, -5.5], 'x')}</>) },
  facepull: { ...STAND, a: [[2, 30, -9], [5.5, 31, -3.5]], gear: g => (<>{g.post(15, 0, 36)}{g.cable([5.5, 31, 0], [15, 33, 0])}</>) },
  backExt: {
    head: [14.5, 21], sh: [10.5, 18], hip: [0, 13], l: [[-6, 8], [-13, 3]], a: [[8, 14.5, -3], [11.5, 16.5, -1]], floor: [-16, 12],
    gear: g => (<>{g.slab([-3.5, 9.5], [2, 13.5])}{g.post(-1, 11, 0)}{g.dot([-13, 5.6, 0], 1.6, GEAR)}{g.post(-13, 4, 0, 0, GEAR * 0.7)}</>),
  },

  /* ---------- legs ---------- */
  squatBB: { head: [2.4, 26.4], sh: [-0.5, 21.5], hip: [-5.5, 10.5], l: [[4, 11], [1, 0]], a: [[-2.5, 17.5, -6], [-2, 22, -7.5]], gear: g => g.bar(-2, 22, 10.5, 3.4) },
  squatFront: { head: [0.5, 27.6], sh: [-1.5, 22.2], hip: [-5.5, 10.5], l: [[4, 11], [1, 0]], a: [[4.5, 20.5, -5], [1.5, 22.5, -5.5]], gear: g => g.bar(1.2, 21.8, 10.5, 3.4) },
  squatGoblet: { head: [0.5, 27.6], sh: [-1.5, 22.2], hip: [-5.5, 10.5], l: [[4, 11], [1, 0]], a: [[1, 15.5, -5], [2.8, 20.5, -1.2]], gear: g => g.db([3.2, 19.5, 0], 'y') },
  pistol: { head: [2.5, 25], sh: [-0.5, 20], hip: [-5, 9], l: [[2.5, 8, -2.6], [11.5, 7.5, -2.6]], lf: [[3.5, 10, 2.6], [0, 0, 2.6]], a: [[5, 18.5], [11, 19]] },
  hackSquat: {
    head: [-11.5, 24.6], sh: [-9.5, 19.5], hip: [-4, 8.5], l: [[4.5, 13], [8.5, 4.5]], a: [[-8, 14], [-5.5, 10]],
    gear: g => (<>{g.slab([-6.5, 5], [-13.5, 23.5])}{g.path([[5.5, 1.5, -4], [11.5, 7.5, -4], [11.5, 7.5, 4], [5.5, 1.5, 4]], GEAR, true)}{g.line([-6.5, 5, 0], [-4, 0, 0], GEAR)}</>),
  },
  legpress: {
    head: [-16.2, 18.6], sh: [-13.5, 14], hip: [-5.5, 5.5], l: [[0.5, 13.5], [7, 18.5]], a: [[-9, 8], [-4.5, 6.5]],
    gear: g => (<>{g.slab([-4, 3], [-13, 13.5])}{g.path([[4.6, 21.8, -5], [10, 14.8, -5], [10, 14.8, 5], [4.6, 21.8, 5]], GEAR, true)}{g.line([7.5, 18, 0], [14, 9, 0], GEAR)}</>),
  },
  splitSquat: {
    head: [-0.4, 30], sh: [-1, 24.5], hip: [-1.5, 12.5], l: [[6, 10, -2.6], [5, 0, -2.6]], lf: [[-5.5, 4.5, 2.6], [-12, 9, 2.6]], a: [[-1, 18, -5], [-0.8, 11.5, -5.5]], floor: [-18, 12],
    gear: g => (<>{g.bench(-17, -9, 8)}{g.db([-0.8, 9.8, 5.5], 'x', 0.6)}{g.db([-0.8, 9.8, -5.5], 'x')}</>),
  },
  lunge: {
    head: [0.1, 29], sh: [-0.5, 23.5], hip: [-1, 11.5], l: [[6.5, 9.5, -2.6], [6, 0, -2.6]], lf: [[-5, 3, 2.6], [-11.5, 1.5, 2.6]], a: [[-0.5, 17, -5], [-0.3, 10.5, -5.5]],
    gear: g => (<>{g.db([-0.3, 8.8, 5.5], 'x', 0.6)}{g.db([-0.3, 8.8, -5.5], 'x')}</>),
  },
  legcurl: { head: [-13, 12.8], sh: [-8.5, 11.5], hip: [3.5, 11], l: [[10.5, 10.5], [8.5, 18.5]], a: [[-8.5, 7.5], [-11.5, 6]], gear: g => (<>{g.bench(-13, 9, 9)}{g.line([8.3, 20.4, -4], [8.3, 20.4, 4], 1)}</>) },
  legext: {
    head: [-5, 29], sh: [-5.5, 23.5], hip: [-3, 12], l: [[5, 12], [13, 11]], a: [[-3, 17.5], [-0.5, 12]],
    gear: g => (<>{g.bench(-6, 3, 10)}{g.slab([-6, 10], [-8, 24])}{g.line([12.6, 8.8, -4], [12.6, 8.8, 4])}</>),
  },
  hipthrust: { head: [-12.5, 13], sh: [-8, 10.5], hip: [3, 11.5], l: [[10, 11], [10.5, 0]], a: [[-2.5, 12, -6], [3, 13.6, -6]], gear: g => (<>{g.bench(-15, -7, 9)}{g.bar(3, 13.6)}</>) },
  calf: {
    head: [0.6, 36.3], sh: [0, 31], hip: [0, 19.5], l: [[0.8, 11.5], [1, 3.2]], a: [[0, 24.5, -5], [0.3, 17.5, -5.5]],
    gear: g => (<>{g.box(-3, 6, 2.5)}{g.db([0.3, 15.7, 5.5], 'x', 0.6)}{g.db([0.3, 15.7, -5.5], 'x')}</>),
  },
  boxjump: { head: [1, 33], sh: [-1.5, 28], hip: [-5, 17.5], l: [[2.5, 18], [0, 11]], a: [[3.5, 29.5], [7.5, 33.5]], floor: [-14, 5], gear: g => g.box(5, 15, 9, 5) },
  broadjump: { head: [8.6, 25.2], sh: [4.5, 22], hip: [-3, 13.5], l: [[0.5, 6.5], [-6.5, 6]], a: [[9, 20.5], [14, 23.5]], gear: g => g.line([-13, 0, -4], [-13, 0, 4], GEAR) },

  /* ---------- shoulders ---------- */
  ohpBB: { ...STAND_LOW, a: [[1, 31, -6], [0.5, 35.5, -6.5]], gear: g => g.bar(0.5, 35.5, 9.5, 2.8) },
  ohpDB: { ...STAND_LOW, a: [[0.5, 27.5, -8], [0.5, 33.5, -7.5]], gear: g => (<>{g.db([0.5, 33.5, 7.5], 'z', 0.6)}{g.db([0.5, 33.5, -7.5], 'z')}</>) },
  ohpSeated: { ...SEATED, a: [[-2, 24.5, -8], [-2, 31, -7.5]], gear: g => (<>{seatWithBack(g)}{g.db([-2, 31, 7.5], 'z', 0.6)}{g.db([-2, 31, -7.5], 'z')}</>) },
  lateral: { ...STAND, yaw: 55, a: [[0.3, 27.5, -9.5], [0.5, 27, -14]], gear: g => (<>{g.db([0.5, 27, 14], 'x', 0.6)}{g.db([0.5, 27, -14], 'x')}</>) },
  frontRaise: { ...STAND, a: [[6.5, 28, -4.5], [13, 28, -4.5]], gear: g => (<>{g.db([13, 28, 4.5], 'z', 0.6)}{g.db([13, 28, -4.5], 'z')}</>) },
  rearFly: { yaw: 55, head: [9.2, 23.6], sh: [5, 21], hip: [-5, 16], l: [[-1, 9], [-2.5, 0]], a: [[5, 21.5, -9], [5, 21, -13.5]], gear: g => (<>{g.db([5, 21, 13.5], 'x', 0.6)}{g.db([5, 21, -13.5], 'x')}</>) },
  handstand: {
    head: [1.2, 6.2], sh: [-0.8, 12], hip: [-3, 24], l: [[-5, 31.5], [-6.8, 38.5]], a: [[-0.3, 6, -4.5], [0, 0, -4.5]], floor: [-8, 12],
    gear: g => g.path([[-7.8, 0, -8], [-7.8, 38, -8], [-7.8, 38, 8], [-7.8, 0, 8]], GEAR * 0.7, true),
  },

  /* ---------- arms ---------- */
  // supinated curl: the dumbbell lies across the body (horizontal), one arm up, one down
  curlDB: {
    ...STAND, yaw: 50, a: [[1, 21.6, -5], [8, 23, -5.5]],
    gear: g => (<>{g.db([8.3, 23.1, 5.5], 'z', 0.6)}{g.db([8.3, 23.1, -5.5], 'z')}</>),
  },
  curlSeated: {
    yaw: 50, head: [-0.4, 28.5], sh: [-1, 23], hip: [-1, 11], l: [[6, 11], [7, 0]], a: [[0, 15.8, -5], [7, 17.6, -5.5]],
    gear: g => (<>{g.bench(-7, 4, 9)}{g.db([7.3, 17.7, 5.5], 'z', 0.6)}{g.db([7.3, 17.7, -5.5], 'z')}</>),
  },
  curlIncline: {
    ...INCLINED, a: [[-7.5, 13.2, -5.5], [-2.5, 10.5, -5.5]], af: [[-7.5, 13.2, 5.5], [-8.5, 6.5, 5.5]],
    gear: g => (<>{inclineBench(g)}{g.db([-8.5, 6.2, 5.5], 'z', 0.6)}{g.db([-2.3, 10.4, -5.5], 'z')}</>),
  },
  curlBB: { ...STAND, yaw: 50, a: [[1, 21.6, -5], [8, 23, -5.5]], gear: g => g.bar(8, 23, 9.5, 2.6) },
  // hammer curl: neutral grip, so the dumbbell stands upright in the raised hand
  hammer: {
    ...STAND, yaw: 50, a: [[1, 21.6, -5], [7.5, 24.5, -5.5]],
    gear: g => (<>{g.db([7.8, 25, 5.5], 'y', 0.6)}{g.db([7.8, 25, -5.5], 'y')}</>),
  },
  preacher: {
    head: [1.6, 27.2], sh: [-1.5, 22.5], hip: [-5.5, 11], l: [[2, 10], [1, 0]], a: [[5.5, 15.2, -4], [8.5, 22, -4]],
    gear: g => (<>{g.bench(-9, -2, 9)}{g.slab([1, 22], [7, 13], 4.4)}{g.post(4, 17, 0)}{g.bar(8.5, 22, 8, 2.4)}</>),
  },
  pushdown: {
    ...STAND, a: [[0.6, 21.5, -4.5], [6, 16, -3.5]],
    gear: g => (<>{g.post(13, 0, 38)}{g.line([13, 38, 0], [6, 37, 0], GEAR)}{g.cable([6, 16, 0], [6, 37, 0])}{g.line([6, 16, -4.5], [6, 16, 4.5])}</>),
  },
  skull: { ...SUPINE, a: [[-6, 19, -4.5], [-11.5, 17.5, -4.5]], gear: g => (<>{g.bench(-14, 8, 9)}{g.bar(-11.5, 17.5, 8, 2.4)}</>) },
  // one dumbbell held in both hands, lowered behind the head
  tricepsOH: { ...STAND_LOW, a: [[1.5, 32.5, -3.5], [-2.5, 28.5, -1.2]], gear: g => g.db([-3, 25.3, 0], 'y') },
  tricepsOHSeated: { ...SEATED, a: [[-1, 29.5, -3.5], [-5, 25.5, -1.2]], gear: g => (<>{seatWithBack(g, 17.5)}{g.db([-5.5, 22.3, 0], 'y')}</>) },

  /* ---------- core ---------- */
  plank: { head: [12.8, 12.2], sh: [8.5, 9.5], hip: [-3, 7], l: [[-9.5, 3.8], [-15.5, 0.5]], a: [[8.5, 0.8, -4.5], [14.5, 0.8, -4.5]], floor: [-17, 16] },
  hollow: { head: [-13.8, 7.4], sh: [-9.5, 5.5], hip: [0, 2.2], l: [[7.5, 5], [15.5, 8.5]], a: [[-14, 11.5], [-19, 14.5]], floor: [-16, 16] },
  // lying flat on the back, straight legs raised
  lyingLegRaise: { head: [-13.6, 3.4], sh: [-9, 2.2], hip: [3, 2.2], l: [[6.1, 10.2], [9.2, 18.6]], a: [[-3.5, 1.4, -5], [2.5, 1.2, -5]], floor: [-17, 14] },
  hangLegRaise: { yaw: 52, head: [0.6, 29.3], sh: [0, 24.5], hip: [-0.8, 12.6], l: [[7.5, 13], [16, 13.8]], a: HANG_ARMS, floor: [-6, 6], gear: g => g.pullbar(0, 37) },
  crunch: { head: [-12.5, 10.4], sh: [-8.5, 7.5], hip: [0, 2.2], l: [[7, 10.5], [12.5, 0.5]], a: [[-3, 9.8], [2.5, 11.5]], floor: [-16, 15] },
  abwheel: { head: [9.8, 10], sh: [5.5, 8], hip: [-5, 9.5], l: [[-8, 0.8], [-15, 2]], a: [[9.5, 5.5], [13.5, 3.2]], floor: [-17, 17], gear: g => g.dot([13.5, 3, 0], 3) },
  lever: { head: [-9, 26], sh: [-4, 24.5], hip: [8, 24], l: [[13.5, 23.8], [19.5, 23.5]], a: [[-3, 30.3, -5], [-2, 36, -5]], floor: false, gear: g => g.pullbar(-2, 36, 10) },
  leverTuck: { head: [-9, 26], sh: [-4, 24.5], hip: [7, 23.5], l: [[3.5, 28.5], [9, 30]], a: [[-3, 30.3, -5], [-2, 36, -5]], floor: false, gear: g => g.pullbar(-2, 36, 10) },
  lsit: {
    head: [0.6, 23], sh: [0, 17.5], hip: [-2, 6.5], l: [[6.5, 7], [15, 7.5]], a: [[0, 11.3, -5], [0, 5, -5]], floor: [-8, 16],
    gear: g => (<>{g.line([-3, 5, 5], [3, 5, 5], 0.6)}{g.post(-3, 5, 0, 5, GEAR * 0.6)}{g.post(3, 5, 0, 5, GEAR * 0.6)}{g.line([-3, 5, -5], [3, 5, -5])}{g.post(-3, 5, 0, -5)}{g.post(3, 5, 0, -5)}</>),
  },

  /* ---------- full body ---------- */
  swing: {
    head: [3, 33.8], sh: [1.5, 28.5], hip: [-1, 17], l: [[1, 8.5], [0, 0]], a: [[6.5, 25.5, -3], [12.5, 25, -1]],
    gear: g => (<>{g.dot([14.6, 21.2, 0], 2.8)}{g.path([[13, 23.6, 0], [12.5, 25.6, 0], [15.5, 26, 0], [16, 23.8, 0]])}</>),
  },
  carry: {
    head: [1.2, 34.4], sh: [0.5, 29], hip: [0, 17], l: [[4, 9, -2.6], [5.5, 0, -2.6]], lf: [[-2.5, 8.5, 2.6], [-6, 1, 2.6]], a: [[0.3, 22, -5], [0.6, 15, -5.5]],
    gear: g => (<>{g.db([0.6, 13.2, 5.5], 'x', 0.6)}{g.db([0.6, 13.2, -5.5], 'x')}</>),
  },
  burpee: { head: [11, 14], sh: [7, 11], hip: [-4.5, 9.5], l: [[2, 8.5], [-3.5, 0.3]], a: [[7.5, 5.5, -4.5], [8, 0, -4.5]] },
  run: {
    head: [4.5, 32.6], sh: [2.5, 27.5], hip: [0, 16], l: [[6, 11, -2.6], [4.5, 2.5, -2.6]], lf: [[-4, 9.5, 2.6], [-11, 10.5, 2.6]],
    a: [[-2.5, 22.5, -4.5], [-5.5, 17, -4.5]], af: [[6.5, 22, 4.5], [10, 27, 4.5]],
  },
};

export function ExerciseIcon({ name, kind, size = 44, className }: { name: string; kind?: ExerciseKind; size?: number; className?: string }) {
  const info = exerciseInfo(name, kind);
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-[11px] text-ink', className)}
      style={{ width: size, height: size, background: 'color-mix(in srgb, var(--accent) 7%, var(--surface-2))', boxShadow: 'inset 0 0 0 1px var(--line)' }}
    >
      {info.icon ? (
        <svg viewBox="0 0 48 48" width={size * 0.84} height={size * 0.84} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" overflow="visible">
          <Figure pose={POSES[info.icon]} />
        </svg>
      ) : (
        <span className="font-semibold tracking-wide text-muted" style={{ fontSize: size * 0.34 }}>{monogram(name)}</span>
      )}
    </span>
  );
}

/** Every pictogram key, for the icon gallery used while drawing them. */
export const PICTOGRAMS = Object.keys(POSES) as Pictogram[];
