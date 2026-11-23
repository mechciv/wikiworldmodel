// What a body does once it is drawn: a routine, by name, and the way it goes by it. A way is a few numbers kept with
// the body: one or two places near where it stands, how long it stays at each and how fast it goes between them, or a
// circle it flies or swims round. Where it is at any moment is worked out from them and the visit's clock alone (wayAt
// here, and the same sums in the renderer's shader), with nothing carried from one frame to the next: a body that is not
// drawn costs nothing, and one that comes back into view is where it would have been. At the clock's start every body
// is where the scene put it, facing as it was put, or a first step from there if it was put walking.
//
// Nothing here is a claim about any animal or any person. Which routine a body plan has is its `behave`'s, the
// generator's own as the rest of `behave` is; how far, how fast and how long are the generator's parameters. The ways
// are laid over the ground the scene has, by the same test of where a body may stand that placed it.
import type { Behave, Routine } from '../../../core/form.ts';
import { dcos, dsin, PI, TAU, type Rng } from '../city/math.ts';

/** How many numbers a way is. */
export const ROUTE = 12;
/**
 * A way's numbers, in metres and seconds, its places from where the body stands:
 *   0–2  the first place it goes to, x, y, z; for a circle, x and y of its middle
 *   3    how long it stays where it stands before it sets out; below 0, it is already walking as the clock starts
 *   4–6  the second place; the first again where there is only one; for a circle, in the first of them, which way
 *        round it goes, 1 or −1, as its middle lies to one side or the other of the way it was put
 *   7    how long it stays at the first place
 *   8    how fast it goes
 *   9    how long it stays at the second place
 *   10   how long it takes to get going, and to stop
 *   11   its kind (WAY), and in its fraction where in a stride it sets out
 */
export const WAY = { none: 0, walk: 1, circle: 2 } as const;

/** How a routine that walks is paced: how far each leg of its way is, in body lengths; how long it stays, s; and its share of a walk's speed. */
export interface Pace {
  range: [number, number];
  stay: [number, number];
  pace: number;
}

/** The generator's parameters for what bodies do (gen:life/scene, animals.routines). None is a claim about any animal. */
export interface RoutineParams {
  /** a walk's speed: the root of this, the Froude number, times g and the height of the hips */
  froude: number;
  /** how long it takes to get going and to stop, s: so much, and so much more for each root of a metre of its length */
  go: [number, number];
  /** how far the ground may lie off the straight line between two places of a way: in hip heights, and at least so many metres */
  sag: [number, number];
  /** how many places are tried before a body stays where it is */
  tries: number;
  feed: Pace;
  wander: Pace;
  patrol: Pace;
  /** how far off, in metres, a group may be to be stalked; how near it is come to, in body lengths clear of the group; and how far round it the second place is, radians */
  stalk: Pace & { reach: number; hold: [number, number]; round: number };
  /** a circle's radius in body lengths, and at least so many metres; how fast it is flown and swum, as shares of the root of g times the length */
  circle: { radius: [number, number]; least: number; fly: number; swim: number };
}

/** A body that may go a way: where it stands, which way it faces (the sine and cosine of its heading), and how big it is drawn. */
export interface Body {
  x: number;
  y: number;
  z: number;
  fx: number;
  fy: number;
  /** its length and the height of its hips, m */
  L: number;
  H: number;
  /** put walking: it is on its way as the clock starts */
  going: boolean;
}

/** The ground about a body: how high it is, and whether the body may stand at a place. */
export interface Around {
  ground(x: number, y: number): number;
  free(x: number, y: number): boolean;
  /** for one that stalks: the nearest group of something else, and how far the group reaches from its middle */
  prey?: { x: number; y: number; r: number };
  /** places it would make for, tried in turn before anywhere else: a door, a well */
  goals?: [number, number][];
}

/** What a body plan does where its `behave` does not say: what its habitat and its poses suggest. */
export function routineOf(b: Behave | undefined): Routine {
  if (b?.routine) return b.routine;
  if (b?.flies || b?.habitat === 'air' || b?.habitat === 'water') return 'circle';
  if (b?.habitat === 'floor') return 'none';
  const poses = b?.poses ?? [];
  if (poses.includes('graze')) return 'feed';
  if (poses.includes('walk')) return 'wander';
  return 'none';
}

