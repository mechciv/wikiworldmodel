// The city's shaders. Nothing here is a fact about Rome: materials are procedural, seen through a
// physically based sky, so that the same light falls on everything the records raise.

/** Structures rise over the years up to their start, and fall over the years after their end. */
export const RISE_YEARS = 7;

/** The curvature of the Earth, relative to the local grid's origin; applied to everything drawn. */
const DROP = /* glsl */ `
const float PLANET_RADIUS = 6371000.0;
float drop(vec2 p) { return dot(p, p) / (2.0 * PLANET_RADIUS); }
`;

/**
 * How the water of a scene of the sea is drawn: a look, as the haze's constant is, and not a measurement of any sea.
 * Light of each colour, red, green and blue, is lost along a path through the water as e^(−k·metres), red first and blue
 * last, and what the water scatters fills in its place; daylight falls with depth the same way, but never below a floor
 * that itself fades only slowly with depth, so that the floor of a deep sea can still be seen, and an abyss is darker than
 * a shelf; the water's own colour is a share of the light at its surface; and a camera under water opens up as the light
 * there falls short of a day's at the surface, `day`, by at most `open` times.
 */
export const SEA = {
  /** per metre of the way through water */
  extinction: [0.2, 0.04, 0.03],
  /** per metre of depth, of the daylight that reaches down */
  light: [0.2, 0.045, 0.032],
  /** the least daylight below, as a share of the surface's; and the depth, in metres, over which even that fades by e */
  floor: [0.012, 0.045, 0.08],
  deep: 2500,
  /** the share of the light at the surface that the water sends back as its own colour */
  body: [0.016, 0.13, 0.3],
  /**
   * seen from above, the light a shelf's water sends back, as a share of the light on it; the most of what is seen through
   * the surface it takes; and the depths over which it comes, where the floor itself starts to show less, and goes
   */
  shelf: [0.05, 0.17, 0.16],
  shelfShare: 0.35,
  shallow: [10, 250],
  day: 2.5,
  open: 24,
} as const;

const vec3 = (v: readonly number[]) => `vec3(${v.map((x) => x.toFixed(4)).join(', ')})`;

/** The light in the sea, where a scene is of the sea: what reaches a depth, and the water's own colour there. */
const SEA_LIGHT = /* glsl */ `
uniform float uSea;
const vec3 WATER_K = ${vec3(SEA.extinction)};
const vec3 WATER_LIGHT = ${vec3(SEA.light)};
const vec3 WATER_FLOOR = ${vec3(SEA.floor)};
const vec3 WATER_BODY = ${vec3(SEA.body)};
// The share of the daylight at the sea's surface that reaches a height below it, in metres.
vec3 seaLight(float z) { return max(exp(WATER_LIGHT * min(z, 0.0)), WATER_FLOOR * exp(min(z, 0.0) / ${SEA.deep.toFixed(1)})); }
// The water's own light, seen along a direction from a height: what it scatters of the daylight come down to there,
// brightest looking up and darkest looking down.
vec3 waterGlow(vec3 dir, float z) {
  vec3 lit = uSunColor * max(uSun.z, 0.0) * 0.8 + uSkyTop * 0.6;
  return WATER_BODY * lit * seaLight(z) * (0.12 + 0.88 * smoothstep(-0.8, 1.0, dir.z));
}
`;

/** Rising and falling: a vertex's entity says when it stood, and evidence what it rests on. */
const ENTITY = /* glsl */ `
uniform highp sampler2D uEntities;
uniform float uTime;
const float RISE_YEARS = ${RISE_YEARS.toFixed(1)};
// x start, y end, z flags (basis + 8·selected + 16·hovered), w the ground under it
invariant gl_Position;
vec4 entityOf(int id) { return texelFetch(uEntities, ivec2(id & 255, id >> 8), 0); }
// 0: not standing; 1: as built. Between: going up, or falling down.
float standing(vec4 e) {
  if (uTime < e.x - RISE_YEARS || uTime > e.y + RISE_YEARS) return 0.0;
  return min(smoothstep(e.x - RISE_YEARS, e.x, uTime), 1.0 - smoothstep(e.y, e.y + RISE_YEARS, uTime));
}
`;

/**
 * Leaves held on cards (docs/plans/RENDERING.md, step 1): a card's outline is cut here from its uv, as its material says:
 * needles, the leaflets of a frond, broad leaves, or a frond held as a fan. The same cut is made in every pass, so that
 * what casts a shadow and what a click finds are the leaves that are seen. How a leaf looks is the renderer's; whether a
 * plant has needles, fronds or broad leaves is its form's.
 */
const LEAVES = /* glsl */ `
const int NEEDLE_CARD = 44, FROND_CARD = 45, BROAD_CARD = 46, FAN_CARD = 47, LEAF_MASS = 48, BLADE_CARD = 49;
bool onCard(int m) { return (m >= NEEDLE_CARD && m <= FAN_CARD) || m == BLADE_CARD; }
float leafHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
// A leaf's signed distance, <0 inside, and its shade, from distances along and across it in its own halves.
vec2 leafShape(float x, float y, float len, float wid, float shade) {
  float w = sqrt(max(0.0, 1.0 - x * x)) * (1.0 - 0.28 * x);
  float d = max((abs(y) - w) * wid * 0.5, (abs(x) - 1.0) * len * 0.5);
  // The midrib, a little paler.
  return vec2(d, shade + 0.12 * (1.0 - smoothstep(0.0, 0.14, abs(y))));
}
// Broad leaves along a twig, alternating, with one at its tip. p: across from the twig and along from the base, in
// shares of the card's length; wide: how far the card reaches either side of its twig, in the same.
vec2 broadLeaves(vec2 p, float wide, float seed) {
  float best = p.y > 0.0 && p.y < 0.86 ? abs(p.x) - 0.009 : 1.0;
  float shade = 0.6;
  float scale = min(1.0, wide * 2.6 + 0.2);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    bool tip = i == 6;
    float side = mod(fi, 2.0) < 0.5 ? -1.0 : 1.0;
    float r = leafHash(vec2(fi + 1.0, seed + 3.0));
    float t0 = tip ? 0.82 : 0.1 + fi * 0.125;
    float ang = tip ? (r - 0.5) * 0.3 : side * (0.62 + 0.4 * r);
    vec2 dir = vec2(sin(ang), cos(ang));
    float len = (tip ? 0.3 : 0.25 + 0.09 * r) * scale;
    float wid = len * 0.44;
    vec2 q = p - vec2(0.0, t0) - dir * len * 0.56;
    vec2 l = leafShape(dot(q, dir) / (len * 0.5), dot(q, vec2(dir.y, -dir.x)) / (wid * 0.5), len, wid, 0.72 + 0.5 * r);
    if (l.x < best) { best = l.x; shade = l.y; }
  }
  return vec2(best, shade);
}
// Needles in two ranks along a twig, flat, as on a spray of a swamp cypress or a fir; shorter towards its tip.
vec2 needles(vec2 p, float wide, float seed) {
  float best = p.y > 0.0 && p.y < 0.96 ? abs(p.x) - 0.007 : 1.0;
  float shade = 0.6;
  float side = p.x < 0.0 ? -1.0 : 1.0;
  const float SN = 0.8134, CS = 0.5817;
  float r = abs(p.x) / SN;
  float t0 = p.y - r * CS;
  float s = 0.026;
  float idx = floor(t0 / s + 0.5);
  float tt = idx * s;
  float h = leafHash(vec2(idx + side * 37.0, seed + 11.0));
  float len = min(wide * 0.95 / SN, 0.3) * (1.0 - 0.5 * tt * tt) * (0.8 + 0.35 * h);
  float d = max(abs(t0 - tt) * SN - 0.0088 * (1.0 - 0.45 * r / max(len, 1e-3)), r - len);
  if (tt > 0.015 && tt < 0.95 && d < best) { best = d; shade = 0.7 + 0.55 * h; }
  return vec2(best, shade);
}
// A frond: leaflets either side of its stalk, alternating, widest a third of the way out and gone at either end.
vec2 frondLeaves(vec2 p, float wide, float seed) {
  float best = p.y > 0.0 && p.y < 0.99 ? abs(p.x) - 0.006 : 1.0;
  float shade = 0.62;
  float side = p.x < 0.0 ? -1.0 : 1.0;
  const float SN = 0.9128, CS = 0.4085;
  float r = abs(p.x) / SN;
  float t0 = p.y - r * CS;
  float s = 0.05;
  float off = side > 0.0 ? 0.0 : 0.5;
  float idx = floor(t0 / s - off + 0.5);
  float tt = (idx + off) * s;
  float env = sqrt(max(0.0, 4.0 * tt * (1.0 - tt))) * (1.0 - 0.2 * tt) * (0.75 + 0.25 * smoothstep(0.0, 0.3, tt));
  float len = wide * 0.97 / SN * env;
  float x = r / max(len, 1e-4);
  float w = s * 0.4 * sqrt(max(0.0, 1.0 - x * x)) * (1.0 - 0.35 * x);
  float h = leafHash(vec2(idx + side * 53.0, seed + 5.0));
  float d = max(abs(t0 - tt) * SN - w * SN, (r - len) * 0.5);
  if (tt > 0.0 && tt < 0.99 && len > 0.003 && d < best) { best = d; shade = 0.72 + 0.4 * h + 0.1 * (1.0 - x); }
  return vec2(best, shade);
}
// A tuft's blades from its foot, fanning out and curving a little, each narrowing to its tip. p: across from −1 to 1, and
// up from 0 to 1.
vec2 blades(vec2 p, float seed) {
  float best = 1.0;
  float shade = 0.7;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float h = leafHash(vec2(fi + 2.0, seed + 19.0));
    float top = 0.55 + 0.45 * h;
    float f = p.y / top;
    if (f > 1.0 || f < 0.0) continue;
    float x0 = (fi / 8.0 - 0.5) * 0.5;
    float x1 = (fi / 8.0 - 0.5) * 1.6 + (h - 0.5) * 0.3;
    float x = mix(x0, x1, f * f * 0.8 + f * 0.2);
    float d = abs(p.x - x) - (0.075 * (1.0 - f) + 0.004);
    if (d < best) { best = d; shade = 0.72 + 0.4 * h + 0.2 * f; }
  }
  return vec2(best, shade);
}
// How much of a point of a card is leaf, 0 to 1, smoothed over a pixel; the leaf's shade there; and, on a card of blades,
// whose colour it takes: 1 a frond's, 2 a needle's, 3 a broad leaf's. From far enough off that its leaves are finer than
// a pixel or two, it is as much leaf as the pattern is on average, so nothing shimmers.
vec3 leafCover(int m, vec2 uv) {
  if (m == BLADE_CARD) {
    float k = floor(uv.y);
    vec2 p = vec2(uv.x, uv.y - k);
    vec2 l = blades(p, mod(k, 8.0));
    float aa = max(fwidth(p.x), 1e-4);
    float a = clamp(0.5 - l.x / aa, 0.0, 1.0);
    return vec3(mix(a, 0.4, smoothstep(0.08, 0.3, aa)), l.y, floor(k / 8.0 + 0.001));
  }
  if (m == FAN_CARD) {
    // A fan: u across it, v out from its hub. Its leaflets part towards their tips, each pointed.
    float x = uv.x * 22.0;
    float seg = fract(x) - 0.5;
    float r = uv.y;
    float halfw = 0.5 - 0.44 * smoothstep(0.42, 1.0, r);
    float fx = max(fwidth(x), 1e-4);
    float fr = max(fwidth(r), 1e-4);
    float d = max((abs(seg) - halfw) / fx, (r - (1.0 - 0.2 * abs(seg) * 2.0)) / fr);
    float a = clamp(0.5 - d, 0.0, 1.0);
    a = mix(a, 0.78, smoothstep(0.35, 1.2, fx));
    return vec3(a, 0.7 + 0.45 * (1.0 - abs(seg) * 2.0), 0.0);
  }
  float k = floor(uv.y);
  float seed = mod(k, 8.0);
  float wide = floor(k / 8.0 + 0.001) / 40.0;
  vec2 p = vec2(uv.x * wide, uv.y - k);
  vec2 l = m == NEEDLE_CARD ? needles(p, wide, seed) : m == FROND_CARD ? frondLeaves(p, wide, seed) : broadLeaves(p, wide, seed);
  float aa = max(length(fwidth(p)), 1e-5);
  // Once its leaves are finer than a pixel or so, each grows by part of one: a spray closes, within its own outline, into
  // the mass that a real one, leaves over leaves, shows from as far, rather than letting the sky through it.
  float grow = aa * 0.6 * smoothstep(0.01, 0.04, aa);
  return vec3(clamp(0.5 - (l.x - grow) / aa, 0.0, 1.0), l.y, 0.0);
}
`;

