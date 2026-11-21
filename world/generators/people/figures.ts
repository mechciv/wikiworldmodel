// People by the houses: standing, walking, carrying, sitting, at work, a child among them. No record says anything of
// any of them, their dress least of all: they are drawn so that a settlement has its scale and looks lived in, in plain
// wraps and tunics of undyed or earth-dyed cloth, and a click says that they are the generator's. A figure stands at
// the origin and faces +y.
import { dome, figure, limb, MAT, type Mesh } from '../city/kit.ts';
import { PI } from '../city/math.ts';
import { enter, leave, turn } from './parts.ts';

/** How many ways a person is drawn. */
export const PERSON_VARIANTS = 8;

type P = [number, number, number];

interface Pose {
  /** the hips and the base of the neck, as shares of the figure's height: [forward, up] */
  hip: [number, number];
  neck: [number, number];
  /** each leg's knee and foot, and each arm's elbow and hand: [across, forward, up], the left's; the right is its mirror unless given */
  knee: P;
  foot: P;
  knee2?: P;
  foot2?: P;
  elbow: P;
  hand: P;
  elbow2?: P;
  hand2?: P;
  /** a wrap to the knee, a robe to the ankle, or a cloth at the hips only */
  dress: 'tunic' | 'robe' | 'wrap';
  load?: 'head' | 'staff' | 'basket' | 'quern';
}

const STAND: Pose = { hip: [0, 0.52], neck: [0, 0.83], knee: [0.055, 0.01, 0.28], foot: [0.06, 0.02, 0.03], elbow: [0.15, -0.01, 0.62], hand: [0.155, 0.03, 0.45], dress: 'tunic' };

const POSES: Pose[] = [
  STAND,
  { ...STAND, dress: 'robe', elbow2: [0.16, 0.06, 0.64], hand2: [0.2, 0.2, 0.66], load: 'staff' },
  // Walking: one foot before the other, the arms swinging against them.
  { ...STAND, knee: [0.055, 0.1, 0.29], foot: [0.06, 0.17, 0.03], knee2: [0.055, -0.04, 0.27], foot2: [0.06, -0.15, 0.05], elbow: [0.15, -0.06, 0.63], hand: [0.15, -0.1, 0.47], elbow2: [0.15, 0.05, 0.63], hand2: [0.15, 0.13, 0.48] },
  // Carrying on the head, a hand up to steady it.
  { ...STAND, dress: 'wrap', knee: [0.055, 0.08, 0.29], foot: [0.06, 0.14, 0.03], knee2: [0.055, -0.03, 0.27], foot2: [0.06, -0.12, 0.05], elbow2: [0.17, 0.03, 0.86], hand2: [0.1, 0.02, 1.0], load: 'head' },
  // Sitting on the ground, the legs folded, the hands on the knees.
  { hip: [-0.02, 0.1], neck: [0.03, 0.43], knee: [0.17, 0.2, 0.12], foot: [0.04, 0.16, 0.05], elbow: [0.15, 0.08, 0.26], hand: [0.15, 0.2, 0.16], dress: 'wrap' },
  // At work on the ground: kneeling forward over a stone.
  { hip: [-0.05, 0.2], neck: [0.2, 0.44], knee: [0.08, 0.14, 0.04], foot: [0.08, -0.2, 0.04], elbow: [0.13, 0.3, 0.3], hand: [0.07, 0.42, 0.13], dress: 'tunic', load: 'quern' },
  // A child.
  STAND,
  // Standing with a basket held before it.
  { ...STAND, dress: 'robe', elbow: [0.15, 0.08, 0.6], hand: [0.09, 0.2, 0.55], load: 'basket' },
];

/**
 * A person, drawn into a mesh at the frame's origin, facing +y: `variant` picks how it stands and what it wears,
 * `height` is a grown person's, and `cloth` and `skin` are the tints its cloth and its skin start from.
 */
