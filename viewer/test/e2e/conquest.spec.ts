// A probe outside Europe (docs/slices/FIFTEENTH-SLICE.md), as the viewer shows it: Tenochtitlan from 1519 to 1521,
// dated by both sides in two calendars, told by both in two perspectives, each held by someone at a time; a town
// taken into a city that goes on as its part; and a state that fought on both sides of one war.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { idle, latestBuild } from './helpers.ts';

/** Open a view, and give its panel. */
async function open(page: Page, query: string): Promise<Locator> {
  await page.goto(`/?b=${latestBuild()}&${query}`);
  await idle(page);
  return page.locator('.inspect');
}

/** A group of claims of the record that is open, by its heading. */
const group = (panel: Locator, heading: RegExp) => panel.locator('.claim-group', { has: panel.page().locator('h4', { hasText: heading }) });
/** A relation of the record that is open, by how its line begins. */
const relation = (panel: Locator, begins: RegExp) => panel.locator('ul.relations > li', { hasText: begins });

test('a day named in cycles is shown beside the other side’s date, with the day it comes to, and is not a choice', async ({ page }) => {
  const panel = await open(page, 't=1521.62&lat=19.45&lon=-99.14&d=2.2&sel=people/conquest/fall-of-tenochtitlan');
  await expect(panel.locator('h2')).toHaveText('Fall of Tenochtitlan');
  const date = group(panel, /^Date/);
  await expect(date).toContainText('13 August 1521 CE');
  await expect(date).toContainText('1 Coatl in the year 3 Calli (13 August 1521 CE)');
  await expect(date.locator('.badge.beside')).toHaveText('named in cycles');
  // The two hold together; neither is picked over the other.
  await expect(date.locator('input[type=radio]')).toHaveCount(0);
  await expect(date.locator('h4 .badge')).toHaveCount(0);
  // How long after the fall each source was written: Cortés the next spring, Book 12 a generation later.
  await expect(date.locator('.cite', { hasText: 'Cortés, p. 409' }).first()).toContainText('(written 9 months after)');
  await expect(date.locator('.cite', { hasText: 'Sahagún' }).first()).toContainText('years after');
});

test('a native date that disagrees is kept, set aside, with the nearest day of its name', async ({ page }) => {
  const panel = await open(page, 't=1519.86&lat=19.43&lon=-99.13&d=2.2&sel=people/conquest/entry-into-tenochtitlan');
  const date = group(panel, /^Date/);
  await expect(date).toContainText('1 Ehecatl in the year 1 Acatl (none of the days the rest of the evidence allows; the nearest is 20 October 1519 CE)');
  await expect(date).toContainText('8 Ehecatl (none of the days the rest of the evidence allows; the nearest is 9 November 1519 CE)');
  await expect(date.locator('.claim.rank-deprecated')).toHaveCount(2);
  await expect(panel.locator('.when')).toContainText('8 November 1519 CE');
});

test('each side’s telling shows only in its own picture, with who held it and when', async ({ page }) => {
  const death = 't=1520.49&lat=19.43&lon=-99.13&d=2.2&sel=people/conquest/death-of-moctezuma';
  let panel = await open(page, death);
  const account = group(panel, /^Account/);
  await expect(account.locator('.claim')).toHaveCount(0);
  await expect(account).toContainText('2 more in');
  panel = await open(page, `${death}&alt=alt:conquest-accounts/mexica`);
  await expect(group(panel, /^Account/)).toContainText('Moctezuma and Itzquauhtzin, the governor of Tlatelolco, were found dead');
  await expect(panel.locator('.alt-held')).toContainText('In the alternative “As the Mexica told it”, held by Tlatelolco (1555 CE – 1565 CE)');
  panel = await open(page, `${death}&alt=alt:conquest-accounts/conquerors`);
  await expect(group(panel, /^Account/)).toContainText('they struck him with stones and an arrow');
  await expect(panel.locator('.alt-held')).toContainText('Hernán Cortés (30 October 1520 CE – 15 October 1524 CE)');
  await expect(panel.locator('.alt-held')).toContainText('Bernal Díaz del Castillo (1568 CE)');
  // The holder's own record says what it held.
  panel = await open(page, 't=1560&lat=19.45&lon=-99.14&d=2.2&sel=people/polities/tlatelolco');
  await expect(relation(panel, /^holds/)).toContainText('the perspective “As the Mexica told it” (1555 CE – 1565 CE)');
});

test('a town taken into a city goes on as a part of it, and its state as a subject', async ({ page }) => {
  let panel = await open(page, 't=1500&lat=19.45&lon=-99.14&d=2.2&sel=people/cities/tlatelolco');
  // The city is named by its name of today, Mexico City; at 1500 the map labels it Tenochtitlan.
  await expect(relation(panel, /^part of Mexico City/)).toContainText('(from Conquest of Tlatelolco)');
  await expect(relation(panel, /^arose from/)).toContainText('Denied by');
  await expect(panel.locator('.when')).toContainText('still exists');
  panel = await open(page, 't=1500&lat=19.45&lon=-99.14&d=2.2&sel=people/polities/tlatelolco');
  await expect(relation(panel, /^subject to Tenochtitlan/)).toContainText('(Conquest of Tlatelolco – Fall of Tenochtitlan)');
});

test('a state that changed sides takes part twice, each for its span', async ({ page }) => {
  const panel = await open(page, 't=1520&lat=19.4&lon=-98.8&d=2.6&sel=people/conquest/conquest-of-mexico');
  const tlaxcala = relation(panel, /^participant Tlaxcala/);
  await expect(tlaxcala).toHaveCount(2);
  await expect(tlaxcala.first()).toContainText('the start of War of the Spaniards with Tlaxcala');
  await expect(relation(panel, /^participant Texcoco/)).toContainText('(the start of Siege of Tenochtitlan – the end of Siege of Tenochtitlan)');
  await expect(panel).toContainText('has part Siege of Tenochtitlan');
});
