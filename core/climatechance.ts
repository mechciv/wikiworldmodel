// The climate of the deep past with its spread, conditioned on its evidence (model:earth/climate-conditioned;
// docs/plans/MODELS.md, decisions 2, 3, 8, 12 to 16; docs/slices/TWENTY-FOURTH-SLICE.md).
//
// The climate field is one run of another's model for each ten million years, with nothing to say how sure it is. This
// makes of it a climate with a spread at every node, in three steps, and draws nothing: the run is still what paints
// the land.
//
// The Earth's mean warmth first. Before any evidence it is what the energy balance makes of the Sun and the CO₂ of the
// time, once for each member of the CO₂, brought to the level of the rocks' curve, with the balance's own error about
// it. The curve, another's reconstruction, observes it with its band; and a forest fossilized where it grew asks of
// every value of that warmth that trees could grow at its place. Each member keeps its place among the members: one
// drawn with more CO₂ stays the warmer.
//
// Then the pattern. A run is a pattern about its own mean, and the runs themselves show how a pattern answers to the
// mean: across the 55 of them, a degree of the Earth's mean is less than a degree at the equator and two or three at
// the poles. A member's climate at a place is the run's there, moved by its own mean warmth so. The run's own error at
// a place is read where it can be measured, at the present: how far its year's mean, its season's swing and its aridity
// lie from the measured climate, and over what distance its errors go together.
//
// Then the beds. A coal says wet and a salt says dry; a reef says a warm sea; a till says ice. Each is evidence of
// presence only, found where people have dug, so kinds are set against kinds: what is reckoned is the share of one
// among the two found near a place, which how much the place was looked at does not enter. The members expect a share
// from the climate they give the place, by a link fitted over all time; the finds near say how far the place's own share
// lies from that; and part of that distance is the climate's, by how much the run's error could explain of what moves
// such shares at all. Nothing is made of what was not found.
import { climateClass, type ClimateClass, type ClimateNode, type ClimateRule } from './climate.ts';
import type { SourceRecord } from './records.ts';
import { sample } from './samples.ts';

/** The classes, in the order the files keep their chances. */
export const CLASSES: readonly ClimateClass[] = ['rainforest', 'savanna', 'desert', 'steppe', 'temperate', 'cold', 'tundra', 'ice'];

/** A grid of nodes `step` degrees apart from 90°N and 180°W, wrapping east: the climate field's. */
export interface ChanceGrid {
  nx: number;
  ny: number;
  step: number;
}

export function nodeOf(g: ChanceGrid, lat: number, lon: number): number {
  const row = Math.max(0, Math.min(g.ny - 1, Math.round((90 - lat) / g.step)));
  const col = ((Math.round((lon + 180) / g.step) % g.nx) + g.nx) % g.nx;
  return row * g.nx + col;
}

export function placeOf(g: ChanceGrid, node: number): [number, number] {
  return [90 - Math.floor(node / g.nx) * g.step, -180 + (node % g.nx) * g.step];
}

export const expit = (x: number): number => 1 / (1 + Math.exp(-x));
export const logit = (p: number): number => Math.log(p / (1 - p));

/** The chance that a standard normal number is below x (Abramowitz and Stegun 7.1.26, good to 1.5 × 10⁻⁷). */
export function normalBelow(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp((-x * x) / 2);
  return x >= 0 ? 0.5 + erf / 2 : 0.5 - erf / 2;
}

/** The chance that a number with a mean and a spread is below x; with no spread, whether the mean is. */
const below = (x: number, mean: number, sd: number): number => (sd > 1e-9 ? normalBelow((x - mean) / sd) : mean < x ? 1 : 0);

// ---- How the pattern answers to the Earth's mean warmth

/**
 * How a run's pattern answers to the mean, by belt of latitude, as the runs themselves show it: for each degree of the
 * Earth's mean warmth, how many degrees the land of a belt warms, and how much the log of its aridity moves. Belts are
 * `belt_deg` wide from the equator, both hemispheres together.
 */
export interface Response {
  belt_deg: number;
  warm: number[];
  wet: number[];
}

