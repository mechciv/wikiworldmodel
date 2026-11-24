// A town or a city laid out through the whole of its life from what is known of it (docs/plans/CITIES.md): the routes
// that reach it from the places it dealt with, the growth model's ranking of its ground (model:people/settlement-growth,
// core/growth.ts), a wall round it as it stood when its wall was built, the frame those lines make (core/frame.ts), and
// each face of the frame divided once into lanes, blocks and plots (division.ts).
//
// The plan is made in the settlement's own metres about its point, from the settlement and the world's ground alone,
// never from the scene that draws it, so a scene of another century draws the same streets: a time says only which plots
// were built then, by the growth model's cut. A scene then leaves out what its own ground cannot take (a plot in its
// river, on its cliff), which changes what is drawn there and not the plan.
//
// It is the settlement generator's (gen:people/settlement): routes where no record gives one, where a wall ran, every
// lane and plot are invented, and say so. The people, the areas, the town's form and the wall's years are the records'.

import { makeFrame, type Frame, type FrameFace, type FrameLine } from '../../../../core/frame.ts';
import { builtSpans, cutAt, densityAt, epochAt, growSettlement, growthGrid, peopleAt, type Growth, type GrowthGround, type GrowthParams, type GrowthWall, type PeopleSeries } from '../../../../core/growth.ts';
import { hashString, Rng } from '../../city/math.ts';
import { divideFace, type Division, type DivisionGrid, type DivisionSizes } from './division.ts';

export interface TownParams {
  /** how many routes reach a settlement of 1,000 people, and one of 1,000,000 */
  routes: [number, number];
  /** what a step across water costs a route against one across level ground: a bridge, a ford or a ferry */
  ford: number;
  /** a wall is laid round the town as it stood when it first had this share of the most people it had while the wall stood */
  wall_at: number;
  /** the ground left between a wall and the town it was laid round, m */
  wall_margin: number;
  /** two routes that would leave a town closer than this, radians, are one */
  apart: number;
}

export const TOWN_DEFAULTS: TownParams = { routes: [3, 9], ford: 12, wall_at: 0.6, wall_margin: 12, apart: 0.5 };

export interface TownInput {
  /** a stable name for the settlement: its record's id, or its list's row; every seed in it comes from this */
  key: string;
  /** when it stood, years */
  span: [number, number];
  /** the people through time, member 0 the central reading (core/citypop.ts) */
  members: PeopleSeries[];
  /** areas its record gives, ha, at their times */
  areas?: { t: number; ha: number }[];
  /** the directions its routes lead in, radians from east, the most important first: towards the places it dealt with */
  toward: number[];
  /** the ground in the settlement's own metres about its point */
  ground: GrowthGround;
  /** how its streets were laid out, and the direction of a planned grid, radians from east, where a record gives one */
  streets: 'grid' | 'lanes' | 'canals';
  angle?: number;
  sizes: DivisionSizes;
  /** how wide a main street is, m */
  main: number;
  /** its wall: the years it stood, and how thick it was, m */
  wall?: { from: number; to: number; thickness: number };
  /** people to a household: a plot is as big as a household's share of the ground at the town's height */
  household?: number;
  /**
   * Its recorded walls and roads, in its own metres: they take the place of a generated wall, the walls' years making
   * the growth model's epochs, and the roads stand in its frame and are routes beside the generated ones
   */
  recorded?: { walls?: { ring: number[]; from: number; to: number }[]; roads?: number[][] };
  /** its districts' label points, in its own metres, and how many buildings a record counts in each */
  districts?: { at: [number, number]; buildings: number }[];
  params?: Partial<TownParams>;
  growth?: Partial<GrowthParams>;
}

export interface TownRoute {
  id: string;
  /** from the settlement's core outwards, x, y pairs in its own metres */
  line: number[];
}

export interface TownWall {
  ring: number[];
  from: number;
  to: number;
  /** where routes go through it, and the way they go */
  gates: { x: number; y: number; dx: number; dy: number }[];
}

export interface TownPlan {
  key: string;
  growth: Growth;
  routes: TownRoute[];
  wall?: TownWall;
  frame: Frame;
  /** for each cell of the growth model's grid, the face it lies in, or -1 */
  faceOf: Int32Array;
  /** faces divided so far, by index into frame.faces */
  divided: Map<number, Division>;
  grid?: DivisionGrid;
  sizes: DivisionSizes;
  main: number;
  /** how much ground a plot takes where it lies, m²: a household's share of the ground at the town's height, there */
  plot: (x: number, y: number) => number;
}

