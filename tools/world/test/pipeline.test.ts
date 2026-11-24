// Unit tests for Phase 1 rendering pipeline foundations: shadow-cascade culling, hemi-octahedral
// impostor math, KTX2 container parsing/compression/format negotiation, and WebGPU capability probe.
import { describe, expect, it } from 'vitest';
import {
  batchOverlapsCascade,
  cloudLayerFor,
  computeBatchBounds,
  computeProtoBounds,
  halfSize,
  hemiOctDecode,
  hemiOctEncode,
  INSTANCE_STRIDE,
  localEffectWeights,
  octFrame,
  octGridWeights,
  PLANET_RADIUS,
  reprojectMatrix,
  scaledRenderSize,
  smoothDown,
  VERTEX_STRIDE,
  WAY_STRIDE,
  type CascadeBox,
} from '../../../viewer/src/gl/culling.ts';
import { IMP_CELL, IMP_GRID, IMP_MAX_LEVEL, IMP_SIZE } from '../../../viewer/src/gl/impostors.ts';
import {
  blockCompressedSize,
  detectCompressedFormats,
  KTX2_IDENTIFIER,
  KTX2_SUPERCOMPRESSION,
  parseKTX2,
  VK_FORMAT,
  writeKTX2,
} from '../../../viewer/src/gl/ktx2.ts';
import { probeWebGPU, selectRenderBackend } from '../../../viewer/src/gl/webgpu.ts';
import { lookAt, multiply, perspective, type Mat4, type V3 } from '../../../viewer/src/mat.ts';

function packVertices(verts: { x: number; y: number; z: number; mat: number }[]): ArrayBuffer {
  const buf = new ArrayBuffer(verts.length * VERTEX_STRIDE);
  const f32 = new Float32Array(buf);
  const u8 = new Uint8Array(buf);
  verts.forEach((v, i) => {
    const o = i * 7;
    f32[o] = v.x;
    f32[o + 1] = v.y;
    f32[o + 2] = v.z;
    u8[i * VERTEX_STRIDE + 24] = v.mat;
  });
  return buf;
}

function packInstances(items: { x: number; y: number; z: number; scale: number }[]): ArrayBuffer {
  const buf = new ArrayBuffer(items.length * INSTANCE_STRIDE);
  const f32 = new Float32Array(buf);
  items.forEach((it, i) => {
    const o = i * 7;
    f32[o] = it.x;
    f32[o + 1] = it.y;
    f32[o + 2] = it.z;
    f32[o + 3] = it.scale;
    f32[o + 4] = 0;
    f32[o + 5] = 1;
  });
  return buf;
}

function makeCascade(overrides: Partial<CascadeBox> = {}): CascadeBox {
  const sun: V3 = overrides.sun ?? [0, 0.6, 0.8];
  const right: V3 = overrides.right ?? [1, 0, 0];
  const up: V3 = overrides.up ?? [0, -0.8, 0.6];
  return {
    right,
    up,
    sun,
    sR: 0,
    sU: 0,
    radius: 100,
    texel: (100 * 2) / 2048,
    cascadeIndex: 0,
    ...overrides,
  };
}

