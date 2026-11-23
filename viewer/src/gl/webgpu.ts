// Runtime WebGPU capability probe and backend selection foundation (docs/plans/RENDERING.md, step 9).
// Keeps the WebGL 2 fast & full paths rock-solid while giving the viewer and diagnostics exact
// visibility into whether a browser supports compute-driven culling, indirect drawing, timestamp
// queries, and hardware block-compressed textures for the WebGPU visibility-buffer backend.

export type RenderBackendKind = 'webgl2-fast' | 'webgl2-full' | 'webgpu';

export interface WebGPUCapabilities {
  available: boolean;
  /** Whether the adapter exposes the baseline feature set needed for a compute/visibility-buffer path. */
  readyForComputePipeline: boolean;
  adapterName: string | null;
  features: {
    bc: boolean;
    astc: boolean;
    etc2: boolean;
    timestampQuery: boolean;
    indirectFirstInstance: boolean;
    float32Filterable: boolean;
  };
  limits: {
    maxStorageBufferBindingSize: number;
    maxComputeWorkgroupSizeX: number;
    maxTextureArrayLayers: number;
  };
}

interface GPUAdapterLike {
  features?: { has(name: string): boolean };
  limits?: {
    maxStorageBufferBindingSize?: number;
    maxComputeWorkgroupSizeX?: number;
    maxTextureArrayLayers?: number;
  };
  info?: { description?: string; vendor?: string; architecture?: string };
}

interface NavigatorGPULike {
  gpu?: {
    requestAdapter(opts?: { powerPreference?: 'high-performance' | 'low-power' }): Promise<GPUAdapterLike | null>;
  };
}

const UNAVAILABLE: WebGPUCapabilities = {
  available: false,
  readyForComputePipeline: false,
  adapterName: null,
  features: {
    bc: false,
    astc: false,
    etc2: false,
    timestampQuery: false,
    indirectFirstInstance: false,
    float32Filterable: false,
  },
  limits: {
    maxStorageBufferBindingSize: 0,
    maxComputeWorkgroupSizeX: 0,
    maxTextureArrayLayers: 0,
  },
};

/** Inspect a WebGPU adapter (or runtime navigator.gpu) without throwing on unsupported browsers. */
export async function probeWebGPU(nav: NavigatorGPULike | undefined = typeof navigator !== 'undefined' ? (navigator as unknown as NavigatorGPULike) : undefined): Promise<WebGPUCapabilities> {
  if (!nav?.gpu?.requestAdapter) return UNAVAILABLE;
  try {
    const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return UNAVAILABLE;
    const has = (name: string) => !!adapter.features?.has(name);
    const maxStorageBufferBindingSize = adapter.limits?.maxStorageBufferBindingSize ?? 0;
    const maxComputeWorkgroupSizeX = adapter.limits?.maxComputeWorkgroupSizeX ?? 0;
    const maxTextureArrayLayers = adapter.limits?.maxTextureArrayLayers ?? 0;
    const features = {
      bc: has('texture-compression-bc'),
      astc: has('texture-compression-astc'),
      etc2: has('texture-compression-etc2'),
      timestampQuery: has('timestamp-query'),
      indirectFirstInstance: has('indirect-first-instance'),
      float32Filterable: has('float32-filterable'),
    };
    const info = adapter.info;
    const adapterName = info?.description || [info?.vendor, info?.architecture].filter(Boolean).join(' ') || null;
    const readyForComputePipeline = maxStorageBufferBindingSize >= 128 * 1024 * 1024 && maxComputeWorkgroupSizeX >= 256 && maxTextureArrayLayers >= 256;
    return {
      available: true,
      readyForComputePipeline,
      adapterName,
      features,
      limits: { maxStorageBufferBindingSize, maxComputeWorkgroupSizeX, maxTextureArrayLayers },
    };
  } catch {
    return UNAVAILABLE;
  }
}

/**
 * Choose the active local rendering backend from user/environment options and probed capabilities.
 * Today the local scene renders via WebGL 2 ('webgl2-fast' or 'webgl2-full'); 'webgpu' is only
 * returned when explicitly opted-in (`preferWebGPU`) AND the adapter satisfies compute limits.
 */
export function selectRenderBackend(opts: { fast?: boolean; preferWebGPU?: boolean }, webgpu?: WebGPUCapabilities): RenderBackendKind {
  if (opts.fast) return 'webgl2-fast';
  if (opts.preferWebGPU && webgpu?.available && webgpu.readyForComputePipeline) return 'webgpu';
  return 'webgl2-full';
}