export const MESH_VS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in uvec2 aMat;
layout(location = 4) in uint aEntity;
// One mesh drawn many times: each one's place, its size, the way it faces, its entity and how its colour shifts.
layout(location = 5) in vec4 iPlace;
layout(location = 6) in vec2 iFace;
layout(location = 7) in uvec2 iMeta;
uniform mat4 uViewProj;
uniform vec3 uEye;
uniform float uInstanced;
// Seconds of the visit; the wind across the ground, its direction times how hard it blows, as the renderer has it
// (docs/plans/RENDERING.md, step 5).
uniform float uClock;
uniform vec2 uWind;
// How an animal drawn by instancing idles: the root of its neck, its hips and its middle, in its own frame; then how far
// its head swings up and its tail across, and its pace. uIdling is 1 for a mesh that has them.
uniform vec4 uIdle[4];
uniform float uIdling;
${DROP}
${ENTITY}
// Turn a point about a pivot, in the plane of two of its axes.
vec3 turnYZ(vec3 p, vec3 o, float a) {
  vec3 r = p - o;
  return o + vec3(r.x, r.y * cos(a) - r.z * sin(a), r.y * sin(a) + r.z * cos(a));
}
vec3 turnXY(vec3 p, vec3 o, float a) {
  vec3 r = p - o;
  return o + vec3(r.x * cos(a) - r.y * sin(a), r.x * sin(a) + r.y * cos(a), r.z);
}
out vec3 vPos;
out vec3 vN;
out vec2 vUv;
out float vLight;
// how high above its own foot a point of something drawn many times is: what stands low is under the canopy
out float vLow;
// where the point is in its body's own frame, in metres: its skin's grain and pattern are laid there, and go with it
out vec3 vLocal;
flat out int vMaterial;
flat out float vTint;
// the taxon's own tint, before each individual's shift: its pattern is the taxon's
flat out float vKind;
flat out float vFlags;
flat out int vEntity;
void main() {
  bool many = uInstanced > 0.5;
  vLow = many ? aPos.z * iPlace.w : 1e4;
  int entity = many ? int(iMeta.x) : int(aEntity);
  vec4 e = entityOf(entity);
  float up = standing(e);
  if (up <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 p = aPos;
  vec3 n = aNormal.xyz * 2.0 - 1.0;
  float tint = float(aMat.y) / 255.0;
  // Each one its own time in its loops, from where it stands.
  float own = many ? fract(sin(dot(iPlace.xy, vec2(12.9898, 78.233))) * 43758.5453) : 0.0;
  if (many && uIdling > 0.5) {
    // An animal idles: its vertex says what it moves with (world/generators/life/forms.ts, BONE), and how far.
    int code = int(aEntity);
    int bone = code & 15;
    float w = float(code >> 4) / 255.0;
    float t = uClock * uIdle[3].z + own * 6.2831853;
    if (bone == 1 || bone == 2) {
      // The head, and the neck as far as it goes with it, up or down about the neck's root, now and then.
      float c = 0.5 - 0.5 * cos(t * 0.31);
      float a = (bone == 1 ? 1.0 : w) * uIdle[3].x * c * c * c;
      p = turnYZ(p, uIdle[0].xyz, a);
      n = turnYZ(n, vec3(0.0), a);
    } else if (bone == 3) {
      float a = w * uIdle[3].y * sin(t);
      p = turnXY(p, uIdle[1].xyz, a);
      n = turnXY(n, vec3(0.0), a);
    } else if (bone == 4) {
      float b = 1.0 + 0.012 * w * sin(t * 1.7);
      p = uIdle[2].xyz + (p - uIdle[2].xyz) * vec3(b, 1.0, b);
    }
  }
  vLocal = many ? p * iPlace.w : aPos;
  vKind = float(aMat.y) / 255.0;
  if (many) {
    // +y of the mesh goes to (fx, fy), and +x to (fy, −fx). A horn, an eye or a trunk's bark stays its colour.
    vec3 q = p;
    p = iPlace.xyz + vec3(q.x * iFace.y + q.y * iFace.x, -q.x * iFace.x + q.y * iFace.y, q.z) * iPlace.w;
    n = vec3(n.x * iFace.y + n.y * iFace.x, -n.x * iFace.x + n.y * iFace.y, n.z);
    if (aMat.x != 32u && aMat.x != 10u && aMat.x != 37u) tint = fract(tint + float(iMeta.y) / 255.0);
  }
  // A plant drawn by instancing leans with the wind, the more the higher, in gusts that cross the ground; its leaves flutter.
  int mat = int(aMat.x);
  bool plant = mat == 35 || mat == 36 || mat == 37 || mat == 38 || (mat >= 44 && mat <= 49);
  if (many && plant && dot(uWind, uWind) > 0.0) {
    float h = max(aPos.z * iPlace.w, 0.0);
    float speed = length(uWind);
    vec2 dir = uWind / speed;
    float gust = 0.55 + 0.45 * sin(uClock * 0.6 - dot(iPlace.xy, dir) * 0.035) * sin(uClock * 0.21 + own * 6.2831853);
    float lean = gust * speed * 0.05 * h / (1.0 + h * 0.15) * (0.8 + 0.2 * sin(uClock * 1.7 + own * 19.0));
    vec3 off = vec3(dir * lean, -0.5 * lean * lean / max(h, 0.5));
    if (mat >= 44) off += 0.015 * speed * min(h, 4.0) * 0.25 * vec3(sin(uClock * 7.0 + aPos.x * 3.1 + own * 31.0), sin(uClock * 6.3 + aPos.y * 2.7), sin(uClock * 8.1 + aPos.z * 2.3));
    p += off;
  }
  // A structure rises from the ground it stands on.
  if (up < 1.0) p.z = e.w + (p.z - e.w) * up;
  vPos = p;
  p.z -= drop(p.xy);
  vN = n;
  vLight = aNormal.w;
  vUv = aUv;
  vMaterial = int(aMat.x);
  vTint = tint;
  vFlags = e.z;
  vEntity = entity;
  gl_Position = uViewProj * vec4(p - uEye, 1.0);
  // Paving, roads and sand lie on the ground: they win over it at any distance.
  if (aMat.x == 11u || aMat.x == 12u || aMat.x == 13u || aMat.x == 18u) gl_Position.z -= 1.4e-4 * gl_Position.w;
}`;

/**
 * Depth only: for the shadows, and for the depth the lit pass and the occlusion are drawn over. Leaves on cards are cut
 * to their outline for the shadows; the depth before the lit pass leaves them out, as the lit pass blends their edges
 * by coverage and writes their depth itself.
 */
export const DEPTH_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
flat in int vMaterial;
// 1: leaves on cards are cut to their outline; 0: they are left out
uniform float uCards;
${LEAVES}
out vec4 o;
void main() {
  if (onCard(vMaterial) && (uCards < 0.5 || leafCover(vMaterial, vUv).x < 0.5)) discard;
  o = vec4(0.0);
}`;

export const ID_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
flat in int vMaterial;
flat in int vEntity;
${LEAVES}
out vec4 o;
void main() {
  // A click between the leaves goes on to what is behind them.
  if (onCard(vMaterial) && leafCover(vMaterial, vUv).x < 0.5) discard;
  o = vec4(float(vEntity & 255), float((vEntity >> 8) & 255), 0.0, 255.0) / 255.0;
}`;

/**
 * Clouds with depth (docs/plans/RENDERING.md, step 7): fair-weather clouds in a layer from 1400 m to 2400 m above the
 * sea, their density from noise shaped by how much of the sky the globe's clouds cover over the scene, rounded at their
 * bases and tops, and drifting with the wind. The globe's clouds are its weather over a whole cell of it; the scene's sky
 * is fair weather in it, heaps of cloud with sky between, so it takes most of their cover and never all. The sky marches through it; the ground's shadows are taken through the same
 * layer towards the sun, so that the clouds seen are the ones whose shadows pass. A look, as the haze's constant is.
 */
const CLOUDS = /* glsl */ `
// How much of the sky the clouds cover, from the globe's (gen:earth/clouds) over the scene; and the visit's clock. The
// lighter way to draw keeps its flat clouds: uCloudVolume is 0 there.
uniform float uCloudCover;
uniform float uClockSky;
uniform float uCloudVolume;
// A different start for each frame's march, for the frames' average to smooth.
uniform float uFrameNoise;
const float CLOUD_BASE = 1400.0;
const float CLOUD_TOP = 2400.0;
float cloudDensity(vec3 p) {
  float h = (p.z - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE);
  if (h <= 0.0 || h >= 1.0) return 0.0;
  vec3 q = p + vec3(uClockSky * 6.0, uClockSky * 3.4, 0.0);
  float shape = texture(uNoise, q / (64.0 * 900.0)).r * 0.62 + texture(uNoise, q / (64.0 * 320.0) + 0.37).g * 0.38;
  // Flat at the base and round at the top, as a heap of cloud is. The noise lies mostly within a tenth of a half, so the
  // share of the sky above a threshold is about its normal distribution's: the threshold that leaves the cover.
  float profile = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.35, 1.0, h));
  float cover = clamp(uCloudCover * 0.6, 0.0, 0.5);
  float threshold = 0.5 + 0.26 * (0.5 - cover);
  float d = (shape - threshold - 0.06 * (1.0 - profile)) * 7.0 * profile;
  if (d <= 0.0) return 0.0;
  // Its edges eaten away, finely.
  d -= (texture(uNoise, q / (64.0 * 90.0) + 0.71).b - 0.5) * 0.35;
  return clamp(d, 0.0, 1.0);
}
// How much sunlight comes through the clouds to a point below them, along the sun.
float cloudShadow(vec3 p, vec3 sun) {
  if (sun.z < 0.05 || uCloudCover <= 0.0) return 1.0;
  float sum = 0.0;
  for (int i = 0; i < 4; i++) {
    float z = CLOUD_BASE + (CLOUD_TOP - CLOUD_BASE) * (float(i) + 0.5) / 4.0;
    vec3 q = p + sun * ((z - p.z) / sun.z);
    sum += cloudDensity(q);
  }
  return mix(1.0, exp(-sum * 1.6), smoothstep(0.05, 0.2, sun.z));
}
`;

/** Sky, haze, lighting and shadows: what every lit surface shares. */
const LIGHTING = /* glsl */ `
${DROP}
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uSkyTop;
uniform vec3 uSkyLow;
uniform vec3 uBounce;
// The sky's light on a surface by the way it faces, as spherical harmonics of the sky table (docs/plans/RENDERING.md,
// step 4), so that the colour of dawn and dusk reaches the shade; and how much of it to take, 0 for the old two colours.
uniform vec3 uSH[9];
uniform float uSkyLight;
uniform highp sampler2D uSkyLut;
uniform highp sampler2DArrayShadow uShadow;
uniform mat4 uShadowM[3];
uniform vec3 uShadowFocus;
uniform vec3 uShadowRadii;
uniform float uHazeK;
uniform highp sampler3D uNoise;
${SEA_LIGHT}
${CLOUDS}

// Noise whose features are about \`size\` metres across (the texture holds 64 cells to its repeat).
float noiseM(vec3 p, float size) { return texture(uNoise, p / (64.0 * size)).r; }
float noiseS(vec3 p, vec3 size) { return texture(uNoise, p / (64.0 * size)).g; }
float fbmM(vec3 p, float size) {
  vec3 q = p / (64.0 * size);
  return texture(uNoise, q).r * 0.5 + texture(uNoise, q * 2.03 + 0.37).g * 0.3 + texture(uNoise, q * 4.1 + 0.71).b * 0.2;
}

// The sky in a direction, from the table made for this sun.
vec3 skyColor(vec3 d) {
  float az = acos(clamp(dot(normalize(d.xy + 1e-5), normalize(uSun.xy + 1e-5)), -1.0, 1.0)) / 3.14159265;
  float el = asin(clamp(d.z, -1.0, 1.0));
  // More of the table near the horizon.
  float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / 1.5708);
  return texture(uSkyLut, vec2(az, v)).rgb;
}

// Haze: extinction along a view, thinning with height, and what the air adds.
vec3 aerial(vec3 c, vec3 p, vec3 eye) {
  vec3 v = p - eye;
  float d = length(v);
  vec3 dir = v / d;
  // Mean density along the ray, from an exponential atmosphere of 2.2 km scale height.
  float h0 = max(eye.z, 0.0);
  float h1 = max(p.z, 0.0);
  float dh = h1 - h0;
  float rho = abs(dh) < 1.0 ? exp(-h0 / 2200.0) : (exp(-h0 / 2200.0) - exp(-h1 / 2200.0)) * 2200.0 / dh;
  vec3 ext = vec3(0.70, 0.86, 1.18) * uHazeK * d * rho;
  vec3 t = exp(-ext);
  vec3 air = skyColor(normalize(vec3(dir.xy, max(dir.z, 0.015))));
  return c * t + air * (1.0 - t);
}

// What the eye sees of a point: through the haze, and in a scene of the sea through the water as well, over the part of
// the way that lies in each. A point is at its height above the sea, the eye with the Earth's curve taken off.
vec3 seen(vec3 c, vec3 p, vec3 eye) {
  if (uSea < 0.5) return aerial(c, p, eye);
  float he = eye.z + drop(eye.xy);
  if (he >= 0.0 && p.z >= 0.0) return aerial(c, p, eye);
  vec3 v = vec3(p.xy - eye.xy, p.z - drop(p.xy) - eye.z);
  float d = max(length(v), 1e-3);
  // The share of the way that is under water.
  float under = he >= 0.0 ? -p.z / (he - p.z) : p.z <= 0.0 ? 1.0 : -he / (p.z - he);
  vec3 t = exp(-WATER_K * d * under);
  c = c * t + waterGlow(v / d, min(he, 0.0)) * (1.0 - t);
  // From above, the rest of the way is air, hazed as far as the surface.
  return he >= 0.0 ? aerial(c, eye + v * (1.0 - under), eye) : c;
}

// The shadows of the clouds overhead, passing over the land: the clouds the sky draws (step 7), taken towards the sun; on
// the lighter way, broad soft shadows of fair weather.
float cloudShade(vec3 p) {
  if (uCloudVolume < 0.5) return 1.0 - 0.42 * smoothstep(0.5, 0.68, fbmM(p + uSun * 2000.0, 260.0)) * smoothstep(0.08, 0.3, uSun.z);
  return 1.0 - 0.75 * (1.0 - cloudShadow(p, uSun));
}

float shadowAt(vec3 p, vec3 n, float pixel) {
  float d = distance(p, uShadowFocus);
  int k = d < uShadowRadii.x * 0.92 ? 0 : d < uShadowRadii.y * 0.92 ? 1 : 2;
  float texel = uShadowRadii[k] * 2.0 / 2048.0;
  vec3 q = p + n * texel * 1.6 + uSun * texel * 0.6;
  q.z -= drop(q.xy);
  vec4 c = uShadowM[k] * vec4(q, 1.0);
  vec3 u = c.xyz * 0.5 + 0.5;
  if (u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0 || u.z > 1.0) return 1.0;
  float bias = 0.00012;
  float s = 0.0;
  float o = 1.1 / 2048.0;
  s += texture(uShadow, vec4(u.xy, float(k), u.z - bias));
  s += texture(uShadow, vec4(u.xy + vec2( o,  o * 0.4), float(k), u.z - bias));
  s += texture(uShadow, vec4(u.xy + vec2(-o, -o * 0.4), float(k), u.z - bias));
  s += texture(uShadow, vec4(u.xy + vec2( o * 0.4, -o), float(k), u.z - bias));
  s += texture(uShadow, vec4(u.xy + vec2(-o * 0.4,  o), float(k), u.z - bias));
  return s / 5.0;
}

// Bump by a height, from its derivatives across the screen (Mikkelsen 2010): a detail normal with no texture of its own.
vec3 bumpBy(vec3 n, vec3 p, float h, float strength) {
  vec3 dpdx = dFdx(p);
  vec3 dpdy = dFdy(p);
  vec3 r1 = cross(dpdy, n);
  vec3 r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - strength * grad);
}

// GGX highlight of the sun.
float sunSpecular(vec3 n, vec3 v, float rough) {
  vec3 h = normalize(uSun + v);
  float nh = max(dot(n, h), 0.0);
  float a = rough * rough;
  float a2 = a * a;
  float d = nh * nh * (a2 - 1.0) + 1.0;
  float vh = max(dot(v, h), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - vh, 5.0);
  return a2 / (3.14159 * d * d + 1e-4) * fres * 0.25 / max(0.1, vh);
}

// The light of the sky on a surface facing n: from its harmonics, or else between the low sky and the zenith's.
vec3 skyLight(vec3 n) {
  vec3 two = mix(uSkyLow, uSkyTop, n.z * 0.5 + 0.5);
  if (uSkyLight <= 0.0) return two;
  vec3 h = uSH[0] + uSH[1] * n.y + uSH[2] * n.z + uSH[3] * n.x + uSH[4] * (n.x * n.y) + uSH[5] * (n.y * n.z) + uSH[6] * (3.0 * n.z * n.z - 1.0) + uSH[7] * (n.x * n.z) + uSH[8] * (n.x * n.x - n.y * n.y);
  // Facing down, the low sky still reaches it over the horizon, as the two colours had it.
  return mix(two, max(h, vec3(0.0)) + uSkyLow * (0.5 - 0.5 * n.z) * 0.6, uSkyLight);
}

