// The ground below the relief's grid, and before the times it is held for (docs/SCENES.md, "The ground's shape"), in
// the build and the viewer alike.
//
//   the finer level   field:earth/relief is held on a grid of a tenth of a degree. Its survey is finer: a sixtieth. The
//                     build keeps what the survey has at each of its cells less what the relief's grid makes of it
//                     there, in tiles a scene sends for at its place. Laid over the relief, it is the survey's ground.
//   carried back      Before the times today's relief is held for, the elevation of each time is a degree's, and says
//                     where the land stood and how high. model:earth/relief-carried lays today's shape over it, moved
//                     with its plate: today's ground less what that same elevation makes of today, all of it through
//                     the Quaternary and none of it before the Pliocene, and further back only within a range whose
//                     record says it stood. So where that elevation is its picture of today, the ground is today's.
//
// Nothing here is a fact about any place: the survey's values come in tiles, the rule's times from the records.
import type { ReliefPatch, ReliefShape } from './scene.ts';
import { toMa } from './time.ts';

// ——— The finer level's coding ———

/**
 * A height in metres as one byte: twice its square root, with its sign. So a metre is told from none, its steps a
 * quarter of a metre near the grid's own ground and as wide as the root of the height further from it, and a mountain
 * wall of four kilometres fits, known to within thirty-two metres.
 */
export function encodeShape(m: number): number {
  const c = Math.round(2 * Math.sqrt(m < 0 ? -m : m));
  const k = c > 127 ? 127 : c;
  return m < 0 ? -k : k;
}

/** The height a byte stands for, m. */
export const decodeShape = (c: number): number => (c < 0 ? -(c * c) / 4 : (c * c) / 4);

/** A tile of the finer level: its cells' codes, by row from the north, deflated or as they are. */
export interface ReliefFineHeader {
  format: 'lightworld-relief-fine@1';
  /** its north-west corner, in degrees; how many cells a side; and a cell's size in degrees */
  north: number;
  west: number;
  n: number;
  step: number;
  coding: 'sqrt4';
  packed: 'deflate' | 'none';
  /** the buffer that holds its codes */
  codes: number;
}

/** A range whose record says when it stood (earth/orogens): where it is on today's Earth, and its times. */
export interface ReliefRange {
  id: string;
  label: string;
  /** its outline on today's Earth: polygons, each its rings of [lon, lat], the first the outer one */
  outline: number[][][][];
  /** by when it stood at about its present height, Ma; and when its growth began, where its record says */
  standingMa: number;
  startMa?: number;
}

/** What the build says of the ground below its grid (relief/index.json). */
export interface ReliefInfo {
  format: 'lightworld-relief@1';
  /** the field whose finer level this is, and the survey it is read from */
  field: string;
  title: string;
  source: string;
  credit?: string;
  fine: {
    /** a cell's size, and a tile's, in degrees; where the tiles are */
    step: number;
    tile_deg: number;
    dir: string;
    /** how far from its place a scene reads them, in degrees of latitude */
    reach_deg: number;
    /** which tiles there are: a row of tiles from the north in each, west to east, a hex digit for every four */
    rows: string[];
  };
  /** today's shape carried back before the field's own times (model:earth/relief-carried), where the world has the rule */
  carried?: {
    field: string;
    title: string;
    model: string;
    /** all of today's shape stood through this age, Ma, and none of it by this one */
    fullMa: number;
    goneMa: number;
    /** how far another plate may have moved against a scene's own, in nodes of the relief's grid, before its ground has none of its shape */
    apart: number;
    /** the least share of the height the elevation gives the land of a place that ground dry today keeps above the coast there */
    floor: number;
    ranges: ReliefRange[];
  };
}

