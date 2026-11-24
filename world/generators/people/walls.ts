// Continuous terrain-conforming perimeter walls, village enclosures, corner towers, and roofed gatehouses.
//
// Replaces discrete horizontal instanced boxes (which stair-stepped and exposed gaps on slopes) with mitered
// continuous extruded curtain walls seated on deep foundation skirts below local terrain, split cleanly at road
// gate openings and crowned with real multi-part gatehouse assemblies and corner watchtowers.
import type { EnclosureWord } from '../../../core/dwelling.ts';
import { box, gable, hip, limb, MAT, type Mesh } from '../city/kit.ts';
import { hash2 } from '../city/math.ts';
import type { GroundHeight } from './fieldworks.ts';
import type { WallWord } from './works.ts';

export interface GateOpening {
  /** world position of the gate centre on the perimeter */
  x: number;
  y: number;
  /** outward unit normal direction (road heading out of the settlement) */
  dx: number;
  dy: number;
  /** clear roadway opening width, m */
  width: number;
}

export interface PerimeterSpec {
  /** closed polygon ring of world [x, y] corners (CCW or CW; automatically oriented) */
  ring: [number, number][];
  /** road openings carved through the perimeter */
  gates: GateOpening[];
  /** town wall material word, or village enclosure word */
  kind: WallWord | Exclude<EnclosureWord, 'none'>;
  /** wall height above local terrain, m */
  height: number;
  /** base thickness, m */
  thickness: number;
  /** optional material override (MAT constant) */
  stuff?: number;
  /** roof material for gatehouse pavilions & watchtowers (e.g. MAT.claytile or MAT.thatch) */
  roofMat?: number;
  /** whether to add interval/corner towers (defaults true for stone/brick/rammed-earth/mudbrick/wall) */
  towers?: boolean;
  /** optional outer moat width outside the wall, m */
  moat?: number;
  /** picking entity id */
  entity: number;
  seed: number;
}

const MAT_OF: Record<string, number> = {
  earth: MAT.mud,
  bank: MAT.earth,
  'rammed-earth': MAT.mud,
  mudbrick: MAT.adobe,
  stone: MAT.rubble,
  brick: MAT.brick,
  wall: MAT.mud,
  timber: MAT.logs,
  palisade: MAT.logs,
  fence: MAT.wood,
  hedge: MAT.broad,
  ditch: MAT.earth,
};

/** Signed area of a 2D ring (> 0 for CCW). */
function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    a += x0 * y1 - x1 * y0;
  }
  return a * 0.5;
}

/** Subdivide closed polygon into vertices spaced at most `step` m apart, recording arc-length `s`. */
function sampleRing(ring: [number, number][], step: number): { x: number; y: number; s: number; corner: boolean }[] {
  const out: { x: number; y: number; s: number; corner: boolean }[] = [];
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-3) continue;
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      out.push({ x: ax + (bx - ax) * f, y: ay + (by - ay) * f, s: s + len * f, corner: k === 0 });
    }
    s += len;
  }
  return out;
}

