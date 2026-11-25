// The plots of people's fields: how a field system's ground is cut into domain-oriented irregular parcels, what crop
// and seasonal state each parcel holds, and where its rows run. The settlement generator (gen:people/settlement) says
// where there are fields and of what system; this lays them out identically for the ground shader
// (viewer/src/gl/cityShaders.ts, plots), for close-up crops (world/generators/people/crops.ts), and for physical 3D
// field boundaries and terraces (world/generators/people/fieldworks.ts).
//
// Nothing in the parcel geometry itself is a historical fact: nobody recorded where one ancient plot ended and the next
// began. Crop lists come from sourced `tradition/agriculture` records where one holds, or climate-aware generic stand-ins
// clearly marked as generic.
//
// Everything the fragment shader must reckon alike uses whole-number hashes and trig that GPU and CPU evaluate identically:
// PLOTS_GLSL is the exact shader counterpart built from the constants here.

import { CROP_ARCHETYPE_OF, CROP_PROFILE, CROP_SHARE_WEIGHT, genericCropsFor, type CropArchetype, type CropEntry } from './dwelling.ts';

/** How a field system's plots are drawn: a plot's side in metres, how much longer than wide it is, and its kind's code. */
export interface PlotStyle {
  plot: number;
  aspect: number;
  kind: number;
}

/** Each kind of field system's code, and how much longer than wide its plots are drawn. */
export const PLOT_KINDS: Record<string, [number, number]> = {
  blocks: [0, 1.5],
  strips: [1, 6],
  irregular: [2, 1.2],
  terraces: [3, 4],
  paddies: [4, 1.3],
  basins: [5, 2],
  raised: [6, 3],
  swidden: [7, 1.2],
  gardens: [8, 1.2],
  none: [0, 1],
};

/** A field system as its plots are drawn: `plot` in hectares. */
export function plotStyle(s: { kind: string; plot: number }): PlotStyle {
  const [kind, aspect] = PLOT_KINDS[s.kind] ?? [0, 1.5];
  return { plot: Math.sqrt(s.plot * 10000), aspect, kind };
}

/**
 * The seven seasonal/agronomic states a parcel may hold at a given month:
 * ripe, green, sprouting, stubble (freshly harvested), ploughed, fallow, flooded (paddy water).
 */
export const PLOT = { ripe: 0, green: 1, sprouting: 2, stubble: 3, ploughed: 4, fallow: 5, flooded: 6 } as const;
export type PlotState = (typeof PLOT)[keyof typeof PLOT];

/** Number of palette slots shared between CPU crop sowing and GPU ground/crop shading. */
export const FIELD_SLOTS = 8;

/** Vertical rise between contour-following hillside terrace benches, in metres. */
export const TERRACE_STEP = 2.6;
/** Slope thresholds (sin θ = sqrt(1 - nz²)): gentle valley → terraced hillside → uncropped steep slope. */
export const FIELD_SLOPE = { terraceLo: 0.085, terraceHi: 0.16, cropFadeLo: 0.25, cropFadeHi: 0.35 } as const;

/**
 * The plots' shared look constants: legacy shares (used when no seasonal palette is supplied), warp amplitudes, balk
 * clearance, furrow pitch, and fallback linear RGB tones.
 */
export const PLOT_LOOK = {
  shares: { ripe: 0.4, green: 0.72, ploughed: 0.88, cleared: 0.5 },
  warp: { irregular: 0.48, regular: 0.14 },
  balk: 0.85,
  furrow: 1.3,
  ripe: [
    [0.5, 0.42, 0.21],
    [0.42, 0.36, 0.17],
  ],
  green: [
    [0.2, 0.27, 0.1],
    [0.28, 0.32, 0.13],
  ],
} as const;

/** What the plots are numbered by: a whole number, so every scene and every machine numbers them alike. */
const SEED = 0x51ed27;

function mixHash(h: number): number {
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A plot's number, 0–1 in steps of 1/65536, by `k`: identical in the shader (plotNumber). */
export const plotNumber = (i: number, j: number, k = 0): number =>
  (mixHash((SEED + k) ^ Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1)) >>> 16) / 65536;

/** Size of one macro-domain Voronoi cell, m (~210–380 m across). */
export function domainSpan(s: PlotStyle): number {
  const side = Math.max(8, s.plot);
  return Math.max(190, Math.min(380, side * 5.2));
}

