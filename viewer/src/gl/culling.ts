// Pure geometry, shadow-cascade culling, hemi-octahedral impostor projection, and half-resolution
// target helpers shared by the local scene renderer and its unit tests.
import type { Mat4, V3 } from '../mat.ts';
import { invert, multiply } from '../mat.ts';

/** Radius of Earth used for curvature drop in local scene shaders (cityShaders.ts, DROP). */
export const PLANET_RADIUS = 6371000;

/** Vertex stride in bytes for packed local scene meshes (pos3f, nrm4u8, uv2f, mat2u8, entity1u16). */
export const VERTEX_STRIDE = 28;
/** Instance stride in bytes for instanced batches (x, y, z, scale, fx, fy as floats; entity, tint as u16). */
export const INSTANCE_STRIDE = 28;
/** Float stride for per-instance movement routes (world/generators/life/routines.ts, ROUTE). */
export const WAY_STRIDE = 12;

/** Material codes for foliage cards and plants (cityShaders.ts, LEAVES / MESH_VS). */
const isCardMat = (m: number): boolean => (m >= 44 && m <= 47) || m === 49 || m === 73;
const isPlantMat = (m: number): boolean => (m >= 35 && m <= 38) || (m >= 44 && m <= 49) || m === 71 || m === 73;

/** Local-space bounding volume and material flags of an instanced prototype mesh. */
export interface ProtoBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Maximum horizontal distance from local (0, 0). */
  xyRadius: number;
  /** Maximum 3D distance from local (0, 0, 0), used for conservative GPU cascade culling. */
  originRadius: number;
  /** Vertical midpoint (minZ + maxZ) / 2, used as octahedral impostor center. */
  midZ: number;
  /** Tight bounding sphere radius around (0, 0, midZ), used for impostor projection & quad sizing. */
  sphereRadius: number;
  /** Whether any vertex uses a foliage card material. */
  hasCards: boolean;
  /** Whether any vertex uses a wind-swayed plant material. */
  isPlant: boolean;
}

/** World-space conservative bounds of an instanced batch for per-cascade shadow culling. */
export interface BatchBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  maxScale: number;
  maxHeight: number;
  maxWidth: number;
  /** Whether any instance in this batch has a nonzero movement speed. */
  hasMovers: boolean;
}

/** Orthographic shadow cascade frustum parameters used for CPU batch culling. */
export interface CascadeBox {
  right: V3;
  up: V3;
  sun: V3;
  sR: number;
  sU: number;
  radius: number;
  texel: number;
  cascadeIndex: number;
}

/** Compute local bounding geometry and material flags from packed 28-byte mesh vertices. */
export function computeProtoBounds(vertices: ArrayBuffer): ProtoBounds {
  const count = Math.floor(vertices.byteLength / VERTEX_STRIDE);
  if (count === 0) {
    return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0, xyRadius: 0, originRadius: 0, midZ: 0, sphereRadius: 0, hasCards: false, isPlant: false };
  }
  const f32 = new Float32Array(vertices);
  const u8 = new Uint8Array(vertices);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let xyR2 = 0;
  let originR2 = 0;
  let hasCards = false;
  let isPlant = false;
  for (let i = 0; i < count; i++) {
    const o = i * 7;
    const x = f32[o];
    const y = f32[o + 1];
    const z = f32[o + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
    const r2 = x * x + y * y;
    if (r2 > xyR2) xyR2 = r2;
    const d2 = r2 + z * z;
    if (d2 > originR2) originR2 = d2;
    const mat = u8[i * VERTEX_STRIDE + 24];
    if (!hasCards && isCardMat(mat)) hasCards = true;
    if (!isPlant && isPlantMat(mat)) isPlant = true;
  }
  const midZ = 0.5 * (minZ + maxZ);
  let sphereR2 = 0;
  for (let i = 0; i < count; i++) {
    const o = i * 7;
    const x = f32[o];
    const y = f32[o + 1];
    const dz = f32[o + 2] - midZ;
    const d2 = x * x + y * y + dz * dz;
    if (d2 > sphereR2) sphereR2 = d2;
  }
  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    xyRadius: Math.sqrt(xyR2),
    originRadius: Math.sqrt(originR2),
    midZ,
    sphereRadius: Math.sqrt(sphereR2),
    hasCards,
    isPlant,
  };
}

/**
 * Compute conservative world-space AABB for an instanced batch, expanding for prototype extent,
 * wind sway margin on plants, and per-instance walking/circling routes when present.
 */
