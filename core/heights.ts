// The sea's level and the height of the land (model:earth/shore-level, model:earth/land-height;
// docs/plans/MODELS.md, decisions 2, 3, 12 to 15; docs/slices/TWENTY-THIRD-SLICE.md).
//
// The elevation field gives one height for each node of its grid at each keyframe, against the sea of the time, and
// nothing to say how sure it is. The rocks say more. A fossil collection names the environment its bed was laid down
// in, and some of those are the shore itself: a lagoon, an estuary, a tidal flat, a beach. A bed laid down at the
// shore stood at the sea's level, so where the map puts such beds is where the map puts the sea, and how far that is
// from the map's own coast is the level told here. It needs no count of how many beds of each kind were found, which
// is what a level read from the kinds of beds would need: the sea leaves far more beds than the land, by a yield no
// one knows, and each doubling of the yield is worth some hundreds of metres of level.
//
// The same beds are only found where their ground is land today, which is where it has since risen, and the maps of
// the last sixty million years carry much of today's height for such ground. So the level is read on a line: the
// map's height at a shore bed against today's height of the bed's ground, taken where that ground stands at today's
// sea level. What the sea's level was against today's ground cannot be told so, and the model says by how much the
// level would move for each metre of it.
//
// The height of the land is then the map's, less the level, with a spread: the map's own miss, measured at the
// present against today's surveyed ground, grown by how much wider the map misses the shore beds of a keyframe than it
// misses those of the present, and on high ground by how far it misses the ranges whose records say they stood. Three
// kinds of evidence move it. A range's record: from when it stood, its ground stood at about today's height. A shore
// bed near: the map's miss there is known, and is carried to the ground about it. And the kinds of the beds found
// near, of the sea and of the land: they turn the chance that the ground lay below the level, as the chance of sea
// reads them (core/coast.ts), and the height is the map's bell cut at the level, each side weighed by that chance.
// A member of the world is one quantile of every node's height, the median member's the middle one.
import { expit, logit, memberLevel, nodeOf, type SeaGrid, type SeaScore } from './coast.ts';
import { kmBetween } from './landscape.ts';
import type { SeriesRecord, SourceRecord } from './records.ts';

// ——— The bell ———