/** One macro-domain in the two-level field patchwork: its centre, bearing angle, and parcel size multipliers. */
export interface PlotDomain {
  di: number;
  dj: number;
  cx: number;
  cy: number;
  angle: number;
  cos: number;
  sin: number;
  scaleX: number;
  scaleY: number;
  /** salt folded into parcel hashes so adjacent domains do not share parcel patterns */
  salt: number;
}

/** Build a macro-domain's frame from its integer cell coordinates. */
export function domainOf(di: number, dj: number, span: number): PlotDomain {
  const cx = (di + 0.2 + 0.6 * plotNumber(di, dj, 19)) * span;
  const cy = (dj + 0.2 + 0.6 * plotNumber(di, dj, 23)) * span;
  const angle = plotNumber(di, dj, 29) * Math.PI;
  const scaleX = 0.78 + 0.44 * plotNumber(di, dj, 31);
  const scaleY = 0.76 + 0.48 * plotNumber(di, dj, 37);
  const salt = (Math.imul(di | 0, 131) ^ Math.imul(dj | 0, 137)) | 0;
  return { di, dj, cx, cy, angle, cos: Math.cos(angle), sin: Math.sin(angle), scaleX, scaleY, salt };
}

/** Find the macro-domain holding world point (x, y), and the Euclidean distance (m) to its nearest domain border. */
export function plotDomainAt(x: number, y: number, s: PlotStyle): { domain: PlotDomain; domainEdge: number } {
  const span = domainSpan(s);
  const gx = Math.floor(x / span);
  const gy = Math.floor(y / span);
  let bestDi = gx;
  let bestDj = gy;
  let bestCx = 0;
  let bestCy = 0;
  let bestD2 = Infinity;
  const pts: [number, number, number, number][] = [];
  for (let dj = gy - 1; dj <= gy + 1; dj++) {
    for (let di = gx - 1; di <= gx + 1; di++) {
      const cx = (di + 0.2 + 0.6 * plotNumber(di, dj, 19)) * span;
      const cy = (dj + 0.2 + 0.6 * plotNumber(di, dj, 23)) * span;
      pts.push([di, dj, cx, cy]);
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 < bestD2) {
        bestD2 = d2;
        bestDi = di;
        bestDj = dj;
        bestCx = cx;
        bestCy = cy;
      }
    }
  }
  let domainEdge = span;
  for (const [di, dj, cx, cy] of pts) {
    if (di === bestDi && dj === bestDj) continue;
    const vx = cx - bestCx;
    const vy = cy - bestCy;
    const len = Math.hypot(vx, vy);
    if (len < 1e-4) continue;
    const mx = 0.5 * (bestCx + cx) - x;
    const my = 0.5 * (bestCy + cy) - y;
    const d = (mx * vx + my * vy) / len;
    if (d < domainEdge) domainEdge = d;
  }
  return { domain: domainOf(bestDi, bestDj, span), domainEdge: Math.max(0, domainEdge) };
}

/** All macro-domains whose Voronoi cell can intersect the world box [x0, x1] × [y0, y1]. */
export function plotDomainsInBox(x0: number, y0: number, x1: number, y1: number, s: PlotStyle): PlotDomain[] {
  const span = domainSpan(s);
  const i0 = Math.floor(x0 / span) - 1;
  const i1 = Math.floor(x1 / span) + 1;
  const j0 = Math.floor(y0 / span) - 1;
  const j1 = Math.floor(y1 / span) + 1;
  const out: PlotDomain[] = [];
  for (let dj = j0; dj <= j1; dj++) for (let di = i0; di <= i1; di++) out.push(domainOf(di, dj, span));
  return out;
}

/** How far a domain's parcel lines wander locally, 0–1. */
function wander(x: number, y: number, side: number): [number, number] {
  const k = 1 / (side * 1.85);
  return [
    0.5 + 0.25 * (Math.sin((x * 0.83 + y * 0.56) * k + 1.3) + Math.sin((y * 0.91 - x * 0.42) * k * 1.9 + 4.1)),
    0.5 + 0.25 * (Math.sin((y * 0.79 - x * 0.61) * k + 2.7) + Math.sin((x * 0.88 + y * 0.47) * k * 1.9 + 0.6)),
  ];
}

