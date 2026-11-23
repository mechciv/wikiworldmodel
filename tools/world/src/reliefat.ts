// What a build's files say of the ground at a place and a time (`npm run world -- relief`): the elevation field a scene
// there reads, and the shape of the ground within its cells (core/relief.ts): the survey's own where today's relief is
// held for the time, today's carried back on its plate where the model reaches it. It reads the build's files as a
// browser reads them (viewer/src/city/lifeatlas.ts), so it shows what a scene is given, and nothing the build did not
// write.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { decodeTile } from '../../../core/container.ts';
import { conj, rotate, toLatLon, unitVector } from '../../../core/quat.ts';
import { arcBetween, between, carriedNear, fineTilesNear, presentRead, sceneShape, turnOf, type ReliefFineHeader, type ReliefInfo } from '../../../core/relief.ts';
import { RotationModel } from '../../../core/rotation-model.ts';
import type { ReliefShape } from '../../../core/scene.ts';
import { seaLevelAt } from '../../../core/sealevel.ts';
import type { SeriesFile } from '../../../core/records.ts';
import { formatTime, fromMa, toMa } from '../../../core/time.ts';
import type { FieldInfo, FramesFile, TileHeader, TileRef, Tileset } from '../../../core/tileset.ts';
import { WorldGround } from '../../../world/generators/life/relief.ts';
import { plateUnder, reliefPatch } from '../../../world/generators/life/spec.ts';

const bytes = (path: string): ArrayBuffer => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/** The ground of a place at a time, as the files of a build give it to a scene. */
export interface ReliefAt {
  /** the elevation field read, its keyframe, the spacing of its grid in degrees, and whether it is today's relief, held */
  field: string;
  keyMa: number;
  step: number;
  held: boolean;
  /** where the place stood on the keyframe's coordinates, and where it stands today */
  at: { lat: number; lon: number };
  today: { lat: number; lon: number };
  /** the coast of the time, in the field's heights, m */
  coast: number;
  /** the shape of the ground within the field's cells, where the build gives one */
  shape?: ReliefShape;
  /** the ground at any point of a scene of the place, east and north of it in metres: the field's alone, and the world's */
  ground: WorldGround;
}

/** A build's gridded tiles of one level at a time, read as they are asked for. */
class Grids {
  private got = new Map<string, { header: TileHeader; arrays: ArrayLike<number>[] }>();
  /** `only` names the field its tiles must carry: a tile of another answers nothing. */
  constructor(private dir: string, private refs: TileRef[], private keyMa: number, private step: number, private plateIndex: number[], private only?: string) {}
  private read(arr: 'elev' | 'plate', lat: number, lon: number): number | undefined {
    const snap = (v: number) => Math.round(Math.round(v / this.step) * this.step * 1e6) / 1e6;
    const r = Math.max(-90, Math.min(90, snap(lat)));
    const q = ((snap(lon) + 540) % 360) - 180;
    const ref = this.refs.find((x) => r >= x.bbox[1] && r <= x.bbox[3] && q >= x.bbox[0] && q <= x.bbox[2]);
    if (!ref) return undefined;
    let t = this.got.get(ref.url);
    if (!t) {
      const d = decodeTile<TileHeader>(bytes(join(this.dir, ref.url)));
      t = { header: d.header, arrays: d.arrays as unknown as ArrayLike<number>[] };
      this.got.set(ref.url, t);
    }
    if (this.only && t.header.field?.id !== this.only) return undefined;
    const k = t.header.field?.keyframes.find((x) => x.ageMa === this.keyMa);
    if (!k) return undefined;
    const g = t.header.field!.grid;
    return t.arrays[arr === 'elev' ? k.elev : k.plate][Math.round((g.lat0 - r) / g.step) * g.nx + Math.round((q - g.lon0) / g.step)];
  }
  elevation = (lat: number, lon: number): number | undefined => this.read('elev', lat, lon);
  plate = (lat: number, lon: number): number => this.plateIndex[this.read('plate', lat, lon) ?? 0] ?? 0;
}

/**
 * The ground of a place at a time `t` (astronomical years), from the build in `dir`: undefined where no elevation field
 * covers the time. The place is where it stood at the time, on the globe's coordinates of that time, as a link to the
 * viewer gives it.
 */
