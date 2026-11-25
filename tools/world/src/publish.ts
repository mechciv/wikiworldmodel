// Content-addressed publishing to Cloudflare R2 / S3:
// - Build publishing: uploads ONLY missing immutable blobs to `blobs/<sha256>` (pre-compressed
//   with brotli/gzip for .lwt/JSON/text), then uploads the small `<buildId>/manifest.json` last as
//   an atomic commit marker. Re-deploys after 1-line edits upload only the handful of changed blobs.
// - Snapshot publishing: uploads raw snapshot datasets referenced by `blob:<sha256>` in
//   world/manifest.yaml into `blobs/<sha256>` (pre-compressed for JSON/CSV/GeoJSON, raw for .zip).
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BuildManifest } from '../../../core/records.ts';
import { blobPath, snapshotDatasets, stageBlobsFromGit } from './blobs.ts';
import { compressPayload, type CompressionEncoding } from './compress.ts';
import { resolveDatasetFile } from './manifest.ts';
import { BLOBS, BUILD_CACHE, BUILDS } from './paths.ts';
import type { S3Client } from './s3.ts';
import { sha256 } from './util.ts';
import type { Manifest } from './world.ts';

export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
export const DEFAULT_CONCURRENCY = 32;

export interface PublishBuildOptions {
  buildId?: string;
  buildsDir?: string;
  blobDir?: string;
  s3: S3Client;
  encoding?: CompressionEncoding;
  brotliQuality?: number;
  concurrency?: number;
  log?: (s: string) => void;
}

export interface PublishBuildResult {
  buildId: string;
  alreadyPublished: boolean;
  totalFiles: number;
  uniqueBlobs: number;
  uploadedBlobs: number;
  skippedBlobs: number;
  rawBytes: number;
  wireBytes: number;
  tilesetSha256: string;
}

/** Run an async worker pool over `items` with bounded concurrency. */
async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

/**
 * Publish a world build to the content-addressed R2/S3 store:
 *   1. Deduplicate against existing `blobs/` keys via ListObjectsV2.
 *   2. Compress and upload only missing blobs to `blobs/<sha256>` with `Content-Encoding` and
 *      `Cache-Control: public, max-age=31536000, immutable`.
 *   3. Upload `<buildId>/manifest.json` last so a build whose manifest exists is guaranteed whole.
 */
export async function publishBuild(opts: PublishBuildOptions): Promise<PublishBuildResult> {
  const buildsDir = opts.buildsDir ?? BUILDS;
  const blobDir = opts.blobDir ?? join(BUILD_CACHE, 'blobs');
  const encoding = opts.encoding ?? 'br';
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const log = opts.log ?? console.log;

  const buildId =
    opts.buildId ??
    (JSON.parse(await readFile(join(buildsDir, 'index.json'), 'utf8')) as { latest: string }).latest;
  const dir = join(buildsDir, buildId);
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`${manifestPath} is missing: build the world first with \`npm run build:world\``);
  }
  const manifestBytes = new Uint8Array(await readFile(manifestPath));
  const manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8')) as BuildManifest;
  const tilesetSha256 = manifest.files['tileset.json'];
  if (!tilesetSha256) throw new Error(`${manifestPath} does not list tileset.json`);

  // Deduplicate logical paths to unique content hashes; prefer a path with a known extension for Content-Type.
  const byHash = new Map<string, string>();
  for (const [relPath, hash] of Object.entries(manifest.files)) {
    if (!byHash.has(hash)) byHash.set(hash, relPath);
  }
  const totalFiles = Object.keys(manifest.files).length;
  const uniqueBlobs = byHash.size;

  const manifestKey = `${buildId}/manifest.json`;
  if (await opts.s3.headObject(manifestKey)) {
    log(`build ${buildId} is already published (${totalFiles} files, ${uniqueBlobs} unique blobs)`);
    return {
      buildId,
      alreadyPublished: true,
      totalFiles,
      uniqueBlobs,
      uploadedBlobs: 0,
      skippedBlobs: uniqueBlobs,
      rawBytes: 0,
      wireBytes: 0,
      tilesetSha256,
    };
  }

  const existing = await opts.s3.listKeys('blobs/');
  const missing: { hash: string; relPath: string }[] = [];
  for (const [hash, relPath] of byHash) {
    if (!existing.has(`blobs/${hash}`)) missing.push({ hash, relPath });
  }
  const skippedBlobs = uniqueBlobs - missing.length;
  log(
    `publish ${buildId}: ${totalFiles} files (${uniqueBlobs} unique blobs; ${skippedBlobs} already in store, ${missing.length} to upload, encoding=${encoding})`,
  );

  let rawBytes = 0;
  let wireBytes = 0;
  await mapPool(missing, concurrency, async ({ hash, relPath }) => {
    const candidate = blobPath(hash, blobDir);
    const src = existsSync(candidate) ? candidate : join(dir, relPath);
    const raw = new Uint8Array(await readFile(src));
    const got = sha256(raw);
    if (got !== hash) throw new Error(`blob integrity failure for ${relPath}: expected ${hash}, got ${got}`);
    const payload = await compressPayload(raw, relPath, encoding, { brotliQuality: opts.brotliQuality });
    rawBytes += payload.rawBytes;
    wireBytes += payload.wireBytes;
    await opts.s3.putObject(`blobs/${hash}`, payload.body, {
      contentType: payload.contentType,
      contentEncoding: payload.contentEncoding,
      cacheControl: IMMUTABLE_CACHE,
      metadata: { 'uncompressed-sha256': hash, 'uncompressed-bytes': String(payload.rawBytes) },
    });
  });

  // Upload the small per-build manifest LAST as the atomic commit marker.
  const manifestPayload = await compressPayload(manifestBytes, 'manifest.json', encoding, { brotliQuality: opts.brotliQuality });
  rawBytes += manifestPayload.rawBytes;
  wireBytes += manifestPayload.wireBytes;
  await opts.s3.putObject(manifestKey, manifestPayload.body, {
    contentType: manifestPayload.contentType,
    contentEncoding: manifestPayload.contentEncoding,
    cacheControl: IMMUTABLE_CACHE,
    metadata: { 'uncompressed-sha256': sha256(manifestBytes), 'uncompressed-bytes': String(manifestPayload.rawBytes) },
  });

  const savedPct = rawBytes > 0 ? Math.round((1 - wireBytes / rawBytes) * 100) : 0;
  log(
    `build ${buildId} published: ${missing.length} blobs + manifest uploaded (${(wireBytes / 1e6).toFixed(2)} MB on wire vs ${(rawBytes / 1e6).toFixed(2)} MB raw, ${savedPct}% saved); ${skippedBlobs} blobs reused`,
  );
  return {
    buildId,
    alreadyPublished: false,
    totalFiles,
    uniqueBlobs,
    uploadedBlobs: missing.length,
    skippedBlobs,
    rawBytes,
    wireBytes,
    tilesetSha256,
  };
}

