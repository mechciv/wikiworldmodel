// Packs the scanned materials of the ground (tools/materials/ground.yaml) into what the viewer reads: for each layer
// its colour, and its normal, height and roughness side by side in one grey image; and viewer/public/materials/ground.json,
// which names them, says how much ground each covers and what its mean colour is, and credits whoever scanned it.
//
//   npx tsx tools/materials/pack.ts [--only soil,sand]
//
// It is run by hand when the set changes, not by the build: its results are kept in the repository. It needs ImageMagick 7
// (`magick`) and libwebp (`cwebp`) on the path. The maps are fetched once into .cache/materials and checked against the
// md5 the spec pins.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse } from 'yaml';
import { GROUND_FORMAT, type GroundMaterials } from '../../core/materials.ts';

const REPO = join(import.meta.dirname, '../..');
const CACHE = join(REPO, '.cache/materials');
const OUT = join(REPO, 'viewer/public/materials');

interface Pin {
  url: string;
  md5: string;
  bytes: number;
}

interface LayerSpec {
  key: string;
  title: string;
  from: string;
  name: string;
  authors: string[];
  metres: number;
  chroma: number;
  maps: { colour: Pin; normal: Pin; roughness: Pin; height: Pin };
}

interface Spec {
  license: string;
  source: string;
  url: string;
  size: number;
  layers: LayerSpec[];
}

const run = (cmd: string, args: string[]): Buffer => execFileSync(cmd, args, { maxBuffer: 1 << 28 });

/** A pinned map, from the cache or fetched into it, checked against its md5. */
async function fetched(layer: LayerSpec, pin: Pin): Promise<string> {
  const dir = join(CACHE, layer.from);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, basename(new URL(pin.url).pathname));
  if (!existsSync(path) || statSync(path).size !== pin.bytes) {
    const r = await fetch(pin.url, { headers: { 'User-Agent': 'wikiworldmodel-materials' } });
    if (!r.ok) throw new Error(`${pin.url}: ${r.status}`);
    writeFileSync(path, Buffer.from(await r.arrayBuffer()));
  }
  const md5 = createHash('md5').update(readFileSync(path)).digest('hex');
  if (md5 !== pin.md5) throw new Error(`${path}: its md5 is ${md5}, and the spec pins ${pin.md5}: a different file is a different material`);
  return path;
}

/** An image as one grey channel of bytes, `size` square. */
function grey(path: string, size: number, channel?: 'R' | 'G', level = false): Uint8Array {
  const args = [path, '-resize', `${size}x${size}!`];
  if (channel) args.push('-channel', channel, '-separate');
  else args.push('-colorspace', 'Gray');
  if (level) args.push('-auto-level');
  return new Uint8Array(run('magick', [...args, '-depth', '8', 'gray:-']));
}

/**
 * Whether a normal map's part leans away from where the height rises along an axis, as a normal does: the sum over the
 * image of the part times the height's slope along that axis is then negative. `dx`, `dy`: the axis, in pixels.
 */
function leansAway(part: Uint8Array, height: Uint8Array, size: number, dx: number, dy: number): boolean {
  let sum = 0;
  for (let y = 1; y < size - 1; y += 2) {
    for (let x = 1; x < size - 1; x += 2) {
      const slope = height[(y + dy) * size + x + dx] - height[(y - dy) * size + x - dx];
      sum += (part[y * size + x] - 127.5) * slope;
    }
  }
  return sum < 0;
}

