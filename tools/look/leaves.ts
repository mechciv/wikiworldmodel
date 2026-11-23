// A sheet of the atlas of leaves (core/leaves.ts, viewer/src/gl/leafatlas.ts): every tile, in greens something like the
// renderer's, over a pale ground, so that whoever changes how a kind of leaf is drawn can look at it. No browser or GPU.
//
//   npx tsx tools/look/leaves.ts <out.png> [--only broad-oval,needle-flat] [--scale 1] [--level 0]
import { writeFileSync } from 'node:fs';
import { LEAF_KIND_NAMES, LEAF_KINDS, LEAF_TILES, tileKind } from '../../core/leaves.ts';
import { makeLeafAtlas } from '../../viewer/src/gl/leafatlas.ts';
import { png } from '../world/src/formsheet.ts';

const option = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const out = process.argv[2];
if (!out || out.startsWith('--')) {
  console.error('usage: leaves.ts <out.png> [--only kind,kind] [--scale 0.5] [--level 0]');
  process.exit(1);
}
const only = option('only')?.split(',');
const level = Number(option('level') ?? 0);
const t0 = performance.now();
const atlas = makeLeafAtlas();
const ms = performance.now() - t0;
const w = Math.max(1, atlas.width >> level);
const h = Math.max(1, atlas.height >> level);
const scale = Number(option('scale') ?? 0.5) * 2 ** level;
const tiles = Array.from({ length: LEAF_TILES }, (_, i) => i).filter((i) => !only || only.includes(tileKind(i).kind));
const tw = Math.round(w * scale);
const th = Math.round(h * scale);
const cols = Math.min(tiles.length, Math.max(1, Math.floor(2400 / (tw + 4))));
const rows = Math.ceil(tiles.length / cols);
const W = cols * (tw + 4) + 4;
const H = rows * (th + 4) + 4;
const rgb = new Uint8Array(W * H * 3).fill(214);
const data = atlas.levels[level];
tiles.forEach((tile, n) => {
  const x0 = 4 + (n % cols) * (tw + 4);
  const y0 = 4 + Math.floor(n / cols) * (th + 4);
  for (let j = 0; j < th; j++) {
    for (let i = 0; i < tw; i++) {
      // The twig's foot at the bottom, as a spray grows.
      const sx = Math.min(w - 1, Math.floor(i / scale));
      const sy = Math.min(h - 1, Math.floor((th - 1 - j) / scale));
      const k = (tile * w * h + sy * w + sx) * 4;
      const light = data[k] / 255;
      const wood = data[k + 1] / 255;
      const tilt = data[k + 2] / 255 - 0.5;
      const a = data[k + 3] / 255;
      // As the renderer colours a leaf, roughly: from a dark green to a light one, lit a little more on one side.
      const lit = 0.75 + 0.9 * tilt;
      const leaf = [(30 + 120 * light) * lit, (62 + 130 * light) * lit, (26 + 50 * light) * lit];
      const twig = [70 + 80 * light, 52 + 60 * light, 36 + 40 * light];
      const at = ((y0 + j) * W + x0 + i) * 3;
      const sky = [226, 232, 238];
      for (let c = 0; c < 3; c++) rgb[at + c] = Math.round(Math.max(0, Math.min(255, (leaf[c] * (1 - wood) + twig[c] * wood) * a + sky[c] * (1 - a))));
    }
  }
});
writeFileSync(out, png(rgb, W, H));
const named = LEAF_KIND_NAMES.filter((k) => !only || only.includes(k)).map((k) => `${k} ${LEAF_KINDS[k].sprays}+${LEAF_KINDS[k].boughs}`);
console.log(`${out}: ${tiles.length} of ${LEAF_TILES} tiles at level ${level}, ${cols} to a row, drawn in ${ms.toFixed(0)} ms: ${named.join(', ')}`);