/** Build a continuous mitered curtain wall run along `pts` (each with outward normal `(ox, oy)`). */
function extrudeCurtainRun(
  m: Mesh,
  pts: { x: number; y: number; ox: number; oy: number }[],
  g: GroundHeight,
  height: number,
  halfBase: number,
  halfTop: number,
  skirt: number,
  mat: number,
  tint: number,
  crenellated: boolean,
  capMat?: number,
): void {
  const n = pts.length;
  if (n < 2) return;

  // Sample ground elevations and compute gently smoothed top heights so wall-walk flows naturally across hills.
  const zG = new Float64Array(n);
  const zT = new Float64Array(n);
  const uAt = new Float64Array(n);
  let uAcc = 0;
  for (let i = 0; i < n; i++) {
    zG[i] = g.at(pts[i].x, pts[i].y);
    if (i > 0) uAcc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    uAt[i] = uAcc;
  }
  for (let i = 0; i < n; i++) {
    const zPrev = zG[Math.max(0, i - 1)];
    const zNext = zG[Math.min(n - 1, i + 1)];
    const smooth = zG[i] * 0.5 + (zPrev + zNext) * 0.25;
    zT[i] = Math.max(zG[i] + height * 0.88, smooth + height);
  }

  // Compute mitered perpendicular vectors at each vertex (clamped to avoid spikes at sharp bends).
  const mx = new Float64Array(n);
  const my = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    let nx = p.ox;
    let ny = p.oy;
    if (i > 0 && i < n - 1) {
      const ax = p.x - pts[i - 1].x;
      const ay = p.y - pts[i - 1].y;
      const al = Math.hypot(ax, ay) || 1;
      const bx = pts[i + 1].x - p.x;
      const by = pts[i + 1].y - p.y;
      const bl = Math.hypot(bx, by) || 1;
      // Outward normals for CCW ring: right of tangent = (ty, -tx)
      const n0x = ay / al;
      const n0y = -ax / al;
      const n1x = by / bl;
      const n1y = -bx / bl;
      const sx = n0x + n1x;
      const sy = n0y + n1y;
      const sl = Math.hypot(sx, sy);
      if (sl > 0.2) {
        const ux = sx / sl;
        const uy = sy / sl;
        const dot = Math.max(0.55, ux * n0x + uy * n0y);
        const miter = Math.min(1.5, 1 / dot);
        nx = ux * miter;
        ny = uy * miter;
      }
    }
    mx[i] = nx;
    my[i] = ny;
  }

  const slopeLen = Math.hypot(halfBase - halfTop, height) || 1;
  const sideUp = (halfBase - halfTop) / slopeLen;
  const sideOut = height / slopeLen;

  m.mat = mat;
  m.tint = tint;

  // Outer (+1) and inner (-1) battered curtain faces.
  for (const side of [1, -1]) {
    let pb = -1;
    let pt = -1;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const ox = mx[i] * side;
      const oy = my[i] * side;
      const lenO = Math.hypot(ox, oy) || 1;
      const unx = (ox / lenO) * sideOut;
      const uny = (oy / lenO) * sideOut;
      const zBot = Math.min(zG[i], g.at(p.x + ox * halfBase, p.y + oy * halfBase)) - skirt;
      const vb = m.v(p.x + ox * halfBase, p.y + oy * halfBase, zBot, unx, uny, sideUp, uAt[i], 0, 0.48);
      const vt = m.v(p.x + ox * halfTop, p.y + oy * halfTop, zT[i], unx, uny, sideUp, uAt[i], height + skirt, 0.96);
      if (i > 0) m.quad(pb, vb, vt, pt);
      pb = vb;
      pt = vt;
    }
  }

  // Wall-walk / crest top.
  m.mat = capMat ?? mat;
  m.tint = Math.min(254, tint + 8);
  let pl = -1;
  let pr = -1;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const vo = m.v(p.x + mx[i] * halfTop, p.y + my[i] * halfTop, zT[i], 0, 0, 1, uAt[i], 0, 1);
    const vi = m.v(p.x - mx[i] * halfTop, p.y - my[i] * halfTop, zT[i], 0, 0, 1, uAt[i], halfTop * 2, 0.94);
    if (i > 0) m.quad(pl, vo, vi, pr);
    pl = vo;
    pr = vi;
  }

  // End caps at gate abutments so openings have clean solid jamb faces.
  m.mat = mat;
  m.tint = tint;
  for (const idx of [0, n - 1]) {
    const p = pts[idx];
    const q = pts[idx === 0 ? 1 : n - 2];
    const tx = idx === 0 ? p.x - q.x : p.x - q.x;
    const ty = idx === 0 ? p.y - q.y : p.y - q.y;
    const tl = Math.hypot(tx, ty) || 1;
    const ex = tx / tl;
    const ey = ty / tl;
    const zBot = zG[idx] - skirt;
    const a = m.v(p.x - mx[idx] * halfBase, p.y - my[idx] * halfBase, zBot, ex, ey, 0, 0, 0, 0.55);
    const b = m.v(p.x + mx[idx] * halfBase, p.y + my[idx] * halfBase, zBot, ex, ey, 0, halfBase * 2, 0, 0.55);
    const c = m.v(p.x + mx[idx] * halfTop, p.y + my[idx] * halfTop, zT[idx], ex, ey, 0, halfTop * 2, height + skirt, 0.95);
    const d = m.v(p.x - mx[idx] * halfTop, p.y - my[idx] * halfTop, zT[idx], ex, ey, 0, 0, height + skirt, 0.95);
    m.quad(a, b, c, d);
  }

  // Outer crenellated parapet + merlons along defensive masonry/rammed-earth walls.
  if (crenellated && halfTop >= 0.55) {
    const pThick = Math.min(0.45, halfTop * 0.42);
    const baseH = 0.55;
    m.mat = mat;
    m.tint = Math.max(20, tint - 6);
    // Continuous breastwork strip along the outer crest.
    let po = -1;
    let pi = -1;
    let pto = -1;
    let pti = -1;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const ox = mx[i];
      const oy = my[i];
      const o0x = p.x + ox * halfTop;
      const o0y = p.y + oy * halfTop;
      const i0x = p.x + ox * (halfTop - pThick);
      const i0y = p.y + oy * (halfTop - pThick);
      const lenO = Math.hypot(ox, oy) || 1;
      const vo = m.v(o0x, o0y, zT[i], ox / lenO, oy / lenO, 0, uAt[i], 0, 0.9);
      const vto = m.v(o0x, o0y, zT[i] + baseH, ox / lenO, oy / lenO, 0, uAt[i], baseH, 1);
      const vi = m.v(i0x, i0y, zT[i], -ox / lenO, -oy / lenO, 0, uAt[i], 0, 0.85);
      const vti = m.v(i0x, i0y, zT[i] + baseH, -ox / lenO, -oy / lenO, 0, uAt[i], baseH, 0.98);
      if (i > 0) {
        m.quad(po, vo, vto, pto);
        m.quad(pi, pti, vti, vi);
        m.quad(pto, vto, vti, pti);
      }
      po = vo;
      pi = vi;
      pto = vto;
      pti = vti;
    }

    // Individual merlons along each segment for crisp battlements.
    const merlonPitch = 2.6;
    const merlonW = 1.35;
    const merlonH = 0.62;
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen < 1.5) continue;
      const tx = (b.x - a.x) / segLen;
      const ty = (b.y - a.y) / segLen;
      const nx = ty;
      const ny = -tx;
      const count = Math.floor(segLen / merlonPitch);
      for (let k = 0; k < count; k++) {
        const f = ((k + 0.5) * merlonPitch) / segLen;
        const cx = a.x + (b.x - a.x) * f + nx * (halfTop - pThick * 0.5);
        const cy = a.y + (b.y - a.y) * f + ny * (halfTop - pThick * 0.5);
        const cz = zT[i] + (zT[i + 1] - zT[i]) * f + baseH;
        m.place(cx, cy, cz, nx, ny);
        box(m, -merlonW * 0.5, -pThick * 0.5, -0.05, merlonW * 0.5, pThick * 0.5, merlonH, true);
      }
    }
    m.place(0, 0, 0, 0, 1);
  }
}

