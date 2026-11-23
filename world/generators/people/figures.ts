// People by the houses: standing, walking, carrying, sitting, at work, a child among them. No record says anything of
// any of them, their dress least of all: they are drawn so that a settlement has its scale and looks lived in, in plain
// wraps and tunics of undyed or earth-dyed cloth, and a click says that they are the generator's. A figure stands at
// the origin and faces +y.
import { dome, figure, limb, MAT, type Mesh } from '../city/kit.ts';
import { PI } from '../city/math.ts';
import { bone, BONE, loft, STRIDE_HIPS } from '../life/forms.ts';
import { enter, leave, turn } from './parts.ts';

/** How many ways a person is drawn. */
export const PERSON_VARIANTS = 8;

/** How high a standing person's hips are, as a share of their height. */
export const PERSON_HIP = 0.52;

/**
 * Whether a person drawn in a way goes about (life/routines.ts): one drawn walking or carrying is on their way as the
 * clock starts; one who stands may set out; one who sits or kneels at work stays.
 */
export function personGoes(variant: number): 'going' | 'may' | 'stays' {
  const v = ((variant % PERSON_VARIANTS) + PERSON_VARIANTS) % PERSON_VARIANTS;
  return v === 2 || v === 3 ? 'going' : v === 4 || v === 5 ? 'stays' : 'may';
}

/** How long a stride of a person so tall is, in metres, drawn in a way: a child's is shorter. */
export const personStride = (height: number, variant: number): number => STRIDE_HIPS * PERSON_HIP * height * (((variant % PERSON_VARIANTS) + PERSON_VARIANTS) % PERSON_VARIANTS === 6 ? 0.68 : 1);

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
 * `height` is a grown person's, and `cloth` and `skin` are the tints its cloth and its skin start from. With `walks`,
 * the mesh is one the renderer may walk (life/routines.ts): its points say what they move with, as an animal's do
 * (life/forms.ts, BONE), its legs striding one against the other and an arm that hangs swinging against its leg; and
 * one drawn walking stands with its feet together, for the renderer to stride them.
 */
