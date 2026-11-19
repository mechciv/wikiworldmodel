// The look book's views and the frame-time budget (docs/plans/RENDERING.md, step 0), read by the tool that shoots them
// (tools/look/look.ts) and by the test that holds each to the budget (viewer/test/e2e/frametime.spec.ts).
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

/** What a frame may cost on the reference GPU, at the reference size: 60 frames a second. */
export const BUDGET = { ms: 16, width: 1600, height: 900 } as const;

/** A view of the look book, as tools/look/views.yaml has it. */
export interface LookView {
  name: string;
  /** what the view is for: what of the picture it judges */
  what: string;
  /** the viewer's link to it, without the build: the place, the time, the camera and the hour */
  link: string;
}

export interface LookFile {
  /** the GPU the timings are for, by the name its driver gives */
  reference: string;
  views: LookView[];
}

export function readViews(file: string): LookFile {
  const f = parse(readFileSync(file, 'utf8')) as LookFile;
  const names = new Set<string>();
  for (const v of f.views) {
    if (!/^[a-z0-9-]+$/.test(v.name)) throw new Error(`a view's name is lowercase words and dashes: "${v.name}"`);
    if (names.has(v.name)) throw new Error(`two views are named "${v.name}"`);
    names.add(v.name);
    if (/(^|&)b=/.test(v.link)) throw new Error(`view ${v.name}: its link names no build; the shoot adds the latest`);
  }
  return f;
}

