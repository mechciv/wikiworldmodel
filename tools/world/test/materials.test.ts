// The scanned materials the viewer draws the ground with (core/materials.ts): the list that goes out with them names
// every layer the renderer knows, in its order, each with its two images, from the scans the spec pins; all of them
// in the public domain.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { GROUND_FORMAT, GROUND_LAYERS, type GroundMaterials } from '../../../core/materials.ts';
import { groundMaterials } from '../src/attribution.ts';
import { REPO } from '../src/paths.ts';

const dir = join(REPO, 'viewer/public/materials');
const file = groundMaterials()!;
const spec = parse(readFileSync(join(REPO, 'tools/materials/ground.yaml'), 'utf8')) as { license: string; size: number; layers: { key: string; from: string; metres: number; maps: Record<string, { url: string; md5: string; bytes: number }> }[] };

describe("the ground's scanned materials", () => {
  it('lists a layer for each material the renderer names, in the renderer\'s order', () => {
    expect(file.format).toBe(GROUND_FORMAT);
    expect(file.layers.map((l) => l.key)).toEqual([...GROUND_LAYERS]);
    expect(file.size).toBe(spec.size);
  });

  it('has each layer\'s two images, a repeat of a metre or more, and a mean colour to take the scan\'s own colour out by', () => {
    for (const l of file.layers) {
      for (const image of [l.colour, l.data]) {
        expect(existsSync(join(dir, image)), image).toBe(true);
        expect(statSync(join(dir, image)).size, image).toBeGreaterThan(5000);
      }
      expect(l.metres, l.key).toBeGreaterThanOrEqual(1);
      expect(l.metres, l.key).toBeLessThanOrEqual(5);
      for (const c of l.mean) {
        expect(c, l.key).toBeGreaterThan(0.005);
        expect(c, l.key).toBeLessThan(1);
      }
      expect(l.chroma, l.key).toBeGreaterThanOrEqual(0);
      expect(l.chroma, l.key).toBeLessThanOrEqual(1);
    }
    // They are fetched once by every visitor: a few megabytes in all.
    const bytes = file.layers.reduce((a, l) => a + statSync(join(dir, l.colour)).size + statSync(join(dir, l.data)).size, 0);
    expect(bytes).toBeLessThan(8 * 1048576);
  });

  it('is packed from the scans the spec pins, each by its address and its md5, all in the public domain', () => {
    expect(spec.license).toBe('CC0-1.0');
    expect((file as GroundMaterials).license).toBe('CC0-1.0');
    expect(spec.layers.map((l) => l.key)).toEqual([...GROUND_LAYERS]);
    for (const s of spec.layers) {
      const l = file.layers.find((x) => x.key === s.key)!;
      expect(l.from, s.key).toBe(`https://polyhaven.com/a/${s.from}`);
      expect(l.metres, s.key).toBe(s.metres);
      for (const map of ['colour', 'normal', 'roughness', 'height']) {
        expect(s.maps[map]?.url, `${s.key} ${map}`).toMatch(/^https:\/\/dl\.polyhaven\.org\//);
        expect(s.maps[map]?.md5, `${s.key} ${map}`).toMatch(/^[0-9a-f]{32}$/);
      }
    }
  });
});
