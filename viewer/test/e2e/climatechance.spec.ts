// Pass criteria of the twenty-fourth slice that the viewer answers (docs/slices/TWENTY-FOURTH-SLICE.md): a click on the
// land of the deep past says how likely each climate was and what was found near that tells of climate; the climate
// answers in the evidence tier where what was found has narrowed the run; the coverage page has the scores; and where
// a finer climate is the one drawn, it says nothing.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIMATE_LABEL, LAND_BIT } from '../../../core/climate.ts';
import { byteChance, byteFinds, nodeOf, PAIRS, placeOf, RESTS_FROM, type ChanceIndex, type ChanceKeyHeader } from '../../../core/climatechance.ts';
import { decodeTile } from '../../../core/container.ts';
import type { CoverageFile } from '../../../core/records.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { buildFile, idle, latestBuild } from './helpers.ts';

const REPO = join(import.meta.dirname, '../../..');

/** The climate conditioned as the build wrote it: the index, and a keyframe's nodes. */
function chanceFiles() {
  const ts = buildFile<Tileset>('tileset.json');
  const index = buildFile<ChanceIndex>(ts.files.climateChance!);
  const key = (ageMa: number) => {
    const b = readFileSync(join(REPO, 'dist/builds', latestBuild(), index.keyframes.find((k) => k.ageMa === ageMa)!.file));
    const { header, arrays } = decodeTile<ChanceKeyHeader>(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const chances = arrays[header.chances] as Uint8Array;
    const found = arrays[header.found] as Uint8Array;
    const told = arrays[header.told] as Uint8Array;
    const plate = arrays[header.plate] as Uint16Array;
    const C = index.classes.length;
    const at = (n: number) => ({
      land: !!(plate[n] & LAND_BIT),
      chances: Array.from(chances.subarray(n * C, (n + 1) * C), byteChance),
      found: Object.fromEntries(PAIRS.map((pair, i) => [pair, [byteFinds(found[n * PAIRS.length * 2 + i * 2]), byteFinds(found[n * PAIRS.length * 2 + i * 2 + 1])]])) as Record<string, [number, number]>,
      told: { warm: byteChance(told[n * 2]), wet: byteChance(told[n * 2 + 1]) },
    });
    return { at, nodes: plate.length };
  };
  return { ts, index, key };
}

type Key = ReturnType<ReturnType<typeof chanceFiles>['key']>;

/** The nodes round a node, itself first. */
function around(index: ChanceIndex, n: number): number[] {
  const [lat, lon] = placeOf(index.grid, n);
  const out = [n];
  for (const dj of [-1, 0, 1]) for (const di of [-1, 0, 1]) if (dj || di) out.push(nodeOf(index.grid, Math.max(-90, Math.min(90, lat + dj * index.grid.step)), lon + di * index.grid.step));
  return out;
}

/**
 * Two places of a keyframe on its land, away from the poles: one where coals or salts lie near and have told a
 * quarter of the aridity's spread, and one far from every bed that is read.
 */
function places(index: ChanceIndex, key: Key): { found: [number, number]; none: [number, number] } {
  let found = -1;
  let most = 0;
  let none = -1;
  for (let n = 0; n < key.nodes; n++) {
    const [lat] = placeOf(index.grid, n);
    if (Math.abs(lat) > 60) continue;
    const all = around(index, n).map((k) => key.at(k));
    if (!all.every((a) => a.land)) continue;
    const least = Math.min(...all.map((a) => a.told.wet));
    if (least >= RESTS_FROM && least > most) [found, most] = [n, least];
    if (none < 0 && all.every((a) => Object.values(a.found).every(([m, l]) => m === 0 && l === 0))) none = n;
  }
  expect(found).toBeGreaterThanOrEqual(0);
  expect(none).toBeGreaterThanOrEqual(0);
  return { found: placeOf(index.grid, found), none: placeOf(index.grid, none) };
}

async function clickCentre(page: Page) {
  const box = (await page.locator('canvas.globe').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const chanceAt = (page: Page, lat: number, lon: number) => page.evaluate(([a, o]) => window.__wikiworldmodel!.climateChanceAt(a, o), [lat, lon]);
const requests = (page: Page, what: RegExp) => page.evaluate((src) => window.__wikiworldmodel!.requests.filter((u) => new RegExp(src).test(u)).length, what.source);

test('the build has the climate conditioned at every keyframe of the climate field, and the beds found near', () => {
  const { ts, index } = chanceFiles();
  expect(ts.files.climateChance).toBe('climate-chance/index.json');
  expect(index.field).toBe('field:earth/climate-chance');
  expect(index.beds.field).toBe('field:earth/climate-beds');
  expect(index.climate).toBe(ts.climate!.field);
  expect(index.keyframes).toHaveLength(55);
  // The run is still what is drawn, and says nothing of how sure it is.
  expect(ts.climate!.spread).toBe('unknown');
});

test('a click on the land says how likely each climate was, and what was found near that tells of it', async ({ page }) => {
  const { index, key } = chanceFiles();
  const k70 = key(70);
  const { found, none } = places(index, k70);
  // Nothing of it is fetched until a click asks: the click fetches the one keyframe, and the panel fills in.
  await page.goto(`/?b=${latestBuild()}&t=70Ma&lat=${found[0]}&lon=${found[1]}&d=1.5&cl=0`);
  await idle(page);
  expect(await requests(page, /climate-chance\/\d/)).toBe(0);
  await clickCentre(page);
  const section = page.locator('.inspect .climate-chance');
  await expect(section.locator('h3')).toContainText('How likely each climate was');
  const want = k70.at(nodeOf(index.grid, found[0], found[1]));
  const top = Math.max(...want.chances);
  await expect(section.locator('.big')).toContainText(`${Math.round(top * 100)}%`);
  await expect(section.locator('.big')).toContainText(CLIMATE_LABEL[index.classes[want.chances.indexOf(top)]]);
  await expect(section).toContainText('Beds of 75 Ma to 65 Ma near where this ground stood');
  await expect(section).toContainText('coals and mires');
  await expect(section).toContainText(/What was found has narrowed the band of the warmth here by \d+% and of the aridity by \d+%\./);
  await expect(section.locator('.badge')).toHaveText('evidence');
  await expect(section).toContainText(/Nine members of the world in ten have the warmest month between −?\d+ and −?\d+ °C/);
  await expect(section).toContainText("The Earth's mean warmth then");
  await expect(section).toContainText('The land is still painted from the run.');
  await expect(section).toContainText('The Paleobiology Database');
  expect(await requests(page, /climate-chance\/70\.lwt/)).toBe(1);
  // The section the run's own class is in is still there, as it was.
  await expect(page.locator('.inspect .biome h3')).toHaveText('Covered with');

  // Far from every bed the climate is the run's, moved, and says so.
  await page.evaluate((cam) => window.__wikiworldmodel!.set({ cam: { ...cam, dist: 1.5 }, sel: null }), { lat: none[0], lon: none[1] });
  await idle(page);
  await clickCentre(page);
  await expect(section).toContainText('No bed that tells of climate was found near where this ground stood');
  await expect(section.locator('.badge')).toHaveText('reconstruction');
});

test('the globe holds what the files say, and the climate answers in the evidence tier where what was found has narrowed the run', async ({ page }) => {
  const { index, key } = chanceFiles();
  const k70 = key(70);
  const { found, none } = places(index, k70);
  await page.goto(`/?b=${latestBuild()}&t=70Ma&lat=${found[0]}&lon=${found[1]}&d=2.2&cl=0`);
  await idle(page);
  // Asking fetches the keyframe: nothing until it has come.
  expect(await chanceAt(page, found[0], found[1])).toBeNull();
  await idle(page);
  const here = (await chanceAt(page, found[0], found[1]))!;
  const want = k70.at(nodeOf(index.grid, found[0], found[1]));
  expect(here.ageMa).toBe(70);
  expect(here.chances).toEqual(want.chances);
  expect(here.found).toEqual(want.found);
  expect(here.rests).toBe(true);
  const resolve = (lat: number, lon: number) => page.evaluate(([a, o]) => window.__wikiworldmodel!.resolve(a, o, 'climate'), [lat, lon]);
  const answer = await resolve(found[0], found[1]);
  expect(answer.tier).toBe('evidence');
  expect(answer.why).toContain('that tell of climate lie near');
  expect((await chanceAt(page, none[0], none[1]))!.rests).toBe(false);
  expect((await resolve(none[0], none[1])).tier).toBe('model');
  // Where the climate of the last glacial cycle is the one drawn, the deep past's has nothing to say.
  await page.evaluate(() => window.__wikiworldmodel!.set({ t: 1950 - 20000 }));
  await idle(page);
  expect(await chanceAt(page, found[0], found[1])).toBeNull();
  expect((await resolve(found[0], found[1])).tier).not.toBe('evidence');
});

test('the coverage page shows how the climate of the deep past held on what it did not see', async ({ page }) => {
  const s = buildFile<CoverageFile>('coverage.json').climateChance!;
  await page.goto(`/coverage.html?b=${latestBuild()}`);
  const section = page.locator('.cov-climate');
  await expect(section).toHaveCount(1);
  await expect(section.locator('h2')).toHaveText('The climate of the deep past, on what the model did not see');
  // The warmth, the beds, how the chances held, the columns, the forests, the present, and the stretches of time.
  await expect(section.locator('table')).toHaveCount(4 + (s.columns ? 1 : 0) + (s.forests?.length ? 1 : 0) + (s.present ? 1 : 0));
  await expect(section).toContainText(`the measured warmest month lies in the band nine members in ten have at ${Math.round(s.present!.within.hot * 100)}% of the land`);
  const warmth = section.locator('table').first();
  await expect(warmth.locator('tr')).toHaveCount(4);
  await expect(warmth.locator('tr').nth(1)).toContainText(s.balance.balance.toFixed(2));
  await expect(warmth.locator('tr').nth(3)).toContainText(s.balance.baseline.toFixed(2));
  const beds = section.locator('table').nth(1);
  await expect(beds.locator('tr')).toHaveCount(10);
  await expect(beds.locator('tr').nth(1)).toContainText(s.scores.wet.model.block.lpd.toFixed(3));
  await expect(beds.locator('tr').nth(2)).toContainText(s.scores.wet.smoother.block.lpd.toFixed(3));
  await expect(section).toContainText('Against the columns of rock, which it does not read');
  await expect(section).toContainText('The fossil forests');
  await expect(section).toContainText('Held to the present, where the climate is measured');
  await expect(section).toContainText('npm run world -- climate');
  // The chart has its lane on the climate's layer.
  await expect(page.locator('.bar', { hasText: 'How likely each climate was' })).toBeVisible();
});
