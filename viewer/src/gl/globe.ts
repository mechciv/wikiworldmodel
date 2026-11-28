// The globe: background (stars, atmosphere halo), the surface shaded from the field cube map,
// and the cloud layer. The coastline is derived here, as the sea-level isoline of the
// blended field, so it is never stored and always agrees with the terrain under it.
//
// The surface has three modes, after the field that covers the time shown: elevation;
// continental blocks (inside a block or not, no relief and no sea level); and none, where no
// geography is known and the globe is drawn plain.
//
// Over the mode go the planet's states at the time (core/planet.ts): a magma ocean or a
// crust over magma, an atmosphere of rock vapour or steam, the ice of a glaciation, and,
// where the map is unknown, the oceans or bare rock of the time. The states are claims; how
// they look here, and the surface generator's pattern they are drawn with, is procedural.
// A phase that is a passage (core/planet.ts) is drawn part of the way from its own state to the
// next: molten rock and rock vapour lie over whatever is under them and thin out, the crust of a
// magma ocean spreads, and the sky, the clouds and the surface go from the one's to the other's.
// Where the map is unknown and the planet has oceans, generic land stands in for the land
// nothing records (gen:earth/generic-land, docs/STRUCTURE.md section 3.3): flat, muted and
// under a graticule, so that it reads as a placeholder and never as a map.
//
// Where a field has the ice sheets of the time, they take the place of a claimed latitude of ice: their
// edge is the field's, and it moves between its keyframes.
//
// Over the land, polities' territory (ui/territory.ts): one polity per channel of a map
// texture, its land tinted and its frontiers outlined. Its coasts are the field's.
//
// Over the land too, when asked for, where people lived (ui/layers.ts): a map texture of how
// dense they are, on the viewer's scale. Its coasts are the field's as well.
import { THICKNESS_TOP } from '../../../core/ice.ts';
import type { Cover, Look } from '../../../core/planet.ts';
import { PRESENT_YEAR } from '../../../core/time.ts';
import { positionOf } from '../../../core/timescale.ts';
import type { SurfaceParams } from '../../../world/generators/earth/surface/v1.ts';
import { program, setUniforms, texture2D, type GL, type Program } from './context.ts';
import type { Mat4 } from '../mat.ts';
import { CLOUD_MAP_FS, MATERIAL, RIDGE_LIGHT } from './orbital.ts';

const SPHERE_VS = `#version 300 es
precision highp float;
in vec3 aPos;
uniform mat4 uViewProj;
uniform float uRadius;
out vec3 vN;
void main() {
  vN = aPos;
  gl_Position = uViewProj * vec4(aPos * uRadius, 1.0);
}`;