/** A belt's value at a latitude: its own at the belt's middle, and between two middles in proportion. */
function beltAt(values: number[], belt: number, lat: number): number {
  const x = Math.abs(lat) / belt - 0.5;
  const i = Math.max(0, Math.min(values.length - 1, Math.floor(x)));
  const j = Math.min(values.length - 1, i + 1);
  const f = Math.max(0, Math.min(1, x - i));
  return values[i] + (values[j] - values[i]) * f;
}

export const warmingAt = (r: Response, lat: number): number => beltAt(r.warm, r.belt_deg, lat);
export const wettingAt = (r: Response, lat: number): number => beltAt(r.wet, r.belt_deg, lat);

// ---- The Earth's mean warmth

/** The Earth's mean warmth at a keyframe, °C: what the causes make of it, what observes it, and all of it together. */
export interface Warmth {
  /**
   * from the energy balance on the CO₂ and the Sun of the time, brought to the curve's level: the central member's, and
   * the spread of the members with the balance's own error; absent where the world has no CO₂ for the time
   */
  prior?: { mean: number; sd: number };
  /** the rocks' curve over the keyframe's span: its mean, and its band with how far it moves within the span */
  seen?: { mean: number; sd: number };
  /** the fossil forests of the span that were read, and the mean and spread before them */
  forests?: { n: number; mean: number; sd: number };
  /** all of it together */
  mean: number;
  sd: number;
  /** the run's own global mean, which its pattern is about */
  run: number;
}

/** Two things that say the same number, each with its spread: the mean and the spread of both together. */
export function together(a: { mean: number; sd: number } | undefined, b: { mean: number; sd: number } | undefined): { mean: number; sd: number } | undefined {
  if (!a || !(a.sd > 0)) return a ?? b;
  if (!b || !(b.sd > 0)) return b ?? a;
  const pa = 1 / (a.sd * a.sd);
  const pb = 1 / (b.sd * b.sd);
  return { mean: (pa * a.mean + pb * b.mean) / (pa + pb), sd: Math.sqrt(1 / (pa + pb)) };
}

// ---- The run's own error, read at the present

/**
 * How far the run lies from the climate measured at the present, over the land, for the year's mean, for the season's
 * swing (half the warmest month less the coldest) and for the log of the aridity. Its mean error is kept for the
 * record and taken off nowhere: the run of the present was made with today's vegetation and ice laid down, and the runs
 * of the deep past with neither, so what the one is out by on average is not known of the others. Each spread is the
 * root of the mean square of the error, the mean error with it: how far out a run of this model can be, where it can
 * be measured. And the distance over which its errors go together.
 */
export interface RunError {
  mean_bias: number;
  swing_bias: number;
  wet_bias: number;
  mean_sd: number;
  swing_sd: number;
  wet_sd: number;
  /** the width of the bell the errors of the year's mean, and of the aridity, go together by, km */
  warm_km: number;
  wet_km: number;
}

// ---- A climate with its spread, at a node

/** The central climate of a node: the values a member with no draw has. */
export type Central = ClimateNode;

/** How spread the members are at a node. */
export interface Spreads {
  /** of the warmest and the coldest month together: from the Earth's mean warmth and from the run's error in the year's mean, °C */
  warm: number;
  /** of the season's swing: the warmest month above and the coldest below by as much, °C */
  swing: number;
  /** of the log of the aridity */
  wet: number;
}

/**
 * The central climate at a node before any bed is read: the run's, moved to the Earth's mean warmth by how its belt
 * answers. The margin, how far the driest month is over what a rain forest needs, moves with the aridity as if the
 * driest month's rain moved by as much as the year's.
 */
export function moved(run: ClimateNode, lat: number, shift: number, r: Response): Central {
  const warm = warmingAt(r, lat) * shift;
  const wet = wettingAt(r, lat) * shift;
  return { hot: run.hot + warm, cold: run.cold + warm, aridity: run.aridity * Math.exp(wet), margin: marginMoved(run.margin, wet) };
}

/** A margin when the log of the aridity moves by `wet`: the driest month's rain is the margin and 60 mm, and moves in proportion. */
export const marginMoved = (margin: number, wet: number): number => margin + (Math.exp(wet) - 1) * (margin + 60);