export function computeBatchBounds(data: ArrayBuffer, count: number, proto: ProtoBounds, ways?: ArrayBuffer): BatchBounds {
  if (count <= 0) {
    return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0, maxScale: 0, maxHeight: 0, maxWidth: 0, hasMovers: false };
  }
  const f32 = new Float32Array(data);
  const w32 = ways ? new Float32Array(ways) : null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let maxScale = 0;
  let hasMovers = false;
  // Slight pad for wind lean or idle head/tail swings.
  const xyPad = proto.isPlant ? proto.xyRadius * 1.15 + 0.5 : proto.xyRadius * 1.1;
  const minZOff = proto.minZ;
  const maxZOff = proto.maxZ * 1.05;
  for (let i = 0; i < count; i++) {
    const o = i * 7;
    const x = f32[o];
    const y = f32[o + 1];
    const z = f32[o + 2];
    const s = Math.abs(f32[o + 3]);
    if (s > maxScale) maxScale = s;
    const r = xyPad * s;
    let loX = x - r;
    let hiX = x + r;
    let loY = y - r;
    let hiY = y + r;
    let loZ = z + minZOff * s;
    let hiZ = z + maxZOff * s;
    if (w32) {
      const wo = i * WAY_STRIDE;
      const v = w32[wo + 8];
      if (v > 0) {
        hasMovers = true;
        const ax = w32[wo];
        const ay = w32[wo + 1];
        const az = w32[wo + 2];
        const kind = Math.floor(w32[wo + 11]);
        if (kind === 2) {
          // Circling around center (x + ax, y + ay) with radius hypot(ax, ay).
          const cr = Math.hypot(ax, ay);
          loX = Math.min(loX, x + ax - cr - r);
          hiX = Math.max(hiX, x + ax + cr + r);
          loY = Math.min(loY, y + ay - cr - r);
          hiY = Math.max(hiY, y + ay + cr + r);
        } else {
          const bx = w32[wo + 4];
          const by = w32[wo + 5];
          const bz = w32[wo + 6];
          loX += Math.min(0, ax, bx);
          hiX += Math.max(0, ax, bx);
          loY += Math.min(0, ay, by);
          hiY += Math.max(0, ay, by);
          loZ += Math.min(0, az, bz);
          hiZ += Math.max(0, az, bz);
        }
      }
    }
    if (loX < minX) minX = loX;
    if (hiX > maxX) maxX = hiX;
    if (loY < minY) minY = loY;
    if (hiY > maxY) maxY = hiY;
    if (loZ < minZ) minZ = loZ;
    if (hiZ > maxZ) maxZ = hiZ;
  }
  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    maxScale,
    maxHeight: Math.max(0, proto.maxZ - proto.minZ) * maxScale,
    maxWidth: 2 * proto.xyRadius * maxScale,
    hasMovers,
  };
}

/**
 * Test whether a batch can visibly cast shadows into a given cascade:
 * 1. In cascades >= 1, skip casters whose shadow footprint is smaller than 2 shadow texels (inside normal/depth bias).
 * 2. Project the curvature-adjusted world AABB onto the cascade's orthographic (right, up) axes.
 */
export function batchOverlapsCascade(batch: BatchBounds, cascade: CascadeBox): boolean {
  if (batch.maxScale <= 0) return false;
  if (cascade.cascadeIndex >= 1) {
    const sunSin = Math.max(cascade.sun[2], 0.15);
    const shadowExtent = Math.max(batch.maxWidth, batch.maxHeight / sunSin);
    if (shadowExtent < cascade.texel * 2.0) return false;
  }
  // Account conservatively for Earth curvature drop(p.xy) = (x^2 + y^2) / (2 * PLANET_RADIUS).
  const maxX2 = Math.max(batch.minX * batch.minX, batch.maxX * batch.maxX);
  const maxY2 = Math.max(batch.minY * batch.minY, batch.maxY * batch.maxY);
  const minX2 = batch.minX <= 0 && batch.maxX >= 0 ? 0 : Math.min(batch.minX * batch.minX, batch.maxX * batch.maxX);
  const minY2 = batch.minY <= 0 && batch.maxY >= 0 ? 0 : Math.min(batch.minY * batch.minY, batch.maxY * batch.maxY);
  const minZ = batch.minZ - (maxX2 + maxY2) / (2 * PLANET_RADIUS);
  const maxZ = batch.maxZ - (minX2 + minY2) / (2 * PLANET_RADIUS);

  const cx = 0.5 * (batch.minX + batch.maxX);
  const cy = 0.5 * (batch.minY + batch.maxY);
  const cz = 0.5 * (minZ + maxZ);
  const ex = 0.5 * (batch.maxX - batch.minX);
  const ey = 0.5 * (batch.maxY - batch.minY);
  const ez = 0.5 * (maxZ - minZ);

  const [rx, ry, rz] = cascade.right;
  const cR = cx * rx + cy * ry + cz * rz;
  const eR = ex * Math.abs(rx) + ey * Math.abs(ry) + ez * Math.abs(rz);
  if (Math.abs(cR - cascade.sR) > cascade.radius + eR) return false;

  const [ux, uy, uz] = cascade.up;
  const cU = cx * ux + cy * uy + cz * uz;
  const eU = ex * Math.abs(ux) + ey * Math.abs(uy) + ez * Math.abs(uz);
  return Math.abs(cU - cascade.sU) <= cascade.radius + eU;
}