const SURFACE_FS = `#version 300 es
precision highp float;
uniform highp samplerCube uField;
uniform highp sampler2D uPattern;
uniform float uMix;
uniform vec3 uSun;
uniform vec3 uEye;
uniform float uEvidence;
uniform float uCoast;
uniform float uTexel;
// How far apart the field's nodes are, in radians: its isolines are smoothed over about a third of that.
uniform float uSmooth;
uniform int uMode;
// The planet's state. What the map, or the lack of one, is drawn as: 0 as the mode draws it, 1 oceans,
// 4 bare rock; and, while it passes from one to another, the one it is passing into and how far it has.
uniform int uSurface;
uniform int uSurfaceTo;
uniform float uSurfaceMix;
// How much of that molten rock covers, the share of the molten rock crusted over, and how much of
// everything an atmosphere of rock vapour hides: each 0–1.
uniform float uMolten;
uniform float uCrust;
uniform float uEmber;
uniform float uIceReach;
uniform float uIceEdge;
uniform vec3 uRim;
uniform highp sampler2D uTerritory;
uniform float uTerritoryOn;
uniform mat3 uTerritoryColors;
uniform int uTerritorySel;
// The climate of the land at the two keyframes around the time shown, as the climate field holds it.
uniform highp samplerCube uClimate0;
uniform highp samplerCube uClimate1;
uniform float uClimateMix;
uniform float uClimateOn;
// How far each cover has spread: microbial crusts, land plants, forests, grasslands.
uniform vec4 uCover;
uniform float uReefs;
// The biome rule's thresholds: polar, frost, tropical, cold; arid, desert, reef depth and latitude.
uniform vec4 uRule;
uniform vec4 uRule2;
${MATERIAL}
${RIDGE_LIGHT}
// The ice sheets, moved with their plates: R and G how far the keyframes on either side of the time
// shown are from their margin, with 0.5 at the margin; B and A the root of their thickness.
uniform highp samplerCube uIce;
uniform float uIceOn;
uniform float uIceMix;
uniform float uIceTop;
// How likely the sea was, by the fossil localities of the time (core/coast.ts), at the keyframes on either side of the
// time shown, each moved with its plates: R the chance of sea, G how far the finds near outweigh the field, with 0.5
// where they weigh the same.
uniform highp samplerCube uSea0;
uniform highp samplerCube uSea1;
uniform float uSeaMix;
uniform float uSeaOn;
// Where people lived: how dense they are, from 0 to 1 on the viewer's scale.
uniform highp sampler2D uPeople;
// Generic land, where no map covers the time: 128 is the coast.
uniform highp sampler2D uGenericLand;
uniform float uGenericOn;
uniform float uPeopleOn;
// The human landscape (field:people/anthromes): each cell's class, by the build's number, and the legend's colour of each.
uniform highp sampler2D uAnthromes;
uniform vec3 uAnthromeColors[22];
uniform float uAnthromesOn;
in vec3 vN;
out vec4 o;

float elev(vec3 n) {
  vec4 f = texture(uField, n);
  return mix(f.r, f.g, uMix);
}

// A tent filter about a third of a source cell wide: isolines are rounder after smoothing at
// that scale than straight off the triangulated grid.
float smoothElev(vec3 n, vec3 t1, vec3 t2, float h) {
  float s = 4.0 * elev(n);
  s += 2.0 * (elev(normalize(n + t1 * h)) + elev(normalize(n - t1 * h)) + elev(normalize(n + t2 * h)) + elev(normalize(n - t2 * h)));
  s += elev(normalize(n + (t1 + t2) * h)) + elev(normalize(n + (t1 - t2) * h)) + elev(normalize(n - (t1 - t2) * h)) + elev(normalize(n - (t1 + t2) * h));
  return s / 16.0;
}

// The same, of each keyframe on its own.
vec2 smoothKeys(vec3 n, vec3 t1, vec3 t2, float h) {
  vec2 s = 4.0 * texture(uField, n).rg;
  s += 2.0 * (texture(uField, normalize(n + t1 * h)).rg + texture(uField, normalize(n - t1 * h)).rg + texture(uField, normalize(n + t2 * h)).rg + texture(uField, normalize(n - t2 * h)).rg);
  s += texture(uField, normalize(n + (t1 + t2) * h)).rg + texture(uField, normalize(n + (t1 - t2) * h)).rg + texture(uField, normalize(n - (t1 - t2) * h)).rg + texture(uField, normalize(n - (t1 + t2) * h)).rg;
  return s / 16.0;
}

// The coastline at an isoline, about one pixel wide, from how far a spot is from it and how fast that changes.
float coastLine(float e, float de) {
  return 1.0 - smoothstep(0.5, 1.5, abs(e) / de);
}

// Light returning from a shallow bottom falls away rapidly with water depth. Far offshore,
// retain only a little colour variation: an orbital camera cannot see abyssal relief.
vec3 ocean(float depth, vec4 stone) {
  float shoal = exp(-depth / 105.0);
  float shelf = exp(-depth / 520.0);
  vec3 deep = mix(vec3(0.031, 0.091, 0.154), vec3(0.047, 0.107, 0.17), stone.x);
  vec3 blue = vec3(0.043, 0.27, 0.34);
  vec3 shoals = mix(vec3(0.16, 0.48, 0.47), vec3(0.49, 0.68, 0.60), stone.x);
  return mix(mix(deep, blue, shelf), shoals, shoal) * (1.0 + shelf * (stone.y - 0.5) * 0.33);
}

vec3 bedrock(vec4 stone) {
  return mix(vec3(0.29, 0.265, 0.24), vec3(0.60, 0.52, 0.42),
             clamp(stone.x * 0.52 + stone.y * 0.34 + stone.w * 0.14, 0.0, 1.0));
}

vec3 daylight(float cosine) {
  float light = sqrt(max(cosine, 0.0));
  return vec3(0.045, 0.055, 0.08) + vec3(1.02, 1.00, 0.96) * light;
}

vec3 air(vec3 c, float facing, float sun) {
  float path = pow(1.0 - facing, 3.8);
  // A longer path through sunlit air softens distant ground and lifts the blue horizon.
  float scatter = path * smoothstep(-0.22, 0.55, sun);
  return c * (1.0 - 0.34 * scatter) + uRim * scatter * 0.69;
}

vec3 snow(vec4 stone, float land) {
  vec3 ice = mix(vec3(0.62, 0.75, 0.81), vec3(0.87, 0.91, 0.93), stone.z);
  return mix(ice, vec3(0.92, 0.94, 0.94), land * 0.75) * (0.90 + 0.16 * stone.y);
}

float graticule(vec3 n) {
  float lat = degrees(asin(clamp(n.z, -1.0, 1.0)));
  float lon = degrees(atan(n.y, n.x));
  float lonShift = mod(lon + 360.0, 360.0);
  float dlon = min(fwidth(lon), fwidth(lonShift));
  float glat = 1.0 - smoothstep(0.0, 1.5 * fwidth(lat), abs(mod(lat + 15.0, 30.0) - 15.0));
  float glon = 1.0 - smoothstep(0.0, 1.5 * dlon, abs(mod(lon + 15.0, 30.0) - 15.0));
  return max(glat, glon);
}

// No geography known: a plain sphere with a 30° graticule.
vec3 unknownSurface(vec3 n) {
  float light = 0.35 + 0.75 * max(dot(n, uSun), 0.0);
  return vec3(0.11, 0.14, 0.20) * light + vec3(0.32, 0.38, 0.50) * graticule(n) * 0.3;
}

// Where a direction falls on an equirectangular map, row 0 at the north pole.
vec2 mapUv(vec3 n) {
  float lon = atan(n.y, n.x);
  float lat = asin(clamp(n.z, -1.0, 1.0));
  return vec2(lon / 6.28318530718 + 0.5, 0.5 - lat / 3.14159265359);
}

// The surface generator's pattern: R when a spot crusts over, G hot and cool melt, B the
// ice's edge, A fine texture.
vec4 pattern(vec3 n) {
  return textureGrad(uPattern, mapUv(n), vec2(0.0), vec2(0.0));
}

// The generator's texture of the land's cover, at a scale in repeats around the globe. Its level of
// detail is worked out from the direction, not the map position, which jumps at the date line.
vec4 coverTex(vec3 n, float scale) {
  vec2 uv = mapUv(n) * vec2(scale, scale * 0.5);
  vec2 g = vec2(length(fwidth(n)) * scale * 0.16);
  return textureGrad(uBiomeTex, uv, vec2(g.x, 0.0), vec2(0.0, g.y));
}

// What covers the land here: the climate says what could grow, and the world's transitions what had
// come to exist by now. With no land plants yet, only rock, sand, frost and a film of microbes are drawn.
vec3 biome(vec3 n, float e, float reach, vec4 stone, float rugged) {
  vec4 k0 = texture(uClimate0, n);
  vec4 k1 = texture(uClimate1, n);
  vec4 k = mix(k0, k1, uClimateMix);
  vec4 wide = coverTex(n, 5.0);
  vec4 near = coverTex(n, 37.0);
  float rag = 0.55 * (wide.b - 0.5) + 0.25 * (near.b - 0.5) + 0.65 * (stone.y - 0.5);
  float hot = k.r * 110.0 - 60.0 + rag * 6.0;
  float cold = k.g * 110.0 - 60.0 + rag * 6.0;
  float aridity = mix(k0.b * k0.b, k1.b * k1.b, uClimateMix);
  float wetness = aridity * 4.0 * (1.0 + rag * 0.8);
  float margin = k.a * 300.0 - 150.0 + rag * 50.0;
  float polar = 1.0 - smoothstep(uRule.x - 2.0, uRule.x + 2.0, hot);
  float frost = 1.0 - smoothstep(uRule.y - 1.5, uRule.y + 1.5, hot);
  float dry = (1.0 - smoothstep(uRule2.x * 0.58, uRule2.x * 1.42, wetness)) * (1.0 - polar);
  float desert = (1.0 - smoothstep(uRule2.y * 0.54, uRule2.y * 1.46, wetness)) * (1.0 - polar);
  float tropical = smoothstep(uRule.z - 1.0, uRule.z + 1.0, cold);
  float boreal = 1.0 - smoothstep(uRule.w - 2.0, uRule.w + 2.0, cold);
  float rainy = smoothstep(-28.0, 0.0, margin);
  float fine = mix(wide.a, near.a, reach);
  float mott = mix(wide.r, near.r, reach);
  float streak = mix(wide.g, near.g, reach);
  // Bare ground: rock and weathered regolith, and sand where it is driest.
  vec3 rock = bedrock(stone);
  vec3 sand = mix(vec3(0.78, 0.67, 0.51), vec3(0.55, 0.43, 0.32), streak * 0.5 + stone.x * 0.5);
  vec3 c = mix(rock, sand, desert);
  // Microbial crusts darken damp ground.
  c = mix(c, c * vec3(0.72, 0.70, 0.60), uCover.x * (1.0 - dry) * (1.0 - frost) * 0.8);
  // Low plants on damp ground, patchy at first and thickening as they spread; tundra is the same to the eye.
  vec3 low = mix(vec3(0.30, 0.34, 0.15), vec3(0.42, 0.42, 0.22), fine);
  float patches = smoothstep(1.0 - uCover.y * 1.15, 1.001 - uCover.y * 0.75, mott) * min(1.0, 8.0 * uCover.y);
  c = mix(c, low, patches * (1.0 - dry) * (1.0 - frost));
  // Trees, in the colours of their climates, where it is warm and wet enough.
  vec3 trees = mix(vec3(0.24, 0.29, 0.16), vec3(0.13, 0.20, 0.11), mott);
  trees = mix(trees, mix(vec3(0.10, 0.19, 0.11), vec3(0.06, 0.13, 0.08), mott), boreal);
  trees = mix(trees, mix(vec3(0.085, 0.17, 0.095), vec3(0.17, 0.25, 0.14), mott), tropical * rainy);
  float woods = smoothstep(1.0 - uCover.z * 1.15, 1.001 - uCover.z * 0.75, mott * 0.35 + 0.35) * min(1.0, 8.0 * uCover.z) * (1.0 - dry) * (1.0 - polar);
  c = mix(c, trees, woods * (1.0 - tropical * (1.0 - rainy) * 0.8));
  // Open country: where grasses have come it is grassland, before them scrub.
  vec3 grass = mix(vec3(0.55, 0.49, 0.24), vec3(0.43, 0.43, 0.19), mott);
  vec3 scrub = mix(vec3(0.42, 0.40, 0.25), vec3(0.34, 0.34, 0.18), mott);
  vec3 open = mix(scrub, grass, uCover.w);
  float seasonal = tropical * (1.0 - rainy) * (1.0 - dry) * (1.0 - polar);
  c = mix(c, open, uCover.y * max(seasonal, dry * (1.0 - desert)) * 0.95);
  // Above the trees, bare rock; and ice where no month thaws, unless a field says where the ice sheets
  // are: then that is theirs to say, and ground that never thaws is left bare.
  float h = e / 1000.0;
  vec3 bare = rock;
  float outcrop = rugged * smoothstep(0.28, 0.88, stone.z) * (0.25 + 0.48 * stone.y);
  c = mix(c, bare, max(outcrop, smoothstep(2.6, 3.6, h + rag * 0.65)));
  if (uIceOn > 0.5) c = mix(c, bare, frost);
  c = mix(c, vec3(0.90, 0.92, 0.95) * (0.92 + 0.14 * fine), max(uIceOn > 0.5 ? 0.0 : frost, smoothstep(4.2, 5.4, h + (stone.z - 0.5) * 1.2)));
  return c;
}

// Territory over the land: each channel's polity tinted, its frontier outlined, brighter for
// the one selected. Nothing is drawn over the sea, so the coasts stay the field's.
vec3 territory(vec3 c, vec3 n, float land, float diffuse) {
  vec3 cover = textureGrad(uTerritory, mapUv(n), vec2(0.0), vec2(0.0)).rgb;
  for (int i = 0; i < 3; i++) {
    float v = cover[i];
    vec3 col = uTerritoryColors[i];
    float w = max(fwidth(v), 0.02);
    float frontier = (1.0 - smoothstep(0.0, 1.6 * w, abs(v - 0.5))) * land;
    c = mix(c, col * (0.3 + 0.8 * diffuse), smoothstep(0.3, 0.7, v) * land * 0.34);
    c = mix(c, mix(col, vec3(1.0), 0.4), frontier * (i == uTerritorySel ? 1.0 : 0.7));
  }
  return c;
}

// Glowing rock, from dull red to yellow-white as x goes from 0 to 1.
vec3 heat(float x) {
  vec3 c = mix(vec3(0.22, 0.02, 0.0), vec3(0.85, 0.22, 0.02), smoothstep(0.0, 0.4, x));
  c = mix(c, vec3(1.0, 0.62, 0.14), smoothstep(0.35, 0.75, x));
  return mix(c, vec3(1.0, 0.93, 0.68), smoothstep(0.7, 1.0, x));
}

// Where people lived: the land dimmed, so that they show against desert and ice alike, and a glow
// that starts from nothing and stays dark until there are many. Nothing is drawn over the sea, so the
// coasts stay the field's. The legend's bar (style.css) runs the same way.
vec3 people(vec3 c, vec3 n, float land) {
  float v = textureGrad(uPeople, mapUv(n), vec2(0.0), vec2(0.0)).r;
  return mix(c, mix(c * 0.4, heat(v * v), smoothstep(0.02, 0.35, v)), land);
}

// The human landscape: the land in its class's colour from the legend, a little shaded by the ground's light so the
// relief still shows; nothing over the sea.
vec3 anthromes(vec3 c, vec3 n, float land) {
  float k = floor(textureGrad(uAnthromes, mapUv(n), vec2(0.0), vec2(0.0)).r * 255.0 + 0.5);
  if (k < 0.5) return c;
  vec3 col = uAnthromeColors[int(min(k, 21.0))];
  float lum = dot(c, vec3(0.3, 0.55, 0.15));
  return mix(c, col * (0.55 + 0.9 * clamp(lum * 2.2, 0.0, 1.0)), 0.82 * land);
}

// Molten rock where the crust has not formed yet, dark crust where it has; the crust glows
// a little where it is youngest, next to the melt.
vec3 magma(vec4 p, vec4 stone, float crust, float light) {
  p.r = clamp(p.r + (stone.z - 0.5) * 0.065, 0.0, 1.0);
  float w = max(fwidth(p.r), 0.004);
  float solid = 1.0 - smoothstep(crust - w, crust + w, p.r);
  float hot = clamp((p.r - crust) / 0.3, 0.0, 1.0);
  vec3 melt = heat(clamp(0.38 + 0.42 * hot + 1.1 * (p.g - 0.5) + (stone.y - 0.5) * 0.45, 0.0, 1.0));
  float young = smoothstep(crust - 0.1, crust, p.r);
  vec3 rock = bedrock(stone) * vec3(0.40, 0.37, 0.35) * (0.25 + 0.9 * light) + vec3(0.32, 0.05, 0.0) * young * 0.55;
  rock *= 0.66 + 0.47 * stone.y + 0.36 * stone.z;
  return mix(melt, rock, solid);
}

// How much of a spot is under ice: poleward of the claimed reach, its edge made ragged.
float iceCover(vec3 n, vec4 p) {
  if (uIceReach >= 90.0) return 0.0;
  if (uIceReach <= 0.0) return 1.0;
  float lat = abs(degrees(asin(clamp(n.z, -1.0, 1.0))));
  float edge = uIceReach + clamp((p.b - 0.5) * 4.0, -1.0, 1.0) * uIceEdge;
  float w = max(fwidth(lat), 0.08);
  return smoothstep(edge - w, edge + w, lat);
}

// No map: the plain globe, or the oceans or bare rock of the time with a faint graticule, since where
// the land was is not known.
vec3 plain(int surface, vec3 n, vec3 view, vec4 stone, float diffuse) {
  vec3 c = unknownSurface(n);
  if (surface == 1) {
    float land = uGenericOn > 0.5 ? smoothstep(0.49, 0.53, texture(uGenericLand, mapUv(n)).r) : 0.0;
    vec3 sea = vec3(0.027, 0.10, 0.16) * daylight(diffuse);
    sea += vec3(0.55, 0.65, 0.75) * pow(max(dot(reflect(-uSun, n), view), 0.0), 60.0) * 0.35;
    vec3 ground = mix(vec3(0.34, 0.33, 0.31), bedrock(stone), 0.35) * daylight(diffuse);
    c = mix(sea, ground, land);
    c += vec3(0.32, 0.38, 0.50) * graticule(n) * 0.12;
  } else if (surface == 4) {
    c = bedrock(stone) * daylight(diffuse);
    c += vec3(0.32, 0.38, 0.50) * graticule(n) * 0.12;
  }
  return c;
}

// The height of the ice sheets' surface, in metres: the thickness over the ground the globe has here.
// It leaves out how far the ground sank under the ice, which is broad and smooth.
float iceSurface(vec3 n) {
  vec4 s = textureLod(uIce, n, 0.0);
  vec4 f = textureLod(uField, n, 0.0);
  return mix(f.r, f.g, uMix) + mix(s.b * s.b, s.a * s.a, uIceMix) * uIceTop;
}

void main() {
  vec3 n = normalize(vN);
  vec3 view = normalize(uEye - n);
  float facing = clamp(dot(n, view), 0.0, 1.0);
  float sun = dot(n, uSun);
  float closeUp = 1.0 - smoothstep(1.25, 1.9, length(uEye));
  vec4 stone = lithology(n, closeUp);
  float detail = ridgeLight(n, uSun, 0.0024 * stone.z + 0.00036 * stone.w);
  float hatch = step(0.62, fract((gl_FragCoord.x + gl_FragCoord.y) / 9.0));
  vec3 magenta = vec3(0.92, 0.25, 0.75);
  vec4 p = pattern(n);
  // An atmosphere of rock vapour hides the surface: the planet glows like an ember.
  vec3 ember = vec3(0.0);
  if (uEmber > 0.0) {
    float mu = max(dot(n, view), 0.0);
    ember = heat(clamp(0.74 + 0.9 * (p.g - 0.5) + 0.23 * (stone.y - 0.5), 0.0, 1.0)) * (0.5 + 0.5 * pow(mu, 0.45));
    ember = mix(ember, magenta, uEvidence * (0.14 + 0.26 * hatch));
    if (uEmber >= 1.0) {
      o = vec4(air(ember, facing, 1.0), 1.0);
      return;
    }
  }
  // Magma, or crust over magma, covers whatever the map has.
  vec3 molten = vec3(0.0);
  if (uMolten > 0.0) {
    // The generator locates the last hot cracks. Give their edges the same grain as the
    // basalt on their banks, leaving the phase and its share of solid crust in control.
    vec3 warp = vec3(stone.x, stone.y, stone.z) - 0.5;
    molten = magma(pattern(normalize(n + warp * 0.033)), stone, uCrust, max(sun + detail, 0.0));
    molten = mix(molten, vec3(0.88, 0.9, 0.93) * (0.35 + 0.75 * max(dot(n, uSun), 0.0)), iceCover(n, p));
    molten = mix(molten, magenta, uEvidence * (0.14 + 0.26 * hatch));
    if (uMolten >= 1.0) {
      o = vec4(air(mix(molten, ember, uEmber), facing, mix(sun, 1.0, uEmber)), 1.0);
      return;
    }
  }
  if (uMode == 2) {
    // No map: what the state says covers the planet, or, in a passage, part of the way from that to the next.
    float diffuse = max(dot(n, uSun), 0.0);
    vec3 c = plain(uSurface, n, view, stone, diffuse);
    if (uSurfaceMix > 0.0) c = mix(c, plain(uSurfaceTo, n, view, stone, diffuse), uSurfaceMix);
    float ice = iceCover(n, p);
    c = mix(c, snow(stone, 0.0) * daylight(sun + 0.35 * detail), ice);
    if (uSurface != 0 || (uSurfaceMix > 0.0 && uSurfaceTo != 0)) c = mix(c, magenta, uEvidence * (0.14 + 0.26 * hatch));
    o = vec4(air(mix(mix(c, molten, uMolten), ember, uEmber), facing, mix(sun, 1.0, uEmber)), 1.0);
    return;
  }
  vec3 ref = abs(n.z) < 0.99 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 t1 = normalize(cross(ref, n));
  vec3 t2 = cross(n, t1);
  // Blocks are flat, inside a block or not, so a blend of two keyframes' values has no coast to
  // find: a block in one keyframe and not the other would cross the isoline everywhere at once, and
  // be drawn as all coastline. Between keyframes, the one's blocks dissolve into the other's instead.
  vec2 k = vec2(0.0);
  float e;
  if (uMode == 1) {
    k = smoothKeys(n, t1, t2, uSmooth) - uCoast;
    e = mix(k.x, k.y, uMix);
  } else {
    e = smoothElev(n, t1, t2, uSmooth) - uCoast;
  }
  vec2 dk = max(fwidth(k), vec2(1.0));
  float h = uTexel;
  float ex = elev(normalize(n + t1 * h)) - elev(normalize(n - t1 * h));
  float ey = elev(normalize(n + t2 * h)) - elev(normalize(n - t2 * h));
  vec3 grad = (t1 * ex + t2 * ey) / (2.0 * h * 6371000.0);
  float rugged = clamp(length(grad) * 48.0 + max(e, 0.0) / 4300.0, 0.0, 1.0);
  float de = max(fwidth(e), 1.0);
  vec2 blockLand = smoothstep(vec2(-0.5), vec2(0.5), k / dk);
  float land = uMode == 1 ? mix(blockLand.x, blockLand.y, uMix) : smoothstep(-0.5, 0.5, e / de);
  float sea = 1.0 - land;
  // Only exposed elevation casts relief shading. Blocks locate crust but give no height or depth.
  float relief = uMode == 0 ? land : 0.0;
  vec3 bump = normalize(n - grad * 13.0 * relief);
  float diffuse = dot(bump, uSun) + detail * (0.20 + 0.80 * rugged) * relief;
  vec3 water = uMode == 0 ? ocean(max(-e, 0.0), stone) : vec3(0.035, 0.105, 0.165);
  vec3 ground = bedrock(stone);
  if (uMode == 0 && uClimateOn > 0.5) {
    if (land > 0.0) {
      ground = biome(n, e, closeUp, stone, rugged) * (0.65 + 0.32 * stone.x + 0.26 * stone.y + 0.12 * stone.w);
    }
    if (sea > 0.0 && uReefs > 0.5 && e > -uRule2.z && abs(n.z) < sin(radians(uRule2.w))) {
      // Reefs on warm shelves, broken up by the generator's speckle.
      vec4 t = coverTex(n, 37.0);
      float reef = smoothstep(0.55, 0.8, t.a) * smoothstep(-uRule2.z, -uRule2.z * 0.4, e);
      water = mix(water, vec3(0.42, 0.78, 0.72), reef * 0.75);
    }
  }
  vec3 base = mix(water, ground, land);
  vec3 c = base * daylight(diffuse);
  if (sea > 0.0) {
    float spec = pow(max(dot(reflect(-uSun, n), view), 0.0), 60.0);
    c += vec3(0.52, 0.58, 0.60) * spec * (0.16 + 0.12 * stone.y) * sea;
  }
  // Ice: sheets over the land, sea ice over the water, their pattern procedural.
  float ice = iceCover(n, p);
  if (ice > 0.0) c = mix(c, snow(stone, land) * daylight(diffuse + 0.25 * detail), ice);
  // The ice sheets of a field: their edge between the keyframes is where the distance to it, moved
  // evenly from one to the next, comes to nothing. Grounded ice, whether the sea or the land is under it.
  float sheets = 0.0;
  if (uIceOn > 0.5) {
    vec4 s = texture(uIce, n);
    float d = mix(s.r, s.g, uIceMix) - 0.5;
    float w = max(fwidth(d), 0.0008);
    sheets = smoothstep(-w, w, d);
    if (sheets > 0.0) {
      // Over about a node of the grid, so that its domes are shaded and not its nodes.
      float ih = 0.012;
      float ix = iceSurface(normalize(n + t1 * ih)) - iceSurface(normalize(n - t1 * ih));
      float iy = iceSurface(normalize(n + t2 * ih)) - iceSurface(normalize(n - t2 * ih));
      vec3 domes = normalize(n - (t1 * ix + t2 * iy) / (2.0 * ih * 6371000.0) * 22.0);
      float thin = smoothstep(0.0, 0.14, mix(s.b * s.b, s.a * s.a, uIceMix));
      vec3 sheet = mix(vec3(0.76, 0.84, 0.92), vec3(0.95, 0.97, 0.98), thin) * (0.94 + 0.10 * stone.y);
      c = mix(c, sheet * (0.3 + 0.8 * max(dot(domes, uSun), 0.0)), sheets);
    }
  }
  // In evidence mode trace the reconstructed shoreline, fainter under the ice.
  float line = uMode == 1 ? mix(coastLine(k.x, dk.x), coastLine(k.y, dk.y), uMix) : coastLine(e, de);
  if (uPeopleOn > 0.5) c = people(c, n, smoothstep(0.5, 1.5, e / de));
  if (uAnthromesOn > 0.5) c = anthromes(c, n, smoothstep(0.5, 1.5, e / de));
  if (uTerritoryOn > 0.5) c = territory(c, n, smoothstep(0.5, 1.5, e / de), diffuse);
  c = mix(c, vec3(0.93, 0.96, 0.95), line * uEvidence * 0.85 * (1.0 - 0.5 * max(ice, sheets)));
  // Evidence mode: the whole field is a reconstruction — amber hatching, the ice sheets of a field too;
  // ice from a claimed latitude is procedural.
  vec3 basis = vec3(0.95, 0.65, 0.18);
  if (uSeaOn > 0.5 && uEvidence > 0.0) {
    // How likely the sea was, by the fossil localities of the time (model:earth/sea-chance).
    vec4 s = mix(texture(uSea0, n), texture(uSea1, n), uSeaMix);
    vec3 blue = vec3(0.50, 0.82, 1.0);
    float heard = smoothstep(0.15, 0.5, s.g);
    float ds = max(fwidth(s.r), 0.004);
    // Where the rocks take the other side from the map's, its land likelier sea than not or its sea likelier land,
    // the ground is drawn as they have it: the sea's blue, or the sand of the land.
    float against = heard * mix(1.0 - smoothstep(0.4, 0.5, s.r), smoothstep(0.5, 0.6, s.r), land);
    vec3 says = mix(vec3(0.72, 0.61, 0.42), vec3(0.08, 0.27, 0.47), step(0.5, s.r));
    c = mix(c, says * daylight(diffuse), against * uEvidence * 0.75);
    // The coast's band: ground that is sea in more than a quarter of the members of the world, and in fewer than
    // three quarters of them.
    float band = smoothstep(0.25 - ds, 0.25 + ds, s.r) * (1.0 - smoothstep(0.75 - ds, 0.75 + ds, s.r));
    c = mix(c, vec3(0.82, 0.89, 0.95), band * uEvidence * 0.18);
    // The rocks' own coast, where sea and land are as likely as each other and localities lie near.
    c = mix(c, blue, coastLine(s.r - 0.5, ds) * heard * uEvidence * 0.9);
    // Where the finds outweigh the map, land and sea rest on evidence: its blue for the reconstruction's amber.
    basis = mix(basis, blue, smoothstep(0.42, 0.58, s.g));
  }
  c = mix(c, mix(basis, magenta, ice), uEvidence * (0.14 + 0.26 * hatch));
  c = mix(mix(c, molten, uMolten), ember, uEmber);
  o = vec4(air(c, facing, mix(sun, 1.0, uEmber)), 1.0);
}`;

