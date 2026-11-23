import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { drawLayers, pageWith, SITE } from '../../site/layers.ts';

describe("the landing page's layers", () => {
  const d = drawLayers();
  const page = readFileSync(join(SITE, 'index.html'), 'utf8');

  it('are drawn as tools/site/layers.ts draws them, in the page and in img/layers.svg', () => {
    expect(readFileSync(join(SITE, 'img/layers.svg'), 'utf8')).toBe(d.file);
    expect(pageWith(page, d)).toBe(page);
  });

  it('name every plate the page stacks, and give each a label', () => {
    const plates = [...d.html.matchAll(/#layer-([a-z]+)"/g)].map((m) => m[1]);
    expect(plates).toHaveLength(5);
    for (const id of plates) expect(d.file).toContain(`<g id="layer-${id}">`);
    const labels = [...page.matchAll(/<li style="--k: (\d)/g)].map((m) => Number(m[1]));
    expect(labels).toEqual([0, 1, 2, 3, 4]);
  });
});
