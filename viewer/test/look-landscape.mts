// A look at the human landscape in a browser, for a person or an agent to see what it draws: the globe with the
// anthromes on, and scenes of a few places from low down. Not a test: it writes PNGs for looking at.
//   npm run build:viewer
//   npx tsx viewer/test/look-landscape.mts <out dir> [name …]
// It serves the built viewer itself, on a port of its own, so that it never looks at another checkout's. LOOK_GPU=1
// draws on the machine's GPU (Metal), which is much faster and looks as a visitor sees it; without it, software WebGL,
// as the browser tests draw. Each line it prints says what the frame drew, and on a GPU how long the viewer's profiler
// timed a frame at: a rough figure, good for telling one scene from another in one run and no more.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { parse } from 'yaml';

const out = process.argv[2] ?? 'dist/look';
const only = new Set(process.argv.slice(3));
mkdirSync(out, { recursive: true });
const build = JSON.parse(readFileSync('dist/builds/index.json', 'utf8')).latest as string;
const port = Number(process.env.LOOK_PORT ?? 4391);
const server = await preview({ configFile: 'viewer/vite.config.ts', preview: { port, strictPort: true } });
const base = `http://localhost:${port}/`;
const R = 6371000;

const gpu = !!process.env.LOOK_GPU;
const browser = await chromium.launch({ args: gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console:', m.text().slice(0, 400));
});
page.on('pageerror', (e) => console.log('page error:', e.message.slice(0, 400)));
// A build carries the settlement generator's parameters as they were when it was built. LOOK_PARAMS=1 hands the scenes
// the record's parameters as they are now, so that a change to them can be looked at without building the world again.
// What it shows is then not what the build's visitors see: build before trusting it.
if (process.env.LOOK_PARAMS) {
  const record = parse(readFileSync('world/generators/people/settlement.yaml', 'utf8')) as { version: number; params: Record<string, unknown> };
  await page.route('**/people/landscape.json', async (route) => {
    const response = await route.fetch();
    const index = (await response.json()) as { generator?: { version: number; params: Record<string, unknown> } };
    if (index.generator) index.generator = { ...index.generator, version: record.version, params: record.params };
    await route.fulfill({ response, json: index });
  });
}
/**
 * Wait until the viewer says it has loaded and drawn what the view needs, as the browser tests do
 * (viewer/test/e2e/helpers.ts). A scene held still goes on refining its picture for minutes: once that is all it waits
 * on, a little longer is enough to look at it.
 */
const idle = async (ms: number) => {
  const t0 = Date.now();
  for (;;) {
    const waiting = await page.evaluate(() => (window.__wikiworldmodel?.idle() ? [] : (window.__wikiworldmodel?.waiting() ?? ['the page']))).catch(() => ['the page']);
    if (!waiting.length) break;
    if (waiting.every((w) => w === 'refining')) {
      await page.waitForTimeout(gpu ? 12_000 : 30_000);
      break;
    }
    if (Date.now() - t0 > ms) {
      console.log(`  not idle after ${ms / 1000} s: still waiting on ${waiting.join(', ')}`);
      break;
    }
    await page.waitForTimeout(500);
  }
  return Date.now() - t0;
};
const shot = async (name: string, url: string, wait: number) => {
  if (only.size && !only.has(name)) return;
  await page.goto(`${base}${url}`);
  const took = await idle(wait);
  await page.screenshot({ path: join(out, `${name}.png`), timeout: 180_000 });
  const bar = await page.locator('.life-here').first().textContent({ timeout: 1000 }).catch(() => null);
  const people = await page.evaluate(() => window.__wikiworldmodel?.scene()?.people ?? null);
  // What the frame cost: how many things it drew, of how many triangles, from how many meshes.
  const cost = await page.evaluate(() => {
    const s = window.__wikiworldmodel?.scene();
    return s ? `${s.instances.toLocaleString('en-US')} drawn, ${s.triangles.toLocaleString('en-US')} triangles, ${s.meshes} meshes` : '';
  });
  // And how long a frame took, where the browser draws on a GPU and can time one.
  const frame = gpu
    ? await page
        .evaluate(() => window.__wikiworldmodel?.profile(30))
        .then((p) => (p ? `${p.total.toFixed(2)} ms a frame (${p.method})` : ''))
        .catch(() => '')
    : '';
  console.log(name, `(${(took / 1000).toFixed(1)} s)`, cost ? `| ${cost}` : '', frame ? `| ${frame}` : '', bar ? `| bar: ${bar}` : '', people ? `| people: ${JSON.stringify(people)}` : '');
};