// Sun, sky and the light bounced off the ground.
vec3 shade(vec3 albedo, float rough, float metal, vec3 n, vec3 p, vec3 eye, float occl, float shadow) {
  vec3 v = normalize(eye - p);
  float ndl = max(dot(n, uSun), 0.0);
  float up = n.z * 0.5 + 0.5;
  vec3 sky = skyLight(n);
  // A camera's white balance takes most of the blue out of the shade.
  float grey = dot(sky, vec3(0.3, 0.5, 0.2));
  sky = mix(vec3(grey), sky, 0.5) + uBounce * 0.45;
  vec3 bounce = uBounce * (1.0 - up) * (0.4 + 0.6 * shadow);
  vec3 diff = (albedo * (1.0 - metal)) * (uSunColor * ndl * shadow + (sky + bounce) * occl);
  float spec = sunSpecular(n, v, rough) * ndl * shadow;
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  vec3 r = reflect(-v, n);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  // The sky in a polished surface; a rough one only scatters it, and the blaze by the sun is kept out.
  float gloss = (1.0 - rough) * (1.0 - rough);
  vec3 env = min(skyColor(normalize(vec3(r.xy, abs(r.z) + 0.02))), vec3(2.0)) * (f0 + (1.0 - f0) * fres) * gloss * occl;
  vec3 c = diff + uSunColor * spec * f0 * 2.5 + env;
  // Under the sea, only what of the daylight comes down so far.
  return uSea > 0.5 && p.z < 0.0 ? c * seaLight(p.z) : c;
}
`;

export const MESH_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2DArrayShadow;
in vec3 vPos;
in vec3 vN;
in vec2 vUv;
in float vLight;
in float vLow;
in vec3 vLocal;
flat in int vMaterial;
flat in float vTint;
flat in float vKind;
flat in float vFlags;
uniform vec3 uEye;
// On wild land, what covers the ground (R canopy): what stands low under the canopy is in its shade.
uniform float uWild;
uniform highp sampler2D uMask;
uniform vec4 uMaskBox;
uniform highp sampler2D uAO;
uniform vec2 uAOSize;
uniform float uEvidence;
// 1: the edges of leaves on cards are blended by how much of a pixel they cover; 0: they are cut at half
uniform float uCoverage;
out vec4 o;
${LIGHTING}
${LEAVES}

const int MARBLE=1, TRAVERTINE=2, BRICK=3, PLASTER=4, TILE=5, GILT=6, BRONZE=7, GRANITE=8, WOOD=9, DARK=10, PAVING=11, BASALT=12, SAND=13, CONCRETE=14, LEAD=15, LEAF=16, TRUNK=17, GRASS=18, SHAFT=19, FACADE=20, STATUE=21, EARTH=22, SEATS=23, AWNING=24, SPIRAL=25, CLOTH=26, SKIN=27, DENTIL=28, FRIEZE=29, POOL=30, HIDE=31, HORN=32, SHELL=33, FUR=34, NEEDLE=35, FROND=36, BARK=37, BROAD=38, FEATHER=39, MEMBRANE=40, CHITIN=41, THATCH=42, MUD=43;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

// Fades a pattern away once it is finer than a pixel or two, so nothing shimmers.
float visible(float size, float fw) { return 1.0 - smoothstep(size * 0.25, size * 0.9, fw); }

struct Surface { vec3 albedo; float rough; float metal; float bump; };

// Courses of blocks: a joint mask and a per-block number.
vec2 courses(vec2 uv, vec2 size) {
  float row = floor(uv.y / size.y);
  float x = uv.x / size.x + mod(row, 2.0) * 0.5;
  vec2 id = vec2(floor(x), row);
  vec2 f = vec2(fract(x), fract(uv.y / size.y));
  float jx = min(f.x, 1.0 - f.x) * size.x;
  float jy = min(f.y, 1.0 - f.y) * size.y;
  return vec2(min(jx, jy), hash(id));
}

const vec3 PLASTERS[8] = vec3[8](
  vec3(0.70, 0.60, 0.47), vec3(0.76, 0.70, 0.59), vec3(0.60, 0.40, 0.31), vec3(0.78, 0.74, 0.66),
  vec3(0.55, 0.36, 0.30), vec3(0.72, 0.62, 0.48), vec3(0.66, 0.54, 0.43), vec3(0.82, 0.80, 0.74));
const vec3 BRICKS[4] = vec3[4](vec3(0.50, 0.30, 0.22), vec3(0.56, 0.35, 0.25), vec3(0.44, 0.27, 0.21), vec3(0.60, 0.42, 0.31));

// A house's front: floors of windows over shops, in plaster or brick.
Surface facade(vec3 p, vec2 uv, float tint, float fw, vec3 n, out float glass) {
  Surface s;
  int st = int(tint * 255.0 + 0.5);
  bool brick = (st & 3) == 0;
  vec3 base = brick ? BRICKS[(st >> 2) & 3] : PLASTERS[(st >> 2) & 7];
  // Weather: big patches, and rain streaks down from the eaves.
  float patches = fbmM(p, 2.4);
  float streaks = noiseS(p, vec3(0.5, 0.5, 4.5));
  base *= 0.74 + 0.5 * patches;
  base = mix(base, base * vec3(0.72, 0.70, 0.66), smoothstep(0.45, 0.7, streaks) * 0.55);
  if (brick) {
    vec2 c = courses(uv, vec2(0.42, 0.075));
    float vis = visible(0.075, fw);
    base = mix(base, mix(vec3(0.60, 0.55, 0.47), base * (0.78 + 0.44 * c.y), smoothstep(0.004, 0.012, c.x)), vis);
  } else {
    // Stucco comes away in places, and the brick shows through.
    float flake = smoothstep(0.66, 0.70, fbmM(p + 3.1, 0.7));
    vec3 under = BRICKS[(st >> 4) & 3] * (0.8 + 0.3 * noiseM(p, 0.09));
    base = mix(base, under, flake * (1.0 - smoothstep(1.5, 6.0, fw)) * 0.85);
    base *= 0.94 + 0.12 * noiseM(p, 0.05) * visible(0.05, fw);
  }
  s.rough = 0.92;
  s.metal = 0.0;
  s.bump = 0.0;
  glass = 0.0;
  // The grid of windows: a bay about three metres wide, a storey 3.3 m high, the ground floor apart.
  float bay = 2.9 + 0.6 * float(st & 3) * 0.33;
  float story = 3.3;
  vec2 g = vec2(uv.x / bay, (uv.y - 3.7) / story);
  vec2 cell = floor(g);
  vec2 f = fract(g);
  float rnd = hash(cell + vec2(float(st)));
  if (uv.y > 3.7) {
    vec2 w = abs(f - vec2(0.5, 0.46)) * vec2(bay, story);
    float missing = step(0.84, rnd);
    float hw = 0.42 + 0.12 * step(0.5, fract(rnd * 7.0));
    float hh = 0.66;
    float win = (1.0 - smoothstep(hw - 0.02, hw + 0.02, w.x)) * (1.0 - smoothstep(hh - 0.02, hh + 0.02, w.y)) * (1.0 - missing);
    float vis = 1.0 - smoothstep(0.55, 1.8, fw);
    // From far off the windows melt into a slight darkening of the wall.
    base *= mix(0.88, 1.0, vis);
    if (vis > 0.0) {
      float surround = (1.0 - smoothstep(hw + 0.08, hw + 0.11, w.x)) * (1.0 - smoothstep(hh + 0.08, hh + 0.11, w.y)) * (1.0 - missing);
      base = mix(base, brick ? vec3(0.66, 0.60, 0.52) : base * 0.8, surround * vis);
      // Most stand open, with a shutter folded back at either side; some are closed up.
      float closed = step(fract(rnd * 3.7), 0.3);
      float leaf = step(hw * 0.6, w.x);
      vec3 wood = mix(vec3(0.15, 0.095, 0.06), vec3(0.09, 0.13, 0.10), step(0.72, rnd)) * (0.7 + 0.6 * noiseS(p, vec3(0.03, 0.03, 0.5)));
      vec3 inside = mix(vec3(0.016, 0.014, 0.012), wood, closed > 0.5 ? 1.0 : leaf);
      base = mix(base, inside, win * vis);
    }
  } else {
    // Shops: wide arched openings along the ground floor, in brick.
    float sb = 4.4;
    float sx = fract(uv.x / sb);
    float sid = floor(uv.x / sb);
    float wx = abs(sx - 0.5) * sb;
    float shop = 1.0 - smoothstep(1.45, 1.5, wx);
    float archTop = 2.05 + sqrt(max(0.0, 1.5 * 1.5 - wx * wx)) * 0.55;
    float open = shop * (1.0 - smoothstep(archTop - 0.03, archTop + 0.03, uv.y)) * smoothstep(-0.2, -0.05, uv.y);
    float vis = 1.0 - smoothstep(0.7, 2.0, fw);
    vec3 lower = brick ? base : mix(base, BRICKS[int(hash(vec2(sid, float(st))) * 3.99)], 0.6) * 0.92;
    base = mix(base, lower, vis);
    base *= mix(0.78, 1.0, vis);
    if (vis > 0.0) {
      float ring = shop * smoothstep(archTop - 0.32, archTop - 0.28, uv.y) * (1.0 - open);
      base = mix(base, vec3(0.70, 0.62, 0.50) * (0.8 + 0.3 * noiseM(p, 0.1)), ring * smoothstep(1.2, 1.3, uv.y));
      float closed = step(0.55, hash(vec2(sid, float(st) + 3.0)));
      vec3 boards = vec3(0.13, 0.085, 0.05) * (0.65 + 0.7 * noiseS(p, vec3(0.03, 0.03, 0.8)));
      vec3 inner = mix(vec3(0.018, 0.015, 0.012), boards, closed);
      base = mix(base, inner, open * vis);
    }
  }
  // Damp at the foot.
  base *= mix(0.66, 1.0, smoothstep(0.0, 1.5, uv.y));
  s.albedo = base;
  return s;
}

Surface surface(int m, vec3 p, vec2 uv, float tint, vec3 n, float fw, out vec3 bumpN) {
  Surface s;
  s.rough = 0.8;
  s.metal = 0.0;
  s.bump = 0.0;
  bumpN = n;
  if (m == SPIRAL) {
    // A band of relief winding up the shaft: u wraps once around in twelve, v is height.
    float band = fract(uv.y / 1.5 - uv.x / 12.0);
    float edge = abs(band - 0.5) * 2.0;
    vec3 base = vec3(0.82, 0.80, 0.75) * (0.86 + 0.28 * noiseM(p, 0.1));
    float vis = visible(0.2, fw);
    base *= mix(1.0, 0.62 + 0.38 * smoothstep(0.82, 0.98, 1.0 - edge) + 0.28 * noiseM(p, 0.22), vis);
    bumpN = normalize(n + vec3(0.0, 0.0, 1.0) * (band - 0.5) * 0.7 * vis);
    s.albedo = base;
    s.rough = 0.5;
  } else if (m == MARBLE || m == SHAFT) {
    vec3 base = vec3(0.84, 0.82, 0.77);
    float vein = abs(fbmM(p, 0.7) - 0.5) * 2.0;
    base = mix(base * 0.94, base, smoothstep(0.02, 0.16, vein));
    base *= 0.97 + 0.06 * noiseM(p, 0.03) * visible(0.03, fw);
    // Grime gathers in the wet, in soft patches and down from the ledges.
    base *= mix(0.88, 1.0, smoothstep(0.3, 0.62, fbmM(p, 5.0)));
    base = mix(base, base * vec3(0.86, 0.83, 0.77), smoothstep(0.4, 0.75, noiseS(p, vec3(0.7, 0.7, 4.5))) * 0.45);
    if (m == MARBLE) {
      vec2 c = courses(uv, vec2(1.8, 0.62));
      base *= mix(1.0, 0.68 + 0.32 * smoothstep(0.003, 0.012, c.x), visible(0.25, fw));
      base *= 0.96 + 0.08 * c.y;
    } else {
      // Flutes around the shaft: u counts the column's facets, twelve to the round.
      float a = fract(uv.x * 2.0);
      float prof = abs(a - 0.5) * 2.0;
      float vis = visible(0.022, fw);
      base *= mix(0.92, 0.6 + 0.4 * prof * prof, vis);
      float tilt = (prof - 0.5) * 0.7 * vis * sign(a - 0.5);
      vec3 t = normalize(cross(vec3(0.0, 0.0, 1.0), n));
      bumpN = normalize(n + t * tilt);
    }
    s.albedo = base;
    s.rough = 0.4;
  } else if (m == TRAVERTINE || m == SEATS) {
    vec3 base = vec3(0.64, 0.58, 0.47);
    base *= 0.82 + 0.34 * noiseS(p, vec3(1.8, 1.8, 0.16));
    float pits = smoothstep(0.6, 0.72, noiseM(p, 0.05));
    base *= 1.0 - pits * 0.3 * visible(0.05, fw);
    base *= mix(0.86, 1.0, smoothstep(0.3, 0.62, fbmM(p, 6.0)));
    base = mix(base, base * vec3(0.84, 0.8, 0.74), smoothstep(0.4, 0.75, noiseS(p, vec3(0.9, 0.9, 5.0))) * 0.45);
    if (m == TRAVERTINE) {
      vec2 c = courses(uv, vec2(1.5, 0.58));
      base *= mix(1.0, 0.68 + 0.32 * smoothstep(0.004, 0.014, c.x), visible(0.25, fw));
      base *= 0.94 + 0.12 * c.y;
    } else {
      float row = fract(uv.y);
      base *= mix(0.9, 1.0, step(0.5, row));
      base *= 0.86 + 0.26 * hash(vec2(floor(uv.x), floor(uv.y)));
    }
    s.albedo = base;
    s.rough = 0.85;
  } else if (m == BRICK) {
    vec3 base = BRICKS[int(tint * 255.0) & 3] * (0.82 + 0.34 * fbmM(p, 1.4));
    vec2 c = courses(uv, vec2(0.42, 0.075));
    float vis = visible(0.075, fw);
    base = mix(base, mix(vec3(0.6, 0.54, 0.46), base * (0.76 + 0.48 * c.y), smoothstep(0.004, 0.012, c.x)), vis);
    base *= mix(0.74, 1.0, smoothstep(0.3, 0.62, fbmM(p, 5.0)));
    base = mix(base, base * vec3(0.72, 0.72, 0.7), noiseS(p, vec3(0.7, 0.7, 4.5)) * 0.4);
    s.albedo = base;
    s.rough = 0.92;
  } else if (m == PLASTER) {
    s.albedo = PLASTERS[int(tint * 255.0) & 7] * (0.8 + 0.4 * fbmM(p, 1.2));
    s.rough = 0.9;
  } else if (m == TILE) {
    // Rows of tiles down the slope, a ridge over each joint.
    float pitch = 0.44;
    vec2 q = uv / vec2(pitch, 0.62);
    float rowV = floor(q.y);
    float a = fract(q.x);
    float prof = abs(a - 0.5) * 2.0;
    float ridge = pow(prof, 5.0);
    float vis = visible(0.2, fw);
    // Each roof its own age: fresh orange to weathered brown and grey.
    vec3 fresh = mix(vec3(0.60, 0.27, 0.15), vec3(0.70, 0.40, 0.22), tint);
    vec3 old = mix(vec3(0.38, 0.27, 0.21), vec3(0.47, 0.38, 0.30), tint);
    float age = fract(tint * 7.3);
    vec3 base = mix(fresh, old, age * 0.85);
    base *= 0.76 + 0.48 * fbmM(p, 2.2);
    base = mix(base, base * vec3(0.66, 0.72, 0.64), smoothstep(0.42, 0.7, fbmM(p + 7.0, 5.5)) * 0.6);
    float id = hash(vec2(floor(q.x), rowV));
    base *= mix(1.0, 0.8 + 0.38 * id, vis);
    base *= mix(1.0, 0.68 + 0.38 * ridge, vis);
    // Each row laps over the next.
    base *= mix(1.0, 0.78 + 0.22 * smoothstep(0.0, 0.1, fract(q.y)), visible(0.3, fw));
    // Far off, the ridges still darken a roof a little, and catch the sun.
    base *= mix(0.86, 1.0, vis);
    vec3 t = normalize(cross(vec3(0.0, 0.0, 1.0), n) + vec3(1e-4));
    bumpN = normalize(n + t * (a - 0.5) * 0.7 * vis);
    s.albedo = base;
    s.rough = 0.78;
  } else if (m == GILT) {
    s.albedo = vec3(1.0, 0.76, 0.34) * (0.82 + 0.26 * fbmM(p, 0.8));
    s.metal = 1.0;
    s.rough = 0.32;
    float vis = visible(0.2, fw);
    float a = fract(uv.x / 0.5);
    vec3 t = normalize(cross(vec3(0.0, 0.0, 1.0), n) + vec3(1e-4));
    bumpN = normalize(n + t * (a - 0.5) * 0.4 * vis);
  } else if (m == BRONZE || m == STATUE) {
    s.albedo = mix(vec3(0.55, 0.40, 0.22), vec3(0.26, 0.40, 0.33), smoothstep(0.38, 0.62, fbmM(p, 0.6)));
    s.metal = 0.85;
    s.rough = 0.48;
  } else if (m == GRANITE) {
    vec3 base = mix(vec3(0.42, 0.37, 0.37), vec3(0.62, 0.47, 0.44), tint);
    float sp = noiseM(p, 0.012);
    base *= mix(1.0, 0.72 + 0.56 * sp, visible(0.012, fw));
    s.albedo = base;
    s.rough = 0.34;
  } else if (m == WOOD || m == TRUNK) {
    vec3 base = m == WOOD ? vec3(0.33, 0.21, 0.12) : vec3(0.26, 0.19, 0.14);
    base *= 0.7 + 0.56 * noiseS(p, vec3(0.03, 0.03, 0.5));
    s.albedo = base;
    s.rough = 0.86;
  } else if (m == HIDE) {
    // Pebbled skin, darker along the back, paler beneath, its colours nobody's record: the generator's.
    float k = tint * 4.0;
    vec3 a = vec3(0.145, 0.125, 0.082);
    vec3 b = vec3(0.17, 0.165, 0.085);
    vec3 c = vec3(0.215, 0.14, 0.075);
    vec3 d = vec3(0.105, 0.115, 0.10);
    vec3 base = k < 1.0 ? mix(a, b, k) : k < 2.0 ? mix(b, c, k - 1.0) : k < 3.0 ? mix(c, d, k - 2.0) : mix(d, a, k - 3.0);
    float mott = fbmM(p, 0.32);
    float band = smoothstep(0.44, 0.62, fbmM(p * vec3(1.0, 0.45, 0.8), 0.5) + (mott - 0.5) * 0.35);
    vec3 skin = base * mix(1.25, 0.55, band);
    float back = smoothstep(0.2, 0.95, n.z);
    float belly = smoothstep(-0.15, -0.8, n.z);
    skin = mix(skin, skin * 0.58, back);
    skin = mix(skin, mix(skin, vec3(0.42, 0.37, 0.27), 0.68), belly);
    s.albedo = skin * (0.66 + 0.68 * noiseM(p, 0.06));
    s.rough = 0.66;
    vec3 q = p / (64.0 * 0.045);
    vec3 wob = vec3(texture(uNoise, q).r, texture(uNoise, q).g, texture(uNoise, q).b) - 0.5;
    bumpN = normalize(n + wob * 1.5);
  } else if (m == HORN) {
    s.albedo = mix(vec3(0.58, 0.52, 0.40), vec3(0.20, 0.17, 0.13), tint) * (0.84 + 0.3 * noiseM(p, 0.05));
    s.rough = 0.48;
  } else if (m == SHELL) {
    // Scutes: cells on the shell's own plan, with dark seams between them.
    vec2 g = uv / 0.11;
    vec2 cell = floor(g);
    vec2 f = fract(g);
    float seam = smoothstep(0.0, 0.08, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    vec3 base = mix(vec3(0.17, 0.15, 0.09), vec3(0.30, 0.25, 0.13), hash(cell + floor(tint * 8.0)));
    s.albedo = base * mix(0.5, 1.0, seam * visible(0.06, fw) + 1.0 - visible(0.06, fw)) * (0.8 + 0.4 * noiseM(p, 0.04));
    s.rough = 0.42;
  } else if (m == FUR) {
    float k = fract(tint * 3.0);
    vec3 base = tint < 0.34 ? mix(vec3(0.20, 0.145, 0.09), vec3(0.34, 0.25, 0.14), k) : tint < 0.67 ? mix(vec3(0.27, 0.20, 0.11), vec3(0.16, 0.14, 0.11), k) : mix(vec3(0.42, 0.34, 0.20), vec3(0.22, 0.17, 0.12), k);
    float back = smoothstep(0.2, 0.9, n.z);
    float belly = smoothstep(-0.1, -0.8, n.z);
    s.albedo = mix(mix(base, base * 0.6, back), vec3(0.56, 0.50, 0.40), belly * 0.7) * (0.74 + 0.5 * noiseS(p, vec3(0.03, 0.03, 0.14)));
    s.rough = 0.95;
  } else if (m == FEATHER) {
    // Vanes in long strokes, darker on the back and paler beneath. Their colours are nobody's record: the generator's.
    float k = tint * 4.0;
    vec3 a = vec3(0.13, 0.12, 0.10);
    vec3 b = vec3(0.30, 0.24, 0.14);
    vec3 c = vec3(0.10, 0.14, 0.18);
    vec3 d = vec3(0.36, 0.33, 0.27);
    vec3 base = k < 1.0 ? mix(a, b, k) : k < 2.0 ? mix(b, c, k - 1.0) : k < 3.0 ? mix(c, d, k - 2.0) : mix(d, a, k - 3.0);
    float back = smoothstep(0.2, 0.9, n.z);
    float belly = smoothstep(-0.1, -0.8, n.z);
    s.albedo = mix(mix(base, base * 0.7, back), vec3(0.62, 0.58, 0.50), belly * 0.6) * (0.78 + 0.44 * noiseS(p, vec3(0.018, 0.09, 0.018)));
    s.rough = 0.82;
  } else if (m == MEMBRANE) {
    // A wing's skin: thin, leathery and a little see-through against the light.
    vec3 base = mix(vec3(0.26, 0.17, 0.11), vec3(0.42, 0.29, 0.17), tint);
    s.albedo = base * (0.8 + 0.34 * noiseS(p, vec3(0.3, 0.04, 0.3)));
    s.rough = 0.62;
  } else if (m == THATCH) {
    // Thatch of straw, reed or leaves: bundles in courses down the slope, greying where it is old.
    vec3 straw = mix(vec3(0.42, 0.33, 0.17), vec3(0.30, 0.25, 0.15), tint);
    float course = smoothstep(0.2, 0.8, abs(fract(p.z * 3.2 + noiseM(p, 0.6) * 0.6) - 0.5) * 2.0);
    float streak = noiseS(p, vec3(0.04, 0.04, 0.5));
    s.albedo = straw * (0.72 + 0.22 * course + 0.2 * streak) * (0.85 + 0.3 * fbmM(p, 1.4));
    s.rough = 0.95;
  } else if (m == MUD) {
    // Mud brick or mud plaster: earth-coloured, smoothed by hand, its bricks faint in courses.
    vec3 earth = mix(vec3(0.50, 0.40, 0.29), vec3(0.42, 0.33, 0.24), tint);
    float bricks = smoothstep(0.88, 0.97, fract(p.z * 3.0)) * 0.08;
    s.albedo = earth * (0.86 + 0.24 * fbmM(p, 0.9) - bricks) * (0.92 + 0.16 * noiseM(p, 0.08));
    s.rough = 0.9;
  } else if (m == CHITIN) {
    // A hard, glossy shell of plates.
    vec3 base = mix(vec3(0.05, 0.035, 0.025), vec3(0.20, 0.13, 0.06), tint);
    s.albedo = base * (0.8 + 0.4 * noiseM(p, 0.02));
    s.rough = 0.32;
  } else if (m == NEEDLE) {
    // Soft sprays of needles, in streaks falling away from the trunk.
    vec3 dark = mix(vec3(0.03, 0.064, 0.032), vec3(0.05, 0.085, 0.036), tint);
    vec3 lite = mix(vec3(0.075, 0.135, 0.05), vec3(0.135, 0.185, 0.06), tint);
    float spray = noiseS(p, vec3(0.2, 0.2, 0.06)) * 0.6 + noiseM(p, 0.12) * 0.4;
    s.albedo = mix(dark, lite, smoothstep(0.3, 0.7, spray)) * (0.85 + 0.35 * fbmM(p, 3.0));
    s.rough = 0.86;
    vec3 q = p / (64.0 * 0.26);
    vec3 wob = vec3(texture(uNoise, q).r, texture(uNoise, q).g, texture(uNoise, q).b) - 0.5;
    bumpN = normalize(n + wob * 1.5);
  } else if (m == FROND) {
    // Veined blades: fans and fronds, with a glossy side.
    vec3 dark = mix(vec3(0.05, 0.11, 0.035), vec3(0.075, 0.13, 0.04), tint);
    vec3 lite = mix(vec3(0.16, 0.25, 0.07), vec3(0.25, 0.30, 0.085), tint);
    float vein = abs(fract(uv.x + 0.5) - 0.5) * 2.0;
    s.albedo = mix(dark, lite, 0.42 + 0.5 * vein * visible(0.1, fw)) * (0.8 + 0.4 * noiseM(p, 0.22));
    s.rough = 0.56;
  } else if (m == BROAD) {
    // A mass of broad leaves: the light on them, in small flecks.
    vec3 dark = mix(vec3(0.028, 0.06, 0.024), vec3(0.052, 0.078, 0.022), tint);
    vec3 lite = mix(vec3(0.085, 0.14, 0.04), vec3(0.16, 0.185, 0.05), tint);
    float fleck = noiseM(p, 0.09) * 0.55 + noiseM(p + 5.0, 0.28) * 0.45;
    s.albedo = mix(dark, lite, smoothstep(0.32, 0.72, fleck)) * (0.82 + 0.4 * fbmM(p, 3.5));
    s.rough = 0.8;
    vec3 q = p / (64.0 * 0.14);
    vec3 wob = vec3(texture(uNoise, q).r, texture(uNoise, q).g, texture(uNoise, q).b) - 0.5;
    bumpN = normalize(n + wob * 2.2);
  } else if (m == BARK) {
    vec3 base = mix(vec3(0.17, 0.13, 0.095), vec3(0.31, 0.22, 0.14), tint);
    float ridges = noiseS(p, vec3(0.05, 0.05, 0.7));
    s.albedo = base * (0.58 + 0.84 * ridges);
    s.rough = 0.9;
  } else if (m == DARK) {
    s.albedo = vec3(0.012, 0.011, 0.01);
    s.rough = 0.9;
  } else if (m == POOL) {
    s.albedo = vec3(0.03, 0.06, 0.055);
    s.rough = 0.1;
  } else if (m == PAVING) {
    vec2 c = courses(uv, vec2(1.8, 1.05));
    vec3 base = mix(vec3(0.62, 0.58, 0.50), vec3(0.76, 0.74, 0.68), tint);
    base *= 0.82 + 0.26 * c.y;
    base *= mix(1.0, 0.6 + 0.4 * smoothstep(0.012, 0.04, c.x), visible(0.4, fw));
    base *= mix(0.76, 1.0, smoothstep(0.26, 0.6, fbmM(p, 6.0)));
    base *= 0.94 + 0.12 * noiseM(p, 0.06) * visible(0.06, fw);
    s.albedo = base;
    s.rough = 0.7;
  } else if (m == BASALT) {
    // Polygonal stones, in the manner of the Roman road.
    vec2 cell = floor(uv * 1.5);
    vec2 f = fract(uv * 1.5);
    float d1 = 8.0;
    float d2 = 8.0;
    float idn = 0.0;
    float vis = visible(0.25, fw);
    if (vis > 0.0) {
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 r = g + vec2(hash(cell + g), hash(cell + g + 17.3)) - f;
        float q = dot(r, r);
        if (q < d1) { d2 = d1; d1 = q; idn = hash(cell + g + 3.1); }
        else if (q < d2) d2 = q;
      }
    }
    float edge = sqrt(d2) - sqrt(d1);
    vec3 base = mix(vec3(0.20, 0.20, 0.21), vec3(0.30, 0.29, 0.28), idn);
    base = mix(vec3(0.25, 0.24, 0.23), base, vis);
    base *= mix(1.0, 0.45 + 0.55 * smoothstep(0.02, 0.12, edge), vis);
    base *= 0.72 + 0.56 * fbmM(p, 3.5);
    s.albedo = base;
    s.rough = 0.55;
  } else if (m == SAND) {
    s.albedo = vec3(0.74, 0.64, 0.47) * (0.8 + 0.4 * fbmM(p, 1.6));
    s.rough = 0.95;
  } else if (m == CONCRETE) {
    s.albedo = vec3(0.58, 0.54, 0.47) * (0.72 + 0.5 * fbmM(p, 0.5));
    s.rough = 0.95;
  } else if (m == LEAD) {
    s.albedo = vec3(0.30, 0.31, 0.31) * (0.8 + 0.34 * fbmM(p, 1.5));
    s.metal = 0.0;
    s.rough = 0.8;
  } else if (m == LEAF) {
    vec3 dark = mix(vec3(0.05, 0.095, 0.035), vec3(0.08, 0.125, 0.045), tint);
    vec3 lite = mix(vec3(0.15, 0.21, 0.07), vec3(0.22, 0.27, 0.09), tint);
    float clump = noiseM(p, 0.55) * 0.6 + noiseM(p + 5.0, 0.16) * 0.4;
    s.albedo = mix(dark, lite, smoothstep(0.32, 0.66, clump)) * (0.8 + 0.5 * fbmM(p, 3.0));
    s.rough = 0.85;
    vec3 q = p / (64.0 * 0.4);
    vec3 wob = vec3(texture(uNoise, q).r, texture(uNoise, q).g, texture(uNoise, q).b) - 0.5;
    bumpN = normalize(n + wob * 1.6);
  } else if (m == GRASS) {
    s.albedo = mix(vec3(0.15, 0.21, 0.08), vec3(0.28, 0.30, 0.12), fbmM(p, 2.5)) * (0.84 + 0.32 * noiseM(p, 0.25));
    s.rough = 0.95;
  } else if (m == EARTH) {
    s.albedo = mix(vec3(0.28, 0.24, 0.15), vec3(0.20, 0.26, 0.11), fbmM(p, 2.0));
    s.rough = 0.95;
  } else if (m == CLOTH) {
    int k = int(tint * 255.0) & 7;
    vec3 c = k < 3 ? vec3(0.78, 0.75, 0.68) : k == 3 ? vec3(0.62, 0.48, 0.30) : k == 4 ? vec3(0.50, 0.17, 0.14) : k == 5 ? vec3(0.22, 0.28, 0.42) : k == 6 ? vec3(0.55, 0.52, 0.45) : vec3(0.36, 0.28, 0.20);
    s.albedo = c * (0.8 + 0.3 * noiseM(p, 0.12));
    s.rough = 0.95;
  } else if (m == SKIN) {
    s.albedo = mix(vec3(0.47, 0.31, 0.22), vec3(0.28, 0.18, 0.12), tint);
    s.rough = 0.7;
  } else if (m == DENTIL) {
    // A row of small blocks under a cornice.
    vec3 base = vec3(0.82, 0.80, 0.75) * (0.92 + 0.14 * fbmM(p, 1.0));
    float a = fract(uv.x / 0.42);
    float vis = visible(0.2, fw);
    base *= mix(0.86, 0.55 + 0.45 * step(0.34, a), vis);
    s.albedo = base;
    s.rough = 0.45;
  } else if (m == FRIEZE) {
    // A band of carved relief: garlands and figures, seen as light and shade.
    vec3 base = vec3(0.82, 0.80, 0.75);
    float a = abs(fract(uv.x / 1.7) - 0.5) * 2.0;
    float carved = noiseS(p, vec3(0.28, 0.28, 0.2)) * 0.6 + (0.5 + 0.5 * sin(uv.x * 7.4 + 2.0 * sin(uv.x * 1.85))) * 0.4;
    float vis = visible(0.18, fw);
    base *= mix(0.92, 0.72 + 0.46 * carved, vis);
    base *= 0.9 + 0.14 * a;
    s.albedo = base;
    s.rough = 0.48;
  } else if (m == AWNING) {
    vec3 a = tint < 0.33 ? vec3(0.56, 0.18, 0.13) : tint < 0.66 ? vec3(0.72, 0.66, 0.52) : vec3(0.20, 0.30, 0.40);
    s.albedo = mix(a, a * 0.7, step(0.5, fract(uv.x * 1.6)));
    s.rough = 0.9;
  } else {
    s.albedo = vec3(0.6);
  }
  return s;
}

// Leaves, on cards and in the mass inside a crown: patches across the crown as sun and age colour it, and each leaf its
// own shade. Their colours are the renderer's, and nobody's record.
Surface leaves(int m, vec3 p, float tint, float shade, float family) {
  Surface s;
  s.metal = 0.0;
  s.bump = 0.0;
  s.rough = 0.6;
  if (m == LEAF_MASS) {
    s.albedo = mix(vec3(0.036, 0.07, 0.03), vec3(0.056, 0.088, 0.032), tint) * (0.8 + 0.4 * fbmM(p, 1.5));
    s.rough = 0.9;
    return s;
  }
  vec3 dark = mix(vec3(0.028, 0.06, 0.024), vec3(0.052, 0.078, 0.022), tint);
  vec3 lite = mix(vec3(0.085, 0.14, 0.04), vec3(0.16, 0.185, 0.05), tint);
  if (m == NEEDLE_CARD || (m == BLADE_CARD && family > 1.5 && family < 2.5)) {
    dark = mix(vec3(0.03, 0.064, 0.032), vec3(0.05, 0.085, 0.036), tint);
    lite = mix(vec3(0.075, 0.135, 0.05), vec3(0.135, 0.185, 0.06), tint);
    s.rough = 0.7;
  } else if (m == FROND_CARD || m == FAN_CARD || (m == BLADE_CARD && family < 1.5)) {
    dark = mix(vec3(0.05, 0.11, 0.035), vec3(0.075, 0.13, 0.04), tint);
    lite = mix(vec3(0.16, 0.25, 0.07), vec3(0.25, 0.30, 0.085), tint);
    s.rough = 0.5;
  }
  s.albedo = mix(dark, lite, clamp(0.2 + 0.55 * fbmM(p, 2.5) + (shade - 0.9) * 0.8, 0.0, 1.0));
  return s;
}

// Leaves are lit as the mass they make, by a normal bent out from their crown's middle, softly round the side away from
// the sun; on a card, with the light that comes through a leaf where the sun is behind it, and a little sheen; and with
// as much of the sky as the crown lets in. g is the card's own face.
vec3 foliage(vec3 albedo, float rough, vec3 n, vec3 g, vec3 p, float sky, float shadow, bool thin) {
  vec3 v = normalize(uEye - p);
  float wrap = clamp((dot(n, uSun) + 0.3) / 1.3, 0.0, 1.0);
  float up = n.z * 0.5 + 0.5;
  vec3 skyC = skyLight(n);
  float grey = dot(skyC, vec3(0.3, 0.5, 0.2));
  skyC = mix(vec3(grey), skyC, 0.5) + uBounce * 0.45;
  vec3 bounce = uBounce * (1.0 - up) * (0.4 + 0.6 * shadow);
  vec3 c = albedo * (uSunColor * wrap * shadow + (skyC + bounce) * sky);
  if (thin) {
    float gs = dot(g, uSun);
    float gv = dot(g, v);
    float through = gs * gv < 0.0 ? abs(gs) : 0.0;
    float behind = pow(max(dot(-v, uSun), 0.0), 4.0);
    c += albedo * vec3(1.1, 1.3, 0.5) * uSunColor * shadow * (0.45 * through + 0.3 * behind);
    vec3 face = gv < 0.0 ? -g : g;
    c += uSunColor * shadow * sunSpecular(face, v, rough) * max(dot(face, uSun), 0.0) * 0.06;
  }
  return uSea > 0.5 && p.z < 0.0 ? c * seaLight(p.z) : c;
}

// A body's skin close by (docs/plans/RENDERING.md, step 6): a height for its grain, in the body's own frame, as its
// material is: pebbled scales on a hide, hair lying along a body, feathers lapping back from the head, seams between a
// shell's scutes, the plates of chitin, the veins of a wing. Which a body has is its form's; how it looks is this.
float skinGrain(int m, vec3 q) {
  if (m == HIDE) {
    float a = texture(uNoise, q / (64.0 * 0.012)).r;
    float b = texture(uNoise, q / (64.0 * 0.035) + 0.3).g;
    return smoothstep(0.35, 0.75, a) * 0.7 + b * 0.3;
  }
  if (m == FUR) return texture(uNoise, q * vec3(1.0, 0.12, 1.0) / (64.0 * 0.004)).r;
  if (m == FEATHER) {
    // Rows of vanes, each lapping the one behind it, along the body from the head back.
    float row = fract(q.y / 0.035 + texture(uNoise, q / (64.0 * 0.05)).r * 0.6);
    return row * row * 0.8 + texture(uNoise, q * vec3(1.0, 0.2, 1.0) / (64.0 * 0.006)).g * 0.2;
  }
  if (m == CHITIN) return smoothstep(0.0, 0.15, fract(q.y / 0.012));
  if (m == MEMBRANE) return 1.0 - smoothstep(0.0, 0.06, abs(fract(q.x / 0.05 + q.y / 0.11) - 0.5));
  return 0.0;
}
// Its pattern, by the generator's choice for the taxon, from its tint: plain, stripes across the body, spots, or
// mottled; darker where the pattern is. The generator's look, and nobody's record.
float skinPattern(vec3 q, float tint) {
  int kind = int(tint * 255.0) >> 6;
  if (kind == 1) return smoothstep(0.35, 0.65, sin(q.y * 26.0 + texture(uNoise, q / (64.0 * 0.08)).r * 4.0) * 0.5 + 0.5);
  if (kind == 2) return smoothstep(0.62, 0.7, texture(uNoise, q / (64.0 * 0.05)).g);
  if (kind == 3) return smoothstep(0.45, 0.7, texture(uNoise, q / (64.0 * 0.11)).b) * 0.7;
  return 0.0;
}

void main() {
  vec3 n = normalize(vN);
  float fw = max(length(dFdx(vUv)), length(dFdy(vUv)));
  float glass = 0.0;
  vec3 bumped = n;
  bool card = onCard(vMaterial);
  bool leafy = card || vMaterial == LEAF_MASS;
  float alpha = 1.0;
  vec3 cover = vec3(1.0, 0.9, 0.0);
  if (card) {
    cover = leafCover(vMaterial, vUv);
    alpha = cover.x;
    if (uCoverage < 0.5) {
      if (alpha < 0.5) discard;
      alpha = 1.0;
    } else if (alpha < 0.01) discard;
  }
  Surface s;
  if (leafy) s = leaves(vMaterial, vPos, vTint, cover.y, cover.z);
  else if (vMaterial == FACADE) s = facade(vPos, vUv, vTint, fw, n, glass);
  else s = surface(vMaterial, vPos, vUv, vTint, n, fw, bumped);
  bool skin = vMaterial == HIDE || vMaterial == FUR || vMaterial == FEATHER || vMaterial == CHITIN || vMaterial == MEMBRANE;
  if (skin) {
    // Close by, the grain of its skin, while a pixel is small enough to show it; and its pattern, at any distance.
    float near = 1.0 - smoothstep(4.0, 30.0, length(uEye - vPos));
    if (near > 0.0) bumped = bumpBy(bumped, vPos, skinGrain(vMaterial, vLocal), (vMaterial == FUR ? 0.0025 : 0.004) * near);
    if (vMaterial != MEMBRANE && vMaterial != CHITIN) s.albedo *= 1.0 - 0.38 * skinPattern(vLocal, vKind);
  }
  // The eye's side of a face.
  vec3 toEye = uEye - vPos;
  // Foliage has holes in it, up close, where the leaves stop: fewer with distance, none once they would shimmer.
  if (vMaterial == BROAD || vMaterial == NEEDLE) {
    float span = vMaterial == BROAD ? 0.34 : 0.26;
    float gap = texture(uNoise, vPos / (64.0 * span)).r * 0.7 + texture(uNoise, vPos / (64.0 * span * 0.45)).g * 0.3;
    float reach = 1.0 - smoothstep(14.0, 70.0, length(toEye));
    if (gap < 0.46 * reach) discard;
  }
  float pixel = length(toEye) * 0.002;
  // Under the canopy, close to the ground, the sky's light is the forest floor's (docs/plans/RENDERING.md, step 4).
  float under = 1.0;
  if (uWild > 0.5 && vLow < 14.0) {
    vec2 muv = (vPos.xy - uMaskBox.xy) / uMaskBox.zw;
    if (muv.x > 0.0 && muv.y > 0.0 && muv.x < 1.0 && muv.y < 1.0) under = 1.0 - 0.72 * texture(uMask, muv).r * (1.0 - smoothstep(4.0, 14.0, vLow));
  }
  vec3 c;
  if (leafy) {
    // A leaf's normal is its crown's, whichever side of it is seen; and what it sees of the sky is the crown's to say.
    float sh = shadowAt(vPos, n, pixel) * cloudShade(vPos);
    vec3 g = normalize(cross(dFdx(vPos), dFdy(vPos)));
    c = foliage(s.albedo, s.rough, n, g, vPos, vLight * under, sh, card);
  } else {
    vec3 w = gl_FrontFacing ? bumped : -bumped;
    float sh = shadowAt(vPos, gl_FrontFacing ? n : -n, pixel) * cloudShade(vPos);
    float ao = texture(uAO, gl_FragCoord.xy / uAOSize).r;
    float occl = ao * (vLight * 0.5 + 0.5) * under;
    c = shade(s.albedo, s.rough, s.metal, w, vPos, uEye, occl, sh * mix(1.0, ao, 0.35));
  }
  c = seen(c, vPos, uEye);
  // Evidence mode: what rests on a reconstruction is amber, what was generated magenta.
  int flags = int(vFlags);
  int basis = flags & 7;
  if (uEvidence > 0.5) {
    float hatch = step(0.62, fract((gl_FragCoord.x + gl_FragCoord.y) / 9.0));
    vec3 tint2 = basis >= 3 ? vec3(0.92, 0.25, 0.75) : basis >= 1 ? vec3(0.95, 0.65, 0.18) : vec3(0.3, 0.85, 0.5);
    c = mix(c, tint2 * 1.2, 0.18 + 0.28 * hatch);
  }
  if ((flags & 8) != 0) {
    float e = pow(1.0 - abs(dot(normalize(toEye), n)), 2.0);
    c += vec3(1.0, 0.82, 0.42) * (0.1 + 0.55 * e);
  } else if ((flags & 16) != 0) {
    c += vec3(0.9, 0.8, 0.6) * 0.06;
  }
  o = vec4(c, alpha);
}`;