export function reliefAt(dir: string, lat: number, lon: number, t: number): ReliefAt | undefined {
  const ts = JSON.parse(readFileSync(join(dir, 'tileset.json'), 'utf8')) as Tileset;
  const frames = JSON.parse(readFileSync(join(dir, 'frames.json'), 'utf8')) as FramesFile;
  const series = JSON.parse(readFileSync(join(dir, ts.files.series), 'utf8')) as SeriesFile;
  const elevations = ts.fields.filter((f) => f.mode === 'elevation');
  const field = elevations.find((f) => f.coverage[0] <= t && t <= f.coverage[1]);
  if (!field) return undefined;
  const ageMa = toMa(t);
  const keyMa = [...field.keyframesMa].sort((a, b) => Math.abs(a - ageMa) - Math.abs(b - ageMa))[0];
  const finest = (field.res_deg ?? 1) < 1 && ts.tiles.some((r) => r.lod === 3 && r.time[0] <= t && t <= r.time[1]);
  const step = finest ? field.res_deg! : 1;
  const grids = new Grids(dir, ts.tiles.filter((r) => r.lod === (finest ? 3 : 1) && r.time[0] <= t && t <= r.time[1]), keyMa, step, frames.plateIndex);
  const model = new RotationModel(frames.rotations);
  const carry = (plate: number, la: number, lo: number, a: number, b: number): [number, number] => {
    if (!plate || !model.reaches(plate, a) || !model.reaches(plate, b)) return [la, lo];
    const [x, y] = toLatLon(rotate(model.total(plate, b), rotate(conj(model.total(plate, a)), unitVector(la, lo))));
    return [x, y];
  };
  // Today's relief on its own grid, with today's plates under it: finer than a keyframe of the deep past has them.
  const info = ts.files.relief ? (JSON.parse(readFileSync(join(dir, ts.files.relief), 'utf8')) as ReliefInfo) : undefined;
  const relief = info ? ts.fields.find((f) => f.id === info.field) : undefined;
  const present = fromMa(0);
  const here = !finest && relief?.res_deg ? new Grids(dir, ts.tiles.filter((r) => r.lod === 3 && r.time[0] <= present && present <= r.time[1]), 0, relief.res_deg, frames.plateIndex) : undefined;
  // The plate under the place, as a scene finds it: the one that carries the place to ground of its own.
  const plate = plateUnder({ plate: grids.plate, carry, keyAge: keyMa, step, ...(here ? { plateNow: here.plate } : {}) }, lat, lon, ageMa);
  const [al, ao] = carry(plate, lat, lon, ageMa, keyMa);
  const [tl, to] = carry(plate, lat, lon, ageMa, 0);
  const coast = coastOf(field, series, t);
  const patch = reliefPatch(al, ao, (la, lo) => grids.elevation(la, lo) ?? -4000, coast, step);
  let shape: ReliefShape | undefined;
  // Its tiles are read only where a scene would send for them: where today's relief is held, or some of today's shape
  // may have stood within reach.
  const held = finest && !!info && field.id === info.field;
  const back = !finest && !!info?.carried && ageMa >= 0 && carriedNear(info.carried, tl, to, ageMa, info.fine.reach_deg);
  if (info && (held || back)) {
    const cells = new Map<string, Int8Array>();
    for (const key of fineTilesNear(info.fine, tl, to)) {
      const { header, arrays } = decodeTile<ReliefFineHeader>(bytes(join(dir, `${info.fine.dir}/${key}.lwt`)));
      const raw = arrays[header.codes] as Uint8Array;
      const b = header.packed === 'deflate' ? inflateSync(raw) : raw;
      cells.set(key, new Int8Array(b.buffer, b.byteOffset, b.byteLength));
    }
    const tile = (key: string) => cells.get(key);
    const today = { lat: tl, lon: to };
    if (held) shape = sceneShape({ info, tile, at: today });
    else {
      // What the elevation read makes of today: its keyframe of the present, at the latest time a scene reads it, above its coast then.
      const last = presentRead(field, elevations.slice(0, elevations.indexOf(field)));
      if (here && last !== undefined) {
        const latest = new Grids(dir, ts.tiles.filter((r) => r.lod === 1 && r.time[0] <= last && last <= r.time[1]), 0, 1, frames.plateIndex, field.id);
        const coastThen = coastOf(field, series, last);
        const base = between((la, lo) => (latest.elevation(la, lo) ?? -4000) - coastThen, 1);
        // The scene's ground lies as its keyframe has it: the shape is turned as the plate has turned since then.
        const turn = turnOf((la, lo) => carry(plate, la, lo, keyMa, 0), al, ao);
        // And another plate's ground keeps its shape as far as it has not moved against the scene's own since then.
        const apart = (p: number, la: number, lo: number): number => (p === plate ? 0 : arcBetween(carry(plate, la, lo, 0, keyMa), carry(p, la, lo, 0, keyMa)));
        shape = sceneShape({ info, tile, at: today, carried: { ageMa, turn, apart, today: { step: relief!.res_deg!, elevation: (la, lo) => here.elevation(la, lo) ?? 0, plate: here.plate }, base, grain: 1 } });
      }
    }
  }
  const at = { lat: Math.round(al * 1e5) / 1e5, lon: Math.round(ao * 1e5) / 1e5 };
  return { field: field.id, keyMa, step, held: finest, at, today: { lat: Math.round(tl * 1e5) / 1e5, lon: Math.round(to * 1e5) / 1e5 }, coast, ...(shape ? { shape } : {}), ground: new WorldGround(patch, at, shape) };
}

