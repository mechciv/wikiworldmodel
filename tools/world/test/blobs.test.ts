import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type RequestListener, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { blobPath, blobRemoteUrl, hasBlob, isBlobUrl, parseBlobHash, putBlob, readBlob, snapshotDatasets, stageBlobsFromGit } from '../src/blobs.ts';
import { download, type Net } from '../src/fetch.ts';
import { loadManifest } from '../src/manifest.ts';
import { sha256 } from '../src/util.ts';
import { validateWorld } from '../src/validate/index.ts';
import { loadWorld, type Manifest } from '../src/world.ts';

const TEST_STORE_ORIGIN = 'https://builds.example.org/';
const tempDirs: string[] = [];
const servers: Server[] = [];

function makeTmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/**
 * Start a local HTTP test server and expose it through a `Net` adapter under a public HTTPS origin
 * so `fetch.ts`'s HTTPS/SSRF URL checks stay strict while still exercising real HTTP + brotli/gzip.
 */
async function startServer(handler: RequestListener): Promise<{ url: string; net: Net; server: Server }> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('unexpected server address');
  const localOrigin = `http://127.0.0.1:${addr.port}/`;
  const net: Net = {
    fetch: (input, init) => {
      const raw = String(input);
      const mapped = raw.startsWith(TEST_STORE_ORIGIN) ? localOrigin + raw.slice(TEST_STORE_ORIGIN.length) : raw;
      return fetch(mapped, init);
    },
    pause: async () => {},
  };
  return { url: TEST_STORE_ORIGIN, net, server };
}