// ——— Terrain ———

const GROUND = /* glsl */ `
uniform highp isampler2D uGround0;
uniform highp isampler2D uGround1;
uniform highp isampler2D uGround2;
// Each grid: x0, y0, cell, ease distance; and its size in cells.
uniform vec4 uGrid[3];
uniform vec2 uGridSize[3];
float readGrid(highp isampler2D t, int k, vec2 p) {
  vec2 f = clamp((p - uGrid[k].xy) / uGrid[k].z, vec2(0.0), uGridSize[k] - 1.001);
  ivec2 i = ivec2(floor(f));
  vec2 u = f - vec2(i);
  float a = float(texelFetch(t, i, 0).r);
  float b = float(texelFetch(t, i + ivec2(1, 0), 0).r);
  float c = float(texelFetch(t, i + ivec2(0, 1), 0).r);
  float d = float(texelFetch(t, i + ivec2(1, 1), 0).r);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.1;
}
float gridWeight(int k, vec2 p) {
  vec2 lo = p - uGrid[k].xy;
  vec2 hi = uGrid[k].xy + (uGridSize[k] - 1.0) * uGrid[k].z - p;
  float d = min(min(lo.x, lo.y), min(hi.x, hi.y));
  return smoothstep(0.0, 1.0, d / uGrid[k].w);
}
float groundAt(vec2 p) {
  float z = readGrid(uGround2, 2, p);
  float w1 = gridWeight(1, p);
  if (w1 > 0.0) z = mix(z, readGrid(uGround1, 1, p), w1);
  float w0 = gridWeight(0, p);
  if (w0 > 0.0) z = mix(z, readGrid(uGround0, 0, p), w0);
  return z;
}
`;