/** A place in the fields: which parcel it is in, its state, tone, distance to nearest edge, and parcel-frame coordinates. */
export interface PlotAt {
  /** parcel hash indices (domain-qualified) */
  i: number;
  j: number;
  /** local column & row indices within the owning macro-domain */
  ci: number;
  cj: number;
  /** owning macro-domain indices */
  di: number;
  dj: number;
  state: PlotState;
  /** the parcel's own hash 0–1 used to pick its palette slot */
  pick: number;
  /** the parcel's own number for its tone, 0–1 */
  tone: number;
  /** how far the place is from the parcel's nearest edge (including macro-domain borders), m */
  edge: number;
  /** distance to the nearest macro-domain boundary, m */
  domainEdge: number;
  /** parcel dimensions in this domain, m */
  sx: number;
  sy: number;
  /** fractional position within the parcel [0, 1) */
  fx: number;
  fy: number;
  /** where it is across the parcel's rows and along them, m, in the domain's warped frame */
  across: number;
  along: number;
  /** domain bearing unit vector along the rows: (sin θ, cos θ) equivalent in world XY */
  rowDx: number;
  rowDy: number;
}

const sizes = (s: PlotStyle): { side: number; sx: number; sy: number; warp: number; stagger: number } => {
  const side = Math.max(8, s.plot);
  const aspect = Math.max(1, s.aspect);
  const irregular = s.kind === 2 || s.kind === 7;
  const stagger = s.kind === 1 ? 0.15 : 0.65;
  return {
    side,
    sx: side / Math.sqrt(aspect),
    sy: side * Math.sqrt(aspect),
    warp: side * (irregular ? PLOT_LOOK.warp.irregular : PLOT_LOOK.warp.regular),
    stagger,
  };
};

/** What a plot of a number is under, in a field system of a kind (legacy stateless fallback). */
export function plotState(h: number, kind: number): PlotState {
  const s = PLOT_LOOK.shares;
  if (kind === 7) return h < s.cleared ? PLOT.ploughed : PLOT.green;
  return h < s.ripe ? PLOT.ripe : h < s.green ? PLOT.green : h < s.ploughed ? PLOT.ploughed : PLOT.fallow;
}

/** Rotate world point (x, y) into domain-local coordinates (lx, ly). */
export function worldToDomain(x: number, y: number, d: PlotDomain): [number, number] {
  const dx = x - d.cx;
  const dy = y - d.cy;
  return [dx * d.cos + dy * d.sin, -dx * d.sin + dy * d.cos];
}

/** Rotate domain-local coordinates (lx, ly) back to world coordinates (x, y). */
export function domainToWorld(lx: number, ly: number, d: PlotDomain): [number, number] {
  return [d.cx + lx * d.cos - ly * d.sin, d.cy + lx * d.sin + ly * d.cos];
}

/** Evaluate parcel information inside a specific macro-domain from its warped (across, along) coordinates. */
export function plotOfInDomain(across: number, along: number, d: PlotDomain, s: PlotStyle, domainEdge = 1e6): PlotAt {
  const base = sizes(s);
  const sx = base.sx * d.scaleX;
  const sy = base.sy * d.scaleY;
  const ci = Math.floor(across / sx);
  const shift = plotNumber(ci, d.salt, 41) * sy * base.stagger;
  const cj = Math.floor((along + shift) / sy);
  const fx = across / sx - ci;
  const fy = (along + shift) / sy - cj;
  const i = (ci ^ Math.imul(d.di | 0, 0x9e3779b1)) | 0;
  const j = (cj ^ Math.imul(d.dj | 0, 0x85ebca6b)) | 0;
  const pick = plotNumber(i, j, 0);
  const plotEdge = Math.min(Math.min(fx, 1 - fx) * sx, Math.min(fy, 1 - fy) * sy);
  return {
    i,
    j,
    ci,
    cj,
    di: d.di,
    dj: d.dj,
    state: plotState(pick, s.kind),
    pick,
    tone: plotNumber(i, j, 3),
    edge: Math.min(plotEdge, domainEdge),
    domainEdge,
    sx,
    sy,
    fx,
    fy,
    across,
    along,
    // +ly in domain frame maps to (-sin, cos) in world XY.
    rowDx: -d.sin,
    rowDy: d.cos,
  };
}

/** Backward-compatible parcel lookup in the origin domain (0, 0). */
export function plotOf(across: number, along: number, s: PlotStyle): PlotAt {
  return plotOfInDomain(across, along, domainOf(0, 0, domainSpan(s)), s);
}

/** The parcel a world point (x, y) lies in, in the scene's metres. */
export function plotAt(x: number, y: number, s: PlotStyle): PlotAt {
  const { domain, domainEdge } = plotDomainAt(x, y, s);
  const [lx, ly] = worldToDomain(x, y, domain);
  const { side, warp } = sizes(s);
  const [wx, wy] = wander(lx, ly, side);
  return plotOfInDomain(lx + wx * warp, ly + wy * warp, domain, s, domainEdge);
}

