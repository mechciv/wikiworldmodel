// Persistent GPU mega-buffer and coalescing free-list sub-allocator for static chunk geometry.
// Packs uploaded chunk meshes into shared VAO/VBO/IBO pages with index rebasing so hundreds of
// terrain-draped, city, or quadtree HLOD chunks draw with a single VAO bind and (when available)
// a single WEBGL_multi_draw submission.
import type { GL, Program } from './context.ts';

export const MEGA_VERTEX_STRIDE = 28;
/** Default vertices per mega-buffer page (~14.7 MB VBO). */
export const DEFAULT_PAGE_VERTICES = 524_288;
/** Default uint32 indices per mega-buffer page (~8.4 MB IBO). */
export const DEFAULT_PAGE_INDICES = 2_097_152;

export interface MegaSlice {
  page: number;
  vertexOffset: number;
  vertexCount: number;
  indexOffset: number;
  indexCount: number;
}

export interface MegaDrawable {
  vao: WebGLVertexArrayObject | null;
  count: number;
  entityOffset?: number;
  mega?: MegaSlice;
}

interface FreeBlock {
  offset: number;
  length: number;
}

/**
 * First-fit linear block allocator with immediate left/right neighbor coalescing.
 * Pure TypeScript (no DOM/WebGL) so chunk allocation and eviction stability can be tested directly.
 */
export class FreeListAllocator {
  private blocks: FreeBlock[];
  private _used = 0;

  constructor(readonly capacity: number) {
    if (capacity < 0) throw new Error('FreeListAllocator capacity must be non-negative');
    this.blocks = capacity > 0 ? [{ offset: 0, length: capacity }] : [];
  }

  get used(): number {
    return this._used;
  }

  get freeBlocks(): number {
    return this.blocks.length;
  }

  allocate(length: number): number {
    if (length <= 0) return 0;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (b.length < length) continue;
      const offset = b.offset;
      if (b.length === length) this.blocks.splice(i, 1);
      else {
        b.offset += length;
        b.length -= length;
      }
      this._used += length;
      return offset;
    }
    return -1;
  }

  free(offset: number, length: number): void {
    if (length <= 0) return;
    this._used = Math.max(0, this._used - length);
    // Find sorted insertion point by offset.
    let idx = 0;
    while (idx < this.blocks.length && this.blocks[idx].offset < offset) idx++;
    const prev = idx > 0 ? this.blocks[idx - 1] : null;
    const next = idx < this.blocks.length ? this.blocks[idx] : null;
    const mergePrev = !!prev && prev.offset + prev.length === offset;
    const mergeNext = !!next && offset + length === next.offset;
    if (mergePrev && mergeNext) {
      prev!.length += length + next!.length;
      this.blocks.splice(idx, 1);
    } else if (mergePrev) {
      prev!.length += length;
    } else if (mergeNext) {
      next!.offset = offset;
      next!.length += length;
    } else {
      this.blocks.splice(idx, 0, { offset, length });
    }
  }
}

interface MultiDrawExt {
  multiDrawElementsWEBGL(
    mode: number,
    countsList: Int32Array,
    countsOffset: number,
    type: number,
    offsetsList: Int32Array,
    offsetsOffset: number,
    drawcount: number,
  ): void;
}

interface MegaPage {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  verts: FreeListAllocator;
  indices: FreeListAllocator;
}

/**
 * Pooled GPU mega-buffer for static meshes sharing the standard 28-byte vertex layout.
 * Sub-allocates vertex and re-based index spans into shared VAO/VBO/IBO pages and batches
 * contiguous draws via WEBGL_multi_draw when supported by the browser.
 */
export class StaticMegaBuffer {
  private pages: MegaPage[] = [];
  private multiDraw: MultiDrawExt | null;
  private scratchIndices = new Uint32Array(65536);
  private counts = new Int32Array(256);
  private offsets = new Int32Array(256);

  constructor(private gl: GL) {
    this.multiDraw = gl.getExtension('WEBGL_multi_draw') as MultiDrawExt | null;
  }

