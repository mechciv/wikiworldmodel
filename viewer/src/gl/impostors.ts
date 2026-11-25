// GPU-baked hemi-octahedral impostor atlas (8x8 upper-hemisphere views per prototype family).
// Bakes unlit premultiplied albedo+alpha and local normal+sky occlusion directly from generator
// meshes on the GPU so distant canopy trees, understory shrubs, procedural dwellings, and compact
// rigid works draw as 2-triangle instanced quads with dynamic sun/SH lighting, shadow casting,
// optional wind sway, picking, and evidence mode—without changing generator mesh fingerprints.
import { hemiOctDecode, octFrame, type ProtoBounds } from './culling.ts';
import { setUniforms, type GL, type Program } from './context.ts';

export const IMP_GRID = 8;
export const IMP_CELL = 64;
export const IMP_SIZE = IMP_GRID * IMP_CELL;
export const IMP_MAX_LEVEL = 6; // 64 >> 6 == 1 texel/cell, so mipmaps never cross cell borders.
export const IMP_MAX_LAYERS = 96;

export type ImpostorKind = 'foliage' | 'rigid';

export interface ImpostorSlot {
  /** Generalized prototype family key (kept aliased as treeKey for backward compatibility). */
  key: number;
  treeKey: number;
  kind: ImpostorKind;
  layer: number;
  midZ: number;
  radius: number;
  sourceDetail: number;
  lastUsed: number;
  ready: boolean;
}

interface PendingBake {
  key: number;
  kind: ImpostorKind;
  vao: WebGLVertexArrayObject;
  indexCount: number;
  bounds: ProtoBounds;
  detail: number;
}

export interface ImpostorLruResult {
  layer: number;
  evictedKey?: number;
}

/**
 * Pure LRU texture-array layer allocator for hemi-octahedral impostor slots.
 * Reuses freed layers first, allocates sequentially up to `capacity`, and otherwise evicts the
 * least-recently-used key whose `lastUsed` frame is strictly earlier than `frame`.
 */
export class ImpostorLru {
  private entries = new Map<number, { layer: number; lastUsed: number }>();
  private freeLayers: number[] = [];
  private nextLayer = 0;

  constructor(readonly capacity: number = IMP_MAX_LAYERS) {
    if (capacity <= 0) throw new Error('ImpostorLru capacity must be positive');
  }

  get size(): number {
    return this.entries.size;
  }

  layerOf(key: number): number | undefined {
    return this.entries.get(key)?.layer;
  }

  touch(key: number, frame: number): void {
    const e = this.entries.get(key);
    if (e && frame > e.lastUsed) e.lastUsed = frame;
  }

  allocate(key: number, frame: number): ImpostorLruResult | null {
    const existing = this.entries.get(key);
    if (existing) {
      if (frame > existing.lastUsed) existing.lastUsed = frame;
      return { layer: existing.layer };
    }
    if (this.freeLayers.length > 0) {
      const layer = this.freeLayers.pop()!;
      this.entries.set(key, { layer, lastUsed: frame });
      return { layer };
    }
    if (this.nextLayer < this.capacity) {
      const layer = this.nextLayer++;
      this.entries.set(key, { layer, lastUsed: frame });
      return { layer };
    }
    let victimKey: number | undefined;
    let victimUsed = Infinity;
    for (const [k, e] of this.entries) {
      if (e.lastUsed < frame && e.lastUsed < victimUsed) {
        victimUsed = e.lastUsed;
        victimKey = k;
      }
    }
    if (victimKey === undefined) return null;
    const victim = this.entries.get(victimKey)!;
    this.entries.delete(victimKey);
    this.entries.set(key, { layer: victim.layer, lastUsed: frame });
    return { layer: victim.layer, evictedKey: victimKey };
  }

  release(key: number): void {
    const e = this.entries.get(key);
    if (!e) return;
    this.entries.delete(key);
    this.freeLayers.push(e.layer);
  }

  clear(): void {
    this.entries.clear();
    this.freeLayers = [];
    this.nextLayer = 0;
  }
}

/** Precomputed 8x8 hemi-octahedral camera frames for baking. */
const OCT_VIEWS = (() => {
  const out: { ix: number; iy: number; right: [number, number, number]; up: [number, number, number]; dir: [number, number, number] }[] = [];
  for (let iy = 0; iy < IMP_GRID; iy++) {
    for (let ix = 0; ix < IMP_GRID; ix++) {
      const dir = hemiOctDecode(ix / (IMP_GRID - 1), iy / (IMP_GRID - 1));
      const f = octFrame(dir);
      out.push({ ix, iy, right: f.right, up: f.up, dir: f.dir });
    }
  }
  return out;
})();

