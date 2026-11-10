// The first farmers, Egypt and Mesopotamia about 2500 BCE, and Rome in 120 CE: props for the pie.
// Every factory is (rng) => THREE.Group standing on y = 0 with its front toward +z; animals walk
// along +x. Each is baked at the end into one mesh per material, so the scene can instance it cheaply.
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { THREE, mergeGeometries, mat, mesh, at, rot, scl, group, lathe, extrude, box, ball, cyl, cone, canvasTex, taper, mulberry, pick, range, C } from './kit.js';

const PI = Math.PI, TAU = Math.PI * 2;
const DS = THREE.DoubleSide;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- helpers --------------------------------------------------------------------------------

function flipWinding(geo) {
  for (const a of Object.values(geo.attributes)) {
    const s = a.itemSize, arr = a.array;
    for (let t = 0; t < a.count; t += 3) for (let k = 0; k < s; k++) {
      const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k, tmp = arr[i1];
      arr[i1] = arr[i2]; arr[i2] = tmp;
    }
  }
}

// merge every mesh under root into one mesh per material, in root's own frame
function bake(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), m4 = new THREE.Matrix4(), by = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.morphAttributes = {};
    geo.clearGroups();
    m4.multiplyMatrices(inv, o.matrixWorld);
    geo.applyMatrix4(m4);
    if (m4.determinant() < 0) flipWinding(geo);
    if (!by.has(o.material)) by.set(o.material, []);
    by.get(o.material).push(geo);
  });
  const g = new THREE.Group();
  for (const [m, geos] of by) g.add(mesh(mergeGeometries(geos), m));
  return g;
}

// a geometry from a list of triangles, each three [x, y, z] points (and optionally [u, v]s)
function triGeo(pts, uvs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
  g.computeVertexNormals();
  return g;
}

// the same triangles welded where they meet, so they shade smoothly: a sail, a cloth
function smoothGeo(pts) {
  const g = triGeo(pts);
  g.deleteAttribute('normal');
  const m = mergeVertices(g, 1e-5);
  m.computeVertexNormals();
  return m;
}

// a hipped roof over an L × W rectangle at y = 0, its ridge along x at height H; hip = 0 makes a
// gable. uv: u along each face's eave and v up it, in model units times k
function roofGeo(L, W, H, hip, k = 1, bottom = true) {
  const x0 = -L / 2, x1 = L / 2, z0 = -W / 2, z1 = W / 2;
  const A = [x0, 0, z1], B = [x1, 0, z1], Cc = [x1, 0, z0], D = [x0, 0, z0], R0 = [x0 + hip, H, 0], R1 = [x1 - hip, H, 0];
  const faces = [
    [[A, B, R1], [1, 0]], [[A, R1, R0], [1, 0]], [[Cc, D, R0], [-1, 0]], [[Cc, R0, R1], [-1, 0]],
    [[B, Cc, R1], [0, -1]], [[D, A, R0], [0, 1]],
  ];
  if (bottom) faces.push([[A, D, Cc], [1, 0]], [[A, Cc, B], [1, 0]]);
  const pts = [], uvs = [];
  for (const [tri, [ex, ez]] of faces) for (const p of tri) {
    pts.push(p);
    uvs.push([(p[0] * ex + p[2] * ez) * k, p[1] * 1.6 * k]);
  }
  return triGeo(pts, uvs);
}

// a box with its corners pushed about: hewn stone, rubble, a rough slab
function jitter(geo, rng, ax, ay, az) {
  const p = geo.attributes.position, seen = new Map();
  geo.computeBoundingBox();
  const y0 = geo.boundingBox.min.y;
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    if (!seen.has(key)) seen.set(key, [(rng() - 0.5) * 2 * ax, p.getY(i) <= y0 + 1e-6 ? 0 : (rng() - 0.5) * 2 * ay, (rng() - 0.5) * 2 * az]);
    const o = seen.get(key);
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  geo.computeVertexNormals();
  return geo;
}
function roughBox(w, h, d, m, rng, j = 0.1, segY = 1) {
  return mesh(jitter(new THREE.BoxGeometry(w, h, d, 1, segY, 1), rng, w * j, h * j * 0.4, d * j), m);
}
// the same, standing on y = 0
const roughBlock = (w, h, d, m, rng, j, segY) => { const o = roughBox(w, h, d, m, rng, j, segY); o.geometry.translate(0, h / 2, 0); return o; };

// a box whose origin is the middle of its base, so at() puts it standing on a height
const block = (w, h, d, m, r = 0) => { const o = box(w, h, d, m, r); o.geometry.translate(0, h / 2, 0); return o; };

// an open cylinder (no caps): legs, arms, posts
const tube = (r0, r1, h, m, seg = 6) => mesh(new THREE.CylinderGeometry(r1, r0, h, seg, 1, true), m);
// a limb from point a to point b
function limb(a, b, r0, r1, m, seg = 5, open = true) {
  const A = V(...a), B = V(...b), len = A.distanceTo(B);
  const geo = new THREE.CylinderGeometry(r1, r0, len, seg, 1, open);
  geo.translate(0, len / 2, 0);
  const o = mesh(geo, m);
  o.position.copy(A);
  o.quaternion.setFromUnitVectors(V(0, 1, 0), B.clone().sub(A).normalize());
  return o;
}
// an ellipsoid
const egg = (rx, ry, rz, m, ws = 8, hs = 6) => scl(mesh(new THREE.SphereGeometry(1, ws, hs), m), rx, ry, rz);
// a low-poly lump, flat-shaded: wool, foliage
const lump = (r, m, detail = 0) => mesh(new THREE.IcosahedronGeometry(r, detail), m);
// a square frustum with faces toward ±x and ±z: a pyramid's body, an obelisk's shaft, a battered tier
function frustum(w0, d0, w1, d1, h, m, seg = 1) {
  const geo = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, h, 4, seg);
  geo.rotateY(PI / 4);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + h / 2) / h;
    p.setX(i, p.getX(i) * (w0 + (w1 - w0) * t));
    p.setZ(i, p.getZ(i) * (d0 + (d1 - d0) * t));
  }
  geo.translate(0, h / 2, 0);
  geo.computeVertexNormals();
  return mesh(geo, m);
}
// a thin flat plane facing +z (windows, doors, painted eyes): w × h, centred
const panel = (w, h, m) => mesh(new THREE.PlaneGeometry(w, h), m);

// a boat's hull along x, bow at +x: length L, beam B, depth D; the sheer rises by S toward the ends
// and the keel by K. u runs along the length, v round from gunwale to gunwale.
function hull(L, B, D, S, K, o = {}) {
  const { n = 20, k = 8, full = 0.6, sharp = 2, stern = 1 } = o;
  const hw = (t) => (B / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), t < 0 ? sharp * stern : sharp)), 0.5);
  const top = (t) => D + S * t * t, bot = (t) => K * Math.pow(Math.abs(t), 3);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = -1 + (2 * i) / n, x = (t * L) / 2, a = top(t), b = bot(t), w = hw(t);
    for (let j = 0; j <= k; j++) {
      const th = (PI * j) / k;
      pos.push(x, a - (a - b) * Math.pow(Math.sin(th), full), w * Math.cos(th));
      uv.push(i / n, j / k);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) {
    const a = i * (k + 1) + j, b = a + k + 1;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // the deck, a little below the gunwale
  const dp = [];
  const e = D * 0.12;
  for (let i = 0; i < n; i++) {
    const t0 = -1 + (2 * i) / n, t1 = -1 + (2 * (i + 1)) / n, x0 = (t0 * L) / 2, x1 = (t1 * L) / 2;
    const P0 = [x0, top(t0) - e, hw(t0) * 0.96], P1 = [x1, top(t1) - e, hw(t1) * 0.96];
    const S0 = [x0, top(t0) - e, -hw(t0) * 0.96], S1 = [x1, top(t1) - e, -hw(t1) * 0.96];
    dp.push(P0, P1, S1, P0, S1, S0);
  }
  return { geo, deck: triGeo(dp), hw: (x) => hw((2 * x) / L), top: (x) => top((2 * x) / L) };
}

// a smooth body lofted along a spine in the xy plane, its section an ellipse of half-height ry and
// half-width rz at each spine point: a lion's body, a ram
function loft(points, radii, m, n = 20, radial = 12) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(...p)));
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, c = curve.getPoint(t), T = curve.getTangent(t);
    const f = t * (radii.length - 1), k = Math.min(radii.length - 2, Math.floor(f)), u = f - k;
    const ry = radii[k][0] + (radii[k + 1][0] - radii[k][0]) * u, rz = radii[k][1] + (radii[k + 1][1] - radii[k][1]) * u;
    const N = V(-T.y, T.x, 0).normalize();
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      pos.push(c.x + N.x * Math.cos(a) * ry, c.y + N.y * Math.cos(a) * ry, c.z + Math.sin(a) * rz);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return mesh(geo, m);
}

// textures, drawn once and shared; the materials that use them are cached by texture and colour
const texCache = new Map(), tmatCache = new Map();
function tex(spec) {
  if (typeof document === 'undefined') return null;
  if (!texCache.has(spec.name)) texCache.set(spec.name, canvasTex(spec.w, spec.h, spec.draw, spec.repeat || [1, 1]));
  return texCache.get(spec.name);
}
function tmat(spec, color = 0xffffff, o = {}) {
  const key = spec.name + ':' + color + JSON.stringify(o);
  if (!tmatCache.has(key)) {
    const { flat = false, ...rest } = o;
    tmatCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: flat, map: tex(spec), ...rest }));
  }
  return tmatCache.get(key);
}
// streaky thatch, near white so a material's colour tints it
const thatchDraw = (x, w, h) => {
  const r = mulberry(11);
  x.fillStyle = '#e8e0cc'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    const dark = r() < 0.55;
    x.fillStyle = dark ? `rgba(70,50,20,${0.1 + r() * 0.22})` : `rgba(255,250,230,${0.15 + r() * 0.3})`;
    x.fillRect(r() * w, r() * h, 1 + r() * 2, h * (0.1 + r() * 0.3));
  }
  for (let j = 0; j < 4; j++) { x.fillStyle = 'rgba(60,40,15,0.35)'; x.fillRect(0, (j * h) / 4, w, 3); }
};
const THATCH_ROOF = { name: 'thatch-roof', w: 128, h: 128, draw: thatchDraw, repeat: [1, 1] };
const THATCH_CONE = { name: 'thatch-cone', w: 128, h: 128, draw: thatchDraw, repeat: [5, 1] };
// terracotta tiles: imbrices running down the slope, courses across it
const TILES = {
  name: 'tiles', w: 64, h: 64, repeat: [1, 1],
  draw: (x, w, h) => {
    x.fillStyle = '#f2e6dc'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      const cx = (i + 0.5) * (w / 4);
      const g = x.createLinearGradient(cx - 8, 0, cx + 8, 0);
      g.addColorStop(0, 'rgba(90,40,20,0.45)'); g.addColorStop(0.35, 'rgba(255,240,225,0.5)'); g.addColorStop(0.7, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(90,40,20,0.5)');
      x.fillStyle = g; x.fillRect(cx - 8, 0, 16, h);
    }
    for (let j = 0; j < 4; j++) { x.fillStyle = 'rgba(80,35,15,0.35)'; x.fillRect(0, (j * h) / 4, w, 2); }
  },
};

