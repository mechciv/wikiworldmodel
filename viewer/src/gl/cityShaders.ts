// The city's shaders. Nothing here is a fact about Rome: materials are procedural, seen through a
// physically based sky, so that the same light falls on everything the records raise.
import { LEAF_TILE, LITTER_SPAN } from '../../../core/leaves.ts';
import { GROUND_LAYERS } from '../../../core/materials.ts';
import { PLOT_LOOK, PLOTS_GLSL } from '../../../core/plots.ts';
import { DUTY } from '../../../world/generators/life/forms.ts';
import { DRIED_BY, SOIL_STONES, SORT_EDGE, SORTING } from '../../../world/generators/life/sorting.ts';

/** A number as GLSL writes a float. */
const glf = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));

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
 * Leaves held on cards (docs/plans/RENDERING.md, step 1): a card shows a tile of the atlas of leaves (core/leaves.ts,
 * leafatlas.ts), a spray of leaves on its twig or a bough of such sprays, and what of the card is leaf is read from it,
 * the same in every pass, so that what casts a shadow and what a click finds are the leaves that are seen. How a kind of
 * leaf looks is the atlas's; which kind a plant has is its form's.
 */
const LEAVES = /* glsl */ `
const int NEEDLE_CARD = 44, FROND_CARD = 45, BROAD_CARD = 46, FAN_CARD = 47, LEAF_MASS = 48, BLADE_CARD = 49, BLADE = 71, CROP_CARD = 73;
bool onCard(int m) { return (m >= NEEDLE_CARD && m <= FAN_CARD) || m == BLADE_CARD || m == CROP_CARD; }
uniform highp sampler2DArray uLeaves;
// How much of a texel must be leaf for it to be leaf where the answer is yes or no: under a half, so that a needle
// thinner than a texel is kept.
const float LEAF_CUT = 0.36;
float leafHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
// A card's texel of the atlas: its tile is the whole part of u, across the tile its fraction, and v along it from the
// twig's foot. Read by how the card's own uv changes across a pixel: the tile's number, taken off, changes it at a
// card's edge, where a pixel's neighbour lies off the card. Red is how light the leaf is, green how much is twig, blue
// how the leaf's face leans across the card, alpha how much is leaf.
vec4 leafTexelGrad(vec2 uv, vec2 dux, vec2 duy) {
  float tile = floor(uv.x);
  vec2 k = vec2(1.0 / 0.98, 1.0);
  return textureGrad(uLeaves, vec3((uv.x - tile - 0.01) / 0.98, uv.y, tile), dux * k, duy * k);
}
vec4 leafTexel(vec2 uv) {
  return leafTexelGrad(uv, dFdx(uv), dFdy(uv));
}
// The same where no pixel has neighbours to measure by: the shadows' and the pick's passes read the tile as it is.
bool leafThere(vec2 uv) {
  float tile = floor(uv.x);
  return texture(uLeaves, vec3((uv.x - tile - 0.01) / 0.98, uv.y, tile)).a >= LEAF_CUT;
}
// How much of a pixel of a card is leaf, from what the atlas says of the texels about it: drawn larger than its tile, an
// edge is sharpened to a pixel; drawn smaller, it is the share of the texels that are leaf.
float leafShare(float a) {
  return clamp((a - LEAF_CUT) / max(fwidth(a), 0.03) + 0.5, 0.0, 1.0);
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
// One that goes a way of its own (world/generators/life/routines.ts, ROUTE): the first place it goes to, from where it
// stands, and how long it stays before it sets out; the second, and its stay at the first; then how fast it goes, its
// stay at the second, how long it takes to get going, and its kind with where in a stride it sets out. All noughts,
// as they are for a mesh that has no ways, for one that stays where it stands.
layout(location = 8) in vec4 iWayA;
layout(location = 9) in vec4 iWayB;
layout(location = 10) in vec4 iWayC;
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
// Conservative per-instance shadow cascade culling: >= 0 only during shadow passes (protoOriginRadius / cascadeRadius)
// and 1 / cascadeRadius for moving route margins.
uniform float uShadowPad;
uniform float uShadowInvR;
// Screen-size fade-in for instanced geometry (uFadeK = cssHeight / (2 * tan(fov/2)), 0 in shadow/depth/pick passes).
uniform float uFadeK;
uniform float uProtoExtent;
// Entity index offset added to static vertex aEntity so reusable structure layers work across scenes.
uniform int uEntityOffset;
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
// What a body on its way is doing at this second of the visit: the sums of wayAt (world/generators/life/routines.ts),
// which the tests hold these to. Nothing is kept from one frame to the next.
// How far along a leg of len metres it is, s seconds into it, at speed v, getting going and stopping over a seconds;
// and how much it is going, 0 to 1.
vec2 wayAlong(float s, float len, float v, float a) {
  if (len < 1e-3 || a <= 0.0) return vec2(0.0);
  float t = len / v + a;
  if (s < a) return vec2(0.5 * v * s * s / a, s / a);
  if (s > t - a) {
    float r = max(0.0, t - s);
    return vec2(len - 0.5 * v * r * r / a, r / a);
  }
  return vec2(v * (s - 0.5 * a), 1.0);
}
// A heading, (sin, cos), turned from one way to another, u of the way, by the shorter turn.
vec2 wayTurned(vec2 from, vec2 to, float u) {
  float k = clamp(u, 0.0, 1.0);
  k = k * k * (3.0 - 2.0 * k);
  float a = atan(from.x, from.y);
  float d = mod(atan(to.x, to.y) - a + 3.14159265, 6.2831853) - 3.14159265;
  float h = a + d * k;
  return vec2(sin(h), cos(h));
}
// Where it is from where it stands, the way it faces, how much it is going, and how far it has walked this round.
void wayOf(out vec3 off, out vec2 face, out float going, out float walked) {
  off = vec3(0.0);
  face = iFace;
  going = 0.0;
  walked = 0.0;
  float v = iWayC.x;
  int kind = int(iWayC.w);
  if (kind == 2) {
    // Round a circle whose middle lies square to the way it was put, so that it sets out that way.
    float r = max(length(iWayA.xy), 1e-3);
    float dir = iFace.x * iWayA.y - iFace.y * iWayA.x < 0.0 ? -1.0 : 1.0;
    float th = dir * v * uClock / r;
    vec2 n0 = -iWayA.xy / r;
    vec2 n = vec2(n0.x * cos(th) - n0.y * sin(th), n0.x * sin(th) + n0.y * cos(th));
    off.xy = iWayA.xy + r * n;
    face = dir * vec2(-n.y, n.x);
    walked = v * uClock;
    return;
  }
  vec3 A = iWayA.xyz;
  vec3 B = iWayB.xyz;
  float l0 = length(A.xy);
  float l1 = length(B.xy - A.xy);
  float l2 = length(B.xy);
  float a0 = min(iWayC.z, l0 / v);
  float a1 = min(iWayC.z, l1 / v);
  float a2 = min(iWayC.z, l2 / v);
  float t0 = l0 / v + a0;
  float t1 = l1 / v + a1;
  float t2 = l2 / v + a2;
  float d0 = max(iWayA.w, 0.0);
  float d1 = iWayB.w;
  float d2 = iWayC.y;
  vec2 D0 = l0 > 1e-3 ? A.xy / l0 : iFace;
  vec2 D1 = l1 > 1e-3 ? (B.xy - A.xy) / l1 : D0;
  vec2 D2 = l2 > 1e-3 ? -B.xy / l2 : D1;
  // One put walking is a first step on its way as the clock starts.
  float s = mod(uClock + (iWayA.w < 0.0 ? a0 : 0.0), max(d0 + t0 + d1 + t1 + d2 + t2, 1e-3));
  if (s < d0) return;
  s -= d0;
  if (s < t0) {
    vec2 q = wayAlong(s, l0, v, a0);
    off = vec3(D0 * q.x, l0 > 1e-3 ? A.z * q.x / l0 : 0.0);
    going = q.y;
    walked = q.x;
    face = wayTurned(iFace, D0, s / max(a0, 1e-3));
    return;
  }
  s -= t0;
  walked = l0;
  if (s < d1) {
    off = A;
    face = D0;
    return;
  }
  s -= d1;
  if (s < t1) {
    vec2 q = wayAlong(s, l1, v, a1);
    off = A + vec3(D1 * q.x, l1 > 1e-3 ? (B.z - A.z) * q.x / l1 : 0.0);
    going = q.y;
    walked += q.x;
    face = wayTurned(D0, D1, s / max(a1, 1e-3));
    return;
  }
  s -= t1;
  walked += l1;
  if (s < d2) {
    off = B;
    face = D1;
    return;
  }
  s -= d2;
  vec2 q = wayAlong(s, l2, v, a2);
  off = B + vec3(D2 * q.x, l2 > 1e-3 ? -B.z * q.x / l2 : 0.0);
  going = q.y;
  walked += q.x;
  // It turns for home as it sets out, and into the way it was put as it comes in.
  face = wayTurned(wayTurned(D1, D2, s / max(a2, 1e-3)), iFace, (s - (t2 - a2)) / max(a2, 1e-3));
}
out vec3 vPos;
// the point from the eye: across a pixel its differences are fine, where the world's position, kilometres from the
// scene's middle, would change by steps of a float's last place
out vec3 vRel;
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
flat out float vInstFade;
void main() {
  bool many = uInstanced > 0.5;
  if (many && uShadowPad >= 0.0) {
    vec3 ctr = iPlace.xyz;
    ctr.z -= drop(ctr.xy);
    vec4 sc = uViewProj * vec4(ctr, 1.0);
    float wayPad = iWayC.x > 0.0 ? (length(iWayA.xy) * 2.0 + length(iWayB.xy)) * uShadowInvR : 0.0;
    float pad = uShadowPad * abs(iPlace.w) + wayPad;
    if (abs(sc.x) > 1.0 + pad || abs(sc.y) > 1.0 + pad) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
  }
  vLow = many ? aPos.z * iPlace.w : 1e4;
  int entity = many ? int(iMeta.x) : (int(aEntity) + uEntityOffset);
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
  // One that goes a way of its own: where it is on it, the way it faces there, how much it is going and how far it has
  // walked. One that stays is where it stands, as it was put.
  vec3 wayOff = vec3(0.0);
  vec2 face = iFace;
  float going = 0.0;
  float walked = 0.0;
  if (many && iWayC.x > 0.0) wayOf(wayOff, face, going, walked);
  if (many && uIdling > 0.5) {
    // An animal idles: its vertex says what it moves with (world/generators/life/forms.ts, BONE), and how far.
    int code = int(aEntity);
    int bone = code & 15;
    float w = float(code >> 4) / 255.0;
    float t = uClock * uIdle[3].z + own * 6.2831853;
    if (bone == 1 || bone == 2) {
      // The head, and the neck as far as it goes with it, up or down about the neck's root, now and then. On its way a
      // head that was low to feed is held up, and one held up does not dip.
      float c = 0.5 - 0.5 * cos(t * 0.31);
      float a = (bone == 1 ? 1.0 : w) * uIdle[3].x * mix(c * c * c, uIdle[3].x > 0.0 ? 1.0 : 0.0, going);
      p = turnYZ(p, uIdle[0].xyz, a);
      n = turnYZ(n, vec3(0.0), a);
    } else if (bone == 3) {
      float a = w * uIdle[3].y * sin(t);
      p = turnXY(p, uIdle[1].xyz, a);
      n = turnXY(n, vec3(0.0), a);
    } else if (bone == 4) {
      float b = 1.0 + 0.012 * w * sin(t * 1.7);
      p = uIdle[2].xyz + (p - uIdle[2].xyz) * vec3(b, 1.0, b);
    } else if ((bone == 5 || bone == 6) && going > 0.0) {
      // A leg strides as its body goes (forms.ts, gait): on the ground it goes back as fast as the body goes forward,
      // so that a foot stays where it was put down; then it is lifted and swung forward. The legs of the other bone
      // are half a stride behind. A point goes with its leg as far as it is down it.
      float len = uIdle[3].w;
      float at = fract(walked / max(len * iPlace.w, 1e-4) + fract(iWayC.w) + (bone == 6 ? 0.5 : 0.0));
      float u = (at - ${DUTY.toFixed(3)}) / ${(1 - DUTY).toFixed(3)};
      vec2 g = at < ${DUTY.toFixed(3)} ? vec2(1.0 - 2.0 * at / ${DUTY.toFixed(3)}, 0.0) : vec2(-cos(3.14159265 * u), sin(3.14159265 * u));
      p.y += w * going * ${(DUTY / 2).toFixed(3)} * len * g.x;
      p.z += w * w * going * 0.07 * len * g.y;
    }
  }
  vLocal = many ? p * iPlace.w : aPos;
  vKind = float(aMat.y) / 255.0;
  if (many) {
    // +y of the mesh goes to (fx, fy), and +x to (fy, −fx). A horn, an eye or a trunk's bark stays its colour.
    vec3 q = p;
    p = iPlace.xyz + wayOff + vec3(q.x * face.y + q.y * face.x, -q.x * face.x + q.y * face.y, q.z) * iPlace.w;
    n = vec3(n.x * face.y + n.y * face.x, -n.x * face.x + n.y * face.y, n.z);
    if (aMat.x == 73u) tint = float(iMeta.y) / 255.0;
    else if (aMat.x != 32u && aMat.x != 10u && aMat.x != 37u && aMat.x != 72u) tint = fract(tint + float(iMeta.y) / 255.0);
  }
  // A plant drawn by instancing leans with the wind, the more the higher, in gusts that cross the ground; its leaves on
  // cards flutter.
  int mat = int(aMat.x);
  bool plant = mat == 35 || mat == 36 || mat == 37 || mat == 38 || (mat >= 44 && mat <= 49) || mat == 71 || mat == 73;
  if (many && plant && dot(uWind, uWind) > 0.0) {
    float h = max(aPos.z * iPlace.w, 0.0);
    float speed = length(uWind);
    vec2 dir = uWind / speed;
    float gust = 0.55 + 0.45 * sin(uClock * 0.6 - dot(iPlace.xy, dir) * 0.035) * sin(uClock * 0.21 + own * 6.2831853);
    float lean = gust * speed * 0.05 * h / (1.0 + h * 0.15) * (0.8 + 0.2 * sin(uClock * 1.7 + own * 19.0));
    vec3 off = vec3(dir * lean, -0.5 * lean * lean / max(h, 0.5));
    if ((mat >= 44 && mat <= 49) || mat == 73) off += 0.015 * speed * min(h, 4.0) * 0.25 * vec3(sin(uClock * 7.0 + aPos.x * 3.1 + own * 31.0), sin(uClock * 6.3 + aPos.y * 2.7), sin(uClock * 8.1 + aPos.z * 2.3));
    p += off;
  }
  // A structure rises from the ground it stands on.
  if (up < 1.0) p.z = e.w + (p.z - e.w) * up;
  vPos = p;
  vRel = p - uEye;
  p.z -= drop(p.xy);
  vN = n;
  vLight = aNormal.w;
  vUv = aUv;
  vMaterial = int(aMat.x);
  vTint = tint;
  vFlags = e.z;
  vEntity = entity;
  if (many && uFadeK > 0.0) {
    vec3 ctr = vec3(iPlace.xy, iPlace.z - drop(iPlace.xy));
    float instDist = max(length(ctr - uEye), 1.0);
    float pxs = (uProtoExtent * abs(iPlace.w) * uFadeK) / instDist;
    vInstFade = smoothstep(1.2, 3.8, pxs);
  } else {
    vInstFade = 1.0;
  }
  gl_Position = uViewProj * vec4(p - uEye, 1.0);
  // Paving, roads and sand lie on the ground: they win over it at any distance.
  if (aMat.x == 11u || aMat.x == 12u || aMat.x == 13u || aMat.x == 18u) gl_Position.z -= 1.4e-4 * gl_Position.w;
}`;

/**
 * Depth only: for the shadows, and for the depth the lit pass and the occlusion are drawn over. Leaves on cards are cut
 * to their outline for the shadows; the depth before the lit pass leaves out cards and screen-size fading instances, as
 * the lit pass dithers them and writes their surviving depth itself without punching holes in terrain or polluting GTAO.
 */
