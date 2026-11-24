// How a settlement grew and shrank (model:people/settlement-growth; docs/plans/CITIES.md, decision 3). The model ranks
// the settlement's ground once, by how soon it would be built on, and cuts that ranking at each time where the built
// ground reaches the area its people needed then. Nothing is stepped forward: a place is built at a time when its rank
// is under the cut, so any year is as cheap as any other, and growing and shrinking move one cut along one ranking:
// the ground built first is left last.
//
// The ranking is the cost of reaching a place from the settlement's cores, along its routes or across the ground,
// raised for steep ground, ground that floods, ground far from water people could draw and ground outside walls while
// they stand. An epoch begins wherever what the ranking reads changes (a wall built or pulled down), and the ranking is
// made again from then. The people come as members of an ensemble (core/samples.ts), and each member cuts the same
// ranking at its own place, so the doubt in the people is a band of ground at the edge, not another plan.
//
// Every number here is a choice, said so in the model's record (world/models/people/settlement-growth.yaml), and held
// to the records' areas and outlines by its checks.

/** A settlement's ground as the model reads it. Places are in local metres about the settlement's point. */
export interface GrowthGround {
  /** the ground's height, m */
  height(x: number, y: number): number;
  /** how far the ground stands above the water that would flood it there, m: below 0 under water, Infinity far off */
  above(x: number, y: number): number;
  /** how far it is to fresh water people could draw, m; undefined where nothing says */
  toWater?(x: number, y: number): number;
}

export interface GrowthWall {
  /** a ring, x, y pairs in local metres */
  ring: number[];
  /** when it stood, years: from its building to its being pulled down or let go */
  from: number;
  to: number;
}

/** A member's people through time: knots, between which the people change by a constant rate. */
export interface PeopleSeries {
  t: number[];
  people: number[];
}

export interface GrowthParams {
  /** a step along a route costs this much of a step across open ground */
  route: number;
  /** the slope at which a step costs twice as much, and the slope above which nobody built */
  slope: { soft: number; max: number };
  /** ground less than `margin` m above the water that floods it ranks as if `factor` times as far */
  flood: { margin: number; factor: number };
  /** ground outside walls while they stand ranks as if this many times as far */
  outside: number;
  /** beyond `reach` m from water people could draw, every metre more counts `weight` m of travel */
  water: { reach: number; weight: number };
  /** people to the hectare of built ground in a settlement of 10,000, how that changes with size (density ∝ P^beta),
   *  and how much denser the first-built ground is than the last (the ratio, inner to outer) */
  density: { at10k: number; beta: number; gradient: number; least: number; most: number };
}

/**
 * The last year the model sizes its ground for (docs/plans/CITIES.md: the world after 1850 wants evidence of another
 * kind), and the farthest its grid reaches from a settlement's point, m.
 */
export const HORIZON = 1900;
export const REACH_MOST = 20000;

export const GROWTH_DEFAULTS: GrowthParams = {
  route: 0.4,
  slope: { soft: 0.1, max: 0.4 },
  flood: { margin: 1.5, factor: 3 },
  outside: 1.8,
  water: { reach: 400, weight: 0.5 },
  density: { at10k: 100, beta: 0.2, gradient: 4, least: 15, most: 600 },
};

export interface GrowthInput {
  cores: { x: number; y: number }[];
  /** polylines, x, y pairs in local metres */
  routes: number[][];
  walls: GrowthWall[];
  ground: GrowthGround;
  /** the members' people; member 0 is the central estimate */
  people: PeopleSeries[];
  /** when the settlement stood: nothing is built before or after */
  span: [number, number];
  /** areas a record gives, ha, at a time: the people's density is set to meet them (see `densityScale`) */
  areas?: { t: number; ha: number }[];
  params?: Partial<GrowthParams>;
  /** the side of a cell, m; chosen from the largest area if not given */
  cell?: number;
}

export interface GrowthGrid {
  x0: number;
  y0: number;
  cell: number;
  nx: number;
  ny: number;
}

export interface GrowthEpoch {
  /** when this ranking holds, years */
  from: number;
  to: number;
  /** every cell that can be built on, first-built first */
  order: Int32Array;
  /** each cell's place in `order`, or -1 where nobody could build */
  rank: Int32Array;
}

export interface Growth {
  grid: GrowthGrid;
  epochs: GrowthEpoch[];
  /** per member: knots of the built area in cells, between which it changes by a constant rate */
  cut: { t: number[]; cells: number[] }[];
  /** people to the hectare at 10,000 people, as set for this settlement */
  at10k: number;
  params: GrowthParams;
  span: [number, number];
}

