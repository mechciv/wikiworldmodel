// Where each material of a ground lies across it, where the world says what the ground is made of (core/substrate.ts).
// Which materials a place has, and in what shares, are the world's. Where each lies is invented here, and nobody's
// record: one field of noise sorts them, the coarsest on the ground's rises and the finest in its hollows, each over the
// share of the ground its sources give it. The renderer colours the ground by this field (viewer/src/gl/cityShaders.ts,
// `sorting`), and the generator sows by it what stands on the ground: stones where its gravel lies, and next to nothing
// on a crust of salt. Both read the same noise, so that a stone stands on the gravel it is one of.
import { GROUND_MATERIALS, type GroundMaterial, type SceneSubstrate } from '../../../core/substrate.ts';
import { hash3 } from '../city/math.ts';

/** The side of the renderer's block of noise, which repeats: four channels, each value as likely as any other. */
export const NOISE_SIZE = 64;
/** One value of that noise, 0–255: channel `c` at (x, y, z). The renderer's texture is these (viewer/src/gl/city.ts). */
export const noiseByte = (x: number, y: number, z: number, c: number): number => Math.floor(hash3(x, y, z, 0x3779 + c * 101) * 256);

/**
 * How the sorting field is read from the noise: which sheet and channel each of its parts is, how many metres a value of
 * it spans, and how much it counts. The place is first read a few metres aside, by two channels of a sheet of their own,
 * so that the field's patches wander. The shader is written from these numbers too.
 */
export const SORTING = {
  aside: { sheet: 40, span: 5, by: 7 },
  broad: { sheet: 0, channel: 0, span: 9, weight: 0.6 },
  fine: { sheet: 20, channel: 1, span: 2.2, weight: 0.4, offset: 23.7 },
} as const;
/** How wide the edge between two materials is, in the field's units. */
export const SORT_EDGE = 0.02;
/**
 * A topsoil read from a map has stones scattered through its fine earth: thick on the ground's rises, up to this many
 * times their share, and thinning to none in its hollows, between these two values of the field.
 */
export const SOIL_STONES = { most: 2, rises: [0.38, 0.62] } as const;
/** How much of a mud is drawn dried into cracks: all of it once this share of what its sources say names cracks. */
export const DRIED_AT = 1 / 3;
export const driedShare = (cracks: number): number => Math.min(1, cracks / DRIED_AT);

/**
 * The order the materials lie in across a ground, from its rises to its hollows: the coarsest first, and last what a
 * drying pool leaves.
 */
export const SORTED: GroundMaterial[] = ['gravel', 'sand', 'ash', 'silt', 'mud', 'lime', 'organic', 'evaporite'];

const sheets = new Map<number, Float32Array>();
/** One channel of one sheet of the noise, 0–1 as a texture gives it. */
function sheet(z: number, c: number): Float32Array {
  const key = z * 4 + c;
  let s = sheets.get(key);
  if (!s) {
    s = new Float32Array(NOISE_SIZE * NOISE_SIZE);
    for (let y = 0; y < NOISE_SIZE; y++) for (let x = 0; x < NOISE_SIZE; x++) s[y * NOISE_SIZE + x] = noiseByte(x, y, z, c) / 255;
    sheets.set(key, s);
  }
  return s;
}

/**
 * A sheet read at a place given in its own cells, between four of its values, the step between them eased: as the
 * shader reads it (`eased`), so that the levels of what is read curve and do not run straight from value to value.
 */
