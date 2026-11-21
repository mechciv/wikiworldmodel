// Today's topsoil from SoilGrids 2.0, reduced to a grid small enough to keep in world/snapshots: for each half degree
// of land, how much of its top five centimetres is sand, silt and clay, and how much of its volume is stones. It is
// what a scene's ground is read from in the Holocene (field:earth/soil, core/substrate.ts).
//
// ISRIC serves the grids in the interrupted Goode homolosine projection, an equal-area map of the globe cut into lobes.
// A half degree is read by projecting a lattice of points across it and averaging the pixels they fall in, so each part
// of the cell counts by its area, near enough.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './paths.ts';
import { readTiff } from './tiff.ts';

export const SNAPSHOT = 'world/snapshots/soilgrids-2.0-topsoil-0.5deg.csv';
const BASE = 'https://files.isric.org/soilgrids/latest/data_aggregated/5000m';
const README = 'https://files.isric.org/soilgrids/latest/data_aggregated/README.md';
const UNITS = 'https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html';

/** The four grids, each the mean prediction for 0 to 5 cm at 5000 m: its bytes, and its sha256 as ISRIC publishes it beside the file. */
export const GRIDS = [
  { name: 'sand', column: 'sand', bytes: 9432422, sha256: 'af70445daad0ff93830e81805e55c2b84ff6bf4f4ac2d62e0ab6bc1648e7708f' },
  { name: 'silt', column: 'silt', bytes: 9124548, sha256: '3ab90a1fa4b85008924426c104a43954813c3b3a0e59a7d9e7ac007706585af5' },
  { name: 'clay', column: 'clay', bytes: 8993596, sha256: '8d75b5db5bb295b4f54e64068d5cdbae8283ae7d6fab5278b9225face1b7020a' },
  { name: 'cfvo', column: 'coarse', bytes: 8888390, sha256: '65391a75072079495afd8a0006055120e821174a45934a5845014a414dbc92c0' },
] as const;
const urlOf = (name: string) => `${BASE}/${name}/${name}_0-5cm_mean_5000.tif`;

/** The cell of the snapshot, in degrees; and how many points across it are projected to read it. */
export const CELL = 0.5;
const ACROSS = 10;
/** A cell is kept if at least this share of its points has a soil. */
const LEAST = 0.1;

const RADIUS = 6378137;
/** Where the projection changes from the sinusoidal to Mollweide's: 40° 44′ 11.8″. */
const SWITCH = ((40 + 44 / 60 + 11.8 / 3600) * Math.PI) / 180;
/** How far Mollweide's lobes are slid toward the equator to meet the sinusoidal there, in radii. */
const SLIDE = 0.0528035274542;
const rad = (d: number) => (d * Math.PI) / 180;

/** The middle meridian of the lobe a place is in: two lobes north of the equator, four south of it. */
function lobe(lat: number, lon: number): number {
  if (lat >= 0) return lon <= -40 ? -100 : 30;
  return lon <= -100 ? -160 : lon <= -20 ? -60 : lon <= 80 ? 20 : 140;
}

/** The interrupted Goode homolosine projection on a sphere of the WGS84 ellipsoid's radius: a place in degrees, as metres east and north. */
export function homolosine(lat: number, lon: number): [number, number] {
  const phi = rad(lat);
  const lam = rad(lon);
  const lam0 = rad(lobe(lat, lon));
  if (Math.abs(phi) <= SWITCH) return [RADIUS * (lam0 + (lam - lam0) * Math.cos(phi)), RADIUS * phi];
  // Mollweide's auxiliary angle: 2θ + sin 2θ = π sin φ, by Newton's method; at a pole it is the pole.
  let theta = phi;
  if (Math.abs(phi) > rad(89.99)) theta = (Math.sign(phi) * Math.PI) / 2;
  else {
    for (let i = 0; i < 30; i++) {
      const d = (2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(phi)) / (2 + 2 * Math.cos(2 * theta));
      theta -= d;
      if (Math.abs(d) < 1e-13) break;
    }
  }
  return [RADIUS * (lam0 + ((2 * Math.SQRT2) / Math.PI) * (lam - lam0) * Math.cos(theta)), RADIUS * (Math.SQRT2 * Math.sin(theta) - SLIDE * Math.sign(phi))];
}

export interface SoilCell {
  /** the south-west corner */
  lat: number;
  lon: number;
  /** the share of the cell's points that have a soil */
  land: number;
  /** percent of the fine earth by mass */
  sand: number;
  silt: number;
  clay: number;
  /** percent of the soil by volume that is fragments coarser than 2 mm */
  coarse: number;
}

/** A grid as the reader gives it: its pixels, and where they lie on the projection's plane. */
export interface SoilRaster {
  width: number;
  height: number;
  data: ArrayLike<number>;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  nodata?: number;
}

/** The mean of a grid over each cell of the snapshot, and the share of each cell's points that had a value: row by row from the north, west to east. */
export function cellMeans(r: SoilRaster, cell = CELL, across = ACROSS): { mean: Float32Array; share: Float32Array; nx: number; ny: number } {
  const nx = Math.round(360 / cell);
  const ny = Math.round(180 / cell);
  const mean = new Float32Array(nx * ny).fill(NaN);
  const share = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let sum = 0;
      let n = 0;
      for (let b = 0; b < across; b++) {
        const lat = 90 - (j + (b + 0.5) / across) * cell;
        for (let a = 0; a < across; a++) {
          const lon = -180 + (i + (a + 0.5) / across) * cell;
          const [x, y] = homolosine(lat, lon);
          const col = Math.floor((x - r.x0) / r.dx);
          const row = Math.floor((r.y0 - y) / r.dy);
          if (col < 0 || row < 0 || col >= r.width || row >= r.height) continue;
          const v = r.data[row * r.width + col];
          if (v === r.nodata || !Number.isFinite(v)) continue;
          sum += v;
          n++;
        }
      }
      if (n) mean[j * nx + i] = sum / n;
      share[j * nx + i] = n / (across * across);
    }
  }
  return { mean, share, nx, ny };
}