export const TERRAIN_VS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec2 aGrid;
uniform mat4 uViewProj;
uniform vec3 uEye;
uniform vec2 uCenter;
uniform float uCell;
uniform float uSeaSurface;
${DROP}
${GROUND}
out vec3 vPos;
invariant gl_Position;
void main() {
  // Toward its outer edge a ring's vertices slide onto the next ring's grid, so they meet without gaps.
  float edge = max(abs(aGrid.x), abs(aGrid.y));
  float m = clamp((edge - 54.0) / 8.0, 0.0, 1.0);
  vec2 even = floor(aGrid * 0.5 + 0.5) * 2.0;
  vec2 g = mix(aGrid, even, m);
  vec2 p = uCenter + g * uCell;
  float z = groundAt(p);
  vPos = vec3(p, z);
  // Where the sea is what is seen, it is drawn at its surface; the depth under it only colours it.
  float shown = uSeaSurface > 0.5 ? max(z, 0.0) : z;
  gl_Position = uViewProj * vec4(vec3(p, shown - drop(p)) - uEye, 1.0);
}`;

export const TERRAIN_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2DArrayShadow;
in vec3 vPos;
uniform vec3 uEye;
// The wind across the ground, as the renderer has it: sand's ripples lie across it.
uniform vec2 uWind;
uniform vec4 uInner;
uniform highp sampler2D uNormal0;
uniform highp sampler2D uNormal1;
uniform highp sampler2D uNormal2;
uniform highp sampler2D uMask;
uniform vec4 uMaskBox;
// What people made of the ground (gen:people/settlement): R crops, G pasture, B yards and lanes, A flooded paddies; and how
// its plots are drawn: a plot's side in m, how much longer than wide, its kind, and whether there are any.
uniform highp sampler2D uFields;
uniform vec4 uFieldsBox;
uniform vec4 uFieldStyle;
uniform highp sampler2D uAO;
uniform vec2 uAOSize;
uniform float uUseAO;
uniform float uEvidence;
uniform float uWater;
uniform float uWild;
uniform vec3 uTone[10];
uniform vec3 uShare;
// Where snow lies: the height it starts at, the height over which it thickens, and the slope it slips off.
uniform vec3 uSnow;
// The water near the eye, seen from above (docs/plans/RENDERING.md, step 2): its level times how much of a place it
// covers, and how much, blurred so that both reach its banks; the box it covers; and whether it is drawn at all.
uniform highp sampler2D uWaterMap;
uniform vec4 uWaterBox;
uniform float uBanks;
// What lies under the trees: 0 broad leaves, 1 needles, as the scene's canopy has them; and whether the ground close by
// is covered by clumps of low plants, which then take the place of the ground's own colour for them.
uniform float uLitter;
uniform float uClumps;
uniform vec4 uGrid[3];
uniform vec2 uGridSize[3];
out vec4 o;
${LIGHTING}
float gridWeight(int k, vec2 p) {
  vec2 lo = p - uGrid[k].xy;
  vec2 hi = uGrid[k].xy + (uGridSize[k] - 1.0) * uGrid[k].z - p;
  float d = min(min(lo.x, lo.y), min(hi.x, hi.y));
  return smoothstep(0.0, 1.0, d / uGrid[k].w);
}
vec2 gridUv(int k, vec2 p) { return ((p - uGrid[k].xy) / uGrid[k].z + 0.5) / uGridSize[k]; }
float shoreHeight;
vec3 normalAt(vec2 p) {
  vec3 t = texture(uNormal2, gridUv(2, p)).rgb;
  float w1 = gridWeight(1, p);
  if (w1 > 0.0) t = mix(t, texture(uNormal1, gridUv(1, p)).rgb, w1);
  float w0 = gridWeight(0, p);
  if (w0 > 0.0) t = mix(t, texture(uNormal0, gridUv(0, p)).rgb, w0);
  // The blue channel is the height near the shore, filtered, so the coast is smooth at any cell size.
  shoreHeight = (t.b * 255.0 - 127.5) / 0.4;
  vec2 n = t.rg * 2.0 - 1.0;
  return normalize(vec3(n, sqrt(max(0.02, 1.0 - dot(n, n)))));
}
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
// Fields and woods, seen from the air: a patchwork of plots whose size and tone are chosen by cell.
vec3 countryside(vec3 p, vec3 n, float dist) {
  float slope = 1.0 - n.z;
  float z = p.z;
  vec2 warped = p.xy + vec2(noiseM(p, 120.0), noiseM(p + 91.0, 120.0)) * 110.0;
  vec2 cell = floor(warped / 170.0);
  vec2 f = warped / 170.0 - cell;
  float h = hash(cell);
  vec3 wheat = mix(vec3(0.52, 0.45, 0.25), vec3(0.42, 0.38, 0.19), hash(cell + 2.0));
  vec3 pasture = mix(vec3(0.24, 0.29, 0.13), vec3(0.33, 0.33, 0.16), hash(cell + 5.0));
  vec3 olive = vec3(0.21, 0.25, 0.14);
  vec3 fallow = vec3(0.40, 0.33, 0.24);
  vec3 fieldC = h < 0.34 ? wheat : h < 0.68 ? pasture : h < 0.88 ? olive : fallow;
  float vis = 1.0 - smoothstep(900.0, 9000.0, dist);
  // From far off the plots melt into broad tones: paler plains, greener high ground.
  vec3 broad = mix(vec3(0.34, 0.33, 0.19), vec3(0.20, 0.26, 0.12), smoothstep(0.34, 0.66, fbmM(p, 900.0)));
  broad = mix(broad, vec3(0.13, 0.19, 0.09), smoothstep(160.0, 800.0, z));
  vec3 near = mix(broad, fieldC, vis);
  // Furrows, faint, and gone before they could be seen as stripes from the air.
  float fur = smoothstep(4.0, 30.0, dist) * (1.0 - smoothstep(60.0, 420.0, dist));
  near *= 1.0 - 0.05 * fur * smoothstep(0.25, 0.75, abs(fract((h > 0.5 ? f.x : f.y) * 34.0) - 0.5) * 2.0);
  near *= mix(1.0, 0.84 + 0.16 * smoothstep(0.0, 0.03, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y))), vis);
  // Woods on the slopes and the higher ground.
  float wood = smoothstep(0.03, 0.12, slope + noiseM(p, 26.0) * 0.1) * smoothstep(40.0, 150.0, z + noiseM(p, 16.0) * 170.0);
  wood = max(wood, smoothstep(0.6, 0.72, fbmM(p, 28.0)));
  vec3 forest = mix(vec3(0.06, 0.10, 0.045), vec3(0.11, 0.16, 0.065), noiseM(p, 3.0));
  vec3 c = mix(near, forest, wood);
  // Rock and scree higher up, snow on the highest.
  c = mix(c, vec3(0.36, 0.33, 0.29), smoothstep(1100.0, 1900.0, z));
  c = mix(c, vec3(0.90, 0.92, 0.95), smoothstep(2300.0, 2700.0, z));
  c = mix(c, vec3(0.38, 0.35, 0.30), smoothstep(0.3, 0.55, slope));
  return c * (0.82 + 0.36 * fbmM(p, 60.0));
}
// People's fields: plots as the scene's field system shapes them, each its own crop or fallow, with furrows close by;
// flooded within their banks where they are paddies. The colours are the renderer's, and nobody's record.
vec3 plots(vec3 p, float dist, float paddy) {
  float side = max(8.0, uFieldStyle.x);
  float aspect = max(1.0, uFieldStyle.y);
  float kind = uFieldStyle.z;
  // Kinds: 1 strips, 2 irregular, 4 paddies, 5 basins, 7 swidden; the rest as blocks.
  float warp = kind > 1.5 && kind < 2.5 || kind > 6.5 && kind < 7.5 ? 0.55 : 0.18;
  vec2 q = p.xy + vec2(noiseM(p, side * 1.7), noiseM(p + 61.0, side * 1.7)) * side * warp;
  vec2 size = vec2(side / sqrt(aspect), side * sqrt(aspect));
  vec2 cell = floor(q / size);
  vec2 f = q / size - cell;
  float h = hash(cell);
  vec3 ripe = mix(vec3(0.50, 0.42, 0.21), vec3(0.42, 0.36, 0.17), hash(cell + 3.0));
  vec3 green = mix(vec3(0.20, 0.27, 0.10), vec3(0.28, 0.32, 0.13), hash(cell + 7.0));
  vec3 ploughed = mix(vec3(0.33, 0.25, 0.17), vec3(0.28, 0.21, 0.15), hash(cell + 9.0));
  vec3 fallow = vec3(0.32, 0.32, 0.19);
  vec3 c = h < 0.4 ? ripe : h < 0.72 ? green : h < 0.88 ? ploughed : fallow;
  if (kind > 6.5 && kind < 7.5) c = h < 0.5 ? mix(ploughed, vec3(0.12, 0.10, 0.08), 0.4) : green;
  float vis = 1.0 - smoothstep(800.0, 9000.0, dist);
  float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * min(size.x, size.y);
  // A balk or a bank between plots, darker, seen until the plots melt together.
  c *= mix(1.0, 0.78 + 0.22 * smoothstep(0.4, 1.6, edge), vis);
  float fur = (1.0 - smoothstep(60.0, 420.0, dist)) * smoothstep(3.0, 24.0, dist);
  c *= 1.0 - 0.07 * fur * smoothstep(0.25, 0.75, abs(fract(f.y * size.y / 1.3) - 0.5) * 2.0);
  // Water stands in a paddy within its banks, and shows the sky.
  float wet = paddy * smoothstep(0.4, 1.4, edge);
  c = mix(c, vec3(0.16, 0.22, 0.24), wet * 0.75);
  return c;
}
// How much of the ground at a point people made: fields, pasture and yards, all generated.
float peopledShare(vec3 p) {
  if (uFieldStyle.w < 0.5) return 0.0;
  vec2 fuv = (p.xy - uFieldsBox.xy) / uFieldsBox.zw;
  if (fuv.x <= 0.0 || fuv.y <= 0.0 || fuv.x >= 1.0 || fuv.y >= 1.0) return 0.0;
  vec4 f = texture(uFields, fuv);
  return max(f.r, max(f.g * 0.75, f.b));
}
vec3 peopled(vec3 c, vec3 p, float dist) {
  if (uFieldStyle.w < 0.5) return c;
  vec2 fuv = (p.xy - uFieldsBox.xy) / uFieldsBox.zw;
  if (fuv.x <= 0.0 || fuv.y <= 0.0 || fuv.x >= 1.0 || fuv.y >= 1.0) return c;
  vec4 f = texture(uFields, fuv);
  vec3 grazed = mix(vec3(0.30, 0.31, 0.15), vec3(0.37, 0.35, 0.19), noiseM(p, 30.0));
  c = mix(c, grazed, f.g * 0.75);
  c = mix(c, plots(p, dist, f.a), f.r);
  vec3 trodden = mix(vec3(0.40, 0.34, 0.25), vec3(0.47, 0.41, 0.31), noiseM(p, 6.0));
  return mix(c, trodden, f.b * 0.85);
}
// Bump by a height, from its derivatives across the screen (Mikkelsen 2010): a detail normal with no texture of its own.
vec3 bumped(vec3 n, vec3 p, float h, float strength) {
  vec3 dpdx = dFdx(p);
  vec3 dpdy = dFdy(p);
  vec3 r1 = cross(dpdy, n);
  vec3 r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - strength * grad);
}
// How near the water a point is, and how far above its level: from the water seen from above, blurred to its banks.
float nearWater(vec3 p, out float above) {
  above = 1e4;
  if (uBanks < 0.5) return 0.0;
  vec2 wuv = (p.xy - uWaterBox.xy) / uWaterBox.zw;
  if (wuv.x <= 0.0 || wuv.y <= 0.0 || wuv.x >= 1.0 || wuv.y >= 1.0) return 0.0;
  vec2 w = texture(uWaterMap, wuv).rg;
  if (w.g < 0.002) return 0.0;
  above = p.z - w.r / w.g;
  vec2 e = min(wuv, 1.0 - wuv);
  return smoothstep(0.002, 0.05, w.g) * smoothstep(0.0, 0.05, min(e.x, e.y));
}
// The ground close by (docs/plans/RENDERING.md, step 2): soil, litter, mud, sand, gravel and rock, each its own colour,
// roughness and grain, blended by the cover, the slope and the wet, and by height, so that sand fills the hollows and rock
// stands out of them; banks wet and darker as far up as the water rises, with mud and sand on their gentler slopes. Their
// colours are the renderer's, and nobody's record. Gives the ground's colour, how rough it is, and its detail normal.
vec3 groundClose(vec3 c, vec3 p, vec3 n, float dist, vec4 mask, float slope, out float rough, out vec3 nd) {
  rough = 0.92;
  nd = n;
  float close = 1.0 - smoothstep(70.0, 260.0, dist);
  float aboveWater;
  float water = nearWater(p, aboveWater);
  // Wet within the water's rise of its level; the bars of its channel where the bank is gentle.
  float wet = water * smoothstep(1.3, 0.1, aboveWater);
  float bar = water * smoothstep(0.16, 0.04, slope) * smoothstep(2.2, 0.2, aboveWater);
  if (close <= 0.0) return mix(c, c * 0.62, wet * 0.8);
  vec3 soil = mix(uTone[0], uTone[1], fbmM(p, 2.4)) * (0.75 + 0.5 * noiseM(p, 0.2));
  vec3 needles = mix(vec3(0.20, 0.11, 0.05), vec3(0.29, 0.17, 0.08), noiseM(p, 0.05));
  vec3 fallen = mix(vec3(0.17, 0.12, 0.06), vec3(0.30, 0.22, 0.10), noiseM(p, 0.09));
  vec3 litter = mix(fallen, needles, uLitter) * (0.7 + 0.5 * noiseM(p + 7.0, 0.03));
  vec3 mud = mix(uTone[0], uTone[1], 0.3) * vec3(0.62, 0.6, 0.58);
  // Sand: mottled, with a fine grain; and close by its ripples, crests across the wind a hand's breadth apart, wavering,
  // gone before a pixel is too coarse to hold them.
  vec2 wind = normalize(uWind + vec2(1e-4, 0.0));
  float ripple = (abs(fract(dot(p.xy, wind) / 0.25 + fbmM(p, 0.6) * 3.0) - 0.5) * 4.0 - 1.0) * (1.0 - smoothstep(3.0, 9.0, dist));
  vec3 sand = mix(uTone[4], uTone[5], noiseM(p, 0.5)) * (0.88 + 0.2 * noiseM(p, 0.04) + 0.05 * ripple);
  vec3 gravel = mix(vec3(0.30, 0.28, 0.25), mix(uTone[4], uTone[5], 0.5), noiseM(p, 0.04)) * (0.6 + 0.7 * noiseM(p + 2.0, 0.025));
  vec3 rock = vec3(0.36, 0.33, 0.28) * (0.72 + 0.5 * fbmM(p, 0.6));
  // Each one's height, and how much of it there is here.
  float hSoil = fbmM(p, 0.3);
  float hLitter = noiseM(p, 0.07) * 0.6 + noiseM(p + 3.0, 0.22) * 0.4;
  float hMud = noiseM(p, 0.5) * 0.7;
  float hSand = fbmM(p, 0.45) * 0.8 + ripple * 0.12;
  float hGravel = noiseM(p, 0.035);
  float hRock = fbmM(p, 0.8) + 0.2;
  float wRock = smoothstep(0.2, 0.42, slope);
  float wMud = max(wet * (1.0 - wRock), bar * smoothstep(0.5, 0.1, aboveWater));
  float wSand = max(mask.b * (1.0 - wet) * (1.0 - wRock), bar * smoothstep(0.1, 0.6, aboveWater));
  float wGravel = mask.b * smoothstep(0.06, 0.2, slope) * 0.8;
  float wLitter = mask.r * (1.0 - wet);
  float wSoil = 0.45;
  float s0 = hSoil + wSoil;
  float s1 = hLitter + wLitter * 1.2;
  float s2 = hMud + wMud * 1.4;
  float s3 = hSand + wSand * 1.3;
  float s4 = hGravel + wGravel * 1.2;
  float s5 = hRock + wRock * 1.5;
  float top = max(max(max(s0, s1), max(s2, s3)), max(s4, s5)) - 0.18;
  float b0 = max(s0 - top, 0.0);
  float b1 = max(s1 - top, 0.0);
  float b2 = max(s2 - top, 0.0);
  float b3 = max(s3 - top, 0.0);
  float b4 = max(s4 - top, 0.0);
  float b5 = max(s5 - top, 0.0);
  float sum = b0 + b1 + b2 + b3 + b4 + b5 + 1e-4;
  vec3 g = (soil * b0 + litter * b1 + mud * b2 + sand * b3 + gravel * b4 + rock * b5) / sum;
  float h = (hSoil * b0 + hLitter * b1 + hMud * b2 * 0.3 + hSand * b3 * 0.5 + hGravel * b4 + hRock * b5) / sum;
  float r = (0.95 * b0 + 0.9 * b1 + 0.45 * b2 + 0.9 * b3 + 0.85 * b4 + 0.8 * b5) / sum;
  // Low plants: where clumps of them stand close by, the ground between them shows; further off, their colour.
  float herb = mask.g * (1.0 - uClumps * 0.3 * (1.0 - smoothstep(40.0, 72.0, dist)));
  vec3 near = mix(g, c, herb * 0.92);
  // Wet ground is darker and smoother.
  near *= 1.0 - 0.38 * wet;
  rough = mix(r, 0.35, wet * 0.8);
  // Grain: the height bumps the light, while it can be seen.
  nd = bumped(n, p, h, 0.05 * (1.0 - smoothstep(8.0, 60.0, dist)));
  return mix(mix(c, c * 0.62, wet * 0.8), near, close);
}
// Land nobody has farmed. The mask says what covers it: R canopy, G low plants, B bare sediment, A water.
// Its colours and shares are the place's climate's: soil, low plants, bare ground, canopy and low plants from afar, each from one tone to another.
vec3 wilderness(vec3 p, vec3 n, float dist, out float water, out float rough, out vec3 nd, out float shaded) {
  vec2 muv = (p.xy - uMaskBox.xy) / uMaskBox.zw;
  float inside = step(0.0, muv.x) * step(0.0, muv.y) * step(muv.x, 1.0) * step(muv.y, 1.0);
  // Beyond the plan's map, forest and glade by noise of about the same size, growing with distance so
  // that it never shows as a repeating grain from high up.
  float away = smoothstep(30000.0, 400000.0, dist);
  float patchy = smoothstep(0.42, 0.54, mix(fbmM(p, 110.0), fbmM(p, 5000.0), away)) * uShare.x;
  // And from high up it melts into one tone.
  float melt = smoothstep(60000.0, 500000.0, dist);
  vec4 beyond = mix(vec4(patchy, (1.0 - patchy) * (1.0 - uShare.z), uShare.z, 0.0), vec4(0.6 * uShare.x, (1.0 - 0.6 * uShare.x) * (1.0 - uShare.z), uShare.z, 0.0), melt);
  vec4 mask = beyond;
  if (inside > 0.5) {
    vec2 e = min(muv, 1.0 - muv);
    mask = mix(beyond, texture(uMask, muv), smoothstep(0.0, 0.1, min(e.x, e.y)));
  }
  water = mask.a * smoothstep(450.0, 1000.0, dist);
  shaded = mask.r;
  float slope = 1.0 - n.z;
  float nearby = 1.0 - smoothstep(40.0, 600.0, dist);
  // Leaf litter under the trees, and earth.
  vec3 soil = mix(uTone[0], uTone[1], fbmM(p, 2.4));
  soil = mix(soil, soil * (0.68 + 0.64 * noiseM(p, 0.16)), nearby);
  // Low plants in patches with bare earth between. What they are is not said: no grass, until grass has spread.
  vec3 herb = mix(uTone[2], uTone[3], fbmM(p, 1.1));
  herb = mix(herb, herb * (0.5 + 1.0 * noiseM(p, 0.09)), nearby);
  float thin = smoothstep(0.42, 0.62, fbmM(p, 2.6) * 0.6 + noiseM(p, 0.6) * 0.4);
  herb = mix(herb, soil, thin * 0.8);
  vec3 bare = mix(uTone[4], uTone[5], fbmM(p, 3.0));
  bare = mix(bare, bare * (0.8 + 0.4 * noiseM(p, 0.06)), nearby);
  vec3 under = mix(soil, herb, (0.35 + 0.65 * smoothstep(0.34, 0.6, fbmM(p, 9.0))) * uShare.y);
  vec3 c = mix(under, herb, mask.g);
  c = mix(c, bare, mask.b);
  // From afar the canopy hides all that, and at the plain's edge no trees are drawn at all.
  float grain = 1.0 - smoothstep(3000.0, 40000.0, dist);
  vec3 canopy = mix(uTone[6], uTone[7], mix(0.5, fbmM(p, 55.0), grain)) * mix(1.0, 0.8 + 0.4 * noiseM(p, 7.0), grain);
  // In the trees' reach the ground shows between them close by, and the canopy further off; beyond it there is only canopy.
  float far = max(smoothstep(500.0, 2400.0, dist), 1.0 - inside);
  c = mix(c, canopy, mask.r * far);
  vec3 distantHerb = mix(uTone[8], uTone[9], mix(0.5, fbmM(p, 90.0), grain));
  c = mix(c, distantHerb, mask.g * smoothstep(900.0, 5000.0, dist));
  // Close by, what the ground is made of, and its banks.
  c = groundClose(c, p, n, dist, mask, slope, rough, nd);
  // What people made of it, where the scene has people.
  c = peopled(c, p, dist);
  // Rock on the steep slopes, and snow where the month's climate lays it, off the steepest.
  c = mix(c, vec3(0.36, 0.33, 0.28), smoothstep(0.28, 0.5, slope));
  float snow = smoothstep(uSnow.x, uSnow.x + uSnow.y, p.z + (fbmM(p, 400.0) - 0.5) * uSnow.y) * (1.0 - smoothstep(uSnow.z - 0.1, uSnow.z + 0.1, slope));
  c = mix(c, vec3(0.86, 0.88, 0.9), snow);
  return c;
}
// The floor of a sea: sand in the shallows and on the beach, mud further down, the grey ooze of the deep, and rock where
// it is steep. Its colours are the renderer's, and nobody's record.
vec3 seabed(vec3 p, vec3 n, float dist) {
  float depth = max(-p.z, 0.0);
  float nearby = 1.0 - smoothstep(25.0, 400.0, dist);
  vec3 sand = mix(vec3(0.50, 0.45, 0.34), vec3(0.66, 0.60, 0.47), fbmM(p, 2.2));
  // Ripples where the waves still stir the sand, seen close by.
  float ripple = abs(fract(dot(p.xy, vec2(0.83, 0.56)) / 0.8 + fbmM(p, 2.5) * 2.0) - 0.5) * 2.0;
  sand *= mix(1.0, 0.84 + 0.22 * ripple, nearby * (1.0 - smoothstep(8.0, 30.0, depth)));
  vec3 mud = mix(vec3(0.26, 0.24, 0.19), vec3(0.36, 0.33, 0.26), fbmM(p, 6.0));
  vec3 ooze = mix(vec3(0.20, 0.20, 0.19), vec3(0.28, 0.27, 0.25), fbmM(p, 40.0));
  float muddy = smoothstep(20.0, 140.0, depth + (fbmM(p, 160.0) - 0.5) * 90.0);
  vec3 c = mix(mix(sand, mud, muddy), ooze, smoothstep(300.0, 2500.0, depth));
  // Shell and gravel in patches, and stones close by.
  c *= 0.9 + 0.2 * (fbmM(p, 14.0) - 0.5) + 0.22 * (noiseM(p, 0.3) - 0.5) * nearby;
  return mix(c, vec3(0.27, 0.26, 0.24) * (0.8 + 0.4 * fbmM(p, 4.0)), smoothstep(0.25, 0.5, 1.0 - n.z));
}
void main() {
  if (vPos.x > uInner.x && vPos.y > uInner.y && vPos.x < uInner.z && vPos.y < uInner.w) discard;
  vec3 p = vPos;
  vec3 n = normalAt(p.xy);
  float dist = distance(p, uEye);
  float fw = dist * 0.0016;
  // Far off, the shadow map is too coarse to trust: the hills' own shading does the work.
  float sh = mix(shadowAt(p, n, fw), 1.0, smoothstep(9000.0, 22000.0, dist)) * cloudShade(p);
  float ao = uUseAO > 0.5 ? texture(uAO, gl_FragCoord.xy / uAOSize).r : 1.0;
  // The sea: anywhere the ground lies under its surface. A scene of the sea draws its floor instead, and its surface apart.
  if (uSea < 0.5 && shoreHeight <= 0.0) {
    float deep = smoothstep(-5.0, -120.0, p.z);
    vec3 water = mix(vec3(0.06, 0.20, 0.22), vec3(0.015, 0.06, 0.13), deep);
    vec3 wob = vec3(noiseM(p, 8.0) - 0.5, noiseM(p + 9.0, 8.0) - 0.5, 4.0);
    vec3 wn = normalize(vec3(0.0, 0.0, 1.0) + wob * 0.05);
    vec3 c = shade(water, 0.12, 0.0, wn, p, uEye, 1.0, 1.0);
    o = vec4(aerial(c, vec3(p.xy, 0.0), uEye), 1.0);
    return;
  }
  float river = 0.0;
  float rough = 0.92;
  vec3 nd = n;
  float canopy = 0.0;
  vec3 c = uWild > 0.5 ? wilderness(p, n, dist, river, rough, nd, canopy) : countryside(p, n, dist);
  // Inside the city's map: what the plan says this ground is.
  vec2 muv = (p.xy - uMaskBox.xy) / uMaskBox.zw;
  if (uWild < 0.5 && muv.x > 0.0 && muv.y > 0.0 && muv.x < 1.0 && muv.y < 1.0) {
    vec4 mask = texture(uMask, muv);
    // From far off the river's bed is narrower than the terrain's cells, so its water is painted on.
    river = mask.a * smoothstep(450.0, 1000.0, dist);
    // R built-up ground, G garden.
    float detail = 1.0 - smoothstep(10.0, 400.0, dist);
    float dust = fbmM(p, 5.0);
    vec3 urban = mix(vec3(0.27, 0.24, 0.19), vec3(0.38, 0.33, 0.25), dust);
    urban *= 0.86 + 0.28 * fbmM(p, 0.8);
    // Beaten earth, and worn cobbles in patches of it, up close.
    float cobbled = (1.0 - smoothstep(12.0, 110.0, dist)) * smoothstep(0.42, 0.6, fbmM(p, 1.6));
    if (cobbled > 0.0) {
      vec2 q = p.xy * 2.8;
      vec2 g = floor(q);
      vec2 f = q - g;
      float d1 = 8.0;
      float d2 = 8.0;
      float id = 0.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 o = vec2(float(i), float(j));
        vec2 r = o + vec2(hash(g + o), hash(g + o + 17.3)) - f;
        float e = dot(r, r);
        if (e < d1) { d2 = d1; d1 = e; id = hash(g + o + 3.1); }
        else if (e < d2) d2 = e;
      }
      vec3 stone = mix(vec3(0.24, 0.22, 0.20), vec3(0.40, 0.36, 0.30), id);
      urban = mix(urban, mix(urban * 0.62, stone, smoothstep(0.03, 0.16, sqrt(d2) - sqrt(d1))), cobbled);
    }
    c = mix(c, urban, mask.r);
    // Paved precincts around the monuments: travertine slabs, worn and stained.
    if (mask.b > 0.01) {
      vec2 sl = p.xy / vec2(1.8, 1.05);
      float row = floor(sl.y);
      vec2 cell = vec2(floor(sl.x + mod(row, 2.0) * 0.5), row);
      vec2 f = vec2(fract(sl.x + mod(row, 2.0) * 0.5), fract(sl.y));
      float jv = 1.0 - smoothstep(15.0, 120.0, dist);
      vec3 slab = mix(vec3(0.46, 0.43, 0.37), vec3(0.58, 0.55, 0.48), hash(cell)) * (0.84 + 0.3 * fbmM(p, 6.0));
      slab *= mix(1.0, 0.68 + 0.32 * smoothstep(0.0, 0.025, min(min(f.x, 1.0 - f.x) * 1.8, min(f.y, 1.0 - f.y) * 1.05)), jv);
      c = mix(c, slab, smoothstep(0.35, 0.65, mask.b));
    }
    vec3 garden = mix(vec3(0.12, 0.19, 0.06), vec3(0.24, 0.28, 0.10), fbmM(p, 4.0)) * (0.82 + 0.36 * noiseM(p, 0.4));
    c = mix(c, garden, mask.g);
  }
  // Wet, darker ground at the river's edge; where the water is mapped from above, its banks are the close ground's.
  if (uWild > 0.5 && uBanks < 0.5) c = mix(c, vec3(0.15, 0.125, 0.085), smoothstep(uWater + 0.7, uWater + 0.05, p.z) * smoothstep(uWater - 9.0, uWater - 5.0, p.z) * (1.0 - smoothstep(16000.0, 18000.0, length(p.xy))) * 0.9);
  else if (uWild < 0.5) c = mix(c, vec3(0.28, 0.25, 0.18), smoothstep(uWater + 4.0, uWater + 1.0, p.z) * 0.8);
  // In a scene of the sea, its floor under the water, and a beach at the water's edge; no river is painted on it.
  if (uSea > 0.5) {
    float sunk = smoothstep(1.4, -0.4, p.z);
    c = mix(c, seabed(p, n, dist), sunk);
    river *= 1.0 - sunk;
  }
  // Under the canopy, the crowns take most of the sky's light, as their shadows take the sun's: a forest floor is dim, and a
  // glade bright (docs/plans/RENDERING.md, step 4). From far off the canopy is all that is seen of it.
  float floorShade = 1.0 - 0.72 * canopy * (1.0 - smoothstep(500.0, 2400.0, dist));
  vec3 lit = shade(c, rough, 0.0, nd, p, uEye, ao * floorShade, sh);
  if (river > 0.0) lit = mix(lit, shade(vec3(0.145, 0.15, 0.085), 0.14, 0.0, vec3(0.0, 0.0, 1.0), p, uEye, 1.0, sh), river);
  lit = seen(lit, p, uEye);
  if (uEvidence > 0.5) {
    float hatch = step(0.62, fract((gl_FragCoord.x + gl_FragCoord.y) / 9.0));
    // The ground is a reconstruction, amber; people's fields, pastures and yards on it were generated, magenta.
    vec3 tint2 = mix(vec3(0.95, 0.65, 0.18), vec3(0.92, 0.25, 0.75), smoothstep(0.2, 0.6, peopledShare(p)));
    lit = mix(lit, tint2 * 1.1, 0.08 + 0.18 * hatch);
  }
  o = vec4(lit, 1.0);
}`;