const G = 9.81;

/** How fast a body with hips so high walks, m/s. */
export const walkSpeed = (p: RoutineParams, H: number): number => Math.sqrt(p.froude * G * Math.max(H, 0.005));

const between = (r: [number, number], u: number) => r[0] + (r[1] - r[0]) * u;

/**
 * Whether a body may go straight from one place to another: every few metres of the way is free, and the ground lies
 * no further than `sag` off the straight line between its ends, since a body on its way is carried along that line.
 * The height of the ground at the far end, or undefined.
 */
function clear(a: Around, x0: number, y0: number, z0: number, x1: number, y1: number, sag: number, step: number): number | undefined {
  if (!a.free(x1, y1)) return undefined;
  const z1 = a.ground(x1, y1);
  const d = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
  const n = Math.max(1, Math.ceil(d / step));
  for (let k = 1; k < n; k++) {
    const f = k / n;
    const x = x0 + (x1 - x0) * f;
    const y = y0 + (y1 - y0) * f;
    if (!a.free(x, y)) return undefined;
    const off = a.ground(x, y) - (z0 + (z1 - z0) * f);
    if (off > sag || off < -sag) return undefined;
  }
  return z1;
}

/**
 * The way a body goes by its routine, as ROUTE numbers, or undefined where it stays put: no routine, nowhere near it
 * that it may go, or a body that does not stand on the ground (one afloat is left afloat). `flies` is for a circle:
 * whether it is flown, or swum.
 */
