// A simple temporal network: time points linked by constraints `to − from ∈ [lo, hi]`.
// It is consistent iff its distance graph has no negative cycle. A simple negative cycle is
// a minimal set of conflicting constraints: drop any one of them and that cycle is gone.
// Absolute dates are constraints against ORIGIN, the point fixed at year 0.

export const ORIGIN = '$origin';

export interface Constraint {
  /** provenance: the claim or relation this constraint comes from */
  source: string;
  from: string;
  to: string;
  /** to − from ≥ lo (may be −Infinity) */
  lo: number;
  /** to − from ≤ hi (may be +Infinity) */
  hi: number;
  note?: string;
}

export interface Conflict {
  /** the constraints on one simple negative cycle, in cycle order */
  constraints: Constraint[];
  /** the cycle's total weight: how far, in years, the constraints overshoot each other (< 0) */
  slack: number;
}

export type Bounds = Map<string, { lo: number; hi: number; loBy: string[]; hiBy: string[] }>;

export type Solution = { ok: true; bounds: Bounds } | { ok: false; conflict: Conflict };

// Tolerance: 1e-8 yr (~0.3 s) is 270,000x finer than a day yet ~20,000x above float64 ULP at historical years,
// and 1e-12 relative keeps long cycles of near-equal constraints from failing on float64 rounding up to Gyr scales.
const EPS_ABS = 1e-8;
const EPS_REL = 1e-12;

/**
 * A network's distance graph, in arrays: edge e runs from u[e] to v[e] with weight w[e], and comes from constraint
 * c[e]. Each constraint gives an edge for its upper bound, then one for its lower, in the order of the constraints.
 */
interface Edges {
  m: number;
  u: Int32Array;
  v: Int32Array;
  w: Float64Array;
  c: Int32Array;
}

/** The edges of constraints whose ends are the points `from[i]` and `to[i]`. */
function edgesOf(constraints: Constraint[], from: Int32Array, to: Int32Array): Edges {
  const k = constraints.length;
  const u = new Int32Array(2 * k);
  const v = new Int32Array(2 * k);
  const w = new Float64Array(2 * k);
  const c = new Int32Array(2 * k);
  let m = 0;
  for (let i = 0; i < k; i++) {
    const x = constraints[i];
    if (x.hi !== Infinity) {
      // x_to − x_from ≤ hi
      u[m] = from[i];
      v[m] = to[i];
      w[m] = x.hi;
      c[m++] = i;
    }
    if (x.lo !== -Infinity) {
      // x_from − x_to ≤ −lo
      u[m] = to[i];
      v[m] = from[i];
      w[m] = -x.lo;
      c[m++] = i;
    }
  }
  return { m, u, v, w, c };
}

/** The edges leaving each point, in the order given: those of point p are list[at[p]] to list[at[p + 1] − 1]. */
interface Adjacency {
  at: Int32Array;
  list: Int32Array;
}

function adjacency(n: number, m: number, src: Int32Array): Adjacency {
  const at = new Int32Array(n + 1);
  for (let e = 0; e < m; e++) at[src[e] + 1]++;
  for (let p = 0; p < n; p++) at[p + 1] += at[p];
  const fill = at.slice(0, n);
  const list = new Int32Array(m);
  for (let e = 0; e < m; e++) list[fill[src[e]]++] = e;
  return { at, list };
}

/**
 * A cycle in the predecessor graph, if there is one: it can only be a negative cycle. `pred[x]` is the edge a point
 * was last reached by, or −1, and `src[e]` the point an edge leaves.
 */
function cycleIn(n: number, pred: Int32Array, src: Int32Array): number[] | undefined {
  const state = new Uint8Array(n); // 0 = unseen, 1 = on the current walk, 2 = done
  for (let start = 0; start < n; start++) {
    const walk: number[] = [];
    let x = start;
    while (x !== -1 && state[x] === 0) {
      state[x] = 1;
      walk.push(x);
      x = pred[x] === -1 ? -1 : src[pred[x]];
    }
    if (x !== -1 && state[x] === 1) {
      const cycle: number[] = [];
      let y = x;
      do {
        const e = pred[y];
        cycle.push(e);
        y = src[e];
      } while (y !== x);
      return cycle.reverse();
    }
    for (const q of walk) state[q] = 2;
  }
  return undefined;
}

