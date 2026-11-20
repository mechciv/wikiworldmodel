// The look book (docs/plans/RENDERING.md, step 0): a fixed set of views of the local scene, each a place, a time and a
// camera, shot in a browser and measured, so that a change to the renderer or to the generators' meshes can be judged
// on the same pictures, before and after, side by side, with what each frame cost.
//
//   npm run build:viewer && npm run serve &
//   npx tsx tools/look/look.ts shoot <out dir> [--views tools/look/views.yaml] [--only a,b] [--url http://localhost:4173/]
//                                  [--angle metal|swiftshader|…] [--frames 20] [--width 1600 --height 900] [--build <id>]
//   npx tsx tools/look/look.ts sheet <before dir> [<after dir>] --out <dir>
//
// `shoot` draws each view at full quality unless the view says otherwise, waits until the viewer has drawn all it
// needs, saves the canvas as <out>/<view>.png, measures each pass of the frame over --frames frames drawn again, and
// writes the timings, the GPU and the build to <out>/look.json. The build is the latest in dist/builds unless --build
// names another, so that a viewer from before a change can be shot on the world it was built with. The GPU is the machine's (ANGLE's Metal backend on a
// Mac) unless --angle says otherwise; --angle swiftshader draws in software, as the browser tests do, which is slow
// and says nothing of frame time on a GPU.
//
// `sheet` lays the views of one shoot, or of two side by side, on a page, <out>/sheet.html, with each frame's time,
// and draws the page as <out>/sheet.png, small enough to put in a pull request.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import type { FrameProfile } from '../../viewer/src/gl/timer.ts';
import { BUDGET, readViews } from './views.ts';

const REPO = join(import.meta.dirname, '../..');
const BUILDS = join(REPO, 'dist/builds');

/** What a shoot recorded. */
export interface Shoot {
  build: string;
  when: string;
  /** the renderer, as WEBGL_debug_renderer_info names it */
  gpu: string;
  angle: string;
  width: number;
  height: number;
  views: { name: string; what: string; link: string; png: string; settleMs: number; profile: FrameProfile | null; instances: number | null; triangles: number | null }[];
}

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const latestBuild = (): string => JSON.parse(readFileSync(join(BUILDS, 'index.json'), 'utf8')).latest;

/** Wait until the viewer has loaded and drawn what the view needs, twice in a row, as the browser tests do. */
async function idle(page: Page, ms: number): Promise<number> {
  const t0 = Date.now();
  for (let k = 0; k < 2; k++) {
    try {
      await page.waitForFunction(() => window.__wikiworldmodel?.idle(), null, { polling: 200, timeout: ms });
    } catch {
      const waiting = await page.evaluate(() => window.__wikiworldmodel?.waiting() ?? ['the page']).catch(() => ['the page']);
      console.warn(`  not settled after ${Math.round(ms / 1000)} s: still waiting on ${waiting.join(', ')}`);
    }
    await page.waitForTimeout(400);
  }
  return Date.now() - t0;
}

async function canvasPng(page: Page): Promise<Buffer> {
  const url = await page.evaluate(() => (document.querySelector('canvas.globe') as HTMLCanvasElement).toDataURL('image/png'));
  return Buffer.from(url.split(',')[1], 'base64');
}