/**
 * Hemi-octahedral encoding of an upper-hemisphere direction (z >= 0) to [0, 1]^2.
 * Uses 100% of the square grid with continuous transitions across the entire hemisphere.
 */
export function hemiOctEncode(x: number, y: number, z: number): [number, number] {
  const cz = Math.max(0, z);
  const inv = 1 / (Math.abs(x) + Math.abs(y) + cz || 1);
  const px = x * inv;
  const py = y * inv;
  return [0.5 * (px + py) + 0.5, 0.5 * (px - py) + 0.5];
}

/** Inverse of hemiOctEncode: maps [0, 1]^2 back to a unit upper-hemisphere direction (z >= 0). */
export function hemiOctDecode(u: number, v: number): V3 {
  const sx = u * 2 - 1;
  const sy = v * 2 - 1;
  const px = 0.5 * (sx + sy);
  const py = 0.5 * (sx - sy);
  const z = Math.max(0, 1 - Math.abs(px) - Math.abs(py));
  const len = Math.hypot(px, py, z) || 1;
  return [px / len, py / len, z / len];
}

/** Orthonormal camera frame (right, up, dir) looking along -dir from a hemi-octahedral view direction `dir`. */
export function octFrame(dir: V3): { right: V3; up: V3; dir: V3 } {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const dx = dir[0] / len;
  const dy = dir[1] / len;
  const dz = dir[2] / len;
  // Cross([0, 0, 1], dir) = (-dy, dx, 0); fall back cleanly near zenith.
  let rx = -dy;
  let ry = dx;
  const rl = Math.hypot(rx, ry);
  if (rl < 1e-4) {
    rx = 1;
    ry = 0;
  } else {
    rx /= rl;
    ry /= rl;
  }
  // up = cross(dir, right)
  const ux = -dz * ry;
  const uy = dz * rx;
  const uz = dx * ry - dy * rx;
  return { right: [rx, ry, 0], up: [ux, uy, uz], dir: [dx, dy, dz] };
}

/**
 * Barycentric triangle lookup on an N x N hemi-octahedral grid for UV in [0, 1]^2.
 * Returns the 3 surrounding integer grid cells and their weights (summing to 1).
 */
export function octGridWeights(u: number, v: number, grid: number): {
  c0: [number, number];
  c1: [number, number];
  c2: [number, number];
  w: [number, number, number];
} {
  const span = grid - 1;
  const gx = Math.max(0, Math.min(span, u * span));
  const gy = Math.max(0, Math.min(span, v * span));
  const ix = Math.min(span - 1, Math.floor(gx));
  const iy = Math.min(span - 1, Math.floor(gy));
  const fx = gx - ix;
  const fy = gy - iy;
  const c0: [number, number] = [ix, iy];
  const c1: [number, number] = fx >= fy ? [ix + 1, iy] : [ix, iy + 1];
  const c2: [number, number] = [ix + 1, iy + 1];
  const w0 = 1 - Math.max(fx, fy);
  const w1 = Math.abs(fx - fy);
  const w2 = Math.min(fx, fy);
  return { c0, c1, c2, w: [w0, w1, w2] };
}

/** Compute half-resolution render target dimensions (at least 1 x 1). */
export function halfSize(w: number, h: number): [number, number] {
  return [Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2))];
}

/** Compute scaled internal render dimensions clamped to [0.25, 1.0] scale and at least 1 x 1 pixels. */
export function scaledRenderSize(outW: number, outH: number, scale: number): [number, number] {
  const s = Number.isFinite(scale) && scale > 0 ? Math.max(0.25, Math.min(1, scale)) : 1;
  return [Math.max(1, Math.round(outW * s)), Math.max(1, Math.round(outH * s))];
}