/** The level of the coast in a field's heights at a time: its isoline, risen or fallen with the sea where it reads a series of it. */
function coastOf(f: FieldInfo, series: SeriesFile, t: number): number {
  const level = f.coastline?.seaLevel ? seaLevelAt(series.series.find((x) => x.id === f.coastline!.seaLevel)?.points ?? [], t) : 0;
  return (f.coastline?.isolineM ?? 0) + level;
}

/** The highest ground within `km` of the place, every `stepM` metres: by the field alone and by the world's ground, each with where. */
export function crestNear(a: ReliefAt, km: number, stepM = 1000): { field: { m: number; x: number; y: number }; ground: { m: number; x: number; y: number } } {
  const field = { m: -Infinity, x: 0, y: 0 };
  const ground = { m: -Infinity, x: 0, y: 0 };
  const r = km * 1000;
  for (let y = -r; y <= r; y += stepM) {
    for (let x = -r; x <= r; x += stepM) {
      if (x * x + y * y > r * r) continue;
      const f = a.ground.field(x, y);
      if (f > field.m) Object.assign(field, { m: f, x, y });
      const g = f + a.ground.shape(x, y);
      if (g > ground.m) Object.assign(ground, { m: g, x, y });
    }
  }
  return { field, ground };
}

const degrees = (lat: number, lon: number) => `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lon).toFixed(3)}°${lon < 0 ? 'W' : 'E'}`;
const bearing = (x: number, y: number) => `${Math.round(Math.hypot(x, y) / 1000)} km ${['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((((Math.atan2(x, y) * 180) / Math.PI + 360) % 360) / 45) % 8]}`;

/** What `reliefAt` found, in words. */
export function reliefText(lat: number, lon: number, t: number, a: ReliefAt | undefined): string {
  const head = `${degrees(lat, lon)} at ${formatTime(t)}`;
  if (!a) return `${head}: no elevation field covers the time`;
  const here = a.ground.field(0, 0);
  const lines = [
    head,
    `  the elevation read: ${a.field}, its keyframe at ${a.keyMa} Ma, on a grid of ${a.step}°, where the place stood at ${degrees(a.at.lat, a.at.lon)}; the coast at ${Math.round(a.coast * 10) / 10} m of its heights`,
    `  the field's ground at the place: ${Math.round(here)} m above the coast`,
  ];
  const s = a.shape;
  if (!s) lines.push('  the shape of the ground within its cells: none is given here then; a scene invents all of it');
  else {
    const size = Math.sqrt(s.patch.z.reduce((sum, v) => sum + v * v, 0) / s.patch.z.length);
    lines.push(
      `  the shape of the ground within its cells: ${s.field}, ${s.patch.nx} × ${s.patch.ny} cells of ${Math.round(s.patch.step * 3600)}″ about ${degrees(s.at.lat, s.at.lon)}, where the place stands today`,
      `    ${Math.round(s.share * 100)}% of today's shape stood at the place${s.range ? `, as the record of ${s.range.label} (${s.range.id}) says` : a.held ? ": today's relief is held for the time" : ', by the rule'}; its plate has turned ${((s.turn * 180) / Math.PI).toFixed(1)}° since${a.held ? '' : " the elevation's keyframe"}`,
      `    it stands ${Math.round(size)} m from the field's ground on average, and ${Math.round(a.ground.shape(0, 0))} m at the place: the world's ground there is ${Math.round(a.ground.at(0, 0))} m`,
    );
  }
  for (const km of [30, 100]) {
    const c = crestNear(a, km);
    lines.push(`  the highest ground within ${km} km: ${Math.round(c.field.m)} m by the field alone, ${bearing(c.field.x, c.field.y)}${s ? `; ${Math.round(c.ground.m)} m with the shape, ${bearing(c.ground.x, c.ground.y)}` : ''}`);
  }
  return lines.join('\n');
}