/** A central climate moved by what the beds say: the year's mean by `warm` degrees, the log of the aridity by `wet`. */
export function nudged(c: Central, warm: number, wet: number): Central {
  return { hot: c.hot + warm, cold: c.cold + warm, aridity: c.aridity * Math.exp(wet), margin: marginMoved(c.margin, wet) };
}

/** What a member draws of the run's errors, as standard scores: in the year's mean, in the season's swing, and in the aridity. */
export interface Draw {
  mean: number;
  swing: number;
  wet: number;
}

/**
 * Member m's draws of the run's errors (core/samples.ts): member 0 none, and the others the same at every place and
 * time, so that a member is one world. One draw for the whole globe takes every place to err the same way, which is
 * the simplest thing that could be so.
 */
export function drawOf(member: number): Draw {
  const z = (what: string) => sample({ kind: 'normal', mean: 0, sd: 1 }, `model:earth/climate-conditioned#${what}`, member);
  return { mean: z('mean'), swing: z('swing'), wet: z('wet') };
}

/**
 * A member's climate at a node. Its fourth draw is the Earth's mean warmth: `shift` is how far the member's lies
 * from the central one at the keyframe, and `levelSd` the spread of that warmth, whose part of the node's spreads is
 * taken out before the member's own draws of the run's errors are put in.
 */
export function memberNode(c: Central, s: Spreads, d: Draw, lat: number, shift: number, levelSd: number, r: Response): ClimateNode {
  const warming = warmingAt(r, lat);
  const wetting = wettingAt(r, lat);
  const warm = warming * shift + Math.sqrt(Math.max(0, s.warm * s.warm - (warming * levelSd) ** 2)) * d.mean;
  const wet = wetting * shift + Math.sqrt(Math.max(0, s.wet * s.wet - (wetting * levelSd) ** 2)) * d.wet;
  return { hot: c.hot + warm + s.swing * d.swing, cold: c.cold + warm - s.swing * d.swing, aridity: c.aridity * Math.exp(wet), margin: marginMoved(c.margin, wet) };
}

/**
 * Where the season's swing is asked at: Gauss and Hermite's nine points for a standard normal number, with their
 * weights. The points and weights tabulated are for the weight exp(−x²); a standard normal number's are those points
 * times √2, with the weights made to add to one.
 */
export const GH_POINTS: [number, number][] = (() => {
  const half: [number, number][] = [
    [0.7235510188, 0.432651559],
    [1.4685532892, 0.0884745274],
    [2.2665805845, 0.0049436243],
    [3.1909932018, 0.000039607],
  ];
  const points: [number, number][] = [[0, 0.7202352156]];
  for (const [x, w] of half) points.push([x, w], [-x, w]);
  const sum = points.reduce((a, p) => a + p[1], 0);
  return points.map(([x, w]): [number, number] => [x * Math.SQRT2, w / sum]);
})();

/**
 * The chance of each class at a node (in CLASSES' order): the share of the members' worlds that have it, with the
 * warmest and the coldest month moving together by one spread and apart by another, and the aridity on its own. The
 * classes are Köppen's as the globe reads them (core/climate.ts), so with no spread the chance is 1 for the class the
 * globe would draw.
 */
