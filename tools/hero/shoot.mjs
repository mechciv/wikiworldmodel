// Render the hero page in headless Chromium on the GPU and save the canvas.
//   node shoot.mjs out.png "w=1500&h=1000&..."  [more out/query pairs]
import { chromium } from '../../node_modules/playwright-core/index.mjs';
import { writeFileSync } from 'node:fs';

const base = process.env.HERO_URL || 'http://127.0.0.1:8765/tools/hero/index.html';
const jobs = [];
for (let i = 2; i < process.argv.length; i += 2) jobs.push([process.argv[i], process.argv[i + 1] || '']);

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--enable-unsafe-swiftshader=false'],
});
for (const [out, query] of jobs) {
  const qs = new URLSearchParams(query);
  const w = Number(qs.get('w') || 1500), h = Number(qs.get('h') || 1000);
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  const t0 = Date.now();
  await page.goto(`${base}?${query}`);
  try {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  } catch (e) {
    console.log(logs.join('\n'));
    throw e;
  }
  const data = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  const anchors = await page.evaluate(() => window.__anchors || null);
  if (anchors) writeFileSync(out.replace(/\.png$/, '.anchors.json'), JSON.stringify(anchors, null, 1));
  const errs = logs.filter((l) => !l.startsWith('log: rendered'));
  console.log(`${out} ${w}x${h} in ${((Date.now() - t0) / 1000).toFixed(1)}s${errs.length ? '\n  ' + errs.join('\n  ') : ''}`);
  await page.close();
}
await browser.close();
