// Physical 3D fieldworks draped on terrain: earthen bunds/dikes, dry-stone field walls, hedgerows, irrigation ditches,
// contour-following hillside terrace retaining risers, and field-margin tree positions.
//
// Everything aligns with `core/plots.ts` (macro-domain parcels + TERRACE_STEP contours) so 3D fieldworks sit cleanly on
// the same boundaries the ground shader and crop sowing use, with deep skirts below ground so sloping terrain never
// leaves floating undersides or stair-steps. Nothing here is a historical survey of individual field boundaries.
import {
  FIELD_SLOPE,
  PLOT_LOOK,
  plotDomainAt,
  plotDomainsInBox,
  plotNumber,
  plotPlaceInDomain,
  TERRACE_STEP,
  worldToDomain,
  type PlotStyle,
} from '../../../core/plots.ts';
import { MAT, Mesh } from '../city/kit.ts';
import { hash2 } from '../city/math.ts';

export type FieldBoundKind = 'none' | 'banks' | 'walls' | 'hedges' | 'ditches' | 'dikes';

export interface FieldUseSampler {
  at(x: number, y: number, out: { crop: number; pasture: number; yard: number; paddy: number }): void;
}

export interface GroundHeight {
  at(x: number, y: number): number;
}

export interface FieldTreeSpot {
  x: number;
  y: number;
  scale: number;
  /** deterministic 0..1 seed for picking native broadleaf/shrub form */
  u: number;
}

export interface FieldworksSpec {
  style: PlotStyle;
  bounds: FieldBoundKind;
  /** bounding radius around (cx, cy) in which to build 3D fieldworks, m */
  radius: number;
  cx?: number;
  cy?: number;
  seed: number;
  /** optional exclusion test (e.g. near roads/rivers/settlement cores) returning true to skip a point */
  avoid?: (x: number, y: number) => boolean;
}

export interface FieldworksResult {
  /** number of continuous boundary/terrace polylines extruded */
  runs: number;
  /** field-corner and headland tree/shrub placements for natural hedgerow cohesion */
  trees: FieldTreeSpot[];
}

/** Estimate local terrain slope magnitude (≈ sin θ) and downhill gradient at (x, y). */
function terrainSlope(g: GroundHeight, x: number, y: number, d = 3): { slope: number; gx: number; gy: number } {
  const gx = (g.at(x + d, y) - g.at(x - d, y)) / (2 * d);
  const gy = (g.at(x, y + d) - g.at(x, y - d)) / (2 * d);
  const g2 = gx * gx + gy * gy;
  return { slope: Math.sqrt(g2 / (1 + g2)), gx, gy };
}

/**
 * Extrude a continuous terrain-draped trapezoidal prism along polyline `pts` (each `[x, y]`).
 * `halfBase` and `halfTop` define the battered profile; `skirt` embeds the base below the local terrain height
 * so slopes never expose floating undersides; `topMat` may differ from `sideMat` (e.g. grass-capped earth bund).
 */