export function classChances(c: Central, s: Spreads, r: ClimateRule): number[] {
  const out = new Array<number>(CLASSES.length).fill(0);
  if (!(s.warm > 1e-9) && !(s.swing > 1e-9) && !(s.wet > 1e-9)) {
    out[CLASSES.indexOf(climateClass(c, r))] = 1;
    return out;
  }
  // The warmth. Two numbers decide it: one moves both months together, the other moves them apart. The one with the
  // narrower spread is asked at points, and the other in closed form at each, so that what is asked at points is
  // smooth: with a spread of nothing, one point is exact.
  let ice = 0;
  let tundra = 0;
  let tropical = 0;
  let temperate = 0;
  let cold = 0;
  const together = s.warm >= s.swing;
  const outer = together ? s.swing : s.warm;
  const inner = together ? s.warm : s.swing;
  for (const [x, w] of outer > 1e-9 ? GH_POINTS : ([[0, 1]] as [number, number][])) {
    // With the months moved by the point: `hot` and `coldest` are what the other number, v, still moves.
    const hot = c.hot + outer * x;
    const coldest = together ? c.cold - outer * x : c.cold + outer * x;
    const pIce = below(r.frost - hot, 0, inner);
    const pPolar = below(r.polar - hot, 0, inner);
    ice += w * pIce;
    tundra += w * Math.max(0, pPolar - pIce);
    if (together) {
      // v moves both up: no polar summer from `polar − hot`, a tropical winter from `tropical − coldest`.
      const polar = r.polar - hot;
      const tt = r.tropical - coldest;
      const tc = r.cold - coldest;
      tropical += w * (1 - below(Math.max(polar, tt), 0, inner));
      temperate += w * Math.max(0, below(tt, 0, inner) - below(Math.max(polar, tc), 0, inner));
      cold += w * Math.max(0, below(tc, 0, inner) - pPolar);
    } else {
      // v takes the warmest month up and the coldest down: no polar summer from `polar − hot`, a tropical winter up
      // to `coldest − tropical`, a winter above the cold threshold up to `coldest − cold`.
      const polar = r.polar - hot;
      const tt = coldest - r.tropical;
      const tc = coldest - r.cold;
      tropical += w * Math.max(0, below(tt, 0, inner) - pPolar);
      temperate += w * Math.max(0, below(tc, 0, inner) - below(Math.max(polar, tt), 0, inner));
      cold += w * (1 - below(Math.max(polar, tc), 0, inner));
    }
  }
  // The aridity, and with it whether the driest month has rain enough for a rain forest.
  const l = Math.log(Math.max(1e-6, c.aridity));
  const pDesert = below(Math.log(r.desert), l, s.wet);
  const pArid = below(Math.log(r.arid), l, s.wet);
  const forest = c.margin + 60 > 0 ? l + Math.log(60 / (c.margin + 60)) : Infinity;
  const pForest = Number.isFinite(forest) ? 1 - below(Math.max(Math.log(r.arid), forest), l, s.wet) : 0;
  const open = Math.max(0, 1 - ice - tundra);
  const set = (k: ClimateClass, v: number) => (out[CLASSES.indexOf(k)] = Math.max(0, v));
  set('ice', ice);
  set('tundra', tundra);
  set('desert', open * pDesert);
  set('steppe', open * (pArid - pDesert));
  set('rainforest', tropical * pForest);
  set('savanna', tropical * (1 - pArid - pForest));
  set('temperate', temperate * (1 - pArid));
  set('cold', cold * (1 - pArid));
  const sum = out.reduce((a, b) => a + b, 0);
  return sum > 0 ? out.map((v) => v / sum) : out;
}

/** The band nine members in ten lie in, about a central value with a spread. */
export const band = (central: number, sd: number): [number, number] => [central - 1.6449 * sd, central + 1.6449 * sd];

/** The spread of the warmest or the coldest month: what moves both together, and the swing. */
export const monthSd = (s: Spreads): number => Math.hypot(s.warm, s.swing);

// ---- The beds

/** The kinds of bed read, each a pair: one found more where a quantity is higher, set against one found more where it is lower. */
export const PAIRS = ['wet', 'reef', 'ice'] as const;
export type Pair = (typeof PAIRS)[number];

/** What each pair is, for a panel and a record: the bed found more where the quantity is higher, the one it is set against, and what it tells of. */
export const PAIR_WORDS: Record<Pair, { more: string; less: string; of: 'wet' | 'warm' }> = {
  wet: { more: 'coals and mires', less: 'salts and dunes', of: 'wet' },
  reef: { more: 'reefs', less: 'other beds of the sea', of: 'warm' },
  ice: { more: 'other beds of the land', less: 'tills', of: 'warm' },
};

/**
 * How a pair's share follows the climate: the log of the odds that a bed found is the pair's `more` kind rises by
 * `slope` for each unit of the quantity (a degree of the year's mean, or one of the log of the aridity) above `at`,
 * where it is each keyframe's own (`level`, in the build's index). `own` is how much the log of those odds varies from
 * place to place about that, as a variance, by everything that moves it: the run's error in the climate, and all that
 * is not climate at all.
 */
export interface Link {
  slope: number;
  at: number;
  own: number;
}

/**
 * What the finds near a place say of its own share. Before them the log of the odds is `expected`, give or take the
 * link's own spread; `more` and `less` are the beds of the two kinds found near, each counted by how near it lies. It
 * gives how far the place's log odds lie from the expected, with how sure that is, and the share itself: the chance
 * that one more bed found here is of the `more` kind, which is what the model is held to.
 */