export const DEPTH_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
flat in int vMaterial;
flat in float vInstFade;
// 1: leaves on cards are cut to their outline; 0: cards and fading instances are left out of the prepass
uniform float uCards;
${LEAVES}
out vec4 o;
void main() {
  if (onCard(vMaterial) && (uCards < 0.5 || !leafThere(vUv))) discard;
  if (uCards < 0.5 && vInstFade < 0.995) discard;
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
  if (onCard(vMaterial) && !leafThere(vUv)) discard;
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
// Where in its first step each frame's march starts, 0 to 1: the frames of a view at rest take the eighths of a step
// one after another, in the order that halves the gaps, so that their average is a march eight times as fine.
uniform float uFrameNoise;
// Terrain-relative cloud layer heights (metres ASL) and smooth fade alpha as the camera approaches the base.
uniform float uCloudBase;
uniform float uCloudTop;
uniform float uCloudAlpha;
// How dense the cloud is at a point. foot is how much of the layer a pixel takes in there, m: towards the horizon a
// row of pixels is hundreds of metres of cloud further off than the row under it, and what is finer than that would
// show as streaks along the rows, so it is left out as it becomes so.
float cloudDensityAt(vec3 p, float foot) {
  float span = max(uCloudTop - uCloudBase, 1.0);
  float h = (p.z - uCloudBase) / span;
  if (h <= 0.0 || h >= 1.0) return 0.0;
  vec3 q = p + vec3(uClockSky * 6.0, uClockSky * 3.4, 0.0);
  // Its finer shape is not asked for where it would not be seen.
  float finer = foot < 1300.0 ? mix(texture(uNoise, q / (64.0 * 320.0) + 0.37).g, 0.5, smoothstep(320.0, 1300.0, foot)) : 0.5;
  float shape = texture(uNoise, q / (64.0 * 900.0)).r * 0.62 + finer * 0.38;
  // Flat at the base and round at the top, as a heap of cloud is. The noise lies mostly within a tenth of a half, so the
  // share of the sky above a threshold is about its normal distribution's: the threshold that leaves the cover.
  float profile = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.35, 1.0, h));
  float cover = clamp(uCloudCover * 0.6, 0.0, 0.5);
  float threshold = 0.5 + 0.26 * (0.5 - cover);
  float d = (shape - threshold - 0.06 * (1.0 - profile)) * 7.0 * profile;
  if (d <= 0.0) return 0.0;
  // Its edges eaten away, finely.
  if (foot < 360.0) d -= (texture(uNoise, q / (64.0 * 90.0) + 0.71).b - 0.5) * 0.35 * (1.0 - smoothstep(90.0, 360.0, foot));
  return clamp(d, 0.0, 1.0);
}
float cloudDensity(vec3 p) { return cloudDensityAt(p, 0.0); }
// How much sunlight comes through the clouds to a point below them, along the sun.
float cloudShadow(vec3 p, vec3 sun) {
  if (sun.z < 0.05 || uCloudCover <= 0.0) return 1.0;
  float span = max(uCloudTop - uCloudBase, 1.0);
  float sum = 0.0;
  for (int i = 0; i < 4; i++) {
    float z = uCloudBase + span * (float(i) + 0.5) / 4.0;
    if (z <= p.z) continue;
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
  // How far along the sun's way a point must be behind what shades it: three texels of its cascade's map, as a share
  // of the depth the map spans (city.ts, the shadows' depthRange), and no more than it was when it was one number for
  // all three. In the nearest cascade that is a hand's breadth, where it was more than half a metre: a stone, a tuft
  // and a foot cast a shadow that meets them.
  float bias = min(0.00012, texel * 3.0 / (2.0 * max(uShadowRadii[k] * 4.0, 2500.0)));
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
  vec3 res = abs(det) * n - strength * grad;
  float l = length(res);
  return l > 1e-12 ? res / l : n;
}

// GGX highlight of the sun.
float sunSpecular(vec3 n, vec3 v, float rough) {
  vec3 hv = uSun + v;
  float hl = length(hv);
  vec3 h = hl > 1e-6 ? hv / hl : n;
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

/** Strip compile-time #ifdef/#ifndef/#else/#endif blocks before sending specialized GLSL to the driver. */
function stripGlslVariants(src: string, defs: ReadonlySet<string>): string {
  const out: string[] = [];
  const stack: { parent: boolean; branch: boolean }[] = [];
  const active = () => (stack.length === 0 ? true : stack[stack.length - 1].parent && stack[stack.length - 1].branch);
  for (const line of src.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#ifdef ')) {
      const sym = trimmed.slice(7).trim();
      stack.push({ parent: active(), branch: defs.has(sym) });
    } else if (trimmed.startsWith('#ifndef ')) {
      const sym = trimmed.slice(8).trim();
      stack.push({ parent: active(), branch: !defs.has(sym) });
    } else if (trimmed === '#else') {
      const top = stack[stack.length - 1];
      if (!top) throw new Error('Unmatched #else in GLSL template');
      top.branch = !top.branch;
    } else if (trimmed === '#endif') {
      if (!stack.length) throw new Error('Unmatched #endif in GLSL template');
      stack.pop();
    } else if (active()) {
      out.push(line);
    }
  }
  if (stack.length) throw new Error('Unclosed #ifdef/#ifndef in GLSL template');
  return out.join('\n');
}

const MESH_FS_TEMPLATE = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2DArrayShadow;
in vec3 vPos;
in vec3 vRel;
in vec3 vN;
in vec2 vUv;
in float vLight;
in float vLow;
in vec3 vLocal;
flat in int vMaterial;
flat in float vTint;
flat in float vKind;
flat in float vFlags;
flat in float vInstFade;
uniform vec3 uEye;
// On wild land, what covers the ground (R canopy): what stands low under the canopy is in its shade.
uniform float uWild;
uniform highp sampler2D uMask;
uniform vec4 uMaskBox;
uniform highp sampler2D uAO;
uniform vec2 uAOSize;
uniform float uUseAO;
uniform float uEvidence;
// 1: the edges of leaves on cards are blended by how much of a pixel they cover; 0: they are cut at half
uniform float uCoverage;
// The tones of the land, as the place's climate gives them (world/generators/life/scene.yaml): soil, low plants, bare
// ground, canopy and low plants from afar, each from one tone to another. What grows takes its hue from them.
uniform vec3 uTone[10];
// The ground's scanned materials (core/materials.ts), where they are loaded: what is built of earth or of stone takes
// its grain from the scan of it, in its own colour, as the ground does.
uniform highp sampler2DArray uMatColour;
uniform highp sampler2DArray uMatNormal;
uniform vec4 uMatMean[${GROUND_LAYERS.length}];
uniform vec4 uMatLook[${GROUND_LAYERS.length}];
uniform float uMaterials;
const int ${GROUND_LAYERS.map((k, i) => `M_${k.toUpperCase()} = ${i}`).join(', ')};
// What the ground's stones are drawn of, as the terrain draws them: the two tones of its gravel, where the world says
// what the ground is made of, which are the rock's under the place where that is known (groundlook.ts); and the rock
// itself and its stones, for a ground nothing is said of. A stone that stands on the ground is of the same.
uniform vec3 uSubTone[16];
uniform vec3 uRock[2];
// The scene's seasonal 8-slot crop palette (core/plots.ts, FieldPalette), shared with TERRAIN_FS so close crop stands
// match the ground's parcel colours and seasonal states seamlessly.
uniform vec4 uSlotColor[8];
uniform vec4 uSlotColor2[8];
uniform vec4 uSlotMeta[8];
out vec4 o;
${LIGHTING}
#ifndef MESH_ONLY_BUILT
${LEAVES}
${PLOTS_GLSL}
#endif
struct Surface { vec3 albedo; float rough; float metal; float bump; };

#ifndef MESH_ONLY_FOLIAGE
// A scanned material's grain on a built face, laid by the face's own uv in metres: what to multiply its colour by; and
// its height, 0 to 1, for the light to be bumped by. Nothing where the scans are not loaded, or from too far to show.
vec4 builtGrain(int layer, vec2 uv, float scale, vec3 p) {
  float near = uMaterials * (1.0 - smoothstep(40.0, 110.0, length(uEye - p)));
  if (near <= 0.0) return vec4(1.0, 1.0, 1.0, 0.5);
  vec3 at = vec3(uv / (uMatMean[layer].w * scale), float(layer));
  vec4 c = texture(uMatColour, at);
  vec3 mean = uMatMean[layer].rgb;
  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
  float light = dot(c.rgb, LUMA) / max(dot(mean, LUMA), 1e-4);
  vec3 detail = mix(vec3(light), c.rgb / max(mean, vec3(1e-4)), uMatLook[layer].x * 0.6);
  return vec4(mix(vec3(1.0), clamp(detail, 0.2, 2.6), near), mix(0.5, c.a, near));
}

const int MARBLE=1, TRAVERTINE=2, BRICK=3, PLASTER=4, TILE=5, GILT=6, BRONZE=7, GRANITE=8, WOOD=9, DARK=10, PAVING=11, BASALT=12, SAND=13, CONCRETE=14, LEAD=15, LEAF=16, TRUNK=17, GRASS=18, SHAFT=19, FACADE=20, STATUE=21, EARTH=22, SEATS=23, AWNING=24, SPIRAL=25, CLOTH=26, SKIN=27, DENTIL=28, FRIEZE=29, POOL=30, HIDE=31, HORN=32, SHELL=33, FUR=34, NEEDLE=35, FROND=36, BARK=37, BROAD=38, FEATHER=39, MEMBRANE=40, CHITIN=41, THATCH=42, MUD=43;
// What lies strewn on wild ground (world/generators/life/strewn.ts): a stone, the bark of fallen wood, and the wood
// where it broke.
const int STONE=74, FALLEN_BARK=75, HEARTWOOD=76;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

// Fades a pattern away once it is finer than a pixel or two, so nothing shimmers.
float visible(float size, float fw) { return 1.0 - smoothstep(size * 0.25, size * 0.9, fw); }

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
#ifndef MESH_ONLY_BUILT
  } else if (m == HIDE) {
    // Pebbled skin, darker along the back, paler beneath, its colours nobody's record: the generator's.
    float k = tint * 4.0;
    vec3 a = vec3(0.145, 0.125, 0.082);
    vec3 b = vec3(0.17, 0.165, 0.085);
    vec3 c = vec3(0.215, 0.14, 0.075);
    vec3 d = vec3(0.105, 0.115, 0.10);
    vec3 base = k < 1.0 ? mix(a, b, k) : k < 2.0 ? mix(b, c, k - 1.0) : k < 3.0 ? mix(c, d, k - 2.0) : mix(d, a, k - 3.0);
    // Its mottling is laid in the body's own frame, and goes with it as it moves.
    vec3 b3 = vLocal;
    float mott = fbmM(b3, 0.32);
    float band = smoothstep(0.44, 0.62, fbmM(b3 * vec3(1.0, 0.45, 0.8), 0.5) + (mott - 0.5) * 0.35);
    vec3 skin = base * mix(1.25, 0.55, band);
    float back = smoothstep(0.2, 0.95, n.z);
    float belly = smoothstep(-0.15, -0.8, n.z);
    skin = mix(skin, skin * 0.58, back);
    skin = mix(skin, mix(skin, vec3(0.42, 0.37, 0.27), 0.68), belly);
    // Creases round the body, where its skin folds as it moves: darker in them.
    float crease = abs(noiseS(b3, vec3(0.5, 0.05, 0.5)) - 0.5) * 2.0;
    s.albedo = skin * (0.7 + 0.6 * noiseM(b3, 0.06)) * (0.82 + 0.18 * smoothstep(0.0, 0.3, crease));
    s.rough = 0.62;
    vec3 q = b3 / (64.0 * 0.045);
    vec3 wob = vec3(texture(uNoise, q).r, texture(uNoise, q).g, texture(uNoise, q).b) - 0.5;
    bumpN = normalize(n + wob * 1.2);
#endif
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
#ifndef MESH_ONLY_BUILT
  } else if (m == FUR) {
    float k = fract(tint * 4.0);
    // Natural mammal coats ranging from dark bay/brown and warm dun to creamy wool fleece.
    vec3 base = tint < 0.25
      ? mix(vec3(0.20, 0.145, 0.09), vec3(0.36, 0.25, 0.14), k)
      : tint < 0.50
        ? mix(vec3(0.28, 0.20, 0.11), vec3(0.16, 0.14, 0.11), k)
        : tint < 0.75
          ? mix(vec3(0.45, 0.36, 0.22), vec3(0.26, 0.19, 0.13), k)
          : mix(vec3(0.68, 0.63, 0.54), vec3(0.56, 0.50, 0.40), k);
    float back = smoothstep(0.2, 0.9, n.z);
    float belly = smoothstep(-0.1, -0.8, n.z);
    // Its hair lies along its body, in strokes; and catches the light at its edge, as a coat does.
    s.albedo = mix(mix(base, base * (tint >= 0.75 ? 0.85 : 0.65), back), vec3(0.62, 0.56, 0.46), belly * 0.65) * (0.76 + 0.46 * noiseS(vLocal, vec3(0.012, 0.14, 0.012))) * (0.9 + 0.2 * noiseM(vLocal, 0.2));
    s.albedo *= 1.0 + 0.45 * pow(1.0 - abs(dot(n, normalize(uEye - p))), 3.0);
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
    s.albedo = mix(mix(base, base * 0.7, back), vec3(0.62, 0.58, 0.50), belly * 0.6) * (0.78 + 0.44 * noiseS(vLocal, vec3(0.018, 0.09, 0.018)));
    s.albedo *= 1.0 + 0.3 * pow(1.0 - abs(dot(n, normalize(uEye - p))), 3.0);
    s.rough = 0.82;
  } else if (m == MEMBRANE) {
    // A wing's skin: thin, leathery and a little see-through against the light.
    vec3 base = mix(vec3(0.26, 0.17, 0.11), vec3(0.42, 0.29, 0.17), tint);
    s.albedo = base * (0.8 + 0.34 * noiseS(p, vec3(0.3, 0.04, 0.3)));
    s.rough = 0.62;
#endif
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
#ifndef MESH_ONLY_BUILT
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
#endif
  } else if (m == FROND) {
    // Veined blades: fans and fronds, with a glossy side.
    vec3 dark = mix(vec3(0.05, 0.11, 0.035), vec3(0.075, 0.13, 0.04), tint);
    vec3 lite = mix(vec3(0.16, 0.25, 0.07), vec3(0.25, 0.30, 0.085), tint);
    float vein = abs(fract(uv.x + 0.5) - 0.5) * 2.0;
    s.albedo = mix(dark, lite, 0.42 + 0.5 * vein * visible(0.1, fw)) * (0.8 + 0.4 * noiseM(p, 0.22));
    s.rough = 0.56;
#ifndef MESH_ONLY_BUILT
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
#endif
  } else if (m == BARK || m == FALLEN_BARK) {
    // Bark, laid along a limb (world/generators/life/plants.ts, tube): u counts ridges round it, a whole number of
    // them; v is metres along it, and its thousands say which bark: 0 furrowed, 1 smooth, 2 in scales, 3 in diamond
    // cushions, 4 ringed, 5 ribbed and jointed. Which a plant has follows from its part's type; how each looks is
    // this, and nobody's record. Its unevenness is read in the world, so that it runs round a limb with no seam.
    float kind = floor(uv.y / 1000.0 + 0.001);
    float v = uv.y - kind * 1000.0;
    // Fallen wood keeps its tree's own tone, which is its mesh's: what each piece adds to it is how long it has lain.
    float bt = m == FALLEN_BARK ? vKind : tint;
    vec3 base = mix(vec3(0.17, 0.13, 0.095), vec3(0.31, 0.22, 0.14), bt);
    base = mix(base, vec3(dot(base, vec3(0.333))) * vec3(1.03, 1.0, 0.95), 0.4 * fract(bt * 7.3));
    // Its ridges show while each is a few pixels wide; finer than that they are left out, so that nothing shimmers.
    float near = (1.0 - smoothstep(14.0, 50.0, length(uEye - p))) * (1.0 - smoothstep(0.12, 0.4, fw));
    float fine = noiseS(p, vec3(0.012, 0.012, 0.3));
    float h = 0.6;
    if (near > 0.0) {
      float wander = (noiseM(p, 0.3) - 0.5) * 2.2 + (noiseS(p, vec3(0.06, 0.06, 0.5)) - 0.5) * 0.9;
      if (kind < 0.5) {
        // Ridges along the limb, wandering, parting and joining, each broken across here and there, nowhere in line
        // with its neighbour's breaks.
        float ph = uv.x + wander;
        float furrow = smoothstep(0.5, 0.92, abs(fract(ph) - 0.5) * 2.0);
        float cv = v / (0.2 + 0.25 * hash(vec2(floor(ph), 5.0))) + hash(vec2(floor(ph), 3.0)) * 9.0 + (noiseM(p, 0.12) - 0.5) * 1.5;
        float crack = (1.0 - smoothstep(0.02, 0.08, abs(fract(cv) - 0.5))) * step(0.4, hash(vec2(floor(ph), floor(cv))));
        h = (1.0 - 0.85 * furrow) * (1.0 - 0.4 * crack) * (0.7 + 0.3 * fine);
      } else if (kind < 1.5) {
        // Smooth, with short marks across it.
        float lv = v / 0.03;
        float mark = step(0.72, hash(vec2(floor(uv.x * 1.5 + wander * 0.3), floor(lv)))) * (1.0 - smoothstep(0.1, 0.3, abs(fract(lv) - 0.5)));
        h = 0.85 - 0.5 * mark + 0.15 * (noiseM(p, 0.08) - 0.5);
      } else if (kind < 2.5) {
        // Scales, each lapping the one above: the bases of old leaves, or plates of bark.
        float row = floor(v / 0.07);
        vec2 f = vec2(fract(uv.x * 1.3 + mod(row, 2.0) * 0.5 + wander * 0.15), fract(v / 0.07));
        float edge = max(abs(f.x - 0.5) * 2.0, 1.0 - f.y);
        h = (1.0 - smoothstep(0.7, 1.0, edge)) * (0.45 + 0.55 * f.y);
      } else if (kind < 3.5) {
        // Cushions in two crossing spirals, each a diamond with a scar at its middle.
        vec2 d = vec2(uv.x * 1.6 + v / 0.05, uv.x * 1.6 - v / 0.05);
        vec2 f = abs(fract(d) - 0.5) * 2.0;
        float edge = max(f.x, f.y);
        h = (1.0 - smoothstep(0.72, 0.98, edge)) * (0.6 + 0.4 * (1.0 - edge)) - 0.35 * (1.0 - smoothstep(0.1, 0.22, edge));
      } else if (kind < 4.5) {
        // Rings where leaves were shed, close together, and fibres along the stem between them.
        float ring = abs(fract(v / 0.085 + wander * 0.12) - 0.5) * 2.0;
        h = 0.35 + 0.65 * smoothstep(0.0, 0.5, ring) * (0.7 + 0.3 * fine);
      } else {
        // Fine ribs along the stem, and a joint across it at every few hands.
        float rib = abs(fract(uv.x * 2.5) - 0.5) * 2.0;
        float joint = 1.0 - smoothstep(0.0, 0.06, abs(fract(v / 0.42) - 0.5));
        h = (0.5 + 0.5 * rib) * (1.0 - 0.7 * joint);
      }
    }
    h = mix(0.6, h, near);
    s.albedo = base * (0.4 + 0.85 * h) * (0.82 + 0.36 * fine) * (0.86 + 0.28 * fbmM(p, 1.3));
    // Lichen and damp, in patches, the more the paler the bark.
    s.albedo = mix(s.albedo, vec3(0.2, 0.22, 0.15) * (0.6 + 0.6 * h), 0.3 * smoothstep(0.55, 0.78, fbmM(p + 3.7, 0.9)));
    if (m == FALLEN_BARK) {
      // Wood that lies greys as it dries and rots, each piece as long as it has lain; what grows low takes its upper
      // side, in the place's own tone for it; and it is dark and damp where it meets the ground.
      float lain = fract(vTint - vKind + 1.0);
      s.albedo = mix(s.albedo, vec3(dot(s.albedo, vec3(0.333))) * vec3(1.02, 1.0, 0.96), 0.1 + 0.4 * lain) * (0.86 - 0.22 * lain);
      float grown = smoothstep(0.42, 0.66, fbmM(p + 11.0, 0.45)) * smoothstep(0.15, 0.75, n.z) * (0.25 + 0.75 * lain);
      vec3 moss = uWild > 0.5 ? mix(uTone[2], uTone[3], 0.35) * 0.8 : vec3(0.09, 0.12, 0.05);
      s.albedo = mix(s.albedo, moss * (0.7 + 0.5 * h), 0.6 * grown);
      s.albedo *= 0.62 + 0.38 * smoothstep(0.0, 0.12, vLow);
    }
    s.rough = 0.92;
    if (near > 0.0) bumpN = bumpBy(n, vRel, h, 0.014 * near);
  } else if (m == HEARTWOOD) {
    // Wood where a trunk or a limb broke: pale where the break is fresh and grey where it has weathered, each piece as
    // long as it has lain; its rings, a finger apart, from the middle of the break out; and its grain along the limb.
    float lain = fract(vTint - vKind + 1.0);
    vec3 fresh = mix(vec3(0.25, 0.165, 0.085), vec3(0.33, 0.23, 0.12), vKind);
    vec3 old = vec3(0.17, 0.155, 0.135);
    float ring = 0.5 + 0.5 * sin(length(uv) * 330.0 + noiseM(p, 0.06) * 5.0);
    float splinter = noiseS(vLocal, vec3(0.01, 0.01, 0.01) + abs(n) * 0.2);
    s.albedo = mix(fresh, old, 0.25 + 0.65 * lain) * (0.78 + 0.26 * ring * visible(0.02, fw)) * (0.7 + 0.5 * splinter);
    s.albedo *= 0.62 + 0.38 * smoothstep(0.0, 0.12, vLow);
    s.rough = 0.9;
  } else if (m == STONE) {
    // A stone standing on the ground (world/generators/life/strewn.ts): of what the terrain draws the ground's own
    // stones of, the two tones of its gravel, each stone a shade of its own between and about them; or, where nothing
    // says what the ground is made of, of the rock under the place. Its grain is the scanned rock's, read on its own
    // faces, from above where they face up and from the side where they do not, each stone from a place of its own in
    // the scan. Where it meets the ground, and in the lee of its top, the ground's own bare colour lies banked on it.
    float own = tint;
    bool said = dot(uSubTone[3], vec3(1.0)) > 0.0;
    vec3 tone = said ? mix(uSubTone[2], uSubTone[3], fract(own * 7.0)) : uRock[1];
    tone *= 0.62 + 0.7 * fract(own * 37.0);
    vec3 q = vLocal + vec3(own * 31.0, own * 17.0, own * 5.0);
    vec4 above = builtGrain(M_ROCK, q.xy, 0.5, p);
    vec4 beside = builtGrain(M_ROCK, vec2(q.x + q.y, q.z), 0.5, p);
    vec4 g = mix(beside, above, smoothstep(0.45, 0.75, abs(n.z)));
    s.albedo = tone * g.rgb * (0.86 + 0.28 * noiseM(q, 0.07));
    // Each stone is dusted with it as much as its own number says, on the faces that look up: one is dark and clean,
    // the next the colour of the ground it lies on.
    vec3 dust = mix(uTone[4], uTone[5], 0.5) * g.rgb;
    float foot = 1.0 - smoothstep(0.0, 0.035, vLow);
    float lee = smoothstep(0.55, 0.95, n.z) * smoothstep(0.45, 0.7, noiseM(q, 0.11));
    float dusted = (0.1 + 0.6 * fract(own * 13.0)) * smoothstep(-0.3, 0.7, n.z);
    s.albedo = mix(s.albedo, dust, uWild * max(max(0.75 * foot, 0.4 * lee), dusted));
    s.rough = 0.86;
    float close = 1.0 - smoothstep(10.0, 40.0, length(uEye - p));
    if (close > 0.0) bumpN = bumpBy(n, vRel, g.a, 0.01 * close);
  } else if (m == 72) {
    // An eye: dark and wet.
    s.albedo = vec3(0.016, 0.012, 0.009);
    s.rough = 0.08;
  } else if (m == DARK) {
    s.albedo = vec3(0.012, 0.011, 0.01);
    s.rough = 0.9;
  } else if (m == POOL) {
    s.albedo = vec3(0.03, 0.06, 0.055);
    s.rough = 0.1;
  } else if (m == PAVING) {
    vec2 c = courses(uv, vec2(1.8, 1.05));
    vec3 rome = mix(vec3(0.62, 0.58, 0.50), vec3(0.76, 0.74, 0.68), tint);
    vec3 village = mix(vec3(0.28, 0.25, 0.20), vec3(0.46, 0.42, 0.35), tint);
    vec3 base = mix(rome, village, uWild);
    base *= 0.82 + 0.26 * c.y;
    base *= mix(1.0, 0.6 + 0.4 * smoothstep(0.012, 0.04, c.x), visible(0.4, fw));
    base *= mix(0.76, 1.0, smoothstep(0.26, 0.6, fbmM(p, 6.0)));
    base *= 0.94 + 0.12 * noiseM(p, 0.06) * visible(0.06, fw);
    s.albedo = base;
    s.rough = mix(0.7, 0.88, uWild);
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
    vec3 col = mix(vec3(0.74, 0.64, 0.47), mix(vec3(0.28, 0.22, 0.14), vec3(0.46, 0.38, 0.26), tint), uWild);
    s.albedo = col * (0.8 + 0.4 * fbmM(p, 1.6));
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
    // Cloth hangs in folds, down its length: darker in them, and the light is bumped across them; its weave close by.
    float folds = noiseS(vLocal, vec3(0.035, 0.035, 0.5)) * 0.65 + noiseS(vLocal + 3.0, vec3(0.09, 0.09, 0.9)) * 0.35;
    float weave = noiseM(vLocal, 0.006);
    s.albedo = c * (0.72 + 0.42 * folds) * (0.92 + 0.16 * weave) * (0.9 + 0.2 * noiseM(p, 0.3));
    s.rough = 0.95;
    float near = 1.0 - smoothstep(15.0, 60.0, length(uEye - p));
    if (near > 0.0) bumpN = bumpBy(n, vRel, folds, 0.02 * near);
  } else if (m == SKIN) {
    s.albedo = mix(vec3(0.47, 0.31, 0.22), vec3(0.28, 0.18, 0.12), tint) * (0.92 + 0.16 * noiseM(vLocal, 0.05));
    s.rough = 0.62;
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

// What houses are built of (world/generators/city/kit.ts, from 50), and their thatch and mud. A pattern is laid in the
// house's own frame (q, in metres, z up from its foot) and along its walls and up its roofs (uv, in metres), so that
// planks, courses and weaves stay with the house however it is turned; weather is laid in the world (p). The colours are
// the renderer's, and nobody's record: what a house was built of is its tradition's claim, what colour that was is not.
const int WATTLE=50, LIMEWASH=51, HALFTIMBER=52, LOGS=53, PLANKS=54, RUBBLE=55, MATTING=56, FELT=57, TANNED=58, HAIRCLOTH=59, SOD=60, SNOW=61, EARTHROOF=62, SHINGLE=63, LEAFTHATCH=64, BRUSHWOOD=65, REEDWORK=66, ROPE=67, PAINTED=68, ADOBE=69, CLAYTILE=70;

bool isBuilt(int m) { return (m >= 50 && m < STONE) || m == THATCH || m == MUD; }

// Old wood goes grey where the weather reaches it.
vec3 weathered(vec3 wood, vec3 p, float age) {
  return mix(wood, vec3(0.34, 0.32, 0.29) * (0.8 + 0.4 * noiseM(p, 0.3)), (0.2 + 0.5 * age) * smoothstep(0.35, 0.75, fbmM(p + 5.0, 1.8)));
}

// Splash and damp at the foot of a wall, streaks down it from its top.
vec3 walled(vec3 c, vec3 p, vec3 q, float stain) {
  float foot = 1.0 - smoothstep(0.0, 0.5 + 0.5 * noiseM(p, 0.8), q.z);
  c = mix(c, c * vec3(0.64, 0.58, 0.50), foot * stain);
  float streak = smoothstep(0.5, 0.85, noiseS(p, vec3(0.2, 0.2, 3.0)));
  return c * (1.0 - 0.13 * streak * stain);
}

Surface built(int m, vec3 q, vec3 p, vec2 uv, float tint, vec3 n, float fw, out vec3 bumpN) {
  Surface s;
  s.rough = 0.93;
  s.metal = 0.0;
  s.bump = 0.0;
  bumpN = n;
  // Each house its own age and its own shade, from its tint.
  float age = fract(tint * 11.3);
  float shade = fract(tint * 29.7);
  // How close it is: its finest grain shows only close by.
  float near = 1.0 - smoothstep(12.0, 45.0, length(uEye - p));
  if (m == THATCH) {
    // Thatch of straw, grass or reed: bundles in courses down the slope, their butts ragged; gold when new, grey-brown
    // and mossy when old.
    vec3 straw = mix(vec3(0.50, 0.40, 0.20), vec3(0.27, 0.24, 0.17), 0.2 + 0.65 * age);
    float lap = fract((uv.y + 0.06 * noiseM(p, 0.3)) / 0.42);
    float vis = visible(0.42, fw);
    straw *= mix(0.92, 0.68 + 0.36 * smoothstep(0.0, 0.34, lap), vis);
    float near = visible(0.03, fw);
    straw *= mix(0.96, 0.7 + 0.52 * noiseS(p, vec3(0.025, 0.025, 0.6)), near);
    straw = mix(straw, vec3(0.19, 0.23, 0.10), smoothstep(0.56, 0.8, fbmM(p + 11.0, 1.9)) * age * 0.6);
    s.albedo = straw * (0.84 + 0.32 * fbmM(p, 1.3));
    s.rough = 0.96;
    // Each course stands proud of the one below it, and its straws run down the slope.
    s.bump = (1.0 - lap) * 0.7 * vis + noiseS(p, vec3(0.012, 0.012, 0.5)) * 0.5 * near;
  } else if (m == MUD) {
    // Mud plaster, cob or rammed earth: smoothed by hand, runnelled by rain, dark at its foot.
    vec3 earth = mix(vec3(0.52, 0.42, 0.30), vec3(0.41, 0.32, 0.23), shade);
    earth *= 0.84 + 0.28 * fbmM(p, 0.9);
    earth *= 0.93 + 0.14 * noiseM(p, 0.07) * visible(0.07, fw);
    // The lifts it was built up in, faintly.
    earth *= 1.0 - 0.06 * smoothstep(0.86, 0.97, fract(q.z / 0.5)) * visible(0.3, fw);
    // Its grain is the earth's own; cracked a little where it has dried.
    vec4 g = builtGrain(M_EARTH, vec2(uv.x, q.z), 0.7, p);
    vec4 c2 = builtGrain(M_CRACKED, vec2(uv.x, q.z) + 3.7, 1.6, p);
    float dried = smoothstep(0.5, 0.75, fbmM(p + 6.0, 1.7));
    s.albedo = walled(earth, p, q, 0.7) * mix(g.rgb, c2.rgb, dried * 0.7);
    s.bump = mix(g.a, c2.a, dried * 0.7) * 1.2 + fbmM(p, 0.35) * 0.9;
  } else if (m == ADOBE) {
    // Sun-dried bricks in their courses, in mud mortar.
    vec3 earth = mix(vec3(0.53, 0.43, 0.31), vec3(0.43, 0.34, 0.25), shade);
    vec2 c = courses(vec2(uv.x, q.z), vec2(0.4, 0.12));
    float vis = visible(0.12, fw);
    earth *= mix(0.94, (0.84 + 0.26 * c.y) * (0.7 + 0.3 * smoothstep(0.0, 0.014, c.x)), vis);
    earth *= 0.84 + 0.3 * fbmM(p, 1.0);
    // Each brick's own grain, and its face a little proud of its mortar, its edges worn round.
    vec4 g = builtGrain(M_EARTH, vec2(uv.x, q.z), 0.5, p);
    s.albedo = walled(earth, p, q, 0.8) * g.rgb;
    s.bump = smoothstep(0.0, 0.03, c.x) * vis * 1.3 + g.a * 0.8 + c.y * 0.3 * vis;
  } else if (m == WATTLE) {
    // Rods woven round stakes.
    float row = floor(q.z / 0.05);
    float weave = 0.5 + 0.5 * cos((uv.x / 0.42 + mod(row, 2.0) * 0.5) * 6.2831853);
    float rod = abs(fract(q.z / 0.05) - 0.5) * 2.0;
    vec3 base = mix(vec3(0.31, 0.24, 0.15), vec3(0.42, 0.33, 0.21), shade);
    base *= mix(0.86, (0.6 + 0.4 * weave) * (1.0 - 0.5 * rod * rod), visible(0.05, fw));
    s.albedo = weathered(base, p, age) * (0.8 + 0.4 * fbmM(p, 1.1));
    s.bump = (weave * (1.0 - rod * rod)) * visible(0.05, fw) * 1.6;
  } else if (m == LIMEWASH || m == PAINTED) {
    // Lime on a wall: white, stained at its foot, flaked in patches to the daub beneath. Painted, it has bands of red
    // earth: a dado, or stripes.
    vec3 base = mix(vec3(0.80, 0.78, 0.71), vec3(0.87, 0.85, 0.79), shade);
    if (m == PAINTED) {
      // Mineral-earth painted plaster: warm cream/buff limewash with an ochre or terracotta dado band and subtle frieze trim.
      vec3 wash = mix(vec3(0.76, 0.71, 0.62), vec3(0.68, 0.58, 0.45), smoothstep(0.35, 0.85, age));
      base = mix(base, wash, 0.55);
      vec3 pigment = mix(vec3(0.45, 0.19, 0.11), vec3(0.50, 0.32, 0.16), smoothstep(0.45, 0.85, shade)) * (0.86 + 0.28 * noiseM(p, 0.5));
      float dado = 1.0 - smoothstep(0.68, 0.74, q.z);
      float frieze = smoothstep(2.55, 2.60, q.z) * (1.0 - smoothstep(2.74, 2.79, q.z));
      base = mix(base, pigment, clamp(dado * 0.82 + frieze * 0.55 * step(0.45, age), 0.0, 1.0));
    }
    base *= 0.86 + 0.2 * fbmM(p, 1.6);
    float worn = smoothstep(0.64, 0.76, fbmM(p + 3.1, 0.9));
    base = mix(base, vec3(0.50, 0.41, 0.29), worn * (0.25 + 0.4 * age));
    // The wash follows the wall under it: an earth wall's unevenness shows through, and where it has flaked it lies lower.
    vec4 g = builtGrain(M_EARTH, vec2(uv.x, q.z), 0.9, p);
    s.albedo = walled(base, p, q, 0.9) * mix(vec3(1.0), g.rgb, 0.35 + 0.5 * worn);
    s.bump = g.a * 0.6 + fbmM(p, 0.4) * 0.8 - worn * 0.5;
    s.rough = 0.88;
  } else if (m == HALFTIMBER) {
    // A frame of timber, its panels filled and daubed: posts, rails, and a brace in a panel here and there.
    float post = abs(fract(uv.x / 1.3 + 0.5) - 0.5) * 1.3;
    float rail = abs(fract(q.z / 1.15 + 0.5) - 0.5) * 1.15;
    vec2 cell = floor(vec2(uv.x / 1.3, q.z / 1.15));
    vec2 f = fract(vec2(uv.x / 1.3, q.z / 1.15));
    float brace = hash(cell) < 0.28 ? abs(f.x - (hash(cell + 7.0) < 0.5 ? f.y : 1.0 - f.y)) * 0.85 : 1.0;
    float timber = 1.0 - smoothstep(0.065, 0.085, min(min(post, rail), brace));
    vec3 wood = weathered(vec3(0.17, 0.12, 0.08) * (0.7 + 0.6 * noiseS(p, vec3(0.03, 0.03, 0.4))), p, age);
    vec3 daub = mix(vec3(0.70, 0.64, 0.50), vec3(0.80, 0.76, 0.66), shade) * (0.86 + 0.2 * fbmM(p, 1.4));
    daub = walled(daub, p, q, 0.8);
    float vis = visible(0.5, fw);
    s.albedo = mix(mix(daub, wood, 0.2), mix(daub, wood, timber), vis);
    // The timbers stand proud of their panels.
    s.bump = timber * vis * 1.5 + (1.0 - timber) * fbmM(p, 0.3) * 0.5;
  } else if (m == LOGS) {
    // Logs laid one on another: each round, with the seam between them in shadow.
    float t = fract(q.z / 0.22);
    float vis = visible(0.22, fw);
    vec3 base = mix(vec3(0.31, 0.21, 0.13), vec3(0.40, 0.29, 0.18), shade) * (0.7 + 0.5 * noiseS(p.zxy, vec3(0.04, 0.6, 0.6)));
    base *= mix(0.86, 0.42 + 0.62 * sin(t * 3.14159), vis);
    bumpN = normalize(n + vec3(0.0, 0.0, 1.0) * (t - 0.5) * 1.1 * vis);
    s.albedo = weathered(base, p, age);
    s.rough = 0.88;
  } else if (m == PLANKS) {
    // Boards, upright, with the gaps between them.
    float a = fract(uv.x / 0.26);
    float id = hash(vec2(floor(uv.x / 0.26), 3.0));
    vec3 base = mix(vec3(0.34, 0.24, 0.15), vec3(0.43, 0.33, 0.23), shade) * (0.8 + 0.28 * id);
    base *= 0.72 + 0.5 * noiseS(p, vec3(0.03, 0.03, 0.6));
    base *= mix(0.92, 0.5 + 0.5 * smoothstep(0.0, 0.07, min(a, 1.0 - a)), visible(0.26, fw));
    s.albedo = weathered(base, p, age);
    s.rough = 0.88;
    // Each board a little cupped, a gap between it and the next, and its grain along it.
    s.bump = smoothstep(0.0, 0.05, min(a, 1.0 - a)) * visible(0.26, fw) * 1.5 + noiseS(p, vec3(0.012, 0.012, 0.6)) * 0.4 * near;
  } else if (m == RUBBLE) {
    // Rough stone, laid dry or in mud: stones of many sizes in wandering courses.
    vec2 w = vec2(uv.x + 0.14 * noiseM(p, 0.5), q.z + 0.06 * noiseM(p + 2.0, 0.4));
    vec2 c = courses(w, vec2(0.46, 0.2));
    vec3 stone = mix(vec3(0.38, 0.36, 0.33), vec3(0.56, 0.52, 0.45), c.y);
    stone = mix(stone, stone * vec3(1.08, 0.98, 0.84), shade);
    float vis = visible(0.2, fw);
    stone *= mix(0.84, 0.4 + 0.6 * smoothstep(0.0, 0.024, c.x), vis);
    stone *= 0.8 + 0.4 * fbmM(p, 0.7);
    // Lichen and moss where it is damp.
    stone = mix(stone, vec3(0.30, 0.33, 0.20), smoothstep(0.62, 0.8, fbmM(p + 8.0, 1.4)) * 0.4);
    // Each stone has the rock's own face, and stands out of its joints.
    vec4 g = builtGrain(M_ROCK, vec2(uv.x, q.z), 0.6, p);
    s.albedo = stone * g.rgb;
    s.bump = smoothstep(0.0, 0.05, c.x) * vis * 2.2 + c.y * 0.8 * vis + g.a * 0.8;
    s.rough = 0.95;
  } else if (m == MATTING) {
    // Mats woven of split bamboo, palm leaf or grass, lashed on in sheets.
    vec2 g = uv / 0.11;
    float ch = mod(floor(g.x) + floor(g.y), 2.0);
    float strand = ch > 0.5 ? abs(fract(g.x * 3.0) - 0.5) : abs(fract(g.y * 3.0) - 0.5);
    vec3 base = mix(vec3(0.52, 0.44, 0.25), vec3(0.42, 0.37, 0.24), 0.2 + 0.6 * age);
    base *= mix(0.94, (0.76 + 0.24 * ch) * (0.78 + 0.44 * strand), visible(0.11, fw));
    float seam = abs(fract(uv.x / 1.8 + 0.5) - 0.5) * 1.8;
    base *= mix(1.0, 0.62 + 0.38 * smoothstep(0.0, 0.05, seam), visible(0.4, fw));
    s.albedo = base * (0.82 + 0.36 * fbmM(p, 1.3));
    s.bump = (ch * 0.6 + strand * 0.8) * visible(0.11, fw);
  } else if (m == FELT) {
    // Felt: pale, soft, grimed at its foot and smoked at its top.
    vec3 base = mix(vec3(0.63, 0.60, 0.53), vec3(0.74, 0.72, 0.66), shade);
    base *= 0.86 + 0.22 * fbmM(p, 0.9);
    base *= 0.95 + 0.1 * noiseM(p, 0.04) * visible(0.04, fw);
    float dirt = 1.0 - smoothstep(0.0, 0.7, q.z);
    base = mix(base, base * vec3(0.70, 0.64, 0.54), dirt * 0.6);
    // The edges of its sheets, where one laps the next.
    float lap = abs(fract(uv.x / 2.1 + 0.5) - 0.5) * 2.1;
    base *= mix(1.0, 0.86 + 0.14 * smoothstep(0.0, 0.04, lap), visible(0.4, fw));
    s.albedo = base;
    s.rough = 0.97;
    // Soft, sagging a little between its ropes and poles.
    s.bump = fbmM(p, 0.45) * 1.4 + smoothstep(0.0, 0.04, lap) * 0.4;
  } else if (m == TANNED) {
    // Hides sewn together: each its own shade, the seams between them, the top dark with smoke.
    vec2 c = courses(vec2(uv.x + 0.2 * noiseM(p, 0.7), uv.y), vec2(1.5, 1.15));
    vec3 base = mix(vec3(0.50, 0.40, 0.27), vec3(0.63, 0.54, 0.39), shade) * (0.84 + 0.22 * c.y);
    base *= mix(1.0, 0.58 + 0.42 * smoothstep(0.0, 0.03, c.x), visible(0.5, fw));
    base = mix(base, base * vec3(0.36, 0.31, 0.27), smoothstep(2.4, 4.4, q.z) * 0.8);
    s.albedo = base * (0.85 + 0.3 * fbmM(p, 0.8));
    s.rough = 0.8;
    s.bump = fbmM(p, 0.5) * 1.3 + smoothstep(0.0, 0.03, c.x) * 0.7;
  } else if (m == HAIRCLOTH) {
    // Cloth woven of goat's or yak's hair, in long strips sewn edge to edge: near black, browner where it has worn.
    vec3 base = mix(vec3(0.045, 0.04, 0.035), vec3(0.09, 0.075, 0.058), shade);
    float strip = abs(fract(uv.x / 0.7 + 0.5) - 0.5) * 0.7;
    base *= mix(1.0, 0.66 + 0.34 * smoothstep(0.0, 0.03, strip), visible(0.3, fw));
    base *= mix(1.0, 0.78 + 0.44 * noiseM(p, 0.012), visible(0.012, fw));
    s.albedo = base * (0.72 + 0.6 * fbmM(p, 0.6));
    s.rough = 0.97;
    s.bump = fbmM(p, 0.6) * 1.5 + smoothstep(0.0, 0.03, strip) * 0.5;
  } else if (m == SOD) {
    // Turf: grass where it faces the sky, and cut sods in their courses where it is a wall.
    float up = smoothstep(0.35, 0.7, n.z);
    vec3 grass = mix(vec3(0.15, 0.21, 0.08), vec3(0.30, 0.31, 0.13), fbmM(p, 2.0)) * (0.84 + 0.32 * noiseM(p, 0.2));
    vec3 earth = mix(vec3(0.20, 0.16, 0.10), vec3(0.29, 0.23, 0.15), shade) * (0.8 + 0.4 * noiseM(p, 0.25));
    float vis = visible(0.14, fw);
    vec3 side = mix(earth, grass * 0.8, smoothstep(0.7, 0.95, fract(q.z / 0.14)) * vis + 0.25 * (1.0 - vis));
    vec4 g = builtGrain(M_SOIL, vec2(uv.x, q.z), 0.8, p);
    s.albedo = mix(side * g.rgb, grass, up);
    s.rough = 0.96;
    s.bump = mix(g.a * 1.2 + smoothstep(0.0, 0.2, fract(q.z / 0.14)) * 0.8 * vis, noiseM(p, 0.12) * 1.2, up);
  } else if (m == SNOW) {
    // Blocks of snow, their joints faint.
    vec2 c = courses(uv, vec2(0.8, 0.42));
    vec3 base = vec3(0.84, 0.89, 0.95) * (0.92 + 0.1 * c.y);
    base *= mix(1.0, 0.8 + 0.2 * smoothstep(0.0, 0.03, c.x), visible(0.42, fw));
    s.albedo = base * (0.94 + 0.1 * fbmM(p, 1.2));
    s.rough = 0.55;
  } else if (m == EARTHROOF) {
    // Earth over beams and matting: dry, cracked, with weeds where it holds the rain.
    vec3 earth = mix(vec3(0.47, 0.39, 0.28), vec3(0.40, 0.33, 0.24), shade) * (0.84 + 0.3 * fbmM(p, 1.1));
    float weeds = smoothstep(0.58, 0.72, fbmM(p + 9.0, 1.7)) * smoothstep(0.3, 0.8, n.z);
    earth = mix(earth, vec3(0.30, 0.30, 0.14) * (0.8 + 0.4 * noiseM(p, 0.2)), weeds * 0.7);
    float crack = 1.0 - smoothstep(0.0, 0.035, abs(noiseM(p, 0.5) - 0.5));
    vec4 g = builtGrain(M_CRACKED, p.xy, 1.3, p);
    s.albedo = earth * (1.0 - 0.3 * crack * visible(0.1, fw) * (1.0 - uMaterials)) * g.rgb;
    s.bump = g.a * 1.6 + fbmM(p, 0.6) * 0.8;
  } else if (m == SHINGLE) {
    // Shingles or boards on a roof: rows lapping down the slope, weathered grey.
    vec2 g = uv / vec2(0.15, 0.32);
    float row = floor(g.y);
    float x = g.x + mod(row, 2.0) * 0.5;
    float a = fract(x);
    vec3 base = mix(vec3(0.31, 0.26, 0.21), vec3(0.42, 0.39, 0.35), 0.2 + 0.7 * age) * (0.8 + 0.4 * hash(vec2(floor(x), row)));
    float vis = visible(0.15, fw);
    base *= mix(0.9, (0.58 + 0.42 * smoothstep(0.0, 0.08, min(a, 1.0 - a))) * (0.7 + 0.3 * smoothstep(0.0, 0.14, fract(g.y))), vis);
    s.albedo = base * (0.8 + 0.4 * fbmM(p, 1.8));
    s.rough = 0.9;
    // Each laps the row below: thick at its butt, thin where the next covers it.
    s.bump = (1.0 - fract(g.y)) * vis * 1.4 + smoothstep(0.0, 0.06, min(a, 1.0 - a)) * vis * 0.6;
  } else if (m == CLAYTILE) {
    // Fired tiles in rows down the slope, a ridge over each joint: dull red to grey, as the kiln left them.
    vec2 g = uv / vec2(0.3, 0.42);
    float a = fract(g.x);
    float prof = abs(a - 0.5) * 2.0;
    float vis = visible(0.3, fw);
    vec3 base = mix(vec3(0.33, 0.31, 0.30), vec3(0.42, 0.30, 0.24), shade * 0.6);
    base *= 0.78 + 0.44 * fbmM(p, 2.2);
    base *= mix(1.0, 0.82 + 0.34 * hash(vec2(floor(g.x), floor(g.y))), vis);
    base *= mix(0.88, 0.62 + 0.46 * pow(prof, 3.0), vis);
    base *= mix(1.0, 0.8 + 0.2 * smoothstep(0.0, 0.1, fract(g.y)), visible(0.42, fw));
    base = mix(base, base * vec3(0.7, 0.78, 0.66), smoothstep(0.5, 0.75, fbmM(p + 7.0, 4.5)) * 0.5);
    vec3 t = normalize(cross(vec3(0.0, 0.0, 1.0), n) + vec3(1e-4));
    bumpN = normalize(n + t * (a - 0.5) * 0.7 * vis);
    s.albedo = base;
    s.rough = 0.8;
  } else if (m == LEAFTHATCH) {
    // Leaves laid like tiles: each row's edge scalloped over the next, green when new and brown when dry.
    vec2 g = uv / vec2(0.28, 0.24);
    float row = floor(g.y);
    float x = g.x + mod(row, 2.0) * 0.5;
    float leaf = abs(fract(x) - 0.5) * 2.0;
    float edge = smoothstep(0.0, 0.2, fract(g.y) - 0.35 * leaf * leaf);
    vec3 dry = mix(vec3(0.34, 0.29, 0.14), vec3(0.25, 0.25, 0.13), shade);
    vec3 base = mix(dry, vec3(0.19, 0.27, 0.10), smoothstep(0.5, 0.75, fbmM(p + 4.0, 2.2)) * (1.0 - age) * 0.7);
    base *= 0.74 + 0.3 * hash(vec2(floor(x), row));
    base *= mix(0.9, (0.55 + 0.45 * edge) * (0.82 + 0.18 * (1.0 - leaf)), visible(0.24, fw));
    s.albedo = base * (0.82 + 0.36 * fbmM(p, 1.5));
    s.bump = (1.0 - fract(g.y)) * visible(0.24, fw) * 1.4 + (1.0 - leaf) * 0.5;
  } else if (m == BRUSHWOOD) {
    // Boughs and brushwood: a tangle of sticks, grey where it is dead thorn, with a little green where it still grows.
    vec3 base = mix(vec3(0.15, 0.125, 0.095), vec3(0.22, 0.18, 0.125), shade);
    float tw = noiseS(p, vec3(0.03, 0.2, 0.03)) * 0.5 + noiseS(p.yzx, vec3(0.03, 0.2, 0.03)) * 0.5;
    base = mix(base, vec3(0.10, 0.15, 0.06), smoothstep(0.55, 0.75, fbmM(p + 2.0, 0.7)) * 0.5);
    s.albedo = base * (0.45 + 1.1 * tw) * (0.8 + 0.4 * fbmM(p, 0.9));
    s.rough = 0.97;
    s.bump = tw * 2.4;
  } else if (m == REEDWORK) {
    // Reeds in bundles, bound at every few spans.
    vec3 base = mix(vec3(0.51, 0.43, 0.23), vec3(0.41, 0.36, 0.22), 0.2 + 0.6 * age);
    base *= mix(0.94, 0.66 + 0.6 * noiseS(p, vec3(0.02, 0.02, 0.9)), visible(0.03, fw));
    float bundle = abs(fract(uv.x / 0.24) - 0.5) * 2.0;
    base *= mix(1.0, 0.7 + 0.3 * (1.0 - bundle * bundle), visible(0.24, fw));
    float tie = abs(fract(uv.y / 0.7 + 0.5) - 0.5) * 0.7;
    base *= mix(1.0, 0.68 + 0.32 * smoothstep(0.0, 0.03, tie), visible(0.2, fw));
    s.albedo = base * (0.85 + 0.3 * fbmM(p, 1.6));
    // Bundles side by side, each round, bound in at its ties.
    s.bump = (1.0 - bundle * bundle) * visible(0.24, fw) * 1.6 - (1.0 - smoothstep(0.0, 0.03, tie)) * 0.6 + noiseS(p, vec3(0.012, 0.012, 0.8)) * 0.4 * near;
  } else if (m == ROPE) {
    s.albedo = vec3(0.21, 0.16, 0.10) * (0.7 + 0.6 * noiseM(p, 0.02));
    s.rough = 0.95;
  } else {
    s.albedo = vec3(0.6);
  }
  return s;
}
#endif

#ifndef MESH_ONLY_BUILT
// Leaves, on cards and in the mass inside a crown: patches across the crown as sun and age colour it, and each leaf as
// light as the atlas has it (0 to 1), with its twig in bark. Their colours are the renderer's, and nobody's record.
Surface leaves(int m, vec3 p, float tint, float light, float wood, float family) {
  Surface s;
  s.metal = 0.0;
  s.bump = 0.0;
  s.rough = 0.6;
  if (m == LEAF_MASS) {
    // The leaves behind the ones seen: dark, and flecked as leaves in shade are, so that it is no smooth lump.
    float fleck = noiseM(p, 0.11) * 0.55 + noiseM(p + 5.0, 0.3) * 0.45;
    s.albedo = mix(vec3(0.03, 0.06, 0.026), vec3(0.05, 0.08, 0.03), tint) * (0.45 + 0.9 * smoothstep(0.3, 0.75, fleck)) * (0.8 + 0.4 * fbmM(p, 1.5));
    s.rough = 0.9;
    return s;
  }
  if (m == CROP_CARD) {
    // A regional seasonal crop stand (world/generators/people/crops.ts): tint packs
    // (slot << 5) | (plotTone3 << 2) | ownShade2 into 0..255 so every botanical crop card matches its plot's palette slot.
    float v = floor(tint * 255.0 + 0.5);
    int slot = clamp(int(floor(v / 32.0)), 0, FIELD_SLOTS - 1);
    float tone = floor(mod(v, 32.0) / 4.0) / 7.0;
    float own = mod(v, 4.0) / 3.0;
    vec3 stand = mix(uSlotColor[slot].rgb, uSlotColor2[slot].rgb, tone);
    float state = uSlotMeta[slot].x;
    bool dry = state < 0.5 || (state > 2.5 && state < 3.5);
    // Sunlit panicles and leaf blades brighten relative to the shaded interior of the stand.
    s.albedo = mix(stand * (0.54 + 0.96 * light) * (0.86 + 0.28 * own), stand * 0.68, wood);
    s.rough = dry ? 0.78 : 0.48;
    return s;
  }
  vec3 dark = mix(vec3(0.028, 0.06, 0.024), vec3(0.052, 0.078, 0.022), tint);
  vec3 lite = mix(vec3(0.085, 0.14, 0.04), vec3(0.16, 0.185, 0.05), tint);
  bool blades = m == BLADE_CARD || m == BLADE;
  if (m == NEEDLE_CARD || (blades && family > 1.5 && family < 2.5)) {
    dark = mix(vec3(0.03, 0.064, 0.032), vec3(0.05, 0.085, 0.036), tint);
    lite = mix(vec3(0.075, 0.135, 0.05), vec3(0.135, 0.185, 0.06), tint);
    s.rough = 0.7;
  } else if (m == FROND_CARD || m == FAN_CARD || (blades && family < 1.5)) {
    dark = mix(vec3(0.05, 0.11, 0.035), vec3(0.075, 0.13, 0.04), tint);
    lite = mix(vec3(0.16, 0.25, 0.07), vec3(0.25, 0.30, 0.085), tint);
    s.rough = 0.5;
  }
  vec3 leaf = mix(dark, lite, clamp(0.3 * fbmM(p, 2.5) + light * 0.95 - 0.08, 0.0, 1.0));
  vec3 twig = mix(vec3(0.17, 0.13, 0.095), vec3(0.31, 0.22, 0.14), 0.4) * (0.5 + 0.9 * light);
  s.albedo = mix(leaf, twig, wood);
  s.rough = mix(s.rough, 0.9, wood);
  return s;
}

// A tuft's own blade close by (world/generators/life/plants.ts, tuft): how light it is, from its own number, darker at
// its foot and along its midrib; and whose colour it takes. Its uv is across the blade from −1 to 1, and in v's whole
// part its family by eight and its number, with the way up it in the fraction.
vec2 bladeLook(vec2 uv) {
  float k = floor(uv.y);
  float up = uv.y - k;
  float light = 0.18 + 0.4 * leafHash(vec2(mod(k, 8.0) + 2.0, 19.0)) + 0.34 * up - 0.1 * (1.0 - smoothstep(0.0, 0.3, abs(uv.x)));
  return vec2(light, floor(k / 8.0 + 0.001));
}

// Leaves are lit as the mass they make, by a normal bent out from their crown's middle, softly round the side away from
// the sun; on a card or a tuft's blade, with the light that comes through a leaf where the sun is behind it, and a little
// sheen of the sun on its own face, but none of the sky, which the leaves around it hide; and with as much of the sky as
// the crown lets in. g is the leaf's own face.
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
#endif

#ifndef MESH_ONLY_BUILT
#ifndef MESH_ONLY_FOLIAGE
// A body's skin close by (docs/plans/RENDERING.md, step 6): a height for its grain, in the body's own frame, as its
// material is: pebbled scales on a hide, hair lying along a body, feathers lapping back from the head, seams between a
// shell's scutes, the plates of chitin, the veins of a wing. Which a body has is its form's; how it looks is this.
float skinGrain(int m, vec3 q) {
  if (m == HIDE) {
    // Pebbled scales, and the creases round the body that the skin folds along.
    float a = texture(uNoise, q / (64.0 * 0.012)).r;
    float b = texture(uNoise, q / (64.0 * 0.035) + 0.3).g;
    float crease = abs(texture(uNoise, q / (64.0 * vec3(0.5, 0.05, 0.5))).g - 0.5) * 2.0;
    return smoothstep(0.35, 0.75, a) * 0.5 + b * 0.25 + smoothstep(0.0, 0.3, crease) * 1.6;
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
#endif
#endif

void main() {
  float vNLen = length(vN);
  vec3 n = vNLen > 1e-6 ? vN / vNLen : vec3(0.0, 0.0, 1.0);
  // Compute screen-space derivatives before any branch or discard for well-defined 2x2 quad differentials.
  vec2 dux = dFdx(vUv);
  vec2 duy = dFdy(vUv);
#ifndef MESH_ONLY_BUILT
  vec3 dpx = dFdx(vRel);
  vec3 dpy = dFdy(vRel);
#endif
#ifndef MESH_ONLY_FOLIAGE
  float fw = max(length(dux), length(duy));
  float glass = 0.0;
  vec3 bumped = n;
#endif
  float alpha = 1.0;
#ifndef MESH_ONLY_BUILT
  bool card = onCard(vMaterial);
  // A tuft's own blades are thin leaves, lit as the leaves on cards are (world/generators/life/forms.ts, tuft): by the
  // tuft's normal on either side, with the sun through them and none of the sky mirrored, and never holed.
  bool blade = vMaterial == BLADE;
#ifndef MESH_ONLY_FOLIAGE
  bool leafy = card || blade || vMaterial == LEAF_MASS;
#endif
  // How light a leaf is, how much of it is twig, how its face leans across its card, and whose colour a blade takes.
  float leafLight = 0.6;
  float leafWood = 0.0;
  float leafLean = 0.0;
  float family = 0.0;
  if (card) {
    vec4 t = leafTexelGrad(vUv, dux, duy);
    leafLight = t.r;
    leafWood = t.g;
    leafLean = t.b * 2.0 - 1.0;
    if (uCoverage < 0.5) {
      if (t.a < LEAF_CUT) discard;
    } else {
      float share = leafShare(t.a) * vInstFade;
      // Temporally stratified hashed alpha (IGN + Halton frame offset): resolved to smooth
      // anti-aliased leaf edges and screen-size fade-in by TAA without 4x MSAA overhead.
      float dither = fract(fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) + uFrameNoise);
      if (share <= 0.01 || share < 0.01 + 0.98 * dither) discard;
    }
  } else {
    if (uCoverage > 0.5 && vInstFade < 0.995) {
      float dither = fract(fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) + uFrameNoise);
      if (vInstFade <= 0.01 || vInstFade < dither) discard;
    }
    if (blade) {
      vec2 b = bladeLook(vUv);
      leafLight = b.x;
      family = b.y;
      leafLean = vUv.x * 0.5;
    }
  }
#else
#ifndef MESH_NO_DISCARD
  if (uCoverage > 0.5 && vInstFade < 0.995) {
    float dither = fract(fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) + uFrameNoise);
    if (vInstFade <= 0.01 || vInstFade < dither) discard;
  }
#endif
#endif
  Surface s;
#ifndef MESH_ONLY_BUILT
#ifndef MESH_ONLY_FOLIAGE
  if (leafy) {
#endif
    s = leaves(vMaterial, vPos, vTint, leafLight, leafWood, family);
    // On wild land a leaf takes most of its hue from its place's own tones, as the ground under it does: what grows low
    // from its low plants' tone, a crown from its canopy's. So a steppe's tufts are the straw of its ground and a
    // rainforest's ferns its dark green, and a plant and the ground from afar are of one colour. How light a leaf is
    // stays its own.
    // A crop is the colour of its plot, whatever grows wild about it.
    if (uWild > 0.5 && vMaterial != CROP_CARD) {
      const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
      float low = 1.0 - smoothstep(1.5, 4.5, vLow);
      vec3 place = mix(mix(uTone[6], uTone[7], leafLight), mix(uTone[2], uTone[3], leafLight), low);
      // As light as the leaf is, part of the way to as light as the place's tone, which is the mean of a whole stand.
      float lum = dot(s.albedo, LUMA);
      float plum = max(dot(place, LUMA), 1e-3);
      vec3 toned = place * (mix(lum, plum * 1.5, 0.45 * low) / plum);
      s.albedo = mix(s.albedo, toned, 0.62 * (1.0 - leafWood));
      // Each plant a shade of its own, and what grows low a little yellower or greener than its neighbour.
      float own = fract(vTint * 5.3);
      s.albedo *= 0.78 + 0.44 * own;
      s.albedo = mix(s.albedo, s.albedo * vec3(1.14, 1.0, 0.7), 0.55 * fract(vTint * 9.7) * low * (1.0 - leafWood));
    }
#ifndef MESH_ONLY_FOLIAGE
  } else
#endif
#endif
#ifndef MESH_ONLY_FOLIAGE
  if (vMaterial == FACADE) s = facade(vPos, vUv, vTint, fw, n, glass);
  else if (isBuilt(vMaterial)) {
    s = built(vMaterial, vLocal, vPos, vUv, vTint, n, fw, bumped);
    // What it is built of stands in relief, as each material says with a height: the light is bumped by it close by.
    float close = 1.0 - smoothstep(25.0, 90.0, length(uEye - vPos));
    if (s.bump != 0.0 && close > 0.0) bumped = bumpBy(bumped, vRel, s.bump, 0.012 * close);
  }
  else s = surface(vMaterial, vPos, vUv, vTint, n, fw, bumped);
#endif
#ifndef MESH_ONLY_BUILT
#ifndef MESH_ONLY_FOLIAGE
  bool skin = vMaterial == HIDE || vMaterial == FUR || vMaterial == FEATHER || vMaterial == CHITIN || vMaterial == MEMBRANE;
  if (skin) {
    // Close by, the grain of its skin, while a pixel is small enough to show it; and its pattern, at any distance.
    float near = 1.0 - smoothstep(4.0, 30.0, length(uEye - vPos));
    if (near > 0.0) bumped = bumpBy(bumped, vPos, skinGrain(vMaterial, vLocal), (vMaterial == FUR ? 0.0025 : 0.004) * near);
    float patStr = vMaterial == FUR && vTint >= 0.75 ? 0.14 : 0.38;
    if (vMaterial != MEMBRANE && vMaterial != CHITIN) s.albedo *= 1.0 - patStr * skinPattern(vLocal, vKind);
  }
#endif
#endif
  // The eye's side of a face.
  vec3 toEye = uEye - vPos;
#ifndef MESH_ONLY_BUILT
#ifndef MESH_ONLY_FOLIAGE
  // Foliage has holes in it, up close, where the leaves stop: fewer with distance, none once they would shimmer.
  if (vMaterial == BROAD || vMaterial == NEEDLE) {
    float span = vMaterial == BROAD ? 0.34 : 0.26;
    float gap = texture(uNoise, vPos / (64.0 * span)).r * 0.7 + texture(uNoise, vPos / (64.0 * span * 0.45)).g * 0.3;
    float reach = 1.0 - smoothstep(14.0, 70.0, length(toEye));
    if (gap < 0.46 * reach) discard;
  }
#endif
#endif
  float pixel = length(toEye) * 0.002;
  // Under the canopy, close to the ground, the sky's light is the forest floor's (docs/plans/RENDERING.md, step 4).
  float under = 1.0;
  if (uWild > 0.5 && vLow < 14.0) {
    vec2 muv = (vPos.xy - uMaskBox.xy) / uMaskBox.zw;
    if (muv.x > 0.0 && muv.y > 0.0 && muv.x < 1.0 && muv.y < 1.0) under = 1.0 - 0.72 * texture(uMask, muv).r * (1.0 - smoothstep(4.0, 14.0, vLow));
  }
  vec3 c;
#ifndef MESH_ONLY_BUILT
#ifndef MESH_ONLY_FOLIAGE
  if (leafy) {
#endif
    // A leaf's normal is its crown's, whichever side of it is seen; and what it sees of the sky is the crown's to say.
    float sh = shadowAt(vPos, n, pixel) * cloudShade(vPos);
    // Close to the ground a plant stands in its neighbours' shade: the foot of a tuft is dark, and its tips are lit.
    float foot = vLow < 100.0 ? 0.42 + 0.58 * smoothstep(0.0, 0.55, vLow) : 1.0;
    // Its own face, from the point's place from the eye: from the world's, far from the scene's middle, it would speckle.
    vec3 gRaw = cross(dpx, dpy);
    float gLen = length(gRaw);
    vec3 g = gLen > 1e-12 ? gRaw / gLen : n;
    vec3 lit = n;
    if (card || blade) {
      // Each leaf leans its own way across its card, the two halves of its fold apart: the card's own direction across,
      // from how its uv and its place change over a pixel.
      vec3 across = dpx * duy.y - dpy * dux.y;
      float l = length(across);
      if (l > 1e-9) {
        across *= sign(dux.x * duy.y - duy.x * dux.y) / l;
        vec3 g2 = g + across * leafLean * 0.9;
        float g2l = length(g2);
        if (g2l > 1e-6) g = g2 / g2l;
        vec3 lit2 = n + across * leafLean * 0.45;
        float lit2l = length(lit2);
        if (lit2l > 1e-6) lit = lit2 / lit2l;
      }
    }
    c = foliage(s.albedo, s.rough, lit, g, vPos, vLight * under * foot, sh * mix(1.0, foot, 0.5), card || blade);
#ifndef MESH_ONLY_FOLIAGE
  } else {
#endif
#endif
#ifndef MESH_ONLY_FOLIAGE
    vec3 w = gl_FrontFacing ? bumped : -bumped;
    float sh = shadowAt(vPos, gl_FrontFacing ? n : -n, pixel) * cloudShade(vPos);
    float ao = uUseAO > 0.005 ? mix(1.0, texture(uAO, gl_FragCoord.xy / uAOSize).r, uUseAO) : 1.0;
#ifndef MESH_ONLY_BUILT
    // Under a body, and about its legs, less of the sky is seen than on its back.
    if (skin) ao *= 0.62 + 0.38 * smoothstep(-0.7, 0.35, n.z);
#endif
    float occl = ao * (vLight * 0.5 + 0.5) * under;
    c = shade(s.albedo, s.rough, s.metal, w, vPos, uEye, occl, sh * mix(1.0, ao, 0.35));
    // Warm hearthlight glow inside building doorways/windows at dusk/dawn, and glowing embers in kiln mouths.
    float dusk = 1.0 - smoothstep(-0.04, 0.24, uSun.z);
    if (vMaterial == DARK && dusk > 0.01 && vLow < 80.0 && abs(n.z) < 0.4) {
      float litCell = hash(floor(vPos.xy * 0.45));
      if (litCell > 0.32) {
        float flick = 0.85 + 0.15 * sin(uClockSky * 4.3 + litCell * 57.0);
        c += vec3(1.15, 0.54, 0.15) * dusk * flick * (0.45 + 0.55 * litCell);
      }
    } else if (vMaterial == GILT && vLow < 3.5 && uWild > 0.5) {
      float flick = 0.8 + 0.2 * sin(uClockSky * 6.5 + vPos.x * 2.1);
      c += vec3(1.5, 0.45, 0.08) * (0.35 + 0.9 * dusk) * flick;
    }
#ifndef MESH_ONLY_BUILT
  }
#endif
#endif
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
    float teLen = length(toEye);
    vec3 teDir = teLen > 1e-6 ? toEye / teLen : n;
    float e = pow(1.0 - abs(dot(teDir, n)), 2.0);
    c += vec3(1.0, 0.82, 0.42) * (0.1 + 0.55 * e);
  } else if ((flags & 16) != 0) {
    c += vec3(0.9, 0.8, 0.6) * 0.06;
  }
  o = vec4(c, alpha);
}`;

/** Full mesh fragment shader supporting mixed meshes (foliage + bark, animal skins, canopy holes). */
export const MESH_FS = stripGlslVariants(MESH_FS_TEMPLATE, new Set());
/** Specialized static built/city mesh fragment shader with ZERO discard instructions (enables hardware Early-Z). */
export const MESH_FS_STATIC = stripGlslVariants(MESH_FS_TEMPLATE, new Set(['MESH_ONLY_BUILT', 'MESH_NO_DISCARD']));
/** Specialized instanced built/stone mesh fragment shader (retains vInstFade hashed alpha, strips foliage/skin). */
export const MESH_FS_BUILT = stripGlslVariants(MESH_FS_TEMPLATE, new Set(['MESH_ONLY_BUILT']));
/** Specialized pure-foliage mesh fragment shader (strips all masonry/built/skin material branches). */
export const MESH_FS_FOLIAGE = stripGlslVariants(MESH_FS_TEMPLATE, new Set(['MESH_ONLY_FOLIAGE']));

// ——— Terrain ———

/**
 * The ground's scanned materials (core/materials.ts; docs/plans/RENDERING.md, "Procedural first"): what earth, sand,
 * pebbles, rock, mud and snow look like from a metre or two. A scan gives a material its grain: its colour divided by its
 * own mean, to multiply the place's tone by; its normal; its roughness about its own mean; how much of the sky a point of
 * it sees; and its height, by which two materials meet, the higher showing. Which material lies where, and in what
 * colour, is never a scan's to say.
 *
 * A scan repeats every metre or two, which from a way off shows as a grid. So a material is read three times, among the
 * tiles of a grid of hexagons, each tile's reading set off by its own two numbers, and the three are blended across the
 * tiles' edges (after Heitz and Neyret 2018, and Mikkelsen 2022): no repeat is left to see. Places are counted from the
 * eye, where a float still has its small places, with the eye's own place in each material's repeat and in its grid of
 * tiles worked out apart, in doubles (city.ts).
 */
const MATERIALS = /* glsl */ `
const int ${GROUND_LAYERS.map((k, i) => `M_${k.toUpperCase()} = ${i}`).join(', ')};
const int M_COUNT = ${GROUND_LAYERS.length};
uniform highp sampler2DArray uMatColour;
uniform highp sampler2DArray uMatNormal;
// Each material's mean colour and the metres one repeat covers; how much of its own hue it keeps, its mean roughness and
// its mean height; where the eye is in its repeat (xy) and in its grid of tiles (zw); the tile the eye is in; and where
// the eye's height is in the repeat of the one that is read from the side.
uniform vec4 uMatMean[M_COUNT];
uniform vec4 uMatLook[M_COUNT];
uniform vec4 uMatAt[M_COUNT];
uniform vec2 uMatCell[M_COUNT];
uniform float uMatUp;
// 1 where the materials are loaded and this way of drawing uses them: 0 draws the ground as it was drawn without them.
uniform float uMaterials;
// How many tiles of the grid of hexagons cross one repeat of a material; and after how many tiles their numbers repeat.
const float MAT_TILES = 3.0;
const float MAT_WRAP = 4096.0;

