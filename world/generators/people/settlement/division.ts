// The division of a face of a settlement's frame (docs/plans/CITIES.md, decision 4): lanes, the blocks between them,
// and the plots along the blocks' fronts. The land is divided once. A face is divided into lanes and blocks whether it
// is farmed or built on: its blocks are fields while the settlement has not reached them, and are cut into plots when
// it does. So a field's lanes become a quarter's streets, and nothing moves under a visitor as the years pass.
//
// A face is cut where its own seed and shape say, on its own: by a planned grid where the settlement's plan has one,
// laid over the whole settlement so that its streets run on from one face to the next; elsewhere across its longer
// side, or along the contours where the ground is steep. Every cut that makes blocks is a lane, so every block reaches
// a lane or the face's own edge. Blocks are cut into plots only so that each keeps a front on a lane or a street.
//
// It is the generator's (gen:people/settlement): the sizes come from its parameters and the tradition, and nothing
// here is a claim. Like every generator it is seeded by its slots; its numbers are compared by fingerprint.

import { area, centroid, minBox, Rng, hashString, type Poly } from '../../city/math.ts';

export interface DivisionSizes {
  /** the side of a block, m, before it is cut into plots */
  block: number;
  /** how wide a lane is, m */
  lane: number;
  /** a plot's front, m: the narrowest and widest */
  front: [number, number];
  /** a plot's depth from its front, m: the shallowest and deepest */
  depth: [number, number];
}

export interface DivisionGrid {
  /** the direction of the grid's first streets, radians from +x */
  angle: number;
  /** a point the grid's streets pass through, local metres */
  ox: number;
  oy: number;
  /** a block's two sides, m, between the streets */
  block: [number, number];
  /** how wide its streets are, m */
  street: number;
}

export interface DivisionInput {
  /** the face's ring, counter-clockwise, x, y pairs in local metres */
  ring: Poly;
  /** for each side of the ring, whether people reach the face across it (a street or a route, not a wall or water) */
  open: boolean[];
  /** what lies in the face and is not of it, and footprints that take the plots they cover: rings */
  reserved?: Poly[];
  /** the face's identity, which seeds every choice in it */
  seed: string;
  sizes: DivisionSizes;
  /** a planned grid, where the settlement's plan has one for this face */
  grid?: DivisionGrid;
  /** the ground's gradient at a place, where the ground is known: lanes follow the contours where it is steep */
  gradient?: (x: number, y: number) => [number, number];
  /** a slope above which lanes are laid along the contours */
  steep?: number;
  /**
   * Whether any of a box (x0, y0, x1, y1) is wanted: a piece no part of which is wanted is not divided further, and a
   * block that is not wanted is not cut into plots. Every piece is cut by its own seed and shape, so a piece divided
   * later is divided as it would have been at once: what is wanted changes how much is made, never what.
   */
  need?: (x0: number, y0: number, x1: number, y1: number) => boolean;
}

export interface DivisionLane {
  id: string;
  /** a segment, x0, y0, x1, y1 */
  line: number[];
  width: number;
}

export interface DivisionBlock {
  id: string;
  ring: Poly;
  /** for each side, whether it lies on a lane or an open side of the face */
  open: boolean[];
  /** square metres */
  area: number;
}

export interface DivisionPlot {
  id: string;
  ring: Poly;
  /** the block it was cut from, by index */
  block: number;
  /** its front: the side it is reached by, x0, y0, x1, y1, and the direction it faces, radians from +x */
  front: [number, number, number, number];
  facing: number;
  /** its centre */
  x: number;
  y: number;
  /** square metres */
  area: number;
}

export interface Division {
  lanes: DivisionLane[];
  blocks: DivisionBlock[];
  plots: DivisionPlot[];
}

/** A polygon with, for each vertex, whether the side from it to the next is open. */
interface Piece {
  p: Poly;
  open: boolean[];
}

/**
 * A simple polygon cut by the line n·x = c into its pieces on either side. Each vertex carries whether its outgoing
 * side is open; sides made along the cut are open when `cutOpen` is. Vertices on the line count as on its positive
 * side, so no crossing falls on a vertex.
 */
