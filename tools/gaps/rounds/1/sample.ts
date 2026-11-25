// The first round's sampler (docs/plans/VISUAL-GAPS.md, sections 3.1 and 5): a throwaway, kept so that the round can
// be drawn again. It draws N points along the time control's scale, one in each of N equal stretches of the strip up
// to today, and a place for each by weight, read from the latest build and from the HYDE snapshot.
//
//   npx tsx tools/gaps/rounds/1/sample.ts            → tools/gaps/rounds/1/views.yaml and points.json
//
// The weights are a guess at where a visitor looks, and no claim about the world. What this throwaway leaves out of
// the plan: records are weighted only in the last million years, where their places today are their places then
// (older ones would need turning with their plates); and the fossils' weight is the atlas's count of taxa recorded
// near a patch of land, not the collections themselves.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatTime, PRESENT_YEAR, timeToParam } from '../../../../core/time.ts';
import { positionOf, timeAt } from '../../../../core/timescale.ts';
import { loadManifest, resolveDatasetFile } from '../../../world/src/manifest.ts';

const REPO = join(import.meta.dirname, '../../../..');
const HERE = import.meta.dirname;
const SEED = 'gaps-round-1';
const N = 12;
/** How the four weights are mixed, where each has anything to say at the time drawn: choices. */
const MIX = { people: 0.45, records: 0.2, fossils: 0.2, floor: 0.15 } as const;
/** The cameras: metres from the point looked at, and the tilt from straight down. Eight at eye level, two from the air, two from orbit. */
const CAMERAS = { eye: { range: 15, tilt: 84 }, air: { range: 600, tilt: 60 }, orbit: { d: 2.6 } } as const;
const CAMERA_SHARES: (keyof typeof CAMERAS)[] = ['eye', 'eye', 'eye', 'eye', 'eye', 'eye', 'eye', 'eye', 'air', 'air', 'orbit', 'orbit'];
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
}

function pick(places: Place[]): Place {
  let x = rnd() * places.reduce((s, p) => s + p.w, 0);
  for (const p of places) if ((x -= p.w) <= 0) return p;
  return places[places.length - 1];
}

const build = (JSON.parse(readFileSync(join(REPO, 'dist/builds/index.json'), 'utf8')) as { latest: string }).latest;
const B = join(REPO, 'dist/builds', build);
const json = <T>(f: string) => JSON.parse(readFileSync(join(B, f), 'utf8')) as T;

// People: HYDE's count for each 1° cell at the step at or before the time, by its square root.
const manifest = await loadManifest();
const hyde = readFileSync(resolveDatasetFile('src:hyde-3.2.1-population-grid', manifest.datasets['src:hyde-3.2.1-population-grid']), 'utf8')
  .split('\n')
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split(','));
const steps = hyde[0].slice(3).map(Number);
function people(t: number): Place[] {
  if (t < steps[0] || t > PRESENT_YEAR + 100) return [];
  let col = 0;
  while (col + 1 < steps.length && steps[col + 1] <= t) col++;
  const out: Place[] = [];
  for (const row of hyde.slice(1)) {
    const n = Number(row[3 + col] || 0);
    // Somewhere in the cell, which runs 1° north and east of its corner.
    if (n > 0) out.push({ lat: Number(row[0]), lon: Number(row[1]), w: Math.sqrt(n), why: `people: HYDE has ${n.toLocaleString('en')} in this 1° cell at its step ${steps[col]}` });
  }
  return out;
}

// Records: those placed and alive within the stretch of time drawn from, by prominence.
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

// Fossils: the atlas's patches of land in the stage that have fossils recorded within its "here" distance, each by
// the square root of how many taxa are recorded so.
const atlas = json<{ grid: { nx: number; ny: number; step: number }; bins: { from: number; to: number; name: string; file: string }[] }>('life/atlas.json');
function fossils(t: number): Place[] {
  const ref = atlas.bins.find((b) => b.from <= t && t < b.to);
  if (!ref) return [];
  const bin = json<{ nodes: Record<string, number[]> }>(ref.file);
  const g = atlas.grid;
  const out: Place[] = [];
  for (const key of Object.keys(bin.nodes).sort((x, y) => Number(x) - Number(y))) {
    const flat = bin.nodes[key];
    let here = 0;
    // Four numbers a taxon: its index, its weight, its tier (0 is "here") and its distance.
    for (let i = 0; i + 3 < flat.length; i += 4) if (flat[i + 2] === 0) here++;
    if (!here) continue;
    const row = Math.floor(Number(key) / g.nx);
    const col = Number(key) % g.nx;
    out.push({ lat: 90 - (row + 0.5) * g.step, lon: -180 + (col + 0.5) * g.step, w: Math.sqrt(here), why: `fossils: ${here} taxa recorded in this patch of the atlas in the ${ref.name}` });
  }
  return out;
}

