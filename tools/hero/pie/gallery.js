// A gallery of one module's props, each scaled to the same height, lit as the pie is.
//   gallery.html?mod=early                  every prop in pie/props-early.js
//   gallery.html?mod=early&only=trilobite   one, large
//   gallery.html?mod=early&w=900&h=600      small: about the size they will have in the hero
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mulberry } from './kit.js';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') || 1800), H = Number(q.get('h') || 1200);
const mod = q.get('mod') || 'early';
const only = q.get('only');
const elev = Number(q.get('elev') || 22);
const seed = Number(q.get('seed') || 1);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2340);

const lib = (await import(`./props-${mod}.js`)).default;
const names = only ? [only] : Object.keys(lib);
const flat = new Set((await import(`./props-${mod}.js`)).flat || []);
const cols = Math.ceil(Math.sqrt(names.length * W / H));
const rows = Math.ceil(names.length / cols);
const cell = 1.7;

const ground = new THREE.Mesh(new THREE.PlaneGeometry(cols * cell + 2, rows * cell + 2), new THREE.MeshStandardMaterial({ color: 0x8a9a6a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

names.forEach((name, i) => {
  const c = i % cols, r = Math.floor(i / cols);
  const x = (c - (cols - 1) / 2) * cell, z = (r - (rows - 1) / 2) * cell * 0.9;
  const obj = lib[name](mulberry(seed * 977 + i));
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = flat.has(name) ? 1.2 / Math.max(size.x, size.z) : 1 / Math.max(size.y, 1e-6);
  obj.scale.multiplyScalar(s);
  obj.position.set(x, -box.min.y * s, z);
  scene.add(obj);
  // its name, on a card in front
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#f3ead6'; g.font = '600 36px Helvetica, Arial'; g.textAlign = 'center';
  g.fillText(name, 256, 44);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, toneMapped: false }));
  sp.scale.set(1.2, 0.15, 1);
  sp.position.set(x, 0.1, z + 0.72);
  scene.add(sp);
});

const span = Math.max(cols * cell / (W / H), rows * cell * 0.9) * 0.62 + 0.4;
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);
const d = span / Math.tan(15 * Math.PI / 180);
camera.position.set(0, Math.sin(elev * Math.PI / 180) * d + 0.5, Math.cos(elev * Math.PI / 180) * d);
camera.lookAt(0, 0.45, 0);

const sun = new THREE.DirectionalLight(0xfff1dc, 3.4);
sun.position.set(-6, 9, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x4a3a30, 1.4));

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.25, 0.5, 0.85));
composer.addPass(new OutputPass());
composer.render();
let tris = 0;
scene.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
console.log(`rendered ${names.length} props, ${Math.round(tris)} triangles`);
window.__ready = true;
