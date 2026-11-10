// The hero as a toy: the Earth seen from above its north pole, cut like a pie into six eras, each
// era into moments, each moment on its own map with small models standing on it. A caricature, not
// a sourced picture: see pie/README.md for what is drawn from data and what is made up.
// Everything about the picture is a URL parameter (see P).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry } from './pie/kit.js';

const q0 = new URLSearchParams(location.search);
const q = new URLSearchParams();
for (const [k, v] of q0) q.set(k, v);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const str = (k, d) => (q.has(k) ? q.get(k) : d);
const list = (k, d) => (q.has(k) ? q.get(k).split(',').map(Number) : d);

const P = {
  w: num('w', 1500), h: num('h', 1000),
  fov: num('fov', 20),
  R: num('R', 0.58),                  // the globe's radius on screen, as a share of half the height
  camLat: num('camLat', 66), camAz: num('camAz', 0),
  fx: num('fx', 0.6), fy: num('fy', 0.51),
  start: num('start', 0),             // degrees clockwise from 12 o'clock where time begins
  upright: num('upright', 0.8),       // 0: models stand out from the centre; 1: toward the top of the screen
  // detail 2 draws every moment, model and scatter entry; detail 1 leaves out those marked d: 2 and
  // draws the rest fewer and bigger
  detail: num('detail', 1),
  size: num('size', 1.55),               // every model's size is multiplied by this
};
Object.assign(P, {
  density: num('density', P.detail < 2 ? 0.25 : 2.4),       // scatter counts are multiplied by this
  heroSize: num('heroSize', P.detail < 2 ? 2.8 : 1),        // and hero models' sizes by this
  scatterSize: num('scatterSize', P.detail < 2 ? 2.2 : 1),  // and scatter models' by this
  skySize: num('skySize', P.detail < 2 ? 1.4 : 1),          // and things in the sky (the Moon, the ISS) by this
  fit: num('fit', 0.7),                 // a hero model spans at most this share of its moment's width
  overlap: num('overlap', 0.3),         // and covers at most this share of another hero on screen, where it can move
  pop: num('pop', 0.5),                 // the globe draws this far behind the models, so models stood up for the camera never sink into it
  drop: str('drop', P.detail < 2 ? 'snowball,pangaea,neolithic' : '').split(',').filter(Boolean),   // moments left out
});
Object.assign(P, {
  sun: list('sun', [-0.62, 0.62, 0.5]), // in the camera's frame: right, up, toward
  exp: num('exp', 1.0), bloom: num('bloom', 0.22), ao: num('ao', 1),
  bg: str('bg', 'dusk'),
  labels: num('labels', 1), bezel: num('bezel', 1),
  seam: num('seam', 1),
  normal: num('normal', 1.0),
  atmo: num('atmo', 1),
  seed: num('seed', 1),
  shadow: num('shadow', 8192),
  only: str('only', ''),
  heroIn: num('heroIn', 0.16),        // hero models start this far in from the rim (0..1 of the way to the pole)
  sat: num('sat', 1.2), gamma: num('gamma', 0.88), gain: num('gain', 1.08),   // the maps' colour
});

const BG = {
  dusk: { top: '#2b2450', bottom: '#0f0d22', ink: '#f3ead6', line: 'rgba(243,234,214,0.45)', stars: 1 },
  space: { top: '#0b1222', bottom: '#03050b', ink: '#f3ead6', line: 'rgba(243,234,214,0.4)', stars: 1 },
  paper: { top: '#f4eee2', bottom: '#e3d8c4', ink: '#2a2420', line: 'rgba(42,36,32,0.4)', stars: 0 },
  night: { top: '#162033', bottom: '#070a12', ink: '#f3ead6', line: 'rgba(243,234,214,0.4)', stars: 1 },
}[P.bg] || {};

const deg = Math.PI / 180;
// three's sphere: azimuth phi from -x toward +z, polar angle theta from +y
const dirOf = (phi, theta) => new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
const dirLL = (lat, phi) => dirOf(phi, (90 - lat) * deg);

// ---- renderer, camera
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance', alpha: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(P.w, P.h);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = P.exp;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(0x000000, 0);
stage.prepend(renderer.domElement);
stage.style.width = P.w + 'px';
stage.style.height = P.h + 'px';
document.body.style.background = `linear-gradient(${BG.top}, ${BG.bottom})`;
document.documentElement.style.setProperty('--ink', BG.ink);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(P.fov, P.w / P.h, 0.1, 100);
const tanA = P.R * Math.tan((P.fov / 2) * deg);
const dist = 1 / Math.sin(Math.atan(tanA));
const camPhi = (180 + P.camAz) * deg;
const camDir = dirLL(P.camLat, camPhi);
camera.position.copy(camDir.clone().multiplyScalar(dist));
camera.up.set(0, 1, 0);
camera.lookAt(0, 0, 0);
camera.setViewOffset(P.w, P.h, (0.5 - P.fx) * P.w, (0.5 - P.fy) * P.h, P.w, P.h);
camera.updateMatrixWorld();
const camRight = new THREE.Vector3().crossVectors(camDir.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
const camUp = new THREE.Vector3().crossVectors(camRight, camDir.clone().negate()).normalize();

function project(v) {
  const p = v.clone().project(camera);
  return [(p.x + 1) / 2 * P.w, (1 - p.y) / 2 * P.h];
}

// ---- stars
if (BG.stars) {
  const n = 1800, pos = new Float32Array(n * 3), r = mulberry(5);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(50);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xc8cfe6, size: 0.07, transparent: true, opacity: 0.7 })));
}

// ---- light
const sunDir = new THREE.Vector3().addScaledVector(camRight, P.sun[0]).addScaledVector(camUp, P.sun[1]).addScaledVector(camDir, P.sun[2]).normalize();
{
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.3);
  sun.position.copy(sunDir.clone().multiplyScalar(6));
  sun.castShadow = true;
  const sz = Math.min(P.shadow, renderer.capabilities.maxTextureSize);
  sun.shadow.mapSize.set(sz, sz);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -1.45; sc.right = sc.top = 1.45; sc.near = 3; sc.far = 9;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.0015;
  sun.shadow.radius = 2;
  sun.shadow.intensity = num('shade', 0.6);   // shadows a little lighter than black, as under a bright sky
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xc4d6ff, 0x4a3a30, 1.25));
  const fill = new THREE.DirectionalLight(0x9db4ff, 0.5);
  fill.position.copy(sunDir.clone().negate().add(camDir.clone().multiplyScalar(1.5)).multiplyScalar(5));
  scene.add(fill);
}

