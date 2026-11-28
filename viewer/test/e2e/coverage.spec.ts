// The coverage page: every layer drawn along the time control's scale from the build's own counts, a cell picked
// says what answers there and maps it, and a place on the map opens the globe there and then.
import { expect, test } from '@playwright/test';
import type { CoverageFile } from '../../../core/records.ts';
import { TIERS } from '../../../core/resolve.ts';
import { fromMa } from '../../../core/time.ts';
import { buildFile, idle, latestBuild } from './helpers.ts';

test('draws every layer, and a picked cell says what answers there and maps it', async ({ page }) => {
  const m = buildFile<CoverageFile>('coverage.json').matrix!;
  await page.goto(`/coverage.html?b=${latestBuild()}`);
  await expect(page.locator('.row.layer')).toHaveCount(m.layers.length);
  await expect(page.locator('.cov-head')).toContainText(latestBuild());

  // The land at the K–Pg boundary: a model's, but for the ground where fossil localities of the time say more than
  // the map does, which is evidence, as the build counted the two.
  const col = m.columns.findIndex(([a, b]) => a <= fromMa(66.04) && fromMa(66.04) < b);
  const share = m.layers.find((l) => l.layer === 'geography')!.cells[col].share;
  expect(share[TIERS.indexOf('model')]).toBeGreaterThan(0.6);
  expect(share[TIERS.indexOf('evidence')]).toBeGreaterThan(0.02);
  const track = page.locator('.row.layer[data-layer="geography"] .track');
  const box = (await track.boundingBox())!;
  await track.click({ position: { x: ((col + 0.5) / m.columns.length) * box.width, y: box.height / 2 } });
  const detail = page.locator('.cov-detail');
  await expect(detail.locator('h3')).toHaveText('Land and sea');
  await expect(detail).toContainText('Surface elevation and ocean depth');
  await expect(detail).toContainText('Fossil localities of the time lie near');
  // A share as the page writes it.
  const pct = (x: number) => (x < 0.1 ? `${(x * 100).toFixed(1)}%` : `${Math.round(x * 100)}%`);
  const model = detail.locator('li', { hasText: 'Model' }).first();
  await expect(model.locator('.n')).toHaveText(pct(share[TIERS.indexOf('model')]));
  const evidence = detail.locator('li', { hasText: 'Evidence' }).first();
  await expect(evidence.locator('.n')).toHaveText(pct(share[TIERS.indexOf('evidence')]));

  // Its map is the whole grid, in the model's colour and, where the rocks answer, in evidence's.
  const colours = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('.cov-detail canvas.map')!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<string>();
    for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return { w: c.width, h: c.height, seen: [...seen] };
  });
  expect(colours.w * colours.h).toBe((180 / m.step) * (360 / m.step));
  expect(colours.seen.length).toBe(2);

  // Expanding a layer shows what answers it, with its grid: the map, and the chance of sea the rocks give.
  await page.locator('.row.layer[data-layer="geography"] .label').click();
  await expect(page.locator('.bar', { hasText: 'Surface elevation and ocean depth' })).toBeVisible();
  await expect(page.locator('.bar', { hasText: 'How likely the sea was' })).toBeVisible();
});

test("shows how the sea's chance held on what it did not see", async ({ page }) => {
  const coast = buildFile<CoverageFile>('coverage.json').coast!;
  await page.goto(`/coverage.html?b=${latestBuild()}`);
  const section = page.locator('.cov-houses').filter({ has: page.locator('h2', { hasText: 'Land and sea, on what the model did not see' }) });
  await expect(section).toHaveCount(1);
  // The scores, the sides, how the chances held, the stretches of time, the columns of rock, and the keyframes most moved.
  await expect(section.locator('table')).toHaveCount(5 + (coast.columns ? 1 : 0));
  const scores = section.locator('table').first();
  await expect(scores.locator('tr')).toHaveCount(5);
  await expect(scores.locator('tr').nth(1)).toContainText(coast.scores.model.tile.lpd.toFixed(3));
  await expect(scores.locator('tr').nth(2)).toContainText(coast.scores.smoother.block.lpd.toFixed(3));
  await expect(section).toContainText('Against the columns of rock, which it does not read');
  await expect(section).toContainText('Where the rocks move the coast most');
  await expect(section).toContainText('before the land had life');
  await expect(section).toContainText('Held to the present, where the coast is measured');
});

test('a place on the map opens the globe there and then', async ({ page }) => {
  await page.goto(`/coverage.html?b=${latestBuild()}`);
  const map = page.locator('.cov-detail canvas.map');
  await expect(map).toBeVisible();
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * 0.55, y: box.height * 0.3 } });
  await page.waitForURL(/[?&]lat=/);
  const q = new URL(page.url()).searchParams;
  expect(q.get('b')).toBe(latestBuild());
  expect(Number(q.get('lat'))).toBeGreaterThan(20);
  await idle(page);
});

test('shows whose houses rest on a tradition, at each time the build counts, by way of life', async ({ page }) => {
  const counts = buildFile<CoverageFile>('coverage.json').landscape!.housing!;
  await page.goto(`/coverage.html?b=${latestBuild()}`);
  // The section of the houses; the population model's scores below it are drawn alike.
  const section = page.locator('.cov-houses').filter({ has: page.locator('h2', { hasText: "People's houses, by way of life" }) });
  await expect(section).toHaveCount(1);
  const table = section.locator('table');
  // A row for each time counted, under the header; a column for each way of life.
  await expect(table.locator('tr')).toHaveCount(counts.length + 1);
  for (const way of ['foragers', 'herders', 'shifting cultivators', 'farmers', 'townspeople']) await expect(table.locator('th', { hasText: way })).toHaveCount(1);
  // The last time's share in a tradition's house is the build's, to the page's rounding.
  const last = counts.at(-1)!;
  const share = last.housed / last.people;
  const shown = await table.locator('tr').last().locator('td.house b').first().textContent();
  expect(shown).toBe(share === 0 ? '0%' : share < 0.001 ? '<0.1%' : share < 0.1 ? `${(share * 100).toFixed(1)}%` : `${Math.round(share * 100)}%`);
});

test('the globe links to the coverage of the build it shows', async ({ page }) => {
  await page.goto(`/?b=${latestBuild()}`);
  await idle(page);
  await expect(page.locator('.brand a.coverage-link')).toHaveAttribute('href', `./coverage.html?b=${latestBuild()}`);
});
