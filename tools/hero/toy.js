// A toy globe for the hero: the Earth cut into sections, each a different time, with
// oversized low-poly props on each, and the model's layers on the cut faces.
// Everything about the picture is a URL parameter (see P). A sketch, not a sourced picture:
// the props are caricatures and the ice-age sheet is drawn by hand (bake: toy_iceage.jpg).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const q0 = new URLSearchParams(location.search);
const q = new URLSearchParams();
for (const [k, v] of q0) q.set(k, v);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const str = (k, d) => (q.has(k) ? q.get(k) : d);
const list = (k, d) => (q.has(k) ? q.get(k).split(',').map(Number) : d);

const P = {
  w: num('w', 1500), h: num('h', 1000),
  layout: str('layout', 'wedges'),      // wedges | bands
  fov: num('fov', 24), dist: num('dist', 6.2),
  camLat: num('camLat', 38), camAz: num('camAz', 0),
  fx: num('fx', 0.62), fy: num('fy', 0.5),
  explode: num('explode', 0.05),        // wedges: how far each is pulled from the axis
  rise: num('rise', 0),                 // wedges: each later one raised this much (a spiral stair)
  grow: num('grow', 0),                 // wedges: each later one this much bigger
  pull: num('pull', -1), pullBy: num('pullBy', 0.35),  // wedges: one pulled out, like a slice of cake
  span: num('span', 360),               // wedges: the degrees they share
  start: num('start', 0),               // wedges: where the first starts, east of the camera
  gap: num('gap', 0.07),                // bands: the gap between them
  bands: list('bands', [0, 38, 66, 92, 118, 146, 180]),   // bands: polar angles of the cuts, north first
  prop: num('prop', 1.7),                 // props' scale
  eras: str('eras', 'magma,cambrian,cretaceous,iceage,rome,today'),
  sun: list('sun', [-0.6, 0.75, 0.55]), // in the camera's frame: right, up, toward
  exp: num('exp', 1.0), bloom: num('bloom', 0.35),
  bg: str('bg', 'space'),               // space | dusk | paper
  sat: num('sat', 1.0),
  pLat0: num('pLat0', 12), pLat1: num('pLat1', 64),   // wedges: the latitudes props stand between
  upright: num('upright', 0),
  faces: num('faces', 1), seams: num('seams', 0), labels: num('labels', 0),
  labelLat: num('labelLat', -8), labelR: num('labelR', 1.32), labelS: num('labelS', 1),
  turn: num('turn', 0), lift: num('lift', 0),   // wedges: the pulled slice's turn and lift
  twist: num('twist', 0),               // bands: each turned this many degrees from the one below
  pSpread: num('pSpread', 100),       // bands: the degrees of longitude props spread over               // 1: wedges' outer surfaces float a little apart from their faces
};

const deg = Math.PI / 180;
// three's sphere: azimuth phi from -x toward +z, polar angle theta from +y
const dirOf = (phi, theta) => new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
const lonToU = (lon) => (lon + 180) / 360;

// ---- renderer, camera
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(P.w, P.h);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = P.exp;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(P.fov, P.w / P.h, 0.1, 100);
const camPhi = (180 + P.camAz) * deg;   // camAz 0 looks at lon 0
const camDir = dirOf(camPhi, (90 - P.camLat) * deg);
camera.position.copy(camDir.clone().multiplyScalar(P.dist));
camera.up.set(0, 1, 0);
camera.lookAt(0, 0, 0);
// put the globe's centre at (fx, fy) of the frame
camera.setViewOffset(P.w, P.h, (0.5 - P.fx) * P.w, (0.5 - P.fy) * P.h, P.w, P.h);
camera.updateMatrixWorld();

// what props stand toward when upright: the world's up, or the screen's (a pop-up book)
const standUp = (() => {
  if (str('stand', 'world') !== 'cam') return new THREE.Vector3(0, 1, 0);
  const f = camDir.clone().negate();
  const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  return new THREE.Vector3().crossVectors(right, f).normalize();
})();

// ---- background
const bgs = {
  space: [0x05070d, 0x0b1222],
  dusk: [0x1a1530, 0x3a2d4f],
  paper: [0xefe7d6, 0xd9cdb6],
};
{
  const [a, b] = bgs[P.bg] || bgs.space;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#' + new THREE.Color(b).getHexString());
  grd.addColorStop(1, '#' + new THREE.Color(a).getHexString());
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
  if (P.bg !== 'paper') {
    const n = 1500, pos = new Float32Array(n * 3), rnd = mulberry(5);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize().multiplyScalar(40);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaab4cc, size: 0.06, sizeAttenuation: true })));
  }
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- light
{
  const right = new THREE.Vector3().crossVectors(camDir.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, camDir.clone().negate()).normalize();
  const s = new THREE.Vector3().addScaledVector(right, P.sun[0]).addScaledVector(up, P.sun[1]).addScaledVector(camDir, P.sun[2]).normalize();
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.6);
  sun.position.copy(s.multiplyScalar(6));
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -2.2; sc.right = sc.top = 2.2; sc.near = 1; sc.far = 14;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x4a3a30, 1.5));
  const rim = new THREE.DirectionalLight(0x88aaff, 0.8);
  rim.position.copy(s.clone().negate().add(new THREE.Vector3(0, 2, 0)));
  scene.add(rim);
}