function extrudeRibbon(
  m: Mesh,
  pts: [number, number][],
  g: GroundHeight,
  halfBase: number,
  halfTop: number,
  height: number,
  skirt: number,
  sideMat: number,
  topMat: number,
  sideTint: number,
  topTint: number,
  heightJitter = 0,
  seed = 1,
): void {
  const n = pts.length;
  if (n < 2) return;
  const zAt = new Float64Array(n);
  const hAt = new Float64Array(n);
  const nxArr = new Float64Array(n);
  const nyArr = new Float64Array(n);
  const uAt = new Float64Array(n);

  let uAcc = 0;
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    zAt[i] = g.at(x, y);
    const fade = i === 0 || i === n - 1 ? 0.25 : 1;
    hAt[i] = height * fade * (1 + heightJitter * (hash2(i, seed, 7) - 0.5) * 2);
    if (i > 0) uAcc += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
    uAt[i] = uAcc;

    // Smoothed miter normal perpendicular to polyline tangent.
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    const tx = pts[i1][0] - pts[i0][0];
    const ty = pts[i1][1] - pts[i0][1];
    const tl = Math.hypot(tx, ty) || 1;
    nxArr[i] = -ty / tl;
    nyArr[i] = tx / tl;
  }

  // Left and right side faces with ground-contact AO darkening at base (`light = 0.55`).
  m.mat = sideMat;
  m.tint = sideTint;
  const slopeLen = Math.hypot(halfBase - halfTop, height) || 1;
  const sideUp = (halfBase - halfTop) / slopeLen;
  const sideOut = height / slopeLen;

  for (let side = -1; side <= 1; side += 2) {
    let pb = -1;
    let pt = -1;
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i];
      const nx = nxArr[i] * side;
      const ny = nyArr[i] * side;
      const zb = zAt[i] - skirt;
      const zt = zAt[i] + hAt[i];
      const vb = m.v(x + nx * halfBase, y + ny * halfBase, zb, nx * sideOut, ny * sideOut, sideUp, uAt[i], 0, 0.52);
      const vt = m.v(x + nx * halfTop, y + ny * halfTop, zt, nx * sideOut, ny * sideOut, sideUp, uAt[i], height + skirt, 0.96);
      if (i > 0) {
        if (side > 0) m.quad(pb, vb, vt, pt);
        else m.quad(pb, pt, vt, vb);
      }
      pb = vb;
      pt = vt;
    }
  }

  // Crest cap strip.
  m.mat = topMat;
  m.tint = topTint;
  let pl = -1;
  let pr = -1;
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    const nx = nxArr[i];
    const ny = nyArr[i];
    const zt = zAt[i] + hAt[i];
    const vl = m.v(x - nx * halfTop, y - ny * halfTop, zt, 0, 0, 1, uAt[i], 0, 1);
    const vr = m.v(x + nx * halfTop, y + ny * halfTop, zt, 0, 0, 1, uAt[i], halfTop * 2, 1);
    if (i > 0) m.quad(pl, vl, vr, pr);
    pl = vl;
    pr = vr;
  }
}

/**
 * Extrude a contour-following hillside terrace retaining riser: faces strictly downhill along gradient `(gx, gy)`,
 * embeds a deep skirt downhill so the riser sits flush against the slope, and caps a narrow horizontal bench lip.
 */
function extrudeTerraceRiser(
  m: Mesh,
  pts: [number, number][],
  g: GroundHeight,
  height: number,
  mat: number,
  topMat: number,
  tint: number,
): void {
  const n = pts.length;
  if (n < 2) return;
  const zAt = new Float64Array(n);
  const dxArr = new Float64Array(n);
  const dyArr = new Float64Array(n);
  const uAt = new Float64Array(n);

  let uAcc = 0;
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    zAt[i] = g.at(x, y);
    if (i > 0) uAcc += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
    uAt[i] = uAcc;
    // Downhill unit vector = negative terrain gradient.
    const { gx, gy } = terrainSlope(g, x, y, 2.5);
    const gl = Math.hypot(gx, gy) || 1;
    dxArr[i] = -gx / gl;
    dyArr[i] = -gy / gl;
  }

  const batter = 0.28;
  const benchLip = 0.65;
  const skirt = 0.85;

  // Front battered retaining face (downhill side).
  m.mat = mat;
  m.tint = tint;
  let pb = -1;
  let pt = -1;
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    const dnX = dxArr[i];
    const dnY = dyArr[i];
    const fade = i === 0 || i === n - 1 ? 0.2 : 1;
    const h = height * fade;
    const zBase = g.at(x + dnX * batter, y + dnY * batter) - skirt;
    const zTop = zAt[i] + h * 0.62;
    const vb = m.v(x + dnX * batter, y + dnY * batter, zBase, dnX * 0.92, dnY * 0.92, 0.38, uAt[i], 0, 0.5);
    const vt = m.v(x, y, zTop, dnX * 0.92, dnY * 0.92, 0.38, uAt[i], h + skirt, 0.95);
    if (i > 0) m.quad(pb, vb, vt, pt);
    pb = vb;
    pt = vt;
  }

  // Narrow horizontal turf/earth crest bench tucked uphill into the slope.
  m.mat = topMat;
  m.tint = Math.min(254, tint + 16);
  let pf = -1;
  let pr = -1;
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    const dnX = dxArr[i];
    const dnY = dyArr[i];
    const fade = i === 0 || i === n - 1 ? 0.2 : 1;
    const zTop = zAt[i] + height * fade * 0.62;
    const zBack = g.at(x - dnX * benchLip, y - dnY * benchLip) - 0.15;
    const vf = m.v(x, y, zTop, 0, 0, 1, uAt[i], 0, 1);
    const vr = m.v(x - dnX * benchLip, y - dnY * benchLip, Math.min(zTop, zBack), 0, 0, 1, uAt[i], benchLip, 0.88);
    if (i > 0) m.quad(pf, vf, vr, pr);
    pf = vf;
    pr = vr;
  }
}

