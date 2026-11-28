// Pass criteria of the twenty-third slice that the viewer answers (docs/slices/TWENTY-THIRD-SLICE.md): the level of
// the sea from the shore beds is a series in the planet's readings beside van der Meer's curve; the viewer reads the
// heights the build's files have; a click on the ground says its height with its band and what that rests on; and the
// coverage page has how the two held on what they were not shown.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { byteChance, nodeOf, placeOf } from '../../../core/coast.ts';
import { decodeTile } from '../../../core/container.ts';
import { byteSd, heightOf, RESTS, type HeightKeyHeader, type HeightsIndex } from '../../../core/heights.ts';
import type { CoverageFile } from '../../../core/records.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { buildFile, idle, latestBuild, openPlanet } from './helpers.ts';

const REPO = join(import.meta.dirname, '../../..');

/** The heights as the build wrote them: the index, and a keyframe's nodes. */
function heightFiles() {
  const ts = buildFile<Tileset>('tileset.json');
  const index = buildFile<HeightsIndex>(ts.files.heights!);
  const key = (ageMa: number) => {
    const b = readFileSync(join(REPO, 'dist/builds', latestBuild(), index.keyframes.find((k) => k.ageMa === ageMa)!.file));
    const { header, arrays } = decodeTile<HeightKeyHeader>(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const map = arrays[header.map] as Int16Array;
    const mean = arrays[header.mean] as Int16Array;
    const sd = arrays[header.sd] as Uint8Array;
    const chance = arrays[header.chance] as Uint8Array;
    const rests = arrays[header.rests] as Uint8Array;
    const at = (n: number) => ({ map: map[n], rests: rests[n], ...heightOf({ mean: mean[n], sd: byteSd(sd[n]) }, byteChance(chance[n])) });
    return { at, nodes: mean.length };
  };
  return { ts, index, key };
}

type Key = ReturnType<ReturnType<typeof heightFiles>['key']>;

/** A place of a keyframe, away from the poles, whose node and the eight about it all pass a test: a click there reads one of them. */
function placeWhere(index: HeightsIndex, key: Key, test: (a: ReturnType<Key['at']>, lat: number, lon: number) => boolean): [number, number] {
  for (let n = 0; n < key.nodes; n++) {
    const [lat, lon] = placeOf(index.grid, n);
    if (Math.abs(lat) > 60) continue;
    let all = true;
    for (const dj of [-1, 0, 1]) for (const di of [-1, 0, 1]) all &&= test(key.at(nodeOf(index.grid, lat + dj, lon + di)), lat + dj, lon + di);
    if (all) return [lat, lon];
  }
  throw new Error('no such place in the keyframe');
}

async function clickCentre(page: Page) {
  const box = (await page.locator('canvas.globe').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const heightAt = (page: Page, lat: number, lon: number) => page.evaluate(([a, o]) => window.__wikiworldmodel!.heightAt(a, o), [lat, lon]);

test('the build has the level and the heights at every keyframe of the elevation', () => {
  const { ts, index } = heightFiles();
  expect(ts.files.heights).toBe('heights/index.json');
  const elevation = ts.fields.find((f) => f.id === index.elevation)!;
  expect(elevation.mode).toBe('elevation');
  expect(index.keyframes.map((k) => k.ageMa).sort((a, b) => a - b)).toEqual([...elevation.keyframesMa].sort((a, b) => a - b));
  expect(index.field).toBe('field:earth/land-height');
  expect(index.level.field).toBe('field:earth/shore-level');
});

test("the planet's readings have the sea's level from the shore beds beside van der Meer's curve", async ({ page }) => {
  const { index } = heightFiles();
  const k40 = index.keyframes.find((k) => k.ageMa === 40)!;
  await page.goto(`/?b=${latestBuild()}&t=40Ma&lat=30&lon=20&d=3`);
  await idle(page);
  await openPlanet(page);
  const row = page.locator('.planet-row[data-series="field:earth/shore-level"]');
  await expect(row).toBeVisible();
  await expect(row.locator('.planet-title')).toHaveText(index.level.title);
  await expect(row.locator('.planet-value')).toHaveText(`${k40.level} m`);
  // Beside the curve it is set against: the next reading after it.
  const ids = await page.locator('.planet-row[data-series]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.series));
  expect(ids.indexOf('field:earth/shore-level')).toBe(ids.indexOf('field:earth/sea-level') + 1);
  await expect(page.locator('.planet-row[data-series="field:earth/sea-level"]')).toBeVisible();
  // Opened, it says what it is, with its band.
  await row.click();
  const panel = page.locator('.inspect');
  await expect(panel).toContainText(index.level.title);
  await expect(panel).toContainText('read from the beds laid down at the shore');
  await expect(panel).toContainText(`${k40.lo} – ${k40.hi} m: nine chances in ten`);
  await expect(panel).toContainText('The Paleobiology Database');
});

test('the viewer reads what the files say of the height at a place', async ({ page }) => {
  const { index, key } = heightFiles();
  const k85 = key(85);
  const level = index.keyframes.find((k) => k.ageMa === 85)!.level;
  await page.goto(`/?b=${latestBuild()}&t=85Ma&lat=30&lon=-40&d=3&cl=0`);
  await idle(page);
  // Nothing of it has been fetched until something asks; the first asking fetches the keyframe.
  expect(await page.evaluate(() => window.__wikiworldmodel!.requests.filter((u) => /heights\/\d/.test(u)).length)).toBe(0);
  expect(await heightAt(page, 30, -40)).toBeNull();
  await idle(page);
  const lattice: [number, number][] = [];
  for (let lat = -84; lat <= 84; lat += 6) for (let lon = -180; lon < 180; lon += 6) lattice.push([lat, lon]);
  const seen = await page.evaluate((list) => list.map(([a, o]) => window.__wikiworldmodel!.heightAt(a, o)), lattice);
  let read = 0;
  lattice.forEach(([lat, lon], i) => {
    const want = k85.at(nodeOf(index.grid, lat, lon));
    const got = seen[i]!;
    expect({ ageMa: got.ageMa, map: got.map, level: got.level, chance: got.chance, rests: got.rests }, `${lat}, ${lon}`).toEqual({ ageMa: 85, map: want.map, level, chance: want.chance, rests: want.rests });
    // The heights are worked out from those bytes on either side, and two machines' arithmetic differs in a float's last bits.
    expect(got.middle, `${lat}, ${lon}`).toBeCloseTo(want.middle, 6);
    expect(got.lo, `${lat}, ${lon}`).toBeCloseTo(want.lo, 6);
    expect(got.hi, `${lat}, ${lon}`).toBeCloseTo(want.hi, 6);
    if (want.rests) read++;
  });
  expect(read).toBeGreaterThan(20);
  expect(await page.evaluate(() => window.__wikiworldmodel!.requests.filter((u) => /heights\/85\.lwt/.test(u)).length)).toBe(1);
  // Where today's relief is the map, the heights have nothing to say: the ground there is surveyed.
  await page.evaluate(() => window.__wikiworldmodel!.set({ t: 1950 - 20000 }));
  await idle(page);
  expect(await heightAt(page, 30, -40)).toBeNull();
});

test('a click on the ground says its height with its band and what it rests on', async ({ page }) => {
  const { index, key } = heightFiles();
  const k85 = key(85);
  // Ground the beds of the sea say lay below the level, and ground far from any bed.
  const found = placeWhere(index, k85, (a) => (a.rests & RESTS.kinds) !== 0 && !(a.rests & RESTS.range) && a.chance > 0.9 && a.map > -900);
  const none = placeWhere(index, k85, (a) => a.rests === 0 && a.map < -3000);
  await page.goto(`/?b=${latestBuild()}&t=85Ma&lat=${found[0]}&lon=${found[1]}&d=1.5&cl=0`);
  await idle(page);
  expect(await page.evaluate(() => window.__wikiworldmodel!.requests.filter((u) => /heights\/\d/.test(u)).length)).toBe(0);
  await clickCentre(page);
  await idle(page);
  const section = page.locator('.inspect .land-height');
  await expect(section.locator('h3')).toContainText('Height, by the rocks and the ranges');
  await expect(section.locator('.badge')).toHaveText('evidence');
  await expect(section.locator('.big')).toContainText('below the level of the sea');
  await expect(section).toContainText('in nine chances of ten');
  await expect(section).toContainText('The map of the time has this ground');
  await expect(section).toContainText('say which side of the level it lay on');
  await expect(section).toContainText(/Below the level in 1[0-6] of 16 members of the world/);
  await expect(section).toContainText("The sea's level then stood");
  await expect(section).toContainText('The height drawn, and the coast, are still the map\'s.');
  expect(await page.evaluate(() => window.__wikiworldmodel!.requests.filter((u) => /heights\/85\.lwt/.test(u)).length)).toBe(1);
  // The panel's own badge is still the map's, and the chance of sea keeps its own section beside this one.
  await expect(page.locator('.inspect .meta .badge').first()).toHaveText('reconstruction');
  await expect(page.locator('.inspect .sea-chance h3')).toContainText('Sea or land, by the rocks');

  // Far from any bed the height is the map's, less the level, and says so.
  await page.evaluate((cam) => window.__wikiworldmodel!.set({ cam: { ...cam, dist: 1.5 }, sel: null }), { lat: none[0], lon: none[1] });
  await idle(page);
  await clickCentre(page);
  await idle(page);
  await expect(section.locator('.badge')).toHaveText('reconstruction');
  await expect(section).toContainText("the height is the map's, less the level");
  await expect(section).toContainText(/Below the level in 16 of 16 members of the world/);

  // A range whose record says it stood: the Alps at 20 Ma, where the map has them most of a kilometre low. The range
  // is a node or two wide at this grain, so the click is at a node's own place and reads that node.
  const k20 = key(20);
  let alps: [number, number] | undefined;
  for (let n = 0; n < k20.nodes && !alps; n++) {
    const [lat, lon] = placeOf(index.grid, n);
    if (lat > 38 && lat < 50 && lon > 0 && lon < 16 && (k20.at(n).rests & RESTS.range) !== 0 && k20.at(n).middle > 1000) alps = [lat, lon];
  }
  expect(alps).toBeDefined();
  alps = alps!;
  await page.evaluate((cam) => window.__wikiworldmodel!.set({ t: 1950 - 20e6, cam: { ...cam, dist: 1.5 }, sel: null }), { lat: alps[0], lon: alps[1] });
  await idle(page);
  await clickCentre(page);
  await idle(page);
  await expect(section.locator('.badge')).toHaveText('evidence');
  await expect(section).toContainText("A range's record says this ground stood at about its present height by then");
  await expect(section.locator('.big')).toContainText('above the level of the sea');
});

test('the coverage page shows how the level and the heights held on what they did not see', async ({ page }) => {
  const heights = buildFile<CoverageFile>('coverage.json').heights!;
  await page.goto(`/coverage.html?b=${latestBuild()}`);
  const section = page.locator('.cov-houses').filter({ has: page.locator('h2', { hasText: "The sea's level and the height of the land, on what they did not see" }) });
  await expect(section).toHaveCount(1);
  // The level through time, the shore beds held out, the kinds of localities, the sides, and the ranges.
  await expect(section.locator('table')).toHaveCount(5);
  const kinds = section.locator('table').nth(2);
  await expect(kinds.locator('tr')).toHaveCount(6);
  await expect(kinds.locator('tr').nth(1)).toContainText(heights.scores.kinds.height.tile.lpd.toFixed(3));
  await expect(kinds.locator('tr').nth(2)).toContainText(heights.scores.kinds.distance.block.lpd.toFixed(3));
  await expect(kinds.locator('tr').nth(4)).toContainText(heights.scores.kinds.smoother.span.lpd.toFixed(3));
  await expect(section.locator('table').nth(4).locator('tr')).toHaveCount(heights.ranges.length + 1);
  await expect(section).toContainText('Sea level (van der Meer), m');
  await expect(section).toContainText('Held to the present, where the level is known and the ground surveyed');
  await expect(section).toContainText(`at ${heights.told} of ${heights.keyframes} keyframes`);
  // The section before it, of the chance of sea, is as it was.
  await expect(page.locator('.cov-houses').filter({ has: page.locator('h2', { hasText: 'Land and sea, on what the model did not see' }) })).toHaveCount(1);
});
