import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { blobPath } from '../src/blobs.ts';
import { DagRunner } from '../src/build/dag.ts';
import { solveVariants } from '../src/chronology.ts';
import { sha256 } from '../src/util.ts';
import { validateWorld } from '../src/validate/index.ts';
import { loadWorld } from '../src/world.ts';

const tempDirs: string[] = [];
function makeTmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('content-addressed streaming DAG engine', () => {
  it('streams outputs directly to disk blobs, deduplicates identical content, and hits cache on repeat runs', async () => {
    const cacheDir = makeTmp('dag-cache-');
    const codeRoot = makeTmp('dag-code-');
    writeFileSync(join(codeRoot, 'stage.ts'), 'export const VERSION = 1;\n');

    let runs = 0;
    const dag1 = new DagRunner({ cacheDir, codeRoot });
    const r1 = await dag1.runStage(
      'tiles',
      { step: 1 },
      async (sink) => {
        runs++;
        const a = await sink.put('tiles/0.lwt', new Uint8Array([1, 2, 3, 4]));
        const b = await sink.put('tiles/1.lwt', new Uint8Array([1, 2, 3, 4]));
        const internal = await sink.putInternal(new Uint8Array([9, 8, 7, 6]));
        expect(a.sha256).toBe(b.sha256);
        expect(await sink.readBytes('tiles/0.lwt')).toEqual(new Uint8Array([1, 2, 3, 4]));
        return { count: 2, internalSha: internal.sha256 };
      },
      { codeFiles: ['stage.ts'] },
    );
    expect(r1.hit).toBe(false);
    expect(runs).toBe(1);
    expect(dag1.readBlobBytesSync('tiles/0.lwt')).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(dag1.readBlobByHashSync(r1.meta.internalSha)).toEqual(new Uint8Array([9, 8, 7, 6]));
    // Internal cache blobs are never exposed in build output files or manifestFiles().
    expect(dag1.manifestFiles()).toEqual({
      'tiles/0.lwt': sha256(new Uint8Array([1, 2, 3, 4])),
      'tiles/1.lwt': sha256(new Uint8Array([1, 2, 3, 4])),
    });

    // Second run with identical inputs and code hits cache without invoking compute().
    const dag2 = new DagRunner({ cacheDir, codeRoot });
    const r2 = await dag2.runStage(
      'tiles',
      { step: 1 },
      async () => {
        runs++;
        return { count: 999, internalSha: '' };
      },
      { codeFiles: ['stage.ts'] },
    );
    expect(r2.hit).toBe(true);
    expect(runs).toBe(1);
    expect(r2.meta).toEqual(r1.meta);
    expect(dag2.summary().hits).toBe(1);
    expect(dag2.summary().misses).toBe(0);

    // Changing a code file invalidates the stage key and recomputes.
    writeFileSync(join(codeRoot, 'stage.ts'), 'export const VERSION = 2;\n');
    const dag3 = new DagRunner({ cacheDir, codeRoot });
    const r3 = await dag3.runStage(
      'tiles',
      { step: 1 },
      async (sink) => {
        runs++;
        await sink.put('tiles/0.lwt', new Uint8Array([5, 6, 7, 8]));
        return { count: 1, internalSha: '' };
      },
      { codeFiles: ['stage.ts'] },
    );
    expect(r3.hit).toBe(false);
    expect(runs).toBe(2);
    expect(r3.key).not.toBe(r1.key);
  });

  it('self-heals when a cached output blob or internal blob is missing, and respects --no-cache', async () => {
    const cacheDir = makeTmp('dag-heal-');
    let runs = 0;

    const dag1 = new DagRunner({ cacheDir });
    const first = await dag1.runStage('climate', { a: 1 }, async (sink) => {
      runs++;
      await sink.put('climate.lwt', 'climate-data');
      const internal = await sink.putInternal('float-nodes');
      return { internalSha: internal.sha256 };
    });
    expect(runs).toBe(1);

    // Remove the internal cache blob: next run must detect the missing blob and recompute.
    rmSync(blobPath(first.meta.internalSha, dag1.blobDir));
    const dag2 = new DagRunner({ cacheDir });
    const second = await dag2.runStage('climate', { a: 1 }, async (sink) => {
      runs++;
      await sink.put('climate.lwt', 'climate-data');
      const internal = await sink.putInternal('float-nodes');
      return { internalSha: internal.sha256 };
    });
    expect(second.hit).toBe(false);
    expect(runs).toBe(2);
    expect(existsSync(blobPath(second.meta.internalSha, dag2.blobDir))).toBe(true);

    // --no-cache forces recomputation even when cache is warm and intact.
    const dag3 = new DagRunner({ cacheDir, noCache: true });
    const third = await dag3.runStage('climate', { a: 1 }, async (sink) => {
      runs++;
      await sink.put('climate.lwt', 'climate-data');
      const internal = await sink.putInternal('float-nodes');
      return { internalSha: internal.sha256 };
    });
    expect(third.hit).toBe(false);
    expect(runs).toBe(3);
  });

  it('computes contentHash identically to sorted path+sha256 and materializes hard-linked build + shared blobs/', async () => {
    const cacheDir = makeTmp('dag-mat-cache-');
    const buildsDir = makeTmp('dag-mat-builds-');
    const dag = new DagRunner({ cacheDir });

    await dag.runStage('records', { n: 2 }, async (sink) => {
      await sink.put('records/a.json', '{"id":"a"}');
      await sink.put('records/b.json', '{"id":"a"}'); // identical content, shared blob
      await sink.put('periods.json', '{"periods":[]}');
      return {};
    });

    const extra = '{"format":"lightworld-tileset@4"}';
    const expectedHash = sha256(
      [
        `periods.json ${sha256('{"periods":[]}')}`,
        `records/a.json ${sha256('{"id":"a"}')}`,
        `records/b.json ${sha256('{"id":"a"}')}`,
      ].join('\n') + extra,
    );
    expect(dag.contentHash(extra)).toBe(expectedHash);

    const dest = join(buildsDir, 'build-1');
    const sharedBlobs = join(buildsDir, 'blobs');
    await dag.materialize(dest, sharedBlobs);

    expect(readFileSync(join(dest, 'records/a.json'), 'utf8')).toBe('{"id":"a"}');
    expect(readFileSync(join(dest, 'records/b.json'), 'utf8')).toBe('{"id":"a"}');
    expect(readFileSync(join(dest, 'periods.json'), 'utf8')).toBe('{"periods":[]}');

    // Both logical files and the shared blob share the exact same underlying inode (hard-linked)
    // and are read-only (0o444) so accidental writes cannot corrupt the content-addressed cache.
    const shaA = sha256('{"id":"a"}');
    const stA = statSync(join(dest, 'records/a.json'));
    const stB = statSync(join(dest, 'records/b.json'));
    const stShared = statSync(join(sharedBlobs, shaA));
    expect(stA.ino).toBe(stB.ino);
    expect(stA.ino).toBe(stShared.ino);
    expect(stShared.nlink).toBeGreaterThanOrEqual(3);
    expect(stShared.mode & 0o222).toBe(0);
  });

  it('invalidates cached stages when a transitively imported local module changes', async () => {
    const cacheDir = makeTmp('dag-trans-cache-');
    const codeRoot = makeTmp('dag-trans-code-');
    writeFileSync(join(codeRoot, 'leaf.ts'), 'export const FACTOR = 1;\n');
    writeFileSync(join(codeRoot, 'mid.ts'), "import { FACTOR } from './leaf.ts';\nexport const scale = (n: number) => n * FACTOR;\n");
    writeFileSync(join(codeRoot, 'entry.ts'), "import { scale } from './mid.ts';\nexport const run = () => scale(2);\n");

    let runs = 0;
    const dag1 = new DagRunner({ cacheDir, codeRoot });
    const r1 = await dag1.runStage(
      'derived',
      { x: 1 },
      async (sink) => {
        runs++;
        await sink.put('out.json', '{"v":1}');
        return { v: 1 };
      },
      { codeFiles: ['entry.ts'] },
    );
    expect(r1.hit).toBe(false);
    expect(runs).toBe(1);

    // Repeat with unchanged transitive graph hits cache.
    const dag2 = new DagRunner({ cacheDir, codeRoot });
    const r2 = await dag2.runStage('derived', { x: 1 }, async () => { runs++; return { v: 99 }; }, { codeFiles: ['entry.ts'] });
    expect(r2.hit).toBe(true);
    expect(runs).toBe(1);

    // Editing leaf.ts (not listed directly in codeFiles) must change the stage key and recompute.
    writeFileSync(join(codeRoot, 'leaf.ts'), 'export const FACTOR = 2;\n');
    const dag3 = new DagRunner({ cacheDir, codeRoot });
    const r3 = await dag3.runStage(
      'derived',
      { x: 1 },
      async (sink) => {
        runs++;
        await sink.put('out.json', '{"v":2}');
        return { v: 2 };
      },
      { codeFiles: ['entry.ts'] },
    );
    expect(r3.hit).toBe(false);
    expect(r3.key).not.toBe(r1.key);
    expect(runs).toBe(2);
  });

  it('eliminates duplicate STN solves: validateWorld chronology feeds solveVariants with identical results', async () => {
    const world = await loadWorld();
    const report = await validateWorld(world, { frames: false });
    expect(report.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(report.chronology).toBeDefined();
    expect(report.chronology!.defaultSol.ok).toBe(true);
    expect(report.chronology!.defaultCentres?.ok).toBe(true);
    expect(report.chronology!.pictures.has('')).toBe(true);
    expect(report.chronology!.pictureCentres.has('')).toBe(true);

    // Comparing solveVariants with and without preSolved on an empty alt list verifies exact parity.
    const fresh = solveVariants(world, []);
    const reused = solveVariants(world, [], report.chronology);
    expect(reused.length).toBe(fresh.length);
    for (let i = 0; i < fresh.length; i++) {
      expect(reused[i].key).toBe(fresh[i].key);
      expect(reused[i].solution.ok).toBe(fresh[i].solution.ok);
      expect(reused[i].centres.ok).toBe(fresh[i].centres.ok);
      const fs = fresh[i].solution;
      const rs = reused[i].solution;
      if (fs.ok && rs.ok) {
        const fb = fs.bounds.get('periods/ics/cretaceous|start');
        const rb = rs.bounds.get('periods/ics/cretaceous|start');
        expect(rb).toEqual(fb);
      }
    }
  }, 60_000);
});