/**
 * Build terrain-draped 3D field boundaries (bunds, walls, hedges, ditches, dikes), contour-hugging hillside
 * terrace retaining risers, and field-margin tree placements into `m`.
 */
export function buildFieldworks(m: Mesh, spec: FieldworksSpec, g: GroundHeight, use: FieldUseSampler): FieldworksResult {
  const cx = spec.cx ?? 0;
  const cy = spec.cy ?? 0;
  const R = Math.max(40, spec.radius);
  const x0 = cx - R;
  const x1 = cx + R;
  const y0 = cy - R;
  const y1 = cy + R;
  const s = spec.style;
  const side = Math.max(8, s.plot);
  const aspect = Math.max(1, s.aspect);
  const baseSx = side / Math.sqrt(aspect);
  const baseSy = side * Math.sqrt(aspect);
  const stagger = s.kind === 1 ? 0.15 : 0.65;
  const warp = side * (s.kind === 2 || s.kind === 7 ? PLOT_LOOK.warp.irregular : PLOT_LOOK.warp.regular);

  const uSample = { crop: 0, pasture: 0, yard: 0, paddy: 0 };
  const trees: FieldTreeSpot[] = [];
  let runs = 0;

  // Determine effective bound style: paddies/basins always have dikes/banks even when bounds says 'none';
  // ordinary dryland fields get low earthen bunds when bounds is 'none' so plots still read physically on relief.
  const effBounds: FieldBoundKind =
    spec.bounds !== 'none'
      ? spec.bounds
      : s.kind === 4 || s.kind === 5
        ? 'dikes'
        : s.kind === 7
          ? 'none'
          : 'banks';

  const emitBoundRun = (pts: [number, number][], runSeed: number) => {
    if (pts.length < 2) return;
    runs++;
    switch (effBounds) {
      case 'walls':
        extrudeRibbon(m, pts, g, 0.36, 0.24, 1.05, 0.55, MAT.rubble, MAT.rubble, 128, 138, 0.1, runSeed);
        break;
      case 'hedges':
        extrudeRibbon(m, pts, g, 0.72, 0.44, 1.35, 0.5, MAT.broad, MAT.broad, 96, 118, 0.22, runSeed);
        break;
      case 'dikes':
        extrudeRibbon(m, pts, g, 0.52, 0.3, 0.44, 0.45, MAT.earth, MAT.grass, 118, 126, 0.08, runSeed);
        break;
      case 'ditches': {
        // Low bank + dark damp channel edge along the boundary.
        extrudeRibbon(m, pts, g, 0.46, 0.22, 0.32, 0.4, MAT.earth, MAT.grass, 110, 120, 0.08, runSeed);
        break;
      }
      case 'banks':
      default:
        extrudeRibbon(m, pts, g, 0.64, 0.28, 0.54, 0.48, MAT.earth, MAT.grass, 118, 128, 0.12, runSeed);
        break;
    }
  };

  // 1. Parcel boundaries inside every macro-domain overlapping [x0, x1] × [y0, y1] (for gentle to moderate slopes).
  if (effBounds !== 'none') {
    const domains = plotDomainsInBox(x0, y0, x1, y1, s);
    const corners: [number, number][] = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
    const step = 8; // metres between draped vertices along parcel boundaries
    const seenTree = new Set<string>();

    const checkPoint = (x: number, y: number, domDi: number, domDj: number): boolean => {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > R * R) return false;
      if (spec.avoid?.(x, y)) return false;
      use.at(x, y, uSample);
      if (uSample.crop < 0.38 || uSample.yard > 0.25) return false;
      const { slope } = terrainSlope(g, x, y, 3);
      // On steeper hillsides, contour terraces take over from flat parcel bounds.
      if (slope > FIELD_SLOPE.terraceHi) return false;
      const { domain } = plotDomainAt(x, y, s);
      return domain.di === domDi && domain.dj === domDj;
    };

    const flush = (pts: [number, number][], runSeed: number) => {
      if (pts.length >= 2) emitBoundRun(pts, runSeed);
      pts.length = 0;
    };

    for (const dom of domains) {
      let lx0 = Infinity;
      let ly0 = Infinity;
      let lx1 = -Infinity;
      let ly1 = -Infinity;
      for (const [px, py] of corners) {
        const [lx, ly] = worldToDomain(px, py, dom);
        if (lx < lx0) lx0 = lx;
        if (lx > lx1) lx1 = lx;
        if (ly < ly0) ly0 = ly;
        if (ly > ly1) ly1 = ly;
      }
      const sx = baseSx * dom.scaleX;
      const sy = baseSy * dom.scaleY;
      const ci0 = Math.floor(lx0 / sx);
      const ci1 = Math.ceil((lx1 + warp) / sx);
      const cj0 = Math.floor(ly0 / sy);
      const cj1 = Math.ceil((ly1 + warp) / sy);

      // Column borders (along rows, constant across = ci * sx).
      for (let ci = ci0; ci <= ci1; ci++) {
        // Keep ~68% of internal edges for banks/ditches, ~90% for walls/hedges/dikes so patchwork breathes naturally.
        const keep = effBounds === 'walls' || effBounds === 'hedges' || effBounds === 'dikes' ? 0.9 : 0.68;
        if (plotNumber(ci, dom.salt, 53) > keep) continue;
        const across = ci * sx;
        const run: [number, number][] = [];
        const lStart = Math.floor(ly0 / step) * step;
        const lEnd = Math.ceil((ly1 + warp) / step) * step;
        for (let along = lStart; along <= lEnd; along += step) {
          const [wx, wy] = plotPlaceInDomain(across, along, dom, s);
          if (checkPoint(wx, wy, dom.di, dom.dj)) {
            run.push([wx, wy]);
            // Occasional solitary shade/hedgerow tree along long field margins and domain edges.
            const stepIdx = Math.round(along / step);
            if (stepIdx % 5 === 0 && (effBounds === 'hedges' || effBounds === 'banks' || effBounds === 'walls')) {
              const hLine = plotNumber(ci * 17 + stepIdx, dom.salt, 83);
              if (hLine < (effBounds === 'hedges' ? 0.28 : 0.14)) {
                const key = `${Math.round(wx / 16)},${Math.round(wy / 16)}`;
                if (!seenTree.has(key)) {
                  seenTree.add(key);
                  trees.push({ x: wx, y: wy, scale: 0.65 + 0.55 * plotNumber(ci, stepIdx, 89), u: plotNumber(ci, stepIdx, 97) });
                }
              }
            }
          } else {
            flush(run, spec.seed + ci * 31 + dom.salt);
          }
        }
        flush(run, spec.seed + ci * 31 + dom.salt);
      }

      // Cross borders (across rows, staggered per column ci: along = cj * sy - shift).
      for (let ci = ci0; ci < ci1; ci++) {
        const shift = plotNumber(ci, dom.salt, 41) * sy * stagger;
        const a0 = ci * sx;
        const a1 = (ci + 1) * sx;
        const subSteps = Math.max(2, Math.ceil(sx / step));
        for (let cj = cj0; cj <= cj1; cj++) {
          const along = cj * sy - shift;
          if (along < ly0 - warp || along > ly1 + warp) continue;
          const keep = effBounds === 'walls' || effBounds === 'hedges' || effBounds === 'dikes' ? 0.85 : 0.62;
          const pi = (ci ^ Math.imul(dom.di | 0, 0x9e3779b1)) | 0;
          const pj = (cj ^ Math.imul(dom.dj | 0, 0x85ebca6b)) | 0;
          if (plotNumber(pi, pj, 59) > keep) continue;
          const run: [number, number][] = [];
          for (let q = 0; q <= subSteps; q++) {
            const across = a0 + ((a1 - a0) * q) / subSteps;
            const [wx, wy] = plotPlaceInDomain(across, along, dom, s);
            if (checkPoint(wx, wy, dom.di, dom.dj)) {
              run.push([wx, wy]);
              // Boundary corner trees & shrubs framing parcel intersections.
              if (q === 0 && (effBounds === 'hedges' || effBounds === 'banks' || effBounds === 'walls')) {
                const hTree = plotNumber(pi, pj, 67);
                const treeProb = effBounds === 'hedges' ? 0.52 : effBounds === 'banks' ? 0.38 : 0.28;
                if (hTree < treeProb) {
                  const key = `${Math.round(wx / 16)},${Math.round(wy / 16)}`;
                  if (!seenTree.has(key)) {
                    seenTree.add(key);
                    trees.push({ x: wx, y: wy, scale: 0.72 + 0.58 * plotNumber(ci, cj, 71), u: plotNumber(ci, cj, 73) });
                  }
                }
              }
            } else {
              flush(run, spec.seed + ci * 19 + cj * 37 + dom.salt);
            }
          }
          flush(run, spec.seed + ci * 19 + cj * 37 + dom.salt);
        }
      }
    }
  }

  // 2. Contour-aligned 3D terrace retaining risers on sloping cropland (marching squares on z = k * TERRACE_STEP).
  const cell = 8;
  const cols = Math.floor((x1 - x0) / cell);
  const rows = Math.floor((y1 - y0) / cell);
  const minSlope = s.kind === 3 ? 0.045 : FIELD_SLOPE.terraceLo;
  const maxSlope = FIELD_SLOPE.cropFadeHi;
  const gridZ = new Float32Array((cols + 1) * (rows + 1));
  const gridOk = new Uint8Array((cols + 1) * (rows + 1));

  for (let j = 0; j <= rows; j++) {
    const y = y0 + j * cell;
    for (let i = 0; i <= cols; i++) {
      const x = x0 + i * cell;
      const idx = j * (cols + 1) + i;
      gridZ[idx] = g.at(x, y);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > R * R) continue;
      if (spec.avoid?.(x, y)) continue;
      use.at(x, y, uSample);
      if (uSample.crop < 0.35 || uSample.yard > 0.25) continue;
      const { slope } = terrainSlope(g, x, y, 3.5);
      if (slope >= minSlope && slope <= maxSlope) gridOk[idx] = 1;
    }
  }

  // Extract marching-squares contour segments at every integer multiple of TERRACE_STEP and stitch into polylines.
  interface Seg {
    ax: number;
    ay: number;
    bx: number;
    by: number;
  }
  const byLevel = new Map<number, Seg[]>();
  const edgePt = (e: number, x: number, y: number, z00: number, z10: number, z11: number, z01: number, zLvl: number): [number, number] => {
    switch (e) {
      case 0: {
        const t = (zLvl - z00) / (z10 - z00 || 1e-6);
        return [x + t * cell, y];
      }
      case 1: {
        const t = (zLvl - z10) / (z11 - z10 || 1e-6);
        return [x + cell, y + t * cell];
      }
      case 2: {
        const t = (zLvl - z01) / (z11 - z01 || 1e-6);
        return [x + t * cell, y + cell];
      }
      default: {
        const t = (zLvl - z00) / (z01 - z00 || 1e-6);
        return [x, y + t * cell];
      }
    }
  };
  const MS_EDGES: readonly (readonly [number, number])[][] = [
    [],
    [[3, 0]],
    [[0, 1]],
    [[3, 1]],
    [[1, 2]],
    [
      [3, 0],
      [1, 2],
    ],
    [[0, 2]],
    [[3, 2]],
    [[2, 3]],
    [[0, 2]],
    [
      [0, 1],
      [2, 3],
    ],
    [[1, 2]],
    [[3, 1]],
    [[0, 1]],
    [[3, 0]],
    [],
  ];

  for (let j = 0; j < rows; j++) {
    const y = y0 + j * cell;
    for (let i = 0; i < cols; i++) {
      const i00 = j * (cols + 1) + i;
      const i10 = i00 + 1;
      const i01 = i00 + cols + 1;
      const i11 = i01 + 1;
      if (!(gridOk[i00] || gridOk[i10] || gridOk[i01] || gridOk[i11])) continue;
      const z00 = gridZ[i00];
      const z10 = gridZ[i10];
      const z11 = gridZ[i11];
      const z01 = gridZ[i01];
      const zMin = Math.min(z00, z10, z11, z01);
      const zMax = Math.max(z00, z10, z11, z01);
      const k0 = Math.ceil(zMin / TERRACE_STEP);
      const k1 = Math.floor(zMax / TERRACE_STEP);
      const x = x0 + i * cell;
      for (let k = k0; k <= k1; k++) {
        const zLvl = k * TERRACE_STEP;
        const mask = (z00 >= zLvl ? 1 : 0) | (z10 >= zLvl ? 2 : 0) | (z11 >= zLvl ? 4 : 0) | (z01 >= zLvl ? 8 : 0);
        const pairs = MS_EDGES[mask];
        if (!pairs.length) continue;
        let arr = byLevel.get(k);
        if (!arr) {
          arr = [];
          byLevel.set(k, arr);
        }
        for (const [e0, e1] of pairs) {
          const [ax, ay] = edgePt(e0, x, y, z00, z10, z11, z01, zLvl);
          const [bx, by] = edgePt(e1, x, y, z00, z10, z11, z01, zLvl);
          if (Math.hypot(bx - ax, by - ay) > 0.2) arr.push({ ax, ay, bx, by });
        }
      }
    }
  }

  // Chain segments per contour level into smooth polylines and extrude terrace risers.
  const riserMat = effBounds === 'walls' ? MAT.rubble : MAT.earth;
  const keyOf = (x: number, y: number) => `${Math.round(x * 5)},${Math.round(y * 5)}`;

  for (const [, segs] of byLevel) {
    const adj = new Map<string, number[]>();
    const addAdj = (k: string, idx: number) => {
      let l = adj.get(k);
      if (!l) {
        l = [];
        adj.set(k, l);
      }
      l.push(idx);
    };
    for (let i = 0; i < segs.length; i++) {
      addAdj(keyOf(segs[i].ax, segs[i].ay), i);
      addAdj(keyOf(segs[i].bx, segs[i].by), i);
    }
    const used = new Uint8Array(segs.length);
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      const chain: [number, number][] = [
        [segs[i].ax, segs[i].ay],
        [segs[i].bx, segs[i].by],
      ];
      // Grow forward and backward along matching endpoint keys.
      const extend = (front: boolean) => {
        for (;;) {
          const [px, py] = front ? chain[0] : chain[chain.length - 1];
          const list = adj.get(keyOf(px, py));
          if (!list) break;
          let found = false;
          for (const ni of list) {
            if (used[ni]) continue;
            const sg = segs[ni];
            const da = Math.hypot(sg.ax - px, sg.ay - py);
            const db = Math.hypot(sg.bx - px, sg.by - py);
            if (da < 0.4) {
              used[ni] = 1;
              if (front) chain.unshift([sg.bx, sg.by]);
              else chain.push([sg.bx, sg.by]);
              found = true;
              break;
            } else if (db < 0.4) {
              used[ni] = 1;
              if (front) chain.unshift([sg.ax, sg.ay]);
              else chain.push([sg.ax, sg.ay]);
              found = true;
              break;
            }
          }
          if (!found) break;
        }
      };
      extend(false);
      extend(true);
      if (chain.length < 3) continue;
      // Ensure downhill side faces right of polyline (consistent winding) by checking midpoint.
      const mid = chain[Math.floor(chain.length / 2)];
      const prev = chain[Math.max(0, Math.floor(chain.length / 2) - 1)];
      const { gx, gy, slope } = terrainSlope(g, mid[0], mid[1], 3);
      const tx = mid[0] - prev[0];
      const ty = mid[1] - prev[1];
      // Downhill is (-gx, -gy); right of tangent is (ty, -tx).
      if (-gx * ty + gy * tx < 0) chain.reverse();
      const riserH = Math.min(1.45, Math.max(0.7, 0.55 + slope * 3.8));
      extrudeTerraceRiser(m, chain, g, riserH, riserMat, MAT.grass, effBounds === 'walls' ? 130 : 122);
      runs++;
    }
  }

  return { runs, trees };
}