/** Recompute exact depths in an acyclic predecessor forest when stale descendant depths hit `n`. */
function refreshDepths(n: number, pred: Int32Array, src: Int32Array, len: Int32Array): void {
  len.fill(-1);
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (len[i] !== -1) continue;
    stack.length = 0;
    let x = i;
    while (x !== -1 && len[x] === -1) {
      stack.push(x);
      x = pred[x] === -1 ? -1 : src[pred[x]];
    }
    let d = x === -1 ? -1 : len[x];
    for (let k = stack.length - 1; k >= 0; k--) {
      d++;
      len[stack[k]] = d;
    }
  }
}

/**
 * Shortest distances by a queue (SPFA): a point is looked at again only when its distance falls, so
 * a network settles in a few passes over its edges, where Bellman–Ford makes one pass per point.
 * The queue is first in, first out, so the result is the same on every run. A cycle shows in the
 * predecessor graph, where it can only be a negative one: it is looked for whenever a path grows
 * past the number of points, and every n relaxations besides, since a cycle can turn many times
 * before any path grows that long.
 *
 * The graph's edges run from src[e] to dst[e]; `all` starts from every point, in order, else from point 0.
 */
function settle(n: number, out: Adjacency, src: Int32Array, dst: Int32Array, w: Float64Array, dist: Float64Array, all: boolean): { pred: Int32Array; cycle?: number[] } {
  const pred = new Int32Array(n).fill(-1);
  const len = new Int32Array(n);
  const queued = new Uint8Array(n);
  const ring = new Int32Array(n + 1);
  const { at, list } = out;
  let head = 0;
  let tail = 0;
  for (let v = 0; v < (all ? n : 1); v++) {
    queued[v] = 1;
    ring[tail] = v;
    tail = tail === n ? 0 : tail + 1;
  }
  let relaxed = 0;
  while (head !== tail) {
    const x = ring[head];
    head = head === n ? 0 : head + 1;
    queued[x] = 0;
    const dx = dist[x];
    if (dx === Infinity) continue;
    for (let k = at[x], end = at[x + 1]; k < end; k++) {
      const e = list[k];
      const y = dst[e];
      const next = dx + w[e];
      const tol = Math.max(EPS_ABS, Math.max(Math.abs(dx), Math.abs(w[e]), Number.isFinite(dist[y]) ? Math.abs(dist[y]) : 0) * EPS_REL);
      if (next < dist[y] - tol) {
        dist[y] = next;
        pred[y] = e;
        len[y] = len[x] + 1;
        if (len[y] >= n || ++relaxed % n === 0) {
          const cycle = cycleIn(n, pred, src);
          if (cycle) return { pred, cycle };
          // Stale descendant `len` values after an ancestor re-parenting can reach `n` in an acyclic forest;
          // refresh exact tree depths instead of aborting.
          if (len[y] >= n) refreshDepths(n, pred, src, len);
        }
        if (!queued[y]) {
          queued[y] = 1;
          ring[tail] = y;
          tail = tail === n ? 0 : tail + 1;
        }
      }
    }
  }
  return { pred };
}

/**
 * For every point, the constraints along its shortest path from `from`, nearest to `from` first,
 * each once, where it last appears. Each point's list is its predecessor's with one more, so they
 * are worked out together.
 */
function pathSources(pred: Int32Array, src: Int32Array, edgeConstraint: Int32Array, constraints: Constraint[], from: number): string[][] {
  const n = pred.length;
  const paths: Array<string[] | undefined> = new Array(n);
  paths[from] = [];
  const chain: number[] = [];
  for (let i = 0; i < n; i++) {
    chain.length = 0;
    let x = i;
    while (paths[x] === undefined) {
      const e = pred[x];
      if (e === -1 || chain.length > n) {
        paths[x] = [];
        break;
      }
      chain.push(x);
      x = src[e];
    }
    for (let k = chain.length - 1; k >= 0; k--) {
      const y = chain[k];
      if (paths[y] !== undefined) continue;
      const e = pred[y];
      const before = paths[src[e]]!;
      const s = constraints[edgeConstraint[e]].source;
      paths[y] = before.includes(s) ? [...before.filter((t) => t !== s), s] : [...before, s];
    }
  }
  return paths as string[][];
}

function conflictOf(cycle: number[], es: Edges, constraints: Constraint[]): Conflict {
  const seen = new Set<Constraint>();
  const cs: Constraint[] = [];
  for (const e of cycle) {
    const c = constraints[es.c[e]];
    if (!seen.has(c)) {
      seen.add(c);
      cs.push(c);
    }
  }
  return { constraints: cs, slack: cycle.reduce((s, e) => s + es.w[e], 0) };
}

