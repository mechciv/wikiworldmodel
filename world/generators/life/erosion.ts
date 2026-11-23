// Landforms made by the process that makes them (docs/SCENES.md, "Processes, where shape matters"): water run down a
// grid of heights, cutting where it gathers. The ground is flooded from its outlets upward, so that every node drains
// to the one it was reached from and every hollow over its lowest pass (priority-flood, as the build's drainage does it
// over the world's grids); each node then cuts toward the node it drains to by the stream-power law, the faster the
// more ground drains through it, and slopes creep toward their neighbours. What comes of it is valleys that lead to
// what drains them, gathering as rivers do, with ridges left between. Nothing here is a claim about any valley.

/** How the ground is cut: the generator's choices (gen:life/scene, `ground.erosion`). */
export interface ErosionChoices {
  /** how many times the ground is routed and cut */
  steps: number;
  /** how far a node with one cell draining through it cuts toward the node it drains to in a step, as a share: more, the more drains through it */
  power: number;
  /** the exponent of the drained area in that */
  area_exp: number;
  /** how far a slope creeps toward the mean of its neighbours in a step, as a share */
  creep: number;
}

/** A heap of nodes by level, the lowest first. */
class Heap {
  private level: Float32Array;
  private node: Int32Array;
  size = 0;
  top = 0;
  constructor(capacity: number) {
    this.level = new Float32Array(capacity);
    this.node = new Int32Array(capacity);
  }
  push(level: number, node: number): void {
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.level[p] <= level) break;
      this.level[i] = this.level[p];
      this.node[i] = this.node[p];
      i = p;
    }
    this.level[i] = level;
    this.node[i] = node;
  }
  pop(): number {
    const out = this.node[0];
    this.top = this.level[0];
    const level = this.level[--this.size];
    const node = this.node[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.level[c + 1] < this.level[c]) c++;
      if (this.level[c] >= level) break;
      this.level[i] = this.level[c];
      this.node[i] = this.node[c];
      i = c;
    }
    this.level[i] = level;
    this.node[i] = node;
    return out;
  }
}

/** A grid routed: its nodes in the order the flood reached them, the node each drains to (-1 for an outlet), and the level its water rests at. */
export interface Routed {
  order: Int32Array;
  down: Int32Array;
  level: Float32Array;
}

/** The least a node stands over the one it drains to, in metres a cell: what carries water across a flat and out of a hollow. */
const TILT = 0.002;

/**
 * Route a grid of heights to its outlets: its edge, and every node marked `fixed` (the sea, a river or a lake the world
 * gives, whose heights are not the ground's to cut). Nodes are joined to their eight neighbours.
 */
export function routeGrid(z: Float32Array, nx: number, ny: number, fixed?: Uint8Array, into?: Routed): Routed {
  const n = nx * ny;
  const r = into ?? { order: new Int32Array(n), down: new Int32Array(n), level: new Float32Array(n) };
  const { order, down, level } = r;
  const seen = new Uint8Array(n);
  const heap = new Heap(n);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1 || (fixed && fixed[k])) {
        seen[k] = 1;
        down[k] = -1;
        level[k] = z[k];
        heap.push(z[k], k);
      }
    }
  }
  let count = 0;
  while (heap.size) {
    const k = heap.pop();
    const at = heap.top;
    order[count++] = k;
    const i = k % nx;
    const j = (k - i) / nx;
    for (let dj = -1; dj <= 1; dj++) {
      const jj = j + dj;
      if (jj < 0 || jj >= ny) continue;
      for (let di = -1; di <= 1; di++) {
        const ii = i + di;
        if ((!di && !dj) || ii < 0 || ii >= nx) continue;
        const q = jj * nx + ii;
        if (seen[q]) continue;
        seen[q] = 1;
        down[q] = k;
        const least = at + (di && dj ? TILT * 1.4142 : TILT);
        level[q] = z[q] > least ? z[q] : least;
        heap.push(level[q], q);
      }
    }
  }
  return r;
}

/** How many cells drain through each node of a routed grid, itself among them. */
export function drainedCells(r: Routed, n: number, into?: Float32Array): Float32Array {
  const a = into ?? new Float32Array(n);
  a.fill(1);
  for (let i = n - 1; i >= 0; i--) {
    const k = r.order[i];
    const d = r.down[k];
    if (d >= 0) a[d] += a[k];
  }
  return a;
}

/**
 * A grid of heights cut by the water that runs over it, in place: routed and cut `steps` times. At each step a node
 * comes to rest between the level its water stood at and the height of the node it drains to, nearer that the more
 * cells drain through it (the stream-power law with its slope's exponent one, solved from the outlets upward so that
 * any step is stable); then every slope creeps toward the mean of its four neighbours. `fixed` nodes and the grid's edge
 * are outlets and keep their heights. Returns the last routing and how many cells drain through each node by it.
 */
