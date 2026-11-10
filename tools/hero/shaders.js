// GLSL for the hero: one planet, cut open into its layers.
// Everything is in object space, which is world space: the globe sits at the origin, unrotated,
// with +Y north and longitude 0 on +X (east to the right as seen from outside).

export const MAX_LAYERS = 8;

export const common = /* glsl */ `
#define PI 3.141592653589793
#define TAU 6.283185307179586
#define MAXL ${MAX_LAYERS}

uniform vec3 uSun;          // unit vector toward the sun
uniform vec3 uCam;          // camera position
uniform vec3 uAxis;         // the cut's axis (well mode) or the wedge's spine
uniform vec3 uU;            // a frame around the axis: up and right as seen from the camera
uniform vec3 uV;
uniform vec3 uEA;           // the axis the sectors of time sit around, and a frame for it
uniform vec3 uEU;
uniform vec3 uEV;
uniform int uMode;          // 0 well (a cap), 1 wedge (between two half-planes)
uniform float uR[MAXL];     // the top of each layer: uR[0] = 1, the surface
uniform float uCut[MAXL];   // each layer's cut: cos of the half-angle (well) or the half-angle (wedge)
uniform int uN;             // how many layers are cut (surface included)
uniform float uCutL;        // wedge: the flat face's angle, west of the opening (radians)
uniform float uCut2[MAXL];  // octant: each layer's angle on the other side
uniform float uFloor[MAXL]; // octant: each layer's floor, as a height along the spine
uniform int uEraMode;       // 0 sectors around uEA; 1 bands along uEU
uniform float uEraBias;
uniform float uEraTilt;
uniform float uNightIsNow;
uniform vec3 uCamUp;
uniform vec3 uCamRight;
uniform int uDebug;
uniform float uTime;

// ---- hashing and noise (PCG3D, Jarzynski & Olano 2020)
uvec3 pcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3(ivec3 c) { return vec3(pcg3(uvec3(c + 65536)) & 0xffffffu) / 16777215.0; }
float hash1(ivec3 c) { return hash3(c).x; }

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  ivec3 c = ivec3(i);
  float n000 = hash1(c), n100 = hash1(c + ivec3(1, 0, 0)), n010 = hash1(c + ivec3(0, 1, 0)), n110 = hash1(c + ivec3(1, 1, 0));
  float n001 = hash1(c + ivec3(0, 0, 1)), n101 = hash1(c + ivec3(1, 0, 1)), n011 = hash1(c + ivec3(0, 1, 1)), n111 = hash1(c + ivec3(1, 1, 1));
  float x00 = mix(n000, n100, u.x), x10 = mix(n010, n110, u.x), x01 = mix(n001, n101, u.x), x11 = mix(n011, n111, u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z) * 2.0 - 1.0;
}
float fbm(vec3 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 9; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    n += a;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s / n;
}
// F1 and F2 of a cellular pattern
vec2 worley(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  float d1 = 9.0, d2 = 9.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    ivec3 c = ivec3(i) + ivec3(x, y, z);
    vec3 o = hash3(c) * 0.85 + 0.075;
    vec3 d = vec3(x, y, z) + o - f;
    float dd = dot(d, d);
    if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) { d2 = dd; }
  }
  return sqrt(vec2(d1, d2));
}

// ---- longitude and latitude, with gradients that do not jump at the seam
struct UV { vec2 uv; vec2 dx; vec2 dy; };
UV llUV(vec3 p) {
  UV r;
  vec3 n = normalize(p);
  r.uv = vec2(atan(-n.z, n.x) / TAU + 0.5, 0.5 - asin(clamp(n.y, -1.0, 1.0)) / PI);
  float u2 = fract(r.uv.x + 0.5);
  r.dx = dFdx(r.uv); r.dy = dFdy(r.uv);
  vec2 dx2 = vec2(dFdx(u2), r.dx.y), dy2 = vec2(dFdy(u2), r.dy.y);
  if (abs(dx2.x) + abs(dy2.x) < abs(r.dx.x) + abs(r.dy.x)) { r.dx = dx2; r.dy = dy2; }
  return r;
}
vec4 tex(sampler2D t, UV g) { return textureGrad(t, g.uv, g.dx, g.dy); }
// a texture over a box of longitude and latitude (west, south, east, north)
vec4 texBox(sampler2D t, vec3 p, vec4 box, UV g) {
  vec3 n = normalize(p);
  float lon = atan(-n.z, n.x) * 180.0 / PI, lat = asin(clamp(n.y, -1.0, 1.0)) * 180.0 / PI;
  vec2 uv = vec2((lon - box.x) / (box.z - box.x), (box.w - lat) / (box.w - box.y));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  vec2 s = vec2(360.0 / (box.z - box.x), 180.0 / (box.w - box.y));
  return textureGrad(t, uv, g.dx * s, g.dy * s);
}

vec3 eastOf(vec3 n) { vec3 e = vec3(n.z, 0.0, -n.x); float l = length(e); return l > 1e-5 ? e / l : vec3(1.0, 0.0, 0.0); }
// a surface normal from east and north slopes, tanh-encoded in two bytes
vec3 slopeNormal(vec3 n, vec2 enc, float k) {
  vec2 s = 0.5 * log((1.0 + (2.0 * enc - 1.0) * 0.999) / (1.0 - (2.0 * enc - 1.0) * 0.999));
  vec3 e = eastOf(n);
  vec3 no = cross(n, e);
  return normalize(n - k * (s.x * e + s.y * no));
}

// ---- the cut
// how far a direction is inside layer k's cut: > 0 inside (removed), < 0 outside (kept), in radians
float cutDepth(vec3 p, int k) {
  vec3 n = normalize(p);
  if (uMode == 0) {
    return acos(clamp(dot(n, uAxis), -1.0, 1.0)) * -1.0 + acos(clamp(uCut[k], -1.0, 1.0));
  }
  // wedge: the spine is uAxis; the wedge opens toward uV, between half-planes at ±uCut[k]
  vec3 q = n - dot(n, uAxis) * uAxis;
  float a = atan(dot(q, uU), dot(q, uV));
  if (uMode == 1) return min(uCut[k] - a, a + uCutL);
  // octant: between the half-planes, and above the layer's floor
  float h = (dot(p, uAxis) - uFloor[k]) / max(length(p), 1e-3);
  return min(min(uCut[k] - a, a + uCut2[k]), h);
}

// light reaching a point inside the cut, past every layer above layer k
float shadowAbove(vec3 q, int k) {
  float lit = 1.0;
  for (int j = 0; j < MAXL; j++) {
    if (j >= k) break;
    float r0 = uR[j + 1], r1 = uR[j];
    for (int s = 0; s < 5; s++) {
      float rr = mix(r0, r1, (float(s) + 0.5) / 5.0);
      float b = dot(q, uSun);
      float c = dot(q, q) - rr * rr;
      float disc = b * b - c;
      if (disc < 0.0) continue;
      float t = -b + sqrt(disc);
      if (t <= 0.0) continue;
      vec3 x = q + t * uSun;
      lit = min(lit, smoothstep(-0.006, 0.006, cutDepth(x, j)));
    }
  }
  return lit;
}
`;

