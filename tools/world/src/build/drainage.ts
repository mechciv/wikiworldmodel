// Water routed over a grid of the land (model:earth/drainage, docs/slices/EIGHTH-SLICE.md): where each node drains to,
// how much water passes it in a year, and where water stands as lakes because the climate cannot carry it away.
//
// The flood starts at the sea and climbs the land in order of height (priority-flood, with a plain queue for the
// nodes a hollow or a flat holds), so every node drains to the node it was reached from: down slopes, across flats
// toward their outlet, and out of every hollow over its lowest pass. Each hollow then holds a lake. If more flows into
// it in a year than its surface can evaporate when it is full, it fills to its pass and the rest spills on; if not,
// it holds a lake whose surface evaporates just what comes in, and nothing flows on. The Caspian is such a lake, and
// so are Lake Chad and the Great Salt Lake; in a wetter climate, they rise and may spill.
//
// The grid is of nodes `step` degrees apart from 90°N and 180°W, wrapping east, as every global grid of the build is.

const R = 6371000;
const YEAR = 365.25 * 86400;
/** a hollow is any node at least this far under the level its water rests at, in metres */
const HOLLOW = 0.01;

export interface NodeGrid {
  nx: number;
  ny: number;
  step: number;
}

/** The latitude and longitude of a node. */
export const latOf = (g: NodeGrid, k: number) => 90 - Math.floor(k / g.nx) * g.step;
export const lonOf = (g: NodeGrid, k: number) => -180 + (k % g.nx) * g.step;

/** The area around each row's nodes, in m²: the band of latitude half a step either side, clipped at the poles. */
export function rowAreas(g: NodeGrid): Float64Array {
  const out = new Float64Array(g.ny);
  const dl = (g.step * Math.PI) / 180;
  for (let r = 0; r < g.ny; r++) {
    const lat = 90 - r * g.step;
    const n = Math.min(90, lat + g.step / 2);
    const s = Math.max(-90, lat - g.step / 2);
    out[r] = R * R * dl * (Math.sin((n * Math.PI) / 180) - Math.sin((s * Math.PI) / 180));
  }
  return out;
}

/** Each of a node's eight neighbours, wrapping east and west. */
function eachNeighbour(g: NodeGrid, k: number, f: (q: number) => void): void {
  const r = Math.floor(k / g.nx);
  const c = k - r * g.nx;
  for (let dr = -1; dr <= 1; dr++) {
    const rr = r + dr;
    if (rr < 0 || rr >= g.ny) continue;
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      let cc = c + dc;
      if (cc < 0) cc += g.nx;
      else if (cc >= g.nx) cc -= g.nx;
      f(rr * g.nx + cc);
    }
  }
}

