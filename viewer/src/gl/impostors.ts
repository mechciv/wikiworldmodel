// GPU-baked hemi-octahedral tree impostor atlas (8x8 upper-hemisphere views per tree prototype).
// Bakes unlit premultiplied albedo+alpha and local crown normal+sky occlusion directly from the
// generator's tree meshes on the GPU so mid/far canopy trees draw as 2-triangle instanced quads
// with dynamic sun/SH lighting, shadow casting, wind sway, picking, and evidence mode—without
// changing generator mesh fingerprints.
import { hemiOctDecode, octFrame, type ProtoBounds } from './culling.ts';
import { setUniforms, type GL, type Program } from './context.ts';

export const IMP_GRID = 8;
export const IMP_CELL = 64;
export const IMP_SIZE = IMP_GRID * IMP_CELL;
export const IMP_MAX_LEVEL = 6; // 64 >> 6 == 1 texel/cell, so mipmaps never cross cell borders.
export const IMP_MAX_LAYERS = 64;

export interface ImpostorSlot {
  treeKey: number;
  layer: number;
  midZ: number;
  radius: number;
  sourceDetail: number;
  ready: boolean;
}

interface PendingBake {
  treeKey: number;
  vao: WebGLVertexArrayObject;
  indexCount: number;
  bounds: ProtoBounds;
  detail: number;
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
  private nextLayer = 0;
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

  /** Lazily allocate the 2D array textures and bake framebuffer on the first tree bake. */
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

  /**
   * Register a tree prototype mesh (detail 1 or 2) as a bake source for its `(taxon, variant)` family.
   * Prefers the first detail >= 1 mesh that carries foliage cards, upgrading detail 1 -> 2 when available.
   */
  registerSource(treeKey: number, vao: WebGLVertexArrayObject, indexCount: number, bounds: ProtoBounds, detail: number): void {
    if (detail < 1 || bounds.sphereRadius <= 0 || indexCount <= 0) return;
    const existing = this.slots.get(treeKey);
    if (existing) {
      // Only upgrade if a finer detail with cards arrives for an already-allocated slot.
      if (detail <= existing.sourceDetail || !bounds.hasCards) return;
      existing.midZ = bounds.midZ;
      existing.radius = bounds.sphereRadius * 1.04;
      existing.sourceDetail = detail;
      existing.ready = false;
      this.sources.set(treeKey, { treeKey, vao, indexCount, bounds, detail });
      if (!this.queue.includes(treeKey)) this.queue.push(treeKey);
      return;
    }
    if (this.nextLayer >= IMP_MAX_LAYERS) return;
    const layer = this.nextLayer++;
    this.slots.set(treeKey, {
      treeKey,
      layer,
      midZ: bounds.midZ,
      radius: bounds.sphereRadius * 1.04,
      sourceDetail: detail,
      ready: false,
    });
    this.sources.set(treeKey, { treeKey, vao, indexCount, bounds, detail });
    this.queue.push(treeKey);
  }

  /** Look up a ready baked impostor slot for a canopy tree family, or null if not yet baked. */
  get(treeKey: number): ImpostorSlot | null {
    const s = this.slots.get(treeKey);
    return s && s.ready ? s : null;
  }

  /** Mark all baked slots dirty when scene land tones change so they re-bake cleanly. */
  invalidateTones(): void {
    for (const [key, slot] of this.slots) {
      if (this.sources.has(key)) {
        slot.ready = false;
        if (!this.queue.includes(key)) this.queue.push(key);
      }
    }
  }

  /** Drop scene-specific tree slots on scene switch (keeps allocated GPU texture arrays for reuse). */
  clear(): void {
    this.slots.clear();
    this.sources.clear();
    this.queue = [];
    this.nextLayer = 0;
  }

  get hasPending(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Bake up to `maxCount` queued tree prototypes into the 8x8 octahedral atlas.
   * Caller must ensure `uNoise` (unit 0) and `uLeaves` (unit 23) are already bound.
   * Returns how many slots were baked.
   */
  bakePending(maxCount: number, wild: boolean, tones: Float32Array): number {
    if (!this.queue.length) return 0;
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
    setUniforms(gl, this.bakeP, { uWild: wild ? 1 : 0 });

    const clearAlbedo = new Float32Array([0, 0, 0, 0]);
    const clearNormal = new Float32Array([0.5, 0.5, 0.85, 0.65]);
    const clearDepth = new Float32Array([1.0]);

    while (this.queue.length && baked < maxCount) {
      const key = this.queue.shift()!;
      const slot = this.slots.get(key);
      const src = this.sources.get(key);
      if (!slot || !src) continue;

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