/** The tile of the finer level that holds a place: its column and row from the north-west, and its key. */
export function fineTile(fine: Pick<ReliefInfo['fine'], 'tile_deg'>, lat: number, lon: number): { tx: number; ty: number; key: string } {
  const deg = fine.tile_deg;
  const across = Math.round(360 / deg);
  const down = Math.round(180 / deg);
  const ty = Math.max(0, Math.min(down - 1, Math.floor((90 - lat) / deg)));
  const tx = ((Math.floor((lon + 180) / deg) % across) + across) % across;
  return { tx, ty, key: fineKey(deg, tx, ty) };
}

/** A tile's key: its north-west corner, in degrees. */
export const fineKey = (deg: number, tx: number, ty: number): string => `${90 - ty * deg}_${-180 + tx * deg}`;

/** Which tiles there are, as the index keeps it: for each row of tiles, a hex digit for every four, the first tile the highest bit. */
export function fineRows(has: (tx: number, ty: number) => boolean, deg: number): string[] {
  const across = Math.round(360 / deg);
  const down = Math.round(180 / deg);
  const rows: string[] = [];
  for (let ty = 0; ty < down; ty++) {
    let row = '';
    for (let tx = 0; tx < across; tx += 4) {
      let d = 0;
      for (let b = 0; b < 4; b++) if (tx + b < across && has(tx + b, ty)) d |= 8 >> b;
      row += d.toString(16);
    }
    rows.push(row);
  }
  return rows;
}

/** Whether the finer level has a tile. */
export function fineHas(fine: Pick<ReliefInfo['fine'], 'rows'>, tx: number, ty: number): boolean {
  const row = fine.rows[ty];
  if (!row) return false;
  const d = parseInt(row[tx >> 2] ?? '0', 16);
  return (d & (8 >> (tx & 3))) !== 0;
}

/** How far east and west of a place a scene reads the finer level, in degrees: as far as north and south on the ground, and no further than six. */
const reachLon = (reach: number, lat: number): number => Math.min(6, reach / Math.max(0.05, Math.cos((lat * Math.PI) / 180)));

/** The box of the finer level's cells a scene of a place reads: columns from 180°W, which may run past either end, and rows from the north. */
export function fineBox(fine: Pick<ReliefInfo['fine'], 'step' | 'reach_deg'>, lat: number, lon: number): { i0: number; i1: number; j0: number; j1: number } {
  const per = Math.round(1 / fine.step);
  const dLon = reachLon(fine.reach_deg, lat);
  return {
    i0: Math.floor((lon - dLon + 180) * per),
    i1: Math.floor((lon + dLon + 180) * per),
    j0: Math.max(0, Math.floor((90 - lat - fine.reach_deg) * per)),
    j1: Math.min(180 * per - 1, Math.floor((90 - lat + fine.reach_deg) * per)),
  };
}

/** The keys of the tiles a scene of a place reads, those there are. */
export function fineTilesNear(fine: ReliefInfo['fine'], lat: number, lon: number): string[] {
  const per = Math.round(fine.tile_deg / fine.step);
  const across = Math.round(360 / fine.tile_deg);
  const b = fineBox(fine, lat, lon);
  const out: string[] = [];
  for (let ty = Math.floor(b.j0 / per); ty <= Math.floor(b.j1 / per); ty++) {
    for (let t = Math.floor(b.i0 / per); t <= Math.floor(b.i1 / per); t++) {
      const tx = ((t % across) + across) % across;
      const key = fineKey(fine.tile_deg, tx, ty);
      if (fineHas(fine, tx, ty) && !out.includes(key)) out.push(key);
    }
  }
  return out;
}

// ——— Carried back ———

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** How much of today's shape stood at an age where no range's record speaks: all of it through `fullMa`, none by `goneMa`, evenly between. */
export function heldShare(ageMa: number, rule: { fullMa: number; goneMa: number }): number {
  if (ageMa <= rule.fullMa) return 1;
  if (ageMa >= rule.goneMa) return 0;
  return (rule.goneMa - ageMa) / (rule.goneMa - rule.fullMa);
}

/**
 * How much of a range's shape stood at an age, by its record: all of it since it stood at about its present height;
 * before that as far as it had risen, evenly from the start of its growth; and where its record gives no start, let go
 * over as long as the rule takes to let go of any ground.
 */
