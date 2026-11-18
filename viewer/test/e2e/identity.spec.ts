// Identity over time (docs/slices/TWELFTH-SLICE.md), as the viewer shows it: a date in a count of days, and the day
// it comes to under the correlation picked; a relation's span, what denies it, and whether it is another reading or
// was set aside; a claim of identity that holds only in its perspective; names that follow one another; and the
// states that have records, however many hold at once.
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { PolitiesFile } from '../../../core/layers.ts';
import { drawnFirst, territoriesAt, type TerritoryFile } from '../../../core/territory.ts';
import { buildFile, idle, latestBuild } from './helpers.ts';

/** Open a view, and give its panel. */
async function open(page: Page, query: string): Promise<Locator> {
  await page.goto(`/?b=${latestBuild()}&${query}`);
  await idle(page);
  return page.locator('.inspect');
}

/** A relation of the record that is open, by how its line begins: its notes name other records too. */
const relation = (panel: Locator, begins: RegExp) => panel.locator('ul.relations > li', { hasText: begins });

test('a date in the Long Count is shown as it was carved, and its day follows the correlation picked', async ({ page }) => {
  const panel = await open(page, 't=683&lat=17.48&lon=-92.05&d=2.2&sel=people/rulers/pakal');
  await expect(panel.locator('h2')).toContainText('Pakal');
  await expect(panel).toContainText('9.12.11.5.18 Long Count (26 August 683 CE)');
  await expect(panel.locator('.when')).toContainText('21 March 603 CE → 26 August 683 CE');
  // Thompson's first constant puts the zero day two days later: the birth, the accession and the death move together.
  await page.evaluate(() => window.__wikiworldmodel!.set({ picks: ['people/calendars/long-count-zero-day#date-584285'] }));
  await idle(page);
  await expect(panel).toContainText('9.8.9.13.0 Long Count (23 March 603 CE)');
  await expect(panel).toContainText('9.9.2.4.8 Long Count (26 July 615 CE)');
  await expect(panel).toContainText('9.12.11.5.18 Long Count (28 August 683 CE)');
  await expect(panel.locator('.when')).toContainText('23 March 603 CE → 28 August 683 CE');
  await expect(panel.locator('.when')).toContainText('with your choices');
});

test('a relation says when it held, and a span may end where another record does', async ({ page }) => {
  // One king of three kingdoms at once: each crown for its own span, to his death, which is written once.
  let panel = await open(page, 't=1610&lat=54&lon=-3&d=2.2&sel=people/rulers/james-vi-and-i');
  await expect(relation(panel, /^held office Kingdom of Scotland/)).toContainText('(24 July 1567 CE – the end of James VI and I)');
  // A date the source gives in the Old Style is shown as written, with its day on the axis.
  await expect(relation(panel, /^held office Kingdom of England/)).toContainText('(24 March 1603 CE in the Julian calendar (3 April 1603 CE) – the end of James VI and I)');
  await expect(relation(panel, /^held office Kingdom of Ireland/)).toContainText('the end of James VI and I');
  // A republic that was part of a union for as long as the union lasted, and is older than it.
  panel = await open(page, 't=1930&lat=56&lon=38&d=2.2&sel=people/polities/russia');
  await expect(relation(panel, /^part of Soviet Union/)).toContainText('(the start of Soviet Union – the end of Soviet Union)');
  await expect(panel.locator('.when')).toContainText('7 November 1917 CE');
  // Who fought in a war, each for the span it did; a moment that ends a span is named itself.
  panel = await open(page, 't=1942&lat=50&lon=15&d=2.6&sel=people/wars/second-world-war');
  await expect(relation(panel, /^participant United States/)).toContainText('(7 December 1941 CE – the end of Second World War)');
  await expect(relation(panel, /^participant German Reich/)).toContainText('(the start of Invasion of Poland – German Instrument of Surrender)');
  await expect(panel).toContainText('has part Second Sino-Japanese War (from 9 December 1941 CE)');
});

test('what denies a claim of identity is shown apart, and one that was given up is kept, set aside', async ({ page }) => {
  const panel = await open(page, 't=1995&lat=44&lon=20&d=2.2&sel=people/polities/fr-yugoslavia');
  const continues = relation(panel, /^continues/);
  await expect(continues).toHaveCount(1);
  await expect(continues.locator('.badge', { hasText: 'set aside' })).toBeVisible();
  await expect(continues).toContainText('Denied by');
  await expect(continues.locator('blockquote.against')).toHaveCount(5);
  // What it arose from is not in question.
  await expect(relation(panel, /^arose from/).locator('.badge')).toHaveCount(0);
});