const merge = (p?: Partial<GrowthParams>): GrowthParams => ({
  ...GROWTH_DEFAULTS,
  ...p,
  slope: { ...GROWTH_DEFAULTS.slope, ...p?.slope },
  flood: { ...GROWTH_DEFAULTS.flood, ...p?.flood },
  water: { ...GROWTH_DEFAULTS.water, ...p?.water },
  density: { ...GROWTH_DEFAULTS.density, ...p?.density },
});

/** The people of a member at a time: between knots they change by a constant rate; outside the knots, the nearest. */
export function peopleAt(s: PeopleSeries, t: number): number {
  const n = s.t.length;
  if (n === 0) return 0;
  if (t <= s.t[0]) return s.people[0];
  if (t >= s.t[n - 1]) return s.people[n - 1];
  let i = 0;
  while (i + 1 < n && s.t[i + 1] < t) i++;
  const a = Math.max(s.people[i], 1e-9);
  const b = Math.max(s.people[i + 1], 1e-9);
  const u = (t - s.t[i]) / (s.t[i + 1] - s.t[i]);
  return Math.exp(Math.log(a) + u * (Math.log(b) - Math.log(a)));
}

/** People to the hectare of built ground for a settlement of `people`. */
export function meanDensity(people: number, at10k: number, p: GrowthParams['density']): number {
  const d = at10k * Math.pow(Math.max(people, 1) / 1e4, p.beta);
  return Math.min(p.most, Math.max(p.least, d));
}

/** Built ground in hectares for `people` at `at10k` people to the hectare at 10,000. */
export const areaFor = (people: number, at10k: number, p: GrowthParams['density']) => people / meanDensity(people, at10k, p);

/**
 * The density at 10,000 people that makes the model's area meet the areas a record gives, at the people of member 0
 * then: the geometric mean over them, within the parameter's bounds. Without areas, the parameter's own.
 */
export function densityScale(people: PeopleSeries, areas: { t: number; ha: number }[] | undefined, p: GrowthParams['density']): number {
  if (!areas?.length) return p.at10k;
  let sum = 0;
  let n = 0;
  for (const a of areas) {
    const P = peopleAt(people, a.t);
    if (!(P > 0) || !(a.ha > 0)) continue;
    // P / (k (P/1e4)^beta) = ha, so k = P / (ha (P/1e4)^beta).
    sum += Math.log(P / (a.ha * Math.pow(P / 1e4, p.beta)));
    n++;
  }
  return n ? Math.min(p.most, Math.max(p.least, Math.exp(sum / n))) : p.at10k;
}

/** A binary heap of cells keyed by cost, smallest first; ties by cell index, so every machine pops the same order. */
class Heap {
  private keys: number[] = [];
  private cells: number[] = [];
  get size() {
    return this.keys.length;
  }
  private less(i: number, j: number) {
    return this.keys[i] < this.keys[j] || (this.keys[i] === this.keys[j] && this.cells[i] < this.cells[j]);
  }
  private swap(i: number, j: number) {
    [this.keys[i], this.keys[j]] = [this.keys[j], this.keys[i]];
    [this.cells[i], this.cells[j]] = [this.cells[j], this.cells[i]];
  }
  push(key: number, cell: number) {
    this.keys.push(key);
    this.cells.push(cell);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.keys[0], this.cells[0]];
    const k = this.keys.pop()!;
    const c = this.cells.pop()!;
    if (this.keys.length) {
      this.keys[0] = k;
      this.cells[0] = c;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.less(l, m)) m = l;
        if (r < this.keys.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}

/** Mark the cells a polyline passes through, closely enough that no diagonal step slips between two marked cells. */
function rasterize(g: GrowthGrid, pts: number[], closed: boolean, mark: (cell: number) => void) {
  const m = pts.length / 2;
  const last = closed ? m : m - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % m;
    const ax = pts[i * 2];
    const ay = pts[i * 2 + 1];
    const bx = pts[j * 2];
    const by = pts[j * 2 + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(len / (g.cell / 4)));
    let pi = -1;
    let pj = -1;
    for (let s = 0; s <= steps; s++) {
      const x = ax + ((bx - ax) * s) / steps;
      const y = ay + ((by - ay) * s) / steps;
      const ci = Math.floor((x - g.x0) / g.cell);
      const cj = Math.floor((y - g.y0) / g.cell);
      if (ci === pi && cj === pj) continue;
      // A diagonal step between cells is filled in on one side, so the line is four-connected.
      if (pi >= 0 && ci !== pi && cj !== pj && pi >= 0 && pi < g.nx && cj >= 0 && cj < g.ny) mark(cj * g.nx + pi);
      pi = ci;
      pj = cj;
      if (ci >= 0 && ci < g.nx && cj >= 0 && cj < g.ny) mark(cj * g.nx + ci);
    }
  }
}