export function shareNear(expected: number, more: number, less: number, own: number): { mean: number; var: number; share: number } {
  if (!(own > 1e-9)) return { mean: 0, var: 0, share: expit(expected) };
  if (!more && !less) return { mean: 0, var: own, share: shareOver(expected, own) };
  // The likeliest distance first, by Newton's steps: the log of the weight bends one way everywhere, so they find it.
  let r = 0;
  for (let i = 0; i < 12; i++) {
    const q = expit(expected + r);
    const slope = -r / own + more * (1 - q) - less * q;
    const bend = -1 / own - (more + less) * q * (1 - q);
    const step = -slope / bend;
    r += Math.max(-4, Math.min(4, step));
    if (Math.abs(step) < 1e-6) break;
  }
  const q0 = expit(expected + r);
  const sd = Math.sqrt(1 / (1 / own + (more + less) * q0 * (1 - q0)));
  // Then the weight on a grid about it, four of its own widths either side.
  const N = 25;
  let z = 0;
  let m1 = 0;
  let m2 = 0;
  let sh = 0;
  let top = -Infinity;
  const logw = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    const x = r + (-4 + (8 * i) / (N - 1)) * sd;
    const e = expected + x;
    // log expit(e) and log(1 − expit(e)), each kept finite far out.
    const lp = e > 0 ? -Math.log1p(Math.exp(-e)) : e - Math.log1p(Math.exp(e));
    const lq = e > 0 ? -e - Math.log1p(Math.exp(-e)) : -Math.log1p(Math.exp(e));
    logw[i] = (-x * x) / (2 * own) + more * lp + less * lq;
    if (logw[i] > top) top = logw[i];
  }
  for (let i = 0; i < N; i++) {
    const x = r + (-4 + (8 * i) / (N - 1)) * sd;
    const w = Math.exp(logw[i] - top);
    z += w;
    m1 += w * x;
    m2 += w * x * x;
    sh += w * expit(expected + x);
  }
  const mean = m1 / z;
  return { mean, var: Math.max(0, Math.min(own, m2 / z - mean * mean)), share: sh / z };
}

/** The share seen over many places whose own log odds lie about `expected` with a spread: a logistic curve drawn over a bell. */
export function shareOver(expected: number, own: number): number {
  if (!(own > 1e-9)) return expit(expected);
  const sd = Math.sqrt(own);
  let sum = 0;
  for (const [x, w] of GH_POINTS) sum += w * expit(expected + sd * x);
  return sum;
}

/**
 * What the shares near a place make of the run's error there, in the quantity's own units. `sd` is the run's error
 * before any bed. Each pair says how far the place's log odds lie from what the members expect (`mean`, with `var` left
 * of the link's `own`); of that distance the climate's part is the run's error times the slope, and the rest is not
 * climate. Returns the error's mean and what is left of its spread.
 */
export function errorFrom(sd: number, said: { slope: number; own: number; mean: number; var: number }[]): { mean: number; sd: number } {
  if (!(sd > 0)) return { mean: 0, sd: 0 };
  let precision = 1 / (sd * sd);
  let sum = 0;
  for (const p of said) {
    if (!(p.own > 1e-9) || !(p.var < p.own - 1e-9) || !p.slope) continue;
    // What the finds alone say of the log odds, as a number with a spread: the place's own, less what was known before.
    const told = Math.max(1e-9, 1 / Math.max(p.var, 1e-9) - 1 / p.own);
    const value = p.mean / Math.max(p.var, 1e-9) / told;
    const other = Math.max(0, p.own - p.slope * p.slope * sd * sd);
    const w = (p.slope * p.slope) / (other + 1 / told);
    precision += w;
    sum += w * (value / p.slope);
  }
  return { mean: sum / precision, sd: Math.sqrt(1 / precision) };
}

/**
 * What a bound makes of a number with a mean and a spread: the number is taken to be above `bound`, softly (`soft` is
 * the spread of everything else that decides it), and wrongly so once in a while (`slip`, the chance the thing seen
 * says nothing of the bound at all). A fossil forest is such a bound on the warmest month, and on the aridity. Returns
 * the mean and the spread after it, and how likely the thing seen was before.
 */