/** Each constraint's ends as indices into a network's points. */
function endsOf(index: Map<string, number>, constraints: Constraint[]): { from: Int32Array; to: Int32Array } {
  const from = new Int32Array(constraints.length);
  const to = new Int32Array(constraints.length);
  for (let i = 0; i < constraints.length; i++) {
    const c = constraints[i];
    const u = index.get(c.from);
    const v = index.get(c.to);
    if (u === undefined || v === undefined) throw new Error(`constraint ${c.source} refers to an unknown point`);
    from[i] = u;
    to[i] = v;
  }
  return { from, to };
}

/** A negative cycle anywhere in the network, if there is one: every point starts at distance 0. */
function findNegativeCycle(n: number, es: Edges, out: Adjacency): number[] | undefined {
  return settle(n, out, es.u, es.v, es.w, new Float64Array(n), true).cycle;
}

/** Whether a network holds, without working out its bounds: the conflict, if it does not. */
export function conflictIn(points: string[], constraints: Constraint[]): Conflict | undefined {
  const names = [ORIGIN, ...[...new Set(points)].filter((p) => p !== ORIGIN).sort()];
  const index = new Map(names.map((p, i) => [p, i]));
  const { from, to } = endsOf(index, constraints);
  return conflictAt(names.length, constraints, from, to);
}

function conflictAt(n: number, constraints: Constraint[], from: Int32Array, to: Int32Array): Conflict | undefined {
  const es = edgesOf(constraints, from, to);
  const cycle = findNegativeCycle(n, es, adjacency(n, es.m, es.u));
  return cycle && conflictOf(cycle, es, constraints);
}

export function solve(points: string[], constraints: Constraint[]): Solution {
  const names = [ORIGIN, ...[...new Set(points)].filter((p) => p !== ORIGIN).sort()];
  const index = new Map(names.map((p, i) => [p, i]));
  const { from, to } = endsOf(index, constraints);
  const sol = solveAt(names, constraints, from, to);
  if (!sol.ok) return sol;
  const bounds: Bounds = new Map();
  for (let i = 1; i < names.length; i++) bounds.set(names[i], sol.bound(i));
  return { ok: true, bounds };
}

/**
 * A network solved, its points named in order, ORIGIN first: the conflict, or each point's bound by its index.
 * Upper bounds are shortest paths from ORIGIN; lower bounds shortest paths to ORIGIN, i.e. from ORIGIN in the
 * reversed graph.
 */
function solveAt(names: string[], constraints: Constraint[], from: Int32Array, to: Int32Array): { ok: true; bound: (i: number) => Bound; same: (i: number, b: Bound) => boolean } | { ok: false; conflict: Conflict } {
  const n = names.length;
  const es = edgesOf(constraints, from, to);
  const fwdOut = adjacency(n, es.m, es.u);
  const cycle = findNegativeCycle(n, es, fwdOut);
  if (cycle) return { ok: false, conflict: conflictOf(cycle, es, constraints) };
  const fwd = new Float64Array(n).fill(Infinity);
  fwd[0] = 0;
  const fwdRes = settle(n, fwdOut, es.u, es.v, es.w, fwd, false);
  if (fwdRes.cycle) return { ok: false, conflict: conflictOf(fwdRes.cycle, es, constraints) };
  const bwd = new Float64Array(n).fill(Infinity);
  bwd[0] = 0;
  const bwdRes = settle(n, adjacency(n, es.m, es.v), es.v, es.u, es.w, bwd, false);
  if (bwdRes.cycle) return { ok: false, conflict: conflictOf([...bwdRes.cycle].reverse(), es, constraints) };
  const loBy = pathSources(bwdRes.pred, es.v, es.c, constraints, 0);
  const hiBy = pathSources(fwdRes.pred, es.u, es.c, constraints, 0);
  return {
    ok: true,
    bound: (i) => ({ lo: -bwd[i], hi: fwd[i], loBy: loBy[i], hiBy: hiBy[i] }),
    same: (i, b) => -bwd[i] === b.lo && fwd[i] === b.hi && sameList(loBy[i], b.loBy) && sameList(hiBy[i], b.hiBy),
  };
}

function sameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

type Bound = { lo: number; hi: number; loBy: string[]; hiBy: string[] };

const sameConstraint = (a: Constraint, b: Constraint) => a === b || (a.source === b.source && a.from === b.from && a.to === b.to && a.lo === b.lo && a.hi === b.hi && a.note === b.note);

/**
 * A base network's points and constraints by number, worked out once per network: each point's number and its
 * place in the order of names, each constraint's ends (−1 for ORIGIN), and the constraints at each point other
 * than ORIGIN, by index, each once, in order (those of point p are atList[atStart[p]] to atList[atStart[p + 1] − 1]).
 */
