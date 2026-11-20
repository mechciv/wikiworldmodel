// What a build's tiles say of the climate at a place and a time (`npm run world -- months`): the months of the finest
// climate that covers the time, at the node the place stood on then, and what else that climate's source says of the
// node (core/months.ts PARTS). It reads the build's files as a browser reads them (viewer/src/city/lifeatlas.ts): the
// place is carried by its plate to the climate's keyframe, and its node found in the tiles near it. So it shows what a
// scene is given, and nothing the build did not write.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeTile } from '../../../core/container.ts';
import { MonthsTile, PartsTile, partsFile, tilesNear, type Months, type MonthsTileHeader, type PartInfo, type PartsTileHeader } from '../../../core/months.ts';
import { conj, rotate, toLatLon, unitVector } from '../../../core/quat.ts';
import { RotationModel } from '../../../core/rotation-model.ts';
import type { SceneParts } from '../../../core/scene.ts';
import { formatTime, toMa } from '../../../core/time.ts';
import type { FramesFile, TileHeader, Tileset } from '../../../core/tileset.ts';
import { monthsPlace, placeMonths } from '../../../world/generators/life/climate.ts';

const bytes = (path: string): ArrayBuffer => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/** The climate of a place at a time, as the tiles of a build give it. */
export interface MonthsAt {
  /** the climate field read, its keyframe, and the age whose coordinates that keyframe's nodes are on */
  field: string;
  ageMa: number;
  frameMa: number;
  /** where the place stood on those coordinates, and the node read for it */
  place: { lat: number; lon: number };
  node: { lat: number; lon: number };
  /** the node's months, and the height above the sea they stand for, m */
  months: Months;
  height: number;
  /** what else the climate's source says of the node, and each part's field and unit */
  parts?: SceneParts;
  info: PartInfo[];
}

/**
 * The climate of a place at a time `t` (astronomical years), from the build in `dir`: undefined where no climate has a
 * node with land near it then. The place is where it stood at the time, on the globe's coordinates of that time, as a
 * link to the viewer gives it.
 */