// ---- materials
const matCache = new Map();
function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, flatShading: true, ...o }));
  }
  return matCache.get(key);
}
const glow = (color, k = 2.5) => mat(color, { emissive: color, emissiveIntensity: k });

function mesh(geo, m) {
  const x = new THREE.Mesh(geo, m);
  x.castShadow = true; x.receiveShadow = true;
  return x;
}
function at(o, x, y, z) { o.position.set(x, y, z); return o; }

// ---- props: every prop stands on +y, about one unit tall, at its origin
const R = mulberry(11);

function volcano() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.ConeGeometry(0.62, 0.75, 9, 3), mat(0x3a2622)));
  g.children[0].position.y = 0.375;
  const crater = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.06, 9), glow(0xff6a1a, 3));
  g.add(at(crater, 0, 0.74, 0));
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6 + 0.3;
    const lava = mesh(new THREE.BoxGeometry(0.07, 0.6, 0.03), glow(0xff5a10, 2.5));
    lava.position.set(Math.cos(a) * 0.3, 0.4, Math.sin(a) * 0.3);
    lava.lookAt(Math.cos(a) * 2, -0.6, Math.sin(a) * 2);
    lava.rotateX(Math.PI / 2);
    g.add(lava);
  }
  // a plume of smoke
  for (let i = 0; i < 5; i++) {
    const s = mesh(new THREE.IcosahedronGeometry(0.12 + i * 0.05, 0), mat(0x5a4a48, { roughness: 1 }));
    g.add(at(s, i * 0.06, 0.88 + i * 0.16, -i * 0.03));
  }
  return g;
}

function impactor() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.IcosahedronGeometry(0.28, 0), mat(0x5b4f45)));
  const tail = mesh(new THREE.ConeGeometry(0.22, 1.4, 8, 1, true), glow(0xffa040, 2.2));
  tail.material = tail.material.clone();
  tail.material.transparent = true; tail.material.opacity = 0.75; tail.material.side = THREE.DoubleSide;
  tail.position.y = 0.72;
  tail.castShadow = false;
  g.add(tail);
  return g;
}

function rock(s = 0.2, c = 0x4a3a33) { return mesh(new THREE.DodecahedronGeometry(s, 0), mat(c)); }

function stromatolite() {
  const g = new THREE.Group();
  const cols = [0x6f8a5a, 0x8a9a62, 0x5f7a52];
  for (let i = 0; i < 3; i++) {
    const d = mesh(new THREE.SphereGeometry(0.25 - i * 0.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(cols[i]));
    d.scale.y = 1.2;
    g.add(at(d, 0, i * 0.12, 0));
  }
  return g;
}

function trilobite() {
  const g = new THREE.Group();
  const shell = mat(0x8a6b4e), dark = mat(0x5e4532);
  const head = mesh(new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), shell);
  head.scale.set(1, 0.45, 0.62);
  g.add(at(head, 0, 0, -0.42));
  for (let i = 0; i < 8; i++) {
    const w = 0.34 - i * 0.03;
    const seg = mesh(new THREE.CylinderGeometry(0.08, 0.08, w * 2, 8), i % 2 ? shell : dark);
    seg.rotation.z = Math.PI / 2;
    seg.scale.set(1, 1, 0.7);
    g.add(at(seg, 0, 0.06, -0.1 + i * 0.11));
    const lobe = mesh(new THREE.SphereGeometry(0.075, 8, 6), dark);
    g.add(at(lobe, 0, 0.12, -0.1 + i * 0.11));
  }
  const eyeM = mat(0x222018);
  g.add(at(mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeM), -0.16, 0.16, -0.5));
  g.add(at(mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeM), 0.16, 0.16, -0.5));
  for (const s of [-1, 1]) {
    const ant = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), dark);
    ant.rotation.x = Math.PI / 2.6; ant.rotation.z = s * 0.4;
    g.add(at(ant, s * 0.12, 0.08, -0.95));
  }
  g.scale.setScalar(0.9);
  return g;
}

function jelly() {
  const g = new THREE.Group();
  const m = mat(0xff9ec8, { transparent: true, opacity: 0.8, emissive: 0xff70b0, emissiveIntensity: 0.4 });
  const dome = mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
  g.add(at(dome, 0, 0.5, 0));
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const t = mesh(new THREE.CylinderGeometry(0.012, 0.006, 0.45, 4), m);
    g.add(at(t, Math.cos(a) * 0.13, 0.28, Math.sin(a) * 0.13));
  }
  return g;
}