// ---- the eras: each slice of the pie has moments; each moment a map, models and scatter.
// u runs across a moment, clockwise; v from the visible rim (0) to the pole (1).
// A model is [module.name, u, v, height, options]; heights are in Earth radii.
// d: 2 marks a moment, a model or a scatter entry drawn only at full detail (P.detail 2).
const SLICES = [
  {
    title: 'Early Earth', subs: [
      {
        key: 'magma', date: '4.5 Ga', name: 'Magma ocean', map: { albedo: 'toy_magma.jpg', normal: 'pie_magma_normal.jpg', mask: 'pie_magma_mask.png', glow: 0.55 }, lon: 0, w: 1,
        hero: [['early.volcano', 0.45, 0.22, 0.085], ['early.smokePlume', 0.4, 0.12, 0.065, { near: 1 }], ['early.volcano', 0.68, 0.46, 0.06, { d: 2 }], ['early.shieldVolcano', 0.55, 0.16, 0.08, { flatW: 1, d: 2 }],
          ['early.lavaPool', 0.5, 0.32, 0.06, { flat: 1 }], ['early.crater', 0.25, 0.62, 0.05, { flat: 1, d: 2 }], ['early.impactor', 0.6, 0.55, 0.075, { lift: 0.14 }],
          ['early.impactor', 0.82, 0.78, 0.045, { lift: 0.22, d: 2 }], ['early.moon', 0.95, -0.25, 0.12, { lift: 0.36, any: 1 }]],
        scatter: [{ p: ['early.volcano'], n: 16, h: [0.018, 0.032] }, { p: ['early.crater'], n: 14, h: [0.02, 0.035], flat: 1, d: 2 },
          { p: ['early.lavaPool'], n: 10, h: [0.015, 0.03], flat: 1 }, { p: ['early.steam'], n: 12, h: [0.012, 0.02], d: 2 }],
      },
      {
        key: 'archean', date: '4.0 Ga', name: 'First oceans', map: { albedo: 'pie_archean_albedo.jpg', normal: 'pie_archean_normal.jpg', mask: 'pie_archean_mask.png' }, lon: 40, w: 1,
        hero: [['early.volcanicIsland', 0.4, 0.28, 0.1, { on: 'any', flatW: 1 }], ['early.volcanicIsland', 0.72, 0.52, 0.075, { on: 'any', flatW: 1 }], ['early.impactor', 0.25, 0.62, 0.05, { lift: 0.16, d: 2 }],
          ['early.steam', 0.42, 0.4, 0.04, { d: 2 }], ['early.blackSmoker', 0.6, 0.22, 0.045, { on: 'water', d: 2 }]],
        scatter: [{ p: ['early.wave'], n: 32, h: [0.014, 0.02], on: 'water', fitW: 1 }, { p: ['early.volcanicIsland'], n: 8, h: [0.03, 0.045], on: 'land', fitW: 1 },
          { p: ['early.steam'], n: 10, h: [0.01, 0.018], d: 2 }, { p: ['early.volcano'], n: 6, h: [0.016, 0.026], on: 'land', d: 2 }],
      },
    ],
  },
  {
    title: 'Early life', subs: [
      {
        key: 'stromatolites', date: '3.5 Ga', name: 'Stromatolites', map: { albedo: 'pie_archean_albedo.jpg', normal: 'pie_archean_normal.jpg', mask: 'pie_archean_mask.png' }, lon: 150, w: 0.85,
        hero: [['early.stromatolite', 0.45, 0.25, 0.08, { on: 'any', flatW: 1 }], ['early.blackSmoker', 0.6, 0.55, 0.05, { on: 'water', d: 2 }], ['early.stromatolite', 0.3, 0.45, 0.055, { on: 'any', flatW: 1 }]],
        scatter: [{ p: ['early.stromatolite'], n: 30, h: [0.022, 0.038], on: 'any', fitW: 1 }, { p: ['early.wave'], n: 30, h: [0.014, 0.02], on: 'water', fitW: 1 }],
      },
      {
        key: 'snowball', date: '650 Ma', name: 'Snowball Earth', map: { albedo: 'pie_snowball_albedo.jpg', normal: 'pie_snowball_normal.jpg', mask: 'pie_snowball_mask.png' }, lon: 160, w: 0.95,
        hero: [['early.iceRidge', 0.5, 0.25, 0.09, { on: 'any', flatW: 1 }], ['early.iceberg', 0.3, 0.45, 0.06, { on: 'any', flatW: 1 }], ['early.volcano', 0.72, 0.42, 0.055, { on: 'any' }],
          ['early.smokePlume', 0.73, 0.5, 0.06, { on: 'any' }]],
        scatter: [{ p: ['early.iceberg'], n: 26, h: [0.02, 0.035], on: 'any', fitW: 1 }, { p: ['early.iceRidge'], n: 14, h: [0.03, 0.045], on: 'any', fitW: 1 }],
      },
      {
        key: 'cambrian', date: '520 Ma', name: 'Cambrian seas', map: { albedo: 'p500_albedo.jpg', normal: 'pie_p500_normal.jpg', mask: 'pie_p500_mask.png' }, lon: 160, w: 1.2,
        hero: [['early.trilobite', 0.42, 0.24, 0.08, { on: 'water', flatW: 1 }], ['early.anomalocaris', 0.7, 0.42, 0.075, { on: 'water', lift: 0.012, flatW: 1 }], ['early.opabinia', 0.22, 0.48, 0.055, { on: 'water', lift: 0.008, flatW: 1, d: 2 }],
          ['early.hallucigenia', 0.55, 0.58, 0.045, { on: 'water', flatW: 1, d: 2 }], ['early.jellyfish', 0.82, 0.22, 0.045, { on: 'water', lift: 0.03 }], ['early.charnia', 0.3, 0.3, 0.045, { on: 'water', d: 2 }]],
        scatter: [{ p: ['early.sponge'], n: 30, h: [0.01, 0.018], on: 'water' }, { p: ['early.algae'], n: 30, h: [0.01, 0.018], on: 'water', d: 2 },
          { p: ['early.trilobite'], n: 16, h: [0.02, 0.028], on: 'water', fitW: 1 }, { p: ['early.jellyfish'], n: 8, h: [0.012, 0.02], on: 'water', lift: 0.02 },
          { p: ['early.dickinsonia'], n: 10, h: [0.012, 0.02], on: 'water', flat: 1, d: 2 }, { p: ['early.charnia'], n: 12, h: [0.012, 0.02], on: 'water', d: 2 }],
      },
    ],
  },
  {
    title: 'Age of reptiles', subs: [
      {
        key: 'pangaea', date: '300–250 Ma', name: 'Pangaea', map: { albedo: 'p250_albedo.jpg', normal: 'pie_p250_normal.jpg', mask: 'pie_p250_mask.png' }, lon: 10, w: 1,
        hero: [['reptiles.dimetrodon', 0.5, 0.25, 0.055], ['reptiles.lepidodendron', 0.72, 0.28, 0.08], ['reptiles.meganeura', 0.32, 0.45, 0.05, { lift: 0.05, any: 1, flatW: 1 }]],
        scatter: [{ p: ['reptiles.lepidodendron'], n: 40, h: [0.02, 0.034] }, { p: ['reptiles.calamites'], n: 30, h: [0.016, 0.026] },
          { p: ['reptiles.treeFern'], n: 30, h: [0.014, 0.022], d: 2 }, { p: ['reptiles.fernClump'], n: 40, h: [0.007, 0.011], d: 2 },
          { p: ['reptiles.meganeura'], n: 4, h: [0.022, 0.03], on: 'any', lift: 0.04, fitW: 1, d: 2 }],
      },
      {
        key: 'jurassic', date: '150 Ma', name: 'Jurassic giants', map: { albedo: 'p150_albedo.jpg', normal: 'pie_p150_normal.jpg', mask: 'pie_p150_mask.png' }, lon: 5, w: 1,
        hero: [['reptiles.brachiosaurus', 0.42, 0.26, 0.11], ['reptiles.stegosaurus', 0.72, 0.3, 0.055], ['reptiles.allosaurus', 0.22, 0.44, 0.06, { d: 2 }],
          ['reptiles.diplodocus', 0.6, 0.55, 0.06, { d: 2 }], ['reptiles.nest', 0.33, 0.24, 0.018, { d: 2 }], ['reptiles.plesiosaur', 0.5, 0.75, 0.04, { on: 'water', d: 2 }]],
        scatter: [{ p: ['reptiles.araucaria'], n: 40, h: [0.02, 0.032] }, { p: ['reptiles.cycad'], n: 40, h: [0.01, 0.016] },
          { p: ['reptiles.treeFern'], n: 20, h: [0.014, 0.02], d: 2 }, { p: ['reptiles.fernClump'], n: 40, h: [0.007, 0.011], d: 2 },
          { p: ['reptiles.plesiosaur'], n: 3, h: [0.018, 0.024], on: 'water' }],
      },
      {
        key: 'cretaceous', date: '66 Ma', name: 'Last dinosaurs', map: { albedo: 'p100_albedo.jpg', normal: 'pie_p100_normal.jpg', mask: 'pie_p100_mask.png' }, lon: -40, w: 1,
        hero: [['reptiles.trex', 0.36, 0.26, 0.085], ['reptiles.triceratops', 0.58, 0.3, 0.055], ['reptiles.parasaurolophus', 0.25, 0.52, 0.055, { d: 2 }],
          ['reptiles.ankylosaurus', 0.6, 0.55, 0.04, { d: 2 }], ['reptiles.pteranodon', 0.5, 0.7, 0.085, { lift: 0.07, any: 1, flatW: 1 }], ['early.impactor', 0.85, 0.62, 0.065, { lift: 0.2 }]],
        scatter: [{ p: ['reptiles.magnolia'], n: 30, h: [0.016, 0.024] }, { p: ['reptiles.araucaria'], n: 25, h: [0.02, 0.03], d: 2 },
          { p: ['reptiles.cycad'], n: 20, h: [0.01, 0.016] }, { p: ['reptiles.fernClump'], n: 30, h: [0.007, 0.011], d: 2 },
          { p: ['reptiles.pteranodon'], n: 3, h: [0.03, 0.04], on: 'any', lift: 0.05, fitW: 1, d: 2 }, { p: ['reptiles.triceratops'], n: 5, h: [0.025, 0.03] }],
      },
    ],
  },
  {
    title: 'Age of mammals', subs: [
      {
        key: 'savanna', date: '3 Ma', name: 'First hominins', map: { albedo: 'now_albedo.jpg', normal: 'pie_now_normal.jpg', mask: 'pie_now_mask.png' }, lon: 34, w: 1,
        hero: [['mammals.elephant', 0.35, 0.2, 0.065], ['mammals.giraffe', 0.65, 0.22, 0.08], ['mammals.australopithecus', 0.5, 0.36, 0.032], ['mammals.lion', 0.75, 0.42, 0.032, { d: 2 }],
          ['mammals.acacia', 0.22, 0.38, 0.05]],
        scatter: [{ p: ['mammals.acacia'], n: 34, h: [0.014, 0.022] }, { p: ['mammals.savannaGrass'], n: 160, h: [0.006, 0.01], d: 2 },
          { p: ['mammals.elephant'], n: 6, h: [0.022, 0.03] }, { p: ['mammals.giraffe'], n: 6, h: [0.026, 0.034] }, { p: ['mammals.boulder'], n: 10, h: [0.006, 0.01], d: 2 },
          { p: ['mammals.birds'], n: 2, h: [0.02, 0.03], on: 'any', lift: 0.06, d: 2 }],
      },
      {
        key: 'iceage', date: '20 ka', name: 'Ice Age', map: { albedo: 'pie_iceage_albedo.jpg', normal: 'pie_iceage_normal.jpg', mask: 'pie_iceage_mask.png' }, lon: 22, w: 1,
        hero: [['mammals.mammoth', 0.4, 0.22, 0.075], ['mammals.woollyRhino', 0.66, 0.26, 0.045, { d: 2 }], ['mammals.smilodon', 0.2, 0.5, 0.03, { on: 'noice' }], ['mammals.megaloceros', 0.76, 0.44, 0.05, { d: 2 }],
          ['mammals.hunters', 0.6, 0.3, 0.024], ['mammals.campfire', 0.66, 0.34, 0.012], ['mammals.hideTent', 0.7, 0.42, 0.02, { d: 2 }]],
        scatter: [{ p: ['mammals.snowPine'], n: 70, h: [0.016, 0.026], on: 'noice' }, { p: ['mammals.mammoth'], n: 7, h: [0.02, 0.028], on: 'noice' },
          { p: ['mammals.boulder'], n: 10, h: [0.006, 0.01], d: 2 }, { p: ['early.iceRidge'], n: 14, h: [0.03, 0.045], on: 'ice', fitW: 1 }, { p: ['early.iceberg'], n: 8, h: [0.018, 0.03], on: 'water', fitW: 1 }],
      },
    ],
  },
  {
    title: 'First civilizations', subs: [
      {
        key: 'neolithic', date: '9000 BCE', name: 'First farmers', map: { albedo: 'now_albedo.jpg', normal: 'pie_now_normal.jpg', mask: 'pie_now_mask.png' }, lon: 30, w: 0.9,
        hero: [['civ.tPillars', 0.5, 0.32, 0.07, { flatW: 1 }], ['civ.stoneCircle', 0.28, 0.5, 0.07, { flatW: 1 }], ['civ.longhouse', 0.7, 0.4, 0.05, { flatW: 1 }]],
        scatter: [{ p: ['civ.roundHut'], n: 30, h: [0.01, 0.014], clump: 4 }, { p: ['civ.wheatField'], n: 30, h: [0.022, 0.034], flat: 1, clump: 4 },
          { p: ['civ.cattle'], n: 20, h: [0.007, 0.009] }, { p: ['civ.sheep'], n: 20, h: [0.005, 0.007], d: 2 }, { p: ['civ.farmer'], n: 14, h: [0.008, 0.01], d: 2 },
          { p: ['mammals.oak'], n: 30, h: [0.014, 0.022] }],
      },
      {
        key: 'egypt', date: '2500 BCE', name: 'Pyramids & ziggurats', map: { albedo: 'now_albedo.jpg', normal: 'pie_now_normal.jpg', mask: 'pie_now_mask.png' }, lon: 36, w: 1,
        hero: [['civ.pyramid', 0.4, 0.4, 0.075], ['civ.pyramid', 0.55, 0.48, 0.055], ['civ.pyramid', 0.35, 0.32, 0.035, { d: 2 }], ['civ.sphinx', 0.3, 0.3, 0.045, { flatW: 1 }],
          ['civ.obelisk', 0.55, 0.22, 0.04, { d: 2 }], ['civ.ziggurat', 0.7, 0.62, 0.085, { flatW: 1 }], ['civ.stepPyramid', 0.6, 0.5, 0.035, { d: 2 }]],
        scatter: [{ p: ['civ.mudbrickHouse'], n: 40, h: [0.007, 0.011], clump: 4 }, { p: ['civ.datePalm'], n: 40, h: [0.014, 0.022] },
          { p: ['civ.wheatField'], n: 14, h: [0.02, 0.03], flat: 1, clump: 3 }],
      },
      {
        key: 'rome', date: '120 CE', name: 'Rome', map: { albedo: 'now_albedo.jpg', normal: 'pie_now_normal.jpg', mask: 'pie_now_mask.png', people: 0.16 }, lon: 13, w: 1.1,
        hero: [['civ.colosseum', 0.45, 0.26, 0.095, { flatW: 1 }], ['civ.romanTemple', 0.62, 0.24, 0.06, { flatW: 1, d: 2 }], ['civ.aqueduct', 0.3, 0.5, 0.085, { flatW: 1 }], ['civ.legion', 0.55, 0.42, 0.045, { flatW: 1, d: 2 }],
          ['civ.romanGalley', 0.72, 0.5, 0.065, { on: 'water', flatW: 1 }]],
        scatter: [{ p: ['civ.insula'], n: 40, h: [0.01, 0.016], clump: 3 }, { p: ['civ.domus'], n: 30, h: [0.008, 0.012], clump: 3, d: 2 },
          { p: ['civ.cypress'], n: 50, h: [0.014, 0.022] }, { p: ['civ.romanRoad'], n: 8, h: [0.04, 0.06], flat: 1, d: 2 },
          { p: ['civ.romanGalley'], n: 6, h: [0.028, 0.038], on: 'water', fitW: 1 }, { p: ['civ.wheatField'], n: 14, h: [0.02, 0.03], flat: 1, clump: 3, d: 2 }],
      },
    ],
  },
  {
    title: 'Modern world', subs: [
      {
        key: 'industry', date: '1850', name: 'Industry', map: { albedo: 'now_albedo.jpg', normal: 'pie_now_normal.jpg', mask: 'pie_now_mask.png' }, lon: -2, w: 0.9,
        hero: [['modern.factory', 0.45, 0.26, 0.05], ['modern.steamTrain', 0.62, 0.38, 0.07, { flatW: 1 }], ['modern.steamship', 0.25, 0.3, 0.05, { on: 'water', flatW: 1 }]],
        scatter: [{ p: ['modern.terraceHouses'], n: 40, h: [0.01, 0.014], clump: 3 }, { p: ['modern.chimney'], n: 15, h: [0.018, 0.026], clump: 3 },
          { p: ['modern.railTrack'], n: 6, h: [0.04, 0.06], flat: 1, d: 2 }, { p: ['modern.steamship'], n: 6, h: [0.022, 0.03], on: 'water', fitW: 1 },
          { p: ['mammals.oak'], n: 30, h: [0.014, 0.02] }, { p: ['civ.wheatField'], n: 20, h: [0.02, 0.03], flat: 1, clump: 3, d: 2 }],
      },
      {
        key: 'today', date: 'Today', name: 'The modern world', map: { albedo: 'now_albedo.jpg', normal: 'pie_now_normal.jpg', mask: 'pie_now_mask.png', lights: 0.7 }, lon: 122, w: 1.3,
        hero: [['modern.landmarkTower', 0.32, 0.24, 0.075], ['modern.bridge', 0.6, 0.2, 0.045, { flatW: 1, d: 2 }], ['modern.stadium', 0.3, 0.3, 0.055, { flatW: 1, d: 2 }],
          ['modern.rocketLaunch', 0.62, 0.3, 0.07], ['modern.iss', 0.45, 0.75, 0.09, { lift: 0.16, any: 1, flatW: 1 }], ['modern.satellite', 0.3, 0.75, 0.045, { lift: 0.13, any: 1, flatW: 1, d: 2 }],
          ['modern.airliner', 0.25, 0.5, 0.05, { lift: 0.07, any: 1, flatW: 1 }], ['modern.containerShip', 0.18, 0.18, 0.06, { on: 'water', flatW: 1, d: 2 }]],
        scatter: [{ p: ['modern.skyscraper'], n: 120, h: [0.016, 0.05], clump: 3, spread: 0.6 }, { p: ['modern.apartmentBlock'], n: 50, h: [0.01, 0.016], clump: 4, d: 2 },
          { p: ['modern.house'], n: 60, h: [0.007, 0.01], clump: 5, d: 2 }, { p: ['modern.windTurbine'], n: 20, h: [0.02, 0.028] },
          { p: ['modern.solarArray'], n: 10, h: [0.025, 0.035], flat: 1, d: 2 }, { p: ['modern.highway'], n: 8, h: [0.05, 0.07], flat: 1, d: 2 },
          { p: ['modern.containerShip'], n: 8, h: [0.025, 0.035], on: 'water', fitW: 1 }, { p: ['modern.airliner'], n: 2, h: [0.025, 0.03], on: 'any', lift: 0.06, fitW: 1, d: 2 },
          { p: ['modern.satellite'], n: 3, h: [0.025, 0.03], on: 'any', lift: 0.12, fitW: 1, d: 2 }],
      },
    ],
  },
];