/** How far a domain's lines are shifted at most from its rotated axes, m. */
export const plotReach = (s: PlotStyle): number => sizes(s).warp;

/** Approximate world position for a warped (across, along) inside a domain (fast reject before inversion). */
export function plotNearInDomain(across: number, along: number, d: PlotDomain, s: PlotStyle): [number, number] {
  const { side, warp } = sizes(s);
  const [wx, wy] = wander(across, along, side);
  return domainToWorld(across - wx * warp, along - wy * warp, d);
}

/** Invert warped (across, along) inside a domain back to world (x, y) to sub-millimetre precision. */
export function plotPlaceInDomain(across: number, along: number, d: PlotDomain, s: PlotStyle): [number, number] {
  const { side, warp } = sizes(s);
  let lx = across;
  let ly = along;
  for (let k = 0; k < 9; k++) {
    const [wx, wy] = wander(lx, ly, side);
    lx = across - wx * warp;
    ly = along - wy * warp;
  }
  return domainToWorld(lx, ly, d);
}

/** Backward-compatible approximate inverse in domain (0, 0). */
export function plotNear(across: number, along: number, s: PlotStyle): [number, number] {
  return plotNearInDomain(across, along, domainOf(0, 0, domainSpan(s)), s);
}

/** Backward-compatible exact inverse in domain (0, 0). */
export function plotPlace(across: number, along: number, s: PlotStyle): [number, number] {
  return plotPlaceInDomain(across, along, domainOf(0, 0, domainSpan(s)), s);
}

// ——— Seasonal phenology & shared CPU/GPU crop palette ———

/** One weighted slot in a scene's active field palette (up to FIELD_SLOTS = 8). */
export interface FieldSlot {
  /** cumulative probability upper bound in (0, 1] */
  upto: number;
  state: PlotState;
  /** linear RGB stand/ground base color */
  color: [number, number, number];
  /** linear RGB secondary color for per-plot tone variation */
  color2: [number, number, number];
  /** row spacing in metres */
  row: number;
  /** canopy coverage 0..1 */
  cover: number;
  /** seasonal growth factor 0..1 relative to mature height */
  growth: number;
  crop?: CropEntry;
  archetype?: CropArchetype;
  cropIndex: number;
}

/** Compiled seasonal field palette shared between ground shader, crop sowing, and picking. */
export interface FieldPalette {
  slots: FieldSlot[];
  /** packed Float32Array(FIELD_SLOTS * 4): rgb = color, a = upto */
  slotColor: Float32Array;
  /** packed Float32Array(FIELD_SLOTS * 4): rgb = color2, a = cover */
  slotColor2: Float32Array;
  /** packed Float32Array(FIELD_SLOTS * 4): x = state, y = row pitch, z = growth, w = isPaddy (0/1) */
  slotMeta: Float32Array;
  month: number;
  lat: number;
}

type RGB = [number, number, number];
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul3 = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

const SOIL_LOAM0: RGB = [0.20, 0.14, 0.085];
const SOIL_LOAM1: RGB = [0.15, 0.105, 0.065];
const SOIL_ASH0: RGB = [0.11, 0.09, 0.068];
const SOIL_ASH1: RGB = [0.15, 0.12, 0.082];
const STUBBLE0: RGB = [0.31, 0.25, 0.135];
const STUBBLE1: RGB = [0.24, 0.19, 0.105];
const FALLOW0: RGB = [0.16, 0.17, 0.085];
const FALLOW1: RGB = [0.22, 0.195, 0.10];
const PADDY_WATER0: RGB = [0.09, 0.13, 0.135];
const PADDY_WATER1: RGB = [0.12, 0.17, 0.145];

interface StagePick {
  weight: number;
  state: PlotState;
  color: RGB;
  color2: RGB;
  cover: number;
  growth: number;
}

/**
 * Resolve one crop's phenological stage(s) for a given calendar month (1..12) and latitude.
 * Returns 1 or 2 stages (e.g. during harvest month, part standing ripe and part freshly cut stubble).
 */