/** Is the point inside the ring? */
function insideRing(r: number[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const yi = r[i + 1];
    const yj = r[j + 1];
    if (yi > y !== yj > y && x < ((r[j] - r[i]) * (y - yi)) / (yj - yi) + r[i]) c = !c;
  }
  return c;
}

/** The cell a model of this many hectares at most is worked out on: finer for a village, coarser for a great city. */
export function cellFor(maxHa: number): number {
  const side = Math.sqrt(Math.max(maxHa, 0.01) * 1e4);
  return Math.min(50, Math.max(5, Math.round(side / 120)));
}

/** The ranking of one epoch: walls that stand through it, and the ground. */
function rankGround(input: GrowthInput, g: GrowthGrid, p: GrowthParams, walls: GrowthWall[]): { order: Int32Array; rank: Int32Array } {
  const n = g.nx * g.ny;
  const cx = (c: number) => g.x0 + ((c % g.nx) + 0.5) * g.cell;
  const cy = (c: number) => g.y0 + (Math.floor(c / g.nx) + 0.5) * g.cell;
  // What each cell is.
  const route = new Uint8Array(n);
  for (const r of input.routes) rasterize(g, r, false, (c) => (route[c] = 1));
  const wall = new Uint8Array(n);
  for (const w of walls) rasterize(g, w.ring, true, (c) => (wall[c] = 1));
  const height = new Float64Array(n);
  const above = new Float64Array(n);
  for (let c = 0; c < n; c++) {
    height[c] = input.ground.height(cx(c), cy(c));
    above[c] = input.ground.above(cx(c), cy(c));
  }
  const wet = (c: number) => above[c] < 0;
  // How much a step into a cell costs, for its steepness and wetness: a crossing of water only along a route.
  const slopeAt = (c: number) => {
    const i = c % g.nx;
    const j = Math.floor(c / g.nx);
    const h = (ii: number, jj: number) => height[Math.min(g.ny - 1, Math.max(0, jj)) * g.nx + Math.min(g.nx - 1, Math.max(0, ii))];
    const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * g.cell);
    const dy = (h(i, j + 1) - h(i, j - 1)) / (2 * g.cell);
    return Math.hypot(dx, dy);
  };
  const slope = new Float64Array(n);
  for (let c = 0; c < n; c++) slope[c] = slopeAt(c);
  const stepCost = (c: number) => {
    if (wet(c) && !route[c]) return Infinity;
    const s = slope[c] / p.slope.soft;
    return (route[c] ? p.route : 1) * (1 + s * s);
  };
  // Travel from the cores.
  const cost = new Float64Array(n).fill(Infinity);
  const heap = new Heap();
  for (const k of input.cores) {
    const i = Math.floor((k.x - g.x0) / g.cell);
    const j = Math.floor((k.y - g.y0) / g.cell);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) continue;
    const c = j * g.nx + i;
    if (cost[c] > 0) {
      cost[c] = 0;
      heap.push(0, c);
    }
  }
  // The eight steps to a neighbour: di, dj and length in cells.
  const D = [1, 0, 1, -1, 0, 1, 0, 1, 1, 0, -1, 1, 1, 1, Math.SQRT2, 1, -1, Math.SQRT2, -1, 1, Math.SQRT2, -1, -1, Math.SQRT2];
  while (heap.size) {
    const [k, c] = heap.pop();
    if (k > cost[c]) continue;
    const i = c % g.nx;
    const j = Math.floor(c / g.nx);
    for (let d = 0; d < D.length; d += 3) {
      const di = D[d];
      const dj = D[d + 1];
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
      const nc = jj * g.nx + ii;
      // A wall is passed only at a gate, where a route goes through it, and never between two of its cells.
      if (wall[nc] && !route[nc]) continue;
      if (di !== 0 && dj !== 0 && (wall[j * g.nx + ii] || wall[jj * g.nx + i]) && !route[nc]) continue;
      const step = ((stepCost(c) + stepCost(nc)) / 2) * D[d + 2] * g.cell;
      if (!(step < Infinity)) continue;
      const nk = k + step;
      if (nk < cost[nc]) {
        cost[nc] = nk;
        heap.push(nk, nc);
      }
    }
  }
  // Inside each standing wall, by a point test of each cell's centre.
  const within = new Uint8Array(n);
  if (walls.length)
    for (let c = 0; c < n; c++) for (const w of walls) if (insideRing(w.ring, cx(c), cy(c))) within[c] = 1;
  // The key a cell is ranked by.
  const key = new Float64Array(n).fill(Infinity);
  for (let c = 0; c < n; c++) {
    if (!(cost[c] < Infinity) || wet(c) || slope[c] > p.slope.max) continue;
    let k = cost[c];
    const tw = input.ground.toWater?.(cx(c), cy(c));
    if (tw !== undefined && tw > p.water.reach) k += (tw - p.water.reach) * p.water.weight;
    if (above[c] < p.flood.margin) k *= p.flood.factor;
    if (walls.length && !within[c]) k *= p.outside;
    key[c] = k;
  }
  const cells: number[] = [];
  for (let c = 0; c < n; c++) if (key[c] < Infinity) cells.push(c);
  cells.sort((a, b) => key[a] - key[b] || a - b);
  const order = Int32Array.from(cells);
  const rank = new Int32Array(n).fill(-1);
  order.forEach((c, r) => (rank[c] = r));
  return { order, rank };
}