export interface TownPlot {
  id: string;
  ring: number[];
  x: number;
  y: number;
  /** the direction its front faces, radians from east */
  facing: number;
  /** the length of its front, and how deep it is from it, m */
  front: number;
  depth: number;
  area: number;
  /** people to the hectare where it stands, at the time asked */
  density: number;
}

export interface TownLane {
  id: string;
  line: number[];
  width: number;
}

const merge = (p?: Partial<TownParams>): TownParams => ({ ...TOWN_DEFAULTS, ...p });

/** The most people a settlement had in any member. */
const mostPeople = (members: PeopleSeries[]) => Math.max(1, ...members.flatMap((m) => m.people));

/**
 * Routes from the core out to the edge of the ground the plan covers, by the cheapest way across it: along level ground,
 * round steep ground, across water only where it must. They are traced most important first, and each ends where it
 * meets one already traced, so they make a tree of roads that join, as roads near a town do.
 */
function routesOf(input: TownInput, reach: number, p: TownParams): TownRoute[] {
  const cell = Math.max(20, Math.round(reach / 160));
  const n = Math.max(16, Math.ceil((reach * 2) / cell));
  const x0 = -(n * cell) / 2;
  const at = (i: number, j: number): [number, number] => [x0 + (i + 0.5) * cell, x0 + (j + 0.5) * cell];
  const N = n * n;
  const h = new Float64Array(N);
  const wet = new Uint8Array(N);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const [x, y] = at(i, j);
      h[j * n + i] = input.ground.height(x, y);
      wet[j * n + i] = input.ground.above(x, y) < 0 ? 1 : 0;
    }
  const step = (c: number) => {
    const i = c % n;
    const j = Math.floor(c / n);
    const hx = (h[j * n + Math.min(n - 1, i + 1)] - h[j * n + Math.max(0, i - 1)]) / (2 * cell);
    const hy = (h[Math.min(n - 1, j + 1) * n + i] - h[Math.max(0, j - 1) * n + i]) / (2 * cell);
    const s = Math.hypot(hx, hy) / 0.08;
    return (1 + s * s) * (wet[c] ? p.ford : 1);
  };
  const cost = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const core = Math.floor(n / 2) * n + Math.floor(n / 2);
  cost[core] = 0;
  // A simple heap of [cost, cell].
  const heap: number[] = [0, core];
  const push = (k: number, c: number) => {
    heap.push(k, c);
    let i = heap.length / 2 - 1;
    while (i > 0) {
      const q = (i - 1) >> 1;
      if (heap[q * 2] < heap[i * 2] || (heap[q * 2] === heap[i * 2] && heap[q * 2 + 1] <= heap[i * 2 + 1])) break;
      [heap[q * 2], heap[i * 2]] = [heap[i * 2], heap[q * 2]];
      [heap[q * 2 + 1], heap[i * 2 + 1]] = [heap[i * 2 + 1], heap[q * 2 + 1]];
      i = q;
    }
  };
  const pop = (): [number, number] => {
    const top: [number, number] = [heap[0], heap[1]];
    const lk = heap[heap.length - 2];
    const lc = heap[heap.length - 1];
    heap.length -= 2;
    if (heap.length) {
      heap[0] = lk;
      heap[1] = lc;
      let i = 0;
      const m = heap.length / 2;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let s = i;
        const less = (a: number, b: number) => heap[a * 2] < heap[b * 2] || (heap[a * 2] === heap[b * 2] && heap[a * 2 + 1] < heap[b * 2 + 1]);
        if (l < m && less(l, s)) s = l;
        if (r < m && less(r, s)) s = r;
        if (s === i) break;
        [heap[s * 2], heap[i * 2]] = [heap[i * 2], heap[s * 2]];
        [heap[s * 2 + 1], heap[i * 2 + 1]] = [heap[i * 2 + 1], heap[s * 2 + 1]];
        i = s;
      }
    }
    return top;
  };
  while (heap.length) {
    const [k, c] = pop();
    if (k > cost[c]) continue;
    const i = c % n;
    const j = Math.floor(c / n);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const nc = jj * n + ii;
        const nk = k + ((step(c) + step(nc)) / 2) * cell * (di && dj ? Math.SQRT2 : 1);
        if (nk < cost[nc]) {
          cost[nc] = nk;
          prev[nc] = c;
          push(nk, nc);
        }
      }
  }
  // The directions: the places it dealt with first, then evenly round the rest, from a turn of the settlement's own.
  const most = mostPeople(input.members);
  const count = Math.round(p.routes[0] + (p.routes[1] - p.routes[0]) * Math.min(1, Math.max(0, Math.log10(most / 1000) / 3)));
  const bearings: number[] = [];
  const near = (a: number, b: number) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < p.apart;
  for (const b of input.toward) if (bearings.length < count && !bearings.some((x) => near(x, b))) bearings.push(b);
  const turn = new Rng(hashString(`${input.key}/routes`)).next() * 2 * Math.PI;
  for (let k = 0; bearings.length < count && k < count * 4; k++) {
    const b = turn + (k * 2 * Math.PI * 0.618034) % (2 * Math.PI);
    if (!bearings.some((x) => near(x, b))) bearings.push(b);
  }
  const on = new Int32Array(N).fill(-1);
  const routes: TownRoute[] = [];
  bearings.forEach((b, r) => {
    // The edge of the ground in this direction, pulled in to a cell that can be reached.
    let target = -1;
    for (let f = 0.97; f > 0.3 && target < 0; f -= 0.03) {
      const i = Math.floor(n / 2 + (Math.cos(b) * f * n) / 2);
      const j = Math.floor(n / 2 + (Math.sin(b) * f * n) / 2);
      const c = j * n + i;
      if (i >= 0 && j >= 0 && i < n && j < n && cost[c] < Infinity) target = c;
    }
    if (target < 0) return;
    const cells: number[] = [];
    let c = target;
    let joined = -1;
    while (c >= 0) {
      if (on[c] >= 0 && c !== core) {
        joined = c;
        break;
      }
      cells.push(c);
      if (c === core) break;
      c = prev[c];
    }
    if (joined >= 0) cells.push(joined);
    for (const k of cells) if (on[k] < 0) on[k] = r;
    // From the core (or the route it joins) outwards, the cells' centres, thinned to their turns.
    const pts: number[] = [];
    for (let k = cells.length - 1; k >= 0; k--) pts.push(...at(cells[k] % n, Math.floor(cells[k] / n)));
    if (cells[cells.length - 1] === core) {
      pts[0] = 0;
      pts[1] = 0;
    }
    const line = simplify(pts, cell * 0.8);
    if (line.length >= 4) routes.push({ id: `${input.key}/route:${r}`, line });
  });
  return routes;
}