// The globe, with Settlement on, at three times.
for (const [name, t, lat, lon] of [['globe-2000bce', -1999, 30, 40], ['globe-1ce', 1, 35, 60], ['globe-1500', 1500, 25, 90]] as [string, number, number, number][]) {
  await shot(name, `?b=${build}&t=${t}&lat=${lat}&lon=${lon}&d=2.6&ly=landscape&cl=0`, 120_000);
}
// The coverage page: whose houses rest on a tradition.
if (!only.size || only.has('coverage')) {
  await page.goto(`${base}coverage.html?b=${build}`);
  await page.locator('.cov-houses table').waitFor({ timeout: 60_000 }).catch(() => console.log('  the coverage page has no table of houses'));
  await page.locator('.cov-houses').screenshot({ path: join(out, 'coverage.png') }).catch(() => undefined);
  console.log('coverage');
}
// Scenes, from a few hundred metres up: [name, time, latitude, longitude, metres up, heading, tilt].
const quality = gpu ? '' : '&quality=fast';
for (const [name, t, lat, lon, m, h, v] of [
  ['scene-nile-1500bce', -1499, 30.8, 31.0, 900, 40, 70],
  // Villages close by: people at the houses, paths between them, what animals a husbandry tradition names.
  ['scene-nile-close', -1499, 30.8, 31.0, 160, 40, 78],
  ['scene-uruk-3000bce', -2999, 31.32, 45.64, 2500, 40, 70],
  ['scene-yangtze-1500', 1500, 30.5, 114.3, 900, 40, 70],
  // Closer, from the south-west of Uruk, looking towards it.
  ['scene-uruk-close', -2999, 31.307, 45.628, 450, 40, 70],
  // A city with a record: Tenochtitlan in 1519, from above and from low down among its houses.
  ['scene-tenochtitlan-1519', 1519.5, 19.4326, -99.1332, 2800, 20, 60],
  ['scene-tenochtitlan-close', 1519.5, 19.4326, -99.1332, 260, 20, 76],
  // A city of the lists in a region whose townspeople's tradition says how towns were laid out: Pataliputra in 1 CE,
  // from the side, from above, and from low down outside its wall.
  ['scene-pataliputra-1ce', 1, 25.61, 85.14, 1800, 30, 62],
  ['scene-pataliputra-above', 1, 25.61, 85.14, 5200, 0, 8],
  ['scene-pataliputra-wall', 1, 25.5955, 85.14, 150, 0, 80],
  // Villages from above, low enough for the paths between them and the people at their houses.
  ['scene-nile-above', -1499, 30.8, 31.0, 1400, 0, 10],
  ['scene-nile-village', -1499, 30.803, 31.003, 60, 30, 74],
  // Herders on the steppe, and their herds where a husbandry tradition names them.
  ['scene-mongolia-1200', 1200, 47.2, 102.8, 300, 60, 76],
  // Mohenjo-daro in 2400 BCE: a recorded city, its ground UNESCO's.
  ['scene-mohenjo-daro', -2399, 27.3254, 68.1377, 1400, 30, 62],
] as [string, number, number, number, number, number, number][]) {
  await shot(name, `?b=${build}&t=${t}&lat=${lat}&lon=${lon}&d=${1 + m / R}&h=${h}&v=${v}&cl=0${quality}`, 300_000);
}
// Close to a settlement of a scene, by where the scene says its nearest ones are: the houses, the people by them, what
// animals a husbandry names, and the edge of a town with its wall. [name, time, latitude, longitude, which of the nearest].
// Each is looked at twice: from the ground a little way off (`close-…`), and from over it (`over-…`), where how its
// houses stand together shows, and what stands round them.
const places: [string, number, number, number, number | 'city'][] = [
  ['nile-village', -1499, 30.8, 31.0, 0],
  ['mongolia-camp', 1200, 47.2, 102.8, 0],
  ['pataliputra-edge', 1, 25.61, 85.14, 0],
  ['europe-village', 1300, 52.2, 0.4, 0],
  // Houses of traditions that say more of them: a yard and what stood in it, a ring, an enclosure, a way they all faced.
  ['bengal-village', 1800, 24.5, 88.5, 0],
  ['hindustan-village', 1600, 26.8, 80.9, 0],
  ['north-china-village', 1850, 36.6, 115.5, 0],
  ['yangshao-village', -4000, 34.4, 109.0, 0],
  ['edo-village', 1750, 35.6, 138.6, 0],
  ['maasai-kraal', 1885, -2.6, 36.6, 0],
  ['bedouin-camp', 1830, 34.6, 38.3, 0],
  ['plains-camp', 1800, 50.5, -105.5, 0],
  ['iroquois-village', 1500, 43.0, -76.5, 0],
  ['pueblo', 1280, 36.06, -107.96, 0],
  ['inuit-camp', 1830, 69.4, -81.8, 0],
  ['iban-longhouse', 1850, 1.6, 111.6, 0],
  // A city's wall, gates and towers, and the water in its streets, from just outside it: the nearest settlement that is one.
  ['uruk-wall', -2999, 31.3222, 45.6361, 'city'],
  ['tenochtitlan-canals', 1519.5, 19.4326, -99.1332, 'city'],
  ['pataliputra-wall', 1, 25.61, 85.14, 'city'],
];
for (const [place, t, lat, lon, which] of places) {
  const name = `close-${place}`;
  const over = `over-${place}`;
  if (only.size && !only.has(name) && !only.has(over)) continue;
  await page.goto(`${base}?b=${build}&t=${t}&lat=${lat}&lon=${lon}&d=${1 + 900 / R}&h=40&v=70&cl=0${quality}`);
  await idle(300_000);
  const near = await page.evaluate(() => window.__wikiworldmodel?.scene()?.people?.near ?? []);
  // A village is looked for among the settlements that are no town, where there is one.
  const s = which === 'city' ? near.find((x) => x.city) : (near.filter((x) => x.pattern !== 'towns' && x.pattern !== 'city')[which] ?? near[which]);
  if (!s) {
    console.log(name, 'has no settlement near');
    continue;
  }
  // A town from just outside the reach of its houses, looking north across it; a village from before the door of one
  // of its houses, a little to one side, as someone walking up to it sees it.
  const town = s.pattern === 'city' || s.pattern === 'towns';
  if (town || !s.house) {
    const back = town ? (s.r + 70) / 111195 : 0.00045;
    const up = town ? 24 : 9;
    await shot(name, `?b=${build}&t=${t}&lat=${s.lat - back}&lon=${s.lon}&d=${1 + up / R}&h=0&v=${town ? 76 : 80}&cl=0${quality}`, 300_000);
  } else await shot(name, `?b=${build}&t=${t}&lat=${s.house.lat}&lon=${s.house.lon}&d=${1 + 17 / R}&h=${(s.house.faces + 180 + 28) % 360}&v=79&cl=0${quality}`, 300_000);
  // From over it, looking down at its middle from the south: as far off as shows all of a village, or a quarter of a town.
  const off = town ? 220 : Math.max(60, Math.min(190, s.r * 2.4));
  await shot(over, `?b=${build}&t=${t}&lat=${s.lat}&lon=${s.lon}&d=${1 + off / R}&h=0&v=52&cl=0${quality}`, 300_000);
}
await browser.close();
await new Promise<void>((done) => server.httpServer.close(() => done()));
