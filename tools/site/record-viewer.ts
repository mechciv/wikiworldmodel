// Record the running viewer, including its time strip, searches, source panels and scene controls.
// Start the viewer with npm run dev, then:
//   node --import tsx tools/site/record-viewer.ts [viewer URL] [output.mp4]
// Uses Playwright's Chromium and ffmpeg. A failed landing leaves no partial take at the output path.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { chromium, expect, type Page } from '@playwright/test';
import { parsePoint } from '../../core/time.ts';

const url = process.argv[2] ?? 'http://localhost:5173/';
const output = resolve(process.argv[3] ?? 'dist/when-to/When-to-viewer.mp4');
const viewport = { width: 1440, height: 900 };
const hellCreek = 'life/hell-creek/ecosystem';
const triceratops = 'life/taxa/triceratops';
const temple = 'rome/temple-of-magna-mater';
const laetoli = 'life/occurrences/laetoli-footprints';

async function settled(page: Page) {
  await page.waitForFunction(() => window.__wikiworldmodel?.idle(), undefined, { timeout: 120000 });
}

async function destination(page: Page, query: string, label: string, id: string, date: string) {
  const from = await page.evaluate(() => window.__wikiworldmodel!.state().t);
  const to = parsePoint(date).t;
  await page.locator('.when-to').click();
  await page.getByRole('searchbox', { name: 'A place, a time, or both' }).pressSequentially(query, { delay: 75 });
  const row = page.getByRole('option').filter({ has: page.locator('.tm-label').filter({ hasText: label }) });
  await expect(row).toHaveCount(1);
  await page.waitForTimeout(600);
  await row.click();
  await page.waitForFunction(({ from, to }) => {
    const t = window.__wikiworldmodel!.state().t;
    return t > Math.min(from, to) + 1 && t < Math.max(from, to) - 1;
  }, { from, to });
  await page.waitForFunction(({ id, t }) => {
    const s = window.__wikiworldmodel?.state();
    return s?.sel === id && Math.abs(s.t - t) < 1;
  }, { id, t: to });
  await settled(page);
}

async function globe(page: Page) {
  const close = page.locator('.inspect button.close');
  if (await close.isVisible()) await close.click();
  await page.getByRole('button', { name: 'Globe', exact: true }).click();
  await page.waitForFunction(() => (window.__wikiworldmodel?.state().cam.dist ?? 0) > 2.5);
  await settled(page);
}

async function tour(page: Page) {
  await page.waitForTimeout(900);
  await destination(page, 'Hell Creek 66.5 Ma', 'Hell Creek ecosystem', hellCreek, '66.5 Ma');
  const hasAnimal = await page.evaluate(id => {
    const scene = window.__wikiworldmodel!.scene();
    return scene?.site === 'hell-creek' && !!scene.eye && scene.triangles > 0 && scene.taxa.some(t => t.id === id && t.own && t.drawn);
  }, triceratops);
  if (!hasAnimal) throw new Error('The Hell Creek scene did not draw its Triceratops.');
  await page.locator('.life-here').click();
  await page.locator(`.inspect a.open[data-entity="${triceratops}"]`).click();
  await page.getByRole('button', { name: 'Look closer' }).click();
  await settled(page);
  await page.locator('.inspect button.close').click();
  await page.waitForFunction(id => window.__wikiworldmodel!.organismsAt(id).some(p =>
    p.x > 0 && p.x < innerWidth && p.y > 0 && p.y < innerHeight), triceratops);
  await page.waitForTimeout(2400);
  await globe(page);

  await destination(page, 'Temple of Magna Mater 49 BCE', 'Temple of Magna Mater', temple, '49 BCE');
  await page.waitForFunction(id => {
    const h = window.__wikiworldmodel!;
    const p = h.structureAt(id);
    return (h.cityStats()?.fine ?? 0) > 0 && !!p && p.x > 0 && p.x < innerWidth && p.y > 0 && p.y < innerHeight;
  }, temple);
  await page.waitForTimeout(1300);
  await page.locator('.inspect button.close').click();
  await page.waitForTimeout(2000);
  await globe(page);

  await destination(page, 'Laetoli footprints 3.66 Ma', 'Laetoli footprints', laetoli, '3.66 Ma');
  await page.getByRole('button', { name: 'Inspect footprint' }).click();
  const model = page.getByRole('dialog', { name: 'Footprint model' });
  await expect(model).toContainText('L8/S1-3');
  const image = model.locator('canvas');
  const rendered = await image.evaluate(canvas => {
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] && Math.abs(data[i] - data[0]) > 12) return true;
    return false;
  });
  if (!rendered) throw new Error('The Laetoli model did not render.');
  const box = await image.boundingBox();
  if (!box) throw new Error('The Laetoli model is hidden.');
  const [x, y] = [box.x + box.width * .35, box.y + box.height * .48];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 24; step++) {
    await page.mouse.move(x + box.width * .34 * step / 24, y + step);
    await page.waitForTimeout(45);
  }
  await page.mouse.up();
  await page.waitForTimeout(1400);
  await model.getByRole('button', { name: 'See measurements and source' }).click();
  await expect(page.locator(`[data-claim="${laetoli}#l8-s1-3-form"]`)).toBeInViewport();
  await page.waitForTimeout(1900);
  await page.locator('.inspect button.close').click();
  await page.locator('.when-to').click();
  await page.waitForTimeout(1400);
}

const browser = await chromium.launch();
try {
  await mkdir(dirname(output), { recursive: true });
  const tmp = await mkdtemp(join(dirname(output), '.viewer-take-'));
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    page.setDefaultTimeout(30000);
    await page.goto(url);
    const intro = page.getByRole('button', { name: 'Just look around' });
    await page.waitForFunction(() => !!window.__wikiworldmodel);
    if (await intro.isVisible()) await intro.click();
    await settled(page);
    const video = join(tmp, 'viewer.webm');
    await page.screencast.start({ path: video, size: viewport, quality: 90 });
    try {
      await tour(page);
    } finally {
      await page.screencast.stop();
    }
    const take = join(tmp, 'viewer.mp4');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', video, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', take]);
    await rename(take, output);
    console.log(output);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
} finally {
  await browser.close();
}
