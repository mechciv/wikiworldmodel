// The comparison the nightly reproducibility check makes (meaning.ts), on small builds written here: it must
// find two builds of the same meaning the same, and tell where they are not.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { encodeTile } from '../../../core/container.ts';
import { meaningOf, meaningProblems } from './meaning.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function build(files: Record<string, Uint8Array | string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'meaning-'));
  dirs.push(dir);
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), bytes);
  }
  return dir;
}

const tile = (width: number[]) => encodeTile({ format: 'test@1' }, [Uint32Array.from([0, 1, 2]), Float32Array.from(width)], JSON.stringify);

describe('meaning', () => {
  it('reads a taxon body part that has a count as a record, not as a fingerprint', () => {
    const taxon = (n: number) => JSON.stringify({ claims: [{ value: { parts: { crest: { type: 'row', n, item: 'spike' } } } }] });
    expect(meaningProblems(meaningOf(build({ 'records/t.json': taxon(14) })), meaningOf(build({ 'records/t.json': taxon(14) })))).toEqual([]);
    expect(meaningProblems(meaningOf(build({ 'records/t.json': taxon(14) })), meaningOf(build({ 'records/t.json': taxon(15) })))).toEqual([
      'records/t.json.claims[0].value.parts.crest.n: 15 for 14',
    ]);
  });

  it('finds a tile with values missing the same as itself, and tells when other values are missing', () => {
    const a = meaningOf(build({ 'r.lwt': tile([120, Number.NaN, 40]) }));
    expect(meaningProblems(a, meaningOf(build({ 'r.lwt': tile([120, Number.NaN, 40]) })))).toEqual([]);
    expect(meaningProblems(a, meaningOf(build({ 'r.lwt': tile([Number.NaN, 120, 40]) }))).some((p) => p.includes('(missing)'))).toBe(true);
  });
});
