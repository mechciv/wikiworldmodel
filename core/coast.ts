// How likely the sea was (model:earth/sea-chance; docs/plans/MODELS.md, decisions 3, 8, 12 to 15;
// docs/slices/TWENTY-FIRST-SLICE.md).
//
// The elevation field draws one coast for each of its keyframes, with nothing to say how sure it is. The rocks say
// more: a fossil collection names the environment its bed was laid down in, of the sea or of the land, and each lies
// where it was found. This turns the two into the chance that a place was under the sea at a keyframe, a number from 0
// to 1 at every node of the field's grid.
//
// Before any rock is read, the chance of sea is the field's, read softly: a half at the field's own coast, rising
// with distance offshore and falling with distance inland, and as sure as it gets over the ocean's floor. The
// localities near a place then move it. A locality is a kind of bed, the sea's or the land's, found in a small box of
// ground in the keyframe's span, and each counts by how near it lies.
//
// Finds cannot be read as they come, because the sea leaves far more of them than the land does: where the sea came
// and went, most of what is found is marine. So what is reckoned is the share of marine among what a place yields.
// Before any find it is what the field's chance would yield, by how many times more a moment of sea leaves than a
// moment of land; the finds near a place are averaged in with it, the field's expectation counting for a fraction of
// one locality; and the share is turned back into a chance by the same yield. Two things follow that are wanted. A
// place where marine and land localities are found in the proportion the yield gives is as likely sea as land. And
// nothing is made of what was not found: a place with no locality near keeps the field's chance, however long anyone
// has looked there.
//
// The yield cannot be told from finds alone: more sea, or sea beds better kept, leave the same record. It is fixed by
// taking the field's coast to be right on average, a half where the field draws it (the build fits the rest:
// tools/world/src/build/coast.ts).
import { kmBetween } from './landscape.ts';
import type { SourceRecord } from './records.ts';

/** A grid of nodes `step` degrees apart from 90°N and 180°W, wrapping east: the elevation field's. */
export interface SeaGrid {
  nx: number;
  ny: number;
  step: number;
}

export const expit = (x: number): number => 1 / (1 + Math.exp(-x));
export const logit = (p: number): number => Math.log(p / (1 - p));

/** The node of a grid nearest a place. */
export function nodeOf(g: SeaGrid, lat: number, lon: number): number {
  const row = Math.max(0, Math.min(g.ny - 1, Math.round((90 - lat) / g.step)));
  const col = ((Math.round((lon + 180) / g.step) % g.nx) + g.nx) % g.nx;
  return row * g.nx + col;
}

/** Where a node is: its latitude and longitude. */
export function placeOf(g: SeaGrid, node: number): [number, number] {
  return [90 - Math.floor(node / g.nx) * g.step, -180 + (node % g.nx) * g.step];
}

/**
 * How far each node is from the coast, in degrees of arc: positive in the sea and negative on land. `sea` has a 1 at
 * every node of the sea. The coast is taken to run half way between a node and its nearest neighbour of the other
 * kind, and the way is measured along the grid, north, east and diagonally, which is within a twelfth of the true arc.
 * Where the whole grid is one kind there is no coast, and every node is as far from one as a number can say.
 */