/** A polyline thinned by Douglas and Peucker's method to within `tol` metres of itself. */
function simplify(pts: number[], tol: number): number[] {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = pts[a * 2];
    const ay = pts[a * 2 + 1];
    const dx = pts[b * 2] - ax;
    const dy = pts[b * 2 + 1] - ay;
    const len = Math.hypot(dx, dy) || 1;
    let best = -1;
    let far = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i * 2] - ax) * dy - (pts[i * 2 + 1] - ay) * dx) / len;
      if (d > far) {
        far = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

/** The ground a growth model's cells built at a time take, as a ring round its core: farthest built in each direction. */
function ringRound(g: Growth, t: number, margin: number, grid?: DivisionGrid): number[] | undefined {
  const e = epochAt(g, t);
  if (!e) return undefined;
  const n = Math.floor(cutAt(g, t, 0));
  if (n < 4) return undefined;
  const { x0, y0, cell, nx, ny } = g.grid;
  // The town's body: what was built then, less the ribbons along its roads, which a wall left outside. An opening (an
  // erosion and a dilation by the same number of cells) takes off whatever is narrower than some 120 m.
  let mask = new Uint8Array(nx * ny);
  for (let k = 0; k < n && k < e.order.length; k++) mask[e.order[k]] = 1;
  const steps = Math.max(1, Math.round(60 / cell));
  const grow = (m: Uint8Array, keep: 0 | 1) => {
    const out = new Uint8Array(m.length);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        let v = keep;
        for (let dj = -1; dj <= 1 && v === keep; dj++)
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            const w = ii < 0 || jj < 0 || ii >= nx || jj >= ny ? 0 : m[jj * nx + ii];
            if (w !== keep) {
              v = w as 0 | 1;
              break;
            }
          }
        out[j * nx + i] = v;
      }
    return out;
  };
  const before = mask;
  for (let s = 0; s < steps; s++) mask = grow(mask, 1);
  for (let s = 0; s < steps; s++) mask = grow(mask, 0);
  // A town so small or so strung out that nothing is left of it keeps all it built.
  if (!mask.some((v) => v)) mask = before;
  const B = 72;
  const far = new Float64Array(B);
  let ulo = Infinity;
  let uhi = -Infinity;
  let vlo = Infinity;
  let vhi = -Infinity;
  for (let c = 0; c < mask.length; c++) {
    if (!mask[c]) continue;
    const x = x0 + ((c % nx) + 0.5) * cell;
    const y = y0 + (Math.floor(c / nx) + 0.5) * cell;
    const a = Math.atan2(y, x);
    const b = Math.floor(((a + Math.PI) / (2 * Math.PI)) * B) % B;
    far[b] = Math.max(far[b], Math.hypot(x, y) + cell * 0.71);
    if (grid) {
      const u = x * Math.cos(grid.angle) + y * Math.sin(grid.angle);
      const v = -x * Math.sin(grid.angle) + y * Math.cos(grid.angle);
      ulo = Math.min(ulo, u - cell / 2);
      uhi = Math.max(uhi, u + cell / 2);
      vlo = Math.min(vlo, v - cell / 2);
      vhi = Math.max(vhi, v + cell / 2);
    }
  }
  if (grid) {
    // A planned town's wall is square to its grid.
    const ca = Math.cos(grid.angle);
    const sa = Math.sin(grid.angle);
    const pt = (u: number, v: number) => [u * ca - v * sa, u * sa + v * ca];
    return [...pt(ulo - margin, vlo - margin), ...pt(uhi + margin, vlo - margin), ...pt(uhi + margin, vhi + margin), ...pt(ulo - margin, vhi + margin)];
  }
  // Each direction takes the farthest of itself and its neighbours, then is smoothed, so the wall bulges round the town.
  const wide = Array.from(far, (_, b) => Math.max(far[b], far[(b + 1) % B], far[(b + B - 1) % B]));
  const ring: number[] = [];
  for (let b = 0; b < B; b++) {
    const r = (wide[(b + B - 1) % B] + 2 * wide[b] + wide[(b + 1) % B]) / 4 + margin;
    const a = -Math.PI + ((b + 0.5) * 2 * Math.PI) / B;
    ring.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return ring;
}