/**
 * The grid a settlement's model is worked out on, and the density it is set to: wide enough for the most ground it
 * ever took in any member, three times the radius of a disc of that area, for growth along routes and round water
 * and hills. Known before anything is ranked, so the routes that the ranking reads can be laid over the same ground.
 */
export function growthGrid(input: Pick<GrowthInput, 'people' | 'areas' | 'params' | 'cell'>): { grid: GrowthGrid; at10k: number; params: GrowthParams } {
  const p = merge(input.params);
  const at10k = densityScale(input.people[0] ?? { t: [], people: [] }, input.areas, p.density);
  // The most people it had up to the horizon this model draws to: a city of millions in the twentieth century is drawn
  // by none of this, and its ground beyond the grid ranks after all that is in it, so its old core ranks the same.
  let maxHa = 0;
  for (const s of input.people) {
    for (let i = 0; i < s.t.length; i++) if (s.t[i] <= HORIZON) maxHa = Math.max(maxHa, areaFor(s.people[i], at10k, p.density));
    if (s.t.length && s.t[0] < HORIZON) maxHa = Math.max(maxHa, areaFor(peopleAt(s, HORIZON), at10k, p.density));
  }
  const cell = input.cell ?? cellFor(maxHa);
  const radius = Math.sqrt((maxHa * 1e4) / Math.PI);
  const reach = Math.min(REACH_MOST, Math.max(radius * 3, cell * 8));
  const nx = Math.max(8, Math.ceil((reach * 2) / cell));
  return { grid: { x0: -(nx * cell) / 2, y0: -(nx * cell) / 2, cell, nx, ny: nx }, at10k, params: p };
}

/** The model: the ranking of each epoch, and each member's cut through time. */
export function growSettlement(input: GrowthInput): Growth {
  const { grid, at10k, params: p } = growthGrid(input);
  const cell = grid.cell;
  // Epochs: wherever a wall begins or ends to stand within the span.
  const [t0, t1] = input.span;
  const bounds = new Set<number>([t0, t1]);
  for (const w of input.walls) for (const b of [w.from, w.to]) if (b > t0 && b < t1) bounds.add(b);
  const times = [...bounds].sort((a, b) => a - b);
  const epochs: GrowthEpoch[] = [];
  for (let i = 0; i + 1 < times.length; i++) {
    const from = times[i];
    const to = times[i + 1];
    const standing = input.walls.filter((w) => w.from <= from && w.to > from);
    epochs.push({ from, to, ...rankGround(input, grid, p, standing) });
  }
  const cellHa = (cell * cell) / 1e4;
  const cut = input.people.map((s) => ({ t: [...s.t], cells: s.people.map((P) => areaFor(P, at10k, p.density) / cellHa) }));
  return { grid, epochs, cut, at10k, params: p, span: input.span };
}