// ---- the first farmers ----------------------------------------------------------------------

// a round house: a wattle-and-daub drum under a tall conical thatch
function roundHut(rng) {
  const g = group();
  const R = 0.4, wh = 0.27 + rng() * 0.06;
  const daub = mat(pick(rng, [0xc89e6c, 0xb98e60, 0xd3ad7a]));
  const roof = tmat(THATCH_CONE, pick(rng, [0xd6b468, 0xc8a454, 0xbb984a]));
  g.add(lathe([[R, 0], [R + 0.014, wh * 0.5], [R - 0.004, wh + 0.02]], daub, 10));
  g.add(lathe([[R + 0.04, 0], [R + 0.035, 0.045], [R + 0.004, 0.065]], mat(0x8a7c68, { flat: true }), 10));
  g.add(lathe([
    [R - 0.02, wh + 0.02], [R + 0.15, wh - 0.06], [R + 0.17, wh - 0.01], [0.43, wh + 0.2], [0.37, wh + 0.25],
    [0.39, wh + 0.28], [0.22, wh + 0.47], [0.08, wh + 0.63], [0, wh + 0.68],
  ], roof, 10));
  g.add(at(cone(0.045, 0.09, mat(0x8a6a34), 5), 0, wh + 0.69, 0));
  // the doorway, with its posts and lintel
  const wood = mat(C.timber);
  g.add(at(box(0.13, 0.2, 0.03, mat(0x2a1e16)), 0, 0.1, R + 0.004));
  for (const s of [1, -1]) g.add(at(box(0.026, 0.22, 0.034, wood), s * 0.078, 0.11, R + 0.006));
  g.add(at(box(0.19, 0.028, 0.036, wood), 0, 0.22, R + 0.008));
  return bake(g);
}

// a thatched roof in courses: each course a hipped roof a little larger and lower than the one
// above, so the eaves step out like layered thatch
function thatchRoof(L, W, H, hip, eave, m, courses = 2, step = 0.07, drop = 0.035) {
  const g = group(), slope = H / (W / 2), hslope = hip > 0 ? H / hip : 1e9;
  const y = eave + slope * step * (courses - 1) + drop * (courses - 1);
  for (let c = 0; c < courses; c++) {
    const a = c * step, ax = (slope * a) / hslope;
    const W2 = W + 2 * a, H2 = H + slope * a, L2 = L + 2 * ax, hip2 = hip + ax;
    g.add(at(mesh(roofGeo(L2, W2, H2, hip2, 1.3), m), 0, y - slope * a - c * drop, 0));
  }
  g.userData.top = y + H;
  return g;
}

// a Neolithic longhouse: timber posts and daub walls under a steep hipped thatch
function longhouse(rng) {
  const g = group();
  const L = 2.1, W = 0.66, wh = 0.36;
  const daub = mat(pick(rng, [0xc9a272, 0xbf9566, 0xd0aa7c]));
  const wood = mat(C.timber), dark = mat(0x2a1e16);
  const roofC = pick(rng, [0xd2b060, 0xc4a052]);
  g.add(block(L, wh, W, daub));
  const n = 12;
  for (let i = 0; i <= n; i++) for (const s of [1, -1]) {
    const x = -L / 2 + 0.02 + (i * (L - 0.04)) / n;
    if (s > 0 && Math.abs(x) < 0.12) continue;
    g.add(at(box(0.036, wh + 0.01, 0.03, wood), x, (wh + 0.01) / 2, s * (W / 2 + 0.008)));
  }
  for (let i = 0; i <= 4; i++) for (const s of [1, -1]) g.add(at(box(0.03, wh, 0.036, wood), s * (L / 2 + 0.008), wh / 2, -W / 2 + 0.03 + (i * (W - 0.06)) / 4));
  // the roof, its ridge capped with a roll of darker thatch
  const H = 0.46, hip = 0.3;
  const roof = thatchRoof(L + 0.06, W + 0.16, H, hip, wh - 0.1, tmat(THATCH_ROOF, roofC), 3, 0.05, 0.025);
  g.add(roof);
  const ridge = L + 0.06 - 2 * hip, top = roof.userData.top;
  g.add(at(rot(cyl(0.035, 0.035, ridge, tmat(THATCH_ROOF, 0xa08040), 8), 0, 0, PI / 2), 0, top, 0));
  for (const s of [1, -1]) g.add(at(ball(0.035, tmat(THATCH_ROOF, 0xa08040), 8), (s * ridge) / 2, top, 0));
  // a smoke hole's little hood at one end
  g.add(at(rot(cone(0.05, 0.06, tmat(THATCH_ROOF, 0xa08040), 4), 0, PI / 4, 0), -ridge / 2 + 0.12, top + 0.02, 0));
  // the door in the middle of the long side
  g.add(at(box(0.15, 0.25, 0.03, dark), 0, 0.125, W / 2 + 0.006));
  for (const s of [1, -1]) g.add(at(box(0.03, 0.28, 0.04, wood), s * 0.09, 0.14, W / 2 + 0.01));
  g.add(at(box(0.22, 0.03, 0.045, wood), 0, 0.28, W / 2 + 0.012));
  // a pile of logs by the gable end
  const logs = mat(0x8a6440);
  for (const [x, y, z] of [[0.62, 0.035, 0.46], [0.7, 0.035, 0.46], [0.66, 0.095, 0.46], [0.78, 0.035, 0.46]]) {
    g.add(at(rot(cyl(0.035, 0.035, 0.2, logs, 7), PI / 2, 0, 0), x, y, z));
  }
  return bake(g);
}

// a field of grain in rows: green, gold or ochre, with sheaves stooked on a ripe one
function wheatField(rng) {
  const g = group();
  const W = 1.0, D = 0.64;
  const kind = pick(rng, ['gold', 'gold', 'green', 'ochre']);
  const crop = { gold: [0xe0b84a, 0xeac65e], green: [0x76a03e, 0x88b24a], ochre: [0xc8923a, 0xd6a24a] }[kind];
  g.add(at(box(W + 0.03, 0.016, D + 0.03, mat(0x5e3c22)), 0, 0.008, 0));
  const rows = 10;
  for (let i = 0; i < rows; i++) {
    const z = -D / 2 + ((i + 0.5) * D) / rows;
    const r = mesh(new THREE.CylinderGeometry(0.02, 0.02, W - 0.03 - rng() * 0.02, 5, 1), mat(crop[i % 2]));
    rot(r, 0, 0, PI / 2);
    scl(r, kind === 'green' ? 1.1 : 1.5, 1, 1);
    g.add(at(r, 0, 0.016, z));
  }
  if (kind !== 'green') {
    const sheaf = mat(kind === 'gold' ? 0xf0d070 : 0xe0b058);
    const k = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < k; i++) {
      const s = cone(0.05, 0.13, sheaf, 6);
      g.add(at(s, range(rng, -0.4, 0.4), 0.085, range(rng, -0.25, 0.25)));
    }
  }
  return bake(g);
}

// a cow or an aurochs, side-on, walking or grazing
function cattle(rng) {
  const g = group();
  const coat = pick(rng, [0x3a2a20, 0x6a3e24, 0x8a5430, 0x2a2420, 0xa07850]);
  const m = mat(coat), pale = mat(0xdccab0), hoof = mat(0x241a14), horn = mat(0xeee2c6);
  const graze = rng() < 0.35;
  g.add(loft([[-0.44, 0.5, 0], [-0.37, 0.52, 0], [-0.12, 0.49, 0], [0.14, 0.53, 0], [0.3, 0.54, 0], [0.37, 0.52, 0]],
    [[0.03, 0.03], [0.17, 0.15], [0.2, 0.17], [0.22, 0.17], [0.18, 0.14], [0.03, 0.03]], m, 8, 6));
  for (const [x, z] of [[0.24, 0.085], [0.2, -0.085], [-0.28, 0.085], [-0.24, -0.085]]) {
    g.add(limb([x, 0.03, z], [x, 0.46, z], 0.034, 0.05, m, 5));
    g.add(at(tube(0.036, 0.032, 0.05, hoof, 4), x, 0.025, z));
  }
  const hy = graze ? 0.16 : 0.47, hx = graze ? 0.5 : 0.53;
  g.add(limb([0.27, 0.54, 0], [hx - 0.04, hy + 0.06, 0], 0.11, 0.08, m, 6));
  g.add(at(rot(egg(0.13, 0.085, 0.075, m, 6, 4), 0, 0, graze ? -1.2 : -0.6), hx, hy, 0));
  g.add(at(egg(0.06, 0.055, 0.062, pale, 5, 3), hx + (graze ? 0.06 : 0.09), hy - (graze ? 0.1 : 0.06), 0));
  for (const s of [1, -1]) {
    const b = [hx - 0.02, hy + 0.07, s * 0.05];
    g.add(taper([b, [b[0] - 0.02, b[1] + 0.04, s * 0.14], [b[0] + 0.04, b[1] + 0.12, s * 0.18], [b[0] + 0.1, b[1] + 0.17, s * 0.13]], 0.022, 0.006, horn, 4, 4));
    g.add(at(rot(egg(0.055, 0.02, 0.03, m, 4, 3), 0, s * 0.4, 0), hx - 0.05, hy + 0.04, s * 0.09));
  }
  g.add(limb([-0.4, 0.6, 0], [-0.445, 0.28, 0], 0.02, 0.014, m, 4));
  g.add(at(egg(0.03, 0.055, 0.03, hoof, 4, 3), -0.45, 0.25, 0));
  if (coat === 0x3a2a20 || coat === 0x2a2420) g.add(at(egg(0.32, 0.03, 0.04, mat(0xb08e62), 6, 3), 0, 0.665, 0));
  return bake(g);
}

// a woolly sheep, side-on
function sheep(rng) {
  const g = group();
  const woolC = rng() > 0.12 ? pick(rng, [0xe4dccb, 0xdcd2bc]) : pick(rng, [0x9a7a58, 0x7e6248]);
  const wool = mat(woolC), face = mat(0x2e2622), leg = mat(0x3a302a);
  const low = rng() < 0.4;
  g.add(at(scl(lump(1, wool, 1), 0.3, 0.21, 0.22), 0, 0.36, 0));
  for (const [x, y, z, r] of [[0.15, 0.45, 0.07, 0.14], [-0.14, 0.46, -0.06, 0.14], [0.02, 0.52, 0, 0.13], [-0.22, 0.37, 0.07, 0.12]]) g.add(at(egg(r, r, r, wool, 5, 4), x, y, z));
  for (const [x, z] of [[0.15, 0.08], [0.12, -0.08], [-0.17, 0.08], [-0.14, -0.08]]) g.add(limb([x, 0, z], [x, 0.22, z], 0.03, 0.034, leg, 4));
  const hx = 0.35, hy = low ? 0.34 : 0.46;
  g.add(at(rot(egg(0.1, 0.075, 0.07, face, 6, 4), 0, 0, low ? -0.9 : -0.5), hx, hy, 0));
  g.add(at(egg(0.075, 0.075, 0.075, wool, 5, 4), hx - 0.05, hy + 0.05, 0));
  for (const s of [1, -1]) g.add(at(rot(egg(0.055, 0.018, 0.03, face, 5, 3), s * 0.5, 0, 0), hx - 0.04, hy + 0.03, s * 0.075));
  g.add(at(egg(0.06, 0.06, 0.06, wool, 5, 3), -0.32, 0.4, 0));
  return bake(g);
}

