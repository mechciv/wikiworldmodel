// The industrial revolution (about 1850) and today: mills, terraces and railways; glass towers,
// suburbs, highways, turbines, ships, aircraft and spacecraft. Each factory is (rng) => THREE.Group,
// standing on y = 0 with its front (a facade, a vehicle's profile) toward +z; vehicles travel along +x.
// Every model is merged into one mesh per material before it is returned (bake), since the scatter
// models are drawn by the hundred. See pie/README.md for the rules.
import {
  THREE, RoundedBoxGeometry, mergeGeometries, mulberry, pick, range, mat, glow, mesh, at, rot, scl, group,
  taper, lathe, extrude, box, cyl, cone, ball, canvasTex, C,
} from './kit.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- helpers

// a box with rounded edges in 108 triangles: the toy look, cheap enough for scatter
const rbox = (w, h, d, m, r = 0.02) => mesh(new RoundedBoxGeometry(w, h, d, 1, r), m);
// a box standing on y0 at (x, z)
const slab = (w, h, d, m, x = 0, y0 = 0, z = 0) => at(box(w, h, d, m), x, y0 + h / 2, z);
// a flat card facing +z: windows, doors, signs, in two triangles
const card = (w, h, m) => mesh(new THREE.PlaneGeometry(w, h), m);
// a card lying on the ground, facing up
const floorCard = (w, d, m) => rot(card(w, d, m), -Math.PI / 2, 0, 0);
// a card facing -z or ±x
const cardBack = (w, h, m) => rot(card(w, h, m), 0, Math.PI, 0);
const cardX = (w, h, m, s = 1) => rot(card(w, h, m), 0, (s * Math.PI) / 2, 0);
// a thin rod from a to b: rigging, cables, struts
function rod(a, b, r, m, seg = 4) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const o = mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), seg, 1, true), m);
  o.position.copy(A).add(B).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return o;
}
// a disc facing up
const disc = (r, m, seg = 12) => rot(mesh(new THREE.CircleGeometry(r, seg), m), -Math.PI / 2, 0, 0);

// a gable roof along x: a wall-coloured triangular prism under two slate slopes that overhang it
function gable(len, dep, h, wallM, roofM, over = 0.02, t = 0.012) {
  const g = group();
  g.add(rot(extrude([[-dep / 2, 0], [dep / 2, 0], [0, h]], len, wallM), 0, Math.PI / 2, 0));
  const s = Math.hypot(dep / 2, h), a = Math.atan2(h, dep / 2);
  for (const k of [1, -1]) {
    const sl = box(len + over, t, s + over, roofM);
    sl.rotation.x = k * a;
    sl.position.set(0, h / 2 + (Math.cos(a) * t) / 2 - (Math.sin(a) * over) / 2, k * (dep / 4 + (Math.sin(a) * t) / 2 + (Math.cos(a) * over) / 2));
    g.add(sl);
  }
  return g;
}

// a ship's plan from its +z half, stern (x min, z = 0) to bow (x max, z = 0)
function plan(half, sx = 1, sz = 1) {
  const p = half.map(([x, z]) => [x * sx, z * sz]);
  const full = p.concat(p.slice(1, -1).reverse().map(([x, z]) => [x, -z]));
  return new THREE.Shape(full.map(([x, z]) => new THREE.Vector2(x, z)));
}
// a plan shape extruded up from y0 to y1
function riser(shape, y0, y1, m) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 6 });
  geo.rotateX(Math.PI / 2);   // the shape's y → z, its depth → -y
  geo.translate(0, y1, 0);
  return mesh(geo, m);
}

// smoke or steam: puffs along a curve, swelling from r0 to r1 and thinning at the far end
function plume(rng, pts, r0, r1, n, ms, o = {}) {
  const { detail = 1, lo = false, fade = 0, billow = 0, squash = 0.85 } = o;
  const g = group();
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const puff = (r, m) => scl(mesh(lo ? new THREE.SphereGeometry(r, 7, 5) : new THREE.IcosahedronGeometry(r, detail), m), 1, squash, 1);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    let r = r0 + (r1 - r0) * Math.sqrt(t);
    if (fade && t > 1 - fade) r *= 1 - (0.45 * (t - (1 - fade))) / fade;
    const p = curve.getPoint(t);
    const m = Array.isArray(ms) ? ms[Math.min(ms.length - 1, Math.floor(t * ms.length))] : ms;
    const j = () => (rng() - 0.5) * r * 0.45;
    g.add(at(puff(r * range(rng, 0.88, 1.12), m), p.x + j(), p.y + j(), p.z + j()));
    for (let b = 0; b < (t > 0.25 ? billow : 0); b++) {
      const a = rng() * TAU, rr = r * range(rng, 0.5, 0.72);
      g.add(at(puff(rr, m), p.x + Math.cos(a) * r * 0.7, p.y + (rng() - 0.3) * r * 0.6, p.z + Math.sin(a) * r * 0.7));
    }
  }
  return g;
}

// lift a model so its lowest point is at y = 0
function ground(g) {
  const b = new THREE.Box3().setFromObject(g);
  for (const k of g.children) k.position.y -= b.min.y;
  return g;
}

// merge a model's meshes into one per material
function bake(g) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), byMat = new Map();
  g.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.clearGroups();
    geo.applyMatrix4(inv.clone().multiply(o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(geo);
  });
  const out = new THREE.Group();
  for (const [m, geos] of byMat) {
    const x = mesh(mergeGeometries(geos), m);
    if (m.transparent || m.emissiveIntensity > 1.5) x.castShadow = false;
    out.add(x);
  }
  return out;
}

// ---------------------------------------------------------------- textures, made once

const made = new Map();
const once = (key, f) => { if (!made.has(key)) made.set(key, f()); return made.get(key); };
const shade = (c, k) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();

// a glass tower's facade: 8 bays by 16 floors to a tile; steel mullions and spandrels round tinted glass
function towerMat(c, quiet = false) {
  return once('tower' + c + quiet, () => {
    const r = mulberry(c % 9973);
    const map = canvasTex(256, 512, (x, w, h) => {
      x.fillStyle = '#c3c9d0'; x.fillRect(0, 0, w, h);
      for (let j = 0; j < 16; j++) {
        x.fillStyle = shade(c, 0.45); x.fillRect(0, j * 32 + 26, w, 6);
        for (let i = 0; i < 8; i++) {
          const k = quiet ? 0.95 + 0.1 * r() : 0.8 + 0.35 * r();
          const gr = x.createLinearGradient(0, j * 32, 0, j * 32 + 26);
          gr.addColorStop(0, shade(c, k * 1.35)); gr.addColorStop(1, shade(c, k * 0.75));
          x.fillStyle = gr; x.fillRect(i * 32 + 3, j * 32 + 2, 26, 24);
        }
      }
    });
    return new THREE.MeshStandardMaterial({ map, emissiveMap: litMap(), emissive: 0xffffff, emissiveIntensity: quiet ? 0.3 : 0.55, roughness: 0.3, metalness: 0.1 });
  });
}
// which windows are lit: the same 8 by 16 tile, warm offices and a few cool ones
function litMap() {
  return once('lit', () => canvasTex(256, 512, (x, w, h) => {
    const r = mulberry(1851);
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    for (let j = 0; j < 16; j++) {
      const busy = r();
      for (let i = 0; i < 8; i++) if (r() < busy * 0.75) {
        const b = 0.5 + 0.5 * r(), warm = r() < 0.72;
        x.fillStyle = warm ? `rgb(${(255 * b) | 0},${(192 * b) | 0},${(112 * b) | 0})` : `rgb(${(196 * b) | 0},${(220 * b) | 0},${(255 * b) | 0})`;
        x.fillRect(i * 32 + 3, j * 32 + 2, 26, 24);
      }
    }
  }));
}
// a box whose sides' uvs repeat a facade tile (bu bays by bv floors) at the given bay and floor size
function facade(w, h, d, m, bay, floor, bu, bv, u0 = 0, v0 = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv, n = uv.count / 6, span = [d, d, 0, 0, w, w];
  for (let f = 0; f < 6; f++) for (let k = f * n; k < (f + 1) * n; k++) {
    if (!span[f]) uv.setXY(k, 0.004, 0.996);
    else uv.setXY(k, u0 + (uv.getX(k) * span[f]) / bay / bu, v0 + (uv.getY(k) * h) / floor / bv);
  }
  return mesh(geo, m);
}
// the same round a cylinder
function drum(rad, h, m, bay, floor, bu, bv, u0 = 0, v0 = 0, seg = 12) {
  const geo = new THREE.CylinderGeometry(rad, rad, h, seg, 1, true);
  const uv = geo.attributes.uv, k = (TAU * rad) / bay / bu;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * k, v0 + (uv.getY(i) * h) / floor / bv);
  return mesh(geo, m);
}
// a block of flats: wall with framed windows, tinted by the material's colour; 8 by 8 to a tile
function flatMat(c) {
  const maps = once('flats', () => ({
    map: canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = '#f6f4f0'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#cfcac2'; for (let j = 0; j < 8; j++) x.fillRect(0, j * 32 + 29, w, 3);
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        x.fillStyle = '#e2ded6'; x.fillRect(i * 32 + 5, j * 32 + 5, 22, 21);
        x.fillStyle = '#3a4452'; x.fillRect(i * 32 + 7, j * 32 + 7, 18, 17);
      }
    }),
    lit: canvasTex(256, 256, (x, w, h) => {
      const r = mulberry(1966);
      x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (r() < 0.38) {
        const b = 0.55 + 0.45 * r();
        x.fillStyle = `rgb(${(255 * b) | 0},${(186 * b) | 0},${(100 * b) | 0})`;
        x.fillRect(i * 32 + 7, j * 32 + 7, 18, 17);
      }
    }),
  }));
  return once('flat' + c, () => new THREE.MeshStandardMaterial({ color: c, map: maps.map, emissiveMap: maps.lit, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.85 }));
}
// a shipping container's corrugated steel, tinted by its colour
function boxMat(c) {
  const map = once('ribs', () => canvasTex(64, 32, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#c2c2c2'; for (let i = 0; i < w; i += 5) x.fillRect(i, 0, 2, h);
    x.fillStyle = '#7c7c7c'; x.fillRect(0, 0, w, 2); x.fillRect(0, h - 2, w, 2); x.fillRect(0, 0, 2, h); x.fillRect(w - 2, 0, 2, h);
  }));
  return once('box' + c, () => new THREE.MeshStandardMaterial({ color: c, map, roughness: 0.65 }));
}
// a photovoltaic module: blue cells in a silver frame
function solarMat() {
  return once('solar', () => new THREE.MeshStandardMaterial({
    map: canvasTex(128, 128, (x, w, h) => {
      x.fillStyle = '#c9cfd6'; x.fillRect(0, 0, w, h);
      const gr = x.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, '#3463a8'); gr.addColorStop(1, '#1c3a72');
      x.fillStyle = gr; x.fillRect(4, 4, w - 8, h - 8);
      x.fillStyle = 'rgba(170,200,240,0.6)';
      for (let i = 1; i < 6; i++) x.fillRect(4 + (i * (w - 8)) / 6 - 1, 4, 2, h - 8);
      for (let j = 1; j < 10; j++) x.fillRect(4, 4 + (j * (h - 8)) / 10 - 1, w - 8, 2);
    }),
    roughness: 0.25, metalness: 0.3,
  }));
}
// the space station's arrays: amber cells
function arrayMat() {
  return once('isspv', () => new THREE.MeshStandardMaterial({
    map: canvasTex(64, 256, (x, w, h) => {
      const r = mulberry(1998);
      x.fillStyle = '#4a3418'; x.fillRect(0, 0, w, h);
      for (let j = 0; j < 32; j++) for (let i = 0; i < 4; i++) {
        const k = 0.85 + 0.25 * r();
        x.fillStyle = `rgb(${Math.min(255, 214 * k) | 0},${(140 * k) | 0},${(52 * k) | 0})`;
        x.fillRect(i * 16 + 1, j * 8 + 1, 14, 6);
      }
    }),
    roughness: 0.35, metalness: 0.25, emissive: 0x3a1e06, emissiveIntensity: 0.4,
  }));
}
// a football pitch, mown in stripes
function pitchMat() {
  return once('pitch', () => new THREE.MeshStandardMaterial({
    map: canvasTex(512, 320, (x, w, h) => {
      for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? '#3f9a42' : '#4cad4e'; x.fillRect((i * w) / 12, 0, w / 12 + 1, h); }
      x.strokeStyle = '#f4f8f0'; x.lineWidth = 5;
      x.strokeRect(22, 22, w - 44, h - 44);
      x.beginPath(); x.moveTo(w / 2, 22); x.lineTo(w / 2, h - 22); x.stroke();
      x.beginPath(); x.arc(w / 2, h / 2, 44, 0, TAU); x.stroke();
      x.strokeRect(22, h / 2 - 82, 72, 164); x.strokeRect(w - 94, h / 2 - 82, 72, 164);
      x.strokeRect(22, h / 2 - 36, 26, 72); x.strokeRect(w - 48, h / 2 - 36, 26, 72);
    }),
    roughness: 0.9,
  }));
}