export const WATER_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
// Where it flows: its velocity, m/s, and its depth, m.
layout(location = 1) in vec3 aFlow;
uniform mat4 uViewProj;
uniform vec3 uEye;
// How far toward the eye the water is drawn, as a share of its distance.
uniform float uWaterBias;
${DROP}
out vec3 vPos;
out vec3 vFlow;
void main() {
  vPos = aPos;
  vFlow = aFlow;
  // A little toward the eye: where the ground's coarser rings cannot follow a channel, between their corners the ground
  // stands above the water, and the water is still seen in its channel, out to its banks.
  vec3 q = (vec3(aPos.xy, aPos.z - drop(aPos.xy)) - uEye) * (1.0 - uWaterBias);
  gl_Position = uViewProj * vec4(q, 1.0);
}`;

export const WATER_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;
precision highp sampler2DArrayShadow;
in vec3 vPos;
in vec3 vFlow;
uniform vec3 uEye;
uniform highp sampler2D uAO;
uniform vec2 uAOSize;
// The shallows' colour, then the depths', where a scene gives them.
uniform float uWaterTone[6];
uniform float uToned;
// What is drawn so far, resolved, and its depth, for the water to be seen through and to reflect (docs/plans/RENDERING.md,
// step 3); 1 where they are given, as on the fuller way to draw. And how the frame was projected.
uniform highp sampler2D uScene;
uniform highp sampler2D uSceneDepth;
uniform float uScreen;
uniform mat4 uViewProj;
uniform vec2 uNearFar;
uniform vec2 uViewport;
// Seconds of the visit: what moves, moves by it.
uniform float uClock;
out vec4 o;
${LIGHTING}
float linearDepth(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * uNearFar.x * uNearFar.y / (uNearFar.y + uNearFar.x - z * (uNearFar.y - uNearFar.x));
}
// Where a point is on the screen, and how far in front of the eye.
vec3 onScreen(vec3 q) {
  vec4 c = uViewProj * vec4(vec3(q.xy, q.z - drop(q.xy)) - uEye, 1.0);
  return vec3(c.xy / c.w * 0.5 + 0.5, c.w);
}
// What the water reflects along r from p, as far as what is drawn shows it: marched across the screen against its
// depth, and found to within a step. Its weight is 0 where nothing is found, and fades towards the screen's edges.
vec4 reflected(vec3 p, vec3 r) {
  float t = 0.4;
  float last = 0.0;
  for (int i = 0; i < 32; i++) {
    vec3 s = onScreen(p + r * t);
    if (s.z <= 0.0 || s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0) break;
    float raw = texture(uSceneDepth, s.xy).r;
    float scene = linearDepth(raw);
    if (raw < 1.0 && s.z > scene && s.z - scene < max(0.8, t * 0.12)) {
      // Halve the step back to where the ray first passes behind what is drawn.
      float a = last;
      float b = t;
      for (int k = 0; k < 5; k++) {
        float m = (a + b) * 0.5;
        vec3 q = onScreen(p + r * m);
        if (q.z > linearDepth(texture(uSceneDepth, q.xy).r)) b = m;
        else a = m;
      }
      vec3 h = onScreen(p + r * b);
      vec2 e = min(h.xy, 1.0 - h.xy);
      float w = smoothstep(0.0, 0.08, min(e.x, e.y)) * (1.0 - smoothstep(0.6, 1.0, float(i) / 32.0));
      return vec4(texture(uScene, h.xy).rgb, w);
    }
    last = t;
    t = t * 1.16 + 0.35;
  }
  return vec4(0.0);
}
void main() {
  vec3 p = vPos;
  float dist = distance(p, uEye);
  // Ripples, stilled with distance, before they could break up into glitter; drawn out along the current where it flows,
  // and carried along by it, faster in the channel than at its edges; still water stays still.
  float speed = length(vFlow.xy);
  vec2 along = speed > 0.01 ? vFlow.xy / speed : vec2(1.0, 0.0);
  vec2 q = vec2(dot(p.xy, along), dot(p.xy, vec2(-along.y, along.x)));
  float stretch = 1.0 + 2.5 * smoothstep(0.05, 1.5, speed);
  q.x /= stretch;
  float amp = mix(0.05, 0.004, smoothstep(15.0, 320.0, dist)) * (1.0 + 0.8 * smoothstep(0.05, 2.0, speed));
  // Two layers of ripples carried by the current, each over a cycle of its own, blended so that neither is seen to stretch.
  float cycle = 6.0;
  float ph0 = fract(uClock / cycle);
  float ph1 = fract(uClock / cycle + 0.5);
  float carry = speed / stretch;
  vec2 dq = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    float ph = k == 0 ? ph0 : ph1;
    float w = 1.0 - abs(ph * 2.0 - 1.0);
    vec2 qk = q - vec2(carry * ph * cycle, 0.0) + float(k) * vec2(17.3, 5.1);
    vec3 d1 = vec3(texture(uNoise, vec3(qk / 96.0, 0.2)).r, texture(uNoise, vec3(qk / 96.0, 0.7)).g, 0.5) - 0.5;
    vec3 d2 = vec3(texture(uNoise, vec3(qk / 19.0, 0.4)).b, texture(uNoise, vec3(qk / 19.0, 0.9)).r, 0.5) - 0.5;
    dq += (d1.xy + d2.xy * 0.6) * w;
  }
  dq *= amp * 3.0 * (speed > 0.01 ? 1.0 : 0.85);
  vec3 n = normalize(vec3(along * dq.x + vec2(-along.y, along.x) * dq.y, 1.0));
  vec3 v = normalize(uEye - p);
  float sh = shadowAt(p, vec3(0.0, 0.0, 1.0), dist * 0.002);
  vec3 r = reflect(-v, n);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  // The Tiber is silty: green-brown, not blue. A scene's water is its climate's: lighter in the shallows, darker deep.
  vec3 body = vec3(0.145, 0.15, 0.085);
  if (uToned > 0.5) {
    vec3 shallow = vec3(uWaterTone[0], uWaterTone[1], uWaterTone[2]);
    vec3 deep = vec3(uWaterTone[3], uWaterTone[4], uWaterTone[5]);
    body = mix(shallow, deep, smoothstep(0.3, 3.0, vFlow.z));
  }
  vec3 lit = body * (uSunColor * max(uSun.z, 0.0) * sh * 0.8 + uSkyTop * 0.6);
  vec3 glint = uSunColor * pow(max(dot(r, uSun), 0.0), 360.0) * 1.4 * sh;
  vec3 sky = skyColor(normalize(vec3(r.xy, abs(r.z))));
  if (uScreen < 0.5) {
    o = vec4(aerial(mix(lit, sky, fres * 0.8) + glint, p, uEye), 1.0);
    return;
  }
  // Through the water: its bed, bent a little by the ripples, as far as the water lets it be seen. How much water the
  // eye looks through is the depth drawn behind it, less the water's own, along the view.
  vec2 uv = gl_FragCoord.xy / uViewport;
  float here = onScreen(p).z;
  float behind = linearDepth(texture(uSceneDepth, uv).r);
  vec2 bent = clamp(uv + n.xy * 0.03 * smoothstep(0.0, 2.0, behind - here) / max(1.0, here * 0.02), vec2(0.001), vec2(0.999));
  float behindBent = linearDepth(texture(uSceneDepth, bent).r);
  if (behindBent < here) bent = uv;
  else behind = behindBent;
  float through = max(behind - here, 0.0) * dist / max(here, 1e-3);
  vec3 bed = texture(uScene, bent).rgb;
  // Silt takes the light along the way, the more the darker the water's own colour: what is lost is made up by the
  // water's own light, scattered.
  vec3 k = (vec3(1.0) - clamp(body * 4.5, 0.0, 0.92)) * 0.55 + 0.04;
  vec3 tr = exp(-k * through);
  vec3 under = bed * tr + aerial(lit, p, uEye) * (1.0 - tr);
  // The bank in the water, where what is drawn shows it; the sky beyond.
  vec3 rr = normalize(reflect(-v, normalize(vec3(n.xy * 0.4, 1.0))));
  vec4 bank = rr.z > 0.0 ? reflected(p, rr) : vec4(0.0);
  vec3 mirror = mix(aerial(sky, p, uEye), bank.rgb, bank.a);
  vec3 c = mix(under, mirror, fres * 0.9) + aerial(glint, p, uEye);
  // At its edge the water thins to nothing, and the ground under it is all that shows.
  o = vec4(mix(bed, c, smoothstep(0.0, 0.3, through)), 1.0);
}`;