const spec = parse(readFileSync(join(import.meta.dirname, 'ground.yaml'), 'utf8')) as Spec;
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const size = spec.size;
const tmp = join(CACHE, 'tmp');
mkdirSync(tmp, { recursive: true });
mkdirSync(join(OUT, 'ground'), { recursive: true });
const before: GroundMaterials | null = existsSync(join(OUT, 'ground.json')) ? (JSON.parse(readFileSync(join(OUT, 'ground.json'), 'utf8')) as GroundMaterials) : null;
const layers: GroundMaterials['layers'] = [];
let bytes = 0;
for (const layer of spec.layers) {
  const kept = before?.layers.find((l) => l.key === layer.key);
  if (only && !only.includes(layer.key) && kept) {
    layers.push(kept);
    continue;
  }
  const colour = await fetched(layer, layer.maps.colour);
  const normal = await fetched(layer, layer.maps.normal);
  const roughness = await fetched(layer, layer.maps.roughness);
  const height = await fetched(layer, layer.maps.height);
  // Its colour: as scanned, at the size wanted.
  const c = join(OUT, 'ground', `${layer.key}-c.webp`);
  run('magick', [colour, '-resize', `${size}x${size}!`, join(tmp, 'c.png')]);
  run('cwebp', ['-quiet', '-q', '78', '-m', '6', '-sharp_yuv', join(tmp, 'c.png'), '-o', c]);
  // Its mean colour in linear light, by which the renderer takes the scan's own colour out and puts the place's in.
  const mean = run('magick', [colour, '-colorspace', 'RGB', '-format', '%[fx:mean.r] %[fx:mean.g] %[fx:mean.b]', 'info:']).toString().trim().split(/\s+/).map(Number);
  // Its normal's two parts, its height stretched over all of a byte, and its roughness, side by side and one pair over
  // the other, in one grey image: a lossy image keeps grey better than it keeps three colours that are not a picture.
  const h = grey(height, size, undefined, true);
  const nx = grey(normal, size, 'R');
  let ny = grey(normal, size, 'G');
  const r = grey(roughness, size);
  // Across, a normal leans away from rising ground whichever way a map is written. Down the image it does so only if its
  // green grows down the image; a map written for OpenGL has it grow up, and is turned over.
  if (!leansAway(nx, h, size, 1, 0)) throw new Error(`${layer.key}: its normal's red does not lean away from where its height rises`);
  const down = leansAway(ny, h, size, 0, 1);
  if (!down) ny = ny.map((v) => 255 - v);
  const quad = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    quad.set(nx.subarray(y * size, (y + 1) * size), y * 2 * size);
    quad.set(ny.subarray(y * size, (y + 1) * size), y * 2 * size + size);
    quad.set(h.subarray(y * size, (y + 1) * size), (y + size) * 2 * size);
    quad.set(r.subarray(y * size, (y + 1) * size), (y + size) * 2 * size + size);
  }
  writeFileSync(join(tmp, 'd.gray'), quad);
  const d = join(OUT, 'ground', `${layer.key}-d.webp`);
  run('magick', ['-size', `${size * 2}x${size * 2}`, '-depth', '8', `gray:${join(tmp, 'd.gray')}`, join(tmp, 'd.png')]);
  run('cwebp', ['-quiet', '-q', '80', '-m', '6', join(tmp, 'd.png'), '-o', d]);
  const rough = r.reduce((a, b) => a + b, 0) / r.length / 255;
  const lift = h.reduce((a, b) => a + b, 0) / h.length / 255;
  const got = statSync(c).size + statSync(d).size;
  bytes += got;
  layers.push({
    key: layer.key,
    title: layer.title,
    metres: layer.metres,
    mean: mean.map((v) => Number(v.toFixed(4))) as [number, number, number],
    rough: Number(rough.toFixed(3)),
    lift: Number(lift.toFixed(3)),
    chroma: layer.chroma,
    colour: `ground/${layer.key}-c.webp`,
    data: `ground/${layer.key}-d.webp`,
    name: layer.name,
    authors: layer.authors,
    from: `${spec.url}/a/${layer.from}`,
  });
  console.log(`${layer.key}: ${layer.name} by ${layer.authors.join(', ')}, ${layer.metres} m a repeat, ${(got / 1024).toFixed(0)} KB${down ? '' : ', its normal turned over'}`);
}
rmSync(tmp, { recursive: true, force: true });
const manifest: GroundMaterials = { format: GROUND_FORMAT, size, license: spec.license, source: spec.source, url: spec.url, layers };
writeFileSync(join(OUT, 'ground.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`viewer/public/materials/ground.json: ${layers.length} layers${bytes ? `, ${(bytes / 1048576).toFixed(1)} MB packed now` : ''}`);
