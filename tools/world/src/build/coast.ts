// How likely the sea was, at every node of the elevation field at each of its keyframes (coast/index.json,
// coast/<age>.lwt; core/coast.ts; model:earth/sea-chance). The build places the rock record's collections where
// their plates stood at each keyframe, gathers them into localities, fits the few numbers the model has to localities
// held out, and writes the chance of sea with what was found near each node. Then it scores what it made: on
// localities whose node, whose tile and whose whole block were held out, on every locality of a keyframe held out,
// beside a smoother that knows nothing of the field and beside the field read as sure; and against the columns of
// rock, which it does not read.
import { addFinds, BAND, chanceByte, coastDistance, expit, findsByte, localitiesOf, logit, marineShare, noFinds, nodeOf, priorLogit, restsOnFinds, scoreOf, seaChance, type CoastGlobe, type CoastIndex, type CoastKeyframe, type CoastScores, type CoastSides, type CoastStretch, type Found, type Guess, type Locality, type SeaGrid, type SeaRule } from '../../../../core/coast.ts';
import { encodeTile } from '../../../../core/container.ts';
import { conj, rotate, toLatLon, unitVector, type Quat } from '../../../../core/quat.ts';
import type { SourceRecord } from '../../../../core/records.ts';
import type { RotationModel } from '../../../../core/rotation-model.ts';
import { fromMa } from '../../../../core/time.ts';
import type { RocksSnapshot } from '../pbdb.ts';
import { stableStringify } from '../util.ts';
import { rowShare } from './atlas.ts';
import { SRC_H, SRC_W, type Snapshot } from './fields.ts';

/** The parameters of field:earth/sea-chance. */
export interface CoastParams {
  /** the box of ground one locality is, in degrees */
  box_deg: number;
  /** the furthest the field alone moves the odds of sea from even, as a log */
  cap: number;
  /** below this height, in metres, the field's sea is the ocean's floor */
  deep_m: number;
  /** the widths the finds' bell may take, in km: the build takes the one that predicts best */
  kernel_km: number[];
  /** how many keyframes either side share one yield with a keyframe */
  pool: number;
  /**
   * how many land localities, by weight, a keyframe and those it shares a yield with must have for the yield to be
   * fitted: with fewer, as before the land had life, it is the nearest keyframe's that has them
   */
  yield_land_min: number;
  /** the sizes of the tiles and of the blocks held out, in degrees */
  tile_deg: number;
  block_deg: number;
  /** every how many keyframes one is held out whole */
  span_every: number;
  /** where the fit starts: the slopes of the field's odds inland and offshore, and what the field's expectation counts for */
  slope_in: number;
  slope_off: number;
  strength: number;
}

/** The parameters of the rock record a collection's share of a span is worked out by (field:earth/rock-record). */
export interface SpanRule {
  longest_span: number;
  longest_span_in_stages: number;
}

/** The columns of rock, for holding the chance to what it does not read: where each stands today, and what it says at an age. */
export interface CoastColumns {
  points: [lat: number, lon: number][];
  says: (column: number, ageMa: number) => 'land' | 'sea' | 'gap' | 'nothing';
}

/** A keyframe as the build keeps it. */
export interface CoastKey {
  ageMa: number;
  /** the span its localities are of, in Ma */
  olderMa: number;
  youngerMa: number;
  /** each node's distance from the field's coast, in degrees: positive in the sea, infinite over the ocean's floor */
  d: Float32Array;
  locs: Locality[];
  /** the log of how many times more localities a moment of sea leaves than a moment of land */
  yieldLog: number;
  finds: Found;
  /** the chance of sea at each node, 0–1 */
  chance: Float32Array;
}

export interface CoastOut {
  index: CoastIndex;
  /** the keyframes' files, by path */
  files: Map<string, Uint8Array | string>;
  keys: CoastKey[];
  rule: SeaRule;
}

const GRID: SeaGrid = { nx: SRC_W, ny: SRC_H, step: 1 };
const NODES = SRC_W * SRC_H;

/** A locality as the fit reads it: where it is against the field, and what was found near its node without its own group's. */
interface Row {
  k: number;
  node: number;
  d: number;
  sea: boolean;
  w: number;
  cell: [number, number];
  tile: [number, number];
  block: [number, number];
  all: [number, number];
}

type Held = 'cell' | 'tile' | 'block' | 'all' | 'none';