export function rangeShare(ageMa: number, r: Pick<ReliefRange, 'standingMa' | 'startMa'>, rule: { fullMa: number; goneMa: number }): number {
  if (ageMa <= r.standingMa) return 1;
  const startMa = r.startMa !== undefined && r.startMa > r.standingMa ? r.startMa : r.standingMa + (rule.goneMa - rule.fullMa);
  return clamp01((startMa - ageMa) / (startMa - r.standingMa));
}

/** Whether a point lies inside polygons of rings of [lon, lat], by the even-odd rule over every ring. */
export function insideOutline(outline: number[][][][], lon: number, lat: number): boolean {
  let inside = false;
  for (const poly of outline) {
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
  }
  return inside;
}

/** How much of today's shape stood at a place of today's Earth at an age, and the range whose record says the most of it, if one says more than the rule. */
export function shareAt(c: NonNullable<ReliefInfo['carried']>, lat: number, lon: number, ageMa: number): { share: number; range?: ReliefRange } {
  let share = heldShare(ageMa, c);
  let range: ReliefRange | undefined;
  for (const r of c.ranges) {
    if (ageMa <= c.fullMa) break;
    const s = rangeShare(ageMa, r, c);
    if (s > share && insideOutline(r.outline, lon, lat)) {
      share = s;
      range = r;
    }
  }
  return { share, ...(range ? { range } : {}) };
}

/** The oldest age at which any of today's shape is carried back anywhere, Ma. */
export function carriedReach(c: NonNullable<ReliefInfo['carried']>): number {
  let reach = c.goneMa;
  for (const r of c.ranges) reach = Math.max(reach, r.startMa !== undefined && r.startMa > r.standingMa ? r.startMa : r.standingMa + (c.goneMa - c.fullMa));
  return reach;
}

/**
 * Whether any of today's shape may have stood within a scene's reach of a place of today's Earth at an age: by the
 * rule, or within `reach` degrees of the outline of a range whose record carries its shape that far. A scene asks before
 * it sends for anything.
 */
export function carriedNear(c: NonNullable<ReliefInfo['carried']>, lat: number, lon: number, ageMa: number, reach: number): boolean {
  if (heldShare(ageMa, c) > 0) return true;
  const dLon = reachLon(reach, lat);
  for (const r of c.ranges) {
    if (!(rangeShare(ageMa, r, c) > 0)) continue;
    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;
    for (const poly of r.outline) {
      for (const [x, y] of poly[0] ?? []) {
        if (x < west) west = x;
        if (x > east) east = x;
        if (y < south) south = y;
        if (y > north) north = y;
      }
    }
    if (lat >= south - reach && lat <= north + reach && lon >= west - dLon && lon <= east + dLon) return true;
  }
  return false;
}

/**
 * A global grid of nodes `step` degrees apart, from 90°N and 180°W, read at any place as a scene reads the elevation
 * it stands on: straight between the four nodes about it. `at` answers at a node, and east or west of the line where
 * longitude wraps.
 */
export function between(at: (lat: number, lon: number) => number, step: number): (lat: number, lon: number) => number {
  const rows = Math.round(180 / step);
  return (lat, lon) => {
    const fy = Math.min(rows, Math.max(0, (90 - lat) / step));
    const j = Math.min(rows - 1, Math.floor(fy));
    const v = fy - j;
    const fx = (lon + 180) / step;
    const i = Math.floor(fx);
    const u = fx - i;
    const north = 90 - j * step;
    const south = 90 - (j + 1) * step;
    const west = -180 + i * step;
    const east = west + step;
    return (at(north, west) * (1 - u) + at(north, east) * u) * (1 - v) + (at(south, west) * (1 - u) + at(south, east) * u) * v;
  };
}

/**
 * The latest time a scene reads an elevation field at its keyframe of the present: the youngest year the field covers
 * that none of the fields a scene would read ahead of it covers, where the keyframe nearest it is the present's.
 * Undefined where there is no such time: nothing then says what the field makes of today, and no shape is carried
 * back over it.
 */