export function wayFor(routine: Routine, b: Body, around: Around, p: RoutineParams, rng: Rng, flies = false): number[] | undefined {
  if (routine === 'none') return undefined;
  const at = rng.next();
  if (routine === 'circle') {
    const r = Math.max(p.circle.least, b.L * between(p.circle.radius, rng.next()));
    const dir = rng.next() < 0.5 ? 1 : -1;
    // Its middle lies square to the way it faces, so that it sets out the way it was put.
    const ax = -dir * r * b.fy;
    const ay = dir * r * b.fx;
    const v = (flies ? p.circle.fly : p.circle.swim) * Math.sqrt(G * b.L) * (0.8 + 0.4 * rng.next());
    // The whole round is over ground that is clear of it, and for what swims, in water.
    const nx = -ax / r;
    const ny = -ay / r;
    for (let k = 1; k < 8; k++) {
      const t = (TAU * k) / 8;
      const x = b.x + ax + r * (nx * dcos(t) - ny * dsin(t));
      const y = b.y + ay + r * (nx * dsin(t) + ny * dcos(t));
      if (around.ground(x, y) > b.z - 0.3 * b.L) return undefined;
      if (!flies && !around.free(x, y)) return undefined;
    }
    return [ax, ay, 0, 0, dir, 0, 0, 0, v, 0, 0, WAY.circle + at * 0.99];
  }
  // One that walks stands on the ground.
  const gz = around.ground(b.x, b.y);
  if (b.z - gz > 0.02 || gz - b.z > 0.02) return undefined;
  const style = p[routine];
  const v = walkSpeed(p, b.H) * style.pace * (0.85 + 0.3 * rng.next());
  const go = p.go[0] + p.go[1] * Math.sqrt(b.L);
  const sag = Math.max(p.sag[1], p.sag[0] * b.H);
  const step = Math.max(2, b.L * 0.75);
  const stay = () => between(style.stay, rng.next());
  const reach = () => b.L * between(style.range, rng.next());
  let A: [number, number, number] | undefined;
  let B: [number, number, number] | undefined;
  let going = b.going;
  const prey = routine === 'stalk' ? around.prey : undefined;
  if (prey) {
    // Up to the group from its own side, as near as a stalker holds off; then a way round it.
    const dx = b.x - prey.x;
    const dy = b.y - prey.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const hold = prey.r + b.L * between(p.stalk.hold, rng.next());
    if (d > hold + b.L && d <= p.stalk.reach) {
      const ux = dx / d;
      const uy = dy / d;
      const ax = prey.x + ux * hold;
      const ay = prey.y + uy * hold;
      const az = clear(around, b.x, b.y, b.z, ax, ay, sag, step);
      if (az !== undefined) {
        A = [ax, ay, az];
        going = false;
        const turn = (rng.next() < 0.5 ? 1 : -1) * p.stalk.round;
        const bx = prey.x + (ux * dcos(turn) - uy * dsin(turn)) * hold;
        const by = prey.y + (ux * dsin(turn) + uy * dcos(turn)) * hold;
        const bz = clear(around, ax, ay, az, bx, by, sag, step);
        if (bz !== undefined && clear(around, bx, by, bz, b.x, b.y, sag, step) !== undefined) B = [bx, by, bz];
      }
    }
  }
  const goals = around.goals ? [...around.goals] : [];
  for (let t = 0; t < p.tries && !A; t++) {
    // One put walking goes on the way it faces; another makes for what it would go to, or turns to go, the first times
    // not far from the way it faces.
    const goal = going ? undefined : goals.shift();
    const turn = going ? 0 : (rng.next() - 0.5) * (t < 2 ? 2.4 : TAU);
    const ux = b.fx * dcos(turn) + b.fy * dsin(turn);
    const uy = b.fy * dcos(turn) - b.fx * dsin(turn);
    const d = reach();
    const x = goal ? goal[0] : b.x + ux * d;
    const y = goal ? goal[1] : b.y + uy * d;
    const z = clear(around, b.x, b.y, b.z, x, y, sag, step);
    if (z !== undefined) A = [x, y, z];
    // Nowhere ahead: it was put walking, but it stands, and may yet find a way to one side.
    else if (going && t >= p.tries >> 1) going = false;
  }
  if (!A) return undefined;
  const out = Math.max(1e-6, Math.sqrt((A[0] - b.x) * (A[0] - b.x) + (A[1] - b.y) * (A[1] - b.y)));
  const ux = (A[0] - b.x) / out;
  const uy = (A[1] - b.y) / out;
  for (let t = 0; t < p.tries && !B && !prey; t++) {
    // A second place off to one side of the first, so that the way round is no line; and from it the way back is clear.
    const goal = goals.shift();
    const turn = (rng.next() < 0.5 ? 1 : -1) * (0.7 + 1.5 * rng.next());
    const d = reach();
    const x = goal ? goal[0] : A[0] + (ux * dcos(turn) + uy * dsin(turn)) * d;
    const y = goal ? goal[1] : A[1] + (uy * dcos(turn) - ux * dsin(turn)) * d;
    const z = clear(around, A[0], A[1], A[2], x, y, sag, step);
    if (z !== undefined && clear(around, x, y, z, b.x, b.y, sag, step) !== undefined) B = [x, y, z];
  }
  // With one place only it goes there and back; and the way back is the way it came.
  const two = !!B;
  const b2 = B ?? A;
  return [A[0] - b.x, A[1] - b.y, A[2] - b.z, going ? -1 : stay() * rng.next(), b2[0] - b.x, b2[1] - b.y, b2[2] - b.z, stay(), v, two ? stay() : 0, go, WAY.walk + at * 0.99];
}

/**
 * The way of one of a group, from the way its leader goes: the same legs from where it stands itself, at the same
 * speed and in the same time, so that the group keeps together round after round; it sets out a little after its
 * leader and makes that up at its first stop. Round a circle it goes the leader's circle, turned to the way it faces
 * itself. Undefined where it could not go so: ground it may not stand on, or too far off the straight line.
 */