/** The highest point of a function of one number between two bounds, by golden section. */
function highest(f: (x: number) => number, lo: number, hi: number, steps: number): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < steps; i++) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

/** The plate under a place of today's Earth, by the plates of today's land: searching out a few degrees for one, as the rock record's sites are placed. */
function plateFinder(now: Snapshot): (lat: number, lon: number) => number {
  return (lat, lon) => {
    const j0 = Math.round(90 - lat);
    const i0 = Math.round(lon + 180);
    for (let r = 0; r <= 3; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(dj), Math.abs(di)) !== r) continue;
          const q = now.plate[Math.max(0, Math.min(180, j0 + dj)) * SRC_W + ((((i0 + di) % SRC_W) + SRC_W) % SRC_W)];
          if (q) return q;
        }
      }
    }
    return 0;
  };
}

/**
 * The keyframes with their spans and their localities, before anything is fitted. A keyframe's span runs half way to
 * the keyframe either side. A collection the database calls marine alone or terrestrial alone is of each span its own
 * overlaps, by the share of it that lies inside, as the rock record counts a collection of a stage; it stands where
 * its plate stood at the keyframe.
 */
export function coastKeys(model: RotationModel, elevation: Snapshot[], rocks: RocksSnapshot, span: SpanRule, p: Pick<CoastParams, 'box_deg' | 'deep_m'>, isoline: number): CoastKey[] {
  const sorted = [...elevation].sort((a, b) => a.ageMa - b.ageMa);
  const plateOf = plateFinder(sorted[0]);
  const bit = (name: string) => {
    const k = rocks.classes.indexOf(name);
    return k < 0 ? 0 : 1 << k;
  };
  const LAND = bit('terrestrial');
  const SEA = bit('marine');
  const edges = sorted.map((s, k) => ({
    older: k < sorted.length - 1 ? (s.ageMa + sorted[k + 1].ageMa) / 2 : s.ageMa + (s.ageMa - sorted[k - 1].ageMa) / 2,
    younger: k > 0 ? (s.ageMa + sorted[k - 1].ageMa) / 2 : Math.min(0, s.ageMa),
  }));
  const sites: { lat: number; lon: number; sea: boolean; share: number }[][] = sorted.map(() => []);
  const back = new Map<number, Quat | null>();
  const forth = sorted.map(() => new Map<number, Quat | null>());
  for (const c of rocks.collections) {
    const kind = c[16] & SEA && !(c[16] & LAND) ? 1 : c[16] & LAND && !(c[16] & SEA) ? 0 : -1;
    if (kind < 0) continue;
    let plate = -1;
    for (let k = 0; k < sorted.length; k++) {
      if (edges[k].younger >= c[3] && c[3] !== c[4]) break;
      if (edges[k].older <= c[4]) continue;
      const share = rowShare(c[3], c[4], edges[k].older, edges[k].younger, span);
      if (!share) continue;
      if (plate < 0) plate = plateOf(c[1], c[2]);
      let from = back.get(plate);
      if (from === undefined) back.set(plate, (from = plate && model.reaches(plate, 0) ? conj(model.total(plate, 0)) : null));
      let to = forth[k].get(plate);
      if (to === undefined) forth[k].set(plate, (to = plate && model.reaches(plate, sorted[k].ageMa) ? model.total(plate, sorted[k].ageMa) : null));
      if (!from || !to) continue;
      const [lat, lon] = toLatLon(rotate(to, rotate(from, unitVector(c[1], c[2]))));
      sites[k].push({ lat, lon, sea: kind === 1, share });
    }
  }
  return sorted.map((s, k) => {
    const sea = new Uint8Array(NODES);
    for (let i = 0; i < NODES; i++) sea[i] = s.elev[i] < isoline ? 1 : 0;
    const d = coastDistance(sea, GRID);
    // The floor of the ocean is no shelf: as surely sea as the field can say, however near a coast.
    for (let i = 0; i < NODES; i++) if (s.elev[i] < p.deep_m) d[i] = Infinity;
    return { ageMa: s.ageMa, olderMa: edges[k].older, youngerMa: edges[k].younger, d, locs: localitiesOf(sites[k], p.box_deg, GRID), yieldLog: 0, finds: noFinds(GRID), chance: new Float32Array(NODES) };
  });
}