// ---------------------------------------------------------------- materials

const BRICKS = [0x9c4a32, 0x8c4430, 0xa9583a];
const DOORS = [0x2b5c8c, 0x8c2b2b, 0x2b6b3d, 0x2a2a2e, 0xd2a63c];
const GLASS = [0x6e9cc6, 0x4a8e9e, 0xa8875a, 0x9eb0c4, 0x3e5a7c, 0x84bccc, 0x7a8a9e];
const CARS = [0xc8382e, 0x2f6fb4, 0xe8b830, 0xf0f0ea, 0x3a9a7a, 0xe07a2a, 0x8a8f98, 0x2a2c30];
const M = {
  stone: mat(0xddd0b2), slate: mat(0x4f5b69), slateFlat: mat(0x4f5b69, { flat: true }), soot: mat(0x29282b),
  sootBrick: mat(0x4a2e26), brickDark: mat(0x7a3828), glassDark: mat(0x2b3846, { roughness: 0.3 }),
  lit: glow(0xffc46e, 0.9), skylight: mat(0x9cc8de, { roughness: 0.2 }), frame: mat(0xf2efe6),
  white: mat(0xe9e8e2), steel: mat(C.steel, { roughness: 0.4, metalness: 0.35 }), iron: mat(C.iron),
  concrete: mat(0xbdb8ac), asphalt: mat(0x3c4046, { roughness: 0.95 }), roof: mat(0x5c6068),
  smokeDark: mat(0x5e5c60, { roughness: 1 }), smoke: mat(0x7c7a7e, { roughness: 1 }), smokeLight: mat(0xa6a4a8, { roughness: 1 }),
  steam: mat(0xe4e2de, { roughness: 1 }),
  brass: mat(C.gold, { roughness: 0.35, metalness: 0.5 }), black: mat(0x26272b), timber: mat(C.timber),
  bark: mat(0x6a4a30), terracotta: mat(C.terracotta), line: mat(0xf0f0e6), houseBrick: mat(0x9c5038),
  lobby: mat(0x3a4048, { emissive: 0xffd08a, emissiveIntensity: 0.35 }), shop: mat(0x3a4048, { emissive: 0xffcf8a, emissiveIntensity: 0.4 }),
  carGlass: mat(0x3e5a78, { roughness: 0.15, metalness: 0.3 }), red: glow(0xff3020, 2), tail: glow(0xff2a1a, 1.5), head: glow(0xfff2c8, 2),
};

// ---------------------------------------------------------------- about 1850

// a mill chimney: square plinth, tapering round shaft with a stone band, sooty corbelled cap
function millStack(h, r, m) {
  const g = group();
  g.add(slab(r * 3.4, h * 0.07, r * 3.4, m));
  g.add(slab(r * 3.8, h * 0.012, r * 3.8, M.stone, 0, h * 0.07));
  g.add(lathe([[r * 1.35, h * 0.08], [r, h * 0.9]], m, 14));
  g.add(lathe([[r, h * 0.9], [r * 1.3, h * 0.935], [r * 1.3, h * 0.975], [r * 1.05, h * 0.985], [r * 0.82, h * 0.985]], M.sootBrick, 14));
  const yb = h * 0.62, rb = r * 1.35 - r * 0.35 * ((yb - h * 0.08) / (h * 0.82));
  g.add(lathe([[rb + 0.003, yb], [rb + 0.003, yb + h * 0.025]], M.stone, 14));
  g.add(at(disc(r * 0.82, M.soot, 10), 0, h * 0.984, 0));
  return g;
}

function factory(rng) {
  const g = group();
  const brick = mat(pick(rng, BRICKS)), win = () => (rng() < 0.4 ? M.lit : M.glassDark);

  // the mill: four storeys of five bays, its front to +z
  const x0 = -0.62, x1 = 0.18, z0 = -0.34, z1 = -0.06, H = 0.36, fh = 0.09;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  g.add(slab(W, H, D, brick, cx, 0, cz));
  g.add(slab(W + 0.014, 0.026, D + 0.014, M.stone, cx, 0, cz));
  for (let f = 1; f < 4; f++) g.add(slab(W + 0.008, 0.007, D + 0.008, M.stone, cx, f * fh - 0.0035, cz));
  g.add(slab(W + 0.022, 0.016, D + 0.022, M.stone, cx, H - 0.006, cz));
  const bays = 5, bw = W / bays;
  for (let b = 0; b <= bays; b++) g.add(slab(0.022, H - 0.03, 0.012, M.brickDark, x0 + b * bw, 0.024, z1 + 0.005));
  for (let b = 0; b < bays; b++) for (let f = 0; f < 4; f++) {
    const bx = x0 + (b + 0.5) * bw;
    if (f === 0 && b === 2) {
      g.add(slab(0.078, 0.088, 0.012, M.stone, bx, 0.0, z1 + 0.004));
      g.add(slab(0.056, 0.074, 0.014, mat(0x4a3424), bx, 0.0, z1 + 0.005));
      continue;
    }
    for (const s of [-1, 1]) g.add(at(box(0.04, 0.054, 0.01, win()), bx + s * bw * 0.22, f * fh + 0.053, z1 + 0.003));
  }
  for (let f = 0; f < 4; f++) for (const s of [-1, 1]) g.add(at(box(0.01, 0.054, 0.04, win()), x0 - 0.003, f * fh + 0.053, cz + s * 0.07));
  g.add(at(gable(W + 0.02, D + 0.03, 0.085, brick, M.slate, 0.02, 0.012), cx, H + 0.01, cz));

  // the stair tower, with a clock and a pyramid cap
  const tx = 0.255, tz = -0.2, tw = 0.13, th = 0.6;
  g.add(slab(tw, th, tw, brick, tx, 0, tz));
  g.add(slab(tw + 0.014, 0.026, tw + 0.014, M.stone, tx, 0, tz));
  g.add(slab(tw + 0.024, 0.018, tw + 0.024, M.stone, tx, th - 0.006, tz));
  g.add(at(rot(cone(tw * 0.8, 0.15, M.slateFlat, 4), 0, Math.PI / 4, 0), tx, th + 0.012 + 0.075, tz));
  g.add(at(cyl(0.004, 0.004, 0.07, M.iron, 4), tx, th + 0.012 + 0.15 + 0.025, tz));
  g.add(at(rot(cyl(0.038, 0.038, 0.008, mat(0xf4ecd6), 18), Math.PI / 2, 0, 0), tx, th - 0.08, tz + tw / 2 + 0.004));
  g.add(at(rot(box(0.005, 0.026, 0.004, M.black), 0, 0, 0.5), tx - 0.006, th - 0.08 + 0.011, tz + tw / 2 + 0.01));
  g.add(at(rot(box(0.005, 0.018, 0.004, M.black), 0, 0, -1.9), tx + 0.008, th - 0.08 - 0.003, tz + tw / 2 + 0.01));
  for (let i = 0; i < 4; i++) g.add(at(box(0.026, 0.05, 0.01, win()), tx, 0.07 + i * 0.105, tz + tw / 2 + 0.002));

  // the weaving shed: north-light saw-tooth roofs, glazing toward -x
  const sx0 = 0.34, n = 4, sw = 0.14, sH = 0.11, sT = 0.08, sz0 = -0.34, sz1 = 0.26, sD = sz1 - sz0, scz = (sz0 + sz1) / 2;
  const sx1 = sx0 + n * sw;
  const outline = [[sx0, 0], [sx1, 0], [sx1, sH]];
  for (let i = n - 1; i >= 0; i--) outline.push([sx0 + i * sw, sH + sT], [sx0 + i * sw, sH]);
  g.add(at(extrude(outline, sD, brick), 0, 0, scz));
  const s = Math.hypot(sw, sT), a = Math.atan2(sT, sw);
  for (let i = 0; i < n; i++) {
    const xa = sx0 + i * sw;
    g.add(at(rot(box(s + 0.012, 0.01, sD + 0.024, M.slateFlat), 0, 0, -a), xa + sw / 2 + Math.sin(a) * 0.005, sH + sT / 2 + Math.cos(a) * 0.005, scz));
    g.add(at(box(0.006, sT * 0.78, sD * 0.94, rng() < 0.45 ? M.lit : M.skylight), xa - 0.002, sH + sT * 0.46, scz));
  }
  g.add(slab(sx1 - sx0 + 0.01, 0.022, sD + 0.01, M.stone, (sx0 + sx1) / 2, 0, scz));
  for (let i = 0; i < 7; i++) g.add(at(box(0.034, 0.046, 0.01, win()), sx0 + 0.05 + i * 0.077, 0.062, sz1 + 0.003));

  // two or three chimneys behind, trailing smoke to the left
  const stacks = [[-0.17, -0.47, 1.0], [0.66, -0.46, 0.8]];
  if (rng() < 0.65) stacks.push([-0.52, -0.46, 0.66]);
  for (const [x, z, h] of stacks) {
    g.add(at(millStack(h, 0.03, brick), x, 0, z));
    const L = range(rng, 0.34, 0.46);
    g.add(plume(rng, [[x, h + 0.035, z], [x - 0.035, h + 0.11, z], [x - L * 0.45, h + 0.18, z - 0.03], [x - L, h + 0.22, z - 0.06]], 0.042, 0.105, 12, [M.smokeDark, M.smoke, M.smoke, M.smokeLight], { fade: 0.3, billow: 1 }));
  }
  g.position.set(-0.12, 0, 0.1);
  return bake(group(g));
}

