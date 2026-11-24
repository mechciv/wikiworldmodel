// Pre-compression (brotli / gzip) and MIME type detection for content-addressed R2/S3 uploads
// and local preview serving. Uncompressed .lwt typed arrays and JSON shrink 5–15x on the wire.
import { extname } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

export type CompressionEncoding = 'br' | 'gzip' | 'none';

/** Minimum raw byte length worth compressing (tiny objects save nothing after framing). */
export const MIN_COMPRESS_BYTES = 256;

/** Maximum ratio of compressed/raw size to keep compressed form (skip already-compressed payloads). */
export const MAX_COMPRESS_RATIO = 0.95;

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.lwt': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ktx2': 'image/ktx2',
};

const TEXT_EXTS = new Set(['.json', '.geojson', '.csv', '.tsv', '.md', '.txt', '.svg']);
const BINARY_COMPRESSIBLE_EXTS = new Set(['.lwt', '.bin']);

export function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

export function isCompressible(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return TEXT_EXTS.has(ext) || BINARY_COMPRESSIBLE_EXTS.has(ext);
}

export interface CompressedPayload {
  body: Uint8Array;
  contentEncoding?: 'br' | 'gzip';
  contentType: string;
  rawBytes: number;
  wireBytes: number;
}

export interface CompressOptions {
  /** Brotli quality 0..11; 6 gives ~97% of max compression at ~10x the speed of 11. */
  brotliQuality?: number;
  /** Gzip level 1..9; defaults to 9. */
  gzipLevel?: number;
}

/**
 * Pre-compress a payload with brotli or gzip when the file type is compressible and compression
 * shrinks it by at least 5%. Already-compressed files (e.g. .zip, deflated relief tiles) stay raw.
 */
export async function compressPayload(
  raw: Uint8Array,
  path: string,
  encoding: CompressionEncoding = 'br',
  opts: CompressOptions = {},
): Promise<CompressedPayload> {
  const contentType = contentTypeFor(path);
  const rawBytes = raw.byteLength;
  if (encoding === 'none' || rawBytes < MIN_COMPRESS_BYTES || !isCompressible(path)) {
    return { body: raw, contentType, rawBytes, wireBytes: rawBytes };
  }
  const ext = extname(path).toLowerCase();
  let compressed: Buffer;
  if (encoding === 'br') {
    const mode = TEXT_EXTS.has(ext) ? zlibConstants.BROTLI_MODE_TEXT : zlibConstants.BROTLI_MODE_GENERIC;
    const quality = opts.brotliQuality ?? 6;
    compressed = await brotliAsync(raw, {
      params: {
        [zlibConstants.BROTLI_PARAM_MODE]: mode,
        [zlibConstants.BROTLI_PARAM_QUALITY]: quality,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: rawBytes,
      },
    });
  } else {
    compressed = await gzipAsync(raw, { level: opts.gzipLevel ?? 9 });
  }
  if (compressed.byteLength >= rawBytes * MAX_COMPRESS_RATIO) {
    return { body: raw, contentType, rawBytes, wireBytes: rawBytes };
  }
  return {
    body: new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength),
    contentEncoding: encoding,
    contentType,
    rawBytes,
    wireBytes: compressed.byteLength,
  };
}