/** Where a polyline crosses a ring: the point and the way the line goes. */
function crossings(line: number[], ring: number[]): { x: number; y: number; dx: number; dy: number }[] {
  const out: { x: number; y: number; dx: number; dy: number }[] = [];
  const m = ring.length / 2;
  for (let i = 0; i + 3 < line.length; i += 2) {
    const ax = line[i];
    const ay = line[i + 1];
    const bx = line[i + 2];
    const by = line[i + 3];
    for (let k = 0; k < m; k++) {
      const l = (k + 1) % m;
      const cx = ring[k * 2];
      const cy = ring[k * 2 + 1];
      const ex = ring[l * 2];
      const ey = ring[l * 2 + 1];
      const den = (bx - ax) * (ey - cy) - (by - ay) * (ex - cx);
      if (den === 0) continue;
      const u = ((cx - ax) * (ey - cy) - (cy - ay) * (ex - cx)) / den;
      const v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      const len = Math.hypot(bx - ax, by - ay) || 1;
      out.push({ x: ax + u * (bx - ax), y: ay + u * (by - ay), dx: (bx - ax) / len, dy: (by - ay) / len });
    }
  }
  return out;
}

/** Fill a ring's cells of a grid with a value, by the cells' centres. */
function fillRing(ring: number[], g: Growth['grid'], into: Int32Array, value: number): void {
  const m = ring.length / 2;
  let ylo = Infinity;
  let yhi = -Infinity;
  for (let i = 0; i < m; i++) {
    ylo = Math.min(ylo, ring[i * 2 + 1]);
    yhi = Math.max(yhi, ring[i * 2 + 1]);
  }
  const j0 = Math.max(0, Math.floor((ylo - g.y0) / g.cell));
  const j1 = Math.min(g.ny - 1, Math.floor((yhi - g.y0) / g.cell));
  const xs: number[] = [];
  for (let j = j0; j <= j1; j++) {
    const y = g.y0 + (j + 0.5) * g.cell;
    xs.length = 0;
    for (let i = 0, k = m - 1; i < m; k = i++) {
      const yi = ring[i * 2 + 1];
      const yk = ring[k * 2 + 1];
      if (yi > y !== yk > y) xs.push(ring[i * 2] + ((y - yi) * (ring[k * 2] - ring[i * 2])) / (yk - yi));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - g.x0) / g.cell - 0.5));
      const i1 = Math.min(g.nx - 1, Math.floor((xs[q + 1] - g.x0) / g.cell - 0.5));
      for (let i = i0; i <= i1; i++) into[j * g.nx + i] = value;
    }
  }
}

