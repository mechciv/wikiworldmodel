// A meandering river, made by the process that makes one (docs/SCENES.md, "Processes, where shape matters"): a channel
// that migrates. Its centreline starts all but straight; each step, every point moves sideways at a rate set by the
// curvature of the channel at it and upstream of it, so bends grow, lean down the valley and tighten; where a loop's
// neck closes the river cuts through, and the loop is left as an oxbow. The rule is the kinematic model of Howard &
// Knutson (1984), as Sylvester's meanderpy sets it out: a nominal rate in proportion to the curvature, and the rate
// itself the sum of that, weighted Ω, and of its mean upstream, weighted Γ and falling off as e^(−αs), α = 2Cf/D.
// It differs from meanderpy in three things: the mean reaches all the way upstream; the rate is not slowed as the
// river grows longer; and a loop may be cut before its neck has quite closed (`neck`), as a flood cuts a chute.
//
// What it leaves is the river as it is now, the oxbows with the step each was cut at, and where the channel was at
// each step it was recorded: the ground it has swept, from which the point bars and their scrolls are drawn (land.ts).
//
// A cutoff is all or nothing, so the last bit of a float could make two machines cut different loops, and draw
// different rivers. Unlike the generators around it, then, this is written with + − × ÷ and square roots only, whose
// results IEEE 754 fixes: every JavaScript engine makes the same river from the same seed.
import { dcos, dsin, hash2 } from '../city/math.ts';

/** How a channel migrates. Nothing here is a claim about any river. */
export interface Migration {
  /** how many steps it migrates for, and how many of the last of them are kept as the ground it has swept, one in `every` */
  steps: number;
  kept: number;
  every: number;
  /** how far a point of a bend as tight as its own width would move in a step by its own curvature alone, in widths */
  rate: number;
  /** the friction factor Cf: with the depth it sets how far upstream a bend is felt, and so how long bends grow */
  friction: number;
  /** the weights of the curvature at a point, Ω, and of its mean upstream, Γ */
  local: number;
  upstream: number;
  /** a loop is cut off where the channel comes within this many widths of itself */
  neck: number;
}

/** An old loop of the river, cut off: its line, flat [x, y, …], and the step it was cut at. */
export interface CutLoop {
  xy: Float64Array;
  step: number;
}

/** A river that has migrated: its line now, its cut-off loops, and where it was at each step recorded, oldest first. */
export interface Migrated {
  xy: Float64Array;
  loops: CutLoop[];
  past: { step: number; xy: Float64Array }[];
  /** how many steps it ran */
  steps: number;
}

/** e^−a for a ≥ 0, by the first terms of its series: close for a small a, falling all the way, and the same on every machine. */
export function decay(a: number): number {
  return 1 / (1 + a * (1 + (a / 2) * (1 + (a / 3) * (1 + (a / 4) * (1 + a / 5)))));
}

/** A line resampled to points `ds` apart along it, on the cubic through its points (Catmull-Rom); its ends kept. */
export function resample(xy: ArrayLike<number>, ds: number): Float64Array {
  const n = xy.length / 2;
  if (n < 2) return Float64Array.from(xy);
  const at = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const dx = xy[i * 2] - xy[i * 2 - 2];
    const dy = xy[i * 2 + 1] - xy[i * 2 - 1];
    at[i] = at[i - 1] + Math.sqrt(dx * dx + dy * dy);
  }
  const total = at[n - 1];
  const m = Math.max(1, Math.round(total / ds));
  const out = new Float64Array((m + 1) * 2);
  let k = 0;
  for (let j = 0; j <= m; j++) {
    const s = (total * j) / m;
    while (k < n - 2 && at[k + 1] < s) k++;
    const span = at[k + 1] - at[k];
    const t = span > 0 ? (s - at[k]) / span : 0;
    const a = k > 0 ? k - 1 : k;
    const d = k + 2 < n ? k + 2 : k + 1;
    const t2 = t * t;
    const t3 = t2 * t;
    for (let c = 0; c < 2; c++) {
      const p0 = xy[a * 2 + c];
      const p1 = xy[k * 2 + c];
      const p2 = xy[k * 2 + 2 + c];
      const p3 = xy[d * 2 + c];
      out[j * 2 + c] = 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
    }
  }
  out[0] = xy[0];
  out[1] = xy[1];
  out[m * 2] = xy[n * 2 - 2];
  out[m * 2 + 1] = xy[n * 2 - 1];
  return out;
}

/**
 * The first loop to cut off: the first point of the line that another, at least `apart` points on, has come within
 * `reach` of, and the last such point. Looked for on a grid of cells `reach` across, so each point is held against
 * its neighbours only.
 */
function findNeck(xy: Float64Array, reach: number, apart: number): [number, number] | undefined {
  const n = xy.length / 2;
  const cells = new Map<number, number[]>();
  const cx = new Int32Array(n);
  const cy = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    cx[i] = Math.floor(xy[i * 2] / reach);
    cy[i] = Math.floor(xy[i * 2 + 1] / reach);
    const key = cx[i] * 65536 + cy[i];
    const cell = cells.get(key);
    if (cell) cell.push(i);
    else cells.set(key, [i]);
  }
  const r2 = reach * reach;
  for (let i = 0; i < n; i++) {
    let far = -1;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const cell = cells.get((cx[i] + a) * 65536 + cy[i] + b);
        if (!cell) continue;
        for (const j of cell) {
          if (j < i + apart || j <= far) continue;
          const dx = xy[j * 2] - xy[i * 2];
          const dy = xy[j * 2 + 1] - xy[i * 2 + 1];
          if (dx * dx + dy * dy < r2) far = j;
        }
      }
    }
    if (far > 0) return [i, far];
  }
  return undefined;
}