/** Draw a bastion / corner watchtower seated deeply into the slope, with optional pitched watchtower roof. */
function drawWatchtower(
  m: Mesh,
  x: number,
  y: number,
  ox: number,
  oy: number,
  g: GroundHeight,
  wallH: number,
  thick: number,
  mat: number,
  roofMat: number,
  tint: number,
): void {
  const side = Math.max(4.4, thick * 1.45);
  const hs = side * 0.5;
  const cx = x + ox * (thick * 0.28);
  const cy = y + oy * (thick * 0.28);
  // Sample lowest corner of tower footprint so skirt reaches deeply underground on steep hills.
  const zMin = Math.min(
    g.at(cx - hs, cy - hs),
    g.at(cx + hs, cy - hs),
    g.at(cx + hs, cy + hs),
    g.at(cx - hs, cy + hs),
  );
  const zRef = g.at(cx, cy);
  const h = wallH * 1.28;
  const zBase = zMin - 2.4;

  m.place(cx, cy, zRef, ox, oy);
  m.mat = mat;
  m.tint = tint;
  // Slightly battered lower masonry/rammed-earth bastion plinth + upper shaft.
  box(m, -hs - 0.3, -hs - 0.3, zBase - zRef, hs + 0.3, hs + 0.3, h * 0.45, true);
  box(m, -hs, -hs, h * 0.4, hs, hs, h, true);
  // Parapet coping around deck.
  const pt = 0.42;
  box(m, -hs, hs - pt, h, hs, hs, h + 0.85, true);
  box(m, -hs, -hs, h, hs, -hs + pt, h + 0.85, true);
  box(m, -hs, -hs, h, -hs + pt, hs, h + 0.85, true);
  box(m, hs - pt, -hs, h, hs, hs, h + 0.85, true);

  // Timber watchtower pavilion atop the deck with hipped roof!
  const ps = hs * 0.72;
  const ph = 2.2;
  m.mat = MAT.wood;
  m.tint = 92;
  for (const sx of [-ps, ps]) {
    for (const sy of [-ps, ps]) {
      limb(m, sx, sy, h, sx, sy, h + ph, 0.14, 0.12, 5);
    }
  }
  m.mat = roofMat;
  m.tint = 126;
  const ring = [-ps - 0.55, -ps - 0.55, ps + 0.55, -ps - 0.55, ps + 0.55, ps + 0.55, -ps - 0.55, ps + 0.55];
  hip(m, ring, h + ph - 0.1, 0.52, 0.25);
  m.place(0, 0, 0, 0, 1);
}