export const vertex = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// ---- the surface: five times at once, in sectors around the cut
export const surfaceFrag = /* glsl */ `
${common}
varying vec3 vPos;
uniform sampler2D tNowAlb, tNowSurf, tLights, tRome, tAlbA, tSurfA, tAlbB, tSurfB;
uniform vec4 uRomeBox;
uniform float uEra[6];      // sector boundaries, in turns clockwise from up, around the axis
uniform float uEraSoft;     // half-width of a seam, in turns
uniform float uSeamLine;    // brightness of the line drawn along each seam
uniform float uRelief;
uniform float uRomeTint, uRomeRoads, uRomeEdge, uLights, uHaze, uGlint, uMagma, uCloud;
uniform vec3 uSlabAxis;
uniform float uSlabLo, uSlabHi;
uniform int uEraFixed;
uniform float uEraLon[5];   // turn each time's map about the pole: paleolongitude is free
uniform float uExposure;

float sstep(float a, float b, float x) { return smoothstep(a, b, x); }
// weight of sector i at position t (turns), with wrap-around
float eraW(int i, float t) {
  float a = uEra[i], b = uEra[i + 1];
  float w = 0.0;
  for (int k = -1; k <= 1; k++) {
    float tt = t + float(k);
    w += sstep(a - uEraSoft, a + uEraSoft, tt) * (1.0 - sstep(b - uEraSoft, b + uEraSoft, tt));
  }
  return clamp(w, 0.0, 1.0);
}

struct Mat { vec3 alb; vec2 slope; float water; float ice; vec3 emit; float cloud; float cloudDark; vec3 cloudTint; float relief; };

Mat hadean(vec3 n) {
  Mat m;
  vec3 p = n * 7.0;
  vec3 warp = vec3(fbm(p * 0.9 + 3.1, 4), fbm(p * 0.9 + 7.7, 4), fbm(p * 0.9 + 1.3, 4));
  vec2 w = worley(p + warp * 0.9);
  float edge = w.y - w.x;
  float crack = 1.0 - smoothstep(0.0, 0.11, edge);
  vec2 w2 = worley(p * 3.1 + warp * 2.0);
  float crack2 = 1.0 - smoothstep(0.0, 0.07, w2.y - w2.x);
  float pools = smoothstep(0.25, 0.75, fbm(n * 3.0 + 11.0, 5));
  float heat = max(crack, crack2 * 0.45) + pools * 0.8;
  heat = clamp(heat, 0.0, 1.0);
  float crustTex = fbm(n * 60.0, 5) * 0.5 + 0.5;
  m.alb = mix(vec3(0.030, 0.027, 0.025), vec3(0.075, 0.068, 0.062), crustTex) * (1.0 - heat);
  vec3 hot = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.62, 0.18), heat * heat);
  m.emit = hot * (heat * heat * 5.5 + heat * 0.6) * uMagma;
  m.slope = vec2(0.0);
  m.water = 0.0; m.ice = 0.0;
  m.cloud = 0.62; m.cloudDark = 0.25; m.cloudTint = vec3(0.62, 0.58, 0.55);
  m.relief = 0.0;
  return m;
}

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }

Mat fromTex(sampler2D alb, sampler2D surf, UV g) {
  Mat m;
  m.alb = tex(alb, g).rgb;
  vec4 s = tex(surf, g);
  m.slope = s.xy; m.water = s.z; m.ice = s.w;
  m.emit = vec3(0.0);
  m.cloud = uCloud; m.cloudDark = 0.0; m.cloudTint = vec3(1.0);
  m.relief = 1.0;
  return m;
}

void main() {
  vec3 n = normalize(vPos);
  float sx = dot(vPos, uSlabAxis);
  if (sx < uSlabLo || sx > uSlabHi) discard;
  if (uMode != 3 && cutDepth(vPos, 0) > 0.0) discard;
  UV g = llUV(vPos);
  UV gA = llUV(rotY(vPos, uEraLon[1]));
  UV gB = llUV(rotY(vPos, uEraLon[2]));

  // which sector: angle around the axis, clockwise from up as the camera sees it
  float t = fract(atan(dot(n, uEV), dot(n, uEU)) / TAU + 1.0);
  if (uEraMode == 1) t = clamp(0.5 - asin(clamp(dot(n, uEU), -1.0, 1.0)) / PI + uEraBias, 0.0, 0.999);
  float w[5];
  float wsum = 0.0;
  if (uEraMode == 1) {
    // strata: the oldest at the bottom, as the camera sees it; today on the night side, to the right
    float sv = dot(n, uCamUp);
    float sr = dot(n, uCamRight);
    float modern = smoothstep(uEra[4] - uEraSoft, uEra[4] + uEraSoft, sr + uEraTilt * sv);
    if (uNightIsNow > 0.5) modern = 1.0 - smoothstep(uEra[5] - 0.06, uEra[5] + 0.06, dot(n, uSun));
    float b0 = 1.0 - smoothstep(uEra[1] - uEraSoft, uEra[1] + uEraSoft, sv);
    float b1 = smoothstep(uEra[1] - uEraSoft, uEra[1] + uEraSoft, sv) * (1.0 - smoothstep(uEra[2] - uEraSoft, uEra[2] + uEraSoft, sv));
    float b2 = smoothstep(uEra[2] - uEraSoft, uEra[2] + uEraSoft, sv) * (1.0 - smoothstep(uEra[3] - uEraSoft, uEra[3] + uEraSoft, sv));
    float b3 = smoothstep(uEra[3] - uEraSoft, uEra[3] + uEraSoft, sv);
    w[0] = b0 * (1.0 - modern); w[1] = b1 * (1.0 - modern); w[2] = b2 * (1.0 - modern); w[3] = b3 * (1.0 - modern); w[4] = modern;
    for (int i = 0; i < 5; i++) wsum += w[i];
  } else {
    for (int i = 0; i < 5; i++) { w[i] = eraW(i, t); wsum += w[i]; }
  }
  for (int i = 0; i < 5; i++) w[i] /= max(wsum, 1e-4);
  if (uEraFixed >= 0) for (int i = 0; i < 5; i++) w[i] = i == uEraFixed ? 1.0 : 0.0;

  Mat m;
  m.alb = vec3(0.0); m.slope = vec2(0.0); m.water = 0.0; m.ice = 0.0; m.emit = vec3(0.0);
  m.cloud = 0.0; m.cloudDark = 0.0; m.cloudTint = vec3(0.0); m.relief = 0.0;
  vec3 romeMark = vec3(0.0);
  float lightsAmt = 0.0;
  for (int i = 0; i < 5; i++) {
    if (w[i] < 0.001) continue;
    Mat e;
    if (i == 0) e = hadean(n);
    else if (i == 1) e = fromTex(tAlbA, tSurfA, gA);
    else if (i == 2) e = fromTex(tAlbB, tSurfB, gB);
    else e = fromTex(tNowAlb, tNowSurf, g);
    if (i == 3) {
      vec4 r = texBox(tRome, vPos, uRomeBox, g);
      romeMark = r.rgb * w[i];
    }
    if (i == 4) lightsAmt = w[i];
    m.alb += e.alb * w[i]; m.slope += e.slope * w[i]; m.water += e.water * w[i]; m.ice += e.ice * w[i];
    m.emit += e.emit * w[i]; m.cloud += e.cloud * w[i]; m.cloudDark += e.cloudDark * w[i];
    m.cloudTint += e.cloudTint * w[i]; m.relief += e.relief * w[i];
  }

  vec3 L = uSun;
  vec3 V = normalize(uCam - vPos);
  float mu = dot(n, L);
  vec3 N = m.relief > 0.0 ? slopeNormal(n, mix(vec2(0.5), m.slope, m.relief), uRelief) : n;
  // ocean: a faint swell
  if (m.water > 0.5) N = normalize(n + 0.012 * vec3(vnoise(n * 900.0), vnoise(n * 900.0 + 5.0), vnoise(n * 900.0 + 9.0)));

  // Rome in 120 CE: the empire tinted, its border and its roads
  vec3 alb = m.alb;
  float terr = romeMark.r;
  alb = mix(alb, alb * vec3(1.18, 0.86, 0.78) + vec3(0.025, 0.0, 0.0), terr * uRomeTint);
  alb = mix(alb, vec3(0.98, 0.84, 0.58), clamp(romeMark.b, 0.0, 1.0) * uRomeRoads);
  alb = mix(alb, vec3(1.0, 0.90, 0.82), clamp(romeMark.g, 0.0, 1.0) * uRomeEdge);

  // clouds, and their shadows
  vec3 cp = n * 4.6;
  vec3 cw = vec3(fbm(cp * 1.7 + 1.0, 4), fbm(cp * 1.7 + 4.0, 4), fbm(cp * 1.7 + 8.0, 4));
  float band = 0.75 + 0.25 * cos(asin(n.y) * 6.0);
  float cd = fbm(cp + cw * 0.9, 7) * 0.5 + 0.5;
  float cover = m.cloud * band;
  float cloud = smoothstep(1.0 - cover, 1.0 - cover + 0.28, cd);
  vec3 ns = normalize(n + (L - n * mu) * 0.006);
  vec3 cps = ns * 4.6;
  float cds = fbm(cps + cw * 0.9, 6) * 0.5 + 0.5;
  float cshadow = smoothstep(1.0 - cover, 1.0 - cover + 0.28, cds);

  float day = smoothstep(-0.08, 0.18, mu);
  float diff = max(dot(N, L), 0.0) * smoothstep(-0.05, 0.12, mu);
  float wrapd = smoothstep(-0.25, 0.6, mu) * 0.06;
  vec3 sun = vec3(1.0, 0.97, 0.92) * 1.7;
  vec3 sky = vec3(0.35, 0.5, 0.8) * 0.06;

  vec3 col = alb * (sun * diff * (1.0 - 0.55 * cshadow) + sky * day + wrapd);
  // sun glint on the water
  if (m.water > 0.0) {
    vec3 Hh = normalize(L + V);
    float spec = pow(max(dot(N, Hh), 0.0), 160.0) * uGlint + pow(max(dot(N, Hh), 0.0), 24.0) * 0.015;
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    col += m.water * (1.0 - cloud) * sun * spec * smoothstep(0.0, 0.2, mu) * (0.25 + fres);
  }
  // emission: magma and city lights, dimmed by cloud
  vec3 emit = m.emit;
  if (lightsAmt > 0.0) {
    float li = tex(tLights, g).r;
    li = pow(li, 2.6);
    vec3 lc = mix(vec3(1.0, 0.50, 0.18), vec3(1.0, 0.80, 0.52), li);
    emit += lc * li * uLights * lightsAmt * (1.0 - smoothstep(-0.12, 0.06, mu));
  }
  col += emit * (1.0 - 0.75 * cloud);
  // the cloud layer itself
  vec3 cloudCol = m.cloudTint * (sun * smoothstep(-0.1, 0.35, mu) * 0.85 + sky) * (1.0 - m.cloudDark);
  cloudCol += emit * 0.25 * m.cloudDark;
  col = mix(col, cloudCol, cloud * 0.92);
  // air: haze toward the limb on the day side
  float vmu = max(dot(n, V), 0.0);
  float haze = pow(1.0 - vmu, 3.0);
  vec3 air = vec3(0.30, 0.52, 1.0);
  col = col * (1.0 - 0.30 * haze * day) + air * haze * day * uHaze;

  // the seams between times, drawn as a thin bright line
  if (uSeamLine > 0.0) {
    float sl = 0.0;
    if (uEraMode == 1) {
      float sv = dot(n, uCamUp), sr = dot(n, uCamRight) + uEraTilt * dot(n, uCamUp);
      float pv = fwidth(sv), pr = fwidth(sr);
      bool isModern = uNightIsNow > 0.5 ? dot(n, uSun) < uEra[5] : sr > uEra[4];
      for (int i = 1; i < 4; i++) if (!isModern) sl = max(sl, 1.0 - smoothstep(pv * 0.5, pv * 1.8, abs(sv - uEra[i])));
      if (uNightIsNow < 0.5) sl = max(sl, 1.0 - smoothstep(pr * 0.5, pr * 1.8, abs(sr - uEra[4])));
    } else for (int i = 0; i < 5; i++) {
      float d = abs(fract(t - uEra[i] + 0.5) - 0.5);
      float px = min(fwidth(t), fwidth(fract(t + 0.5)));
      sl = max(sl, 1.0 - smoothstep(px * 0.5, px * 1.8, d));
    }
    col += vec3(0.9, 0.95, 1.0) * sl * uSeamLine * (0.25 + 0.75 * day);
  }

  if (uDebug == 1) {
    vec3 dc[5] = vec3[5](vec3(1.0, 0.3, 0.1), vec3(0.6, 0.4, 0.2), vec3(0.2, 0.8, 0.3), vec3(0.9, 0.2, 0.6), vec3(0.2, 0.5, 1.0));
    vec3 d = vec3(0.0);
    for (int i = 0; i < 5; i++) d += dc[i] * w[i];
    col = mix(col, d * (0.3 + day), 0.65);
  }
  gl_FragColor = vec4(col * uExposure, 1.0);
}
`;

