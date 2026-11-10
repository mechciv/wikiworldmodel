import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MAX_LAYERS, vertex, surfaceFrag, layerFrag, wallFrag, coreFrag, atmoFrag, capFrag } from './shaders.js';

const q0 = new URLSearchParams(location.search);
// the last value of a repeated key wins, so a preset can be overridden by appending to it
const q = new URLSearchParams();
for (const [k, v] of q0) q.set(k, v);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const list = (k, d) => (q.has(k) ? q.get(k).split(',').map(Number) : d);

// ---- the view
const P = {
  w: num('w', 1500),
  h: num('h', 1000),
  fov: num('fov', 22),
  dist: num('dist', 6.4),
  lat: num('lat', 16),          // where the camera looks from
  lon: num('lon', 30),
  roll: num('roll', 0),
  fx: num('fx', 0.62),          // where the globe's centre sits in the frame, as a share of width and height
  fy: num('fy', 0.5),
  // the cut, relative to the camera: how far from the view direction, and toward which clock angle
  cutA: num('cutA', 18),
  cutB: num('cutB', 140),
  mode: { wedge: 1, octant: 2, slices: 3 }[q.get('mode')] ?? 0,
  slabs: list('slabs', [-1, -0.62, -0.22, 0.2, 0.6, 1]),
  gap: num('gap', 0.09),
  slabYaw: num('slabYaw', 35),
  slabPitch: num('slabPitch', 0),
  cuts2: list('cuts2', null),
  floors: list('floors', null),
  eraMode: num('eraMode', 0),
  eraBias: num('eraBias', 0),
  spineLat: num('spineLat', 90),
  spineLon: num('spineLon', 0),
  rot: num('rot', 25),
  flip: num('flip', 1),          // the wedge opens this many degrees east of the camera's longitude
  eLat: num('eLat', 20),        // and its sectors of time sit around this latitude on its centre line
  cuts: list('cuts', [46, 39, 32, 25, 18, 11, 0]),   // each layer's cut, surface first, core last
  cutL: num('cutL', 30),
  debug: num('debug', 0),
  glow: num('glow', 1.0),
  radii: list('radii', [1.0, 0.94, 0.88, 0.82, 0.76, 0.70, 0.64]),
  era: list('era', [0.40, 0.53, 0.68, 0.84, 1.03, 1.40]),
  eraSoft: num('soft', 0.006),
  seam: num('seam', 0.0),
  sunX: num('sunX', -0.75),     // the sun, in the camera's frame: right, up, toward the camera
  sunY: num('sunY', 0.35),
  sunZ: num('sunZ', 0.55),
  exposure: num('exp', 1.0),
  bloom: num('bloom', 0.3),
  relief: num('relief', 1.0),
  ageA: num('ageA', 500),
  ageB: num('ageB', 250),
  eraLon: list('eraLon', [0, 0, 0, 0, 0]),
  ambient: num('amb', 0.22),
};

const deg = Math.PI / 180;
const ll = (lat, lon) => new THREE.Vector3(Math.cos(lat * deg) * Math.cos(lon * deg), Math.sin(lat * deg), -Math.cos(lat * deg) * Math.sin(lon * deg));

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(P.w, P.h);
renderer.toneMapping = { agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping }[q.get('tm') || 'agx'];
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x000000, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(P.fov, P.w / P.h, 0.1, 100);
const dir = ll(P.lat, P.lon);
camera.position.copy(dir.clone().multiplyScalar(P.dist));
// north up, then rolled
const north = new THREE.Vector3(0, 1, 0);
const fwd = dir.clone().negate();
let up = north.clone().sub(fwd.clone().multiplyScalar(north.dot(fwd))).normalize();
const right0 = new THREE.Vector3().crossVectors(fwd, up).normalize();
up = up.clone().multiplyScalar(Math.cos(P.roll * deg)).add(right0.clone().multiplyScalar(Math.sin(P.roll * deg))).normalize();
camera.up.copy(up);
camera.lookAt(0, 0, 0);
const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
// shift the globe within the frame, as a crop of a wider picture would
{
  const fullW = P.w + 2 * Math.abs(P.fx - 0.5) * P.w;
  const fullH = P.h + 2 * Math.abs(P.fy - 0.5) * P.h;
  const offX = P.fx >= 0.5 ? 0 : fullW - P.w;
  const offY = P.fy >= 0.5 ? fullH - P.h : 0;
  camera.setViewOffset(fullW, fullH, offX, offY, P.w, P.h);
  camera.aspect = fullW / fullH;
  camera.fov = 2 * Math.atan(Math.tan((P.fov * deg) / 2) * (fullH / P.h)) / deg;
  camera.updateProjectionMatrix();
}