export function monthsAt(dir: string, lat: number, lon: number, t: number): MonthsAt | undefined {
  const ts = JSON.parse(readFileSync(join(dir, 'tileset.json'), 'utf8')) as Tileset;
  const frames = JSON.parse(readFileSync(join(dir, 'frames.json'), 'utf8')) as FramesFile;
  const info = ts.months;
  if (!info) return undefined;
  const ageMa = toMa(t);
  // The plate under the place, from the tiles of the elevation of the time, at its keyframe nearest it.
  const elevations = ts.fields.filter((f) => f.mode === 'elevation');
  const field = elevations.find((f) => f.coverage[0] <= t && t <= f.coverage[1]) ?? elevations[0];
  const keyAge = field ? [...field.keyframesMa].sort((a, b) => Math.abs(a - ageMa) - Math.abs(b - ageMa))[0] : 0;
  const finest = !!field && (field.res_deg ?? 1) < 1 && ts.tiles.some((r) => r.lod === 3 && r.time[0] <= t && t <= r.time[1]);
  const lod = finest ? 3 : 1;
  const step = finest ? field!.res_deg! : 1;
  const inTime = ts.tiles.filter((r) => r.lod === lod && r.time[0] <= t && t <= r.time[1]);
  const snap = (v: number) => Math.round(Math.round(v / step) * step * 1e6) / 1e6;
  const model = new RotationModel(frames.rotations);
  const where = monthsPlace(
    info,
    {
      plate: (la, lo) => {
        const r = snap(la);
        const q = ((snap(lo) + 540) % 360) - 180;
        const ref = inTime.find((x) => r >= x.bbox[1] && r <= x.bbox[3] && q >= x.bbox[0] && q <= x.bbox[2]);
        if (!ref) return 0;
        const { header, arrays } = decodeTile<TileHeader>(bytes(join(dir, ref.url)));
        const k = header.field?.keyframes.find((x) => x.ageMa === keyAge);
        if (!k) return 0;
        const g = header.field!.grid;
        return frames.plateIndex[arrays[k.plate][Math.round((g.lat0 - r) / g.step) * g.nx + Math.round((q - g.lon0) / g.step)]] ?? 0;
      },
      carry: (plate, la, lo, a, b) => {
        if (!model.reaches(plate, a) || !model.reaches(plate, b)) return [la, lo];
        const [x, y] = toLatLon(rotate(model.total(plate, b), rotate(conj(model.total(plate, a)), unitVector(la, lo))));
        return [x, y];
      },
    },
    lat,
    lon,
    ageMa,
  );
  // The oldest climate answers no time before its own oldest keyframe.
  if (!where || ageMa > Math.max(...where.set.keyframesMa) + 1e-9) return undefined;
  const keys = tilesNear(where.lat, where.lon, where.set);
  const tiles = keys
    .filter((k) => where.set.tiles[k])
    .map((k) => {
      const { header, arrays } = decodeTile<MonthsTileHeader>(bytes(join(dir, where.set.tiles[k])));
      return new MonthsTile(header, arrays as unknown as ArrayLike<number>[]);
    });
  const parts = keys
    .map((k) => partsFile(where.set, where.ageMa, k))
    .filter((f): f is string => !!f)
    .map((f) => {
      const { header, arrays } = decodeTile<PartsTileHeader>(bytes(join(dir, f)));
      return new PartsTile(header, arrays as unknown as ArrayLike<number>[]);
    });
  const here = placeMonths(info, where, tiles, undefined, parts).at(where.lat, where.lon);
  if (!here) return undefined;
  return {
    field: where.set.field,
    ageMa: where.ageMa,
    frameMa: where.frameMa,
    place: { lat: where.lat, lon: where.lon },
    node: { lat: here.lat, lon: here.lon },
    months: here.months,
    height: here.height,
    ...(here.parts ? { parts: here.parts } : {}),
    info: where.set.parts?.list ?? [],
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const degrees = (lat: number, lon: number) => `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lon).toFixed(3)}°${lon < 0 ? 'W' : 'E'}`;

/**
 * What `monthsAt` found, in words: the climate read and its node, then each quantity with its unit and its field, for
 * the month asked for (1–12) or for all twelve; then the year's vegetation; and what the climate's source does not give.
 */
export function monthsText(lat: number, lon: number, t: number, a: MonthsAt | undefined, month?: number): string {
  const head = `${degrees(lat, lon)} at ${formatTime(t)}`;
  if (!a) return `${head}: no climate has a node with land near it then`;
  const which = month ? [month - 1] : MONTHS.map((_, m) => m);
  const of = (part: string) => a.info.find((x) => x.part === part);
  const cells = (v: (number | null)[] | undefined, digits: number) => which.map((m) => (v?.[m] === null || v?.[m] === undefined ? 'none' : v[m]!.toFixed(digits)).padStart(7)).join('');
  const rows: [string, string, string, string][] = [
    ['temperature', '°C', cells(a.months.t, 1), 'field:earth/climate-at-height'],
    ['precipitation', 'mm', cells(a.months.p, 1), 'field:earth/climate-at-height'],
  ];
  const p = a.parts;
  if (p?.cloud) rows.push(['cloudiness', of('cloud')?.unit ?? '', cells(p.cloud, 1), p.fields.cloud]);
  if (p?.humidity) rows.push(['relative humidity', of('humidity')?.unit ?? '', cells(p.humidity, 1), p.fields.humidity]);
  if (p?.wind_speed) rows.push(['wind speed', of('wind_speed')?.unit ?? '', cells(p.wind_speed, 1), p.fields.wind_speed]);
  if (p?.wind) {
    rows.push(['wind toward the east', of('u')?.unit ?? '', cells(p.wind.u, 2), p.fields.u]);
    rows.push(['wind toward the north', of('v')?.unit ?? '', cells(p.wind.v, 2), p.fields.v]);
  }
  if (p?.albedo) rows.push(['surface albedo', of('albedo')?.unit ?? '', cells(p.albedo, 3), p.fields.albedo]);
  const v = p?.vegetation;
  const year: [string, string, string][] = v
    ? [
        ['biome', `${v.biome}${v.name ? `, ${v.name}` : ''}`, p!.fields.biome],
        ...(v.leaf !== undefined ? [[`leaf area (${of('leaf')?.unit ?? ''})`, String(v.leaf), p!.fields.leaf] as [string, string, string]] : []),
        ...(v.npp !== undefined ? [[`production (${of('npp')?.unit ?? ''})`, String(v.npp), p!.fields.npp] as [string, string, string]] : []),
        ['its node’s four cells', v.cells.map((c) => (c ? `${c.biome}${c.name ? ` ${c.name}` : ''}` : 'no land')).join(' | '), ''],
      ]
    : [];
  const wide = Math.max(...rows.map((r) => r[0].length + r[1].length + 3), ...year.map((r) => r[0].length));
  const lines = [
    head,
    `  the climate read: ${a.field}, its keyframe at ${a.ageMa} Ma, on the coordinates of ${a.frameMa} Ma, where the place stood at ${degrees(a.place.lat, a.place.lon)}`,
    `  its node: ${degrees(a.node.lat, a.node.lon)}, whose months stand for ground ${Math.round(a.height)} m above the sea`,
    month ? `  ${MONTHS[month - 1]}` : `  ${'by month, January first'.padEnd(wide)}  ${which.map((m) => MONTHS[m].slice(0, 3).padStart(7)).join('')}`,
    ...rows.map(([name, unit, values, id]) => `  ${`${name} (${unit})`.padEnd(wide)}  ${values}   ${id}`),
  ];
  if (year.length) lines.push('  the year, in the cell of its source the place is in', ...year.map(([name, value, id]) => `  ${name.padEnd(wide)}  ${value}${id ? `   ${id}` : ''}`));
  const missing = [
    ...(!p?.cloud ? ['cloudiness'] : []),
    ...(!p?.humidity ? ['relative humidity'] : []),
    ...(!p?.wind_speed ? ['wind speed'] : []),
    ...(!p?.wind ? ['the wind’s direction'] : []),
    ...(!p?.albedo ? ['surface albedo'] : []),
    ...(!v ? ['vegetation'] : []),
  ];
  if (missing.length) lines.push(`  not given by this climate's source: ${missing.join(', ')}`);
  return lines.join('\n');
}