export function presentRead(field: { coverage: [number, number]; keyframesMa: number[] }, ahead: { coverage: [number, number] }[]): number | undefined {
  let t = field.coverage[1];
  for (let turns = 0; turns <= ahead.length; turns++) {
    const over = ahead.find((f) => f.coverage[0] <= t && t <= f.coverage[1]);
    if (!over) break;
    t = over.coverage[0] - 1;
  }
  if (t < field.coverage[0] || ahead.some((f) => f.coverage[0] <= t && t <= f.coverage[1])) return undefined;
  const ageMa = toMa(t);
  const nearest = [...field.keyframesMa].sort((a, b) => Math.abs(a - ageMa) - Math.abs(b - ageMa))[0];
  return nearest === 0 ? t : undefined;
}

/**
 * How far a plate has turned a place between two ages: the bearing, where the place stands at the second, of the point
 * that lay just north of it at the first. Radians, clockwise from north.
 */
export function turnOf(carry: (lat: number, lon: number) => [number, number], lat: number, lon: number): number {
  const d = lat > 89 ? -0.05 : 0.05;
  const [la0, lo0] = carry(lat, lon);
  const [la1, lo1] = carry(lat + d, lon);
  const dy = (la1 - la0) * Math.sign(d);
  const dx = ((((lo1 - lo0 + 540) % 360) - 180) * Math.cos((la0 * Math.PI) / 180)) * Math.sign(d);
  return Math.atan2(dx, dy);
}

/** The arc between two places, in degrees. */
export function arcBetween(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const sLat = Math.sin(((b[0] - a[0]) * r) / 2);
  const sLon = Math.sin(((b[1] - a[1]) * r) / 2);
  const h = sLat * sLat + Math.cos(a[0] * r) * Math.cos(b[0] * r) * sLon * sLon;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / r;
}

/** The mean of a grid about each of its nodes: over the nodes within `span` of it either way, as many as the grid has. */
function boxMean(a: Float32Array, nx: number, ny: number, span: number): Float32Array {
  const rows = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let sum = 0;
      let n = 0;
      for (let d = -span; d <= span; d++) {
        const x = i + d;
        if (x < 0 || x >= nx) continue;
        sum += a[j * nx + x];
        n++;
      }
      rows[j * nx + i] = sum / n;
    }
  }
  const out = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let sum = 0;
      let n = 0;
      for (let d = -span; d <= span; d++) {
        const y = j + d;
        if (y < 0 || y >= ny) continue;
        sum += rows[y * nx + i];
        n++;
      }
      out[j * nx + i] = sum / n;
    }
  }
  return out;
}