// the cut's axis: from the sub-camera point, tilted toward a clock angle
const toCam = dir.clone();
let axis, aU, aV;
// the sectors of time sit around an axis of their own, in clock angles as the camera sees them
let eAxis;
if (P.mode === 0) {
  const clockDir = up.clone().multiplyScalar(Math.cos(P.cutB * deg)).add(right.clone().multiplyScalar(Math.sin(P.cutB * deg)));
  axis = toCam.clone().multiplyScalar(Math.cos(P.cutA * deg)).add(clockDir.multiplyScalar(Math.sin(P.cutA * deg))).normalize();
  // a frame around it: up and right as the camera sees them
  aU = up.clone().sub(axis.clone().multiplyScalar(up.dot(axis))).normalize();
  aV = new THREE.Vector3().crossVectors(aU, axis).normalize();
  if (aV.dot(right) < 0) aV.negate();
  eAxis = axis.clone();
} else {
  // a wedge or an octant: its spine through the poles of a frame tilted from the geographic one; it opens toward lon + rot
  axis = ll(P.spineLat, P.spineLon);
  const c0 = ll(0, P.lon + P.rot);
  aV = c0.clone().sub(axis.clone().multiplyScalar(c0.dot(axis))).normalize();
  aU = new THREE.Vector3().crossVectors(axis, aV).normalize();
  if (P.flip) aU.negate(); // the steps on the west side, the flat face on the east
  const eDir = ll(P.eLat, P.lon + P.rot);
  eAxis = eDir.clone();
}
const eU = up.clone().sub(eAxis.clone().multiplyScalar(up.dot(eAxis))).normalize();
const eV = new THREE.Vector3().crossVectors(eU, eAxis).normalize();
if (eV.dot(right) < 0) eV.negate();

const sun = right.clone().multiplyScalar(P.sunX).add(up.clone().multiplyScalar(P.sunY)).add(dir.clone().multiplyScalar(P.sunZ)).normalize();

// ---- textures
const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
function load(url, srgb = true) {
  return new Promise((res, rej) =>
    loader.load(url, (t) => {
      t.flipY = false;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.anisotropy = maxAniso;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      res(t);
    }, undefined, rej),
  );
}

const romeBox = await fetch('tex/rome_overlay.json').then((r) => r.json());
const [nowAlb, nowSurf, lights, rome, albA, surfA, albB, surfB] = await Promise.all([
  load('tex/now_albedo.jpg'),
  load('tex/now_surface.png', false),
  load('tex/now_lights.png', false),
  load('tex/rome_overlay.png', false),
  load(`tex/p${P.ageA}_albedo.jpg`),
  load(`tex/p${P.ageA}_surface.png`, false),
  load(`tex/p${P.ageB}_albedo.jpg`),
  load(`tex/p${P.ageB}_surface.png`, false),
]);
rome.wrapS = THREE.ClampToEdgeWrapping;

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
const LAYERS = [
  { id: 'people', tex: q.get('tPeople') || 'tex/L_people.jpg', color: hex(q.get('cPeople') ? '#' + q.get('cPeople') : '#e2a12f') },
  { id: 'life', tex: q.get('tLife') || 'tex/L_life.jpg', color: hex(q.get('cLife') ? '#' + q.get('cLife') : '#2fb170') },
  { id: 'climate', tex: q.get('tClimate') || 'tex/L_climate.jpg', color: hex(q.get('cClimate') ? '#' + q.get('cClimate') : '#2f8fe0') },
  { id: 'terrain', tex: q.get('tTerrain') || 'tex/L_terrain.jpg', color: hex(q.get('cTerrain') ? '#' + q.get('cTerrain') : '#c4663a') },
  { id: 'plates', tex: q.get('tPlates') || 'tex/L_plates.jpg', color: hex(q.get('cPlates') ? '#' + q.get('cPlates') : '#7353c6') },
];
const NL = P.cuts.length - 1; // layers above the core, surface included; the core is layer NL
const layerTex = await Promise.all(
  LAYERS.slice(0, NL - 1).map((l) => load(l.tex).catch(() => nowAlb)),
);