interface Indexed {
  points: string[];
  constraints: Constraint[];
  ids: Map<string, number>;
  names: string[];
  /** each point's place among the names, sorted as `solve` sorts them */
  rank: Int32Array;
  /** the names, sorted as `solve` sorts them */
  sorted: string[];
  from: Int32Array;
  to: Int32Array;
  atStart: Int32Array;
  atList: Int32Array;
}

const indexes = new WeakMap<Constraint[], Indexed>();

function indexed(base: { points: string[]; constraints: Constraint[] }): Indexed {
  const known = indexes.get(base.constraints);
  if (known && known.points === base.points) return known;
  const ids = new Map<string, number>();
  const names: string[] = [];
  const id = (p: string) => {
    if (p === ORIGIN) return -1;
    let i = ids.get(p);
    if (i === undefined) {
      i = names.length;
      ids.set(p, i);
      names.push(p);
    }
    return i;
  };
  for (const p of base.points) id(p);
  const cs = base.constraints;
  const from = new Int32Array(cs.length);
  const to = new Int32Array(cs.length);
  for (let i = 0; i < cs.length; i++) {
    from[i] = id(cs[i].from);
    to[i] = id(cs[i].to);
  }
  const n = names.length;
  const atStart = new Int32Array(n + 1);
  for (let i = 0; i < cs.length; i++) {
    if (from[i] !== -1) atStart[from[i] + 1]++;
    if (to[i] !== -1 && to[i] !== from[i]) atStart[to[i] + 1]++;
  }
  for (let p = 0; p < n; p++) atStart[p + 1] += atStart[p];
  const fill = atStart.slice(0, n);
  const atList = new Int32Array(atStart[n]);
  for (let i = 0; i < cs.length; i++) {
    if (from[i] !== -1) atList[fill[from[i]]++] = i;
    if (to[i] !== -1 && to[i] !== from[i]) atList[fill[to[i]]++] = i;
  }
  const sorted = [...names].sort();
  const rank = new Int32Array(n);
  const place = new Map(sorted.map((p, i) => [p, i]));
  for (let i = 0; i < n; i++) rank[i] = place.get(names[i])!;
  const out: Indexed = { points: base.points, constraints: cs, ids, names, rank, sorted, from, to, atStart, atList };
  indexes.set(cs, out);
  return out;
}

/** A network's constraints by index, whether held in an array or made from a base's in place (Splice). */
interface Net {
  length: number;
  at(j: number): Constraint;
}

/** A network made from a base's in place: `constraints` put where `count` of the base's stood from `at` on, with the base's points. */
export interface Splice {
  at: number;
  count: number;
  constraints: Constraint[];
}

/**
 * The part of a network that can differ from a base network's solution, where the two differ in a
 * few constraints. A network falls into pieces that meet only at ORIGIN, the fixed point: a
 * shortest path never passes through ORIGIN twice, so a piece's bounds, and whether it holds,
 * depend on nothing outside it, and solving a piece alone gives what solving the whole gives,
 * tie for tie. So only the pieces holding a changed constraint need solving again.
 *
 * Undefined if the networks do not share their points: then solve the whole.
 */
function changedPart(base: { points: string[]; constraints: Constraint[] }, points: string[], constraints: Constraint[]): Part | undefined {
  if (points !== base.points && (points.length !== base.points.length || points.some((p, i) => p !== base.points[i]))) return undefined;
  // The changed stretch: what lies between the longest common start and the longest common end.
  const a = base.constraints;
  const b = constraints;
  let head = 0;
  while (head < a.length && head < b.length && sameConstraint(a[head], b[head])) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && sameConstraint(a[a.length - 1 - tail], b[b.length - 1 - tail])) tail++;
  return new Part(indexed(base), { length: b.length, at: (j) => b[j] }, head, a.length - tail, b.length - tail);
}

/**
 * The same part, of a network made from the base in place (Splice): the same stretch as if the network were made
 * whole, found without making it. What lies before the splice, and after it, is the base's own, so the scans for
 * the common start and end begin past it.
 */
function splicedPart(base: { points: string[]; constraints: Constraint[] }, splice: Splice): Part {
  const a = base.constraints;
  const mine = splice.constraints;
  const shift = mine.length - splice.count;
  const length = a.length + shift;
  const at = (j: number) => (j < splice.at ? a[j] : j < splice.at + mine.length ? mine[j - splice.at] : a[j - shift]);
  let head = Math.min(splice.at, a.length, length);
  while (head < a.length && head < length && sameConstraint(a[head], at(head))) head++;
  let tail = Math.max(0, Math.min(a.length - splice.at - splice.count, a.length - head, length - head));
  while (tail < a.length - head && tail < length - head && sameConstraint(a[a.length - 1 - tail], at(length - 1 - tail))) tail++;
  return new Part(indexed(base), { length, at }, head, a.length - tail, length - tail);
}

