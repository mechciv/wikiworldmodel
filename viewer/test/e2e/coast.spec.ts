// Pass criteria of the twenty-first slice that the viewer answers (docs/slices/TWENTY-FIRST-SLICE.md): the globe holds
// the chance of sea the build's files have, at a keyframe and carried on its plate between two; in evidence mode the
// ground the rocks speak for turns blue and the rest stays amber; a click says how likely the sea was, what was found
// near and which says more; and the geography answers in the evidence tier there.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BAND, byteChance, byteFinds, nodeOf, placeOf, restsOnFinds, type CoastIndex, type CoastKeyHeader } from '../../../core/coast.ts';
import { decodeTile } from '../../../core/container.ts';
import { conj, mul, rotate, toLatLon, unitVector } from '../../../core/quat.ts';
import { PlateModels, RotationModel } from '../../../core/rotation-model.ts';
import type { FramesFile, Tileset } from '../../../core/tileset.ts';
import { fromMa, toMa } from '../../../core/time.ts';
import { buildFile, canvasPatch, idle, latestBuild } from './helpers.ts';

const REPO = join(import.meta.dirname, '../../..');

/** The sea's chance as the build wrote it: the index, and a keyframe's nodes. */
function coastFiles() {
  const ts = buildFile<Tileset>('tileset.json');
  const index = buildFile<CoastIndex>(ts.files.coast!);
  const key = (ageMa: number) => {
    const b = readFileSync(join(REPO, 'dist/builds', latestBuild(), index.keyframes.find((k) => k.ageMa === ageMa)!.file));
    const { header, arrays } = decodeTile<CoastKeyHeader>(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const chance = arrays[header.chance] as Uint8Array;
    const marine = arrays[header.marine] as Uint8Array;
    const land = arrays[header.land] as Uint8Array;
    const plate = arrays[header.plate] as Uint16Array;
    const at = (n: number) => {
      const m = byteFinds(marine[n]);
      const l = byteFinds(land[n]);
      return { chance: byteChance(chance[n]), marine: m, land: l, rests: restsOnFinds(m, l, index.rule) };
    };
    return { at, plate, nodes: chance.length };
  };
  return { ts, index, key };
}

type Key = ReturnType<ReturnType<typeof coastFiles>['key']>;

/** The nodes round a node, itself first: a place carried on a plate may fall on the next one. */
function around(index: CoastIndex, n: number): number[] {
  const [lat, lon] = placeOf(index.grid, n);
  const out = [n];
  for (const dj of [-1, 0, 1]) for (const di of [-1, 0, 1]) if (dj || di) out.push(nodeOf(index.grid, Math.max(-90, Math.min(90, lat + dj)), lon + di));
  return out;
}

/**
 * Two places of a keyframe, away from the poles: one where many localities lie near and the sea is almost sure, and
 * one in the open ocean, far from any locality and from the map's coast.
 */
function places(index: CoastIndex, key: Key): { found: [number, number]; none: [number, number] } {
  let found = -1;
  let most = 0;
  let none = -1;
  for (let n = 0; n < key.nodes; n++) {
    const [lat] = placeOf(index.grid, n);
    if (Math.abs(lat) > 60) continue;
    const all = around(index, n).map((k) => key.at(k));
    if (!all.every((a) => a.chance > BAND[1])) continue;
    const least = Math.min(...all.map((a) => a.marine + a.land));
    if (least > most) [found, most] = [n, least];
    if (none < 0 && all.every((a) => a.marine + a.land === 0 && a.chance > 0.97)) none = n;
  }
  expect(most).toBeGreaterThan(3);
  expect(none).toBeGreaterThanOrEqual(0);
  return { found: placeOf(index.grid, found), none: placeOf(index.grid, none) };
}

async function clickCentre(page: Page) {
  const box = (await page.locator('canvas.globe').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const seaAt = (page: Page, lat: number, lon: number) => page.evaluate(([a, o]) => window.__wikiworldmodel!.seaAt(a, o), [lat, lon]);

test('the build has the chance of sea at every keyframe of the elevation, and what was found near', () => {
  const { ts, index } = coastFiles();
  expect(ts.files.coast).toBe('coast/index.json');
  const elevation = ts.fields.find((f) => f.id === index.elevation)!;
  expect(elevation.mode).toBe('elevation');
  expect(index.keyframes.map((k) => k.ageMa).sort((a, b) => a - b)).toEqual([...elevation.keyframesMa].sort((a, b) => a - b));
  expect(index.field).toBe('field:earth/sea-chance');
  expect(index.finds.field).toBe('field:earth/rock-finds');
});

test('the globe holds what the files say at a keyframe, and carries it on its plate between two', async ({ page }) => {
  const { index, key } = coastFiles();
  const k85 = key(85);
  await page.goto(`/?b=${latestBuild()}&t=85Ma&lat=40&lon=-70&d=2.6&cl=0&ev=1`);
  await idle(page);
  // At the keyframe itself a place of the globe is a node of the file: every sixth degree, the same bytes.
  const lattice: [number, number][] = [];
  for (let lat = -84; lat <= 84; lat += 6) for (let lon = -180; lon < 180; lon += 6) lattice.push([lat, lon]);
  const seen = await page.evaluate((list) => list.map(([a, o]) => window.__wikiworldmodel!.seaAt(a, o)), lattice);
  let found = 0;
  lattice.forEach(([lat, lon], i) => {
    const want = k85.at(nodeOf(index.grid, lat, lon));
    expect(seen[i], `${lat}, ${lon}`).toEqual({ ageMa: 85, ...want });
    if (want.rests) found++;
  });
  expect(found).toBeGreaterThan(20);

  // Nearly half way to the next keyframe, the keyframe nearer is still that of 85 Ma, and a place has moved with its
  // plate: what the globe has where a node stands now is what the file has at the node, or at one beside it.
  const frames = buildFile<FramesFile>(buildFile<Tileset>('tileset.json').files.frames);
  const model = new RotationModel(frames.rotations);
  const plates = new PlateModels(model, (frames.models ?? []).map((m) => ({ source: m.source, offset: m.offset, model: new RotationModel(m.rotations) })));
  await page.evaluate((t) => window.__wikiworldmodel!.set({ t }), Math.round(fromMa(82.6)));
  await idle(page);
  const nowMa = toMa(await page.evaluate(() => window.__wikiworldmodel!.state().t));
  expect(nowMa).toBeGreaterThan(82.5);
  expect(nowMa).toBeLessThan(83);
  const moved: { now: [number, number]; node: number }[] = [];
  for (let n = 0; n < k85.nodes && moved.length < 60; n += 41) {
    const here = k85.at(n);
    const plate = frames.plateIndex[k85.plate[n]];
    const [lat, lon] = placeOf(index.grid, n);
    // Nodes with finds, well inside one plate, away from the poles.
    if (!plate || here.marine + here.land < 1 || Math.abs(lat) > 70 || around(index, n).some((k) => k85.plate[k] !== k85.plate[n])) continue;
    const q = mul(plates.total(plate, nowMa), conj(plates.total(plate, 85)));
    moved.push({ now: toLatLon(rotate(q, unitVector(lat, lon))) as [number, number], node: n });
  }
  expect(moved.length).toBeGreaterThan(20);
  const after = await page.evaluate((list) => list.map(([a, o]) => window.__wikiworldmodel!.seaAt(a, o)), moved.map((m) => m.now));
  // Some have moved by more than half a node's width, to another node, so the carrying is tested and not only the reading.
  const far = moved.filter((m) => {
    const [lat, lon] = placeOf(index.grid, m.node);
    return Math.hypot(m.now[0] - lat, (m.now[1] - lon) * Math.cos((lat * Math.PI) / 180)) > 0.5;
  });
  expect(far.length).toBeGreaterThan(3);
  let right = 0;
  moved.forEach((m, i) => {
    const got = after[i];
    expect(got?.ageMa).toBe(85);
    if (around(index, m.node).some((k) => Math.abs(k85.at(k).chance - got!.chance) < 1e-9 && Math.abs(k85.at(k).marine - got!.marine) < 1e-9)) right++;
  });
  // A place at the edge of the globe's own picture of a plate may be read from the plate beside it.
  expect(right).toBeGreaterThanOrEqual(Math.floor(moved.length * 0.9));
});

test('in evidence mode the ground the rocks speak for turns blue, and the rest stays amber', async ({ page }) => {
  const { index, key } = coastFiles();
  const { found, none } = places(index, key(85));
  await page.goto(`/?b=${latestBuild()}&t=85Ma&lat=${found[0]}&lon=${found[1]}&d=1.5&cl=0`);
  await idle(page);
  /** How much bluer than red the ground under the camera is, with evidence mode off and on. */
  const blueness = async (lat: number, lon: number) => {
    const out: number[] = [];
    for (const evidence of [false, true]) {
      await page.evaluate((s) => window.__wikiworldmodel!.set(s), { cam: { lat, lon, dist: 1.5 }, evidence, clouds: false });
      await idle(page);
      const [r, , b] = await canvasPatch(page, 0.5, 0.5, 21);
      out.push(b - r);
    }
    return out[1] - out[0];
  };
  // Where localities lie near, evidence mode's hatching is the blue of evidence; where none do, the amber of a
  // reconstruction, as all of the map was before.
  expect(await blueness(found[0], found[1])).toBeGreaterThan(6);
  expect(await blueness(none[0], none[1])).toBeLessThan(-15);
  expect(await page.evaluate(() => window.__wikiworldmodel!.waiting())).toEqual([]);
  await expect(page.locator('.legend')).toContainText('Blue ground in deep time');
});

test('a click says how likely the sea was, what was found near, and which says more', async ({ page }) => {
  const { index, key } = coastFiles();
  const k85 = key(85);
  const { found, none } = places(index, k85);
  // Without evidence mode nothing of it has been fetched: the click fetches the keyframe, and the panel fills in.
  await page.goto(`/?b=${latestBuild()}&t=85Ma&lat=${found[0]}&lon=${found[1]}&d=1.5&cl=0`);
  await idle(page);
  expect(await page.evaluate(() => window.__wikiworldmodel!.requests.filter((u) => /coast\/\d/.test(u)).length)).toBe(0);
  await clickCentre(page);
  const sea = page.locator('.inspect .sea-chance');
  await expect(sea.locator('h3')).toContainText('Sea or land, by the rocks');
  const want = k85.at(nodeOf(index.grid, found[0], found[1]));
  await expect(sea.locator('.big')).toContainText(`${Math.round(want.chance * 100)}%`);
  await expect(sea).toContainText('Fossil localities of 87.5 Ma to 82.5 Ma within about');
  await expect(sea).toContainText('They weigh more than the map does here.');
  await expect(sea.locator('.badge')).toHaveText('evidence');
  await expect(sea).toContainText(/Sea here in \d+ of 16 members of the world/);
  await expect(sea).toContainText('The Paleobiology Database');
  expect(await page.evaluate(() => window.__wikiworldmodel!.requests.filter((u) => /coast\/85\.lwt/.test(u)).length)).toBe(1);
  // The panel's own badge is still the map's: the height is a reconstruction.
  await expect(page.locator('.inspect .meta .badge').first()).toHaveText('reconstruction');

  // Far from any locality the chance is the map's own, and says so.
  await page.evaluate((cam) => window.__wikiworldmodel!.set({ cam: { ...cam, dist: 1.5 }, sel: null }), { lat: none[0], lon: none[1] });
  await idle(page);
  await clickCentre(page);
  await expect(sea).toContainText('No fossil locality of 87.5 Ma to 82.5 Ma was found within about');
  await expect(sea.locator('.badge')).toHaveText('reconstruction');
  await expect(sea).toContainText('Almost surely under the sea.');
});

test('the geography answers in the evidence tier where the finds outweigh the map, and as a model elsewhere', async ({ page }) => {
  const { index, key } = coastFiles();
  const { found, none } = places(index, key(85));
  await page.goto(`/?b=${latestBuild()}&t=85Ma&lat=${found[0]}&lon=${found[1]}&d=2.2&cl=0&ev=1`);
  await idle(page);
  const resolve = (lat: number, lon: number) => page.evaluate(([a, o]) => window.__wikiworldmodel!.resolve(a, o, 'geography'), [lat, lon]);
  const here = await resolve(found[0], found[1]);
  expect(here.tier).toBe('evidence');
  expect(here.why).toContain('Fossil localities of the time lie near');
  expect((await resolve(none[0], none[1])).tier).toBe('model');
  expect((await seaAt(page, found[0], found[1]))!.rests).toBe(true);
  // Where today's relief is the map, the chance has nothing to say: the coast there is measured.
  await page.evaluate(() => window.__wikiworldmodel!.set({ t: 1950 - 20000 }));
  await idle(page);
  expect(await seaAt(page, found[0], found[1])).toBeNull();
  expect((await resolve(found[0], found[1])).tier).not.toBe('evidence');
});
