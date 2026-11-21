// How a ground looks, where the world says what it is made of (core/substrate.ts). Which materials a place has, in what
// shares, which colours and marks its sources name, and what kind of rock lies under it are the world's. What sand, a
// crust of salt, a "red" mud or a basalt looks like is decided here, and is nobody's record: two tones for each
// material, a tint for each colour a source names, and a tone for each kind of rock, in linear light as the land's own
// tones are (world/generators/life/scene.yaml).
import { GROUND_MATERIALS, type GroundMaterial, type RockKind, type SceneBedrock, type SceneSubstrate } from '../../../core/substrate.ts';

type V3 = [number, number, number];

/** What an outcrop of each kind of rock is drawn as, weathered and from a little way off. */
const ROCKS: Record<RockKind, V3> = {
  siliciclastic: [0.37, 0.3, 0.21],
  'mixed-sedimentary': [0.38, 0.34, 0.27],
  carbonate: [0.5, 0.49, 0.44],
  evaporite: [0.6, 0.59, 0.55],
  pyroclastic: [0.4, 0.36, 0.3],
  'acid-volcanic': [0.4, 0.32, 0.28],
  'intermediate-volcanic': [0.24, 0.23, 0.22],
  'basic-volcanic': [0.1, 0.095, 0.09],
  'acid-plutonic': [0.45, 0.38, 0.34],
  'intermediate-plutonic': [0.33, 0.32, 0.31],
  'basic-plutonic': [0.14, 0.14, 0.13],
  metamorphic: [0.27, 0.27, 0.26],
};
/** How much darker a rock's loose stones lie than its outcrops: the shade between them. */
const STONES = 0.84;

/** The colour of the rock under a scene and of its stones, where the world says what kind it is: null where it does not. */
export function rockLook(b: SceneBedrock | undefined): { rock: V3; stones: V3 } | null {
  const c = b?.rock ? ROCKS[b.rock] : undefined;
  return c ? { rock: c, stones: [c[0] * STONES, c[1] * STONES, c[2] * STONES] } : null;
}

/** Each material's two tones: it is drawn somewhere between them, by noise. */
const TONES: Record<GroundMaterial, [V3, V3]> = {
  sand: [[0.4, 0.33, 0.22], [0.52, 0.44, 0.3]],
  gravel: [[0.2, 0.18, 0.16], [0.36, 0.33, 0.28]],
  silt: [[0.3, 0.26, 0.19], [0.4, 0.35, 0.26]],
  mud: [[0.085, 0.07, 0.055], [0.15, 0.125, 0.095]],
  lime: [[0.42, 0.41, 0.36], [0.56, 0.55, 0.49]],
  evaporite: [[0.62, 0.61, 0.58], [0.8, 0.79, 0.76]],
  organic: [[0.018, 0.014, 0.011], [0.04, 0.03, 0.022]],
  ash: [[0.22, 0.22, 0.215], [0.34, 0.335, 0.33]],
};

/** What a colour's name is drawn as: a sediment of that colour, in full. */
const TINTS: Record<string, V3> = {
  red: [0.3, 0.085, 0.05],
  'red-brown': [0.25, 0.1, 0.055],
  brown: [0.16, 0.1, 0.06],
  yellow: [0.45, 0.34, 0.12],
  green: [0.17, 0.22, 0.14],
  gray: [0.2, 0.2, 0.195],
  black: [0.02, 0.02, 0.022],
  white: [0.66, 0.65, 0.61],
  blue: [0.16, 0.2, 0.25],
};

/** Materials that keep their own colour whatever is said of the rock: a crust of salt is white, and peat is dark. */
const UNTINTED = new Set<GroundMaterial>(['evaporite', 'organic']);
/** How far a named colour takes a material from its own, where every source names one. */
const TINT_STRENGTH = 0.8;
/**
 * How much of the soil under plants is its parent material's colour, where the ground is read from rock: the rest is
 * its own dark earth.
 */
const SOIL_SHARE = 0.5;
/**
 * A topsoil read from a map has amounts and no colour. Its fine earth is drawn as one mixture, a shade of the ground
 * its climate gives it: each fraction pulls the shade its way by its share, sand paler and clay darker.
 */