describe('rendering pipeline culling & octahedral math', () => {
  it('computes prototype bounds and foliage/plant material flags accurately', () => {
    const empty = computeProtoBounds(new ArrayBuffer(0));
    expect(empty.sphereRadius).toBe(0);
    expect(empty.hasCards).toBe(false);
    expect(empty.isPlant).toBe(false);

    const stone = computeProtoBounds(
      packVertices([
        { x: -1, y: 0, z: 0, mat: 74 },
        { x: 1, y: 2, z: 1.5, mat: 74 },
      ]),
    );
    expect(stone.hasCards).toBe(false);
    expect(stone.isPlant).toBe(false);
    expect(stone.minZ).toBe(0);
    expect(stone.maxZ).toBe(1.5);
    expect(stone.midZ).toBeCloseTo(0.75);
    expect(stone.xyRadius).toBeCloseTo(Math.hypot(1, 2));

    const tree = computeProtoBounds(
      packVertices([
        { x: 0, y: 0, z: 0, mat: 37 }, // BARK
        { x: -3, y: 4, z: 10, mat: 46 }, // BROAD_CARD
        { x: 3, y: -4, z: 2, mat: 46 },
      ]),
    );
    expect(tree.hasCards).toBe(true);
    expect(tree.isPlant).toBe(true);
    expect(tree.midZ).toBeCloseTo(5);
    expect(tree.xyRadius).toBeCloseTo(5);
    expect(tree.sphereRadius).toBeCloseTo(Math.hypot(3, 4, 5));
    expect(tree.originRadius).toBeCloseTo(Math.hypot(3, 4, 10));
  });

  it('computes world batch bounds for static, walking, and circling batches', () => {
    const proto = computeProtoBounds(
      packVertices([
        { x: -1, y: -1, z: 0, mat: 31 }, // HIDE (non-plant)
        { x: 1, y: 1, z: 2, mat: 31 },
      ]),
    );
    const data = packInstances([
      { x: 10, y: 20, z: 5, scale: 2 },
      { x: -5, y: 0, z: 3, scale: 1 },
    ]);
    const staticB = computeBatchBounds(data, 2, proto);
    expect(staticB.hasMovers).toBe(false);
    expect(staticB.maxScale).toBe(2);
    expect(staticB.maxHeight).toBeCloseTo(4);
    expect(staticB.maxX).toBeGreaterThan(10 + proto.xyRadius * 2);
    expect(staticB.minX).toBeLessThan(-5 - proto.xyRadius);

    // Walking route (kind = 0) expands bounds by waypoints A and B.
    const ways = new Float32Array(2 * WAY_STRIDE);
    ways[0] = 50; // A.x for instance 0
    ways[1] = -30; // A.y
    ways[4] = -20; // B.x
    ways[5] = 40; // B.y
    ways[8] = 1.5; // speed > 0
    ways[11] = 0; // kind = loop
    const walkB = computeBatchBounds(data, 2, proto, ways.buffer);
    expect(walkB.hasMovers).toBe(true);
    expect(walkB.maxX).toBeGreaterThan(60);
    expect(walkB.minY).toBeLessThan(-10);

    // Circling route (kind = 2) expands by full circle diameter around center (x + ax, y + ay).
    const circleWays = new Float32Array(2 * WAY_STRIDE);
    circleWays[0] = 0;
    circleWays[1] = 25; // center is (10, 45), radius 25 -> reaches y = 70, x = -15..35
    circleWays[8] = 4;
    circleWays[11] = 2;
    const circleB = computeBatchBounds(data, 2, proto, circleWays.buffer);
    expect(circleB.hasMovers).toBe(true);
    expect(circleB.maxY).toBeGreaterThan(70);
    expect(circleB.maxX).toBeGreaterThan(35);
    expect(circleB.minX).toBeLessThan(-15);
  });

  it('culls batches per shadow cascade by frustum, curvature drop, and sub-texel footprint', () => {
    const bigTreeProto = computeProtoBounds(
      packVertices([
        { x: -4, y: 0, z: 0, mat: 37 },
        { x: 4, y: 0, z: 18, mat: 46 },
      ]),
    );
    const smallTuftProto = computeProtoBounds(
      packVertices([
        { x: -0.2, y: 0, z: 0, mat: 49 },
        { x: 0.2, y: 0, z: 0.4, mat: 49 },
      ]),
    );

    const nearTree = computeBatchBounds(packInstances([{ x: 10, y: 10, z: 0, scale: 1 }]), 1, bigTreeProto);
    const farOutside = computeBatchBounds(packInstances([{ x: 800, y: 0, z: 0, scale: 1 }]), 1, bigTreeProto);
    const smallTuft = computeBatchBounds(packInstances([{ x: 0, y: 0, z: 0, scale: 1 }]), 1, smallTuftProto);

    const c0 = makeCascade({ radius: 100, texel: 200 / 2048, cascadeIndex: 0 });
    const c1 = makeCascade({ radius: 500, texel: 1000 / 2048, cascadeIndex: 1 });
    const c2 = makeCascade({ radius: 9000, texel: 18000 / 2048, cascadeIndex: 2 });

    expect(batchOverlapsCascade(nearTree, c0)).toBe(true);
    expect(batchOverlapsCascade(farOutside, c0)).toBe(false);
    expect(batchOverlapsCascade(farOutside, c2)).toBe(true);

    // Small tuft stays in cascade 0, but is skipped in cascades >= 1 where its shadow is < 2 texels.
    expect(batchOverlapsCascade(smallTuft, c0)).toBe(true);
    expect(batchOverlapsCascade(smallTuft, c1)).toBe(false);
    expect(batchOverlapsCascade(smallTuft, c2)).toBe(false);

    // A medium bush (height 2.5m) skipped at noon in cascade 2 (texel ~8.8m -> 2*texel ~17.6m)
    // is kept at very low sun (sun.z = 0.12 -> clamped 0.15 -> shadow ~16.7m; height 3m -> 20m > 17.6m).
    const tallShrubProto = computeProtoBounds(
      packVertices([
        { x: -0.5, y: 0, z: 0, mat: 46 },
        { x: 0.5, y: 0, z: 3, mat: 46 },
      ]),
    );
    const tallShrub = computeBatchBounds(packInstances([{ x: 0, y: 0, z: 0, scale: 1 }]), 1, tallShrubProto);
    expect(batchOverlapsCascade(tallShrub, makeCascade({ radius: 9000, texel: 18000 / 2048, cascadeIndex: 2, sun: [0, 0.2, 0.98] }))).toBe(false);
    expect(batchOverlapsCascade(tallShrub, makeCascade({ radius: 9000, texel: 18000 / 2048, cascadeIndex: 2, sun: [0, 0.99, 0.14] }))).toBe(true);

    // Curvature drop shifts very distant high-elevation objects downward in z.
    const dist = 50000;
    const dropZ = (dist * dist) / (2 * PLANET_RADIUS);
    const curved = computeBatchBounds(packInstances([{ x: 0, y: dist, z: dropZ, scale: 1 }]), 1, bigTreeProto);
    // Project along up = [0, 0, 1] (horizontal sun along +y) to check curvature-adjusted Z lies near 0.
    const horizSun = makeCascade({ right: [1, 0, 0], up: [0, 0, 1], sun: [0, 1, 0.2], sR: 0, sU: 0, radius: 50, texel: 0.1, cascadeIndex: 0 });
    expect(batchOverlapsCascade(curved, horizSun)).toBe(true);
  });

  it('round-trips hemi-octahedral encoding, builds orthonormal frames, and sums barycentric weights to 1', () => {
    const dirs: V3[] = [
      [0, 0, 1],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0.5, 0.5, Math.SQRT1_2],
      [-0.6, 0.4, Math.sqrt(1 - 0.52)],
      [0.2, -0.8, Math.sqrt(1 - 0.68)],
    ];
    for (const d of dirs) {
      const [u, v] = hemiOctEncode(d[0], d[1], d[2]);
      expect(u).toBeGreaterThanOrEqual(-1e-6);
      expect(u).toBeLessThanOrEqual(1 + 1e-6);
      expect(v).toBeGreaterThanOrEqual(-1e-6);
      expect(v).toBeLessThanOrEqual(1 + 1e-6);
      const back = hemiOctDecode(u, v);
      expect(back[0]).toBeCloseTo(d[0], 5);
      expect(back[1]).toBeCloseTo(d[1], 5);
      expect(back[2]).toBeCloseTo(d[2], 5);

      const f = octFrame(back);
      const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
      const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      expect(len(f.right)).toBeCloseTo(1, 5);
      expect(len(f.up)).toBeCloseTo(1, 5);
      expect(len(f.dir)).toBeCloseTo(1, 5);
      expect(Math.abs(dot(f.right, f.up))).toBeLessThan(1e-5);
      expect(Math.abs(dot(f.right, f.dir))).toBeLessThan(1e-5);
      expect(Math.abs(dot(f.up, f.dir))).toBeLessThan(1e-5);
    }

    for (const [u, v] of [[0, 0], [1, 1], [0.5, 0.5], [0.23, 0.71], [0.89, 0.14]] as const) {
      const g = octGridWeights(u, v, IMP_GRID);
      expect(g.w[0] + g.w[1] + g.w[2]).toBeCloseTo(1, 6);
      for (const w of g.w) {
        expect(w).toBeGreaterThanOrEqual(-1e-6);
        expect(w).toBeLessThanOrEqual(1 + 1e-6);
      }
      for (const [ix, iy] of [g.c0, g.c1, g.c2]) {
        expect(ix).toBeGreaterThanOrEqual(0);
        expect(ix).toBeLessThan(IMP_GRID);
        expect(iy).toBeGreaterThanOrEqual(0);
        expect(iy).toBeLessThan(IMP_GRID);
      }
    }
  });

  it('keeps impostor atlas mipmap levels cell-aligned and computes half-res & reprojection matrices', () => {
    expect(IMP_SIZE).toBe(IMP_GRID * IMP_CELL);
    expect(IMP_CELL >> IMP_MAX_LEVEL).toBe(1);

    expect(halfSize(1920, 1080)).toEqual([960, 540]);
    expect(halfSize(1919, 1079)).toEqual([960, 540]);
    expect(halfSize(0, 1)).toEqual([1, 1]);

    const proj = perspective(1.0, 16 / 9, 1, 1000);
    const v1 = lookAt([0, 0, 0], [0, 10, 0], [0, 0, 1]);
    const vp1 = multiply(proj, v1);
    const same = reprojectMatrix(vp1, vp1, [5, 5, 10], [5, 5, 10]);
    const mul4 = (m: Mat4, p: [number, number, number, number]) => [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] * p[3],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] * p[3],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] * p[3],
      m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] * p[3],
    ];
    const clip = mul4(same, [0.25, -0.3, 0.5, 1]);
    expect(clip[0] / clip[3]).toBeCloseTo(0.25, 4);
    expect(clip[1] / clip[3]).toBeCloseTo(-0.3, 4);
  });
});

