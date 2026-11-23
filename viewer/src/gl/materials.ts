// The scanned materials of the ground (core/materials.ts; docs/plans/RENDERING.md, "Procedural first"), on the GPU:
// two arrays of textures with a layer for each material. One holds its colour and, in alpha, its height; the other its
// normal's two parts, its roughness, and how much of the sky a point of it sees, which is worked out here from its
// height. They are fetched once, when the first scene is drawn at full quality, and are the same for every place and
// time: a scan gives a material its grain, and the place gives it its tone (cityShaders.ts, GROUND_MATERIALS).
import { GROUND_FORMAT, GROUND_LAYERS, type GroundMaterials } from '../../../core/materials.ts';
import { program, type GL, type Program } from './context.ts';
import { FULLSCREEN_VS } from './cityShaders.ts';

/** Takes a layer's two images apart into the two arrays' layers. */
const UNPACK_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uColour;
uniform sampler2D uData;
uniform float uSize;
layout(location = 0) out vec4 oColour;
layout(location = 1) out vec4 oNormal;
// A quarter of the data image: 0 the normal's part across, 1 its part down the image, 2 the height, 3 the roughness.
float part(int k, vec2 uv) {
  vec2 q = (floor(fract(uv) * uSize) + 0.5) / uSize;
  return texture(uData, (q + vec2(float(k & 1), float(k >> 1))) * 0.5).r;
}
void main() {
  float h = part(2, vUv);
  // How much of the sky a point sees, from how far it lies below the ground round it: two rings of its neighbours.
  float sum = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    vec2 d = vec2(cos(a), sin(a)) / uSize;
    sum += part(2, vUv + d * 3.0) + part(2, vUv + d * 9.0);
  }
  float sky = clamp(1.0 - 2.4 * max(sum / 16.0 - h, 0.0), 0.3, 1.0);
  oColour = vec4(texture(uColour, vUv).rgb, h);
  oNormal = vec4(part(0, vUv), part(1, vUv), part(3, vUv), sky);
}`;

export class GroundMaterialSet {
  /** colour and height; normal, roughness and sky: null until all of it is loaded */
  colour: WebGLTexture | null = null;
  normal: WebGLTexture | null = null;
  /** for each layer, its mean colour and the metres a repeat covers; then how much of its hue it keeps, its mean roughness and height */
  readonly mean = new Float32Array(GROUND_LAYERS.length * 4);
  readonly look = new Float32Array(GROUND_LAYERS.length * 4);
  ready = false;
  /** why it could not be loaded, if it could not: the ground is then drawn as it is without them */
  failed: string | null = null;
  private started = false;

  constructor(private gl: GL) {}

  /** Whether a scene still waits for them: asked for and neither loaded nor failed. */
  get loading(): boolean {
    return this.started && !this.ready && !this.failed;
  }

  /** Fetch them, once. `root` is where the viewer is served from, ending in a slash. */
  load(root: string, onReady: () => void): void {
    if (this.started) return;
    this.started = true;
    this.fetch(root).then(onReady, (e) => {
      this.failed = e instanceof Error ? e.message : String(e);
      console.warn(`The ground's materials could not be loaded, and it is drawn without them: ${this.failed}`);
      onReady();
    });
  }

  private async fetch(root: string): Promise<void> {
    const gl = this.gl;
    const base = new URL('materials/', root).href;
    const res = await fetch(`${base}ground.json`);
    if (!res.ok) throw new Error(`ground.json: HTTP ${res.status}`);
    const file = (await res.json()) as GroundMaterials;
    if (file.format !== GROUND_FORMAT) throw new Error(`ground.json is ${file.format}, not ${GROUND_FORMAT}`);
    // The layers by the names the shaders know them by, whatever order the file has them in.
    const layers = GROUND_LAYERS.map((key) => {
      const l = file.layers.find((x) => x.key === key);
      if (!l) throw new Error(`ground.json has no layer "${key}"`);
      return l;
    });
    const image = async (path: string): Promise<ImageBitmap> => {
      const r = await fetch(base + path);
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    };
    const images = await Promise.all(layers.map(async (l) => ({ colour: await image(l.colour), data: await image(l.data) })));
    const size = file.size;
    const n = layers.length;
    const levels = Math.floor(Math.log2(size)) + 1;
    const array = (internal: number): WebGLTexture => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, internal, size, size, n);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return t;
    };
    // Whatever the renderer has bound is put back when this is done: it runs between two frames.
    const unit = gl.TEXTURE0 + 14;
    gl.activeTexture(unit);
    const colour = array(gl.SRGB8_ALPHA8);
    const normal = array(gl.RGBA8);
    const unpack: Program = program(gl, 'ground materials', FULLSCREEN_VS, UNPACK_FS);
    const fb = gl.createFramebuffer()!;
    const vao = gl.createVertexArray()!;
    const source = (bitmap: ImageBitmap, internal: number, at: number): WebGLTexture => {
      gl.activeTexture(gl.TEXTURE0 + at);
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, size, size);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.colorMask(true, true, true, true);
    gl.useProgram(unpack.program);
    gl.uniform1i(unpack.uniforms.get('uColour')!, 12);
    gl.uniform1i(unpack.uniforms.get('uData')!, 13);
    gl.uniform1f(unpack.uniforms.get('uSize')!, size);
    gl.bindVertexArray(vao);
    images.forEach((im, k) => {
      const c = source(im.colour, gl.SRGB8_ALPHA8, 12);
      const d = source(im.data, gl.RGBA8, 13);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, colour, 0, k);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, normal, 0, k);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.deleteTexture(c);
      gl.deleteTexture(d);
      im.colour.close();
      im.data.close();
      const l = layers[k];
      this.mean.set([l.mean[0], l.mean[1], l.mean[2], l.metres], k * 4);
      this.look.set([l.chroma, l.rough, l.lift, 1], k * 4);
    });
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(unpack.program);
    gl.depthMask(true);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    gl.activeTexture(unit);
    for (const [t, most] of [[colour, 8], [normal, 4]] as const) {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(most, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number));
    }
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    gl.activeTexture(gl.TEXTURE0);
    this.colour = colour;
    this.normal = normal;
    this.ready = true;
  }
}