/** The share of a bell that lies below `x` of its standard deviations. */
export function bellBelow(x: number): number {
  // Abramowitz and Stegun 7.1.26, good to a few parts in ten million.
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** How many standard deviations of a bell a share `u` of it lies below: the inverse of `bellBelow` (Acklam's form). */
export function bellAt(u: number): number {
  const p = Math.max(1e-12, Math.min(1 - 1e-12, u));
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ——— The grid, read between its nodes ———

/** A grid's value at a place, read straight between the four nodes about it. */
export function between(values: ArrayLike<number>, g: SeaGrid, lat: number, lon: number): number {
  const y = Math.max(0, Math.min(g.ny - 1, (90 - lat) / g.step));
  const x = ((((lon + 180) / g.step) % g.nx) + g.nx) % g.nx;
  const i = Math.min(g.ny - 2, Math.floor(y));
  const j = Math.floor(x);
  const fy = y - i;
  const fx = x - j;
  const at = (a: number, b: number) => values[a * g.nx + (b % g.nx)];
  return (1 - fy) * ((1 - fx) * at(i, j) + fx * at(i, j + 1)) + fy * ((1 - fx) * at(i + 1, j) + fx * at(i + 1, j + 1));
}

// ——— The beds ———

/** A collection of the rock record at a keyframe: where its plate stood then, where it lies today, and what it says. */
export interface BedSite {
  lat: number;
  lon: number;
  lat0: number;
  lon0: number;
  /** laid down under the sea, or on land */
  sea: boolean;
  /** laid down at the shore: its environment is one of the shore's */
  shore: boolean;
  /** the share of its own span that lies in the keyframe's */
  share: number;
}

/**
 * A kind of bed found in a small box of ground in a keyframe's span: the chance of sea's locality (core/coast.ts,
 * Locality), with where it lies today and whether any of it was laid down at the shore.
 */
export interface Bed {
  lat: number;
  lon: number;
  /** where it lies today: the middle of its collections' places */
  lat0: number;
  lon0: number;
  sea: boolean;
  /** the chance that one at least of its collections is of the span, 0–1 */
  w: number;
  /** the chance that one at least of its collections laid down at the shore is: 0 for a bed of the land */
  shore: number;
  node: number;
}

/**
 * The beds some collections make. The boxes, the kinds and the weights are those of the chance of sea's localities
 * (localitiesOf, core/coast.ts), so that the two models are held to the same localities.
 */
export function bedsOf(sites: Iterable<BedSite>, box: number, g: SeaGrid): Bed[] {
  const acc = new Map<string, { miss: number; shoreMiss: number; lat0: number; lon0: number; lon1: number; n: number }>();
  for (const s of sites) {
    if (!(s.share > 0)) continue;
    const key = `${s.sea ? 1 : 0}:${Math.round(s.lat / box)}:${Math.round(s.lon / box)}`;
    let a = acc.get(key);
    if (!a) acc.set(key, (a = { miss: 1, shoreMiss: 1, lat0: 0, lon0: 0, lon1: s.lon0, n: 0 }));
    const share = Math.min(1, s.share);
    a.miss *= 1 - share;
    if (s.sea && s.shore) a.shoreMiss *= 1 - share;
    // The middle of the places: longitudes are taken the short way round from the first.
    let lon = s.lon0 - a.lon1;
    lon -= 360 * Math.round(lon / 360);
    a.lat0 += s.lat0;
    a.lon0 += a.lon1 + lon;
    a.n++;
  }
  const out: Bed[] = [];
  for (const [key, a] of acc) {
    const [kind, la, lo] = key.split(':');
    const lat = Math.max(-90, Math.min(90, Number(la) * box));
    const lon = Number(lo) * box;
    let lon0 = a.lon0 / a.n;
    lon0 -= 360 * Math.floor((lon0 + 180) / 360);
    out.push({ lat, lon, lat0: a.lat0 / a.n, lon0, sea: kind === '1', w: 1 - a.miss, shore: 1 - a.shoreMiss, node: nodeOf(g, lat, lon) });
  }
  return out.sort((x, y) => x.node - y.node || Number(y.sea) - Number(x.sea) || x.lat - y.lat || x.lon - y.lon);
}

// ——— The level, from the beds laid down at the shore ———

/** The value below which half the weight lies. */
export function middle(values: ArrayLike<number>, weights: ArrayLike<number>): number {
  const n = values.length;
  if (!n) return 0;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[a] - values[b]);
  let total = 0;
  for (let i = 0; i < n; i++) total += weights[i];
  let acc = 0;
  for (const i of idx) {
    acc += weights[i];
    if (acc >= total / 2) return values[i];
  }
  return values[idx[n - 1]];
}

/** The value below which a share `q` of the weight lies. */
export function shareBelow(values: ArrayLike<number>, weights: ArrayLike<number>, q: number): number {
  const n = values.length;
  if (!n) return 0;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[a] - values[b]);
  let total = 0;
  for (let i = 0; i < n; i++) total += weights[i];
  let acc = 0;
  for (const i of idx) {
    acc += weights[i];
    if (acc >= total * q) return values[i];
  }
  return values[idx[n - 1]];
}

/**
 * How wide a bell must be to hold nine in ten of some misses about nothing: the size nine in ten of them are under,
 * over how many standard deviations nine tenths of a bell lie within. The map's misses have long tails, and a bell
 * as wide as their middle half would leave a quarter of them outside the band it draws.
 */
export function spreadOf(misses: ArrayLike<number>, weights: ArrayLike<number>): number {
  const sizes = Array.from(misses, (m) => Math.abs(m));
  return shareBelow(sizes, weights, 0.9) / 1.6449;
}

/** A shore bed as the level reads it: the map's height above its own coast where the bed stood, and today's height of its ground. */
export interface ShorePoint {
  /** the map's height above its coast, read no deeper than the rule's floor */
  m: number;
  /** today's height of the bed's ground above today's sea, never below it */
  t: number;
  w: number;
}

/** The level some shore beds give when the map follows today's height of their ground by `follow`: the middle of what is left, and how far the beds scatter about it. */
export function levelGiven(points: ShorePoint[], follow: number): { level: number; scale: number } {
  const rest = points.map((p) => p.m - follow * p.t);
  const w = points.map((p) => p.w);
  const level = middle(rest, w);
  return { level, scale: 1.4826 * middle(rest.map((r) => Math.abs(r - level)), w) };
}

/**
 * The straight line through some shore beds, by least absolute misses: how far the map's height at a bed follows
 * today's height of the bed's ground (a share from nothing to all of it), and the level, which is the map's height
 * for a bed whose ground stands at today's sea level. A map that is today's ground carried back follows by all of it,
 * and then the beds say nothing of the level but what the map has done to low ground.
 */
export function shoreLine(points: ShorePoint[]): { level: number; follow: number; scale: number } {
  if (!points.length) return { level: 0, follow: 0, scale: 0 };
  const miss = (follow: number): number => {
    const { level } = levelGiven(points, follow);
    let sum = 0;
    for (const p of points) sum += p.w * Math.abs(p.m - follow * p.t - level);
    return sum;
  };
  // The sum of absolute misses is convex in the slope: a golden section finds its lowest point.
  const g = (Math.sqrt(5) - 1) / 2;
  let a = 0;
  let b = 1;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = miss(c);
  let fd = miss(d);
  for (let i = 0; i < 24; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = miss(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = miss(d);
    }
  }
  const follow = Math.round(((a + b) / 2) * 1000) / 1000;
  return { follow, ...levelGiven(points, follow) };
}

/** What a keyframe's own shore beds say of its level, and how sure they are; nothing where they cannot tell it. */
export interface LevelSeen {
  value: number;
  sd: number;
}

/**
 * The level through time, as a walk that is pulled back to nothing: before any bed is read the level is the map's own
 * coast, give or take `sd`, and a keyframe's level is `hold` of the one before it and the rest its own. Each
 * keyframe's shore beds then observe it, and the level of a keyframe with none is carried from those either side,
 * falling back to the map's the further they are. Exact, by the filter and the smoother of Kalman's kind.
 */
export function smoothLevels(seen: (LevelSeen | undefined)[], hold: number, sd: number): { mean: number; sd: number }[] {
  const n = seen.length;
  const own = sd * sd * (1 - hold * hold);
  const m = new Float64Array(n);
  const v = new Float64Array(n);
  // What the keyframes before say of each, before its own beds are read.
  const pm = new Float64Array(n);
  const pv = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    pm[k] = k ? hold * m[k - 1] : 0;
    pv[k] = k ? hold * hold * v[k - 1] + own : sd * sd;
    const s = seen[k];
    if (s) {
      const gain = pv[k] / (pv[k] + s.sd * s.sd);
      m[k] = pm[k] + gain * (s.value - pm[k]);
      v[k] = (1 - gain) * pv[k];
    } else {
      m[k] = pm[k];
      v[k] = pv[k];
    }
  }
  for (let k = n - 2; k >= 0; k--) {
    const back = (hold * v[k]) / pv[k + 1];
    m[k] += back * (m[k + 1] - pm[k + 1]);
    v[k] += back * back * (v[k + 1] - pv[k + 1]);
  }
  return Array.from({ length: n }, (_, k) => ({ mean: m[k], sd: Math.sqrt(Math.max(0, v[k])) }));
}