const CLOUD_FS = `#version 300 es
precision highp float;
uniform vec3 uSun;
uniform vec3 uEye;
uniform float uEvidence;
uniform float uOpacity;
uniform float uBase;
uniform vec3 uTint;
uniform vec3 uGlow;
uniform float uRadius;
uniform highp sampler2D uClouds;
uniform vec4 uDrift;
${RIDGE_LIGHT}

// Size the footprint from the spherical direction. Longitude jumps at the date line, and
// increasingly many longitudes fall in a pixel towards a pole.
float cloudDensity(vec3 n, float footprint) {
  float lat = asin(clamp(n.z, -1.0, 1.0));
  vec2 uv = vec2(atan(n.y, n.x) / 6.2831853 + 0.5, 0.5 - lat / 3.14159265);
  vec2 dx = vec2(footprint / (6.2831853 * max(length(n.xy), 0.01)), 0.0);
  vec2 dy = vec2(0.0, footprint / 3.14159265);
  float d = textureGrad(uClouds, uv - vec2(uDrift.x / 6.2831853, 0.0), dx, dy).r;
  if (uDrift.x != uDrift.y) {
    float beyond = textureGrad(uClouds, uv - vec2(uDrift.y / 6.2831853, 0.0), dx, dy).r;
    d = mix(d, beyond, smoothstep(uDrift.z, uDrift.w, abs(lat)));
  }
  return d;
}
in vec3 vN;
out vec4 o;
void main() {
  vec3 n = normalize(vN);
  vec3 view = normalize(uEye - uRadius * n);
  float sun = dot(n, uSun);
  float footprint = max(length(dFdx(n)), length(dFdy(n)));
  float d = cloudDensity(n, footprint);
  float top = ridgeLight(n, uSun, d * 0.00065);
  float light = sqrt(max(0.0, sun + 0.32 * top));
  vec3 c = uTint * (vec3(0.08, 0.10, 0.14) + light * (0.76 + 0.19 * d))
         + uGlow * (1.0 - min(1.0, light));
  float a = clamp(d * uOpacity + uBase, 0.0, 1.0);
  // Follow the eye ray down to the ground, then the sunlight back up to the same cloud shell.
  // Rays beyond the solid limb carry clouds but cast no shadow into space.
  vec3 origin = n * uRadius;
  float along = dot(origin, view);
  float hit = along * along - (uRadius * uRadius - 1.0);
  float shadow = 0.0;
  if (hit > 0.0 && sun > 0.04) {
    vec3 ground = origin - view * ((uRadius * uRadius - 1.0) / (along + sqrt(hit)));
    float cosine = dot(ground, uSun);
    float rise = (uRadius * uRadius - 1.0) / (sqrt(cosine * cosine + uRadius * uRadius - 1.0) + cosine);
    shadow = cloudDensity(normalize(ground + uSun * rise), footprint) * uOpacity * 0.32 * smoothstep(0.04, 0.35, sun);
  }
  // Evidence mode: procedural — magenta, thinned.
  c = mix(c, vec3(0.92, 0.25, 0.75), uEvidence * 0.75);
  a *= 1.0 - 0.45 * uEvidence;
  o = vec4(c * a, a + (1.0 - a) * shadow * (1.0 - uEvidence));
}`;