function chimney(rng) {
  const g = group();
  const m = mat(pick(rng, BRICKS)), r = range(rng, 0.055, 0.068);
  g.add(slab(r * 3.2, 0.06, r * 3.2, m));
  g.add(lathe([[r * 1.4, 0.06], [r, 0.9], [r * 1.3, 0.935], [r * 1.3, 0.97], [r * 0.85, 0.978]], m, 8));
  const rb = r * 1.4 - r * 0.4 * ((0.62 - 0.06) / 0.84);
  g.add(lathe([[rb + 0.003, 0.62], [rb + 0.003, 0.645]], M.stone, 8));
  g.add(at(disc(r * 0.85, M.soot, 8), 0, 0.976, 0));
  const L = range(rng, 0.3, 0.4);
  g.add(plume(rng, [[0, 1.03, 0], [-0.05, 1.1, 0], [-L * 0.55, 1.16, -0.02], [-L, 1.19, -0.04]], 0.07, 0.13, 5, [M.smokeDark, M.smoke, M.smokeLight], { lo: true }));
  return bake(g);
}

function terraceHouses(rng) {
  const g = group();
  const n = 3 + Math.floor(rng() * 3), hw = 0.2, W = n * hw, D = 0.26, H = 0.34, rh = 0.12;
  const brick = mat(pick(rng, BRICKS)), zf = D / 2 + 0.002;
  g.add(slab(W, H, D, brick));
  g.add(at(gable(W, D, rh, brick, M.slate, 0.024, 0.012), 0, H, 0));
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * hw, s = i % 2 ? 1 : -1;
    g.add(at(card(0.05, 0.1, mat(pick(rng, DOORS))), x + s * 0.05, 0.05, zf));
    g.add(at(card(0.064, 0.078, M.frame), x - s * 0.035, 0.1, zf));
    g.add(at(card(0.05, 0.064, rng() < 0.4 ? M.lit : M.glassDark), x - s * 0.035, 0.1, zf + 0.001));
    for (const k of [-1, 1]) {
      g.add(at(card(0.052, 0.074, M.frame), x + k * 0.045, 0.245, zf));
      g.add(at(card(0.04, 0.06, rng() < 0.3 ? M.lit : M.glassDark), x + k * 0.045, 0.245, zf + 0.001));
    }
  }
  for (let i = 0; i <= n; i++) {
    const x = Math.max(-W / 2 + 0.03, Math.min(W / 2 - 0.03, -W / 2 + i * hw));
    g.add(slab(0.056, rh * 0.55 + 0.06, 0.086, brick, x, H + rh * 0.45, 0));
    for (const k of [-1, 1]) g.add(at(mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.032, 5, 1, true), M.terracotta), x + k * 0.014, H + rh + 0.076, 0));
  }
  return bake(g);
}

// ---- the train

const TR = {
  green: mat(0x2c7a4c), black: mat(0x28292d), smokebox: mat(0x34353a), red: mat(0xb3382c),
  copper: mat(0xc8763c, { roughness: 0.35, metalness: 0.45 }), maroon: mat(0x6c2a26), cream: mat(0xeee2c6),
  roof: mat(0x606366), coal: mat(0x1d1d21, { flat: true }), rod: mat(0xc8ccd2, { roughness: 0.3, metalness: 0.6 }),
};

// a spoked wheel facing +z, axle along z: rim, spokes and hub in its colour over a dark disc
function wheel(r, w, m, spokes = 8, seg = 16) {
  const g = group();
  g.add(rot(lathe([[r * 0.8, -w / 2], [r, -w / 2], [r, w / 2], [r * 0.8, w / 2], [r * 0.8, -w / 2]], m, seg), Math.PI / 2, 0, 0));
  g.add(at(rot(cyl(r * 0.82, r * 0.82, w * 0.3, TR.black, 10), Math.PI / 2, 0, 0), 0, 0, -w * 0.25));
  for (let i = 0; i < spokes / 2; i++) g.add(rot(box(r * 0.14, r * 1.62, w * 0.5, m), 0, 0, (i * TAU) / spokes));
  g.add(rot(cyl(r * 0.24, r * 0.24, w * 0.9, m, 8), Math.PI / 2, 0, 0));
  return g;
}
function wheels(g, xs, r, zw, m, spokes, seg) {
  for (const s of [-1, 1]) for (const x of xs) g.add(at(rot(wheel(r, 0.018, m, spokes, seg), 0, s < 0 ? Math.PI : 0, 0), x, r, s * zw));
}
function buffers(g, x, s) {
  for (const z of [-0.075, 0.075]) {
    g.add(at(rot(cyl(0.011, 0.011, 0.04, TR.black, 8), 0, 0, Math.PI / 2), x + s * 0.02, 0.08, z));
    g.add(at(rot(cyl(0.02, 0.02, 0.008, TR.black, 12), 0, 0, Math.PI / 2), x + s * 0.042, 0.08, z));
  }
}

function locomotive(rng) {
  const g = group();
  const { green, black, red } = TR;
  const by = 0.19, br = 0.07, zw = 0.088;
  g.add(slab(0.58, 0.05, 0.13, red, 0, 0.05, 0));
  g.add(slab(0.62, 0.014, 0.226, black, 0, 0.104, 0));
  g.add(slab(0.62, 0.016, 0.228, red, 0, 0.09, 0));
  g.add(slab(0.026, 0.06, 0.236, red, 0.31, 0.05, 0));
  buffers(g, 0.31, 1);
  // boiler with brass bands, smokebox and its door
  g.add(at(rot(cyl(br, br, 0.34, green, 22), 0, 0, Math.PI / 2), 0.03, by, 0));
  for (const x of [-0.12, -0.02, 0.08, 0.18]) g.add(at(rot(cyl(br + 0.003, br + 0.003, 0.008, M.brass, 22), 0, 0, Math.PI / 2), x, by, 0));
  g.add(at(rot(cyl(br + 0.005, br + 0.005, 0.1, TR.smokebox, 22), 0, 0, Math.PI / 2), 0.25, by, 0));
  g.add(at(rot(cyl(br * 0.86, br * 0.86, 0.014, black, 22), 0, 0, Math.PI / 2), 0.306, by, 0));
  g.add(at(ball(0.009, M.brass, 8), 0.315, by, 0));
  g.add(slab(0.1, by - 0.148, 0.12, TR.smokebox, 0.25, 0.118, 0));
  // copper-capped chimney, dome, safety valve
  const cy0 = by + br - 0.012;
  g.add(at(lathe([[0.024, 0], [0.019, 0.05], [0.019, 0.086]], black, 16), 0.255, cy0, 0));
  g.add(at(lathe([[0.0185, 0.084], [0.027, 0.098], [0.031, 0.11], [0.025, 0.115], [0.018, 0.113]], TR.copper, 16), 0.255, cy0, 0));
  g.add(at(disc(0.018, M.soot, 10), 0.255, cy0 + 0.112, 0));
  g.add(at(lathe([[0.034, 0], [0.034, 0.024], [0.027, 0.044], [0.014, 0.055], [0, 0.058]], M.brass, 16), 0.05, by + br - 0.014, 0));
  g.add(at(lathe([[0.016, 0], [0.016, 0.012], [0.011, 0.03], [0.014, 0.036], [0, 0.04]], M.brass, 12), -0.1, by + br - 0.008, 0));
  // the cab
  const cx = -0.215;
  g.add(slab(0.17, 0.2, 0.22, green, cx, 0.118, 0));
  for (const z of [-1, 1]) g.add(at(box(0.075, 0.075, 0.004, black), cx + 0.01, 0.27, z * 0.111));
  for (const z of [-1, 1]) g.add(at(rot(cyl(0.017, 0.017, 0.006, M.lit, 12), 0, 0, Math.PI / 2), cx + 0.086, 0.29, z * 0.055));
  g.add(at(rbox(0.22, 0.018, 0.25, black, 0.008), cx - 0.005, 0.328, 0));
  // outside cylinders, wheels with splashers, rods
  for (const s of [-1, 1]) g.add(at(rot(cyl(0.028, 0.028, 0.11, green, 14), 0, 0, Math.PI / 2), 0.205, 0.075, s * 0.128));
  const drivers = [-0.03, -0.205], lead = [0.245, 0.15];
  wheels(g, drivers, 0.078, zw, red, 10, 18);
  wheels(g, lead, 0.042, zw, red, 8, 14);
  const a0 = Math.asin(0.04 / 0.088), arc = [], rim = [];
  for (let k = 0; k <= 12; k++) {
    const a = a0 + ((Math.PI - 2 * a0) * k) / 12;
    arc.push([Math.cos(a) * 0.088, Math.sin(a) * 0.088]);
    rim.push([Math.cos(a) * 0.094, Math.sin(a) * 0.094]);
  }
  const crank = rng() * TAU, px = Math.cos(crank) * 0.03, py = Math.sin(crank) * 0.03;
  for (const s of [-1, 1]) {
    for (const x of drivers) {
      g.add(at(extrude(arc, 0.026, green), x, 0.078, s * zw));
      g.add(at(extrude(rim, 0.02, M.brass), x, 0.078, s * zw));
    }
    g.add(at(box(drivers[0] - drivers[1] + 0.02, 0.012, 0.006, TR.rod), (drivers[0] + drivers[1]) / 2 + px, 0.078 + py, s * (zw + 0.016)));
    const ax = 0.15, ay = 0.075, bx = drivers[0] + px, byy = 0.078 + py;
    g.add(at(rot(box(Math.hypot(ax - bx, ay - byy), 0.01, 0.006, TR.rod), 0, 0, Math.atan2(ay - byy, ax - bx)), (ax + bx) / 2, (ay + byy) / 2, s * (zw + 0.026)));
  }
  // a lamp on the buffer beam
  g.add(slab(0.022, 0.026, 0.026, M.white, 0.3, 0.118, 0));
  g.add(at(rot(cyl(0.008, 0.008, 0.004, M.head, 10), 0, 0, Math.PI / 2), 0.312, 0.131, 0));
  return g;
}

function tender(rng) {
  const g = group();
  g.add(slab(0.31, 0.045, 0.13, TR.red, 0, 0.05, 0));
  g.add(slab(0.33, 0.014, 0.21, TR.black, 0, 0.095, 0));
  g.add(at(rbox(0.32, 0.12, 0.2, TR.green, 0.012), 0, 0.169, 0));
  g.add(slab(0.322, 0.008, 0.202, M.brass, 0, 0.218, 0));
  for (let i = 0; i < 6; i++) {
    const r = range(rng, 0.045, 0.06);
    g.add(at(scl(rot(mesh(new THREE.IcosahedronGeometry(r, 0), TR.coal), rng(), rng(), 0), 1, 0.5, 1), range(rng, -0.1, 0.1), 0.232, range(rng, -0.05, 0.05)));
  }
  wheels(g, [-0.1, 0, 0.1], 0.045, 0.088, TR.red, 6, 12);
  buffers(g, -0.165, -1);
  return g;
}