/** The level of each keyframe told from the others alone: what its own beds are held to when it is the one left out. */
export function levelsWithout(seen: (LevelSeen | undefined)[], hold: number, sd: number): { mean: number; sd: number }[] {
  return seen.map((_, k) => smoothLevels(seen.map((s, j) => (j === k ? undefined : s)), hold, sd)[k]);
}

// ——— The height, and what moves it ———

/** A height above the level as a bell: its middle and its spread, in metres. */
export interface Height {
  mean: number;
  sd: number;
}

/** How far the map is taken to miss: by `base` metres anywhere, and besides by `high` of its height above the level or by `deep` of its depth below it. */
export interface Miss {
  base: number;
  high: number;
  deep: number;
}

/** The map's height above the level as a bell: its own value, and how far it is taken to miss there, with the level's own doubt. */
export function mapHeight(above: number, miss: Miss, levelSd: number): Height {
  const more = above >= 0 ? miss.high * above : miss.deep * above;
  return { mean: above, sd: Math.sqrt(miss.base * miss.base + more * more + levelSd * levelSd) };
}

/**
 * A height with a range's record: from when the range stood, its ground stood at about today's height, give or take
 * `doubt` metres. The two bells are multiplied, each counting by how sure it is. The map's misses have long tails,
 * which a bell does not: where the record is further from the map than the map's bell is wide, the map is taken to be
 * in one of its long misses there, and its bell is widened to the difference before the two are multiplied. So a
 * plateau the map has low is raised nearly to its record, and is not held down by the map's sureness of low ground.
 */
export function withRange(h: Height, today: number, doubt: number): Height {
  const sd = Math.max(h.sd, Math.abs(today - h.mean));
  const a = 1 / (sd * sd);
  const b = 1 / (doubt * doubt);
  return { mean: (a * h.mean + b * today) / (a + b), sd: Math.sqrt(1 / (a + b)) };
}