describe('KTX2 compressed texture container & WebGL format negotiation', () => {
  it('round-trips raw and ZLIB-supercompressed multi-mip KTX2 files byte-for-byte', () => {
    const mip0 = new Uint8Array(blockCompressedSize(16, 16));
    const mip1 = new Uint8Array(blockCompressedSize(8, 8));
    const mip2 = new Uint8Array(blockCompressedSize(4, 4));
    for (let i = 0; i < mip0.length; i++) mip0[i] = (i * 31 + 7) & 0xff;
    for (let i = 0; i < mip1.length; i++) mip1[i] = (i * 17 + 3) & 0xff;
    for (let i = 0; i < mip2.length; i++) mip2[i] = (i * 13 + 11) & 0xff;

    for (const sc of ['none', 'zlib'] as const) {
      const bytes = writeKTX2({
        vkFormat: VK_FORMAT.BC7_SRGB_BLOCK,
        width: 16,
        height: 16,
        levels: [mip0, mip1, mip2],
        supercompression: sc,
      });
      expect(bytes.subarray(0, 12)).toEqual(KTX2_IDENTIFIER);
      const parsed = parseKTX2(bytes);
      expect(parsed.vkFormat).toBe(VK_FORMAT.BC7_SRGB_BLOCK);
      expect(parsed.width).toBe(16);
      expect(parsed.height).toBe(16);
      expect(parsed.levelCount).toBe(3);
      expect(parsed.supercompressionScheme).toBe(sc === 'zlib' ? KTX2_SUPERCOMPRESSION.ZLIB : KTX2_SUPERCOMPRESSION.NONE);
      expect(parsed.levels.map((l) => [l.width, l.height])).toEqual([[16, 16], [8, 8], [4, 4]]);
      expect(parsed.levels[0].data).toEqual(mip0);
      expect(parsed.levels[1].data).toEqual(mip1);
      expect(parsed.levels[2].data).toEqual(mip2);
      // Payloads are stored 16-byte aligned.
      for (const l of parsed.levels) expect(l.byteOffset % 16).toBe(0);
    }
  });

  it('rejects malformed KTX2 headers, truncated data, and unsupported supercompression', () => {
    expect(() => parseKTX2(new Uint8Array(16))).toThrow(/too small/);
    const badMagic = new Uint8Array(128);
    expect(() => parseKTX2(badMagic)).toThrow(/identifier/);

    const valid = writeKTX2({ vkFormat: VK_FORMAT.ASTC_4x4_UNORM_BLOCK, width: 4, height: 4, levels: [new Uint8Array(16)] });
    expect(() => parseKTX2(valid.subarray(0, valid.length - 4))).toThrow(/bounds/);

    const badSuper = valid.slice();
    new DataView(badSuper.buffer).setUint32(44, KTX2_SUPERCOMPRESSION.BASIS_LZ, true);
    expect(() => parseKTX2(badSuper)).toThrow(/supercompression/);

    expect(() => writeKTX2({ vkFormat: VK_FORMAT.BC7_UNORM_BLOCK, width: 4, height: 4, levels: [] })).toThrow(/at least one/);
  });

  it('computes 4x4 block sizes and negotiates WebGL 2 compressed texture formats in quality priority order', () => {
    expect(blockCompressedSize(1, 1)).toBe(16);
    expect(blockCompressedSize(4, 4)).toBe(16);
    expect(blockCompressedSize(5, 4)).toBe(32);
    expect(blockCompressedSize(512, 512)).toBe((512 / 4) * (512 / 4) * 16);
    expect(blockCompressedSize(8, 8, 8)).toBe(32);

    const mockGL = (exts: Record<string, unknown>) => ({ getExtension: (name: string) => exts[name] ?? null });

    expect(detectCompressedFormats(mockGL({})).family).toBe('none');

    // BC3 requires both linear and sRGB S3TC extensions.
    expect(detectCompressedFormats(mockGL({ WEBGL_compressed_texture_s3tc: { COMPRESSED_RGBA_S3TC_DXT5_EXT: 1 } })).family).toBe('none');
    const bc3Only = detectCompressedFormats(
      mockGL({
        WEBGL_compressed_texture_s3tc: { COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3 },
        WEBGL_compressed_texture_s3tc_srgb: { COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT: 0x8c4f },
      }),
    );
    expect(bc3Only.family).toBe('bc3');
    expect(bc3Only.vkSrgb).toBe(VK_FORMAT.BC3_SRGB_BLOCK);

    // ASTC beats BC7, ETC2, and BC3 when all are available.
    const all = detectCompressedFormats(
      mockGL({
        WEBGL_compressed_texture_astc: { COMPRESSED_RGBA_ASTC_4x4_KHR: 0x93b0, COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR: 0x93d0 },
        EXT_texture_compression_bptc: { COMPRESSED_RGBA_BPTC_UNORM_EXT: 0x8e8c, COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT: 0x8e8d },
        WEBGL_compressed_texture_etc: { COMPRESSED_RGBA8_ETC2_EAC: 0x9278, COMPRESSED_SRGB8_ALPHA8_ETC2_EAC: 0x9279 },
        WEBGL_compressed_texture_s3tc: { COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3 },
        WEBGL_compressed_texture_s3tc_srgb: { COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT: 0x8c4f },
      }),
    );
    expect(all.family).toBe('astc');
    expect(all.supported).toEqual(['astc', 'bc7', 'etc2', 'bc3']);
  });
});