// a farmer hoeing, side-on, facing +x
function farmer(rng) {
  const g = group();
  const skin = mat(pick(rng, [0xc69a7a, 0xa87a5a, 0xd2a888]));
  const cloth = mat(pick(rng, [0xd9cdb0, 0xb8863a, 0x9a4a32, 0x7a5a3a, 0xc8b48a]));
  const hair = mat(pick(rng, [0x2a1e16, 0x4a3020, 0x1e1a18]));
  const wood = mat(0x8a6a40), shoe = mat(0x4a3424);
  const lean = 0.35, hip = [0, 0.34, 0];
  const up = (d) => [hip[0] + d * Math.sin(lean), hip[1] + d * Math.cos(lean)];
  g.add(limb([0.06, 0.02, 0.06], [0.0, 0.36, 0.05], 0.03, 0.036, skin, 5));
  g.add(limb([-0.08, 0.02, -0.05], [-0.01, 0.36, -0.05], 0.03, 0.036, skin, 5));
  g.add(at(box(0.08, 0.035, 0.05, shoe), 0.08, 0.018, 0.06));
  g.add(at(box(0.08, 0.035, 0.05, shoe), -0.06, 0.018, -0.05));
  const body = group();
  body.add(at(cyl(0.15, 0.095, 0.4, cloth, 7), 0, 0.14, 0));
  body.add(at(tube(0.13, 0.13, 0.03, mat(0x3a2a1e), 7), 0, 0.06, 0));
  body.add(at(ball(0.085, skin, 7), 0, 0.42, 0));
  body.add(at(scl(ball(0.09, hair, 7), 1, 0.8, 1), -0.015, 0.45, 0));
  rot(body, 0, 0, -lean);
  g.add(at(body, ...hip));
  // the hoe: a long handle from behind the shoulder down to a stone blade on the ground
  const H0 = [0.15, 0.66, 0.08], H1 = [0.56, 0.04, 0.08];
  g.add(limb(H0, H1, 0.013, 0.013, wood, 4, false));
  g.add(at(rot(box(0.03, 0.1, 0.06, mat(0x8a8478, { flat: true })), 0, 0, -0.4), 0.585, 0.06, 0.08));
  const sh = up(0.3);
  const along = (f) => H0.map((v, i) => v + (H1[i] - v) * f);
  const h1 = along(0.2), h2 = along(0.38);
  g.add(limb([sh[0], sh[1], 0.1], h1, 0.026, 0.022, cloth, 5));
  g.add(limb([sh[0], sh[1], -0.1], h2, 0.026, 0.022, cloth, 5));
  g.add(at(ball(0.026, skin, 5), ...h1));
  g.add(at(ball(0.026, skin, 5), ...h2));
  return bake(g);
}

// a ring of sarsen uprights capped by a continuous lintel, a horseshoe of five great trilithons
// open toward the front, bluestones between, the Heel Stone outside, all inside a low chalk bank
function stoneCircle(rng) {
  const g = group();
  const sarsen = [0xaaa496, 0x9d988b, 0xb3ad9b].map((c) => mat(c, { flat: true }));
  const blue = mat(0x7a8592, { flat: true });
  const S = () => pick(rng, sarsen);
  const place = (o, a, r, y = 0) => { o.position.set(Math.sin(a) * r, y, Math.cos(a) * r); o.rotation.y = a; return o; };
  const R = 0.8, n = 30, uh = 0.42;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    g.add(place(roughBlock(0.11, uh, 0.075, S(), rng, 0.12, 2), a, R));
    const l = roughBox(2 * R * Math.sin(PI / n) - 0.006, 0.056, 0.078, S(), rng, 0.05);
    g.add(place(l, ((i + 0.5) / n) * TAU, R, uh + 0.028));
  }
  // the horseshoe: the Great Trilithon at the back, smaller ones toward the open front
  for (const [a, h] of [[PI, 0.74], [PI - 0.78, 0.64], [PI + 0.78, 0.64], [PI - 1.5, 0.56], [PI + 1.5, 0.56]]) {
    const t = group();
    for (const s of [1, -1]) t.add(at(roughBlock(0.1, h, 0.085, S(), rng, 0.1, 2), s * 0.065, 0, 0));
    t.add(at(roughBox(0.3, 0.07, 0.09, S(), rng, 0.05), 0, h + 0.035, 0));
    g.add(place(t, a, 0.42));
  }
  // bluestones: a circle inside the sarsens and a horseshoe inside the trilithons
  for (let i = 0; i < 24; i++) {
    const a = ((i + 0.5) / 24) * TAU;
    if (Math.abs(Math.sin(a / 2)) < 0.12) continue;
    g.add(place(roughBlock(0.05, 0.16 + rng() * 0.05, 0.04, blue, rng, 0.15), a, 0.62));
  }
  for (let i = 0; i < 9; i++) {
    const a = PI + (i - 4) * 0.36;
    g.add(place(roughBlock(0.045, 0.22, 0.04, blue, rng, 0.12), a, 0.27));
  }
  g.add(place(roughBlock(0.24, 0.04, 0.09, mat(0x8a8070, { flat: true }), rng, 0.1), PI, 0.12));
  // the Heel Stone, unshaped and leaning, out by the entrance; the Slaughter Stone lying flat
  const heel = roughBlock(0.14, 0.34, 0.12, S(), rng, 0.25, 2);
  g.add(rot(at(scl(heel, 0.8), 0.78, 0, 1.0), -0.1, 0.4, 0.12));
  g.add(place(roughBlock(0.24, 0.05, 0.09, S(), rng, 0.15), 0.2, 0.98));
  // the bank, low and chalky
  const bank = lathe([[1.24, 0], [1.2, 0.03], [1.14, 0.04], [1.08, 0.025], [1.05, 0]], mat(0xb4b88a, { flat: true }), 40);
  g.add(bank);
  return bake(g);
}

// a T-shaped pillar: a slab shaft and a head overhanging toward +x (its face), its broad sides
// toward ±z carved in low relief with arms, hands, a belt and, on the great ones, a leaping fox
function tPillar(h, m, relief, rng, fox) {
  const g = group();
  const a = h * 0.34, t = h * 0.12;
  g.add(roughBlock(a, h * 0.8, t, m, rng, 0.03));
  g.add(at(roughBox(a * 1.85, h * 0.2, t * 1.02, m, rng, 0.03), a * 0.3, h * 0.9, 0));
  const r = h * 0.035, d = t / 2 + r * 0.25;
  for (const s of [1, -1]) {
    g.add(at(box(r, h * 0.3, r, relief), -a * 0.18, h * 0.6, s * d));
    g.add(at(box(a * 0.7, r, r, relief), a * 0.16, h * 0.45, s * d));
    if (fox) {
      const fx = extrude([[-0.5, 0.1], [-0.15, 0.24], [0.2, 0.2], [0.42, 0.3], [0.47, 0.42], [0.53, 0.3], [0.68, 0.22], [0.5, 0.08], [0.32, 0.06],
        [0.38, -0.26], [0.26, -0.26], [0.15, 0], [-0.15, 0], [-0.32, -0.26], [-0.44, -0.26], [-0.4, 0.02], [-0.72, -0.12], [-0.92, -0.06], [-0.62, 0.14]], 0.12, relief);
      g.add(at(scl(fx, h * 0.11, h * 0.11, r * 3), 0, h * 0.67, s * d));
    }
  }
  g.add(at(box(a + r, r * 1.3, t + r, relief), 0, h * 0.36, 0));
  return g;
}

// a round enclosure of the Göbekli Tepe kind: a dry-stone wall with T-pillars set in it, facing
// in, and two great pillars in the middle
function tPillars(rng) {
  const g = group();
  const lime = mat(0xeee4c8, { flat: true }), relief = mat(0xcbb994, { flat: true });
  const wall = [0x9c8a6e, 0x8e7e64, 0xa8967a].map((c) => mat(c, { flat: true }));
  const R0 = 0.74, R1 = 0.88;
  for (let c = 0; c < 2; c++) {
    const n = 26 - c * 2;
    for (let i = 0; i < n; i++) {
      const a = ((i + c * 0.5) / n) * TAU;
      if (Math.cos(a) > 0.97) continue;
      const len = (TAU * ((R0 + R1) / 2)) / n - 0.01, h = 0.07 + rng() * 0.015;
      const b = roughBox(len, h, R1 - R0 + (rng() - 0.5) * 0.03, pick(rng, wall), rng, 0.08);
      b.position.set(Math.sin(a) * (R0 + R1) / 2, c * 0.075 + h / 2, Math.cos(a) * (R0 + R1) / 2);
      b.rotation.y = a;
      g.add(b);
    }
  }
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * TAU;
    const p = tPillar(0.46 + rng() * 0.06, lime, relief, rng, false);
    p.position.set(Math.sin(a) * 0.7, 0, Math.cos(a) * 0.7);
    p.rotation.y = a + PI / 2;
    g.add(p);
  }
  g.add(rot(at(tPillar(0.95, lime, relief, rng, true), -0.24, 0, 0.06), 0, PI, 0));
  g.add(at(tPillar(0.92, lime, relief, rng, true), 0.24, 0, -0.06));
  g.add(at(cyl(0.75, 0.75, 0.012, mat(0xd6c8a6), 32), 0, 0.006, 0));
  return bake(g);
}

// ---- Egypt and Mesopotamia, about 2500 BCE --------------------------------------------------
// gilding: bright without an environment to reflect
const GOLD = () => mat(0xe8c050, { metalness: 0.35, roughness: 0.3, emissive: 0x6a4a10, emissiveIntensity: 0.6, flat: true });