// ---- a layer of the model, as a shell under the surface
export const layerFrag = /* glsl */ `
${common}
varying vec3 vPos;
uniform sampler2D tLayer;
uniform int uK;             // this layer's index in uR and uCut
uniform float uSelf;        // how much the layer lights itself
uniform vec3 uTint;
uniform float uExposure;

void main() {
  if (cutDepth(vPos, uK) > 0.0) discard;
  // only what shows inside the cut of the layer above
  if (cutDepth(vPos, uK - 1) < -0.02) discard;
  vec3 n = normalize(vPos);
  UV g = llUV(vPos);
  vec3 c = tex(tLayer, g).rgb;
  vec3 L = uSun;
  float mu = max(dot(n, L), 0.0);
  float sh = shadowAbove(vPos, uK);
  // darker where the tread meets the wall above it
  float ao = smoothstep(0.0, 0.05, -cutDepth(vPos, uK - 1));
  vec3 lit = c * (vec3(1.0, 0.97, 0.92) * 2.2 * mu * sh + 0.10);
  vec3 col = mix(lit, c * uSelf, 0.45) * (0.45 + 0.55 * ao);
  gl_FragColor = vec4(col * uExposure, 1.0);
}
`;

// ---- the walls between layers: each layer's edge, like the edge of a page.
// With uSection on, a wall shows its layer's map along the cut, carried down through its thickness:
// a cross-section through the model.
export const wallFrag = /* glsl */ `
${common}
varying vec3 vPos;
uniform int uK;             // the wall belongs to layer uK: it runs from uR[uK + 1] up to uR[uK]
uniform vec3 uColor;
uniform sampler2D tLayer;
uniform float uSection;
uniform float uSectionK;
uniform sampler2D tLabel;
uniform float uLabel, uLabelH, uLabelBeta, uLabelLen, uLabelU, uLabelSign;
uniform int uLabelFace;
uniform int uFace;          // octant: 0 the floor, 1 and 2 the sides
uniform float uAmbient;
uniform float uSectionLod;
uniform float uBandGlow;
uniform float uCoreLight;
uniform float uExposure;

void main() {
  vec3 n = normalize(vPos);
  float r = length(vPos);
  // the wall's normal points into the cut
  vec3 N;
  if (uMode == 0) N = normalize(uAxis - dot(n, uAxis) * n);
  else if (uMode == 2 && uFace == 0) N = uAxis;
  else {
    vec3 q = n - dot(n, uAxis) * uAxis;
    float a = atan(dot(q, uU), dot(q, uV));
    vec3 side = normalize(cross(uAxis, normalize(q)));
    N = a > 0.0 ? -side : side;
  }
  float r0 = uR[uK + 1], r1 = uR[uK];
  float h = clamp((r - r0) / (r1 - r0), 0.0, 1.0);
  // the layer's own data along the cut, carried down through its thickness: a cross-section
  UV g = llUV(n);
  vec3 data = textureLod(tLayer, g.uv, uSectionLod).rgb;
  vec3 base = uK > 0 ? mix(uColor, data, uSection * uSectionK) : uColor * (0.9 + 0.1 * sin(h * 18.0 + fbm(vPos * 20.0, 3) * 2.5));
  base *= mix(0.80, 1.06, h) * (0.95 + 0.05 * fbm(vPos * 70.0, 4));
  float sh = shadowAbove(vPos * 0.999 + N * 0.001, uK);
  float mu = max(dot(N, uSun), 0.0);
  float ao = 1.0;
  if (uMode == 2) {
    vec3 q = vPos - dot(vPos, uAxis) * uAxis;
    float a = atan(dot(q, uU), dot(q, uV));
    float rq = length(q);
    float dFloor = dot(vPos, uAxis) - uFloor[uK];
    float d1 = rq * sin(max(uCut[uK] - a, 0.0)), d2 = rq * sin(max(a + uCut2[uK], 0.0));
    float d = uFace == 0 ? min(d1, d2) : (uFace == 1 ? min(dFloor, d2) : min(dFloor, d1));
    ao = 0.55 + 0.45 * smoothstep(0.0, 0.12, d);
  }
  float rc = uR[uN];
  vec3 coreLight = vec3(1.0, 0.55, 0.22) * uCoreLight * exp(-(r - rc) * 9.0);
  vec3 col = (base * (vec3(1.0, 0.97, 0.92) * 1.45 * mu * sh + uAmbient + coreLight) + base * uBandGlow) * ao;
  // a fine line where one layer meets the next
  float px = fwidth(h);
  float line = 1.0 - smoothstep(px * 0.5, px * 1.6, min(h, 1.0 - h));
  col = mix(col, vec3(0.92, 0.95, 1.0) * (0.25 + 0.6 * mu * sh), line * 0.65);
  // the layer's name, written along its band
  if (uLabel > 0.5 && uMode == 2 && uFace == uLabelFace) {
    vec3 q = vPos - dot(vPos, uAxis) * uAxis;
    float beta = atan(dot(vPos, uAxis), length(q));
    float rm = 0.5 * (r0 + r1);
    float th = uLabelH * (r1 - r0);
    float s = (uLabelBeta - beta) * rm + 0.5 * uLabelLen;
    float tv = 0.5 - (r - rm) / th * uLabelSign;
    vec2 tuv = vec2(s / uLabelLen, tv);
    if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) {
      float a = texture2D(tLabel, vec2(tuv.x * uLabelU, (float(uK) + tuv.y) / 8.0)).a;
      col = mix(col, vec3(1.0, 0.98, 0.95) * (0.55 + 0.45 * mu * sh) * 1.25, a * uLabel);
    }
  }
  gl_FragColor = vec4(col * uExposure, 1.0);
}
`;