/**
 * A river that has migrated for `m.steps` steps down a valley `length` long, from a line all but straight: along the
 * x axis from 0, its points half a width apart. `seed` sets the small unevenness it starts from, and nothing else.
 * Its ends are held, and the migration eases in over `ease` from each.
 */
export function migrate(length: number, width: number, depth: number, m: Migration, seed: number, ease = 1500): Migrated {
  const ds = width / 2;
  // The line it starts from: a valley that wanders a little over many bends' length, and an unevenness finer than a bend.
  const n0 = Math.round(length / ds) + 1;
  let xy: Float64Array = new Float64Array(n0 * 2);
  const wave = (s: number, size: number, k: number) => {
    const i = Math.floor(s / size);
    const u = s / size - i;
    const a = hash2(i, k, seed) - 0.5;
    const b = hash2(i + 1, k, seed) - 0.5;
    return a + (b - a) * u * u * (3 - 2 * u);
  };
  for (let i = 0; i < n0; i++) {
    const s = i * ds;
    const edge = Math.min(1, s / ease, (length - s) / ease);
    xy[i * 2] = s;
    xy[i * 2 + 1] = edge * (width * 14 * wave(s, width * 110, 1) + width * 3 * wave(s, width * 23, 2) + width * 0.6 * wave(s, width * 5, 3));
  }
  xy = resample(xy, ds);
  const alpha = (2 * m.friction) / depth;
  const g = decay(alpha * ds);
  const reach = m.neck * width;
  // Points nearer along the line than this are neighbours, not a neck.
  const apart = Math.ceil(reach / ds) + 20;
  const loops: CutLoop[] = [];
  const past: Migrated['past'] = [];
  for (let step = 1; step <= m.steps; step++) {
    const n = xy.length / 2;
    // The nominal rate at each point: its curvature, in widths, by the rate.
    const r0 = new Float64Array(n);
    const nx = new Float64Array(n);
    const ny = new Float64Array(n);
    for (let i = 1; i < n - 1; i++) {
      const dx = (xy[i * 2 + 2] - xy[i * 2 - 2]) / 2;
      const dy = (xy[i * 2 + 3] - xy[i * 2 - 1]) / 2;
      const ddx = xy[i * 2 + 2] - 2 * xy[i * 2] + xy[i * 2 - 2];
      const ddy = xy[i * 2 + 3] - 2 * xy[i * 2 + 1] + xy[i * 2 - 1];
      const v = dx * dx + dy * dy;
      const len = Math.sqrt(v) || 1;
      r0[i] = (m.rate * width * width * (dx * ddy - dy * ddx)) / (v * len || 1);
      nx[i] = dy / len;
      ny[i] = -dx / len;
    }
    // The rate: the nominal one, and its mean upstream, weighted less the further up.
    let mean = 0;
    let total = 0;
    const most = ds / 2;
    const next = new Float64Array(n * 2);
    next[0] = xy[0];
    next[1] = xy[1];
    next[n * 2 - 2] = xy[n * 2 - 2];
    next[n * 2 - 1] = xy[n * 2 - 1];
    for (let i = 1; i < n - 1; i++) {
      mean = mean * g + r0[i];
      total = total * g + 1;
      const edge = Math.min(1, (i * ds) / ease, ((n - 1 - i) * ds) / ease);
      let move = (m.local * r0[i] + (m.upstream * mean) / total) * edge;
      // No further in a step than half the spacing of its points: the line stays a line.
      if (move > most) move = most;
      else if (move < -most) move = -most;
      // Outward: away from the centre of the bend.
      next[i * 2] = xy[i * 2] + nx[i] * move;
      next[i * 2 + 1] = xy[i * 2 + 1] + ny[i] * move;
    }
    xy = next;
    // The necks that closed, cut through; each loop kept.
    for (let neck = findNeck(xy, reach, apart); neck; neck = findNeck(xy, reach, apart)) {
      const [a, b] = neck;
      loops.push({ xy: xy.slice(a * 2, b * 2 + 2), step });
      const cut = new Float64Array((xy.length / 2 - (b - a - 1)) * 2);
      cut.set(xy.subarray(0, a * 2 + 2));
      cut.set(xy.subarray(b * 2), a * 2 + 2);
      xy = cut;
    }
    xy = resample(xy, ds);
    if (step > m.steps - m.kept && (m.steps - step) % m.every === 0) past.push({ step, xy });
  }
  return { xy, loops, past, steps: m.steps };
}

/**
 * A line of the valley put in a scene: the point (cx, cy) of it at the scene's middle, and down the valley, its x,
 * turned to a bearing, in radians clockwise from north. Flat [x, y, …].
 */
export function place(xy: Float64Array, cx: number, cy: number, bearing: number): Float64Array {
  const s = dsin(bearing);
  const c = dcos(bearing);
  const out = new Float64Array(xy.length);
  for (let i = 0; i < xy.length; i += 2) {
    const x = xy[i] - cx;
    const y = xy[i + 1] - cy;
    // Down the valley is the bearing; across it, to the left of that.
    out[i] = x * s - y * c;
    out[i + 1] = x * c + y * s;
  }
  return out;
}
