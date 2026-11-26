// The fifth round's sampler (docs/plans/VISUAL-GAPS.md, sections 3.1 and 7): a fresh draw, beside round 1's fixed panel
// (rounds 2 to 4 shot that panel again). A throwaway, kept so that the round can be drawn again. It is round 1's
// sampler with what that round taught:
//
// - Time runs from where the plate models first reach (1 Ga) to today, in N equal stretches of the strip, one point in
//   each. Round 1's orbit at 2258 Ma tested almost nothing; the time before 1 Ga stays with the fixed panel.
// - People are weighted by their number, not its square root, and half the people's draws go to a town of the cities'
//   lists, by the square root of its people then, so that towns come up. Round 1's people chose three empty landscapes.
// - Fossils weigh only before the people's weight begins (HYDE's first step).
// - Each point is named from the nearest of today's places (Natural Earth) and, before the Holocene, carried back to
//   where it is today on the build's own plates, so that a researcher starts from the right ground.
// - Each eye-level and aerial point has three spots: a, the point; b and c, 0.8 to 3 km from it at the same time, month
//   and hour, facing within 25° of a's heading (as round 4 did). A view from orbit keeps one.
//
//   npx tsx tools/gaps/rounds/5/sample.ts            → tools/gaps/rounds/5/views.yaml and points.json
//
// The weights are a guess at where a visitor looks, and no claim about the world.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeTile } from '../../../../core/container.ts';
import { conj, rotate, toLatLon, unitVector } from '../../../../core/quat.ts';
import { RotationModel } from '../../../../core/rotation-model.ts';
import { formatTime, fromMa, PRESENT_YEAR, timeToParam, toMa } from '../../../../core/time.ts';
import type { FramesFile, TileHeader, Tileset } from '../../../../core/tileset.ts';
import { positionOf, timeAt } from '../../../../core/timescale.ts';
import { loadManifest, resolveDatasetFile } from '../../../world/src/manifest.ts';

const REPO = join(import.meta.dirname, '../../../..');
const HERE = import.meta.dirname;
const SEED = 'gaps-round-5';
const N = 12;
const FROM_MA = 1000;
/** How the four weights are mixed, where each has anything to say at the time drawn: choices. */
const MIX = { people: 0.45, records: 0.2, fossils: 0.2, floor: 0.15 } as const;
/** Of the people's draws, the share that go to a town of the cities' lists rather than to a HYDE cell. */
const TOWN_SHARE = 0.5;
/** The cameras: metres from the point looked at, and the tilt from straight down. Eight at eye level, three from the air, one from orbit. */
const CAMERAS = { eye: { range: 15, tilt: 84 }, air: { range: 600, tilt: 60 }, orbit: { d: 2.6 } } as const;
const CAMERA_SHARES: (keyof typeof CAMERAS)[] = ['eye', 'eye', 'eye', 'eye', 'eye', 'eye', 'eye', 'eye', 'air', 'air', 'air', 'orbit'];
const R = 6371000;

// A seeded stream (mulberry32 over a hash of the seed): the same seed and build give the same round.
function stream(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = stream(SEED);

interface Place {
  lat: number;
  lon: number;
  w: number;
  why: string;
  /** how far from the place the point may fall, in degrees: a HYDE cell runs 1° north and east of its corner */
  spread?: 'cell' | 'patch' | 'town';
}

function pick(places: Place[]): Place {
  let x = rnd() * places.reduce((s, p) => s + p.w, 0);
  for (const p of places) if ((x -= p.w) <= 0) return p;
  return places[places.length - 1];
}

const build = (JSON.parse(readFileSync(join(REPO, 'dist/builds/index.json'), 'utf8')) as { latest: string }).latest;
const B = join(REPO, 'dist/builds', build);
const json = <T>(f: string) => JSON.parse(readFileSync(join(B, f), 'utf8')) as T;

// People: HYDE's count for each 1° cell at the step at or before the time, by the count itself.
const manifest = await loadManifest();
const hyde = readFileSync(resolveDatasetFile('src:hyde-3.2.1-population-grid', manifest.datasets['src:hyde-3.2.1-population-grid']), 'utf8')
  .split('\n')
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split(','));
const steps = hyde[0].slice(3).map(Number);
function cells(t: number): Place[] {
  if (t < steps[0] || t > PRESENT_YEAR + 100) return [];
  let col = 0;
  while (col + 1 < steps.length && steps[col + 1] <= t) col++;
  const out: Place[] = [];
  for (const row of hyde.slice(1)) {
    const n = Number(row[3 + col] || 0);
    if (n > 0) out.push({ lat: Number(row[0]), lon: Number(row[1]), w: n, spread: 'cell', why: `people: HYDE has ${n.toLocaleString('en')} in this 1° cell at its step ${steps[col]}` });
  }
  return out;
}