// which models live on water, on ice, or anywhere; everything else lives on land
const ON = {
  water: ['early.wave', 'early.blackSmoker', 'early.trilobite', 'early.anomalocaris', 'early.opabinia', 'early.hallucigenia', 'early.jellyfish', 'early.sponge', 'early.algae',
    'early.dickinsonia', 'early.charnia', 'reptiles.plesiosaur', 'civ.romanGalley', 'modern.steamship', 'modern.containerShip'],
  any: ['early.impactor', 'early.moon', 'early.steam', 'early.smokePlume', 'early.crater', 'early.lavaPool', 'early.volcano', 'early.shieldVolcano', 'early.iceberg', 'early.iceRidge',
    'early.stromatolite', 'mammals.cloud', 'mammals.birds', 'reptiles.meganeura', 'reptiles.pteranodon', 'modern.airliner', 'modern.satellite', 'modern.iss'],
};
const onOf = (name) => (ON.water.includes(name) ? 'water' : ON.any.includes(name) ? 'any' : 'land');
// models that lie on the ground are fitted by their width
const FLATW = new Set();

// ---- the props' modules; a missing module or model draws a marker, so the scene renders without it
const LIBS = {};
const FLAT = new Set();
for (const m of ['early', 'reptiles', 'mammals', 'civ', 'modern']) {
  try {
    const mod = await import(`./pie/props-${m}.js`);
    LIBS[m] = mod.default;
    for (const f of mod.flat || []) FLAT.add(`${m}.${f}`);
  } catch (e) {
    console.warn(`no module ${m}: ${e.message}`);
    LIBS[m] = {};
  }
}
const missing = new Set();
function make(name, seed) {
  const [m, f] = name.split('.');
  const fn = LIBS[m]?.[f];
  if (!fn) {
    missing.add(name);
    const g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1, 8), new THREE.MeshStandardMaterial({ color: 0xff3366 }));
    c.position.y = 0.5;
    g.add(c);
    return g;
  }
  return fn(mulberry(seed));
}