export function above(mean: number, sd: number, bound: number, soft: number, slip: number): { mean: number; sd: number; chance: number } {
  const d = Math.hypot(sd, soft);
  if (!(d > 1e-9)) return { mean, sd, chance: mean >= bound ? 1 : slip };
  const a = (mean - bound) / d;
  const held = normalBelow(a);
  const chance = slip + (1 - slip) * held;
  const c = ((1 - slip) * Math.exp((-a * a) / 2)) / Math.sqrt(2 * Math.PI) / chance;
  const v = sd * sd;
  return { mean: mean + (v * c) / d, sd: Math.sqrt(Math.max(0, v - ((v * v) / (d * d)) * c * (c + a))), chance };
}

/**
 * How much of the square of a spread what was found near must take away for the climate there to rest on evidence: a
 * quarter, which narrows the band by an eighth. The beds never take half: which bed forms at a place follows much that
 * is not climate, and the model gives the climate only its part.
 */
export const RESTS_FROM = 0.25;

/** Whether the climate of a place rests on what was found near: the beds and the forests have taken away a quarter or more of the square of the spread, of its warmth or of its aridity. */
export const restsOnBeds = (told: number): boolean => told >= RESTS_FROM;

/** How much of a spread's square the beds took away, 0–1. */
export const toldOf = (before: number, after: number): number => (before > 0 ? Math.max(0, Math.min(1, 1 - (after * after) / (before * before))) : 0);

// ---- Scores

/** One prediction held to what was found: the chance given that a bed is of the pair's `more` kind, whether it was, and its weight. */
export interface Guess {
  share: number;
  was: boolean;
  w: number;
}

export interface Score {
  /** the beds scored, by weight */
  n: number;
  /** the mean log of the chance given to what was found: 0 is certainty and right, −0.69 a coin */
  lpd: number;
  /** the mean squared miss, 0–1 */
  brier: number;
  /** how the chances given held: for each fifth of them, how many beds, the mean chance given, and the share that were */
  held: { n: number; given: number; were: number }[];
}

/** How well some predictions held. Chances are kept off 0 and 1 by a thousandth, so that one surprise is not endless. */
export function scoreOf(guesses: Iterable<Guess>): Score {
  let n = 0;
  let lpd = 0;
  let brier = 0;
  const held = Array.from({ length: 5 }, () => ({ n: 0, given: 0, were: 0 }));
  for (const g of guesses) {
    const p = Math.max(0.001, Math.min(0.999, g.share));
    n += g.w;
    lpd += g.w * Math.log(g.was ? p : 1 - p);
    brier += g.w * (g.was ? (1 - p) * (1 - p) : p * p);
    const b = held[Math.min(4, Math.floor(p * 5))];
    b.n += g.w;
    b.given += g.w * p;
    b.were += g.was ? g.w : 0;
  }
  const r = (x: number) => Math.round(x * 1e4) / 1e4;
  return { n: Math.round(n), lpd: n ? r(lpd / n) : 0, brier: n ? r(brier / n) : 0, held: held.map((b) => ({ n: Math.round(b.n), given: b.n ? r(b.given / b.n) : 0, were: b.n ? r(b.were / b.n) : 0 })) };
}

/** How a set of predictions held, at each way of holding beds out. */
export interface HeldScores {
  /** a bed predicted without the others of its own node */
  node: Score;
  /** without those of its tile, a few degrees across */
  tile: Score;
  /** without those of its whole block: a region held out */
  block: Score;
  /** every bed of a keyframe predicted with nothing of it nor of the keyframes that share its level: an era held out */
  span: Score;
}

// ---- Bytes

/** A chance as a byte, and back. */
export const chanceByte = (p: number): number => Math.max(0, Math.min(255, Math.round(p * 255)));
export const byteChance = (b: number): number => b / 255;

/** A spread of temperature as a byte, a tenth of a degree to a step; and one of the log of the aridity, a hundredth. */
export const warmSdByte = (sd: number): number => Math.max(0, Math.min(255, Math.round(sd * 10)));
export const byteWarmSd = (b: number): number => b / 10;
export const wetSdByte = (sd: number): number => Math.max(0, Math.min(255, Math.round(sd * 100)));
export const byteWetSd = (b: number): number => b / 100;

