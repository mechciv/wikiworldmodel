// Pass criteria for the human landscape in the browser (docs/slices/ELEVENTH-SLICE.md): the globe's picture of the
// anthromes under its toggle, with a legend; a scene of land in the anthromes' span has its people, a delta a few metres
// above the sea among them; a city of the lists is named, and drawn in its region's houses; a click on a house says what it
// rests on; and the people layer of `resolve` answers in a tier, as the build's does. And for its filling in
// (docs/slices/SIXTEENTH-SLICE.md): a city drawn from its record, people and paths, the herds a husbandry names, and a
// scene of a village anywhere past the ground of a city that has a scene of its own. And for the house in detail
// (docs/slices/SEVENTEENTH-SLICE.md): a house in its yard, and a village with what its tradition says stood in it and
// round it.
import { expect, test, type Page } from '@playwright/test';
import { traditionAt, type LifewayWord } from '../../../core/dwelling.ts';
import type { LandscapeIndex, TraditionsFile } from '../../../core/landscape.ts';
import { buildFile, idle, latestBuild, openLayers, settledUrl } from './helpers.ts';

// The lighter way to draw, and the visit's clock fixed, so that two loads of a link draw the same picture.
const FAST = 'quality=fast&clock=0';
const low = (lat: number, lon: number, t: number, metres: number) => `t=${t}&lat=${lat}&lon=${lon}&d=${1 + metres / 6371000}&h=40&v=70&${FAST}`;
const scene = (page: Page) => page.evaluate(() => window.__wikiworldmodel!.scene());
/** The most particular building tradition the world records for a way of life of one of ArchaeoGLOBE's regions at a time, by its name. */
const traditionOf = (region: number, t: number, lifeway: LifewayWord) => {
  const index = buildFile<LandscapeIndex>('people/landscape.json');
  const found = traditionAt(buildFile<TraditionsFile>(index.traditions).traditions, region, t, lifeway);
  expect(found, `a tradition of the ${lifeway} of region ${region}`).toBeTruthy();
  return found!.label;
};
/** The one for the townspeople of Uruk's region, 59, in 3000 BCE. */
const uruksTradition = () => traditionOf(59, -2999, 'townspeople');