// ---- textures and masks
const loader = new THREE.TextureLoader();
const texCache = {};
function tex(name, srgb = true) {
  const k = name + srgb;
  if (!texCache[k]) {
    texCache[k] = loader.loadAsync(`./tex/${name}`).then((t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    });
  }
  return texCache[k];
}
const maskCache = {};
async function maskOf(name) {
  if (!maskCache[name]) {
    maskCache[name] = (async () => {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `./tex/${name}`; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      return { w: c.width, h: c.height, d };
    })();
  }
  return maskCache[name];
}
// sample a mask at a map longitude and latitude: { land, ice }
function sampleMask(m, lon, lat) {
  const x = Math.floor((((lon + 180) / 360) % 1 + 1) % 1 * m.w);
  const y = Math.min(m.h - 1, Math.max(0, Math.floor((90 - lat) / 180 * m.h)));
  const i = (y * m.w + x) * 4;
  return { land: m.d[i] / 255, ice: m.d[i + 2] / 255 };
}

// three's partial spheres run their uvs 0..1 over the part; put them back on the whole map
function sphere(phiStart, phiLen, ws, hs) {
  const geo = new THREE.SphereGeometry(1, ws, hs, phiStart, phiLen, 0, Math.PI);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (phiStart + uv.getX(i) * phiLen) / (2 * Math.PI));
  return geo;
}