export function coastDistance(sea: ArrayLike<number>, g: SeaGrid): Float32Array {
  const { nx, ny, step } = g;
  const n = nx * ny;
  const d = new Float32Array(n).fill(Infinity);
  // A step east at each row, and a diagonal step between a row and the next: degrees of arc.
  const east = new Float64Array(ny);
  for (let i = 0; i < ny; i++) east[i] = step * Math.max(0, Math.cos(((90 - i * step) * Math.PI) / 180));
  const NEAR: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const arc = (i: number, di: number, dj: number) => (di === 0 ? east[i] : dj === 0 ? step : Math.hypot(step, (east[i] + east[i + di]) / 2));
  // The nearest first, from a heap of nodes by the distance found for them so far: each is settled once.
  const heap = new Int32Array(n * 9);
  const at = new Float32Array(n * 9);
  let size = 0;
  const push = (node: number, dist: number) => {
    let k = size++;
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (at[up] <= dist) break;
      heap[k] = heap[up];
      at[k] = at[up];
      k = up;
    }
    heap[k] = node;
    at[k] = dist;
  };
  const pop = (): number => {
    const top = heap[0];
    const node = heap[--size];
    const dist = at[size];
    let k = 0;
    for (;;) {
      let down = 2 * k + 1;
      if (down >= size) break;
      if (down + 1 < size && at[down + 1] < at[down]) down++;
      if (at[down] >= dist) break;
      heap[k] = heap[down];
      at[k] = at[down];
      k = down;
    }
    heap[k] = node;
    at[k] = dist;
    return top;
  };
  for (let i = 0; i < ny; i++) {
    for (let j = 0; j < nx; j++) {
      const k = i * nx + j;
      let best = Infinity;
      for (const [di, dj] of NEAR) {
        const i2 = i + di;
        if (i2 < 0 || i2 >= ny) continue;
        if (!sea[i2 * nx + ((j + dj + nx) % nx)] !== !sea[k]) best = Math.min(best, arc(i, di, dj) / 2);
      }
      if (best < Infinity) {
        d[k] = best;
        push(k, best);
      }
    }
  }
  const done = new Uint8Array(n);
  while (size > 0) {
    const dist = at[0];
    const k = pop();
    if (done[k] || dist > d[k]) continue;
    done[k] = 1;
    const i = Math.floor(k / nx);
    const j = k % nx;
    for (const [di, dj] of NEAR) {
      const i2 = i + di;
      if (i2 < 0 || i2 >= ny) continue;
      const k2 = i2 * nx + ((j + dj + nx) % nx);
      const via = dist + arc(i, di, dj);
      if (via < d[k2]) {
        d[k2] = via;
        push(k2, via);
      }
    }
  }
  for (let k = 0; k < n; k++) if (!sea[k]) d[k] = -d[k];
  return d;
}

/** A kind of bed found in a small box of ground in a keyframe's span. */
export interface Locality {
  lat: number;
  lon: number;
  /** laid down under the sea, or on land */
  sea: boolean;
  /** the chance that one at least of its collections is of the span, 0–1 */
  w: number;
  /** the node of the grid nearest it */
  node: number;
}

/**
 * The localities some collections make: those of one kind in one box of `box` degrees are one locality, at the box's
 * middle, however many they are, since a quarry worked a hundred times says no more of the sea than one worked once.
 * Its weight is the chance that one of them at least is of the span, each having `share` of its own span inside it.
 */
export function localitiesOf(sites: Iterable<{ lat: number; lon: number; sea: boolean; share: number }>, box: number, g: SeaGrid): Locality[] {
  const miss = new Map<string, number>();
  for (const s of sites) {
    if (!(s.share > 0)) continue;
    const key = `${s.sea ? 1 : 0}:${Math.round(s.lat / box)}:${Math.round(s.lon / box)}`;
    miss.set(key, (miss.get(key) ?? 1) * (1 - Math.min(1, s.share)));
  }
  const out: Locality[] = [];
  for (const [key, none] of miss) {
    const [kind, a, b] = key.split(':');
    const lat = Math.max(-90, Math.min(90, Number(a) * box));
    const lon = Number(b) * box;
    out.push({ lat, lon, sea: kind === '1', w: 1 - none, node: nodeOf(g, lat, lon) });
  }
  return out.sort((x, y) => x.node - y.node || Number(y.sea) - Number(x.sea) || x.lat - y.lat || x.lon - y.lon);
}

/** What was found near each node: the localities of the sea and of the land, each counted by how near it lies. */
export interface Found {
  marine: Float32Array;
  land: Float32Array;
}

export const noFinds = (g: SeaGrid): Found => ({ marine: new Float32Array(g.nx * g.ny), land: new Float32Array(g.nx * g.ny) });

/** A way of grouping nodes, and what was found near each node from the localities of its own group. */
export interface Own {
  group: (node: number) => number;
  into: Found;
}