export interface PublishSnapshotsOptions {
  manifest: Manifest;
  blobDir?: string;
  s3: S3Client;
  encoding?: CompressionEncoding;
  brotliQuality?: number;
  concurrency?: number;
  /** Optional git revision to extract legacy `world/snapshots/*` blobs from before uploading. */
  fromGit?: string;
  log?: (s: string) => void;
}

export interface PublishSnapshotsResult {
  total: number;
  uploaded: number;
  skipped: number;
  rawBytes: number;
  wireBytes: number;
}

/**
 * Upload every `blob:<sha256>` snapshot dataset in `world/manifest.yaml` that is not yet present
 * in the remote `blobs/<sha256>` store. Every file is verified against its manifest sha256 & size.
 */
export async function publishSnapshots(opts: PublishSnapshotsOptions): Promise<PublishSnapshotsResult> {
  const blobDir = opts.blobDir ?? BLOBS;
  const encoding = opts.encoding ?? 'br';
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const log = opts.log ?? console.log;

  if (opts.fromGit) {
    await stageBlobsFromGit(opts.manifest, opts.fromGit, { blobDir, log });
  }

  const snaps = snapshotDatasets(opts.manifest);
  const existing = await opts.s3.listKeys('blobs/');
  const missing = snaps.filter(([, d]) => !existing.has(`blobs/${d.fetch.sha256}`));
  const skipped = snaps.length - missing.length;
  log(`snapshots: ${snaps.length} total (${skipped} already in store, ${missing.length} to upload, encoding=${encoding})`);

  let rawBytes = 0;
  let wireBytes = 0;
  await mapPool(missing, concurrency, async ([id, d]) => {
    const hash = d.fetch.sha256;
    const local = existsSync(blobPath(hash, blobDir)) ? blobPath(hash, blobDir) : resolveDatasetFile(id, d);
    if (!existsSync(local)) {
      throw new Error(`snapshot ${id} (${hash}) not found locally at ${blobPath(hash, blobDir)}; run with --from-git <rev> or generate it first`);
    }
    const raw = new Uint8Array(await readFile(local));
    const got = sha256(raw);
    if (got !== hash || raw.byteLength !== d.fetch.bytes) {
      throw new Error(`snapshot ${id}: integrity check failed (expected ${hash} / ${d.fetch.bytes} B, got ${got} / ${raw.byteLength} B)`);
    }
    const name = d.fetch.filename ?? `${hash}.${d.fetch.format}`;
    const payload = await compressPayload(raw, name, encoding, { brotliQuality: opts.brotliQuality });
    rawBytes += payload.rawBytes;
    wireBytes += payload.wireBytes;
    await opts.s3.putObject(`blobs/${hash}`, payload.body, {
      contentType: payload.contentType,
      contentEncoding: payload.contentEncoding,
      cacheControl: IMMUTABLE_CACHE,
      metadata: { 'uncompressed-sha256': hash, 'uncompressed-bytes': String(payload.rawBytes) },
    });
    log(`uploaded ${id} → blobs/${hash} (${(payload.wireBytes / 1e6).toFixed(2)} MB${payload.contentEncoding ? ` ${payload.contentEncoding}` : ''})`);
  });

  return { total: snaps.length, uploaded: missing.length, skipped, rawBytes, wireBytes };
}