// ---- the layers' names, for writing along their bands
const LABELS = (q.get('labels') || 'SURFACE,PEOPLE,LIFE,CLIMATE,TERRAIN,PLATES,SOURCES').split(',');
const font = new FontFace('Plex Mono', 'url(../../site/fonts/ibm-plex-mono-latin-500.woff2)', { weight: '500' });
await font.load();
document.fonts.add(font);
const atlas = document.createElement('canvas');
atlas.width = 2048; atlas.height = 8 * 128;
const actx = atlas.getContext('2d');
actx.fillStyle = '#fff';
actx.font = '500 92px "Plex Mono"';
actx.textBaseline = 'middle';
const labelLen = [];
for (let i = 0; i < LABELS.length; i++) {
  const t = LABELS[i].split('').join(String.fromCharCode(8202)); // hair spaces, for tracking
  actx.fillText(t, 4, i * 128 + 66);
  labelLen.push((actx.measureText(t).width + 8) / 2048);
}
const labelTex = new THREE.CanvasTexture(atlas);
labelTex.flipY = false;
labelTex.generateMipmaps = true;
labelTex.minFilter = THREE.LinearMipmapLinearFilter;
labelTex.anisotropy = maxAniso;

// ---- shared uniforms
const R = new Array(MAX_LAYERS).fill(0);
P.radii.forEach((r, i) => (R[i] = r));
R[P.radii.length] = 0;
const CUT = new Array(MAX_LAYERS).fill(P.mode === 0 ? 1 : 0);
P.cuts.forEach((c, i) => (CUT[i] = P.mode === 0 ? Math.cos(c * deg) : c * deg));
const CUT2 = new Array(MAX_LAYERS).fill(0);
(P.cuts2 || P.cuts).forEach((c, i) => (CUT2[i] = c * deg));
const FLOOR = new Array(MAX_LAYERS).fill(0);
(P.floors || []).forEach((f, i) => (FLOOR[i] = f));
const shared = {
  uSun: { value: sun },
  uCam: { value: camera.position.clone() },
  uAxis: { value: axis },
  uU: { value: aU },
  uV: { value: aV },
  uEA: { value: eAxis },
  uEU: { value: eU },
  uEV: { value: eV },
  uMode: { value: P.mode },
  uR: { value: R },
  uCut: { value: CUT },
  uN: { value: NL },
  uCutL: { value: P.cutL * deg },
  uCut2: { value: CUT2 },
  uFloor: { value: FLOOR },
  uEraMode: { value: P.eraMode },
  uEraBias: { value: P.eraBias },
  uEraTilt: { value: num('eraTilt', 0) },
  uNightIsNow: { value: num('night', 0) },
  uCamUp: { value: q.get('bandAxis') === 'geo' ? new THREE.Vector3(0, 1, 0) : up.clone() },
  uCamRight: { value: right.clone() },
  uDebug: { value: P.debug },
  uTime: { value: 0 },
  uExposure: { value: P.exposure },
  uAmbient: { value: P.ambient },
  uSectionLod: { value: num('slod', 3.0) },
  uBandGlow: { value: num('bglow', 0.12) },
  uCoreLight: { value: num('coreLight', 0.6) },
};
const mat = (frag, extra, opts = {}) =>
  new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: frag, uniforms: { ...shared, ...extra }, ...opts });

