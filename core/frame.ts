// The frame of a settlement (docs/plans/CITIES.md, decision 5): the lines nothing generated may cross, such as
// routes, walls, water, shores and mapped streets, noded into a planar graph, and the faces they enclose. A face is
// the unit the settlement generator works in: it is made on its own, from its own seed and what lies in it, and both
// of its neighbours read the line between them from here, so no seam has to be agreed.
//
// Points are snapped to a grid (a tenth of a metre unless asked otherwise), and every test of orientation is a product
// of integers well inside a double's exact range, so every machine finds the same vertices, edges and faces. Where two
// segments cross, the crossing is rounded to the grid and the noding is run again until nothing more crosses.
//
// A face's identity is the run of lines and corners round it, never a computed position. A corner is a vertex where
// the boundary passes from one line to another; a vertex where it runs on along the same line is no corner. So a line
// added elsewhere, even one that ends on this face's edge from the other side, leaves the face's identity as it was,
// and a line drawn across it makes two new faces and touches no other.

export type FrameKind = 'route' | 'street' | 'wall' | 'water' | 'shore' | 'edge';

export interface FrameLine {
  /** stable and meaningless: a record's id, a map's element, or a generated slot */
  id: string;
  kind: FrameKind;
  /** x, y pairs in local metres */
  points: number[];
  /** a ring: the last point joins the first */
  closed?: boolean;
}

export interface FrameEdge {
  /** vertex indices */
  a: number;
  b: number;
  /** the ids of the lines that run along it, sorted */
  lines: string[];
}

export interface FrameSpur {
  /** x, y pairs in metres, an open polyline */
  points: number[];
  /** the lines it runs along, sorted and joined by '+' */
  lines: string;
}

export interface FrameFace {
  /** stable: the run of lines and corners round it (see the head of this file) */
  id: string;
  /** its outer boundary, counter-clockwise, x, y pairs in metres */
  outer: number[];
  /** for each side of `outer`, from point i to point i + 1, the lines it runs along, joined by '+' */
  sides: string[];
  /** `outer` without the vertices that other lines' crossings and junctions made where this face has no corner */
  plain: number[];
  /** for each side of `plain`, the lines it runs along, joined by '+' */
  plainSides: string[];
  /** what lies inside it and is not of it, such as a ring of walls that touches nothing: clockwise rings in metres */
  holes: number[][];
  /** lines that end inside it, or join its boundary to a hole */
  spurs: FrameSpur[];
  /** square metres, holes taken out */
  area: number;
}

export interface Frame {
  /** x, y pairs in metres */
  vertices: number[];
  edges: FrameEdge[];
  faces: FrameFace[];
}

/** How far from its origin a frame may reach, in grid units: products of differences stay exact below 2^53. */
const REACH = 1.5e7;

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/** Is the point (px, py), known to lie on the line through a and b, strictly between them? */
function between(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
  const ux = bx - ax;
  const uy = by - ay;
  const s = (px - ax) * ux + (py - ay) * uy;
  return s > 0 && s < ux * ux + uy * uy;
}

/** Two 32-bit FNV-1a hashes of a string, as 16 hex digits: no two faces of a world are expected to meet. */
export function frameHash(s: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  line: number;
}