function sponge() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const h = 0.35 + i * 0.15;
    const t = mesh(new THREE.CylinderGeometry(0.07, 0.05, h, 8, 1, true), mat([0xd88a4a, 0xc9a24a, 0xd06a5a][i], { side: THREE.DoubleSide }));
    g.add(at(t, (i - 1) * 0.12, h / 2, (i % 2) * 0.08));
  }
  return g;
}

function blob(points, r0, r1, m) {
  // a chain of spheres along a curve, tapering: necks, tails, trunks
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = mesh(new THREE.SphereGeometry(r0 + (r1 - r0) * t, 8, 6), m);
    s.position.copy(curve.getPoint(t));
    g.add(s);
  }
  return g;
}

function sauropod() {
  const g = new THREE.Group();
  const skin = mat(0x6f9a4a), belly = mat(0x9aba6a);
  const body = mesh(new THREE.SphereGeometry(0.42, 12, 9), skin);
  body.scale.set(1.35, 0.8, 0.75);
  g.add(at(body, 0, 0.62, 0));
  g.add(blob([[0.42, 0.75, 0], [0.62, 1.05, 0], [0.7, 1.45, 0], [0.82, 1.62, 0]], 0.17, 0.08, skin));
  const head = mesh(new THREE.SphereGeometry(0.11, 8, 6), skin);
  head.scale.set(1.5, 0.8, 0.9);
  g.add(at(head, 0.92, 1.64, 0));
  g.add(blob([[-0.48, 0.65, 0], [-0.85, 0.5, 0.05], [-1.15, 0.35, 0.2], [-1.35, 0.25, 0.4]], 0.16, 0.03, skin));
  for (const [x, z] of [[0.3, 0.2], [0.3, -0.2], [-0.3, 0.2], [-0.3, -0.2]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.5, 7), belly);
    g.add(at(leg, x, 0.25, z));
  }
  const eye = mat(0x111111);
  g.add(at(mesh(new THREE.SphereGeometry(0.025, 6, 4), eye), 0.98, 1.68, 0.08));
  g.add(at(mesh(new THREE.SphereGeometry(0.025, 6, 4), eye), 0.98, 1.68, -0.08));
  return g;
}

function trex() {
  const g = new THREE.Group();
  const skin = mat(0xb5603a);
  const body = mesh(new THREE.SphereGeometry(0.3, 10, 8), skin);
  body.scale.set(1.4, 0.85, 0.75);
  body.rotation.z = 0.25;
  g.add(at(body, 0, 0.72, 0));
  const head = mesh(new THREE.BoxGeometry(0.42, 0.24, 0.24), skin);
  g.add(at(head, 0.5, 1.05, 0));
  const jaw = mesh(new THREE.BoxGeometry(0.34, 0.07, 0.2), mat(0x8a4028));
  g.add(at(jaw, 0.5, 0.9, 0));
  g.add(blob([[-0.35, 0.68, 0], [-0.7, 0.6, 0], [-1.0, 0.5, 0]], 0.14, 0.03, skin));
  for (const z of [0.13, -0.13]) {
    const thigh = mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.5, 6), skin);
    g.add(at(thigh, -0.05, 0.3, z));
    const arm = mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.14, 4), skin);
    arm.rotation.z = 1.2;
    g.add(at(arm, 0.32, 0.72, z * 1.3));
  }
  g.add(at(mesh(new THREE.SphereGeometry(0.03, 6, 4), mat(0xffee88, { emissive: 0xffcc44, emissiveIntensity: 0.5 })), 0.58, 1.12, 0.12));
  return g;
}

function pterosaur() {
  const g = new THREE.Group();
  const m = mat(0xc98a5a, { side: THREE.DoubleSide });
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(0.9, 0.25); shape.lineTo(0.75, -0.05); shape.lineTo(0.1, -0.2); shape.lineTo(0, 0);
  for (const s of [1, -1]) {
    const w = mesh(new THREE.ShapeGeometry(shape), m);
    w.rotation.x = -Math.PI / 2;
    w.scale.x = s;
    w.rotation.z = 0;
    g.add(w);
  }
  const body = mesh(new THREE.ConeGeometry(0.07, 0.6, 6), m);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const crest = mesh(new THREE.ConeGeometry(0.04, 0.3, 4), m);
  crest.rotation.x = -Math.PI / 2 - 0.5;
  g.add(at(crest, 0, 0.05, -0.38));
  return g;
}

function fern() {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.6, 6), mat(0x6a4a30));
  g.add(at(trunk, 0, 0.3, 0));
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    const f = mesh(new THREE.ConeGeometry(0.07, 0.55, 4), mat(0x3f8a3a));
    f.position.set(Math.cos(a) * 0.2, 0.62, Math.sin(a) * 0.2);
    f.rotation.set(0, -a, 0);
    f.rotateZ(-Math.PI / 2 + 0.5);
    f.scale.z = 0.3;
    g.add(f);
  }
  return g;
}