// ——— The water seen from above, for its banks (docs/plans/RENDERING.md, step 2) ———

/** The water's mesh from straight above, over a box around the eye: its level, and that it is there. */
export const WATERMAP_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
uniform vec4 uBox;
out float vZ;
void main() {
  vZ = aPos.z;
  gl_Position = vec4((aPos.xy - uBox.xy) / uBox.zw * 2.0 - 1.0, 0.0, 1.0);
}`;

export const WATERMAP_FS = /* glsl */ `#version 300 es
precision highp float;
in float vZ;
out vec4 o;
void main() { o = vec4(vZ, 1.0, 0.0, 1.0); }`;

/** A blur of the water's map along one direction, its level weighted by how much water there is, so that both reach the banks. */
export const WATERBLUR_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform highp sampler2D uTex;
uniform vec2 uDir;
out vec4 o;
void main() {
  vec2 sum = vec2(0.0);
  for (int i = -4; i <= 4; i++) {
    float w = exp(-float(i * i) * 0.12);
    vec2 t = texture(uTex, vUv + uDir * float(i)).rg;
    // Premultiplied: a level counts as much as the water it stands for.
    sum += vec2(t.r, t.g) * w;
  }
  o = vec4(sum / 6.43, 0.0, 1.0);
}`;

// ——— The sea's surface, in a scene of the sea ———

/** The terrain's rings, flat at the sea's level, with the depth of the water under each point. */
export const SEA_VS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec2 aGrid;
uniform mat4 uViewProj;
uniform vec3 uEye;
uniform vec2 uCenter;
uniform float uCell;
${DROP}
${GROUND}
out vec3 vPos;
out float vDepth;
void main() {
  // Toward its outer edge a ring's vertices slide onto the next ring's grid, as the terrain's do.
  float edge = max(abs(aGrid.x), abs(aGrid.y));
  float m = clamp((edge - 54.0) / 8.0, 0.0, 1.0);
  vec2 even = floor(aGrid * 0.5 + 0.5) * 2.0;
  vec2 p = uCenter + mix(aGrid, even, m) * uCell;
  vPos = vec3(p, 0.0);
  vDepth = -groundAt(p);
  gl_Position = uViewProj * vec4(vec3(p, -drop(p)) - uEye, 1.0);
}`;

/**
 * The sea's surface over what has been drawn, its colour premultiplied. From above it is the sky and the sun, reflected
 * as much as the angle says, over the floor and the water already drawn under it, and tinted by the depth of the water
 * under it, so that a shelf reads shallow and the open sea deep; from below, the sky through its window overhead and the
 * depths reflected beyond it.
 */
export const SEA_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2DArrayShadow;
in vec3 vPos;
in float vDepth;
uniform vec3 uEye;
uniform vec4 uInner;
// The view's direction, and how far along it the surface starts: what is nearer is the near pass's.
uniform vec3 uForward;
uniform float uFrom;
out vec4 o;
${LIGHTING}
// Waves, as a tilt of the surface: a swell, chop and ripples, stilled with distance before they could break into glitter.
vec3 waves(vec2 p, float dist) {
  vec2 a = vec2(texture(uNoise, vec3(p / 1300.0, 0.21)).r, texture(uNoise, vec3(p / 1300.0, 0.58)).g) - 0.5;
  vec2 b = vec2(texture(uNoise, vec3(p / 300.0, 0.37)).b, texture(uNoise, vec3(p / 300.0, 0.81)).r) - 0.5;
  vec2 c = vec2(texture(uNoise, vec3(p / 70.0, 0.13)).g, texture(uNoise, vec3(p / 70.0, 0.66)).b) - 0.5;
  float amp = mix(0.13, 0.025, smoothstep(40.0, 4000.0, dist));
  return normalize(vec3((a * 0.6 + b + c * 0.7 * (1.0 - smoothstep(20.0, 200.0, dist))) * amp, 1.0));
}
void main() {
  if (vPos.x > uInner.x && vPos.y > uInner.y && vPos.x < uInner.z && vPos.y < uInner.w) discard;
  vec3 v = vec3(vPos.xy - uEye.xy, -drop(vPos.xy) - uEye.z);
  if (dot(v, uForward) < uFrom) discard;
  float d = length(v);
  vec3 dir = v / d;
  vec3 n = waves(vPos.xy, d);
  float he = uEye.z + drop(uEye.xy);
  if (he >= 0.0) {
    // From above: the sky reflected, as much of it as Fresnel's law says for water, and the sun's glitter.
    float cosT = max(dot(n, -dir), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
    vec3 r = reflect(dir, n);
    vec3 sky = min(skyColor(normalize(vec3(r.xy, abs(r.z) + 0.01))), vec3(4.0));
    float sh = shadowAt(vPos, vec3(0.0, 0.0, 1.0), d * 0.002);
    vec3 glint = uSunColor * sunSpecular(n, -dir, mix(0.07, 0.3, smoothstep(60.0, 30000.0, d))) * max(uSun.z, 0.0) * sh;
    // Over a shelf the water sends back more of the light, the shallower the more, so that it reads shallow from above:
    // that light takes its share of what is seen through the surface.
    float shelf = (1.0 - F) * ${SEA.shelfShare.toFixed(3)} * smoothstep(0.0, ${SEA.shallow[0].toFixed(1)}, vDepth) * (1.0 - smoothstep(${SEA.shallow[0].toFixed(1)}, ${SEA.shallow[1].toFixed(1)}, vDepth));
    vec3 glow = ${vec3(SEA.shelf)} * (uSunColor * max(uSun.z, 0.0) * 0.8 + uSkyTop * 0.6);
    // Hazed as anything is: over the air, the light the surface sends and its share of what the air adds.
    vec3 haze = aerial(vec3(0.0), vPos, uEye);
    float a = F + shelf;
    vec3 c = aerial(sky * F + glint + glow * shelf, vPos, uEye) - haze * (1.0 - a);
    // At the water's edge it thins to nothing, so the shore is not a line.
    float shore = smoothstep(0.0, 0.8, vDepth);
    o = vec4(c * shore, a * shore);
    return;
  }
  // From below: within the window over the eye the sky comes through, bent; beyond it the surface is a mirror of the
  // depths. Then the water between it and the eye.
  vec3 depths = waterGlow(reflect(dir, n), 0.0);
  vec3 t = refract(dir, -n, 1.333);
  vec3 c = depths;
  if (dot(t, t) > 0.0) {
    float F = 0.02 + 0.98 * pow(1.0 - max(t.z, 0.0), 5.0);
    vec3 sky = min(skyColor(normalize(vec3(t.xy, max(t.z, 0.01)))), vec3(4.0)) + uSunColor * pow(max(dot(t, uSun), 0.0), 220.0) * 3.0;
    c = mix(sky, depths, F);
  }
  vec3 k = exp(-WATER_K * d);
  o = vec4(c * k + waterGlow(dir, he) * (1.0 - k), 1.0);
}`;

// ——— Sky ———

export const FULLSCREEN_VS = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** One table per sun: the sky seen from the eye's height, by azimuth from the sun and elevation. */
export const SKY_LUT_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uSunLut;
uniform float uHeight;
out vec4 o;
const float R0 = 6371000.0;
const float R1 = 6471000.0;
const vec3 RAY = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const float MIE = 14e-6;
vec2 sphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return vec2(1e12, -1e12);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}
void main() {
  float az = vUv.x * 3.14159265;
  float k = vUv.y * 2.0 - 1.0;
  float el = sign(k) * k * k * 1.5708;
  // Sun along +x, in the table's frame.
  vec3 s = uSunLut;
  vec3 d = vec3(cos(el) * cos(az), cos(el) * sin(az), sin(el));
  vec3 ro = vec3(0.0, 0.0, R0 + uHeight);
  vec2 hit = sphere(ro, d, R1);
  vec2 g = sphere(ro, d, R0);
  float t1 = hit.y;
  if (g.x > 0.0) t1 = min(t1, g.x);
  float dt = t1 / 18.0;
  vec3 ray = vec3(0.0);
  vec3 mie = vec3(0.0);
  float odR = 0.0;
  float odM = 0.0;
  for (int i = 0; i < 18; i++) {
    vec3 p = ro + d * (float(i) + 0.5) * dt;
    float h = length(p) - R0;
    float dR = exp(-h / 8000.0) * dt;
    float dM = exp(-h / 1500.0) * dt;
    odR += dR;
    odM += dM;
    vec2 ls = sphere(p, s, R1);
    vec2 lg = sphere(p, s, R0);
    if (lg.x > 0.0) continue;
    float dl = ls.y / 8.0;
    float lR = 0.0;
    float lM = 0.0;
    for (int j = 0; j < 8; j++) {
      vec3 q = p + s * (float(j) + 0.5) * dl;
      float hq = length(q) - R0;
      lR += exp(-hq / 8000.0) * dl;
      lM += exp(-hq / 1500.0) * dl;
    }
    vec3 tr = exp(-(RAY * (odR + lR) + MIE * 1.1 * (odM + lM)));
    ray += tr * dR;
    mie += tr * dM;
  }
  float mu = dot(d, s);
  float pr = 3.0 / (16.0 * 3.14159265) * (1.0 + mu * mu);
  float g2 = 0.76 * 0.76;
  float pm = 3.0 / (8.0 * 3.14159265) * (1.0 - g2) * (1.0 + mu * mu) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * 0.76 * mu, 1.5));
  vec3 c = 18.0 * (ray * RAY * pr + mie * MIE * pm);
  o = vec4(c, 1.0);
}`;

export const SKY_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
uniform mat4 uInvViewProj;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform highp sampler2D uSkyLut;
uniform highp sampler3D uNoise;
uniform float uHeight;
uniform float uAlpha;
// In a scene of the sea, the eye's height above it; and the light the water's colour is made from.
uniform float uEyeSea;
uniform vec3 uSkyTop;
${SEA_LIGHT}
${CLOUDS}
out vec4 o;
vec3 skyColor(vec3 d) {
  float az = acos(clamp(dot(normalize(d.xy + 1e-5), normalize(uSun.xy + 1e-5)), -1.0, 1.0)) / 3.14159265;
  float el = asin(clamp(d.z, -1.0, 1.0));
  float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / 1.5708);
  return texture(uSkyLut, vec2(az, v)).rgb;
}
// The lighter way's clouds: flat, on a layer high above, soft-edged, on a broad pattern that thins out in places.
float flatClouds(vec2 p) {
  float broad = texture(uNoise, vec3(p * 0.11, 0.3)).g;
  float n = texture(uNoise, vec3(p * 0.42, 0.15)).r * 0.5 + texture(uNoise, vec3(p * 1.1, 0.45)).g * 0.3 + texture(uNoise, vec3(p * 2.7, 0.75)).b * 0.2;
  return smoothstep(0.5, 0.74, n + (broad - 0.5) * 0.3);
}
void main() {
  vec4 a = uInvViewProj * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec4 b = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize(b.xyz / b.w - a.xyz / a.w);
  // Under the sea, all there is beyond what is drawn is the water.
  if (uSea > 0.5 && uEyeSea < 0.0) {
    o = vec4(waterGlow(d, uEyeSea), 1.0);
    return;
  }
  vec3 c = skyColor(d);
  // The sun's disc, and its glare in the haze.
  float sd = dot(d, uSun);
  c += uSunColor * smoothstep(0.99985, 0.99995, sd) * 18.0;
  c += uSunColor * pow(max(sd, 0.0), 300.0) * 0.28;
  // Clouds with depth (step 7): marched through their layer, each step lit by the sun as far as the cloud towards it lets
  // it through, and by the sky above; far off they thin into the haze.
  if (uCloudVolume < 0.5) {
    if (d.z > 0.012) {
      vec2 p = d.xy / (d.z + 0.1) * 0.11;
      float m = flatClouds(p);
      if (m > 0.0) {
        float m2 = flatClouds(p + uSun.xy * 0.012);
        vec3 lit = mix(uSunColor * 0.9 + vec3(0.35, 0.38, 0.44), vec3(0.42, 0.42, 0.48), m2 * 0.7);
        c = mix(c, lit, m * 0.78 * smoothstep(0.012, 0.16, d.z));
      }
    }
  } else if (d.z > 0.012 && uCloudCover > 0.0 && uHeight < CLOUD_BASE) {
    float t0 = (CLOUD_BASE - uHeight) / d.z;
    // Steps of 250 m at most, low towards the horizon, where the layer is crossed a long way: fewer, longer ones hit or
    // missed its heaps too much at random for a few frames' average to smooth.
    float t1 = min((CLOUD_TOP - uHeight) / d.z, t0 + 6000.0);
    const int STEPS = 24;
    float dt = (t1 - t0) / float(STEPS);
    // The pattern moves across the screen from frame to frame, so that the frames' average takes it out.
    float start = fract(52.9829189 * fract(dot(gl_FragCoord.xy + 5.588238 * uFrameNoise, vec2(0.06711056, 0.00583715))));
    float mu = dot(d, uSun);
    float g1 = 0.6;
    float forward = (1.0 - g1 * g1) / (12.566 * pow(1.0 + g1 * g1 - 2.0 * g1 * mu, 1.5));
    float phase = mix(0.08, forward, 0.7) * 12.566;
    vec3 eye = vec3(0.0, 0.0, uHeight);
    vec3 glow = vec3(0.0);
    float through = 1.0;
    for (int i = 0; i < STEPS; i++) {
      vec3 p = eye + d * (t0 + (float(i) + start) * dt);
      float rho = cloudDensity(p);
      if (rho <= 0.0) continue;
      // Towards the sun, how much cloud the light comes through.
      float toward = cloudDensity(p + uSun * 110.0) + cloudDensity(p + uSun * 300.0) * 1.5;
      // Light comes through the cloud towards the sun, and a heap's edges, thin, catch less of it (the powder of
      // Schneider and Vos 2015).
      float sunlit = exp(-toward * 0.45) * (1.0 - exp(-rho * 4.0));
      float height = (p.z - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE);
      vec3 light = uSunColor * sunlit * phase * 2.4 + uSkyTop * (0.7 + 0.7 * height);
      float k = rho * dt * 0.0035;
      float lost = exp(-k);
      glow += through * light * (1.0 - lost);
      through *= lost;
      if (through < 0.02) break;
    }
    float far = 1.0 - smoothstep(0.012, 0.09, d.z);
    through = mix(through, 1.0, far * 0.85);
    glow *= 1.0 - far * 0.85;
    c = c * through + glow;
  }
  o = vec4(c, uAlpha);
}`;