/** Smooth cubic Hermite falloff from 1 at `x <= from` to 0 at `x >= to`. */
export function smoothDown(x: number, from: number, to: number): number {
  if (to <= from) return x <= from ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
  return 1 - t * t * (3 - 2 * t);
}

/** Staged continuous weights [0..1] for near-ground effects, replacing a single altitude cliff. */
export interface LocalEffectWeights {
  ao: number;
  banks: number;
  waterScreen: number;
  shafts: number;
  smoke: number;
  ambient: boolean;
}

/**
 * Continuous altitude weights for local rendering passes. Each effect fades smoothly to zero over
 * its own band before its GPU pass is skipped, eliminating hard visual pops during vertical zoom.
 */
export function localEffectWeights(clearance: number, fast: boolean): LocalEffectWeights {
  const c = Math.max(0, clearance);
  if (fast) {
    return { ao: 0, banks: 0, waterScreen: 0, shafts: 0, smoke: 0, ambient: c < 10000 };
  }
  return {
    ao: smoothDown(c, 4000, 10000),
    banks: smoothDown(c, 2000, 6000),
    waterScreen: smoothDown(c, 3000, 8000),
    shafts: smoothDown(c, 1500, 4000),
    smoke: smoothDown(c, 1100, 1800),
    ambient: c < 10000,
  };
}

/** Terrain-relative volumetric cloud layer [base, top] (metres ASL) and smooth altitude fade alpha. */
export interface CloudLayer {
  base: number;
  top: number;
  alpha: number;
}

/**
 * Place fair-weather volumetric clouds 1400–2400 m above local ground elevation (or sea level over
 * ocean/lowlands), smoothly fading out over the 400 m approach to the cloud base so high plateaus
 * still have clouds and ascending through the layer never pops.
 */
export function cloudLayerFor(eyeSea: number, clearance: number): CloudLayer {
  const groundZ = Math.max(0, eyeSea - Math.max(0, clearance));
  const base = groundZ + 1400;
  const top = base + 1000;
  return {
    base,
    top,
    alpha: smoothDown(eyeSea, base - 400, base),
  };
}

/** Build a matrix reprojecting current clip space into a previous frame's clip space given eye motion. */
export function reprojectMatrix(currentVp: Mat4, lastVp: Mat4, eye: V3, lastEye: V3): Mat4 {
  const dx = eye[0] - lastEye[0];
  const dy = eye[1] - lastEye[1];
  const dz = eye[2] - lastEye[2];
  const move = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, dx, dy, dz, 1]);
  return multiply(lastVp, multiply(move, invert(currentVp)));
}

/** World-space horizontal bounds of a static chunk/cell mesh for targeted shadow-cascade invalidation. */
export interface MeshBounds2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Conservative horizontal overlap test between a static mesh AABB and a shadow cascade centered on `focus`. */
export function meshBoundsOverlapsCascade(bounds: MeshBounds2D, focus: V3, radius: number): boolean {
  const r = radius * 1.45;
  return bounds.maxX >= focus[0] - r && bounds.minX <= focus[0] + r && bounds.maxY >= focus[1] - r && bounds.minY <= focus[1] + r;
}

/** Discrete geometric steps (powers of √2) for nearest shadow cascade radius during interactive motion. */
const SHADOW_R0_STEPS = [24, 34, 48, 68, 96, 136, 192, 272, 384, 544, 768, 1088, 1400];

/**
 * Compute shadow cascade radii [r0, r1, r2]. When settled (`!interactive`), matches exact continuous
 * range sizing for golden-image fidelity. During interactive camera motion (`interactive`), quantizes
 * r0 to discrete √2 steps with hysteresis so continuous zooming does not invalidate all three cascades
 * on every scroll wheel tick.
 */
export function quantizeShadowRadii(range: number, prevR0: number | null, interactive: boolean): V3 {
  const target = Math.min(Math.max(24, range), 1400);
  let r0 = target;
  if (interactive) {
    if (prevR0 !== null && prevR0 >= 24 && prevR0 <= 1400 && target >= prevR0 / 1.25 && target <= prevR0 * 1.25) {
      r0 = prevR0;
    } else {
      let best = SHADOW_R0_STEPS[SHADOW_R0_STEPS.length - 1];
      let bestErr = Infinity;
      for (const s of SHADOW_R0_STEPS) {
        const err = Math.abs(Math.log2(target / s));
        if (err < bestErr) {
          bestErr = err;
          best = s;
        }
      }
      r0 = best;
    }
  }
  const r1 = Math.min(r0 * 5, 7000);
  const r2 = Math.max(r1 * 2.5, 9000);
  return [r0, r1, r2];
}