export function wayBeside(lead: ArrayLike<number>, b: Body, around: Around, p: RoutineParams, rng: Rng, flies = false): number[] | undefined {
  const at = rng.next();
  const late = rng.next();
  if (Math.floor(lead[11]) === WAY.circle) {
    const r = Math.sqrt(lead[0] * lead[0] + lead[1] * lead[1]);
    // The leader's circle lies to one side of the way it was put: this one's to the same side of its own.
    const dir = lead[4] < 0 ? -1 : 1;
    const ax = -dir * r * b.fy;
    const ay = dir * r * b.fx;
    const nx = -ax / r;
    const ny = -ay / r;
    for (let k = 1; k < 8; k++) {
      const t = (TAU * k) / 8;
      const x = b.x + ax + r * (nx * dcos(t) - ny * dsin(t));
      const y = b.y + ay + r * (nx * dsin(t) + ny * dcos(t));
      if (around.ground(x, y) > b.z - 0.3 * b.L) return undefined;
      if (!flies && !around.free(x, y)) return undefined;
    }
    return [ax, ay, 0, 0, dir, 0, 0, 0, lead[8], 0, 0, WAY.circle + at * 0.99];
  }
  const gz = around.ground(b.x, b.y);
  if (b.z - gz > 0.02 || gz - b.z > 0.02) return undefined;
  const sag = Math.max(p.sag[1], p.sag[0] * b.H);
  const step = Math.max(2, b.L * 0.75);
  const ax = b.x + lead[0];
  const ay = b.y + lead[1];
  const az = clear(around, b.x, b.y, b.z, ax, ay, sag, step);
  if (az === undefined) return undefined;
  const two = lead[4] !== lead[0] || lead[5] !== lead[1];
  const bx = b.x + lead[4];
  const by = b.y + lead[5];
  let bz = az;
  if (two) {
    const z = clear(around, ax, ay, az, bx, by, sag, step);
    if (z === undefined || clear(around, bx, by, z, b.x, b.y, sag, step) === undefined) return undefined;
    bz = z;
  }
  // It sets out up to a few seconds after its leader, and stays that much less at the first place: the round is the same.
  const wait = lead[3] < 0 ? 0 : late * Math.min(0.4 * lead[7], 3 * lead[10]);
  return [lead[0], lead[1], az - b.z, lead[3] < 0 ? -1 : lead[3] + wait, lead[4], lead[5], bz - b.z, lead[7] - wait, lead[8], lead[9], lead[10], WAY.walk + at * 0.99];
}

/** Where a body on its way is, from where it stands: metres, the way it faces, how much it is going (0–1), and how far it has walked this round. */
export interface WayNow {
  x: number;
  y: number;
  z: number;
  fx: number;
  fy: number;
  going: number;
  walked: number;
}

/** How far along a leg of `len` metres it is, `s` seconds into it, at speed `v`, getting going and stopping over `a` seconds; and how much it is going. */
function along(s: number, len: number, v: number, a: number): [number, number] {
  if (len < 1e-3 || a <= 0) return [0, 0];
  const t = len / v + a;
  if (s < a) return [(0.5 * v * s * s) / a, s / a];
  if (s > t - a) {
    const r = Math.max(0, t - s);
    return [len - (0.5 * v * r * r) / a, r / a];
  }
  return [v * (s - 0.5 * a), 1];
}

/** A heading turned from one way to another, `u` of the way, by the shorter turn. */
function turned(fx: number, fy: number, tx: number, ty: number, u: number): [number, number] {
  const k = u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
  const a = Math.atan2(fx, fy);
  const b = Math.atan2(tx, ty);
  let d = (b - a + PI) % TAU;
  if (d < 0) d += TAU;
  d -= PI;
  const h = a + d * k;
  return [Math.sin(h), Math.cos(h)];
}

/** The legs of a walked way: their lengths, their times, and the round's whole time. */
function legs(w: ArrayLike<number>, o: number) {
  const v = w[o + 8];
  const ta = w[o + 10];
  const l0 = Math.hypot(w[o], w[o + 1]);
  const l1 = Math.hypot(w[o + 4] - w[o], w[o + 5] - w[o + 1]);
  const l2 = Math.hypot(w[o + 4], w[o + 5]);
  const a0 = Math.min(ta, l0 / v);
  const a1 = Math.min(ta, l1 / v);
  const a2 = Math.min(ta, l2 / v);
  const d0 = Math.max(w[o + 3], 0);
  const t0 = l0 / v + a0;
  const t1 = l1 / v + a1;
  const t2 = l2 / v + a2;
  return { v, l0, l1, l2, a0, a1, a2, d0, d1: w[o + 7], d2: w[o + 9], t0, t1, t2, T: d0 + t0 + w[o + 7] + t1 + w[o + 9] + t2, ahead: w[o + 3] < 0 ? a0 : 0 };
}