// What a material is at a point: its grain as a multiplier of colour, its height, how its normal leans, its roughness
// beside its own mean, and how much of the sky it sees.
struct Mat { vec3 detail; float height; vec3 lean; float rough; float sky; };

vec2 matHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
// One reading of a material; its lean is across and along its own image.
Mat matTap(int layer, vec2 uv, vec2 dx, vec2 dy) {
  vec3 at = vec3(uv, float(layer));
  vec4 c = textureGrad(uMatColour, at, dx, dy);
  vec4 n = textureGrad(uMatNormal, at, dx, dy);
  vec3 mean = uMatMean[layer].rgb;
  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
  float light = dot(c.rgb, LUMA) / max(dot(mean, LUMA), 1e-4);
  vec3 detail = mix(vec3(light), c.rgb / max(mean, vec3(1e-4)), uMatLook[layer].x);
  return Mat(clamp(detail, 0.12, 3.0), c.a, vec3(n.rg * 2.0 - 1.0, 0.0), n.b - uMatLook[layer].y, n.a);
}
Mat matMix(Mat a, Mat b, float t) {
  return Mat(mix(a.detail, b.detail, t), mix(a.height, b.height, t), mix(a.lean, b.lean, t), mix(a.rough, b.rough, t), mix(a.sky, b.sky, t));
}
// A material lying on the ground, where a point is \`rel\` metres from the eye; \`dx\` and \`dy\` are how \`rel\` changes
// across a pixel. Its lean is across the ground eastwards and northwards.
Mat matFlat(int layer, vec2 rel, vec2 dx, vec2 dy) {
  float metres = uMatMean[layer].w;
  vec2 st = rel / metres;
  vec2 uv = st + uMatAt[layer].xy;
  dx /= metres;
  dy /= metres;
  // The grid of hexagons, as a grid of triangles skewed square: the three tiles whose corners the point lies among.
  vec2 sk = vec2(st.x, -0.57735027 * st.x + 1.15470054 * st.y) * MAT_TILES + uMatAt[layer].zw;
  vec2 i = floor(sk);
  vec3 t = vec3(sk - i, 0.0);
  t.z = 1.0 - t.x - t.y;
  float s = step(0.0, -t.z);
  float s2 = 2.0 * s - 1.0;
  vec3 w = vec3(-t.z * s2, s - t.y * s2, s - t.x * s2);
  vec2 base = uMatCell[layer] + i;
  Mat a = matTap(layer, uv + matHash(mod(base + vec2(s, s), MAT_WRAP)), dx, dy);
  Mat b = matTap(layer, uv + matHash(mod(base + vec2(s, 1.0 - s), MAT_WRAP)), dx, dy);
  Mat c = matTap(layer, uv + matHash(mod(base + vec2(1.0 - s, s), MAT_WRAP)), dx, dy);
  // Each tile's reading counts by how near its corner is, sharply, and the more the higher it stands there: at a tile's
  // edge the stone that stands proud shows whole, and two are not laid through one another.
  w = w * w * w * (0.35 + vec3(a.height, b.height, c.height));
  w = w * w;
  w /= w.x + w.y + w.z;
  return Mat(a.detail * w.x + b.detail * w.y + c.detail * w.z, a.height * w.x + b.height * w.y + c.height * w.z, a.lean * w.x + b.lean * w.y + c.lean * w.z, a.rough * w.x + b.rough * w.y + c.rough * w.z, a.sky * w.x + b.sky * w.y + c.sky * w.z);
}
// A material on a face too steep to be read from above: read from its two sides, each as far as the face is turned to
// it, its beds level. Its lean is in the world's own directions.
Mat matSteep(int layer, vec3 rel, vec3 dx, vec3 dy, vec3 n) {
  float metres = uMatMean[layer].w;
  float up = rel.z / metres + uMatUp;
  vec2 w = n.xy * n.xy;
  w /= max(w.x + w.y, 1e-4);
  Mat a = matTap(layer, vec2(rel.x / metres + uMatAt[layer].x, -up), vec2(dx.x, -dx.z) / metres, vec2(dy.x, -dy.z) / metres);
  Mat b = matTap(layer, vec2(rel.y / metres + uMatAt[layer].y, -up), vec2(dx.y, -dx.z) / metres, vec2(dy.y, -dy.z) / metres);
  a.lean = vec3(a.lean.x, 0.0, -a.lean.y);
  b.lean = vec3(0.0, b.lean.x, -b.lean.y);
  return matMix(a, b, w.x);
}
// How much of the ground at a point is each material, as whoever colours the ground says while colouring it.
float gMat[M_COUNT];
void matNone() { for (int i = 0; i < M_COUNT; i++) gMat[i] = 0.0; }
void matKeep(float k) { for (int i = 0; i < M_COUNT; i++) gMat[i] *= k; }
Mat matOf(int layer, vec3 rel, vec3 dx, vec3 dy, vec3 n) {
  if (layer == M_STRATA) return matSteep(layer, rel, dx, dy, n);
  Mat m = matFlat(layer, rel.xy, dx.xy, dy.xy);
  m.lean = normalize(vec3(n.z, 0.0, -n.x)) * m.lean.x + normalize(vec3(0.0, n.z, -n.y)) * m.lean.y;
  return m;
}
// The grain of the ground at a point, from the two materials there is most of: each over as much of the ground as it has
// more of than the third, so that nothing jumps where the third becomes the second; and the two meet by their heights.
// \`rel\` is the point's place from the eye, and \`dx\`, \`dy\` how that changes across a pixel; \`n\` is the ground's own
// normal. Gives the normal with the grain in it; \`detail\` multiplies the ground's colour, \`rough\` is added to its
// roughness, \`sky\` multiplies what it sees of the sky.
vec3 groundGrain(vec3 rel, vec3 dx, vec3 dy, vec3 n, float amount, out vec3 detail, out float rough, out float sky) {
  int a = 0;
  int b = 0;
  float wa = -1.0;
  float wb = -1.0;
  float wc = 0.0;
  float total = 1e-4;
  for (int i = 0; i < M_COUNT; i++) {
    float w = gMat[i];
    total += w;
    if (w > wa) { wc = wb; wb = wa; b = a; wa = w; a = i; }
    else if (w > wb) { wc = wb; wb = w; b = i; }
    else if (w > wc) wc = w;
  }
  wc = max(wc, 0.0);
  float fa = max(wa - wc, 0.0) / total;
  float fb = max(wb - wc, 0.0) / total;
  Mat m = matOf(a, rel, dx, dy, n);
  if (fb > 0.004) {
    Mat o = matOf(b, rel, dx, dy, n);
    float t = fb / (fa + fb);
    m = matMix(m, o, clamp((o.height - m.height + (2.0 * t - 1.0) * 1.1) / 0.2 + 0.5, 0.0, 1.0));
  }
  float k = (fa + fb) * amount;
  detail = mix(vec3(1.0), m.detail, k);
  rough = m.rough * k * 0.7;
  sky = mix(1.0, m.sky, k);
  // A little more than the scan has it, so that the ground's grain still shows under a high sun.
  vec3 lean = m.lean * k * 1.35;
  return normalize(n * sqrt(max(0.05, 1.0 - min(dot(lean, lean), 0.9))) + lean);
}
`;

const GROUND = /* glsl */ `
uniform highp isampler2D uGround0;
uniform highp isampler2D uGround1;
uniform highp isampler2D uGround2;
// Each grid: x0, y0, cell, ease distance; its size in cells; and what its whole numbers stand for: a step in metres, above a base.
uniform vec4 uGrid[3];
uniform vec2 uGridSize[3];
uniform vec2 uGridUnit[3];
float readGrid(highp isampler2D t, int k, vec2 p) {
  vec2 f = clamp((p - uGrid[k].xy) / uGrid[k].z, vec2(0.0), uGridSize[k] - 1.001);
  ivec2 i = ivec2(floor(f));
  vec2 u = f - vec2(i);
  float a = float(texelFetch(t, i, 0).r);
  float b = float(texelFetch(t, i + ivec2(1, 0), 0).r);
  float c = float(texelFetch(t, i + ivec2(0, 1), 0).r);
  float d = float(texelFetch(t, i + ivec2(1, 1), 0).r);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * uGridUnit[k].x + uGridUnit[k].y;
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
// the point from the eye: the ground's grain is laid by it, where the world's position has lost its small places
out vec3 vRel;
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
  vRel = vec3(p, z) - uEye;
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
in vec3 vRel;
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
// How much of the land was worked beyond the plan's own map, coarsely (settlement/v12.ts, farLand): R crops, G pasture,
// A paddies, as shares of the ground, over a box of the scene's metres; a box of no size where there is none.
uniform highp sampler2D uFarFields;
uniform vec4 uFarBox;
// The scene's seasonal 8-slot crop palette (core/plots.ts, FieldPalette): rgb tones, cumulative shares, states, row spacing.
uniform vec4 uSlotColor[8];
uniform vec4 uSlotColor2[8];
uniform vec4 uSlotMeta[8];
// How far from the eye a field's crop is drawn plant by plant, in rows (world/generators/people/crops.ts), m: 0 where
// it is not, and the ground is the crop's colour everywhere.
uniform float uCrops;
uniform highp sampler2D uAO;
uniform vec2 uAOSize;
uniform float uUseAO;
uniform float uEvidence;
uniform float uWater;
uniform float uWild;
uniform vec3 uTone[10];
uniform vec3 uShare;
// The same shares at each of 32 heights, where the world gives the climate at a height: the first height, the step
// between them and the height their edges wander over. A step of nought says there are none, and the place's hold.
uniform vec3 uShareAt[32];
uniform vec3 uShareSpan;
// What the ground is made of, where the world says (core/substrate.ts): how much of the ground that decides, and how
// much of what its sources say names cracks, ripples and a grain (fine below zero, coarse above); the share of each
// material (sand, gravel, silt, mud, lime mud, a crust of salt, peat, ash); and each one's two tones.
uniform vec4 uSub;
uniform float uSubShare[8];
uniform vec2 uSubBand[8];
uniform vec3 uSubTone[16];
uniform vec2 uSubSoil;
uniform vec3 uRock[2];
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
${MATERIALS}
// A fine grain drawn by noise, where no scanned material gives the ground its grain: with them it is left out.
float grain(float v) { return mix(v, 1.0, uMaterials); }
// How much of the ground a substrate decides is each scanned material, and how wet the ground is, as groundClose finds.
float gSub[M_COUNT];
float gWet;
// How much of the point a fallen leaf covers, as groundClose finds: the grain of the earth does not show through one.
float gLeaf = 0.0;
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
// What lies under trees, close by: the canopy's own leaves, fallen, from the tiles of litter in the atlas of leaves
// (leafatlas.ts), each a patch of ground strewn with one kind of leaf that repeats without a seam. Two sheets of them
// lie one over the other, the second turned and a little larger, so that neither's repeat shows; uLitterTile is the
// tile of the canopy's commonest kind of leaf and of its next, and uLitterNext how much of what falls is the second.
// Each leaf of a tile has its place in the order they fell in (the tile's green): where less has fallen, an amount
// under 1, only the last of them lie here, whole. From far enough off that a texel holds many leaves, there is as much
// leaf as the amount says. Gives how much of a point is fallen leaf, and how light that leaf is.
uniform highp sampler2DArray uLeaves;
uniform vec2 uLitterTile;
uniform float uLitterNext;
vec2 fallenLeaves(vec3 p, vec2 dx, vec2 dy, float amount) {
  float cover = 0.0;
  float light = 0.5;
  for (int k = 0; k < 2; k++) {
    float turn = k == 0 ? 0.47 : 2.21;
    vec2 ct = vec2(cos(turn), sin(turn));
    mat2 m = mat2(ct.x, ct.y, -ct.y, ct.x);
    vec2 span = vec2(${LITTER_SPAN[0].toFixed(3)}, ${LITTER_SPAN[1].toFixed(3)}) * (k == 0 ? 1.0 : 1.31);
    vec2 uv = (m * p.xy) / span + float(k) * 0.37;
    vec2 gx = (m * dx) / span;
    vec2 gy = (m * dy) / span;
    bool next = k == 1 && uLitterNext > 0.0;
    float some = amount * (uLitterNext > 0.0 ? min(1.0, 2.0 * (k == 1 ? uLitterNext : 1.0 - uLitterNext)) : 1.0);
    vec4 t = textureGrad(uLeaves, vec3(uv, next ? uLitterTile.y : uLitterTile.x), gx, gy);
    // How many texels across a pixel is: the more, the less any one leaf's place in the order can be told.
    float lod = max(0.0, 0.5 * log2(max(dot(gx, gx) * ${(LEAF_TILE.across * LEAF_TILE.across).toFixed(1)}, dot(gy, gy) * ${(LEAF_TILE.along * LEAF_TILE.along).toFixed(1)})));
    float soft = clamp(0.05 + 0.22 * lod, 0.05, 1.0);
    // With all of them fallen, the first to fall lie here too.
    float there = t.a * smoothstep(t.g - soft, t.g + soft, some * (1.0 + soft));
    if (there > cover) { cover = there; light = t.r; }
  }
  return vec2(cover, light);
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
// People's fields: plots as the scene's field system shapes them (core/plots.ts, which what is sown on them reads too),
// each its own crop or fallow, with furrows close by along its rows; flooded within their banks where they are paddies.
// Where a plot's crop stands as plants close by, the ground between its rows is the earth they stand in, and tilled
// says how much of the ground here is that. The colours are the renderer's, and nobody's record.
${PLOTS_GLSL}
vec3 plots(vec3 wild, vec3 p, vec3 n, float dist, float paddy, out float tilled, out float paddyWet, out float fieldBump) {
  float kind = uFieldStyle.z;
  vec2 size;
  float across;
  float domainEdge;
  highp ivec2 cell;
  vec4 at = plotAt(p.xy, uFieldStyle, size, across, domainEdge, cell);
  vec2 f = at.zw;
  float h = plotNumber(cell, 0);
  float tone = plotNumber(cell, 3);
  int slot = FIELD_SLOTS - 1;
  for (int i = 0; i < FIELD_SLOTS - 1; i++) {
    if (h < uSlotColor[i].a) {
      slot = i;
      break;
    }
  }
  vec3 col0 = uSlotColor[slot].rgb;
  vec3 col1 = uSlotColor2[slot].rgb;
  float cover = uSlotColor2[slot].a;
  float state = uSlotMeta[slot].x;
  float rowPitch = max(0.25, uSlotMeta[slot].y);
  float slotPaddy = uSlotMeta[slot].w;

  // Parcel base tone modulated by multi-octave crop vigor and soil moisture variation so no parcel is a flat rectangle.
  float vigor = fbmM(p, 26.0) * 0.65 + noiseM(p + 17.0, 9.0) * 0.35;
  float soilVar = fbmM(p + 53.0, 48.0);
  vec3 ploughed = mix(vec3(0.31, 0.24, 0.16), vec3(0.24, 0.18, 0.12), plotNumber(cell, 9) * 0.6 + soilVar * 0.4);
  vec3 c = mix(col0, col1, tone) * (0.84 + 0.32 * vigor);

  // Active harvest: ~30% of ripe grain parcels show a crisp freshly reaped stubble swath along one end.
  bool ripe = state < 0.5;
  bool cropped = state < 3.5 || state > 5.5;
  float harvestCut = 0.0;
  if (ripe && plotNumber(cell, 11) < 0.32) {
    float cutLine = 0.22 + 0.48 * plotNumber(cell, 13);
    harvestCut = 1.0 - smoothstep(cutLine - 0.015, cutLine + 0.015, f.y);
    vec3 stubble = vec3(0.45, 0.38, 0.22) * (0.88 + 0.24 * vigor);
    c = mix(c, stubble, harvestCut);
  }

  float vis = 1.0 - smoothstep(1400.0, 11000.0, dist);
  float plotEdge = min(min(f.x, 1.0 - f.x) * size.x, min(f.y, 1.0 - f.y) * size.y);
  float edge = min(plotEdge, domainEdge);

  // Close by, real standing crop rows take over; between rows tilled earth shows, while balks keep weathered turf.
  float rows = cropped && uCrops > 0.0 ? 1.0 - smoothstep(uCrops * 0.45, uCrops * 1.05, dist) : 0.0;
  float within = smoothstep(${(PLOT_LOOK.balk * 0.6).toFixed(3)}, ${(PLOT_LOOK.balk * 1.4).toFixed(3)}, edge);
  tilled = rows * within * (1.0 - harvestCut * 0.45);
  c = mix(c, mix(wild, ploughed, 0.32), rows * (1.0 - within));
  c = mix(c, ploughed * 1.04, tilled * (0.88 - 0.12 * cover));

  // Parcel headlands & balks, plus wider compacted farm tracks along macro-domain boundaries.
  float balk = 1.0 - smoothstep(0.4, 1.85, plotEdge);
  float track = 1.0 - smoothstep(0.6, 2.7, domainEdge);
  vec3 balkCol = mix(wild * 0.78, ploughed * 0.88, 0.45);
  vec3 trackCol = mix(ploughed * 1.18, wild * 0.85, 0.38);
  c = mix(c, balkCol, balk * 0.48 * vis);
  c = mix(c, trackCol, track * 0.68 * vis);

  // Contour-aligned hillside terracing on moderate slopes (aligned with 3D fieldworks TERRACE_STEP).
  float slope = sqrt(max(0.0, 1.0 - n.z * n.z));
  float terraced = smoothstep(FIELD_SLOPE_TERRACE_LO, FIELD_SLOPE_TERRACE_HI, slope) * (1.0 - smoothstep(FIELD_SLOPE_CROP_LO, FIELD_SLOPE_CROP_HI, slope));
  float terraceBump = 0.0;
  if (terraced > 0.01) {
    float tPhase = fract((p.z + (fbmM(p, 24.0) - 0.5) * 0.42) / TERRACE_STEP);
    float riser = smoothstep(0.0, 0.13, tPhase) * (1.0 - smoothstep(0.14, 0.29, tPhase));
    float lip = smoothstep(0.22, 0.34, tPhase) * (1.0 - smoothstep(0.34, 0.54, tPhase));
    vec3 riserCol = mix(ploughed * 0.72, wild * 0.74, 0.52);
    c = mix(c, riserCol, riser * terraced * 0.65 * vis);
    c *= 1.0 + 0.08 * lip * terraced * vis;
    terraceBump = (smoothstep(0.04, 0.24, tPhase) - 0.5) * terraced * 1.6;
  }

  // Long-range anisotropic furrow stripes and micro-relief (visible from 240 m out to 1400 m without aliasing).
  float furFine = smoothstep(2.5, 16.0, dist) * (1.0 - smoothstep(140.0, 620.0, dist));
  float furBroad = smoothstep(45.0, 140.0, dist) * (1.0 - smoothstep(450.0, 1450.0, dist));
  float isFallow = state > 4.5 && state < 5.5 ? 1.0 : 0.0;
  float furAmp = (1.0 - isFallow * 0.75) * smoothstep(0.6, 2.2, edge);
  float fineWave = sin(across * 6.2831853 / rowPitch);
  float broadWave = sin(across * 6.2831853 / (rowPitch * 4.5));
  float furShade = (0.075 * furFine * fineWave + 0.048 * furBroad * broadWave) * furAmp;
  c *= 1.0 - furShade;
  fieldBump = (0.35 * furFine * fineWave + 0.22 * furBroad * broadWave) * furAmp + terraceBump;

  // Flooded rice paddies and irrigated basins: darkened soil and glossy sky-reflecting water sheet inside banks.
  float wet = max(paddy, slotPaddy * (state > 5.5 ? 0.92 : 0.25)) * smoothstep(0.45, 1.5, edge);
  paddyWet = wet;
  c = mix(c, mix(vec3(0.14, 0.21, 0.23), c * 0.64, tilled * (1.0 - smoothstep(0.5, 0.9, wet))), wet * 0.72);
  tilled *= 1.0 - wet * smoothstep(0.5, 0.9, wet);
  return c;
}
// The far cells' shares of worked land at a point (settlement/v12.ts, farLand): R crops, G pasture, B built ground,
// A paddies; none
// beyond the cells, fading toward the edge of what they cover.
vec4 farShares(vec3 p) {
  if (uFarBox.z <= 0.0) return vec4(0.0);
  vec2 uv = (p.xy - uFarBox.xy) / uFarBox.zw;
  vec2 e = min(uv, 1.0 - uv);
  float inBox = smoothstep(0.0, 0.06, min(e.x, e.y));
  if (inBox <= 0.0) return vec4(0.0);
  return texture(uFarFields, uv) * inBox;
}
// Land worked as much as the shares s say, laid out without a plan: crops and pasture in patches of a kilometre or two with
// ragged edges, as much of the ground as the shares say, and from far enough off only their tone; and the built ground of
// a town's or a city's cell as smaller patches of trodden ground, which no field takes. No settlement stands behind any
// patch: where they lie is the renderer's, and how much there is the cells'. R crops, G pasture, B built ground,
// A paddies, as the plan's map has them.
vec4 farPatches(vec3 p, float dist, vec4 s) {
  // Read flat, from one level, so that the patches do not climb the hills' contours; and warped, so that they are no blobs.
  vec3 q = vec3(p.xy, 0.0);
  q.xy += (vec2(noiseM(q, 1300.0), noiseM(q + 311.0, 1300.0)) - 0.5) * 2600.0;
  float n = fbmM(q, 760.0) * 0.82 + noiseM(q + 57.0, 170.0) * 0.18;
  // Spread toward even, so that a share of the ground below a value is about that value.
  float u = smoothstep(0.32, 0.68, n);
  float soft = 0.04 + 0.1 * smoothstep(8000.0, 60000.0, dist);
  float crop = 1.0 - smoothstep(s.r - soft, s.r + soft, u);
  float pasture = (1.0 - smoothstep(s.r + s.g - soft, s.r + s.g + soft, u)) * (1.0 - crop);
  // From high up, how much is worked, and no patches.
  float melt = smoothstep(30000.0, 120000.0, dist);
  crop = mix(crop, s.r, melt);
  pasture = mix(pasture, s.g, melt);
  // Built ground, in patches a few hundred metres across, read from noise of its own.
  float built = 0.0;
  if (s.b > 0.0) {
    float m = fbmM(q + 640.0, 230.0) * 0.8 + noiseM(q + 913.0, 60.0) * 0.2;
    built = 1.0 - smoothstep(s.b - soft, s.b + soft, smoothstep(0.32, 0.68, m));
    built = mix(built, s.b, melt);
    crop *= 1.0 - built;
    pasture *= 1.0 - built;
  }
  float paddy = crop * clamp(s.a / max(s.r, 0.004), 0.0, 1.0);
  return vec4(crop, pasture, built, paddy);
}
// What people made of the ground at a point: R crops, G pasture, B yards and lanes, A flooded paddies. Within the plan's
// map, the map; beyond it, the far land. The plan's own fields are kept whole, where its lanes, banks and crops stand,
// but for a strip at the map's edge, FIELDS_EDGE wide, where the edge cuts them and they give way. Across a band inside
// the edge, FIELDS_BAND wide, far patches fill the ground the plan leaves unworked, as far as the plan, read over a
// kilometre or two, falls short of the far cells' share: its settlements beyond the edge are not drawn, and its map
// thins toward it. Both lines wander, so that the scene's square never shows.
const float FIELDS_EDGE = 700.0;
const float FIELDS_BAND = 2400.0;
vec4 fieldsAt(vec3 p, float dist) {
  vec2 fuv = (p.xy - uFieldsBox.xy) / uFieldsBox.zw;
  vec2 e = min(fuv, 1.0 - fuv) * uFieldsBox.zw;
  float inward = min(e.x, e.y);
  vec4 near = inward > 0.0 ? texture(uFields, fuv) : vec4(0.0);
  // The noise below lies in [0, 1], so further in than this neither line reaches.
  if (uFarBox.z <= 0.0 || inward > 1.7 * FIELDS_BAND) return near;
  float wander = (fbmM(vec3(p.xy, 0.0) + 91.0, 700.0) - 0.5) * 2.0;
  float keep = inward > 0.0 ? smoothstep(0.3, 0.7, inward / FIELDS_EDGE + wander) : 0.0;
  float fill = inward > 0.0 ? 1.0 - smoothstep(0.3, 0.7, inward / FIELDS_BAND + wander) : 1.0;
  vec4 kept = near * keep;
  vec4 s = farShares(p);
  float worked = s.r + s.g;
  if (fill <= 0.0 || worked + s.b <= 0.0) return kept;
  // What the plan keeps here, read over a kilometre and a half.
  vec4 around = vec4(0.0);
  if (inward > 0.0) {
    vec2 size = vec2(textureSize(uFields, 0));
    around = textureLod(uFields, fuv, log2(max(1.0, 1500.0 * size.x / uFieldsBox.z))) * keep;
  }
  float had = around.r + around.g;
  float more = worked > 0.0 ? clamp((worked - had) / max(1.0 - had, 0.05), 0.0, 1.0) * fill / worked : 0.0;
  float built = clamp((s.b - around.b) / max(1.0 - around.b, 0.05), 0.0, 1.0) * fill;
  vec4 add = farPatches(p, dist, vec4(s.rg * more, built, s.a * more));
  // Laid over what is kept, as one cover over another: as much of the rest as the patches take.
  return vec4(1.0) - (vec4(1.0) - kept) * (vec4(1.0) - add);
}
// How much of the ground at a point people made: fields, pasture and yards, all generated.
float peopledShare(vec3 p) {
  if (uFieldStyle.w < 0.5) return 0.0;
  vec4 f = fieldsAt(p, length(p - uEye));
  return max(f.r, max(f.g * 0.75, f.b));
}
vec3 peopled(vec3 c, vec3 p, vec3 n, float dist, out float yard, out float tilled, out float paddyWet, out float fieldBump) {
  yard = 0.0;
  tilled = 0.0;
  paddyWet = 0.0;
  fieldBump = 0.0;
  if (uFieldStyle.w < 0.5) return c;
  vec4 f = fieldsAt(p, dist);
  if (f.r + f.g + f.b <= 0.0) return c;
  // Pasture: the place's own low plants, grazed short and worn toward its bare ground, the more so the barer its climate
  // leaves it: green where the climate is green, and in a desert hardly to be told from the ground around it.
  vec3 herbTone = mix(uTone[2], uTone[3], noiseM(p, 30.0));
  vec3 bareTone = mix(uTone[4], uTone[5], noiseM(p + 5.0, 24.0));
  vec3 grazed = mix(herbTone, bareTone, 0.3 + 0.6 * uShare.z) * 0.94;
  c = mix(c, grazed, f.g * 0.75);
  // Cropland fades gracefully off steep cliffs and rocky ridges into hillside pasture/wilderness.
  float slope = sqrt(max(0.0, 1.0 - n.z * n.z));
  float cropShare = f.r * (1.0 - smoothstep(FIELD_SLOPE_CROP_LO, FIELD_SLOPE_CROP_HI, slope));
  if (cropShare > 0.004) {
    c = mix(c, plots(c, p, n, dist, f.a, tilled, paddyWet, fieldBump), cropShare);
    tilled *= cropShare;
    paddyWet *= cropShare;
    fieldBump *= cropShare;
  }
  // Among the houses and along lanes the ground is trodden packed earth; green turf peeks through quiet corners.
  vec3 trodden = mix(vec3(0.35, 0.29, 0.21), vec3(0.45, 0.39, 0.29), noiseM(p, 6.0));
  float worn = smoothstep(0.32, 0.62, noiseM(p, 9.0) * 0.55 + noiseM(p + 7.0, 2.5) * 0.45);
  yard = f.b * (0.45 + 0.48 * worn);
  return mix(c, trodden, yard);
}
vec2 gPDx;
vec2 gPDy;
// Bump by a height, from its derivatives across the screen (Mikkelsen 2010): a detail normal with no texture of its own.
vec3 bumped(vec3 n, vec3 p, float h, float strength) {
  vec3 dpdx = dFdx(p);
  vec3 dpdy = dFdy(p);
  vec3 r1 = cross(dpdy, n);
  vec3 r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  vec3 res = abs(det) * n - strength * grad;
  float l = length(res);
  return l > 1e-12 ? res / l : n;
}
// How near the water a point is, and how far above its level: from the water seen from above, blurred to its banks.
// And how much of it is the bed of a river dry in the month, which holds no water.
float nearWater(vec3 p, out float above, out float dryBed) {
  above = 1e4;
  dryBed = 0.0;
  if (uBanks <= 0.005) return 0.0;
  vec2 wuv = (p.xy - uWaterBox.xy) / uWaterBox.zw;
  if (wuv.x <= 0.0 || wuv.y <= 0.0 || wuv.x >= 1.0 || wuv.y >= 1.0) return 0.0;
  vec3 w = texture(uWaterMap, wuv).rgb;
  vec2 e = min(wuv, 1.0 - wuv);
  float inBox = smoothstep(0.0, 0.05, min(e.x, e.y));
  dryBed = smoothstep(0.25, 0.6, w.b) * inBox * uBanks;
  if (w.g < 0.002) return 0.0;
  above = p.z - w.r / w.g;
  return smoothstep(0.002, 0.05, w.g) * inBox * uBanks;
}
// The edges of a tiling of uneven cells, one to a unit: how far a point is from the nearest edge, in cell widths, and a
// number for the cell it is in. Mud dries into such cells, a crust of salt heaves into them, and pebbles lie as them.
vec2 cellsOf(vec2 q) {
  vec2 cell = floor(q);
  vec2 f = fract(q);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + vec2(hash(cell + g), hash(cell + g + 17.3)) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash(cell + g + 3.1); }
    else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d2) - sqrt(d1), id);
}
// Where a place lies in the sorting of its ground, 0 to 1: one field of noise, in patches from a few metres to tens of
// metres across with ragged edges. It is read flat, from one sheet of the noise, so that how often it takes each value
// is known, and a material can be given the share of the ground its sources give it. The field is the generator's
// (world/generators/life/sorting.ts), which sows by it what stands on the ground: this reads it as that says.
// Where to read a sheet of the noise for a place, given in the noise's own cells: between its values the step is eased,
// so that the levels of what is read curve and do not run straight from one value to the next.
vec2 eased(vec2 x) {
  vec2 i = floor(x - 0.5);
  vec2 f = x - 0.5 - i;
  return (i + 0.5 + f * f * (3.0 - 2.0 * f)) / 64.0;
}
float sorting(vec3 p) {
  // Read a few metres aside, by a noise of its own, so that its patches wander.
  vec2 q = p.xy + ${glf(SORTING.aside.by)} * (texture(uNoise, vec3(eased(p.xy / ${glf(SORTING.aside.span)}), ${glf(SORTING.aside.sheet + 0.5)} / 64.0)).ba - 0.5);
  return ${glf(SORTING.broad.weight)} * texture(uNoise, vec3(eased(q / ${glf(SORTING.broad.span)}), ${glf(SORTING.broad.sheet + 0.5)} / 64.0)).${'rgba'[SORTING.broad.channel]} + ${glf(SORTING.fine.weight)} * texture(uNoise, vec3(eased(q / ${glf(SORTING.fine.span)} + ${glf(SORTING.fine.offset)}), ${glf(SORTING.fine.sheet + 0.5)} / 64.0)).${'rgba'[SORTING.fine.channel]};
}
// How wide the edge between two materials is, in that field's units.
const float SUB_EDGE = ${glf(SORT_EDGE)};
// The ground where the world says what it is made of (core/substrate.ts): its materials sorted across it, the coarsest
// on its rises and the finest in its hollows, each over the share of it the sources give and with its own grain. Sand
// ripples; gravel is pebbles close by; mud and lime mud crack where their sources say they dried; a crust of salt
// heaves into polygons. Which materials there are, and how much of each, is the world's. Where each lies, and how it
// looks, is the renderer's, and nobody's record. Gives its colour, its height for the grain, and how rough it is.
// under is the ground the climate gives the place, with its own height and roughness.
vec3 substrateGround(vec3 p, float dist, float ripple, vec3 under, float hUnder, float rUnder, out float h, out float rough) {
  // Its stones, cracks and crusts are drawn here only where no scanned material draws them.
  float near = (1.0 - smoothstep(5.0, 26.0, dist)) * (1.0 - uMaterials);
  for (int i = 0; i < M_COUNT; i++) gSub[i] = 0.0;
  // Cells of three sizes: pebbles, the cracks of dried mud, and the polygons of a crust.
  vec2 pebble = near > 0.0 && uSubShare[1] > 0.0 ? cellsOf(p.xy / 0.06) : vec2(0.2, 0.5);
  if (uSubSoil.y > 0.0) {
    // A topsoil read from a map, which gives amounts and no colour. Its fine earth is one mixture, a shade of the ground
    // its climate gives it. Its stones lie scattered through it, each of the rock under the place: thick on the
    // ground's rises, up to twice their share, and thinning to none in its hollows.
    vec3 earth = under * uSubSoil.y;
    vec3 stoneTone = mix(uSubTone[2], uSubTone[3], noiseM(p + 3.0, 0.6));
    float thick = min(1.0, uSubShare[1] * ${glf(SOIL_STONES.most)} * (1.0 - smoothstep(${glf(SOIL_STONES.rises[0])}, ${glf(SOIL_STONES.rises[1])}, sorting(p))));
    gSub[M_STONES] = thick;
    gSub[M_SOIL] = 1.0 - thick;
    // Close by each stone is there or not by a number of its own; from afar they are a share of the ground's colour.
    float there = near > 0.0 ? step(pebble.y, thick) : 0.0;
    vec3 stone = mix(earth * 0.8, stoneTone * (0.6 + 0.75 * fract(pebble.y * 37.0)), smoothstep(0.0, 0.2, pebble.x));
    h = mix(hUnder, 0.4 + 0.6 * smoothstep(0.0, 0.35, pebble.x), there * near);
    rough = mix(rUnder, 0.85, there * near);
    return mix(mix(earth, stoneTone * 0.9, thick), mix(earth, stone, there), near);
  }
  // Close by, a sheet of gravel ends stone by stone: each stone is in or out by a number of its own.
  float u = sorting(p) + (pebble.y - 0.5) * 0.05 * near;
  // The noises only some materials want are read only where the ground has those materials.
  float dries = uSub.y * (uSubShare[3] + uSubShare[4]);
  bool cracks = near > 0.0 && dries > 0.0;
  float n2 = cracks || uSubShare[5] > 0.0 ? noiseM(p, 0.4) : 0.5;
  float fine = uSubShare[0] + uSubShare[2] + uSubShare[5] > 0.0 ? noiseM(p, 0.03) : 0.5;
  vec2 crack = cracks ? cellsOf(p.xy / 0.3 + n2 * 0.6) : vec2(0.2, 0.5);
  vec2 crust = uSubShare[5] > 0.0 && uMaterials < 0.5 ? cellsOf(p.xy / 1.6 + n2 * 0.8) : vec2(0.2, 0.5);
  // How much of a mud is drawn cracked, where its sources say it dried; and how coarse a sand is.
  float dried = min(1.0, uSub.y * ${glf(DRIED_BY)});
  float coarse = clamp(uSub.w, 0.0, 1.0);
  float cracked = (1.0 - smoothstep(0.015, 0.07, crack.x)) * near * dried;
  // The ground's own gentle height: the coarse stands a little proud of the fine.
  float lie = 1.0 - u;
  vec3 c = vec3(0.0);
  float sum = 1e-4;
  h = 0.0;
  rough = 0.0;
  for (int i = 0; i < 8; i++) {
    if (uSubShare[i] <= 0.0) continue;
    // Its band of the sorting: all of it inside, fading across the edge it shares with the next.
    float b = smoothstep(uSubBand[i].x - SUB_EDGE, uSubBand[i].x + SUB_EDGE, u) - smoothstep(uSubBand[i].y - SUB_EDGE, uSubBand[i].y + SUB_EDGE, u);
    if (b <= 0.0) continue;
    vec3 tone = mix(uSubTone[2 * i], uSubTone[2 * i + 1], noiseM(p + float(i) * 3.0, 0.6));
    float hi = lie;
    float ri = 0.9;
    if (i == 0) {
      // Sand: a fine grain, and its ripples, plainer where the sources name them.
      tone *= grain(0.9 + 0.2 * fine) + 0.06 * ripple * (0.6 + uSub.z);
      hi = hi * 0.8 + ripple * 0.12;
      gSub[M_SAND] += b * (1.0 - coarse);
      gSub[M_GRIT] += b * coarse;
    } else if (i == 1) {
      // Gravel: mottled from a way off; close by, stones each of its own shade, with the finer ground between them.
      vec3 between = mix(uTone[4], uTone[5], 0.5) * 0.7;
      vec3 stones = mix(between, tone * (0.6 + 0.75 * pebble.y), smoothstep(0.0, 0.2, pebble.x));
      tone = mix(tone * grain(0.6 + 0.7 * noiseM(p + 2.0, 0.025)), stones, near);
      hi = mix(hi, 0.4 + 0.6 * smoothstep(0.0, 0.35, pebble.x), near);
      ri = 0.85;
      gSub[M_PEBBLES] += b;
    } else if (i == 2) {
      tone *= grain(0.92 + 0.14 * fine);
      hi *= 0.5;
      gSub[M_EARTH] += b;
    } else if (i == 3 || i == 4) {
      // Mud and lime mud: smooth, and split by cracks where they dried.
      tone *= (0.9 + 0.2 * noiseM(p, 0.5)) * (1.0 - 0.6 * cracked);
      hi = hi * 0.4 - cracked * 0.5;
      ri = i == 3 ? 0.6 : 0.7;
      gSub[M_CRACKED] += b * dried;
      gSub[M_EARTH] += b * (1.0 - dried);
    } else if (i == 5) {
      // A crust of salt: pale and smooth, with the ridges of its polygons standing a little proud.
      float ridge = 1.0 - smoothstep(0.0, 0.1, crust.x);
      tone *= grain(0.9 + 0.16 * fine) * (1.0 + 0.1 * ridge) * (0.94 + 0.1 * crust.y);
      hi = hi * 0.3 + ridge * 0.6;
      ri = 0.5;
      gSub[M_CRUST] += b;
    } else if (i == 6) {
      tone *= grain(0.8 + 0.4 * noiseM(p, 0.2));
      ri = 0.95;
      gSub[M_SOIL] += b;
    } else {
      tone *= 0.9 + 0.2 * fbmM(p, 0.7);
      hi *= 0.6;
      ri = 0.95;
      gSub[M_GRIT] += b;
    }
    c += tone * b;
    h += hi * b;
    rough += ri * b;
    sum += b;
  }
  h /= sum;
  rough /= sum;
  for (int i = 0; i < M_COUNT; i++) gSub[i] /= sum;
  return c / sum;
}
// The ground close by (docs/plans/RENDERING.md, step 2): soil, litter, mud, sand, gravel and rock, each its own colour,
// roughness and grain, blended by the cover, the slope and the wet, and by height, so that sand fills the hollows and rock
// stands out of them; banks wet and darker as far up as the water rises, with mud and sand on their gentler slopes. Their
// colours are the renderer's, and nobody's record. Gives the ground's colour, how rough it is, and its detail normal.
vec3 groundClose(vec3 c, vec3 p, vec3 n, float dist, vec4 mask, float slope, out float rough, out vec3 nd) {
  rough = 0.92;
  nd = n;
  gWet = 0.0;
  float close = 1.0 - smoothstep(70.0, 260.0, dist);
  float aboveWater;
  float dryBed;
  float water = nearWater(p, aboveWater, dryBed);
  // The bed of a river dry in the month: from the water's map close by, and from the plan's (A 128) further off.
  float wash = max(dryBed, smoothstep(0.3, 0.45, mask.a) * (1.0 - smoothstep(0.55, 0.7, mask.a)));
  // Wet within the water's rise of its level; the bars of its channel where the bank is gentle. A dry bed is not wet.
  float wet = water * smoothstep(1.3, 0.1, aboveWater) * (1.0 - wash);
  float bar = water * smoothstep(0.16, 0.04, slope) * smoothstep(2.2, 0.2, aboveWater);
  gWet = wet;
  if (close <= 0.0) return mix(c, c * 0.62, wet * 0.8);
  vec3 soil = mix(uTone[0], uTone[1], fbmM(p, 2.4)) * grain(0.75 + 0.5 * noiseM(p, 0.2));
  vec3 needles = mix(vec3(0.20, 0.11, 0.05), vec3(0.29, 0.17, 0.08), mix(noiseM(p, 0.05), 0.5, uMaterials));
  vec3 fallen = mix(vec3(0.17, 0.12, 0.06), vec3(0.30, 0.22, 0.10), mix(noiseM(p, 0.09), 0.5, uMaterials));
  vec3 litter = mix(fallen, needles, uLitter) * grain(0.7 + 0.5 * noiseM(p + 7.0, 0.03));
  vec3 mud = mix(uTone[0], uTone[1], 0.3) * vec3(0.62, 0.6, 0.58);
  // Sand: mottled, with a fine grain; and close by its ripples, crests across the wind a hand's breadth apart, wavering,
  // gone before a pixel is too coarse to hold them.
  vec2 wind = normalize(uWind + vec2(1e-4, 0.0));
  float ripple = (abs(fract(dot(p.xy, wind) / 0.25 + fbmM(p, 0.6) * 3.0) - 0.5) * 4.0 - 1.0) * (1.0 - smoothstep(3.0, 9.0, dist));
  vec3 sand = mix(uTone[4], uTone[5], noiseM(p, 0.5)) * (grain(0.88 + 0.2 * noiseM(p, 0.04)) + 0.05 * ripple);
  // Rock and its stones are the colour of the rock under the place, where the world says what it is (uRock).
  vec3 gravel = mix(uRock[1], mix(uTone[4], uTone[5], 0.5), mix(noiseM(p, 0.04), 0.5, uMaterials)) * grain(0.6 + 0.7 * noiseM(p + 2.0, 0.025));
  vec3 rock = uRock[0] * (0.72 + 0.5 * fbmM(p, 0.6));
  // Each one's height, and how much of it there is here.
  float hSoil = fbmM(p, 0.3);
  float hLitter = noiseM(p, 0.07) * 0.6 + noiseM(p + 3.0, 0.22) * 0.4;
  float hMud = noiseM(p, 0.5) * 0.7;
  float hSand = fbmM(p, 0.45) * 0.8 + ripple * 0.12;
  float hGravel = noiseM(p, 0.035);
  float hRock = fbmM(p, 0.8) + 0.2;
  float wRock = smoothstep(0.2, 0.42, slope);
  float wMud = max(wet * (1.0 - wRock), bar * smoothstep(0.5, 0.1, aboveWater));
  // A dry bed is loose sand, with sheets of gravel where the last flood left its bars.
  float bars = smoothstep(0.52, 0.68, fbmM(p, 9.0));
  float wSand = max(max(mask.b * (1.0 - wet) * (1.0 - wRock), bar * smoothstep(0.1, 0.6, aboveWater)), wash * 1.25 * (1.0 - bars));
  float wGravel = max(mask.b * smoothstep(0.06, 0.2, slope) * 0.8, wash * 1.2 * bars);
  float wLitter = mask.r * (1.0 - wet) * (1.0 - wash);
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
  // Close by, with the atlas of leaves, what lies under trees is fallen sprays of their leaves over the earth, each
  // browner or paler than the next: more of them the more canopy there is over the place.
  float litterNear = uMaterials * (1.0 - smoothstep(14.0, 34.0, dist));
  if (litterNear > 0.0 && b1 > 0.0) {
    // In drifts: thick where the last wind left them, a few between.
    float drift = clamp(0.18 + 1.25 * smoothstep(0.3, 0.72, fbmM(p + 31.0, 1.3)), 0.0, 1.0);
    vec2 leaf = fallenLeaves(p, gPDx, gPDy, drift);
    // Browns from nearly black to straw: a russet one here, a yellow or a grey one there, by a number each leaf's
    // own lightness gives it.
    float kind = fract(leaf.y * 17.0);
    vec3 hue = kind < 0.25 ? vec3(1.22, 0.84, 0.6) : kind < 0.5 ? vec3(1.05, 1.0, 0.74) : kind < 0.85 ? vec3(1.0) : vec3(0.85, 0.9, 0.95);
    vec3 dead = mix(vec3(0.05, 0.032, 0.018), vec3(0.5, 0.36, 0.17), smoothstep(0.1, 0.9, leaf.y)) * hue;
    float lies = smoothstep(0.25, 0.6, leaf.x);
    // The earth is in shadow along a leaf's edge.
    float edge = smoothstep(0.02, 0.22, leaf.x) * (1.0 - lies);
    litter = mix(litter, mix(litter * (0.74 - 0.3 * edge), dead, lies), litterNear);
    hLitter = mix(hLitter, hLitter * 0.5 + 0.5 * lies, litterNear);
    gLeaf = lies * litterNear * b1 / sum;
  }
  vec3 g = (soil * b0 + litter * b1 + mud * b2 + sand * b3 + gravel * b4 + rock * b5) / sum;
  float h = (hSoil * b0 + hLitter * b1 + hMud * b2 * 0.3 + hSand * b3 * 0.5 + hGravel * b4 + hRock * b5) / sum;
  float r = (0.95 * b0 + 0.9 * b1 + 0.45 * b2 + 0.9 * b3 + 0.85 * b4 + 0.8 * b5) / sum;
  // Where the world says what the ground is made of, that takes the place of what the climate gave it: all of the bare
  // sand and gravel, and as much of the earth under plants as takes its parent material's colour (uSubSoil.x; the rest
  // is its own dark earth). Litter, the wet of a bank and steep rock stay as they are.
  // A dry bed keeps most of its own loose sand: what a flood brought and sorted, not the ground of the plain around it.
  float ks = uSub.x * (1.0 - 0.7 * wash);
  float k = ks * (b0 * uSubSoil.x + b3 + b4) / sum;
  // Which scanned material gives each its grain: what lies under trees takes the earth's until it has one of its own.
  matNone();
  gMat[M_SOIL] = (b0 * (1.0 - ks * uSubSoil.x) + b1) / sum;
  gMat[M_MUD] = b2 / sum;
  gMat[M_SAND] = b3 * (1.0 - ks) / sum;
  gMat[M_PEBBLES] = b4 * (1.0 - ks) / sum;
  gMat[M_ROCK] = b5 / sum;
  // How much of the ground is sand in all: its ripples are laid over that much of it.
  float sandy = b3 * (1.0 - ks) / sum;
  if (k > 0.004) {
    float sh;
    float sr;
    vec3 sc = substrateGround(p, dist, ripple, g, h, r, sh, sr);
    g = mix(g, sc, k);
    h = mix(h, sh, k);
    r = mix(r, sr, k);
    for (int i = 0; i < M_COUNT; i++) gMat[i] += k * gSub[i];
    sandy += k * gSub[M_SAND];
  } else gMat[M_SOIL] += k;
  // Low plants: where clumps of them stand close by, the ground between them shows; further off, their colour.
  float herb = mask.g * (1.0 - uClumps * 0.3 * (1.0 - smoothstep(40.0, 72.0, dist)));
  vec3 near = mix(g, c, herb * 0.92);
  // Wet ground is darker and smoother.
  near *= 1.0 - 0.38 * wet;
  rough = mix(r, 0.35, wet * 0.8);
  // Grain: the height bumps the light, while it can be seen. With scanned materials only the sand's ripples are left
  // to it, which lie across the wind as no scan's do.
  nd = bumped(n, p, mix(h, ripple * 0.12 * sandy, uMaterials), 0.05 * (1.0 - smoothstep(8.0, 60.0, dist)));
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
  // What its own height bears, where the world gives the climate at a height: a far range has its treeline.
  vec3 share = uShare;
  if (uShareSpan.y > 0.0) {
    float f = clamp((p.z + (fbmM(p, 900.0) - 0.5) * 2.0 * uShareSpan.z - uShareSpan.x) / uShareSpan.y, 0.0, 31.0);
    int k = int(floor(f));
    share = mix(uShareAt[k], uShareAt[min(k + 1, 31)], f - float(k));
  }
  float patchy = smoothstep(0.42, 0.54, mix(fbmM(p, 110.0), fbmM(p, 5000.0), away)) * share.x;
  // And from high up it melts into one tone.
  float melt = smoothstep(60000.0, 500000.0, dist);
  vec4 beyond = mix(vec4(patchy, (1.0 - patchy) * (1.0 - share.z), share.z, 0.0), vec4(0.6 * share.x, (1.0 - 0.6 * share.x) * (1.0 - share.z), share.z, 0.0), melt);
  vec4 mask = beyond;
  if (inside > 0.5) {
    vec2 e = min(muv, 1.0 - muv);
    mask = mix(beyond, texture(uMask, muv), smoothstep(0.0, 0.1, min(e.x, e.y)));
  }
  // Water where the plan's A is full; a dry bed where it is half (scene/v14.ts, coverMask), which is no water.
  water = smoothstep(0.6, 0.95, mask.a) * smoothstep(450.0, 1000.0, dist);
  float wash = smoothstep(0.3, 0.45, mask.a) * (1.0 - smoothstep(0.55, 0.7, mask.a));
  shaded = mask.r;
  float slope = 1.0 - n.z;
  float nearby = 1.0 - smoothstep(40.0, 600.0, dist);
  // Leaf litter under the trees, and earth.
  vec3 soil = mix(uTone[0], uTone[1], fbmM(p, 2.4));
  soil = mix(soil, soil * grain(0.68 + 0.64 * noiseM(p, 0.16)), nearby);
  // Low plants in patches with bare earth between. What they are is not said: no grass, until grass has spread.
  vec3 herb = mix(uTone[2], uTone[3], fbmM(p, 1.1));
  herb = mix(herb, herb * (0.5 + 1.0 * noiseM(p, 0.09)), nearby * (1.0 - 0.6 * uMaterials));
  float thin = smoothstep(0.42, 0.62, fbmM(p, 2.6) * 0.6 + noiseM(p, 0.6) * 0.4);
  herb = mix(herb, soil, thin * 0.8);
  vec3 bare = mix(uTone[4], uTone[5], fbmM(p, 3.0));
  bare = mix(bare, bare * grain(0.8 + 0.4 * noiseM(p, 0.06)), nearby);
  vec3 under = mix(soil, herb, (0.35 + 0.65 * smoothstep(0.34, 0.6, fbmM(p, 9.0))) * mix(uShare.y, share.y, 1.0 - inside));
  vec3 c = mix(under, herb, mask.g);
  c = mix(c, bare, mask.b);
  // The sand of a dry bed, paler than the ground around it: what a flood sorted and left loose.
  c = mix(c, mix(uTone[4], uTone[5], 0.3 + 0.3 * fbmM(p, 14.0)) * 1.12, wash);
  // From afar the canopy hides all that, and at the plain's edge no trees are drawn at all.
  float grain = 1.0 - smoothstep(3000.0, 40000.0, dist);
  vec3 canopy = mix(uTone[6], uTone[7], mix(0.5, fbmM(p, 55.0), grain)) * mix(1.0, 0.8 + 0.4 * noiseM(p, 7.0), grain);
  // In the trees' reach the ground shows between them close by, and the canopy further off; beyond it there is only canopy.
  float far = max(smoothstep(500.0, 2400.0, dist), 1.0 - inside);
  c = mix(c, canopy, mask.r * far);
  vec3 distantHerb = mix(uTone[8], uTone[9], mix(0.5, fbmM(p, 90.0), grain));
  c = mix(c, distantHerb, mask.g * smoothstep(900.0, 5000.0, dist));
  // Close by, what the ground is made of, and its banks.
  matNone();
  gMat[M_SOIL] = 1.0;
  c = groundClose(c, p, n, dist, mask, slope, rough, nd);
  // What people made of it, where the scene has people: a yard is trodden earth; paddies gleam; terraces & furrows catch the light.
  float yard;
  float tilled;
  float paddyWet;
  float fieldBump;
  c = peopled(c, p, n, dist, yard, tilled, paddyWet, fieldBump);
  if (paddyWet > 0.01) rough = mix(rough, 0.14, paddyWet);
  if (abs(fieldBump) > 1e-4) nd = bumped(nd, p, fieldBump, 0.028 * (1.0 - smoothstep(220.0, 1400.0, dist)));
  // Between a crop's rows the ground is tilled earth, as a yard's is trodden.
  float bared = max(yard, tilled * 0.8 * (1.0 - yard));
  matKeep(1.0 - bared);
  gMat[M_EARTH] += bared;
  // Rock on the steep slopes, in beds where it is a face, and snow where the month's climate lays it, off the steepest.
  float steep = smoothstep(0.28, 0.5, slope);
  float face = smoothstep(0.5, 0.72, slope);
  c = mix(c, uRock[0], steep);
  matKeep(1.0 - steep);
  gMat[M_ROCK] += steep * (1.0 - face);
  gMat[M_STRATA] += steep * face;
  float snow = smoothstep(uSnow.x, uSnow.x + uSnow.y, p.z + (fbmM(p, 400.0) - 0.5) * uSnow.y) * (1.0 - smoothstep(uSnow.z - 0.1, uSnow.z + 0.1, slope));
  c = mix(c, vec3(0.86, 0.88, 0.9), snow);
  matKeep(1.0 - snow);
  gMat[M_SNOW] += snow;
  return c;
}
// The floor of a sea: sand in the shallows and on the beach, mud further down, the grey ooze of the deep, and rock where
// it is steep. Its colours are the renderer's, and nobody's record.
vec3 seabed(vec3 p, vec3 n, float dist, out vec3 made) {
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
  // Sand, the finer mud and ooze, and rock: how much of each.
  float rocky = smoothstep(0.25, 0.5, 1.0 - n.z);
  made = vec3((1.0 - muddy) * (1.0 - rocky), muddy * (1.0 - rocky), rocky);
  return mix(c, vec3(0.27, 0.26, 0.24) * (0.8 + 0.4 * fbmM(p, 4.0)), rocky);
}
void main() {
  // How the point's place from the eye changes across a pixel, before anything is left out.
  vec3 relDx = dFdx(vRel);
  vec3 relDy = dFdy(vRel);
  gPDx = relDx.xy;
  gPDy = relDy.xy;
  if (vPos.x > uInner.x && vPos.y > uInner.y && vPos.x < uInner.z && vPos.y < uInner.w) discard;
  vec3 p = vPos;
  vec3 n = normalAt(p.xy);
  float dist = distance(p, uEye);
  float fw = dist * 0.0016;
  // Far off, the shadow map is too coarse to trust: the hills' own shading does the work.
  float sh = mix(shadowAt(p, n, fw), 1.0, smoothstep(9000.0, 22000.0, dist)) * cloudShade(p);
  float ao = uUseAO > 0.005 ? mix(1.0, texture(uAO, gl_FragCoord.xy / uAOSize).r, uUseAO) : 1.0;
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
  matNone();
  gMat[M_SOIL] = 1.0;
  gWet = 0.0;
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
    matKeep(1.0 - mask.r);
    gMat[M_EARTH] += mask.r;
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
      // A slab has its own joints, and none of the earth's grain.
      matKeep(1.0 - smoothstep(0.35, 0.65, mask.b));
    }
    vec3 garden = mix(vec3(0.12, 0.19, 0.06), vec3(0.24, 0.28, 0.10), fbmM(p, 4.0)) * (0.82 + 0.36 * noiseM(p, 0.4));
    c = mix(c, garden, mask.g);
  }
  // Wet, darker ground at the river's edge; where the water is mapped from above, its banks are the close ground's.
  if (uWild > 0.5 && uBanks < 0.995) c = mix(c, vec3(0.15, 0.125, 0.085), smoothstep(uWater + 0.7, uWater + 0.05, p.z) * smoothstep(uWater - 9.0, uWater - 5.0, p.z) * (1.0 - smoothstep(16000.0, 18000.0, length(p.xy))) * 0.9 * (1.0 - uBanks));
  else if (uWild < 0.5) c = mix(c, vec3(0.28, 0.25, 0.18), smoothstep(uWater + 4.0, uWater + 1.0, p.z) * 0.8);
  // In a scene of the sea, its floor under the water, and a beach at the water's edge; no river is painted on it.
  if (uSea > 0.5) {
    float sunk = smoothstep(1.4, -0.4, p.z);
    vec3 made;
    c = mix(c, seabed(p, n, dist, made), sunk);
    matKeep(1.0 - sunk);
    gMat[M_SAND] += sunk * made.x;
    gMat[M_EARTH] += sunk * made.y;
    gMat[M_ROCK] += sunk * made.z;
    river *= 1.0 - sunk;
  }
  // Under the canopy, the crowns take most of the sky's light, as their shadows take the sun's: a forest floor is dim, and a
  // glade bright (docs/plans/RENDERING.md, step 4). From far off the canopy is all that is seen of it.
  float floorShade = 1.0 - 0.72 * canopy * (1.0 - smoothstep(500.0, 2400.0, dist));
  // The grain of the ground's materials, close by: gone before a repeat of one is only a few pixels across.
  float grainy = uMaterials * (1.0 - smoothstep(60.0, 170.0, dist));
  if (grainy > 0.0) {
    vec3 detail;
    float rougher;
    float sky;
    vec3 grained = groundGrain(vRel, relDx, relDy, nd, grainy, detail, rougher, sky);
    // A fallen leaf lies over the earth's grain: smoother than it, and its own colour.
    nd = normalize(mix(grained, nd, 0.7 * gLeaf));
    c *= mix(detail, vec3(1.0), 0.85 * gLeaf);
    // Wet ground keeps its sheen whatever its grain.
    rough = clamp(rough + rougher * (1.0 - 0.7 * gWet), 0.12, 1.0);
    ao *= mix(sky, 1.0, 0.6 * gLeaf);
  }
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
  // The bed of a river dry in the month: its ribbon says where it is, and it holds no water (scene/v14.ts, DRY_BED).
  if (vFlow.z < -0.5) discard;
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
  vec3 cheap = aerial(mix(lit, sky, fres * 0.8) + glint, p, uEye);
  if (uScreen <= 0.005) {
    o = vec4(cheap, 1.0);
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
  vec3 full = mix(bed, c, smoothstep(0.0, 0.3, through));
  o = vec4(mix(cheap, full, clamp(uScreen, 0.0, 1.0)), 1.0);
}`;

// ——— The water seen from above, for its banks (docs/plans/RENDERING.md, step 2) ———

/**
 * The water's mesh from straight above, over a box around the eye: its level, and that it is there; or, for the bed of
 * a river dry in the month, that a dry bed is there, and no water.
 */
export const WATERMAP_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aFlow;
uniform vec4 uBox;
out float vZ;
out float vDry;
void main() {
  vZ = aPos.z;
  vDry = aFlow.z < -0.5 ? 1.0 : 0.0;
  gl_Position = vec4((aPos.xy - uBox.xy) / uBox.zw * 2.0 - 1.0, 0.0, 1.0);
}`;

