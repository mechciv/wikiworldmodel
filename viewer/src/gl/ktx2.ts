// Khronos KTX 2.0 binary container parser/writer and WebGL 2 hardware block-compressed texture
// format negotiation. Lets the material pipeline load GPU-compressed ASTC, BC7, ETC2, or BC3
// mipmapped texture arrays directly into VRAM with zero CPU image decoding or unpack passes,
// while falling back cleanly to WebP when compressed packs are not present.
import { unzlibSync, zlibSync } from 'fflate';

/** Standard 12-byte Khronos KTX 2.0 file identifier («KTX 20»\r\n\x1A\n). */
export const KTX2_IDENTIFIER = new Uint8Array([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);

/** KTX 2.0 supercompression scheme codes. */
export const KTX2_SUPERCOMPRESSION = {
  NONE: 0,
  BASIS_LZ: 1,
  ZSTANDARD: 2,
  ZLIB: 3,
} as const;

/** Relevant Vulkan format codes carried in KTX2 headers. */
export const VK_FORMAT = {
  UNDEFINED: 0,
  R8G8B8A8_UNORM: 37,
  R8G8B8A8_SRGB: 43,
  BC3_UNORM_BLOCK: 137,
  BC3_SRGB_BLOCK: 138,
  BC7_UNORM_BLOCK: 145,
  BC7_SRGB_BLOCK: 146,
  ETC2_R8G8B8A8_UNORM_BLOCK: 151,
  ETC2_R8G8B8A8_SRGB_BLOCK: 152,
  ASTC_4x4_UNORM_BLOCK: 157,
  ASTC_4x4_SRGB_BLOCK: 158,
} as const;

export type CompressedFormatName = 'astc' | 'bc7' | 'etc2' | 'bc3' | 'none';

export interface CompressedFormatInfo {
  /** Preferred hardware-supported compressed texture family, or 'none'. */
  family: CompressedFormatName;
  /** WebGL 2 compressed internal format enum for sRGB colour textures (0 when family is 'none'). */
  srgb: number;
  /** WebGL 2 compressed internal format enum for linear normal/data textures (0 when family is 'none'). */
  linear: number;
  /** Corresponding KTX2 vkFormat for sRGB colour textures. */
  vkSrgb: number;
  /** Corresponding KTX2 vkFormat for linear data textures. */
  vkLinear: number;
  /** All supported families on this GPU, in preference order. */
  supported: Exclude<CompressedFormatName, 'none'>[];
}

export interface KTX2Level {
  width: number;
  height: number;
  byteOffset: number;
  byteLength: number;
  uncompressedByteLength: number;
  data: Uint8Array;
}

export interface KTX2File {
  vkFormat: number;
  typeSize: number;
  width: number;
  height: number;
  depth: number;
  layerCount: number;
  faceCount: number;
  levelCount: number;
  supercompressionScheme: number;
  levels: KTX2Level[];
}

const KTX2_HEADER_BYTES = 80;
const KTX2_LEVEL_INDEX_BYTES = 24;

/** Detect hardware-supported GPU block-compressed texture formats on a WebGL 2 context. */
export function detectCompressedFormats(gl: { getExtension(name: string): unknown }): CompressedFormatInfo {
  const supported: Exclude<CompressedFormatName, 'none'>[] = [];
  let chosen: Omit<CompressedFormatInfo, 'supported'> | null = null;

  const astc = gl.getExtension('WEBGL_compressed_texture_astc') as {
    COMPRESSED_RGBA_ASTC_4x4_KHR: number;
    COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR: number;
  } | null;
  if (astc) {
    supported.push('astc');
    chosen ??= {
      family: 'astc',
      srgb: astc.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR,
      linear: astc.COMPRESSED_RGBA_ASTC_4x4_KHR,
      vkSrgb: VK_FORMAT.ASTC_4x4_SRGB_BLOCK,
      vkLinear: VK_FORMAT.ASTC_4x4_UNORM_BLOCK,
    };
  }

  const bptc = gl.getExtension('EXT_texture_compression_bptc') as {
    COMPRESSED_RGBA_BPTC_UNORM_EXT: number;
    COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT: number;
  } | null;
  if (bptc) {
    supported.push('bc7');
    chosen ??= {
      family: 'bc7',
      srgb: bptc.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT,
      linear: bptc.COMPRESSED_RGBA_BPTC_UNORM_EXT,
      vkSrgb: VK_FORMAT.BC7_SRGB_BLOCK,
      vkLinear: VK_FORMAT.BC7_UNORM_BLOCK,
    };
  }

  const etc = gl.getExtension('WEBGL_compressed_texture_etc') as {
    COMPRESSED_RGBA8_ETC2_EAC: number;
    COMPRESSED_SRGB8_ALPHA8_ETC2_EAC: number;
  } | null;
  if (etc) {
    supported.push('etc2');
    chosen ??= {
      family: 'etc2',
      srgb: etc.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC,
      linear: etc.COMPRESSED_RGBA8_ETC2_EAC,
      vkSrgb: VK_FORMAT.ETC2_R8G8B8A8_SRGB_BLOCK,
      vkLinear: VK_FORMAT.ETC2_R8G8B8A8_UNORM_BLOCK,
    };
  }

  const s3tc = gl.getExtension('WEBGL_compressed_texture_s3tc') as { COMPRESSED_RGBA_S3TC_DXT5_EXT: number } | null;
  const s3tcSrgb = gl.getExtension('WEBGL_compressed_texture_s3tc_srgb') as { COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT: number } | null;
  if (s3tc && s3tcSrgb) {
    supported.push('bc3');
    chosen ??= {
      family: 'bc3',
      srgb: s3tcSrgb.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT,
      linear: s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT,
      vkSrgb: VK_FORMAT.BC3_SRGB_BLOCK,
      vkLinear: VK_FORMAT.BC3_UNORM_BLOCK,
    };
  }

  return chosen ? { ...chosen, supported } : { family: 'none', srgb: 0, linear: 0, vkSrgb: 0, vkLinear: 0, supported };
}

/** Expected compressed byte length for one 2D image of a 4x4 block-compressed format (16 bytes/block). */
export function blockCompressedSize(width: number, height: number, bytesPerBlock = 16): number {
  const bx = Math.max(1, Math.ceil(width / 4));
  const by = Math.max(1, Math.ceil(height / 4));
  return bx * by * bytesPerBlock;
}

/** Read an unsigned 64-bit little-endian integer as a safe JS number. */
function readU64(view: DataView, offset: number): number {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  const val = hi * 4294967296 + lo;
  if (!Number.isSafeInteger(val)) throw new Error('KTX2 64-bit offset exceeds safe integer range');
  return val;
}

function writeU64(view: DataView, offset: number, val: number): void {
  view.setUint32(offset, val >>> 0, true);
  view.setUint32(offset + 4, Math.floor(val / 4294967296) >>> 0, true);
}

/** Parse a Khronos KTX 2.0 binary container into mip levels (supports uncompressed and ZLIB supercompression). */
export function parseKTX2(buffer: ArrayBuffer | Uint8Array): KTX2File {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength < KTX2_HEADER_BYTES) throw new Error(`KTX2 too small (${bytes.byteLength} bytes)`);
  for (let i = 0; i < KTX2_IDENTIFIER.length; i++) {
    if (bytes[i] !== KTX2_IDENTIFIER[i]) throw new Error('Invalid KTX2 file identifier');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vkFormat = view.getUint32(12, true);
  const typeSize = view.getUint32(16, true);
  const width = view.getUint32(20, true);
  const height = Math.max(1, view.getUint32(24, true));
  const depth = view.getUint32(28, true);
  const layerCount = view.getUint32(32, true);
  const faceCount = Math.max(1, view.getUint32(36, true));
  const levelCount = Math.max(1, view.getUint32(40, true));
  const supercompressionScheme = view.getUint32(44, true);

  if (width === 0) throw new Error('KTX2 width must be > 0');
  const indexEnd = KTX2_HEADER_BYTES + levelCount * KTX2_LEVEL_INDEX_BYTES;
  if (bytes.byteLength < indexEnd) throw new Error('KTX2 truncated in level index');
  if (supercompressionScheme !== KTX2_SUPERCOMPRESSION.NONE && supercompressionScheme !== KTX2_SUPERCOMPRESSION.ZLIB) {
    throw new Error(`Unsupported KTX2 supercompression scheme ${supercompressionScheme}`);
  }

  const levels: KTX2Level[] = [];
  for (let i = 0; i < levelCount; i++) {
    const base = KTX2_HEADER_BYTES + i * KTX2_LEVEL_INDEX_BYTES;
    const byteOffset = readU64(view, base);
    const byteLength = readU64(view, base + 8);
    const uncompressedByteLength = readU64(view, base + 16);
    if (byteOffset + byteLength > bytes.byteLength) throw new Error(`KTX2 level ${i} exceeds buffer bounds`);
    const raw = bytes.subarray(byteOffset, byteOffset + byteLength);
    const data = supercompressionScheme === KTX2_SUPERCOMPRESSION.ZLIB ? unzlibSync(raw) : raw;
    if (supercompressionScheme === KTX2_SUPERCOMPRESSION.ZLIB && data.byteLength !== uncompressedByteLength) {
      throw new Error(`KTX2 level ${i} uncompressed size ${data.byteLength} != header ${uncompressedByteLength}`);
    }
    levels.push({
      width: Math.max(1, width >> i),
      height: Math.max(1, height >> i),
      byteOffset,
      byteLength,
      uncompressedByteLength,
      data,
    });
  }

  return { vkFormat, typeSize, width, height, depth, layerCount, faceCount, levelCount, supercompressionScheme, levels };
}

/** Serialize mip level payloads into a valid Khronos KTX 2.0 binary container. */
export function writeKTX2(opts: {
  vkFormat: number;
  width: number;
  height: number;
  levels: Uint8Array[];
  supercompression?: 'none' | 'zlib';
  typeSize?: number;
  layerCount?: number;
}): Uint8Array {
  const { vkFormat, width, height, levels } = opts;
  if (!levels.length) throw new Error('writeKTX2 requires at least one mip level');
  const scheme = opts.supercompression === 'zlib' ? KTX2_SUPERCOMPRESSION.ZLIB : KTX2_SUPERCOMPRESSION.NONE;
  const payloads = levels.map((lvl) => (scheme === KTX2_SUPERCOMPRESSION.ZLIB ? zlibSync(lvl) : lvl));

  // Level payloads are stored from smallest mip to largest (per KTX2 spec), 16-byte aligned.
  const indexBytes = KTX2_HEADER_BYTES + levels.length * KTX2_LEVEL_INDEX_BYTES;
  const align16 = (n: number) => (n + 15) & ~15;
  const offsets = new Array<number>(levels.length);
  let cursor = align16(indexBytes);
  for (let i = levels.length - 1; i >= 0; i--) {
    offsets[i] = cursor;
    cursor = align16(cursor + payloads[i].byteLength);
  }

  const out = new Uint8Array(cursor);
  out.set(KTX2_IDENTIFIER, 0);
  const view = new DataView(out.buffer);
  view.setUint32(12, vkFormat, true);
  view.setUint32(16, opts.typeSize ?? 1, true);
  view.setUint32(20, width, true);
  view.setUint32(24, height, true);
  view.setUint32(28, 0, true);
  view.setUint32(32, opts.layerCount ?? 0, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, levels.length, true);
  view.setUint32(44, scheme, true);

  for (let i = 0; i < levels.length; i++) {
    const base = KTX2_HEADER_BYTES + i * KTX2_LEVEL_INDEX_BYTES;
    writeU64(view, base, offsets[i]);
    writeU64(view, base + 8, payloads[i].byteLength);
    writeU64(view, base + 16, levels[i].byteLength);
    out.set(payloads[i], offsets[i]);
  }
  return out;
}