// ---- the core: where everything rests. A layer like the others, cut like them, lit from within.
export const coreFrag = /* glsl */ `
${common}
varying vec3 vPos;
uniform float uExposure;
uniform int uK;
uniform float uGlow;
uniform int uWall;
uniform int uFace;
uniform sampler2D tLabel;
uniform float uLabel, uLabelH, uLabelBeta, uLabelLen, uLabelU, uLabelSign;
uniform int uLabelFace;
void main() {
  vec3 n = normalize(vPos);
  if (uWall == 0 && cutDepth(vPos, uK) > 0.0) discard;
  float rr = length(vPos) / uR[uK];
  vec2 w = worley(vPos * 26.0);
  float net = 1.0 - smoothstep(0.0, 0.07, w.y - w.x);
  vec2 w2 = worley(vPos * 9.0 + 3.0);
  float net2 = 1.0 - smoothstep(0.0, 0.05, w2.y - w2.x);
  float heat = pow(clamp(1.0 - rr, 0.0, 1.0), 1.4);
  vec3 c = mix(vec3(0.85, 0.30, 0.07), vec3(1.0, 0.80, 0.50), heat) * (0.35 + 1.6 * heat);
  c += vec3(1.0, 0.78, 0.45) * (net * 0.35 + net2 * 0.6) * (0.4 + heat);
  // the core's skin, where it shows through the cut
  if (uWall == 1 && uLabel > 0.5 && uMode == 2 && uFace == uLabelFace) {
    vec3 q = vPos - dot(vPos, uAxis) * uAxis;
    float beta = atan(dot(vPos, uAxis), length(q));
    float r = length(vPos);
    float rm = uR[uK] * 0.62;
    float th = uLabelH * uR[uK] * 0.32;
    float s = (uLabelBeta - beta) * rm + 0.5 * uLabelLen;
    float tv = 0.5 - (r - rm) / th * uLabelSign;
    vec2 tuv = vec2(s / uLabelLen, tv);
    if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) {
      float a = texture2D(tLabel, vec2(tuv.x * uLabelU, (float(uK) + tuv.y) / 8.0)).a;
      c = mix(c, vec3(0.25, 0.08, 0.02), a * 0.85);
    }
  }
  if (uWall == 0) {
    float f = fbm(n * 5.0, 5) * 0.5 + 0.5;
    c = mix(vec3(0.9, 0.35, 0.08), vec3(1.0, 0.7, 0.4), f) * 0.5;
  }
  gl_FragColor = vec4(c * uGlow * uExposure, 1.0);
}
`;