afterEach(async () => {
  while (servers.length) {
    const s = servers.pop()!;
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('content-addressed snapshot blobs', () => {
  it('parses blob:<sha256> URLs and round-trips putBlob / readBlob', async () => {
    const blobDir = makeTmp('blobs-rw-');
    const payload = new TextEncoder().encode('hello content-addressed world');
    const ref = await putBlob(payload, blobDir);
    expect(ref.sha256).toBe(sha256(payload));
    expect(ref.bytes).toBe(payload.byteLength);
    expect(hasBlob(ref.sha256, blobDir)).toBe(true);
    expect(await readBlob(ref.sha256, blobDir)).toEqual(payload);

    expect(isBlobUrl(`blob:${ref.sha256}`)).toBe(true);
    expect(isBlobUrl('https://example.com/a.json')).toBe(false);
    expect(parseBlobHash(`blob:${ref.sha256}`)).toBe(ref.sha256);
    expect(parseBlobHash('blob:not-a-hash')).toBeUndefined();
    expect(blobRemoteUrl('https://builds.wikiworldmodel.org/', ref.sha256)).toBe(`https://builds.wikiworldmodel.org/blobs/${ref.sha256}`);
  });

  it('fetches blob:<sha256> from local cache without network, or from an HTTP blob store serving brotli/gzip', async () => {
    const blobDir = makeTmp('blobs-fetch-cache-');
    const outDir = makeTmp('blobs-fetch-out-');
    const rawBr = Buffer.from('{"snapshot":"paleo","rows":[' + Array.from({ length: 100 }, (_, i) => i).join(',') + ']}');
    const hashBr = sha256(rawBr);
    const rawGz = Buffer.from('lat,lon,land_km2,0\n' + '0,0,100,42\n'.repeat(50));
    const hashGz = sha256(rawGz);

    let hits = 0;
    const { url, net } = await startServer((req, res) => {
      hits++;
      if (req.url === `/blobs/${hashBr}`) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'br' });
        res.end(brotliCompressSync(rawBr));
        return;
      }
      if (req.url === `/blobs/${hashGz}`) {
        res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Encoding': 'gzip' });
        res.end(gzipSync(rawGz));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const destBr = join(outDir, 'snap.json');
    await download('src:test-br', `blob:${hashBr}`, destBr, () => {}, net, { blobs: { url, prefix: 'blobs/' }, blobDir });
    expect(readFileSync(destBr)).toEqual(rawBr);
    expect(existsSync(blobPath(hashBr, blobDir))).toBe(true);
    expect(hits).toBe(1);

    // Second fetch hits local `.cache/blobs/<sha256>` with zero HTTP requests.
    const destBr2 = join(outDir, 'snap2.json');
    await download('src:test-br', `blob:${hashBr}`, destBr2, () => {}, net, { blobs: { url, prefix: 'blobs/' }, blobDir });
    expect(readFileSync(destBr2)).toEqual(rawBr);
    expect(hits).toBe(1);

    // Gzip-encoded remote blob also transparently decompresses and passes sha256 verification.
    const destGz = join(outDir, 'snap.csv');
    await download('src:test-gz', `blob:${hashGz}`, destGz, () => {}, net, { blobs: { url, prefix: 'blobs/' }, blobDir });
    expect(readFileSync(destGz)).toEqual(rawGz);
    expect(hits).toBe(2);
  });

  it('rejects a remote blob whose bytes do not match the blob:<sha256> hash', async () => {
    const blobDir = makeTmp('blobs-corrupt-cache-');
    const outDir = makeTmp('blobs-corrupt-out-');
    const expected = sha256('legitimate snapshot');

    const { url, net } = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('tampered payload');
    });

    await expect(
      download('src:corrupt', `blob:${expected}`, join(outDir, 'bad.json'), () => {}, net, { blobs: { url, prefix: 'blobs/' }, blobDir }),
    ).rejects.toThrow(/checksum mismatch/);
    expect(existsSync(blobPath(expected, blobDir))).toBe(false);
  });

  it('rejects a manifest dataset whose blob:<sha256> disagrees with fetch.sha256 during validation', async () => {
    const world = await loadWorld();
    const [snapId, orig] = Object.entries(world.manifest.datasets).find(([, d]) => isBlobUrl(d.fetch.url))!;
    const copy = structuredClone(orig);
    const wrongHash = '0'.repeat(64);
    const patched = {
      ...world,
      manifest: {
        ...world.manifest,
        datasets: {
          ...world.manifest.datasets,
          [snapId]: { ...copy, fetch: { ...copy.fetch, url: `blob:${wrongHash}` } },
        },
      },
    };
    const report = await validateWorld(patched, { frames: false });
    expect(report.issues.some((i) => i.level === 'error' && i.check === 'manifest' && i.where === snapId && /does not match/.test(i.message))).toBe(true);
  }, 60_000);

  it('references all 17 snapshot datasets as content-addressed blob:<sha256> entries in manifest.yaml', async () => {
    const manifest = await loadManifest();
    const snaps = snapshotDatasets(manifest);
    expect(snaps.length).toBe(17);
    for (const [, d] of snaps) {
      expect(d.fetch.url).toBe(`blob:${d.fetch.sha256}`);
      expect(d.fetch.filename).toBeTruthy();
    }
  });

  it('extracts and verifies snapshot blobs cleanly from a git revision history', async () => {
    const repoDir = makeTmp('blobs-git-repo-');
    const blobDir = makeTmp('blobs-git-stage-');
    const git = (args: string[]) =>
      execFileSync('git', args, {
        cwd: repoDir,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@example.com',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@example.com',
        },
        stdio: 'pipe',
      });

    git(['init']);
    mkdirSync(join(repoDir, 'world', 'snapshots'), { recursive: true });
    const aBytes = Buffer.from('{"id":"alpha","rows":[1,2,3]}\n');
    const bBytes = Buffer.from('lat,lon\n0,0\n');
    writeFileSync(join(repoDir, 'world', 'snapshots', 'alpha.json'), aBytes);
    writeFileSync(join(repoDir, 'world', 'snapshots', 'beta.csv'), bBytes);
    git(['add', 'world/snapshots']);
    git(['commit', '-m', 'seed legacy snapshots']);
    // Delete snapshots in a follow-up commit, mirroring the post-migration repo state.
    git(['rm', '-r', 'world/snapshots']);
    git(['commit', '-m', 'move snapshots to blob store']);

    const mockManifest = {
      version: 1,
      publish: { licenses: ['CC0-1.0'] },
      datasets: {
        'src:alpha': {
          id: 'src:alpha',
          file: 'manifest.yaml',
          kind: 'dataset',
          title: 'Alpha',
          license: 'CC0-1.0',
          credit: 'Test',
          fetch: { url: `blob:${sha256(aBytes)}`, sha256: sha256(aBytes), bytes: aBytes.byteLength, format: 'json', filename: 'alpha.json' },
        },
        'src:beta': {
          id: 'src:beta',
          file: 'manifest.yaml',
          kind: 'dataset',
          title: 'Beta',
          license: 'CC0-1.0',
          credit: 'Test',
          fetch: { url: `blob:${sha256(bBytes)}`, sha256: sha256(bBytes), bytes: bBytes.byteLength, format: 'csv', filename: 'beta.csv' },
        },
      },
    } as unknown as Manifest;

    const res = await stageBlobsFromGit(mockManifest, 'HEAD~1', { repo: repoDir, blobDir, log: () => {} });
    expect(res).toEqual({ staged: 2, alreadyPresent: 0, missing: [] });
    expect(await readBlob(sha256(aBytes), blobDir)).toEqual(new Uint8Array(aBytes));
    expect(await readBlob(sha256(bBytes), blobDir)).toEqual(new Uint8Array(bBytes));

    // Running again reports all blobs already present without re-staging.
    const res2 = await stageBlobsFromGit(mockManifest, 'HEAD~1', { repo: repoDir, blobDir, log: () => {} });
    expect(res2).toEqual({ staged: 0, alreadyPresent: 2, missing: [] });
  });
});