export class ImpostorAtlas {
  albedoTex: WebGLTexture | null = null;
  normalTex: WebGLTexture | null = null;
  private bakeFb: WebGLFramebuffer | null = null;
  private bakeDepth: WebGLRenderbuffer | null = null;
  private quadVbo: WebGLBuffer;
  private quadIbo: WebGLBuffer;
  private slots = new Map<number, ImpostorSlot>();
  private sources = new Map<number, PendingBake>();
  private queue: number[] = [];
  private lru = new ImpostorLru(IMP_MAX_LAYERS);
  private capacity = 0;

  constructor(private gl: GL, private bakeP: Program) {
    const quad = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
    const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);
    this.quadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    this.quadIbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }

  /** Lazily allocate the 2D array textures and bake framebuffer on the first impostor bake. */
  private ensureStorage(): void {
    if (this.albedoTex) return;
    const gl = this.gl;
    this.capacity = IMP_MAX_LAYERS;
    const levels = IMP_MAX_LEVEL + 1;
    const makeTex = (): WebGLTexture => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, IMP_SIZE, IMP_SIZE, this.capacity);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, IMP_MAX_LEVEL);
      return t;
    };
    gl.activeTexture(gl.TEXTURE15);
    this.albedoTex = makeTex();
    gl.activeTexture(gl.TEXTURE16);
    this.normalTex = makeTex();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);

    this.bakeDepth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.bakeDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, IMP_SIZE, IMP_SIZE);
    this.bakeFb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bakeFb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.bakeDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Build a lightweight instanced billboard VAO sharing an existing InstancedGPU instance VBO. */
  createBatchVao(instancesVbo: WebGLBuffer): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instancesVbo);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 28, 0);
    gl.vertexAttribDivisor(5, 1);
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 2, gl.FLOAT, false, 28, 16);
    gl.vertexAttribDivisor(6, 1);
    gl.enableVertexAttribArray(7);
    gl.vertexAttribIPointer(7, 2, gl.UNSIGNED_SHORT, 28, 24);
    gl.vertexAttribDivisor(7, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIbo);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return vao;
  }

  /** Allocate or evict an LRU layer for `src` and queue it for baking. */
  private allocateSlot(src: PendingBake, frame: number): ImpostorSlot | null {
    const alloc = this.lru.allocate(src.key, frame);
    if (!alloc) return null;
    if (alloc.evictedKey !== undefined) {
      this.slots.delete(alloc.evictedKey);
      const qIdx = this.queue.indexOf(alloc.evictedKey);
      if (qIdx >= 0) this.queue.splice(qIdx, 1);
    }
    const slot: ImpostorSlot = {
      key: src.key,
      treeKey: src.key,
      kind: src.kind,
      layer: alloc.layer,
      midZ: src.bounds.midZ,
      radius: src.bounds.sphereRadius * 1.04,
      sourceDetail: src.detail,
      lastUsed: frame,
      ready: false,
    };
    this.slots.set(src.key, slot);
    if (!this.queue.includes(src.key)) this.queue.push(src.key);
    return slot;
  }

  /**
   * Register a prototype mesh as a bake source for its family `key`.
   * Foliage requires detail >= 1 (upgrading 1 -> 2 when foliage cards arrive); rigid prototypes
   * (dwellings, works) accept detail >= 0 so distant settlements bake immediately and upgrade when
   * finer geometry streams in.
   */
  registerSource(
    key: number,
    vao: WebGLVertexArrayObject,
    indexCount: number,
    bounds: ProtoBounds,
    detail: number,
    kind: ImpostorKind = 'foliage',
    frame = 0,
  ): void {
    const minDetail = kind === 'rigid' ? 0 : 1;
    if (detail < minDetail || bounds.sphereRadius <= 0 || indexCount <= 0) return;
    const prevSrc = this.sources.get(key);
    if (prevSrc) {
      const shouldUpgrade = kind === 'rigid' ? detail > prevSrc.detail : detail > prevSrc.detail && bounds.hasCards;
      if (!shouldUpgrade) return;
    }
    const src: PendingBake = { key, kind, vao, indexCount, bounds, detail };
    this.sources.set(key, src);

    const existing = this.slots.get(key);
    if (existing) {
      existing.kind = kind;
      existing.midZ = bounds.midZ;
      existing.radius = bounds.sphereRadius * 1.04;
      existing.sourceDetail = detail;
      existing.lastUsed = Math.max(existing.lastUsed, frame);
      existing.ready = false;
      this.lru.touch(key, frame);
      if (!this.queue.includes(key)) this.queue.push(key);
      return;
    }
    this.allocateSlot(src, frame);
  }

  /**
   * Look up a ready baked impostor slot for `key`, updating its LRU recency.
   * If `key` has a registered source that was previously evicted, re-allocates an LRU layer and
   * queues it for re-baking on the next frame.
   */
  get(key: number, frame = 0): ImpostorSlot | null {
    const s = this.slots.get(key);
    if (s) {
      if (frame > s.lastUsed) s.lastUsed = frame;
      this.lru.touch(key, frame);
      return s.ready ? s : null;
    }
    const src = this.sources.get(key);
    if (src) this.allocateSlot(src, frame);
    return null;
  }

  /** Mark all baked slots dirty when scene land tones/rock change so they re-bake cleanly. */
  invalidateTones(): void {
    for (const [key, slot] of this.slots) {
      if (this.sources.has(key)) {
        slot.ready = false;
        if (!this.queue.includes(key)) this.queue.push(key);
      }
    }
  }

  /** Drop scene-specific slots on scene switch (keeps allocated GPU texture arrays for reuse). */
  clear(): void {
    this.slots.clear();
    this.sources.clear();
    this.queue = [];
    this.lru.clear();
  }

  /** Free all GPU resources owned by this impostor atlas. */
  dispose(): void {
    this.clear();
    const gl = this.gl;
    if (this.albedoTex) gl.deleteTexture(this.albedoTex);
    if (this.normalTex) gl.deleteTexture(this.normalTex);
    if (this.bakeFb) gl.deleteFramebuffer(this.bakeFb);
    if (this.bakeDepth) gl.deleteRenderbuffer(this.bakeDepth);
    gl.deleteBuffer(this.quadVbo);
    gl.deleteBuffer(this.quadIbo);
    this.albedoTex = null;
    this.normalTex = null;
    this.bakeFb = null;
    this.bakeDepth = null;
    this.capacity = 0;
  }

  /** Whether any queued prototype can be baked given current leaf-atlas readiness. */
  hasPending(leavesReady = true): boolean {
    if (!this.queue.length) return false;
    if (leavesReady) return true;
    for (const key of this.queue) {
      if (this.slots.get(key)?.kind === 'rigid') return true;
    }
    return false;
  }

  /**
   * Bake up to `maxCount` eligible queued prototypes into the 8x8 octahedral atlas.
   * Caller must ensure `uNoise` (unit 0) and `uLeaves` (unit 23) are already bound.
   * Returns how many slots were baked.
   */
  bakePending(
    maxCount: number,
    wild: boolean,
    tones: Float32Array,
    rock?: Float32Array,
    subTone?: Float32Array,
    leavesReady = true,
  ): number {
    if (!this.hasPending(leavesReady)) return 0;
    this.ensureStorage();
    const gl = this.gl;
    let baked = 0;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bakeFb);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);
    gl.enable(gl.SCISSOR_TEST);
    gl.useProgram(this.bakeP.program);
    const toneLoc = this.bakeP.uniforms.get('uTone');
    if (toneLoc) gl.uniform3fv(toneLoc, tones);
    const rockLoc = this.bakeP.uniforms.get('uRock');
    if (rockLoc && rock) gl.uniform3fv(rockLoc, rock);
    const subToneLoc = this.bakeP.uniforms.get('uSubTone');
    if (subToneLoc && subTone) gl.uniform3fv(subToneLoc, subTone);
    setUniforms(gl, this.bakeP, { uWild: wild ? 1 : 0 });

    const clearAlbedo = new Float32Array([0, 0, 0, 0]);
    const clearNormal = new Float32Array([0.5, 0.5, 0.85, 0.65]);
    const clearDepth = new Float32Array([1.0]);

    const deferred: number[] = [];
    while (this.queue.length && baked < maxCount) {
      const key = this.queue.shift()!;
      const slot = this.slots.get(key);
      const src = this.sources.get(key);
      if (!slot || !src) continue;
      if (slot.kind === 'foliage' && !leavesReady) {
        deferred.push(key);
        continue;
      }

      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.albedoTex, 0, slot.layer);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, this.normalTex, 0, slot.layer);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

      const invR = 1 / Math.max(slot.radius, 1e-4);
      setUniforms(gl, this.bakeP, { uCenter: [0, 0, slot.midZ], uInvR: invR });
      gl.bindVertexArray(src.vao);

      for (const v of OCT_VIEWS) {
        const vx = v.ix * IMP_CELL;
        const vy = v.iy * IMP_CELL;
        gl.viewport(vx, vy, IMP_CELL, IMP_CELL);
        gl.scissor(vx, vy, IMP_CELL, IMP_CELL);
        gl.clearBufferfv(gl.COLOR, 0, clearAlbedo);
        gl.clearBufferfv(gl.COLOR, 1, clearNormal);
        gl.clearBufferfv(gl.DEPTH, 0, clearDepth);
        setUniforms(gl, this.bakeP, { uRx: v.right, uRy: v.up, uDir: v.dir });
        gl.drawElements(gl.TRIANGLES, src.indexCount, gl.UNSIGNED_INT, 0);
      }

      slot.ready = true;
      baked++;
    }
    if (deferred.length) this.queue.unshift(...deferred);

    gl.bindVertexArray(null);
    gl.disable(gl.SCISSOR_TEST);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (baked > 0) {
      gl.activeTexture(gl.TEXTURE15);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.albedoTex);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.activeTexture(gl.TEXTURE16);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.normalTex);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
      gl.activeTexture(gl.TEXTURE0);
    }

    return baked;
  }
}