/** The plan of a town through its whole life: routes, growth, wall and frame. Faces are divided when they are wanted. */
export function planTown(input: TownInput): TownPlan {
  const p = merge(input.params);
  const areas = input.areas;
  // The ground the model works on, which the routes are laid across first.
  const bare = growthGrid({ people: input.members, ...(areas ? { areas } : {}), ...(input.growth ? { params: input.growth } : {}) });
  const reach = (bare.grid.nx * bare.grid.cell) / 2;
  const cell0 = bare.grid.cell;
  const routes = routesOf(input, reach, p);
  const planned = input.streets !== 'lanes';
  const angle = input.angle ?? new Rng(hashString(`${input.key}/grid`)).next() * Math.PI;
  const grid: DivisionGrid | undefined = planned ? { angle, ox: 0, oy: 0, block: [input.sizes.block, input.sizes.block * 0.75], street: input.sizes.lane } : undefined;
  let wall: TownWall | undefined;
  const walls: GrowthWall[] = [];
  // Its recorded walls, where a map of the city gives them, stand in its frame and make its epochs; a generated wall
  // stands only where none is recorded.
  const recordedWalls = (input.recorded?.walls ?? []).filter((w) => w.ring.length >= 6 && Math.min(w.to, input.span[1]) > Math.max(w.from, input.span[0]));
  for (const w of recordedWalls) walls.push({ ring: w.ring, from: Math.max(w.from, input.span[0]), to: Math.min(w.to, input.span[1]) });
  const roads = (input.recorded?.roads ?? []).filter((l) => l.length >= 4);
  if (input.wall && !recordedWalls.length) {
    const from = Math.max(input.wall.from, input.span[0]);
    const to = Math.min(input.wall.to, input.span[1]);
    if (to > from) {
      // When it first had the given share of the most people it had while the wall stood.
      const m0 = input.members[0];
      let peak = 0;
      for (let k = 0; k <= 64; k++) peak = Math.max(peak, peopleAt(m0, from + ((to - from) * k) / 64));
      let when = from;
      for (let k = 0; k <= 64; k++) {
        const t = from + ((to - from) * k) / 64;
        if (peopleAt(m0, t) >= p.wall_at * peak) {
          when = t;
          break;
        }
      }
      const withRoutes = growSettlement({ cores: [{ x: 0, y: 0 }], routes: routes.map((r) => r.line), walls: [], ground: input.ground, people: input.members, span: input.span, ...(areas ? { areas } : {}), ...(input.growth ? { params: input.growth } : {}), cell: cell0 });
      const ring = ringRound(withRoutes, when, p.wall_margin + input.wall.thickness / 2 + input.sizes.lane, input.streets === 'grid' ? grid : undefined);
      if (ring) {
        const gates = routes.flatMap((r) => crossings(r.line, ring));
        wall = { ring, from, to, gates };
        walls.push({ ring, from, to });
      }
    }
  }
  const growth = growSettlement({ cores: [{ x: 0, y: 0 }], routes: [...routes.map((r) => r.line), ...roads], walls, ground: input.ground, people: input.members, span: input.span, ...(areas ? { areas } : {}), ...(input.growth ? { params: input.growth } : {}), cell: cell0 });
  // The frame: the routes, the walls and roads a map gives, the wall laid round it, and the edge of the ground it covers.
  const { x0, y0, cell, nx, ny } = growth.grid;
  const lines: FrameLine[] = [
    { id: `${input.key}/edge`, kind: 'edge', points: [x0, y0, x0 + nx * cell, y0, x0 + nx * cell, y0 + ny * cell, x0, y0 + ny * cell], closed: true },
    ...routes.map((r): FrameLine => ({ id: r.id, kind: 'route', points: r.line })),
    ...(wall ? [{ id: `${input.key}/wall`, kind: 'wall' as const, points: wall.ring, closed: true }] : []),
    ...recordedWalls.map((w, k): FrameLine => ({ id: `${input.key}/wall:${k}`, kind: 'wall', points: w.ring, closed: true })),
    ...roads.map((l, k): FrameLine => ({ id: `${input.key}/road:${k}`, kind: 'street', points: l })),
  ];
  const frame = makeFrame(lines);
  // Each cell's face: the largest filled first, so a face that lies in another's hole takes its own cells.
  const faceOf = new Int32Array(nx * ny).fill(-1);
  const bySize = frame.faces.map((_, i) => i).sort((a, b) => frame.faces[b].area - frame.faces[a].area || a - b);
  for (const i of bySize) fillRing(frame.faces[i].outer, growth.grid, faceOf, i);
  // A plot is a household's share of the ground where it lies, when the town had the most people it ever had: the land
  // is divided once, and a plot of the crowded core is small, one of the edge large, with its garden. Ground the town
  // never reached is divided as its last-built ground was.
  const m0 = input.members[0];
  let peak = m0.t[0] ?? input.span[0];
  for (let i = 0; i < m0.t.length; i++) if (m0.people[i] > peopleAt(m0, peak)) peak = m0.t[i];
  const household = input.household ?? 6;
  const n = Math.floor(cutAt(growth, peak, 0));
  const e = epochAt(growth, peak);
  const edge = e && n > 0 ? densityAt(growth, ...cellCentre(growth, e.order[Math.min(n, e.order.length) - 1]), peak, 0) : growth.params.density.least;
  // Its districts, where a record counts their buildings: each cell built at the city's height goes to the nearest
  // district's label, and a district's plots are as much smaller as it was denser than the city on the whole, by its
  // count over the ground it covered then, within three times either way.
  const districts = (input.districts ?? []).filter((d) => d.buildings > 0);
  let denser: ((x: number, y: number) => number) | undefined;
  if (districts.length >= 2 && e && n > 0) {
    const nearest = (x: number, y: number) => {
      let best = 0;
      let bd = Infinity;
      districts.forEach((d, i) => {
        const q = (x - d.at[0]) ** 2 + (y - d.at[1]) ** 2;
        if (q < bd) {
          bd = q;
          best = i;
        }
      });
      return best;
    };
    const cells = new Array<number>(districts.length).fill(0);
    for (let k = 0; k < Math.min(n, e.order.length); k++) cells[nearest(...cellCentre(growth, e.order[k]))]++;
    let buildings = 0;
    let ground = 0;
    districts.forEach((d, i) => {
      if (!cells[i]) return;
      buildings += d.buildings;
      ground += cells[i];
    });
    const mean = buildings / Math.max(1, ground);
    const factor = districts.map((d, i) => (cells[i] && mean > 0 ? Math.min(3, Math.max(1 / 3, d.buildings / cells[i] / mean)) : 1));
    denser = (x, y) => factor[nearest(x, y)];
  }
  const plot = (x: number, y: number) => {
    const d = densityAt(growth, x, y, peak, 0) || edge;
    // Of the ground, a quarter goes to lanes and to what is no household's.
    return ((household / Math.max(1, d)) * 1e4 * 0.75) / (denser?.(x, y) ?? 1);
  };
  return { key: input.key, growth, routes, ...(wall ? { wall } : {}), frame, faceOf, divided: new Map(), ...(grid ? { grid } : {}), sizes: input.sizes, main: input.main, plot };
}