// the nemes: lapis and gold stripes
const nemesDraw = (x, w, h) => {
  x.fillStyle = '#d9b45a'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#2e4f8a';
  for (let j = 0; j < 4; j++) x.fillRect(0, (j * h) / 4, w, h / 8);
};
const NEMES = { name: 'nemes', w: 8, h: 64, draw: nemesDraw, repeat: [1, 6] };
const NEMES_CAP = { name: 'nemes-cap', w: 8, h: 64, draw: nemesDraw, repeat: [1, 3] };
// red granite with a column of hieroglyphs down each face
const GLYPHS = {
  name: 'glyphs', w: 128, h: 512, repeat: [1, 1],
  draw: (x, w, h) => {
    const r = mulberry(5);
    x.fillStyle = '#c07a62'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? 'rgba(90,40,30,0.25)' : 'rgba(255,220,200,0.25)'; x.fillRect(r() * w, r() * h, 1.5, 1.5); }
    x.fillStyle = '#6e3326';
    for (let f = 0; f < 4; f++) {
      const cx = (f + 0.5) * (w / 4);
      for (let y = 40; y < h - 50; y += 15) {
        const k = Math.floor(r() * 5);
        if (k === 0) x.fillRect(cx - 5, y, 10, 4);
        else if (k === 1) { x.beginPath(); x.arc(cx, y + 4, 4, 0, TAU); x.fill(); }
        else if (k === 2) { x.fillRect(cx - 4, y, 3, 10); x.fillRect(cx + 1, y + 2, 4, 8); }
        else if (k === 3) { x.beginPath(); x.moveTo(cx - 5, y + 10); x.lineTo(cx + 5, y + 10); x.lineTo(cx, y); x.fill(); }
        else { x.beginPath(); x.ellipse(cx, y + 5, 5, 3, 0, 0, TAU); x.fill(); x.fillRect(cx + 2, y - 1, 3, 4); }
      }
      x.fillRect(cx - 9, 30, 18, 3);
    }
  },
};

// the great pyramid: smooth white limestone casing and a gilded capstone, on a paved apron with a
// small temple at its foot
function pyramid(rng) {
  const g = group();
  const casing = mat(0xe9dcbc, { flat: true });
  const H = 0.64, cut = 0.86;
  g.add(block(1.34, 0.025, 1.34, mat(0xe0cca0, { flat: true })));
  g.add(at(frustum(1, 1, 1 - cut, 1 - cut, H * cut, casing), 0, 0.025, 0));
  g.add(at(frustum(1 - cut, 1 - cut, 0.002, 0.002, H * (1 - cut), GOLD()), 0, 0.025 + H * cut, 0));
  // the temple at the foot of the east face, and the start of its causeway
  const lime = mat(0xeadcbc, { flat: true });
  g.add(at(block(0.3, 0.07, 0.1, lime), 0, 0.025, 0.56));
  g.add(at(block(0.32, 0.015, 0.12, mat(0xd8c49a, { flat: true })), 0, 0.095, 0.56));
  g.add(at(box(0.05, 0.05, 0.012, mat(0x3a2e24)), 0, 0.05, 0.611));
  return bake(g);
}

// a step pyramid of six battered stages, like Djoser's
function stepPyramid(rng) {
  const g = group();
  const stone = [0xe2cfa2, 0xd6c094].map((c) => mat(c, { flat: true }));
  let w = 1.24, d = 0.96, y = 0.025;
  g.add(block(1.42, 0.025, 1.14, mat(0xd8c49a, { flat: true })));
  for (const [i, h] of [0.14, 0.125, 0.11, 0.1, 0.09, 0.08].entries()) {
    const inset = h * 0.16;
    g.add(at(frustum(w, d, w - 2 * inset, d - 2 * inset, h, stone[i % 2]), 0, y, 0));
    // a darker course line just under each ledge
    y += h; w -= 2 * inset + 0.1; d -= 2 * inset + 0.085;
  }
  // a doorway at the foot of the south face
  g.add(at(box(0.05, 0.06, 0.02, mat(0x3a2e24)), 0, 0.055, 0.475));
  return bake(g);
}

// a recumbent sphinx lying along +x, its painted nemes striped lapis and gold, its head turned a
// little toward the viewer
function sphinx(rng) {
  const g = group();
  const stone = mat(0xdcb47e), shade = mat(0xc99e68), face = mat(0xd49e68), dark = mat(0x2a1e18);
  const b = 0.06;
  g.add(at(block(1.8, b, 0.66, mat(0xc8ab7a, { flat: true })), 0.02, 0, 0));
  g.add(loft(
    [[-0.76, b + 0.15, 0], [-0.7, b + 0.19, 0], [-0.52, b + 0.22, 0], [-0.3, b + 0.18, 0], [-0.06, b + 0.19, 0], [0.12, b + 0.2, 0], [0.22, b + 0.2, 0]],
    [[0.02, 0.02], [0.17, 0.2], [0.215, 0.245], [0.17, 0.2], [0.19, 0.22], [0.2, 0.23], [0.02, 0.02]], stone, 26, 14));
  g.add(at(rot(egg(0.2, 0.12, 0.05, stone, 10, 6), 0, 0, 0.25), -0.48, b + 0.12, 0.21));
  g.add(at(egg(0.15, 0.27, 0.23, stone, 14, 10), 0.17, b + 0.27, 0));
  for (const s of [1, -1]) {
    g.add(at(box(0.46, 0.11, 0.12, stone, 0.04), 0.48, b + 0.055, s * 0.125));
    g.add(at(egg(0.07, 0.05, 0.07, shade, 8, 6), 0.71, b + 0.045, s * 0.125));
  }
  g.add(at(box(0.2, 0.08, 0.1, stone, 0.035), -0.4, b + 0.04, 0.22));
  g.add(at(egg(0.05, 0.04, 0.06, shade, 8, 5), -0.3, b + 0.035, 0.22));
  g.add(taper([[-0.72, b + 0.14, 0.1], [-0.76, b + 0.04, 0.2], [-0.62, b + 0.03, 0.27], [-0.44, b + 0.04, 0.28]], 0.026, 0.016, stone, 12, 6));
  g.add(limb([0.2, b + 0.4, 0], [0.3, b + 0.58, 0], 0.13, 0.1, stone, 10));
  // the head, in its own frame facing +x
  const h = group();
  h.add(box(0.17, 0.2, 0.16, face, 0.05));
  const hood = extrude([[-0.2, -0.24], [0.2, -0.24], [0.12, 0.08], [-0.12, 0.08]], 0.12, tmat(NEMES, 0xffffff));
  h.add(at(rot(hood, 0, PI / 2, 0), -0.06, 0, 0));
  h.add(at(scl(ball(0.12, tmat(NEMES_CAP, 0xffffff), 14), 0.95, 0.8, 1.05), -0.02, 0.06, 0));
  for (const s of [1, -1]) h.add(at(rot(box(0.05, 0.22, 0.05, tmat(NEMES_CAP, 0xffffff)), s * 0.12, 0, 0), 0.03, -0.15, s * 0.11));
  h.add(at(box(0.045, 0.1, 0.04, mat(0x2e4f8a)), 0.07, -0.15, 0));
  for (const s of [1, -1]) h.add(at(box(0.01, 0.018, 0.035, dark), 0.086, 0.03, s * 0.042));
  h.add(at(box(0.03, 0.05, 0.03, face), 0.09, -0.01, 0));
  h.add(at(cyl(0.012, 0.016, 0.05, GOLD(), 6), 0.08, 0.12, 0));
  rot(h, 0, -0.32, 0);
  scl(h, 1.35);
  g.add(at(h, 0.33, b + 0.7, 0));
  return bake(g);
}

// an obelisk of red granite with a column of hieroglyphs on each face and a gilded pyramidion
function obelisk(rng) {
  const g = group();
  g.add(block(0.32, 0.035, 0.32, mat(0xbfae8a, { flat: true })));
  g.add(at(block(0.24, 0.06, 0.24, mat(0xcdbd98, { flat: true })), 0, 0.035, 0));
  g.add(at(frustum(0.13, 0.13, 0.086, 0.086, 0.92, tmat(GLYPHS, 0xffffff, { flat: true })), 0, 0.095, 0));
  g.add(at(frustum(0.086, 0.086, 0.001, 0.001, 0.08, GOLD()), 0, 1.015, 0));
  return bake(g);
}

// a stepped ziggurat of mud brick, like Ur's: three battered terraces with buttresses, three
// stairways meeting at the first terrace, and a shrine on top with a frieze of blue glaze
function ziggurat(rng) {
  const g = group();
  const brick = [0xb5845a, 0xc29266, 0xcda070].map((c) => mat(c, { flat: true }));
  const pier = mat(0xa47650, { flat: true }), stair = mat(0xd8b88a, { flat: true });
  const tiers = [[1.4, 0.95, 0.3, 0, 0.07], [0.96, 0.62, 0.19, -0.07, 0.04], [0.58, 0.38, 0.12, -0.1, 0.025]];
  let y = 0;
  tiers.forEach(([w, d, h, z, ins], i) => {
    g.add(at(frustum(w, d, w - 2 * ins, d - 2 * ins, h, brick[i]), 0, y, z));
    // buttresses leaning with the wall
    const lean = Math.atan2(ins, h), len = Math.hypot(ins, h);
    const nx = Math.round(w / 0.13), nz = Math.round(d / 0.13);
    for (let k = 1; k < nx; k++) {
      const x = -w / 2 + (k * w) / nx;
      if (i === 0 && Math.abs(x) < 0.16) continue;
      for (const s of [1, -1]) g.add(at(rot(box(0.035, len, 0.024, pier), -s * lean, 0, 0), x * (1 - (ins / w)), y + h / 2, z + s * (d / 2 - ins / 2 + 0.008)));
    }
    for (let k = 1; k < nz; k++) {
      const zz = -d / 2 + (k * d) / nz;
      for (const s of [1, -1]) g.add(at(rot(box(0.024, len, 0.035, pier), 0, 0, s * lean), s * (w / 2 - ins / 2 + 0.008), y + h / 2, z + zz * (1 - ins / d)));
    }
    y += h;
  });
  // the central stair up to the second terrace, and the two side stairs along the front face
  const [w0, d0, h0] = tiers[0];
  const n = 12, run = 0.42;
  for (let k = 0; k < n; k++) {
    const sh = ((k + 1) * h0) / n;
    g.add(at(block(0.15, sh, run / n + 0.002, stair), 0, 0, d0 / 2 + run - ((k + 0.5) * run) / n));
  }
  for (const s of [1, -1]) {
    g.add(at(rot(box(0.03, 0.03, Math.hypot(run, h0) + 0.04, pier), Math.atan2(h0, run), 0, 0), s * 0.09, h0 / 2 + 0.02, d0 / 2 + run / 2));
    for (let k = 0; k < n; k++) {
      const sh = ((k + 1) * h0) / n, x = s * (0.6 - ((k + 0.5) * 0.48) / n);
      g.add(at(block(0.48 / n + 0.002, sh, 0.12, stair), x, 0, d0 / 2 + 0.03));
    }
  }
  const [, , h1, z1] = tiers[1], up = d0 / 2 - 0.07 - (z1 + tiers[1][1] / 2);
  for (let k = 0; k < 6; k++) {
    const sh = ((k + 1) * h1) / 6;
    g.add(at(block(0.13, sh, up / 6 + 0.002, stair), 0, h0, d0 / 2 - 0.07 - ((k + 0.5) * up) / 6));
  }
  // the gate at the head of the stairs
  g.add(at(block(0.2, 0.08, 0.08, brick[1]), 0, h0, d0 / 2 - 0.1));
  g.add(at(box(0.07, 0.06, 0.01, mat(0x2a1e16)), 0, h0 + 0.03, d0 / 2 - 0.059));
  // the shrine: white walls, a band of blue glaze, a dark door toward the stairs
  const top = y, zt = tiers[2][3];
  g.add(at(block(0.3, 0.13, 0.2, mat(0xefe6d2, { flat: true })), 0, top, zt));
  g.add(at(box(0.31, 0.03, 0.21, mat(0x2f6aaa)), 0, top + 0.11, zt));
  g.add(at(box(0.33, 0.02, 0.23, mat(0xe2d6bc)), 0, top + 0.135, zt));
  g.add(at(box(0.06, 0.08, 0.01, mat(0x2a1e16)), 0, top + 0.04, zt + 0.101));
  // trees planted on the first terrace
  const leaf = mat(0x4f8a3a, { flat: true });
  for (const [x, z] of [[-0.58, 0.36], [0.58, 0.36], [-0.58, -0.38], [0.58, -0.38], [-0.42, 0.36], [0.42, 0.36]]) g.add(at(lump(0.045, leaf), x, h0 + 0.04, z));
  return bake(g);
}