/** Draw a real architectural gatehouse assembly straddling a road opening (flanking towers, portal lintel, open timber gates, roofed pavilion). */
function drawGatehouse(
  m: Mesh,
  gate: GateOpening,
  g: GroundHeight,
  kind: PerimeterSpec['kind'],
  wallH: number,
  thick: number,
  mat: number,
  roofMat: number,
  tint: number,
): void {
  const open = Math.max(3.6, gate.width);
  const halfOpen = open * 0.5;
  const zC = g.at(gate.x, gate.y);
  const tx = -gate.dy;
  const ty = gate.dx;
  const zL = g.at(gate.x - tx * (halfOpen + 2), gate.y - ty * (halfOpen + 2));
  const zR = g.at(gate.x + tx * (halfOpen + 2), gate.y + ty * (halfOpen + 2));
  const zMin = Math.min(zC, zL, zR) - 2.4;

  m.place(gate.x, gate.y, zC, gate.dx, gate.dy);

  if (kind === 'fence' || kind === 'hedge' || kind === 'ditch' || kind === 'earth' || kind === 'bank') {
    // Village gateway: twin stout timber gateposts + overhead lintel beam & small pitched shelter roof.
    m.mat = MAT.wood;
    m.tint = 104;
    const h = Math.max(2.8, wallH * 1.45);
    for (const side of [-1, 1]) {
      const px = side * (halfOpen + 0.25);
      limb(m, px, 0, zMin - zC, px, 0, h, 0.22, 0.18, 6);
      limb(m, px, -0.7, zMin - zC, px, -0.7, h * 0.82, 0.15, 0.13, 5);
    }
    box(m, -halfOpen - 0.55, -0.22, h - 0.28, halfOpen + 0.55, 0.22, h + 0.08, true, true);
    m.mat = roofMat;
    m.tint = 122;
    gable(m, -halfOpen - 0.75, -0.85, halfOpen + 0.75, 0.85, h, 0.75, 0.35, MAT.wood);
    m.place(0, 0, 0, 0, 1);
    return;
  }

  if (kind === 'timber' || kind === 'palisade') {
    // Fortified timber gate tower over the opening.
    const h = Math.max(3.6, wallH * 1.35);
    m.mat = MAT.logs;
    m.tint = 112;
    const tw = 2.0;
    const td = Math.max(2.6, thick * 1.5);
    box(m, -halfOpen - tw, -td * 0.5, zMin - zC, -halfOpen, td * 0.5, h, true);
    box(m, halfOpen, -td * 0.5, zMin - zC, halfOpen + tw, td * 0.5, h, true);
    // Gallery deck over the gateway passage.
    const lintel = Math.min(h * 0.68, 3.8);
    box(m, -halfOpen - tw, -td * 0.5, lintel, halfOpen + tw, td * 0.5, h + 0.6, true, true);
    m.mat = roofMat;
    m.tint = 122;
    gable(m, -halfOpen - tw - 0.3, -td * 0.55, halfOpen + tw + 0.3, td * 0.55, h + 0.6, 1.3, 0.45, MAT.wood);
    m.place(0, 0, 0, 0, 1);
    return;
  }

  // Masonry / rammed-earth / brick monumental gatehouse:
  // Flanking projecting towers, solid arched/lintelled gate bridge, folded open wooden doors, and a prominent hipped pavilion!
  const tSide = Math.max(4.4, thick * 1.5);
  const tH = wallH * 1.32;
  const tDepth = Math.max(thick * 1.35, 4.2);
  const lintel = Math.min(wallH * 0.74, 4.6);

  m.mat = mat;
  m.tint = tint;
  // Left & right flanking gate towers (with subtle outward projection and deep foundation skirts).
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -halfOpen - tSide : halfOpen;
    const x1 = side < 0 ? -halfOpen : halfOpen + tSide;
    // Slightly wider plinth base.
    box(m, x0 - 0.25, -tDepth * 0.45 - 0.25, zMin - zC, x1 + 0.25, tDepth * 0.55 + 0.25, wallH * 0.45, true);
    box(m, x0, -tDepth * 0.45, wallH * 0.4, x1, tDepth * 0.55, tH, true);
    // Parapet crown on flanking towers.
    box(m, x0, tDepth * 0.55 - 0.42, tH, x1, tDepth * 0.55, tH + 0.85, true);
  }

  // Bridge wall spanning over the roadway opening.
  box(m, -halfOpen - 0.2, -thick * 0.5, lintel, halfOpen + 0.2, thick * 0.5, wallH, true, true);
  // Dark timber lintel beam + corbels framing the passage ceiling.
  m.mat = MAT.wood;
  m.tint = 86;
  box(m, -halfOpen - 0.3, -thick * 0.52, lintel - 0.36, halfOpen + 0.3, thick * 0.52, lintel + 0.04, true, true);
  // Open wooden gate leaves swung inward against the tunnel jambs.
  const leafW = Math.min(halfOpen * 0.85, 2.2);
  box(m, -halfOpen + 0.05, -thick * 0.4 - leafW, -0.3, -halfOpen + 0.25, -thick * 0.4, lintel - 0.45, true);
  box(m, halfOpen - 0.25, -thick * 0.4 - leafW, -0.3, halfOpen - 0.05, -thick * 0.4, lintel - 0.45, true);

  // Upper gatehouse timber pavilion straddling the portal (iconic Han & East Asian / medieval landmark silhouette!).
  const pavW = open + tSide * 0.9;
  const pavD = Math.max(3.6, thick * 0.95);
  const pavZ = wallH;
  const pavH = Math.max(2.6, wallH * 0.48);
  // Pavilion walls / colonnade.
  m.mat = MAT.wood;
  m.tint = 94;
  const cols = 4;
  for (let i = 0; i <= cols; i++) {
    const px = -pavW * 0.46 + (pavW * 0.92 * i) / cols;
    limb(m, px, pavD * 0.44, pavZ, px, pavD * 0.44, pavZ + pavH, 0.16, 0.14, 5);
    limb(m, px, -pavD * 0.44, pavZ, px, -pavD * 0.44, pavZ + pavH, 0.16, 0.14, 5);
  }
  // Recessed timber/plaster core hall inside the colonnade.
  m.mat = MAT.planks;
  m.tint = 102;
  box(m, -pavW * 0.38, -pavD * 0.32, pavZ, pavW * 0.38, pavD * 0.32, pavZ + pavH - 0.1, true);
  // Sweeping overhanging roof over the gatehouse pavilion!
  m.mat = roofMat;
  m.tint = 128;
  const over = 0.95;
  const roofRing = [
    -pavW * 0.5 - over,
    -pavD * 0.5 - over,
    pavW * 0.5 + over,
    -pavD * 0.5 - over,
    pavW * 0.5 + over,
    pavD * 0.5 + over,
    -pavW * 0.5 - over,
    pavD * 0.5 + over,
  ];
  hip(m, roofRing, pavZ + pavH - 0.1, 0.48, 0.25);

  m.place(0, 0, 0, 0, 1);
}

