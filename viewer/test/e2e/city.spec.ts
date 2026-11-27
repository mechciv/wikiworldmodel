// Pass criteria for the city: Rome is drawn by the living scene of where the camera is, its records among the
// settlement generator's houses (docs/plans/CITIES.md, decisions 1 and 10); a link lands in it and holds its view; the wheel
// comes down from the globe without a seam; what stands depends on the time shown; a click opens a monument's record, or
// says a house is the generator's; deep time lifts the camera off a ground that isn't there yet; and on a touch screen,
// two fingers turn, tilt and come nearer. The views it is drawn in are checked in city-views.spec.ts.
import { expect, test } from '@playwright/test';
import { canvasPng, idle, latestBuild, line, settledUrl, touch } from './helpers.ts';

// The city's passes are slow in software: a smaller picture, drawn the fast way (no shadows,
// occlusion, bloom or multisampling, coarse meshes only), keeps the behaviour tests short. The
// behaviour is the same either way.
const small = { viewport: { width: 640, height: 380 } };
// The lighter way to draw, and the visit's clock fixed, so that two loads of a link draw the same picture.
const FAST = 'quality=fast&clock=0';

const OVERVIEW = 't=315.5&lat=41.8915&lon=12.49&d=1.000235&h=302&v=66';

/** A view looking down at a structure, from `metres` above. */
const over = (lat: number, lon: number, metres: number, t = 315.5) => `t=${t}&lat=${lat}&lon=${lon}&d=${1 + metres / 6371000}&h=0&v=0`;

/** Whether a structure's label is showing. */
const labelled = (page: import('@playwright/test').Page, id: string) => page.evaluate((id) => {
  const el = document.querySelector<HTMLElement>(`.city-label[data-entity="${id}"]`);
  return !!el && el.style.display !== 'none';
}, id);