export function splitPiece(q: Piece, nx: number, ny: number, c: number, cutOpen: boolean): { neg: Piece[]; pos: Piece[]; chords: number[][] } {
  const p = q.p;
  const n = p.length / 2;
  const d: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = p[i * 2] * nx + p[i * 2 + 1] * ny - c;
    d.push(v === 0 ? 1e-9 : v);
  }
  // The ring with the crossings put in. A crossing knows the open-ness of the side it lies on.
  interface Node {
    x: number;
    y: number;
    open: boolean;
    cross: boolean;
    s: number;
    partner: number;
    side: number;
  }
  const nodes: Node[] = [];
  const crossings: number[] = [];
  const tx = -ny;
  const ty = nx;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    nodes.push({ x: p[i * 2], y: p[i * 2 + 1], open: q.open[i], cross: false, s: 0, partner: -1, side: d[i] > 0 ? 1 : -1 });
    if (d[i] > 0 !== d[j] > 0) {
      const t = d[i] / (d[i] - d[j]);
      const x = p[i * 2] + (p[j * 2] - p[i * 2]) * t;
      const y = p[i * 2 + 1] + (p[j * 2 + 1] - p[i * 2 + 1]) * t;
      crossings.push(nodes.length);
      nodes.push({ x, y, open: q.open[i], cross: true, s: x * tx + y * ty, partner: -1, side: 0 });
    }
  }
  if (crossings.length < 2) {
    const side = d[0] > 0 ? 'pos' : 'neg';
    return { neg: side === 'neg' ? [q] : [], pos: side === 'pos' ? [q] : [], chords: [] };
  }
  const sorted = [...crossings].sort((a, b) => nodes[a].s - nodes[b].s);
  const chords: number[][] = [];
  for (let k = 0; k + 1 < sorted.length; k += 2) {
    nodes[sorted[k]].partner = sorted[k + 1];
    nodes[sorted[k + 1]].partner = sorted[k];
    const a = nodes[sorted[k]];
    const b = nodes[sorted[k + 1]];
    chords.push([a.x, a.y, b.x, b.y]);
  }
  const m = nodes.length;
  const seen = new Uint8Array(m);
  const walk = (side: number): Piece[] => {
    const out: Piece[] = [];
    for (let s = 0; s < m; s++) {
      if (seen[s] || nodes[s].cross || nodes[s].side !== side) continue;
      const poly: number[] = [];
      const open: boolean[] = [];
      let i = s;
      let guard = 0;
      do {
        const nd = nodes[i];
        if (!nd.cross) {
          seen[i] = 1;
          poly.push(nd.x, nd.y);
          open.push(nd.open);
          i = (i + 1) % m;
        } else {
          // Out along the cut to its partner, then on along the side the partner lies on.
          poly.push(nd.x, nd.y);
          open.push(cutOpen);
          const pt = nodes[nd.partner];
          poly.push(pt.x, pt.y);
          open.push(pt.open);
          i = (nd.partner + 1) % m;
        }
      } while (i !== s && ++guard < m * 4);
      if (poly.length >= 6 && area(poly) > 1e-6) out.push({ p: poly, open });
    }
    return out;
  };
  return { neg: walk(-1), pos: walk(1), chords };
}

/** Cut a piece by a lane of width w along n·x = c: the pieces either side, and the lane's own lines. */
function cutLane(q: Piece, nx: number, ny: number, c: number, w: number): { pieces: Piece[]; chords: number[][] } {
  const a = splitPiece(q, nx, ny, c - w / 2, true);
  const b = splitPiece(q, nx, ny, c + w / 2, true);
  const mid = splitPiece(q, nx, ny, c, true);
  return { pieces: [...a.neg, ...b.pos], chords: mid.chords };
}

const isOpen = (q: Piece) => q.open.some((o) => o);

/** Drop pieces too small or too thin to be anything. */
const fit = (q: Piece, least: number) => {
  const a = area(q.p);
  if (a < least) return false;
  const b = minBox(q.p);
  return b.hw > 0.6 && a / (4 * b.hl * b.hw) > 0.25;
};

