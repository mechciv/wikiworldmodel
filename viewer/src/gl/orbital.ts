// Material detail below the globe fields' resolution. These patterns only affect the picture:
// the coast, the climate, the ice margins and the planet's states still come from the fields.
// Project the seeded, mipmapped biome tile onto three planes. Overlapping projections avoid a
// longitude seam, pinching at the poles, and a pattern that turns with the camera.
export const MATERIAL = `
uniform highp sampler2D uBiomeTex;

vec4 grain(vec3 p, vec3 weights) {
  return texture(uBiomeTex, p.yz) * weights.x
       + texture(uBiomeTex, p.zx) * weights.y
       + texture(uBiomeTex, p.xy) * weights.z;
}

vec3 planes(vec3 n) {
  vec3 w = n * n;
  w *= w;
  return w / (w.x + w.y + w.z);
}

// Fold the fine grain along larger structures instead of repeating a square tile on the land.
vec4 lithology(vec3 n, float closeUp) {
  vec3 w = planes(n);
  vec4 folds = grain(n * 0.82, w);
  vec3 p = n * 2.7 + 0.19 * (folds.bgr - 0.5);
  vec4 bed = grain(p, w);
  vec4 grit = grain(p * 3.6 + 0.14 * bed.brg, w);
  float ridge = 1.0 - abs(bed.b * 2.0 - 1.0);
  if (closeUp > 0.0) {
    // Resolve smaller outcrops within the same ridge on the descent from orbit.
    vec4 fine = grain(p * 15.0 + 0.23 * grit.bgr, w);
    bed.r = mix(bed.r, fine.r, 0.38 * closeUp);
    ridge += closeUp * (1.0 - abs(grit.b * 2.0 - 1.0) - 0.5) * 0.24;
    grit.g = mix(grit.g, fine.g, 0.55 * closeUp);
  }
  return vec4(folds.b, bed.r, ridge, grit.g);
}
`;

export const RIDGE_LIGHT = `
// Directional light on sub-grid ridges. Recover the tangent gradient from screen derivatives
// so that a ridge keeps its sunward and shaded flanks as the camera turns or zooms.
float ridgeLight(vec3 n, vec3 sun, float height) {
  vec3 dx = dFdx(n), dy = dFdy(n);
  vec3 tx = cross(dy, n), ty = cross(n, dx);
  float area = dot(dx, tx);
  vec3 slope = tx * dFdx(height) + ty * dFdy(height);
  return clamp(-dot(slope, sun) * sign(area) / max(abs(area), 1e-12), -0.32, 0.32);
}
`;

// The cloud generator gives the large weather systems and clear regions. Inside a system,
// wind long filaments around scattered centres, and break the bright cloud tops into cells.
// Bake this material once. Playback moves the finished texture, including the fine grain.
export const CLOUD_MAP_FS = `#version 300 es
precision highp float;
${MATERIAL}
uniform highp sampler2D uClouds;
in vec2 vNdc;
out float density;

float cloudBands(vec2 p) {
  vec2 cell = floor(p);
  vec2 centre = 0.5 + 0.30 * (textureLod(uBiomeTex, (cell + 0.5) * 0.073, 0.0).rb - 0.5);
  vec2 q = fract(p) - centre;
  float spin = textureLod(uBiomeTex, (cell + 0.5) * 0.123, 0.0).b - 0.5;
  float angle = 5.4 * spin * (1.0 - smoothstep(0.03, 0.34, length(q)));
  vec2 swept = cell + centre + mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * q;
  vec4 flow = texture(uBiomeTex, swept * 0.22);
  vec2 along = mat2(0.8, 0.6, -0.6, 0.8) * swept;
  vec4 front = texture(uBiomeTex, along * vec2(0.46, 0.32) + 0.14 * flow.br);
  vec4 tufts = texture(uBiomeTex, along * 1.18 + 0.085 * front.br);
  return dot(vec4(flow.r, front.g, front.r, tufts.r), vec4(0.16, 0.30, 0.32, 0.22));
}

void main() {
  vec2 uv = vNdc * 0.5 + 0.5;
  float lat = (0.5 - uv.y) * 3.14159265, lon = (uv.x - 0.5) * 6.2831853;
  vec3 n = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  float system = texture(uClouds, uv).r;
  vec3 w = planes(n);
  vec3 p = n * 4.8;
  float band = dot(w, vec3(cloudBands(p.yz), cloudBands(p.zx), cloudBands(p.xy)));
  vec4 billows = grain(n * 6.4, w);
  float depth = system + (band - 0.5) * 1.07 + (billows.r - 0.5) * 0.24;
  // Even wisps have to belong to a system. Low optical depths leave the ocean visible through them.
  float tops = 0.77 + 0.23 * (0.60 * billows.r + 0.40 * band);
  density = tops * smoothstep(0.02, 0.27, system) * smoothstep(0.105, 0.86, depth);
}
`;
