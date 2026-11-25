import { describe, expect, it } from 'vitest';
import { buildFileUrl, buildStore, type BuildManifest } from './records.ts';

describe('where the builds of an index are', () => {
  const index = 'https://wikiworldmodel.org/world/builds/index.json';

  it('beside the index, when it names no store', () => {
    expect(buildStore({}, index)).toBe('https://wikiworldmodel.org/world/builds/');
    expect(buildStore({}, 'http://localhost:4173/builds/index.json')).toBe('http://localhost:4173/builds/');
  });

  it('in the store it names, absolute or relative to the index, always as a directory', () => {
    expect(buildStore({ store: 'https://builds.wikiworldmodel.org/' }, index)).toBe('https://builds.wikiworldmodel.org/');
    expect(buildStore({ store: 'https://builds.wikiworldmodel.org' }, index)).toBe('https://builds.wikiworldmodel.org/');
    expect(buildStore({ store: '../store' }, index)).toBe('https://wikiworldmodel.org/world/store/');
  });
});

describe('resolving a build file URL through a manifest', () => {
  const base = 'https://builds.wikiworldmodel.org/abc123/';
  const hash = 'a'.repeat(64);
  const manifest: BuildManifest = {
    format: 'lightworld-manifest@1',
    build: 'abc123',
    blobs: '../blobs/',
    files: { 'tileset.json': hash, 'tiles/0/0-0/b0.lwt': 'b'.repeat(64) },
  };

  it('resolves mapped files to content-addressed blobs relative to the build directory', () => {
    expect(buildFileUrl(base, 'tileset.json', manifest)).toBe(`https://builds.wikiworldmodel.org/blobs/${hash}`);
    expect(buildFileUrl(base, 'tiles/0/0-0/b0.lwt', manifest)).toBe(`https://builds.wikiworldmodel.org/blobs/${'b'.repeat(64)}`);
  });

  it('supports an absolute blob store URL and trailing-slash normalization', () => {
    const abs: BuildManifest = { ...manifest, blobs: 'https://cdn.example.org/blobs' };
    expect(buildFileUrl(base, 'tileset.json', abs)).toBe(`https://cdn.example.org/blobs/${hash}`);
  });

  it('falls back to the direct build path when no manifest is present or a path is unmapped', () => {
    expect(buildFileUrl(base, 'tileset.json')).toBe('https://builds.wikiworldmodel.org/abc123/tileset.json');
    expect(buildFileUrl(base, 'unknown.json', manifest)).toBe('https://builds.wikiworldmodel.org/abc123/unknown.json');
  });
});