export function cropPhenology(crop: CropEntry, month: number, lat: number): StagePick[] {
  const arch = CROP_ARCHETYPE_OF[crop.kind];
  const prof = CROP_PROFILE[arch];
  const season = crop.season ?? prof.defaultSeason;
  const g0 = prof.green[0] as RGB;
  const g1 = prof.green[1] as RGB;
  const r0 = prof.ripe[0] as RGB;
  const r1 = prof.ripe[1] as RGB;
  const isPaddy = arch === 'paddy';
  const evergreen = crop.kind === 'olive' || crop.kind === 'palm';

  // Shift southern hemisphere by 6 months; tropics stay staggered year-round.
  const tropical = Math.abs(lat) < 18;
  const m = (((Math.round(month) - 1 + (lat < 0 ? 6 : 0)) % 12) + 12) % 12 + 1;

  if (season === 'year-round' || (tropical && season !== 'perennial')) {
    return [
      { weight: 0.65, state: isPaddy ? PLOT.flooded : PLOT.green, color: g0, color2: g1, cover: 0.88, growth: 0.85 },
      { weight: 0.35, state: PLOT.ripe, color: r0, color2: r1, cover: 0.92, growth: 1.0 },
    ];
  }

  if (season === 'perennial') {
    if (evergreen) {
      return [{ weight: 1, state: PLOT.green, color: g0, color2: g1, cover: 0.55, growth: 0.95 }];
    }
    if (m <= 2 || m === 12) {
      return [{ weight: 1, state: PLOT.fallow, color: lerp3(SOIL_LOAM0, mul3(g0, 0.7), 0.35), color2: lerp3(SOIL_LOAM1, mul3(g1, 0.7), 0.35), cover: 0.3, growth: 0.55 }];
    }
    if (m === 9 || m === 10) {
      return [{ weight: 1, state: PLOT.ripe, color: r0, color2: r1, cover: 0.72, growth: 1.0 }];
    }
    return [{ weight: 1, state: PLOT.green, color: g0, color2: g1, cover: m === 3 ? 0.45 : 0.78, growth: m === 3 ? 0.7 : 0.96 }];
  }

  if (season === 'winter') {
    if (m === 6) {
      // Peak early-summer harvest: golden standing wheat/barley next to freshly cut stubble.
      return [
        { weight: 0.68, state: PLOT.ripe, color: r0, color2: r1, cover: 0.92, growth: 1.0 },
        { weight: 0.32, state: PLOT.stubble, color: STUBBLE0, color2: STUBBLE1, cover: 0.55, growth: 0.24 },
      ];
    }
    if (m === 5) {
      return [
        { weight: 0.55, state: PLOT.green, color: lerp3(g0, r0, 0.4), color2: lerp3(g1, r1, 0.45), cover: 0.92, growth: 0.92 },
        { weight: 0.45, state: PLOT.ripe, color: lerp3(g0, r0, 0.8), color2: lerp3(g1, r1, 0.85), cover: 0.94, growth: 0.98 },
      ];
    }
    if (m === 7) return [{ weight: 1, state: PLOT.stubble, color: STUBBLE0, color2: STUBBLE1, cover: 0.5, growth: 0.22 }];
    if (m === 8 || m === 9) return [{ weight: 1, state: PLOT.ploughed, color: SOIL_LOAM0, color2: SOIL_LOAM1, cover: 0.1, growth: 0 }];
    if (m === 10 || m === 11) {
      return [{ weight: 1, state: PLOT.sprouting, color: lerp3(SOIL_LOAM0, g0, 0.48), color2: lerp3(SOIL_LOAM1, g1, 0.5), cover: 0.42, growth: 0.25 }];
    }
    if (m === 12 || m <= 2) {
      return [{ weight: 1, state: PLOT.green, color: mul3(g0, 0.82), color2: mul3(g1, 0.85), cover: 0.62, growth: 0.34 }];
    }
    // March–April: vigorous spring growth.
    return [{ weight: 1, state: PLOT.green, color: g0, color2: g1, cover: 0.86, growth: m === 3 ? 0.58 : 0.78 }];
  }

  // Summer crop (millet, rice, maize, soybean, hemp, sorghum, legumes, squash):
  if (m <= 2 || m === 12) return [{ weight: 1, state: PLOT.stubble, color: mul3(STUBBLE0, 0.82), color2: mul3(STUBBLE1, 0.82), cover: 0.4, growth: 0.18 }];
  if (m === 3) return [{ weight: 1, state: PLOT.ploughed, color: SOIL_LOAM0, color2: SOIL_LOAM1, cover: 0.1, growth: 0 }];
  if (m === 4) {
    if (isPaddy) return [{ weight: 1, state: PLOT.flooded, color: PADDY_WATER0, color2: PADDY_WATER1, cover: 0.25, growth: 0.25 }];
    return [{ weight: 1, state: PLOT.sprouting, color: lerp3(SOIL_LOAM0, g0, 0.45), color2: lerp3(SOIL_LOAM1, g1, 0.52), cover: 0.44, growth: 0.3 }];
  }
  if (m === 5) {
    if (isPaddy) return [{ weight: 1, state: PLOT.flooded, color: lerp3(PADDY_WATER0, g0, 0.55), color2: lerp3(PADDY_WATER1, g1, 0.6), cover: 0.62, growth: 0.55 }];
    return [{ weight: 1, state: PLOT.green, color: lerp3(SOIL_LOAM0, g0, 0.78), color2: lerp3(SOIL_LOAM1, g1, 0.82), cover: 0.74, growth: 0.58 }];
  }
  if (m === 6 || m === 7) {
    if (isPaddy) return [{ weight: 1, state: PLOT.flooded, color: lerp3(PADDY_WATER0, g0, 0.78), color2: lerp3(PADDY_WATER1, g1, 0.82), cover: 0.84, growth: m === 6 ? 0.76 : 0.92 }];
    return [{ weight: 1, state: PLOT.green, color: g0, color2: g1, cover: m === 6 ? 0.88 : 0.94, growth: m === 6 ? 0.82 : 0.95 }];
  }
  if (m === 8) {
    return [
      { weight: 0.55, state: PLOT.green, color: lerp3(g0, r0, 0.35), color2: lerp3(g1, r1, 0.4), cover: 0.94, growth: 0.98 },
      { weight: 0.45, state: PLOT.ripe, color: r0, color2: r1, cover: 0.95, growth: 1.0 },
    ];
  }
  if (m === 9) {
    return [
      { weight: 0.72, state: PLOT.ripe, color: r0, color2: r1, cover: 0.94, growth: 1.0 },
      { weight: 0.28, state: PLOT.stubble, color: STUBBLE0, color2: STUBBLE1, cover: 0.52, growth: 0.24 },
    ];
  }
  if (m === 10) {
    return [
      { weight: 0.6, state: PLOT.stubble, color: STUBBLE0, color2: STUBBLE1, cover: 0.48, growth: 0.22 },
      { weight: 0.4, state: PLOT.ploughed, color: SOIL_LOAM0, color2: SOIL_LOAM1, cover: 0.1, growth: 0 },
    ];
  }
  return [{ weight: 1, state: PLOT.ploughed, color: SOIL_LOAM0, color2: SOIL_LOAM1, cover: 0.1, growth: 0 }];
}

