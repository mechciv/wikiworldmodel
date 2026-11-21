// A field read `as: months` is a part of what the tiles keep beside a climate's months (core/months.ts PARTS): the
// validator holds it to the climate it rides with, on small worlds written for the test.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { validateWorld, type Issue } from '../src/validate/index.ts';
import { loadWorld } from '../src/world.ts';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const dataset = (id: string) => `  src:test/${id}:
    type: dataset
    kind: model
    citation: A fixture run of a climate model, not a real one.
    license: CC0-1.0
    credit: Fixture
    version: "1"
    fetch: { url: "https://example.invalid/${id}.nc", sha256: "0000000000000000000000000000000000000000000000000000000000000000", bytes: 1, format: netcdf }
`;
const MANIFEST = `publish: { licenses: [CC0-1.0] }\ndatasets:\n${dataset('run')}${dataset('other')}`;
const CLIMATE = `id: field:test/climate
type: field
title: Climate
frame: frame:test/geographic
grid: { kind: lonlat, res_deg: 2 }
time: { lo: 10 Ma, hi: 0 Ma, step: 10 Myr }
data: { from: src:test/run, as: climate }
basis: reconstruction
spread: unknown
`;
/** A field read as months from a dataset, with the parts it reads. */
const part = (id: string, reads: string, from = 'run', res = 2) => `id: field:test/${id}
type: field
title: ${id}
frame: frame:test/geographic
grid: { kind: lonlat, res_deg: ${res} }
time: { lo: 10 Ma, hi: 0 Ma, step: 10 Myr }
data:
  from: src:test/${from}
  as: months
  reads: ${reads}
basis: reconstruction
spread: unknown
`;

async function check(files: Record<string, string>): Promise<string[]> {
  const root = mkdtempSync(join(tmpdir(), 'wikiworldmodel-fixture-'));
  dirs.push(root);
  for (const [path, text] of Object.entries({ 'manifest.yaml': MANIFEST, 'fields/climate.yaml': CLIMATE, ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const issues: Issue[] = (await validateWorld(await loadWorld(root), { frames: false })).issues;
  return issues.filter((i) => i.level === 'error').map((i) => `${i.file} ${i.where ?? ''}: ${i.message}`);
}

describe('fields read as months', () => {
  it('accepts parts of the dataset a climate is read from, on that climate\'s grid', async () => {
    expect(
      await check({
        'fields/wind.yaml': part('wind', '{ u: { variable: U, unit: m/s }, v: { variable: V, unit: m/s } }'),
        'fields/albedo.yaml': part('albedo', '{ albedo: { variable: SALB, unit: fraction, none: 0 } }'),
        'fields/biome.yaml': part('biome', '{ biome: { variable: biome } }'),
        'fields/leaf.yaml': part('leaf', '{ leaf: { variable: lai } }'),
      }),
    ).toEqual([]);
  });

  it('wants a climate read from the same dataset, and its grid', async () => {
    expect(await check({ 'fields/cloud.yaml': part('cloud', '{ cloud: { variable: cld } }', 'other') })).toEqual([expect.stringContaining('no climate is read from src:test/other')]);
    expect(await check({ 'fields/cloud.yaml': part('cloud', '{ cloud: { variable: cld } }', 'run', 1) })).toEqual([expect.stringContaining("give it that field's grid and frame")]);
  });

  it('refuses a part the tiles do not keep, a part read twice, half a wind, and leaf area with no class to go with', async () => {
    expect(await check({ 'fields/snow.yaml': part('snow', '{ snow: { variable: SNOW } }') })).toEqual(expect.arrayContaining([expect.stringContaining('property name must be valid'), expect.stringContaining('"snow" is not a part the tiles keep')]));
    expect(await check({ 'fields/a.yaml': part('a', '{ cloud: { variable: cld } }'), 'fields/b.yaml': part('b', '{ cloud: { variable: cloudiness } }') })).toEqual([expect.stringContaining('field:test/a reads "cloud" from src:test/run already')]);
    expect(await check({ 'fields/wind.yaml': part('wind', '{ u: { variable: U } }') })).toEqual([expect.stringContaining('a wind has both its components')]);
    expect(await check({ 'fields/leaf.yaml': part('leaf', '{ leaf: { variable: lai } }') })).toEqual([expect.stringContaining('no field reads "biome" from src:test/run')]);
  });

  it('refuses the parts of a field that is not read as months', async () => {
    const climate = CLIMATE.replace('as: climate }', 'as: climate, reads: { cloud: { variable: cld } } }');
    expect(await check({ 'fields/climate.yaml': climate })).toEqual([expect.stringContaining('only a field read `as: months` says which parts it reads')]);
  });
});