// ---- the pie's angles: time runs clockwise from `start` o'clock
// which way phi turns on screen, seen from above
const sgn = (() => {
  const a = project(dirLL(30, camPhi + Math.PI)), b = project(dirLL(30, camPhi + Math.PI + 0.1));
  return b[0] > a[0] ? 1 : -1;   // at the top of the picture, clockwise is to the right
})();
const phiAt = (t) => camPhi + Math.PI + sgn * (P.start * deg + t * 2 * Math.PI);   // t in [0, 1) around the clock
const rimLat = (phi) => Math.atan(-Math.cos(phi - camPhi) / Math.tan(P.camLat * deg)) / deg;
// the direction at (u, v) of a moment spanning phi0..phi1
function uvDir(phi0, phi1, u, v) {
  const phi = phi0 + (phi1 - phi0) * u;
  const lo = rimLat(phi) + 4, hi = 86;
  return { phi, lat: lo + (hi - lo) * v };
}

const subs = [];
{
  const nSl = SLICES.length;
  SLICES.forEach((sl, i) => {
    const t0 = i / nSl, t1 = (i + 1) / nSl;
    const kept = sl.subs.filter((s) => !P.drop.includes(s.key) && (s.d || 1) <= P.detail);
    const tot = kept.reduce((a, s) => a + s.w, 0);
    let acc = t0;
    kept.forEach((s, j) => {
      const tt0 = acc, tt1 = acc + (t1 - t0) * s.w / tot;
      acc = tt1;
      subs.push({ ...s, slice: i, first: j === 0, t0: tt0, t1: tt1, phi0: phiAt(tt0), phi1: phiAt(tt1) });
    });
  });
}

// ---- placing a model on the globe
const UP = new THREE.Vector3(0, 1, 0);
function orient(dir, flat, lift, rng, yawJitter = 0.35) {
  const up = flat ? dir.clone() : dir.clone().lerp(camUp, P.upright).normalize();
  const q1 = new THREE.Quaternion().setFromUnitVectors(UP, up);
  const pos = dir.clone().multiplyScalar(1 + (lift || 0) - 0.0015);
  // turn about up so the model's +z faces the camera
  const z1 = new THREE.Vector3(0, 0, 1).applyQuaternion(q1);
  const toCam = camera.position.clone().sub(pos).projectOnPlane(up).normalize();
  let a = Math.atan2(new THREE.Vector3().crossVectors(z1, toCam).dot(up), z1.dot(toCam));
  if (flat) a = rng() * Math.PI * 2;
  else a += (rng() - 0.5) * 2 * yawJitter;
  const q = new THREE.Quaternion().setFromAxisAngle(up, a).multiply(q1);
  return { pos, q };
}

// a model's size along y (or across, for flat ones), measured once
function measure(obj, flat) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  const s = b.getSize(new THREE.Vector3());
  return { size: flat ? Math.max(s.x, s.z) : s.y, minY: b.min.y, width: flat ? Math.max(s.x, s.z) : s.x, foot: Math.max(s.x, s.z) };
}

// hero models: whole groups, placed one by one
const world = new THREE.Group();
scene.add(world);
const occupied = [];   // [dir, radius] of every placed model, so scatter keeps clear
const heroes = [];     // every hero's holder, to keep the labels clear of them
const heroBoxes = [];  // and its box on screen, [x0, y0, x1, y1]
const groundBoxes = [];   // the boxes of those standing on the ground
// a box in a model's own frame, on screen
function screenBox(box, matrix) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const [x, y] = project(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(matrix));
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}
const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const meet = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
// how much of the smaller of two boxes the other covers, at worst over every hero placed so far
const covers = (b) => Math.max(0, ...heroBoxes.map((o) => area(meet(b, o)) / Math.max(1, Math.min(area(b), area(o)))));
// a scatter model's box on screen: its unit box, as the model is normalized to 1 tall (or wide)
const UNIT = new THREE.Box3(new THREE.Vector3(-0.45, 0, -0.45), new THREE.Vector3(0.45, 1, 0.45));
// would a model standing at this point on screen seem to stand on a hero, or in it? (each hero's
// box taken in a little from its edges; a model in front of a hero's feet is fine)
const onHero = ([x, y], boxes = groundBoxes) => boxes.some((o) => {
  const dx = (o[2] - o[0]) * 0.1, dy = (o[3] - o[1]) * 0.1;
  return x > o[0] + dx && x < o[2] - dx && y > o[1] + dy && y < o[3] - dy;
});