/** What was found near a place as a byte, and back: a sixteenth of a doubling to a step, so that one bed reads 16 and a thousand 160. */
export const findsByte = (n: number): number => Math.max(0, Math.min(255, Math.round(16 * Math.log2(1 + Math.max(0, n)))));
export const byteFinds = (b: number): number => 2 ** (b / 16) - 1;

// ---- What a build says

/** The rule as a build fitted it: the numbers the record does not hold. */
export interface ChanceRule {
  response: Response;
  error: RunError;
  /** the energy balance's own error about the Earth's mean warmth, °C */
  balance_sd: number;
  links: Record<Pair, Link>;
  /** the box of ground one bed is, in degrees */
  box_deg: number;
}

export interface ChanceKeyframe {
  ageMa: number;
  /** the span its beds are of */
  olderMa: number;
  youngerMa: number;
  file: string;
  warmth: Warmth;
  /** each member's mean warmth, °C: member 0 the central one */
  members: number[];
  /** for each pair, the log of the odds of its `more` kind where the quantity is at the link's `at`, and the beds of its two kinds, by weight */
  pairs: Record<Pair, { level: number; told: boolean; more: number; less: number }>;
  /** shares of the land: where the beds say at least as much as the members did, and where the likeliest class is not the run's */
  reached: number;
  changed: number;
}

/** How one pair's beds were told when held out, beside the smoother that knows only latitude and time, and the members with no beds near. */
export interface PairScores {
  model: HeldScores;
  smoother: HeldScores;
  /** the members' expectation alone, nothing found near: the run moved, through the link */
  alone: Score;
}

/** The columns of rock, which the model does not read: their units with salt and with coal at a keyframe, against the land's aridity there. */
export interface ColumnsCheck {
  /** units being laid down at a keyframe with a salt in them and no coal, and with a coal and no salt */
  dry: number;
  wet: number;
  /** the mean log of the aridity where each lies, by the run and by the model's central climate */
  run: { dry: number; wet: number };
  model: { dry: number; wet: number };
  /** of every pair of one dry and one wet unit of a keyframe, the share in which the dry one lies where the land is drier: a half is no better than chance */
  ordered: { run: number; model: number };
  /** the share of the dry units on ground whose central climate is arid, and of the wet units on ground whose climate is not */
  sides: { run: { dry: number; wet: number }; model: { dry: number; wet: number } };
}

/** A fossil forest, which the model does not read, against the climate it gives the place. */
export interface ForestCheck {
  id: string;
  ageMa: number;
  keyframeMa: number;
  lat: number;
  lon: number;
  /** the run's class there, and whether trees grow in it */
  run: ClimateClass | null;
  runTrees: boolean;
  /** the chance the model gives a class in which trees grow, with this forest held out, and with it read */
  trees: number;
  read: number;
}

/** The classes in which trees grow: not the deserts, the tundra or the ice. A steppe has trees along its rivers at most, and is not counted. */
export const TREES: readonly ClimateClass[] = ['rainforest', 'savanna', 'temperate', 'cold'];

/** A place held to what is known of it. */
export interface PlaceCheck {
  name: string;
  /** where it is today, and the time asked */
  lat: number;
  lon: number;
  ageMa: number;
  keyframeMa: number;
  /** the run's class there, and the model's likeliest with its chance */
  run: ClimateClass | null;
  likeliest: ClimateClass;
  chance: number;
  /** the band nine members in ten lie in: the year's mean, the warmest and the coldest month, °C */
  mean: [number, number];
  hot: [number, number];
  cold: [number, number];
  /** the run's own year's mean there */
  runMean: number;
  /** the beds found near, by pair: more and less */
  found: Record<Pair, [number, number]>;
}