function conifer(c = 0x2f6a3a, snow = false) {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.25, 5), mat(0x5a3a22)), 0, 0.12, 0));
  for (let i = 0; i < 3; i++) {
    const cone = mesh(new THREE.ConeGeometry(0.26 - i * 0.06, 0.38, 7), mat(snow && i === 2 ? 0xeef4f8 : c));
    g.add(at(cone, 0, 0.32 + i * 0.2, 0));
  }
  return g;
}

function mammoth() {
  const g = new THREE.Group();
  const fur = mat(0x6b4426), tusk = mat(0xf2e8d0);
  const body = mesh(new THREE.SphereGeometry(0.45, 12, 9), fur);
  body.scale.set(1.25, 1, 0.85);
  g.add(at(body, 0, 0.75, 0));
  const hump = mesh(new THREE.SphereGeometry(0.3, 10, 8), fur);
  g.add(at(hump, 0.25, 1.1, 0));
  const head = mesh(new THREE.SphereGeometry(0.28, 10, 8), fur);
  g.add(at(head, 0.6, 0.95, 0));
  g.add(blob([[0.82, 0.88, 0], [0.92, 0.6, 0], [0.95, 0.35, 0.02], [1.05, 0.22, 0.05]], 0.09, 0.04, fur));
  for (const s of [1, -1]) {
    g.add(blob([[0.75, 0.75, s * 0.12], [0.98, 0.55, s * 0.22], [1.2, 0.62, s * 0.2], [1.25, 0.82, s * 0.1]], 0.045, 0.025, tusk));
    const ear = mesh(new THREE.SphereGeometry(0.13, 8, 6), fur);
    ear.scale.set(0.4, 1, 1);
    g.add(at(ear, 0.48, 1.0, s * 0.24));
  }
  for (const [x, z] of [[0.3, 0.22], [0.3, -0.22], [-0.3, 0.22], [-0.3, -0.22]]) {
    g.add(at(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 7), fur), x, 0.22, z));
  }
  return g;
}

function camp() {
  const g = new THREE.Group();
  const tent = mesh(new THREE.ConeGeometry(0.28, 0.45, 6), mat(0x9a7a55));
  g.add(at(tent, -0.25, 0.22, 0));
  const fire = mesh(new THREE.ConeGeometry(0.08, 0.2, 5), glow(0xffa030, 4));
  g.add(at(fire, 0.2, 0.1, 0.1));
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Group();
    p.add(at(mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.16, 5), mat(0x7a5a3a)), 0, 0.08, 0));
    p.add(at(mesh(new THREE.SphereGeometry(0.04, 6, 4), mat(0xc69a7a)), 0, 0.2, 0));
    g.add(at(p, 0.35 + i * 0.05, 0, -0.15 + i * 0.35));
  }
  return g;
}

function temple() {
  const g = new THREE.Group();
  const marble = mat(0xf1ebdc), roof = mat(0xb4553a);
  g.add(at(mesh(new THREE.BoxGeometry(1.1, 0.12, 0.7), marble), 0, 0.06, 0));
  g.add(at(mesh(new THREE.BoxGeometry(1.0, 0.06, 0.6), marble), 0, 0.15, 0));
  for (let i = 0; i < 6; i++) {
    for (const z of [0.24, -0.24]) {
      g.add(at(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.5, 8), marble), -0.4 + i * 0.16, 0.43, z));
    }
  }
  g.add(at(mesh(new THREE.BoxGeometry(1.0, 0.07, 0.6), marble), 0, 0.71, 0));
  const tri = new THREE.Shape();
  tri.moveTo(-0.32, 0); tri.lineTo(0.32, 0); tri.lineTo(0, 0.22); tri.lineTo(-0.32, 0);
  const ped = mesh(new THREE.ExtrudeGeometry(tri, { depth: 1.04, bevelEnabled: false }), roof);
  ped.rotation.y = Math.PI / 2;
  g.add(at(ped, -0.52, 0.745, 0));
  return g;
}

function colosseum() {
  const g = new THREE.Group();
  const stone = mat(0xd9c39a), dark = mat(0x8a7350);
  const n = 28;
  for (let tier = 0; tier < 3; tier++) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = mesh(new THREE.BoxGeometry(0.06, 0.2, 0.08), stone);
      p.position.set(Math.cos(a) * 0.6, 0.1 + tier * 0.22, Math.sin(a) * 0.45);
      p.rotation.y = -a;
      g.add(p);
    }
    const band = mesh(new THREE.TorusGeometry(0.6, 0.03, 4, 40), stone);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 0.75, 1);
    g.add(at(band, 0, 0.21 + tier * 0.22, 0));
  }
  const floor = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 32), dark);
  floor.scale.z = 0.75;
  g.add(at(floor, 0, 0.02, 0));
  const arena = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 24), mat(0xe8d9a8));
  arena.scale.z = 0.7;
  g.add(at(arena, 0, 0.04, 0));
  return g;
}