// places: where it may stand, best first; maxW: the widest it may be, in Earth radii
function placeHero(name, places, h, opt, rng, maxW = Infinity) {
  const dir = places[0];
  const flat = opt.flat || FLAT.has(name) || opt.flatW;
  const obj = make(name, P.seed * 1000 + Math.floor(rng() * 1e6));
  const { size, minY, width, foot } = measure(obj, flat);
  let s = (h * P.size * (opt.lift ? P.skySize : P.heroSize)) / Math.max(size, 1e-6);
  if (!opt.lift) s = Math.min(s, maxW / Math.max(width, 1e-6));
  const holder = new THREE.Group();
  obj.position.y -= minY;
  obj.updateMatrixWorld(true);
  holder.userData.box = new THREE.Box3().setFromObject(obj, true);
  holder.add(obj);
  holder.scale.setScalar(s);
  if (!flat && rng() < 0.5 && !opt.noflip) holder.scale.x *= -1;
  // the first place where it stays clear of the heroes on the ground and mostly clear of them on screen
  const j = rng(), fixed = () => j;
  let pick = null;
  for (const pass of [0, 1, 2]) {
    for (const d of places.slice(0, 400)) {
      if (pass < 2 && !opt.lift && !clear(d, foot * s * 0.4)) continue;
      const { pos, q } = orient(d, flat && !opt.flatW, opt.lift, fixed, opt.flatW ? 0.15 : 0.3);
      holder.position.copy(pos);
      holder.quaternion.copy(q);
      holder.updateMatrixWorld(true);
      const b = screenBox(holder.userData.box, holder.matrixWorld);
      if (pass === 2 || opt.near) { pick = { d, pos, q, b }; break; }
      // not standing on another hero, as seen, and not covering much of one
      if (!opt.lift && onHero(project(pos))) continue;
      if (covers(b) < (pass === 0 ? P.overlap : 0.5)) { pick = { d, pos, q, b }; break; }
    }
    if (pick) break;
  }
  holder.position.copy(pick.pos);
  holder.quaternion.copy(pick.q);
  holder.updateMatrixWorld(true);
  holder.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  world.add(holder);
  heroes.push(holder);
  heroBoxes.push(pick.b);
  if (!opt.lift) groundBoxes.push(pick.b);
  if (!opt.lift) occupied.push([pick.d, foot * s * 0.5]);
}

// scatter: many copies of a few variants, as instanced meshes
const protoCache = new Map();
function proto(name, variant, flat) {
  const key = `${name}#${variant}#${flat}`;
  if (protoCache.has(key)) return protoCache.get(key);
  const obj = make(name, 7919 * variant + 13);
  const { size, minY } = measure(obj, flat);
  const byMat = new Map();
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    let g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (o.matrixWorld.determinant() < 0 && g.index) {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    }
    g.translate(0, -minY, 0);
    g.scale(1 / size, 1 / size, 1 / size);
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a);
    const nv = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    // every part gets a colour attribute (white where it had none), so parts merge, and vertex-painted ones keep their paint
    if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3).fill(1), 3));
    else if (g.attributes.color.itemSize !== 3 || g.attributes.color.normalized) {
      const c = g.attributes.color, arr = new Float32Array(nv * 3);
      for (let i = 0; i < nv; i++) { arr[i * 3] = c.getX(i); arr[i * 3 + 1] = c.getY(i); arr[i * 3 + 2] = c.getZ(i); }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    for (const a of ['position', 'normal', 'uv']) {
      const at = g.attributes[a];
      if (at.isInterleavedBufferAttribute || at.normalized || !(at.array instanceof Float32Array)) {
        const arr = new Float32Array(at.count * at.itemSize);
        for (let i = 0; i < at.count; i++) for (let k = 0; k < at.itemSize; k++) arr[i * at.itemSize + k] = at.getComponent(i, k);
        g.setAttribute(a, new THREE.BufferAttribute(arr, at.itemSize));
      }
    }
    if (g.index) g = g.toNonIndexed();
    g.clearGroups();
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(g);
  });
  const parts = [...byMat].map(([m, gs]) => ({ m, g: gs.length > 1 ? mergeGeometries(gs) : gs[0] }));
  protoCache.set(key, parts);
  return parts;
}
const instances = new Map();   // key → { parts, matrices }
function addInstance(name, variant, flat, matrix, shadow = true) {
  const key = `${name}#${variant}#${flat}`;
  if (!instances.has(key)) instances.set(key, { parts: proto(name, variant, flat), ms: [], shadow });
  instances.get(key).ms.push(matrix);
}
function flushInstances() {
  for (const { parts, ms, shadow } of instances.values()) {
    for (const { m, g } of parts) {
      const im = new THREE.InstancedMesh(g, m, ms.length);
      ms.forEach((x, i) => im.setMatrixAt(i, x));
      im.castShadow = shadow;
      im.receiveShadow = true;
      im.frustumCulled = false;
      world.add(im);
    }
  }
}

function clear(dir, r) {
  for (const [d, rr] of occupied) if (d.distanceTo(dir) < r + rr) return false;
  return true;
}