export function erode(z: Float32Array, nx: number, ny: number, c: ErosionChoices, fixed?: Uint8Array): { routed: Routed; cells: Float32Array } {
  const n = nx * ny;
  const routed: Routed = { order: new Int32Array(n), down: new Int32Array(n), level: new Float32Array(n) };
  const cells = new Float32Array(n);
  const next = new Float32Array(n);
  for (let s = 0; s < c.steps; s++) {
    routeGrid(z, nx, ny, fixed, routed);
    drainedCells(routed, n, cells);
    const { order, down, level } = routed;
    for (let i = 0; i < n; i++) {
      const k = order[i];
      const d = down[k];
      if (d < 0) continue;
      // A step to a corner is longer, and cuts the less for it.
      const far = d % nx !== k % nx && ((d / nx) | 0) !== ((k / nx) | 0);
      const f = (c.power * Math.pow(cells[k], c.area_exp)) / (far ? 1.4142 : 1);
      z[k] = (level[k] + f * z[d]) / (1 + f);
    }
    if (c.creep > 0) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const k = j * nx + i;
          next[k] = down[k] < 0 ? z[k] : z[k] + c.creep * ((z[k - 1] + z[k + 1] + z[k - nx] + z[k + nx]) / 4 - z[k]);
        }
      }
      for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) z[j * nx + i] = next[j * nx + i];
    }
  }
  routeGrid(z, nx, ny, fixed, routed);
  drainedCells(routed, n, cells);
  return { routed, cells };
}

/** The mean of a grid over a square of `radius` nodes either way about each node, clipped at its edge: by running sums. */
export function boxMean(a: Float32Array, nx: number, ny: number, radius: number): Float32Array {
  const r = Math.max(0, Math.round(radius));
  const out = new Float32Array(a.length);
  if (!r) {
    out.set(a);
    return out;
  }
  const rows = new Float32Array(a.length);
  const sum = new Float64Array(Math.max(nx, ny) + 1);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) sum[i + 1] = sum[i] + a[j * nx + i];
    for (let i = 0; i < nx; i++) {
      const lo = i - r < 0 ? 0 : i - r;
      const hi = i + r >= nx ? nx - 1 : i + r;
      rows[j * nx + i] = (sum[hi + 1] - sum[lo]) / (hi - lo + 1);
    }
  }
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) sum[j + 1] = sum[j] + rows[j * nx + i];
    for (let j = 0; j < ny; j++) {
      const lo = j - r < 0 ? 0 : j - r;
      const hi = j + r >= ny ? ny - 1 : j + r;
      out[j * nx + i] = (sum[hi + 1] - sum[lo]) / (hi - lo + 1);
    }
  }
  return out;
}

/** A grid read at a point between its nodes by a cubic through the four nodes either way (Catmull–Rom), clamped at its edge. */
export function cubicAt(a: Float32Array, nx: number, ny: number, fx: number, fy: number): number {
  const x = fx < 0 ? 0 : fx > nx - 1 ? nx - 1 : fx;
  const y = fy < 0 ? 0 : fy > ny - 1 ? ny - 1 : fy;
  const i = Math.min(nx - 2, Math.floor(x));
  const j = Math.min(ny - 2, Math.floor(y));
  const u = x - i;
  const v = y - j;
  const u2 = u * u;
  const u3 = u2 * u;
  const wx0 = -0.5 * u3 + u2 - 0.5 * u;
  const wx1 = 1.5 * u3 - 2.5 * u2 + 1;
  const wx2 = -1.5 * u3 + 2 * u2 + 0.5 * u;
  const wx3 = 0.5 * u3 - 0.5 * u2;
  const v2 = v * v;
  const v3 = v2 * v;
  const wy0 = -0.5 * v3 + v2 - 0.5 * v;
  const wy1 = 1.5 * v3 - 2.5 * v2 + 1;
  const wy2 = -1.5 * v3 + 2 * v2 + 0.5 * v;
  const wy3 = 0.5 * v3 - 0.5 * v2;
  const i0 = i > 0 ? i - 1 : 0;
  const i3 = i + 2 < nx ? i + 2 : nx - 1;
  const row = (jj: number) => {
    const k = jj * nx;
    return a[k + i0] * wx0 + a[k + i] * wx1 + a[k + i + 1] * wx2 + a[k + i3] * wx3;
  };
  return row(j > 0 ? j - 1 : 0) * wy0 + row(j) * wy1 + row(j + 1) * wy2 + row(j + 2 < ny ? j + 2 : ny - 1) * wy3;
}