/**
 * Compile a scene's crops, field system, month (1..12) and latitude into the fixed 8-slot FieldPalette shared by the
 * ground shader, crop card shader, crop sowing, and fieldworks.
 */
export function buildFieldPalette(
  crops: readonly CropEntry[] | undefined,
  month = 6,
  lat = 35,
  styleKind = 0,
  use = 'rainfed',
  climate = 'temperate',
): FieldPalette {
  const list = crops && crops.length ? crops : genericCropsFor(use, climate);
  const swidden = styleKind === 7;
  const raw: { weight: number; state: PlotState; color: RGB; color2: RGB; row: number; cover: number; growth: number; crop?: CropEntry; archetype?: CropArchetype; cropIndex: number }[] = [];

  // Reserve a modest share for ploughed earth and fallow (or burnt cleared ground for swidden).
  const fallowShare = swidden ? 0.1 : 0.08;
  const ploughedShare = swidden ? 0.36 : 0.10;
  const cropBudget = 1 - fallowShare - ploughedShare;

  const entries = list.map((c, idx) => ({ c, idx, w: CROP_SHARE_WEIGHT[c.share ?? 'secondary'] ?? 1.5 }));

  // Expand crops into phenological slots, capped at FIELD_SLOTS - 2 (leaving room for ploughed & fallow).
  const maxCropSlots = FIELD_SLOTS - 2;
  for (const { c, idx, w } of entries) {
    if (raw.length >= maxCropSlots) break;
    const arch = CROP_ARCHETYPE_OF[c.kind];
    const prof = CROP_PROFILE[arch];
    const stages = cropPhenology(c, month, lat);
    const keep = stages.length > 1 && raw.length + 2 <= maxCropSlots ? stages : [stages[0]];
    const sSum = keep.reduce((a, b) => a + b.weight, 0) || 1;
    for (const st of keep) {
      if (raw.length >= maxCropSlots) break;
      raw.push({
        weight: w * (st.weight / sSum),
        state: st.state,
        color: st.color,
        color2: st.color2,
        row: prof.row,
        cover: st.cover,
        growth: st.growth,
        crop: c,
        archetype: arch,
        cropIndex: idx,
      });
    }
  }
  // Renormalize kept crop slots to fill cropBudget so truncation never inflates ploughed/fallow shares.
  const keptCropWeight = raw.reduce((a, b) => a + b.weight, 0);
  if (keptCropWeight > 0) for (const sl of raw) sl.weight = (sl.weight / keptCropWeight) * cropBudget;

  raw.push({
    weight: ploughedShare,
    state: PLOT.ploughed,
    color: swidden ? SOIL_ASH0 : SOIL_LOAM0,
    color2: swidden ? SOIL_ASH1 : SOIL_LOAM1,
    row: PLOT_LOOK.furrow,
    cover: 0.08,
    growth: 0,
    cropIndex: -1,
  });
  raw.push({
    weight: fallowShare,
    state: PLOT.fallow,
    color: FALLOW0,
    color2: FALLOW1,
    row: PLOT_LOOK.furrow * 1.4,
    cover: 0.35,
    growth: 0,
    cropIndex: -1,
  });

  // Normalize weights to sum to 1 and pad to FIELD_SLOTS.
  const total = raw.reduce((a, b) => a + b.weight, 0) || 1;
  const slots: FieldSlot[] = [];
  let acc = 0;
  for (let i = 0; i < raw.length; i++) {
    acc += raw[i].weight / total;
    const upto = i === raw.length - 1 ? 1 : Math.min(0.9999, acc);
    slots.push({ ...raw[i], upto });
  }
  while (slots.length < FIELD_SLOTS) {
    const last = slots[slots.length - 1];
    slots.push({ ...last, upto: 1 });
  }

  const slotColor = new Float32Array(FIELD_SLOTS * 4);
  const slotColor2 = new Float32Array(FIELD_SLOTS * 4);
  const slotMeta = new Float32Array(FIELD_SLOTS * 4);
  for (let i = 0; i < FIELD_SLOTS; i++) {
    const sl = slots[i];
    slotColor[i * 4] = sl.color[0];
    slotColor[i * 4 + 1] = sl.color[1];
    slotColor[i * 4 + 2] = sl.color[2];
    slotColor[i * 4 + 3] = sl.upto;
    slotColor2[i * 4] = sl.color2[0];
    slotColor2[i * 4 + 1] = sl.color2[1];
    slotColor2[i * 4 + 2] = sl.color2[2];
    slotColor2[i * 4 + 3] = sl.cover;
    slotMeta[i * 4] = sl.state;
    slotMeta[i * 4 + 1] = sl.row;
    slotMeta[i * 4 + 2] = sl.growth;
    slotMeta[i * 4 + 3] = sl.archetype === 'paddy' || sl.state === PLOT.flooded ? 1 : 0;
  }

  return { slots, slotColor, slotColor2, slotMeta, month, lat };
}