/** A heap of nodes by level, the earliest pushed first among equals. */
class LevelHeap {
  private level: Float64Array;
  private seq: Float64Array;
  private node: Int32Array;
  private n = 0;
  private count = 0;
  constructor(capacity: number) {
    this.level = new Float64Array(capacity);
    this.seq = new Float64Array(capacity);
    this.node = new Int32Array(capacity);
  }
  get size(): number {
    return this.n;
  }
  private less(a: number, b: number): boolean {
    return this.level[a] < this.level[b] || (this.level[a] === this.level[b] && this.seq[a] < this.seq[b]);
  }
  private swap(a: number, b: number): void {
    const l = this.level[a];
    this.level[a] = this.level[b];
    this.level[b] = l;
    const s = this.seq[a];
    this.seq[a] = this.seq[b];
    this.seq[b] = s;
    const v = this.node[a];
    this.node[a] = this.node[b];
    this.node[b] = v;
  }
  push(level: number, node: number): void {
    let i = this.n++;
    this.level[i] = level;
    this.seq[i] = this.count++;
    this.node[i] = node;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const out = this.node[0];
    this.n--;
    if (this.n > 0) {
      this.swap(0, this.n);
      let i = 0;
      for (;;) {
        const a = 2 * i + 1;
        const b = a + 1;
        let m = i;
        if (a < this.n && this.less(a, m)) m = a;
        if (b < this.n && this.less(b, m)) m = b;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return out;
  }
}

/**
 * The sea at a level: today's ocean where it lies at or under the level, flooded on through every node at or under
 * it that it reaches. A hollow under the level that the sea cannot reach, such as the Caspian's, stays land.
 */
export function seaAt(z: ArrayLike<number>, g: NodeGrid, ocean: Uint8Array, level: number): Uint8Array {
  const sea = new Uint8Array(z.length);
  const stack: number[] = [];
  for (let k = 0; k < z.length; k++) {
    if (ocean[k] && z[k] <= level) {
      sea[k] = 1;
      stack.push(k);
    }
  }
  while (stack.length) {
    eachNeighbour(g, stack.pop()!, (q) => {
      if (!sea[q] && z[q] <= level) {
        sea[q] = 1;
        stack.push(q);
      }
    });
  }
  return sea;
}

export interface Routing {
  /** the node each drains to; -1 for a node of the sea */
  down: Int32Array;
  /** the land's nodes in the order the flood reached them: each after the node it drains to */
  order: Int32Array;
  /** the level water rests at: the ground, or the pass of the hollow it lies in */
  fill: Float32Array;
  sea: Uint8Array;
}

/** Route the land to the sea (priority-flood: Barnes, Lehman & Mulla 2014, with a queue for what hollows and flats hold). */
export function route(z: ArrayLike<number>, g: NodeGrid, sea: Uint8Array): Routing {
  const n = g.nx * g.ny;
  const down = new Int32Array(n).fill(-1);
  const fill = new Float32Array(n);
  const closed = new Uint8Array(n);
  const order = new Int32Array(n);
  let m = 0;
  const heap = new LevelHeap(n);
  const pit = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let k = 0; k < n; k++) {
    if (!sea[k]) continue;
    closed[k] = 1;
    fill[k] = z[k];
  }
  // The coast: every node of the sea next to land starts the flood, at the sea's surface.
  for (let k = 0; k < n; k++) {
    if (!sea[k]) continue;
    let coast = false;
    eachNeighbour(g, k, (q) => {
      if (!sea[q]) coast = true;
    });
    if (coast) heap.push(-Infinity, k);
  }
  const reach = (from: number, level: number) => {
    eachNeighbour(g, from, (q) => {
      if (closed[q]) return;
      closed[q] = 1;
      down[q] = from;
      if (z[q] <= level) {
        fill[q] = level;
        pit[tail++] = q;
      } else {
        fill[q] = z[q];
        heap.push(z[q], q);
      }
    });
  };
  while (head < tail || heap.size) {
    const k = head < tail ? pit[head++] : heap.pop();
    if (!sea[k]) order[m++] = k;
    reach(k, sea[k] ? -Infinity : fill[k]);
  }
  // A node no sea reaches (an island of land with no coast on this grid) drains nowhere, and is left out.
  return { down, order: order.slice(0, m), fill, sea };
}

export interface Lake {
  /** the node water leaves it by, the lowest node of its rim; for a lake that does not spill, where it would */
  outlet: number;
  /** its surface, in the grid's metres */
  level: number;
  /** the nodes it covers */
  nodes: Int32Array;
  km2: number;
  /** what flows in and out in a year, as a mean flow in m³/s */
  inflow: number;
  outflow: number;
  spills: boolean;
}

/** The hollows of a routed grid, which every climate on it shares. */
export interface Hollows {
  /** each hollow's nodes, deepest first */
  sets: Int32Array[];
  /** the hollow each node lies in, or -1 */
  of: Int32Array;
  /** the node each drains out by */
  outlet: Int32Array;
  /** the hollows that drain out by a node */
  atOutlet: Map<number, number[]>;
}

/** The hollows: nodes under the level their water rests at, in sets that rest at one level and touch. */
export function hollowsOf(z: ArrayLike<number>, g: NodeGrid, r: Routing): Hollows {
  const n = g.nx * g.ny;
  const of = new Int32Array(n).fill(-1);
  const lists: number[][] = [];
  for (const k of r.order) {
    if (of[k] >= 0 || !(r.fill[k] > z[k] + HOLLOW)) continue;
    const id = lists.length;
    const nodes = [k];
    of[k] = id;
    for (let i = 0; i < nodes.length; i++) {
      eachNeighbour(g, nodes[i], (q) => {
        if (of[q] < 0 && !r.sea[q] && r.fill[q] > z[q] + HOLLOW && Math.abs(r.fill[q] - r.fill[k]) < HOLLOW) {
          of[q] = id;
          nodes.push(q);
        }
      });
    }
    lists.push(nodes);
  }
  // Each hollow's outlet: the first node outside it that its nodes drain to, in the flood's order. All its nodes come
  // after that node in the flood, so all of them are summed before it is.
  const rank = new Int32Array(n).fill(-1);
  r.order.forEach((k, i) => (rank[k] = i));
  const outlet = new Int32Array(lists.length).fill(-1);
  for (let id = 0; id < lists.length; id++) {
    for (const k of lists[id]) {
      const d = r.down[k];
      if (d >= 0 && of[d] !== id && (outlet[id] < 0 || rank[d] < rank[outlet[id]])) outlet[id] = d;
    }
  }
  const sets = lists.map((l) => Int32Array.from(l.sort((a, b) => z[a] - z[b])));
  return { sets, of, outlet, atOutlet: atOutletOf(outlet) };
}

/** The hollows that drain out by each node, from each hollow's outlet: in the order of the hollows. */
export function atOutletOf(outlet: Int32Array): Map<number, number[]> {
  const atOutlet = new Map<number, number[]>();
  outlet.forEach((o, id) => {
    if (o < 0) return;
    const list = atOutlet.get(o);
    if (list) list.push(id);
    else atOutlet.set(o, [id]);
  });
  return atOutlet;
}

export interface Flow {
  /** the mean flow leaving each node, m³/s: zero under a lake or the sea, and at a lake's outlet what it spills */
  q: Float32Array;
  /** the area that drains through each node, km², whether or not its water gets there */
  km2: Float32Array;
  /** the lake each node lies under, as an index into `lakes`, or -1 */
  lake: Int32Array;
  lakes: Lake[];
  /** the sea the water ran to */
  sea: Uint8Array;
  /** for each hollow, the share of what flows into it in a year that gets out of it: 1 for one the sea floods, 0 for a lake that keeps all of it */
  passes: Float32Array;
}

/**
 * The water of a climate on a routed grid. `runoff` is what each node's land gives in a year, in mm; `loss` is what a
 * lake's surface there loses in a year to evaporation less the rain on it, in mm (none where rain is the greater).
 * `sea` is the sea of the time, if it stands higher than the one the grid was routed to: a node under it gives
 * nothing, and what reaches it has reached the sea. A hollow that any of it floods holds no lake.
 */
export function flow(z: ArrayLike<number>, g: NodeGrid, r: Routing, h: Hollows, runoff: ArrayLike<number>, loss: ArrayLike<number>, sea: Uint8Array = r.sea): Flow {
  const n = g.nx * g.ny;
  const areas = rowAreas(g);
  const area = (k: number) => areas[Math.floor(k / g.nx)];
  const pool = new Float64Array(h.sets.length);
  const qv = new Float64Array(n);
  const av = new Float64Array(n);
  const lake = new Int32Array(n).fill(-1);
  const lakes: Lake[] = [];
  const passes = new Float32Array(h.sets.length);
  const settle = (id: number): number => {
    const out = settleOne(id);
    passes[id] = pool[id] > 0 ? out / pool[id] : 0;
    return out;
  };
  const settleOne = (id: number): number => {
    const nodes = h.sets[id];
    const inflow = pool[id];
    for (const k of nodes) if (sea[k]) return inflow;
    let full = 0;
    for (const k of nodes) full += (Math.max(0, loss[k]) / 1000) * area(k);
    const spills = inflow > full;
    let level = r.fill[nodes[0]];
    let count = nodes.length;
    if (!spills) {
      // The lake whose surface evaporates what comes in: filled from its deepest node up.
      let lost = 0;
      count = 0;
      while (count < nodes.length && lost < inflow) lost += (Math.max(0, loss[nodes[count]]) / 1000) * area(nodes[count++]);
      level = count ? z[nodes[count - 1]] : z[nodes[0]];
    }
    const covered = nodes.slice(0, count);
    let km2 = 0;
    for (const k of covered) {
      lake[k] = lakes.length;
      km2 += area(k) / 1e6;
    }
    lakes.push({ outlet: h.outlet[id], level, nodes: covered, km2, inflow: inflow / YEAR, outflow: spills ? (inflow - full) / YEAR : 0, spills });
    return spills ? inflow - full : 0;
  };
  for (let i = r.order.length - 1; i >= 0; i--) {
    const k = r.order[i];
    if (sea[k]) continue;
    qv[k] += (Math.max(0, runoff[k]) / 1000) * area(k);
    av[k] += area(k) / 1e6;
    const held = h.atOutlet.get(k);
    if (held) for (const id of held) qv[k] += settle(id);
    const d = r.down[k];
    if (d < 0 || sea[d]) continue;
    av[d] += av[k];
    const from = h.of[k];
    if (from >= 0 && h.of[d] !== from) pool[from] += qv[k];
    else qv[d] += qv[k];
  }
  // A hollow with no outlet on the grid keeps what comes in.
  h.outlet.forEach((o, id) => {
    if (o < 0) settle(id);
  });
  const q = new Float32Array(n);
  const km2 = new Float32Array(n);
  // Under a lake that spills, its outflow: where the lake is not drawn, the river runs on through it.
  for (let k = 0; k < n; k++) {
    q[k] = sea[k] ? 0 : lake[k] >= 0 ? lakes[lake[k]].outflow : qv[k] / YEAR;
    km2[k] = av[k];
  }
  return { q, km2, lake, lakes, sea, passes };
}

/** For each node of a grid, the nearest node of a climate's grid, where it reads that climate's months. */
export function nearestNodes(sg: { lon0: number; lat0: number; step: number; nx: number; ny: number }, g: NodeGrid): Int32Array {
  const out = new Int32Array(g.nx * g.ny);
  for (let r = 0; r < g.ny; r++) {
    const j = Math.min(sg.ny - 1, Math.max(0, Math.round((sg.lat0 - (90 - r * g.step)) / sg.step)));
    for (let c = 0; c < g.nx; c++) {
      const i = ((Math.round((-180 + c * g.step - sg.lon0) / sg.step) % sg.nx) + sg.nx) % sg.nx;
      out[r * g.nx + c] = j * sg.nx + i;
    }
  }
  return out;
}

/** The hollows that drain out by each node, as chains: the first at a node, then each to the next. */
export interface OutletChains {
  first: Int32Array;
  next: Int32Array;
}

export function outletChains(h: Hollows, n: number): OutletChains {
  const first = new Int32Array(n).fill(-1);
  const next = new Int32Array(h.sets.length).fill(-1);
  h.outlet.forEach((o, id) => {
    if (o < 0) return;
    next[id] = first[o];
    first[o] = id;
  });
  return { first, next };
}

/** Each month's runoff of the soil's surplus at the nodes of a climate's grid (field:earth/runoff), as a keyframe keeps it. */
export interface SlowWater {
  /** in steps of `step` mm, month by month: January's at every node of the climate's grid, then February's */
  slow: Uint16Array;
  step: number;
  /** how many nodes the climate's grid has, and the one each node of the routed grid reads */
  nodes: number;
  near: Int32Array;
}

/**
 * The months in which water stands in a river's bed at some nodes of a flow (field:earth/rivers, `wet_share`), as bits,
 * January the lowest. Each month's runoff of the soil's surplus is routed as the year's water is, and out of each hollow
 * in the share of the year's that gets out of it; a node's month is wet where what reaches it then is at least `share` of
 * its mean flow. What the rain sends off as it falls is left out: it runs in floods of a day or two, and between them the
 * bed is dry. So a river fed from wet uplands keeps water across a desert, and a desert's own bed has none. A month's
 * water is routed in the month, with no time to travel down a long river. Where the ground it drains gives it at least
 * `perennialMm` a year, it holds water in every month: the water balance lets a soil's surplus go faster than a wet
 * basin's ground water runs out.
 */
export function wetMonthsAt(g: NodeGrid, r: Routing, f: Flow, h: Hollows, chains: OutletChains, w: SlowWater, share: number, at: ArrayLike<number>, perennialMm = Infinity): Uint16Array {
  const areas = rowAreas(g);
  const out = new Uint16Array(at.length);
  // A basin wet enough runs all year: the mm a year the ground a node drains gives it.
  for (let j = 0; j < at.length; j++) {
    const k = at[j];
    if (k >= 0 && f.q[k] > 0 && (f.q[k] * YEAR) / (f.km2[k] * 1000) >= perennialMm) out[j] = 0xfff;
  }
  // A month's slow water, in steps of the store times m², as a mean flow in m³/s.
  const toFlow = w.step / 1000 / (YEAR / 12);
  const { order, down } = r;
  const { sea, passes } = f;
  const of = h.of;
  const { first, next } = chains;
  const { slow, near, nodes } = w;
  // The twelve months are routed in one pass down the flood's order, each summed just as it would be alone: a node's
  // months lie side by side, kept by its place in the order. A node off the order that water reaches (under the routed
  // sea, where the flow's sea is lower) takes a place after them.
  let place = placesOf(r);
  let places = order.length;
  for (let i = 0; i < order.length; i++) {
    const k = order[i];
    if (sea[k]) continue;
    const d = down[k];
    if (d < 0 || sea[d] || place[d] >= 0) continue;
    if (places === order.length) place = place.slice();
    place[d] = places++;
  }
  const qm = new Float64Array(places * MONTHS);
  const pool = new Float64Array(h.sets.length * MONTHS);
  for (let i = order.length - 1; i >= 0; i--) {
    const k = order[i];
    if (sea[k]) continue;
    const area = areas[(k / g.nx) | 0];
    const s = near[k];
    const at0 = i * MONTHS;
    const held = first[k];
    for (let m = 0; m < MONTHS; m++) {
      let v = qm[at0 + m] + slow[m * nodes + s] * area;
      for (let id = held; id >= 0; id = next[id]) v += pool[id * MONTHS + m] * passes[id];
      qm[at0 + m] = v;
    }
    const d = down[k];
    if (d < 0 || sea[d]) continue;
    const from = of[k];
    if (from >= 0 && of[d] !== from) {
      const to = from * MONTHS;
      for (let m = 0; m < MONTHS; m++) pool[to + m] += qm[at0 + m];
    } else {
      const to = place[d] * MONTHS;
      for (let m = 0; m < MONTHS; m++) qm[to + m] += qm[at0 + m];
    }
  }
  for (let j = 0; j < at.length; j++) {
    const k = at[j];
    if (k < 0 || !(f.q[k] > 0)) continue;
    // A node no water reaches has none in any month.
    const p = place[k];
    for (let m = 0; m < MONTHS; m++) if ((p < 0 ? 0 : qm[p * MONTHS + m]) * toFlow >= share * f.q[k]) out[j] |= 1 << m;
  }
  return out;
}

const MONTHS = 12;

/** Each node's place in a routing's flood order, or -1: made once for each routing (wetMonthsAt). */
const placesKept = new WeakMap<Int32Array, Int32Array>();
function placesOf(r: Routing): Int32Array {
  let place = placesKept.get(r.order);
  if (!place) {
    place = new Int32Array(r.down.length).fill(-1);
    for (let i = 0; i < r.order.length; i++) place[r.order[i]] = i;
    placesKept.set(r.order, place);
  }
  return place;
}

export interface Reach {
  /** its first node, which names it while the network stays the same */
  id: number;
  /** upstream to downstream; the last is where it ends: the next reach's first node, the sea or a lake */
  nodes: number[];
  /** the mean flow at its first and its last node of river, m³/s */
  qFrom: number;
  qTo: number;
  /** the area it drains at its end, km² */
  km2: number;
  /** its Strahler order */
  order: number;
  ends: 'river' | 'sea' | 'lake';
  /** the reach it flows into, if it ends in a river */
  into?: number;
}

/**
 * The rivers of a flow: every node that drains at least `minKm2` and lies under no lake, in reaches from a source,
 * a lake's outlet or a confluence to the next confluence, the sea or a lake.
 */
export function reaches(r: Routing, f: Flow, minKm2: number): Reach[] {
  const n = r.down.length;
  const river = new Uint8Array(n);
  for (const k of r.order) if (f.km2[k] >= minKm2 && f.lake[k] < 0 && !f.sea[k]) river[k] = 1;
  const kids = new Uint8Array(n);
  const strahler = new Uint8Array(n);
  const best = new Uint8Array(n);
  const ties = new Uint8Array(n);
  for (let i = r.order.length - 1; i >= 0; i--) {
    const k = r.order[i];
    if (!river[k]) continue;
    strahler[k] = best[k] ? best[k] + (ties[k] > 1 ? 1 : 0) : 1;
    const d = r.down[k];
    if (d < 0 || !river[d]) continue;
    kids[d]++;
    if (strahler[k] > best[d]) {
      best[d] = strahler[k];
      ties[d] = 1;
    } else if (strahler[k] === best[d]) ties[d]++;
  }
  const out: Reach[] = [];
  for (const k of r.order) {
    if (!river[k] || kids[k] === 1) continue;
    const nodes = [k];
    let x = r.down[k];
    while (x >= 0 && river[x] && kids[x] === 1) {
      nodes.push(x);
      x = r.down[x];
    }
    const last = nodes[nodes.length - 1];
    let ends: Reach['ends'] = 'sea';
    if (x >= 0 && river[x]) ends = 'river';
    else if (x >= 0 && f.lake[x] >= 0) ends = 'lake';
    else if (x >= 0 && !f.sea[x]) ends = 'river';
    if (x >= 0) nodes.push(x);
    out.push({ id: k, nodes, qFrom: f.q[k], qTo: f.q[last], km2: f.km2[last], order: strahler[last], ends, into: ends === 'river' && river[x] ? x : undefined });
  }
  return out;
}