// the globe's surface is drawn as if it were P.pop further from the camera than it is, so a model
// stood up toward the top of the screen draws whole over it, as a pop-up book's figures do, even
// where the surface in front of it bulges toward the camera
function pushBack(sh) {
  sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
    { vec4 back = projectionMatrix * vec4(mvPosition.xy, mvPosition.z - ${P.pop.toFixed(4)}, 1.0); gl_Position.z = back.z / back.w * gl_Position.w; }`);
}

// ---- build each moment
const later = [];
for (const s of subs) {
  if (P.only && s.key !== P.only) continue;
  const mid = (s.phi0 + s.phi1) / 2;
  const lonAt = (phi) => s.lon + sgn * ((phi - mid) / deg) * (sgn > 0 ? 1 : 1);
  // the texture turned so s.lon sits on the moment's middle: u = phi/2π + offset
  const offset = (s.lon + 180) / 360 - mid / (2 * Math.PI);
  const mapLon = (phi) => (phi / (2 * Math.PI) + offset) * 360 - 180;
  const a = await tex(s.map.albedo);
  const albedo = a.clone(); albedo.offset.x = offset; albedo.needsUpdate = true;
  const n = (await tex(s.map.normal, false)).clone(); n.offset.x = offset; n.needsUpdate = true;
  const rough = (await tex(s.map.mask, false)).clone(); rough.offset.x = offset; rough.needsUpdate = true;
  const o = { map: albedo, normalMap: n, normalScale: new THREE.Vector2(P.normal, P.normal), roughnessMap: rough, roughness: 1, metalness: 0 };
  if (s.map.glow) { o.emissive = 0xffffff; o.emissiveMap = albedo; o.emissiveIntensity = s.map.glow; }
  if (s.map.lights) {
    const l = (await tex('now_lights.png')).clone(); l.offset.x = offset; l.needsUpdate = true;
    o.emissive = 0xffc070; o.emissiveMap = l; o.emissiveIntensity = s.map.lights;
  }
  if (s.map.people) {
    const pp = (await tex('L_people.jpg')).clone(); pp.offset.x = offset; pp.needsUpdate = true;
    o.emissive = 0xffffff; o.emissiveMap = pp; o.emissiveIntensity = s.map.people;
  }
  const lo = Math.min(s.phi0, s.phi1), len = Math.abs(s.phi1 - s.phi0);
  const sm = new THREE.MeshStandardMaterial(o);
  // a little brighter and more saturated than the maps, as a painted toy would be
  sm.onBeforeCompile = (sh) => {
    pushBack(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 c = diffuseColor.rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, ${P.sat.toFixed(3)}); diffuseColor.rgb = pow(max(c, 0.0), vec3(${P.gamma.toFixed(3)})) * ${P.gain.toFixed(3)}; }`);
  };
  const surf = new THREE.Mesh(sphere(lo, len, Math.max(12, Math.round(len / deg * 3)), 256), sm);
  surf.receiveShadow = true;
  world.add(surf);

  const mask = await maskOf(s.map.mask);
  const rng = mulberry(P.seed * 7 + s.t0 * 1e4);
  const ok = (on, phi, lat) => {
    if (on === 'any') return true;
    const m = sampleMask(mask, mapLon(phi), lat);
    if (on === 'water') return m.land < 0.5;
    if (on === 'ice') return m.ice > 0.5;
    if (on === 'noice') return m.land > 0.5 && m.ice < 0.5;
    return m.land > 0.5;
  };

  // hero models, moved to the nearest place that suits them
  for (const [name, u, v0, h, opt = {}] of s.hero) {
    if ((opt.d || 1) > P.detail) continue;
    const v = v0 < 0 ? v0 : P.heroIn + v0 * (1 - P.heroIn);
    const on = opt.on || (opt.any ? 'any' : opt.lift ? 'any' : onOf(name));
    // the places that suit it, nearest first
    const places = [];
    if (v < 0) { const { phi, lat } = uvDir(s.phi0, s.phi1, u, 0); places.push({ d: 0, phi, lat }); }   // above the rim, in the sky
    else for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) {
      const uu = 0.06 + 0.88 * i / 40, vv = Math.min(0.9, j / 40);
      const { phi, lat } = uvDir(s.phi0, s.phi1, uu, vv);
      if (ok(on, phi, lat)) places.push({ d: (uu - u) ** 2 + (vv - v) ** 2, phi, lat });
    }
    if (!places.length) { console.warn(`no place for ${name} in ${s.key}`); continue; }
    places.sort((a, b) => a.d - b.d);
    const lat0 = places[0].lat;
    placeHero(name, places.map((p) => dirLL(p.lat, p.phi)), h, opt, rng, Math.abs(s.phi1 - s.phi0) * Math.cos(lat0 * deg) * P.fit);
  }
  later.push({ s, ok, rng });
}

// scatter, after every hero is standing, so it keeps clear of them all
for (const { s, ok, rng } of later) {
  // scatter
  for (const sc of s.scatter) {
    if ((sc.d || 1) > P.detail) continue;
    const count = Math.round(sc.n * P.density);
    const centres = sc.clump ? Array.from({ length: sc.clump }, () => [0.12 + 0.76 * rng(), 0.05 + 0.6 * rng()]) : null;
    let placed = 0;
    for (let tries = 0; tries < count * 40 && placed < count; tries++) {
      let u, v;
      if (centres) {
        const c = centres[Math.floor(rng() * centres.length)];
        const r = (sc.spread || 0.18) * Math.sqrt(rng()), a = rng() * Math.PI * 2;
        u = c[0] + Math.cos(a) * r; v = c[1] + Math.sin(a) * r * 0.8;
      } else { u = rng(); v = rng() * 0.88; }
      if (u < 0.04 || u > 0.96 || v < 0 || v > 0.9) continue;
      const { phi, lat } = uvDir(s.phi0, s.phi1, u, v);
      if (rng() > Math.cos(lat * deg) + 0.15) continue;   // even by area
      const name = sc.p[Math.floor(rng() * sc.p.length)];
      const on = sc.on || onOf(name);
      if (!ok(on, phi, lat)) continue;
      const dir = dirLL(lat, phi);
      const h = (sc.h[0] + (sc.h[1] - sc.h[0]) * rng()) * P.size * P.scatterSize;
      const r = h * (sc.flat ? 0.5 : 0.32);
      if (!clear(dir, r)) continue;
      const flat = !!sc.flat || FLAT.has(name);
      const { pos, q } = orient(dir, flat, sc.lift ? sc.lift * (0.7 + 0.6 * rng()) : 0, rng);
      const sx = !flat && rng() < 0.5 ? -h : h;
      const m = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(sx, h, h));
      if (onHero(project(pos))) continue;
      addInstance(name, Math.floor(rng() * 4), flat || !!sc.fitW, m);
      occupied.push([dir, r]);
      placed++;
    }
  }
}

// clouds drift over everything
{
  const rng = mulberry(P.seed * 31 + 5);
  for (let i = 0; i < Math.round(num('clouds', 22)); i++) {
    const t = rng(), v = 0.05 + 0.75 * rng();
    const phi = phiAt(t), lo = rimLat(phi) + 4, lat = lo + (86 - lo) * v;
    const dir = dirLL(lat, phi);
    const h = (0.018 + 0.02 * rng()) * P.size;
    if (!clear(dir, h * 0.3)) continue;
    const { pos, q } = orient(dir, false, 0.05 + 0.05 * rng(), rng, 0.6);
    const m = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(h * 1.4, h, h * 1.4));
    const cb = screenBox(UNIT, m);
    if (heroBoxes.some((o) => area(meet(cb, o)) > 0)) continue;
    addInstance('mammals.cloud', Math.floor(rng() * 4), false, m, false);
  }
}
flushInstances();
if (missing.size) console.warn(`models not built yet: ${[...missing].join(', ')}`);

// ---- seams between moments, a knob at the pole
const seamMat = new THREE.MeshStandardMaterial({ color: 0xf3ead6, roughness: 0.45, metalness: 0.1 });
seamMat.onBeforeCompile = pushBack;
for (const s of subs) {
  if (P.only) break;
  const pts = [];
  for (let t = 0; t <= 96; t++) pts.push(dirOf(s.phi0, (t / 96) * Math.PI).multiplyScalar(1.0015));
  const r = (s.first ? 0.0042 : 0.0018) * P.seam;
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 192, r, 8, false), seamMat);
  m.castShadow = true;
  world.add(m);
}
{
  const brass = new THREE.MeshStandardMaterial({ color: 0xd8b05a, roughness: 0.3, metalness: 0.8 });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 24, 12), brass);
  knob.position.set(0, 1.008, 0);
  knob.castShadow = true;
  world.add(knob);
}