// a flat-roofed mud-brick house: palm-log beams under the roof, a door and a small window, and
// on the roof a little room or a shade of reed matting
function mudbrickHouse(rng) {
  const g = group();
  const w = range(rng, 0.55, 0.75), h = range(rng, 0.3, 0.4), d = 0.5;
  const wallC = rng() < 0.25 ? 0xe8dcc4 : pick(rng, [0xc89e6c, 0xb98a5a, 0xd4b080, 0xbf9466]);
  const wall = mat(wallC, { flat: true }), roof = mat(0xb08e62, { flat: true }), dark = mat(0x2a1e16), log = mat(0x7a5a3a);
  g.add(block(w, h, d, wall));
  g.add(at(box(w + 0.03, 0.03, d + 0.03, roof), 0, h + 0.015, 0));
  for (let i = 0; i < 4; i++) g.add(at(rot(cyl(0.014, 0.014, 0.06, log, 5), PI / 2, 0, 0), -w / 2 + 0.07 + (i * (w - 0.14)) / 3, h - 0.025, d / 2 + 0.02));
  const dx = (rng() < 0.5 ? -1 : 1) * w * 0.2;
  g.add(at(box(0.11, 0.19, 0.02, dark), dx, 0.095, d / 2));
  g.add(at(box(0.07, 0.05, 0.02, dark), -dx, h * 0.62, d / 2));
  if (rng() < 0.5) {
    const rw = w * 0.42;
    g.add(at(block(rw, h * 0.45, d * 0.5, wall), -w / 2 + rw / 2 + 0.02, h + 0.03, -d / 4 + 0.02));
    g.add(at(box(rw + 0.03, 0.025, d * 0.5 + 0.03, roof), -w / 2 + rw / 2 + 0.02, h + 0.03 + h * 0.45 + 0.012, -d / 4 + 0.02));
    g.add(at(box(0.05, 0.08, 0.02, dark), -w / 2 + rw / 2 + 0.02, h + 0.07, 0.02));
  } else {
    const reed = mat(0xc4a868), sx = w * 0.18;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(tube(0.008, 0.008, 0.14, log, 4), sx + x * 0.12, h + 0.1, z * 0.1));
    g.add(at(box(0.3, 0.015, 0.26, reed), sx, h + 0.175, 0));
  }
  const jar = lathe([[0.0, 0], [0.035, 0.01], [0.05, 0.05], [0.04, 0.09], [0.022, 0.1], [0.026, 0.115]], mat(0xb0623a), 6);
  g.add(at(jar, dx + 0.11, 0, d / 2 + 0.05));
  return bake(g);
}

// a Nile boat under a tall lateen sail, bow toward +x
function felucca(rng) {
  const g = group();
  const L = 1.1, H = hull(L, 0.3, 0.12, 0.08, 0.04, { full: 0.5, sharp: 2.2 });
  const HULL = {
    name: 'hull-nile', w: 4, h: 128, repeat: [1, 1],
    draw: (x, w, h) => {
      for (let j = 0; j < h; j++) {
        const v = Math.min(j, h - 1 - j) / h;
        x.fillStyle = v < 0.05 ? '#5a3a22' : v < 0.12 ? '#2e6aa8' : v < 0.15 ? '#e8dcc0' : v < 0.45 ? '#b07a48' : '#5a3a22';
        x.fillRect(0, j, w, 1);
      }
    },
  };
  g.add(mesh(H.geo, tmat(HULL, 0xffffff, { side: DS })));
  g.add(mesh(H.deck, mat(0xa8784a)));
  const wood = mat(0x6a4a2e), sailM = mat(0xf6f0e2, { side: DS });
  const mx = 0.16, Y0 = [0.55, 0.24, 0.03], Y1 = [-0.48, 1.24, 0.03], CL = [-0.38, 0.2, 0.03];
  g.add(limb([mx, H.top(mx) - 0.02, 0], [mx, 0.66, 0], 0.013, 0.01, wood, 6));
  g.add(limb(Y0, Y1, 0.01, 0.007, wood, 5));
  g.add(limb(Y0, CL, 0.007, 0.007, wood, 4));
  // the sail, billowing a little toward +z
  const n = 6, P = (a, b2) => {
    const c = 1 - a - b2;
    return [0, 1, 2].map((k) => Y0[k] * a + Y1[k] * b2 + CL[k] * c + (k === 2 ? 0.09 * 27 * a * b2 * c * 0.6 + 0.005 : 0));
  };
  const pts = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
    const a = i / n, b2 = j / n, e = 1 / n;
    pts.push(P(a, b2), P(a + e, b2), P(a, b2 + e));
    if (j < n - i - 1) pts.push(P(a + e, b2), P(a + e, b2 + e), P(a, b2 + e));
  }
  g.add(mesh(smoothGeo(pts), sailM));
  // the steering oar and the boatman
  g.add(limb([-0.4, H.top(-0.4) + 0.03, -0.09], [-0.56, 0.0, -0.1], 0.008, 0.008, wood, 4));
  g.add(at(box(0.05, 0.08, 0.012, wood), -0.545, 0.03, -0.1));
  g.add(at(cyl(0.035, 0.028, 0.09, mat(0xf0ead8), 6), -0.3, H.top(-0.3) - 0.01 + 0.045, 0));
  g.add(at(ball(0.026, mat(0x8a5a3a), 6), -0.3, H.top(-0.3) + 0.11, 0));
  return bake(g);
}

// a date palm: a stubbled trunk, a crown of arching fronds, and orange dates under them
function datePalm(rng) {
  const g = group(), tr = group();
  const bark = mat(pick(rng, [0x8a6a48, 0x7a5c40]), { flat: true });
  const old = mat(pick(rng, [0x5e8a36, 0x6a9238]), { side: DS }), young = mat(pick(rng, [0x4a8a3a, 0x56993f]), { side: DS });
  const H = range(rng, 0.78, 0.92), n = 6;
  for (let i = 0; i < n; i++) {
    const h = H / n, r = 0.05 - i * 0.003;
    tr.add(at(tube(r * 0.8, r * 1.15, h * 1.04, bark, 5), 0, i * h + h / 2, 0));
  }
  const frond = (a, e, len, droop, m) => {
    const pts = [], up = V(0, 1, 0), dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-Math.sin(a), 0, Math.cos(a));
    const P = (s) => dir.clone().multiplyScalar(len * s * Math.cos(e)).add(V(0, H + len * s * Math.sin(e) - droop * s * s, 0));
    const ss = [0, 0.3, 0.55, 0.8, 1];
    const W = (s) => 0.085 * Math.sin(PI * Math.min(1, s * 1.15 + 0.04));
    for (let i = 0; i < ss.length - 1; i++) {
      const s0 = ss[i], s1 = ss[i + 1], M0 = P(s0), M1 = P(s1);
      const L0 = M0.clone().addScaledVector(side, W(s0)).addScaledVector(up, W(s0) * 0.35), L1 = M1.clone().addScaledVector(side, W(s1)).addScaledVector(up, W(s1) * 0.35);
      const R0 = M0.clone().addScaledVector(side, -W(s0)).addScaledVector(up, W(s0) * 0.35), R1 = M1.clone().addScaledVector(side, -W(s1)).addScaledVector(up, W(s1) * 0.35);
      for (const t of [[M0, M1, L1], [M0, L1, L0], [M0, R1, M1], [M0, R0, R1]]) pts.push(...t.map((v) => v.toArray()));
    }
    return mesh(triGeo(pts), m);
  };
  const k = 9, a0 = rng() * TAU;
  for (let i = 0; i < k; i++) tr.add(frond(a0 + (i / k) * TAU + (rng() - 0.5) * 0.3, 0.3 + rng() * 0.15, 0.56, 0.5, old));
  for (let i = 0; i < 5; i++) tr.add(frond(a0 + 0.35 + (i / 5) * TAU, 1.0, 0.4, 0.24, young));
  tr.add(at(lump(0.05, mat(0x6a5a2e, { flat: true })), 0, H, 0));
  const date = mat(0xd8822a, { flat: true });
  for (let i = 0; i < 3; i++) {
    const a = a0 + (i / 3) * TAU + 0.6;
    tr.add(at(scl(lump(0.032, date), 1, 1.4, 1), Math.cos(a) * 0.05, H - 0.06, Math.sin(a) * 0.05));
  }
  rot(tr, (rng() - 0.5) * 0.12, 0, (rng() - 0.5) * 0.16);
  g.add(tr);
  return bake(g);
}

// ---- Rome, 120 CE ---------------------------------------------------------------------------
const V2 = (x, y) => new THREE.Vector2(x, y);
// a panel w × h with arched openings, extruded to depth along z (centred): an arcade, a bay
function arcadeGeo(w, h, depth, arches, segs = 6) {
  const s = new THREE.Shape([V2(-w / 2, 0), V2(w / 2, 0), V2(w / 2, h), V2(-w / 2, h)]);
  for (const [cx, open, sill, spring] of arches) {
    const r = open / 2, p = new THREE.Path();
    p.moveTo(cx - r, sill); p.lineTo(cx + r, sill); p.lineTo(cx + r, spring);
    p.absarc(cx, spring, r, 0, PI, false);
    p.lineTo(cx - r, sill);
    s.holes.push(p);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: segs });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