test.describe('in the city', () => {
  test.use(small);

  test('a link lands in Rome, drawn by the living scene with its records among its houses', async ({ page, context }) => {
    await page.goto(`/?b=${latestBuild()}&${OVERVIEW}&${FAST}`);
    await idle(page);
    const scene = (await page.evaluate(() => window.__wikiworldmodel!.scene()))!;
    expect(scene).not.toBeNull();
    // Rome among its houses, laid out by the settlement generator, and its records named over them: which of them
    // depends on the view, as a nearer name is placed first and none is drawn over another (the Colosseum's, here,
    // would lie on the Temple of Claudius's).
    expect(scene.people!.cities.map((c) => c.name)).toContain('Rome');
    const named = await page.locator('.city-label').evaluateAll((els) => els.filter((e) => (e as HTMLElement).style.display !== 'none').map((e) => (e as HTMLElement).dataset.entity ?? ''));
    expect(named.filter((id) => id.startsWith('rome/')).length).toBeGreaterThanOrEqual(3);
    // A step on the ground, an hour later: all of it stays in the link.
    await page.evaluate(() => window.__wikiworldmodel!.set({ hour: 11 }));
    await idle(page);
    const url = await settledUrl(page);
    expect(url).toContain('hour=11');
    expect(url).toContain(FAST);
    expect(url).toContain('h=302');
    expect(url).toContain('v=66');
    // Another load of the link is the same view. Not the same pixels: a city of a million passes the fast budget's cap
    // on what a living scene draws, and which of its far houses are drawn under the cap depends on how they were
    // streamed in, as for any living scene (life.spec.ts).
    const state = await page.evaluate(() => window.__wikiworldmodel!.state());
    const other = await context.newPage();
    await other.goto(url);
    await idle(other);
    expect(await other.evaluate(() => window.__wikiworldmodel!.state())).toEqual(state);
  });

  test('the wheel comes down from the globe into the city, and back', async ({ page }) => {
    await page.goto(`/?b=${latestBuild()}&t=315&lat=41.9&lon=12.49&d=1.4&${FAST}`);
    await idle(page);
    const height = async () => ((await page.evaluate(() => window.__wikiworldmodel!.state())).cam.dist - 1) * 6371;
    await page.mouse.move(320, 190);
    const heights: number[] = [await height()];
    for (let i = 0; i < 14; i++) {
      await page.mouse.wheel(0, -1000);
      await page.waitForTimeout(120);
      heights.push(await height());
    }
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeLessThanOrEqual(heights[i - 1] + 1e-6);
    const low = heights[heights.length - 1];
    expect(low).toBeLessThan(600);
    await idle(page);
    expect(await page.evaluate(() => window.__wikiworldmodel!.scene())).not.toBeNull();
    for (let i = 0; i < 14; i++) {
      await page.mouse.wheel(0, 1000);
      await page.waitForTimeout(60);
    }
    expect(await height()).toBeGreaterThan(low);
  });

  test('what stands depends on the time: Constantine’s arch is not there before it was built', async ({ page }) => {
    const arch = 'rome/arch-of-constantine';
    const at = over(41.88975, 12.4906, 90);
    await page.goto(`/?b=${latestBuild()}&${at}&${FAST}`);
    await idle(page);
    expect(await labelled(page, arch)).toBe(true);
    // A click where it stands opens it.
    const spot = (await page.evaluate((id) => window.__wikiworldmodel!.structureAt(id), arch))!;
    await page.mouse.click(spot.x, spot.y);
    await idle(page);
    expect((await page.evaluate(() => window.__wikiworldmodel!.state())).sel).toBe(arch);
    await expect(page.locator('.inspect h2')).toContainText('Arch of Constantine');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__wikiworldmodel!.set({ sel: null, t: 290 }));
    await idle(page);
    expect(await labelled(page, arch)).toBe(false);
    await page.mouse.click(spot.x, spot.y);
    await idle(page);
    expect((await page.evaluate(() => window.__wikiworldmodel!.state())).sel).not.toBe(arch);
  });

  test('a time with no ground lifts the camera off the place', async ({ page }) => {
    await page.goto(`/?b=${latestBuild()}&${OVERVIEW}&${FAST}`);
    await idle(page);
    // Before any scene of any place: a billion years ago there is no land the atlas knows of.
    await page.evaluate(() => window.__wikiworldmodel!.set({ t: Math.round(1950 - 1e9) }));
    await idle(page);
    const state = await page.evaluate(() => window.__wikiworldmodel!.state());
    expect((state.cam.dist - 1) * 6371).toBeGreaterThan(50);
    await expect(page.locator('.city-label:visible')).toHaveCount(0);
    // Coming back in time does not drop the camera back into the streets.
    await page.evaluate(() => window.__wikiworldmodel!.set({ t: 315.5 }));
    await idle(page);
    const back = await page.evaluate(() => window.__wikiworldmodel!.state());
    expect(back.cam.dist).toBe(state.cam.dist);
  });

  test('evidence mode tints what is generated apart from what is recorded', async ({ page }) => {
    await page.goto(`/?b=${latestBuild()}&${OVERVIEW}&${FAST}`);
    await idle(page);
    const plain = await canvasPng(page);
    await page.keyboard.press('e');
    await idle(page);
    expect((await canvasPng(page)).equals(plain)).toBe(false);
    await page.keyboard.press('e');
    await idle(page);
    expect((await canvasPng(page)).equals(plain)).toBe(true);
  });
});