/**
 * A height with the shore beds near. At a bed laid down at the shore the ground stood at the level, so the map's
 * height above the level there is the map's miss, known. `sum` is the beds near, each counted by how near it lies,
 * and `miss` their misses summed with the same counts; the map's own word counts for `counts` beds, which is how many
 * times surer the map is of a node than a bed is of the node it lies in. The miss carried to the place is taken off,
 * and the spread narrows.
 */
export function withShore(h: Height, sum: number, miss: number, counts: number): Height {
  if (!(sum > 0)) return h;
  return { mean: h.mean - miss / (counts + sum), sd: h.sd * Math.sqrt(counts / (counts + sum)) };
}

/** The chance that ground of a height lies below the level: the share of its bell below nothing. */
export const chanceBelow = (h: Height): number => bellBelow(-h.mean / h.sd);

/**
 * The chance of sea before the kinds of beds near are read: the bell's own, and never surer than `cap` allows, as a
 * log of odds either way. The map's misses have long tails, and a map drawn by hand is not surer than that anywhere
 * (the chance of sea's own cap: core/coast.ts).
 */
export function chanceBefore(h: Height, cap: number): number {
  return Math.max(expit(-cap), Math.min(expit(cap), chanceBelow(h)));
}

/**
 * The share of marine among what a place yields (core/coast.ts, marineShare), from a chance of sea in place of a
 * distance from the coast: what the chance would yield, averaged with what was found near. The chance's word counts
 * for `counts` beds, and with `least` for whatever what was found near falls short of that many: a trace of a bed,
 * far off or on ground of another height, then moves the chance by its share of a bed and no more, where without it
 * a fifth of one stray bed would outweigh a map that has the ground two kilometres up.
 */
export function marineAmong(chance: number, marine: number, land: number, yieldLog: number, counts: number, least = 0): number {
  const c = Math.max(1e-9, Math.min(1 - 1e-9, chance));
  const own = Math.max(counts, least - marine - land);
  return (own * expit(logit(c) + yieldLog) + marine) / (own + marine + land);
}

/** The chance of sea a share of marine gives, turned back by the yield. */
export function chanceFrom(share: number, yieldLog: number): number {
  const q = Math.max(1e-12, Math.min(1 - 1e-12, share));
  return expit(logit(q) - yieldLog);
}

/**
 * The height below which a share `u` of the chances lies, for ground whose bell is `h` and whose chance of lying
 * below the level is `chance`. The bell is cut at the level, and its two sides are weighed by the chance and by what
 * is left of one: where the chance is the bell's own, nothing is changed. So a member of the world, which is one `u`
 * for every node, has sea exactly where the chance of it is above its `u`.
 */
export function heightAt(h: Height, chance: number, u: number): number {
  const below = Math.max(1e-9, Math.min(1 - 1e-9, chanceBelow(h)));
  const c = Math.max(1e-9, Math.min(1 - 1e-9, chance));
  const share = u < c ? (u * below) / c : below + ((u - c) * (1 - below)) / (1 - c);
  const x = h.mean + h.sd * bellAt(share);
  // What a float cannot keep apart is kept on its own side of the level.
  return u < c ? Math.min(x, 0) : Math.max(x, 0);
}

/** A member's height (core/samples.ts): member 0 the middle one, and each member one share for every node (core/coast.ts, memberLevel). */
export const memberHeight = (h: Height, chance: number, member: number): number => heightAt(h, chance, memberLevel(member));

/** The shares the band is drawn between: one chance in twenty of lower, one in twenty of higher. */
export const HEIGHT_BAND: [number, number] = [0.05, 0.95];

/** A node's height as a click or a command reads it: the middle, the band, and the chance it lay below the level. */
export function heightOf(h: Height, chance: number): { middle: number; lo: number; hi: number; chance: number } {
  return { middle: heightAt(h, chance, 0.5), lo: heightAt(h, chance, HEIGHT_BAND[0]), hi: heightAt(h, chance, HEIGHT_BAND[1]), chance };
}

// ——— What was found near each node ———

/** What was found near each node: beds of the sea and of the land, the shore beds among them, and the map's miss at those. */
export interface Near {
  /** by distance alone, as the chance of sea counts its localities */
  marine: Float32Array;
  land: Float32Array;
  /** the same counted only so far as the map has the node's ground as high as the bed's: what the heights read */
  marineLike: Float32Array;
  landLike: Float32Array;
  shore: Float32Array;
  /** the shore beds' misses, each times its count */
  miss: Float32Array;
}