function aqueduct(n = 6) {
  const g = new THREE.Group();
  const stone = mat(0xcdb48a);
  for (let i = 0; i < n; i++) g.add(at(mesh(new THREE.BoxGeometry(0.08, 0.5, 0.1), stone), i * 0.22, 0.25, 0));
  for (let i = 0; i < n - 1; i++) {
    const arch = mesh(new THREE.TorusGeometry(0.11, 0.035, 4, 10, Math.PI), stone);
    g.add(at(arch, i * 0.22 + 0.11, 0.5, 0));
  }
  g.add(at(mesh(new THREE.BoxGeometry(0.22 * (n - 1) + 0.12, 0.08, 0.12), stone), 0.11 * (n - 1), 0.66, 0));
  return g;
}

function cypress() {
  const g = new THREE.Group();
  const c = mesh(new THREE.ConeGeometry(0.08, 0.6, 6), mat(0x2d5a32));
  c.scale.set(1, 1, 1);
  g.add(at(c, 0, 0.32, 0));
  return g;
}

function galley() {
  const g = new THREE.Group();
  const hull = mesh(new THREE.BoxGeometry(0.9, 0.12, 0.22), mat(0x6a4325));
  g.add(at(hull, 0, 0.06, 0));
  const prow = mesh(new THREE.ConeGeometry(0.11, 0.25, 4), mat(0x6a4325));
  prow.rotation.z = -Math.PI / 2;
  g.add(at(prow, 0.55, 0.08, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4), mat(0x4a3020)), 0, 0.4, 0));
  const sail = mesh(new THREE.BoxGeometry(0.02, 0.36, 0.45), mat(0xb83a2a));
  g.add(at(sail, 0.02, 0.45, 0));
  for (let i = 0; i < 6; i++) {
    for (const s of [1, -1]) {
      const oar = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 3), mat(0x8a6a40));
      oar.rotation.x = s * 1.1;
      g.add(at(oar, -0.3 + i * 0.12, 0.04, s * 0.2));
    }
  }
  return g;
}

let windowTex;
function windows() {
  if (windowTex) return windowTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 64, 128);
  const r = mulberry(3);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 6; i++) {
    if (r() < 0.6) { x.fillStyle = r() < 0.5 ? '#ffd890' : '#fff0c8'; x.fillRect(4 + i * 10, 4 + j * 8, 6, 4); }
  }
  windowTex = new THREE.CanvasTexture(c);
  windowTex.colorSpace = THREE.SRGBColorSpace;
  windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;
  return windowTex;
}

function city() {
  const g = new THREE.Group();
  const r = mulberry(21);
  const cols = [0x8fa4b8, 0xb8c4cc, 0x6f8090, 0xd0d6dc, 0x9ab0c0];
  for (let i = 0; i < 16; i++) {
    const h = 0.25 + Math.pow(r(), 2) * 1.0 + (i === 0 ? 0.6 : 0);
    const w = 0.12 + r() * 0.1;
    const t = windows().clone();
    t.repeat.set(1, h * 2);
    t.needsUpdate = true;
    const m = new THREE.MeshStandardMaterial({ color: cols[i % 5], roughness: 0.4, metalness: 0.3, flatShading: true, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.2 });
    const b = mesh(new THREE.BoxGeometry(w, h, w), m);
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 0.12 + r() * 0.45;
    g.add(at(b, Math.cos(a) * d, h / 2, Math.sin(a) * d));
    if (i === 0) {
      const sp = mesh(new THREE.ConeGeometry(0.04, 0.35, 4), mat(0xd0d6dc, { metalness: 0.5, roughness: 0.3 }));
      g.add(at(sp, Math.cos(a) * d, h + 0.17, Math.sin(a) * d));
    }
  }
  return g;
}

function turbine() {
  const g = new THREE.Group();
  const white = mat(0xf4f6f8);
  g.add(at(mesh(new THREE.CylinderGeometry(0.025, 0.045, 1.0, 6), white), 0, 0.5, 0));
  g.add(at(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.06), white), 0, 1.0, 0));
  for (let i = 0; i < 3; i++) {
    const b = mesh(new THREE.BoxGeometry(0.035, 0.45, 0.01), white);
    const a = i / 3 * Math.PI * 2 + 0.3;
    b.position.set(0.06, 1.0 + Math.cos(a) * 0.22, Math.sin(a) * 0.22);
    b.rotation.x = -a;
    g.add(b);
  }
  return g;
}

function plane() {
  const g = new THREE.Group();
  const white = mat(0xf2f4f6, { roughness: 0.4 });
  const f = mesh(new THREE.CapsuleGeometry(0.06, 0.6, 4, 8), white);
  f.rotation.z = Math.PI / 2;
  g.add(f);
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.015, 0.8), white));
  g.add(at(mesh(new THREE.BoxGeometry(0.08, 0.015, 0.28), white), -0.3, 0.02, 0));
  g.add(at(mesh(new THREE.BoxGeometry(0.1, 0.16, 0.015), mat(0x2a6ab0)), -0.32, 0.09, 0));
  return g;
}