/**
 * What was found near every locality's node at one width of the bell, with and without the localities of its own node,
 * tile and block. With `field`, the finds are counted as the model counts them, knowing the field: over the ocean's
 * floor a locality speaks for its own node only. Without it, by distance alone, as the smoother that knows no field
 * counts them.
 */
function rowsOf(keys: CoastKey[], km: number, p: Pick<CoastParams, 'tile_deg' | 'block_deg'>, field: boolean): { rows: Row[]; finds: Found[] } {
  const groupBy = (deg: number) => (node: number) => Math.floor(Math.floor(node / SRC_W) / deg) * 1000 + Math.floor((node % SRC_W) / deg);
  const rows: Row[] = [];
  const finds: Found[] = [];
  keys.forEach((key, k) => {
    const all = noFinds(GRID);
    const own = [{ group: (n: number) => n, into: noFinds(GRID) }, { group: groupBy(p.tile_deg), into: noFinds(GRID) }, { group: groupBy(p.block_deg), into: noFinds(GRID) }];
    let floor: Uint8Array | undefined;
    if (field) {
      floor = new Uint8Array(NODES);
      for (let n = 0; n < NODES; n++) floor[n] = key.d[n] === Infinity ? 1 : 0;
    }
    addFinds(all, key.locs, GRID, km, 1, own, floor);
    finds.push(all);
    const less = (o: Found, n: number): [number, number] => [Math.max(0, all.marine[n] - o.marine[n]), Math.max(0, all.land[n] - o.land[n])];
    for (const l of key.locs) {
      const n = l.node;
      rows.push({ k, node: n, d: key.d[n], sea: l.sea, w: l.w, cell: less(own[0].into, n), tile: less(own[1].into, n), block: less(own[2].into, n), all: [all.marine[n], all.land[n]] });
    }
  });
  return { rows, finds };
}

/** A model as the fit holds it: its rule, each keyframe's yield, and whether it reads the field at all. */
interface Fit {
  rule: SeaRule;
  yields: number[];
  /** false for the smoother that knows nothing of the field: an even chance everywhere before the finds */
  field: boolean;
}

/** The share of marine a model expects among what is found at a locality's node, with some of what was found there held out. */
function expected(r: Row, f: Fit, held: Held, yieldLog = f.yields[r.k]): number {
  const [m, t] = held === 'none' ? [0, 0] : r[held];
  return marineShare(f.field ? r.d : 0, m, t, yieldLog, f.rule);
}

/** The log of the chance a model gives some localities' kinds, with what was found at their own node, tile or block held out. */
function likelihood(rows: Row[], f: Fit, held: Held[], yieldLog?: number): number {
  let sum = 0;
  for (const r of rows) {
    for (const h of held) {
      const q = Math.max(0.001, Math.min(0.999, expected(r, f, h, yieldLog)));
      sum += r.w * Math.log(r.sea ? q : 1 - q);
    }
  }
  return sum;
}

/** What the weight of the finds is fitted on: a locality predicted without its node's others, and without its tile's. */
const FIT_ON: Held[] = ['cell', 'tile'];

/** The localities of a keyframe and of `pool` keyframes either side, which share one yield; `without` leaves a keyframe's own out. */
function pooledOf(byKey: Row[][], k: number, pool: number, without?: number): Row[] {
  const near: Row[] = [];
  for (let j = k - pool; j <= k + pool; j++) if (j >= 0 && j < byKey.length && j !== without) near.push(...byKey[j]);
  return near;
}

/**
 * Which keyframes' yields the rocks can tell: those with land localities enough, by weight, in the keyframe and those
 * it shares a yield with. Before the land had life it left next to none, every locality is marine whatever the ground
 * was, and a locality's kind says nothing of land and sea.
 */
function toldOf(byKey: Row[][], p: Pick<CoastParams, 'pool' | 'yield_land_min'>, without?: number): boolean[] {
  return byKey.map((_, k) => pooledOf(byKey, k, p.pool, without).reduce((s, r) => s + (r.sea ? 0 : r.w), 0) >= p.yield_land_min);
}

/**
 * Each keyframe's yield, given a rule: the one with which the field alone, nothing found, best predicts the localities
 * of the keyframe and of `pool` keyframes either side. It is where the field's coast is taken to be right on average:
 * at the coast the field gives an even chance, and the yield is what makes that fit the share of marine found there.
 * Half a land locality that is not there holds it off infinity. Where the rocks cannot tell it (toldOf), the model
 * takes the nearest keyframe's that they can; the smoother knows no land and sea to tell apart, and keeps its own.
 * With `without`, that keyframe's own localities are left out, as when it is the one held out.
 */