export const nothingNear = (g: SeaGrid): Near => {
  const n = g.nx * g.ny;
  return { marine: new Float32Array(n), land: new Float32Array(n), marineLike: new Float32Array(n), landLike: new Float32Array(n), shore: new Float32Array(n), miss: new Float32Array(n) };
};

/** A way of grouping nodes, and what was found near each node from the beds of its own group. */
export interface OwnNear {
  group: (node: number) => number;
  into: Near;
}

/** How a bed's word is carried to ground about it: by how like the map's height there is to the map's height at the bed. */
export interface Like {
  /** each node's height on the map, and each bed's, on one footing */
  node: ArrayLike<number>;
  bed: ArrayLike<number>;
  /** the difference of height, in metres, at which a shore bed's word on the map's miss counts for six tenths of what it would on ground of its own height */
  m: number;
  /** the same for the kind of a bed, of the sea or of the land */
  kinds_m: number;
}

/**
 * Adds beds to what was found near each node, as the chance of sea counts its localities (core/coast.ts, addFinds): a
 * bed counts whole at its own place and less with distance, as a bell `km` wide, and not beyond three times that;
 * over the ocean's floor (`floor`) at its own node and no other. `missOf` is the map's height at a shore bed. For
 * the heights a bed's word is carried only to ground of like height on the map (`like`): the foot of a range says
 * nothing of its crest, a degree away. With `own`, what a node has from the beds of its own group is kept
 * apart, so that a group's beds can be taken out again when they are the ones to be told.
 */
export function addBeds(into: Near, beds: Bed[], missOf: (b: Bed, i: number) => number, g: SeaGrid, km: number, own: OwnNear[] = [], floor?: ArrayLike<number>, like?: Like): void {
  const reach = 3 * km;
  const band = reach / 111.2;
  const mine = new Array<number>(own.length);
  beds.forEach((b, bi) => {
    const row0 = Math.max(0, Math.ceil((90 - (b.lat + band)) / g.step));
    const row1 = Math.min(g.ny - 1, Math.floor((90 - (b.lat - band)) / g.step));
    const miss = b.shore > 0 ? missOf(b, bi) : 0;
    for (let o = 0; o < own.length; o++) mine[o] = own[o].group(b.node);
    for (let row = row0; row <= row1; row++) {
      const lat = 90 - row * g.step;
      const widest = Math.cos((Math.min(89.999, Math.abs(lat)) * Math.PI) / 180);
      const span = Math.min(180, band / Math.max(widest, 1e-6));
      const col0 = Math.ceil((b.lon - span + 180) / g.step);
      const cols = span >= 180 ? g.nx : Math.floor((b.lon + span + 180) / g.step) - col0 + 1;
      for (let c = 0; c < Math.min(cols, g.nx); c++) {
        const col = (((col0 + c) % g.nx) + g.nx) % g.nx;
        const far = kmBetween(b.lat, b.lon, lat, -180 + col * g.step);
        if (far > reach) continue;
        const k = row * g.nx + col;
        if (floor?.[k] && k !== b.node) continue;
        const bell = Math.exp(-0.5 * (far / km) * (far / km));
        const v = b.w * bell;
        let alike = v;
        let s = b.shore * bell;
        if (like) {
          const apart = like.node[k] - like.bed[bi];
          alike *= Math.exp(-0.5 * (apart / like.kinds_m) * (apart / like.kinds_m));
          if (s > 0) s *= Math.exp(-0.5 * (apart / like.m) * (apart / like.m));
        }
        const add = (to: Near) => {
          if (b.sea) {
            to.marine[k] += v;
            to.marineLike[k] += alike;
          } else {
            to.land[k] += v;
            to.landLike[k] += alike;
          }
          if (s > 0) {
            to.shore[k] += s;
            to.miss[k] += s * miss;
          }
        };
        add(into);
        for (let o = 0; o < own.length; o++) if (own[o].group(k) === mine[o]) add(own[o].into);
      }
    }
  });
}

// ——— As bytes ———

/** A height as the files keep it, in whole metres. */
export const heightShort = (m: number): number => Math.max(-32768, Math.min(32767, Math.round(m)));
/** A spread as a byte, eight metres to a step, and back. */
export const SD_STEP = 8;
export const sdByte = (sd: number): number => Math.max(1, Math.min(255, Math.round(sd / SD_STEP)));
export const byteSd = (b: number): number => b * SD_STEP;