// ---- the air: a glow along the limb, lit from the sun's side
export const atmoFrag = /* glsl */ `
${common}
varying vec3 vPos;
uniform float uExposure;
uniform float uEra[6];
void main() {
  vec3 V = normalize(vPos - uCam);
  // closest approach of the view ray to the centre
  float tc = -dot(uCam, V);
  vec3 c = uCam + V * tc;
  float h = length(c);
  vec3 cn = normalize(c);
  float above = (h - 1.0) / 0.022;
  float dens = h > 1.0 ? exp(-above * 1.6) : exp(-(1.0 - h) * 60.0) * 0.6;
  float mu = dot(cn, uSun);
  float lit = smoothstep(-0.25, 0.35, mu);
  vec3 col = mix(vec3(0.18, 0.40, 1.0), vec3(0.55, 0.75, 1.0), smoothstep(0.0, 1.0, mu)) * lit;
  // the sunset band at the terminator
  col += vec3(1.0, 0.45, 0.15) * exp(-pow((mu - 0.02) / 0.09, 2.0)) * 0.6;
  gl_FragColor = vec4(col * dens * 0.9 * uExposure, 1.0);
}
`;

// ---- the face of a slice: every layer as a ring, by its radius
export const capFrag = /* glsl */ `
${common}
varying vec3 vPos;
uniform sampler2D tL1, tL2, tL3, tL4, tL5;
uniform vec3 uCol[7];
uniform vec3 uNormal;
uniform float uSection;
uniform float uSectionLod;
uniform float uBandGlow;
uniform float uCoreLight;
uniform float uAmbient;
uniform float uExposure;
void main() {
  float r = length(vPos);
  if (r > 1.0) discard;
  vec3 n = normalize(vPos);
  UV g = llUV(vPos);
  int k = 0;
  for (int i = 1; i < MAXL; i++) { if (i > uN) break; if (r < uR[i]) k = i; }
  float rc = uR[uN];
  vec3 base;
  float px = fwidth(r);
  if (k == uN) {
    float rr = r / rc;
    vec2 w = worley(vPos * 26.0);
    float net = 1.0 - smoothstep(0.0, 0.07, w.y - w.x);
    float heat = pow(clamp(1.0 - rr, 0.0, 1.0), 1.4);
    vec3 c = mix(vec3(0.85, 0.30, 0.07), vec3(1.0, 0.80, 0.50), heat) * (0.35 + 1.6 * heat) + vec3(1.0, 0.78, 0.45) * net * 0.35 * (0.4 + heat);
    gl_FragColor = vec4(c * uExposure, 1.0);
    return;
  }
  vec3 data = vec3(0.0);
  if (k == 1) data = textureLod(tL1, g.uv, uSectionLod).rgb;
  else if (k == 2) data = textureLod(tL2, g.uv, uSectionLod).rgb;
  else if (k == 3) data = textureLod(tL3, g.uv, uSectionLod).rgb;
  else if (k == 4) data = textureLod(tL4, g.uv, uSectionLod).rgb;
  else if (k == 5) data = textureLod(tL5, g.uv, uSectionLod).rgb;
  float r0 = uR[k + 1], r1 = uR[k];
  float h = clamp((r - r0) / (r1 - r0), 0.0, 1.0);
  base = k == 0 ? uCol[0] * (0.9 + 0.1 * sin(h * 18.0 + fbm(vPos * 20.0, 3) * 2.5)) : mix(uCol[k], data, uSection * (k == 5 ? 0.4 : 1.0));
  base *= mix(0.80, 1.06, h) * (0.95 + 0.05 * fbm(vPos * 70.0, 4));
  float mu = max(dot(uNormal, uSun), 0.0);
  vec3 coreLight = vec3(1.0, 0.55, 0.22) * uCoreLight * exp(-(r - rc) * 9.0);
  vec3 col = base * (vec3(1.0, 0.97, 0.92) * 1.45 * mu + uAmbient + coreLight) + base * uBandGlow;
  float line = 1.0 - smoothstep(px * 0.5, px * 1.6, min(r - r0, r1 - r));
  col = mix(col, vec3(0.92, 0.95, 1.0) * (0.25 + 0.6 * mu), line * 0.65);
  gl_FragColor = vec4(col * uExposure, 1.0);
}
`;