function yieldsOf(byKey: Row[][], f: Fit, p: Pick<CoastParams, 'pool' | 'yield_land_min'>, only?: number, without?: number): number[] {
  const fitted = (k: number): number => highest((y) => likelihood(pooledOf(byKey, k, p.pool, without), f, ['none'], y) - 0.5 * Math.log1p(Math.exp(y)), -3, 9, 22);
  const told = f.field ? toldOf(byKey, p, without) : byKey.map(() => true);
  // A keyframe that can be told is its own, whether or not its own localities are left out: then its yield is that of
  // the keyframes either side. One that cannot takes another's, and never that of a keyframe held out.
  const nearest = (k: number): number => {
    if (told[k]) return k;
    for (let far = 1; far < byKey.length; far++) {
      // The younger first: its rocks are the better kept.
      if (k - far >= 0 && told[k - far] && k - far !== without) return k - far;
      if (k + far < byKey.length && told[k + far] && k + far !== without) return k + far;
    }
    return k;
  };
  const memo = new Map<number, number>();
  const of = (k: number): number => {
    let y = memo.get(k);
    if (y === undefined) memo.set(k, (y = fitted(k)));
    return y;
  };
  return byKey.map((_, k) => (only !== undefined && k !== only ? (f.yields[k] ?? 0) : of(nearest(k))));
}

/**
 * The first step of the fit, the field alone: the slopes and the yields with which a locality's kind is best told from
 * its distance to the field's coast and nothing else, which is all a place with no find near has. It reads nothing of
 * what was found near a locality, so it is the same whatever the finds' bell. `rows` are the localities the slopes are
 * fitted to, those of the keyframes whose yield the rocks can tell; `byKey` is every keyframe's, for the yields.
 * Without `field`, only the yields: the smoother's, which knows no coast.
 */
function fitField(rows: Row[], byKey: Row[][], p: CoastParams, field: boolean): Fit {
  let f: Fit = { rule: { slope_in: p.slope_in, slope_off: p.slope_off, cap: p.cap, strength: p.strength }, yields: byKey.map(() => 1.5), field };
  f.yields = yieldsOf(byKey, f, p);
  if (field) {
    const alone = (g: Fit) => likelihood(rows, g, ['none']);
    for (let round = 0; round < 4; round++) {
      for (const name of ['slope_in', 'slope_off'] as const) {
        const x = highest((v) => alone({ ...f, rule: { ...f.rule, [name]: v } }), 0.02, 2, 18);
        f = { ...f, rule: { ...f.rule, [name]: x } };
      }
      f.yields = yieldsOf(byKey, f, p);
    }
    // Rounded as they are written, so that what places the finds is what the index says.
    f = { ...f, rule: { ...f.rule, slope_in: round(f.rule.slope_in), slope_off: round(f.rule.slope_off) } };
    f.yields = yieldsOf(byKey, f, p);
  }
  return f;
}

/**
 * The second step: what the field's expectation counts for beside the finds, the strength with which a locality is best
 * told when its node's others, or its tile's, are held out.
 */
function fitStrength(rows: Row[], from: Fit): Fit & { score: number } {
  const total = (g: Fit) => likelihood(rows, g, FIT_ON);
  const s = highest((v) => total({ ...from, rule: { ...from.rule, strength: Math.exp(v) } }), Math.log(0.02), Math.log(50), 22);
  const f = { ...from, rule: { ...from.rule, strength: Math.exp(s) } };
  return { ...f, score: total(f) };
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : 0);
const round = (x: number, digits = 3) => Number(x.toPrecision(digits));

/**
 * The chance of sea at every keyframe, with what it rests on and how it holds. `source` and `titles` are for the files'
 * headers; `plateIndex` gives each plate the number the viewer's frames know it by; `columns` is the columns of rock,
 * where a build has them.
 */