function satellite() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.16, 0.22), mat(0xd8b84a, { metalness: 0.7, roughness: 0.3 })));
  for (const s of [1, -1]) {
    g.add(at(mesh(new THREE.BoxGeometry(0.5, 0.01, 0.18), mat(0x23407a, { metalness: 0.5, roughness: 0.3, emissive: 0x112244, emissiveIntensity: 0.4 })), s * 0.36, 0, 0));
  }
  g.add(at(mesh(new THREE.ConeGeometry(0.08, 0.08, 10, 1, true), mat(0xeeeeee, { side: THREE.DoubleSide })), 0, 0.12, 0));
  return g;
}

function ship() {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.BoxGeometry(0.9, 0.1, 0.2), mat(0x2a3a52)), 0, 0.05, 0));
  const cc = [0xd04a3a, 0x3a7ad0, 0xe0b040, 0x4ab070];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
    g.add(at(mesh(new THREE.BoxGeometry(0.11, 0.06, 0.08), mat(cc[(i + j) % 4])), -0.3 + i * 0.12, 0.13 + j * 0.06, 0));
  }
  g.add(at(mesh(new THREE.BoxGeometry(0.1, 0.18, 0.18), mat(0xf0f0f0)), 0.38, 0.19, 0));
  return g;
}

// ---- the eras: a texture, where on the Earth to show, and props at (u across, v up) of the section
const ERAS = {
  magma: {
    tex: 'toy_magma.jpg', lon: 0, emissive: 0.4, label: '4,500 Ma', name: 'Magma ocean',
    props: [[volcano, 0.35, 0.45, 1.0], [volcano, 0.7, 0.3, 0.7], [rock, 0.55, 0.7, 0.6], [impactor, 0.6, 0.9, 0.9, { lift: 0.55, tilt: 0.8 }]],
  },
  cambrian: {
    tex: 'p500_albedo.jpg', lon: 160, label: '500 Ma', name: 'Cambrian seas',
    props: [[trilobite, 0.45, 0.4, 1.1], [stromatolite, 0.75, 0.55, 0.8], [stromatolite, 0.2, 0.6, 0.6], [sponge, 0.62, 0.2, 0.8], [jelly, 0.3, 0.8, 0.8, { lift: 0.08 }]],
  },
  cretaceous: {
    tex: 'p100_albedo.jpg', lon: -30, label: '100 Ma', name: 'Cretaceous',
    props: [[sauropod, 0.4, 0.4, 0.75], [trex, 0.75, 0.6, 0.6], [fern, 0.15, 0.55, 0.8], [conifer, 0.9, 0.3, 0.7], [fern, 0.6, 0.2, 0.6], [pterosaur, 0.55, 0.85, 0.45, { lift: 0.35 }]],
  },
  iceage: {
    tex: 'toy_iceage.jpg', lon: -20, label: '20 ka', name: 'Ice Age',
    props: [[mammoth, 0.45, 0.5, 0.8], [camp, 0.75, 0.3, 0.9], [conifer, 0.15, 0.4, 0.7, { snow: true }], [conifer, 0.88, 0.65, 0.6, { snow: true }]],
  },
  rome: {
    tex: 'now_albedo.jpg', lon: 14, people: true, label: '120 CE', name: 'Rome',
    props: [[colosseum, 0.4, 0.55, 0.8], [temple, 0.72, 0.35, 0.7], [aqueduct, 0.1, 0.25, 0.7], [galley, 0.65, 0.8, 0.6], [cypress, 0.2, 0.7, 0.6], [cypress, 0.9, 0.6, 0.6]],
  },
  today: {
    tex: 'now_albedo.jpg', lon: -85, lights: true, label: 'Today', name: 'Today',
    props: [[city, 0.45, 0.45, 0.85], [turbine, 0.8, 0.6, 0.6], [turbine, 0.88, 0.45, 0.5], [ship, 0.2, 0.3, 0.6], [plane, 0.5, 0.9, 0.5, { lift: 0.4 }], [satellite, 0.3, 0.95, 0.5, { lift: 0.75 }]],
  },
};
const eraList = P.eras.split(',');

// ---- the layers on the cut faces, outermost first; the core is the sources
const LAYERS = [
  { name: 'people', c: 0xe2a94a, r: 1.0 },
  { name: 'life', c: 0x4fae6e, r: 0.9 },
  { name: 'climate', c: 0x4f8fd0, r: 0.8 },
  { name: 'terrain', c: 0xc06a44, r: 0.7 },
  { name: 'plates', c: 0x7a5fb8, r: 0.6 },
  { name: 'sources', c: 0xffffff, r: 0.48, core: true },
];
function layerMat(L) {
  return L.core ? mat(L.c, { map: coreTex, emissive: 0xffffff, emissiveMap: coreTex, emissiveIntensity: 0.9, side: THREE.DoubleSide, flatShading: false })
    : mat(L.c, { side: THREE.DoubleSide, roughness: 0.85, flatShading: false });
}