export function drawPerson(m: Mesh, height: number, variant: number, detail: 0 | 1 | 2, cloth: number, skin: number): void {
  const v = ((variant % PERSON_VARIANTS) + PERSON_VARIANTS) % PERSON_VARIANTS;
  const H = v === 6 ? height * 0.68 : height;
  if (detail === 2) {
    m.mat = MAT.cloth;
    m.tint = cloth;
    figure(m, 0, 0, 0, H * (v === 4 || v === 5 ? 0.55 : 1), 0);
    return;
  }
  const p = POSES[v];
  const n = detail === 0 ? 6 : 4;
  const at = (q: P, side: number): P => [q[0] * side * H, q[1] * H, q[2] * H];
  const hip: P = [0, p.hip[0] * H, p.hip[1] * H];
  const neck: P = [0, p.neck[0] * H, p.neck[1] * H];
  const skinTone = () => {
    m.mat = MAT.skin;
    m.tint = skin;
  };
  const clothed = () => {
    m.mat = MAT.cloth;
    m.tint = cloth;
  };
  // The legs: bare below the hem, hidden by a robe.
  for (const side of [1, -1]) {
    const knee = at(side < 0 && p.knee2 ? p.knee2 : p.knee, side);
    const foot = at(side < 0 && p.foot2 ? p.foot2 : p.foot, side);
    const top: P = [side * 0.06 * H, hip[1], hip[2]];
    if (p.dress === 'robe' && p.hip[1] > 0.4) continue;
    skinTone();
    limb(m, top[0], top[1], top[2], knee[0], knee[1], knee[2], 0.05 * H, 0.04 * H, n);
    limb(m, knee[0], knee[1], knee[2], foot[0], foot[1], foot[2], 0.038 * H, 0.027 * H, n);
    if (detail === 0) limb(m, foot[0], foot[1] - 0.02 * H, foot[2] - 0.012 * H, foot[0], foot[1] + 0.075 * H, foot[2] - 0.016 * H, 0.026 * H, 0.02 * H, 4);
  }
  // The body: the hips, the chest, the shoulders.
  const chest: P = [0, hip[1] + (neck[1] - hip[1]) * 0.62, hip[2] + (neck[2] - hip[2]) * 0.62];
  if (p.dress === 'wrap') skinTone();
  else clothed();
  limb(m, hip[0], hip[1], hip[2], chest[0], chest[1], chest[2], 0.085 * H, 0.098 * H, n + 2);
  limb(m, chest[0], chest[1], chest[2], neck[0], neck[1], neck[2] - 0.02 * H, 0.098 * H, 0.06 * H, n + 2);
  limb(m, -0.1 * H, neck[1], neck[2] - 0.035 * H, 0.1 * H, neck[1], neck[2] - 0.035 * H, 0.047 * H, 0.047 * H, n);
  // What is worn below the waist: a cloth at the hips, a tunic to the knee, a robe to the ankle.
  clothed();
  const standing = p.hip[1] > 0.4;
  if (standing) {
    const hem = p.dress === 'robe' ? 0.06 : p.dress === 'tunic' ? 0.3 : 0.36;
    const spread = p.dress === 'robe' ? 0.135 : 0.115;
    const stride = p.foot2 ? (p.foot[1] + p.foot2[1]) * 0.5 * H : 0;
    limb(m, hip[0], hip[1], hip[2] + 0.03 * H, 0, hip[1] + stride * 0.5, hem * H, 0.092 * H, spread * H, n + 2);
  } else limb(m, hip[0], hip[1] - 0.02 * H, hip[2] + 0.005 * H, 0, hip[1] + 0.07 * H, hip[2] + 0.05 * H, 0.1 * H, 0.09 * H, n + 2);
  // The arms.
  for (const side of [1, -1]) {
    const elbow = at(side < 0 && p.elbow2 ? p.elbow2 : p.elbow, side);
    const hand = at(side < 0 && p.hand2 ? p.hand2 : p.hand, side);
    const shoulder: P = [side * 0.118 * H, neck[1], neck[2] - 0.04 * H];
    if (p.dress === 'wrap') skinTone();
    else clothed();
    limb(m, shoulder[0], shoulder[1], shoulder[2], elbow[0], elbow[1], elbow[2], 0.038 * H, 0.03 * H, n);
    skinTone();
    limb(m, elbow[0], elbow[1], elbow[2], hand[0], hand[1], hand[2], 0.028 * H, 0.022 * H, n);
  }
  // The neck and the head, and its hair.
  skinTone();
  limb(m, neck[0], neck[1], neck[2] - 0.02 * H, neck[0], neck[1] + 0.005 * H, neck[2] + 0.04 * H, 0.03 * H, 0.028 * H, n);
  const hz = neck[2] + 0.095 * H;
  dome(m, 0, neck[1] + 0.008 * H, 0.064 * H, hz, detail === 0 ? 8 : 6, detail === 0 ? 4 : 3, -PI / 2, PI / 2);
  m.mat = MAT.dark;
  dome(m, 0, neck[1] + 0.001 * H, 0.068 * H, hz, detail === 0 ? 8 : 6, 2, 0.3, PI / 2);
  // What it carries, or works at.
  if (p.load === 'head') {
    m.mat = MAT.mud;
    m.tint = 150;
    turnAt(m, 0, neck[1] + 0.008 * H, hz + 0.062 * H, [[0.05, 0], [0.12, 0.07], [0.13, 0.13], [0.07, 0.2], [0.085, 0.215]].map(([r, z]) => [r * H, z * H]), detail === 0 ? 8 : 5);
  } else if (p.load === 'staff' && detail === 0) {
    m.mat = MAT.wood;
    m.tint = 96;
    limb(m, -0.2 * H, 0.22 * H, 0, -0.2 * H, 0.19 * H, 1.02 * H, 0.014 * H, 0.012 * H, 4);
  } else if (p.load === 'basket') {
    m.mat = MAT.matting;
    m.tint = 128;
    turnAt(m, 0, 0.22 * H, 0.5 * H, [[0.07, 0], [0.11, 0.09], [0.115, 0.1]].map(([r, z]) => [r * H, z * H]), detail === 0 ? 8 : 5);
  } else if (p.load === 'quern') {
    m.mat = MAT.rubble;
    m.tint = 128;
    turnAt(m, 0, 0.44 * H, 0, [[0.16, 0], [0.15, 0.08], [0.02, 0.085]].map(([r, z]) => [r * H, z * H]), detail === 0 ? 8 : 5, 0.7);
  }
}

/** A turned shape about a point of the figure's frame. */
function turnAt(m: Mesh, x: number, y: number, z: number, profile: number[][], n: number, sy = 1): void {
  enter(m, x, y, z, 0, 1);
  turn(m, profile, n, 1, sy);
  leave(m);
}