export const WATERMAP_FS = /* glsl */ `#version 300 es
precision highp float;
in float vZ;
in float vDry;
out vec4 o;
void main() { o = vDry > 0.5 ? vec4(0.0, 0.0, 1.0, 1.0) : vec4(vZ, 1.0, 0.0, 1.0); }`;

/**
 * A blur of the water's map along one direction, its level weighted by how much water there is, so that both reach the
 * banks; and a dry bed's mark, a little way out to its banks.
 */
export const WATERBLUR_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform highp sampler2D uTex;
uniform vec2 uDir;
out vec4 o;
void main() {
  vec3 sum = vec3(0.0);
  for (int i = -4; i <= 4; i++) {
    float w = exp(-float(i * i) * 0.12);
    vec3 t = texture(uTex, vUv + uDir * float(i)).rgb;
    // Premultiplied: a level counts as much as the water it stands for.
    sum += t * w;
  }
  o = vec4(sum / 6.43, 1.0);
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

/**
 * Volumetric clouds marched at half resolution after opaque geometry: any 2x2 full-res block
 * fully covered by terrain or meshes exits before a single density tap, storing alpha = -1 as an
 * occluded sentinel so silhouettes never bleed dark halos into adjacent sky pixels. While the
 * camera moves, valid texels reproject temporally from the previous frame; while still, each frame
 * marches a fresh Halton-stratified offset for TAA to average evenly.
 */
export const CLOUDS_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
uniform mat4 uInvViewProj;
uniform mat4 uCloudReproject;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uSkyTop;
uniform highp sampler3D uNoise;
uniform highp sampler2D uScene;
uniform highp sampler2D uCloudHistory;
uniform vec2 uSceneSize;
uniform vec2 uCloudSize;
uniform vec2 uCloudHistorySize;
uniform float uHeight;
uniform float uCloudBlend;
uniform int uCloudSteps;
${CLOUDS}
out vec4 o;
void main() {
  vec4 a = uInvViewProj * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec4 b = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize(b.xyz / b.w - a.xyz / a.w);
  // Compute derivative before any early return so screen-space footprint stays well-defined across 2x2 quads.
  float footScale = length(fwidth(d));
  ivec2 base = ivec2(gl_FragCoord.xy) * 2;
  ivec2 lim = ivec2(uSceneSize) - 1;
  float a00 = texelFetch(uScene, min(base, lim), 0).a;
  float a10 = texelFetch(uScene, min(base + ivec2(1, 0), lim), 0).a;
  float a01 = texelFetch(uScene, min(base + ivec2(0, 1), lim), 0).a;
  float a11 = texelFetch(uScene, min(base + ivec2(1, 1), lim), 0).a;
  if (min(min(a00, a10), min(a01, a11)) > 0.5) {
    o = vec4(0.0, 0.0, 0.0, -1.0);
    return;
  }
  if (d.z <= 0.012 || uCloudCover <= 0.0 || uCloudAlpha <= 0.001 || uHeight >= uCloudBase) {
    o = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float span = max(uCloudTop - uCloudBase, 1.0);
  float t0 = (uCloudBase - uHeight) / d.z;
  float t1 = min((uCloudTop - uHeight) / d.z, t0 + 6000.0);
  int steps = uCloudSteps > 0 ? min(uCloudSteps, 32) : 32;
  float dt = (t1 - t0) / float(steps);
  float start = fract(fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) + uFrameNoise);
  float mu = dot(d, uSun);
  float g1 = 0.6;
  float forward = (1.0 - g1 * g1) / (12.566 * pow(1.0 + g1 * g1 - 2.0 * g1 * mu, 1.5));
  float phase = mix(0.08, forward, 0.5) * 12.566;
  vec3 eye = vec3(0.0, 0.0, uHeight);
  vec3 glow = vec3(0.0);
  float through = 1.0;
  float foot = t0 * footScale / d.z;
  for (int i = 0; i < 32; i++) {
    if (i >= steps) break;
    vec3 p = eye + d * (t0 + (float(i) + start) * dt);
    float rho = cloudDensityAt(p, foot);
    if (rho <= 0.0) continue;
    float toward = cloudDensity(p + uSun * 110.0) + cloudDensity(p + uSun * 300.0) * 1.5 + cloudDensityAt(p + uSun * 900.0, 2000.0) * 3.0 + cloudDensityAt(p + uSun * 2200.0, 2000.0) * 5.0;
    float sunlit = exp(-toward * 0.8) * (1.0 - exp(-rho * 4.0));
    float height = (p.z - uCloudBase) / span;
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
  vec4 cur = vec4(glow, through);
  if (uCloudBlend < 0.99) {
    float tMid = 0.5 * (t0 + t1);
    vec4 prev = uCloudReproject * vec4(d * tMid, 1.0);
    if (prev.w > 0.0) {
      vec2 puv = prev.xy / prev.w * 0.5 + 0.5;
      if (puv.x > 0.0 && puv.y > 0.0 && puv.x < 1.0 && puv.y < 1.0) {
        vec2 hp = puv * uCloudHistorySize - 0.5;
        ivec2 hi0 = ivec2(floor(hp));
        vec2 hf = hp - vec2(hi0);
        ivec2 hlim = ivec2(uCloudHistorySize) - 1;
        vec4 hacc = vec4(0.0);
        float hw = 0.0;
        for (int j = 0; j <= 1; j++) {
          for (int i = 0; i <= 1; i++) {
            vec4 hs = texelFetch(uCloudHistory, clamp(hi0 + ivec2(i, j), ivec2(0), hlim), 0);
            if (hs.a >= 0.0) {
              float w = (i == 0 ? 1.0 - hf.x : hf.x) * (j == 0 ? 1.0 - hf.y : hf.y);
              hacc += hs * w;
              hw += w;
            }
          }
        }
        if (hw > 0.05) cur = mix(hacc / hw, cur, uCloudBlend);
      }
    }
  }
  o = cur;
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
uniform highp sampler2D uClouds;
uniform vec2 uCloudSize;
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
  // Clouds: flat on the lighter way; at full quality, upsampled from the half-res CLOUDS_FS target
  // with valid-texel weights so occluded terrain/canopy silhouettes never bleed into sky pixels.
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
  } else if (d.z > 0.012 && uCloudCover > 0.0 && uCloudAlpha > 0.001 && uHeight < uCloudBase) {
    vec2 p = vUv * uCloudSize - 0.5;
    ivec2 i0 = ivec2(floor(p));
    vec2 f = p - vec2(i0);
    ivec2 lim = ivec2(uCloudSize) - 1;
    vec4 acc = vec4(0.0);
    float wsum = 0.0;
    for (int j = 0; j <= 1; j++) {
      for (int i = 0; i <= 1; i++) {
        vec4 s = texelFetch(uClouds, clamp(i0 + ivec2(i, j), ivec2(0), lim), 0);
        if (s.a >= 0.0) {
          float w = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
          acc += s * w;
          wsum += w;
        }
      }
    }
    if (wsum > 1e-4) {
      vec4 cl = acc / wsum;
      c = mix(c, c * cl.a + cl.rgb, uCloudAlpha);
    }
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
uniform int uAOSteps;
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
  vec3 p = viewPos(vUv);
  vec3 rawN = cross(dFdx(p), dFdy(p));
  if (raw >= 1.0) {
    o = vec4(1.0);
    return;
  }
  float nLen = length(rawN);
  vec3 n = nLen > 1e-12 ? rawN / nLen : vec3(0.0, 0.0, 1.0);
  float pLen = length(p);
  vec3 v = pLen > 1e-6 ? -p / pLen : vec3(0.0, 0.0, 1.0);
  if (dot(n, v) < 0.0) n = -n;
  float dist = -p.z;
  // The radius grows with distance, and reaches further close by: the foot of a wall, a crown over the ground; far
  // away, the streets of a city.
  float radius = clamp(dist * 0.05, 1.2, 30.0);
  vec2 sr = radius / (uProjK * dist) * 0.5;
  float turn = ign(gl_FragCoord.xy) * PI;
  float jitter = fract(ign(gl_FragCoord.yx + 7.0) + 0.5);
  const int SLICES = 2;
  int steps = uAOSteps > 0 ? min(uAOSteps, 6) : 6;
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
    for (int i = 0; i < 6; i++) {
      if (i >= steps) break;
      float t = (float(i) + jitter) / float(steps);
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
  if (any(isnan(cur.rgb)) || any(isinf(cur.rgb))) cur.rgb = vec3(0.0);
  if (uBlend >= 1.0) {
    o = cur;
    return;
  }
  vec2 uv = vUv;
  if (uMoving > 0.5) {
    float d = texture(uDepth, vUv).r;
    vec4 p = uReproject * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    if (p.w <= 1e-6) {
      o = cur;
      return;
    }
    uv = p.xy / p.w * 0.5 + 0.5;
  }
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    o = cur;
    return;
  }
  vec3 h = texture(uHistory, uv).rgb;
  if (any(isnan(h)) || any(isinf(h))) {
    o = cur;
    return;
  }
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

// ——— Octahedral tree impostors (8x8 upper-hemisphere atlas baked on GPU) ———

const IMP_OCT_COMMON = /* glsl */ `
const float IMP_GRID = 8.0;
const float IMP_PAD = 0.5 / 64.0;
// Sample one 64x64 cell of an 8x8 octahedral atlas layer with explicit mip gradients and border clamp.
vec4 impTap(highp sampler2DArray tex, vec2 cell, vec2 uv, vec2 dx, vec2 dy, float layer) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  vec2 clamped = clamp(uv, vec2(IMP_PAD), vec2(1.0 - IMP_PAD));
  return textureGrad(tex, vec3((cell + clamped) / IMP_GRID, layer), dx, dy);
}
`;

export const IMP_BAKE_VS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in uvec2 aMat;
uniform vec3 uCenter;
uniform float uInvR;
uniform vec3 uRx;
uniform vec3 uRy;
uniform vec3 uDir;
out vec3 vPos;
out vec3 vN;
out vec2 vUv;
out float vLight;
flat out int vMaterial;
flat out float vTint;
void main() {
  vec3 q = aPos - uCenter;
  gl_Position = vec4(dot(q, uRx) * uInvR, dot(q, uRy) * uInvR, -dot(q, uDir) * uInvR, 1.0);
  vPos = aPos;
  vN = aNormal.xyz * 2.0 - 1.0;
  vUv = aUv;
  vLight = aNormal.w;
  vMaterial = int(aMat.x);
  vTint = float(aMat.y) / 255.0;
}`;

export const IMP_BAKE_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2DArray;
in vec3 vPos;
in vec3 vN;
in vec2 vUv;
in float vLight;
flat in int vMaterial;
flat in float vTint;
uniform highp sampler3D uNoise;
uniform float uWild;
uniform vec3 uTone[10];
uniform vec3 uRock[2];
uniform vec3 uSubTone[16];
${LEAVES}
layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oNormal;
float impNoise(vec3 p, float size) { return texture(uNoise, p / (64.0 * size)).r; }
float impFbm(vec3 p, float size) {
  vec3 q = p / (64.0 * size);
  return texture(uNoise, q).r * 0.5 + texture(uNoise, q * 2.03 + 0.37).g * 0.3 + texture(uNoise, q * 4.1 + 0.71).b * 0.2;
}
void main() {
  const int MARBLE=1, TRAVERTINE=2, BRICK=3, PLASTER=4, TILE=5, GILT=6, BRONZE=7, GRANITE=8, WOOD=9, DARK=10, PAVING=11, BASALT=12, SAND=13, CONCRETE=14, LEAD=15, LEAF=16, TRUNK=17, GRASS=18, SHAFT=19, FACADE=20, STATUE=21, EARTH=22, SEATS=23, AWNING=24, SPIRAL=25, CLOTH=26, DENTIL=28, FRIEZE=29, POOL=30, NEEDLE=35, FROND=36, BARK=37, BROAD=38, THATCH=42, MUD=43;
  const int WATTLE=50, LIMEWASH=51, HALFTIMBER=52, LOGS=53, PLANKS=54, RUBBLE=55, MATTING=56, FELT=57, TANNED=58, HAIRCLOTH=59, SOD=60, SNOW=61, EARTHROOF=62, SHINGLE=63, LEAFTHATCH=64, BRUSHWOOD=65, REEDWORK=66, ROPE=67, PAINTED=68, ADOBE=69, CLAYTILE=70;
  const int STONE=74, FALLEN_BARK=75, HEARTWOOD=76;
  bool card = onCard(vMaterial);
  float leafLight = 0.58;
  float leafWood = 0.0;
  vec3 albedo = vec3(0.45, 0.40, 0.34);
  bool leafy = card || vMaterial == LEAF_MASS || vMaterial == BLADE || vMaterial == NEEDLE || vMaterial == FROND || vMaterial == BROAD || vMaterial == LEAF;
  float age = fract(vTint * 11.3);
  float shade = fract(vTint * 29.7);
  float fbm = impFbm(vPos, 1.4);
  if (card) {
    vec4 t = leafTexel(vUv);
    if (t.a < LEAF_CUT) discard;
    leafLight = t.r;
    leafWood = t.g;
    vec3 dark = mix(vec3(0.028, 0.06, 0.024), vec3(0.052, 0.078, 0.022), vTint);
    vec3 lite = mix(vec3(0.085, 0.14, 0.04), vec3(0.16, 0.185, 0.05), vTint);
    if (vMaterial == NEEDLE_CARD) {
      dark = mix(vec3(0.03, 0.064, 0.032), vec3(0.05, 0.085, 0.036), vTint);
      lite = mix(vec3(0.075, 0.135, 0.05), vec3(0.135, 0.185, 0.06), vTint);
    } else if (vMaterial == FROND_CARD || vMaterial == FAN_CARD) {
      dark = mix(vec3(0.05, 0.11, 0.035), vec3(0.075, 0.13, 0.04), vTint);
      lite = mix(vec3(0.16, 0.25, 0.07), vec3(0.25, 0.30, 0.085), vTint);
    }
    vec3 leaf = mix(dark, lite, clamp(0.3 * impFbm(vPos, 2.5) + leafLight * 0.95 - 0.08, 0.0, 1.0));
    vec3 twig = mix(vec3(0.17, 0.13, 0.095), vec3(0.31, 0.22, 0.14), 0.4) * (0.5 + 0.9 * leafLight);
    albedo = mix(leaf, twig, leafWood);
  } else if (vMaterial == LEAF_MASS) {
    float fleck = impNoise(vPos, 0.11) * 0.55 + impNoise(vPos + 5.0, 0.3) * 0.45;
    albedo = mix(vec3(0.03, 0.06, 0.026), vec3(0.05, 0.08, 0.03), vTint) * (0.45 + 0.9 * smoothstep(0.3, 0.75, fleck)) * (0.8 + 0.4 * impFbm(vPos, 1.5));
  } else if (vMaterial == BLADE || vMaterial == NEEDLE || vMaterial == BROAD || vMaterial == FROND || vMaterial == LEAF) {
    vec3 dark = vMaterial == FROND ? mix(vec3(0.05, 0.11, 0.035), vec3(0.075, 0.13, 0.04), vTint) : mix(vec3(0.028, 0.06, 0.024), vec3(0.052, 0.078, 0.022), vTint);
    vec3 lite = vMaterial == FROND ? mix(vec3(0.16, 0.25, 0.07), vec3(0.25, 0.30, 0.085), vTint) : mix(vec3(0.085, 0.14, 0.04), vec3(0.16, 0.185, 0.05), vTint);
    float fleck = impNoise(vPos, 0.18) * 0.6 + impNoise(vPos + 5.0, 0.35) * 0.4;
    albedo = mix(dark, lite, smoothstep(0.3, 0.72, fleck)) * (0.82 + 0.38 * impFbm(vPos, 3.0));
  } else if (vMaterial == BARK || vMaterial == TRUNK || vMaterial == FALLEN_BARK) {
    vec3 base = mix(vec3(0.17, 0.13, 0.095), vec3(0.31, 0.22, 0.14), vTint);
    base = mix(base, vec3(dot(base, vec3(0.333))) * vec3(1.03, 1.0, 0.95), 0.4 * fract(vTint * 7.3));
    albedo = base * (0.76 + 0.42 * impFbm(vPos, 1.2));
  } else if (vMaterial == HEARTWOOD) {
    albedo = mix(vec3(0.28, 0.19, 0.10), vec3(0.17, 0.155, 0.135), 0.5) * (0.84 + 0.32 * fbm);
  } else if (vMaterial == THATCH) {
    albedo = mix(vec3(0.50, 0.40, 0.20), vec3(0.27, 0.24, 0.17), 0.2 + 0.65 * age) * (0.84 + 0.30 * fbm);
  } else if (vMaterial == MUD || vMaterial == ADOBE) {
    albedo = mix(vec3(0.52, 0.42, 0.30), vec3(0.41, 0.32, 0.23), shade) * (0.84 + 0.28 * fbm);
  } else if (vMaterial == WATTLE) {
    albedo = mix(vec3(0.31, 0.24, 0.15), vec3(0.42, 0.33, 0.21), shade) * (0.82 + 0.32 * fbm);
  } else if (vMaterial == LIMEWASH || vMaterial == PAINTED) {
    vec3 base = mix(vec3(0.80, 0.78, 0.71), vec3(0.87, 0.85, 0.79), shade);
    if (vMaterial == PAINTED) {
      vec3 pigment = mix(vec3(0.45, 0.19, 0.11), vec3(0.50, 0.32, 0.16), smoothstep(0.45, 0.85, shade));
      base = mix(base, pigment, (1.0 - smoothstep(0.68, 0.74, vPos.z)) * 0.78);
    }
    albedo = base * (0.86 + 0.22 * fbm);
  } else if (vMaterial == HALFTIMBER) {
    vec3 daub = mix(vec3(0.70, 0.64, 0.50), vec3(0.80, 0.76, 0.66), shade);
    vec3 wood = vec3(0.17, 0.12, 0.08);
    albedo = mix(daub, wood, 0.22) * (0.86 + 0.24 * fbm);
  } else if (vMaterial == LOGS || vMaterial == PLANKS || vMaterial == WOOD) {
    vec3 base = mix(vec3(0.31, 0.21, 0.13), vec3(0.42, 0.31, 0.20), shade);
    albedo = mix(base, vec3(0.34, 0.32, 0.29), 0.25 * age) * (0.80 + 0.36 * fbm);
  } else if (vMaterial == RUBBLE) {
    albedo = mix(vec3(0.38, 0.36, 0.33), vec3(0.56, 0.52, 0.45), shade) * (0.82 + 0.34 * fbm);
  } else if (vMaterial == MATTING || vMaterial == REEDWORK) {
    albedo = mix(vec3(0.52, 0.44, 0.25), vec3(0.41, 0.36, 0.22), 0.2 + 0.6 * age) * (0.84 + 0.30 * fbm);
  } else if (vMaterial == FELT) {
    albedo = mix(vec3(0.63, 0.60, 0.53), vec3(0.74, 0.72, 0.66), shade) * (0.86 + 0.22 * fbm);
  } else if (vMaterial == TANNED) {
    albedo = mix(vec3(0.50, 0.40, 0.27), vec3(0.63, 0.54, 0.39), shade) * (0.84 + 0.28 * fbm);
  } else if (vMaterial == HAIRCLOTH) {
    albedo = mix(vec3(0.05, 0.045, 0.04), vec3(0.09, 0.075, 0.058), shade) * (0.80 + 0.40 * fbm);
  } else if (vMaterial == SOD) {
    vec3 grass = mix(vec3(0.15, 0.21, 0.08), vec3(0.30, 0.31, 0.13), fbm);
    vec3 earth = mix(vec3(0.20, 0.16, 0.10), vec3(0.29, 0.23, 0.15), shade);
    albedo = mix(earth, grass, smoothstep(0.35, 0.7, vN.z));
  } else if (vMaterial == SNOW) {
    albedo = vec3(0.84, 0.89, 0.95) * (0.92 + 0.12 * fbm);
  } else if (vMaterial == EARTHROOF || vMaterial == EARTH) {
    albedo = mix(vec3(0.47, 0.39, 0.28), vec3(0.34, 0.28, 0.18), shade) * (0.84 + 0.30 * fbm);
  } else if (vMaterial == SHINGLE) {
    albedo = mix(vec3(0.31, 0.26, 0.21), vec3(0.42, 0.39, 0.35), 0.2 + 0.7 * age) * (0.82 + 0.34 * fbm);
  } else if (vMaterial == CLAYTILE || vMaterial == TILE) {
    vec3 fresh = mix(vec3(0.58, 0.28, 0.16), vec3(0.66, 0.38, 0.22), vTint);
    vec3 old = mix(vec3(0.36, 0.28, 0.24), vec3(0.45, 0.34, 0.27), shade);
    albedo = mix(fresh, old, vMaterial == CLAYTILE ? 0.65 : fract(vTint * 7.3) * 0.75) * (0.80 + 0.36 * fbm);
  } else if (vMaterial == LEAFTHATCH) {
    albedo = mix(vec3(0.34, 0.29, 0.14), vec3(0.22, 0.27, 0.11), (1.0 - age) * 0.5) * (0.82 + 0.34 * fbm);
  } else if (vMaterial == BRUSHWOOD) {
    albedo = mix(vec3(0.15, 0.125, 0.095), vec3(0.22, 0.18, 0.125), shade) * (0.78 + 0.40 * fbm);
  } else if (vMaterial == ROPE) {
    albedo = vec3(0.21, 0.16, 0.10) * (0.80 + 0.35 * fbm);
  } else if (vMaterial == MARBLE || vMaterial == SHAFT || vMaterial == DENTIL || vMaterial == FRIEZE || vMaterial == SPIRAL) {
    albedo = vec3(0.83, 0.81, 0.76) * (0.88 + 0.18 * fbm);
  } else if (vMaterial == TRAVERTINE || vMaterial == SEATS) {
    albedo = vec3(0.64, 0.58, 0.47) * (0.84 + 0.26 * fbm);
  } else if (vMaterial == BRICK) {
    albedo = mix(vec3(0.46, 0.28, 0.21), vec3(0.58, 0.38, 0.27), vTint) * (0.82 + 0.30 * fbm);
  } else if (vMaterial == PLASTER || vMaterial == FACADE) {
    albedo = mix(vec3(0.62, 0.48, 0.37), vec3(0.78, 0.74, 0.65), vTint) * (0.82 + 0.28 * fbm);
  } else if (vMaterial == GILT) {
    albedo = vec3(0.95, 0.74, 0.34) * (0.86 + 0.20 * fbm);
  } else if (vMaterial == BRONZE || vMaterial == STATUE) {
    albedo = mix(vec3(0.50, 0.38, 0.22), vec3(0.28, 0.40, 0.33), fbm);
  } else if (vMaterial == GRANITE) {
    albedo = mix(vec3(0.42, 0.37, 0.37), vec3(0.60, 0.47, 0.44), vTint);
  } else if (vMaterial == DARK) {
    albedo = vec3(0.025, 0.022, 0.020);
  } else if (vMaterial == PAVING || vMaterial == CONCRETE) {
    albedo = mix(vec3(0.56, 0.52, 0.46), vec3(0.38, 0.35, 0.29), uWild) * (0.84 + 0.28 * fbm);
  } else if (vMaterial == BASALT || vMaterial == LEAD) {
    albedo = vec3(0.26, 0.26, 0.26) * (0.82 + 0.32 * fbm);
  } else if (vMaterial == SAND) {
    albedo = mix(vec3(0.72, 0.62, 0.46), vec3(0.38, 0.31, 0.21), uWild) * (0.84 + 0.28 * fbm);
  } else if (vMaterial == GRASS) {
    albedo = mix(vec3(0.15, 0.21, 0.08), vec3(0.28, 0.30, 0.12), fbm);
  } else if (vMaterial == CLOTH || vMaterial == AWNING) {
    albedo = vTint < 0.33 ? vec3(0.56, 0.20, 0.15) : vTint < 0.66 ? vec3(0.72, 0.66, 0.54) : vec3(0.24, 0.32, 0.42);
  } else if (vMaterial == POOL) {
    albedo = vec3(0.05, 0.10, 0.09);
  } else if (vMaterial == STONE) {
    bool said = dot(uSubTone[3], vec3(1.0)) > 0.0;
    vec3 tone = said ? mix(uSubTone[2], uSubTone[3], fract(vTint * 7.0)) : uRock[1];
    albedo = tone * (0.72 + 0.46 * fbm);
  }
  if (leafy && uWild > 0.5) {
    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
    vec3 place = mix(uTone[6], uTone[7], leafLight);
    float lum = dot(albedo, LUMA);
    float plum = max(dot(place, LUMA), 1e-3);
    albedo = mix(albedo, place * (lum / plum), 0.62 * (1.0 - leafWood));
  }
  vec3 bn = length(vN) > 1e-6 ? normalize(vN) : vec3(0.0, 0.0, 1.0);
  if (!leafy && !gl_FrontFacing) bn = -bn;
  oAlbedo = vec4(clamp(albedo, 0.0, 1.0), 1.0);
  oNormal = vec4(bn * 0.5 + 0.5, clamp(vLight, 0.0, 1.0));
}`;

export const IMPOSTOR_VS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec2 aQuad;
layout(location = 5) in vec4 iPlace;
layout(location = 6) in vec2 iFace;
layout(location = 7) in uvec2 iMeta;
uniform mat4 uViewProj;
uniform vec3 uEye;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
// Nonzero only in orthographic shadow passes: unit direction toward the sun.
uniform vec3 uOrthoDir;
uniform float uClock;
uniform vec2 uWind;
uniform float uImpMidZ;
uniform float uImpRadius;
// 1.0 for foliage impostors (sway gently in wind), 0.0 for rigid structures/dwellings.
uniform float uImpSway;
// >= 0 during shadow passes for conservative per-instance cascade frustum culling.
uniform float uShadowPad;
// Screen-size fade-in for impostors (0 in shadow/depth/pick passes).
uniform float uFadeK;
uniform float uProtoExtent;
${DROP}
${ENTITY}
vec3 toTreeLocal(vec3 w, vec2 face) {
  return vec3(w.x * face.y - w.y * face.x, w.x * face.x + w.y * face.y, w.z);
}
vec2 hemiOctEncode(vec3 d) {
  float cz = max(d.z, 0.0);
  vec2 p = d.xy / max(abs(d.x) + abs(d.y) + cz, 1e-5);
  return vec2(0.5 * (p.x + p.y) + 0.5, 0.5 * (p.x - p.y) + 0.5);
}
vec2 octProject(vec3 qQuad, vec3 vDir, vec2 cell) {
  vec2 uv = cell / 7.0;
  vec2 s = uv * 2.0 - 1.0;
  vec2 p = vec2(0.5 * (s.x + s.y), 0.5 * (s.x - s.y));
  vec3 d = normalize(vec3(p, max(0.0, 1.0 - abs(p.x) - abs(p.y))));
  vec3 rx = vec3(-d.y, d.x, 0.0);
  float rl = length(rx.xy);
  rx = rl < 1e-4 ? vec3(1.0, 0.0, 0.0) : rx / rl;
  vec3 ry = cross(d, rx);
  vec3 q = qQuad - vDir * (dot(qQuad, d) / max(dot(vDir, d), 0.35));
  return vec2(dot(q, rx), dot(q, ry)) * 0.5 + 0.5;
}
out vec3 vPos;
out vec2 vUv0;
out vec2 vUv1;
out vec2 vUv2;
flat out vec2 vCell0;
flat out vec2 vCell1;
flat out vec2 vCell2;
flat out vec3 vWeights;
flat out vec2 vFace;
flat out float vTint;
flat out float vFlags;
flat out int vEntity;
flat out float vLow;
flat out float vInstFade;
void main() {
  float sc = abs(iPlace.w);
  if (uShadowPad >= 0.0) {
    vec3 ctr = iPlace.xyz + vec3(0.0, 0.0, uImpMidZ * sc);
    ctr.z -= drop(ctr.xy);
    vec4 cs = uViewProj * vec4(ctr, 1.0);
    float pad = uShadowPad * sc;
    if (abs(cs.x) > 1.0 + pad || abs(cs.y) > 1.0 + pad) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
  }
  int entity = int(iMeta.x);
  vec4 e = entityOf(entity);
  float up = standing(e);
  if (up <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 center = iPlace.xyz + vec3(0.0, 0.0, uImpMidZ * sc);
  if (uImpSway > 0.5 && dot(uWind, uWind) > 0.0) {
    float own = fract(sin(dot(iPlace.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float h = max(uImpMidZ * sc, 0.5);
    float speed = length(uWind);
    vec2 dir = uWind / speed;
    float gust = 0.55 + 0.45 * sin(uClock * 0.6 - dot(iPlace.xy, dir) * 0.035) * sin(uClock * 0.21 + own * 6.2831853);
    float lean = gust * speed * 0.05 * h / (1.0 + h * 0.15) * (0.8 + 0.2 * sin(uClock * 1.7 + own * 19.0));
    center += vec3(dir * lean * (0.5 + 0.5 * aQuad.y), 0.0);
  }
  float R = uImpRadius * sc;
  vec3 p = center + (uCamRight * aQuad.x + uCamUp * aQuad.y) * R;
  if (up < 1.0) p.z = e.w + (p.z - e.w) * up;
  vPos = p;
  vec3 pCurved = p;
  pCurved.z -= drop(pCurved.xy);
  gl_Position = uViewProj * vec4(pCurved - uEye, 1.0);

  vec3 viewWorld = length(uOrthoDir) > 0.5 ? uOrthoDir : normalize(uEye - center);
  vec3 vLocRaw = toTreeLocal(viewWorld, iFace);
  vec3 vDir = normalize(vec3(vLocRaw.xy, max(vLocRaw.z, 0.0)));
  vec3 rLoc = toTreeLocal(uCamRight, iFace);
  vec3 uLoc = toTreeLocal(uCamUp, iFace);
  vec3 qQuad = aQuad.x * rLoc + aQuad.y * uLoc;

  vec2 oct = hemiOctEncode(vDir) * 7.0;
  vec2 i0 = min(floor(oct), vec2(6.0));
  vec2 f = clamp(oct - i0, vec2(0.0), vec2(1.0));
  vCell0 = i0;
  vCell1 = i0 + (f.x >= f.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  vCell2 = i0 + vec2(1.0, 1.0);
  vWeights = vec3(1.0 - max(f.x, f.y), abs(f.x - f.y), min(f.x, f.y));
  vUv0 = octProject(qQuad, vDir, vCell0);
  vUv1 = octProject(qQuad, vDir, vCell1);
  vUv2 = octProject(qQuad, vDir, vCell2);
  vFace = iFace;
  vTint = float(iMeta.y) / 255.0;
  vFlags = e.z;
  vEntity = entity;
  vLow = uImpMidZ * sc;
  if (uFadeK > 0.0) {
    vec3 ctr = vec3(center.xy, center.z - drop(center.xy));
    float instDist = max(length(ctr - uEye), 1.0);
    float pxs = (uProtoExtent * sc * uFadeK) / instDist;
    vInstFade = smoothstep(1.2, 3.8, pxs);
  } else {
    vInstFade = 1.0;
  }
}`;

export const IMPOSTOR_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2DArray;
precision highp sampler2DArrayShadow;
in vec3 vPos;
in vec2 vUv0;
in vec2 vUv1;
in vec2 vUv2;
flat in vec2 vCell0;
flat in vec2 vCell1;
flat in vec2 vCell2;
flat in vec3 vWeights;
flat in vec2 vFace;
flat in float vTint;
flat in float vFlags;
flat in int vEntity;
flat in float vLow;
flat in float vInstFade;
uniform vec3 uEye;
uniform float uWild;
uniform highp sampler2D uMask;
uniform vec4 uMaskBox;
uniform float uEvidence;
uniform highp sampler2DArray uImpAlbedo;
uniform highp sampler2DArray uImpNormal;
uniform float uImpLayer;
// 0.0 = foliage (wrap lighting + green backlit translucency), 1.0 = rigid built/stone (Lambertian + SH sky).
uniform float uImpKind;
out vec4 o;
${LIGHTING}
${IMP_OCT_COMMON}
void main() {
  // Compute derivatives before any discard so mip selection stays uniform across 2x2 pixel quads.
  vec2 dx0 = dFdx(vUv0) / IMP_GRID, dy0 = dFdy(vUv0) / IMP_GRID;
  vec2 dx1 = dFdx(vUv1) / IMP_GRID, dy1 = dFdy(vUv1) / IMP_GRID;
  vec2 dx2 = dFdx(vUv2) / IMP_GRID, dy2 = dFdy(vUv2) / IMP_GRID;
  vec4 a0 = impTap(uImpAlbedo, vCell0, vUv0, dx0, dy0, uImpLayer);
  vec4 a1 = impTap(uImpAlbedo, vCell1, vUv1, dx1, dy1, uImpLayer);
  vec4 a2 = impTap(uImpAlbedo, vCell2, vUv2, dx2, dy2, uImpLayer);
  vec4 aMix = a0 * vWeights.x + a1 * vWeights.y + a2 * vWeights.z;
  float alpha = aMix.a;
  float effAlpha = alpha * vInstFade;
  float dither = fract(fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) + uFrameNoise);
  if (effAlpha <= 0.06 || effAlpha < 0.06 + 0.88 * dither) discard;

  vec4 n0 = impTap(uImpNormal, vCell0, vUv0, dx0, dy0, uImpLayer);
  vec4 n1 = impTap(uImpNormal, vCell1, vUv1, dx1, dy1, uImpLayer);
  vec4 n2 = impTap(uImpNormal, vCell2, vUv2, dx2, dy2, uImpLayer);
  float nw = max(a0.a * vWeights.x + a1.a * vWeights.y + a2.a * vWeights.z, 1e-4);
  vec4 nMix = (n0 * (a0.a * vWeights.x) + n1 * (a1.a * vWeights.y) + n2 * (a2.a * vWeights.z)) / nw;

  vec3 albedo = clamp(aMix.rgb / max(alpha, 0.06), 0.0, 1.0);
  bool rigid = uImpKind > 0.5;
  if (rigid) {
    albedo *= 0.92 + 0.16 * fract(vTint * 5.3);
  } else if (uWild > 0.5) {
    // Per-instance tone shift matching MESH_FS so adjacent trees vary naturally.
    albedo *= 0.82 + 0.36 * fract(vTint * 5.3);
  }

  vec3 nlRaw = nMix.rgb * 2.0 - 1.0;
  float nlLen = length(nlRaw);
  vec3 nl = nlLen > 1e-6 ? nlRaw / nlLen : vec3(0.0, 0.0, 1.0);
  vec3 nRaw = vec3(nl.x * vFace.y + nl.y * vFace.x, -nl.x * vFace.x + nl.y * vFace.y, nl.z);
  float nLen = length(nRaw);
  vec3 n = nLen > 1e-6 ? nRaw / nLen : vec3(0.0, 0.0, 1.0);
  float skyOcc = nMix.a;
  vec3 toEye = uEye - vPos;
  float toEyeLen = length(toEye);
  float pixel = toEyeLen * 0.002;
  float sh = shadowAt(vPos, n, pixel) * cloudShade(vPos);
  vec3 v = toEyeLen > 1e-6 ? toEye / toEyeLen : vec3(0.0, 0.0, 1.0);
  float up = n.z * 0.5 + 0.5;
  vec3 skyC = skyLight(n);
  float grey = dot(skyC, vec3(0.3, 0.5, 0.2));
  skyC = mix(vec3(grey), skyC, 0.5) + uBounce * 0.45;
  vec3 bounce = uBounce * (1.0 - up) * (0.4 + 0.6 * sh);
  vec3 c;
  if (rigid) {
    float ndl = max(dot(n, uSun), 0.0);
    float occl = skyOcc * 0.5 + 0.5;
    c = albedo * (uSunColor * ndl * sh + (skyC + bounce) * occl);
  } else {
    float wrap = clamp((dot(n, uSun) + 0.3) / 1.3, 0.0, 1.0);
    c = albedo * (uSunColor * wrap * sh + (skyC + bounce) * skyOcc);
    float behind = pow(max(dot(-v, uSun), 0.0), 4.0);
    c += albedo * vec3(1.1, 1.3, 0.5) * uSunColor * sh * (0.28 * behind);
  }
  if (uSea > 0.5 && vPos.z < 0.0) c *= seaLight(vPos.z);
  c = seen(c, vPos, uEye);

  int flags = int(vFlags);
  int basis = flags & 7;
  if (uEvidence > 0.5) {
    float hatch = step(0.62, fract((gl_FragCoord.x + gl_FragCoord.y) / 9.0));
    vec3 tint2 = basis >= 3 ? vec3(0.92, 0.25, 0.75) : basis >= 1 ? vec3(0.95, 0.65, 0.18) : vec3(0.3, 0.85, 0.5);
    c = mix(c, tint2 * 1.2, 0.18 + 0.28 * hatch);
  }
  if ((flags & 8) != 0) {
    float e = pow(1.0 - abs(dot(v, n)), 2.0);
    c += vec3(1.0, 0.82, 0.42) * (0.1 + 0.55 * e);
  } else if ((flags & 16) != 0) {
    c += vec3(0.9, 0.8, 0.6) * 0.06;
  }
  o = vec4(c, 1.0);
}`;

export const IMPOSTOR_DEPTH_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
in vec2 vUv0;
in vec2 vUv1;
in vec2 vUv2;
flat in vec2 vCell0;
flat in vec2 vCell1;
flat in vec2 vCell2;
flat in vec3 vWeights;
uniform highp sampler2DArray uImpAlbedo;
uniform float uImpLayer;
out vec4 o;
${IMP_OCT_COMMON}
void main() {
  vec2 dx0 = dFdx(vUv0) / IMP_GRID, dy0 = dFdy(vUv0) / IMP_GRID;
  vec2 dx1 = dFdx(vUv1) / IMP_GRID, dy1 = dFdy(vUv1) / IMP_GRID;
  vec2 dx2 = dFdx(vUv2) / IMP_GRID, dy2 = dFdy(vUv2) / IMP_GRID;
  float alpha = impTap(uImpAlbedo, vCell0, vUv0, dx0, dy0, uImpLayer).a * vWeights.x
              + impTap(uImpAlbedo, vCell1, vUv1, dx1, dy1, uImpLayer).a * vWeights.y
              + impTap(uImpAlbedo, vCell2, vUv2, dx2, dy2, uImpLayer).a * vWeights.z;
  if (alpha < 0.36) discard;
  o = vec4(0.0);
}`;

export const IMPOSTOR_ID_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
in vec2 vUv0;
in vec2 vUv1;
in vec2 vUv2;
flat in vec2 vCell0;
flat in vec2 vCell1;
flat in vec2 vCell2;
flat in vec3 vWeights;
flat in int vEntity;
uniform highp sampler2DArray uImpAlbedo;
uniform float uImpLayer;
out vec4 o;
${IMP_OCT_COMMON}
void main() {
  vec2 dx0 = dFdx(vUv0) / IMP_GRID, dy0 = dFdy(vUv0) / IMP_GRID;
  vec2 dx1 = dFdx(vUv1) / IMP_GRID, dy1 = dFdy(vUv1) / IMP_GRID;
  vec2 dx2 = dFdx(vUv2) / IMP_GRID, dy2 = dFdy(vUv2) / IMP_GRID;
  float alpha = impTap(uImpAlbedo, vCell0, vUv0, dx0, dy0, uImpLayer).a * vWeights.x
              + impTap(uImpAlbedo, vCell1, vUv1, dx1, dy1, uImpLayer).a * vWeights.y
              + impTap(uImpAlbedo, vCell2, vUv2, dx2, dy2, uImpLayer).a * vWeights.z;
  if (alpha < 0.36) discard;
  o = vec4(float(vEntity & 255), float((vEntity >> 8) & 255), 0.0, 255.0) / 255.0;
}`;

// ——— Hearth & kiln smoke plumes ———

export const SMOKE_VS = /* glsl */ `#version 300 es
precision highp float;
// Quad corner (-1..1) and puff slot index (0..7)
layout(location = 0) in vec2 aCorner;
layout(location = 1) in float aPuff;
// Per-emitter: (x, y, z, strength) and seed (0..1)
layout(location = 2) in vec4 iSmoke;
layout(location = 3) in float iSeed;
uniform mat4 uViewProj;
uniform vec3 uEye;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec2 uWind;
uniform float uClock;
${DROP}
out vec2 vLocal;
out float vAge;
out float vStrength;
out float vSeed;
out vec3 vPos;
void main() {
  float strength = iSmoke.w;
  float speed = 0.055 + 0.025 * strength;
  float age = fract(uClock * speed + aPuff / 8.0 + iSeed);
  // Gently rising plume that bends downwind as it expands and dissipates naturally.
  float rise = pow(age, 0.82) * (7.0 + 8.0 * strength);
  vec2 drift = uWind * (age * (6.2 + 5.0 * age));
  float curl = sin(age * 5.2 + iSeed * 19.0 + uClock * 0.35) * (0.45 + 1.8 * age);
  vec3 center = iSmoke.xyz + vec3(drift.x + curl, drift.y - curl * 0.65, rise);
  float radius = mix(0.75, 5.2 * (0.72 + 0.45 * strength), pow(age, 0.74));
  vec3 world = center + (uCamRight * aCorner.x + uCamUp * aCorner.y) * radius;
  vLocal = aCorner;
  vAge = age;
  vStrength = strength;
  vSeed = iSeed + aPuff * 0.137;
  vPos = world;
  world.z -= drop(world.xy);
  gl_Position = uViewProj * vec4(world - uEye, 1.0);
}`;

export const SMOKE_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vLocal;
in float vAge;
in float vStrength;
in float vSeed;
in vec3 vPos;
uniform vec3 uEye;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uSkyTop;
uniform vec3 uSkyLow;
uniform float uHazeK;
uniform float uSmokeFade;
uniform highp sampler3D uNoise;
out vec4 o;
void main() {
  float r2 = dot(vLocal, vLocal);
  if (r2 > 1.0) discard;
  float radial = (1.0 - r2);
  radial *= radial;
  float wisp = texture(uNoise, vec3(vLocal * 0.32 + vec2(vSeed, vAge * 0.6), vSeed * 0.7 + vAge * 0.4)).r;
  float detail = texture(uNoise, vec3(vLocal * 0.62 - vec2(vAge * 0.3, vSeed), vSeed * 1.3)).g;
  float puff = radial * smoothstep(0.28, 0.80, wisp * 0.66 + detail * 0.34);
  float life = smoothstep(0.0, 0.16, vAge) * (1.0 - smoothstep(0.35, 1.0, vAge));
  // Cooking smoke is richest in morning/evening and soft pale wisps at midday; kilns stay vigorous.
  float diurnal = mix(0.52, 1.0, 1.0 - smoothstep(0.08, 0.52, uSun.z));
  float kilnBoost = smoothstep(0.85, 1.1, vStrength);
  float dist = length(vPos - uEye);
  float farFade = 1.0 - smoothstep(650.0, 2100.0, dist);
  float alpha = puff * life * (0.14 + 0.14 * vStrength) * max(diurnal, 0.88 * kilnBoost) * farFade * uSmokeFade;
  if (alpha < 0.004) discard;
  // Soft sunlit smoke grey-blue-warm tint with gentle haze match.
  vec3 lit = mix(uSkyLow * 0.72, uSunColor * 0.90 + uSkyTop * 0.35, 0.45 + 0.35 * clamp(vLocal.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 col = mix(lit * vec3(0.88, 0.89, 0.92), lit * vec3(0.75, 0.72, 0.68), kilnBoost * 0.45);
  float ext = exp(-uHazeK * dist * 0.85);
  col = mix(uSkyLow * 0.85, col, ext);
  o = vec4(col, clamp(alpha, 0.0, 0.42));
}`;