// The floor: anywhere on the globe, evenly by area, land or sea as it falls.
const anywhere = (): Place => ({ lat: (Math.asin(2 * rnd() - 1) * 180) / Math.PI, lon: rnd() * 360 - 180, w: 1, why: 'floor: anywhere on the globe, evenly by area' });

const last = positionOf(PRESENT_YEAR);
const cameras = [...CAMERA_SHARES];
for (let i = cameras.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [cameras[i], cameras[j]] = [cameras[j], cameras[i]];
}

const points = [];
for (let i = 0; i < N; i++) {
  const from = timeAt((last * i) / N);
  const to = timeAt((last * (i + 1)) / N);
  const t = timeAt((last * (i + rnd())) / N);
  const pools = { people: people(t), records: records(from, to), fossils: fossils(t) };
  // The floor keeps its share whatever else has something to say, so that the sea stays about a tenth of a round;
  // the rest is shared among the weights that have anything at the time, in their proportions.
  const kinds = (['people', 'records', 'fossils'] as const).filter((k) => pools[k].length);
  let x = rnd() * kinds.reduce((s, k) => s + MIX[k], 0);
  const kind = !kinds.length || rnd() < MIX.floor ? 'floor' : (kinds.find((k) => (x -= MIX[k]) <= 0) ?? kinds[kinds.length - 1]);
  const place = kind === 'floor' ? anywhere() : pick(pools[kind]);
  // A cell's corner is not the place: somewhere in a HYDE cell (1°), or in the atlas's (4°, named by its centre).
  const lat = kind === 'people' ? place.lat + rnd() : kind === 'fossils' ? place.lat + (rnd() - 0.5) * 2 : place.lat;
  const lon = kind === 'people' ? place.lon + rnd() : kind === 'fossils' ? place.lon + (rnd() - 0.5) * 2 : place.lon;
  const camera = cameras[i];
  const heading = Math.floor(rnd() * 36) * 10;
  const hour = 9 + Math.floor(rnd() * 8);
  const month = 1 + Math.floor(rnd() * 12);
  const c = CAMERAS[camera];
  const cam = 'd' in c ? `d=${c.d}` : `d=${(1 + c.range / R).toFixed(10)}&h=${heading}&v=${c.tilt}`;
  const link = `t=${timeToParam(t)}&lat=${lat.toFixed(camera === 'orbit' ? 2 : 5)}&lon=${lon.toFixed(camera === 'orbit' ? 2 : 5)}&${cam}&hour=${hour}&mo=${month}&clock=0`;
  points.push({ name: `p${String(i + 1).padStart(2, '0')}`, t, when: formatTime(t), stretch: [formatTime(from), formatTime(to)], lat: +lat.toFixed(5), lon: +lon.toFixed(5), camera, heading, hour, month, drawnBy: kind, why: place.why, available: [...kinds, 'floor'], link });
}

const yaml = [
  `# The first round of visual gaps (docs/plans/VISUAL-GAPS.md): ${N} points, drawn by sample.ts beside this file with the seed`,
  `# "${SEED}" from build ${build}. Each is a link without its build, as the look book's views are, and is shot by`,
  '# `npx tsx tools/look/look.ts shoot <dir> --views tools/gaps/rounds/1/views.yaml`. Before the Holocene a place is where',
  '# the viewer has it at that time, not where it is today.',
  'reference: Apple M1',
  '',
  'views:',
  ...points.flatMap((p) => [
    `  - name: ${p.name}`,
    `    what: ${JSON.stringify(`${p.when}, at ${p.lat}, ${p.lon}, ${p.camera === 'eye' ? 'at eye level' : p.camera === 'air' ? 'from 300 m up' : 'from orbit'}. Drawn by ${p.why}.`)}`,
    `    link: ${p.link}`,
  ]),
  '',
].join('\n');
writeFileSync(join(HERE, 'views.yaml'), yaml);
writeFileSync(join(HERE, 'points.json'), `${JSON.stringify({ seed: SEED, build, mix: MIX, cameras: CAMERAS, points }, null, 1)}\n`);
for (const p of points) console.log(p.name, p.when.padEnd(12), `${p.lat}, ${p.lon}`.padEnd(22), p.camera.padEnd(6), p.why);