/** Cut every segment where another crosses it, touches it or runs along it. Returns whether anything was cut. */
function node(segs: Seg[]): { out: Seg[]; cut: boolean } {
  const n = segs.length;
  if (n === 0) return { out: segs, cut: false };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of segs) {
    x0 = Math.min(x0, s.ax, s.bx);
    y0 = Math.min(y0, s.ay, s.by);
    x1 = Math.max(x1, s.ax, s.bx);
    y1 = Math.max(y1, s.ay, s.by);
  }
  // A grid of buckets about as many as the segments, so a bucket holds a few.
  const side = Math.max(1, Math.ceil(Math.sqrt(((x1 - x0 + 1) * (y1 - y0 + 1)) / n)) * 2);
  const nx = Math.floor((x1 - x0) / side) + 1;
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const s = segs[i];
    const i0 = Math.floor((Math.min(s.ax, s.bx) - x0) / side);
    const i1 = Math.floor((Math.max(s.ax, s.bx) - x0) / side);
    const j0 = Math.floor((Math.min(s.ay, s.by) - y0) / side);
    const j1 = Math.floor((Math.max(s.ay, s.by) - y0) / side);
    for (let j = j0; j <= j1; j++)
      for (let k = i0; k <= i1; k++) {
        const key = j * nx + k;
        const b = buckets.get(key);
        if (b) b.push(i);
        else buckets.set(key, [i]);
      }
  }
  const cuts: number[][] = segs.map(() => []);
  const tried = new Set<number>();
  const add = (i: number, x: number, y: number) => {
    const s = segs[i];
    if ((x === s.ax && y === s.ay) || (x === s.bx && y === s.by)) return;
    cuts[i].push(x, y);
  };
  for (const b of buckets.values()) {
    for (let p = 0; p < b.length; p++)
      for (let q = p + 1; q < b.length; q++) {
        const i = Math.min(b[p], b[q]);
        const j = Math.max(b[p], b[q]);
        const key = i * n + j;
        if (tried.has(key)) continue;
        tried.add(key);
        const s = segs[i];
        const t = segs[j];
        if (Math.max(s.ax, s.bx) < Math.min(t.ax, t.bx) || Math.max(t.ax, t.bx) < Math.min(s.ax, s.bx)) continue;
        if (Math.max(s.ay, s.by) < Math.min(t.ay, t.by) || Math.max(t.ay, t.by) < Math.min(s.ay, s.by)) continue;
        const o1 = orient(s.ax, s.ay, s.bx, s.by, t.ax, t.ay);
        const o2 = orient(s.ax, s.ay, s.bx, s.by, t.bx, t.by);
        const o3 = orient(t.ax, t.ay, t.bx, t.by, s.ax, s.ay);
        const o4 = orient(t.ax, t.ay, t.bx, t.by, s.bx, s.by);
        if (o1 === 0 && o2 === 0) {
          // Along one another: each is cut where the other's ends lie on it.
          if (between(s.ax, s.ay, s.bx, s.by, t.ax, t.ay)) add(i, t.ax, t.ay);
          if (between(s.ax, s.ay, s.bx, s.by, t.bx, t.by)) add(i, t.bx, t.by);
          if (between(t.ax, t.ay, t.bx, t.by, s.ax, s.ay)) add(j, s.ax, s.ay);
          if (between(t.ax, t.ay, t.bx, t.by, s.bx, s.by)) add(j, s.bx, s.by);
          continue;
        }
        if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) {
          // A crossing, rounded to the grid; the next round of noding finds whatever the rounding made touch.
          const den = (s.bx - s.ax) * (t.by - t.ay) - (s.by - s.ay) * (t.bx - t.ax);
          const num = (t.ax - s.ax) * (t.by - t.ay) - (t.ay - s.ay) * (t.bx - t.ax);
          const u = num / den;
          const x = Math.round(s.ax + u * (s.bx - s.ax));
          const y = Math.round(s.ay + u * (s.by - s.ay));
          add(i, x, y);
          add(j, x, y);
          continue;
        }
        // One ends on the other.
        if (o1 === 0 && between(s.ax, s.ay, s.bx, s.by, t.ax, t.ay)) add(i, t.ax, t.ay);
        if (o2 === 0 && between(s.ax, s.ay, s.bx, s.by, t.bx, t.by)) add(i, t.bx, t.by);
        if (o3 === 0 && between(t.ax, t.ay, t.bx, t.by, s.ax, s.ay)) add(j, s.ax, s.ay);
        if (o4 === 0 && between(t.ax, t.ay, t.bx, t.by, s.bx, s.by)) add(j, s.bx, s.by);
      }
  }
  let cut = false;
  const out: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const s = segs[i];
    const c = cuts[i];
    if (c.length === 0) {
      out.push(s);
      continue;
    }
    cut = true;
    const ux = s.bx - s.ax;
    const uy = s.by - s.ay;
    const pts: { x: number; y: number; d: number }[] = [];
    for (let k = 0; k < c.length; k += 2) pts.push({ x: c[k], y: c[k + 1], d: (c[k] - s.ax) * ux + (c[k + 1] - s.ay) * uy });
    pts.sort((p, q) => p.d - q.d || p.x - q.x || p.y - q.y);
    let px = s.ax;
    let py = s.ay;
    for (const p of pts) {
      if (p.x === px && p.y === py) continue;
      out.push({ ax: px, ay: py, bx: p.x, by: p.y, line: s.line });
      px = p.x;
      py = p.y;
    }
    if (px !== s.bx || py !== s.by) out.push({ ax: px, ay: py, bx: s.bx, by: s.by, line: s.line });
  }
  return { out, cut };
}