// Towns: the cities' lists the build reads, each by the square root of its people at the nearest count before the time
// (and no older than the lists' own hold of 600 years), and the cities with records of their own, by their houses.
interface Cities {
  cities: { name: string; country: string; lat: number; lon: number; pops: [number, number][]; field: string }[];
  records: { id: string; name: string; lat: number; lon: number; pops: [number, number][]; span: [number, number] }[];
}
const cityFile = json<Cities>('people/cities.json');
function towns(t: number): Place[] {
  const out: Place[] = [];
  for (const c of [...cityFile.cities, ...cityFile.records]) {
    const before = c.pops.filter(([y]) => y <= t && t - y <= 600);
    if (!before.length) continue;
    const [y, n] = before[before.length - 1];
    out.push({ lat: c.lat, lon: c.lon, w: Math.sqrt(n), spread: 'town', why: `town: ${c.name} (${'country' in c ? c.country : c.id}), ${n.toLocaleString('en')} people in ${y} by its list` });
  }
  return out;
}

// Records: those placed and alive within the stretch of time drawn from, by prominence; only in the last million
// years, where their places today are their places then.
interface Feature {
  id: string;
  label: string;
  location?: { lat: number; lon: number };
  prominence?: number;
  time: { start: { best: number }; end: { best: number } };
}
const features = new Map<string, Feature>();
for (const dir of readdirSync(join(B, 'features'))) {
  if (!dir.startsWith('t')) continue;
  for (const f of readdirSync(join(B, 'features', dir))) for (const x of json<Feature[]>(join('features', dir, f))) features.set(x.id, x);
}
function records(from: number, to: number): Place[] {
  if (from < PRESENT_YEAR - 1e6) return [];
  return [...features.values()]
    .filter((f) => f.location && f.time.start.best <= to && f.time.end.best >= from)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((f) => ({ ...f.location!, w: 1 + (f.prominence ?? 0), why: `records: ${f.id} (${f.label})` }));
}

// Fossils: the atlas's patches of land in the stage with fossils recorded within its "here" distance, each by the
// square root of how many taxa are recorded so; only before HYDE's first step, where the people's weight begins.
const atlas = json<{ grid: { nx: number; ny: number; step: number }; bins: { from: number; to: number; name: string; file: string }[] }>('life/atlas.json');
function fossils(t: number): Place[] {
  if (t >= steps[0]) return [];
  const ref = atlas.bins.find((b) => b.from <= t && t < b.to);
  if (!ref) return [];
  const bin = json<{ nodes: Record<string, number[]> }>(ref.file);
  const g = atlas.grid;
  const out: Place[] = [];
  for (const key of Object.keys(bin.nodes).sort((x, y) => Number(x) - Number(y))) {
    const flat = bin.nodes[key];
    let here = 0;
    for (let i = 0; i + 3 < flat.length; i += 4) if (flat[i + 2] === 0) here++;
    if (!here) continue;
    const row = Math.floor(Number(key) / g.nx);
    const col = Number(key) % g.nx;
    out.push({ lat: 90 - (row + 0.5) * g.step, lon: -180 + (col + 0.5) * g.step, w: Math.sqrt(here), spread: 'patch', why: `fossils: ${here} taxa recorded in this patch of the atlas in the ${ref.name}` });
  }
  return out;
}

// The floor: anywhere on the globe, evenly by area, land or sea as it falls.
const anywhere = (): Place => ({ lat: (Math.asin(2 * rnd() - 1) * 180) / Math.PI, lon: rnd() * 360 - 180, w: 1, why: 'floor: anywhere on the globe, evenly by area' });