/** The centre of a cell of a growth model's grid. */
function cellCentre(g: Growth, c: number): [number, number] {
  return [g.grid.x0 + ((c % g.grid.nx) + 0.5) * g.grid.cell, g.grid.y0 + (Math.floor(c / g.grid.nx) + 0.5) * g.grid.cell];
}

/** Which sides of a face people reach it across: routes, streets and the plan's own edge, not a wall. */
const openSides = (f: FrameFace) => f.plainSides.map((s) => s.split('+').some((id) => !/\/wall(:\d+)?$/.test(id)));

/**
 * What stood at a time, for a member of the people: the plots built then, and the lanes they were reached by. Faces with
 * nothing built are not divided, and those that are, are kept for the next time asked.
 */
export function townAt(plan: TownPlan, t: number, member = 0, opts: { gradient?: (x: number, y: number) => [number, number]; within?: (x: number, y: number) => boolean } = {}): { plots: TownPlot[]; lanes: TownLane[] } {
  const g = plan.growth;
  const { x0, y0, cell, nx, ny } = g.grid;
  const e = epochAt(g, t);
  const n = Math.min(e?.order.length ?? 0, Math.floor(cutAt(g, t, member)));
  // What is built, as a table of sums for asking about boxes.
  const sat = new Int32Array((nx + 1) * (ny + 1));
  const faces = new Set<number>();
  if (e) {
    const built = new Uint8Array(nx * ny);
    for (let k = 0; k < n; k++) {
      const c = e.order[k];
      const x = x0 + ((c % nx) + 0.5) * cell;
      const y = y0 + (Math.floor(c / nx) + 0.5) * cell;
      if (opts.within && !opts.within(x, y)) continue;
      built[c] = 1;
      if (plan.faceOf[c] >= 0) faces.add(plan.faceOf[c]);
    }
    for (let j = 0; j < ny; j++) {
      let row = 0;
      for (let i = 0; i < nx; i++) {
        row += built[j * nx + i];
        sat[(j + 1) * (nx + 1) + i + 1] = sat[j * (nx + 1) + i + 1] + row;
      }
    }
  }
  const any = (ax: number, ay: number, bx: number, by: number) => {
    const i0 = Math.max(0, Math.floor((ax - x0) / cell));
    const j0 = Math.max(0, Math.floor((ay - y0) / cell));
    const i1 = Math.min(nx - 1, Math.floor((bx - x0) / cell));
    const j1 = Math.min(ny - 1, Math.floor((by - y0) / cell));
    if (i1 < i0 || j1 < j0) return false;
    const s = sat[(j1 + 1) * (nx + 1) + i1 + 1] - sat[j0 * (nx + 1) + i1 + 1] - sat[(j1 + 1) * (nx + 1) + i0] + sat[j0 * (nx + 1) + i0];
    return s > 0;
  };
  const plots: TownPlot[] = [];
  const lanes: TownLane[] = [];
  for (const fi of [...faces].sort((a, b) => a - b)) {
    const f = plan.frame.faces[fi];
    // A face is divided as a whole as far as anything is wanted in it; a later time divides more of it, the same way.
    const d = divideFace({
      ring: f.plain,
      open: openSides(f),
      seed: f.id,
      sizes: plan.sizes,
      plot: plan.plot,
      ...(plan.grid ? { grid: plan.grid } : {}),
      ...(opts.gradient ? { gradient: opts.gradient } : {}),
      need: any,
    });
    plan.divided.set(fi, d);
    // A lane is drawn along the stretches of it that run by built ground: a grid's street does not run on across fields.
    for (const l of d.lanes) {
      const [ax, ay, bx, by] = l.line;
      if (!any(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by))) continue;
      const len = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(1, Math.ceil(len / (cell / 2)));
      let from = -1;
      let piece = 0;
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const x = ax + (bx - ax) * u;
        const y = ay + (by - ay) * u;
        // Built within a cell of the lane, on either side.
        const on = s < steps && any(x - cell, y - cell, x + cell, y + cell);
        if (on && from < 0) from = s;
        if (!on && from >= 0) {
          const u0 = Math.max(0, (from - 0.5) / steps);
          const u1 = Math.min(1, (s - 0.5) / steps);
          if (u1 > u0) lanes.push({ id: `${l.id}#${piece++}`, line: [ax + (bx - ax) * u0, ay + (by - ay) * u0, ax + (bx - ax) * u1, ay + (by - ay) * u1], width: l.width });
          from = -1;
        }
      }
    }
    for (const q of d.plots) {
      const c = Math.floor((q.y - y0) / cell) * nx + Math.floor((q.x - x0) / cell);
      if (!e || c < 0 || c >= nx * ny || e.rank[c] < 0 || e.rank[c] >= n) continue;
      if (opts.within && !opts.within(q.x, q.y)) continue;
      const [fx0, fy0, fx1, fy1] = q.front;
      const front = Math.hypot(fx1 - fx0, fy1 - fy0);
      plots.push({ id: q.id, ring: q.ring, x: q.x, y: q.y, facing: q.facing, front, depth: q.area / Math.max(1, front), area: q.area, density: densityAt(g, q.x, q.y, t, member) });
    }
  }
  return { plots, lanes };
}

/** When a plot of the plan was built on, for a member: from the growth model's cut at its place. */
export const plotSpans = (plan: TownPlan, x: number, y: number, member = 0) => builtSpans(plan.growth, x, y, member);