/** Which half of the turn a direction lies in, for ordering directions round a vertex without an angle. */
const half = (dx: number, dy: number) => (dy > 0 || (dy === 0 && dx > 0) ? 0 : 1);

/** Is the point inside the ring (x, y pairs in grid units)? Exact: the point is never on the ring. */
function inside(ring: number[], px: number, py: number): boolean {
  let c = false;
  const m = ring.length / 2;
  for (let i = 0, j = m - 1; i < m; j = i++) {
    const ax = ring[j * 2];
    const ay = ring[j * 2 + 1];
    const bx = ring[i * 2];
    const by = ring[i * 2 + 1];
    if (ay > py !== by > py) {
      // Does the edge cross the ray to +x? Its side of the point, taken exactly.
      const o = orient(ax, ay, bx, by, px, py);
      if (by > ay ? o > 0 : o < 0) c = !c;
    }
  }
  return c;
}

const ringArea2 = (r: number[]) => {
  let a = 0;
  const m = r.length / 2;
  for (let i = 0, j = m - 1; i < m; j = i++) a += r[j * 2] * r[i * 2 + 1] - r[i * 2] * r[j * 2 + 1];
  return a;
};

/**
 * The frame of a set of lines: its vertices, its edges with the lines along each, and the faces they enclose. Lines
 * should be closed off by an outer line of kind 'edge' (the ground a settlement may take), or what lies outside every
 * line is no face. `unit` is the grid points are snapped to, in metres.
 */