async function shoot(out: string): Promise<void> {
  const file = readViews(option('views') ?? join(REPO, 'tools/look/views.yaml'));
  const only = option('only')?.split(',');
  const views = only ? file.views.filter((v) => only.includes(v.name)) : file.views;
  if (!views.length) throw new Error(`no view is named ${only?.join(', ')}`);
  const url = option('url') ?? 'http://localhost:4173/';
  const angle = option('angle') ?? (process.platform === 'darwin' ? 'metal' : 'swiftshader');
  const width = Number(option('width') ?? BUDGET.width);
  const height = Number(option('height') ?? BUDGET.height);
  const frames = Number(option('frames') ?? 20);
  const wait = Number(option('wait') ?? (angle === 'swiftshader' ? 900 : 180)) * 1000;
  const build = option('build') ?? latestBuild();
  mkdirSync(out, { recursive: true });
  const args = [`--use-angle=${angle}`, '--ignore-gpu-blocklist', '--enable-webgl'];
  if (angle === 'swiftshader') args.push('--enable-unsafe-swiftshader');
  else args.push('--enable-gpu');
  const browser = await chromium.launch({ args });
  const record: Shoot = { build, when: new Date().toISOString(), gpu: '', angle, width, height, views: [] };
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.on('console', (m) => m.type() === 'error' && console.error(`  [page] ${m.text().slice(0, 300)}`));
    page.on('pageerror', (e) => console.error(`  [page] ${e.message.slice(0, 300)}`));
    for (const v of views) {
      const t0 = Date.now();
      await page.goto(`${url}?b=${build}&${v.link}`);
      const settleMs = await idle(page, wait);
      if (!record.gpu) {
        record.gpu = await page.evaluate(() => {
          const gl = (document.querySelector('canvas.globe') as HTMLCanvasElement).getContext('webgl2');
          const info = gl?.getExtension('WEBGL_debug_renderer_info');
          return gl ? String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'none';
        });
        console.log(`GPU: ${record.gpu}`);
      }
      const png = `${v.name}.png`;
      writeFileSync(join(out, png), await canvasPng(page));
      // A viewer from before frame timing was added has no profile to give.
      const profile = frames > 0 ? await page.evaluate((n) => ('profile' in window.__wikiworldmodel! ? window.__wikiworldmodel!.profile(n) : null), frames) : null;
      const scene = await page.evaluate(() => window.__wikiworldmodel!.scene());
      record.views.push({ name: v.name, what: v.what, link: v.link, png, settleMs, profile, instances: scene?.instances ?? null, triangles: scene?.triangles ?? null });
      const ms = profile ? `${profile.total.toFixed(1)} ms a frame (${profile.method}, ${profile.frames} frames)` : 'no local scene';
      console.log(`${v.name}: settled in ${(settleMs / 1000).toFixed(1)} s, ${ms}, ${((Date.now() - t0) / 1000).toFixed(0)} s in all`);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(join(out, 'look.json'), `${JSON.stringify(record, null, 1)}\n`);
  const over = record.views.filter((v) => v.profile && v.profile.method === 'gpu' && v.profile.total > BUDGET.ms);
  if (over.length) console.log(`Over the budget of ${BUDGET.ms} ms: ${over.map((v) => `${v.name} ${v.profile!.total.toFixed(1)} ms`).join(', ')}`);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A frame's passes as a line of text, the dearest first. */
function passes(p: FrameProfile | null): string {
  if (!p) return 'no local scene';
  const list = Object.entries(p.passes)
    .filter(([, ms]) => ms >= 0.05)
    .sort((a, b) => b[1] - a[1])
    .map(([n, ms]) => `${n} ${ms.toFixed(1)}`);
  return `${p.total.toFixed(1)} ms (${p.method}): ${list.join(', ')}`;
}

async function sheet(dirs: string[], out: string): Promise<void> {
  mkdirSync(out, { recursive: true });
  const shoots = dirs.map((d) => ({ dir: resolve(d), look: JSON.parse(readFileSync(join(d, 'look.json'), 'utf8')) as Shoot }));
  const names = [...new Set(shoots.flatMap((s) => s.look.views.map((v) => v.name)))];
  // The pictures are copied beside the page, so that it and they can be moved together.
  const img = (s: (typeof shoots)[number], k: number, png: string): string => {
    const name = `${k}-${basename(png)}`;
    copyFileSync(join(s.dir, png), join(out, name));
    return name;
  };
  const heads = shoots.map((s, k) => `<th>${shoots.length > 1 ? (k === 0 ? 'Before' : 'After') : 'Shot'}<br><small>${esc(basename(s.dir))} · build ${esc(s.look.build)} · ${esc(s.look.gpu)} · ${s.look.width}×${s.look.height}</small></th>`);
  const rows = names.map((n) => {
    const cells = shoots.map((s, k) => {
      const v = s.look.views.find((x) => x.name === n);
      if (!v || !existsSync(join(s.dir, v.png))) return '<td class="none">not shot</td>';
      const over = v.profile && v.profile.method === 'gpu' && v.profile.total > BUDGET.ms ? ' over' : '';
      return `<td><img src="${img(s, k, v.png)}" alt="${esc(n)}"><div class="ms${over}">${esc(passes(v.profile))}</div></td>`;
    });
    const v = shoots.map((s) => s.look.views.find((x) => x.name === n)).find(Boolean)!;
    return `<tr><td class="what"><b>${esc(n)}</b><br>${esc(v.what)}<br><code>${esc(v.link)}</code></td>${cells.join('')}</tr>`;
  });
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Look book</title>
<style>
body { margin: 0; padding: 16px; font: 13px/1.4 system-ui, sans-serif; background: #f4f2ee; color: #1d1b18; }
table { border-collapse: collapse; }
th, td { padding: 6px; vertical-align: top; text-align: left; }
th { font-weight: 600; }
th small, .ms { font-weight: 400; color: #5b5750; }
td.what { width: 200px; }
td.what code { font-size: 10px; word-break: break-all; color: #5b5750; }
img { display: block; width: 640px; height: auto; }
.ms { font-size: 11px; max-width: 640px; }
.over { color: #a3261c; }
.none { color: #8d877c; width: 640px; }
</style></head>
<body><table><tr><th>View</th>${heads.join('')}</tr>
${rows.join('\n')}
</table><p>Frame time is the median over the frames measured; the budget is ${BUDGET.ms} ms at ${BUDGET.width}×${BUDGET.height} on a GPU (docs/plans/RENDERING.md, step 0). Times measured by waiting for each pass (“finish”) say what the machine that drew them took, and nothing of a GPU's.</p></body></html>
`;
  writeFileSync(join(out, 'sheet.html'), html);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 220 + 652 * shoots.length + 32, height: 800 }, deviceScaleFactor: 1 });
    await page.goto(`file://${join(resolve(out), 'sheet.html')}`);
    await page.screenshot({ path: join(out, 'sheet.png'), fullPage: true });
  } finally {
    await browser.close();
  }
  console.log(`${relative(process.cwd(), join(out, 'sheet.html'))} and sheet.png: ${names.length} views, ${shoots.length === 1 ? 'one shoot' : 'before and after'}`);
}

const [command, ...rest] = process.argv.slice(2);
const positional = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));
if (command === 'shoot' && positional[0]) await shoot(positional[0]);
else if (command === 'sheet' && positional.length && option('out')) await sheet(positional.slice(0, 2), option('out')!);
else {
  console.error('usage: look.ts shoot <out dir> [--only a,b] [--angle …] | look.ts sheet <before> [<after>] --out <dir>');
  process.exit(1);
}