const SOIL_SHADE: Partial<Record<GroundMaterial, number>> = { sand: 1.14, silt: 1, mud: 0.78 };

/**
 * The order the materials lie in across a ground, from its rises to its hollows: the coarsest first, and last what a
 * drying pool leaves.
 */
const SORTED: GroundMaterial[] = ['gravel', 'sand', 'ash', 'silt', 'mud', 'lime', 'organic', 'evaporite'];

/**
 * The renderer sorts a ground's materials across it by one field of noise (cityShaders.ts, `sorting`): six tenths of
 * one noise and four tenths of another, each read between four of its values. These are that field's quantiles, a
 * thousand of them, found once by drawing it many times: with them a material is given the stretch of the field that
 * covers its share of the ground.
 */
let quantiles: Float32Array | null = null;
function sortingQuantile(share: number): number {
  if (!quantiles) {
    // A small generator of its own, so that every browser draws the same numbers.
    let seed = 0x9e3779b9;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // A noise read between four of its values, each as likely to be anything from 0 to 1, with the step between them
    // eased as the shader eases it.
    const ease = (f: number) => f * f * (3 - 2 * f);
    const bilinear = () => {
      const [fx, fy, a, b, c, d] = [ease(random()), ease(random()), random(), random(), random(), random()];
      return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    };
    const n = 200_000;
    const drawn = new Float32Array(n);
    for (let i = 0; i < n; i++) drawn[i] = 0.6 * bilinear() + 0.4 * bilinear();
    drawn.sort();
    quantiles = new Float32Array(1001);
    for (let k = 0; k <= 1000; k++) quantiles[k] = drawn[Math.min(n - 1, Math.round((k / 1000) * (n - 1)))];
  }
  const x = Math.max(0, Math.min(1, share)) * 1000;
  const k = Math.min(999, Math.floor(x));
  return quantiles[k] + (quantiles[k + 1] - quantiles[k]) * (x - k);
}

/**
 * Each material's stretch of the sorting field, by its share, in the order of GROUND_MATERIALS: two numbers each. The
 * first to lie has no lower edge and the last no upper one.
 */
export function sortingBands(shares: ArrayLike<number>): Float32Array {
  const bands = new Float32Array(GROUND_MATERIALS.length * 2);
  const total = Array.from(shares).reduce((a, b) => a + b, 0) || 1;
  let below = 0;
  let first = true;
  for (const m of SORTED) {
    const i = GROUND_MATERIALS.indexOf(m);
    const share = shares[i] / total;
    if (share <= 0) continue;
    bands[i * 2] = first ? -1 : sortingQuantile(below);
    below += share;
    bands[i * 2 + 1] = below >= 1 - 1e-6 ? 2 : sortingQuantile(below);
    first = false;
  }
  return bands;
}