export function drawPerson(m: Mesh, height: number, variant: number, detail: 0 | 1 | 2, cloth: number, skin: number, walks = false): void {
  const v = ((variant % PERSON_VARIANTS) + PERSON_VARIANTS) % PERSON_VARIANTS;
  const H = v === 6 ? height * 0.68 : height;
  const keep = m.entity;
  if (walks) m.entity = bone(BONE.none);
  if (detail === 2) {
    m.mat = MAT.cloth;
    m.tint = cloth;
    figure(m, 0, 0, 0, H * (v === 4 || v === 5 ? 0.55 : 1), 0);
    m.entity = keep;
    return;
  }
  const drawn = POSES[v];
  // One who goes about is drawn with the legs of one who stands: the stride is the renderer's.
  const p: Pose = walks && personGoes(v) === 'going' ? { ...drawn, knee: STAND.knee, foot: STAND.foot, knee2: undefined, foot2: undefined } : drawn;
  const strides = walks && personGoes(v) !== 'stays';
  /** What a point of a limb moves with: `first` for the limbs that swing with the left leg, and how far down the limb it is. */
  const code = (first: boolean, share: number): number => bone(first ? BONE.stride : BONE.counter, share);
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
    // A leg strides from the hip: its knee half as far as its foot.
    const first = side > 0;
    const share = (z: number) => (top[2] > foot[2] ? Math.max(0, Math.min(1, (top[2] - z) / (top[2] - foot[2]))) : 0);
    limb(m, top[0], top[1], top[2], knee[0], knee[1], knee[2], 0.05 * H, 0.04 * H, n, strides ? [code(first, 0), code(first, share(knee[2]))] : undefined);
    limb(m, knee[0], knee[1], knee[2], foot[0], foot[1], foot[2], 0.038 * H, 0.027 * H, n, strides ? [code(first, share(knee[2])), code(first, 1)] : undefined);
    if (detail === 0) limb(m, foot[0], foot[1] - 0.02 * H, foot[2] - 0.012 * H, foot[0], foot[1] + 0.075 * H, foot[2] - 0.016 * H, 0.026 * H, 0.02 * H, 4, strides ? [code(first, 1), code(first, 1)] : undefined);
  }
  // The body: the hips, the chest, the shoulders.
  if (p.dress === 'wrap') skinTone();
  else clothed();
  // Wider than it is deep, as a body is: hips, a waist, a chest, shoulders, and in to the neck.
  const up = (f: number, w: number, d: number) => ({ x: 0, y: hip[1] + (neck[1] - hip[1]) * f, z: hip[2] + (neck[2] - hip[2]) * f, w: w * H, h: d * H });
  loft(m, [up(-0.06, 0.082, 0.062), up(0.1, 0.092, 0.066), up(0.36, 0.08, 0.058), up(0.62, 0.1, 0.066), up(0.84, 0.118, 0.06), up(0.95, 0.085, 0.05), up(1.02, 0.034, 0.034)], n + 4);
  // What is worn below the waist: a cloth at the hips, a tunic to the knee, a robe to the ankle.
  clothed();
  const standing = p.hip[1] > 0.4;
  if (standing) {
    // A robe falls to the ground and hides the feet; a tunic to the knee; a wrap covers the hips.
    const hem = p.dress === 'robe' ? -0.015 : p.dress === 'tunic' ? 0.3 : 0.36;
    const spread = p.dress === 'robe' ? 0.14 : 0.115;
    const stride = p.foot2 ? (p.foot[1] + p.foot2[1]) * 0.5 * H : 0;
    const top = hip[2] + 0.03 * H;
    const fall = (f: number, w: number, d: number) => ({ x: 0, y: hip[1] + stride * 0.5 * f, z: top + (hem * H - top) * f, w: w * H, h: d * H });
    // It hangs from the hips, a little fuller at its hem, and deeper where a stride pulls it.
    loft(m, [fall(0, 0.094, 0.068), fall(0.3, 0.1, 0.076), fall(0.7, 0.094 + (spread - 0.094) * 0.7, 0.08 + Math.abs(stride / H) * 0.3), fall(1, spread, 0.09 + Math.abs(stride / H) * 0.5)], n + 4, true);
  } else limb(m, hip[0], hip[1] - 0.02 * H, hip[2] + 0.005 * H, 0, hip[1] + 0.07 * H, hip[2] + 0.05 * H, 0.1 * H, 0.09 * H, n + 2);
  // The arms.
  for (const side of [1, -1]) {
    const elbow = at(side < 0 && p.elbow2 ? p.elbow2 : p.elbow, side);
    const hand = at(side < 0 && p.hand2 ? p.hand2 : p.hand, side);
    const shoulder: P = [side * 0.118 * H, neck[1], neck[2] - 0.04 * H];
    if (p.dress === 'wrap') skinTone();
    else clothed();
    // An arm that hangs swings against the leg of its side, less far than a leg strides; one that holds or carries is
    // held as it is.
    const hangs = strides && hand[2] < 0.5 * H && hand[1] < 0.12 * H;
    const first = side < 0;
    const far = 0.4;
    limb(m, shoulder[0], shoulder[1], shoulder[2], elbow[0], elbow[1], elbow[2], 0.038 * H, 0.03 * H, n, hangs ? [code(first, 0), code(first, far * 0.5)] : undefined);
    skinTone();
    limb(m, elbow[0], elbow[1], elbow[2], hand[0], hand[1], hand[2], 0.028 * H, 0.022 * H, n, hangs ? [code(first, far * 0.5), code(first, far)] : undefined);
  }
  // The neck and the head, and its hair.
  skinTone();
  limb(m, neck[0], neck[1], neck[2] - 0.02 * H, neck[0], neck[1] + 0.005 * H, neck[2] + 0.04 * H, 0.03 * H, 0.028 * H, n);
  const hz = neck[2] + 0.095 * H;
  if (detail === 0) {
    // A head longer than it is wide, narrowing to its chin, with a nose to say which way it faces.
    const hy = neck[1] + 0.008 * H;
    const at = (dz: number, w: number, d: number, fwd = 0) => ({ x: 0, y: hy + fwd * H, z: hz + dz * H, w: w * H, h: d * H });
    loft(m, [at(-0.07, 0.03, 0.034, 0.006), at(-0.045, 0.045, 0.05, 0.008), at(-0.01, 0.056, 0.064, 0.004), at(0.03, 0.058, 0.066), at(0.06, 0.04, 0.046)], 9);
    limb(m, 0, hy + 0.058 * H, hz - 0.012 * H, 0, hy + 0.078 * H, hz - 0.03 * H, 0.011 * H, 0.008 * H, 4);
    // Its hair: over the crown and down the back of the head, clear of the face.
    m.mat = MAT.dark;
    loft(m, [at(-0.03, 0.05, 0.05, -0.022), at(0.0, 0.06, 0.062, -0.014), at(0.035, 0.062, 0.066, -0.008), at(0.066, 0.044, 0.05, -0.004)], 9);
  } else {
    dome(m, 0, neck[1] + 0.008 * H, 0.064 * H, hz, 6, 3, -PI / 2, PI / 2);
    m.mat = MAT.dark;
    dome(m, 0, neck[1] + 0.001 * H, 0.068 * H, hz, 6, 2, 0.3, PI / 2);
  }
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
  m.entity = keep;
}

/** A turned shape about a point of the figure's frame. */
function turnAt(m: Mesh, x: number, y: number, z: number, profile: number[][], n: number, sy = 1): void {
  enter(m, x, y, z, 0, 1);
  turn(m, profile, n, 1, sy);
  leave(m);
}