// ——— Ambient occlusion ———

/**
 * Ambient occlusion from the depth (docs/plans/RENDERING.md, step 4): ground-truth ambient occlusion (Jimenez, Wu, Pesce
 * and Jarabo 2016). In a few slices about the view through each pixel, turned by noise from pixel to pixel, the highest
 * horizon either side is found within a radius, and the light of the sky the surface still sees between the two horizons
 * is integrated over its cosine. Drawn at half size, then blurred along the depth.
 */
export const AO_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform highp sampler2D uDepth;
uniform vec2 uProjK;   // tan(fov/2)·aspect, tan(fov/2)
uniform vec2 uNearFar;
uniform vec2 uTexel;
out vec4 o;
const float PI = 3.14159265;
float linear(float z) {
  float n = uNearFar.x;
  float f = uNearFar.y;
  return (2.0 * n * f) / (f + n - (z * 2.0 - 1.0) * (f - n));
}
vec3 viewPos(vec2 uv) {
  float d = linear(texture(uDepth, uv).r);
  return vec3((uv * 2.0 - 1.0) * uProjK * d, -d);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  float raw = texture(uDepth, vUv).r;
  if (raw >= 1.0) {
    o = vec4(1.0);
    return;
  }
  vec3 p = viewPos(vUv);
  vec3 n = normalize(cross(dFdx(p), dFdy(p)));
  vec3 v = normalize(-p);
  if (dot(n, v) < 0.0) n = -n;
  float dist = -p.z;
  // The radius grows with distance, and reaches further close by: the foot of a wall, a crown over the ground; far
  // away, the streets of a city.
  float radius = clamp(dist * 0.05, 1.2, 30.0);
  vec2 sr = radius / (uProjK * dist) * 0.5;
  float turn = ign(gl_FragCoord.xy) * PI;
  float jitter = fract(ign(gl_FragCoord.yx + 7.0) + 0.5);
  const int SLICES = 2;
  const int STEPS = 6;
  float sum = 0.0;
  for (int k = 0; k < SLICES; k++) {
    float phi = turn + float(k) * PI / float(SLICES);
    vec2 dir = vec2(cos(phi), sin(phi));
    // The slice's plane: the view, and the direction across the screen; the normal as it falls in it.
    vec3 across = vec3(dir, 0.0);
    vec3 side = across - dot(across, v) * v;
    vec3 axis = normalize(cross(side, v));
    vec3 inPlane = n - axis * dot(n, axis);
    float len = max(length(inPlane), 1e-4);
    float cn = clamp(dot(inPlane, v) / len, 0.0, 1.0);
    float gamma = sign(dot(side, inPlane)) * acos(cn);
    // The highest horizon on either side, as the cosine of its angle from the view.
    float c0 = -1.0;
    float c1 = -1.0;
    for (int i = 0; i < STEPS; i++) {
      float t = (float(i) + jitter) / float(STEPS);
      t *= t;
      vec2 off = dir * sr * t;
      vec3 a = viewPos(vUv + off) - p;
      vec3 b = viewPos(vUv - off) - p;
      float la = length(a);
      float lb = length(b);
      // Past the radius, a sample counts for less, and then not at all.
      float fa = clamp(1.0 - la / radius, 0.0, 1.0);
      float fb = clamp(1.0 - lb / radius, 0.0, 1.0);
      c0 = max(c0, mix(-1.0, dot(a, v) / max(la, 1e-4), fa));
      c1 = max(c1, mix(-1.0, dot(b, v) / max(lb, 1e-4), fb));
    }
    // The horizons' angles from the view: the one behind the slice's direction negative, the one along it positive,
    // neither further than the surface's own half of the sky.
    float h0 = -acos(clamp(c1, -1.0, 1.0));
    float h1 = acos(clamp(c0, -1.0, 1.0));
    h0 = gamma + clamp(h0 - gamma, -PI * 0.5, PI * 0.5);
    h1 = gamma + clamp(h1 - gamma, -PI * 0.5, PI * 0.5);
    // The cosine-weighted light between the horizons, over the slice.
    float a0 = cos(gamma) + 2.0 * h0 * sin(gamma) - cos(2.0 * h0 - gamma);
    float a1 = cos(gamma) + 2.0 * h1 * sin(gamma) - cos(2.0 * h1 - gamma);
    sum += len * 0.25 * (a0 + a1);
  }
  float ao = clamp(sum / float(SLICES), 0.0, 1.0);
  // Softened a little, as the old pass was, for the light the sky's colour already darkens.
  ao = mix(1.0, ao, 0.85);
  o = vec4(ao, ao, ao, 1.0);
}`;

export const BLUR_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform highp sampler2D uTex;
uniform highp sampler2D uDepth;
uniform vec2 uDir;
uniform vec2 uNearFar;
out vec4 o;
float linear(float z) {
  float n = uNearFar.x;
  float f = uNearFar.y;
  return (2.0 * n * f) / (f + n - (z * 2.0 - 1.0) * (f - n));
}
void main() {
  float d0 = linear(texture(uDepth, vUv).r);
  float sum = 0.0;
  float w = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 uv = vUv + uDir * float(i);
    float d = linear(texture(uDepth, uv).r);
    float k = exp(-float(i * i) * 0.16) * exp(-abs(d - d0) / (d0 * 0.02 + 0.05));
    sum += texture(uTex, uv).r * k;
    w += k;
  }
  float v = sum / max(w, 1e-4);
  o = vec4(v, v, v, 1.0);
}`;

// ——— Finishing ———

export const BRIGHT_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform highp sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
out vec4 o;
void main() {
  // A soft blur on the way down.
  vec3 c = vec3(0.0);
  c += texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  if (uThreshold > 0.0) {
    float l = max(c.r, max(c.g, c.b));
    c *= smoothstep(uThreshold, uThreshold * 2.0, l);
  }
  o = vec4(min(c, vec3(16.0)), 1.0);
}`;

/**
 * Temporal antialiasing (docs/plans/RENDERING.md, step 4): each frame is drawn a fraction of a pixel off the last, and
 * folded into what came before. While the view holds still the frames are averaged, each counting as much as the others,
 * so that after a few the picture is the same however it was come to; while it moves, what came before is carried to
 * where it now is on the screen and held to what the frame shows around it, so that nothing trails.
 */
export const TAA_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform highp sampler2D uCurrent;
uniform highp sampler2D uHistory;
uniform highp sampler2D uDepth;
// From this frame's screen to the last's, through the world, the eye's move included.
uniform mat4 uReproject;
// The share of this frame in what is kept; 1 starts again.
uniform float uBlend;
// 1 while the view moves: what came before is carried and held to this frame's neighbourhood.
uniform float uMoving;
uniform vec2 uTexel;
out vec4 o;
vec3 toYCoCg(vec3 c) { return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25))); }
vec3 fromYCoCg(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
void main() {
  vec4 cur = texture(uCurrent, vUv);
  if (uBlend >= 1.0) {
    o = cur;
    return;
  }
  vec2 uv = vUv;
  if (uMoving > 0.5) {
    float d = texture(uDepth, vUv).r;
    vec4 p = uReproject * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    uv = p.xy / p.w * 0.5 + 0.5;
  }
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    o = cur;
    return;
  }
  vec3 h = texture(uHistory, uv).rgb;
  if (uMoving > 0.5) {
    vec3 lo = vec3(1e9);
    vec3 hi = vec3(-1e9);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 c = toYCoCg(texture(uCurrent, vUv + vec2(float(i), float(j)) * uTexel).rgb);
        lo = min(lo, c);
        hi = max(hi, c);
      }
    }
    h = fromYCoCg(clamp(toYCoCg(h), lo, hi));
  }
  o = vec4(mix(h, cur.rgb, uBlend), cur.a);
}`;

/**
 * Light in the air (docs/plans/RENDERING.md, step 4): along each view, out to a few hundred metres, the sunlight the air
 * scatters towards the eye where the sun reaches it, so that shafts show through a canopy and haze hangs low; marched
 * through the shadow map at a quarter of the frame's size, a different start each frame, for the antialiasing to smooth.
 */
export const SHAFTS_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;
precision highp sampler2DArrayShadow;
in vec2 vUv;
uniform mat4 uInvViewProj;
uniform vec3 uEye;
// How much the air scatters, per metre, low down; the height over which that thins by e; the ground under the eye.
uniform float uDensity;
uniform float uThins;
uniform float uFloor;
uniform float uStart;
out vec4 o;
${LIGHTING}
float lit(vec3 p) {
  float d = distance(p, uShadowFocus);
  int k = d < uShadowRadii.x * 0.92 ? 0 : d < uShadowRadii.y * 0.92 ? 1 : 2;
  vec3 q = p;
  q.z -= drop(q.xy);
  vec4 c = uShadowM[k] * vec4(q, 1.0);
  vec3 u = c.xyz * 0.5 + 0.5;
  if (u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0 || u.z > 1.0) return 1.0;
  return texture(uShadow, vec4(u.xy, float(k), u.z - 0.0002));
}
// Along a pixel's way into the scene, whatever it meets there: how much sunlit air it passes out to 40, 80, 160 and
// 320 m. A pixel of the frame reads it at its own depth (SHAFTS_ADD_FS), so that a twig against the sky takes the air
// before the twig, and not the sky's.
void main() {
  vec4 w = uInvViewProj * vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
  vec3 dir = normalize(w.xyz / w.w);
  const int STEPS = 16;
  const float dl = 20.0;
  float start = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uStart, vec2(0.06711056, 0.00583715))));
  float sum = 0.0;
  vec4 at = vec4(0.0);
  for (int i = 0; i < STEPS; i++) {
    vec3 q = uEye + dir * (float(i) + start) * dl;
    // The eye is drawn with the Earth's curve taken off; the shadow map and the air take it back.
    q.z += drop(q.xy);
    sum += lit(q) * exp(-max(q.z - uFloor, 0.0) / uThins) * dl;
    if (i == 1) at.x = sum;
    if (i == 3) at.y = sum;
    if (i == 7) at.z = sum;
  }
  at.w = sum;
  o = at;
}`;

/** The light in the air, a quarter of the frame's size, added to it: each pixel takes it as far as its own depth. */
export const SHAFTS_ADD_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform highp sampler2D uTex;
uniform highp sampler2D uSceneDepth;
uniform mat4 uInvViewProj;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform float uDensity;
out vec4 o;
void main() {
  vec4 at = texture(uTex, vUv);
  vec4 w = uInvViewProj * vec4(vUv * 2.0 - 1.0, texture(uSceneDepth, vUv).r * 2.0 - 1.0, 1.0);
  vec3 rel = w.xyz / w.w;
  float len = length(rel);
  vec3 dir = rel / max(len, 1e-4);
  // The sunlit air out to this pixel's own depth, between the distances it was summed to.
  float d = min(len, 320.0);
  float sum = d < 40.0 ? at.x * d / 40.0 : d < 80.0 ? mix(at.x, at.y, (d - 40.0) / 40.0) : d < 160.0 ? mix(at.y, at.z, (d - 80.0) / 80.0) : mix(at.z, at.w, (d - 160.0) / 160.0);
  // Scattered mostly forwards, as haze scatters: brightest looking towards the sun.
  float mu = dot(dir, uSun);
  float g = 0.62;
  float phase = (1.0 - g * g) / (12.566 * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  o = vec4(uSunColor * phase * uDensity * sum * smoothstep(-0.02, 0.06, uSun.z), 0.0);
}`;

/** The log of the light of the frame, a block of it to a texel: its mean, from the smallest of its mipmaps, meters the exposure. */
export const LUM_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform highp sampler2D uTex;
// A texel of the meter, in the frame's own measure.
uniform vec2 uCell;
out vec4 o;
void main() {
  float s = 0.0;
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec3 c = texture(uTex, vUv + (vec2(float(i), float(j)) - 1.5) * uCell * 0.25).rgb;
      s += log2(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4));
    }
  }
  o = vec4(s / 16.0, 0.0, 0.0, 1.0);
}`;

export const POST_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform highp sampler2D uScene;
uniform highp sampler2D uBloom0;
uniform highp sampler2D uBloom1;
uniform highp sampler2D uBloom2;
uniform float uExposure;
uniform float uAlpha;
// The frame's light, metered (step 4): the mean of its log, in the meter's last mipmap; 1 where it is metered. The key a
// darker frame is lifted towards, how far, and at most how much.
uniform highp sampler2D uLum;
uniform float uMeter;
uniform vec3 uMeterWay;
// 1: the sky is drawn solid, so the scene covers the whole frame; its alpha, which leaves' coverage leaves short of 1 at
// their edges, is not read
uniform float uSolid;
out vec4 o;
// AgX (Sobotka), as Wrensch fitted it: a tone curve that keeps the colour of a bright sky, where a filmic curve washes
// it out, and lets the brightest things go towards white as film does (docs/plans/RENDERING.md, step 4). Its result is
// for the display as it is.
vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 c) {
  const mat3 inset = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051, 0.0784335999999992, 0.878468636469772, 0.0784336, 0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const float lo = -12.47393;
  const float hi = 4.026069;
  c = inset * max(c, vec3(1e-10));
  c = clamp(log2(c), lo, hi);
  c = (c - lo) / (hi - lo);
  c = agxContrast(c);
  // A little more punch than the default look: as a slide film gives.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = pow(max(c, vec3(0.0)), vec3(1.2));
  return clamp(mix(vec3(l), c, 1.25), 0.0, 1.0);
}
void main() {
  vec4 s = texture(uScene, vUv);
  vec3 c = s.rgb;
  vec3 bloom = texture(uBloom0, vUv).rgb * 0.5 + texture(uBloom1, vUv).rgb * 0.3 + texture(uBloom2, vUv).rgb * 0.2;
  c += bloom * 0.1;
  float exposure = uExposure;
  if (uMeter > 0.5) {
    // As an eye adapts to shade: a frame darker than the key, a forest floor, is lifted part of the way towards it, and
    // still reads darker than a meadow; a brighter one, snow or sand, is left as bright as its light makes it.
    float k = uMeterWay.x / max(exp2(textureLod(uLum, vec2(0.5), 6.0).r) * uExposure, 1e-4);
    exposure *= clamp(pow(k, uMeterWay.y), 1.0, uMeterWay.z);
  }
  c *= exposure;
  c = agx(c);
  // Vignette.
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.28;
  float a = uAlpha * (uSolid > 0.5 ? 1.0 : s.a);
  o = vec4(c * a, a);
}`;