/** What a node's height rests on besides the map, as bits. */
export const RESTS = { shore: 1, kinds: 2, range: 4 } as const;

// ——— What a build says ———

/** How well some guesses of a number held: how many, the mean and the middle of how far off they were, in metres. */
export interface MissScore {
  n: number;
  mean: number;
  middle: number;
}

/** How some guesses of a number held. */
export function missOf(misses: number[], weights: number[]): MissScore {
  let n = 0;
  let sum = 0;
  const abs = misses.map((m) => Math.abs(m));
  for (let i = 0; i < abs.length; i++) {
    n += weights[i];
    sum += weights[i] * abs[i];
  }
  return { n: Math.round(n), mean: n ? Math.round(sum / n) : 0, middle: Math.round(middle(abs, weights)) };
}

/** A way of telling where the map puts a shore bed, held to beds it was not shown: with their tile, their block and their keyframe held out. */
export interface ShoreHeld {
  tile: MissScore;
  block: MissScore;
  span: MissScore;
}

/** How a way of telling a locality's kind held, at each way of holding localities out (core/coast.ts, HeldScores). */
export interface KindHeld {
  node: SeaScore;
  tile: SeaScore;
  block: SeaScore;
  span: SeaScore;
}

/** Which side of the level each kind of locality lies on: the shares on the side their kind is of. */
export interface LevelSide {
  marine_below: number;
  land_above: number;
}

export interface HeightKeyframe {
  ageMa: number;
  olderMa: number;
  youngerMa: number;
  file: string;
  /**
   * the level against the map's coast, in metres, with its band of nine chances in ten; positive where the sea stood
   * higher than the map draws it. It is read as if the old shore, on ground that has not moved since, stood at today's
   * sea, and the band is of that reading
   */
  level: number;
  lo: number;
  hi: number;
  /**
   * what that reading leaves open: where the middle shore bed found stands today, in metres above today's sea; and
   * the level if the old shore on unmoved ground stands as high, which is higher by the map's following times as much
   */
  stands: number;
  with_stands: number;
  /**
   * how far above its coast the map has ground that stands at today's sea, in metres, read off the whole map: what
   * the map has done to today's low ground, whatever was found on it
   */
  raised: number;
  /** whether its own shore beds could tell it: enough of them, and fewer than half deeper in the map's sea than the map's depths are read */
  told: boolean;
  /** what its own beds give, before the walk, and how sure; absent where they cannot tell */
  own?: { level: number; sd: number };
  /** how far the map's height follows today's height of the ground, where that ground stands near today's sea: a share, read off the whole map */
  follow: number;
  /** its shore beds, by weight; and what they count for in the level, where a bed counts for less the higher its ground stands today */
  shore: number;
  read: number;
  /** how far the map is taken to miss at this keyframe: metres anywhere, and a share of the height above the level or of the depth below it */
  miss: Miss;
  /**
   * how many times more beds a moment of sea leaves than a moment of land: as fitted with the height above the level
   * and the distance from the map's coast read together, which tells the kinds best and is what the heights use; and
   * as fitted where the height's own word is in doubt, which they do not
   */
  yield: number;
  yield_own: number;
  yield_told: boolean;
  /** shares of the globe: the map's land that the middle height has below the level, its sea that it has above, and its land */
  to_sea: number;
  to_land: number;
  land: number;
}

/** A range whose record the heights read, and how the map and the heights do against it. */
export interface RangeHeld {
  id: string;
  label: string;
  standingMa: number;
  /** the keyframes at which it stood, and how many nodes lie in its outline at them, summed */
  keyframes: number[];
  nodes: number;
  /** today's height of its ground at a degree's grain, the mean over those nodes */
  today: number;
  /** how far the map, less the level, and the conditioned height are from today's there: the mean difference, and the mean of its size */
  map: { mean: number; abs: number };
  height: { mean: number; abs: number };
  /** with its own record left out: how far the map is taken to miss high ground from the other ranges, and the share of its nodes whose height today lies in the band that gives */
  without: { high: number; inside?: number };
  /** each keyframe: the mean over its nodes of today's height, of the map less the level, and of the conditioned height */
  through: { ageMa: number; nodes: number; today: number; map: number; height: number }[];
}