/**
 * The part of a network that can differ from a base's solution (see changedPart): the points reached from the
 * changed stretch, base[head, aEnd) in the base and the network's [head, bEnd), over constraints that do not run
 * through ORIGIN, in the order they were reached, and the network's constraints at them, in order. The walk is
 * made when it is first needed: a part named by its piece (Part.key) and worked out before needs none.
 */
class Part {
  /** points the base does not have, numbered after its own */
  private extra: string[] = [];
  /** the new stretch's ends by number, −1 for ORIGIN */
  private sFrom: Int32Array;
  private sTo: Int32Array;
  /** the new stretch's constraints at each point */
  private newAt = new Map<number, number[]>();
  private shift: number;
  private walked?: { order: number[]; kept: number[] };

  constructor(
    private ix: Indexed,
    private b: Net,
    private head: number,
    private aEnd: number,
    private bEnd: number,
  ) {
    const n = ix.names.length;
    this.shift = b.length - ix.from.length;
    const extraIds = new Map<string, number>();
    const idOf = (p: string): number => {
      if (p === ORIGIN) return -1;
      const i = ix.ids.get(p) ?? extraIds.get(p);
      if (i !== undefined) return i;
      extraIds.set(p, n + this.extra.length);
      this.extra.push(p);
      return n + this.extra.length - 1;
    };
    const sFrom = (this.sFrom = new Int32Array(bEnd - head));
    const sTo = (this.sTo = new Int32Array(bEnd - head));
    for (let j = head; j < bEnd; j++) {
      const c = b.at(j);
      sFrom[j - head] = idOf(c.from);
      sTo[j - head] = idOf(c.to);
      for (const p of [sFrom[j - head], sTo[j - head]]) {
        if (p === -1) continue;
        const list = this.newAt.get(p);
        if (list) list.push(j);
        else this.newAt.set(p, [j]);
      }
    }
  }

  /**
   * Walk out from every point the stretch touches, over constraints that do not run through ORIGIN: at each point,
   * the base's constraints before the stretch, the new stretch's, then the base's after it.
   */
  private walk(): { order: number[]; kept: number[] } {
    if (this.walked) return this.walked;
    const { ix, b, head, aEnd, bEnd, sFrom, sTo, newAt, shift } = this;
    const n = ix.names.length;
    const seen = new Uint8Array(n + this.extra.length);
    const order: number[] = [];
    const todo: number[] = [];
    const visit = (p: number) => {
      if (p === -1 || seen[p]) return;
      seen[p] = 1;
      order.push(p);
      todo.push(p);
    };
    for (let i = head; i < aEnd; i++) {
      visit(ix.from[i]);
      visit(ix.to[i]);
    }
    for (let j = 0; j < bEnd - head; j++) {
      visit(sFrom[j]);
      visit(sTo[j]);
    }
    const held = new Uint8Array(b.length);
    const { atStart, atList, from, to } = ix;
    while (todo.length) {
      const p = todo.pop()!;
      const inBase = p < n;
      if (inBase) {
        for (let k = atStart[p], end = atStart[p + 1]; k < end; k++) {
          const i = atList[k];
          if (i >= head) continue;
          held[i] = 1;
          visit(from[i]);
          visit(to[i]);
        }
      }
      const mine = newAt.get(p);
      if (mine) {
        for (const j of mine) {
          held[j] = 1;
          visit(sFrom[j - head]);
          visit(sTo[j - head]);
        }
      }
      if (inBase) {
        for (let k = atStart[p], end = atStart[p + 1]; k < end; k++) {
          const i = atList[k];
          if (i < aEnd) continue;
          held[i + shift] = 1;
          visit(from[i]);
          visit(to[i]);
        }
      }
    }
    const kept: number[] = [];
    for (let j = 0; j < b.length; j++) if (held[j]) kept.push(j);
    return (this.walked = { order, kept });
  }

  /** Whether the part has no points: the stretch touches none but ORIGIN. */
  empty(): boolean {
    return this.walk().order.length === 0;
  }

  private nameOf(p: number): string {
    return p < this.ix.names.length ? this.ix.names[p] : this.extra[p - this.ix.names.length];
  }

  /** The points, in the order they were reached. */
  points(): string[] {
    return this.walk().order.map((p) => this.nameOf(p));
  }

  constraints(): Constraint[] {
    return this.walk().kept.map((j) => this.b.at(j));
  }

