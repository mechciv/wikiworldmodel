// The first round's shoot (docs/plans/VISUAL-GAPS.md, section 3.4): a throwaway. It serves the viewer from this checkout
// on a port of its own, draws each of the round's views on the GPU, and saves the picture (the canvas, and the page
// with its panels) to dist/gaps/1/drawn/, and what the viewer says of each view to drawn.json beside this file: the
// tier that answers each layer at the point, the climate and cover, the ground, the ice, and the scene's own account.
//
//   npx tsx tools/gaps/rounds/1/shoot.ts [--only p03,p04]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { LAYERS } from '../../../../core/resolve.ts';
import { readViews } from '../../../look/views.ts';

const REPO = join(import.meta.dirname, '../../../..');
const HERE = import.meta.dirname;
const OUT = join(REPO, 'dist/gaps/1/drawn');
const PORT = 5391;
const SIZE = { width: 1600, height: 900 };

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : undefined;
const views = readViews(join(HERE, 'views.yaml')).views.filter((v) => !only || only.includes(v.name));
const build = (JSON.parse(readFileSync(join(REPO, 'dist/builds/index.json'), 'utf8')) as { latest: string }).latest;
mkdirSync(OUT, { recursive: true });

const server = await createServer({ configFile: join(REPO, 'viewer/vite.config.ts'), server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });
const file = join(HERE, 'drawn.json');
const said: Record<string, unknown> = only ? (JSON.parse(readFileSync(file, 'utf8')) as { views: Record<string, unknown> }).views : {};
try {
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  for (const v of views) {
    const t0 = Date.now();
    errors.length = 0;
    await page.goto(`http://localhost:${PORT}/?b=${build}&${v.link}`);
    // Settled: nothing waited on but the still's refining, which goes on for minutes; then a hold for it to gain.
    let waiting: string[] = ['the page'];
    while (Date.now() - t0 < 300_000) {
      waiting = await page.evaluate(() => window.__wikiworldmodel?.waiting() ?? ['the page']).catch(() => ['the page']);
      if (waiting.every((w) => w === 'refining')) break;
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(12_000);
    const canvas = await page.evaluate(() => (document.querySelector('canvas.globe') as HTMLCanvasElement).toDataURL('image/png'));
    writeFileSync(join(OUT, `${v.name}.png`), Buffer.from(canvas.split(',')[1], 'base64'));
    await page.screenshot({ path: join(OUT, `${v.name}-page.png`) });
    const p = new URLSearchParams(v.link);
    said[v.name] = await page.evaluate(
      ({ lat, lon, layers }) => {
        const w = window.__wikiworldmodel!;
        return {
          tiers: Object.fromEntries(layers.map((l) => [l, w.resolve(lat, lon, l)])),
          biome: w.biomeAt(lat, lon),
          climate: w.climateAt(lat, lon),
          climateField: w.climateField(),
          ground: w.groundAt(lat, lon),
          ice: w.iceAt(lat, lon),
          scene: w.scene(),
          settlements: w.settlementsAt(),
          text: [...document.querySelectorAll('.life-here, .place, .when')].map((e) => e.textContent?.trim()).filter(Boolean),
        };
      },
      { lat: Number(p.get('lat')), lon: Number(p.get('lon')), layers: [...LAYERS] },
    );
    Object.assign(said[v.name] as object, { settled: waiting, errors: [...errors], seconds: Math.round((Date.now() - t0) / 1000) });
    console.log(`${v.name}: ${Math.round((Date.now() - t0) / 1000)} s${waiting.length ? `, still ${waiting.join(', ')}` : ''}${errors.length ? `, ${errors.length} errors: ${errors[0]}` : ''}`);
  }
} finally {
  await browser.close();
  await server.close();
}
writeFileSync(file, `${JSON.stringify({ build, size: SIZE, views: said }, null, 1)}\n`);