/** How the model does over a stretch of time (core/coast.ts, CoastStretch). */
export interface HeightStretch {
  olderMa: number;
  youngerMa: number;
  keyframes: number;
  /** whether the kinds of beds can be scored there: false before the land had life */
  told: boolean;
  /** the level, as the mean of its keyframes' and the lowest and highest of them, and how many had theirs told by their own beds */
  level: { mean: number; lo: number; hi: number; told: number };
  localities: { marine: number; land: number };
  /** by the map's own coast, and by the middle height with each locality's own node held out */
  map: LevelSide;
  node: LevelSide;
  /**
   * shore beds: how many; the middle of how far from the level the map has them and the height has them, with their
   * own node held out; where the middle one stands today, in metres above today's sea; and, set beside the other's
   * curve, its mean over the stretch and the share of the beds that stand today below it
   */
  shore: { n: number; map: number; height: number; stands: number; rival?: number; below?: number };
}

export interface HeightsIndex {
  format: 'lightworld-heights@1';
  field: string;
  title: string;
  description?: string;
  /** the field of the level, which the same stage makes, and its series for the planet's readings */
  level: { field: string; title: string; series: SeriesRecord };
  /** the elevation field they start from, the dataset whose collections they read, and the field of today's ground */
  elevation: string;
  source: string;
  sourceRecord?: SourceRecord;
  today: string;
  grid: { lon0: number; lat0: number; step: number; nx: number; ny: number; wrap: boolean };
  /** [older, younger] astronomical years */
  coverage: [number, number];
  rule: {
    /** the map's coast, in its own metres, which every height here is above */
    coast_m: number;
    /** the map's depth below its coast is read no deeper than this for the level, in metres; and a shore bed counts for less in the level by a factor of e for each so many metres its ground stands above today's sea */
    floor_m: number;
    near_m: number;
    /** below this the map's sea is the ocean's floor */
    deep_m: number;
    box_deg: number;
    /** the bell the beds near a node are counted by, in km; and the differences of height on the map within which a shore bed's word, and the kind of any bed, are carried */
    kernel_km: number;
    like_m: number;
    like_kinds_m: number;
    /** what was found near counts against the map's word only so far as it comes to this many beds */
    least_beds: number;
    /** the walk of the level as fitted: how much of a keyframe's level the next keeps, and how far it strays from the map's coast */
    hold: number;
    stray_m: number;
    /** the map's miss as measured at the present, as bells that hold nine misses in ten: metres on low ground, a share of the height on high ground; and how far a bed misses its own node there */
    now_m: number;
    now_high: number;
    now_deep: number;
    bed_m: number;
    /** the share of its height the map misses the ranges by, where their records say they stood */
    ranges_high: number;
    /** the doubt given a range's "about today's height", as a share of it and never less than so many metres */
    range_doubt: number;
    range_doubt_m: number;
    /** how many beds the map's own word counts for beside the kinds found near, as fitted */
    strength: number;
    /** how fast the odds of sea change with each degree from the map's coast, inland and offshore, as the rival by distance is fitted */
    slope_in: number;
    slope_off: number;
    cap: number;
    /** with both read together: how much of the height's own log of odds counts, and the distance's slopes beside it */
    both: { height: number; slope_in: number; slope_off: number };
    yield_land_min: number;
    shore_min: number;
  };
  /** the walks tried, and the mean log chance each gave the keyframes' own levels held out */
  tried: { hold: number; stray_m: number; lpd: number }[];
  keyframes: HeightKeyframe[];
  scores: {
    /** telling the kind of a locality held out: the height above the level with the beds near, the distance from the map's coast with the same beds, both together, and the beds alone with no map */
    kinds: { height: KindHeld; distance: KindHeld; both: KindHeld; smoother: KindHeld };
    /** the map alone, no bed read: the height above the level, the height above the map's own coast with no level, the distance from its coast, and both */
    alone: { height: SeaScore; no_level: SeaScore; distance: SeaScore; both: SeaScore };
    /**
     * telling where the map puts a shore bed held out, each bed counted as the level counts it: the level with the
     * map's following, the map's own coast, and the other shore beds near with no level
     */
    shore: { level: ShoreHeld; map: ShoreHeld; smoother: ShoreHeld };
    /** of the keyframes held out whole whose own beds tell a level: how many, and the share whose level lies in the band told from the others */
    level_band: { n: number; inside: number };
    /** shore beds with their own node, tile and block held out: the middle of how far from the level the map and the height have them, and the share with the level in the height's band */
    shore_height: Record<'node' | 'tile' | 'block', { n: number; map: number; height: number; inside: number }>;
  };
  /**
   * the other's curve of sea level, set beside: which; and at each keyframe its value, the level against the map's
   * coast if the old shore stands today where the curve has it, and the share of the shore beds found that stand
   * today below it
   */
  rival?: { field: string; title: string; at: { ageMa: number; value: number; level: number; below: number }[] };
  sides: { localities: { marine: number; land: number }; map: LevelSide; node: LevelSide; tile: LevelSide; block: LevelSide; all: LevelSide };
  ranges: RangeHeld[];
  /** held to the present, at the youngest keyframe, north of the southern ice: against today's measured ground */
  present: {
    ageMa: number;
    /** the level its own beds give, with its band: nothing, where the level is known */
    level: number;
    lo: number;
    hi: number;
    /** shares of the globe that are land today and below the level in the map and in the middle height, and sea today and above it */
    map: { to_sea: number; to_land: number };
    height: { to_sea: number; to_land: number };
    /** the mean of how far the map, less the level, and the middle height are from today's ground, in metres, over land */
    miss: { map: number; height: number };
    /** the share of nodes whose height today lies in the band */
    inside: number;
  };
  globe: { reached: number; changed: number; to_sea: number };
  through: HeightStretch[];
}