// the surface
const surface = new THREE.Mesh(
  new THREE.SphereGeometry(1, 720, 360),
  mat(surfaceFrag, {
    tNowAlb: { value: nowAlb },
    tNowSurf: { value: nowSurf },
    tLights: { value: lights },
    tRome: { value: rome },
    tAlbA: { value: albA },
    tSurfA: { value: surfA },
    tAlbB: { value: albB },
    tSurfB: { value: surfB },
    uRomeBox: { value: new THREE.Vector4(romeBox.bbox[0], romeBox.bbox[1], romeBox.bbox[2], romeBox.bbox[3]) },
    uEra: { value: P.era },
    uEraSoft: { value: P.eraSoft },
    uSeamLine: { value: P.seam },
    uRelief: { value: P.relief },
    uRomeTint: { value: num('romeTint', 0.4) },
    uRomeRoads: { value: num('romeRoads', 0.35) },
    uRomeEdge: { value: num('romeEdge', 0.6) },
    uLights: { value: num('lights', 1.6) },
    uHaze: { value: num('haze', 0.10) },
    uGlint: { value: num('glint', 0.8) },
    uMagma: { value: num('magma', 0.6) },
    uCloud: { value: num('cloud', 0.30) },
    uEraLon: { value: P.eraLon.map((d) => d * deg) },
    uSlabAxis: { value: new THREE.Vector3(1, 0, 0) },
    uSlabLo: { value: -2 },
    uSlabHi: { value: 2 },
    uEraFixed: { value: -1 },
  }),
);
if (P.mode !== 3) scene.add(surface);
else {
  // the slices: along an axis turned from the camera's right toward the camera, oldest on the left
  const S = right.clone().multiplyScalar(Math.cos(P.slabYaw * deg)).add(dir.clone().multiplyScalar(Math.sin(P.slabYaw * deg)))
    .add(up.clone().multiplyScalar(Math.sin(P.slabPitch * deg))).normalize();
  const capCols = [hex('#4a4440'), ...LAYERS.map((l) => l.color)];
  const nS = P.slabs.length - 1;
  for (let i = 0; i < nS; i++) {
    const off = S.clone().multiplyScalar((i - (nS - 1) / 2) * P.gap);
    const camObj = camera.position.clone().sub(off);
    const m = surface.material.clone();
    m.uniforms = { ...surface.material.uniforms, uCam: { value: camObj }, uSlabAxis: { value: S }, uSlabLo: { value: P.slabs[i] }, uSlabHi: { value: P.slabs[i + 1] }, uEraFixed: { value: i } };
    const mesh = new THREE.Mesh(surface.geometry, m);
    mesh.position.copy(off);
    scene.add(mesh);
    // its faces
    for (const [x, sgn] of [[P.slabs[i], -1], [P.slabs[i + 1], 1]]) {
      if (Math.abs(x) >= 0.999) continue;
      const rr = Math.sqrt(1 - x * x);
      const disc = new THREE.CircleGeometry(rr, 360);
      // orient the disc: its normal along S * sgn, centred at x * S
      const qn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), S.clone().multiplyScalar(sgn));
      disc.applyQuaternion(qn);
      disc.translate(S.x * x, S.y * x, S.z * x);
      const cm = new THREE.ShaderMaterial({
        vertexShader: vertex, fragmentShader: capFrag,
        uniforms: {
          ...shared, uCam: { value: camObj },
          tL1: { value: layerTex[0] }, tL2: { value: layerTex[1] }, tL3: { value: layerTex[2] }, tL4: { value: layerTex[3] }, tL5: { value: layerTex[4] },
          uCol: { value: capCols.map((c) => new THREE.Vector3(...c)).concat([new THREE.Vector3(1, 0.6, 0.3)]) },
          uNormal: { value: S.clone().multiplyScalar(sgn) },
          uSection: { value: num('section', 0.25) },
        },
        side: THREE.DoubleSide,
      });
      const cmesh = new THREE.Mesh(disc, cm);
      cmesh.position.copy(off);
      scene.add(cmesh);
    }
  }
}

// the layers under it
for (let k = 1; k < (P.mode === 3 ? 0 : NL); k++) {
  const l = LAYERS[k - 1];
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(P.radii[k], 512, 256),
    mat(layerFrag, {
      tLayer: { value: layerTex[k - 1] },
      uK: { value: k },
      uSelf: { value: 0.9 },
      uTint: { value: new THREE.Vector3(...l.color) },
    }),
  );
  scene.add(m);
}