describe('WebGPU capability probe & backend selection', () => {
  it('handles missing, null, failing, under-limit, and compute-ready WebGPU adapters safely', async () => {
    const missing = await probeWebGPU({});
    expect(missing.available).toBe(false);
    expect(missing.readyForComputePipeline).toBe(false);

    const nullAdapter = await probeWebGPU({ gpu: { requestAdapter: async () => null } });
    expect(nullAdapter.available).toBe(false);

    const throwing = await probeWebGPU({
      gpu: {
        requestAdapter: async () => {
          throw new Error('blocked');
        },
      },
    });
    expect(throwing.available).toBe(false);

    const underLimit = await probeWebGPU({
      gpu: {
        requestAdapter: async () => ({
          features: new Set(['texture-compression-bc']),
          limits: { maxStorageBufferBindingSize: 64 * 1024 * 1024, maxComputeWorkgroupSizeX: 128, maxTextureArrayLayers: 256 },
          info: { vendor: 'test', architecture: 'tiny' },
        }),
      },
    });
    expect(underLimit.available).toBe(true);
    expect(underLimit.readyForComputePipeline).toBe(false);
    expect(underLimit.features.bc).toBe(true);
    expect(underLimit.adapterName).toBe('test tiny');

    const ready = await probeWebGPU({
      gpu: {
        requestAdapter: async () => ({
          features: new Set(['texture-compression-astc', 'timestamp-query', 'indirect-first-instance']),
          limits: { maxStorageBufferBindingSize: 256 * 1024 * 1024, maxComputeWorkgroupSizeX: 256, maxTextureArrayLayers: 2048 },
          info: { description: 'Apple M3' },
        }),
      },
    });
    expect(ready.available).toBe(true);
    expect(ready.readyForComputePipeline).toBe(true);
    expect(ready.adapterName).toBe('Apple M3');
    expect(ready.features.astc).toBe(true);
    expect(ready.features.timestampQuery).toBe(true);
    expect(ready.features.indirectFirstInstance).toBe(true);

    expect(selectRenderBackend({ fast: true }, ready)).toBe('webgl2-fast');
    expect(selectRenderBackend({}, ready)).toBe('webgl2-full');
    expect(selectRenderBackend({ preferWebGPU: true }, ready)).toBe('webgpu');
    expect(selectRenderBackend({ preferWebGPU: true }, underLimit)).toBe('webgl2-full');
    expect(selectRenderBackend({ preferWebGPU: true }, missing)).toBe('webgl2-full');
  });
});