  /** The constraints' ends among points numbered by `local`, ORIGIN being 0. */
  private endsBy(local: Int32Array): { from: Int32Array; to: Int32Array } {
    const { kept } = this.walk();
    const { head, bEnd, shift, sFrom, sTo } = this;
    const from = new Int32Array(kept.length);
    const to = new Int32Array(kept.length);
    for (let k = 0; k < kept.length; k++) {
      const j = kept[k];
      // A constraint's ends by number, −1 for ORIGIN: the new stretch's, else the base's.
      const stretch = j >= head && j < bEnd;
      const i = j < head ? j : j - shift;
      const u = stretch ? sFrom[j - head] : this.ix.from[i];
      const v = stretch ? sTo[j - head] : this.ix.to[i];
      from[k] = u === -1 ? 0 : local[u];
      to[k] = v === -1 ? 0 : local[v];
    }
    return { from, to };
  }

  /** The points, ORIGIN first and the rest sorted as `solve` sorts them, and each constraint's ends among them. */
  numbered(): { names: string[]; from: Int32Array; to: Int32Array } {
    const { ix, extra } = this;
    const { order } = this.walk();
    const n = ix.names.length;
    // Each point's place among the names: by its rank among the base's points, else by name.
    const local = new Int32Array(n + extra.length);
    let names: string[];
    if (extra.length) {
      names = [ORIGIN, ...this.points().sort()];
      const place = new Map(names.map((p, i) => [p, i]));
      for (const p of order) local[p] = place.get(this.nameOf(p))!;
    } else {
      // The ranks the part has, in order, read off a mark for each.
      const place = new Int32Array(n);
      for (const p of order) place[ix.rank[p]] = 1;
      names = [ORIGIN];
      for (let r = 0; r < n; r++) {
        if (!place[r]) continue;
        place[r] = names.length;
        names.push(ix.sorted[r]);
      }
      for (const p of order) local[p] = place[ix.rank[p]];
    }
    return { names, ...this.endsBy(local) };
  }

  /** Whether the part holds, as conflictIn(points(), constraints()) says: its points in the order they were reached. */
  conflict(): Conflict | undefined {
    const { order } = this.walk();
    const local = new Int32Array(this.ix.names.length + this.extra.length);
    order.forEach((p, i) => (local[p] = i + 1));
    const { from, to } = this.endsBy(local);
    return conflictAt(order.length + 1, this.constraints(), from, to);
  }

  /**
   * A name for what the part holds, the same in every network `pieces` has seen that holds the same, by which
   * what it comes to is kept (Pieces.of); `withBase` for what it comes to against the base's solution, which turns
   * on what the base held in the stretch's place too. Undefined if the part has points the base does not have.
   *
   * Where the stretch lies in one piece of the base (the usual case), the part is that piece, with the stretch put
   * in place: named by the piece, where in it the stretch lies, and what the new stretch holds, without walking.
   * Else the part is walked and named by its points and constraints in order, and what the base held.
   */
  key(pieces: Pieces, withBase: boolean): string | undefined {
    const { ix, head, aEnd, bEnd, sFrom, sTo } = this;
    if (this.extra.length) return undefined;
    const tag = withBase ? 's' : 'c';
    const base = pieces.numbersOf(ix);
    const comps = pieces.piecesOf(ix);
    let piece = -1;
    let one = true;
    const at = (p: number) => {
      if (p === -1) return;
      const c = comps.of[p];
      if (piece === -1) piece = c;
      else if (c !== piece) one = false;
    };
    for (let i = head; i < aEnd; i++) {
      at(ix.from[i]);
      at(ix.to[i]);
    }
    for (let j = 0; j < bEnd - head; j++) {
      at(sFrom[j]);
      at(sTo[j]);
    }
    if (piece !== -1 && one) {
      // The piece's constraints, by index in order: how many lie before the stretch, and how many in it.
      const { start, list } = comps;
      const before = lowerBound(list, start[piece], start[piece + 1], head) - start[piece];
      const within = lowerBound(list, start[piece], start[piece + 1], aEnd) - start[piece] - before;
      const mine: number[] = [];
      for (let j = head; j < bEnd; j++) mine.push(pieces.contentId(this.b.at(j)));
      return `${tag}1 ${pieces.pieceName(ix, piece)} ${before} ${within} ${mine.join(',')}`;
    }
    // Several pieces, which the stretch joins or may part: by what the walk reaches.
    const { order, kept } = this.walk();
    const old: number[] = [];
    if (withBase) for (let i = head; i < aEnd; i++) if (ix.from[i] !== -1 || ix.to[i] !== -1) old.push(base.content(i));
    const out = new Int32Array(3 + order.length + kept.length + (withBase ? 3 + old.length : 0));
    let o = 0;
    out[o++] = withBase ? 1 : 2;
    out[o++] = order.length;
    for (const p of order) out[o++] = base.point(p);
    out[o++] = kept.length;
    let before = 0;
    let mine = 0;
    for (const j of kept) {
      if (j < head) before++;
      if (j >= head && j < bEnd) {
        mine++;
        out[o++] = pieces.contentId(this.b.at(j));
      } else out[o++] = base.content(j < head ? j : j - this.shift);
    }
    if (withBase) {
      out[o++] = before;
      out[o++] = mine;
      out[o++] = old.length;
      for (const c of old) out[o++] = c;
    }
    return `${tag}2 ${pieces.hashOf(out)}`;
  }
}

