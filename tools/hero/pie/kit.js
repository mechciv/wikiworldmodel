// The kit the pie's props are built with. Every prop is a function (rng) => THREE.Group that stands
// on y = 0 with its front toward +z and its up +y. Size doesn't matter: the scene scales each prop
// to the height it wants. See pie/README.md for the rules.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export { THREE, RoundedBoxGeometry, mergeGeometries };

// a seeded random number in [0, 1)
export function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (rng, xs) => xs[Math.floor(rng() * xs.length) % xs.length];
export const range = (rng, lo, hi) => lo + (hi - lo) * rng();

// materials are cached by colour and options, so a thousand trees share one
const cache = new Map();
export function mat(color, o = {}) {
  const key = String(color) + JSON.stringify(o);
  if (!cache.has(key)) {
    const { flat = false, ...rest } = o;
    cache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, flatShading: flat, ...rest }));
  }
  return cache.get(key);
}
// a material that gives off light (lava, fire, windows at night); bloom picks it up
export const glow = (color, k = 2.5) => mat(color, { emissive: color, emissiveIntensity: k });

export function mesh(geo, m) {
  const x = new THREE.Mesh(geo, m);
  x.castShadow = true;
  x.receiveShadow = true;
  return x;
}
export function at(o, x = 0, y = 0, z = 0) { o.position.set(x, y, z); return o; }
export function rot(o, x = 0, y = 0, z = 0) { o.rotation.set(x, y, z); return o; }
export function scl(o, x = 1, y = x, z = x) { o.scale.set(x, y, z); return o; }
export function group(...kids) { const g = new THREE.Group(); for (const k of kids) g.add(k); return g; }

// a chain of spheres along a curve, tapering from r0 to r1: necks, tails, trunks, tentacles
export function chain(points, r0, r1, m, n = 14, seg = 10) {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = mesh(new THREE.SphereGeometry(r0 + (r1 - r0) * t, seg, Math.max(4, seg >> 1)), m);
    s.position.copy(curve.getPoint(t));
    g.add(s);
  }
  return g;
}

// a tapering tube along a curve: a smooth neck, a tail, a branch, a road
export function taper(points, r0, r1, m, segs = 24, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  // scale each ring from r0 to r1
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, r = r0 + (r1 - r0) * t, c = curve.getPointAt(t);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return mesh(geo, m);
}

// a solid of revolution from [radius, height] pairs, bottom first
export function lathe(profile, m, seg = 24) {
  return mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), m);
}

// an extruded 2D outline, [x, y] pairs, given depth along z, centred on z
export function extrude(outline, depth, m, bevel = 0) {
  const s = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
  geo.translate(0, 0, -depth / 2);
  return mesh(geo, m);
}

export const box = (w, h, d, m, r = 0) => {
  const x = mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), m);
  return x;
};
// a box standing on y = 0
export const block = (w, h, d, m, r = 0) => at(box(w, h, d, m, r), 0, h / 2, 0);
export const ball = (r, m, seg = 16) => mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), m);
export const cyl = (r0, r1, h, m, seg = 16) => mesh(new THREE.CylinderGeometry(r1, r0, h, seg), m);   // r0 at the bottom
export const cone = (r, h, m, seg = 16) => mesh(new THREE.ConeGeometry(r, h, seg), m);

// a canvas texture, drawn by f(ctx, w, h)
export function canvasTex(w, h, f, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  f(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}

// a few shared colours, so the eras agree with each other
export const C = {
  bone: 0xf1e8d4, marble: 0xf2ede2, limestone: 0xe6d3a3, sandstone: 0xd9b27c, mudbrick: 0xb98a5a,
  terracotta: 0xc0583a, timber: 0x7a5232, thatch: 0xc9a85a, iron: 0x3a3c40, steel: 0xb8c2cc,
  glass: 0x8fb4cc, brick: 0x9c4a32, leaf: 0x3f8a3a, pine: 0x2c5e3a, fern: 0x5a9a3a, grass: 0x8aa84a,
  lava: 0xff6a1a, rock: 0x4a403a, basalt: 0x2e2a2a, ice: 0xe8f2fa, snow: 0xf6f9fb, water: 0x2e6a9a,
  skin: 0xc69a7a, cloth: 0xa83a2a, gold: 0xd8b84a,
};
