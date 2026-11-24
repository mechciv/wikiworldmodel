// The local scene renderer (section 3.3): below some altitude it takes over from the globe. It
// draws in metres on the site's grid, with the eye at the origin of what the GPU sees, so
// nothing jitters however close the camera is. A depth prepass feeds ambient occlusion; then
// far land, near land, meshes and octahedral tree impostors are lit in single-sample floating
// point with cascaded shadows, half-resolution occlusion-culled volumetric clouds, stencil-masked
// sky, TAA, bloom and a filmic curve.
import { groundNormals } from './groundNormals.ts';
import type { GroundLevel } from '../../../core/city.ts';
import { LEAF_KINDS, litterTile, type LeafKindName } from '../../../core/leaves.ts';
import { GROUND_LAYERS } from '../../../core/materials.ts';
import { DEFAULT_FIELD_PALETTE } from '../../../core/plots.ts';
import { NOISE_SIZE, noiseByte } from '../../../world/generators/life/sorting.ts';
import { invert, multiply, type Mat4, type V3 } from '../mat.ts';
import { linkProgram, setUniforms, texture2D, type GL, type Program } from './context.ts';
import { batchOverlapsCascade, computeBatchBounds, computeProtoBounds, halfSize, type BatchBounds, type CascadeBox, type ProtoBounds } from './culling.ts';
import { ImpostorAtlas } from './impostors.ts';
import type { LeafAtlas } from './leafatlas.ts';
import { GroundMaterialSet } from './materials.ts';
import type { CityFrame, InstancedBatch, InstancedMeta, LocalRenderer, MeshHandle } from './renderer.ts';
import { FrameTimer } from './timer.ts';
import { AO_FS, BLUR_FS, BRIGHT_FS, CLOUDS_FS, DEPTH_FS, FULLSCREEN_VS, ID_FS, IMP_BAKE_FS, IMP_BAKE_VS, IMPOSTOR_DEPTH_FS, IMPOSTOR_FS, IMPOSTOR_ID_FS, IMPOSTOR_VS, LUM_FS, MESH_FS, MESH_VS, POST_FS, SHAFTS_ADD_FS, SHAFTS_FS, SMOKE_FS, SMOKE_VS, TAA_FS, SEA, SEA_FS, SEA_VS, SKY_FS, SKY_LUT_FS, TERRAIN_FS, TERRAIN_VS, WATER_FS, WATER_VS, WATERBLUR_FS, WATERMAP_FS, WATERMAP_VS } from './cityShaders.ts';

export type { CityFrame, InstancedBatch, InstancedMeta, LocalRenderer, MeshHandle };

/** How many heights the land's shares are given at, beyond the plan's map (setLand). */
export const SHARE_STEPS = 32;

/** Texture units, the same for every program; 12 to 16 are the passes' own, for their targets. */
const UNIT = { noise: 0, sky: 1, shadow: 2, ao: 3, entities: 4, ground: 5, normal: 8, mask: 11, fields: 17, waterMap: 18, scene: 19, sceneDepth: 20, matColour: 21, matNormal: 22, leaves: 23, litter: 24, farFields: 25 } as const;

/**
 * The leaves that lie fallen under trees, for the shader: the atlas's tile of the litter a kind of leaf falls as, and
 * of a second kind's. Until a scene says what its canopy's leaves are, plain broad ones and flat needles.
 */
const litterTiles = (first: LeafKindName, next: LeafKindName): number[] => [litterTile(LEAF_KINDS[first].falls), litterTile(LEAF_KINDS[next].falls)];

/** The grid of hexagons a scanned material is read among (cityShaders.ts, MATERIALS): tiles to a repeat, and where their numbers repeat. */
const MAT_TILES = 3;
const MAT_WRAP = 4096;

/** The water's map from above: texels a side, and metres it covers; it is drawn again when the eye leaves its middle. */
const WATER_MAP = { size: 512, span: 2048, snap: 512 } as const;

const SHADOW_SIZE = 2048;
// Above this clearance, motion on the ground and contact shadows are smaller than a display pixel.
const DISTANT_GROUND = 16000;

/**
 * The wind the plants lean in (docs/plans/RENDERING.md, step 5): a gentle breeze from one quarter, the renderer's own,
 * as no field of the climate's winds says yet where it blew from.
 */
const WIND: [number, number] = [0.82, 0.46];

/** How many frames, each a fraction of a pixel off the last, are averaged while the view holds still (step 4). */
const STEADY_FRAMES = 8;

/**
 * The still (docs/plans/RENDERING.md, step 8): how many frames it averages, drawn at twice the size each way, and how far
 * from the sun's middle, in radians, the shadows are cast from as it goes, so that they soften as a disc's would.
 */
const STILL_FRAMES = 48;
const STILL_SCALE = 2;
const STILL_SUN = 0.012;

/**
 * How a frame is exposed (docs/plans/RENDERING.md, step 4): for the light on open level ground, the sun's on it and the
 * sky's, as an incident-light meter sets a camera, so that snow and sand stay bright and a meadow is a meadow's shade,
 * whatever the frame holds. Above a knee, about the light of a sun 18° up, it follows the light nearly all the way, as an
 * eye adapts by day; below it, not at all, so that dusk, twilight and night darken with the light and a sky with the sun
 * low in it keeps its colours. Then, at full quality, a frame darker than the key, a forest floor, is lifted part of the
 * way towards it, as an eye adapts to shade; a brighter one is left as its light makes it. The renderer's look, set on
 * the look book's views; nobody's record.
 */
const EXPOSURE = {
  /** the knee, as `daylight` measures light; the exposure there and below; and how far it follows the light above */
  knee: 1,
  at: 1.4,
  above: 0.85,
  /** the mean of an exposed frame's log luminance below which the meter lifts it; how far towards it; and at most */
  key: 0.18,
  lift: 0.5,
  most: 1.8,
};

/** The Halton sequence in a base: the offsets frames are jittered by, spread evenly over a pixel. */
function halton(i: number, base: number): number {
  let f = 1;
  let r = 0;
  for (let k = i; k > 0; k = Math.floor(k / base)) {
    f /= base;
    r += f * (k % base);
  }
  return r;
}

/** A projection moved by a fraction of a pixel across the screen. */
function jittered(p: Mat4, dx: number, dy: number): Mat4 {
  const m = new Float32Array(p);
  m[8] += dx;
  m[9] += dy;
  return m;
}

/** A mesh of the city on the GPU. */
export interface CellGPU extends MeshHandle {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
}

/** One kind of mesh drawn many times, with a buffer of everyone drawn with it. */
export interface InstancedGPU {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  instances: WebGLBuffer;
  /** bytes the instance buffer holds */
  capacity: number;
  indexCount: number;
  count: number;
  /** drawn into the shadow map: what is only a shape is left out */
  casts: boolean;
  /** how an animal's mesh idles: its joints, then its swings and pace (world/generators/life/stream.ts, ProtoMesh) */
  idle: Float32Array | null;
  /**
   * The ways of those drawn with it, where any goes one (world/generators/life/routines.ts): a buffer in step with
   * the instances, the bytes it holds, and whether the mesh is reading it now. A mesh that reads none has every way
   * all noughts, and everyone drawn with it stays where they stand.
   */
  ways: WebGLBuffer | null;
  waysCapacity: number;
  waysOn: boolean;
  /** local bounding geometry and material flags for shadow culling and impostors */
  bounds: ProtoBounds;
  /** conservative world AABB of the current instance batch */
  batchBounds: BatchBounds | null;
  /** canopy tree family key when eligible for octahedral impostors, else null */
  treeKey: number | null;
  /** level of detail (0 far, 1 mid, 2 close, 3 clump) */
  detail: number;
  /** lazily built billboard VAO sharing `instances` when drawn via octahedral impostors */
  impVao: WebGLVertexArrayObject | null;
}

const LOOKAT_UP: V3 = [0, 0, 1];
/** The rock the ground is drawn with, and its stones, where nothing says what rock it is: nobody's record. */
const PLAIN_ROCK = [0.36, 0.33, 0.28, 0.3, 0.28, 0.25];

function ortho(l: number, r: number, b: number, t: number, n: number, f: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = 2 / (r - l);
  m[5] = 2 / (t - b);
  m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l);
  m[13] = -(t + b) / (t - b);
  m[14] = -(f + n) / (f - n);
  m[15] = 1;
  return m;
}

const nrm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dt = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The eye's height above the sea: the GPU's eye has the Earth's curve taken off, as the shaders' `drop` takes it. */
const aboveSea = (eye: V3) => eye[2] + (eye[0] * eye[0] + eye[1] * eye[1]) / (2 * 6371000);

const luminance = (c: ArrayLike<number>) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * How much a camera under the sea opens up at a height below it, with this much light falling on the sea: as far as the
 * daylight there falls short of a day's at the surface, up to a limit.
 */
function underExposure(z: number, lit: V3): number {
  if (z >= 0) return 1;
  const light = SEA.light.map((k, i) => Math.max(Math.exp(k * z), SEA.floor[i] * Math.exp(z / SEA.deep)));
  return Math.max(1, Math.min(SEA.open, SEA.day / Math.max(1e-6, luminance(lit) * luminance(light))));
}

/**
 * The sky's light on a surface by the way it faces, from the table of the sky's radiance (docs/plans/RENDERING.md, step 4):
 * the upper half of the sky projected on nine spherical harmonics, turned into irradiance over π (Ramamoorthi & Hanrahan
 * 2001), with each term's constant folded in so that the shader multiplies plain products of the normal's components; and
 * scaled so that a surface facing straight up takes as much light as `top` says, as the two colours before it did.
 */