test('a contested identity holds only in the picture of those who claim it, seen from either end', async ({ page }) => {
  const hre = 't=1000&lat=50&lon=10&d=2.2&sel=people/polities/holy-roman-empire';
  let panel = await open(page, hre);
  await expect(panel.locator('.when')).toContainText('2 February 962 CE → 6 August 1806 CE');
  await expect(relation(panel, /^arose from/)).toHaveCount(1);
  await expect(relation(panel, /^continues/)).toHaveCount(0);
  // In the perspective of the western empire it is Rome carried on, from Charlemagne's coronation; Constantinople's
  // denials stand beside the claim.
  const alt = 'alt:roman-succession/translatio-imperii';
  panel = await open(page, `${hre}&alt=${alt}`);
  await expect(panel.locator('.when')).toContainText('25 December 800 CE → 6 August 1806 CE');
  const continues = relation(panel, /^continues/);
  await expect(continues).toContainText('continues Rome');
  await expect(continues).toContainText('Denied by');
  await expect(continues.locator('blockquote.against')).toHaveCount(4);
  // And Rome says who claimed to carry it on only in that picture.
  panel = await open(page, `t=1000&lat=41&lon=29&d=2.2&sel=people/polities/rome&alt=${alt}`);
  await expect(panel).toContainText('continued by Holy Roman Empire');
  panel = await open(page, 't=1000&lat=41&lon=29&d=2.2&sel=people/polities/rome');
  await expect(panel).not.toContainText('continued by Holy Roman Empire');
});

test('a rival reading of a relation is marked, and names that follow one another are not a choice', async ({ page }) => {
  let panel = await open(page, 't=-700&lat=38&lon=24&d=2.2&sel=people/writing/greek-alphabet');
  await expect(relation(panel, /^arose from Phoenician alphabet/).locator('.badge')).toHaveCount(0);
  await expect(relation(panel, /^arose from Proto-Canaanite/).locator('.badge', { hasText: 'another reading' })).toBeVisible();
  // Russia's official names each held for a span of their own; the four ends of the Soviet Union compete.
  panel = await open(page, 't=1930&lat=56&lon=38&d=2.2&sel=people/polities/russia');
  const official = panel.locator('.claim-group', { has: page.locator('h4', { hasText: /^Official name/ }) });
  await expect(official.locator('h4 .badge')).toHaveText('in turn');
  await expect(official.locator('.claim')).toHaveCount(3);
  await expect(official.locator('input[type=radio]')).toHaveCount(0);
  panel = await open(page, 't=1990&lat=56&lon=38&d=2.2&sel=people/polities/soviet-union');
  const end = panel.locator('.claim-group', { has: page.locator('h4', { hasText: /^End/ }) });
  await expect(end.locator('h4 .badge')).toHaveText('competing claims');
  await expect(end.locator('input[type=radio]')).toHaveCount(4);
});

test('every state that has a record is drawn, however many hold at once, and a click on one opens its record', async ({ page }) => {
  // In 1300 CE six records draw land of their own. Three take the colours; the others are drawn among the states.
  const { drawn, rest } = drawnFirst(territoriesAt(buildFile<TerritoryFile>('territory.json'), 1300, {}), null, 3);
  expect(drawn.length).toBe(3);
  const khanate = 'people/polities/chagatai-khanate';
  expect(rest.map((a) => a.territory.subject)).toContain(khanate);
  const row = buildFile<PolitiesFile>('polities.json').rows.find((r) => r.name === 'Chagatai Khanate' && r.from <= 1300 && 1300 < r.to)!;
  expect(row.claimedBy).toContain(khanate);
  const [lon, lat] = row.at;
  await page.goto(`/?b=${latestBuild()}&t=1300&lat=${lat}&lon=${lon}&d=1.8&cl=0`);
  await idle(page);
  for (const a of drawn) await expect(page.locator(`.territory-label[data-entity="${a.territory.subject}"]`)).toHaveCount(1);
  await expect(page.locator(`.territory-label[data-entity="${khanate}"]`)).toHaveCount(0);
  // It is there among the states, as its row of the dataset, and a click on its land opens its record.
  expect(await page.evaluate(([x, y]) => window.__wikiworldmodel!.layers().polityAt(x, y), [lon, lat])).toBe('Chagatai Khanate');
  const box = (await page.locator('canvas.globe').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await idle(page);
  const panel = page.locator('.inspect');
  await expect(panel.locator('h2')).toHaveText('Chagatai Khanate');
  await expect(panel.locator('.here')).toContainText('the row named “Chagatai Khanate”');
  // Open, it takes a colour of its own, whatever its size, and another record goes among the states in its place.
  await expect(page.locator(`.territory-label[data-entity="${khanate}"]`)).toHaveCount(1);
  // Before the empire divided there was no such state, and the dataset's own rows are drawn.
  await page.evaluate(() => window.__wikiworldmodel!.set({ t: 1200, sel: null }));
  await idle(page);
  expect(await page.evaluate(([x, y]) => window.__wikiworldmodel!.layers().polityAt(x, y), [lon, lat])).not.toBe('Chagatai Khanate');
});