// Where a point of a past time is today, by the build's own plates: the plate whose rotation carries the point back to
// ground that the plate holds today (tools/world/src/rocksnear.ts goes the other way).
const ts = json<Tileset>('tileset.json');
const frames = json<FramesFile>(ts.files.frames);
const model = new RotationModel(frames.rotations);
const present = ts.tiles
  .filter((r) => r.lod === 1 && toMa(r.time[1]) <= 0 && toMa(r.time[0]) >= 0)
  .map((r) => {
    const b = readFileSync(join(B, r.url));
    const { header, arrays } = decodeTile<TileHeader>(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const k = header.field!.keyframes.find((x) => x.ageMa === 0)!;
    return { bbox: r.bbox, grid: header.field!.grid, plate: arrays[k.plate] as Uint16Array };
  });
const plateToday = (lat: number, lon: number): number => {
  const la = Math.max(-90, Math.min(90, Math.round(lat)));
  const lo = ((Math.round(lon) + 540) % 360) - 180;
  const f = present.find((x) => la >= x.bbox[1] && la <= x.bbox[3] && lo >= x.bbox[0] && lo <= x.bbox[2]);
  return f ? frames.plateIndex[f.plate[Math.round((f.grid.lat0 - la) / f.grid.step) * f.grid.nx + Math.round((lo - f.grid.lon0) / f.grid.step)]] : 0;
};
const plates = [...new Set(Object.values(frames.plateIndex))].filter(Boolean).sort((a, b) => a - b);
function today(lat: number, lon: number, t: number): { lat: number; lon: number; plate: number } | undefined {
  const ma = toMa(t);
  if (ma < 0.012) return { lat: +lat.toFixed(3), lon: +lon.toFixed(3), plate: 0 };
  for (const p of plates) {
    if (!model.reaches(p, ma) || !model.reaches(p, 0)) continue;
    const [a, o] = toLatLon(rotate(model.total(p, 0), rotate(conj(model.total(p, ma)), unitVector(lat, lon))));
    if (plateToday(a, o) === p) return { lat: +a.toFixed(3), lon: +o.toFixed(3), plate: p };
  }
  return undefined;
}

// The nearest of today's places, as a name to start from: Natural Earth's populated places.
const places = json<{ places: { name: string; country: string; lat: number; lon: number }[] }>(ts.files.present).places;
const km = (a: number, b: number, c: number, d: number) => {
  const r = Math.PI / 180;
  const h = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
function nearest(lat: number, lon: number): string {
  let best = places[0];
  let d = Infinity;
  for (const p of places) {
    const x = km(lat, lon, p.lat, p.lon);
    if (x < d) [best, d] = [p, x];
  }
  return `${Math.round(d)} km from ${best.name}, ${best.country}`;
}

const first = positionOf(fromMa(FROM_MA));
const last = positionOf(PRESENT_YEAR);
const cameras = [...CAMERA_SHARES];
for (let i = cameras.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [cameras[i], cameras[j]] = [cameras[j], cameras[i]];
}
const along = (x: number) => timeAt(first + (last - first) * x);

const points = [];
for (let i = 0; i < N; i++) {
  const from = along(i / N);
  const to = along((i + 1) / N);
  const t = along((i + rnd()) / N);
  const pools = { people: cells(t), towns: towns(t), records: records(from, to), fossils: fossils(t) };
  // The floor keeps its share whatever else has something to say; the rest is shared among the weights that have
  // anything at the time, in their proportions.
  const kinds = (['people', 'records', 'fossils'] as const).filter((k) => pools[k].length);
  let x = rnd() * kinds.reduce((s, k) => s + MIX[k], 0);
  let kind: 'people' | 'towns' | 'records' | 'fossils' | 'floor' = !kinds.length || rnd() < MIX.floor ? 'floor' : (kinds.find((k) => (x -= MIX[k]) <= 0) ?? kinds[kinds.length - 1]);
  if (kind === 'people' && pools.towns.length && rnd() < TOWN_SHARE) kind = 'towns';
  const place = kind === 'floor' ? anywhere() : pick(pools[kind]);
  // A cell's corner is not the place: somewhere in a HYDE cell (1°), in the atlas's patch (4°, named by its centre),
  // or within about 2 km of a town's point.
  const off = place.spread === 'cell' ? [rnd(), rnd()] : place.spread === 'patch' ? [(rnd() - 0.5) * 2, (rnd() - 0.5) * 2] : place.spread === 'town' ? [(rnd() - 0.5) * 0.036, (rnd() - 0.5) * 0.036] : [0, 0];
  const lat = place.lat + off[0];
  const lon = place.lon + off[1];
  const camera = cameras[i];
  const heading = Math.floor(rnd() * 36) * 10;
  const hour = 9 + Math.floor(rnd() * 8);
  const month = 1 + Math.floor(rnd() * 12);
  const c = CAMERAS[camera];
  const now = today(lat, lon, t);
  // The spots: a is the point; b and c are 0.8 to 3 km off in any direction, facing within 25° of a.
  const spots = [{ spot: 'a', lat, lon, heading, km: 0 }];
  if (camera !== 'orbit')
    for (const s of ['b', 'c']) {
      const dist = 0.8 + rnd() * 2.2;
      const bearing = rnd() * 2 * Math.PI;
      const dlat = ((dist / 6371) * Math.cos(bearing) * 180) / Math.PI;
      const dlon = ((dist / 6371) * Math.sin(bearing) * 180) / Math.PI / Math.cos((lat * Math.PI) / 180);
      spots.push({ spot: s, lat: lat + dlat, lon: lon + dlon, heading: (heading + Math.round((rnd() - 0.5) * 50) + 360) % 360, km: +dist.toFixed(2) });
    }
  const links = spots.map((s) => {
    const cam = 'd' in c ? `d=${c.d}` : `d=${(1 + c.range / R).toFixed(10)}&h=${s.heading}&v=${c.tilt}`;
    return { ...s, lat: +s.lat.toFixed(5), lon: +s.lon.toFixed(5), link: `t=${timeToParam(t)}&lat=${s.lat.toFixed(camera === 'orbit' ? 2 : 5)}&lon=${s.lon.toFixed(camera === 'orbit' ? 2 : 5)}&${cam}&hour=${hour}&mo=${month}&clock=0` };
  });
  points.push({
    name: `p${String(i + 1).padStart(2, '0')}`,
    t,
    when: formatTime(t),
    stretch: [formatTime(from), formatTime(to)],
    lat: +lat.toFixed(5),
    lon: +lon.toFixed(5),
    today: now ? { lat: now.lat, lon: now.lon, near: nearest(now.lat, now.lon) } : null,
    camera,
    heading,
    hour,
    month,
    drawnBy: kind,
    why: place.why,
    available: [...kinds, ...(pools.towns.length ? ['towns'] : []), 'floor'],
    spots: links,
    link: links[0].link,
  });
}

const yaml = [
  `# The fifth round of visual gaps (docs/plans/VISUAL-GAPS.md), a fresh draw: ${N} points, drawn by sample.ts beside this file`,
  `# with the seed "${SEED}" from build ${build}, each with up to three spots (a, b, c). Each is a link without its build, as the`,
  '# look book\'s views are. Before the Holocene a place is where the viewer has it at that time, not where it is today.',
  'reference: Apple M1',
  '',
  'views:',
  ...points.flatMap((p) =>
    p.spots.flatMap((s) => [
      `  - name: ${p.name}${s.spot}`,
      `    what: ${JSON.stringify(`${p.when}, at ${s.lat}, ${s.lon}${s.km ? ` (${s.km} km from ${p.name}a)` : ''}, ${p.camera === 'eye' ? 'at eye level' : p.camera === 'air' ? 'from 300 m up' : 'from orbit'}. Drawn by ${p.why}.`)}`,
      `    link: ${s.link}`,
    ]),
  ),
  '',
].join('\n');
writeFileSync(join(HERE, 'views.yaml'), yaml);
writeFileSync(join(HERE, 'points.json'), `${JSON.stringify({ seed: SEED, build, from_ma: FROM_MA, mix: MIX, town_share: TOWN_SHARE, cameras: CAMERAS, points }, null, 1)}\n`);
for (const p of points) console.log(p.name, p.when.padEnd(12), `${p.lat}, ${p.lon}`.padEnd(22), p.camera.padEnd(6), p.why, '|', p.today ? `today ${p.today.lat}, ${p.today.lon}, ${p.today.near}` : 'no plate carries it to today');
