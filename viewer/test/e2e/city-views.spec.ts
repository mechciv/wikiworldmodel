// The city as drawn at full quality, against goldens: shadows, occlusion, bloom and fine meshes.
// In software each view takes minutes, so these run with the other browser tests in nightly.yml,
// nightly and on demand.
import { expect, test } from '@playwright/test';
import type { Tileset } from '../../../core/tileset.ts';
import { buildFile, canvasPng, idle, latestBuild } from './helpers.ts';

const OVERVIEW = 't=315.5&lat=41.8915&lon=12.49&d=1.000235&h=302&v=66&clock=0';
const COLOSSEUM = 't=315.5&lat=41.8902&lon=12.4922&d=1.000029&h=130&v=72&clock=0';
const FORUM = 't=315.5&lat=41.89185&lon=12.48665&d=1.00004&h=300&v=72&clock=0';
const PANTHEON = 't=315.5&lat=41.8990&lon=12.4768&d=1.000011&h=178&v=88&clock=0';
const SUNSET = 't=315.5&lat=41.8915&lon=12.49&d=1.00012&h=280&v=72&hour=18.2&clock=0';

test.setTimeout(15 * 60_000);

test.describe('the still', () => {
  // Small, as a still is drawn at twice the size and averaged over many frames, which takes long in software.
  test.use({ viewport: { width: 320, height: 200 } });
  test('a still of a scene can be made again from its link, to the pixel', async ({ page, context }) => {
    test.setTimeout(40 * 60_000);
    const s = buildFile<Tileset>('tileset.json').sites!.find((x) => x.kind === 'life')!;
    const RAD = Math.PI / 180;
    const lat = s.origin.lat + s.view.y / 6371000 / RAD;
    const lon = s.origin.lon + s.view.x / (6371000 * Math.cos(s.origin.lat * RAD)) / RAD;
    const link = `/?b=${latestBuild()}&t=${s.slice}&lat=${lat}&lon=${lon}&d=${1 + s.view.range / 6371000}&h=${s.view.heading}&v=${s.view.tilt}&clock=0&still=1`;
    await page.goto(link);
    await idle(page);
    const first = await canvasPng(page);
    const other = await context.newPage();
    await other.goto(link);
    await idle(other);
    expect(await canvasPng(other)).toMatchSnapshot('still-hell-creek.png', { maxDiffPixelRatio: 0.002 });
    expect(first).toMatchSnapshot('still-hell-creek.png', { maxDiffPixelRatio: 0.002 });
  });
});

test.describe('views', () => {
  for (const v of [
    { name: 'rome-overview', query: OVERVIEW },
    { name: 'rome-colosseum', query: COLOSSEUM },
    { name: 'rome-forum', query: FORUM },
    { name: 'rome-pantheon', query: PANTHEON },
    { name: 'rome-sunset', query: `${SUNSET}` },
  ]) {
    test(`renders ${v.name} as before`, async ({ page }) => {
      await page.goto(`/?b=${latestBuild()}&${v.query}`);
      await idle(page);
      expect(await canvasPng(page)).toMatchSnapshot(`${v.name}.png`, { maxDiffPixelRatio: 0.002 });
    });
  }
});