/** Divide a face into lanes, blocks and plots. */
export function divideFace(input: DivisionInput): Division {
  const { sizes } = input;
  const lanes: DivisionLane[] = [];
  const blocks: DivisionBlock[] = [];
  const plots: DivisionPlot[] = [];
  const seedOf = (path: string) => hashString(`${input.seed}/${path}`);
  const root: Piece = { p: input.ring, open: input.open.slice() };
  const blockArea = sizes.block * sizes.block;

  const need = input.need;
  const wanted = (p: Poly) => {
    if (!need) return true;
    const [x0, y0, x1, y1] = boxOf(p);
    return need(x0, y0, x1, y1);
  };
  // Blocks: by a grid, or by cutting each piece across until it is a block's size.
  const blockPieces: { q: Piece; path: string }[] = [];
  if (input.grid) {
    const g = input.grid;
    // The grid's own axes: u along its first streets' blocks, v across them. Its streets lie between cells, every
    // block's side plus a street's width from the grid's origin, so they line up across faces.
    const ux = Math.cos(g.angle);
    const uy = Math.sin(g.angle);
    const vx = -uy;
    const vy = ux;
    const su = g.block[0] + g.street;
    const sv = g.block[1] + g.street;
    let ulo = Infinity;
    let uhi = -Infinity;
    let vlo = Infinity;
    let vhi = -Infinity;
    for (let i = 0; i < root.p.length; i += 2) {
      const u = (root.p[i] - g.ox) * ux + (root.p[i + 1] - g.oy) * uy;
      const v = (root.p[i] - g.ox) * vx + (root.p[i + 1] - g.oy) * vy;
      ulo = Math.min(ulo, u);
      uhi = Math.max(uhi, u);
      vlo = Math.min(vlo, v);
      vhi = Math.max(vhi, v);
    }
    const toXY = (u: number, v: number): [number, number] => [g.ox + u * ux + v * vx, g.oy + u * uy + v * vy];
    // The streets: each grid line that crosses the face, where it is wanted.
    for (const [fi, nx, ny, step, lo, hi] of [[0, vx, vy, sv, vlo, vhi], [1, ux, uy, su, ulo, uhi]] as const) {
      const o = g.ox * nx + g.oy * ny;
      for (let k = Math.ceil(lo / step - 0.5); k <= Math.floor(hi / step - 0.5); k++) {
        const c = o + (k + 0.5) * step;
        for (const [ci, ch] of splitPiece(root, nx, ny, c, true).chords.entries()) {
          const [x0, y0, x1, y1] = ch;
          if (need && !need(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1))) continue;
          lanes.push({ id: `${input.seed}/grid${fi}:${k}:${ci}`, line: ch, width: g.street });
        }
      }
    }
    // The blocks: each cell of the grid, less half a street on every side, clipped to the face.
    for (let i = Math.floor(ulo / su); i <= Math.floor(uhi / su); i++)
      for (let j = Math.floor(vlo / sv); j <= Math.floor(vhi / sv); j++) {
        const u0 = i * su + g.street / 2 - su / 2;
        const v0 = j * sv + g.street / 2 - sv / 2;
        const rect = [toXY(u0, v0), toXY(u0 + g.block[0], v0), toXY(u0 + g.block[0], v0 + g.block[1]), toXY(u0, v0 + g.block[1])].flat();
        if (!wanted(rect)) continue;
        let q: Piece = root;
        // Clip to each side of the cell in turn: the side kept is the cell's, and what it cuts along is a street.
        const sides: [number, number, number][] = [
          [-ux, -uy, -(u0 + g.ox * ux + g.oy * uy)],
          [ux, uy, u0 + g.block[0] + g.ox * ux + g.oy * uy],
          [-vx, -vy, -(v0 + g.ox * vx + g.oy * vy)],
          [vx, vy, v0 + g.block[1] + g.ox * vx + g.oy * vy],
        ];
        let parts: Piece[] = [q];
        for (const [nx, ny, c] of sides) {
          const next: Piece[] = [];
          for (const part of parts) next.push(...splitPiece(part, nx, ny, c, true).neg);
          parts = next;
          if (!parts.length) break;
        }
        parts.forEach((part, pi) => {
          q = part;
          if (fit(q, 4)) blockPieces.push({ q, path: `g${i},${j}.${pi}` });
        });
      }
  } else {
    const stack: { q: Piece; path: string; depth: number }[] = [{ q: root, path: 'b', depth: 0 }];
    while (stack.length) {
      const { q, path, depth } = stack.pop()!;
      if (!wanted(q.p)) continue;
      const a = area(q.p);
      const rng = new Rng(seedOf(path));
      if (a <= blockArea * rng.range(0.7, 1.4) || depth > 24) {
        if (fit(q, 4)) blockPieces.push({ q, path });
        continue;
      }
      const box = minBox(q.p);
      let nx = box.ux;
      let ny = box.uy;
      let c = box.cx * nx + box.cy * ny + rng.range(-0.15, 0.15) * box.hl * 2;
      const [cx, cy] = centroid(q.p);
      const grad = input.gradient?.(cx, cy);
      if (grad) {
        const s = Math.hypot(grad[0], grad[1]);
        // On steep ground the lane runs along the contour: its normal points up the slope.
        if (s > (input.steep ?? 0.08) && rng.next() < Math.min(1, s / (input.steep ?? 0.08) - 0.5)) {
          nx = grad[0] / s;
          ny = grad[1] / s;
          let lo = Infinity;
          let hi = -Infinity;
          for (let i = 0; i < q.p.length; i += 2) {
            const v = q.p[i] * nx + q.p[i + 1] * ny;
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
          }
          c = (lo + hi) / 2 + rng.range(-0.15, 0.15) * (hi - lo);
        }
      }
      const { pieces, chords } = cutLane(q, nx, ny, c, sizes.lane);
      if (pieces.length < 2) {
        if (fit(q, 4)) blockPieces.push({ q, path });
        continue;
      }
      chords.forEach((ch, ci) => lanes.push({ id: `${input.seed}/${path}:${ci}`, line: ch, width: sizes.lane }));
      pieces.forEach((pc, pi) => stack.push({ q: pc, path: `${path}${pi}`, depth: depth + 1 }));
    }
  }
  // Blocks in a fixed order, by where they were cut from.
  blockPieces.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const reserved = input.reserved ?? [];
  const inReserved = (x: number, y: number) => reserved.some((r) => inRing(r, x, y));
  blockPieces.forEach(({ q, path }) => {
    const [bx, by] = centroid(q.p);
    if (inReserved(bx, by) && area(q.p) < blockArea * 0.5) return;
    const bi = blocks.length;
    blocks.push({ id: `${input.seed}/${path}`, ring: q.p, open: q.open, area: area(q.p) });
    if (!isOpen(q) || !wanted(q.p)) return;
    // Plots: cut each piece in two, keeping both halves open to a lane, until a plot is its tradition's size.
    const plotArea = ((sizes.front[0] + sizes.front[1]) / 2) * ((sizes.depth[0] + sizes.depth[1]) / 2);
    const stack: { q: Piece; path: string; depth: number }[] = [{ q, path: 'p', depth: 0 }];
    while (stack.length) {
      const { q: r, path: pp, depth } = stack.pop()!;
      const rng = new Rng(seedOf(`${path}/${pp}`));
      const a = area(r.p);
      let done = a <= plotArea * rng.range(0.75, 1.35) || depth > 20;
      if (!done) {
        const box = minBox(r.p);
        // Across the longer side first, so that plots are strips off the lane; then along it.
        const tries: [number, number][] = [[box.ux, box.uy], [-box.uy, box.ux]];
        let made = false;
        for (const [nx, ny] of tries) {
          const extent = nx === box.ux && ny === box.uy ? box.hl : box.hw;
          const c = box.cx * nx + box.cy * ny + rng.range(-0.12, 0.12) * extent * 2;
          const s = splitPiece(r, nx, ny, c, false);
          const halves = [...s.neg, ...s.pos];
          if (halves.length >= 2 && halves.every(isOpen) && halves.every((h) => fit(h, 2))) {
            halves.forEach((h, hi) => stack.push({ q: h, path: `${pp}${hi}`, depth: depth + 1 }));
            made = true;
            break;
          }
        }
        done = !made;
      }
      if (!done) continue;
      const [x, y] = centroid(r.p);
      if (inReserved(x, y)) continue;
      const front = frontOf(r);
      if (!front) continue;
      const fx = (front[0] + front[2]) / 2;
      const fy = (front[1] + front[3]) / 2;
      plots.push({ id: `${input.seed}/${path}/${pp}`, ring: r.p, block: bi, front, facing: Math.atan2(fy - y, fx - x), x, y, area: a });
    }
  });
  return { lanes, blocks, plots };
}

/** The longest open side of a piece: the front it is reached by. */
function frontOf(q: Piece): [number, number, number, number] | undefined {
  let best = -1;
  let len = 0;
  const n = q.p.length / 2;
  for (let i = 0; i < n; i++) {
    if (!q.open[i]) continue;
    const j = (i + 1) % n;
    const l = Math.hypot(q.p[j * 2] - q.p[i * 2], q.p[j * 2 + 1] - q.p[i * 2 + 1]);
    if (l > len) {
      len = l;
      best = i;
    }
  }
  if (best < 0) return undefined;
  const j = (best + 1) % n;
  return [q.p[best * 2], q.p[best * 2 + 1], q.p[j * 2], q.p[j * 2 + 1]];
}

function boxOf(p: Poly): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i]);
    x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]);
    y1 = Math.max(y1, p[i + 1]);
  }
  return [x0, y0, x1, y1];
}

function inRing(r: Poly, x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const yi = r[i + 1];
    const yj = r[j + 1];
    if (yi > y !== yj > y && x < ((r[j] - r[i]) * (y - yi)) / (yj - yi) + r[i]) c = !c;
  }
  return c;
}
