import { mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assembleSite } from '../src/site.ts';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'site-'));
  const put = (p: string, text = 'x') => {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), text);
  };
  put('site/index.html', '<!doctype html>');
  put('site/README.md');
  put('site/img/a.jpg');
  put('viewer/index.html', '<!doctype html>');
  put('viewer/assets/main.js');
  put('builds/b-old/build.json');
  put('builds/b-new/build.json');
  put('builds/b-new/tiles/0.lwt');
  put('builds/b-new/ATTRIBUTION.md', '# Attribution');
  put('builds/index.json', JSON.stringify({ builds: [{ id: 'b-new', commit: 'c2' }, { id: 'b-old', commit: 'c1' }], latest: 'b-new' }));
  const opts = { landing: join(root, 'site'), viewer: join(root, 'viewer'), builds: join(root, 'builds'), out: join(root, 'out') };
  return { root, opts, put };
}

describe('the public site', () => {
  it('puts the landing page at /, the viewer at /world/ and only the latest build beside it', () => {
    const { root, opts } = fixture();
    const r = assembleSite(opts);
    const out = join(root, 'out');
    expect(r.build).toBe('b-new');
    expect(existsSync(join(out, 'index.html'))).toBe(true);
    expect(existsSync(join(out, 'img/a.jpg'))).toBe(true);
    expect(existsSync(join(out, 'README.md'))).toBe(false);
    expect(existsSync(join(out, 'world/index.html'))).toBe(true);
    expect(existsSync(join(out, 'world/assets/main.js'))).toBe(true);
    expect(existsSync(join(out, 'world/builds/b-new/tiles/0.lwt'))).toBe(true);
    expect(existsSync(join(out, 'world/builds/b-old'))).toBe(false);
    expect(readFileSync(join(out, 'ATTRIBUTION.md'), 'utf8')).toBe('# Attribution');
    expect(JSON.parse(readFileSync(join(out, 'world/builds/index.json'), 'utf8'))).toEqual({ builds: [{ id: 'b-new', commit: 'c2' }], latest: 'b-new' });
  });

  it('with a store, leaves the build out and points the index at the store', () => {
    const { root, opts } = fixture();
    const r = assembleSite({ ...opts, store: 'https://builds.example.org/' });
    const out = join(root, 'out');
    expect(r.build).toBe('b-new');
    expect(existsSync(join(out, 'world/builds/b-new'))).toBe(false);
    expect(readFileSync(join(out, 'ATTRIBUTION.md'), 'utf8')).toBe('# Attribution');
    expect(JSON.parse(readFileSync(join(out, 'world/builds/index.json'), 'utf8'))).toEqual({
      builds: [{ id: 'b-new', commit: 'c2' }],
      latest: 'b-new',
      store: 'https://builds.example.org/',
    });
  });

  it("puts the build's glance beside the landing page, and leaves it out for a build without one", () => {
    const { root, opts, put } = fixture();
    const glance = { format: 'lightworld-glance@1', groups: [] };
    put('builds/b-new/coverage.json', JSON.stringify({ claims: {}, glance }));
    assembleSite(opts);
    expect(JSON.parse(readFileSync(join(root, 'out/glance.json'), 'utf8'))).toEqual({ build: 'b-new', glance });
    rmSync(join(root, 'builds/b-new/coverage.json'));
    assembleSite(opts);
    expect(existsSync(join(root, 'out/glance.json'))).toBe(false);
  });

  it('refuses a store that is not an https URL of a directory', () => {
    const { opts } = fixture();
    expect(() => assembleSite({ ...opts, store: 'https://builds.example.org' })).toThrow(/ending in a slash/);
    expect(() => assembleSite({ ...opts, store: 'http://builds.example.org/' })).toThrow(/https/);
  });

  it('refuses a build without its ATTRIBUTION.md, since the site must credit its data', () => {
    const { root, opts } = fixture();
    rmSync(join(root, 'builds/b-new/ATTRIBUTION.md'));
    expect(() => assembleSite(opts)).toThrow(/ATTRIBUTION\.md/);
  });

  it('refuses a file larger than Cloudflare Pages serves', () => {
    const { opts, put } = fixture();
    put('builds/b-new/tiles/huge.lwt', 'x'.repeat(25 * 1024 * 1024 + 1));
    expect(() => assembleSite(opts)).toThrow(/huge\.lwt/);
  });

  it('deduplicates content-addressed builds into world/builds/blobs/<sha256> when manifest.json is present', () => {
    const { root, opts, put } = fixture();
    const sharedHash = 'a'.repeat(64);
    const tilesetHash = 'b'.repeat(64);
    put(`builds/blobs/${sharedHash}`, 'identical-tile-bytes');
    put(`builds/blobs/${tilesetHash}`, '{"format":"lightworld-tileset@4","build":"b-new"}');
    put('builds/b-new/tileset.json', '{"format":"lightworld-tileset@4","build":"b-new"}');
    put(
      'builds/b-new/manifest.json',
      JSON.stringify({
        format: 'lightworld-manifest@1',
        build: 'b-new',
        blobs: '../blobs/',
        files: {
          'tileset.json': tilesetHash,
          'tiles/0.lwt': sharedHash,
          'tiles/1.lwt': sharedHash,
        },
      }),
    );
    assembleSite(opts);
    const out = join(root, 'out');
    expect(existsSync(join(out, 'world/builds/b-new/manifest.json'))).toBe(true);
    expect(existsSync(join(out, 'world/builds/b-new/tileset.json'))).toBe(true);
    expect(readFileSync(join(out, `world/builds/blobs/${sharedHash}`), 'utf8')).toBe('identical-tile-bytes');
    expect(existsSync(join(out, `world/builds/blobs/${tilesetHash}`))).toBe(true);
    // Individual duplicate logical paths are not duplicated under b-new/ when served via blobs/.
    expect(existsSync(join(out, 'world/builds/b-new/tiles/0.lwt'))).toBe(false);
    expect(existsSync(join(out, 'world/builds/b-new/tiles/1.lwt'))).toBe(false);
  });
});