/** What a build's coverage file keeps of the level and the heights (coverage.json, heights): the scores, and each keyframe's level. */
export interface HeightsStats extends Pick<HeightsIndex, 'field' | 'rule' | 'tried' | 'scores' | 'sides' | 'ranges' | 'present' | 'globe' | 'through' | 'rival'> {
  /** the field of the level, and the title of the other's curve it is set beside */
  level: string;
  /** the beds read, by weight; how many keyframes; and at how many their own shore beds told the level */
  beds: number;
  keyframes: number;
  told: number;
  /** each keyframe's level with its band, whether its own beds told it, how far the map follows today's ground there, and the shares of the globe that change side */
  levels: { ageMa: number; level: number; lo: number; hi: number; stands: number; with_stands: number; raised: number; told: boolean; follow: number; read: number; to_sea: number; to_land: number }[];
}

/** A build's coverage file's part, from its index. */
export function heightsStats(ix: HeightsIndex): HeightsStats {
  return {
    field: ix.field,
    level: ix.level.field,
    beds: ix.sides.localities.marine + ix.sides.localities.land,
    keyframes: ix.keyframes.length,
    told: ix.keyframes.filter((k) => k.told).length,
    rule: ix.rule,
    tried: ix.tried,
    scores: ix.scores,
    sides: ix.sides,
    ranges: ix.ranges,
    present: ix.present,
    globe: ix.globe,
    through: ix.through,
    ...(ix.rival ? { rival: ix.rival } : {}),
    levels: ix.keyframes.map((k) => ({ ageMa: k.ageMa, level: k.level, lo: k.lo, hi: k.hi, stands: k.stands, with_stands: k.with_stands, raised: k.raised, told: k.told, follow: k.follow, read: k.read, to_sea: k.to_sea, to_land: k.to_land })),
  };
}

/** A keyframe's file (heights/<age>.lwt): which of its arrays is which. */
export interface HeightKeyHeader {
  format: 'lightworld-heights-key@1';
  ageMa: number;
  grid: HeightsIndex['grid'];
  /** the map's own height above its coast, in whole metres: what the height starts from, before the level is taken off */
  map: number;
  /** the bell before the kinds of beds: its middle above the level in whole metres, and its spread as a byte (byteSd) */
  mean: number;
  sd: number;
  /** the chance the ground lay below the level, as a byte (core/coast.ts, byteChance) */
  chance: number;
  /** what the height rests on besides the map, as bits (RESTS) */
  rests: number;
}

/** A height in words, for a panel. */
export function heightWords(middle: number, lo: number, hi: number): string {
  const r = (x: number) => (Math.abs(x) >= 1000 ? Math.round(x / 10) * 10 : Math.round(x / 5) * 5).toLocaleString('en-US');
  const one = (x: number) => (x < 0 ? `${r(-x)} m below the level of the sea` : `${r(x)} m above the level of the sea`);
  const band = lo < 0 && hi < 0 ? `between ${r(-hi)} and ${r(-lo)} m below` : lo >= 0 && hi >= 0 ? `between ${r(lo)} and ${r(hi)} m above` : `between ${r(-lo)} m below and ${r(hi)} m above`;
  return `about ${one(middle)}, ${band} in nine chances of ten`;
}
