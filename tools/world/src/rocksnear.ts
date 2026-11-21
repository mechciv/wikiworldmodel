// What the rocks say near a place, asked of a build: `npm run world -- rocks <lat> <lon> <time>`. The place is given as
// it is today, and carried on its plate to where it stood at the slice of the stage that holds the time, as the build
// carried the collections there; then the sites of that stage round it are read (core/rocks.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeTile } from '../../../core/container.ts';
import { conj, rotate, toLatLon, unitVector } from '../../../core/quat.ts';
import { rocksAt, rocksBinAt, rocksNear, type RockAnswer, type RockSite, type RocksBin, type RocksIndex, type RockTally } from '../../../core/rocks.ts';
import { RotationModel } from '../../../core/rotation-model.ts';
import { formatTime, toMa } from '../../../core/time.ts';
import type { FramesFile, TileHeader, Tileset } from '../../../core/tileset.ts';

const json = <T>(build: string, name: string): T => JSON.parse(readFileSync(join(build, name), 'utf8')) as T;

/**
 * Where a place of today stood at a moment, by a build's own plates: the plate under it in the tiles of the present,
 * searching out a few degrees for one, and that plate's rotation. Undefined where no plate carries it there.
 */
export function placesOf(build: string): (lat: number, lon: number, t: number) => [number, number] | undefined {
  const ts = json<Tileset>(build, 'tileset.json');
  const frames = json<FramesFile>(build, ts.files.frames);
  const model = new RotationModel(frames.rotations);
  const fields = ts.tiles
    .filter((r) => r.lod === 1 && toMa(r.time[1]) <= 0 && toMa(r.time[0]) >= 0)
    .map((r) => {
      const b = readFileSync(join(build, r.url));
      const { header, arrays } = decodeTile<TileHeader>(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
      const k = header.field!.keyframes.find((x) => x.ageMa === 0)!;
      return { bbox: r.bbox, grid: header.field!.grid, plate: arrays[k.plate] as Uint16Array };
    });
  const plateOf = (lat: number, lon: number): number => {
    for (let r = 0; r <= 3; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(dj), Math.abs(di)) !== r) continue;
          const la = Math.max(-90, Math.min(90, Math.round(lat) + dj));
          const lo = ((Math.round(lon) + di + 540) % 360) - 180;
          const f = fields.find((x) => la >= x.bbox[1] && la <= x.bbox[3] && lo >= x.bbox[0] && lo <= x.bbox[2]);
          if (!f) continue;
          const q = frames.plateIndex[f.plate[Math.round((f.grid.lat0 - la) / f.grid.step) * f.grid.nx + Math.round((lo - f.grid.lon0) / f.grid.step)]];
          if (q) return q;
        }
      }
    }
    return 0;
  };
  return (lat, lon, t) => {
    const plate = plateOf(lat, lon);
    const ma = toMa(t);
    if (!plate || !model.reaches(plate, ma) || !model.reaches(plate, 0)) return undefined;
    return toLatLon(rotate(model.total(plate, ma), rotate(conj(model.total(plate, 0)), unitVector(lat, lon))));
  };
}

export interface RocksNear {
  index: RocksIndex;
  stage: { name: string; from: number; to: number; slice: number };
  /** where the place stood at the stage's slice */
  at: [number, number];
  answer: RockAnswer;
  /** the sites out to near_km, the nearest first */
  sites: (RockSite & { km: number })[];
}

/** The rocks of a build near a place of today at a time; undefined where the build has no rock record, no stage for the time, or no plate for the place. */
export function rocksOfBuild(build: string, lat: number, lon: number, t: number): RocksNear | undefined {
  const ts = json<Tileset>(build, 'tileset.json');
  if (!ts.files.rocks) return undefined;
  const index = json<RocksIndex>(build, ts.files.rocks);
  const ref = rocksBinAt(index, t);
  if (!ref) return undefined;
  const at = placesOf(build)(lat, lon, ref.slice);
  if (!at) return undefined;
  const bin = json<RocksBin>(build, ref.file);
  return { index, stage: { name: ref.name, from: ref.from, to: ref.to, slice: ref.slice }, at, answer: rocksAt(bin, index, at[0], at[1]), sites: rocksNear(bin, index.classes, at[0], at[1], index.near_km) };
}

/** What was found, as lines a person can read: each tier's tallies, then the nearest sites by their rows. */
export function rocksText(r: RocksNear, most = 12): string {
  const share = (list: [string, number][], n = 6) => list.slice(0, n).map(([w, s]) => `${w} ${Math.round(s * 100)}%`).join(', ') || 'nothing said';
  const tier = (label: string, t: RockTally) =>
    t.sites
      ? [`${label}: ${t.sites} collection${t.sites === 1 ? '' : 's'}, the nearest ${t.nearest} km off`, `  laid down in: ${share(t.environments)}`, `  made of: ${share(t.lithologies)}`, `  described as: ${share(t.adjectives, 10)}`]
      : [`${label}: no collection`];
  const lines = [
    `${r.stage.name} (${formatTime(r.stage.from)} to ${formatTime(r.stage.to)}); the place stood at ${r.at[0].toFixed(2)}, ${r.at[1].toFixed(2)} at ${formatTime(r.stage.slice)}`,
    ...tier(`here, within ${r.index.here_km} km`, r.answer.here),
    ...tier(`near, out to ${r.index.near_km} km`, r.answer.near),
  ];
  for (const s of r.sites.slice(0, most)) {
    const rocks = s.lithologies.map((l) => `${l.name}${l.adjectives.length ? ` (${l.adjectives.join(', ')})` : ''}`).join(' and ');
    lines.push(`  ${String(Math.round(s.km)).padStart(4)} km  ${r.index.source}#coll:${s.collection}  ${s.environment || 'no environment given'}; ${rocks || 'no lithology given'}`);
  }
  if (r.sites.length > most) lines.push(`  … and ${r.sites.length - most} more`);
  return lines.join('\n');
}