/** The cells of the snapshot from the four grids' means: those with soil over enough of them. ISRIC's units are tenths of a percent. */
export function soilCells(grids: Record<'sand' | 'silt' | 'clay' | 'coarse', { mean: Float32Array; share: Float32Array; nx: number; ny: number }>, cell = CELL): SoilCell[] {
  const { nx, ny } = grids.sand;
  const out: SoilCell[] = [];
  const pct = (v: number) => Math.round(v) / 10;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const land = Math.min(grids.sand.share[k], grids.silt.share[k], grids.clay.share[k], grids.coarse.share[k]);
      if (land < LEAST) continue;
      out.push({ lat: 90 - (j + 1) * cell, lon: -180 + i * cell, land: Math.round(land * 100) / 100, sand: pct(grids.sand.mean[k]), silt: pct(grids.silt.mean[k]), clay: pct(grids.clay.mean[k]), coarse: pct(grids.coarse.mean[k]) });
    }
  }
  return out;
}

/** The snapshot's text: what it is and what it was made from, then a row a cell. */
export function snapshotText(cells: SoilCell[], files: { name: string; bytes: number; sha256: string }[]): string {
  const head = [
    '# SoilGrids 2.0, the top 5 cm of the soil: sand, silt, clay and coarse fragments in each half degree of land.',
    `# This is not a file of ISRIC's. Each cell is the mean of the 5000 m grids' pixels under a lattice of ${ACROSS} by ${ACROSS} points across it, projected as the grids are; a cell is kept if at least ${LEAST * 100}% of its points have a soil.`,
    '# A row is a cell. lat and lon are its south-west corner, and it runs half a degree north and east of them. land is the share of its points that have a soil.',
    '# sand, silt and clay are percent of the fine earth by mass; coarse is percent of the soil by volume in fragments coarser than 2 mm. ISRIC gives each in tenths of a percent (g/kg, cm3/dm3):',
    `# ${UNITS}`,
    `# Made by \`npm run world -- soilgrids-snapshot\` (tools/world/src/soilgrids.ts), which downloads the four grids below and checks each one's sha256 against the one ISRIC publishes beside it.`,
    '# They are the mean predictions for 0 to 5 cm, which ISRIC "derived by resampling the mean predictions at 250m".',
    `# Licence: ISRIC's readme beside the grids says "The SoilGrids maps are publicly available under the [CC-BY 4.0 License](https://creativecommons.org/licenses/by/4.0/)." Averaging its pixels over half degrees is the change made here: ${README}`,
    '# Cite: Poggio, de Sousa, Batjes, Heuvelink, Kempen, Ribeiro & Rossiter (2021), SOIL 7, 217-240, doi:10.5194/soil-7-217-2021.',
    '# Grids: name, bytes, sha256.',
    ...files.map((f) => `# ${urlOf(f.name)},${f.bytes},${f.sha256}`),
  ];
  const rows = cells.map((c) => [c.lat, c.lon, c.land, c.sand, c.silt, c.clay, c.coarse].join(','));
  return `${[...head, 'lat,lon,land,sand,silt,clay,coarse', ...rows].join('\n')}\n`;
}

/** The snapshot, from ISRIC's files: each downloaded once into the cache and checked against its published sha256. */
export async function exportTopsoil(log: (s: string) => void = console.log): Promise<string> {
  const dir = join(REPO, '.cache/downloads/soilgrids-2.0');
  mkdirSync(dir, { recursive: true });
  const means = {} as Record<'sand' | 'silt' | 'clay' | 'coarse', ReturnType<typeof cellMeans>>;
  for (const g of GRIDS) {
    const path = join(dir, `${g.name}_0-5cm_mean_5000.tif`);
    if (!existsSync(path)) {
      log(`downloading ${urlOf(g.name)}`);
      const res = await fetch(urlOf(g.name), { headers: { 'User-Agent': 'wikiworldmodel-world-tools' } });
      if (!res.ok) throw new Error(`GET ${urlOf(g.name)}: HTTP ${res.status}`);
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    }
    const bytes = readFileSync(path);
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== g.bytes || sha !== g.sha256) throw new Error(`${path}: ${bytes.length} bytes, sha256 ${sha}; ISRIC publishes ${g.bytes} bytes, ${g.sha256}`);
    const r = await readTiff(path);
    log(`${g.name}: ${r.width} × ${r.height} pixels of ${r.dx} m from ${r.x0}, ${r.y0}; nodata ${r.nodata}`);
    means[g.column] = cellMeans(r);
  }
  const cells = soilCells(means);
  log(`${cells.length} cells`);
  return snapshotText(cells, [...GRIDS]);
}

/** The snapshot read back: its cells. */
export function parseTopsoil(text: string): SoilCell[] {
  const lines = text.split('\n').filter((l) => l && !l.startsWith('#'));
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => {
    const v = l.split(',').map(Number);
    return Object.fromEntries(head.map((h, i) => [h, v[i]])) as unknown as SoilCell;
  });
}