/** What a scene's shape is put together from. */
export interface ShapeInput {
  info: ReliefInfo;
  /** a tile's codes by its key, its rows from the north; undefined where the level has none: ground the relief's grid already gives */
  tile: (key: string) => Int8Array | undefined;
  /** where the scene's origin stands today */
  at: { lat: number; lon: number };
  /**
   * For a time before today's relief is held: its age, the bearing today of the scene's north, and today's relief on
   * its own grid, above today's sea, with the plate under each node. `apart` says how far, in degrees, the ground of
   * a plate at a place of today's Earth has moved against the scene's own plate since the keyframe the scene's
   * elevation is read at: nothing for the scene's own. And `base` is what that elevation makes of today, its keyframe
   * of the present above its own coast, read at any place of today's Earth as a scene reads it (`between`), with
   * `grain`, how far apart the nodes of that elevation's grid are.
   */
  carried?: {
    ageMa: number;
    turn: number;
    apart: (plate: number, lat: number, lon: number) => number;
    today: { step: number; elevation: (lat: number, lon: number) => number; plate: (lat: number, lon: number) => number };
    base: (lat: number, lon: number) => number;
    /** the spacing of that elevation's own grid, in degrees */
    grain: number;
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * The shape of today's ground a scene of a place is given: the finer level's cells around where the place stands today.
 * Where today's relief is held for the scene's time, they are what the survey has less what the relief's grid makes of
 * it, and the scene lays them over that grid. Before, they are carried back: today's ground less what the elevation
 * the scene stands on makes of today, as much of it as stood then at each place. The scene's own plate carries it; the
 * ground of another plate keeps its shape only as far as that plate has not moved against the scene's since the
 * elevation's keyframe, and has none once it has moved as far as the rule allows. Where it stops, its hills and
 * valleys stop, and what it stands above that elevation by on the whole falls away over that elevation's grain, so
 * that no step is left. So what that elevation says has
 * changed since, at its own grain, is kept, and where it is its picture of today, when no plate has yet moved, the
 * two together are today's ground. It comes with today's ground at each cell, by which a scene keeps ground that is
 * dry today above the coast (ReliefShape, `floor`). Undefined where the level has no tile near, or where none of
 * today's shape stood.
 */
export function sceneShape(i: ShapeInput): ReliefShape | undefined {
  const { fine } = i.info;
  const per = Math.round(1 / fine.step);
  const tilePer = Math.round(fine.tile_deg / fine.step);
  const across = Math.round(360 / fine.tile_deg);
  const b = fineBox(fine, i.at.lat, i.at.lon);
  const nx = b.i1 - b.i0 + 1;
  const ny = b.j1 - b.j0 + 1;
  const z = new Array<number>(nx * ny).fill(0);
  // The survey's cells, tile by tile.
  let any = false;
  for (let ty = Math.floor(b.j0 / tilePer); ty <= Math.floor(b.j1 / tilePer); ty++) {
    for (let t = Math.floor(b.i0 / tilePer); t <= Math.floor(b.i1 / tilePer); t++) {
      const tx = ((t % across) + across) % across;
      if (!fineHas(fine, tx, ty)) continue;
      const codes = i.tile(fineKey(fine.tile_deg, tx, ty));
      if (!codes) continue;
      any = true;
      const j0 = Math.max(b.j0, ty * tilePer);
      const j1 = Math.min(b.j1, (ty + 1) * tilePer - 1);
      const c0 = Math.max(b.i0, t * tilePer);
      const c1 = Math.min(b.i1, (t + 1) * tilePer - 1);
      for (let j = j0; j <= j1; j++) {
        const from = (j - ty * tilePer) * tilePer - t * tilePer;
        const to = (j - b.j0) * nx - b.i0;
        for (let c = c0; c <= c1; c++) z[to + c] = decodeShape(codes[from + c]);
      }
    }
  }
  const lat0 = 90 - (b.j0 + 0.5) * fine.step;
  const lon0 = -180 + (b.i0 + 0.5) * fine.step;
  const at = { lat: Math.round(i.at.lat * 1e5) / 1e5, lon: Math.round(i.at.lon * 1e5) / 1e5 };
  const patch = (zs: number[]): ReliefPatch => ({ lat0: Math.round(lat0 * 1e6) / 1e6, lon0: Math.round(lon0 * 1e6) / 1e6, step: fine.step, nx, ny, z: zs });
  const c = i.carried;
  if (!c) return any ? { field: i.info.field, held: true, at, turn: 0, share: 1, patch: patch(z) } : undefined;
  const rule = i.info.carried;
  if (!rule) return undefined;

  // Carried back. On the relief's own grid over the box: how much stood at each node; how much of that its plate
  // still holds in place, all of it on the scene's own and less the further another has moved against it, to none
  // at as many nodes of this grid as the rule says; and today's ground there less what the scene's elevation makes
  // of today.
  const step = c.today.step;
  const inv = Math.round(1 / step);
  const dLon = reachLon(fine.reach_deg, i.at.lat);
  const r0 = Math.max(0, Math.floor((90 - i.at.lat - fine.reach_deg) * inv) - 1);
  const r1 = Math.min(180 * inv, Math.ceil((90 - i.at.lat + fine.reach_deg) * inv) + 1);
  const q0 = Math.floor((i.at.lon - dLon + 180) * inv) - 1;
  const q1 = Math.ceil((i.at.lon + dLon + 180) * inv) + 1;
  const gx = q1 - q0 + 1;
  const gy = r1 - r0 + 1;
  const latOf = (r: number) => 90 - r / inv;
  const lonOf = (q: number) => ((((q / inv) % 360) + 360) % 360) - 180;
  const on = new Float32Array(gx * gy);
  const stood = new Float32Array(gx * gy);
  let most = 0;
  for (let r = r0; r <= r1; r++) {
    for (let q = q0; q <= q1; q++) {
      const la = latOf(r);
      const lo = lonOf(q);
      const k = (r - r0) * gx + (q - q0);
      on[k] = clamp01(1 - c.apart(c.today.plate(la, lo), la, lo) / (step * rule.apart));
      const s = shareAt(rule, la, lo, c.ageMa);
      stood[k] = s.share;
      if (s.share > most) most = s.share;
    }
  }
  if (!(most > 0)) return undefined;
  const here = shareAt(rule, i.at.lat, i.at.lon, c.ageMa);
  const best = here.range;
  // The edge of a plate that has moved, eased over the nodes beside it.
  const weight = new Float32Array(gx * gy);
  for (let r = 0; r < gy; r++) {
    for (let q = 0; q < gx; q++) {
      let sum = 0;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dq = -1; dq <= 1; dq++) {
          const rr = r + dr;
          const qq = q + dq;
          if (rr < 0 || rr >= gy || qq < 0 || qq >= gx) continue;
          sum += on[rr * gx + qq];
          n++;
        }
      }
      weight[r * gx + q] = (sum / n) * stood[r * gx + q];
    }
  }
  const elev = new Float32Array(gx * gy);
  const within = new Float32Array(gx * gy);
  for (let r = r0; r <= r1; r++) {
    for (let q = q0; q <= q1; q++) {
      const k = (r - r0) * gx + (q - q0);
      elev[k] = c.today.elevation(latOf(r), lonOf(q));
      within[k] = elev[k] - c.base(latOf(r), lonOf(q));
    }
  }
  // Where today's shape stops, at a range's outline or at the edge of a plate that has moved, its hills and valleys
  // stop there. But today's ground also stands above or below the elevation's picture of today on the whole, by what
  // that picture, coarse as it is, has not: that part is the mean of the difference over the elevation's own grain,
  // and it falls away over as much, as the mean of how much stood does, so that no step is left along the line.
  const span = Math.max(1, Math.round((c.grain * inv) / 2));
  const broad = boxMean(within, gx, gy, span);
  const soft = boxMean(weight, gx, gy, span);
  // Each cell of the survey: its own part and the relief's grid's part of the shape, as much as stood there; and
  // today's ground at the cell, a little under rather than over, which the scene holds dry ground no higher than.
  const now = new Array<number>(nx * ny);
  let kept = false;
  for (let j = 0; j < ny; j++) {
    const la = 90 - (b.j0 + j + 0.5) * fine.step;
    const fy = Math.min(gy - 1.0001, Math.max(0, (90 - la) * inv - r0));
    const gj = Math.floor(fy);
    const v = fy - gj;
    for (let x = 0; x < nx; x++) {
      const col = b.i0 + x;
      const fx = Math.min(gx - 1.0001, Math.max(0, ((col + 0.5) / per) * inv - q0));
      const gi = Math.floor(fx);
      const u = fx - gi;
      const k = gj * gx + gi;
      const lerp = (a: Float32Array) => (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + gx] * (1 - u) + a[k + gx + 1] * u) * v;
      const w = lerp(weight);
      const all = lerp(broad);
      now[j * nx + x] = Math.floor((z[j * nx + x] + lerp(elev)) * 10) / 10;
      const m = round1(lerp(soft) * all + (w > 0 ? w * (z[j * nx + x] + lerp(within) - all) : 0));
      z[j * nx + x] = m;
      if (m !== 0) kept = true;
    }
  }
  if (!kept) return undefined;
  // How much stood at the scene's own place: what the hills it invents make way for.
  const share = Math.round(here.share * 1000) / 1000;
  return { field: rule.field, held: false, at, turn: Math.round(c.turn * 1e5) / 1e5, share, ...(best ? { range: { id: best.id, label: best.label } } : {}), patch: patch(z), today: now, floor: rule.floor };
}

