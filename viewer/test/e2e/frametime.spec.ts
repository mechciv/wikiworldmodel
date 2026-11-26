// The frame-time budget (docs/plans/RENDERING.md, step 0): each view of the look book (tools/look/views.yaml), drawn at
// full quality at 1600 × 900, takes no more than 16 ms a frame on the reference GPU the look book names. It needs that
// GPU: drawn in software, as CI draws, or on another GPU, it says what it measured and skips. Run it by hand or nightly
// on a machine with the GPU, which ANGLE reaches by the backend in $ANGLE (Metal on a Mac unless it says otherwise):
//
//   npm run build:viewer && npx playwright test --project=frame-time
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { BUDGET, readViews } from '../../../tools/look/views.ts';
import { idle, latestBuild } from './helpers.ts';

const look = readViews(join(import.meta.dirname, '../../../tools/look/views.yaml'));
const angle = process.env.ANGLE ?? (process.platform === 'darwin' ? 'metal' : 'default');

test.use({
  viewport: { width: BUDGET.width, height: BUDGET.height },
  launchOptions: { args: [`--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] },
});
test.setTimeout(10 * 60_000);

/** The GPU this browser draws with, as its driver names it. */
let gpu = '';
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'none';
  });
  await page.close();
});

for (const v of look.views) {
  test(`${v.name} draws a frame within ${BUDGET.ms} ms on the reference GPU`, async ({ page }) => {
    // Anywhere but on the reference GPU, nothing is measured: a view at full quality takes minutes in software.
    test.skip(!new RegExp(look.reference, 'i').test(gpu), `drawn on ${gpu}, not the reference GPU (${look.reference})`);
    await page.goto(`/?b=${latestBuild()}&${v.link}`);
    await idle(page);
    const profile = await page.evaluate(() => window.__wikiworldmodel!.profile(30));
    test.info().annotations.push({ type: 'frame', description: `${gpu}: ${profile ? `${profile.total.toFixed(2)} ms (${profile.method})` : 'no local scene'}` });
    test.skip(profile?.method !== 'gpu', `the browser on ${gpu} has no timer queries`);
    expect(profile, 'the view is of a local scene').not.toBeNull();
    expect(profile!.total, JSON.stringify(profile!.passes)).toBeLessThanOrEqual(BUDGET.ms);
  });
}

for (const tr of look.traces ?? []) {
  const budget = tr.budgetMs ?? BUDGET.ms;
  test(`interactive trace ${tr.name} stays within ${budget} ms p95 on the reference GPU`, async ({ page }) => {
    test.skip(!new RegExp(look.reference, 'i').test(gpu), `drawn on ${gpu}, not the reference GPU (${look.reference})`);
    await page.goto(`/?b=${latestBuild()}&${tr.link}`);
    await idle(page);
    const res = await page.evaluate(
      (spec) => window.__wikiworldmodel!.profileInteractive(spec),
      { motion: tr.motion, steps: tr.steps, from: tr.from, to: tr.to },
    );
    expect(res, 'interactive trace recorded frames').not.toBeNull();
    const d = res!.deltas;
    test.info().annotations.push({
      type: 'interactive',
      description: `${gpu}: p50=${d.p50.toFixed(1)}ms p95=${d.p95.toFixed(1)}ms p99=${d.p99.toFixed(1)}ms max=${d.max.toFixed(1)}ms | cascades=${res!.shadowCascades} draws=${res!.avgDrawCalls.toFixed(1)} mega=${res!.megaDraws} cells=${res!.maxStaticCells}(macro=${res!.maxMacroCells}) imp=${Math.round(res!.avgImpostorInstances)} mesh=${Math.round(res!.avgMeshInstances)} sel=${res!.workerSelections}`,
    });
    expect(d.p95, JSON.stringify(res)).toBeLessThanOrEqual(budget);
  });
}