/**
 * Adds localities to what was found near each node. A locality counts whole at its own place and less with distance,
 * as a bell `km` wide, and not at all beyond three times that; `weight` scales them all. With `own`, what is found near
 * a node from the localities of its own group is kept as well, for each grouping given, so that a group's localities
 * can be taken out again when they are the ones to be predicted. `floor` has a 1 at every node of the ocean's floor:
 * there a locality counts at its own node and at no other, since an island says nothing of the ocean round it.
 */
export function addFinds(into: Found, locs: Locality[], g: SeaGrid, km: number, weight = 1, own: Own[] = [], floor?: ArrayLike<number>): void {
  const reach = 3 * km;
  const band = reach / 111.2;
  const mine = new Array<number>(own.length);
  for (const l of locs) {
    const row0 = Math.max(0, Math.ceil((90 - (l.lat + band)) / g.step));
    const row1 = Math.min(g.ny - 1, Math.floor((90 - (l.lat - band)) / g.step));
    for (let o = 0; o < own.length; o++) mine[o] = own[o].group(l.node);
    for (let row = row0; row <= row1; row++) {
      const lat = 90 - row * g.step;
      const widest = Math.cos((Math.min(89.999, Math.abs(lat)) * Math.PI) / 180);
      const span = Math.min(180, band / Math.max(widest, 1e-6));
      const col0 = Math.ceil((l.lon - span + 180) / g.step);
      const cols = span >= 180 ? g.nx : Math.floor((l.lon + span + 180) / g.step) - col0 + 1;
      for (let c = 0; c < Math.min(cols, g.nx); c++) {
        const col = (((col0 + c) % g.nx) + g.nx) % g.nx;
        const far = kmBetween(l.lat, l.lon, lat, -180 + col * g.step);
        if (far > reach) continue;
        const k = row * g.nx + col;
        if (floor?.[k] && k !== l.node) continue;
        const v = weight * l.w * Math.exp(-0.5 * (far / km) * (far / km));
        (l.sea ? into.marine : into.land)[k] += v;
        for (let o = 0; o < own.length; o++) if (own[o].group(k) === mine[o]) (l.sea ? own[o].into.marine : own[o].into.land)[k] += v;
      }
    }
  }
}

/** How the chance is made of the field's coast and the finds. */
export interface SeaRule {
  /** how fast the odds of sea fall with each degree inland of the field's coast, and rise with each degree offshore: as logs */
  slope_in: number;
  slope_off: number;
  /** the furthest the field alone moves the odds from even, as a log: beyond it distance says no more */
  cap: number;
  /** how many localities the field's own expectation counts for, beside those found */
  strength: number;
}

/**
 * The log of the odds of sea from the field alone, at a node `d` degrees from its coast: positive offshore, negative
 * inland, and infinite over the ocean's floor, which is as surely sea as the field can say.
 */
export function priorLogit(d: number, r: Pick<SeaRule, 'slope_in' | 'slope_off' | 'cap'>): number {
  const x = d < 0 ? r.slope_in * d : r.slope_off * d;
  return Math.max(-r.cap, Math.min(r.cap, x));
}

/**
 * The share of marine among what a place yields: what the field's chance would yield, averaged with what was found near.
 * `yieldLog` is the log of how many times more localities a moment of sea leaves than a moment of land. It is also
 * the chance that a locality found there is marine, which is what the model is held to: it never sees the sea, only
 * what was found.
 */
export function marineShare(d: number, marine: number, land: number, yieldLog: number, r: SeaRule): number {
  const expected = expit(priorLogit(d, r) + yieldLog);
  return (r.strength * expected + marine) / (r.strength + marine + land);
}

/** The chance of sea at a place: its share of marine, turned back by the yield. Kept off 0 and 1 by what a byte can hold. */
export function seaChance(d: number, marine: number, land: number, yieldLog: number, r: SeaRule): number {
  const q = Math.max(1e-12, Math.min(1 - 1e-12, marineShare(d, marine, land, yieldLog, r)));
  return expit(logit(q) - yieldLog);
}

/** Whether the finds near a place weigh more than the field's expectation: then its land and sea rest on the rocks. */
export const restsOnFinds = (marine: number, land: number, r: Pick<SeaRule, 'strength'>): boolean => marine + land >= r.strength;