function carriage(rng) {
  const g = group();
  const L = 0.42;
  g.add(slab(L - 0.02, 0.03, 0.13, TR.black, 0, 0.07, 0));
  g.add(at(rbox(L, 0.09, 0.19, TR.maroon, 0.01), 0, 0.145, 0));
  g.add(at(rbox(L, 0.075, 0.19, TR.cream, 0.01), 0, 0.2275, 0));
  g.add(slab(L + 0.002, 0.006, 0.192, M.brass, 0, 0.187, 0));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) g.add(at(box(0.044, 0.042, 0.004, rng() < 0.5 ? M.lit : M.glassDark), -0.175 + i * 0.07, 0.228, s * 0.096));
    for (const x of [-0.14, 0, 0.14]) g.add(at(box(0.05, 0.068, 0.003, mat(0x56201d)), x, 0.143, s * 0.0955));
  }
  g.add(at(scl(rot(cyl(0.115, 0.115, L + 0.012, TR.roof, 18), 0, 0, Math.PI / 2), 0.3, 1, 1), 0, 0.262, 0));
  for (const x of [-0.13, 0, 0.13]) g.add(at(cyl(0.012, 0.01, 0.022, TR.black, 8), x, 0.302, 0));
  wheels(g, [-0.135, 0.135], 0.045, 0.088, TR.red, 6, 12);
  buffers(g, L / 2 - 0.01, 1);
  buffers(g, -L / 2 + 0.01, -1);
  return g;
}

function steamTrain(rng) {
  const g = group();
  const lx = 0.855, cars = [-0.055, -0.505, -0.955];
  g.add(at(locomotive(rng), lx, 0, 0));
  g.add(at(tender(rng), 0.355, 0, 0));
  for (const x of cars) g.add(at(carriage(rng), x, 0, 0));
  for (const x of [0.535, 0.17, -0.28, -0.73]) g.add(slab(0.05, 0.016, 0.02, TR.black, x, 0.072, 0));
  // the plume, blown back over the train
  const cx = lx + 0.255, cy = 0.38;
  g.add(plume(rng, [[cx, cy, 0], [cx - 0.03, cy + 0.09, 0], [cx - 0.2, cy + 0.17, -0.02], [cx - 0.5, cy + 0.22, -0.05], [cx - 0.85, cy + 0.25, -0.08], [cx - 1.2, cy + 0.26, -0.1]], 0.045, 0.125, 22, M.steam, { fade: 0.4, billow: 1 }));
  for (const s of [1, -1]) g.add(plume(rng, [[1.1, 0.04, s * 0.15], [1.2, 0.035, s * 0.22]], 0.022, 0.038, 3, M.steam));
  return bake(g);
}

function railTrack(rng) {
  const g = group();
  const L = 2, gauge = 0.07;
  g.add(rot(extrude([[-0.15, 0], [0.15, 0], [0.105, 0.028], [-0.105, 0.028]], L, mat(0x8f877c, { flat: true })), 0, Math.PI / 2, 0));
  const sleeper = mat(0x5c4430);
  for (let x = -L / 2 + 0.03; x < L / 2; x += 0.068) g.add(slab(0.036, 0.012, 0.19, sleeper, x + (rng() - 0.5) * 0.004, 0.026, 0));
  for (const s of [-1, 1]) {
    g.add(slab(L, 0.012, 0.012, mat(0x5e4c42), 0, 0.038, s * gauge));
    g.add(slab(L, 0.005, 0.013, mat(0xd2d6da, { roughness: 0.3, metalness: 0.6 }), 0, 0.05, s * gauge));
  }
  return bake(g);
}

function steamship(rng) {
  const g = group();
  const half = [[-1, 0], [-0.99, 0.08], [-0.93, 0.13], [-0.8, 0.15], [0.5, 0.15], [0.78, 0.125], [0.97, 0.065], [1.1, 0]];
  const white = M.white, cream = mat(0xf0e6cc);
  g.add(riser(plan(half, 0.985, 0.95), 0, 0.035, mat(0xa8352c)));
  g.add(riser(plan(half), 0.035, 0.17, M.black));
  g.add(riser(plan(half, 1.003, 1.03), 0.13, 0.143, white));
  g.add(riser(plan(half, 0.975, 0.92), 0.17, 0.176, mat(0xc9a878)));
  const bul = plan(half); bul.holes.push(new THREE.Path(plan(half, 0.99, 0.9).getPoints()));
  g.add(riser(bul, 0.17, 0.2, M.black));
  // the deckhouse, with lifeboats on its sides
  g.add(at(rbox(0.66, 0.05, 0.13, white, 0.012), 0.02, 0.201, 0));
  for (let i = 0; i < 9; i++) {
    const x = -0.26 + i * 0.07;
    if (Math.abs(x) < 0.08) continue;
    g.add(at(card(0.024, 0.018, rng() < 0.5 ? M.lit : M.glassDark), x, 0.204, 0.0662));
    g.add(at(cardBack(0.024, 0.018, M.glassDark), x, 0.204, -0.0662));
  }
  for (const x of [-0.36, 0.38]) for (const s of [-1, 1]) g.add(at(rbox(0.1, 0.024, 0.036, white, 0.01), x, 0.24, s * 0.095));
  // paddle boxes, black with a gilt fan, and the bridge between them
  const D = [[0.115, 0.04]], Rim = [[0.121, 0.04]];
  for (let k = 0; k <= 14; k++) { const a = (k * Math.PI) / 14; D.push([Math.cos(a) * 0.115, 0.1 + Math.sin(a) * 0.115]); Rim.push([Math.cos(a) * 0.121, 0.1 + Math.sin(a) * 0.121]); }
  D.push([-0.115, 0.04]); Rim.push([-0.121, 0.04]);
  for (const s of [-1, 1]) {
    g.add(at(extrude(D, 0.06, M.black), 0, 0, s * 0.18));
    g.add(at(extrude(Rim, 0.05, M.brass), 0, 0, s * 0.18));
    for (let k = 1; k < 8; k++) {
      const a = (k * Math.PI) / 8;
      g.add(at(rot(box(0.075, 0.006, 0.004, M.brass), 0, 0, a), Math.cos(a) * 0.05, 0.1 + Math.sin(a) * 0.05, s * 0.211));
    }
    g.add(at(rot(cyl(0.016, 0.016, 0.004, M.brass, 12), Math.PI / 2, 0, 0), 0, 0.1, s * 0.211));
  }
  g.add(slab(0.04, 0.008, 0.44, white, 0, 0.222, 0));
  for (const s of [-1, 1]) g.add(slab(0.04, 0.02, 0.004, white, 0, 0.23, s * 0.21));
  // funnels, raked aft
  const fc = mat(pick(rng, [0xd2522c, 0xd8a050, 0xc8442c]));
  const funnels = [0.25, -0.24];
  for (const x of funnels) {
    const f = group();
    f.add(at(cyl(0.044, 0.04, 0.3, fc, 18), 0, 0.15, 0));
    f.add(at(cyl(0.0455, 0.0455, 0.06, M.black, 18), 0, 0.272, 0));
    f.add(at(cyl(0.0445, 0.0445, 0.012, M.black, 18), 0, 0.17, 0));
    f.add(at(disc(0.04, M.soot, 12), 0, 0.301, 0));
    f.scale.set(1, 1, 0.8); f.rotation.z = 0.12;
    g.add(at(f, x, 0.2, 0));
  }
  // masts with furled yards, shrouds, a bowsprit, a jib and a spanker
  const timber = M.timber, rope = mat(0x3a3430);
  const masts = [[0.64, 0.98], [-0.6, 0.92]];
  for (const [mx, top] of masts) {
    const lean = -0.05;
    g.add(rod([mx, 0.17, 0], [mx + lean, top, 0], 0.008, timber, 6));
    const yAt = (f) => [mx + lean * f, 0.17 + (top - 0.17) * f];
    for (const [f, len] of [[0.48, 0.34], [0.66, 0.28], [0.82, 0.2]]) {
      const [x, y] = yAt(f);
      g.add(rod([x, y, -len / 2], [x, y, len / 2], 0.005, timber, 5));
      g.add(rod([x + 0.004, y - 0.008, -len / 2.3], [x + 0.004, y - 0.008, len / 2.3], 0.009, cream, 6));
    }
    const [hx, hy] = yAt(0.86);
    for (const s of [-1, 1]) for (const dx of [-0.05, 0, 0.05]) g.add(rod([hx, hy, 0], [mx + dx, 0.2, s * 0.15], 0.0022, rope, 3));
  }
  g.add(rod([1.04, 0.19, 0], [1.3, 0.3, 0], 0.007, timber, 6));
  const [jx, jy] = [0.64 - 0.05 * 0.84, 0.17 + 0.81 * 0.84];
  g.add(extrude([[1.28, 0.3], [jx, jy], [0.72, 0.25]], 0.004, cream));
  g.add(rod([1.29, 0.3, 0], [jx, jy, 0], 0.0025, rope, 3));
  const sx = -0.6 - 0.05 * 0.2;
  g.add(extrude([[sx - 0.01, 0.27], [-0.6 - 0.05 * 0.7, 0.7], [-0.88, 0.5], [-0.9, 0.27]], 0.004, cream));
  g.add(rod([-0.64, 0.68, 0], [-0.92, 0.48, 0], 0.005, timber, 5));
  // the ensign
  g.add(rod([-0.98, 0.19, 0], [-1.02, 0.36, 0], 0.004, timber, 4));
  g.add(at(box(0.07, 0.045, 0.003, mat(0xb8282a)), -1.055, 0.33, 0));
  // coal smoke from both funnels
  for (const x of funnels) {
    const fx = x - 0.036, fy = 0.52;
    g.add(plume(rng, [[fx, fy, 0], [fx - 0.04, fy + 0.07, 0], [fx - 0.25, fy + 0.14, -0.03], [fx - 0.55, fy + 0.18, -0.06]], 0.04, 0.095, 12, [M.smokeDark, M.smokeDark, M.smoke, M.smokeLight], { fade: 0.35, billow: 1 }));
  }
  return bake(g);
}

// ---------------------------------------------------------------- today

const CROWN = [0x9fe3ff, 0xffd27a, 0xe8f2ff, 0xff9ad0];