/** Pick which slot index (0..FIELD_SLOTS-1) holds parcel hash `pick` (0..1). */
export function plotSlotIndex(pick: number, palette: FieldPalette): number {
  for (let i = 0; i < palette.slots.length - 1; i++) {
    if (pick < palette.slots[i].upto) return i;
  }
  return palette.slots.length - 1;
}

/** Default fallback palette when no agricultural tradition or month is supplied. */
export const DEFAULT_FIELD_PALETTE: FieldPalette = buildFieldPalette(undefined, 6, 35, 0, 'rainfed', 'temperate');

const f = (x: number): string => (Number.isInteger(x) ? `${x}.0` : String(x));
const v3 = (c: readonly number[]): string => `vec3(${c.map(f).join(', ')})`;

/**
 * Exact GLSL counterpart of the two-level macro-domain Voronoi parcel layout above:
 * `plotNumber`, `plotDomain`, and `plotAt` returning parcel hash indices, local fractional coordinates,
 * domain parcel size, across-row coordinate, and macro-domain edge distance.
 */
export const PLOTS_GLSL = `
const int FIELD_SLOTS = ${FIELD_SLOTS};
const float TERRACE_STEP = ${f(TERRACE_STEP)};
const float FIELD_SLOPE_TERRACE_LO = ${f(FIELD_SLOPE.terraceLo)};
const float FIELD_SLOPE_TERRACE_HI = ${f(FIELD_SLOPE.terraceHi)};
const float FIELD_SLOPE_CROP_LO = ${f(FIELD_SLOPE.cropFadeLo)};
const float FIELD_SLOPE_CROP_HI = ${f(FIELD_SLOPE.cropFadeHi)};
highp uint plotMix(highp uint h) {
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  return h ^ (h >> 16u);
}
float plotNumber(highp ivec2 c, highp int k) {
  highp uint h = plotMix(uint(${SEED} + k) ^ (uint(c.x) * 0x27d4eb2du) ^ (uint(c.y) * 0x165667b1u));
  return float(h >> 16u) / 65536.0;
}
vec2 plotWander(vec2 p, float side) {
  float k = 1.0 / (side * 1.85);
  return vec2(
    0.5 + 0.25 * (sin((p.x * 0.83 + p.y * 0.56) * k + 1.3) + sin((p.y * 0.91 - p.x * 0.42) * k * 1.9 + 4.1)),
    0.5 + 0.25 * (sin((p.y * 0.79 - p.x * 0.61) * k + 2.7) + sin((p.x * 0.88 + p.y * 0.47) * k * 1.9 + 0.6))
  );
}
vec4 plotAt(vec2 p, vec4 style, out vec2 size, out float across, out float domainEdge, out highp ivec2 cellId) {
  float side = max(8.0, style.x);
  float aspect = max(1.0, style.y);
  float span = clamp(side * 5.2, 190.0, 380.0);
  highp ivec2 g = ivec2(floor(p / span));
  highp ivec2 bestD = g;
  vec2 bestC = vec2(0.0);
  float bestD2 = 1e20;
  vec2 centers[9];
  highp ivec2 ids[9];
  int idx = 0;
  for (int dj = -1; dj <= 1; dj++) {
    for (int di = -1; di <= 1; di++) {
      highp ivec2 d = g + ivec2(di, dj);
      vec2 c = (vec2(d) + vec2(0.2 + 0.6 * plotNumber(d, 19), 0.2 + 0.6 * plotNumber(d, 23))) * span;
      centers[idx] = c;
      ids[idx] = d;
      idx++;
      vec2 diff = p - c;
      float d2 = dot(diff, diff);
      if (d2 < bestD2) { bestD2 = d2; bestD = d; bestC = c; }
    }
  }
  domainEdge = span;
  for (int k = 0; k < 9; k++) {
    if (ids[k] == bestD) continue;
    vec2 v = centers[k] - bestC;
    float len = length(v);
    if (len < 1e-4) continue;
    vec2 m = 0.5 * (bestC + centers[k]) - p;
    domainEdge = min(domainEdge, dot(m, v) / len);
  }
  domainEdge = max(0.0, domainEdge);
  float ang = plotNumber(bestD, 29) * 3.14159265;
  float ca = cos(ang);
  float sa = sin(ang);
  vec2 dp = p - bestC;
  vec2 lp = vec2(dp.x * ca + dp.y * sa, -dp.x * sa + dp.y * ca);
  bool irregular = (style.z > 1.5 && style.z < 2.5) || (style.z > 6.5 && style.z < 7.5);
  vec2 q = lp + plotWander(lp, side) * side * (irregular ? ${f(PLOT_LOOK.warp.irregular)} : ${f(PLOT_LOOK.warp.regular)});
  float scaleX = 0.78 + 0.44 * plotNumber(bestD, 31);
  float scaleY = 0.76 + 0.48 * plotNumber(bestD, 37);
  size = vec2((side / sqrt(aspect)) * scaleX, (side * sqrt(aspect)) * scaleY);
  highp int ci = int(floor(q.x / size.x));
  highp int salt = (bestD.x * 131) ^ (bestD.y * 137);
  float stagger = (style.z > 0.5 && style.z < 1.5) ? 0.15 : 0.65;
  float shift = plotNumber(ivec2(ci, salt), 41) * size.y * stagger;
  float alongS = q.y + shift;
  highp int cj = int(floor(alongS / size.y));
  vec2 frac = vec2(q.x / size.x - float(ci), alongS / size.y - float(cj));
  cellId = ivec2(uint(ci) ^ (uint(bestD.x) * 0x9e3779b1u), uint(cj) ^ (uint(bestD.y) * 0x85ebca6bu));
  across = q.x;
  return vec4(float(ci), float(cj), frac);
}
const vec3 PLOT_RIPE0 = ${v3(PLOT_LOOK.ripe[0])};
const vec3 PLOT_RIPE1 = ${v3(PLOT_LOOK.ripe[1])};
const vec3 PLOT_GREEN0 = ${v3(PLOT_LOOK.green[0])};
const vec3 PLOT_GREEN1 = ${v3(PLOT_LOOK.green[1])};
`;