// the walls: layer k's edge, at its cut, from the top of the layer below to its own top
function wallGeometry(k) {
  const r0 = k + 1 < P.radii.length ? P.radii[k + 1] : 0, r1 = P.radii[k];
  const pos = [];
  const idx = [];
  const T = 10;
  if (P.mode === 0) {
    const th = P.cuts[k] * deg;
    if (th <= 0) return null;
    const S = 720;
    for (let i = 0; i <= S; i++) {
      const ph = (i / S) * Math.PI * 2;
      const d = axis.clone().multiplyScalar(Math.cos(th))
        .add(aU.clone().multiplyScalar(Math.sin(th) * Math.cos(ph)))
        .add(aV.clone().multiplyScalar(Math.sin(th) * Math.sin(ph)));
      for (let j = 0; j <= T; j++) {
        const r = r0 + ((r1 - r0) * j) / T;
        pos.push(d.x * r, d.y * r, d.z * r);
      }
    }
    for (let i = 0; i < S; i++) for (let j = 0; j < T; j++) {
      const a = i * (T + 1) + j, b = a + T + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  } else {
    // half-annuli in the planes through the spine: the flat face at -cutL, the step at +cut[k]
    for (const ang of [-P.cutL * deg, P.cuts[k] * deg]) {
      const base = pos.length / 3;
      const side = aV.clone().multiplyScalar(Math.cos(ang)).add(aU.clone().multiplyScalar(Math.sin(ang)));
      const S = 360;
      for (let i = 0; i <= S; i++) {
        const be = -Math.PI / 2 + (i / S) * Math.PI;
        const d = axis.clone().multiplyScalar(Math.sin(be)).add(side.clone().multiplyScalar(Math.cos(be)));
        for (let j = 0; j <= T; j++) {
          const r = r0 + ((r1 - r0) * j) / T;
          pos.push(d.x * r, d.y * r, d.z * r);
        }
      }
      for (let i = 0; i < S; i++) for (let j = 0; j < T; j++) {
        const a = base + i * (T + 1) + j, b = a + T + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// a band's name: how tall, where along the arc, and how long, in the units of the globe
function labelUniforms(k) {
  const rTop = P.radii[k], rBot = k + 1 < P.radii.length ? P.radii[k + 1] : 0;
  const thick = k === NL ? rTop * 0.32 : rTop - rBot;
  const hFrac = num('labelH', 0.42);
  const textH = hFrac * thick;
  // the atlas cell is 128 px tall and the text 92 px: scale the length to match
  const lenWorld = labelLen[k] * 2048 / 128 * textH;
  return {
    tLabel: { value: labelTex },
    uLabel: { value: num('label', 1) * (k === 0 ? 0 : 1) },
    uLabelH: { value: hFrac },
    uLabelBeta: { value: num('labelBeta', 45) * deg },
    uLabelLen: { value: lenWorld },
    uLabelU: { value: labelLen[k] },
    uLabelSign: { value: num('labelSign', 1) },
    uLabelFace: { value: num('labelFace', 1) },
  };
}

// octant walls for layer k: its floor, and its two sides, each a mesh of its own
function octantWalls(k) {
  const r0 = k + 1 < P.radii.length ? P.radii[k + 1] : 0, r1 = P.radii[k];
  const f = FLOOR[k];
  const A1 = CUT[k], A2 = -CUT2[k];
  const dirA = (a) => aV.clone().multiplyScalar(Math.cos(a)).add(aU.clone().multiplyScalar(Math.sin(a)));
  const out = [];
  const grid = (S, T, fn) => {
    const pos = [], idx = [];
    for (let i = 0; i <= S; i++) for (let j = 0; j <= T; j++) { const p = fn(i / S, j / T); pos.push(p.x, p.y, p.z); }
    for (let i = 0; i < S; i++) for (let j = 0; j < T; j++) { const a = i * (T + 1) + j, b = a + T + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  };
  // the floor
  if (f < r1) {
    const rho0 = Math.sqrt(Math.max(r0 * r0 - f * f, 0)), rho1 = Math.sqrt(Math.max(r1 * r1 - f * f, 0));
    out.push([0, grid(240, 12, (u, v) => dirA(A2 + (A1 - A2) * u).multiplyScalar(rho0 + (rho1 - rho0) * v).add(axis.clone().multiplyScalar(f)))]);
  }
  // the sides
  for (const [face, A] of [[1, A1], [2, A2]]) {
    out.push([face, grid(240, 12, (u, v) => {
      const r = r0 + (r1 - r0) * v;
      const b0 = Math.asin(Math.max(-1, Math.min(1, f / Math.max(r, 1e-4))));
      const be = b0 + (Math.PI / 2 - b0) * u;
      return axis.clone().multiplyScalar(Math.sin(be) * r).add(dirA(A).multiplyScalar(Math.cos(be) * r));
    })]);
  }
  return out;
}
const WALL_COLORS = [hex('#4a4440'), ...LAYERS.map((l) => l.color), [1.0, 0.6, 0.3]];
for (let k = 0; k <= (P.mode === 3 ? -1 : NL); k++) {
  if (P.mode === 2) {
    for (const [face, geo] of octantWalls(k)) {
      scene.add(new THREE.Mesh(geo, k < NL
        ? mat(wallFrag, {
            uK: { value: k },
            uFace: { value: face },
            uColor: { value: new THREE.Vector3(...WALL_COLORS[k]) },
            tLayer: { value: k > 0 ? layerTex[k - 1] : nowAlb },
            uSection: { value: num('section', 0.55) },
            uSectionK: { value: k === 5 ? 0.4 : 1.0 },
            ...labelUniforms(k),
          }, { side: THREE.DoubleSide })
        : mat(coreFrag, { uK: { value: NL }, uGlow: { value: P.glow }, uWall: { value: 1 }, uFace: { value: face }, ...labelUniforms(NL) }, { side: THREE.DoubleSide })));
    }
    continue;
  }
  const geo = wallGeometry(k);
  if (!geo) continue;
  const m = new THREE.Mesh(
    geo,
    k < NL
      ? mat(wallFrag, {
          uK: { value: k },
          uColor: { value: new THREE.Vector3(...WALL_COLORS[k]) },
          tLayer: { value: k > 0 ? layerTex[k - 1] : nowAlb },
          uSection: { value: num('section', 0.55) },
          uSectionK: { value: k === 5 ? 0.4 : 1.0 },
          uFace: { value: 1 },
        }, { side: THREE.DoubleSide })
      : mat(coreFrag, { uK: { value: NL }, uGlow: { value: P.glow }, uWall: { value: 1 } }, { side: THREE.DoubleSide }),
  );
  scene.add(m);
}

// the core
const core = new THREE.Mesh(new THREE.SphereGeometry(P.radii[NL], 256, 128), mat(coreFrag, { uK: { value: NL }, uGlow: { value: P.glow }, uWall: { value: 0 } }));
if (P.mode !== 3) scene.add(core);

// the air
const atmo = new THREE.Mesh(
  new THREE.SphereGeometry(1.07, 256, 128),
  mat(atmoFrag, { uEra: { value: P.era } }, { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
);
if (P.mode !== 3) scene.add(atmo);

// ---- render
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(P.w, P.h, { type: THREE.HalfFloatType, samples: 4 }));
composer.setPixelRatio(1);
composer.setSize(P.w, P.h);
composer.addPass(new RenderPass(scene, camera));
if (P.bloom > 0) composer.addPass(new UnrealBloomPass(new THREE.Vector2(P.w, P.h), P.bloom, 0.45, num('thr', 1.1)));
composer.addPass(new OutputPass());

composer.render();
await new Promise((r) => requestAnimationFrame(r));
composer.render();

// ---- where to hang labels: points on the picture, as shares of its width and height
{
  const toScreen = (v) => {
    const p = v.clone().project(camera);
    return [+(((p.x + 1) / 2)).toFixed(4), +((1 - (p.y + 1) / 2)).toFixed(4)];
  };
  const visible = (v) => v.clone().normalize().dot(camera.position.clone().normalize()) > 0.2;
  const eras = [];
  const bands = (q.get('labelLats') || '-38,-10,14,40').split(',').map(Number);
  for (const lat of bands) {
    let best = null;
    for (let lon = -180; lon < 180; lon += 0.5) {
      const v = ll(lat, lon);
      if (!visible(v)) continue;
      const s = toScreen(v);
      if (!best || s[0] < best[0]) best = s;
    }
    eras.push({ lat, at: best });
  }
  // today: on the night side
  const night = [];
  for (let lat = -60; lat <= 60; lat += 2) for (let lon = -180; lon < 180; lon += 2) {
    const v = ll(lat, lon);
    if (visible(v) && v.dot(sun) < -0.15) night.push(toScreen(v));
  }
  night.sort((a, b) => b[0] - a[0]);
  const layers = [];
  if (P.mode === 2) {
    const A = CUT[0];
    const dirA = aV.clone().multiplyScalar(Math.cos(A)).add(aU.clone().multiplyScalar(Math.sin(A)));
    const beta = num('labelBeta', 62) * deg;
    for (let k = 0; k <= NL; k++) {
      const r1 = P.radii[k], r0 = k + 1 < P.radii.length ? P.radii[k + 1] : 0;
      const r = k === NL ? r1 * 0.5 : (r0 + r1) / 2;
      const v = axis.clone().multiplyScalar(Math.sin(beta) * r).add(dirA.clone().multiplyScalar(Math.cos(beta) * r));
      layers.push({ k, at: toScreen(v) });
    }
  }
  window.__anchors = { eras, today: night[Math.floor(night.length * 0.1)] || null, layers, globe: { centre: toScreen(new THREE.Vector3()), radius: toScreen(up.clone().multiplyScalar(1))[1] } };
}
window.__ready = true;
console.log('rendered');