// ---- atmosphere: a soft rim
if (P.atmo) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: camera.position }, uSun: { value: sunDir } },
    vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uCam; uniform vec3 uSun; varying vec3 vN; varying vec3 vP;
      void main(){ vec3 v = normalize(uCam - vP); float f = abs(dot(v, vN)); float day = 0.35 + 0.65 * smoothstep(-0.3, 0.6, dot(vN, uSun));
        gl_FragColor = vec4(vec3(0.5, 0.7, 1.0) * day, pow(f, 6.0) * 0.55); }`,
    transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.06, 96, 64), m));
}

// ---- render
const pr = renderer.getPixelRatio();
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(P.w * pr, P.h * pr, { type: THREE.HalfFloatType, samples: 4 }));
composer.setPixelRatio(pr);
composer.setSize(P.w, P.h);
composer.addPass(new RenderPass(scene, camera));
if (P.ao) {
  const ao = new GTAOPass(scene, camera, P.w * pr, P.h * pr);
  ao.updateGtaoMaterial({ radius: 0.02, distanceExponent: 1.5, thickness: 1, scale: 1.2, samples: 16 });
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
}
if (P.bloom > 0) composer.addPass(new UnrealBloomPass(new THREE.Vector2(P.w * pr, P.h * pr), P.bloom, 0.4, 0.9));
composer.addPass(new OutputPass());
composer.render();

// ---- the bezel and labels, in screen space: the bezel and the eras' titles under the canvas, so
// models standing out past the rim cover them; the moments' labels over it, moved out of the way
const over = document.getElementById('over');
const [cx, cy] = project(new THREE.Vector3(0, 0, 0));
const limb = project(camDir.clone().multiplyScalar(1 / dist).addScaledVector(camRight, Math.sqrt(1 - 1 / dist ** 2)));
const Rpx = Math.hypot(limb[0] - cx, limb[1] - cy);
const angOf = (phi) => { const [x, y] = project(dirLL(rimLat(phi), phi)); return Math.atan2(y - cy, x - cx); };
const anchors = { centre: [cx / P.w, cy / P.h], radius: Rpx / P.h, subs: [] };
// every hero's box on screen
const boxes = heroBoxes;
const hits = (x0, y0, x1, y1, m = 0) => boxes.some((b) => x0 < b[2] + m && x1 > b[0] - m && y0 < b[3] + m && y1 > b[1] - m);
if (P.labels && !P.only) {
  renderer.domElement.style.position = 'relative';
  renderer.domElement.style.zIndex = 1;
  over.style.zIndex = 2;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', P.w); svg.setAttribute('height', P.h);
  svg.style.position = 'absolute'; svg.style.inset = '0';
  stage.prepend(svg);
  const el = (tag, at, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); parent.appendChild(e); return e; };
  const unwrap = (a, ref) => { while (a < ref) a += 2 * Math.PI; return a; };
  const rB = Rpx * 1.1, rT = Rpx * 1.1 + 118;
  const rLab = (a) => Rpx * 1.1 + 26 + Math.abs(Math.cos(a)) * 46 + Math.abs(Math.sin(a)) * 12;
  const pt = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  // each moment's date and name, pushed outward until it clears every model
  const labR = new Map();
  const divs = subs.map((s) => {
    const d = document.createElement('div');
    d.className = 'sub';
    d.innerHTML = `<b>${s.date}</b><i>${s.name}</i>`;
    over.appendChild(d);
    return d;
  });
  await document.fonts.ready;
  subs.forEach((s, k) => {
    const a0 = angOf(s.phi0), a1 = unwrap(angOf(s.phi1), a0 + 0.001);
    const { width: w, height: h } = divs[k].getBoundingClientRect();
    // the nearest clear spot: outward from the bezel, and a little to either side within the moment
    const inFrame = (x, y) => x - w / 2 > 8 && x + w / 2 < P.w - 8 && y - h / 2 > 8 && y + h / 2 < P.h - 8;
    const am = (a0 + a1) / 2, side = Math.min(0.12, (a1 - a0) * 0.3);
    let a = am, r = rLab(am);
    search: for (let i = 0; i < 60; i++) {
      for (const da of [0, -1, 1, -2, 2, -3, 3].map((t) => (t * side) / 3)) {
        const rr = rLab(am + da) + i * 3, [x, y] = pt(am + da, rr);
        if (!inFrame(x, y)) continue;
        if (!hits(x - w / 2, y - h / 2, x + w / 2, y + h / 2, 6)) { a = am + da; r = rr; break search; }
      }
    }
    const [x, y] = pt(a, r);
    divs[k].style.left = x + 'px'; divs[k].style.top = y + 'px';
    labR.set(s, r - rLab(am));
    anchors.subs.push({ key: s.key, at: [x / P.w, y / P.h] });
  });
  // each slice's arc on the bezel, ticks between moments, its title along the arc, outside its labels
  SLICES.forEach((sl, i) => {
    const ss = subs.filter((s) => s.slice === i);
    if (!ss.length) return;
    const a0 = angOf(ss[0].phi0);
    const a1 = unwrap(angOf(ss[ss.length - 1].phi1), a0 + 0.01);
    const gap = 0.012;
    if (P.bezel) {
      const [x0, y0] = pt(a0 + gap, rB), [x1, y1] = pt(a1 - gap, rB);
      el('path', { d: `M${x0},${y0} A${rB},${rB} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1},${y1}`, fill: 'none', stroke: BG.line, 'stroke-width': 1.4 });
      for (const s of ss.slice(1)) {
        const a = angOf(s.phi0);
        const [p0, q0] = pt(a, rB - 4), [p1, q1] = pt(a, rB + 4);
        el('line', { x1: p0, y1: q0, x2: p1, y2: q1, stroke: BG.line, 'stroke-width': 1.2 });
      }
      const [ex, ey] = pt(a0, rB);
      el('circle', { cx: ex, cy: ey, r: 2.6, fill: BG.ink, opacity: 0.8 });
    }
    // the title, upright: along the arc clockwise on the top half, anticlockwise on the bottom
    const am = (a0 + a1) / 2;
    const bottom = Math.sin(am) > 0.2;
    let r = (bottom ? rT + 10 : rT) + Math.abs(Math.cos(am)) * 58 + Math.max(...ss.map((s) => labR.get(s) || 0));
    for (let k = 0; k < 40; k++, r += 4) {
      let clear = true;
      for (let j = 0; j <= 8 && clear; j++) {
        const [x, y] = pt(a0 + (a1 - a0) * (0.2 + 0.6 * j / 8), r);
        if (hits(x - 4, y - 8, x + 4, y + 8, 4)) clear = false;
      }
      if (clear) break;
    }
    const [x0, y0] = pt(bottom ? a1 : a0, r), [x1, y1] = pt(bottom ? a0 : a1, r);
    const id = `arc${i}`;
    el('path', { id, d: `M${x0},${y0} A${r},${r} 0 0 ${bottom ? 0 : 1} ${x1},${y1}`, fill: 'none' });
    const t = el('text', { fill: BG.ink, opacity: 0.9 });
    const tp = el('textPath', { href: `#${id}`, startOffset: '50%', 'text-anchor': 'middle' }, t);
    tp.textContent = sl.title;
  });
}
await document.fonts.ready;
window.__anchors = anchors;
console.log(`rendered: ${subs.length} moments, ${world.children.length} objects`);
window.__ready = true;