function skyscraper(rng) {
  const g = group();
  const c = pick(rng, GLASS), fm = towerMat(c);
  const W = range(rng, 0.16, 0.26), D = W * range(rng, 0.72, 1), H = range(rng, 0.62, 1);
  const bay = 0.026, fl = 0.022, u0 = Math.floor(rng() * 8) / 8, v0 = Math.floor(rng() * 16) / 16;
  const tower = (w, h, d, y0) => at(facade(w, h, d, fm, bay, fl, 8, 16, u0, v0 + y0 / fl / 16), 0, y0 + h / 2, 0);
  const cap = (w, d, y) => slab(w + 0.012, 0.012, d + 0.012, M.steel, 0, y, 0);
  const fins = (w, d, y0, h) => { for (const a of [-1, 1]) for (const b of [-1, 1]) g.add(slab(0.012, h, 0.012, M.steel, (a * w) / 2, y0, (b * d) / 2)); };
  const kind = pick(rng, ['flat', 'flat', 'setback', 'setback', 'round', 'slant', 'pyramid', 'spire']);
  if (kind === 'round') {
    const R = W * 0.56;
    g.add(at(cyl(R * 1.12, R * 1.12, 0.04, M.lobby, 14), 0, 0.02, 0));
    g.add(at(drum(R, H, fm, bay, fl, 8, 16, u0, v0, 14), 0, H / 2, 0));
    g.add(at(cyl(R + 0.008, R + 0.008, 0.014, M.steel, 14), 0, H + 0.007, 0));
    g.add(at(cyl(R * 0.6, R * 0.66, 0.05, M.roof, 12), 0, H + 0.039, 0));
    if (rng() < 0.6) g.add(at(cyl(R + 0.003, R + 0.003, 0.014, glow(pick(rng, CROWN), 1.2), 14), 0, H - 0.03, 0));
    g.add(at(cyl(0.004, 0.004, 0.1, M.steel, 4), 0, H + 0.11, 0));
    return bake(g);
  }
  g.add(slab(W * 1.14, 0.04, D * 1.14, M.lobby));
  if (kind === 'setback') {
    const tiers = [[1, 0.5], [0.76, 0.78], [0.52, 1]];
    let y0 = 0;
    for (const [k, f] of tiers) {
      g.add(tower(W * k, H * f - y0, D * k, y0));
      fins(W * k, D * k, y0, H * f - y0);
      g.add(cap(W * k, D * k, H * f));
      y0 = H * f + 0.012;
    }
    if (rng() < 0.6) g.add(at(cone(W * 0.12, 0.16, M.steel, 6), 0, H + 0.012 + 0.08, 0));
  } else if (kind === 'slant') {
    const h = H * 0.84;
    g.add(tower(W, h, D, 0)); fins(W, D, 0, h);
    g.add(at(extrude([[-W / 2, 0], [W / 2, 0], [-W / 2, H - h]], D, mat(c, { roughness: 0.25, metalness: 0.2, emissive: 0x404858, emissiveIntensity: 0.3, flat: true })), 0, h, 0));
    g.add(at(rot(box(Math.hypot(W, H - h) + 0.01, 0.008, D + 0.012, M.steel), 0, 0, -Math.atan2(H - h, W)), 0, h + (H - h) / 2, 0));
  } else if (kind === 'pyramid') {
    const h = H * 0.84;
    g.add(tower(W, h, D, 0)); fins(W, D, 0, h); g.add(cap(W, D, h));
    const p = rot(cone(W * 0.72, H - h + 0.04, mat(c, { roughness: 0.2, emissive: c, emissiveIntensity: 0.5, flat: true }), 4), 0, Math.PI / 4, 0);
    g.add(at(scl(group(p), 1, 1, D / W), 0, h + 0.012 + (H - h + 0.04) / 2, 0));
  } else if (kind === 'spire') {
    const h = H * 0.86;
    g.add(tower(W, h, D, 0)); fins(W, D, 0, h); g.add(cap(W, D, h));
    g.add(tower(W * 0.62, H * 0.06, D * 0.62, h + 0.012)); g.add(cap(W * 0.62, D * 0.62, h + 0.012 + H * 0.06));
    g.add(at(cone(W * 0.1, 0.2, M.steel, 6), 0, h + 0.024 + H * 0.06 + 0.1, 0));
    g.add(at(ball(0.008, M.red, 6), 0, h + 0.024 + H * 0.06 + 0.2, 0));
  } else {
    g.add(tower(W, H, D, 0)); fins(W, D, 0, H); g.add(cap(W, D, H));
    g.add(slab(W * 0.5, 0.04, D * 0.5, M.roof, 0, H + 0.012, 0));
    if (rng() < 0.55) g.add(at(cyl(0.004, 0.004, 0.14, M.steel, 4), W * 0.12, H + 0.052 + 0.07, 0));
    if (rng() < 0.5) g.add(slab(W + 0.004, 0.014, D + 0.004, glow(pick(rng, CROWN), 1.1), 0, H - 0.035, 0));
  }
  return bake(g);
}

function landmarkTower(rng) {
  const g = group();
  const fm = towerMat(0xa9c0d4, true), bay = 0.018, fl = 0.012, y0 = 0.02;
  g.add(at(cyl(0.23, 0.23, y0, mat(0xcfc8b8), 6), 0, y0 / 2, 0));
  const tiers = [[0.14, 0.17], [0.12, 0.31], [0.1, 0.44], [0.078, 0.55], [0.058, 0.645]];   // a wing's reach and top
  for (let k = 0; k < 3; k++) {
    const phi = Math.PI / 2 + (k * TAU) / 3, dx = Math.cos(phi), dz = Math.sin(phi), ry = Math.atan2(dx, dz);
    tiers.forEach(([L, top], j) => {
      const w = 0.07 * (1 - j * 0.045), h = top + k * 0.03;
      g.add(at(rot(facade(w, h, L, fm, bay, fl, 8, 16, 0.125 * j, 0), 0, ry, 0), (dx * L) / 2, y0 + h / 2, (dz * L) / 2));
      g.add(at(drum(w / 2, h, fm, bay, fl, 8, 16, 0, 0, 12), dx * L, y0 + h / 2, dz * L));
      g.add(at(rot(box(w + 0.006, 0.008, L + 0.004, M.steel), 0, ry, 0), (dx * L) / 2, y0 + h + 0.004, (dz * L) / 2));
      g.add(at(cyl(w / 2 + 0.003, w / 2 + 0.003, 0.008, M.steel, 12), dx * L, y0 + h + 0.004, dz * L));
    });
  }
  let y = y0;
  for (const [r, y1] of [[0.05, 0.8], [0.038, 0.9], [0.028, 0.96]]) {
    g.add(at(drum(r, y1 - y, fm, bay, fl, 8, 16, 0, 0, 14), 0, (y + y1) / 2, 0));
    g.add(at(cyl(r + 0.004, r + 0.004, 0.008, M.steel, 14), 0, y1 + 0.004, 0));
    y = y1 + 0.008;
  }
  g.add(at(cyl(0.041, 0.041, 0.012, glow(0x9fe3ff, 1.4), 14), 0, 0.88, 0));
  g.add(at(cone(0.021, 0.34, M.steel, 10), 0, y + 0.17, 0));
  g.add(at(cyl(0.0025, 0.0025, 0.05, M.steel, 4), 0, y + 0.34 + 0.02, 0));
  g.add(at(ball(0.008, M.red, 8), 0, y + 0.39, 0));
  return bake(g);
}

function apartmentBlock(rng) {
  const g = group();
  const floors = 6 + Math.floor(rng() * 5), fh = 0.068, W = range(rng, 0.42, 0.62), D = range(rng, 0.2, 0.26);
  const c = pick(rng, [0xece2cc, 0xd8a682, 0xbcccd6, 0xdcd8d0, 0xbcc8a4, 0xe4c890, 0xc8b8d8]);
  const base = 0.065, H = base + floors * fh, cols = Math.max(4, Math.round(W / 0.06));
  g.add(slab(W + 0.012, base, D + 0.012, M.shop));
  g.add(at(facade(W, floors * fh, D, flatMat(c), W / cols, fh, 8, 8, Math.floor(rng() * 8) / 8, Math.floor(rng() * 8) / 8), 0, base + (floors * fh) / 2, 0));
  if (rng() < 0.65) {
    const rail = mat(0xa9c6d6, { roughness: 0.2 });
    for (let f = 0; f < floors; f++) {
      const y = base + f * fh;
      g.add(slab(W * 0.9, 0.01, 0.04, M.white, 0, y, D / 2 + 0.02));
      g.add(slab(W * 0.9, 0.024, 0.004, rail, 0, y + 0.01, D / 2 + 0.038));
    }
  } else {
    const core = mat(new THREE.Color(c).multiplyScalar(0.72).getHex());
    g.add(slab(0.07, H - base + 0.05, 0.024, core, W * range(rng, -0.2, 0.2), base, D / 2 + 0.012));
  }
  g.add(slab(W + 0.01, 0.014, D + 0.01, M.roof, 0, H));
  g.add(slab(0.1, 0.05, 0.08, M.concrete, W * 0.22, H + 0.014, -0.02));
  g.add(slab(0.06, 0.03, 0.05, M.steel, -W * 0.25, H + 0.014, 0.02));
  return bake(g);
}

function house(rng) {
  const g = group();
  const wall = mat(pick(rng, [0xf2e8d4, 0xead2b0, 0xcadae2, 0xf4f2ec, 0xd6e0c6, 0xeacabc]));
  const roofM = mat(pick(rng, [0xa84c38, 0x6c4c3c, 0x4e5a68, 0x8c3c32, 0x5a6a4a]));
  const W = range(rng, 0.36, 0.46), D = 0.28, H = 0.18, rh = range(rng, 0.12, 0.16), hx = -0.1, zf = D / 2 + 0.002;
  g.add(slab(W, H, D, wall, hx, 0, 0));
  g.add(at(gable(W, D, rh, wall, roofM, 0.04, 0.014), hx, H, 0));
  g.add(slab(0.045, rh * 0.6 + 0.05, 0.045, M.houseBrick, hx + W * 0.28, H + rh * 0.4, -0.05));
  g.add(at(card(0.058, 0.11, mat(pick(rng, DOORS))), hx - W * 0.1, 0.055, zf));
  for (const x of [hx - W * 0.32, hx + W * 0.2]) {
    g.add(at(card(0.084, 0.072, M.frame), x, 0.1, zf));
    g.add(at(card(0.07, 0.058, rng() < 0.45 ? M.lit : M.glassDark), x, 0.1, zf + 0.001));
  }
  // the tree
  const tx = hx + W / 2 + range(rng, 0.1, 0.14), tz = range(rng, -0.02, 0.08);
  const leaf = mat(pick(rng, [C.leaf, 0x4f9a3a, 0x3a7a3a, 0x6aa040]));
  g.add(at(cyl(0.017, 0.012, 0.13, M.bark, 5), tx, 0.065, tz));
  if (rng() < 0.3) {
    g.add(at(cone(0.1, 0.3, mat(C.pine), 8), tx, 0.25, tz));
  } else {
    const r = range(rng, 0.09, 0.12);
    g.add(at(scl(mesh(new THREE.IcosahedronGeometry(r, 1), leaf), 1, 1.1, 1), tx, 0.12 + r, tz));
    g.add(at(mesh(new THREE.IcosahedronGeometry(r * 0.66, 1), leaf), tx + r * 0.55, 0.11 + r * 0.6, tz + r * 0.25));
  }
  return bake(g);
}

// a toy car's body, cabin, roof and wheels, travelling +x
function carParts(g, m) {
  const tyre = mat(0x1e1e22);
  g.add(at(rbox(0.44, 0.08, 0.2, m, 0.03), 0, 0.072, 0));
  g.add(at(extrude([[-0.15, 0], [0.11, 0], [0.05, 0.058], [-0.11, 0.058]], 0.17, M.carGlass, 0.008), 0, 0.104, 0));
  g.add(at(rbox(0.17, 0.014, 0.188, m, 0.006), -0.03, 0.168, 0));
  for (const x of [-0.13, 0.13]) for (const z of [-1, 1]) g.add(at(rot(cyl(0.044, 0.044, 0.03, tyre, 8), Math.PI / 2, 0, 0), x, 0.044, z * 0.088));
  for (const z of [-1, 1]) {
    g.add(at(cardX(0.04, 0.02, M.head, 1), 0.221, 0.086, z * 0.065));
    g.add(at(cardX(0.04, 0.02, M.tail, -1), -0.221, 0.086, z * 0.065));
  }
}
function car(rng) {
  const g = group();
  carParts(g, mat(pick(rng, CARS)));
  return bake(g);
}
// a car for the highway and the bridge: two boxes and its lights
function miniCar(rng, s = 1) {
  const g = group();
  if (rng() < 0.18) {
    g.add(slab(0.2 * s, 0.05 * s, 0.05 * s, mat(pick(rng, [0xf0f0ea, 0xc8382e, 0x2f6fb4])), -0.03 * s, 0.006 * s));
    g.add(at(rbox(0.05 * s, 0.045 * s, 0.048 * s, mat(pick(rng, CARS)), 0.01 * s), 0.1 * s, 0.03 * s, 0));
  } else {
    const m = mat(pick(rng, CARS));
    g.add(slab(0.1 * s, 0.022 * s, 0.046 * s, m, 0, 0.004 * s));
    g.add(slab(0.05 * s, 0.018 * s, 0.04 * s, M.glassDark, -0.008 * s, 0.026 * s));
  }
  g.add(at(cardX(0.04 * s, 0.01 * s, M.head, 1), (rng() < 0.18 ? 0.126 : 0.051) * s, 0.016 * s, 0));
  return g;
}