/** How many cells a member's cut takes in at a time: none outside the settlement's span. */
export function cutAt(g: Growth, t: number, member = 0): number {
  if (t < g.span[0] || t > g.span[1]) return 0;
  const s = g.cut[Math.min(member, g.cut.length - 1)];
  if (!s) return 0;
  return peopleAt({ t: s.t, people: s.cells }, t);
}

export const epochAt = (g: Growth, t: number): GrowthEpoch | undefined =>
  g.epochs.find((e) => t >= e.from && t < e.to) ?? (t === g.span[1] ? g.epochs[g.epochs.length - 1] : undefined);

/** The cell a place is in, or -1 off the grid. */
export function growthCell(g: Growth, x: number, y: number): number {
  const i = Math.floor((x - g.grid.x0) / g.grid.cell);
  const j = Math.floor((y - g.grid.y0) / g.grid.cell);
  return i < 0 || j < 0 || i >= g.grid.nx || j >= g.grid.ny ? -1 : j * g.grid.nx + i;
}

/** Is a place built on at a time, for a member? */
export function builtAt(g: Growth, x: number, y: number, t: number, member = 0): boolean {
  const c = growthCell(g, x, y);
  const e = epochAt(g, t);
  if (c < 0 || !e) return false;
  const r = e.rank[c];
  return r >= 0 && r + 1 <= cutAt(g, t, member);
}

/**
 * When a place was built on, for a member: the spans of years in which its rank lay under the cut. Between knots the
 * cut changes by a constant rate, so each crossing is found exactly, not by sampling.
 */
export function builtSpans(g: Growth, x: number, y: number, member = 0): [number, number][] {
  const c = growthCell(g, x, y);
  if (c < 0) return [];
  const s = g.cut[Math.min(member, g.cut.length - 1)];
  if (!s || s.t.length === 0) return [];
  const spans: [number, number][] = [];
  const push = (a: number, b: number) => {
    if (!(b > a)) return;
    const last = spans[spans.length - 1];
    if (last && Math.abs(last[1] - a) < 1e-9) last[1] = b;
    else spans.push([a, b]);
  };
  for (const e of g.epochs) {
    const r = e.rank[c];
    if (r < 0) continue;
    const need = r + 1;
    // The knots within the epoch, with the cut at its ends.
    const ts = [e.from, ...s.t.filter((t) => t > e.from && t < e.to), e.to];
    const at = (t: number) => peopleAt({ t: s.t, people: s.cells }, t);
    for (let i = 0; i + 1 < ts.length; i++) {
      const a = ts[i];
      const b = ts[i + 1];
      const ca = at(a);
      const cb = at(b);
      const ina = ca >= need;
      const inb = cb >= need;
      if (ina && inb) push(a, b);
      else if (ina !== inb) {
        // ln cut is linear in t between knots.
        const u = (Math.log(need) - Math.log(ca)) / (Math.log(cb) - Math.log(ca));
        const tc = a + u * (b - a);
        if (ina) push(a, tc);
        else push(tc, b);
      }
    }
  }
  return spans;
}

/**
 * People to the hectare at a built place and time: the settlement's mean for its people then, higher on the ground
 * built first and lower at the edge, by `gradient` from the one to the other, so that the mean holds.
 */
export function densityAt(g: Growth, x: number, y: number, t: number, member = 0): number {
  const c = growthCell(g, x, y);
  const e = epochAt(g, t);
  const n = cutAt(g, t, member);
  if (c < 0 || !e || n <= 0) return 0;
  const r = e.rank[c];
  if (r < 0 || r + 1 > n) return 0;
  const cellHa = (g.grid.cell * g.grid.cell) / 1e4;
  const mean = peopleFromCells(g, n) / (n * cellHa);
  // exp(-b u) over u in [0, 1], normalised to a mean of 1: b = ln(gradient).
  const b = Math.log(Math.max(1.0001, g.params.density.gradient));
  const u = (r + 0.5) / n;
  return (mean * Math.exp(-b * u) * b) / (1 - Math.exp(-b));
}

/** The people whose built ground is `cells` cells, inverting the area for people. */
function peopleFromCells(g: Growth, cells: number): number {
  const cellHa = (g.grid.cell * g.grid.cell) / 1e4;
  const ha = cells * cellHa;
  // ha = P^(1 - beta) * 1e4^beta / k, within the density's bounds: solve by bisection on log P.
  let lo = 0;
  let hi = 25;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (areaFor(Math.exp(mid), g.at10k, g.params.density) < ha) lo = mid;
    else hi = mid;
  }
  return Math.exp((lo + hi) / 2);
}