/** The first place in list[from, to), sorted, whose value is at least x. */
function lowerBound(list: Int32Array, from: number, to: number, x: number): number {
  let lo = from;
  let hi = to;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Parts of networks already solved again, kept by what they hold, for a caller that solves many networks alike: a
 * pick in one picture often changes a part that other pictures have too, and solving it there gives the same
 * answer. A part is named by what it holds (Part.key), hashed by `hash`.
 */
export class Pieces {
  private pointIds = new Map<string, number>();
  private contentIds = new Map<string, number>();
  private contentOf = new WeakMap<Constraint, number>();
  private bases = new WeakMap<Indexed, { points: Int32Array; contents: Int32Array }>();
  private pieces = new WeakMap<Indexed, { of: Int32Array; start: Int32Array; list: Int32Array; one: Int32Array; names: Array<string | undefined> }>();
  private known = new Map<string, unknown>();
  hits = 0;
  misses = 0;

  constructor(private hash: (data: Uint8Array) => string) {}

  hashOf(data: Int32Array): string {
    return this.hash(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }

  pointId(p: string): number {
    let i = this.pointIds.get(p);
    if (i === undefined) this.pointIds.set(p, (i = this.pointIds.size));
    return i;
  }

  /** A number for what a constraint says: the same for two that say the same. */
  contentId(c: Constraint): number {
    let i = this.contentOf.get(c);
    if (i !== undefined) return i;
    const num = (x: number) => (Object.is(x, -0) ? '-0' : String(x));
    const key = `${c.source}\u0000${c.from}\u0000${c.to}\u0000${num(c.lo)}\u0000${num(c.hi)}\u0000${c.note === undefined ? '\u0001' : c.note}`;
    i = this.contentIds.get(key);
    if (i === undefined) this.contentIds.set(key, (i = this.contentIds.size));
    this.contentOf.set(c, i);
    return i;
  }

  /** A base's points and constraints as these numbers, worked out as they are asked for. */
  numbersOf(ix: Indexed): { point: (p: number) => number; content: (i: number) => number } {
    let known = this.bases.get(ix);
    if (!known) {
      known = { points: new Int32Array(ix.names.length).fill(-1), contents: new Int32Array(ix.from.length).fill(-1) };
      this.bases.set(ix, known);
    }
    const { points, contents } = known;
    return {
      point: (p) => (points[p] === -1 ? (points[p] = this.pointId(ix.names[p])) : points[p]),
      content: (i) => (contents[i] === -1 ? (contents[i] = this.contentId(ix.constraints[i])) : contents[i]),
    };
  }

  /**
   * A base's pieces, which meet only at ORIGIN: each point's piece, each piece's constraints by index in order
   * (those of piece c are list[start[c]] to list[start[c + 1] − 1]), and a point of each.
   */
  piecesOf(ix: Indexed): { of: Int32Array; start: Int32Array; list: Int32Array; one: Int32Array; names: Array<string | undefined> } {
    const known = this.pieces.get(ix);
    if (known) return known;
    const n = ix.names.length;
    const up = Int32Array.from({ length: n }, (_, i) => i);
    const root = (x: number): number => {
      while (up[x] !== x) x = up[x] = up[up[x]];
      return x;
    };
    for (let i = 0; i < ix.from.length; i++) {
      if (ix.from[i] === -1 || ix.to[i] === -1) continue;
      const a = root(ix.from[i]);
      const b = root(ix.to[i]);
      if (a !== b) up[a] = b;
    }
    const of = new Int32Array(n).fill(-1);
    const one: number[] = [];
    for (let p = 0; p < n; p++) {
      const r = root(p);
      if (of[r] === -1) {
        of[r] = one.length;
        one.push(p);
      }
      of[p] = of[r];
    }
    const count = one.length;
    const start = new Int32Array(count + 1);
    const pieceOf = (i: number) => of[ix.from[i] !== -1 ? ix.from[i] : ix.to[i]];
    for (let i = 0; i < ix.from.length; i++) if (ix.from[i] !== -1 || ix.to[i] !== -1) start[pieceOf(i) + 1]++;
    for (let c = 0; c < count; c++) start[c + 1] += start[c];
    const fill = start.slice(0, count);
    const list = new Int32Array(start[count]);
    for (let i = 0; i < ix.from.length; i++) if (ix.from[i] !== -1 || ix.to[i] !== -1) list[fill[pieceOf(i)]++] = i;
    const out = { of, start, list, one: Int32Array.from(one), names: new Array<string | undefined>(count) };
    this.pieces.set(ix, out);
    return out;
  }

  /**
   * A name for what a piece of a base holds: its constraints' contents, in order, which name its points too; a piece
   * of one point and no constraints, by the point.
   */
  pieceName(ix: Indexed, piece: number): string {
    const comps = this.piecesOf(ix);
    const known = comps.names[piece];
    if (known !== undefined) return known;
    const base = this.numbersOf(ix);
    const { start, list } = comps;
    const data = start[piece + 1] > start[piece] ? Int32Array.from(list.subarray(start[piece], start[piece + 1]), (i) => base.content(i)) : Int32Array.of(-1, base.point(comps.one[piece]));
    return (comps.names[piece] = this.hashOf(data));
  }

  /** What a part came to, if a part named the same was worked out before; else work it out and keep it. */
  of<T>(key: string | undefined, work: () => T): T {
    if (key === undefined) return work();
    if (this.known.has(key)) {
      this.hits++;
      return this.known.get(key) as T;
    }
    this.misses++;
    const out = work();
    this.known.set(key, out);
    return out;
  }
}

type Changed = { ok: true; changed: Array<[string, Bound]> } | { ok: false; conflict: Conflict };

/** A part solved, as the bounds that differ from the base's, or the conflict. */
function solvePart(part: Part, bounds: Pick<Bounds, 'get'>, pieces?: Pieces): Changed {
  const work = (): Changed => {
    const { names, from, to } = part.numbered();
    const sol = solveAt(names, part.constraints(), from, to);
    if (!sol.ok) return sol;
    const changed: Array<[string, Bound]> = [];
    for (let i = 1; i < names.length; i++) {
      const was = bounds.get(names[i]);
      if (!was || !sol.same(i, was)) changed.push([names[i], sol.bound(i)]);
    }
    return { ok: true, changed };
  };
  return pieces ? pieces.of(part.key(pieces, true), work) : work();
}

/** Whether a part holds: the conflict if it does not. */
function partConflict(part: Part, pieces?: Pieces): Conflict | undefined {
  const work = () => (part.empty() ? undefined : part.conflict());
  return pieces ? pieces.of(part.key(pieces, false), work) : work();
}

/**
 * A network that differs from a solved one in a few constraints, solved again only where it can
 * differ (see changedPart). Returns the bounds that differ from the base's, or the conflict;
 * undefined if the networks do not share their points, when the caller should solve the whole.
 * With `pieces`, a part worked out before is not worked out again.
 */
export function solveChanged(base: { points: string[]; constraints: Constraint[]; bounds: Pick<Bounds, 'get'> }, points: string[], constraints: Constraint[], pieces?: Pieces): Changed | undefined {
  const part = changedPart(base, points, constraints);
  return part && solvePart(part, base.bounds, pieces);
}

/** The same, for a network made from the base in place (Splice). */
export function solveSplice(base: { points: string[]; constraints: Constraint[]; bounds: Pick<Bounds, 'get'> }, splice: Splice, pieces?: Pieces): Changed {
  return solvePart(splicedPart(base, splice), base.bounds, pieces);
}

/**
 * Whether a network that differs from a consistent one in a few constraints holds, looking only
 * where it can differ (see changedPart): the conflict if it does not. Undefined for "holds"; the
 * string "whole" if the networks do not share their points, when the caller should check the whole.
 * With `pieces`, a part worked out before is not worked out again.
 */
export function conflictChanged(base: { points: string[]; constraints: Constraint[] }, points: string[], constraints: Constraint[], pieces?: Pieces): Conflict | undefined | 'whole' {
  const part = changedPart(base, points, constraints);
  return part ? partConflict(part, pieces) : 'whole';
}

/** The same, for a network made from the base in place (Splice). */
export function conflictSplice(base: { points: string[]; constraints: Constraint[] }, splice: Splice, pieces?: Pieces): Conflict | undefined {
  return partConflict(splicedPart(base, splice), pieces);
}
