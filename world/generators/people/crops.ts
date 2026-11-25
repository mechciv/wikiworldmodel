// Crops as plants: where the settlement generator's land use says a field is under a crop, rows of the region's real
// crops (from `tradition/agriculture` via FieldPalette, or climate-aware generic stand-ins clearly marked as generic)
// stand along each macro-domain's angled parcels, clear of its balks and headlands.
//
// Parcel geometry and seasonal states come from `core/plots.ts`, shared with the ground shader (`plots`) and physical
// 3D field bounds (`fieldworks.ts`), so every standing crop matches the colour, row bearing, and phenology of its plot.
import { CROP_PROFILE, type CropArchetype } from '../../../core/dwelling.ts';
import {
  DEFAULT_FIELD_PALETTE,
  domainSpan,
  PLOT,
  PLOT_LOOK,
  plotDomainsInBox,
  plotNumber,
  plotReach,
  plotSlotIndex,
  worldToDomain,
  type FieldPalette,
  type FieldSlot,
  type PlotStyle,
} from '../../../core/plots.ts';
import type { Mesh } from '../city/kit.ts';
import { hash2 } from '../city/math.ts';
import { drawCropStand } from '../life/plants.ts';

/** Fallback/base geometry dimensions for crops (params.crops of gen:people/settlement). Metres. */
export interface CropParams {
  row: number;
  apart: number;
  wide: number;
  green: [number, number];
  ripe: [number, number];
  length: number;
}

/** How many ways a clump of a crop is drawn, and as many again for a length of row. */
export const CROP_VARIANTS = 4;
/** The bit of its variant that says it is a length of row. */
export const CROP_LONG = 4;

/** Which botanical stand archetype draws a FieldSlot, or undefined if the slot has no standing plants (ploughed/fallow). */
export function slotArchetype(slot: FieldSlot): CropArchetype | 'stubble' | undefined {
  if (slot.state === PLOT.ploughed || slot.state === PLOT.fallow) return undefined;
  if (slot.state === PLOT.stubble) return 'stubble';
  return slot.archetype ?? 'cereal';
}

/** One mesh of a crop archetype, normalised to 1 m tall: a clump, or a length of row along y. */
export function drawCrop(m: Mesh, p: CropParams, variant: number, archetype: CropArchetype | 'stubble' = 'cereal'): void {
  const long = (variant & CROP_LONG) !== 0 && archetype !== 'orchard';
  const wide = archetype === 'stubble' ? p.wide : CROP_PROFILE[archetype].wide;
  drawCropStand(m, wide, long ? p.length : 0, ((variant & 3) + 1) * 0x51d3, archetype);
}

/** One crop plant or row segment sown: place, height, row direction, palette slot, archetype, mesh variant, and tint. */
export interface Sown {
  x: number;
  y: number;
  tall: number;
  /** its row's direction there (unit vector) */
  dx: number;
  dy: number;
  /** index into FieldPalette.slots (0..FIELD_SLOTS-1), used for prototype & picking entity */
  slot: number;
  archetype: CropArchetype | 'stubble';
  variant: number;
  /** packed into 0..254: (slot << 5) | (plotTone3 << 2) | ownShade2 */
  tint: number;
  /** deterministic 0–1 value for edge thinning */
  u: number;
}

/**
 * Sow crop stands in world square [x0, x1) × [y0, y1) across all overlapping macro-domains, following each parcel's
 * own domain orientation, seasonal palette slot, and botanical archetype. Adjacent squares sow no place twice.
 */