describe('render scaling, continuous altitude effects, and terrain-relative clouds', () => {
  it('computes safe internal render sizes clamped to positive integers within [0.25, 1.0]', () => {
    expect(scaledRenderSize(1280, 760, 1)).toEqual([1280, 760]);
    expect(scaledRenderSize(1280, 760, 0.5)).toEqual([640, 380]);
    expect(scaledRenderSize(1280, 760, 0.1)).toEqual([320, 190]);
    expect(scaledRenderSize(1280, 760, 2.5)).toEqual([1280, 760]);
    expect(scaledRenderSize(1280, 760, Number.NaN)).toEqual([1280, 760]);
    expect(scaledRenderSize(1, 1, 0.25)).toEqual([1, 1]);
  });

  it('decays local effect weights smoothly and monotonically with altitude and respects fast mode', () => {
    expect(smoothDown(1000, 1500, 4000)).toBe(1);
    expect(smoothDown(4500, 1500, 4000)).toBe(0);
    expect(smoothDown(2750, 1500, 4000)).toBeCloseTo(0.5, 6);

    const low = localEffectWeights(200, false);
    expect(low.ao).toBe(1);
    expect(low.banks).toBe(1);
    expect(low.waterScreen).toBe(1);
    expect(low.shafts).toBe(1);
    expect(low.smoke).toBe(1);
    expect(low.ambient).toBe(true);

    const mid = localEffectWeights(3000, false);
    expect(mid.ao).toBe(1);
    expect(mid.banks).toBeGreaterThan(0);
    expect(mid.banks).toBeLessThan(1);
    expect(mid.shafts).toBeGreaterThan(0);
    expect(mid.shafts).toBeLessThan(1);
    expect(mid.smoke).toBe(0);

    const high = localEffectWeights(12_000, false);
    expect(high.ao).toBe(0);
    expect(high.banks).toBe(0);
    expect(high.waterScreen).toBe(0);
    expect(high.shafts).toBe(0);
    expect(high.smoke).toBe(0);
    expect(high.ambient).toBe(false);

    // Monotonic decay across altitude with no discontinuous jump.
    let prev = localEffectWeights(0, false);
    for (let alt = 100; alt <= 12_000; alt += 100) {
      const cur = localEffectWeights(alt, false);
      for (const k of ['ao', 'banks', 'waterScreen', 'shafts', 'smoke'] as const) {
        expect(cur[k]).toBeLessThanOrEqual(prev[k] + 1e-9);
        expect(prev[k] - cur[k]).toBeLessThan(0.25);
      }
      prev = cur;
    }

    // Fast mode disables post effects and water-map bank blurring while keeping ambient gating.
    const fastLow = localEffectWeights(200, true);
    expect(fastLow.ao).toBe(0);
    expect(fastLow.banks).toBe(0);
    expect(fastLow.waterScreen).toBe(0);
    expect(fastLow.shafts).toBe(0);
    expect(fastLow.smoke).toBe(0);
    expect(fastLow.ambient).toBe(true);
  });

  it('places clouds relative to local terrain elevation and fades cleanly across the cloud base', () => {
    // Sea-level terrain (groundZ = 0): base 1400 m, top 2400 m.
    const seaLow = cloudLayerFor(200, 200);
    expect(seaLow.base).toBe(1400);
    expect(seaLow.top).toBe(2400);
    expect(seaLow.alpha).toBe(1);

    // Approaching sea-level cloud base (1000..1400 m): fades smoothly from 1 to 0.
    const seaMid = cloudLayerFor(1200, 1200);
    expect(seaMid.alpha).toBeCloseTo(0.5, 6);
    const seaAbove = cloudLayerFor(1450, 1450);
    expect(seaAbove.alpha).toBe(0);

    // High plateau (e.g., 2200 m ground, eye 300 m above ground -> eyeSea = 2500 m):
    // clouds sit at 3600..4600 m above sea level, still visible above the viewer!
    const plateau = cloudLayerFor(2500, 300);
    expect(plateau.base).toBe(3600);
    expect(plateau.top).toBe(4600);
    expect(plateau.alpha).toBe(1);

    // Ascending above the plateau toward 3600 m fades smoothly over 3200..3600 m.
    const plateauNear = cloudLayerFor(3400, 1200);
    expect(plateauNear.base).toBe(3600);
    expect(plateauNear.alpha).toBeCloseTo(0.5, 6);
    const plateauOver = cloudLayerFor(3700, 1500);
    expect(plateauOver.alpha).toBe(0);

    // Underwater / below-sea-level floor clamps groundZ to 0 (never puts clouds underwater).
    const seaFloor = cloudLayerFor(-20, 5);
    expect(seaFloor.base).toBe(1400);
    expect(seaFloor.top).toBe(2400);
    expect(seaFloor.alpha).toBe(1);
  });
});