/**
 * Grid snap step for shadow cascade origin alignment. Always an integer multiple of a shadow texel
 * so shadows never swim, using coarser multiples during interactive motion to cut pan redraws.
 */
export function shadowCascadeSnap(texel: number, cascadeIndex: number, interactive: boolean): number {
  if (!interactive) return texel;
  return texel * (cascadeIndex === 0 ? 4 : cascadeIndex === 1 ? 16 : 64);
}

/** Cached shadow cascade coverage used to decide whether a stale cascade can be deferred cleanly. */
export interface CachedShadowCascade {
  sR: number;
  sU: number;
  radius: number;
  focus: V3;
}

/**
 * Whether a stale shadow cascade can safely reuse its cached shadow map and projection matrix for
 * another interactive frame without clipping shadows inside the view.
 */
export function canDeferCascade(
  cached: CachedShadowCascade | null,
  cR: number,
  cU: number,
  wantR: number,
  framesSince: number,
  cascadeIndex: number,
): boolean {
  if (!cached || cascadeIndex === 0) return false;
  const maxFrames = cascadeIndex === 1 ? 3 : 6;
  if (framesSince >= maxFrames) return false;
  if (wantR < cached.radius * 0.5 || wantR > cached.radius * 2.0) return false;
  const margin = cached.radius * (cascadeIndex === 1 ? 0.2 : 0.35);
  return Math.abs(cR - cached.sR) <= margin && Math.abs(cU - cached.sU) <= margin;
}

/** Disjoint sorted [lo0, hi0, lo1, hi1, ...] time intervals where at least one entity is rising or falling. */
export interface EntityTransitionSchedule {
  intervals: Float64Array;
}

/**
 * Precompute the merged disjoint time intervals during which any entity in `entityData` ([start, end, flags, base])
 * changes height (within `[start - riseYears, start]` or `[end, end + riseYears]`). Between intervals, every entity's
 * standing factor is mathematically constant, so shadows need not be re-rendered when scrubbing quiet years.
 */
export function buildEntityTransitions(entityData: Float32Array | null, riseYears: number, entityCount?: number): EntityTransitionSchedule {
  if (!entityData || entityData.length < 8) return { intervals: new Float64Array(0) };
  const raw: [number, number][] = [];
  const SENTINEL = 1.99e7;
  const limit = entityCount !== undefined ? Math.min(entityData.length, entityCount * 4) : entityData.length;
  // Index 0 is the unused null entity; skip it and any all-zero texture padding rows.
  for (let i = 4; i + 3 < limit; i += 4) {
    const start = entityData[i];
    const end = entityData[i + 1];
    if (start === 0 && end === 0 && entityData[i + 2] === 0 && entityData[i + 3] === 0) continue;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start - riseYears > end + riseYears) continue;
    if (Math.abs(start) < SENTINEL) raw.push([start - riseYears, start]);
    if (Math.abs(end) < SENTINEL) raw.push([end, end + riseYears]);
  }
  if (!raw.length) return { intervals: new Float64Array(0) };
  raw.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: number[] = [];
  let lo = raw[0][0];
  let hi = raw[0][1];
  for (let i = 1; i < raw.length; i++) {
    const [a, b] = raw[i];
    if (a <= hi) {
      if (b > hi) hi = b;
    } else {
      merged.push(lo, hi);
      lo = a;
      hi = b;
    }
  }
  merged.push(lo, hi);
  return { intervals: Float64Array.from(merged) };
}

/**
 * Event-driven temporal shadow cache key: constant across all timestamps inside a quiet gap between
 * entity rise/fall transitions, and smoothly stepped only while an entity is actively changing height.
 */
export function shadowTimeKey(schedule: EntityTransitionSchedule, time: number, interactive: boolean): string {
  const iv = schedule.intervals;
  const count = iv.length >> 1;
  if (count === 0) return 'q:0';
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (iv[mid * 2 + 1] < time) lo = mid + 1;
    else hi = mid;
  }
  if (lo < count && time >= iv[lo * 2] && time <= iv[lo * 2 + 1]) {
    const step = interactive ? Math.round(time * 2) : Math.round(time * 100);
    return `a:${lo}:${step}`;
  }
  return `q:${lo}`;
}