const luma = (c: V3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export interface GroundLook {
  /** how much of the ground the substrate decides, 0–1 */
  weight: number;
  /** each material's share, in the order of GROUND_MATERIALS */
  shares: Float32Array;
  /** each material's stretch of the field the renderer sorts them by: two numbers a material */
  bands: Float32Array;
  /** each material's two tones, tinted as the sources say: six numbers a material */
  tones: Float32Array;
  /** the two tones of the whole, for the ground from afar */
  mean: [V3, V3];
  /** how much of what was said names cracks, and ripples; and the grain, from -1 fine to 1 coarse */
  cracks: number;
  ripples: number;
  grain: number;
  /** how much of the earth under plants takes the ground's colour, 0–1 */
  soil: number;
  /**
   * For a topsoil read from a map: the shade of its fine earth beside the ground its climate gives it. Its stones are
   * its gravel, scattered through it. Nothing for a ground read from rock, whose materials lie sorted in their own colours.
   */
  shade: number;
}

/**
 * The look of a scene's ground, or null where nothing says what it is made of. `rock` is the colour of the rock under
 * it, where the world says what kind it is: its gravel is stones of that.
 */
export function groundLook(s: SceneSubstrate | undefined, rock?: { rock: V3; stones: V3 } | null): GroundLook | null {
  if (!s || !s.materials.length) return null;
  const mapped = s.from === 'soil';
  // The tint: the colours named, by their shares; and how far it carries, by how much of what was said names one.
  let tint: V3 = [0, 0, 0];
  let named = 0;
  for (const [word, share] of s.colours) {
    const t = TINTS[word];
    if (!t) continue;
    tint = [tint[0] + t[0] * share, tint[1] + t[1] * share, tint[2] + t[2] * share];
    named += share;
  }
  if (named > 0) tint = [tint[0] / named, tint[1] / named, tint[2] / named];
  const strength = Math.min(1, named) * TINT_STRENGTH;
  // A dark material tinted stays darker than a pale one: the tint takes on some of the material's own lightness.
  const tinted = (c: V3): V3 => {
    if (!strength) return c;
    const k = Math.max(0.5, Math.min(1.6, luma(c) / Math.max(luma(tint), 1e-4)));
    return mix(c, [tint[0] * k, tint[1] * k, tint[2] * k], strength);
  };
  const shares = new Float32Array(GROUND_MATERIALS.length);
  const tones = new Float32Array(GROUND_MATERIALS.length * 6);
  let lo: V3 = [0, 0, 0];
  let hi: V3 = [0, 0, 0];
  const of = new Map(s.materials);
  let fine = 0;
  let shaded = 0;
  GROUND_MATERIALS.forEach((m, i) => {
    const share = of.get(m) ?? 0;
    shares[i] = share;
    let a: V3;
    let b: V3;
    if (m === 'gravel' && rock) {
      // Gravel is stones of the rock under the place, where that is known: from its shade to its outcrop's colour.
      a = [rock.stones[0] * 0.66, rock.stones[1] * 0.66, rock.stones[2] * 0.66];
      b = rock.rock;
    } else [a, b] = TONES[m].map((c) => (UNTINTED.has(m) || (mapped && m === 'gravel') ? c : tinted(c))) as [V3, V3];
    tones.set([...a, ...b], i * 6);
    lo = [lo[0] + a[0] * share, lo[1] + a[1] * share, lo[2] + a[2] * share];
    hi = [hi[0] + b[0] * share, hi[1] + b[1] * share, hi[2] + b[2] * share];
    if (m !== 'gravel') {
      fine += share;
      shaded += share * (SOIL_SHADE[m] ?? 1);
    }
  });
  const mark = (name: string) => s.marks.find(([m]) => m === name)?.[1] ?? 0;
  return { weight: s.weight, shares, bands: sortingBands(shares), tones, mean: [lo, hi], cracks: mark('cracks'), ripples: mark('ripples'), grain: Math.max(-1, Math.min(1, mark('coarse') - mark('fine'))), soil: mapped ? 1 : SOIL_SHARE, shade: mapped ? (fine > 0 ? shaded / fine : 1) : 0 };
}

const GRAVEL = GROUND_MATERIALS.indexOf('gravel');

/**
 * The land's tones with the ground's in them, so that the ground from afar is the colour of the ground close by. Read
 * from rock, the bare ground becomes the substrate's own as far as it decides, and the soil under plants part of the
 * way. Read from a map of topsoil, the soil and the bare ground keep their climate's colours in the soil's shade, with
 * its stones' colour for their share. `tones` is the land's thirty numbers: soil, low plants, bare ground, canopy and
 * low plants from afar, two tones each.
 */
export function groundTones(tones: number[], look: GroundLook | null): number[] {
  if (!look) return tones;
  const out = [...tones];
  if (look.shade > 0) {
    const stony = look.shares[GRAVEL];
    for (const at of [0, 12]) {
      for (let k = 0; k < 2; k++) {
        for (let c = 0; c < 3; c++) {
          const was = tones[at + k * 3 + c];
          const now = was * look.shade * (1 - stony) + look.tones[GRAVEL * 6 + k * 3 + c] * stony;
          out[at + k * 3 + c] = was + (now - was) * look.weight;
        }
      }
    }
    return out;
  }
  const blend = (at: number, t: number) => {
    for (let k = 0; k < 2; k++) for (let c = 0; c < 3; c++) out[at + k * 3 + c] = tones[at + k * 3 + c] + (look.mean[k][c] - tones[at + k * 3 + c]) * t;
  };
  blend(0, look.weight * look.soil);
  blend(12, look.weight);
  return out;
}
