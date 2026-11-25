// Analytical CPU evaluation of the Rayleigh/Mie sky table (matching SKY_LUT_FS in cityShaders.ts)
// to derive zenith/horizon sky light, sun transmittance, bounce, daylight exposure, and 9-band
// spherical harmonics irradiance without stalling the WebGL pipeline via synchronous gl.readPixels.
import type { V3 } from '../mat.ts';

const PI = Math.PI;
const R0 = 6371000;
const R1 = 6471000;
const RAY_R = 5.8e-6;
const RAY_G = 13.5e-6;
const RAY_B = 33.1e-6;
const MIE = 14e-6;
const MIE_EXT = MIE * 1.1;
const G = 0.76;
const G2 = G * G;
const PR_K = 3 / (16 * PI);
const PM_K = (3 / (8 * PI)) * ((1 - G2) / (2 + G2));

// SH basis constants squared times cosine lobe factors Â/π (Ramamoorthi & Hanrahan 2001).
const SH_C = [0.282095, 0.488603, 0.488603, 0.488603, 1.092548, 1.092548, 0.315392, 1.092548, 0.546274];
const SH_A = [1, 2 / 3, 2 / 3, 2 / 3, 1 / 4, 1 / 4, 1 / 4, 1 / 4, 1 / 4];

const luminance = (c: ArrayLike<number>): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

export interface SkyLighting {
  sunColor: V3;
  skyTop: V3;
  skyLow: V3;
  bounce: V3;
  daylight: number;
  skyHarmonics: Float32Array;
}

/**
 * Evaluate the single-scattering sky radiance at relative azimuth `az` (0..π), elevation `el` (-π/2..π/2),
 * sun elevation `sunEl`, and observer altitude `height` (metres), matching SKY_LUT_FS.
 */
export function evalSkyRadiance(az: number, el: number, sunEl: number, height = 20): V3 {
  const sx = Math.cos(sunEl);
  const sz = Math.sin(sunEl);
  const ce = Math.cos(el);
  const dx = ce * Math.cos(az);
  const dy = ce * Math.sin(az);
  const dz = Math.sin(el);
  const roz = R0 + Math.max(1, height);

  // Intersect ray (0, 0, roz) + t * d with outer atmosphere (R1) and Earth surface (R0).
  const b1 = roz * dz;
  const c1 = roz * roz - R1 * R1;
  const d1 = b1 * b1 - c1;
  if (d1 < 0) return [0, 0, 0];
  let t1 = -b1 + Math.sqrt(d1);

  const c0 = roz * roz - R0 * R0;
  const d0 = b1 * b1 - c0;
  if (d0 >= 0) {
    const gx = -b1 - Math.sqrt(d0);
    if (gx > 0 && gx < t1) t1 = gx;
  }

  const dt = t1 / 18;
  let rayR = 0;
  let rayG = 0;
  let rayB = 0;
  let mieR = 0;
  let mieG = 0;
  let mieB = 0;
  let odR = 0;
  let odM = 0;

  for (let i = 0; i < 18; i++) {
    const t = (i + 0.5) * dt;
    const px = dx * t;
    const py = dy * t;
    const pz = roz + dz * t;
    const p2 = px * px + py * py + pz * pz;
    const h = Math.sqrt(p2) - R0;
    const dR = Math.exp(-h / 8000) * dt;
    const dM = Math.exp(-h / 1500) * dt;
    odR += dR;
    odM += dM;

    const bs = px * sx + pz * sz;
    const dg = bs * bs - (p2 - R0 * R0);
    if (dg >= 0 && -bs - Math.sqrt(dg) > 0) continue;

    const dl1 = bs * bs - (p2 - R1 * R1);
    if (dl1 < 0) continue;
    const dl = (-bs + Math.sqrt(dl1)) / 8;
    let lR = 0;
    let lM = 0;
    for (let j = 0; j < 8; j++) {
      const s = (j + 0.5) * dl;
      const qx = px + sx * s;
      const qz = pz + sz * s;
      const hq = Math.sqrt(qx * qx + py * py + qz * qz) - R0;
      lR += Math.exp(-hq / 8000) * dl;
      lM += Math.exp(-hq / 1500) * dl;
    }
    const totR = odR + lR;
    const totM = MIE_EXT * (odM + lM);
    const trR = Math.exp(-(RAY_R * totR + totM));
    const trG = Math.exp(-(RAY_G * totR + totM));
    const trB = Math.exp(-(RAY_B * totR + totM));
    rayR += trR * dR;
    rayG += trG * dR;
    rayB += trB * dR;
    mieR += trR * dM;
    mieG += trG * dM;
    mieB += trB * dM;
  }

  const mu = dx * sx + dz * sz;
  const mu2 = 1 + mu * mu;
  const pr = PR_K * mu2;
  const denom = 1 + G2 - 2 * G * mu;
  const pm = PM_K * (mu2 / (denom * Math.sqrt(Math.max(denom, 1e-8))));
  return [
    18 * (rayR * RAY_R * pr + mieR * MIE * pm),
    18 * (rayG * RAY_G * pr + mieG * MIE * pm),
    18 * (rayB * RAY_B * pr + mieB * MIE * pm),
  ];
}