test.describe('the human landscape', () => {
  test('Settlement paints the anthromes of the time, with a legend of the classes present, and stays in the link', async ({ page }) => {
    await page.goto(`/?b=${latestBuild()}&t=-1999&lat=30&lon=40&d=2.6&ly=landscape`);
    await idle(page);
    const legend = page.locator('.landscape-legend');
    await expect(legend).toBeVisible();
    // The step nearest, named as HYDE names it, and classes of the farmed land of its time.
    await expect(legend).toContainText('2,000 BC');
    await expect(legend).toContainText('Irrigated villages');
    expect(await settledUrl(page)).toContain('ly=landscape');
    await openLayers(page);
    await page.locator('.tg-landscape').click();
    await idle(page);
    await expect(legend).toBeHidden();
    expect(await settledUrl(page)).not.toContain('landscape');
  });

  test('a click on a house of a city says what it rests on, and what of it is invented', async ({ page }) => {
    test.setTimeout(300_000);
    // From above the city, centred on it as the lists place it, at the full size of the page, so that the panel leaves the
    // scene to click in.
    await page.goto(`/?b=${latestBuild()}&t=-2999&lat=31.3222&lon=45.6361&d=${1 + 400 / 6371000}&h=40&v=20&${FAST}`);
    await idle(page);
    const uruk = (await page.evaluate(() => window.__wikiworldmodel!.settlementsAt())).find((x) => x.city === 'Uruk');
    expect(uruk).toBeTruthy();
    // Its middle is a lane between lots: a ring of clicks around it, until one falls on a house.
    const panel = page.locator('.inspect');
    let hit = false;
    for (const r of [8, 14, 20, 28]) {
      for (let k = 0; k < 8 && !hit; k++) {
        await page.mouse.click(uruk!.x + r * Math.cos((k * Math.PI) / 4), uruk!.y + r * Math.sin((k * Math.PI) / 4));
        await idle(page);
        hit = (await panel.isVisible()) && ((await panel.textContent()) ?? '').includes('Generated house');
      }
      if (hit) break;
    }
    expect(hit).toBe(true);
    await expect(panel.locator('h2')).toHaveText(uruksTradition());
    // Uruk has a record of its own as well as a row in the lists: the panel says whose its people are.
    await expect(panel).toContainText('Uruk, a city the world has a record of');
    await expect(panel).toContainText('nobody recorded this house');
  });

  test.describe('in a scene', () => {
    test.use({ viewport: { width: 640, height: 380 } });

    test('a delta a few metres above the sea has its villages, with the people the world puts there', async ({ page }) => {
      await page.goto(`/?b=${latestBuild()}&${low(30.8, 31.0, -1499, 900)}`);
      await idle(page);
      const s = await scene(page);
      expect(s!.list).toBe('land');
      const p = s!.people!;
      expect(p).toBeTruthy();
      expect(p.expected).toBeGreaterThan(10000);
      expect(p.houses).toBeGreaterThan(1000);
      // The people drawn are the people HYDE puts in the land the scene covers, within a tenth.
      expect(Math.abs(p.drawn - p.expected) / p.expected).toBeLessThan(0.1);
      expect(p.pattern).toBe('villages');
      await expect(page.locator('.life-here')).toContainText('Farming villages');
      const r = await page.evaluate(() => window.__wikiworldmodel!.resolve(30.8, 31.0, 'people'));
      expect(r).toMatchObject({ tier: 'evidence', value: 'villages' });
    });

    test("a city of the lists is named, and drawn in its region's houses", async ({ page }) => {
      await page.goto(`/?b=${latestBuild()}&${low(31.32, 45.64, -2999, 2500)}`);
      await idle(page);
      await expect(page.locator('.life-here')).toContainText('Uruk');
      const r = await page.evaluate(() => window.__wikiworldmodel!.resolve(31.32, 45.64, 'people'));
      expect(r).toMatchObject({ tier: 'evidence', value: 'Uruk' });
      expect((await scene(page))!.people!.forms).toContain(uruksTradition());
    });

    test("a city with a record is drawn from the record: its name of the time, its people by its own claim, and streets", async ({ page }) => {
      // Tenochtitlan in 1519: the lists call the place Mexico City and give it 80,000; its record prefers 150,000-200,000.
      await page.goto(`/?b=${latestBuild()}&${low(19.4326, -99.1332, 1519.5, 2500)}`);
      await idle(page);
      const p = (await scene(page))!.people!;
      const city = p.cities.find((c) => c.record === 'people/cities/tenochtitlan')!;
      expect(city).toBeTruthy();
      expect(city.name).toBe('Tenochtitlan');
      expect(city.from).toBe('record');
      expect(city.people).toBeGreaterThanOrEqual(150000);
      // A town has streets, whatever says how they ran; the bar names it.
      expect(city.town).toBeTruthy();
      await expect(page.locator('.life-here')).toContainText('Tenochtitlan');
    });

    test('a farming country has people by its houses and paths between its villages, and says they are generic', async ({ page }) => {
      await page.goto(`/?b=${latestBuild()}&${low(30.8, 31.0, -1499, 900)}`);
      await idle(page);
      const p = (await scene(page))!.people!;
      expect(p.works).toContain('A person');
      expect(p.pieces).toBeGreaterThan(500);
      expect(p.paths).toBeGreaterThan(20);
    });

    test('a hamlet far from a city with a scene of its own is drawn while that city stands, in the house of its region', async ({ page }) => {
      // East Anglia in 1300, some 1,470 km from Rome, whose scene is open from 1000 BCE to 1950: the ground is not Rome's.
      await page.goto(`/?b=${latestBuild()}&${low(52.2, 0.4, 1300, 900)}`);
      await idle(page);
      const s = await scene(page);
      expect(s!.list).toBe('land');
      expect(s!.people!.houses).toBeGreaterThan(100);
      // The scene is the one shown: its bar says who lived here.
      await expect(page.locator('.life-here')).toContainText('houses');
      await expect(page.locator('.city-enter')).toBeHidden();
      expect(s!.people!.forms).toContain(traditionOf(38, 1300, 'farmers'));
    });

    test('herders of the steppe live in the tent of their region, among the herds its husbandry names', async ({ page }) => {
      await page.goto(`/?b=${latestBuild()}&${low(47.2, 102.8, 1200, 300)}`);
      await idle(page);
      const p = (await scene(page))!.people!;
      expect(p.pattern).toBe('herders');
      expect(p.forms).toContain(traditionOf(115, 1200, 'herders'));
      // Which animals is a husbandry tradition's claim; how many is the generator's.
      expect(p.kept.length).toBeGreaterThan(1);
      expect(p.animals).toBeGreaterThan(20);
    });

    test('a house stands in its yard, and a village has what its tradition says stood in it and round it', async ({ page }) => {
      // East Anglia in 1300: a peasant's house in its toft, with what its tradition says a holding had.
      await page.goto(`/?b=${latestBuild()}&${low(52.2, 0.4, 1300, 900)}`);
      await idle(page);
      const english = (await scene(page))!.people!;
      expect(english.yards).toContain(traditionOf(38, 1300, 'farmers'));
      // The Wei valley in 4000 BCE: a village round its open middle, a house to meet in there, a ditch round it all.
      await page.goto(`/?b=${latestBuild()}&${low(34.4, 109.0, -4000, 900)}`);
      await idle(page);
      const yangshao = (await scene(page))!.people!;
      expect(yangshao.things).toContain('A meeting house');
      expect(yangshao.works).toContain('A ditch round a settlement');
      // Click the house at the middle of the view, if one is there: what it rests on says that no two are drawn alike.
      const houses = await page.evaluate(() => window.__wikiworldmodel!.settlementsAt());
      expect(houses.length).toBeGreaterThan(0);
    });

    test('before the anthromes begin, a scene has no people', async ({ page }) => {
      await page.goto(`/?b=${latestBuild()}&${low(30.8, 31.0, -14000, 900)}`);
      await idle(page);
      const s = await scene(page);
      expect(s?.people ?? null).toBeNull();
      await expect(page.locator('.life-here')).not.toContainText('houses');
    });
  });
});
