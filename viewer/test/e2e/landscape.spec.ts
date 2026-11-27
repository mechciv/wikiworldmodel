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
  test('Angkor keeps its dated centre, extent, and political context on the local map', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const id = 'people/first-cities/angkor';
    await page.goto(`/?b=${latestBuild()}&t=851&lat=13.318067&lon=104.0184444&d=1.0062041066&v=33.88&sel=${id}&${FAST}`);
    const pin = page.locator(`.site-map .site-pin[data-entity="${id}"]`);
    await expect(pin).toBeVisible({ timeout: 120_000 });
    await expect(pin).toContainText('Hariharalaya');
    const clusters = page.getByRole('checkbox', { name: 'Show reconstructed housing clusters' });
    await expect(clusters).toBeVisible();
    await expect(clusters).not.toBeChecked();
    const painted = () => page.locator('.site-map canvas').evaluate(el => {
      const canvas = el as HTMLCanvasElement;
      return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.some((v,i) => i % 4 === 3 && v > 0);
    });
    // The Khmer frontier is outside the saved view. Only the optional housing clusters paint this canvas.
    await expect.poll(painted).toBe(false);
    await clusters.check();
    await expect(page.locator('.cluster-legend')).toBeVisible();
    await expect.poll(painted).toBe(true);
    await clusters.uncheck();
    await expect(page.locator('.cluster-legend')).toBeHidden();
    await expect.poll(painted).toBe(false);
    const saved = await page.evaluate(() => window.__wikiworldmodel!.state().cam);
    expect(saved.lat).toBeCloseTo(13.318067, 5);
    expect(saved.lon).toBeCloseTo(104.0184444, 5);
    await page.getByRole('button', { name: 'Frame settlement', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__wikiworldmodel!.state().cam.dist), { timeout: 60000 }).toBeLessThan(saved.dist);
    await expect(pin).toHaveAttribute('title', /Inspect settlement/);
    await page.evaluate(() => window.__wikiworldmodel!.set({ t: 1200 }));
    await expect(pin).toContainText('Yasodharapura');
    await expect(pin).toHaveAttribute('title', /Frame settlement/);
    await pin.click();
    await expect(pin).toHaveAttribute('title', /Inspect settlement/);
    const country = page.getByRole('button', { name: 'Khmer Empire', exact: true });
    await country.click();
    await expect(page.locator('.inspect h2')).toContainText('Khmer Empire');
  });

  test('phone search frames the dated centre above the newly opened inspector', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/?b=${latestBuild()}&t=851&lat=10&lon=100&d=2.6&${FAST}`);
    await page.fill('.search input', 'Angkor');
    await page.locator('.search li').filter({ hasText: 'Angkor' }).first().click();
    await expect(page.locator('.inspect h2')).toHaveText('Angkor');
    const pin = page.locator('.site-map .site-pin[data-entity="people/first-cities/angkor"]');
    await expect(pin).toHaveAttribute('title', /Inspect settlement/);
    await expect(pin).toContainText('Hariharalaya');
    const panel = await page.locator('.inspect').boundingBox();
    const label = await pin.boundingBox();
    expect(label!.y + label!.height).toBeLessThan(panel!.y);
  });

  test('one Angkor label survives the descent and the return to the globe', async ({ page }) => {
    const id = 'people/first-cities/angkor';
    await page.goto(`/?b=${latestBuild()}&t=851&lat=13.335986&lon=103.974117&d=1.02&sel=${id}&${FAST}`);
    const label = page.locator(`.marker[data-entity="${id}"]:visible,.site-pin[data-entity="${id}"]:visible`);
    await expect(label).toHaveCount(1);
    for (const km of [79, 46, 44, 23, 21, 1, 81]) {
      await page.evaluate((k) => window.__wikiworldmodel!.set({ cam: { lat: 13.335986, lon: 103.974117, dist: 1 + k / 6371, tilt: 0 } }), km);
      await expect(label).toHaveCount(1);
      if (km === 1) await expect(page.locator(`.site-map .site-pin[data-entity="${id}"]`)).toBeVisible({ timeout: 120_000 });
    }
    await expect(page.locator(`.marker[data-entity="${id}"]`)).toBeVisible();
  });

  test('a local Roman frontier remains visible when crossing from inside to outside', async ({ page }) => {
    // Either side of the 120 CE row's segment (7.92,50.25)–(8.17,50.58), on the Taunus frontier.
    await page.goto(`/?b=${latestBuild()}&t=120&lat=50.415&lon=8.13&d=1.004&v=0&${FAST}`);
    const country = page.locator('.local-country');
    await expect(country).toContainText('Rome');
    const ground = page.locator('canvas.globe');
    const bounds = (await ground.boundingBox())!;
    await ground.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
    await expect(page.locator('.inspect')).toContainText('Generated ground');
    await country.click();
    await expect(page.locator('.inspect .here')).toContainText('Roman Empire');
    await page.evaluate(() => window.__wikiworldmodel!.set({ sel: null, cam: { lat: 50.415, lon: 7.96, dist: 1.004, tilt: 0 } }));
    await expect(page.locator('.site-map')).toBeVisible();
    await expect(country).toBeHidden();
    // The visible frontier is painted in its own map colour on the transparent overlay.
    const frontierPixel = () => page.locator('.site-map canvas').evaluate(el => {
      const canvas = el as HTMLCanvasElement;
      const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      for (let y = Math.round(canvas.height / 2); y < canvas.height - 80; y++) {
        for (let x = 12; x < canvas.width - 12; x++) {
          const i = 4 * (y * canvas.width + x);
          if (data[i + 2] > 230 && data[i + 2] > data[i] + 15 && data[i + 3] > 170) return { x, y };
        }
      }
      return null;
    });
    await expect.poll(frontierPixel).toBeTruthy();
    await ground.click({ position: (await frontierPixel())! });
    await expect(page.locator('.inspect .here')).toContainText('Roman Empire');
  });

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

    test("a city with a record is drawn from the record: its name of the time, its people by the model from its own figures, and streets", async ({ page }) => {
      // Tenochtitlan in 1519: the lists call the place Mexico City and give it 80,000; its record prefers 150,000-200,000.
      // Its people are the population model's (docs/plans/MODELS.md, the pilot), which reads the record's preferred
      // estimate as an observation with its work's bias, beside its ground and the lists' later figures: not the list's.
      await page.goto(`/?b=${latestBuild()}&${low(19.4326, -99.1332, 1519.5, 2500)}`);
      await idle(page);
      const p = (await scene(page))!.people!;
      const city = p.cities.find((c) => c.record === 'people/cities/tenochtitlan')!;
      expect(city).toBeTruthy();
      expect(city.name).toBe('Tenochtitlan');
      expect(city.from).toBe('record');
      // Within what the record's estimates for 1519 span, from the Anonymous Conqueror's 60,000 to Soustelle's 700,000.
      expect(city.people).toBeGreaterThan(60000);
      expect(city.people).toBeLessThan(700000);
      expect(city.people).not.toBe(80000);
      expect((await scene(page))!.water!.lakes.some(l => l.field === 'field:earth/texcoco-1519')).toBe(true);
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
      // The build hands the scene how its fields' crop is drawn: at full quality, close by, it stands as plants.
      expect(p.crops).toBe(true);
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

    test('the people of a village go about, and the herds of a camp feed and move on, by the visit\'s clock', async ({ page }) => {
      // The Nile's delta in 1500 BCE: the nearest of its villages, from low over its middle, where a person is tall
      // enough on the screen to be drawn. Some of those drawn go a way of their own.
      await page.goto(`/?b=${latestBuild()}&${low(30.8, 31.0, -1499, 900)}`);
      await idle(page);
      const near = (await scene(page))!.people!.near.find((s) => s.pattern === 'villages')!;
      expect(near).toBeTruthy();
      await page.goto(`/?b=${latestBuild()}&${low(near.lat, near.lon, -1499, 45)}`);
      await idle(page);
      const village = (await scene(page))!;
      expect(village.people!.houses).toBeGreaterThan(100);
      expect(village.going).toBeGreaterThan(0);
      // Herders of the steppe, among their herds.
      await page.goto(`/?b=${latestBuild()}&${low(47.2, 102.8, 1200, 80)}`);
      await idle(page);
      const camp = (await scene(page))!;
      expect(camp.people!.animals).toBeGreaterThan(20);
      expect(camp.going).toBeGreaterThan(2);
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
      // The ditch is laid round the village as one continuous perimeter (the settlement generator from version 7).
      expect(yangshao.perimeters).toContain('A ditch round a settlement');
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

  test.describe('descending on a high-density screen', () => {
    test.use({ viewport: { width: 640, height: 380 }, deviceScaleFactor: 2 });

    test('Tenochtitlan shows terrain before its houses and restores full resolution at rest', async ({ page }) => {
      await page.goto(`/?b=${latestBuild()}&${low(19.4326, -99.1332, 1500, 600000)}`);
      await idle(page);
      const result = await page.evaluate(async () => {
        const api = window.__wikiworldmodel!;
        const canvas = document.querySelector<HTMLCanvasElement>('canvas.globe')!;
        const bar = document.querySelector<HTMLElement>('.citybar')!;
        const native = canvas.width;
        let canvasResized = false;
        let smallest = native;
        let preview = false;
        api.set({ cam: { ...api.state().cam, dist: 1 + 2800 / 6371000 } });
        do {
          await new Promise(requestAnimationFrame);
          if (canvas.width !== native) canvasResized = true;
          const stats = api.cityStats();
          if (stats && stats.renderWidth > 0) smallest = Math.min(smallest, stats.renderWidth);
          if (!bar.hidden && api.scene()?.plan.actual === null) preview = true;
        } while (!api.scene()?.plan.actual || !api.idle());
        // Nudge the camera once inside the loaded local scene so interactive render scaling is
        // exercised even if initial scene loading took longer than the interactive settle window.
        api.set({ cam: { ...api.state().cam, dist: 1 + 2500 / 6371000 } });
        do {
          await new Promise(requestAnimationFrame);
          if (canvas.width !== native) canvasResized = true;
          const stats = api.cityStats();
          if (stats && stats.renderWidth > 0) smallest = Math.min(smallest, stats.renderWidth);
        } while (!api.idle());
        const stats = api.cityStats();
        return {
          native,
          smallest,
          preview,
          canvasResized,
          final: stats?.renderWidth ?? 0,
          targetAllocations: stats?.targetAllocations ?? 0,
          houses: api.scene()?.people?.houses ?? 0,
        };
      });
      expect(result.preview).toBe(true);
      expect(result.canvasResized).toBe(false);
      expect(result.smallest).toBeLessThan(result.native);
      expect(result.final).toBe(result.native);
      expect(result.targetAllocations).toBeLessThanOrEqual(2);
      expect(result.houses).toBeGreaterThan(0);
    });
  });
});