// the Colosseum: an elliptical amphitheatre of travertine, three storeys of arcades and an attic
// outside, the cavea stepping down inside to the sand of the arena. Built round, then squashed.
function colosseum(rng) {
  const g = group(), ring = group();
  const trav = mat(0xe2cca2), band = mat(0xece0c2), inner = mat(0x96805e), dark = mat(0x5a4a3a);
  const seats = mat(0xdccfb2, { side: DS, flat: true }), sand = mat(0xe9cf94);
  const R = 1, N = 32, bay = (TAU * R) / N, depth = 0.05;
  const tiers = [[0, 0.24, 0.01], [0.24, 0.22, 0.035], [0.46, 0.22, 0.035]];
  const place = (o, a, r, y = 0) => { o.position.set(Math.sin(a) * r, y, Math.cos(a) * r); o.rotation.y = a; return o; };
  for (const [y0, h, sill] of tiers) {
    const geo = arcadeGeo(bay + 0.004, h, depth, [[0, bay * 0.56, sill, h * 0.66]], 5);
    for (let i = 0; i < N; i++) {
      const a = ((i + 0.5) / N) * TAU;
      ring.add(place(mesh(geo, trav), a, R, y0));
      ring.add(place(tube(0.013, 0.012, h - 0.02, band, 5), (i / N) * TAU, R + depth / 2 + 0.004, y0 + h / 2));
    }
    ring.add(at(lathe([[R + 0.03, y0 + h - 0.022], [R + 0.042, y0 + h - 0.012], [R + 0.044, y0 + h], [R + 0.03, y0 + h + 0.004]], band, 48), 0, 0, 0));
    ring.add(at(mesh(new THREE.RingGeometry(R - 0.08, R, 48, 1).rotateX(-PI / 2), inner), 0, y0 + 0.002, 0));
  }
  // the attic: a solid wall with pilasters and a small window in every other bay, masts on top
  const top = 0.68, ah = 0.16;
  ring.add(lathe([[R + 0.024, top], [R + 0.024, top + ah], [R - 0.03, top + ah], [R - 0.03, top]], trav, 48));
  ring.add(lathe([[R + 0.03, top + ah - 0.02], [R + 0.044, top + ah - 0.008], [R + 0.044, top + ah + 0.01], [R - 0.03, top + ah + 0.012]], band, 48));
  for (let i = 0; i < N; i++) {
    ring.add(place(box(0.022, ah - 0.02, 0.012, band), (i / N) * TAU, R + 0.028, top + ah / 2 - 0.01));
    if (i % 2 === 0) ring.add(place(box(0.04, 0.05, 0.01, dark), ((i + 0.5) / N) * TAU, R + 0.022, top + ah * 0.5));
    if (i % 2 === 1) ring.add(place(tube(0.006, 0.005, 0.12, mat(0x8a6a48), 4), (i / N) * TAU, R + 0.01, top + ah + 0.06));
  }
  // the corridors behind the arches
  ring.add(lathe([[R - 0.08, 0], [R - 0.08, top]], inner, 48));
  // the cavea, in three bands of seats with walkways between, down to the podium round the arena
  const prof = [[R - 0.03, top + 0.002]];
  let r = R - 0.06, y = 0.62;
  prof.push([r, top + 0.002], [r, y]);
  for (const [n, step] of [[4, 0.034], [5, 0.032], [5, 0.03]]) {
    for (let k = 0; k < n; k++) { r -= step; prof.push([r, y]); y -= step * 0.95; prof.push([r, y]); }
    r -= 0.025; prof.push([r, y]); y -= 0.035; prof.push([r, y]);
  }
  prof.push([r - 0.02, y], [r - 0.02, 0.02]);
  const arena = r - 0.02;
  ring.add(lathe(prof, seats, 40));
  ring.add(at(lathe([[arena + 0.002, y - 0.03], [arena + 0.002, y + 0.006]], mat(0xa8442e), 48), 0, 0, 0));
  ring.add(at(cyl(arena, arena, 0.03, sand, 48), 0, 0.015, 0));
  // a pavement round the outside
  ring.add(at(mesh(new THREE.RingGeometry(R, R + 0.14, 48, 1).rotateX(-PI / 2), mat(0xd8c8a6)), 0, 0.004, 0));
  scl(ring, 1, 1, 0.84);
  g.add(ring);
  return bake(g);
}

// a Roman temple on a high podium: steps between the podium's cheeks, six columns in front, a
// cella with engaged columns, a pediment with a gilded shield, and a roof of red tiles
function romanTemple(rng) {
  const g = group();
  const marble = mat(C.marble), pod = mat(0xe2d4b6, { flat: true }), gold = GOLD(), bronze = mat(0x6a5030);
  const W = 0.62, D = 1.0, ph = 0.2, ch = 0.5, sd = 0.28;
  g.add(block(W + 0.05, 0.035, D + 0.05, pod));
  g.add(block(W, ph, D, pod));
  g.add(at(block(W + 0.03, 0.025, D + 0.03, marble), 0, ph - 0.025, 0));
  const steps = 9, sw = W - 0.18;
  for (let k = 0; k < steps; k++) g.add(at(block(sw, ((k + 1) * ph) / steps, sd / steps + 0.002, marble), 0, 0, D / 2 + sd - ((k + 0.5) * sd) / steps));
  for (const s of [1, -1]) {
    g.add(at(block(0.09, ph, sd, pod), s * (W / 2 - 0.045), 0, D / 2 + sd / 2));
    g.add(at(block(0.1, 0.025, sd + 0.01, marble), s * (W / 2 - 0.045), ph - 0.025, D / 2 + sd / 2));
  }
  const column = (x, z, engaged = false) => {
    const c = group();
    c.add(at(cyl(0.036, 0.034, 0.025, marble, 10), 0, 0.0125, 0));
    c.add(at(cyl(0.028, 0.023, ch - 0.08, marble, 10), 0, 0.025 + (ch - 0.08) / 2, 0));
    c.add(at(cyl(0.024, 0.038, 0.04, marble, 10), 0, ch - 0.055 + 0.02, 0));
    c.add(at(box(0.085, 0.016, 0.085, marble), 0, ch - 0.008, 0));
    return at(c, x, ph, z);
  };
  const zf = D / 2 - 0.05;
  for (let i = 0; i < 6; i++) g.add(column(-W / 2 + 0.05 + (i * (W - 0.1)) / 5, zf));
  for (const s of [1, -1]) for (const dz of [0.15, 0.3]) g.add(column(s * (W / 2 - 0.05), zf - dz));
  // the cella, its walls ringed by half-columns
  const cz0 = zf - 0.38, cz1 = -D / 2 + 0.04, cw = W - 0.12;
  g.add(at(block(cw, ch, cz0 - cz1, marble), 0, ph, (cz0 + cz1) / 2));
  for (let k = 0; k <= 4; k++) for (const s of [1, -1]) g.add(column(s * (cw / 2), cz0 - 0.02 - (k * (cz0 - cz1 - 0.04)) / 4));
  g.add(at(box(0.15, 0.3, 0.012, bronze), 0, ph + 0.15, cz0 + 0.006));
  // the entablature, the pediments and the roof
  const ey = ph + ch;
  g.add(at(block(W - 0.02, 0.04, D - 0.04, marble), 0, ey, -0.01));
  g.add(at(block(W, 0.04, D - 0.02, mat(0xe8e0cc)), 0, ey + 0.04, -0.01));
  g.add(at(block(W + 0.04, 0.02, D + 0.01, marble), 0, ey + 0.08, -0.01));
  const pH = 0.17, ry = ey + 0.1;
  const roof = mesh(roofGeo(D + 0.03, W + 0.06, pH, 0, 9), tmat(TILES, C.terracotta));
  g.add(at(rot(roof, 0, PI / 2, 0), 0, ry, -0.01));
  for (const s of [1, -1]) {
    const tymp = extrude([[-W / 2 + 0.01, 0], [W / 2 - 0.01, 0], [0, pH - 0.025]], 0.03, mat(0xe0d8c4));
    g.add(at(s > 0 ? tymp : rot(tymp, 0, PI, 0), 0, ry, s * (D / 2 - 0.0)));
    for (const k of [1, -1]) {
      const len = Math.hypot(W / 2 + 0.04, pH), a = Math.atan2(pH, W / 2 + 0.04);
      g.add(at(rot(box(len, 0.022, 0.05, marble), 0, 0, k * a), (-k * (W / 2 + 0.04)) / 2, ry + pH / 2 + 0.006, s * (D / 2 + 0.005)));
    }
  }
  g.add(at(rot(cyl(0.035, 0.035, 0.012, gold, 12), PI / 2, 0, 0), 0, ry + 0.06, D / 2 + 0.02));
  g.add(at(cone(0.03, 0.08, gold, 6), 0, ry + pH + 0.05, D / 2 - 0.01));
  for (const s of [1, -1]) g.add(at(cone(0.022, 0.06, gold, 6), s * (W / 2 + 0.02), ry + 0.04, D / 2 - 0.01));
  // an altar before the steps
  g.add(at(block(0.12, 0.07, 0.08, marble), 0, 0, D / 2 + sd + 0.1));
  g.add(at(block(0.13, 0.015, 0.09, mat(0xa8442e)), 0, 0.07, D / 2 + sd + 0.1));
  return bake(g);
}

// a run of an aqueduct: tall arches of golden tufa, impost mouldings, rings of lighter voussoirs,
// and an open channel of water along the top
function aqueduct(rng) {
  const g = group();
  const stone = mat(pick(rng, [0xcfb07c, 0xc6a672, 0xd4b886])), lite = mat(0xe2cc9e), water = mat(0x3f8ac8, { roughness: 0.25, emissive: 0x0a2a48, emissiveIntensity: 0.5 });
  const n = 7, bay = 0.34, open = 0.23, pw = bay - open, L = n * bay + pw, Hs = 0.84, spring = 0.6, depth = 0.15;
  const arches = [];
  for (let i = 0; i < n; i++) arches.push([-L / 2 + pw + i * bay + open / 2, open, 0.035, spring]);
  g.add(mesh(arcadeGeo(L, Hs, depth, arches, 8), stone));
  for (let i = 0; i <= n; i++) {
    const x = -L / 2 + pw / 2 + i * bay;
    g.add(at(box(pw + 0.024, 0.022, depth + 0.024, lite), x, spring, 0));
    g.add(at(block(pw + 0.03, 0.05, depth + 0.03, stone), x, 0, 0));
  }
  for (const [cx] of arches) for (const s of [1, -1]) {
    const t = mesh(new THREE.TorusGeometry(open / 2 + 0.014, 0.014, 3, 8, PI), lite);
    g.add(at(t, cx, spring, s * (depth / 2)));
  }
  g.add(at(box(L + 0.03, 0.03, depth + 0.04, lite), 0, Hs + 0.015, 0));
  g.add(at(block(L, 0.1, depth, stone), 0, Hs + 0.03, 0));
  g.add(at(box(L - 0.02, 0.012, depth - 0.06, water), 0, Hs + 0.12, 0));
  for (const s of [1, -1]) g.add(at(block(L, 0.03, 0.03, lite), 0, Hs + 0.13, s * (depth / 2 - 0.015)));
  return bake(g);
}