/**
 * Extrude a complete continuous terrain-conforming settlement perimeter (curtain wall/enclosure, optional moat,
 * corner & interval watchtowers, and architectural gatehouses) into static mesh `m`.
 */
export function buildPerimeterMesh(m: Mesh, spec: PerimeterSpec, g: GroundHeight): { runs: number; towers: number; gates: number } {
  if (spec.ring.length < 3) return { runs: 0, towers: 0, gates: 0 };
  const keepEntity = m.entity;
  m.entity = spec.entity;

  // Ensure CCW winding so outward normal is consistently right of tangent (ty, -tx).
  const ring: [number, number][] = ringArea(spec.ring) >= 0 ? spec.ring.map((p) => [p[0], p[1]]) : [...spec.ring].reverse().map((p) => [p[0], p[1]]);
  const step = 4.5;
  const sampled = sampleRing(ring, step);
  const n = sampled.length;
  if (n < 3) {
    m.entity = keepEntity;
    return { runs: 0, towers: 0, gates: 0 };
  }

  // Compute outward unit normal at each sampled point.
  const pts = sampled.map((p, i) => {
    const prev = sampled[(i - 1 + n) % n];
    const next = sampled[(i + 1) % n];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    return { ...p, ox: ty / tl, oy: -tx / tl };
  });

  // Mark points that fall inside any gate opening clearance (always wide enough to catch at least one sample).
  const blocked = new Uint8Array(n);
  for (const gate of spec.gates) {
    const clear = Math.max(step * 0.65, gate.width * 0.55);
    let any = false;
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(pts[i].x - gate.x, pts[i].y - gate.y);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
      if (d <= clear) {
        blocked[i] = 1;
        any = true;
      }
    }
    if (!any && bestD < step * 1.5) blocked[bestI] = 1;
  }

  // Extract contiguous unblocked curtain arcs (handling wrap-around at index 0 cleanly!).
  const runsPts: typeof pts[] = [];
  let start = 0;
  if (blocked.some((b) => b === 1)) {
    while (start < n && blocked[start] === 0) start++;
    let i = start;
    while (i < start + n) {
      while (i < start + n && blocked[i % n] === 1) i++;
      if (i >= start + n) break;
      const run: typeof pts = [];
      while (i < start + n && blocked[i % n] === 0) {
        run.push(pts[i % n]);
        i++;
      }
      if (run.length >= 2) runsPts.push(run);
    }
  } else {
    runsPts.push([...pts, pts[0]]);
  }

  const mat = spec.stuff ?? MAT_OF[spec.kind] ?? MAT.mud;
  const roofMat = spec.roofMat ?? (spec.kind === 'stone' || spec.kind === 'brick' || spec.kind === 'rammed-earth' ? MAT.claytile : MAT.thatch);
  const tint = 118 + Math.floor(hash2(spec.seed, 3, 19) * 20);
  const isFortified = spec.kind === 'rammed-earth' || spec.kind === 'stone' || spec.kind === 'brick' || spec.kind === 'mudbrick' || spec.kind === 'wall';
  const hasTowers = spec.towers ?? (isFortified && spec.height >= 2.6);

  const halfBase = Math.max(0.25, spec.thickness * 0.5);
  const batter = spec.kind === 'earth' || spec.kind === 'bank' ? 0.35 : spec.kind === 'rammed-earth' ? 0.62 : spec.kind === 'hedge' ? 0.65 : isFortified ? 0.86 : 0.9;
  const halfTop = Math.max(0.16, halfBase * batter);
  const skirt = isFortified ? 2.4 : 1.1;
  const capMat = spec.kind === 'earth' || spec.kind === 'bank' ? MAT.grass : undefined;

  // Extrude continuous curtain arcs.
  for (const run of runsPts) {
    if (spec.kind === 'fence') {
      // Continuous wooden rail & posts draped over terrain.
      extrudeCurtainRun(m, run, g, spec.height * 0.2, 0.12, 0.1, 0.5, MAT.wood, tint, false);
      m.mat = MAT.wood;
      m.tint = tint;
      for (let i = 0; i < run.length; i++) {
        const p = run[i];
        const z = g.at(p.x, p.y);
        limb(m, p.x, p.y, z - 0.4, p.x, p.y, z + spec.height, 0.08, 0.07, 5);
        if (i + 1 < run.length) {
          const q = run[i + 1];
          const z2 = g.at(q.x, q.y);
          limb(m, p.x, p.y, z + spec.height * 0.55, q.x, q.y, z2 + spec.height * 0.55, 0.05, 0.05, 4);
          limb(m, p.x, p.y, z + spec.height * 0.85, q.x, q.y, z2 + spec.height * 0.85, 0.05, 0.05, 4);
        }
      }
    } else {
      extrudeCurtainRun(m, run, g, spec.height, halfBase, halfTop, skirt, mat, tint, isFortified && spec.height >= 2.5, capMat);
    }

    // Optional outer moat water channel offset outside the curtain!
    if (spec.moat && spec.moat > 1) {
      const moatOff = halfBase + spec.moat * 0.5 + 1.8;
      const moatPts = run.map((p) => ({ ...p, x: p.x + p.ox * moatOff, y: p.y + p.oy * moatOff }));
      extrudeCurtainRun(m, moatPts, g, 0.14, spec.moat * 0.5, spec.moat * 0.46, 0.9, MAT.pool, 128, false, MAT.pool);
    }
  }

  // Place corner & interval watchtowers along fortified walls (staying clear of gates and adjacent corners).
  let towerCount = 0;
  if (hasTowers) {
    const towerSpacing = 48;
    const minCornerGap = 22;
    const totalLen = pts[n - 1].s + Math.hypot(pts[0].x - pts[n - 1].x, pts[0].y - pts[n - 1].y);
    let firstS = -1;
    let lastS = -towerSpacing;
    for (let i = 0; i < n; i++) {
      if (blocked[i]) continue;
      const p = pts[i];
      const nearGate = spec.gates.some((gt) => Math.hypot(p.x - gt.x, p.y - gt.y) < gt.width + 10);
      if (nearGate) continue;
      if (firstS >= 0 && totalLen - p.s + firstS < minCornerGap) continue;
      if ((p.corner && p.s - lastS >= minCornerGap) || p.s - lastS >= towerSpacing) {
        drawWatchtower(m, p.x, p.y, p.ox, p.oy, g, spec.height, spec.thickness, mat, roofMat, tint);
        if (firstS < 0) firstS = p.s;
        lastS = p.s;
        towerCount++;
      }
    }
  }

  // Draw real gatehouses at every road opening.
  for (const gate of spec.gates) {
    drawGatehouse(m, gate, g, spec.kind, spec.height, spec.thickness, mat, roofMat, tint);
  }

  m.entity = keepEntity;
  return { runs: runsPts.length, towers: towerCount, gates: spec.gates.length };
}