function highway(rng) {
  const g = group();
  const L = 2, lw = 0.07, lanes = 3, cw = lanes * lw, sh = 0.022, med = 0.05, Wt = 2 * (cw + sh) + med, y = 0.0156;
  g.add(slab(L, 0.008, Wt + 0.06, mat(0x7f8f5c)));
  g.add(slab(L, 0.014, Wt, M.asphalt));
  g.add(slab(L, 0.018, med, mat(0x6a8a48)));
  g.add(slab(L, 0.02, 0.012, M.concrete, 0, 0.018, 0));
  for (const s of [-1, 1]) {
    const zc = s * (med / 2 + sh + cw / 2);
    for (const e of [-1, 1]) g.add(at(floorCard(L, 0.004, M.line), 0, y, zc + e * (cw / 2 + 0.005)));
    for (const k of [-1, 1]) for (let x = -L / 2 + 0.03; x < L / 2 - 0.04; x += 0.12) g.add(at(floorCard(0.06, 0.003, M.line), x + 0.03, y, zc + (k * lw) / 2));
    g.add(slab(L, 0.016, 0.006, M.steel, 0, 0.014, s * (Wt / 2 + 0.006)));
    // traffic: +x on the near side, -x on the far
    for (let i = 0; i < 6; i++) {
      const lane = Math.floor(rng() * 3), x = -0.86 + i * 0.34 + range(rng, -0.1, 0.1);
      const c = rot(miniCar(rng), 0, s > 0 ? 0 : Math.PI, 0);
      g.add(at(c, x, 0.014, zc + (lane - 1) * lw));
    }
  }
  // lights on the median and a gantry
  for (let x = -0.8; x <= 0.81; x += 0.4) {
    g.add(at(cyl(0.003, 0.004, 0.12, M.steel, 5), x, 0.098, 0));
    g.add(slab(0.006, 0.004, 0.09, M.steel, x, 0.155, 0));
    for (const s of [-1, 1]) g.add(slab(0.018, 0.006, 0.012, M.head, x, 0.15, s * 0.042));
  }
  return bake(g);
}

function bridge(rng) {
  const g = group();
  const red = mat(0xc4462f), T = 0.8, A = 1.3, dy = 0.22, cz = 0.12, dw = 0.105, ct = 1.04, DL = 2 * A + 0.1;
  // the deck: road on a stiffening truss
  g.add(slab(DL, 0.012, 2 * dw, M.asphalt, 0, dy, 0));
  g.add(slab(DL, 0.006, 2 * dw - 0.01, M.iron, 0, dy - 0.05, 0));
  for (const s of [-1, 1]) {
    const z = s * (dw - 0.004);
    g.add(slab(DL, 0.01, 0.01, red, 0, dy - 0.052, z));
    g.add(slab(DL, 0.012, 0.012, red, 0, dy - 0.008, z));
    g.add(slab(DL, 0.014, 0.004, red, 0, dy + 0.012, s * dw));
    for (let i = 0, x = -DL / 2 + 0.02; x < DL / 2 - 0.05; i++, x += 0.05) {
      g.add(rod([x, dy - 0.047, z], [x, dy - 0.008, z], 0.003, red));
      g.add(rod([x, i % 2 ? dy - 0.047 : dy - 0.008, z], [x + 0.05, i % 2 ? dy - 0.008 : dy - 0.047, z], 0.0028, red));
    }
    for (let x = -A + 0.1; x < A; x += 0.2) g.add(slab(0.008, 0.006, 0.006, M.head, x, dy + 0.026, s * dw));
  }
  // the towers
  for (const x of [-T, T]) {
    g.add(slab(0.17, 0.07, 0.36, M.concrete, x, 0, 0));
    for (const s of [-1, 1]) {
      const z = s * cz;
      g.add(slab(0.075, 0.38, 0.08, red, x, 0.07, z));
      g.add(slab(0.064, 0.3, 0.068, red, x, 0.45, z));
      g.add(slab(0.054, 0.27, 0.058, red, x, 0.75, z));
      g.add(slab(0.06, 0.02, 0.062, red, x, 1.02, z));
      g.add(at(ball(0.007, M.red, 6), x, 1.048, z));
    }
    for (const yy of [dy - 0.1, 0.5, 0.74, 0.96]) g.add(slab(0.05, 0.04, 2 * cz, red, x, yy, 0));
  }
  // cables and suspenders
  const low = dy + 0.03;
  const yMain = (x) => low + (ct - low) * (x / T) ** 2;
  const ySide = (x) => { const t = (Math.abs(x) - T) / (A - T); return ct + (dy + 0.03 - ct) * t - 0.05 * Math.sin(Math.PI * t); };
  for (const s of [-1, 1]) {
    const z = s * cz, pts = [];
    for (let i = 0; i <= 24; i++) { const x = -T + (2 * T * i) / 24; pts.push([x, yMain(x), z]); }
    g.add(taper(pts, 0.009, 0.009, red, 48, 6));
    for (const e of [-1, 1]) {
      const sp = [];
      for (let i = 0; i <= 6; i++) { const x = e * (T + ((A - T) * i) / 6); sp.push([x, ySide(x), z]); }
      g.add(taper(sp, 0.009, 0.009, red, 12, 6));
    }
    for (let x = -A + 0.06; x < A - 0.03; x += 0.06) {
      if (Math.abs(Math.abs(x) - T) < 0.03) continue;
      const yc = Math.abs(x) < T ? yMain(x) : ySide(x);
      if (yc - dy < 0.03) continue;
      g.add(rod([x, dy + 0.012, z], [x, yc, z], 0.0025, red, 4));
    }
  }
  for (const e of [-1, 1]) g.add(slab(0.2, dy + 0.02, 0.32, M.concrete, e * (A + 0.02), 0, 0));
  for (let i = 0; i < 5; i++) {
    const s = i % 2 ? 1 : -1;
    g.add(at(rot(miniCar(rng, 0.8), 0, s > 0 ? 0 : Math.PI, 0), range(rng, -1.1, 1.1), dy + 0.012, s * 0.05));
  }
  return bake(g);
}

function windTurbine(rng) {
  const g = group();
  const white = mat(0xf1f2ee), H = 0.72, hy = H + 0.018, hz = 0.06;
  g.add(slab(0.1, 0.02, 0.1, M.concrete));
  g.add(lathe([[0.03, 0.02], [0.018, H]], white, 10));
  g.add(at(rbox(0.058, 0.056, 0.13, white, 0.022), 0, hy, -0.012));
  g.add(at(rot(lathe([[0.03, 0], [0.028, 0.016], [0.018, 0.034], [0, 0.044]], white, 10), Math.PI / 2, 0, 0), 0, hy, hz - 0.01));
  const a0 = rng() * TAU;
  for (let k = 0; k < 3; k++) {
    const b = extrude([[-0.012, 0.02], [0.012, 0.02], [0.026, 0.07], [0.018, 0.16], [0.007, 0.4], [-0.002, 0.4], [-0.011, 0.12]], 0.007, white);
    g.add(at(rot(b, 0, 0, a0 + (k * TAU) / 3), 0, hy, hz));
  }
  return bake(g);
}

function solarArray(rng) {
  const g = group();
  const rows = 5, L = 1.5, d = 0.15, tilt = 0.5, gap = 0.22, pm = solarMat(), alu = M.steel;
  g.add(slab(L + 0.12, 0.004, rows * gap + 0.04, mat(0xb4ae94)));
  for (let r = 0; r < rows; r++) {
    const z = (r - (rows - 1) / 2) * gap, yc = 0.075;
    const geo = new THREE.BoxGeometry(L, 0.008, d), uv = geo.attributes.uv;
    for (let k = 8; k < 12; k++) uv.setXY(k, uv.getX(k) * (L / d), uv.getY(k));
    for (let k = 0; k < uv.count; k++) if (k < 8 || k >= 12) uv.setXY(k, 0.01, 0.01);
    g.add(at(rot(mesh(geo, pm), tilt, 0, 0), 0, yc, z));
    const fy = yc - (d / 2) * Math.sin(tilt), by = yc + (d / 2) * Math.sin(tilt), fz = z + (d / 2) * Math.cos(tilt) - 0.012, bz = z - (d / 2) * Math.cos(tilt) + 0.012;
    for (let x = -L / 2 + 0.06; x < L / 2; x += 0.27) {
      g.add(slab(0.008, fy, 0.008, alu, x, 0.004, fz));
      g.add(slab(0.008, by, 0.008, alu, x, 0.004, bz));
    }
  }
  g.add(slab(0.07, 0.06, 0.05, M.white, L / 2 + 0.02, 0.004, (rows / 2) * gap));
  return bake(g);
}

function containerShip(rng) {
  const g = group();
  const half = [[-1, 0], [-1, 0.12], [-0.97, 0.15], [0.52, 0.15], [0.78, 0.13], [0.96, 0.075], [1.06, 0.02], [1.07, 0]];
  g.add(riser(plan(half, 0.99, 0.96), 0, 0.035, mat(0xb0362c)));
  const hullM = mat(pick(rng, [0x1f3a5c, 0x26282c, 0x3a2a2a, 0x24483a]));
  g.add(riser(plan(half), 0.035, 0.15, hullM));
  g.add(riser(plan(half, 1.002, 1.02), 0.141, 0.15, M.white));
  g.add(riser(plan(half, 0.985, 0.94), 0.15, 0.156, mat(0x6e7a70)));
  // the accommodation and bridge, aft
  const ax = -0.8;
  g.add(slab(0.13, 0.26, 0.24, M.white, ax, 0.156, 0));
  g.add(slab(0.11, 0.036, 0.34, M.white, ax + 0.005, 0.416, 0));
  for (const y of [0.2, 0.25, 0.3, 0.35]) {
    g.add(at(cardX(0.2, 0.012, M.glassDark), ax + 0.0655, y, 0));
    for (const s of [1, -1]) g.add(at(s > 0 ? card(0.11, 0.012, M.lit) : cardBack(0.11, 0.012, M.glassDark), ax, y, s * 0.1205));
  }
  g.add(at(cardX(0.32, 0.016, M.glassDark), ax + 0.061, 0.434, 0));
  g.add(at(card(0.1, 0.014, M.glassDark), ax + 0.005, 0.434, 0.1705));
  g.add(rod([ax - 0.02, 0.452, 0], [ax - 0.02, 0.56, 0], 0.004, M.steel, 4));
  g.add(slab(0.008, 0.006, 0.07, M.steel, ax - 0.02, 0.52, 0));
  const fc = mat(pick(rng, [0x2f6fb0, 0xe07a26, 0xc23b2e, 0x2a9a98]));
  g.add(at(rbox(0.08, 0.3, 0.09, fc, 0.02), ax - 0.11, 0.156 + 0.15, 0));
  g.add(at(rbox(0.082, 0.04, 0.092, M.black, 0.015), ax - 0.11, 0.156 + 0.28, 0));
  // the forecastle and its breakwater
  g.add(riser(plan([[0.86, 0], [0.86, 0.11], [0.96, 0.072], [1.06, 0.02], [1.07, 0]], 1, 0.96), 0.15, 0.18, hullM));
  g.add(slab(0.012, 0.03, 0.27, M.white, 0.79, 0.156, 0));
  // containers in bays
  const BOXC = [0xc23b2e, 0x2f6fb0, 0xe07a26, 0x3c8a4a, 0xdcb22e, 0x2a9a98, 0xe6e6e0, 0x8a8f96, 0x8a2e3a, 0x4a5aa8];
  const bays = 13, pitch = 0.112, rows = 7, rz = 0.039, th = 0.04;
  for (let i = 0; i < bays; i++) {
    const x = -0.66 + i * pitch, narrow = x > 0.6, hb = 2 + Math.floor(rng() * 4);
    for (let k = 0; k < rows; k++) {
      const edge = k === 0 || k === rows - 1;
      if (narrow && edge) continue;
      const z = (k - (rows - 1) / 2) * rz;
      const n = Math.max(1, hb - (edge ? Math.floor(rng() * 2) : 0) - (rng() < 0.12 ? 1 : 0));
      for (let t = 0; t < n; t++) g.add(at(box(0.104, th - 0.003, rz - 0.003, boxMat(pick(rng, BOXC))), x, 0.156 + th / 2 + t * th, z));
    }
  }
  return bake(g);
}