const SKY_VS = `#version 300 es
precision highp float;
out vec2 vNdc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vNdc = p;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const SKY_FS = `#version 300 es
precision highp float;
uniform mat4 uInvViewProj;
uniform vec3 uEye;
uniform vec3 uHalo;
uniform vec3 uSun;
uniform float uEmber;
in vec2 vNdc;
out vec4 o;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
void main() {
  vec4 a = uInvViewProj * vec4(vNdc, -1.0, 1.0);
  vec4 b = uInvViewProj * vec4(vNdc, 1.0, 1.0);
  vec3 d = normalize(b.xyz / b.w - a.xyz / a.w);
  float bq = dot(uEye, d);
  float r = sqrt(max(dot(uEye, uEye) - bq * bq, 0.0));
  vec3 c = vec3(0.003, 0.005, 0.009);
  // Stars: at most one per cell of a direction grid, at a random spot in the cell.
  vec3 g = d * 180.0;
  vec3 cell = floor(g);
  float s = hash(cell);
  vec3 spot = vec3(hash(cell + 1.3), hash(cell + 2.7), hash(cell + 4.1)) * 0.6 + 0.2;
  float sr = length(fract(g) - spot);
  float star = step(0.985, s) * (1.0 - smoothstep(0.0, 0.09, sr)) * (0.25 + 0.75 * hash(cell + 7.0));
  c += vec3(0.9, 0.93, 1.0) * star;
  if (bq < 0.0) {
    vec3 tangent = normalize(uEye - bq * d);
    float lit = mix(0.08 + 0.92 * smoothstep(-0.24, 0.60, dot(tangent, uSun)), 1.0, uEmber);
    float height = max(r - 1.0, 0.0);
    float glow = (0.77 * exp(-height * 230.0) + 0.23 * exp(-height * 85.0)) * lit;
    c += uHalo * glow * smoothstep(0.97, 1.0, r);
  }
  o = vec4(c, 1.0);
}`;

function sphere(segLon: number, segLat: number): { pos: Float32Array; idx: Uint32Array } {
  const pos = new Float32Array((segLon + 1) * (segLat + 1) * 3);
  let o = 0;
  for (let j = 0; j <= segLat; j++) {
    const lat = Math.PI / 2 - (j / segLat) * Math.PI;
    for (let i = 0; i <= segLon; i++) {
      const lon = -Math.PI + (i / segLon) * 2 * Math.PI;
      pos[o++] = Math.cos(lat) * Math.cos(lon);
      pos[o++] = Math.cos(lat) * Math.sin(lon);
      pos[o++] = Math.sin(lat);
    }
  }
  const idx = new Uint32Array(segLon * segLat * 6);
  o = 0;
  for (let j = 0; j < segLat; j++) {
    for (let i = 0; i < segLon; i++) {
      const a = j * (segLon + 1) + i;
      const b = a + 1;
      const c = a + segLon + 1;
      const d = c + 1;
      idx.set([a, c, b, b, c, d], o);
      o += 6;
    }
  }
  return { pos, idx };
}

type RGB = [number, number, number];

/** How the globe draws the planet's state: what the shaders are told. */
export interface GlobeLook {
  /** false: the planet has not formed, and only the sky is drawn */
  formed: boolean;
  /** what the map, or the lack of one, is drawn as: 0 as the mode draws it, 1 oceans, 4 bare rock */
  surface: number;
  /** in a passage from one such surface to another, the one it is passing into, and how far it has, 0–1 */
  surfaceTo: number;
  surfaceMix: number;
  /** how much of that molten rock covers, 0–1: all of it over magma or crust over magma */
  molten: number;
  /** the share of the molten rock crusted over, 0–1 */
  crust: number;
  /** how much of everything an atmosphere of rock vapour hides, 0–1 */
  ember: number;
  /** the lowest latitude ice reaches, in degrees; 90 is none */
  iceReach: number;
  iceEdge: number;
  /** how far each cover of the land has spread, 0–1 */
  cover: Cover;
  rim: RGB;
  halo: RGB;
  /** cover is density × opacity + base */
  clouds: { opacity: number; base: number; tint: RGB; glow: RGB } | null;
}

type Clouds = NonNullable<GlobeLook['clouds']>;

const RIM: RGB = [0.32, 0.52, 0.74];
const HALO: RGB = [0.38, 0.62, 0.85];
const CLEAR_CLOUDS: Clouds = { opacity: 0.96, base: 0, tint: [1, 1, 1], glow: [0, 0, 0] };
const NONE: RGB = [0, 0, 0];

/** As the world was drawn before it had states: today's sky, clouds, no ice. */
export const PLAIN_LOOK: GlobeLook = { formed: true, surface: 0, surfaceTo: 0, surfaceMix: 0, molten: 0, crust: 0, ember: 0, iceReach: 90, iceEdge: 0, cover: { crust: 0, plants: 0, forests: 0, grasses: 0, reefs: 0 }, rim: RIM, halo: HALO, clouds: CLEAR_CLOUDS };

/** What the map, or the lack of one, is drawn as under each surface that is not molten. */
const PLAIN_SURFACES: Record<string, number> = { ocean: 1, 'bare-rock': 4 };

/** A state as it is drawn while it holds, before any passage into the next. */
interface Steady {
  /** molten rock covers everything: magma, or crust over magma */
  molten: boolean;
  /** the share of the molten rock crusted over */
  crust: number;
  /** what is drawn where no molten rock is: 0 as the mode draws it, 1 oceans, 4 bare rock */
  plain: number;
  /** an atmosphere of rock vapour hides the surface */
  ember: boolean;
  rim: RGB;
  halo: RGB;
  clouds: Clouds | null;
}

/**
 * The drawing of a state. Clouds need water: oceans or a steam atmosphere, which is all but
 * overcast and lit from below by the magma; over a Snowball Earth they are thin. An atmosphere
 * of dense carbon dioxide is a pale veil that all but hides the ocean under it. Where no
 * atmosphere is claimed the sky is today's, except over a molten surface, drawn bare.
 */
function steady(surface: string | null, atmosphere: string | null, crustAt: SurfaceParams['draw']['crust'], iceReach: number): Steady {
  const molten = surface === 'magma' || surface === 'crust-and-magma';
  const crust = surface === 'crust-and-magma' ? crustAt.over_magma : crustAt.magma;
  const base = { molten, crust: molten ? crust : 0, plain: PLAIN_SURFACES[surface ?? ''] ?? 0, ember: false };
  if (atmosphere === 'rock-vapour') return { ...base, ember: true, rim: [1.0, 0.62, 0.28], halo: [1.0, 0.55, 0.2], clouds: null };
  if (atmosphere === 'steam') {
    const glow = molten ? 1 - crust : 0;
    return { ...base, rim: [0.82, 0.82, 0.84], halo: [0.78, 0.8, 0.86], clouds: { opacity: 0.6, base: 0.55, tint: [0.88, 0.88, 0.9], glow: [0.55 * glow, 0.12 * glow, 0.02 * glow] } };
  }
  if (atmosphere === 'dense-co2') return { ...base, rim: [0.74, 0.8, 0.86], halo: [0.7, 0.78, 0.9], clouds: { opacity: 0.3, base: 0.8, tint: [0.93, 0.93, 0.9], glow: NONE } };
  if (molten) return { ...base, rim: NONE, halo: NONE, clouds: null };
  if (surface === 'bare-rock') return { ...base, rim: RIM, halo: HALO, clouds: null };
  if (iceReach <= 0) return { ...base, rim: RIM, halo: HALO, clouds: { ...CLEAR_CLOUDS, opacity: 0.45 } };
  return { ...base, rim: RIM, halo: HALO, clouds: CLEAR_CLOUDS };
}

const lerp = (a: number, b: number, w: number) => a + (b - a) * w;
const lerp3 = (a: RGB, b: RGB, w: number): RGB => [lerp(a[0], b[0], w), lerp(a[1], b[1], w), lerp(a[2], b[2], w)];

/** Clouds part of the way from one state's to another's; where one has none, the other's thin out into nothing. */
function cloudsBetween(a: Clouds | null, b: Clouds | null, w: number): Clouds | null {
  if (!a && !b) return null;
  const from = a ?? { ...b!, opacity: 0, base: 0, glow: NONE };
  const to = b ?? { ...a!, opacity: 0, base: 0, glow: NONE };
  return { opacity: lerp(from.opacity, to.opacity, w), base: lerp(from.base, to.base, w), tint: lerp3(from.tint, to.tint, w), glow: lerp3(from.glow, to.glow, w) };
}

/**
 * How the planet is drawn at a time: its state as it is while it holds, or, where the phase is a
 * passage, part of the way from that to the state it is passing into. Rock vapour and molten rock
 * thin out over what is under them; a magma ocean's crust spreads; the sky and the clouds go from
 * the one's to the other's.
 */
export function globeLook(look: Look, draw: SurfaceParams['draw'] | undefined, cover?: Cover): GlobeLook {
  if (!look.formed) return { ...PLAIN_LOOK, formed: false, rim: NONE, halo: NONE, clouds: null };
  const crustAt = draw?.crust ?? { magma: 0, over_magma: 0.82 };
  const a = steady(look.surface, look.atmosphere, crustAt, look.iceReach);
  const base = { ...PLAIN_LOOK, iceReach: look.iceReach, iceEdge: draw?.ice_edge ?? 5, cover: cover ?? PLAIN_LOOK.cover };
  const one = (x: Steady): GlobeLook => ({ ...base, surface: x.plain, molten: x.molten ? 1 : 0, crust: x.crust, ember: x.ember ? 1 : 0, rim: x.rim, halo: x.halo, clouds: x.clouds });
  if (!look.into || look.passed <= 0) return one(a);
  const b = steady(look.intoSurface, look.intoAtmosphere, crustAt, look.iceReach);
  const w = Math.min(1, look.passed);
  // Molten rock on both sides is one surface whose crust spreads; on one side only, it keeps its crust as it thins.
  const crust = a.molten && b.molten ? lerp(a.crust, b.crust, w) : a.molten ? a.crust : b.crust;
  // Under molten rock there is nothing to pass from: what shows as it thins is the other side's.
  const mixing = !a.molten && !b.molten && a.plain !== b.plain;
  return {
    ...base,
    surface: a.molten ? b.plain : a.plain,
    surfaceTo: mixing ? b.plain : 0,
    surfaceMix: mixing ? w : 0,
    molten: lerp(a.molten ? 1 : 0, b.molten ? 1 : 0, w),
    crust,
    ember: lerp(a.ember ? 1 : 0, b.ember ? 1 : 0, w),
    rim: lerp3(a.rim, b.rim, w),
    halo: lerp3(a.halo, b.halo, w),
    clouds: cloudsBetween(a.clouds, b.clouds, w),
  };
}

/** Polities' territory over the land: whether any is drawn, each channel's colour, and the one selected. */
export interface GlobeTerritory {
  on: boolean;
  colors: [number, number, number][];
  /** the channel of the polity selected, or −1 */
  selected: number;
}

export interface GlobeFrame {
  viewProj: Mat4;
  invViewProj: Mat4;
  eye: [number, number, number];
  sun: [number, number, number];
  mix: number;
  evidence: number;
  coast: number;
  /** 0: elevation, 1: continental blocks, 2: no geography known */
  mode: number;
  /** the spacing of the field's grid, in degrees */
  res: number;
  look: GlobeLook;
  showClouds: boolean;
  territory?: GlobeTerritory;
  /** the climate's mix between its two keyframes, if the land is painted from it */
  climate?: { mix: number; rule: { polar: number; frost: number; tropical: number; cold: number; arid: number; desert: number; reef_depth: number; reef_latitude: number } };
  /** the ice sheets' mix between the keyframes drawn, where a field has them at this time */
  ice?: { mix: number };
  /** the mix between the two keyframes of the sea's chance drawn, while evidence mode shows what the rocks say of land and sea */
  sea?: { mix: number };
  /** where people lived is drawn: the clouds, which are made up, thin out so as not to hide it */
  people?: boolean;
  /** the human landscape's classes are drawn */
  anthromes?: boolean;
  /** how far the clouds have drifted along their bands */
  drift?: CloudDrift;
}

/**
 * How far the clouds have drifted east along their bands, in degrees: in the tropics, beyond them,
 * and the latitudes between which the one gives way to the other. The weather is made up, like the
 * clouds themselves (gen:earth/clouds); drifting with time keeps the layer from hanging still over
 * moving continents while staying fixed for any given time (and a capture may override it,
 * tools/site/timelapse.ts).
 */
export interface CloudDrift {
  tropics: number;
  beyond: number;
  between: [number, number];
}

const PRESENT_POS = positionOf(PRESENT_YEAR);

/**
 * Procedural cloud drift at astronomical year `t`, anchored at zero in the present so today's view
 * stays where the generator put it. Driven by the timebar's warped scale (`positionOf`) so scrubbing
 * moves clouds at an even visual pace across deep time and historical centuries alike: westward in
 * the tropics (trade winds) and eastward beyond them (westerlies).
 */
export function cloudDriftAt(t: number): CloudDrift {
  const p = positionOf(t) - PRESENT_POS;
  return { tropics: p ? -18 * p : 0, beyond: p ? 22 * p : 0, between: [16, 32] };
}

export class GlobeRenderer {
  private surface: Program;
  private clouds: Program;
  private sky: Program;
  private cloudMap: Program;
  private cloudDetail: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private ibo: WebGLBuffer;
  private count: number;
  private cloudTex: WebGLTexture | null = null;
  private patternTex: WebGLTexture;
  private territoryTex: WebGLTexture;
  private biomeTex: WebGLTexture;
  private genericLandTex: WebGLTexture;
  private genericOn = 0;
  private peopleTex: WebGLTexture;
  private peopleSize: [number, number] = [1, 1];
  private anthromeTex: WebGLTexture;
  private anthromeSize: [number, number] = [1, 1];
  private anthromeColors = new Float32Array(22 * 3);
  private emptyVao: WebGLVertexArrayObject;
  /** the climate's two cube maps, once the field has them */
  climateCubes: [WebGLTexture, WebGLTexture] | null = null;
  /** the ice sheets' cube, once the field has it */
  iceCube: WebGLTexture | null = null;
  /** the two cube maps of the sea's chance, once the field has them */
  seaCubes: [WebGLTexture, WebGLTexture] | null = null;

  constructor(private gl: GL, private fieldCube: WebGLTexture, private cubeSize: number) {
    this.surface = program(gl, 'surface', SPHERE_VS, SURFACE_FS);
    this.clouds = program(gl, 'clouds', SPHERE_VS, CLOUD_FS);
    this.sky = program(gl, 'sky', SKY_VS, SKY_FS);
    this.cloudMap = program(gl, 'cloud material', SKY_VS, CLOUD_MAP_FS);
    const { pos, idx } = sphere(256, 128);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    for (const p of [this.surface, this.clouds]) {
      const loc = gl.getAttribLocation(p.program, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    }
    this.ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.count = idx.length;
    gl.bindVertexArray(null);
    this.emptyVao = gl.createVertexArray()!;
    // Until the surface generator has run, a flat pattern: nothing is drawn from it.
    this.patternTex = texture2D(gl, { width: 1, height: 1, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: new Uint8Array([128, 128, 128, 128]), filter: gl.LINEAR, wrapS: gl.REPEAT });
    this.territoryTex = texture2D(gl, { width: 1, height: 1, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: new Uint8Array([0, 0, 0, 255]), filter: gl.LINEAR, wrapS: gl.REPEAT });
    this.biomeTex = texture2D(gl, { width: 1, height: 1, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: new Uint8Array([128, 128, 128, 128]), filter: gl.LINEAR, wrapS: gl.REPEAT });
    this.peopleTex = texture2D(gl, { width: 1, height: 1, internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, data: new Uint8Array([0]), filter: gl.LINEAR, wrapS: gl.REPEAT });
    this.anthromeTex = texture2D(gl, { width: 1, height: 1, internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, data: new Uint8Array([0]), filter: gl.NEAREST, wrapS: gl.REPEAT });
    this.genericLandTex = texture2D(gl, { width: 1, height: 1, internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, data: new Uint8Array([0]), filter: gl.LINEAR, wrapS: gl.REPEAT });
  }

  /** Generic land, for where no map covers the time: an equirectangular mask, row 0 at the north, 128 at the coast. */
  setGenericLand(width: number, height: number, mask: Uint8Array): void {
    const gl = this.gl;
    gl.deleteTexture(this.genericLandTex);
    this.genericLandTex = texture2D(gl, { width, height, internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, data: mask, filter: gl.LINEAR, wrapS: gl.REPEAT });
    this.genericOn = 1;
  }

  /** The generator's texture of the land's cover: a tile that repeats both ways. */
  setBiomeTexture(size: number, rgba: Uint8Array): void {
    const gl = this.gl;
    gl.deleteTexture(this.cloudDetail);
    this.cloudDetail = null;
    gl.deleteTexture(this.biomeTex);
    this.biomeTex = texture2D(gl, { width: size, height: size, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: rgba, filter: gl.LINEAR, wrapS: gl.REPEAT });
    gl.bindTexture(gl.TEXTURE_2D, this.biomeTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  /** Polities' territory: an equirectangular map, one polity per colour channel. */
  setTerritory(map: HTMLCanvasElement): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.territoryTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, map);
  }

  /** Where people lived: an equirectangular map, row 0 at the north, of how dense they are on the viewer's scale. It changes with the time shown. */
  setPeople(width: number, height: number, levels: Uint8Array): void {
    const gl = this.gl;
    if (width !== this.peopleSize[0] || height !== this.peopleSize[1]) {
      gl.deleteTexture(this.peopleTex);
      this.peopleTex = texture2D(gl, { width, height, internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, data: levels, filter: gl.LINEAR, wrapS: gl.REPEAT });
      this.peopleSize = [width, height];
      return;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.peopleTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.UNSIGNED_BYTE, levels);
  }

  /**
   * The human landscape: an equirectangular map, row 0 at the north, of each cell's class by the build's number (0 for no
   * land), and the colour of each number. It changes with the step of the anthromes.
   */
  setAnthromes(width: number, height: number, classes: Uint8Array, colors?: [number, number, number][]): void {
    const gl = this.gl;
    if (colors) colors.forEach((c, i) => i < 22 && this.anthromeColors.set([c[0] / 255, c[1] / 255, c[2] / 255], i * 3));
    if (width !== this.anthromeSize[0] || height !== this.anthromeSize[1]) {
      gl.deleteTexture(this.anthromeTex);
      this.anthromeTex = texture2D(gl, { width, height, internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, data: classes, filter: gl.NEAREST, wrapS: gl.REPEAT });
      this.anthromeSize = [width, height];
      return;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.anthromeTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.UNSIGNED_BYTE, classes);
  }

  setClouds(width: number, height: number, density: Uint8Array): void {
    const gl = this.gl;
    gl.deleteTexture(this.cloudDetail);
    this.cloudDetail = null;
    if (this.cloudTex) gl.deleteTexture(this.cloudTex);
    this.cloudTex = texture2D(gl, { width, height, internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, data: density, filter: gl.LINEAR, wrapS: gl.REPEAT });
  }

  /** The surface generator's pattern: RGBA over an equirectangular grid. */
  setPattern(width: number, height: number, rgba: Uint8Array): void {
    const gl = this.gl;
    gl.deleteTexture(this.patternTex);
    this.patternTex = texture2D(gl, { width, height, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: rgba, filter: gl.LINEAR, wrapS: gl.REPEAT });
  }

  /** Precompute the cloud material once per pair of source textures. Both the shell and its
   * shadow then read the same filtered map, including while the camera or the clouds move. */
  private bakeClouds(): WebGLTexture {
    const gl = this.gl;
    const width = 2048;
    const height = width / 2;
    const map = texture2D(gl, { width, height, internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, data: null, filter: gl.LINEAR, wrapS: gl.REPEAT });
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, map, 0);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.cloudMap.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cloudTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.biomeTex);
    setUniforms(gl, this.cloudMap, { uClouds: 0, uBiomeTex: 3 }, ['uClouds', 'uBiomeTex']);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, map);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    return map;
  }

  render(f: GlobeFrame, width: number, height: number): void {
    const gl = this.gl;
    const look = f.look;
    if (look.formed && look.clouds && f.showClouds && this.cloudTex && !this.cloudDetail) this.cloudDetail = this.bakeClouds();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.sky.program);
    setUniforms(gl, this.sky, { uInvViewProj: f.invViewProj, uEye: f.eye, uHalo: look.halo, uSun: f.sun, uEmber: look.ember });
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!look.formed) {
      gl.bindVertexArray(null);
      return;
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.surface.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.fieldCube);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.patternTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.territoryTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.biomeTex);
    const cl = f.climate && this.climateCubes ? this.climateCubes : null;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cl ? cl[0] : this.fieldCube);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cl ? cl[1] : this.fieldCube);
    const iceCube = f.ice ? this.iceCube : null;
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, iceCube ?? this.fieldCube);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.peopleTex);
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.genericLandTex);
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, this.anthromeTex);
    const sea = f.sea && this.seaCubes ? this.seaCubes : null;
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, sea ? sea[0] : this.fieldCube);
    gl.activeTexture(gl.TEXTURE11);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, sea ? sea[1] : this.fieldCube);
    setUniforms(gl, this.surface, { uField: 0, uPattern: 1, uTerritory: 2, uBiomeTex: 3, uClimate0: 4, uClimate1: 5, uIce: 6, uPeople: 7, uGenericLand: 8, uAnthromes: 9, uSea0: 10, uSea1: 11 }, ['uField', 'uPattern', 'uTerritory', 'uBiomeTex', 'uClimate0', 'uClimate1', 'uIce', 'uPeople', 'uGenericLand', 'uAnthromes', 'uSea0', 'uSea1']);
    setUniforms(gl, this.surface, { uSeaOn: sea ? 1 : 0, uSeaMix: f.sea?.mix ?? 0 });
    const ac = this.surface.uniforms.get('uAnthromeColors[0]') ?? this.surface.uniforms.get('uAnthromeColors');
    if (ac) gl.uniform3fv(ac, this.anthromeColors);
    setUniforms(gl, this.surface, { uGenericOn: this.genericOn });
    setUniforms(gl, this.surface, { uIceOn: iceCube ? 1 : 0, uIceMix: f.ice?.mix ?? 0, uIceTop: THICKNESS_TOP });
    const r = f.climate?.rule;
    const cv = look.cover;
    setUniforms(gl, this.surface, {
      uClimateOn: cl ? 1 : 0,
      uClimateMix: f.climate?.mix ?? 0,
      uCover: [cv.crust, cv.plants, cv.forests, cv.grasses],
      uReefs: cv.reefs,
      uRule: r ? [r.polar, r.frost, r.tropical, r.cold] : [0, 0, 0, 0],
      uRule2: r ? [r.arid, r.desert, r.reef_depth, r.reef_latitude] : [0, 0, 0, 0],
    });
    const ter = f.territory;
    setUniforms(gl, this.surface, { uTerritoryOn: ter?.on ? 1 : 0, uTerritoryColors: (ter?.colors ?? [[0, 0, 0], [0, 0, 0], [0, 0, 0]]).flat(), uTerritorySel: ter?.selected ?? -1 }, ['uTerritorySel']);
    setUniforms(gl, this.surface, {
      uViewProj: f.viewProj,
      uRadius: 1,
      uMix: f.mix,
      uSun: f.sun,
      uEye: f.eye,
      uEvidence: f.evidence,
      uCoast: f.coast,
      uTexel: 1.5 / this.cubeSize,
      // About a third of a node of the field, and never less than a texel of the cube it is read from.
      uSmooth: Math.max((f.res * Math.PI) / 180 / 2.9, 1 / this.cubeSize),
      uCrust: look.crust,
      uIceReach: look.iceReach,
      uIceEdge: look.iceEdge,
      uRim: look.rim,
    });
    setUniforms(gl, this.surface, { uPeopleOn: f.people ? 1 : 0, uAnthromesOn: f.anthromes ? 1 : 0 });
    setUniforms(gl, this.surface, { uSurfaceMix: look.surfaceMix, uMolten: look.molten, uEmber: look.ember });
    setUniforms(gl, this.surface, { uMode: f.mode, uSurface: look.surface, uSurfaceTo: look.surfaceTo }, ['uMode', 'uSurface', 'uSurfaceTo']);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
    gl.activeTexture(gl.TEXTURE0);

    if (f.showClouds && this.cloudDetail && look.clouds) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.useProgram(this.clouds.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.cloudDetail);
      setUniforms(gl, this.clouds, { uClouds: 0 }, ['uClouds']);
      const thin = f.people ? 0.3 : 1;
      const d = f.drift;
      const rad = Math.PI / 180;
      const drift = d ? [d.tropics * rad, d.beyond * rad, d.between[0] * rad, d.between[1] * rad] : [0, 0, 0, 1];
      setUniforms(gl, this.clouds, { uViewProj: f.viewProj, uRadius: 1.0025, uSun: f.sun, uEye: f.eye, uEvidence: f.evidence, uOpacity: look.clouds.opacity * thin, uBase: look.clouds.base * thin, uTint: look.clouds.tint, uGlow: look.clouds.glow, uDrift: drift });
      gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.surface.program);
    gl.deleteProgram(this.clouds.program);
    gl.deleteProgram(this.sky.program);
    gl.deleteProgram(this.cloudMap.program);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.emptyVao);
    gl.deleteBuffer(this.vbo);
    gl.deleteBuffer(this.ibo);
    if (this.cloudDetail) gl.deleteTexture(this.cloudDetail);
    if (this.cloudTex) gl.deleteTexture(this.cloudTex);
    gl.deleteTexture(this.patternTex);
    gl.deleteTexture(this.territoryTex);
    gl.deleteTexture(this.biomeTex);
    gl.deleteTexture(this.genericLandTex);
    gl.deleteTexture(this.peopleTex);
    gl.deleteTexture(this.anthromeTex);
    this.cloudDetail = null;
    this.cloudTex = null;
  }
}