export function makeFrame(lines: FrameLine[], unit = 0.1): Frame {
  // The lines in a fixed order, so that the result does not depend on the order they were given in.
  const order = lines.map((_, i) => i).sort((p, q) => (lines[p].id < lines[q].id ? -1 : lines[p].id > lines[q].id ? 1 : p - q));
  const ids = order.map((i) => lines[i].id);
  const snap = (v: number) => {
    const g = Math.round(v / unit);
    if (!(Math.abs(g) < REACH)) throw new Error(`a frame's point lies too far out: ${v} m`);
    return g;
  };
  let segs: Seg[] = [];
  /** for each grid point that is a line's own point, not a crossing made by noding, the lines it is a point of */
  const shape = new Map<string, Set<string>>();
  /** grid points where an open line ends: they are always corners */
  const ends = new Map<string, string[]>();
  order.forEach((li, k) => {
    const l = lines[li];
    const p: number[] = [];
    for (let i = 0; i + 1 < l.points.length; i += 2) {
      const x = snap(l.points[i]);
      const y = snap(l.points[i + 1]);
      if (p.length && p[p.length - 2] === x && p[p.length - 1] === y) continue;
      p.push(x, y);
    }
    if (l.closed && p.length > 2 && p[0] === p[p.length - 2] && p[1] === p[p.length - 1]) p.length -= 2;
    if (p.length < 4) return;
    for (let i = 0; i < p.length; i += 2) {
      const key = `${p[i]},${p[i + 1]}`;
      const s = shape.get(key);
      if (s) s.add(ids[k]);
      else shape.set(key, new Set([ids[k]]));
    }
    const m = p.length / 2;
    const last = l.closed ? m : m - 1;
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % m;
      segs.push({ ax: p[i * 2], ay: p[i * 2 + 1], bx: p[j * 2], by: p[j * 2 + 1], line: k });
    }
    if (!l.closed) {
      for (const [x, y, w] of [[p[0], p[1], 'a'], [p[p.length - 2], p[p.length - 1], 'b']] as const) {
        const key = `${x},${y}`;
        const e = ends.get(key) ?? [];
        e.push(`${ids[k]}:${w}`);
        ends.set(key, e);
      }
    }
  });
  for (let round = 0; round < 6; round++) {
    const r = node(segs);
    segs = r.out;
    if (!r.cut) break;
  }

  // Vertices and edges.
  const vertexOf = new Map<string, number>();
  const vx: number[] = [];
  const vy: number[] = [];
  const vertex = (x: number, y: number) => {
    const key = `${x},${y}`;
    let v = vertexOf.get(key);
    if (v === undefined) {
      v = vx.length;
      vertexOf.set(key, v);
      vx.push(x);
      vy.push(y);
    }
    return v;
  };
  const edgeOf = new Map<string, number>();
  const ea: number[] = [];
  const eb: number[] = [];
  const eLines: Set<number>[] = [];
  for (const s of segs) {
    const a = vertex(s.ax, s.ay);
    const b = vertex(s.bx, s.by);
    if (a === b) continue;
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    let e = edgeOf.get(key);
    if (e === undefined) {
      e = ea.length;
      edgeOf.set(key, e);
      ea.push(Math.min(a, b));
      eb.push(Math.max(a, b));
      eLines.push(new Set());
    }
    eLines[e].add(s.line);
  }
  const nv = vx.length;
  const ne = ea.length;
  const edgeLines = eLines.map((s) => [...s].sort((p, q) => p - q).map((k) => ids[k]));
  const edgeKey = edgeLines.map((l) => l.join('+'));

  // Half-edges: 2e runs from a to b, 2e + 1 from b to a. Round each vertex, its outgoing half-edges counter-clockwise.
  const from = (h: number) => (h & 1 ? eb[h >> 1] : ea[h >> 1]);
  const to = (h: number) => (h & 1 ? ea[h >> 1] : eb[h >> 1]);
  const out: number[][] = Array.from({ length: nv }, () => []);
  for (let h = 0; h < ne * 2; h++) out[from(h)].push(h);
  const position = new Int32Array(ne * 2);
  for (let v = 0; v < nv; v++) {
    const list = out[v];
    const dir = (h: number) => [vx[to(h)] - vx[v], vy[to(h)] - vy[v]] as const;
    list.sort((p, q) => {
      const [px, py] = dir(p);
      const [qx, qy] = dir(q);
      const hp = half(px, py);
      const hq = half(qx, qy);
      if (hp !== hq) return hp - hq;
      const c = px * qy - py * qx;
      return c > 0 ? -1 : c < 0 ? 1 : 0;
    });
    list.forEach((h, i) => (position[h] = i));
  }
  // The face on the left of a half-edge goes on through the outgoing half-edge just clockwise of its twin.
  const next = (h: number) => {
    const v = to(h);
    const list = out[v];
    const i = position[h ^ 1];
    return list[(i - 1 + list.length) % list.length];
  };

  // A name for every vertex where a face may turn from one line to another: the lines through it, the lines that end
  // there, and which of the vertices with that same name it is, counted by where they lie.
  const through: string[] = new Array(nv).fill('');
  {
    const sets: Set<string>[] = Array.from({ length: nv }, () => new Set());
    for (let e = 0; e < ne; e++)
      for (const id of edgeLines[e]) {
        sets[ea[e]].add(id);
        sets[eb[e]].add(id);
      }
    for (let v = 0; v < nv; v++) {
      const end = ends.get(`${vx[v]},${vy[v]}`);
      through[v] = [...sets[v]].sort().join('+') + (end ? `|${[...end].sort().join(',')}` : '');
    }
  }
  const nodeName: string[] = new Array(nv).fill('');
  {
    const groups = new Map<string, number[]>();
    for (let v = 0; v < nv; v++) {
      const g = groups.get(through[v]);
      if (g) g.push(v);
      else groups.set(through[v], [v]);
    }
    for (const [k, g] of groups) {
      g.sort((p, q) => vx[p] - vx[q] || vy[p] - vy[q]);
      g.forEach((v, i) => (nodeName[v] = `${k}#${i}`));
    }
  }

  // Which connected part of the frame each vertex is in: a part's outer boundary lies in a face of another part.
  const part = new Int32Array(nv).map((_, i) => i);
  const root = (v: number): number => {
    while (part[v] !== v) {
      part[v] = part[part[v]];
      v = part[v];
    }
    return v;
  };
  for (let e = 0; e < ne; e++) part[root(ea[e])] = root(eb[e]);

  // Trace every cycle of half-edges.
  const cycleOf = new Int32Array(ne * 2).fill(-1);
  const cycles: number[][] = [];
  for (let h = 0; h < ne * 2; h++) {
    if (cycleOf[h] >= 0) continue;
    const c: number[] = [];
    let g = h;
    do {
      cycleOf[g] = cycles.length;
      c.push(g);
      g = next(g);
    } while (g !== h && c.length <= ne * 2);
    cycles.push(c);
  }

  /** A cycle split into its closed loops, leaving out the half-edges whose twins are in the same cycle. */
  const loopsOf = (c: number[], ci: number) => {
    const loops: number[][] = [];
    const inner: number[] = [];
    const stack: number[][] = [];
    let cur: number[] = [];
    for (const h of c) {
      if (cycleOf[h ^ 1] === ci) {
        inner.push(h);
        continue;
      }
      if (cur.length && to(cur[cur.length - 1]) !== from(h)) {
        stack.push(cur);
        cur = [];
      }
      cur.push(h);
      if (to(h) === from(cur[0])) {
        loops.push(cur);
        cur = stack.pop() ?? [];
      }
    }
    if (cur.length) loops.push(cur);
    for (const s of stack) if (s.length) loops.push(s);
    return { loops, inner };
  };
  const loopRing = (loop: number[]) => {
    const r: number[] = [];
    for (const h of loop) r.push(vx[from(h)], vy[from(h)]);
    return r;
  };
  /** A loop as the run of its lines and corners, from whichever start makes the smallest string. */
  const loopName = (loop: number[]) => {
    const m = loop.length;
    const keys = loop.map((h) => edgeKey[h >> 1]);
    const corners: number[] = [];
    for (let i = 0; i < m; i++) if (keys[i] !== keys[(i - 1 + m) % m]) corners.push(i);
    if (corners.length === 0) return `ring(${keys[0]})`;
    const parts = corners.map((i) => `${nodeName[from(loop[i])]}>${keys[i]}`);
    let best = '';
    for (let s = 0; s < parts.length; s++) {
      const str = parts.slice(s).concat(parts.slice(0, s)).join(';');
      if (best === '' || str < best) best = str;
    }
    return best;
  };
  /** The undirected half-edges in a list, chained into polylines that stop where the lines change or branch. */
  const chains = (hs: number[]) => {
    const edges = [...new Set(hs.map((h) => h >> 1))];
    const at = new Map<number, number[]>();
    for (const e of edges)
      for (const v of [ea[e], eb[e]]) {
        const l = at.get(v);
        if (l) l.push(e);
        else at.set(v, [e]);
      }
    const used = new Set<number>();
    const result: { vs: number[]; key: string }[] = [];
    const stop = (v: number, key: string) => {
      const l = at.get(v)!;
      return l.length !== 2 || edgeKey[l[0]] !== key || edgeKey[l[1]] !== key;
    };
    const walk = (start: number, e0: number) => {
      const key = edgeKey[e0];
      const vs = [start];
      let v = start;
      let e = e0;
      for (;;) {
        used.add(e);
        v = ea[e] === v ? eb[e] : ea[e];
        vs.push(v);
        if (stop(v, key)) break;
        const n2 = at.get(v)!.find((f) => f !== e && !used.has(f));
        if (n2 === undefined) break;
        e = n2;
      }
      result.push({ vs, key });
    };
    const starts = [...at.keys()].sort((p, q) => p - q);
    for (const v of starts) for (const e of at.get(v)!) if (!used.has(e) && stop(v, edgeKey[e])) walk(v, e);
    for (const e of edges) if (!used.has(e)) walk(ea[e], e);
    return result;
  };

  const faces: (FrameFace & { ring: number[]; part: number })[] = [];
  const homeless: { loops: number[][]; inner: number[]; probe: [number, number]; part: number }[] = [];
  const spurOf = (inner: number[]) =>
    chains(inner).map((c) => ({
      points: c.vs.flatMap((v) => [vx[v] * unit, vy[v] * unit]),
      lines: c.key,
      name: [nodeName[c.vs[0]], nodeName[c.vs[c.vs.length - 1]]].sort().join('~') + `>${c.key}`,
    }));
  const named: { names: string[]; face: (typeof faces)[number] }[] = [];
  cycles.forEach((c, ci) => {
    const { loops, inner } = loopsOf(c, ci);
    const rings = loops.map(loopRing);
    const areas = rings.map(ringArea2);
    const outerAt = areas.findIndex((a) => a > 0);
    if (outerAt < 0) {
      // The outer boundary of a part of the frame that touches nothing round it: a hole in whichever face holds it.
      const v = loops.length ? from(loops[0][0]) : from(c[0]);
      homeless.push({ loops, inner, probe: [vx[v], vy[v]], part: root(v) });
      return;
    }
    const outer = loops[outerAt];
    const ring = rings[outerAt];
    const sides = outer.map((h) => edgeKey[h >> 1]);
    const plain: number[] = [];
    const plainSides: string[] = [];
    for (let i = 0; i < outer.length; i++) {
      const v = from(outer[i]);
      const corner = sides[i] !== sides[(i - 1 + outer.length) % outer.length];
      // A point of the line the face runs along here is kept; a junction another line made on it is not.
      const own = shape.get(`${vx[v]},${vy[v]}`);
      if (corner || (own && edgeLines[outer[i] >> 1].some((id) => own.has(id)))) {
        plain.push(vx[v] * unit, vy[v] * unit);
        plainSides.push(sides[i]);
      }
    }
    const spurs = spurOf(inner);
    const holes = loops.filter((_, i) => i !== outerAt);
    const face = {
      id: '',
      outer: ring.map((g) => g * unit),
      sides,
      plain,
      plainSides,
      holes: holes.map((l) => loopRing(l).map((g) => g * unit)),
      spurs: spurs.map(({ points, lines }) => ({ points, lines })),
      area: (areas.reduce((s, a, i) => (i === outerAt ? s + a : s + Math.min(0, a)), 0) / 2) * unit * unit,
      ring,
      part: root(from(outer[0])),
    };
    faces.push(face);
    named.push({ names: [`O:${loopName(outer)}`, ...holes.map((l) => `H:${loopName(l)}`), ...spurs.map((s) => `S:${s.name}`)], face });
  });
  // Each part that touches nothing round it goes into the smallest face of another part whose outer ring holds it.
  // What is outside every part (the unbounded face) is no face.
  for (const h of homeless) {
    let best = -1;
    for (let f = 0; f < faces.length; f++) {
      if (faces[f].part === h.part || !inside(faces[f].ring, h.probe[0], h.probe[1])) continue;
      if (best < 0 || faces[f].area < faces[best].area) best = f;
    }
    if (best < 0) continue;
    const face = faces[best];
    const entry = named.find((n) => n.face === face)!;
    for (const l of h.loops) {
      const r = loopRing(l);
      if (ringArea2(r) === 0) continue;
      face.holes.push(r.map((g) => g * unit));
      face.area += (ringArea2(r) / 2) * unit * unit;
      entry.names.push(`H:${loopName(l)}`);
    }
    for (const s of spurOf(h.inner)) {
      face.spurs.push({ points: s.points, lines: s.lines });
      entry.names.push(`S:${s.name}`);
    }
  }
  for (const { names, face } of named) {
    const [o, ...rest] = names;
    face.id = frameHash([o, ...rest.sort()].join('|'));
  }
  const result: FrameFace[] = faces.map(({ ring: _ring, part: _part, ...f }) => f);
  result.sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  const vertices: number[] = [];
  for (let v = 0; v < nv; v++) vertices.push(vx[v] * unit, vy[v] * unit);
  return {
    vertices,
    edges: edgeLines.map((l, e) => ({ a: ea[e], b: eb[e], lines: l })),
    faces: result,
  };
}

/** A face's ring, closed off at `plain`'s points, as a list of [x, y] points: what most of the generator works on. */
export function facePoints(f: FrameFace, which: 'outer' | 'plain' = 'plain'): [number, number][] {
  const r = f[which];
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < r.length; i += 2) pts.push([r[i], r[i + 1]]);
  return pts;
}