function airliner(rng) {
  const g = group();
  const white = mat(0xe8eaec), livery = mat(pick(rng, [0x1f4a9a, 0xc0302a, 0x1a7a8a, 0x2a2a6a])), belly = mat(0xbcc4cc), wingM = mat(0xdfe3e8);
  const prof = [[0, 0], [0.014, 0.012], [0.03, 0.06], [0.044, 0.14], [0.054, 0.26], [0.056, 0.36], [0.056, 0.78], [0.053, 0.86], [0.045, 0.92], [0.033, 0.96], [0.017, 0.988], [0, 1.0]];
  // the fuselage, its tail swept up; a lathe along y turned to run along x, nose at +x
  const fus = (pts, m, phi0 = Math.PI, phiL = TAU, k = 1, seg = 28) => {
    const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r * k, y)), seg, phi0, phiL);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0.34) p.setX(i, p.getX(i) - 0.05 * ((0.34 - y) / 0.34) ** 1.5); }
    return at(rot(mesh(geo, m), 0, 0, -Math.PI / 2), -0.5, 0, 0);
  };
  g.add(fus(prof, white));
  const mid = prof.filter(([, y]) => y >= 0.14 && y <= 0.92);
  g.add(fus(mid, belly, Math.PI / 2 - 1.05, 2.1, 1.006, 12));
  for (const [a, b] of [[-0.27, -0.1], [Math.PI + 0.1, Math.PI + 0.27]]) g.add(fus(mid, livery, a, b - a, 1.008, 3));
  for (const [a, b] of [[-0.46, -0.35], [Math.PI + 0.35, Math.PI + 0.46]]) g.add(fus(prof.filter(([, y]) => y >= 0.2 && y <= 0.86), M.glassDark, a, b - a, 1.008, 2));
  g.add(fus([[0.0445, 0.925], [0.0395, 0.945], [0.034, 0.958]], M.glassDark, -Math.PI / 2 - 0.9, 1.8, 1.012, 8));
  // wings with a little dihedral and winglets
  for (const s of [1, -1]) {
    const w = extrude([[0.12, 0], [-0.17, 0.5], [-0.235, 0.5], [-0.135, 0.17], [-0.13, 0]], 0.012, wingM, 0.003);
    w.rotation.x = s * (Math.PI / 2 - 0.08);
    g.add(at(w, 0, -0.03, 0));
    const tip = [-0.2, -0.03 + 0.5 * Math.sin(0.08), s * 0.5 * Math.cos(0.08)];
    g.add(at(extrude([[0, 0], [0.05, 0], [0.015, 0.07], [-0.005, 0.07]], 0.006, livery), tip[0] - 0.03, tip[1], tip[2]));
    // the engine on its pylon
    const ez = s * 0.17;
    g.add(at(rot(lathe([[0.012, 0], [0.022, 0.02], [0.029, 0.07], [0.031, 0.13], [0.029, 0.165], [0.025, 0.17]], white, 16), 0, 0, -Math.PI / 2), -0.04, -0.085, ez));
    g.add(at(rot(disc(0.025, M.black, 14), 0, 0, -Math.PI / 2), 0.128, -0.085, ez));
    g.add(at(rot(lathe([[0.03, 0.13], [0.0315, 0.15], [0.028, 0.166]], livery, 16), 0, 0, -Math.PI / 2), -0.04, -0.085, ez));
    g.add(slab(0.09, 0.034, 0.008, wingM, 0.04, -0.062, ez));
  }
  // the fin and tailplanes
  g.add(extrude([[-0.47, 0.02], [-0.32, 0.02], [-0.45, 0.25], [-0.52, 0.25]], 0.01, livery, 0.002));
  for (const s of [1, -1]) {
    const t = extrude([[-0.36, 0], [-0.46, 0.17], [-0.5, 0.17], [-0.47, 0]], 0.008, white, 0.002);
    t.rotation.x = s * (Math.PI / 2 - 0.06);
    g.add(at(t, 0, 0.025, 0));
  }
  g.rotation.z = 0.05;
  return ground(bake(group(g)));
}

function satellite(rng) {
  const g = group();
  const gold = mat(0xd9a93e, { roughness: 0.38, metalness: 0.45, flat: true }), white = mat(0xdcdedf), by = 0.36;
  // the bus, wrapped in crinkled foil: corners move together, so the jitter is keyed by position
  const geo = new THREE.BoxGeometry(0.22, 0.28, 0.22, 3, 4, 3), p = geo.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(4)).join();
    if (!seen.has(key)) seen.set(key, [rng() - 0.5, rng() - 0.5, rng() - 0.5]);
    const [a, b, c] = seen.get(key);
    p.setXYZ(i, p.getX(i) + a * 0.012, p.getY(i) + b * 0.012, p.getZ(i) + c * 0.012);
  }
  geo.computeVertexNormals();
  g.add(at(mesh(geo, gold), 0, by, 0));
  g.add(slab(0.226, 0.012, 0.226, white, 0, by + 0.14));
  g.add(slab(0.18, 0.04, 0.01, white, 0, by - 0.12, -0.114));
  // solar wings on booms
  const pm = solarMat();
  for (const s of [-1, 1]) {
    g.add(rod([s * 0.11, by, 0], [s * 0.2, by, 0], 0.008, M.steel, 6));
    g.add(slab(0.014, 0.05, 0.014, M.steel, s * 0.2, by - 0.025, 0));
    for (let i = 0; i < 3; i++) g.add(at(box(0.16, 0.26, 0.008, pm), s * (0.29 + i * 0.172), by, 0));
    for (let i = 0; i < 2; i++) g.add(slab(0.012, 0.03, 0.012, M.steel, s * (0.376 + i * 0.172), by - 0.015, 0));
  }
  // the big dish, looking out and up; a small one and a whip antenna
  const dish = group();
  dish.add(lathe([[0, -0.008], [0.06, 0.002], [0.13, 0.034], [0.133, 0.042], [0.12, 0.038], [0.06, 0.008], [0, 0]], white, 24));
  dish.add(rod([0, 0, 0], [0, 0.1, 0], 0.004, M.steel, 4));
  dish.add(at(cyl(0.012, 0.008, 0.02, gold, 8), 0, 0.105, 0));
  for (const a of [0, TAU / 3, (2 * TAU) / 3]) dish.add(rod([Math.cos(a) * 0.12, 0.036, Math.sin(a) * 0.12], [0, 0.1, 0], 0.002, M.steel, 3));
  dish.rotation.set(1.15, 0, 0.35);
  g.add(at(scl(dish, 0.78), -0.035, by + 0.03, 0.125));
  const small = group();
  small.add(lathe([[0, -0.004], [0.05, 0.016], [0.046, 0.018], [0, 0]], white, 14));
  small.rotation.set(0.5, 0, -0.5);
  g.add(at(small, 0.06, by + 0.15, 0.02));
  g.add(rod([-0.08, by + 0.146, -0.06], [-0.1, by + 0.32, -0.08], 0.003, M.steel, 4));
  for (const a of [-1, 1]) for (const b of [-1, 1]) g.add(at(rot(cone(0.012, 0.03, M.iron, 8), Math.PI, 0, 0), a * 0.08, by - 0.155, b * 0.08));
  return ground(bake(g));
}

function iss(rng) {
  const g = group();
  const silver = mat(0xd4d8dc, { roughness: 0.5, metalness: 0.3 }), white = mat(0xeeeeea), ruWhite = mat(0xd8dccc), pv = arrayMat();
  const ty = 0.5, L = 1.6, hw = 0.026, n = 20;
  // the truss: four longerons and a lattice of struts
  for (const a of [-1, 1]) for (const b of [-1, 1]) g.add(at(box(L, 0.008, 0.008, silver), 0, ty + a * hw, b * hw));
  for (let i = 0; i <= n; i++) {
    const x = -L / 2 + (i * L) / n, x2 = x + L / n, up = i % 2 ? hw : -hw;
    for (const b of [-1, 1]) {
      g.add(rod([x, ty - hw, b * hw], [x, ty + hw, b * hw], 0.0026, silver));
      g.add(rod([x, b * hw + ty, -hw], [x, b * hw + ty, hw], 0.0026, silver));
      if (i < n) {
        g.add(rod([x, ty + up, b * hw], [x2, ty - up, b * hw], 0.0024, silver));
        g.add(rod([x, ty + b * hw, up], [x2, ty + b * hw, -up], 0.0024, silver));
      }
    }
  }
  // eight array wings, up and down at both ends, and their masts
  for (const e of [-1, 1]) for (const x of [0.6, 0.745]) {
    const X = e * x;
    g.add(at(rot(cyl(0.03, 0.03, 0.06, silver, 10), Math.PI / 2, 0, 0), X, ty, 0));
    for (const s of [-1, 1]) {
      const y0 = ty + s * 0.045, len = 0.41;
      for (const k of [-1, 1]) g.add(at(box(0.048, len, 0.004, pv), X + k * 0.031, y0 + (s * len) / 2, 0));
      g.add(at(cyl(0.003, 0.003, len, silver, 4), X, y0 + (s * len) / 2, 0));
      g.add(at(box(0.12, 0.014, 0.014, silver), X, y0 + s * (len + 0.007), 0));
      g.add(at(box(0.12, 0.02, 0.02, silver), X, y0, 0));
    }
  }
  // radiators, folded back
  for (const e of [-1, 1]) for (let k = 0; k < 3; k++) g.add(at(box(0.11, 0.005, 0.1, white), e * 0.3, ty - 0.01, -0.07 - k * 0.11));
  // the pressurised modules, along z under the truss
  const mod = (len, r, m) => lathe([[0, 0], [r * 0.55, 0.004], [r * 0.9, r * 0.22], [r, r * 0.5], [r, len - r * 0.5], [r * 0.9, len - r * 0.22], [r * 0.55, len - 0.004], [0, len]], m, 16);
  const along = (o, x, y, z) => at(rot(o, Math.PI / 2, 0, 0), x, y, z);
  const across = (o, x, y, z, s) => at(rot(o, 0, 0, -s * Math.PI / 2), x, y, z);
  const my = 0.43;
  for (const [z0, len, r, m] of [[0.38, 0.12, 0.04, white], [0.18, 0.2, 0.042, white], [0.04, 0.14, 0.04, white], [-0.2, 0.24, 0.04, ruWhite], [-0.46, 0.26, 0.046, ruWhite], [-0.56, 0.1, 0.028, mat(0x9aa890)]]) {
    g.add(along(mod(len, r, m), 0, my, z0));
    g.add(along(lathe([[r + 0.002, len * 0.3], [r + 0.002, len * 0.36]], silver, 16), 0, my, z0));
  }
  g.add(along(lathe([[0, 0], [0.03, 0.01], [0.034, 0.03], [0.022, 0.06], [0, 0.07]], white, 14), 0, my, 0.5));
  g.add(across(mod(0.14, 0.036, white), 0.04, my, 0.44, 1));
  g.add(across(mod(0.2, 0.04, white), -0.04, my, 0.44, -1));
  g.add(slab(0.1, 0.012, 0.08, silver, -0.3, my - 0.006, 0.44));
  // the Russian segment's own blue wings, and a Soyuz
  const blue = solarMat();
  for (const s of [-1, 1]) g.add(at(box(0.24, 0.004, 0.07, blue), s * 0.17, my, -0.34));
  for (const s of [-1, 1]) g.add(at(box(0.1, 0.004, 0.035, blue), s * 0.08, my, -0.61));
  g.add(along(mod(0.08, 0.026, mat(0x8a9a7a)), 0, my, -0.66));
  // the arm
  g.add(rod([0.12, ty + hw, 0], [0.26, ty + 0.12, 0.06], 0.006, white, 6));
  g.add(rod([0.26, ty + 0.12, 0.06], [0.4, ty + 0.06, 0.14], 0.006, white, 6));
  for (const p of [[0.12, ty + hw, 0], [0.26, ty + 0.12, 0.06], [0.4, ty + 0.06, 0.14]]) g.add(at(ball(0.011, silver, 8), ...p));
  return ground(bake(g));
}