export function buildCoast(
  model: RotationModel,
  elevation: Snapshot[],
  rocks: RocksSnapshot,
  span: SpanRule,
  p: CoastParams,
  isoline: number,
  plateIndex: Map<number, number>,
  about: { field: string; title: string; description?: string; finds: { field: string; title: string }; elevation: string; source: string; sourceRecord?: SourceRecord },
  columns: CoastColumns | undefined,
  log: (m: string) => void,
): CoastOut {
  const started = Date.now();
  const keys = coastKeys(model, elevation, rocks, span, p, isoline);
  const count = keys.reduce((n, k) => n + k.locs.length, 0);
  log(`coast   ${count.toLocaleString('en-US')} localities of ${rocks.collections.length.toLocaleString('en-US')} collections at ${keys.length} keyframes, placed in ${((Date.now() - started) / 1000).toFixed(1)} s`);

  // The field alone first: its slopes and the yields, which nothing found near a place enters into.
  const groups = (rs: Row[]): Row[][] => {
    const byKey: Row[][] = keys.map(() => []);
    for (const r of rs) byKey[r.k].push(r);
    return byKey;
  };
  const bare: Row[] = keys.flatMap((key, k) => key.locs.map((l) => ({ k, node: l.node, d: key.d[l.node], sea: l.sea, w: l.w, cell: [0, 0], tile: [0, 0], block: [0, 0], all: [0, 0] }) as Row));
  // The model is fitted to, and scored on, the keyframes whose yield the rocks can tell. Before the land had life every
  // locality is marine whatever the ground was: there a kind fits nothing and tests nothing, and the model is applied
  // as the other keyframes fitted it.
  const told = toldOf(groups(bare), p);
  const telling = (rs: Row[]): Row[] => rs.filter((r) => told[r.k]);
  const alone = fitField(telling(bare), groups(bare), p, true);

  // Then the finds' bell: each width tried, and the one kept that predicts localities held out best.
  let best: { km: number; rows: Row[]; finds: Found[]; fit: Fit & { score: number } } | undefined;
  const tried: { km: number; lpd: number }[] = [];
  const weight = telling(bare).reduce((s, r) => s + r.w, 0) * FIT_ON.length;
  for (const km of p.kernel_km) {
    const { rows, finds } = rowsOf(keys, km, p, true);
    const f = fitStrength(telling(rows), alone);
    tried.push({ km, lpd: round(f.score / weight, 4) });
    if (!best || f.score > best.fit.score) best = { km, rows, finds, fit: f };
  }
  if (!best) throw new Error('coast: no width of the bell to try (kernel_km is empty)');
  const { rows, finds, km } = best;
  const byKey = groups(rows);
  const made: Fit = best.fit;
  const rule: SeaRule = { slope_in: made.rule.slope_in, slope_off: made.rule.slope_off, cap: p.cap, strength: round(made.rule.strength) };
  made.rule = rule;
  made.yields = yieldsOf(byKey, made, p).map((y) => Math.round(y * 1000) / 1000);
  const untold = keys.filter((_, k) => !told[k]).map((k) => k.ageMa);
  log(`coast   fitted in ${((Date.now() - started) / 1000).toFixed(1)} s: a bell of ${km} km (of ${tried.map((t) => `${t.km}: ${t.lpd}`).join(', ')}); the odds of sea fall by ${rule.slope_in} a degree inland and rise by ${rule.slope_off} offshore, as logs; the field counts for ${rule.strength} of a locality${untold.length ? `; ${untold.length} keyframes, ${Math.min(...untold)} to ${Math.max(...untold)} Ma, have too few land localities to tell a yield, and take the nearest keyframe's` : ''}`);

  // The smoother with no causes: the same localities, counted by distance alone since it knows no field, the same
  // yields' form, and an even chance everywhere before them. Fitted to the same keyframes.
  const plain = rowsOf(keys, km, p, false).rows;
  const flat = fitStrength(telling(plain), fitField(telling(plain), groups(plain), p, false));

  // ---- The chance at every node
  keys.forEach((key, k) => {
    key.yieldLog = made.yields[k];
    key.finds = finds[k];
    for (let n = 0; n < NODES; n++) key.chance[n] = seaChance(key.d[n], finds[k].marine[n], finds[k].land[n], key.yieldLog, rule);
  });

  // ---- How it holds
  const scored = telling(rows);
  const plainScored = telling(plain);
  const guesses = (f: Fit, held: Held, sure = false, from: Row[] = scored): Guess[] =>
    from.map((r) => ({ marine: sure ? expit((r.d >= 0 ? rule.cap : -rule.cap) + f.yields[r.k]) : expected(r, f, held), was: r.sea, w: r.w }));
  // A keyframe held out whole: nothing found, and its yield from the keyframes either side alone.
  const spans = (f: Fit): Guess[] => {
    const out: Guess[] = [];
    for (let k = Math.floor(p.span_every / 2); k < keys.length; k += p.span_every) {
      if (!told[k]) continue;
      const y = yieldsOf(byKey, f, p, k, k)[k];
      for (const r of byKey[k]) out.push({ marine: expected(r, f, 'none', y), was: r.sea, w: r.w });
    }
    return out;
  };
  const scores: CoastScores = {
    model: { node: scoreOf(guesses(made, 'cell')), tile: scoreOf(guesses(made, 'tile')), block: scoreOf(guesses(made, 'block')), span: scoreOf(spans(made)) },
    smoother: { node: scoreOf(guesses(flat, 'cell', false, plainScored)), tile: scoreOf(guesses(flat, 'tile', false, plainScored)), block: scoreOf(guesses(flat, 'block', false, plainScored)), span: scoreOf(spans(flat)) },
    field: { soft: scoreOf(guesses(made, 'none')), sure: scoreOf(guesses(made, 'none', true)) },
  };

  // Which side of the coast each kind of locality falls on: the field's, and the model's with the locality's own node held out.
  const side = (sea: (r: Row) => boolean, of: Row[] = rows): { marine_in_sea: number; land_on_land: number } => {
    const n = { marine: 0, in: 0, land: 0, on: 0 };
    for (const r of of) {
      if (r.sea) {
        n.marine += r.w;
        if (sea(r)) n.in += r.w;
      } else {
        n.land += r.w;
        if (!sea(r)) n.on += r.w;
      }
    }
    return { marine_in_sea: pct(n.in, n.marine), land_on_land: pct(n.on, n.land) };
  };
  const chanceOf = (r: Row, held: Held) => {
    const [m, t] = held === 'none' ? [0, 0] : r[held];
    return seaChance(r.d, m, t, made.yields[r.k], rule);
  };
  const sides: CoastSides = {
    localities: { marine: Math.round(rows.reduce((s, r) => s + (r.sea ? r.w : 0), 0)), land: Math.round(rows.reduce((s, r) => s + (r.sea ? 0 : r.w), 0)) },
    field: side((r) => r.d >= 0),
    node: side((r) => chanceOf(r, 'cell') >= 0.5),
    tile: side((r) => chanceOf(r, 'tile') >= 0.5),
    block: side((r) => chanceOf(r, 'block') >= 0.5),
    all: side((r) => chanceOf(r, 'all') >= 0.5),
  };

  // ---- Stretches of time: a hundred million years of keyframes each, and those before the land had life as one.
  const stretchOf = keys.map((key, k) => (told[k] ? Math.floor(key.ageMa / 100) : -1));
  const stretches = [...new Set(stretchOf)].sort((a, b) => (a < 0 ? Infinity : a) - (b < 0 ? Infinity : b));

  // ---- The columns of rock, which it does not read: a unit being laid down at a keyframe, under the sea or on land.
  const tally = () => ({ sea: 0, sea_field: 0, sea_model: 0, sea_chance: 0, land: 0, land_field: 0, land_model: 0, land_chance: 0, gap: 0, gap_field: 0, gap_chance: 0 });
  let held: CoastIndex['columns'];
  const heldIn = new Map(stretches.map((s) => [s, tally()]));
  if (columns) {
    const plateOf = plateFinder([...elevation].sort((a, b) => a.ageMa - b.ageMa)[0]);
    const n = tally();
    columns.points.forEach(([lat0, lon0], i) => {
      const plate = plateOf(lat0, lon0);
      if (!plate || !model.reaches(plate, 0)) return;
      const from = conj(model.total(plate, 0));
      keys.forEach((key, k) => {
        if (!model.reaches(plate, key.ageMa)) return;
        const says = columns.says(i, key.ageMa);
        if (says === 'nothing') return;
        const [lat, lon] = toLatLon(rotate(model.total(plate, key.ageMa), rotate(from, unitVector(lat0, lon0))));
        const node = nodeOf(GRID, lat, lon);
        const chance = key.chance[node];
        const fieldSea = key.d[node] >= 0;
        for (const t of [n, heldIn.get(stretchOf[k])!]) {
          if (says === 'sea') {
            t.sea++;
            t.sea_chance += chance;
            if (fieldSea) t.sea_field++;
            if (chance >= 0.5) t.sea_model++;
          } else if (says === 'land') {
            t.land++;
            t.land_chance += chance;
            if (!fieldSea) t.land_field++;
            if (chance < 0.5) t.land_model++;
          } else {
            t.gap++;
            t.gap_chance += chance;
            if (fieldSea) t.gap_field++;
          }
        }
      });
    });
    held = {
      sea: { n: n.sea, field: pct(n.sea_field, n.sea), model: pct(n.sea_model, n.sea), chance: pct(n.sea_chance, n.sea) },
      land: { n: n.land, field: pct(n.land_field, n.land), model: pct(n.land_model, n.land), chance: pct(n.land_chance, n.land) },
      gap: { n: n.gap, field_sea: pct(n.gap_field, n.gap), chance: pct(n.gap_chance, n.gap) },
      right: { field: pct(n.sea_field + n.land_field, n.sea + n.land), model: pct(n.sea_model + n.land_model, n.sea + n.land) },
    };
  }
  const through: CoastStretch[] = stretches.map((s) => {
    const of = keys.filter((_, k) => stretchOf[k] === s);
    const own = rows.filter((r) => stretchOf[r.k] === s);
    const t = heldIn.get(s)!;
    return {
      olderMa: Math.max(...of.map((k) => k.ageMa)),
      youngerMa: Math.min(...of.map((k) => k.ageMa)),
      keyframes: of.length,
      told: s >= 0,
      localities: { marine: Math.round(own.reduce((a, r) => a + (r.sea ? r.w : 0), 0)), land: Math.round(own.reduce((a, r) => a + (r.sea ? 0 : r.w), 0)) },
      field: side((r) => r.d >= 0, own),
      node: side((r) => chanceOf(r, 'cell') >= 0.5, own),
      ...(columns
        ? { columns: { sea: { n: t.sea, field: pct(t.sea_field, t.sea), model: pct(t.sea_model, t.sea) }, land: { n: t.land, field: pct(t.land_field, t.land), model: pct(t.land_model, t.land) }, right: { field: pct(t.sea_field + t.land_field, t.sea + t.land), model: pct(t.sea_model + t.land_model, t.sea + t.land) } } }
        : {}),
    };
  });

  // ---- How much of the globe it reaches, and moves
  const g = { area: 0, reached: 0, changed: 0, to_sea: 0, band: 0 };
  /** each keyframe's own shares of the globe: reached, the field's land become sea, its sea become land, and its land */
  const moved = new Map<number, { reached: number; to_sea: number; to_land: number; land: number }>();
  for (const key of keys) {
    const k = { area: 0, reached: 0, to_sea: 0, to_land: 0, land: 0 };
    for (let node = 0; node < NODES; node++) {
      const a = Math.cos(((90 - Math.floor(node / SRC_W)) * Math.PI) / 180);
      const chance = key.chance[node];
      const fieldSea = key.d[node] >= 0;
      k.area += a;
      if (!fieldSea) k.land += a;
      if (restsOnFinds(key.finds.marine[node], key.finds.land[node], rule)) k.reached += a;
      if (chance >= 0.5 !== fieldSea) {
        if (chance >= 0.5) k.to_sea += a;
        else k.to_land += a;
      }
      if (chance > BAND[0] && chance < BAND[1]) g.band += a;
    }
    g.area += k.area;
    g.reached += k.reached;
    g.changed += k.to_sea + k.to_land;
    g.to_sea += k.to_sea;
    moved.set(key.ageMa, { reached: pct(k.reached, k.area), to_sea: pct(k.to_sea, k.area), to_land: pct(k.to_land, k.area), land: pct(k.land, k.area) });
  }
  const globe: CoastGlobe = { reached: pct(g.reached, g.area), changed: pct(g.changed, g.area), to_sea: pct(g.to_sea, g.changed), band: pct(g.band, g.area) };

  // ---- The files
  const files = new Map<string, Uint8Array | string>();
  const grid = { lon0: -180, lat0: 90, step: 1, nx: SRC_W, ny: SRC_H, wrap: true };
  const byAge = new Map(elevation.map((s) => [s.ageMa, s]));
  const keyframes: CoastKeyframe[] = keys.map((key) => {
    const chance = new Uint8Array(NODES);
    const marine = new Uint8Array(NODES);
    const land = new Uint8Array(NODES);
    const plate = new Uint16Array(NODES);
    const snap = byAge.get(key.ageMa)!;
    for (let n = 0; n < NODES; n++) {
      chance[n] = chanceByte(key.chance[n]);
      marine[n] = findsByte(key.finds.marine[n]);
      land[n] = findsByte(key.finds.land[n]);
      plate[n] = plateIndex.get(snap.plate[n]) ?? 0;
    }
    const file = `coast/${key.ageMa}.lwt`;
    files.set(file, encodeTile({ format: 'lightworld-coast-key@1', ageMa: key.ageMa, grid, chance: 0, marine: 1, land: 2, plate: 3 }, [chance, marine, land, plate], stableStringify));
    const weigh = (sea: boolean) => Math.round(key.locs.reduce((s, l) => s + (l.sea === sea ? l.w : 0), 0) * 10) / 10;
    return { ageMa: key.ageMa, olderMa: key.olderMa, youngerMa: key.youngerMa, file, yield: round(Math.exp(key.yieldLog)), told: told[keys.indexOf(key)], localities: [weigh(true), weigh(false)], ...moved.get(key.ageMa)! };
  });
  const ages = keys.map((k) => k.ageMa);
  const index: CoastIndex = {
    format: 'lightworld-coast@1',
    field: about.field,
    title: about.title,
    description: about.description,
    finds: about.finds,
    elevation: about.elevation,
    source: about.source,
    sourceRecord: about.sourceRecord,
    grid,
    coverage: [fromMa(Math.max(...ages)), fromMa(Math.min(...ages))],
    rule: { ...rule, kernel_km: km, box_deg: p.box_deg, deep_m: p.deep_m, yield_land_min: p.yield_land_min },
    tried,
    keyframes,
    scores,
    sides,
    ...(held ? { columns: held } : {}),
    globe,
    through,
  };
  files.set('coast/index.json', stableStringify(index));
  const s = scores;
  log(`coast   a locality held out with its node is given ${s.model.node.lpd} (log of its chance, on average), with its tile ${s.model.tile.lpd}, with its block ${s.model.block.lpd}, with its keyframe ${s.model.span.lpd}; the smoother with no causes ${s.smoother.node.lpd}, ${s.smoother.tile.lpd}, ${s.smoother.block.lpd}, ${s.smoother.span.lpd}; the field read softly ${s.field.soft.lpd}, and as sure ${s.field.sure.lpd}`);
  log(`coast   ${Math.round(sides.field.marine_in_sea * 100)}% of marine localities lie in the field's sea and ${Math.round(sides.field.land_on_land * 100)}% of land ones on its land; with their own node held out, ${Math.round(sides.node.marine_in_sea * 100)}% and ${Math.round(sides.node.land_on_land * 100)}% lie on the likelier side of the model's`);
  if (held) log(`coast   the columns of rock, which it does not read: ${Math.round(held.right.model * 100)}% of ${held.sea.n + held.land.n} units laid down at a keyframe lie on the model's likelier side, ${Math.round(held.right.field * 100)}% on the field's (the sea's ${Math.round(held.sea.model * 100)}% against ${Math.round(held.sea.field * 100)}%, the land's ${Math.round(held.land.model * 100)}% against ${Math.round(held.land.field * 100)}%)`);
  log(`coast   over all keyframes the finds outweigh the field on ${(globe.reached * 100).toFixed(1)}% of the globe; ${(globe.changed * 100).toFixed(1)}% changes side, ${Math.round(globe.to_sea * 100)}% of it to sea; ${(globe.band * 100).toFixed(1)}% lies in the band; built in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  return { index, files, keys, rule };
}

/** The chance of sea at a place and an age, from a build's keyframes: the nearest keyframe's, at the node nearest the place. */
export function coastAt(keys: Pick<CoastKey, 'ageMa' | 'chance' | 'finds'>[], lat: number, lon: number, ageMa: number): { chance: number; marine: number; land: number } | undefined {
  let best: Pick<CoastKey, 'ageMa' | 'chance' | 'finds'> | undefined;
  for (const k of keys) if (!best || Math.abs(k.ageMa - ageMa) < Math.abs(best.ageMa - ageMa)) best = k;
  if (!best) return undefined;
  const n = nodeOf(GRID, lat, lon);
  return { chance: best.chance[n], marine: best.finds.marine[n], land: best.finds.land[n] };
}

export { logit, priorLogit };
