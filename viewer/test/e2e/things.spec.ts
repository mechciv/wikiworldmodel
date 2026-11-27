// The things of lists in the viewer (docs/plans/ENTITIES.md, steps 2 to 5): found by search as its shard of names comes,
// opened as a page made from their list's chunk, or as the record that is them.
import { expect, test } from '@playwright/test';
import { idle, latestBuild } from './helpers.ts';

test('a thing of a list is found by search, and going to it opens its page where and when it was', async ({ page }) => {
  await page.goto(`/?b=${latestBuild()}&t=1900&lat=20&lon=10&d=3`);
  await idle(page);
  await page.fill('.search input', 'Etna');
  const hit = page.locator('.search li').filter({ hasText: '1669 CE' }).first();
  await expect(hit).toContainText('NOAA NCEI');
  await hit.dispatchEvent('mousedown');
  await idle(page);
  const state = await page.evaluate(() => window.__wikiworldmodel!.state());
  expect(state.sel).toMatch(/^ncei:eruption:/);
  // The list gives the year alone, which is the whole of 1669: the view lands within it.
  expect(Math.floor(state.t)).toBe(1669);
  const panel = page.locator('.inspect');
  await expect(panel.locator('h2')).toHaveText('Etna, Italy');
  await expect(panel).toContainText('A thing of a list');
  await expect(panel).toContainText('where its list puts it today');
});

test('a living species is found by its common name, and its page names it as its catalogue does and says how the lists were joined', async ({ page }) => {
  await page.goto(`/?b=${latestBuild()}&t=2020&lat=0&lon=20&d=3`);
  await idle(page);
  await page.fill('.search input', 'lion');
  const hit = page.locator('.search li').filter({ hasText: 'common name of Panthera leo' }).first();
  await expect(hit).toBeVisible();
  await hit.dispatchEvent('mousedown');
  await idle(page);
  const panel = page.locator('.inspect');
  await expect(panel.locator('h2')).toHaveText('Panthera leo');
  // The Catalogue of Life's taxon, joined to the fossils' by its name, rank and tree: its common name and its synonyms.
  await expect(panel).toContainText('Lion');
  await expect(panel).toContainText('Felis leo');
  await expect(panel).toContainText('by its name and rank');
});

test('a taxon no record is opens its own page, and one a record is opens the record, with what the list says of it', async ({ page }) => {
  await page.goto(`/?b=${latestBuild()}&t=-150000000&sel=pbdb:txn:52962`);
  await idle(page);
  const panel = page.locator('.inspect');
  await expect(panel.locator('h2')).toHaveText('Allosaurus fragilis');
  await expect(panel).toContainText('A species in The Paleobiology Database');
  await expect(panel.locator('ul.relations')).toContainText('descends from Allosaurus');
  await page.evaluate(() => window.__wikiworldmodel!.set({ sel: 'pbdb:txn:38613' }));
  await idle(page);
  await expect.poll(async () => (await page.evaluate(() => window.__wikiworldmodel!.state())).sel).toBe('life/taxa/tyrannosaurus');
  await expect(panel.locator('h2')).toHaveText('Tyrannosaurus');
  await expect(panel.locator('section.rows')).toContainText('pbdb:txn:38613');
});