  get hasMultiDraw(): boolean {
    return !!this.multiDraw;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  private createPage(minVerts: number, minIndices: number): number {
    const gl = this.gl;
    const vCap = Math.max(DEFAULT_PAGE_VERTICES, minVerts);
    const iCap = Math.max(DEFAULT_PAGE_INDICES, minIndices);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vCap * MEGA_VERTEX_STRIDE, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, MEGA_VERTEX_STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, MEGA_VERTEX_STRIDE, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, MEGA_VERTEX_STRIDE, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribIPointer(3, 2, gl.UNSIGNED_BYTE, MEGA_VERTEX_STRIDE, 24);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribIPointer(4, 1, gl.UNSIGNED_SHORT, MEGA_VERTEX_STRIDE, 26);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, iCap * 4, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    const pageIndex = this.pages.length;
    this.pages.push({
      vao,
      vbo,
      ibo,
      verts: new FreeListAllocator(vCap),
      indices: new FreeListAllocator(iCap),
    });
    return pageIndex;
  }

  /** Sub-allocate and upload a static mesh into a shared page, rebasing its indices by vertexOffset. */
  upload(vertices: ArrayBuffer, indices: Uint32Array): MegaSlice {
    const vertexCount = Math.floor(vertices.byteLength / MEGA_VERTEX_STRIDE);
    const indexCount = indices.length;
    if (vertexCount <= 0 || indexCount <= 0) {
      return { page: -1, vertexOffset: 0, vertexCount: 0, indexOffset: 0, indexCount: 0 };
    }
    let page = -1;
    let vertexOffset = -1;
    let indexOffset = -1;
    for (let p = 0; p < this.pages.length; p++) {
      const pg = this.pages[p];
      const vo = pg.verts.allocate(vertexCount);
      if (vo < 0) continue;
      const io = pg.indices.allocate(indexCount);
      if (io < 0) {
        pg.verts.free(vo, vertexCount);
        continue;
      }
      page = p;
      vertexOffset = vo;
      indexOffset = io;
      break;
    }
    if (page < 0) {
      page = this.createPage(vertexCount, indexCount);
      const pg = this.pages[page];
      vertexOffset = pg.verts.allocate(vertexCount);
      indexOffset = pg.indices.allocate(indexCount);
    }

    const gl = this.gl;
    const pg = this.pages[page];
    gl.bindVertexArray(pg.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, pg.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, vertexOffset * MEGA_VERTEX_STRIDE, new Uint8Array(vertices, 0, vertexCount * MEGA_VERTEX_STRIDE));
    if (vertexOffset === 0) {
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, indexOffset * 4, indices);
    } else {
      if (this.scratchIndices.length < indexCount) {
        this.scratchIndices = new Uint32Array(Math.max(indexCount, this.scratchIndices.length * 2));
      }
      const scratch = this.scratchIndices;
      for (let k = 0; k < indexCount; k++) scratch[k] = indices[k] + vertexOffset;
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, indexOffset * 4, scratch, 0, indexCount);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return { page, vertexOffset, vertexCount, indexOffset, indexCount };
  }

  /** Return a slice's vertex and index ranges to its page's free lists. */
  free(slice: MegaSlice): void {
    if (slice.page < 0 || slice.page >= this.pages.length) return;
    const pg = this.pages[slice.page];
    pg.verts.free(slice.vertexOffset, slice.vertexCount);
    pg.indices.free(slice.indexOffset, slice.indexCount);
  }

  /**
   * Draw an ordered list of static meshes, preserving front-to-back order while coalescing
   * contiguous runs sharing the same mega-buffer page and `uEntityOffset`.
   */
  draw(p: Program, cells: readonly MegaDrawable[]): { drawCalls: number; megaDraws: number } {
    const gl = this.gl;
    const offLoc = p.uniforms.get('uEntityOffset');
    let curOff = 0;
    if (offLoc) gl.uniform1i(offLoc, 0);
    let drawCalls = 0;
    let megaDraws = 0;
    let boundVao: WebGLVertexArrayObject | null = null;

    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c.count <= 0) continue;
      const wantOff = c.entityOffset ?? 0;
      if (offLoc && wantOff !== curOff) {
        gl.uniform1i(offLoc, wantOff);
        curOff = wantOff;
      }
      const m = c.mega;
      if (m && m.page >= 0 && m.page < this.pages.length) {
        const page = m.page;
        // Coalesce contiguous cells on the same page with the same entity offset.
        let end = i + 1;
        while (end < cells.length) {
          const next = cells[end];
          if (next.count <= 0) {
            end++;
            continue;
          }
          if (!next.mega || next.mega.page !== page || (next.entityOffset ?? 0) !== wantOff) break;
          end++;
        }
        const pgVao = this.pages[page].vao;
        if (boundVao !== pgVao) {
          gl.bindVertexArray(pgVao);
          boundVao = pgVao;
        }
        if (this.multiDraw) {
          let run = 0;
          for (let k = i; k < end; k++) {
            const item = cells[k];
            if (item.count <= 0 || !item.mega) continue;
            if (run >= this.counts.length) {
              const nextCap = this.counts.length * 2;
              const nextC = new Int32Array(nextCap);
              const nextO = new Int32Array(nextCap);
              nextC.set(this.counts);
              nextO.set(this.offsets);
              this.counts = nextC;
              this.offsets = nextO;
            }
            this.counts[run] = item.count;
            this.offsets[run] = item.mega.indexOffset * 4;
            run++;
          }
          if (run === 1) {
            gl.drawElements(gl.TRIANGLES, this.counts[0], gl.UNSIGNED_INT, this.offsets[0]);
            drawCalls++;
          } else if (run > 1) {
            this.multiDraw.multiDrawElementsWEBGL(gl.TRIANGLES, this.counts, 0, gl.UNSIGNED_INT, this.offsets, 0, run);
            drawCalls++;
            megaDraws++;
          }
        } else {
          for (let k = i; k < end; k++) {
            const item = cells[k];
            if (item.count <= 0 || !item.mega) continue;
            gl.drawElements(gl.TRIANGLES, item.count, gl.UNSIGNED_INT, item.mega.indexOffset * 4);
            drawCalls++;
          }
        }
        i = end - 1;
      } else if (c.vao) {
        if (boundVao !== c.vao) {
          gl.bindVertexArray(c.vao);
          boundVao = c.vao;
        }
        gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_INT, 0);
        drawCalls++;
      }
    }

    if (boundVao !== null) gl.bindVertexArray(null);
    if (offLoc && curOff !== 0) gl.uniform1i(offLoc, 0);
    return { drawCalls, megaDraws };
  }

  dispose(): void {
    const gl = this.gl;
    for (const pg of this.pages) {
      gl.deleteVertexArray(pg.vao);
      gl.deleteBuffer(pg.vbo);
      gl.deleteBuffer(pg.ibo);
    }
    this.pages = [];
  }
}