function skyHarmonics(table: Float32Array, sun: V3, top: V3): Float32Array {
  const W = 192;
  const H = 128;
  const sample = (u: number, v: number, out: number[]) => {
    const x = Math.max(0, Math.min(W - 1.001, u * (W - 1)));
    const y = Math.max(0, Math.min(H - 1.001, v * (H - 1)));
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    for (let c = 0; c < 3; c++) {
      const a = table[(j * W + i) * 4 + c] * (1 - fx) + table[(j * W + i + 1) * 4 + c] * fx;
      const b = table[((j + 1) * W + i) * 4 + c] * (1 - fx) + table[((j + 1) * W + i + 1) * 4 + c] * fx;
      out[c] = a * (1 - fy) + b * fy;
    }
  };
  const L = new Float64Array(27);
  const phiS = Math.atan2(sun[1], sun[0]);
  const NA = 64;
  const NE = 24;
  const rgb = [0, 0, 0];
  for (let j = 0; j < NE; j++) {
    const el = ((j + 0.5) / NE) * (Math.PI / 2);
    const ce = Math.cos(el);
    const z = Math.sin(el);
    // The table's elevation: more of it near the horizon (SKY_LUT_FS).
    const v = 0.5 + 0.5 * Math.sqrt(el / (Math.PI / 2));
    const dw = ce * (Math.PI / 2 / NE) * ((2 * Math.PI) / NA);
    for (let i = 0; i < NA; i++) {
      const phi = ((i + 0.5) / NA) * 2 * Math.PI;
      const rel = Math.abs(((((phi - phiS) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      sample(rel / Math.PI, v, rgb);
      const x = ce * Math.cos(phi);
      const y = ce * Math.sin(phi);
      const Y = [1, y, z, x, x * y, y * z, 3 * z * z - 1, x * z, x * x - y * y];
      for (let k = 0; k < 9; k++) for (let c = 0; c < 3; c++) L[k * 3 + c] += rgb[c] * Y[k] * dw;
    }
  }
  // Each term: its basis constant squared (once to project, once to evaluate) and its band's share of the cosine, Â/π.
  const C = [0.282095, 0.488603, 0.488603, 0.488603, 1.092548, 1.092548, 0.315392, 1.092548, 0.546274];
  const A = [1, 2 / 3, 2 / 3, 2 / 3, 1 / 4, 1 / 4, 1 / 4, 1 / 4, 1 / 4];
  const out = new Float32Array(27);
  for (let k = 0; k < 9; k++) for (let c = 0; c < 3; c++) out[k * 3 + c] = L[k * 3 + c] * C[k] * C[k] * A[k];
  // Straight up: the constant, the vertical, and twice the third band's middle term.
  const up = [0, 1, 2].map((c) => out[c] + out[6 + c] + 2 * out[18 + c]);
  const scale = luminance(top) / Math.max(1e-6, luminance(up));
  for (let k = 0; k < 27; k++) out[k] *= scale;
  return out;
}

/** A square grid of the terrain's vertices, with the middle of it left out or not. */
function ringMesh(n: number, hole: number): { positions: Float32Array; indices: Uint32Array; ringCount: number } {
  const side = n * 2 + 1;
  const positions = new Float32Array(side * side * 2);
  let o = 0;
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      positions[o++] = i;
      positions[o++] = j;
    }
  }
  const at = (i: number, j: number) => (j + n) * side + (i + n);
  const ring: number[] = [];
  const middle: number[] = [];
  for (let j = -n; j < n; j++) {
    for (let i = -n; i < n; i++) {
      const inside = i >= -hole && i < hole && j >= -hole && j < hole;
      (inside ? middle : ring).push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }
  return { positions, indices: Uint32Array.from([...ring, ...middle]), ringCount: ring.length };
}

/** Link the local passes together so the globe can keep drawing while the driver compiles them. */
function localPrograms(gl: GL) {
  return {
    meshP: linkProgram(gl, 'city mesh', MESH_VS, MESH_FS),
    depthP: linkProgram(gl, 'city depth', MESH_VS, DEPTH_FS),
    idP: linkProgram(gl, 'city id', MESH_VS, ID_FS),
    terrainP: linkProgram(gl, 'city terrain', TERRAIN_VS, TERRAIN_FS),
    terrainDepthP: linkProgram(gl, 'city terrain depth', TERRAIN_VS, `#version 300 es
precision highp float;
in vec3 vPos;
uniform vec4 uInner;
out vec4 o;
void main() {
  if (vPos.x > uInner.x && vPos.y > uInner.y && vPos.x < uInner.z && vPos.y < uInner.w) discard;
  o = vec4(0.0);
}`),
    waterP: linkProgram(gl, 'city water', WATER_VS, WATER_FS),
    seaP: linkProgram(gl, 'city sea', SEA_VS, SEA_FS),
    cloudsP: linkProgram(gl, 'city clouds', FULLSCREEN_VS, CLOUDS_FS),
    skyP: linkProgram(gl, 'city sky', FULLSCREEN_VS, SKY_FS),
    lutP: linkProgram(gl, 'city sky table', FULLSCREEN_VS, SKY_LUT_FS),
    aoP: linkProgram(gl, 'city ao', FULLSCREEN_VS, AO_FS),
    blurP: linkProgram(gl, 'city blur', FULLSCREEN_VS, BLUR_FS),
    brightP: linkProgram(gl, 'city bright', FULLSCREEN_VS, BRIGHT_FS),
    postP: linkProgram(gl, 'city post', FULLSCREEN_VS, POST_FS),
    taaP: linkProgram(gl, 'city antialiasing', FULLSCREEN_VS, TAA_FS),
    lumP: linkProgram(gl, 'city meter', FULLSCREEN_VS, LUM_FS),
    shaftsP: linkProgram(gl, 'city light in the air', FULLSCREEN_VS, SHAFTS_FS),
    shaftsAddP: linkProgram(gl, 'city light in the air, added', FULLSCREEN_VS, SHAFTS_ADD_FS),
    waterMapP: linkProgram(gl, 'city water map', WATERMAP_VS, WATERMAP_FS),
    waterBlurP: linkProgram(gl, 'city water blur', FULLSCREEN_VS, WATERBLUR_FS),
    impBakeP: linkProgram(gl, 'city impostor bake', IMP_BAKE_VS, IMP_BAKE_FS),
    impostorP: linkProgram(gl, 'city impostor', IMPOSTOR_VS, IMPOSTOR_FS),
    impostorDepthP: linkProgram(gl, 'city impostor depth', IMPOSTOR_VS, IMPOSTOR_DEPTH_FS),
    impostorIdP: linkProgram(gl, 'city impostor id', IMPOSTOR_VS, IMPOSTOR_ID_FS),
    smokeP: linkProgram(gl, 'city smoke', SMOKE_VS, SMOKE_FS),
  };
}

export class CityRenderer implements LocalRenderer<CellGPU> {
  private meshP: Program;
  private depthP: Program;
  private idP: Program;
  private terrainP: Program;
  private terrainDepthP: Program;
  private waterP: Program;
  private seaP: Program;
  private cloudsP: Program;
  private skyP: Program;
  private lutP: Program;
  private aoP: Program;
  private blurP: Program;
  private brightP: Program;
  private postP: Program;
  private taaP: Program;
  private lumP: Program;
  private shaftsP: Program;
  private shaftsAddP: Program;
  private waterMapP: Program;
  private waterBlurP: Program;
  private impBakeP: Program;
  private impostorP: Program;
  private impostorDepthP: Program;
  private impostorIdP: Program;
  private smokeP: Program;
  private impostors: ImpostorAtlas;

  private noise: WebGLTexture;
  private lut: WebGLTexture;
  private lutFb: WebGLFramebuffer;
  private lutKey = '';
  private shadow: WebGLTexture;
  private shadowFb: WebGLFramebuffer[] = [];
  private shadowKeys = ['', '', ''];
  private shadowM: Float32Array = new Float32Array(48);
  private shadowRadii: V3 = [100, 500, 9000];
  private entityTex: WebGLTexture | null = null;
  private entityData: Float32Array | null = null;
  private entityRows = 0;
  private entitySerial = 0;
  /** counts the meshes added or removed: shadows must be drawn again */
  private meshSerial = 0;
  private groundTex: WebGLTexture[] = [];
  private normalTex: WebGLTexture[] = [];
  private grids: GroundLevel[] = [];
  private mask: WebGLTexture;
  private maskBox: [number, number, number, number] = [0, 0, 1, 1];
  /** What people made of the ground, where a scene has people: R crops, G pasture, B yards, A paddies; and how its plots are drawn */
  private fields: WebGLTexture;
  private fieldsBox: [number, number, number, number] = [0, 0, 1, 1];
  /** How much of the land was worked beyond the plan's own map, coarsely (settlement/v9.ts, farLand): R crops, G pasture, A paddies */
  private farFields: WebGLTexture;
  private farBox: [number, number, number, number] = [0, 0, 0, 0];
  private fieldStyle: [number, number, number, number] = [0, 1, 0, 0];
  private slotColor: Float32Array = DEFAULT_FIELD_PALETTE.slotColor;
  private slotColor2: Float32Array = DEFAULT_FIELD_PALETTE.slotColor2;
  private slotMeta: Float32Array = DEFAULT_FIELD_PALETTE.slotMeta;
  /** how far from the eye a field's crop is drawn plant by plant, in rows, m: 0 where it is not */
  private sown = 0;
  /** Animated hearth & kiln smoke plume emitters (instanced billboarded rising puffs). */
  private smokeVao: WebGLVertexArrayObject | null = null;
  private smokeQuadBuf: WebGLBuffer | null = null;
  private smokeInstBuf: WebGLBuffer | null = null;
  private smokeCount = 0;
  private ringVao: WebGLVertexArrayObject;
  private ringCount = 0;
  private fullCount = 0;
  private emptyVao: WebGLVertexArrayObject;
  private waterVao: WebGLVertexArrayObject | null = null;
  private waterBuffers: WebGLBuffer[] = [];
  private waterCount = 0;
  private waterLevel = 7;
  /** the shallows' and the depths' colours, where a scene gives them */
  private waterTone: number[] | null = null;
  /** how far toward the eye water that follows its channels is drawn, as a share of its distance */
  private waterBias = 0;
  /** The water seen from above, around the eye, for its banks: two targets to blur between, and the box drawn */
  private waterMapTex: WebGLTexture[] = [];
  private waterMapFb: WebGLFramebuffer[] = [];
  private waterMapKey = '';
  private waterSerial = 0;
  private waterBox: [number, number, number, number] = [0, 0, 1, 1];
  /** whether floats can be blended, so that where two waters lie one over the other the map keeps the higher */
  private floatBlend = false;
  /** how much of the sky the clouds cover over the scene, as the globe's clouds have it (step 7) */
  private cloudCover = 0.35;
  /** what lies under the trees, 0 broad leaves to 1 needles; and whether clumps of low plants cover the ground close by */
  private litter = 0;
  private litterTiles = litterTiles('broad-oval', 'needle-flat');
  private litterNext = 0;
  private clumps = 0;
  /** the ground is land nobody has farmed: what the mask says of it is a wild place's */
  wild = false;
  /**
   * the scene is of the sea: its floor is drawn at its depth, the water's surface over it apart, and everything under the
   * water is seen through it; a visitor may go down into it
   */
  sea = false;
  /** how much the camera opens up this frame, under the sea */
  private exposure = 1;
  /** what the wild land's colours are, ten tones in threes; and its shares of forest, low plants and bare ground */
  private tones: Float32Array = new Float32Array(30);
  private shares: V3 = [1, 1, 0];
  /** the ground's own materials, where the world says what they are: how much they decide and their marks, their shares, their tones */
  private sub: [number, number, number, number] = [0, 0, 0, 0];
  private subShare: Float32Array = new Float32Array(8);
  private subBand: Float32Array = new Float32Array(16);
  private subTone: Float32Array = new Float32Array(48);
  /** how much of the earth under plants takes the substrate's colour; and the shade of a mapped soil's fine earth, or nothing */
  private subSoil: [number, number] = [0, 0];
  private rock: Float32Array = Float32Array.of(...PLAIN_ROCK);
  /** where snow lies on the wild land: from a height, thickening over a height, off slopes steeper than a share */
  private snow: V3 = [1e6, 1, 1];
  /** the land's shares at each of a run of heights, and the run: its first height, its step and the height its edges wander over */
  private sharesAt: Float32Array = new Float32Array(SHARE_STEPS * 3);
  private shareSpan: V3 = [0, 0, 0];
  /** everything drawn by instancing, by what mesh it is */
  private instanced = new Map<number, InstancedGPU>();
  /**
   * The ground's scanned materials (materials.ts): fetched once, at full quality only, and drawn with once they have
   * come. Until then, and on the lighter way, the two arrays are a texel each and the ground is drawn without them.
   */
  readonly materials: GroundMaterialSet;
  private noMaterial: WebGLTexture[] = [];
  /**
   * The atlas of leaves a plant's cards show (leafatlas.ts): drawn once, off the page, at full quality only, where
   * plants have cards. Until it has come a card shows nothing.
   */
  private leaves: WebGLTexture;
  leavesReady = false;
  /** How the ground reads the atlas, for what lies fallen (its tiles of litter): repeating, where a card's tile does not. */
  private litterSampler: WebGLSampler;
  private matAt = new Float32Array(48);
  private matCell = new Float32Array(24);

  // Render targets, remade when the size changes.
  private w = 0;
  private h = 0;
  /** the frame's own size, which the scene is drawn at, or twice it for a still */
  private outW = 0;
  private outH = 0;
  /** Single-sample floating-point scene target (RGBA16F + DEPTH24_STENCIL8); TAA + hashed alpha replaces 4x MSAA. */
  private sceneFb!: WebGLFramebuffer;
  private colorTex!: WebGLTexture;
  /** the scene colour alone, to add shafts to while its depth is read */
  private colorFb: WebGLFramebuffer | null = null;
  private depthTex!: WebGLTexture;
  /** Lazily allocated 1x copy target used only when water reads the opaque scene + depth for SSR/refraction. */
  private waterCopyFb: WebGLFramebuffer | null = null;
  private waterSceneTex: WebGLTexture | null = null;
  private waterDepthTex: WebGLTexture | null = null;
  /** Half-resolution ping-pong volumetric cloud targets (RGBA16F: premultiplied radiance + transmittance, -1 if occluded). */
  private cloudTex: WebGLTexture[] = [];
  private cloudFb: WebGLFramebuffer[] = [];
  private cloudAt = 0;
  private cloudW = 1;
  private cloudH = 1;
  private cloudValid = false;
  private lastFarVp: Mat4 | null = null;
  private lastCloudEye: V3 = [0, 0, 0];
  private aoFb: WebGLFramebuffer[] = [];
  private aoTex: WebGLTexture[] = [];
  private bloomFb: WebGLFramebuffer[] = [];
  private bloomTex: WebGLTexture[] = [];
  private pickFb: WebGLFramebuffer | null = null;
  private pickTex: WebGLTexture | null = null;
  private pickDepth: WebGLRenderbuffer | null = null;
  /** what the last frame used, for picking */
  private lastFrame: CityFrame | null = null;
  /**
   * Temporal antialiasing (step 4): two frames' worth of what has been kept, one read and the other written; the view
   * the last was drawn for, how many frames have been drawn of it, and its view and projection, unmoved, to carry what
   * was kept to where it is now.
   */
  private historyTex: WebGLTexture[] = [];
  private historyFb: WebGLFramebuffer[] = [];
  private historyAt = 0;
  private viewKey = '';
  private steady = 0;
  private frames = 0;
  /** which of the averaged frames this is: its jitter, and where marches through the air and the clouds start */
  private sample = 0;
  private lastVp: Mat4 | null = null;
  private lastEye: V3 = [0, 0, 0];
  /** the meter of the frame's light: a small target of its log, with mipmaps down to one texel */
  private lumTex: WebGLTexture | null = null;
  private lumFb: WebGLFramebuffer | null = null;
  /** the light in the air, at a quarter of the frame's size */
  private shaftsTex: WebGLTexture | null = null;
  private shaftsFb: WebGLFramebuffer | null = null;
  /** counts changes to who is lit and hovered, which the frame shows but no mesh changes for */
  private flagSerial = 0;
  private lastDraw: CellGPU[] = [];
  private sunColor: V3 = [3, 2.8, 2.5];
  private skyTop: V3 = [0.3, 0.45, 0.8];
  /** the light on open level ground, the sun's on it and the sky's from above, by which a frame is exposed */
  private daylight = 3;
  private skyLow: V3 = [0.5, 0.55, 0.65];
  private bounce: V3 = [0.2, 0.17, 0.12];
  /** the sky's light by direction, as nine spherical harmonics (docs/plans/RENDERING.md, step 4) */
  private skyHarmonics: Float32Array = new Float32Array(27);

  /** How long each pass takes, when someone measures (docs/plans/RENDERING.md, step 0). */
  readonly timer: FrameTimer;

  /** The cells to draw this frame; the scene sets it. */
  shadowCells: (focus: V3, radius: number) => CellGPU[] = () => [];
  /**
   * The lighter way to draw, for slow machines and software rendering: one sample a pixel, no
   * shadows, no occlusion and no bloom. Their textures are cleared once to "lit", "open" and
   * "none", so the shaders are the same in both ways.
   */
  private fast: boolean;

  /** A distant parked view holds one sample of the scene's clock. Close by, only its animated layers need another. */
  ambientMotion(clearance: number, movingInstances: boolean): boolean {
    return clearance < DISTANT_GROUND && (movingInstances || this.waterCount > 0 || (!this.fast && (this.cloudCover > 0 || this.smokeCount > 0)));
  }

  static async create(gl: GL, opts: { fast?: boolean }): Promise<CityRenderer> {
    const parallel = gl.getExtension('KHR_parallel_shader_compile');
    const programs = localPrograms(gl);
    gl.flush();
    if (parallel) {
      const linked = Object.values(programs);
      while (!gl.isContextLost() && linked.some(p => !gl.getProgramParameter(p.program, parallel.COMPLETION_STATUS_KHR))) {
        await new Promise(resolve => setTimeout(resolve, 16));
      }
    }
    return new CityRenderer(gl, opts, programs);
  }

  private constructor(private gl: GL, opts: { fast?: boolean }, programs: ReturnType<typeof localPrograms>) {
    this.fast = !!opts.fast;
    this.timer = new FrameTimer(gl);
    this.materials = new GroundMaterialSet(gl);
    for (const [unit, internal] of [[UNIT.matColour, gl.SRGB8_ALPHA8], [UNIT.matNormal, gl.RGBA8]] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, internal, 1, 1, 1);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.noMaterial.push(t);
    }
    gl.activeTexture(gl.TEXTURE0 + UNIT.leaves);
    this.leaves = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.leaves);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 1, 1, 1);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.litterSampler = gl.createSampler()!;
    gl.samplerParameteri(this.litterSampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.samplerParameteri(this.litterSampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.samplerParameteri(this.litterSampler, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.samplerParameteri(this.litterSampler, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const litterAniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (litterAniso) gl.samplerParameterf(this.litterSampler, litterAniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(litterAniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number));
    this.bindLitter();
    if (!this.fast && typeof Worker !== 'undefined') this.drawLeaves();
    // Where the viewer is served from: its materials lie beside its page.
    if (!this.fast && typeof document !== 'undefined') this.materials.load(new URL('.', document.baseURI).href, () => this.meshSerial++);
    const ext = gl.getExtension('EXT_color_buffer_float');
    if (!ext) throw new Error('This view of the city needs floating-point render targets (EXT_color_buffer_float).');
    gl.getExtension('OES_texture_float_linear');
    this.meshP = programs.meshP.finish();
    this.depthP = programs.depthP.finish();
    this.idP = programs.idP.finish();
    this.terrainP = programs.terrainP.finish();
    this.terrainDepthP = programs.terrainDepthP.finish();
    this.waterP = programs.waterP.finish();
    this.seaP = programs.seaP.finish();
    this.cloudsP = programs.cloudsP.finish();
    this.skyP = programs.skyP.finish();
    this.lutP = programs.lutP.finish();
    this.aoP = programs.aoP.finish();
    this.blurP = programs.blurP.finish();
    this.brightP = programs.brightP.finish();
    this.postP = programs.postP.finish();
    this.taaP = programs.taaP.finish();
    this.lumP = programs.lumP.finish();
    this.shaftsP = programs.shaftsP.finish();
    this.shaftsAddP = programs.shaftsAddP.finish();
    this.waterMapP = programs.waterMapP.finish();
    this.waterBlurP = programs.waterBlurP.finish();
    this.impBakeP = programs.impBakeP.finish();
    this.impostorP = programs.impostorP.finish();
    this.impostorDepthP = programs.impostorDepthP.finish();
    this.impostorIdP = programs.impostorIdP.finish();
    this.smokeP = programs.smokeP.finish();
    this.impostors = new ImpostorAtlas(gl, this.impBakeP);

    // Noise, tiling, in four independent channels: everything's roughness and grain comes from it.
    // Its values are the generator's (world/generators/life/sorting.ts), which reads the same noise where it sows what
    // stands on the ground.
    const size = NOISE_SIZE;
    const data = new Uint8Array(size * size * size * 4);
    for (let i = 0; i < data.length; i += 4) {
      const n = i / 4;
      const x = n % size;
      const y = Math.floor(n / size) % size;
      const z = Math.floor(n / (size * size));
      for (let c = 0; c < 4; c++) data[i + c] = noiseByte(x, y, z, c);
    }
    this.noise = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + UNIT.noise);
    gl.bindTexture(gl.TEXTURE_3D, this.noise);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_3D);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.REPEAT);

    // The sky table.
    gl.activeTexture(gl.TEXTURE0 + UNIT.sky);
    this.lut = texture2D(gl, { width: 192, height: 128, internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, data: null, filter: gl.LINEAR });
    this.lutFb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lutFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.lut, 0);

    // Shadows: three cascades.
    this.shadow = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + UNIT.shadow);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.shadow);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 3);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    for (let k = 0; k < 3; k++) {
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, this.shadow, 0, k);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      this.shadowFb.push(fb);
    }

    gl.activeTexture(gl.TEXTURE0 + UNIT.mask);
    this.mask = texture2D(gl, { width: 1, height: 1, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: new Uint8Array([0, 0, 0, 0]), filter: gl.LINEAR });
    gl.activeTexture(gl.TEXTURE0 + UNIT.fields);
    this.fields = texture2D(gl, { width: 1, height: 1, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: new Uint8Array([0, 0, 0, 0]), filter: gl.LINEAR });
    gl.activeTexture(gl.TEXTURE0 + UNIT.farFields);
    this.farFields = texture2D(gl, { width: 1, height: 1, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: new Uint8Array([0, 0, 0, 0]), filter: gl.LINEAR });
    // The water's map: in floats, as a level needs, with a dry bed's mark beside it; filtered where the browser can filter floats. The fast way has none.
    if (!this.fast) {
      gl.activeTexture(gl.TEXTURE0 + UNIT.waterMap);
      const linear = !!gl.getExtension('OES_texture_float_linear');
      this.floatBlend = !!gl.getExtension('EXT_float_blend');
      for (let k = 0; k < 2; k++) {
        const t = texture2D(gl, { width: WATER_MAP.size, height: WATER_MAP.size, internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, data: null, filter: linear ? gl.LINEAR : gl.NEAREST });
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fb = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        this.waterMapTex.push(t);
        this.waterMapFb.push(fb);
      }
    }

    // What a mesh with no instances reads for its instance's entity: an integer attribute that is not enabled must
    // have an integer value, or every plain draw is refused.
    gl.vertexAttribI4ui(7, 0, 0, 0, 0);

    const ring = ringMesh(64, 30);
    this.ringVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.ringVao);
    const vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, ring.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ring.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.ringCount = ring.ringCount;
    this.fullCount = ring.indices.length;
    this.emptyVao = gl.createVertexArray()!;
    this.bindSamplers();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Have the atlas of leaves drawn, off the page, and take it as an array of textures when it comes. */
  private drawLeaves(): void {
    const gl = this.gl;
    const worker = new Worker(new URL('./leafworker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<LeafAtlas>) => {
      const a = e.data;
      worker.terminate();
      gl.activeTexture(gl.TEXTURE0 + UNIT.leaves);
      gl.deleteTexture(this.leaves);
      this.leaves = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.leaves);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, a.levels.length, gl.RGBA8, a.width, a.height, a.layers);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      a.levels.forEach((texels, level) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, level, 0, 0, 0, Math.max(1, a.width >> level), Math.max(1, a.height >> level), a.layers, gl.RGBA, gl.UNSIGNED_BYTE, texels));
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number));
      this.bindLitter();
      gl.activeTexture(gl.TEXTURE0);
      this.leavesReady = true;
      this.meshSerial++;
    };
    worker.postMessage(0);
  }

  /** The atlas of leaves on the ground's own unit, read through the sampler that repeats. */
  private bindLitter(): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + UNIT.litter);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.leaves);
    gl.bindSampler(UNIT.litter, this.litterSampler);
  }

  /** Whether a scene still waits for the atlas of leaves: wanted, and not yet come. */
  get leavesLoading(): boolean {
    return !this.fast && typeof Worker !== 'undefined' && !this.leavesReady;
  }

  private bindSamplers(): void {
    const gl = this.gl;
    const ints = (p: Program, names: Record<string, number>) => {
      gl.useProgram(p.program);
      for (const [n, v] of Object.entries(names)) {
        const loc = p.uniforms.get(n);
        if (loc) gl.uniform1i(loc, v);
      }
    };
    const lit = { uNoise: UNIT.noise, uSkyLut: UNIT.sky, uShadow: UNIT.shadow, uAO: UNIT.ao, uEntities: UNIT.entities };
    const ground = { uGround0: UNIT.ground, uGround1: UNIT.ground + 1, uGround2: UNIT.ground + 2, uNormal0: UNIT.normal, uNormal1: UNIT.normal + 1, uNormal2: UNIT.normal + 2, uMask: UNIT.mask, uFields: UNIT.fields, uFarFields: UNIT.farFields };
    ints(this.meshP, { ...lit, uMask: UNIT.mask, uLeaves: UNIT.leaves, uMatColour: UNIT.matColour, uMatNormal: UNIT.matNormal });
    ints(this.depthP, { uEntities: UNIT.entities, uLeaves: UNIT.leaves });
    ints(this.idP, { uEntities: UNIT.entities, uLeaves: UNIT.leaves });
    // The ground reads the atlas of leaves for what lies fallen, through a sampler of its own that repeats its tiles.
    ints(this.terrainP, { ...lit, ...ground, uWaterMap: UNIT.waterMap, uMatColour: UNIT.matColour, uMatNormal: UNIT.matNormal, uLeaves: UNIT.litter });
    ints(this.waterBlurP, { uTex: UNIT.waterMap });
    ints(this.terrainDepthP, ground);
    ints(this.waterP, { ...lit, uScene: UNIT.scene, uSceneDepth: UNIT.sceneDepth });
    ints(this.seaP, { ...lit, ...ground });
    ints(this.cloudsP, { uNoise: UNIT.noise, uScene: 12, uCloudHistory: 13 });
    ints(this.skyP, { uNoise: UNIT.noise, uSkyLut: UNIT.sky, uClouds: 13 });
    ints(this.aoP, { uDepth: 12 });
    ints(this.blurP, { uTex: 13, uDepth: 12 });
    ints(this.brightP, { uTex: 13 });
    ints(this.postP, { uScene: 13, uBloom0: 14, uBloom1: 15, uBloom2: 16, uLum: 12 });
    ints(this.taaP, { uCurrent: 13, uHistory: 14, uDepth: 12 });
    ints(this.lumP, { uTex: 13 });
    ints(this.shaftsP, lit);
    ints(this.shaftsAddP, { uTex: 13, uSceneDepth: UNIT.sceneDepth });
    ints(this.impBakeP, { uNoise: UNIT.noise, uLeaves: UNIT.leaves });
    ints(this.impostorP, { ...lit, uMask: UNIT.mask, uImpAlbedo: 15, uImpNormal: 16 });
    ints(this.impostorDepthP, { uEntities: UNIT.entities, uImpAlbedo: 15 });
    ints(this.impostorIdP, { uEntities: UNIT.entities, uImpAlbedo: 15 });
    ints(this.smokeP, { uNoise: UNIT.noise });
  }

  /** The ground's grids: heights to sample in the vertex shader, and normals to filter. */
  setGround(levels: GroundLevel[], heights: Int16Array[], normals?: Uint8Array[]): void {
    const gl = this.gl;
    this.grids = levels;
    levels.forEach((g, k) => {
      const z = heights[k];
      gl.activeTexture(gl.TEXTURE0 + UNIT.ground + k);
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16I, g.nx, g.ny, 0, gl.RED_INTEGER, gl.SHORT, z);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.groundTex.push(t);
      const n = normals?.[k] ?? groundNormals(g, z);
      gl.activeTexture(gl.TEXTURE0 + UNIT.normal + k);
      const nt = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, nt);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, g.nx, g.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, n);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.normalTex.push(nt);
    });
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Let go of the ground's grids, for a site to take their place. */
  clearGround(): void {
    const gl = this.gl;
    for (const t of [...this.groundTex, ...this.normalTex]) gl.deleteTexture(t);
    this.groundTex = [];
    this.normalTex = [];
    this.grids = [];
    this.cloudValid = false;
    this.lastFarVp = null;
    this.meshSerial++;
    // Nor is any land beyond it worked until its scene says so.
    this.farBox = [0, 0, 0, 0];
    // A new ground is the climate's until its scene says what it is made of, and its rock the renderer's own.
    this.setSubstrate(null);
    this.setRock(null);
  }

  /**
   * What covers the ground close by, as a scene's taxa say: the share of its canopy whose leaves are needles, for the
   * colour of what lies under the trees; whether it has low plants to cover the ground with clumps; and the canopy's
   * two commonest kinds of leaf, which are the leaves that lie fallen under it, with the second's share of the two.
   */
  setGroundCover(litter: number, clumps: boolean, fallen?: { first: LeafKindName; next: LeafKindName; share: number }): void {
    this.litter = Math.max(0, Math.min(1, litter));
    this.clumps = clumps ? 1 : 0;
    // The fallen leaves are of the canopy's two commonest kinds, the second as often as its share of the two.
    this.litterTiles = fallen ? litterTiles(fallen.first, fallen.next) : litterTiles('broad-oval', 'needle-flat');
    this.litterNext = fallen ? Math.max(0, Math.min(1, fallen.share)) : this.litter;
  }

  /** How much of the sky the clouds cover over the scene, 0–1: from the globe's clouds, so the way down keeps its weather. */
  setCloudCover(cover: number): void {
    this.cloudCover = Math.max(0, Math.min(1, cover));
  }

  /**
   * The colours and shares of the land, as a place's climate gives them; and where the world gives the climate at a
   * height, the shares at each of `SHARE_STEPS` heights from `from`, `step` apart, with the height their edges wander
   * over: what covers the ground beyond the plan's map, where a far range has its own treeline.
   */
  setLand(tones: Float32Array, shares: V3, snow?: { line: number; band: number; slope: number }, byHeight?: { from: number; step: number; band: number; shares: Float32Array }): void {
    this.tones = tones;
    this.shares = shares;
    this.snow = snow && Number.isFinite(snow.line) ? [snow.line, snow.band, snow.slope] : [1e6, 1, 1];
    this.sharesAt = byHeight && byHeight.shares.length === SHARE_STEPS * 3 ? byHeight.shares : new Float32Array(SHARE_STEPS * 3);
    this.shareSpan = byHeight && byHeight.shares.length === SHARE_STEPS * 3 ? [byHeight.from, byHeight.step, byHeight.band] : [0, 0, 0];
    this.impostors.invalidateTones();
  }

  /**
   * What the ground is made of, where the world says (core/substrate.ts): how much of the ground it decides, each
   * material's share and two tones, and the marks its sources name. Null where nothing says: the climate's ground alone.
   */
  setSubstrate(look: { weight: number; shares: Float32Array; bands: Float32Array; tones: Float32Array; cracks: number; ripples: number; grain: number; soil: number; shade: number } | null): void {
    this.sub = look ? [look.weight, look.cracks, look.ripples, look.grain] : [0, 0, 0, 0];
    this.subShare = look ? look.shares : new Float32Array(8);
    this.subBand = look ? look.bands : new Float32Array(16);
    this.subTone = look ? look.tones : new Float32Array(48);
    this.subSoil = look ? [look.soil, look.shade] : [0, 0];
  }

  /** The colour of the rock under the ground and of its stones, where the world says what rock it is; null for the renderer's own. */
  setRock(look: { rock: V3; stones: V3 } | null): void {
    this.rock = look ? Float32Array.of(...look.rock, ...look.stones) : Float32Array.of(...PLAIN_ROCK);
  }

  /** A mesh that will be drawn by instancing. */
  addInstanced(id: number, vertices: ArrayBuffer, indices: Uint32Array, casts: boolean, idle?: number[], meta?: InstancedMeta): void {
    const gl = this.gl;
    const bounds = computeProtoBounds(vertices);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const stride = 28;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribIPointer(3, 2, gl.UNSIGNED_BYTE, stride, 24);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribIPointer(4, 1, gl.UNSIGNED_SHORT, stride, 26);
    const instances = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferData(gl.ARRAY_BUFFER, 28 * 16, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 28, 0);
    gl.vertexAttribDivisor(5, 1);
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 2, gl.FLOAT, false, 28, 16);
    gl.vertexAttribDivisor(6, 1);
    gl.enableVertexAttribArray(7);
    gl.vertexAttribIPointer(7, 2, gl.UNSIGNED_SHORT, 28, 24);
    gl.vertexAttribDivisor(7, 1);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    const treeKey = meta?.treeKey !== undefined ? meta.treeKey : null;
    const detail = meta?.detail ?? 2;
    this.instanced.set(id, {
      vao,
      vbo,
      ibo,
      instances,
      capacity: 28 * 16,
      indexCount: indices.length,
      count: 0,
      casts,
      idle: idle && idle.length >= 16 ? Float32Array.from(idle.slice(0, 16)) : null,
      ways: null,
      waysCapacity: 0,
      waysOn: false,
      bounds,
      batchBounds: null,
      treeKey,
      detail,
      impVao: null,
    });
    if (!this.fast && treeKey !== null && detail >= 1) {
      this.impostors.registerSource(treeKey, vao, indices.length, bounds, detail);
    }
  }

  /**
   * Who is drawn with each mesh this frame. Meshes not named draw nobody. `ways`, where a batch has them, are the ways
   * its bodies go, 48 bytes each in step with `data` (world/generators/life/routines.ts): the shader moves each along
   * its own by the frame's clock.
   */
  setInstances(batches: InstancedBatch[]): void {
    const gl = this.gl;
    for (const g of this.instanced.values()) {
      g.count = 0;
      g.batchBounds = null;
    }
    for (const b of batches) {
      const g = this.instanced.get(b.proto);
      if (!g) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, g.instances);
      if (b.data.byteLength > g.capacity) {
        g.capacity = b.data.byteLength * 2;
        gl.bufferData(gl.ARRAY_BUFFER, g.capacity, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Uint8Array(b.data));
      g.count = b.count;
      g.batchBounds = b.count > 0 ? computeBatchBounds(b.data, b.count, g.bounds, b.ways) : null;
      if (b.ways) {
        if (!g.ways) g.ways = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, g.ways);
        if (b.ways.byteLength > g.waysCapacity) {
          g.waysCapacity = b.ways.byteLength * 2;
          gl.bufferData(gl.ARRAY_BUFFER, g.waysCapacity, gl.DYNAMIC_DRAW);
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Uint8Array(b.ways));
        if (!g.waysOn) {
          gl.bindVertexArray(g.vao);
          for (let k = 0; k < 3; k++) {
            gl.enableVertexAttribArray(8 + k);
            gl.vertexAttribPointer(8 + k, 4, gl.FLOAT, false, 48, k * 16);
            gl.vertexAttribDivisor(8 + k, 1);
          }
          gl.bindVertexArray(null);
          g.waysOn = true;
        }
      } else if (g.waysOn) {
        // No one drawn with it goes anywhere now: its ways read as noughts again.
        gl.bindVertexArray(g.vao);
        for (let k = 0; k < 3; k++) gl.disableVertexAttribArray(8 + k);
        gl.bindVertexArray(null);
        g.waysOn = false;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.meshSerial++;
  }

  /** Let go of everything drawn by instancing. */
  clearInstanced(): void {
    const gl = this.gl;
    for (const g of this.instanced.values()) {
      gl.deleteVertexArray(g.vao);
      gl.deleteBuffer(g.vbo);
      gl.deleteBuffer(g.ibo);
      gl.deleteBuffer(g.instances);
      if (g.ways) gl.deleteBuffer(g.ways);
      if (g.impVao) gl.deleteVertexArray(g.impVao);
    }
    this.instanced.clear();
    this.impostors.clear();
    this.meshSerial++;
  }

  /** Whether an instanced batch is currently drawn via its GPU-baked octahedral tree impostor. */
  private impostorFor(g: InstancedGPU) {
    if (this.fast || !this.leavesReady || g.treeKey === null || g.detail > 1) return null;
    return this.impostors.get(g.treeKey);
  }

  /** How many are drawn by instancing, and the triangles that makes (2 tris per octahedral impostor). */
  instancedStats(): { meshes: number; instances: number; triangles: number; impostorInstances: number } {
    let instances = 0;
    let triangles = 0;
    let meshes = 0;
    let impostorInstances = 0;
    for (const g of this.instanced.values()) {
      if (!g.count) continue;
      meshes++;
      instances += g.count;
      if (this.impostorFor(g)) {
        impostorInstances += g.count;
        triangles += g.count * 2;
      } else {
        triangles += (g.count * g.indexCount) / 3;
      }
    }
    return { meshes, instances, triangles, impostorInstances };
  }

  private drawInstanced(p: Program, shadow: boolean, cascade?: CascadeBox): void {
    if (!this.instanced.size) return;
    const gl = this.gl;
    const loc = p.uniforms.get('uInstanced');
    const idle = p.uniforms.get('uIdle');
    const idling = p.uniforms.get('uIdling');
    const shadowPad = p.uniforms.get('uShadowPad');
    const shadowInvR = p.uniforms.get('uShadowInvR');
    if (loc) gl.uniform1f(loc, 1);
    if (shadowInvR) gl.uniform1f(shadowInvR, shadow && cascade ? 1 / cascade.radius : 0);
    for (const g of this.instanced.values()) {
      if (!g.count || (shadow && !g.casts)) continue;
      if (this.impostorFor(g)) continue;
      if (shadow && cascade && g.batchBounds && !batchOverlapsCascade(g.batchBounds, cascade)) continue;
      if (shadowPad) gl.uniform1f(shadowPad, shadow && cascade ? (g.bounds.originRadius * 1.15) / cascade.radius : -1);
      if (idling) gl.uniform1f(idling, g.idle ? 1 : 0);
      if (idle && g.idle) gl.uniform4fv(idle, g.idle);
      gl.bindVertexArray(g.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, g.indexCount, gl.UNSIGNED_INT, 0, g.count);
    }
    if (loc) gl.uniform1f(loc, 0);
    if (idling) gl.uniform1f(idling, 0);
    if (shadowPad) gl.uniform1f(shadowPad, -1);
    if (shadowInvR) gl.uniform1f(shadowInvR, 0);
    gl.bindVertexArray(null);
  }

  /** Draw mid/far canopy trees as 2-triangle instanced hemi-octahedral billboards. */
  private drawImpostors(p: Program, f: CityFrame, vp: Mat4, camRight: V3, camUp: V3, orthoDir: V3, cascade?: CascadeBox): void {
    if (this.fast || !this.leavesReady || !this.impostors.albedoTex || !this.impostors.normalTex || !this.instanced.size) return;
    const gl = this.gl;
    let bound = false;
    const layerLoc = p.uniforms.get('uImpLayer');
    const midLoc = p.uniforms.get('uImpMidZ');
    const radLoc = p.uniforms.get('uImpRadius');
    const padLoc = p.uniforms.get('uShadowPad');
    for (const g of this.instanced.values()) {
      if (!g.count || (cascade && !g.casts)) continue;
      const slot = this.impostorFor(g);
      if (!slot) continue;
      if (cascade && g.batchBounds && !batchOverlapsCascade(g.batchBounds, cascade)) continue;
      if (!bound) {
        bound = true;
        if (p === this.impostorP) {
          this.useLit(p, f, vp);
        } else {
          gl.useProgram(p.program);
          setUniforms(gl, p, { uViewProj: vp, uEye: cascade ? [0, 0, 0] : f.eye, uTime: f.time, uClock: f.clock ?? 0, uWind: WIND });
        }
        setUniforms(gl, p, { uCamRight: camRight, uCamUp: camUp, uOrthoDir: orthoDir });
        gl.activeTexture(gl.TEXTURE15);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.impostors.albedoTex);
        gl.activeTexture(gl.TEXTURE16);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.impostors.normalTex);
      }
      if (!g.impVao) g.impVao = this.impostors.createBatchVao(g.instances);
      if (layerLoc) gl.uniform1f(layerLoc, slot.layer);
      if (midLoc) gl.uniform1f(midLoc, slot.midZ);
      if (radLoc) gl.uniform1f(radLoc, slot.radius);
      if (padLoc) gl.uniform1f(padLoc, cascade ? (slot.radius * 1.15) / cascade.radius : -1);
      gl.bindVertexArray(g.impVao);
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, g.count);
    }
    if (bound) {
      if (padLoc) gl.uniform1f(padLoc, -1);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE15);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
      gl.activeTexture(gl.TEXTURE16);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
      gl.activeTexture(gl.TEXTURE0);
    }
  }

  /** What the plan says the ground is: R built-up, G garden. */
  setMask(data: Uint8Array, size: number, box: [number, number, number, number]): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + UNIT.mask);
    gl.bindTexture(gl.TEXTURE_2D, this.mask);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.activeTexture(gl.TEXTURE0);
    this.maskBox = box;
  }

  /**
   * What people made of the ground (gen:people/settlement): R crops, G pasture, B yards and lanes, A flooded paddies; and how
   * the plots of its fields are drawn: their size in m, how much longer than wide, and their kind. Without it, none.
   */
  setFields(
    data: Uint8Array | null,
    size: number,
    box: [number, number, number, number],
    style: { plot: number; aspect: number; kind: number; sown?: number; palette?: { slotColor: Float32Array; slotColor2: Float32Array; slotMeta: Float32Array } },
  ): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + UNIT.fields);
    gl.bindTexture(gl.TEXTURE_2D, this.fields);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (data) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    } else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.activeTexture(gl.TEXTURE0);
    this.fieldsBox = box;
    this.fieldStyle = [style.plot, style.aspect, style.kind, data ? 1 : 0];
    this.sown = data ? style.sown ?? 0 : 0;
    const pal = style.palette ?? DEFAULT_FIELD_PALETTE;
    this.slotColor = pal.slotColor;
    this.slotColor2 = pal.slotColor2;
    this.slotMeta = pal.slotMeta;
  }

  /**
   * How much of the land was worked beyond the plan's own map, coarsely, as shares (settlement/v9.ts, farLand): R crops,
   * G pasture, A paddies, over a box in the scene's metres. The ground lays it out in patches beyond the plan's map and
   * across a band at its edge, so that the fields do not stop where the plan does. Without it, the fields stop there.
   */
  setFarFields(data: Uint8Array | null, size: number, box: [number, number, number, number]): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + UNIT.farFields);
    gl.bindTexture(gl.TEXTURE_2D, this.farFields);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (data) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.activeTexture(gl.TEXTURE0);
    this.farBox = data ? box : [0, 0, 0, 0];
  }

  /** Upload hearth & kiln smoke plume emitters: 5 floats each [x, y, z, strength, seed]. */
  setSmokes(data: Float32Array | null): void {
    const gl = this.gl;
    this.smokeCount = data ? Math.floor(data.length / 5) : 0;
    if (!this.smokeCount || !data) return;
    if (!this.smokeVao) {
      // 8 staggered puffs per emitter × 6 vertices per billboard quad = 48 vertices (3 floats each: cx, cy, puffIdx).
      const quad = new Float32Array(8 * 6 * 3);
      const corners: [number, number][] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, -1],
        [1, 1],
        [-1, 1],
      ];
      let k = 0;
      for (let puff = 0; puff < 8; puff++) {
        for (const [cx, cy] of corners) {
          quad[k++] = cx;
          quad[k++] = cy;
          quad[k++] = puff;
        }
      }
      this.smokeVao = gl.createVertexArray()!;
      gl.bindVertexArray(this.smokeVao);
      this.smokeQuadBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.smokeQuadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
      this.smokeInstBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.smokeInstBuf);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 20, 0);
      gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 20, 16);
      gl.vertexAttribDivisor(3, 1);
      gl.bindVertexArray(null);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.smokeInstBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  }

  /**
   * The water: its mesh, the level its banks are wetted at, and, where it flows, each vertex's flow (x, y in m/s) and
   * depth, and the colours of its shallows and its depths. Without them it is the Tiber's still, silty green.
   */
  setWater(vertices: Float32Array, indices: Uint32Array, level: number, flow?: Float32Array, tone?: number[]): void {
    const gl = this.gl;
    this.waterLevel = level;
    this.waterTone = tone && tone.length >= 6 ? tone.slice(0, 6) : null;
    if (this.waterVao) gl.deleteVertexArray(this.waterVao);
    for (const b of this.waterBuffers) gl.deleteBuffer(b);
    this.waterVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.waterVao);
    const vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.waterBuffers = [vb];
    this.waterBias = flow && flow.length === vertices.length ? 0.01 : 0;
    if (flow && flow.length === vertices.length) {
      const fb = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, fb);
      gl.bufferData(gl.ARRAY_BUFFER, flow, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      this.waterBuffers.push(fb);
    } else {
      gl.disableVertexAttribArray(1);
      gl.vertexAttrib3f(1, 0, 0, 0);
    }
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this.waterBuffers.push(ib);
    gl.bindVertexArray(null);
    this.waterCount = indices.length;
    this.waterSerial++;
  }

  /**
   * The water near the eye seen from above, for its banks (docs/plans/RENDERING.md, step 2): its mesh drawn straight down
   * into a map of its level and its presence, then blurred, both weighted by the water, so that a bank close to it knows
   * the level it stands above. Drawn again only when the eye leaves the middle of the map or the water changes.
   */
  private updateWaterMap(f: CityFrame): void {
    if (this.fast || !this.wild || this.sea || !this.waterVao || !this.waterCount || !this.waterMapFb.length) return;
    const gl = this.gl;
    const cx = Math.round(f.eye[0] / WATER_MAP.snap) * WATER_MAP.snap;
    const cy = Math.round(f.eye[1] / WATER_MAP.snap) * WATER_MAP.snap;
    const key = `${cx},${cy},${this.waterSerial}`;
    if (key === this.waterMapKey) return;
    this.waterMapKey = key;
    const half = WATER_MAP.span / 2;
    this.waterBox = [cx - half, cy - half, WATER_MAP.span, WATER_MAP.span];
    gl.viewport(0, 0, WATER_MAP.size, WATER_MAP.size);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.waterMapFb[0]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Where two waters lie one over the other, the higher, where floats can be blended; otherwise the last drawn.
    if (this.floatBlend) {
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.MAX);
    }
    gl.useProgram(this.waterMapP.program);
    setUniforms(gl, this.waterMapP, { uBox: this.waterBox });
    gl.bindVertexArray(this.waterVao);
    gl.drawElements(gl.TRIANGLES, this.waterCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
    // Blurred across and along, twice, the second time wider: some 40 m out from the water.
    gl.useProgram(this.waterBlurP.program);
    gl.bindVertexArray(this.emptyVao);
    gl.activeTexture(gl.TEXTURE0 + UNIT.waterMap);
    const texel = 1 / WATER_MAP.size;
    for (const step of [1, 2.5]) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const from = dx ? 0 : 1;
        gl.bindTexture(gl.TEXTURE_2D, this.waterMapTex[from]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.waterMapFb[1 - from]);
        setUniforms(gl, this.waterBlurP, { uDir: [dx * texel * step, dy * texel * step] });
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** When each entity stood, and what it rests on: [start, end, flags, ground] per entity. */
  setEntities(data: Float32Array): void {
    const gl = this.gl;
    this.entityData = data;
    this.entityRows = Math.ceil(data.length / 4 / 256);
    if (this.entityTex) gl.deleteTexture(this.entityTex);
    gl.activeTexture(gl.TEXTURE0 + UNIT.entities);
    const padded = new Float32Array(256 * this.entityRows * 4);
    padded.set(data);
    this.entityData = padded;
    this.entityTex = texture2D(gl, { width: 256, height: this.entityRows, internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, data: padded });
    gl.activeTexture(gl.TEXTURE0);
    this.entitySerial++;
  }

  /** Change when an entity stood, as a scenario dates it. */
  setEntityTime(index: number, start: number, end: number): void {
    if (!this.entityData || !this.entityTex) return;
    const gl = this.gl;
    if (this.entityData[index * 4] === start && this.entityData[index * 4 + 1] === end) return;
    this.entityData[index * 4] = start;
    this.entityData[index * 4 + 1] = end;
    gl.activeTexture(gl.TEXTURE0 + UNIT.entities);
    gl.bindTexture(gl.TEXTURE_2D, this.entityTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, index & 255, index >> 8, 1, 1, gl.RGBA, gl.FLOAT, this.entityData, index * 4);
    gl.activeTexture(gl.TEXTURE0);
    this.entitySerial++;
  }

  /** Change one entity's flags: its basis, selection and hover. */
  setEntityFlags(index: number, flags: number): void {
    if (!this.entityData || !this.entityTex) return;
    const gl = this.gl;
    if (this.entityData[index * 4 + 2] === flags) return;
    this.entityData[index * 4 + 2] = flags;
    this.flagSerial++;
    gl.activeTexture(gl.TEXTURE0 + UNIT.entities);
    gl.bindTexture(gl.TEXTURE_2D, this.entityTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, index & 255, index >> 8, 1, 1, gl.RGBA, gl.FLOAT, this.entityData, index * 4);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Put a mesh on the GPU. */
  upload(vertices: ArrayBuffer, indices: Uint32Array): CellGPU {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const stride = 28;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribIPointer(3, 2, gl.UNSIGNED_BYTE, stride, 24);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribIPointer(4, 1, gl.UNSIGNED_SHORT, stride, 26);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.meshSerial++;
    return { vao, vbo, ibo, count: indices.length, bytes: vertices.byteLength + indices.byteLength };
  }

  remove(c: CellGPU): void {
    const gl = this.gl;
    this.meshSerial++;
    gl.deleteVertexArray(c.vao);
    gl.deleteBuffer(c.vbo);
    gl.deleteBuffer(c.ibo);
  }

  private resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    if (!this.sceneFb) this.sceneFb = gl.createFramebuffer()!;
    gl.activeTexture(gl.TEXTURE12);
    if (this.colorTex) gl.deleteTexture(this.colorTex);
    if (this.depthTex) gl.deleteTexture(this.depthTex);
    this.colorTex = texture2D(gl, { width: w, height: h, internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, data: null, filter: gl.LINEAR });
    this.depthTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH24_STENCIL8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.TEXTURE_2D, this.depthTex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('the city needs a floating-point depth-stencil target');
    if (!this.colorFb) this.colorFb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTex, 0);
    // Drop lazy water copy target on resize; reallocated only when a scene actually draws screen-space water.
    if (this.waterSceneTex) gl.deleteTexture(this.waterSceneTex);
    if (this.waterDepthTex) gl.deleteTexture(this.waterDepthTex);
    if (this.waterCopyFb) gl.deleteFramebuffer(this.waterCopyFb);
    this.waterSceneTex = null;
    this.waterDepthTex = null;
    this.waterCopyFb = null;
    // Half-size occlusion, half-size temporal clouds, and the bloom's chain.
    for (const t of [...this.aoTex, ...this.bloomTex, ...this.cloudTex]) gl.deleteTexture(t);
    for (const f of [...this.aoFb, ...this.bloomFb, ...this.cloudFb]) gl.deleteFramebuffer(f);
    this.aoTex = [];
    this.aoFb = [];
    this.bloomTex = [];
    this.bloomFb = [];
    this.cloudTex = [];
    this.cloudFb = [];
    this.cloudValid = false;
    this.lastFarVp = null;
    const target = (tw: number, th: number, internal: number, format: number, type: number, list: WebGLTexture[], fbs: WebGLFramebuffer[], filter: number = gl.LINEAR) => {
      const t = texture2D(gl, { width: tw, height: th, internal, format, type, data: null, filter });
      const f = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      list.push(t);
      fbs.push(f);
    };
    const aw = Math.max(1, w >> 1);
    const ah = Math.max(1, h >> 1);
    target(aw, ah, gl.R8, gl.RED, gl.UNSIGNED_BYTE, this.aoTex, this.aoFb);
    target(aw, ah, gl.R8, gl.RED, gl.UNSIGNED_BYTE, this.aoTex, this.aoFb);
    for (let k = 0; k < 3; k++) target(Math.max(1, w >> (k + 1)), Math.max(1, h >> (k + 1)), gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, this.bloomTex, this.bloomFb);
    // What is kept from frame to frame, half-res volumetric clouds, and the meter; the fast way has none.
    for (const t of this.historyTex) gl.deleteTexture(t);
    for (const f of this.historyFb) gl.deleteFramebuffer(f);
    this.historyTex = [];
    this.historyFb = [];
    this.viewKey = '';
    this.lastVp = null;
    if (this.shaftsTex) gl.deleteTexture(this.shaftsTex);
    if (this.shaftsFb) gl.deleteFramebuffer(this.shaftsFb);
    this.shaftsTex = null;
    this.shaftsFb = null;
    if (!this.fast) {
      [this.cloudW, this.cloudH] = halfSize(w, h);
      for (let k = 0; k < 2; k++) {
        target(this.cloudW, this.cloudH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, this.cloudTex, this.cloudFb, gl.NEAREST);
        gl.clearColor(0, 0, 0, -1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.clearColor(0, 0, 0, 0);
      const air: WebGLTexture[] = [];
      const airFb: WebGLFramebuffer[] = [];
      target(Math.max(1, w >> 2), Math.max(1, h >> 2), gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, air, airFb);
      this.shaftsTex = air[0];
      this.shaftsFb = airFb[0];
      for (let k = 0; k < 2; k++) target(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, this.historyTex, this.historyFb);
      if (!this.lumTex) {
        this.lumTex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.lumTex);
        gl.texStorage2D(gl.TEXTURE_2D, 7, gl.R16F, 64, 64);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        this.lumFb = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.lumFb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.lumTex, 0);
      }
    }
    if (this.fast) {
      // Nothing occluded, nothing glowing: the passes that would fill these are skipped.
      const fill = (fbs: WebGLFramebuffer[], v: number) => {
        for (const f of fbs) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, f);
          gl.clearColor(v, v, v, v);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
      };
      fill(this.aoFb, 1);
      fill(this.bloomFb, 0);
      gl.clearColor(0, 0, 0, 0);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Allocate the 1x opaque scene+depth copy target lazily, only for frames that draw screen-space water. */
  private ensureWaterCopy(): void {
    if (this.waterCopyFb) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE12);
    this.waterSceneTex = texture2D(gl, { width: this.w, height: this.h, internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, data: null, filter: gl.LINEAR });
    this.waterDepthTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.waterDepthTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH24_STENCIL8, this.w, this.h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.waterCopyFb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.waterCopyFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.waterSceneTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.TEXTURE_2D, this.waterDepthTex, 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** The sky table and the light of this sun, seen from this height. */
  private updateSky(sun: V3, height: number): void {
    const gl = this.gl;
    const sunKey = sun.map((x) => x.toFixed(4)).join();
    const key = `${sunKey}|${Math.round(height / 200)}`;
    if (key === this.lutKey) return;
    const sunChanged = this.lutKey.split('|')[0] !== sunKey;
    this.lutKey = key;
    const el = Math.asin(Math.max(-1, Math.min(1, sun[2])));
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lutFb);
    gl.viewport(0, 0, 192, 128);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.useProgram(this.lutP.program);
    gl.bindVertexArray(this.emptyVao);
    const draw = (h: number) => {
      setUniforms(gl, this.lutP, { uSunLut: [Math.cos(el), 0, Math.sin(el)], uHeight: Math.max(1, h) });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    if (!sunChanged) return draw(height);
    draw(20);
    // The light it gives: read back from the table straight up, and around the horizon.
    const read = (u: number, v: number): V3 => {
      const px = new Float32Array(4);
      gl.readPixels(Math.floor(u * 191), Math.floor(v * 127), 1, 1, gl.RGBA, gl.FLOAT, px);
      return [px[0], px[1], px[2]];
    };
    // The whole table, for the sky's light on a surface by the way it faces.
    const table = new Float32Array(192 * 128 * 4);
    gl.readPixels(0, 0, 192, 128, gl.RGBA, gl.FLOAT, table);
    const zen = read(0.5, 0.97);
    const hA = read(0.1, 0.56);
    const hB = read(0.9, 0.56);
    const hM = read(0.5, 0.56);
    const low: V3 = [(hA[0] + hB[0] + 2 * hM[0]) / 4, (hA[1] + hB[1] + 2 * hM[1]) / 4, (hA[2] + hB[2] + 2 * hM[2]) / 4];
    // Sunlight, reddened by the air it crossed.
    const deg = (el * 180) / Math.PI;
    const air = 1 / (Math.max(Math.sin(el), 0) + 0.15 * Math.pow(Math.max(deg + 3.885, 0.3), -1.253));
    const tr = (b: number, m: number) => Math.exp(-(b * 8000 + m * 1500 * 1.1) * air);
    const up = Math.max(0, Math.min(1, (deg + 2) / 4));
    // Softened toward white a little: a camera's white balance would do as much.
    const soft = (x: number) => Math.pow(x, 0.62);
    this.sunColor = [soft(tr(5.8e-6, 14e-6)) * 3.8 * up, soft(tr(13.5e-6, 14e-6)) * 3.75 * up, soft(tr(33.1e-6, 14e-6)) * 3.7 * up];
    this.skyTop = [zen[0] * 0.62, zen[1] * 0.62, zen[2] * 0.62];
    this.skyLow = [low[0] * 0.26, low[1] * 0.26, low[2] * 0.26];
    this.skyHarmonics = skyHarmonics(table, sun, this.skyTop);
    const s = Math.max(sun[2], 0);
    this.daylight = luminance(this.sunColor) * s + luminance(this.skyTop);
    this.bounce = [(this.sunColor[0] * s + this.skyTop[0]) * 0.13, (this.sunColor[1] * s + this.skyTop[1]) * 0.105, (this.sunColor[2] * s + this.skyTop[2]) * 0.075];
    for (let k = 0; k < 3; k++) this.shadowKeys[k] = '';
    draw(height);
  }

  private useLit(p: Program, f: CityFrame, vp: Mat4): void {
    const gl = this.gl;
    gl.useProgram(p.program);
    setUniforms(gl, p, {
      uViewProj: vp,
      uEye: f.eye,
      uSun: f.sun,
      uSunColor: this.sunColor,
      uSkyTop: this.skyTop,
      uSkyLow: this.skyLow,
      uBounce: this.bounce,
      uShadowFocus: f.focus,
      uShadowRadii: this.shadowRadii,
      uHazeK: 2.0e-5,
      uTime: f.time,
      uClock: f.clock ?? 0,
      uClockSky: f.clock ?? 0,
      uCloudCover: this.cloudCover,
      uCloudVolume: this.fast ? 0 : 1,
      uFrameNoise: halton(Math.max(0, this.sample - 1), 2),
      uShadowPad: -1,
      uShadowInvR: 0,
      uWind: WIND,
      uAOSize: [this.w, this.h],
      uEvidence: f.evidence ? 1 : 0,
      uWild: this.wild ? 1 : 0,
      uSeaSurface: this.seaSurface,
      uSea: this.sea ? 1 : 0,
      uBanks: f.clearance < DISTANT_GROUND && this.waterMapKey && !this.fast && this.wild && !this.sea ? 1 : 0,
      uWaterBox: this.waterBox,
      uLitter: this.litter,
      uClumps: this.clumps,
      uCrops: this.fast ? 0 : this.sown,
      uMaterials: this.materials.ready ? 1 : 0,
      uLitterTile: this.litterTiles,
      uLitterNext: this.litterNext,
    });
    const matMean = p.uniforms.get('uMatMean');
    if (matMean && this.materials.ready) {
      // Where the eye is in each material's repeat and in its grid of tiles, in doubles: the shader counts from the eye.
      const m = this.materials;
      const n = m.mean.length / 4;
      for (let k = 0; k < n; k++) {
        const metres = m.mean[k * 4 + 3];
        const x = f.eye[0] / metres;
        const y = f.eye[1] / metres;
        const sx = x * MAT_TILES;
        const sy = (-0.57735027 * x + 1.15470054 * y) * MAT_TILES;
        this.matAt.set([x - Math.floor(x), y - Math.floor(y), sx - Math.floor(sx), sy - Math.floor(sy)], k * 4);
        this.matCell.set([((Math.floor(sx) % MAT_WRAP) + MAT_WRAP) % MAT_WRAP, ((Math.floor(sy) % MAT_WRAP) + MAT_WRAP) % MAT_WRAP], k * 2);
      }
      gl.uniform4fv(matMean, m.mean);
      const look = p.uniforms.get('uMatLook');
      if (look) gl.uniform4fv(look, m.look);
      // Only the ground reads a material among its tiles, from the eye: what is built reads it by its own face.
      const at = p.uniforms.get('uMatAt');
      if (at) gl.uniform4fv(at, this.matAt);
      const cell = p.uniforms.get('uMatCell');
      if (cell) gl.uniform2fv(cell, this.matCell);
      const up = p.uniforms.get('uMatUp');
      // The one read from the side, a face of rock in beds: where the eye's height is in its repeat.
      if (up) {
        const z = f.eye[2] / m.mean[GROUND_LAYERS.indexOf('strata') * 4 + 3];
        gl.uniform1f(up, z - Math.floor(z));
      }
    }
    const tone = p.uniforms.get('uTone');
    if (tone) gl.uniform3fv(tone, this.tones);
    const share = p.uniforms.get('uShare');
    if (share) gl.uniform3fv(share, this.shares);
    const shareAt = p.uniforms.get('uShareAt');
    if (shareAt) gl.uniform3fv(shareAt, this.sharesAt);
    const shareSpan = p.uniforms.get('uShareSpan');
    if (shareSpan) gl.uniform3fv(shareSpan, this.shareSpan);
    const sub = p.uniforms.get('uSub');
    if (sub) gl.uniform4fv(sub, this.sub);
    const subShare = p.uniforms.get('uSubShare');
    if (subShare) gl.uniform1fv(subShare, this.subShare);
    const subBand = p.uniforms.get('uSubBand');
    if (subBand) gl.uniform2fv(subBand, this.subBand);
    const subTone = p.uniforms.get('uSubTone');
    if (subTone) gl.uniform3fv(subTone, this.subTone);
    const subSoil = p.uniforms.get('uSubSoil');
    if (subSoil) gl.uniform2f(subSoil, this.subSoil[0], this.subSoil[1]);
    const rock = p.uniforms.get('uRock');
    if (rock) gl.uniform3fv(rock, this.rock);
    const snow = p.uniforms.get('uSnow');
    if (snow) gl.uniform3fv(snow, this.snow);
    const fb = p.uniforms.get('uFieldsBox');
    if (fb) gl.uniform4f(fb, this.fieldsBox[0], this.fieldsBox[1], this.fieldsBox[2] - this.fieldsBox[0], this.fieldsBox[3] - this.fieldsBox[1]);
    const far = p.uniforms.get('uFarBox');
    if (far) gl.uniform4f(far, this.farBox[0], this.farBox[1], this.farBox[2] - this.farBox[0], this.farBox[3] - this.farBox[1]);
    const fs = p.uniforms.get('uFieldStyle');
    if (fs) gl.uniform4fv(fs, this.fieldStyle);
    const sc = p.uniforms.get('uSlotColor');
    if (sc) gl.uniform4fv(sc, this.slotColor);
    const sc2 = p.uniforms.get('uSlotColor2');
    if (sc2) gl.uniform4fv(sc2, this.slotColor2);
    const sm = p.uniforms.get('uSlotMeta');
    if (sm) gl.uniform4fv(sm, this.slotMeta);
    const mb = p.uniforms.get('uMaskBox');
    if (mb) gl.uniform4f(mb, this.maskBox[0], this.maskBox[1], this.maskBox[2] - this.maskBox[0], this.maskBox[3] - this.maskBox[1]);
    const sh = p.uniforms.get('uSH');
    if (sh) gl.uniform3fv(sh, this.skyHarmonics);
    const sl = p.uniforms.get('uSkyLight');
    if (sl) gl.uniform1f(sl, 1);
    const m = p.uniforms.get('uShadowM');
    if (m) gl.uniformMatrix4fv(m, false, this.shadowM);
  }

  /** Whether the terrain is drawn at the sea's surface where it lies under it: on wild land, but not in a scene of the sea. */
  private get seaSurface(): number {
    return this.wild && !this.sea ? 1 : 0;
  }

  private setGrids(p: Program): void {
    const gl = this.gl;
    const grid = p.uniforms.get('uGrid');
    const size = p.uniforms.get('uGridSize');
    if (grid) gl.uniform4fv(grid, this.grids.flatMap((g) => [g.x0, g.y0, g.cell, 32 * g.cell]));
    if (size) gl.uniform2fv(size, this.grids.flatMap((g) => [g.nx, g.ny]));
    const unit = p.uniforms.get('uGridUnit');
    if (unit) gl.uniform2fv(unit, this.grids.flatMap((g) => [g.unit ?? 0.1, g.base ?? 0]));
  }

  /**
   * Draw a span of the terrain's rings: each twice the size of the last, centred on the eye. `each` is told of each ring
   * before it is drawn; `edge` is how far into the finer ring, in its cells, a ring's hole stops.
   */
  private drawRings(p: Program, eye: V3, from: number, to: number, finest: number, each?: (k: number) => void, edge = 63.5): void {
    const gl = this.gl;
    gl.bindVertexArray(this.ringVao);
    const cellLoc = p.uniforms.get('uCell');
    const centerLoc = p.uniforms.get('uCenter');
    const innerLoc = p.uniforms.get('uInner');
    for (let k = from; k <= to; k++) {
      const cell = 5 * 2 ** k;
      const snap = cell * 2;
      const cx = Math.round(eye[0] / snap) * snap;
      const cy = Math.round(eye[1] / snap) * snap;
      each?.(k);
      gl.uniform1f(cellLoc!, cell);
      gl.uniform2f(centerLoc!, cx, cy);
      if (k === finest) {
        gl.uniform4f(innerLoc!, 1e9, 1e9, -1e9, -1e9);
        gl.drawElements(gl.TRIANGLES, this.fullCount, gl.UNSIGNED_INT, 0);
      } else {
        const fine = cell / 2;
        const fsnap = fine * 2;
        const fx = Math.round(eye[0] / fsnap) * fsnap;
        const fy = Math.round(eye[1] / fsnap) * fsnap;
        // Short of the finer ring's edge: exactly at it, a pixel can fall between the two and show as a dash.
        const ext = fine * edge;
        gl.uniform4f(innerLoc!, fx - ext, fy - ext, fx + ext, fy + ext);
        gl.drawElements(gl.TRIANGLES, this.ringCount, gl.UNSIGNED_INT, 0);
      }
    }
    gl.bindVertexArray(null);
  }

  /** The terrain's rings in view of this frame: the finest worth drawing, and where far and near part. */
  private ringsFor(f: CityFrame): { finest: number; split: number; last: number } {
    // Fine enough for a narrow valley or the river's bed to show from a few kilometres up.
    const finest = Math.max(0, Math.min(10, Math.floor(Math.log2(Math.max(f.clearance, 1) / 40)) - 3));
    let split = finest;
    // A ring goes in the near pass if it reaches no further than the near pass's far plane.
    while (split < 11 && 5 * 2 ** split * 64 < f.far * 0.8) split++;
    return { finest, split, last: 11 };
  }

  /** The shadow cascades: nearest, middle, and the whole city, each from the sun's side. */
  private updateShadows(f: CityFrame): void {
    const gl = this.gl;
    const sun = f.sun;
    if (sun[2] <= 0) return;
    const range = Math.max(30, Math.hypot(f.eye[0] - f.focus[0], f.eye[1] - f.focus[1], f.eye[2] - f.focus[2]));
    // The nearest cascade is as wide as the view is far, and no narrower than a clearing: close to, a shadow is fine
    // enough to meet the foot that casts it.
    const r0 = Math.min(Math.max(24, range * 1.0), 1400);
    const r1 = Math.min(r0 * 5, 7000);
    const r2 = Math.max(r1 * 2.5, 9000);
    this.shadowRadii = [r0, r1, r2];
    const right = nrm(crs(LOOKAT_UP, sun));
    const up = crs(sun, right);
    let animatedCasters = false;
    for (const g of this.instanced.values()) {
      if (g.count > 0 && g.casts && (g.bounds.isPlant || !!g.idle || !!g.batchBounds?.hasMovers)) {
        animatedCasters = true;
        break;
      }
    }
    gl.colorMask(false, false, false, false);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2.0, 4.0);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    for (let k = 2; k >= 0; k--) {
      const r = this.shadowRadii[k];
      const texel = (r * 2) / SHADOW_SIZE;
      // Snap to the shadow map's own grid, so its edges do not crawl as the camera moves.
      const cR = dt(f.focus, right);
      const cU = dt(f.focus, up);
      const sR = Math.round(cR / texel) * texel;
      const sU = Math.round(cU / texel) * texel;
      // What moves in the wind, idles or goes from place to place moves its shadow: the nearest cascade is drawn again
      // ten times a second of the visit's clock, and the middle four times. Static scenes (cities, barren rock) reuse
      // cached cascades without redrawing on clock ticks.
      const moved = !animatedCasters ? 0 : k === 0 ? Math.round((f.clock ?? 0) * 10) : k === 1 ? Math.round((f.clock ?? 0) * 4) : 0;
      const key = `${sR.toFixed(1)},${sU.toFixed(1)},${r.toFixed(1)},${sun.join()},${k === 2 ? Math.round(f.time / 4) : f.time},${this.entitySerial},${this.meshSerial},${moved}`;
      const depthRange = Math.max(r * 4, 2500);
      const zc = dt(f.focus, sun);
      const view = new Float32Array([right[0], up[0], sun[0], 0, right[1], up[1], sun[1], 0, right[2], up[2], sun[2], 0, 0, 0, 0, 1]);
      const proj = ortho(sR - r, sR + r, sU - r, sU + r, -(zc + depthRange), -(zc - depthRange));
      const m = multiply(proj, view);
      this.shadowM.set(m, k * 16);
      if (key === this.shadowKeys[k]) continue;
      this.shadowKeys[k] = key;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFb[k]);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      // The fast way casts no shadows: a cleared map lights everything.
      if (this.fast) continue;
      const cascade: CascadeBox = { right, up, sun, sR, sU, radius: r, texel, cascadeIndex: k };
      // Everything's position already has the eye taken off for the camera; here it is absolute.
      gl.useProgram(this.depthP.program);
      setUniforms(gl, this.depthP, { uViewProj: m, uEye: [0, 0, 0], uTime: f.time, uCards: 1, uClock: f.clock ?? 0, uWind: WIND, uShadowPad: -1, uShadowInvR: 0 });
      // Both sides of a face: many of a building's are shells, seen from either side.
      gl.disable(gl.CULL_FACE);
      for (const c of this.shadowCells(f.focus, r * 1.45)) {
        gl.bindVertexArray(c.vao);
        gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_INT, 0);
      }
      this.drawInstanced(this.depthP, true, cascade);
      this.drawImpostors(this.impostorDepthP, f, m, right, up, sun, cascade);
      gl.enable(gl.CULL_FACE);
      // The hills cast shadows too.
      gl.useProgram(this.terrainDepthP.program);
      setUniforms(gl, this.terrainDepthP, { uViewProj: m, uEye: [0, 0, 0], uSeaSurface: this.seaSurface });
      this.setGrids(this.terrainDepthP);
      const ring = Math.max(0, Math.ceil(Math.log2((r * 2.2) / 320)));
      this.drawRings(this.terrainDepthP, f.focus, ring, ring, ring);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.colorMask(true, true, true, true);
    gl.bindVertexArray(null);
  }

  /** A frame of the scene. The globe, if it shows through, has already been drawn. */
  /** Draw the next frame in full, as if the view had changed: for measuring what a frame costs. */
  restart(): void {
    this.viewKey = '';
  }

  /**
   * The still (step 8): asked for, the renderer keeps working on a view as long as it holds still, averaging more frames
   * at twice the size and casting the shadows from all over the sun's disc, until the view is the best it can draw.
   */
  still = false;
  /** how many times larger than the frame the scene is drawn: 2 while a still is made */
  private scale = 1;
  /** when the view last changed, in ms of the page's clock */
  private changedAt = performance.now();

  /** Whether the view holds still and its frames are still being averaged, or tree impostors are still baking. */
  get refining(): boolean {
    return !this.fast && ((this.leavesReady && this.impostors.hasPending) || this.steady < STEADY_FRAMES || (this.still && (this.scale < STILL_SCALE || this.steady < STILL_FRAMES)));
  }

  /** How long, in ms, the view has held still. */
  get steadyMs(): number {
    return performance.now() - this.changedAt;
  }

  /** Whether the frame shown is a finished still. */
  get stillDone(): boolean {
    return this.still && this.scale === STILL_SCALE && this.steady >= STILL_FRAMES;
  }

  render(frame: CityFrame, cells: CellGPU[], outW: number, outH: number): void {
    const gl = this.gl;
    this.scale = this.still && !this.fast ? STILL_SCALE : 1;
    this.resize(outW * this.scale, outH * this.scale);
    this.outW = outW;
    this.outH = outH;
    this.lastFrame = frame;
    this.lastDraw = cells;

    // Bake up to 4 queued canopy tree impostors per frame once the leaf atlas has arrived.
    if (!this.fast && this.leavesReady && this.impostors.hasPending) {
      gl.activeTexture(gl.TEXTURE0 + UNIT.noise);
      gl.bindTexture(gl.TEXTURE_3D, this.noise);
      gl.activeTexture(gl.TEXTURE0 + UNIT.leaves);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.leaves);
      if (this.impostors.bakePending(4, this.wild, this.tones) > 0) this.meshSerial++;
    }

    // Whether the view is the last one again: then its frames are averaged, each jittered by its own fraction of a pixel,
    // and once enough are, the picture is done and only shown again.
    const key = [frame.eye, frame.view, frame.proj, frame.sun, frame.time, frame.evidence, frame.alpha, frame.solid, frame.clock ?? 0, this.meshSerial, this.entitySerial, this.flagSerial, this.waterSerial, outW, outH].map(String).join('|');
    const still = key === this.viewKey;
    this.steady = still ? this.steady + 1 : 0;
    if (!still) this.changedAt = performance.now();
    this.viewKey = key;
    this.frames++;
    const enough = this.still ? STILL_FRAMES : STEADY_FRAMES;
    if (!this.fast && still && this.steady > enough && !(this.leavesReady && this.impostors.hasPending)) {
      this.finish(frame, this.historyTex[this.historyAt]);
      return;
    }
    let f = frame;
    let shadowSun = frame.sun;
    if (!this.fast) {
      const k = still ? this.steady : (this.frames % STEADY_FRAMES) + 1;
      this.sample = k;
      const jx = ((halton(k, 2) - 0.5) * 2) / this.w;
      const jy = ((halton(k, 3) - 0.5) * 2) / this.h;
      f = { ...frame, proj: jittered(frame.proj, jx, jy), farProj: jittered(frame.farProj, jx, jy) };
      // A still's shadows are cast from all over the sun's disc, a point of it each frame.
      if (this.still && still) {
        const s = frame.sun;
        const a = nrm(crs(LOOKAT_UP, s));
        const b = crs(s, a);
        const u = (halton(k, 5) - 0.5) * 2 * STILL_SUN;
        const v = (halton(k, 7) - 0.5) * 2 * STILL_SUN;
        shadowSun = nrm([s[0] + a[0] * u + b[0] * v, s[1] + a[1] * u + b[1] * v, s[2] + a[2] * u + b[2] * v]);
      }
    }
    const time = this.timer;
    time.pass('sky table');
    this.updateSky(f.sun, f.eye[2]);

    const vp = multiply(f.proj, f.view);
    const farVp = multiply(f.farProj, f.view);
    const camRight: V3 = [f.view[0], f.view[4], f.view[8]];
    const camUp: V3 = [f.view[1], f.view[5], f.view[9]];
    const { finest, split, last } = this.ringsFor(f);
    const eyeSea = aboveSea(f.eye);
    const under = this.sea && eyeSea < 0;
    const nearEffects = !this.fast && f.clearance < DISTANT_GROUND;
    // The light on the sea, as the shaders' water has it.
    const s = Math.max(f.sun[2], 0) * 0.8;
    this.exposure = this.sea ? underExposure(eyeSea, [this.sunColor[0] * s + this.skyTop[0] * 0.6, this.sunColor[1] * s + this.skyTop[1] * 0.6, this.sunColor[2] * s + this.skyTop[2] * 0.6]) : 1;

    // The bindings every lit program reads.
    gl.activeTexture(gl.TEXTURE0 + UNIT.noise);
    gl.bindTexture(gl.TEXTURE_3D, this.noise);
    gl.activeTexture(gl.TEXTURE0 + UNIT.sky);
    gl.bindTexture(gl.TEXTURE_2D, this.lut);
    gl.activeTexture(gl.TEXTURE0 + UNIT.shadow);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.shadow);
    gl.activeTexture(gl.TEXTURE0 + UNIT.entities);
    gl.bindTexture(gl.TEXTURE_2D, this.entityTex);
    gl.activeTexture(gl.TEXTURE0 + UNIT.mask);
    gl.bindTexture(gl.TEXTURE_2D, this.mask);
    gl.activeTexture(gl.TEXTURE0 + UNIT.fields);
    gl.bindTexture(gl.TEXTURE_2D, this.fields);
    gl.activeTexture(gl.TEXTURE0 + UNIT.farFields);
    gl.bindTexture(gl.TEXTURE_2D, this.farFields);
    gl.activeTexture(gl.TEXTURE0 + UNIT.leaves);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.leaves);
    this.bindLitter();
    gl.activeTexture(gl.TEXTURE0 + UNIT.matColour);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.materials.colour ?? this.noMaterial[0]);
    gl.activeTexture(gl.TEXTURE0 + UNIT.matNormal);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.materials.normal ?? this.noMaterial[1]);
    this.groundTex.forEach((t, k) => {
      gl.activeTexture(gl.TEXTURE0 + UNIT.ground + k);
      gl.bindTexture(gl.TEXTURE_2D, t);
    });
    time.pass('water map');
    if (nearEffects) this.updateWaterMap(f);
    gl.activeTexture(gl.TEXTURE0 + UNIT.waterMap);
    gl.bindTexture(gl.TEXTURE_2D, this.waterMapTex[0] ?? null);
    this.normalTex.forEach((t, k) => {
      gl.activeTexture(gl.TEXTURE0 + UNIT.normal + k);
      gl.bindTexture(gl.TEXTURE_2D, t);
    });
    time.pass('shadows');
    this.updateShadows(shadowSun === f.sun ? f : { ...f, sun: shadowSun });

    // Opaque geometry first into 1x RGBA16F + DEPTH24_STENCIL8, marking covered pixels in stencil = 1
    // so half-res volumetric clouds and full-res sky skip every pixel hidden behind land, buildings, or trees.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFb);
    gl.viewport(0, 0, this.w, this.h);
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.stencilMask(0xff);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);

    // The distant land, in its own depth range (stencil = 1 marks far land pixels across the depth clear).
    time.pass('far land');
    if (split <= last) {
      gl.activeTexture(gl.TEXTURE0 + UNIT.ao);
      gl.bindTexture(gl.TEXTURE_2D, this.aoTex[1] ?? null);
      this.useLit(this.terrainP, f, farVp);
      setUniforms(gl, this.terrainP, { uUseAO: 0, uMaskBox: [this.maskBox[0], this.maskBox[1], this.maskBox[2] - this.maskBox[0], this.maskBox[3] - this.maskBox[1]], uWater: this.waterLevel });
      this.setGrids(this.terrainP);
      this.drawRings(this.terrainP, f.eye, Math.max(split, finest), last, -1);
      // Over it, the sea's surface beyond the near pass's reach: the ring both passes draw is the far one's only past it.
      if (this.sea) this.drawSea(f, farVp, Math.max(split, finest), last, -1, (k) => (k === split ? f.far : -1e9));
    }
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // The near scene's depth, written directly to depthTex for GTAO (zero depth resolve blit).
    if (nearEffects) {
      time.pass('depth');
      gl.colorMask(false, false, false, false);
      gl.stencilMask(0x00);
      gl.useProgram(this.terrainDepthP.program);
      setUniforms(gl, this.terrainDepthP, { uViewProj: vp, uEye: f.eye, uSeaSurface: this.seaSurface });
      this.setGrids(this.terrainDepthP);
      this.drawRings(this.terrainDepthP, f.eye, finest, Math.min(split, last), finest);
      gl.useProgram(this.depthP.program);
      setUniforms(gl, this.depthP, { uViewProj: vp, uEye: f.eye, uTime: f.time, uCards: 0, uClock: f.clock ?? 0, uWind: WIND, uShadowPad: -1, uShadowInvR: 0 });
      // Both sides, as the lit pass draws them.
      gl.disable(gl.CULL_FACE);
      for (const c of cells) {
        gl.bindVertexArray(c.vao);
        gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_INT, 0);
      }
      this.drawInstanced(this.depthP, false);
      gl.bindVertexArray(null);
      gl.colorMask(true, true, true, true);
      gl.stencilMask(0xff);
      time.pass('occlusion');
      this.occlusion(f);
    }

    // The near scene, lit, marking every surviving opaque/foliage/impostor pixel with stencil = 1.
    time.pass('terrain');
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFb);
    gl.viewport(0, 0, this.w, this.h);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(nearEffects ? gl.LEQUAL : gl.LESS);
    gl.depthMask(!nearEffects);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.enable(gl.CULL_FACE);
    gl.activeTexture(gl.TEXTURE0 + UNIT.ao);
    gl.bindTexture(gl.TEXTURE_2D, this.aoTex[1]);
    this.useLit(this.terrainP, f, vp);
    setUniforms(gl, this.terrainP, { uUseAO: nearEffects ? 1 : 0, uMaskBox: [this.maskBox[0], this.maskBox[1], this.maskBox[2] - this.maskBox[0], this.maskBox[3] - this.maskBox[1]], uWater: this.waterLevel });
    this.setGrids(this.terrainP);
    this.drawRings(this.terrainP, f.eye, finest, Math.min(split, last), finest);

    time.pass('meshes');
    gl.disable(gl.CULL_FACE);
    this.useLit(this.meshP, f, vp);
    // At full quality, leaf cards use temporally stratified hashed alpha smoothed by TAA (no 4x MSAA).
    setUniforms(gl, this.meshP, { uCoverage: this.fast ? 0 : 1, uUseAO: nearEffects ? 1 : 0 });
    gl.depthMask(true);
    for (const c of cells) {
      gl.bindVertexArray(c.vao);
      gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_INT, 0);
    }
    this.drawInstanced(this.meshP, false);
    gl.depthFunc(gl.LESS);
    this.drawImpostors(this.impostorP, f, vp, camRight, camUp, [0, 0, 0]);
    gl.disable(gl.STENCIL_TEST);

    // Half-resolution volumetric clouds, skipping every 2x2 block occluded by opaque terrain/meshes.
    const invFarVp = invert(farVp);
    const frameNoise = halton(Math.max(0, this.sample - 1), 2);
    const drawVolClouds = !this.fast && !under && this.cloudCover > 0 && f.eye[2] < 1400 && this.cloudFb.length === 2;
    if (drawVolClouds) {
      time.pass('clouds');
      const from = this.cloudAt;
      const to = 1 - from;
      let cloudReproj: Mat4 = new Float32Array(16);
      let cloudBlend = 1;
      if (!still && this.cloudValid && this.lastFarVp) {
        const d: V3 = [frame.eye[0] - this.lastCloudEye[0], frame.eye[1] - this.lastCloudEye[1], frame.eye[2] - this.lastCloudEye[2]];
        const move = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, d[0], d[1], d[2], 1]);
        cloudReproj = multiply(this.lastFarVp, move);
        cloudBlend = 0.25;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.cloudFb[to]);
      gl.viewport(0, 0, this.cloudW, this.cloudH);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.useProgram(this.cloudsP.program);
      setUniforms(gl, this.cloudsP, {
        uInvViewProj: invFarVp,
        uCloudReproject: cloudReproj,
        uSun: f.sun,
        uSunColor: this.sunColor,
        uSkyTop: this.skyTop,
        uSceneSize: [this.w, this.h],
        uCloudSize: [this.cloudW, this.cloudH],
        uHeight: f.eye[2],
        uCloudCover: this.cloudCover,
        uClockSky: f.clock ?? 0,
        uCloudVolume: 1,
        uFrameNoise: frameNoise,
        uCloudBlend: cloudBlend,
      });
      gl.activeTexture(gl.TEXTURE12);
      gl.bindTexture(gl.TEXTURE_2D, this.colorTex);
      gl.activeTexture(gl.TEXTURE13);
      gl.bindTexture(gl.TEXTURE_2D, this.cloudTex[from]);
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE12);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE13);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.cloudAt = to;
      this.cloudValid = true;
    } else {
      this.cloudValid = false;
    }

    // Stencil-masked sky + silhouette-safe cloud upsample: runs only where stencil == 0 (unobstructed sky).
    time.pass('sky');
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFb);
    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0x00);
    gl.stencilFunc(gl.EQUAL, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.useProgram(this.skyP.program);
    setUniforms(gl, this.skyP, {
      uInvViewProj: invFarVp,
      uSun: f.sun,
      uSunColor: this.sunColor,
      uHeight: f.eye[2],
      uAlpha: f.solid || under ? 1 : 0,
      uSea: this.sea ? 1 : 0,
      uEyeSea: eyeSea,
      uSkyTop: this.skyTop,
      uCloudCover: this.cloudCover,
      uClockSky: f.clock ?? 0,
      uCloudVolume: this.fast ? 0 : 1,
      uCloudSize: [this.cloudW, this.cloudH],
      uFrameNoise: frameNoise,
    });
    gl.activeTexture(gl.TEXTURE13);
    gl.bindTexture(gl.TEXTURE_2D, drawVolClouds ? this.cloudTex[this.cloudAt] : this.mask);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE13);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.disable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    this.lastFarVp = multiply(frame.farProj, frame.view);
    this.lastCloudEye = [frame.eye[0], frame.eye[1], frame.eye[2]];

    if (this.waterVao && this.waterCount) {
      time.pass('water');
      // On the fuller way, copy the 1x opaque+sky frame once so water can refract the bed and reflect banks & sky.
      const screen = nearEffects;
      if (screen) {
        this.ensureWaterCopy();
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.sceneFb);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.waterCopyFb);
        gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFb);
        gl.activeTexture(gl.TEXTURE0 + UNIT.scene);
        gl.bindTexture(gl.TEXTURE_2D, this.waterSceneTex);
        gl.activeTexture(gl.TEXTURE0 + UNIT.sceneDepth);
        gl.bindTexture(gl.TEXTURE_2D, this.waterDepthTex);
      }
      this.useLit(this.waterP, f, vp);
      setUniforms(gl, this.waterP, { uWaterTone: this.waterTone ?? [0, 0, 0, 0, 0, 0], uToned: this.waterTone ? 1 : 0, uWaterBias: this.waterBias, uScreen: screen ? 1 : 0, uNearFar: [f.near, f.far], uViewport: [this.w, this.h] });
      gl.bindVertexArray(this.waterVao);
      gl.drawElements(gl.TRIANGLES, this.waterCount, gl.UNSIGNED_INT, 0);
      if (screen) {
        gl.activeTexture(gl.TEXTURE0 + UNIT.scene);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0 + UNIT.sceneDepth);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
    }
    gl.bindVertexArray(null);
    // The sea's surface, over all of it.
    if (this.sea) {
      time.pass('sea');
      this.drawSea(f, vp, finest, Math.min(split, last), finest, () => -1e9);
    }

    // Hearth & kiln smoke plumes: soft alpha-blended billboards rising downwind over settlements.
    if (!this.fast && this.smokeVao && this.smokeCount > 0 && f.clearance < 1600) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(this.smokeP.program);
      setUniforms(gl, this.smokeP, {
        uViewProj: vp,
        uEye: f.eye,
        uCamRight: camRight,
        uCamUp: camUp,
        uWind: WIND,
        uClock: f.clock ?? 0,
        uSun: f.sun,
        uSunColor: this.sunColor,
        uSkyTop: this.skyTop,
        uSkyLow: this.skyLow,
        uHazeK: 2.0e-5,
      });
      gl.bindVertexArray(this.smokeVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 48, this.smokeCount);
      gl.bindVertexArray(null);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // Scene is already in single-sample colorTex/depthTex (zero post-water resolve blit).
    let shown = this.colorTex;
    if (!this.fast) {
      time.pass('light in the air');
      if (nearEffects) this.shafts(f, vp);
      time.pass('antialiasing');
      shown = this.antialias(frame, still);
    }
    this.finish(frame, shown);
    time.endFrame();
  }

  /**
   * The light in the air (step 4): marched at a quarter of the frame's size, out to four distances along each pixel's way,
   * then added to the frame, resolved, each of its pixels taking it as far as its own depth.
   */
  private shafts(f: CityFrame, vp: Mat4): void {
    if (!this.shaftsFb || f.sun[2] <= -0.02 || this.sea) return;
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.emptyVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shaftsFb);
    gl.viewport(0, 0, Math.max(1, this.w >> 2), Math.max(1, this.h >> 2));
    const inv = invert(vp);
    this.useLit(this.shaftsP, f, vp);
    setUniforms(gl, this.shaftsP, { uInvViewProj: inv, uThins: 80, uFloor: f.focus[2], uStart: this.sample * 7.13 });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // Added to the frame, resolved, each pixel taking the air out to its own depth.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorFb);
    gl.viewport(0, 0, this.w, this.h);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.shaftsAddP.program);
    setUniforms(gl, this.shaftsAddP, { uInvViewProj: inv, uSun: f.sun, uSunColor: this.sunColor, uDensity: 0.00035 });
    gl.activeTexture(gl.TEXTURE0 + UNIT.sceneDepth);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
    gl.activeTexture(gl.TEXTURE13);
    gl.bindTexture(gl.TEXTURE_2D, this.shaftsTex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0 + UNIT.sceneDepth);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
  }

  /**
   * Fold the frame just drawn into what was kept (step 4): while the view holds still, as an even average of its frames;
   * while it moves, carried to where it now is and held to the frame's neighbourhood; afresh after anything else changes.
   */
  private antialias(f: CityFrame, still: boolean): WebGLTexture {
    const gl = this.gl;
    const vp = multiply(f.proj, f.view);
    const from = this.historyAt;
    const to = 1 - from;
    let blend = 1;
    let moving = 0;
    let reproject: Mat4 = new Float32Array(16);
    if (still) blend = 1 / this.steady;
    else if (this.lastVp) {
      // From this frame's clip space to the world about this eye, on to the last eye, and into the last frame's clip space.
      const d: V3 = [f.eye[0] - this.lastEye[0], f.eye[1] - this.lastEye[1], f.eye[2] - this.lastEye[2]];
      const move = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, d[0], d[1], d[2], 1]);
      reproject = multiply(this.lastVp, multiply(move, invert(vp)));
      blend = 0.15;
      moving = 1;
    }
    this.lastVp = vp;
    this.lastEye = [f.eye[0], f.eye[1], f.eye[2]];
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.emptyVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.historyFb[to]);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.taaP.program);
    gl.activeTexture(gl.TEXTURE13);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTex);
    gl.activeTexture(gl.TEXTURE14);
    gl.bindTexture(gl.TEXTURE_2D, this.historyTex[from]);
    gl.activeTexture(gl.TEXTURE12);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
    setUniforms(gl, this.taaP, { uReproject: reproject, uBlend: blend, uMoving: moving, uTexel: [1 / this.w, 1 / this.h] });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE14);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE12);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
    this.historyAt = to;
    return this.historyTex[to];
  }

  /**
   * The sea's surface, in a scene of the sea: the terrain's rings at its level, blended over what is drawn and hiding
   * nothing. `from` says, for each ring, how far along the view it starts.
   */
  private drawSea(f: CityFrame, vp: Mat4, first: number, to: number, finest: number, from: (k: number) => number): void {
    const gl = this.gl;
    this.useLit(this.seaP, f, vp);
    this.setGrids(this.seaP);
    setUniforms(gl, this.seaP, { uForward: [-f.view[2], -f.view[6], -f.view[10]] });
    const at = this.seaP.uniforms.get('uFrom');
    const culled = gl.isEnabled(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    // Its colour is premultiplied; accumulate alpha via standard Porter-Duff over so far sea / Snell's window marks coverage cleanly.
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    // Seen from above and from below.
    gl.disable(gl.CULL_FACE);
    // A ring's hole is exactly the finer ring's square, as what is blended must not be drawn twice.
    this.drawRings(this.seaP, f.eye, first, to, finest, (k) => gl.uniform1f(at!, from(k)), 64);
    if (culled) gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
  }

  private occlusion(f: CityFrame): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    const aw = Math.max(1, this.w >> 1);
    const ah = Math.max(1, this.h >> 1);
    const kY = Math.tan(f.fov / 2);
    gl.activeTexture(gl.TEXTURE12);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
    gl.activeTexture(gl.TEXTURE0 + UNIT.ao);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(this.emptyVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.aoFb[0]);
    gl.viewport(0, 0, aw, ah);
    gl.useProgram(this.aoP.program);
    setUniforms(gl, this.aoP, { uProjK: [kY * f.aspect, kY], uNearFar: [f.near, f.far], uTexel: [1 / aw, 1 / ah] });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(this.blurP.program);
    setUniforms(gl, this.blurP, { uNearFar: [f.near, f.far] });
    // Blur across, into the second, then back along into the first; the last read is the second.
    gl.activeTexture(gl.TEXTURE13);
    gl.bindTexture(gl.TEXTURE_2D, this.aoTex[0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.aoFb[1]);
    setUniforms(gl, this.blurP, { uDir: [1 / aw, 0] });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, this.aoTex[1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.aoFb[0]);
    setUniforms(gl, this.blurP, { uDir: [0, 1 / ah] });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, this.aoTex[0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.aoFb[1]);
    setUniforms(gl, this.blurP, { uDir: [0.7 / aw, 0.7 / ah] });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE12);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  private finish(f: CityFrame, scene: WebGLTexture): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.bindVertexArray(this.emptyVao);
    gl.activeTexture(gl.TEXTURE13);
    // The frame's light, metered (step 4); the fast way keeps the light's own exposure.
    const metered = !this.fast && !!this.lumFb;
    if (metered) {
      this.timer.pass('meter');
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.lumFb);
      gl.viewport(0, 0, 64, 64);
      gl.useProgram(this.lumP.program);
      gl.bindTexture(gl.TEXTURE_2D, scene);
      setUniforms(gl, this.lumP, { uCell: [1 / 64, 1 / 64] });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE12);
      gl.bindTexture(gl.TEXTURE_2D, this.lumTex);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.activeTexture(gl.TEXTURE13);
    }
    gl.useProgram(this.brightP.program);
    let src = scene;
    let sw = this.w;
    let sh = this.h;
    this.timer.pass('bloom');
    // The fast way's bloom textures stay cleared.
    if (!this.fast) this.bloomTex.forEach((t, k) => {
      const tw = Math.max(1, this.w >> (k + 1));
      const th = Math.max(1, this.h >> (k + 1));
      gl.bindTexture(gl.TEXTURE_2D, src);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFb[k]);
      gl.viewport(0, 0, tw, th);
      setUniforms(gl, this.brightP, { uTexel: [0.5 / sw, 0.5 / sh], uThreshold: k === 0 ? 1.1 : 0 });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = t;
      sw = tw;
      sh = th;
    });
    this.timer.pass('post');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // At the frame's own size: a still drawn at twice it is averaged down, four texels to a pixel, by the filtering.
    gl.viewport(0, 0, this.outW || this.w, this.outH || this.h);
    gl.useProgram(this.postP.program);
    gl.activeTexture(gl.TEXTURE13);
    gl.bindTexture(gl.TEXTURE_2D, scene);
    gl.activeTexture(gl.TEXTURE12);
    gl.bindTexture(gl.TEXTURE_2D, metered ? this.lumTex : null);
    gl.activeTexture(gl.TEXTURE14);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[0]);
    gl.activeTexture(gl.TEXTURE15);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[1]);
    gl.activeTexture(gl.TEXTURE16);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[2]);
    // Exposed for the light on open ground (EXPOSURE); under the sea, opened up as the daylight falls.
    const exposure = EXPOSURE.at * Math.pow(Math.max(this.daylight / EXPOSURE.knee, 1), -EXPOSURE.above) * this.exposure;
    setUniforms(gl, this.postP, {
      uExposure: exposure,
      uAlpha: f.alpha,
      uSolid: f.solid ? 1 : 0,
      uMeter: metered ? 1 : 0,
      uMeterWay: [EXPOSURE.key, EXPOSURE.lift, EXPOSURE.most],
    });
    if (f.alpha < 1 || !f.solid) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE12);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.frontFace(gl.CCW);
  }

  /** What entity is at a pixel of the last frame, if any. CSS pixels are for the caller to scale. */
  pick(atX: number, atY: number): number {
    const gl = this.gl;
    const f = this.lastFrame;
    if (!f) return 0;
    // A still is drawn larger than the frame.
    const x = Math.floor(atX * this.scale);
    const y = Math.floor(atY * this.scale);
    if (!this.pickFb) {
      this.pickFb = gl.createFramebuffer()!;
      this.pickTex = gl.createTexture()!;
      this.pickDepth = gl.createRenderbuffer()!;
    }
    gl.activeTexture(gl.TEXTURE12);
    gl.bindTexture(gl.TEXTURE_2D, this.pickTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.w, this.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.pickDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.w, this.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pickTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.pickDepth);
    gl.viewport(0, 0, this.w, this.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x, y, 1, 1);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.activeTexture(gl.TEXTURE0 + UNIT.entities);
    gl.bindTexture(gl.TEXTURE_2D, this.entityTex);
    gl.activeTexture(gl.TEXTURE0 + UNIT.leaves);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.leaves);
    const vp = multiply(f.proj, f.view);
    const camRight: V3 = [f.view[0], f.view[4], f.view[8]];
    const camUp: V3 = [f.view[1], f.view[5], f.view[9]];
    // The ground first, so it hides what lies behind a hill.
    gl.colorMask(false, false, false, false);
    gl.useProgram(this.terrainDepthP.program);
    setUniforms(gl, this.terrainDepthP, { uViewProj: vp, uEye: f.eye, uSeaSurface: this.seaSurface });
    this.setGrids(this.terrainDepthP);
    const { finest, split, last } = this.ringsFor(f);
    this.drawRings(this.terrainDepthP, f.eye, finest, Math.min(split, last), finest);
    gl.colorMask(true, true, true, true);
    gl.useProgram(this.idP.program);
    setUniforms(gl, this.idP, { uViewProj: vp, uEye: f.eye, uTime: f.time, uClock: f.clock ?? 0, uWind: WIND, uShadowPad: -1, uShadowInvR: 0 });
    for (const c of this.lastDraw) {
      gl.bindVertexArray(c.vao);
      gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_INT, 0);
    }
    this.drawInstanced(this.idP, false);
    this.drawImpostors(this.impostorIdP, f, vp, camRight, camUp, [0, 0, 0]);
    gl.bindVertexArray(null);
    const px = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE12);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    return px[0] + px[1] * 256;
  }
}