// a half-disk face in the meridian plane at azimuth phi, its layers as half-rings
function meridianFace(phi, scale = 1) {
  const g = new THREE.Group();
  LAYERS.forEach((L, i) => {
    const rin = (LAYERS[i + 1]?.r ?? 0) * scale;
    const geo = new THREE.RingGeometry(rin, L.r * scale, 64, 1, -Math.PI / 2, Math.PI);
    const m = mesh(geo, layerMat(L));
    m.castShadow = false;
    g.add(m);
  });
  g.rotation.y = Math.PI + phi;
  return g;
}

// a disk at height y cut through the shells
function levelFace(y) {
  const g = new THREE.Group();
  LAYERS.forEach((L, i) => {
    const ro = L.r * L.r - y * y;
    if (ro <= 0) return;
    const ri2 = (LAYERS[i + 1]?.r ?? 0) ** 2 - y * y;
    const geo = new THREE.RingGeometry(ri2 > 0 ? Math.sqrt(ri2) : 0, Math.sqrt(ro), 96, 1);
    const m = mesh(geo, layerMat(L));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.castShadow = false;
    g.add(m);
  });
  return g;
}

// ---- textures
const loader = new THREE.TextureLoader();
const texCache = {};
async function tex(name) {
  if (!texCache[name]) {
    texCache[name] = loader.loadAsync(`./tex/${name}`).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    });
  }
  return texCache[name];
}