// an apartment block: a brick-faced ground floor of shops, plastered storeys above with rows of
// small windows, perhaps a wooden balcony, and a hipped roof of terracotta
function insula(rng) {
  const g = group();
  const floors = 3 + Math.floor(rng() * 3), fh = 0.18, w = range(rng, 0.5, 0.68), d = range(rng, 0.42, 0.5);
  const H = floors * fh;
  const plaster = mat(pick(rng, [0xead8b2, 0xdec49a, 0xe8cca4, 0xd6aa7a, 0xcf9a6a]), { flat: true });
  const brick = mat(pick(rng, [0xa85e3e, 0xb46a46]), { flat: true }), dark = mat(0x3a2a22), wood = mat(0x6a4a30);
  g.add(block(w, fh, d, brick));
  g.add(at(block(w, H - fh, d, plaster), 0, fh, 0));
  g.add(at(box(w + 0.012, 0.014, d + 0.012, mat(0xe6dcc6)), 0, fh, 0));
  g.add(at(mesh(roofGeo(w + 0.05, d + 0.05, 0.12, (d + 0.05) / 2, 1, false), mat(pick(rng, [0xc0583a, 0xb4532f, 0xc8683e]), { flat: true })), 0, H, 0));
  const win = (x, y, z, ry) => g.add(at(rot(panel(0.045, 0.06, dark), 0, ry, 0), x, y, z));
  const nf = Math.max(2, Math.round(w / 0.14)), ns = Math.max(2, Math.round(d / 0.15));
  for (let f = 1; f < floors; f++) {
    const y = f * fh + fh * 0.55;
    for (let i = 0; i < nf; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / nf;
      win(x, y, d / 2 + 0.001, 0);
      win(x, y, -d / 2 - 0.001, PI);
    }
    for (let i = 0; i < ns; i++) {
      const z = -d / 2 + ((i + 0.5) * d) / ns;
      win(w / 2 + 0.001, y, z, PI / 2);
      win(-w / 2 - 0.001, y, z, -PI / 2);
    }
  }
  const nshop = Math.max(2, Math.round(w / 0.18));
  for (let i = 0; i < nshop; i++) g.add(at(panel(0.1, 0.12, dark), -w / 2 + ((i + 0.5) * w) / nshop, 0.06, d / 2 + 0.001));
  if (rng() < 0.6) {
    g.add(at(box(w * 0.8, 0.012, 0.05, wood), 0, 2 * fh, d / 2 + 0.025));
    g.add(at(box(w * 0.8, 0.03, 0.006, wood), 0, 2 * fh + 0.02, d / 2 + 0.047));
  }
  return bake(g);
}

// a roof round a courtyard: from the outer eave up to a ridge and down to the opening
function ringRoof(o, h, y0, y1, y2, m) {
  const [ox0, oz0, ox1, oz1] = o, [hx0, hz0, hx1, hz1] = h;
  const mid = (a, b) => (a + b) / 2;
  const O = [[ox0, y0, oz1], [ox1, y0, oz1], [ox1, y0, oz0], [ox0, y0, oz0]];
  const M = [[mid(ox0, hx0), y1, mid(oz1, hz1)], [mid(ox1, hx1), y1, mid(oz1, hz1)], [mid(ox1, hx1), y1, mid(oz0, hz0)], [mid(ox0, hx0), y1, mid(oz0, hz0)]];
  const I = [[hx0, y2, hz1], [hx1, y2, hz1], [hx1, y2, hz0], [hx0, y2, hz0]];
  const pts = [];
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    pts.push(O[k], O[k1], M[k1], O[k], M[k1], M[k], M[k], M[k1], I[k1], M[k], I[k1], I[k]);
  }
  return mesh(triGeo(pts), m);
}

// a town house: a plain front with a door between shops, an atrium with its pool under the
// opening in the roof, and behind it a peristyle garden ringed with columns
function domus(rng) {
  const g = group();
  const wall = mat(pick(rng, [0xeee2c8, 0xe6d2ae, 0xdcc49c]), { flat: true }), tile = mat(pick(rng, [0xb4603c, 0xa85a38, 0xbc6a44]), { flat: true });
  const dark = mat(0x3a2a22), floor = mat(0xd8ccb0), water = mat(0x3f8ac8, { roughness: 0.25, emissive: 0x0a2a48, emissiveIntensity: 0.5 }), garden = mat(0x5e9a42), bush = mat(0x3f7a36, { flat: true }), col = mat(C.marble);
  const W = 0.8, D = 1.0, wh = 0.24, t = 0.04;
  g.add(at(block(W, wh, t, wall), 0, 0, D / 2 - t / 2));
  g.add(at(block(W, wh, t, wall), 0, 0, -D / 2 + t / 2));
  for (const s of [1, -1]) g.add(at(block(t, wh, D, wall), s * (W / 2 - t / 2), 0, 0));
  g.add(at(block(W, wh, 0.12, wall), 0, 0, -0.02));
  const dado = mat(0xa8442e);
  g.add(at(block(W + 0.006, 0.06, t + 0.006, dado), 0, 0, D / 2 - t / 2));
  for (const s of [1, -1]) g.add(at(block(t + 0.006, 0.06, D + 0.006, dado), s * (W / 2 - t / 2), 0, 0));
  // the atrium
  g.add(ringRoof([-W / 2 - 0.02, 0.04, W / 2 + 0.02, D / 2 + 0.02], [-0.12, 0.17, 0.12, 0.35], wh, wh + 0.06, wh + 0.02, tile));
  g.add(at(box(W - 0.02, 0.01, 0.44, floor), 0, 0.005, 0.26));
  g.add(at(box(0.16, 0.014, 0.12, water), 0, 0.008, 0.26));
  for (const [x, z] of [[-0.12, 0.17], [0.12, 0.17], [-0.12, 0.35], [0.12, 0.35]]) g.add(at(tube(0.012, 0.012, wh + 0.03, col, 5), x, (wh + 0.03) / 2, z));
  // the peristyle
  const ph = 0.13;
  g.add(ringRoof([-W / 2 + 0.02, -D / 2 + 0.02, W / 2 - 0.02, -0.08], [-0.27, -0.4, 0.27, -0.15], ph + 0.03, ph + 0.05, ph, tile));
  g.add(at(box(0.54, 0.012, 0.25, garden), 0, 0.006, -0.275));
  g.add(at(lump(0.05, bush), 0.17, 0.045, -0.24));
  g.add(at(tube(0.012, 0.01, 0.16, mat(0x6a4a30), 4), -0.15, 0.08, -0.3));
  g.add(at(scl(lump(0.07, bush), 1, 1.2, 1), -0.15, 0.2, -0.3));
  g.add(at(cyl(0.035, 0.035, 0.02, mat(0xe6dcc6), 6), 0.0, 0.016, -0.26));
  for (let i = 0; i < 3; i++) for (const z of [-0.4, -0.15]) g.add(at(tube(0.01, 0.01, ph, col, 5), -0.27 + (i * 0.54) / 2, ph / 2, z));
  // the street front: a door between two shops
  g.add(at(panel(0.07, 0.13, dark), 0, 0.065, D / 2 + 0.001));
  for (const s of [1, -1]) g.add(at(panel(0.09, 0.09, dark), s * 0.24, 0.045, D / 2 + 0.001));
  for (const s of [1, -1]) g.add(at(panel(0.035, 0.035, dark), s * (W / 2 + 0.001), 0.17, 0.25 * s));
  // rooms to let over the street front, under their own roof
  const uh = 0.15, ud = 0.18, uw = W * 0.46, ux = -W / 2 + uw / 2, uz = D / 2 - ud / 2;
  g.add(at(block(uw, uh, ud, wall), ux, wh, uz));
  g.add(at(mesh(roofGeo(uw + 0.04, ud + 0.04, 0.07, 0.09, 1, false), tile), ux, wh + uh, uz));
  for (let i = 0; i < 3; i++) g.add(at(panel(0.035, 0.05, dark), ux - uw / 2 + ((i + 0.5) * uw) / 3, wh + uh * 0.5, D / 2 + 0.001));
  return bake(group(scl(g, 0.85, 1.15, 0.82)));
}

// a legionary facing +z: red tunic, iron armour, a bronze helmet, a curved red scutum with a
// gilded boss and bars, and a pilum
function soldier(M, lean = 0) {
  const g = group();
  for (const s of [1, -1]) g.add(limb([s * 0.034, 0, 0], [s * 0.034, 0.17, 0], 0.02, 0.022, M.skin, 4));
  g.add(at(cyl(0.075, 0.064, 0.08, M.tunic, 7), 0, 0.19, 0));
  g.add(at(cyl(0.066, 0.076, 0.13, M.iron, 7), 0, 0.29, 0));
  g.add(at(egg(0.085, 0.035, 0.065, M.iron, 6, 4), 0, 0.35, 0));
  g.add(at(egg(0.045, 0.048, 0.045, M.skin, 6, 4), 0, 0.405, 0));
  g.add(at(mesh(new THREE.SphereGeometry(0.052, 7, 3, 0, TAU, 0, PI / 2), M.helm), 0, 0.415, 0));
  g.add(at(rot(box(0.08, 0.012, 0.04, M.helm), -0.4, 0, 0), 0, 0.405, -0.04));
  const sg = new THREE.CylinderGeometry(0.22, 0.22, 0.22, 6, 1, true, -0.38, 0.76);
  sg.translate(0, 0, -0.22);
  g.add(at(mesh(sg, M.shield), 0.02, 0.24, 0.11));
  g.add(at(egg(0.022, 0.022, 0.012, M.gold, 5, 3), 0.02, 0.24, 0.112));
  g.add(at(box(0.012, 0.18, 0.004, M.gold), 0.02, 0.24, 0.108));
  g.add(at(box(0.13, 0.012, 0.004, M.gold), 0.02, 0.24, 0.103));
  g.add(limb([-0.075, 0.34, 0], [-0.095, 0.23, 0.05], 0.02, 0.018, M.tunic, 4));
  g.add(limb([-0.1, 0.06, 0.06], [-0.11 - lean, 0.62, 0.0], 0.006, 0.006, M.wood, 3));
  g.add(limb([-0.11 - lean, 0.62, 0.0], [-0.112 - lean * 1.3, 0.76, -0.02], 0.004, 0.002, M.iron, 3));
  return g;
}
const soldierMats = () => ({
  skin: mat(C.skin), tunic: mat(0xa8302a), iron: mat(0x9aa2aa, { metalness: 0.2, roughness: 0.5 }), helm: mat(0xc0944a, { metalness: 0.2, roughness: 0.45 }),
  shield: mat(0xb8281e, { side: DS }), gold: GOLD(), wood: mat(0x7a5a3a),
});