function read(s: Float32Array, x: number, y: number): number {
  const xi = Math.floor(x - 0.5);
  const yi = Math.floor(y - 0.5);
  let fx = x - 0.5 - xi;
  let fy = y - 0.5 - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const m = NOISE_SIZE - 1;
  const i0 = xi & m;
  const i1 = (xi + 1) & m;
  const j0 = (yi & m) * NOISE_SIZE;
  const j1 = ((yi + 1) & m) * NOISE_SIZE;
  const a = s[j0 + i0];
  const b = s[j0 + i1];
  const c = s[j1 + i0];
  const d = s[j1 + i1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** Where a place lies in the sorting of its ground, 0 to 1: low on its rises, high in its hollows. x east and y north, in the scene's metres. */
export function sorting(x: number, y: number): number {
  const { aside, broad, fine } = SORTING;
  const qx = x + aside.by * (read(sheet(aside.sheet, 2), x / aside.span, y / aside.span) - 0.5);
  const qy = y + aside.by * (read(sheet(aside.sheet, 3), x / aside.span, y / aside.span) - 0.5);
  return broad.weight * read(sheet(broad.sheet, broad.channel), qx / broad.span, qy / broad.span) + fine.weight * read(sheet(fine.sheet, fine.channel), qx / fine.span + fine.offset, qy / fine.span + fine.offset);
}

/**
 * The field's quantiles, a thousand of them, found once by drawing it many times: with them a material is given the
 * stretch of the field that covers its share of the ground. The field is six tenths of one noise and four tenths of
 * another, each read between four of its values.
 */
let quantiles: Float32Array | null = null;
function sortingQuantile(share: number): number {
  if (!quantiles) {
    // A small generator of its own, so that every machine draws the same numbers.
    let seed = 0x9e3779b9;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // A noise read between four of its values, each as likely to be anything from 0 to 1, with the step between them
    // eased as the field eases it.
    const ease = (f: number) => f * f * (3 - 2 * f);
    const bilinear = () => {
      const [fx, fy, a, b, c, d] = [ease(random()), ease(random()), random(), random(), random(), random()];
      return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    };
    const n = 200_000;
    const drawn = new Float32Array(n);
    for (let i = 0; i < n; i++) drawn[i] = SORTING.broad.weight * bilinear() + SORTING.fine.weight * bilinear();
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

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/**
 * How much of what its climate would grow a ground bears, by what it is made of: a share for each material that bears
 * less than all, and one for a mud that dried into cracks (`cracked`). A generator's choice (world/generators/life/
 * scene.yaml, `cover.bears`).
 */
export type Bears = Partial<Record<GroundMaterial | 'cracked', number>>;

/** What each material of a substrate bears, in the order of GROUND_MATERIALS: all, unless the table says less. */
function bearing(s: SceneSubstrate | undefined, bears: Bears | undefined): Float32Array {
  const out = new Float32Array(GROUND_MATERIALS.length).fill(1);
  if (!s || !bears) return out;
  const dried = driedShare(s.marks.find(([m]) => m === 'cracks')?.[1] ?? 0);
  GROUND_MATERIALS.forEach((m, i) => {
    let b = bears[m] ?? 1;
    // A mud bears as a cracked one as far as it is drawn cracked.
    if ((m === 'mud' || m === 'lime') && bears.cracked !== undefined) b = b * (1 - dried) + Math.min(b, bears.cracked) * dried;
    out[i] = Math.max(0, Math.min(1, b));
  });
  return out;
}

/**
 * How much of what its climate would grow a scene's ground bears, in the mean over its materials, 0–1: all of it where
 * nothing says what the ground is made of, or where none of its materials bears less.
 */
export function meanBears(s: SceneSubstrate | undefined, bears: Bears | undefined): number {
  if (!s || !bears || !s.materials.length) return 1;
  const each = bearing(s, bears);
  let mean = 0;
  let all = 0;
  for (const [m, share] of s.materials) {
    mean += share * each[GROUND_MATERIALS.indexOf(m)];
    all += share;
  }
  return all > 0 ? 1 - s.weight * (1 - mean / all) : 1;
}

const GRAVEL = GROUND_MATERIALS.indexOf('gravel');
/**
 * A scene's ground as its substrate sorts it: how stony each place is, and how much of its climate's cover it bears.
 * Without a substrate nothing is known of either: no place is stony, and every place bears all its climate grows.
 */
export class GroundSort {
  /** each material's share, in the order of GROUND_MATERIALS */
  readonly shares = new Float32Array(GROUND_MATERIALS.length);
  /** each one's stretch of the field: worked out when a place is first asked about */
  private stretch: Float32Array | null = null;
  /** how much of the ground the substrate decides */
  readonly weight: number;
  /** a topsoil read from a map: one mixture, with its stones scattered through it */
  readonly mapped: boolean;
  /** how much of what was said of the ground names its grain coarse, less how much names it fine: −1 to 1 */
  readonly grain: number;
  /** what each material bears, in the order of GROUND_MATERIALS; and what the whole ground bears, in the mean */
  private bear: Float32Array;
  readonly bears: number;

  constructor(s: SceneSubstrate | undefined, bears: Bears | undefined) {
    this.weight = s?.weight ?? 0;
    this.mapped = s?.from === 'soil';
    for (const [m, share] of s?.materials ?? []) this.shares[GROUND_MATERIALS.indexOf(m)] = share;
    const mark = (name: string) => s?.marks.find(([m]) => m === name)?.[1] ?? 0;
    this.grain = Math.max(-1, Math.min(1, mark('coarse') - mark('fine')));
    this.bear = bearing(s, bears);
    this.bears = meanBears(s, bears);
  }

  private get bands(): Float32Array {
    return (this.stretch ??= sortingBands(this.shares));
  }

  /** Whether the ground has any gravel: without it no place is stony. */
  get stones(): boolean {
    return this.weight > 0 && this.shares[GRAVEL] > 0;
  }

  /** Whether some of the ground bears less than all its climate grows. */
  get barren(): boolean {
    return this.bears < 1;
  }

  /**
   * How much of the ground at a place is stones, 0–1: all of it on a sheet of gravel, which lies on the ground's rises
   * over the share of it the sources give; in a mapped topsoil up to twice the stones' share on the rises, and none in
   * the hollows.
   */
  stonyAt(x: number, y: number): number {
    const share = this.shares[GRAVEL];
    if (!(share > 0) || !(this.weight > 0)) return 0;
    const u = sorting(x, y);
    if (this.mapped) return this.weight * Math.min(1, share * SOIL_STONES.most * (1 - smoothstep(SOIL_STONES.rises[0], SOIL_STONES.rises[1], u)));
    const top = this.bands[GRAVEL * 2 + 1];
    return this.weight * (1 - smoothstep(top - SORT_EDGE, top + SORT_EDGE, u));
  }

  /**
   * How much of what its climate would grow the ground at a place bears, 0–1: what the material lying there bears, or
   * in a mapped topsoil, which is one mixture, what the whole does.
   */
  bearsAt(x: number, y: number): number {
    if (this.bears >= 1) return 1;
    if (this.mapped) return this.bears;
    const u = sorting(x, y);
    let b = 0;
    let sum = 0;
    for (let i = 0; i < this.bear.length; i++) {
      if (!(this.shares[i] > 0)) continue;
      const w = smoothstep(this.bands[i * 2] - SORT_EDGE, this.bands[i * 2] + SORT_EDGE, u) - smoothstep(this.bands[i * 2 + 1] - SORT_EDGE, this.bands[i * 2 + 1] + SORT_EDGE, u);
      if (w <= 0) continue;
      b += w * this.bear[i];
      sum += w;
    }
    return 1 - this.weight * (1 - (sum > 0 ? b / sum : 1));
  }
}