async function surfaceMat(era, midPhi) {
  const e = ERAS[era];
  const base = (await tex(e.tex)).clone();
  // turn the texture so the era's chosen longitude sits on the section's middle
  base.offset.x = lonToU(e.lon) - midPhi / (2 * Math.PI);
  base.needsUpdate = true;
  const o = { map: base, roughness: 0.9, flatShading: false };
  if (e.emissive) { o.emissive = 0xffffff; o.emissiveMap = base; o.emissiveIntensity = e.emissive; }
  if (e.lights) {
    const l = (await tex('now_lights.png')).clone();
    l.offset.x = base.offset.x; l.needsUpdate = true;
    o.emissive = 0xffc070; o.emissiveMap = l; o.emissiveIntensity = 0.7;
  }
  if (e.people) {
    const pp = (await tex('L_people.jpg')).clone();
    pp.offset.x = base.offset.x; pp.needsUpdate = true;
    o.emissive = 0xffffff; o.emissiveMap = pp; o.emissiveIntensity = 0.12;
  }
  const m = new THREE.MeshStandardMaterial(o);
  if (P.sat !== 1) m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { float l = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114)); diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, ${P.sat.toFixed(2)}); }`);
  };
  return m;
}

// three's partial spheres run their uvs 0..1 over the part; put them back on the whole map
function sphere(phiStart, phiLen, thetaStart, thetaLen, ws, hs) {
  const geo = new THREE.SphereGeometry(1, ws, hs, phiStart, phiLen, thetaStart, thetaLen);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const phi = phiStart + uv.getX(i) * phiLen;
    const theta = thetaStart + (1 - uv.getY(i)) * thetaLen;
    uv.setXY(i, phi / (2 * Math.PI), 1 - theta / Math.PI);
  }
  return geo;
}

function place(group, obj, dir, s, opt = {}) {
  const up = new THREE.Vector3(0, 1, 0);
  // upright: props stand toward the world's up rather than out from the centre, like on a tabletop
  const stand = dir.clone().lerp(standUp, P.upright).normalize();
  obj.quaternion.setFromUnitVectors(up, stand);
  obj.rotateY(opt.yaw ?? 0);
  if (opt.tilt) obj.rotateZ(opt.tilt);
  obj.position.copy(dir.clone().multiplyScalar(0.995 + (opt.lift ?? 0)));
  obj.scale.multiplyScalar(s * 0.22 * P.prop);
  group.add(obj);
}

// yaw each prop so its long side shows to the camera, roughly
function yawToCamera(dir) {
  const up = dir.clone().lerp(standUp, P.upright).normalize();
  const toCam = camera.position.clone().sub(dir).projectOnPlane(up).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  const localX = new THREE.Vector3(0, 0, 1).applyQuaternion(q);   // the prop's +z, which their sides face
  let a = Math.atan2(new THREE.Vector3().crossVectors(localX, toCam).dot(up), localX.dot(toCam));
  return a;
}

function addProps(group, era, uvToDir) {
  for (const [fn, u, v, s, opt = {}] of ERAS[era].props) {
    const d = uvToDir(u, v);
    const obj = opt.snow ? fn(undefined, true) : fn();
    place(group, obj, d, s, { ...opt, yaw: (opt.yaw ?? 0) + yawToCamera(d) });
  }
}

// ---- layouts
const world = new THREE.Group();
scene.add(world);

// a raised seam along a meridian, where two times meet
function seam(phi) {
  const pts = [];
  for (let t = 0; t <= 64; t++) pts.push(dirOf(phi, (t / 64) * Math.PI).multiplyScalar(1.003));
  const m = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 128, P.seams * 0.012, 6, false),
    mat(0xf3ead6, { roughness: 0.5, emissive: 0xf3ead6, emissiveIntensity: 0.0, flatShading: false }));
  return m;
}

// a flat label floating off the rim: the era's date and name
function eraLabel(era, phi) {
  const e = ERAS[era];
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const x = c.getContext('2d');
  x.textAlign = 'center';
  x.fillStyle = P.bg === 'paper' ? '#2a2420' : '#f3ead6';
  x.font = '600 64px "Helvetica Neue", Arial, sans-serif';
  x.fillText(e.label, 256, 70);
  x.globalAlpha = 0.7;
  x.font = '500 34px "Helvetica Neue", Arial, sans-serif';
  x.fillText(e.name.toUpperCase().split('').join(String.fromCharCode(8202)), 256, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  sp.position.copy(dirOf(phi, (90 - P.labelLat) * deg).multiplyScalar(P.labelR));
  sp.scale.set(0.5 * P.labelS, 0.156 * P.labelS, 1);
  return sp;
}

async function wedges() {
  const n = eraList.length;
  const span = P.span * deg / n;
  const g0 = camPhi + P.start * deg;
  for (let i = 0; i < n; i++) {
    const era = eraList[i];
    const p0 = g0 + i * span, p1 = p0 + span, mid = (p0 + p1) / 2;
    const grp = new THREE.Group();
    const sc = 1 + P.grow * i;
    const shell = sphere(p0, span, 0, Math.PI, Math.max(8, Math.round(span / deg)), 96);
    const sm = await surfaceMat(era, mid);
    const surf = mesh(shell, sm);
    surf.castShadow = false;
    grp.add(surf);
    if (P.faces) { grp.add(meridianFace(p0)); grp.add(meridianFace(p1)); }
    if (P.seams) grp.add(seam(p0));
    if (P.labels) grp.add(eraLabel(era, mid));
    addProps(grp, era, (u, v) => dirOf(p0 + (0.14 + 0.72 * u) * span, (90 - (P.pLat0 + (P.pLat1 - P.pLat0) * v)) * deg));
    grp.scale.setScalar(sc);
    const out = new THREE.Vector3(-Math.cos(mid), 0, Math.sin(mid));
    let push = P.explode + (i === P.pull ? P.pullBy : 0);
    grp.position.copy(out.multiplyScalar(push));
    grp.position.y += P.rise * i;
    if (i === P.pull) {
      // the pulled slice turns about its own outward point and lifts, to show a cut face
      const pivot = new THREE.Group();
      pivot.position.copy(grp.position);
      if (q.has('slice')) {
        // where the slice floats, in the camera's frame: right, up, toward
        const [sx, sy, sz] = list('slice');
        const right = new THREE.Vector3().crossVectors(camDir.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
        const up = new THREE.Vector3().crossVectors(right, camDir.clone().negate()).normalize();
        pivot.position.set(0, 0, 0).addScaledVector(right, sx).addScaledVector(up, sy).addScaledVector(camDir, sz);
        // undo the wedge's own direction so turn is measured from facing the camera
      }
      grp.position.set(0, 0, 0);
      pivot.add(grp);
      pivot.rotation.y = P.turn * deg;
      pivot.position.y += P.lift;
      world.add(pivot);
      continue;
    }
    world.add(grp);
  }
}

async function bands() {
  const cuts = P.bands.map((x) => x * deg);
  const n = cuts.length - 1;
  // north first in the cuts; the eras run oldest first, so the oldest goes to the bottom
  for (let i = 0; i < n; i++) {
    const era = eraList[n - 1 - i];
    const t0 = cuts[i], t1 = cuts[i + 1];
    const grp = new THREE.Group();
    const tw = (i - (n - 1) / 2) * P.twist * deg;
    const geo = sphere(0, Math.PI * 2, t0, t1 - t0, 160, Math.max(8, Math.round((t1 - t0) / deg)));
    const surf = mesh(geo, await surfaceMat(era, camPhi - tw));
    surf.castShadow = false;
    grp.add(surf);
    if (t0 > 0) grp.add(levelFace(Math.cos(t0)));
    if (t1 < Math.PI) grp.add(levelFace(Math.cos(t1)));
    const lat0 = 90 - t1 / deg, lat1 = 90 - t0 / deg;
    addProps(grp, era, (u, v) => {
      const lat = lat0 + (0.2 + 0.6 * v) * (lat1 - lat0);
      return dirOf(camPhi - tw + (u - 0.5) * P.pSpread * deg, (90 - lat) * deg);
    });
    grp.rotation.y = tw;
    grp.position.y = (n - 1 - i - (n - 1) / 2) * P.gap;
    world.add(grp);
  }
}

const coreTex = await tex('toy_magma.jpg');
if (P.layout === 'bands') await bands(); else await wedges();

// ---- render
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(P.w, P.h, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
if (P.bloom > 0) composer.addPass(new UnrealBloomPass(new THREE.Vector2(P.w, P.h), P.bloom, 0.5, 0.85));
composer.addPass(new OutputPass());
composer.render();
console.log('rendered');
window.__ready = true;