// a block of legionaries, four ranks of five facing +z, with a standard: an eagle over a red
// vexillum and gilded discs on the pole
function legion(rng) {
  const g = group(), M = soldierMats();
  for (let r = 0; r < 4; r++) for (let f = 0; f < 5; f++) {
    g.add(at(soldier(M, (rng() - 0.5) * 0.04), (f - 2) * 0.17, 0, 0.3 - r * 0.2));
  }
  const sx = 0.5, sz = 0.36;
  const sb = soldier(M, 0);
  g.add(at(sb, sx, 0, sz));
  g.add(limb([sx - 0.09, 0, sz + 0.04], [sx - 0.09, 1.0, sz + 0.04], 0.009, 0.008, mat(0x5a4030), 5));
  for (const y of [0.5, 0.57, 0.64]) g.add(at(rot(cyl(0.028, 0.028, 0.01, M.gold, 10), PI / 2, 0, 0), sx - 0.09, y, sz + 0.05));
  g.add(at(box(0.2, 0.012, 0.012, M.gold), sx - 0.09, 0.85, sz + 0.04));
  g.add(at(panel(0.17, 0.15, mat(0xb8281e, { side: DS })), sx - 0.09, 0.77, sz + 0.05));
  g.add(at(box(0.17, 0.015, 0.006, M.gold), sx - 0.09, 0.69, sz + 0.05));
  const eagle = extrude([[0, 0], [0.03, 0.02], [0.09, 0.07], [0.11, 0.13], [0.05, 0.075], [0.02, 0.07], [0.016, 0.105], [0, 0.12], [-0.016, 0.105], [-0.02, 0.07], [-0.05, 0.075], [-0.11, 0.13], [-0.09, 0.07], [-0.03, 0.02]], 0.02, M.gold);
  g.add(at(eagle, sx - 0.09, 0.9, sz + 0.04));
  g.add(at(box(0.03, 0.02, 0.03, M.gold), sx - 0.09, 0.89, sz + 0.04));
  return bake(g);
}

// a trireme rowing toward +x: three banks of oars, a bronze ram, an eye on the bow, a curling
// stern, a red sail set at an angle, and a few marines on deck
function romanGalley(rng) {
  const g = group();
  const L = 1.6, H = hull(L, 0.24, 0.11, 0.07, 0.02, { full: 0.45, sharp: 2.6, n: 24 });
  const HULL = {
    name: 'hull-galley', w: 4, h: 128, repeat: [1, 1],
    draw: (x, w, h) => {
      for (let j = 0; j < h; j++) {
        const v = Math.min(j, h - 1 - j) / h;
        x.fillStyle = v < 0.035 ? '#4a3020' : v < 0.1 ? '#b03a26' : v < 0.115 ? '#d8b048' : v < 0.27 ? '#5e3e26' : '#2a2420';
        x.fillRect(0, j, w, 1);
      }
    },
  };
  g.add(mesh(H.geo, tmat(HULL, 0xffffff, { side: DS })));
  g.add(mesh(H.deck, mat(0x9a7048)));
  const wood = mat(0x4a3020), oarM = mat(0xd8b07a), bronze = mat(0xb08840, { metalness: 0.3, roughness: 0.4 }), gold = GOLD();
  // the outrigger the top oars work through, and a walkway on it
  g.add(at(box(1.0, 0.03, 0.31, wood), -0.02, H.top(0) + 0.01, 0));
  g.add(at(box(1.0, 0.01, 0.1, mat(0xb08a5a)), -0.02, H.top(0) + 0.03, 0));
  // the ram and the bow post
  const ram = cone(0.035, 0.16, bronze, 4);
  g.add(at(rot(ram, PI / 4, 0, -PI / 2), L / 2 + 0.05, 0.035, 0));
  g.add(at(box(0.05, 0.07, 0.012, bronze), L / 2 + 0.0, 0.04, 0));
  g.add(taper([[L / 2 - 0.05, 0.13, 0], [L / 2 + 0.02, 0.2, 0], [L / 2 + 0.03, 0.27, 0], [L / 2 - 0.01, 0.3, 0]], 0.022, 0.01, wood, 10, 6));
  g.add(taper([[-L / 2 + 0.06, 0.14, 0], [-L / 2 - 0.04, 0.24, 0], [-L / 2 - 0.05, 0.36, 0], [-L / 2 + 0.01, 0.43, 0], [-L / 2 + 0.05, 0.39, 0]], 0.03, 0.01, wood, 14, 6));
  g.add(at(ball(0.016, gold, 8), -L / 2 + 0.05, 0.385, 0));
  // an eye on each side of the bow
  const ex = 0.6, dh = (H.hw(ex + 0.01) - H.hw(ex - 0.01)) / 0.02, th = Math.atan(-dh);
  for (const s of [1, -1]) {
    const eye = group();
    eye.add(scl(mesh(new THREE.CircleGeometry(0.03, 12), mat(0xf4efe4)), 1.5, 1, 1));
    eye.add(at(mesh(new THREE.CircleGeometry(0.016, 10), mat(0x14100e)), 0.008, 0, 0.002));
    g.add(rot(at(eye, ex, 0.075, s * (H.hw(ex) + 0.006)), 0, s > 0 ? th : PI - th, 0));
  }
  // three banks of oars on each side, at the catch of the stroke
  for (let b = 0; b < 3; b++) for (let i = 0; i < 13; i++) for (const s of [1, -1]) {
    const x = -0.46 + i * 0.075 + b * 0.025, y = H.top(0) + 0.01 - b * 0.03, z0 = 0.15 - b * 0.02;
    const end = [x + 0.07, 0.01, s * (0.44 - b * 0.03)];
    g.add(limb([x, y, s * z0], end, 0.005, 0.005, oarM, 3));
    g.add(at(rot(box(0.05, 0.004, 0.022, oarM), 0, 0, 0), end[0], end[1], end[2]));
  }
  // the mast, the yard braced round, and the sail bellying forward
  const mx = 0.02, top = 0.78, psi = 0.6, half = 0.3, sy0 = 0.34;
  g.add(limb([mx, H.top(0), 0], [mx, top + 0.04, 0], 0.014, 0.01, wood, 6));
  const dir = V(Math.sin(psi), 0, Math.cos(psi)), nrm = V(Math.cos(psi), 0, -Math.sin(psi));
  g.add(limb([mx - dir.x * half, top, -dir.z * half], [mx + dir.x * half, top, dir.z * half], 0.008, 0.008, wood, 4));
  const sp = [], S = (u, v) => V(mx, sy0 + (top - sy0) * v, 0).addScaledVector(dir, (u - 0.5) * 2 * half * (1 - 0.06 * (1 - v))).addScaledVector(nrm, 0.09 * Math.sin(PI * u) * Math.sin(PI * (0.15 + 0.85 * v)) + 0.015).toArray();
  const k = 5;
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    const u0 = i / k, u1 = (i + 1) / k, v0 = j / k, v1 = (j + 1) / k;
    sp.push(S(u0, v0), S(u1, v0), S(u1, v1), S(u0, v0), S(u1, v1), S(u0, v1));
  }
  g.add(mesh(smoothGeo(sp), mat(0xc0302a, { side: DS })));
  // a little cabin at the stern, the steering oars, and marines
  g.add(at(block(0.14, 0.07, 0.14, mat(0x8a5a36)), -0.58, H.top(-0.58) - 0.01, 0));
  g.add(at(box(0.16, 0.012, 0.16, mat(0xc0302a)), -0.58, H.top(-0.58) + 0.065, 0));
  for (const s of [1, -1]) g.add(limb([-0.64, H.top(-0.64) + 0.04, s * 0.11], [-0.76, 0.01, s * 0.15], 0.008, 0.008, wood, 4));
  const M = soldierMats();
  for (const [x, z] of [[0.36, 0.04], [0.44, -0.04], [0.28, -0.03]]) g.add(at(scl(soldier(M, 0), 0.42), x, H.top(x) + 0.03, z));
  return bake(g);
}

// a slender Italian cypress, a dark green flame
function cypress(rng) {
  const g = group();
  const leaf = mat(pick(rng, [0x2f5a35, 0x355f3a, 0x2a5232]), { flat: true });
  const h = range(rng, 0.92, 1.0), r = range(rng, 0.1, 0.125);
  g.add(at(tube(0.025, 0.02, 0.08, mat(0x5a4030), 5), 0, 0.04, 0));
  const prof = [[0, 0.05], [0.6, 0.06], [0.95, 0.16], [1, 0.3], [0.92, 0.48], [0.76, 0.65], [0.52, 0.82], [0.22, 0.95], [0, 1]].map(([x, y]) => [x * r * (1 + (rng() - 0.5) * 0.2), y * h]);
  const fol = lathe(prof, leaf, 8);
  jitter(fol.geometry, rng, 0.012, 0.012, 0.012);
  g.add(fol);
  for (const y of [0.3, 0.5, 0.68]) {
    const a = rng() * TAU, rr = r * (1 - y * 0.6) * 0.85;
    g.add(at(scl(lump(r * 0.45, leaf), 1, 1.6, 1), Math.cos(a) * rr, y * h, Math.sin(a) * rr));
  }
  rot(g, (rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.06);
  return bake(group(g));
}

// a straight stretch of paved road: polygonal basalt slabs, raised kerbs, gravel margins and a
// milestone
function romanRoad(rng) {
  const g = group();
  const L = 1.2, W = 0.3;
  const kerb = mat(0xd0c6ac, { flat: true }), stones = [0x5c6066, 0x686c72, 0x52565c, 0x6e6a66].map((c) => mat(c, { flat: true }));
  g.add(at(box(L, 0.012, W + 0.22, mat(0xbcaa84)), 0, 0.006, 0));
  g.add(at(box(L, 0.016, W, mat(0x34322f)), 0, 0.008, 0));
  for (let row = 0; row < 3; row++) for (let i = 0; i < 14; i++) {
    const x = -L / 2 + 0.05 + (i + (row % 2) * 0.5) * ((L - 0.1) / 13.5) + (rng() - 0.5) * 0.02;
    const z = (row - 1) * (W / 3.1) + (rng() - 0.5) * 0.02, r = 0.05 + rng() * 0.01;
    if (x > L / 2 - 0.04) continue;
    const st = mesh(new THREE.CylinderGeometry(r, r, 0.02, 6), pick(rng, stones));
    g.add(rot(scl(at(st, x, 0.018 + (row === 1 ? 0.004 : 0), z), 1 + rng() * 0.2, 1, 1), 0, rng() * PI, 0));
  }
  for (const s of [1, -1]) for (let i = 0; i < 10; i++) g.add(at(roughBlock(L / 10 - 0.006, 0.045, 0.035, kerb, rng, 0.06), -L / 2 + ((i + 0.5) * L) / 10, 0, s * (W / 2 + 0.018)));
  g.add(at(cyl(0.026, 0.022, 0.12, kerb, 8), L * 0.3, 0.012, W / 2 + 0.075));
  g.add(at(block(0.07, 0.012, 0.07, kerb), L * 0.3, 0.006, W / 2 + 0.075));
  return bake(g);
}

export const flat = ['wheatField', 'romanRoad'];
export default {
  roundHut, longhouse, wheatField, cattle, sheep, farmer, stoneCircle, tPillars,
  pyramid, stepPyramid, sphinx, obelisk,
  ziggurat, mudbrickHouse, felucca, datePalm,
  colosseum, romanTemple, aqueduct,
  insula, domus, romanGalley, legion, cypress, romanRoad,
};
