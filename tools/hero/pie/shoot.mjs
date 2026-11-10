// Render pie.html in headless Chromium on the GPU and screenshot the page, labels included.
//   node pie/shoot.mjs out.png "w=1500&h=1000&..." [scale]
// scale is the device pixel ratio: 3 renders a 1500×1000 page at 4500×3000.
import { chromium } from '../../../node_modules/playwright-core/index.mjs';
import { writeFileSync } from 'node:fs';

const base = process.env.HERO_URL || 'http://127.0.0.1:8765/tools/hero/pie.html';
const [out, query = '', scale = '1'] = process.argv.slice(2);
const qs = new URLSearchParams(query);
const w = Number(qs.get('w') || 1500), h = Number(qs.get('h') || 1000);

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: Number(scale) });
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
const t0 = Date.now();
await page.goto(`${base}?${query}`);
try {
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
} catch (e) {
  console.log(logs.join('\n'));
  throw e;
}
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
const anchors = await page.evaluate(() => window.__anchors || null);
if (anchors) writeFileSync(out.replace(/\.png$/, '.anchors.json'), JSON.stringify(anchors, null, 1));
console.log(`${out} ${w}x${h}@${scale} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const l of logs) if (!l.startsWith('log: rendered')) console.log('  ' + l);
await browser.close();