export function sow(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  style: PlotStyle,
  p: CropParams,
  long: boolean,
  seed: number,
  each: (s: Sown) => void,
  palette: FieldPalette = DEFAULT_FIELD_PALETTE,
): void {
  const side = Math.max(8, style.plot);
  const aspect = Math.max(1, style.aspect);
  const irregular = style.kind === 2 || style.kind === 7;
  const warp = side * (irregular ? PLOT_LOOK.warp.irregular : PLOT_LOOK.warp.regular);
  const stagger = style.kind === 1 ? 0.15 : 0.65;
  const baseSx = side / Math.sqrt(aspect);
  const baseSy = side * Math.sqrt(aspect);
  const wk = 1 / (side * 1.85);
  const span = domainSpan(style);
  const reach = plotReach(style);
  const nearPad = warp * 0.48 + 0.5;

  // All domains that could possibly own or border any point in [x0, x1] × [y0, y1].
  const allDoms = plotDomainsInBox(x0 - span, y0 - span, x1 + span, y1 + span, style);
  const candDoms = plotDomainsInBox(x0, y0, x1, y1, style);

  // Precompute per-slot strides & clearances once outside the hot loop.
  let minRow = p.row;
  let minApart = p.apart;
  for (const sl of palette.slots) {
    const arch = slotArchetype(sl);
    if (!arch || arch === 'stubble') continue;
    const prof = CROP_PROFILE[arch];
    if (prof.row < minRow) minRow = prof.row;
    if (prof.apart < minApart) minApart = prof.apart;
  }
  const baseRow = Math.max(0.45, minRow);
  const baseStep = long ? p.length : Math.max(0.32, minApart);

  const slotInfo = palette.slots.map((sl) => {
    const arch = slotArchetype(sl);
    if (!arch || (long && arch === 'stubble')) return null;
    const prof = arch === 'stubble' ? undefined : CROP_PROFILE[arch];
    const rowStride = prof ? Math.max(1, Math.round(prof.row / baseRow)) : 1;
    const stepStride = prof ? Math.max(1, Math.round((arch === 'orchard' ? prof.apart : long ? Math.max(p.length, prof.apart) : prof.apart) / baseStep)) : 1;
    const clear = PLOT_LOOK.balk + (long && arch !== 'orchard' ? p.length * 0.5 : arch === 'orchard' ? 1.5 : 0);
    const ripe = sl.state === PLOT.ripe;
    const growth = Math.max(0.22, sl.growth || 0.85);
    const hLo = arch === 'stubble' ? 0.22 : (ripe ? prof!.ripeH[0] : prof!.greenH[0] * (0.4 + 0.6 * growth));
    const hHi = arch === 'stubble' ? 0.32 : (ripe ? prof!.ripeH[1] : prof!.greenH[1] * (0.4 + 0.6 * growth));
    return { arch, rowStride, stepStride, clear, hLo, hHi, isLong: long && arch !== 'orchard' };
  });

  const corners: [number, number][] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];

  // Filter candidate domains to those whose Voronoi cell actually intersects [x0, x1] × [y0, y1] (half-plane AABB test).
  const activeDoms = candDoms.filter((d) => {
    for (const o of allDoms) {
      if (o.di === d.di && o.dj === d.dj) continue;
      const vx = o.cx - d.cx;
      const vy = o.cy - d.cy;
      const mx = 0.5 * (d.cx + o.cx);
      const my = 0.5 * (d.cy + o.cy);
      // Max of dot((mx - x, my - y), v) over the box: if < 0, the entire box lies on o's side of the bisector!
      const bx = vx >= 0 ? x0 : x1;
      const by = vy >= 0 ? y0 : y1;
      if ((mx - bx) * vx + (my - by) * vy < 0) return false;
    }
    return true;
  });

  // Reusable emitted record object? No, callers may push `s` into arrays, so emit fresh object only on accepted points.
  for (const dom of activeDoms) {
    // Only need neighbors of `dom` within 2 cells for exact Voronoi ownership & domainEdge.
    const neigh: { cx: number; cy: number; vx: number; vy: number; invLen: number; mx: number; my: number }[] = [];
    for (const o of allDoms) {
      if (o.di === dom.di && o.dj === dom.dj) continue;
      if (Math.abs(o.di - dom.di) > 2 || Math.abs(o.dj - dom.dj) > 2) continue;
      const vx = o.cx - dom.cx;
      const vy = o.cy - dom.cy;
      const len = Math.hypot(vx, vy);
      if (len < 1e-4) continue;
      neigh.push({ cx: o.cx, cy: o.cy, vx, vy, invLen: 1 / len, mx: 0.5 * (dom.cx + o.cx), my: 0.5 * (dom.cy + o.cy) });
    }

    let lx0 = Infinity;
    let ly0 = Infinity;
    let lx1 = -Infinity;
    let ly1 = -Infinity;
    for (const [cx, cy] of corners) {
      const [lx, ly] = worldToDomain(cx, cy, dom);
      if (lx < lx0) lx0 = lx;
      if (lx > lx1) lx1 = lx;
      if (ly < ly0) ly0 = ly;
      if (ly > ly1) ly1 = ly;
    }
    // In domain coords, across = lx + wx*warp where wx ∈ [0, 1], so across ∈ [lx0, lx1 + warp].
    const k0 = Math.floor(lx0 / baseRow);
    const k1 = Math.ceil((lx1 + reach) / baseRow);
    const l0 = Math.floor(ly0 / baseStep);
    const l1 = Math.ceil((ly1 + reach) / baseStep);
    const salt = seed + (long ? 977 : 0) + dom.salt * 17;
    const sx = baseSx * dom.scaleX;
    const sy = baseSy * dom.scaleY;
    const cos = dom.cos;
    const sin = dom.sin;
    const dcx = dom.cx;
    const dcy = dom.cy;
    const diOff = Math.imul(dom.di | 0, 0x9e3779b1) | 0;
    const djOff = Math.imul(dom.dj | 0, 0x85ebca6b) | 0;

    for (let k = k0; k <= k1; k++) {
      // Quick box reject on column before entering l loop? Column covers full ly range, so compute per l.
      for (let l = l0; l <= l1; l++) {
        const across = (k + 0.5 + (hash2(k, l, salt + 1) - 0.5) * 0.16) * baseRow;
        const along = (l + (long ? 0.5 + (hash2(k, l, salt + 2) - 0.5) * 0.2 : hash2(k, l, salt + 2))) * baseStep;

        // Cheap approximate inverse reject before hashing/parcel inversion.
        const wx0 = 0.5 + 0.25 * (Math.sin((across * 0.83 + along * 0.56) * wk + 1.3) + Math.sin((along * 0.91 - across * 0.42) * wk * 1.9 + 4.1));
        const wy0 = 0.5 + 0.25 * (Math.sin((along * 0.79 - across * 0.61) * wk + 2.7) + Math.sin((across * 0.88 + along * 0.47) * wk * 1.9 + 0.6));
        const nlx = across - wx0 * warp;
        const nly = along - wy0 * warp;
        const nx = dcx + nlx * cos - nly * sin;
        const ny = dcy + nlx * sin + nly * cos;
        if (nx < x0 - nearPad || nx >= x1 + nearPad || ny < y0 - nearPad || ny >= y1 + nearPad) continue;

        // Parcel & slot lookup (zero allocations).
        const ci = Math.floor(across / sx);
        const shift = plotNumber(ci, dom.salt, 41) * sy * stagger;
        const alongS = along + shift;
        const cj = Math.floor(alongS / sy);
        const fx = across / sx - ci;
        const fy = alongS / sy - cj;
        const pi = (ci ^ diOff) | 0;
        const pj = (cj ^ djOff) | 0;
        const pick = plotNumber(pi, pj, 0);
        const slotIdx = plotSlotIndex(pick, palette);
        const info = slotInfo[slotIdx];
        if (!info) continue;

        if (info.rowStride > 1 && ((k % info.rowStride) + info.rowStride) % info.rowStride !== 0) continue;
        if (info.stepStride > 1 && ((l % info.stepStride) + info.stepStride) % info.stepStride !== 0) continue;

        const plotEdge = Math.min(Math.min(fx, 1 - fx) * sx, Math.min(fy, 1 - fy) * sy);
        if (plotEdge < info.clear) continue;

        // Exact iterative warp inversion (converges in 6 steps starting from the 1-step guess nlx, nly).
        let lx = nlx;
        let ly = nly;
        for (let it = 0; it < 6; it++) {
          const wx = 0.5 + 0.25 * (Math.sin((lx * 0.83 + ly * 0.56) * wk + 1.3) + Math.sin((ly * 0.91 - lx * 0.42) * wk * 1.9 + 4.1));
          const wy = 0.5 + 0.25 * (Math.sin((ly * 0.79 - lx * 0.61) * wk + 2.7) + Math.sin((lx * 0.88 + ly * 0.47) * wk * 1.9 + 0.6));
          lx = across - wx * warp;
          ly = along - wy * warp;
        }
        const x = dcx + lx * cos - ly * sin;
        const y = dcy + lx * sin + ly * cos;
        if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;

        // Fast Voronoi ownership & border clearance check against precomputed neighbor half-planes.
        let domainEdge = span;
        for (let m = 0; m < neigh.length; m++) {
          const nb = neigh[m];
          const d = ((nb.mx - x) * nb.vx + (nb.my - y) * nb.vy) * nb.invLen;
          if (d < domainEdge) domainEdge = d;
          if (domainEdge < info.clear) break;
        }
        if (domainEdge < info.clear) continue;

        // Row tangent vector from a small step along +along (2 refinement steps from lx, ly + 0.5 suffice).
        let alx = lx;
        let aly = ly + 0.5;
        const along2 = along + 0.5;
        for (let it = 0; it < 3; it++) {
          const wx = 0.5 + 0.25 * (Math.sin((alx * 0.83 + aly * 0.56) * wk + 1.3) + Math.sin((aly * 0.91 - alx * 0.42) * wk * 1.9 + 4.1));
          const wy = 0.5 + 0.25 * (Math.sin((aly * 0.79 - alx * 0.61) * wk + 2.7) + Math.sin((alx * 0.88 + aly * 0.47) * wk * 1.9 + 0.6));
          alx = across - wx * warp;
          aly = along2 - wy * warp;
        }
        const ax = dcx + alx * cos - aly * sin;
        const ay = dcy + alx * sin + aly * cos;
        const d = Math.hypot(ax - x, ay - y) || 1;

        const tone = plotNumber(pi, pj, 3);
        const tall = (info.hLo + (info.hHi - info.hLo) * hash2(pi, pj, seed + 5)) * (0.86 + 0.28 * hash2(k, l, salt + 3));
        const tone3 = Math.min(7, Math.floor(tone * 8));
        const own2 = Math.floor(hash2(k, l, salt + 4) * 4) & 3;
        const tint = Math.min(254, (slotIdx << 5) | (tone3 << 2) | own2);
        const variant = (Math.floor(hash2(k, l, salt + 6) * CROP_VARIANTS) & 3) | (info.isLong ? CROP_LONG : 0);
        each({ x, y, tall, dx: (ax - x) / d, dy: (ay - y) / d, slot: slotIdx, archetype: info.arch, variant, tint, u: hash2(k, l, salt + 7) });
      }
    }
  }
}