/** The model held to the present, where the climate is measured. */
export interface PresentCheck {
  /** land nodes compared */
  nodes: number;
  /**
   * the share of the land where the class is the measured one: the run's own; the likeliest with the beds of the
   * youngest keyframe's span read and the warmth held at the run's; and the model's, with the warmth of the span too
   */
  same: { run: number; beds: number; model: number };
  /**
   * the mean log of the chance given to the measured class: by the run's class taken as a point (given the chance it
   * turns out to deserve, the rest shared among the other classes), by the run with its spread and nothing else, by
   * that with the beds read, and by the model
   */
  lpd: { point: number; spread: number; beds: number; model: number };
  /** the share of land nodes whose measured warmest and coldest month and aridity lie in the band nine members in ten do, about the run, each block's spread told from the other blocks */
  within: { hot: number; cold: number; aridity: number };
  /** how far from the measured, as root mean squares: the run, the run moved by the beds alone, and the model's central climate */
  rms: { hot: [number, number, number]; cold: [number, number, number]; wet: [number, number, number] };
}

/** How the model does over a stretch of time. */
export interface ChanceStretch {
  olderMa: number;
  youngerMa: number;
  keyframes: number;
  /** for each pair: its beds by weight, and the mean log chance a bed held out with its tile is given by the model, by the smoother and by the members alone */
  pairs: Record<Pair, { more: number; less: number; model: number; smoother: number; alone: number }>;
  /** the columns' units with salt and with coal, and the share of pairs ordered right by the run and by the model */
  columns?: { dry: number; wet: number; run: number; model: number };
  /** the share of the land where the beds say at least as much as the members */
  reached: number;
}

/** What a build says of the climate conditioned (climate-chance/index.json). */
export interface ChanceIndex {
  format: 'lightworld-climate-chance@1';
  field: string;
  title: string;
  description?: string;
  /** the field of what was found near each node, which the same files carry */
  beds: { field: string; title: string };
  /** the climate field whose runs it starts from, and the dataset whose collections it reads */
  climate: string;
  source: string;
  sourceRecord?: SourceRecord;
  grid: { lon0: number; lat0: number; step: number; nx: number; ny: number; wrap: boolean };
  /** [older, younger] astronomical years */
  coverage: [number, number];
  rule: ChanceRule;
  /** the classes, in the order a keyframe's file keeps their chances, and the thresholds they follow from */
  classes: ClimateClass[];
  thresholds: ClimateRule;
  keyframes: ChanceKeyframe[];
  /**
   * the Earth's mean warmth with an era of the curve held out: how far from the curve's values lie the energy balance as
   * it is, the balance with its mean distance from the curve told from the other eras (`shifted`), and the mean of the
   * other eras, as root mean squares in °C; and the balance's mean distance from the curve
   */
  warmth: { eras: number; keyframes: number; balance: number; shifted: number; baseline: number; bias: number };
  scores: Record<Pair, PairScores>;
  columns?: ColumnsCheck;
  forests?: ForestCheck[];
  present?: PresentCheck;
  through: ChanceStretch[];
  /** shares of the land over all keyframes: where the beds say at least as much as the members; where the likeliest class is not the run's; and the mean chance of the likeliest class */
  globe: { reached: number; changed: number; sure: number };
}

/** A keyframe's file (climate-chance/<age>.lwt): which of its arrays is which. */
export interface ChanceKeyHeader {
  format: 'lightworld-climate-chance-key@1';
  ageMa: number;
  grid: ChanceIndex['grid'];
  /** four bytes a node: the central climate, as the climate field keeps a node (core/climate.ts encodeNode) */
  central: number;
  /** two bytes a node: the spread of what moves the warmest and the coldest month together (warmSdByte), and of the log of the aridity (wetSdByte) */
  spread: number;
  /** eight bytes a node: the chance of each class, in the index's order */
  chances: number;
  /** six bytes a node: the beds found near, for each pair its `more` and its `less` (findsByte) */
  found: number;
  /** two bytes a node: how much of the square of the spread what was found took away, of the warmth and of the aridity (chanceByte) */
  told: number;
  /** each node's plate, by its number in the frames' plate index, with the climate field's bit where its run has land */
  plate: number;
}

/** A place's chances in words, for a panel: the classes a member in twenty or more has, likeliest first. */
export function chanceWords(chances: ArrayLike<number>, classes: readonly ClimateClass[] = CLASSES): { cls: ClimateClass; chance: number }[] {
  return classes
    .map((cls, i) => ({ cls, chance: chances[i] }))
    .filter((x) => x.chance >= 0.05)
    .sort((a, b) => b.chance - a.chance);
}