/** Map a LUT UV coordinate (u in [0, 1], v in [0, 1]) to radiance at height 20 m, matching SKY_LUT_FS. */
function evalSkyLutUv(u: number, v: number, sunEl: number): V3 {
  const az = u * PI;
  const k = v * 2 - 1;
  const el = Math.sign(k) * k * k * 1.5708;
  return evalSkyRadiance(az, el, sunEl, 20);
}

/**
 * Compute all CPU-side sky lighting parameters (sun color, zenith/horizon sky colors, 9-band SH
 * irradiance, daylight exposure reference, and ground bounce) directly from the sun vector with
 * zero WebGL readbacks.
 */
export function computeSkyLighting(sun: V3): SkyLighting {
  const el = Math.asin(Math.max(-1, Math.min(1, sun[2])));
  const zen = evalSkyLutUv(0.5, 0.97, el);
  const hA = evalSkyLutUv(0.1, 0.56, el);
  const hB = evalSkyLutUv(0.9, 0.56, el);
  const hM = evalSkyLutUv(0.5, 0.56, el);
  const low: V3 = [
    (hA[0] + hB[0] + 2 * hM[0]) / 4,
    (hA[1] + hB[1] + 2 * hM[1]) / 4,
    (hA[2] + hB[2] + 2 * hM[2]) / 4,
  ];

  // Sunlight, reddened by the air mass it crossed (matching updateSky in city.ts).
  const deg = (el * 180) / PI;
  const air = 1 / (Math.max(Math.sin(el), 0) + 0.15 * Math.pow(Math.max(deg + 3.885, 0.3), -1.253));
  const tr = (b: number, m: number) => Math.exp(-(b * 8000 + m * 1500 * 1.1) * air);
  const up = Math.max(0, Math.min(1, (deg + 2) / 4));
  const soft = (x: number) => Math.pow(x, 0.62);
  const sunColor: V3 = [
    soft(tr(RAY_R, MIE)) * 3.8 * up,
    soft(tr(RAY_G, MIE)) * 3.75 * up,
    soft(tr(RAY_B, MIE)) * 3.7 * up,
  ];
  const skyTop: V3 = [zen[0] * 0.62, zen[1] * 0.62, zen[2] * 0.62];
  const skyLow: V3 = [low[0] * 0.26, low[1] * 0.26, low[2] * 0.26];

  // Project upper hemisphere onto 9 spherical harmonics using a compact symmetric relative-azimuth grid
  // (17 azimuth samples across [0, π] × 12 elevations = 204 radiance evaluations) integrated over 64 × 12 bins.
  const NA_GRID = 17;
  const NE = 12;
  const NA = 64;
  const grid = new Float32Array(NE * NA_GRID * 3);
  for (let j = 0; j < NE; j++) {
    const skyEl = ((j + 0.5) / NE) * (PI / 2);
    for (let m = 0; m < NA_GRID; m++) {
      const az = (m / (NA_GRID - 1)) * PI;
      const c = evalSkyRadiance(az, skyEl, el, 20);
      const o = (j * NA_GRID + m) * 3;
      grid[o] = c[0];
      grid[o + 1] = c[1];
      grid[o + 2] = c[2];
    }
  }

  const L = new Float64Array(27);
  const phiS = Math.atan2(sun[1], sun[0]);
  const dEl = (PI / 2) / NE;
  const dPhi = (2 * PI) / NA;

  for (let j = 0; j < NE; j++) {
    const skyEl = ((j + 0.5) / NE) * (PI / 2);
    const ce = Math.cos(skyEl);
    const z = Math.sin(skyEl);
    const dw = ce * dEl * dPhi;
    const rowOff = j * NA_GRID * 3;
    for (let i = 0; i < NA; i++) {
      const phi = ((i + 0.5) / NA) * 2 * PI;
      const rel = Math.abs(((((phi - phiS) % (2 * PI)) + 3 * PI) % (2 * PI)) - PI);
      const u = (rel / PI) * (NA_GRID - 1);
      const m0 = Math.min(NA_GRID - 2, Math.floor(u));
      const f = u - m0;
      const o0 = rowOff + m0 * 3;
      const o1 = o0 + 3;
      const r = grid[o0] * (1 - f) + grid[o1] * f;
      const g = grid[o0 + 1] * (1 - f) + grid[o1 + 1] * f;
      const b = grid[o0 + 2] * (1 - f) + grid[o1 + 2] * f;

      const x = ce * Math.cos(phi);
      const y = ce * Math.sin(phi);
      const Y0 = 1;
      const Y1 = y;
      const Y2 = z;
      const Y3 = x;
      const Y4 = x * y;
      const Y5 = y * z;
      const Y6 = 3 * z * z - 1;
      const Y7 = x * z;
      const Y8 = x * x - y * y;
      L[0] += r * Y0 * dw; L[1] += g * Y0 * dw; L[2] += b * Y0 * dw;
      L[3] += r * Y1 * dw; L[4] += g * Y1 * dw; L[5] += b * Y1 * dw;
      L[6] += r * Y2 * dw; L[7] += g * Y2 * dw; L[8] += b * Y2 * dw;
      L[9] += r * Y3 * dw; L[10] += g * Y3 * dw; L[11] += b * Y3 * dw;
      L[12] += r * Y4 * dw; L[13] += g * Y4 * dw; L[14] += b * Y4 * dw;
      L[15] += r * Y5 * dw; L[16] += g * Y5 * dw; L[17] += b * Y5 * dw;
      L[18] += r * Y6 * dw; L[19] += g * Y6 * dw; L[20] += b * Y6 * dw;
      L[21] += r * Y7 * dw; L[22] += g * Y7 * dw; L[23] += b * Y7 * dw;
      L[24] += r * Y8 * dw; L[25] += g * Y8 * dw; L[26] += b * Y8 * dw;
    }
  }

  const skyHarmonics = new Float32Array(27);
  for (let k = 0; k < 9; k++) {
    const fac = SH_C[k] * SH_C[k] * SH_A[k];
    skyHarmonics[k * 3] = L[k * 3] * fac;
    skyHarmonics[k * 3 + 1] = L[k * 3 + 1] * fac;
    skyHarmonics[k * 3 + 2] = L[k * 3 + 2] * fac;
  }
  const upLit: V3 = [
    skyHarmonics[0] + skyHarmonics[6] + 2 * skyHarmonics[18],
    skyHarmonics[1] + skyHarmonics[7] + 2 * skyHarmonics[19],
    skyHarmonics[2] + skyHarmonics[8] + 2 * skyHarmonics[20],
  ];
  const scale = luminance(skyTop) / Math.max(1e-6, luminance(upLit));
  for (let k = 0; k < 27; k++) skyHarmonics[k] *= scale;

  const s = Math.max(sun[2], 0);
  const daylight = luminance(sunColor) * s + luminance(skyTop);
  const bounce: V3 = [
    (sunColor[0] * s + skyTop[0]) * 0.13,
    (sunColor[1] * s + skyTop[1]) * 0.105,
    (sunColor[2] * s + skyTop[2]) * 0.075,
  ];

  return { sunColor, skyTop, skyLow, bounce, daylight, skyHarmonics };
}