function rocketLaunch(rng) {
  const g = group();
  const white = mat(0xf4f4f0), black = M.black, towerM = mat(0xc8502e);
  g.add(slab(1.0, 0.03, 0.72, M.concrete));
  g.add(slab(0.26, 0.004, 0.72, mat(0x55524c), 0.06, 0.03, 0));
  // the service tower, its arms swung back
  const tx = -0.2, tw = 0.09, th = 0.96, step = 0.08;
  for (const a of [-1, 1]) for (const b of [-1, 1]) g.add(slab(0.012, th, 0.012, towerM, tx + (a * tw) / 2, 0.03, (b * tw) / 2));
  for (let y = 0.03 + step; y < th; y += step) {
    for (const s of [-1, 1]) { g.add(slab(tw, 0.008, 0.008, towerM, tx, y, (s * tw) / 2)); g.add(slab(0.008, 0.008, tw, towerM, tx + (s * tw) / 2, y, 0)); }
    for (const s of [-1, 1]) {
      g.add(rod([tx - tw / 2, y - step, (s * tw) / 2], [tx + tw / 2, y, (s * tw) / 2], 0.003, towerM));
      g.add(rod([tx + tw / 2, y - step, (s * tw) / 2], [tx - tw / 2, y, (s * tw) / 2], 0.003, towerM));
      g.add(rod([tx + (s * tw) / 2, y - step, -tw / 2], [tx + (s * tw) / 2, y, tw / 2], 0.003, towerM));
    }
  }
  g.add(slab(tw + 0.03, 0.012, tw + 0.03, M.iron, tx, th + 0.03));
  g.add(rod([tx, th + 0.04, 0], [tx, th + 0.18, 0], 0.004, M.steel, 4));
  for (const [y, a] of [[0.62, 0.9], [0.8, 1.1]]) {
    const arm = group(slab(0.13, 0.016, 0.032, M.iron, 0.065, 0, 0));
    arm.rotation.y = a;
    g.add(at(arm, tx + tw / 2, y, 0.02));
  }
  // the rocket, just off the pad: a white core with two boosters
  const rx = 0.07, ry = 0.25;
  g.add(at(lathe([[0.042, 0], [0.042, 0.42], [0.036, 0.46], [0.036, 0.56], [0.04, 0.6], [0.04, 0.63], [0.034, 0.67], [0.022, 0.71], [0.008, 0.735], [0, 0.74]], white, 20), rx, ry, 0));
  for (const [y0, y1] of [[0.1, 0.13], [0.39, 0.42], [0.56, 0.6]]) g.add(at(lathe([[0.0425, y0], [0.0425, y1]], black, 20), rx, ry, 0));
  g.add(at(lathe([[0.028, -0.04], [0.02, -0.02], [0.016, 0]], black, 14), rx, ry, 0));
  for (const s of [-1, 1]) {
    const bx = rx + s * 0.064;
    g.add(at(lathe([[0.024, 0], [0.024, 0.32], [0.021, 0.36], [0.012, 0.395], [0, 0.41]], white, 16), bx, ry + 0.01, 0));
    g.add(at(lathe([[0.0245, 0.3], [0.0245, 0.33]], black, 16), bx, ry + 0.01, 0));
    g.add(at(lathe([[0.018, -0.03], [0.012, -0.012], [0.01, 0]], black, 12), bx, ry + 0.01, 0));
    g.add(at(extrude([[0, 0], [0.04, 0], [0, 0.07]], 0.005, mat(0xb8302a)), bx + s * 0.022, ry + 0.01, 0));
  }
  // the flames: a bright core inside a softer orange sheath
  const flame = (r, len, m) => lathe([[0, -len], [r * 0.55, -len * 0.75], [r, -len * 0.4], [r * 0.85, -len * 0.1], [r * 0.6, 0]], m, 14);
  const sheath = mat(0xff8a2a, { emissive: 0xff7a1a, emissiveIntensity: 2.4, transparent: true, opacity: 0.8, depthWrite: false });
  const core = glow(0xfff0b8, 5);
  g.add(at(flame(0.045, 0.19, sheath), rx, ry - 0.035, 0));
  g.add(at(flame(0.026, 0.15, core), rx, ry - 0.03, 0));
  for (const s of [-1, 1]) {
    g.add(at(flame(0.03, 0.17, sheath), rx + s * 0.064, ry - 0.022, 0));
    g.add(at(flame(0.017, 0.13, core), rx + s * 0.064, ry - 0.02, 0));
  }
  // the exhaust cloud, billowing out of the trench both ways and up round the rocket's foot
  const hot = mat(0xffd2a8, { emissive: 0xff7a2a, emissiveIntensity: 0.9, roughness: 1 });
  const cloud = mat(0xefedea, { roughness: 1, emissive: 0x504a44, emissiveIntensity: 0.25 });
  const grey = mat(0xc9c6c2, { roughness: 1 });
  for (const s of [-1, 1]) {
    g.add(plume(rng, [[rx + s * 0.06, 0.09, 0.02], [rx + s * 0.2, 0.11, 0.05], [rx + s * 0.36, 0.14, 0.0], [rx + s * 0.5, 0.19, -0.06]], 0.065, 0.135, 7, [hot, cloud, cloud, grey], { detail: 2, billow: 2, squash: 0.8 }));
    g.add(plume(rng, [[rx + s * 0.05, 0.1, -0.12], [rx + s * 0.22, 0.12, -0.2], [rx + s * 0.38, 0.16, -0.22]], 0.06, 0.1, 4, [cloud, grey], { detail: 2, billow: 1 }));
  }
  for (const [x, y, z, r] of [[rx, 0.09, 0.1, 0.075], [rx + 0.02, 0.1, -0.1, 0.08], [rx - 0.03, 0.12, 0.12, 0.06]]) g.add(at(scl(mesh(new THREE.IcosahedronGeometry(r, 2), hot), 1, 0.8, 1), x, y, z));
  return bake(g);
}

function stadium(rng) {
  const g = group();
  const sx = 1.32, ell = (o) => { o.scale.x = sx; return o; };
  const shell = mat(0xe2e5e8), seat = mat(pick(rng, [0xd0362c, 0x2a5cc8, 0xd0362c, 0x2a5cc8, 0x23946a]));
  const seat2 = mat(new THREE.Color(seat.color).multiplyScalar(0.7).getHex());
  g.add(ell(at(cyl(0.6, 0.6, 0.006, mat(0xc9c4b8), 40), 0, 0.003, 0)));
  // the facade: a lit inner wall behind leaning white ribs
  g.add(ell(lathe([[0.47, 0.006], [0.495, 0.19]], glow(0xffd9a0, 0.55), 40)));
  const nr = 44;
  for (let i = 0; i < nr; i++) {
    const a = (i * TAU) / nr, ca = Math.cos(a), sa = Math.sin(a);
    const o = group(at(rot(box(0.016, 0.205, 0.01, shell), 0.13, 0, 0), 0, 0.1, 0));
    o.rotation.y = Math.atan2(ca / sx, sa);
    g.add(at(o, 0.5 * sx * ca, 0.006, 0.5 * sa));
  }
  // the stands, in two tiers, and the field
  g.add(ell(lathe([[0.5, 0.19], [0.47, 0.17], [0.44, 0.135], [0.425, 0.13]], seat2, 40)));
  g.add(ell(lathe([[0.425, 0.13], [0.41, 0.124], [0.4, 0.1], [0.37, 0.072], [0.34, 0.044], [0.322, 0.026], [0.316, 0.022]], seat, 40)));
  g.add(ell(at(lathe([[0.4255, 0.112], [0.4255, 0.13]], glow(0xfff0d0, 0.8), 40), 0, 0, 0)));
  g.add(ell(at(disc(0.318, mat(0x3a8a3c), 40), 0, 0.02, 0)));
  const pitch = floorCard(0.58, 0.36, pitchMat());
  g.add(at(pitch, 0, 0.0215, 0));
  // the roof ring and its floodlights
  g.add(ell(lathe([[0.545, 0.205], [0.41, 0.232], [0.41, 0.224], [0.54, 0.193], [0.545, 0.205]], shell, 48)));
  g.add(ell(at(rot(mesh(new THREE.TorusGeometry(0.414, 0.005, 4, 56), glow(0xeaf4ff, 2.5)), Math.PI / 2, 0, 0), 0, 0.222, 0)));
  // the arch over it, leaning back
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = (i / 16) * Math.PI; pts.push([-Math.cos(t) * 0.8, 0.016 + Math.sin(t) * 0.6, -Math.sin(t) * 0.16]); }
  g.add(taper(pts, 0.016, 0.016, shell, 40, 8));
  for (let i = 3; i <= 13; i += 2) {
    const t = (i / 16) * Math.PI, p = [-Math.cos(t) * 0.8, 0.016 + Math.sin(t) * 0.6, -Math.sin(t) * 0.16];
    for (const s of [-1, 1]) g.add(rod(p, [p[0] * 0.9, 0.23, s * 0.4], 0.0018, M.steel, 3));
  }
  return bake(g);
}

export const flat = ['railTrack', 'highway', 'solarArray'];
export default {
  factory, chimney, terraceHouses, steamTrain, railTrack, steamship,
  skyscraper, landmarkTower, apartmentBlock, house, highway, bridge, windTurbine, solarArray,
  containerShip, airliner, satellite, iss, rocketLaunch, stadium, car,
};