/** One prediction held to what was found: the chance given that a locality is marine, whether it was, and its weight. */
export interface Guess {
  marine: number;
  was: boolean;
  w: number;
}

export interface SeaScore {
  /** the localities scored, by weight */
  n: number;
  /** the mean log of the chance given to what was found: 0 is certainty and right, −0.69 a coin */
  lpd: number;
  /** the mean squared miss, 0–1 */
  brier: number;
  /** how the chances given held: for each fifth of them, how many localities, the mean chance of marine given, and the share that were */
  held: { n: number; given: number; were: number }[];
}

/** How well some predictions held. Chances are kept off 0 and 1 by a thousandth, so that one surprise is not endless. */
export function scoreOf(guesses: Iterable<Guess>): SeaScore {
  let n = 0;
  let lpd = 0;
  let brier = 0;
  const held = Array.from({ length: 5 }, () => ({ n: 0, given: 0, were: 0 }));
  for (const g of guesses) {
    const p = Math.max(0.001, Math.min(0.999, g.marine));
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

/** The chance of sea as a byte, and back. */
export const chanceByte = (p: number): number => Math.max(0, Math.min(255, Math.round(p * 255)));
export const byteChance = (b: number): number => b / 255;

/** What was found near a place as a byte, and back: a sixteenth of a doubling to a step, so that one locality reads 16 and a thousand 160. */
export const findsByte = (n: number): number => Math.max(0, Math.min(255, Math.round(16 * Math.log2(1 + Math.max(0, n)))));
export const byteFinds = (b: number): number => 2 ** (b / 16) - 1;

/**
 * The level a member of the world draws the sea at (core/samples.ts): member 0 the median, a half, and the others spread
 * evenly between 0 and 1. A member has sea wherever the chance of it is above its level, so its coast is one line, the
 * members' seas lie one inside another, and the ground that is sea in some and land in others is the coast's band. One
 * level for the whole globe is the simplest thing that could be so; it takes every stretch of coast to err the same way.
 */
export function memberLevel(member: number): number {
  if (member === 0) return 0.5;
  const x = 0.5 + member * 0.6180339887498949;
  return x - Math.floor(x);
}

/** Whether a member of the world has sea at a place whose chance of it is `chance`. */
export const seaIn = (chance: number, member: number): boolean => chance > memberLevel(member);

/** The edges of the coast's band: sea in fewer than one member in twenty beyond the one, and in more than nineteen beyond the other. */
export const BAND: [number, number] = [0.05, 0.95];

/** A place's chance in words, for a panel. */
export function chanceWords(chance: number): string {
  const pct = Math.round(chance * 100);
  if (chance >= BAND[1]) return `almost surely under the sea (${Math.min(99, pct)}%)`;
  if (chance <= BAND[0]) return `almost surely land (${Math.max(1, pct)}% for the sea)`;
  if (pct === 50) return 'as likely sea as land (50%)';
  if (chance >= 0.5) return `more likely sea than land (${pct}%)`;
  return `more likely land than sea (${pct}% for the sea)`;
}

/** How a set of predictions held, at each way of holding localities out. */
export interface HeldScores {
  /** a locality predicted without the others of its own node */
  node: SeaScore;
  /** without those of its tile, a few degrees across */
  tile: SeaScore;
  /** without those of its whole block: a region held out */
  block: SeaScore;
  /** every locality of a keyframe predicted from the field alone, its yield from the keyframes either side: an era held out */
  span: SeaScore;
}

export interface CoastScores {
  model: HeldScores;
  /** the same finds with no field: an even chance everywhere before them */
  smoother: HeldScores;
  /** the field alone, nothing found: read softly, as the model reads it, and read as sure of its own coast */
  field: { soft: SeaScore; sure: SeaScore };
}

/** Which side of a coast each kind of locality lies on: the shares that lie on the side their kind is of. */
export interface CoastSide {
  marine_in_sea: number;
  land_on_land: number;
}

export interface CoastSides {
  /** the localities counted, by weight */
  localities: { marine: number; land: number };
  /** against the field's own coast */
  field: CoastSide;
  /** against the model's likelier side, with the locality's own node, tile or block held out, and with nothing held out */
  node: CoastSide;
  tile: CoastSide;
  block: CoastSide;
  all: CoastSide;
}

/**
 * How the model does over a stretch of time: which side of the coast localities lie on, by the field's coast and by the
 * model's likelier side with each locality's own node held out, and the columns of rock, which it does not read.
 */
export interface CoastStretch {
  /** the oldest and the youngest of its keyframes, in Ma, and how many they are */
  olderMa: number;
  youngerMa: number;
  keyframes: number;
  /** whether the rocks can tell the keyframes' yield: false for the stretch before the land had life */
  told: boolean;
  /** its localities, by weight */
  localities: { marine: number; land: number };
  field: CoastSide;
  node: CoastSide;
  /** units of the columns being laid down at its keyframes: how many, and the shares on the side their kind is of */
  columns?: { sea: { n: number; field: number; model: number }; land: { n: number; field: number; model: number }; right: { field: number; model: number } };
}

/** How much of the globe, over all keyframes, the model reaches and moves: shares of its area. */
export interface CoastGlobe {
  /** where the finds near outweigh the field's expectation */
  reached: number;
  /** where the likelier side is not the field's, and how much of that became sea */
  changed: number;
  to_sea: number;
  /** where the chance of sea is within the band's edges */
  band: number;
}

export interface CoastKeyframe {
  ageMa: number;
  /** the span its localities are of */
  olderMa: number;
  youngerMa: number;
  file: string;
  /**
   * how many times more localities a moment of sea leaves than a moment of land: as fitted where the keyframe and
   * those it shares a yield with have land localities enough (`told`), and the nearest such keyframe's where they do
   * not, as before the land had life
   */
  yield: number;
  told: boolean;
  /** its localities of the sea and of the land, by weight */
  localities: [number, number];
  /**
   * Shares of the globe at this keyframe: where the finds near outweigh the field; the field's land that the model
   * has likelier sea than not, and its sea that the model has likelier land; and the land as the field has it.
   */
  reached: number;
  to_sea: number;
  to_land: number;
  land: number;
}

/** What a build says of the sea's chance (coast/index.json). */
export interface CoastIndex {
  format: 'lightworld-coast@1';
  field: string;
  title: string;
  description?: string;
  /** the field of what was found near each node, which the same files carry */
  finds: { field: string; title: string };
  /** the elevation field whose coast it starts from, and the dataset whose collections it reads */
  elevation: string;
  source: string;
  sourceRecord?: SourceRecord;
  grid: { lon0: number; lat0: number; step: number; nx: number; ny: number; wrap: boolean };
  /** [older, younger] astronomical years */
  coverage: [number, number];
  /** the rule as fitted, with the width of the finds' bell that predicted best */
  /**
   * the rule as fitted, with the width of the finds' bell that predicted best, and how many land localities a keyframe
   * and those it shares a yield with must have for its yield to be fitted
   */
  rule: SeaRule & { kernel_km: number; box_deg: number; deep_m: number; yield_land_min: number };
  /** each width tried, and the mean log chance it gave localities held out */
  tried: { km: number; lpd: number }[];
  keyframes: CoastKeyframe[];
  scores: CoastScores;
  sides: CoastSides;
  /** against the columns of rock, which the model does not read: units being laid down at a keyframe */
  columns?: {
    sea: { n: number; field: number; model: number; chance: number };
    land: { n: number; field: number; model: number; chance: number };
    gap: { n: number; field_sea: number; chance: number };
    /** the share of units, of the sea and of the land together, that lie on the side their kind is of */
    right: { field: number; model: number };
  };
  globe: CoastGlobe;
  /** the same, stretch by stretch of time: a hundred million years each, and the keyframes before the land had life as one */
  through: CoastStretch[];
}

/** A keyframe's file (coast/<age>.lwt): which of its arrays is which. */
export interface CoastKeyHeader {
  format: 'lightworld-coast-key@1';
  ageMa: number;
  grid: CoastIndex['grid'];
  /** bytes: the chance of sea, and the marine and land localities found near (chanceByte, findsByte) */
  chance: number;
  marine: number;
  land: number;
  /** each node's plate, by its number in the frames' plate index */
  plate: number;
}