// A living scene's panel takes much of a small window: these are looked at in a full one.
test.describe('in the city, in a full window', () => {
  test.use({ viewport: { width: 1280, height: 760 } });

  test('a click on an ordinary house says the generator placed it, and that nothing is known of it', async ({ page }) => {
    // The Subura, in the thick of the housing: look straight down, and try until a house is hit, clear of the scene's panel.
    await page.goto(`/?b=${latestBuild()}&${over(41.8957, 12.4955, 120)}&${FAST}`);
    await idle(page);
    const panel = page.locator('.inspect');
    let found = false;
    const spots: [number, number][] = [];
    for (let y = 160; y <= 460; y += 50) for (let x = 360; x <= 920; x += 40) spots.push([x, y]);
    for (const [x, y] of spots) {
      await page.mouse.click(x, y);
      await idle(page);
      if ((await panel.isVisible()) && /house/i.test((await panel.locator('.kind').textContent()) ?? '')) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    await expect(panel.locator('.badge.basis-procedural')).toBeVisible();
    await expect(panel).toContainText('nobody recorded this house');
    expect((await page.evaluate(() => window.__wikiworldmodel!.state())).sel).toBe(null);
  });

});

test.describe('names', () => {
  test.use(small);

  test('a street names what can be seen from it, and not what lies behind the buildings', async ({ page }) => {
    await page.goto(`/?b=${latestBuild()}&t=315.5&lat=41.89236&lon=12.48565&d=1.0000004&h=118&v=92&${FAST}`);
    await idle(page);
    expect(await labelled(page, 'rome/temple-of-antoninus-and-faustina')).toBe(true);
    expect(await labelled(page, 'rome/baths-of-trajan')).toBe(false);
    expect(await labelled(page, 'rome/colosseum')).toBe(false);
    // From above, it is named again.
    await page.goto(`/?b=${latestBuild()}&${over(41.8902, 12.4922, 400)}&${FAST}`);
    await idle(page);
    expect(await labelled(page, 'rome/colosseum')).toBe(true);
  });

  test('the wheel still zooms when the pointer is over a city label', async ({ page }) => {
    await page.goto(`/?b=${latestBuild()}&${over(41.8902, 12.4922, 400)}&${FAST}`);
    await idle(page);
    const label = page.locator('.city-label[data-entity="rome/colosseum"]');
    await expect(label).toBeVisible();
    const before = (await page.evaluate(() => window.__wikiworldmodel!.state())).cam;
    await label.hover();
    await page.mouse.wheel(0, -400);
    await idle(page);
    const after = (await page.evaluate(() => window.__wikiworldmodel!.state())).cam;
    expect(after.dist).toBeLessThan(before.dist);
    // Zooming over a label uses canvas coordinates, not the button's own offset, so the view stays over the Colosseum.
    expect(Math.abs(after.lat - before.lat)).toBeLessThan(0.0005);
    expect(Math.abs(after.lon - before.lon)).toBeLessThan(0.0005);
  });
});

test.describe('on a touch screen', () => {
  // A full window, which the living scene's panel leaves the middle of.
  test.use({ viewport: { width: 1280, height: 760 }, hasTouch: true });

  test('two fingers twist the view round, go up together to tilt it, and spread to come nearer', async ({ page }) => {
    // Each of the thirty touch events waits for the full window's city to be drawn once, about a second in software
    // on a laptop and several on CI's runner, where the test took 4.3 to 4.7 minutes in all.
    test.setTimeout(10 * 60_000);
    await page.goto(`/?b=${latestBuild()}&${OVERVIEW}&${FAST}`);
    await idle(page);
    const cam = async () => (await page.evaluate(() => window.__wikiworldmodel!.state())).cam;
    const c0 = await cam();
    // An eighth of a turn, clockwise on the screen, in the middle of the picture clear of the scene's panel: what is under the fingers turns with them, so
    // the view turns the other way.
    const round = (side: number) => Array.from({ length: 9 }, (_, i) => [640 + side * 50 * Math.cos((i / 8) * (Math.PI / 4)), 380 + side * 50 * Math.sin((i / 8) * (Math.PI / 4))] as [number, number]);
    await touch(page, [round(-1), round(1)]);
    const c1 = await cam();
    expect((((c0.heading! - c1.heading! + 540) % 360) - 180)).toBeCloseTo(45, 0);
    expect(c1.tilt).toBe(c0.tilt);
    // Both up together tilts it towards the horizon, and nothing else.
    await touch(page, [line([580, 430], [580, 350]), line([700, 430], [700, 350])]);
    const c2 = await cam();
    expect(c2.tilt!).toBeGreaterThan(c1.tilt! + 10);
    expect(c2.heading).toBe(c1.heading);
    expect(c2.dist).toBe(c1.dist);
    // Spread apart, they come nearer the ground.
    await touch(page, [line([620, 380], [540, 380]), line([660, 380], [740, 380])]);
    expect((await cam()).dist).toBeLessThan(c2.dist);
  });
});
