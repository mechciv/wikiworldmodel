// Backend-agnostic contract for the local scene renderer. LifeScene, CityScene, and CellScene
// program against this interface so future backends (e.g. a WebGPU compute/visibility-buffer
// renderer) can plug in alongside the WebGL 2 CityRenderer without changing scene streaming.
import type { GroundLevel } from '../../../core/city.ts';
import type { LeafKindName } from '../../../core/leaves.ts';
import type { Mat4, V3 } from '../mat.ts';
import type { FrameTimer } from './timer.ts';

/** Opaque handle to a static uploaded cell/path mesh; WebGL 2 implements this as CellGPU. */
export interface MeshHandle {
  count: number;
  bytes: number;
}

/** Optional semantic metadata attached to an instanced prototype mesh for renderer optimizations. */
export interface InstancedMeta {
  /**
   * Stable prototype family key for canopy trees that share an octahedral impostor across LODs
   * (e.g. `(taxon << 2) | (variant & 3)`). Undefined for non-tree or understory prototypes.
   */
  treeKey?: number;
  /** Level of detail of this prototype (0 far, 1 mid, 2 close, 3 ground-cover clump). */
  detail?: number;
}

export interface InstancedBatch {
  proto: number;
  count: number;
  data: ArrayBuffer;
  ways?: ArrayBuffer;
}

export interface CityFrame {
  /** the eye, in local metres above sea level, with the Earth's curve already taken off */
  eye: V3;
  /** the ground under the eye and the point the camera looks at, for shadows */
  focus: V3;
  /** camera-relative: view rotation, then projection */
  view: Mat4;
  proj: Mat4;
  farProj: Mat4;
  fov: number;
  aspect: number;
  near: number;
  far: number;
  /** direction to the sun */
  sun: V3;
  time: number;
  evidence: boolean;
  /** how much of the frame shows: below 1, the globe shows through */
  alpha: number;
  /** the sky is drawn opaque: nothing of space shows */
  solid: boolean;
  /** height of the eye above the ground, in metres */
  clearance: number;
  /** seconds of the visit, by which what moves moves: apart from the world's time, and fixed by a link where it says */
  clock?: number;
  width: number;
  height: number;
}

export interface MaterialSetStatus {
  readonly ready: boolean;
  readonly loading: boolean;
  readonly failed: string | null;
}

export interface LocalRenderer<TMesh extends MeshHandle = MeshHandle> {
  wild: boolean;
  sea: boolean;
  still: boolean;
  readonly leavesReady: boolean;
  readonly leavesLoading: boolean;
  readonly materials: MaterialSetStatus;
  readonly timer: FrameTimer;
  readonly refining: boolean;
  readonly steadyMs: number;
  readonly stillDone: boolean;
  shadowCells: (focus: V3, radius: number) => TMesh[];

  ambientMotion(clearance: number, movingInstances: boolean): boolean;
  setGround(levels: GroundLevel[], heights: Int16Array[], normals?: Uint8Array[]): void;
  clearGround(): void;
  setGroundCover(litter: number, clumps: boolean, fallen?: { first: LeafKindName; next: LeafKindName; share: number }): void;
  setCloudCover(cover: number): void;
  setLand(tones: Float32Array, shares: V3, snow?: { line: number; band: number; slope: number }, byHeight?: { from: number; step: number; band: number; shares: Float32Array }): void;
  setSubstrate(look: { weight: number; shares: Float32Array; bands: Float32Array; tones: Float32Array; cracks: number; ripples: number; grain: number; soil: number; shade: number } | null): void;
  setRock(look: { rock: V3; stones: V3 } | null): void;
  addInstanced(id: number, vertices: ArrayBuffer, indices: Uint32Array, casts: boolean, idle?: number[], meta?: InstancedMeta): void;
  setInstances(batches: InstancedBatch[]): void;
  clearInstanced(): void;
  instancedStats(): { meshes: number; instances: number; triangles: number; impostorInstances: number };
  setMask(data: Uint8Array, size: number, box: [number, number, number, number]): void;
  setFields(
    data: Uint8Array | null,
    size: number,
    box: [number, number, number, number],
    style: { plot: number; aspect: number; kind: number; sown?: number; palette?: { slotColor: Float32Array; slotColor2: Float32Array; slotMeta: Float32Array } },
  ): void;
  /** How much of the land was worked beyond the plan's own map, coarsely: R crops, G pasture, A paddies, as shares. */
  setFarFields(data: Uint8Array | null, size: number, box: [number, number, number, number]): void;
  setSmokes(data: Float32Array | null): void;
  setWater(vertices: Float32Array, indices: Uint32Array, level: number, flow?: Float32Array, tone?: number[]): void;
  setEntities(data: Float32Array): void;
  setEntityTime(index: number, start: number, end: number): void;
  setEntityFlags(index: number, flags: number): void;
  upload(vertices: ArrayBuffer, indices: Uint32Array): TMesh;
  remove(c: TMesh): void;
  restart(): void;
  render(frame: CityFrame, cells: TMesh[], outW: number, outH: number): void;
  pick(atX: number, atY: number): number;
  dispose(): void;
}