/**
 * A scene's shape read at a point of its own ground, m: straight between the survey's cells, and easing to nothing at
 * the patch's edge. And anything else kept cell for cell with it, laid over what is under it the same way.
 */
export class ShapeReader {
  private kx: number;
  private ky: number;
  private sin: number;
  private cos: number;
  private p: ReliefPatch;
  private lat: number;
  private lon: number;
  /** how many cells from its edge the shape eases in over */
  static readonly EASE = 12;
  constructor(shape: ReliefShape, sin: (a: number) => number = Math.sin, cos: (a: number) => number = Math.cos, earth = 6371000) {
    const deg = Math.PI / 180;
    this.p = shape.patch;
    this.lat = shape.at.lat;
    this.lon = shape.at.lon;
    this.ky = 1 / (earth * deg);
    this.kx = 1 / (earth * cos(shape.at.lat * deg) * deg);
    this.sin = sin(shape.turn);
    this.cos = cos(shape.turn);
  }
  /** Where the middle of a cell of the patch is in the scene: metres east and north of its origin. */
  place(i: number, j: number): [number, number] {
    const p = this.p;
    const east = (p.lon0 + i * p.step - this.lon) / this.kx;
    const north = (p.lat0 - j * p.step - this.lat) / this.ky;
    return [east * this.cos - north * this.sin, east * this.sin + north * this.cos];
  }
  /** How far inside the patch a point of the scene is, 0–1: nothing beyond it, and all of it further in than its edge's easing. */
  weight(x: number, y: number): number {
    const p = this.p;
    const east = x * this.cos + y * this.sin;
    const north = y * this.cos - x * this.sin;
    const fy = (p.lat0 - (this.lat + north * this.ky)) / p.step;
    const fx = (this.lon + east * this.kx - p.lon0) / p.step;
    if (!(fx > 0 && fy > 0 && fx < p.nx - 1 && fy < p.ny - 1)) return 0;
    const edge = Math.min(fx, fy, p.nx - 1 - fx, p.ny - 1 - fy) / ShapeReader.EASE;
    return edge >= 1 ? 1 : edge * edge * (3 - 2 * edge);
  }
  /** `x` east and `y` north of the scene's origin, as the scene has them. */
  at(x: number, y: number): number {
    return this.lay(this.p.z, x, y, 0);
  }
  /**
   * Values kept cell for cell with the patch, laid over what is `under` them at a point of the scene: read straight
   * between the cells' middles, all of them further in than the easing of the patch's edge, and none beyond it.
   */
  lay(values: ArrayLike<number>, x: number, y: number, under: number): number {
    const p = this.p;
    // Where that is today: east and north of where the origin stands now.
    const east = x * this.cos + y * this.sin;
    const north = y * this.cos - x * this.sin;
    const fy = (p.lat0 - (this.lat + north * this.ky)) / p.step;
    const fx = (this.lon + east * this.kx - p.lon0) / p.step;
    if (!(fx > 0 && fy > 0 && fx < p.nx - 1 && fy < p.ny - 1)) return under;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const k = j * p.nx + i;
    const h = (values[k] * (1 - u) + values[k + 1] * u) * (1 - v) + (values[k + p.nx] * (1 - u) + values[k + p.nx + 1] * u) * v;
    const edge = Math.min(fx, fy, p.nx - 1 - fx, p.ny - 1 - fy) / ShapeReader.EASE;
    if (edge >= 1) return h;
    return under + (h - under) * edge * edge * (3 - 2 * edge);
  }
}