/** How long a way takes to come round, s: 0 for none. */
export function roundOf(w: ArrayLike<number>, o = 0): number {
  const kind = Math.floor(w[o + 11]);
  if (kind === WAY.circle) return (TAU * Math.hypot(w[o], w[o + 1])) / w[o + 8];
  return kind === WAY.walk ? legs(w, o).T : 0;
}

/**
 * Where a body is on its way at `clock` seconds of the visit: the renderer's shader does these sums for every vertex
 * it draws (viewer/src/gl/cityShaders.ts, wayOf), and this is what they are held to. `fx`, `fy` is the way it was put.
 */
export function wayAt(w: ArrayLike<number>, o: number, fx: number, fy: number, clock: number): WayNow {
  const kind = Math.floor(w[o + 11]);
  const v = w[o + 8];
  if (!(v > 0) || kind === WAY.none) return { x: 0, y: 0, z: 0, fx, fy, going: 0, walked: 0 };
  if (kind === WAY.circle) {
    const ax = w[o];
    const ay = w[o + 1];
    const r = Math.hypot(ax, ay);
    const dir = fx * ay - fy * ax < 0 ? -1 : 1;
    const th = (dir * v * clock) / r;
    const nx = (-ax / r) * Math.cos(th) - (-ay / r) * Math.sin(th);
    const ny = (-ax / r) * Math.sin(th) + (-ay / r) * Math.cos(th);
    return { x: ax + r * nx, y: ay + r * ny, z: 0, fx: -dir * ny, fy: dir * nx, going: 0, walked: v * clock };
  }
  const g = legs(w, o);
  const A = [w[o], w[o + 1], w[o + 2]];
  const B = [w[o + 4], w[o + 5], w[o + 6]];
  const D0 = g.l0 > 1e-3 ? [A[0] / g.l0, A[1] / g.l0] : [fx, fy];
  const D1 = g.l1 > 1e-3 ? [(B[0] - A[0]) / g.l1, (B[1] - A[1]) / g.l1] : D0;
  const D2 = g.l2 > 1e-3 ? [-B[0] / g.l2, -B[1] / g.l2] : D1;
  let s = (clock + g.ahead) % g.T;
  if (s < g.d0) return { x: 0, y: 0, z: 0, fx, fy, going: 0, walked: 0 };
  s -= g.d0;
  if (s < g.t0) {
    const [q, going] = along(s, g.l0, g.v, g.a0);
    const f = turned(fx, fy, D0[0], D0[1], s / Math.max(g.a0, 1e-3));
    return { x: D0[0] * q, y: D0[1] * q, z: g.l0 > 1e-3 ? (A[2] * q) / g.l0 : 0, fx: f[0], fy: f[1], going, walked: q };
  }
  s -= g.t0;
  if (s < g.d1) return { x: A[0], y: A[1], z: A[2], fx: D0[0], fy: D0[1], going: 0, walked: g.l0 };
  s -= g.d1;
  if (s < g.t1) {
    const [q, going] = along(s, g.l1, g.v, g.a1);
    const f = turned(D0[0], D0[1], D1[0], D1[1], s / Math.max(g.a1, 1e-3));
    return { x: A[0] + D1[0] * q, y: A[1] + D1[1] * q, z: A[2] + (g.l1 > 1e-3 ? ((B[2] - A[2]) * q) / g.l1 : 0), fx: f[0], fy: f[1], going, walked: g.l0 + q };
  }
  s -= g.t1;
  if (s < g.d2) return { x: B[0], y: B[1], z: B[2], fx: D1[0], fy: D1[1], going: 0, walked: g.l0 + g.l1 };
  s -= g.d2;
  const [q, going] = along(s, g.l2, g.v, g.a2);
  // It turns for home as it sets out, and into the way it was put as it comes in.
  const out = turned(D1[0], D1[1], D2[0], D2[1], s / Math.max(g.a2, 1e-3));
  const f = turned(out[0], out[1], fx, fy, (s - (g.t2 - g.a2)) / Math.max(g.a2, 1e-3));
  return { x: B[0] + D2[0] * q, y: B[1] + D2[1] * q, z: B[2] - (g.l2 > 1e-3 ? (B[2] * q) / g.l2 : 0), fx: f[0], fy: f[1], going, walked: g.l0 + g.l1 + q };
}
