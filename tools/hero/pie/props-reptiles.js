// The Carboniferous and Permian (Pangaea), the Jurassic and the Cretaceous: their plants and animals,
// as painted toys. Animals walk along +x with their profile toward +z. See pie/README.md.
import { THREE, mat, mesh, at, group, lathe, taper, canvasTex, mergeGeometries, range } from './kit.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const col = (h) => (h instanceof THREE.Color ? h.clone() : new THREE.Color(h));
const mix = (a, b, t) => col(a).lerp(col(b), clamp01(t));
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

// painted skin: vertex colours on a satin finish, like a painted toy
const SKIN = () => mat(0xffffff, { vertexColors: true, roughness: 0.58 });
const SHEET = () => mat(0xffffff, { vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
const IVORY = () => mat(0xded0b0, { roughness: 0.5 });
const HORN = () => mat(0x3a302a, { roughness: 0.5 });

// ---------- helpers ----------

// colour every vertex of a geometry by f(x, y, z, nx, ny, nz)
function paintGeo(geo, f) {
  const p = geo.attributes.position, n = geo.attributes.normal, a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = col(f(p.getX(i), p.getY(i), p.getZ(i), n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0));
    a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// a smooth body along a spine: pts [[x, y, z, ry, rz], …], ry the radius toward `ref` (up), rz across.
// Rings are spaced by arc length; the ends are closed with domes (cap = their length, 0 for flat).
// paint(u, s, c, p) colours a vertex: u along the spine, s = sin and c = cos of its angle round the ring
// (s = 1 on top, c = 1 toward +z), p its position. The mesh gets frame(u) and surf(u, angle, k).
function loft(pts, o = {}) {
  const { segs = 24, radial = 12, cap = [1, 1], capSegs = 3, ref = [0, 1, 0], paint = null, m = SKIN(), shape = null } = o;
  const P = new THREE.CatmullRomCurve3(pts.map(V3), false, 'centripetal');
  P.arcLengthDivisions = 300;
  const R = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[3], p[4] ?? p[3], 0)), false, 'catmullrom', 0.5);
  const refV = V3(ref).normalize();
  const frame = (u) => {
    const t = P.getUtoTmapping(u);
    const c = P.getPoint(t), T = P.getTangent(t).normalize(), r = R.getPoint(t);
    let U = refV.clone().addScaledVector(T, -refV.dot(T));
    if (U.lengthSq() < 1e-6) U = new THREE.Vector3(0, 0, 1).cross(T);
    U.normalize();
    const S = new THREE.Vector3().crossVectors(T, U);
    return { c, T, U, S, ry: Math.max(r.x, 1e-4), rz: Math.max(r.y, 1e-4), u };
  };
  const rings = [];
  for (let i = 0; i <= segs; i++) rings.push(frame(i / segs));
  const dome = (f, dir, k) => {
    const L = k * (f.ry + f.rz) / 2, out = [];
    if (k > 0) for (let j = 1; j < capSegs; j++) {
      const ph = (j / capSegs) * Math.PI / 2;
      out.push({ ...f, c: f.c.clone().addScaledVector(f.T, dir * L * Math.sin(ph)), ry: f.ry * Math.cos(ph), rz: f.rz * Math.cos(ph) });
    }
    return { out, pole: f.c.clone().addScaledVector(f.T, dir * L) };
  };
  const d0 = dome(rings[0], -1, cap[0]), d1 = dome(rings[segs], 1, cap[1]);
  const all = [...d0.out.reverse(), ...rings, ...d1.out];
  const pos = [], cols = [], idx = [];
  const put = (p, u, s, c) => {
    pos.push(p.x, p.y, p.z);
    if (paint) { const k = col(paint(u, s, c, p)); cols.push(k.r, k.g, k.b); }
  };
  put(d0.pole, 0, 0, 1);
  for (const f of all) for (let j = 0; j < radial; j++) {
    const a = (j / radial) * TAU, sa = Math.sin(a), ca = Math.cos(a), k = shape ? shape(sa, ca, f.u) : 1;
    put(f.c.clone().addScaledVector(f.S, ca * f.rz * k).addScaledVector(f.U, sa * f.ry * k), f.u, sa, ca);
  }
  put(d1.pole, 1, 0, 1);
  const n = all.length, last = 1 + n * radial, v = (i, j) => 1 + i * radial + (j % radial);
  for (let j = 0; j < radial; j++) idx.push(0, v(0, j), v(0, j + 1));
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) idx.push(v(i, j), v(i + 1, j), v(i, j + 1), v(i, j + 1), v(i + 1, j), v(i + 1, j + 1));
  for (let j = 0; j < radial; j++) idx.push(v(n - 1, j), last, v(n - 1, j + 1));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (paint) geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const x = mesh(geo, m);
  x.frame = frame;
  x.surf = (u, a, k = 1) => { const f = frame(u); return f.c.clone().addScaledVector(f.S, Math.cos(a) * f.rz * k).addScaledVector(f.U, Math.sin(a) * f.ry * k); };
  return x;
}

// where along a loft its spine passes x
function uAtX(l, x) {
  let best = 0, bd = Infinity;
  for (let i = 0; i <= 200; i++) { const d = Math.abs(l.frame(i / 200).c.x - x); if (d < bd) { bd = d; best = i / 200; } }
  return best;
}

// an ellipsoid at c with radii r, painted like a body (paint as for loft, with u = 0.5)
function blob(c, r, m, paint = null, seg = 14, rz = 0) {
  const geo = new THREE.SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.6)));
  if (paint) paintGeo(geo, (x, y, z, nx, ny, nz) => paint(0.5, ny, nz, new THREE.Vector3(c[0] + x * r[0], c[1] + y * r[1], c[2] + z * r[2])));
  const o = mesh(geo, m);
  o.scale.set(r[0], r[1], r[2]);
  o.rotation.z = rz;
  o.position.set(c[0], c[1], c[2]);
  return o;
}

// a cylinder from a to b, radius r0 at a and r1 at b, open at both ends
function stick(a, b, r0, r1, m, seg = 6) {
  const A = V3(a), B = V3(b), d = B.clone().sub(A), len = d.length();
  const o = mesh(new THREE.CylinderGeometry(r1, r0, len, seg, 1, true), m);
  o.quaternion.setFromUnitVectors(UP, d.normalize());
  o.position.copy(A).add(B).multiplyScalar(0.5);
  return o;
}
// a cone standing on base, pointing along dir
function spike(base, dir, r, h, m, seg = 8) {
  const D = V3(dir).normalize();
  const o = mesh(new THREE.ConeGeometry(r, h, seg), m);
  o.quaternion.setFromUnitVectors(UP, D);
  o.position.copy(V3(base)).addScaledVector(D, h / 2);
  return o;
}

// eyes on both sides at (x, y, ±z): a white, an iris if given, a glossy pupil, looking along `look`
function eyes(g, x, y, z, r, o = {}) {
  const { iris = null, look = [0.35, 0.1, 1], cz = 0 } = o;
  for (const s of [1, -1]) {
    const d = new THREE.Vector3(look[0], look[1], look[2] * s).normalize();
    const p = (k) => [x + d.x * r * k, y + d.y * r * k, cz + z * s + d.z * r * k];
    g.add(at(mesh(new THREE.SphereGeometry(r, 12, 8), mat(0xf6f1e4, { roughness: 0.35 })), x, y, cz + z * s));
    if (iris) g.add(at(mesh(new THREE.SphereGeometry(r * 0.8, 12, 8), mat(iris, { roughness: 0.3 })), ...p(0.3)));
    g.add(at(mesh(new THREE.SphereGeometry(r * (iris ? 0.48 : 0.64), 10, 8), mat(0x15110f, { roughness: 0.1 })), ...p(iris ? 0.62 : 0.5)));
  }
}

// a hide: back over belly, with bands across the back from u0 to u1
function hide(pal, stripes = true) {
  const back = col(pal.back), belly = col(pal.belly), stripe = col(pal.stripe ?? pal.back), line = pal.line ?? -0.3;
  const n = stripes ? pal.n ?? 0 : 0, u0 = pal.u0 ?? 0, u1 = pal.u1 ?? 1, ph = pal.ph ?? 0;
  return (u, s) => {
    const c = mix(belly, back, sstep(line - 0.2, line + 0.25, s));
    if (n) {
      const w = sstep(u0, u0 + 0.04, u) * (1 - sstep(u1 - 0.04, u1, u));
      const k = sstep(0.2, 0.7, Math.sin(u * n * TAU + ph)) * sstep(line + 0.1, line + 0.6, s) * w;
      c.lerp(stripe, k * 0.92);
    }
    return c;
  };
}
// a leg: the back's colour, darker toward the ground
function limbPaint(pal, foot = 0.14) {
  const top = mix(pal.back, pal.belly, 0.12), toe = mix(pal.back, pal.dark ?? 0x2a2420, 0.5);
  return (u, s, c, p) => mix(top, toe, sstep(foot, foot * 0.15, p.y));
}
const leg = (pts, pal, o = {}) => loft(pts, { segs: 14, radial: 12, cap: [1, 0], ref: [1, 0, 0], paint: limbPaint(pal, o.foot), ...o });

// three blunt nails round the front of a round foot
function nails(g, x, y, z, r) {
  for (const a of [-0.8, 0, 0.8]) g.add(blob([x + Math.cos(a) * r * 0.9, y + r * 0.2, z + Math.sin(a) * r * 0.9], [r * 0.3, r * 0.24, r * 0.28], IVORY(), null, 8));
}
// a three-toed clawed foot whose ball is at (x, y, z), toes forward along +x
function birdFoot(g, x, y, z, len, r, pal, splay = 0.38) {
  const p = limbPaint(pal, 1e9);
  for (const a of [-splay, 0, splay]) {
    const L = a === 0 ? len : len * 0.8, dx = Math.cos(a) * L, dz = Math.sin(a) * L;
    g.add(loft([[x - 0.02, y + r * 0.4, z, r * 0.9], [x + dx * 0.5, y + r * 0.15, z + dz * 0.5, r * 0.8], [x + dx, r * 0.6, z + dz, r * 0.6]], { segs: 6, radial: 8, cap: [0.6, 0.8], paint: p }));
    g.add(spike([x + dx * 0.98, r * 0.6, z + dz * 0.98], [Math.cos(a), -0.35, Math.sin(a)], r * 0.45, r * 1.6, HORN(), 6));
  }
}

// a flier built heading +x with its wings level: turned so it heads along `head` and the tops of its
// wings face `face`. Heading toward the viewer (+z) and the right, its wings spread across the view
// rather than point at it.
function fly(g, head, face) {
  const F = V3(head).normalize(), N = V3(face);
  N.addScaledVector(F, -N.dot(F)).normalize();
  const a = group(bake(g));
  a.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(F, N, new THREE.Vector3().crossVectors(F, N)));
  return bake(group(a));
}

// merge every mesh of a group into one per material, so a prop costs a few draw calls
function bake(g) {
  g.updateMatrixWorld(true);
  const groups = new Map();
  g.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    const keepAttrs = ['position', 'normal', 'color', ...(o.material.map ? ['uv'] : [])];
    for (const k of Object.keys(geo.attributes)) if (!keepAttrs.includes(k)) geo.deleteAttribute(k);
    if (o.material.vertexColors && !geo.attributes.color) paintGeo(geo, () => 0xffffff);
    if (!o.material.vertexColors && geo.attributes.color) geo.deleteAttribute('color');
    geo.clearGroups();
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(geo);
  });
  // stand it on y = 0 with its footprint centred on x = z = 0
  const merged = [...groups].map(([m, geos]) => [m, mergeGeometries(geos, false)]);
  const box = new THREE.Box3();
  for (const [, geo] of merged) { geo.computeBoundingBox(); box.union(geo.boundingBox); }
  const out = new THREE.Group();
  for (const [m, geo] of merged) {
    geo.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    const x = mesh(geo, m);
    if (m.transparent) x.castShadow = false;
    out.add(x);
  }
  return out;
}

// textures and materials made once
const once = new Map();
const keep = (k, f) => { if (!once.has(k)) once.set(k, f()); return once.get(k); };

// bark of diamond leaf cushions, for the scale tree and the cycad
function cushionBark(k, base, groove, scar, repeat) {
  return keep(`bark-${k}`, () => {
    const t = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      g.strokeStyle = groove; g.lineWidth = 5;
      g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath(); g.stroke();
      g.fillStyle = scar;
      for (const [x, y] of [[w / 2, h / 2], [0, 0], [w, 0], [0, h], [w, h]]) { g.beginPath(); g.ellipse(x, y - 4, 5, 3.5, 0, 0, TAU); g.fill(); }
    }, repeat);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
  });
}

// a leaf blade along an arching curve: from base, out along azimuth az by length L, rising `rise`
// and drooping `droop` (as fractions of L), width w, n segments. Every other row is a leaflet's tip,
// pulled forward along the curve; the rows between are cut in by `serr`. With fold, the blade is
// creased along a raised midrib; without, it is a flat ribbon and costs half as much.
function frond(base, az, L, rise, droop, w, n, c0, c1, o = {}) {
  const { fold = 0.35, serr = 0.6, rib = null, flat = false, lean = 0.6 } = o;
  const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)), across = new THREE.Vector3(-d.z, 0, d.x);
  const B = V3(base), at_ = (s) => B.clone().addScaledVector(d, L * s).add(new THREE.Vector3(0, L * (rise * s - droop * s * s), 0));
  const pos = [], cols = [], idx = [], k = flat ? 2 : 3;
  for (let i = 0; i <= n; i++) {
    const s = i / n, c = at_(s), T = at_(Math.min(1, s + 0.02)).sub(at_(Math.max(0, s - 0.02))).normalize();
    const env = w * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + s * 0.88)), 0.7);
    const leaflet = i % 2 === 1 && i < n, wi = env * (leaflet ? 1 : 1 - serr);
    const cc = mix(c0, c1, s), cr = rib ? mix(rib, c1, s * 0.6) : cc;
    for (const [side, cl] of flat ? [[-1, cc], [1, cc]] : [[-1, cc], [0, cr], [1, cc]]) {
      const p = c.clone().addScaledVector(across, side * wi);
      if (side === 0) p.y += fold * env;
      else if (leaflet) p.addScaledVector(T, (L / n) * lean);
      pos.push(p.x, p.y, p.z); cols.push(cl.r, cl.g, cl.b);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = i * k;
    if (flat) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    else idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return mesh(geo, SHEET());
}

// ---------- the Carboniferous and Permian ----------

// a scale tree: a tall trunk of diamond leaf cushions, forking twice into tufts of grassy leaves
function lepidodendron(rng) {
  const g = group();
  const H = range(rng, 0.64, 0.74);
  g.add(lathe([[0.1, 0], [0.066, 0.04], [0.057, 0.14], [0.049, H * 0.6], [0.043, H + 0.01]], cushionBark('lepi', '#7d7448', '#3e3a22', '#5a5232', [3, 6]), 7));
  const core = mat(0x2f6a26, { roughness: 0.85 });
  // a tuft: a dark core bristling with grass-like blades that arch out and droop
  const tuft = (p, d, len, r) => {
    const t = group();
    const c = mesh(new THREE.SphereGeometry(1, 6, 4), core);
    c.scale.set(r * 0.8, len * 0.42, r * 0.8);
    c.quaternion.setFromUnitVectors(UP, d);
    c.position.copy(p).addScaledVector(d, len * 0.32);
    t.add(c);
    const pos = [], cols = [], k = 13, base = col(0x2f6e24), tip = col(0xa8d050);
    const side = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize(), up2 = new THREE.Vector3().crossVectors(side, d);
    for (let i = 0; i < k; i++) {
      const az = (i / k) * TAU + rng() * 0.4, out = 0.5 + 0.9 * ((i * 7) % k) / k;
      const dir = d.clone().multiplyScalar(Math.cos(out)).addScaledVector(side, Math.sin(out) * Math.cos(az)).addScaledVector(up2, Math.sin(out) * Math.sin(az));
      dir.y -= 0.35 * Math.sin(out); dir.normalize();
      const o = p.clone().addScaledVector(d, len * (0.1 + 0.4 * ((i * 5) % k) / k)), w = new THREE.Vector3().crossVectors(dir, UP).normalize().multiplyScalar(r * 0.32);
      const e = o.clone().addScaledVector(dir, len * 0.75);
      for (const [q, c2] of [[o.clone().add(w), base], [o.clone().sub(w), base], [e, tip]]) { pos.push(q.x, q.y, q.z); cols.push(c2.r, c2.g, c2.b); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    t.add(mesh(geo, SHEET()));
    return t;
  };
  const wood = mat(0x6e6440, { roughness: 0.85 });
  const dir = (az, el) => new THREE.Vector3(Math.cos(az) * Math.sin(el), Math.cos(el), Math.sin(az) * Math.sin(el));
  const top = new THREE.Vector3(0, H, 0), az0 = rng() * Math.PI;
  g.add(tuft(top, dir(az0 + 1.6, 0.15), 0.16, 0.05));
  for (const s1 of [0, 1]) {
    const a1 = az0 + s1 * Math.PI + range(rng, -0.3, 0.3), d1 = dir(a1, range(rng, 0.5, 0.7));
    const p1 = top.clone().addScaledVector(d1, range(rng, 0.15, 0.19));
    g.add(stick(top.toArray(), p1.toArray(), 0.04, 0.03, wood, 5));
    for (const s2 of [1, -1]) {
      const d2 = dir(a1 + s2 * range(rng, 0.7, 1.1), range(rng, 0.45, 0.85));
      const p2 = p1.clone().addScaledVector(d2, range(rng, 0.1, 0.13));
      g.add(stick(p1.toArray(), p2.toArray(), 0.029, 0.02, wood, 5));
      g.add(tuft(p2, d2, range(rng, 0.21, 0.25), 0.068));
    }
  }
  return bake(g);
}

// a giant horsetail: a jointed stem with whorls of needle branches, widest low in the crown
function calamites(rng) {
  const g = group();
  const H = range(rng, 0.92, 1.05), stem = mat(0x8d9a52, { roughness: 0.7 }), node = mat(0x55602e, { roughness: 0.7 });
  g.add(at(mesh(new THREE.CylinderGeometry(0.024, 0.044, H, 6, 1, true), stem), 0, H / 2, 0));
  const nodes = 10;
  for (let i = 1; i < nodes; i++) {
    const y = (i / nodes) * H, r = 0.044 - 0.02 * (y / H);
    g.add(at(mesh(new THREE.CylinderGeometry(r * 1.3, r * 1.3, 0.02, 6, 1, true), node), 0, y, 0));
    if (i < 3) continue;
    // a whorl: a star of needle branches turned up like an open cone
    const R = (0.1 + 0.19 * Math.pow(1 - (i - 3) / (nodes - 3), 0.8)) * range(rng, 0.88, 1.1), k = 10, rot = rng() * TAU;
    const pos = [0, y, 0], cols = [], c0 = col(0x356e28), c1 = col(0x8cbc48);
    cols.push(c0.r, c0.g, c0.b);
    for (let j = 0; j < k * 2; j++) {
      const a = rot + (j / (k * 2)) * TAU, tip = j % 2 === 0, rr = tip ? R : R * 0.2;
      pos.push(Math.cos(a) * rr, y + (tip ? R * 0.5 : R * 0.07), Math.sin(a) * rr);
      const c = tip ? c1 : c0; cols.push(c.r, c.g, c.b);
    }
    const idx = [];
    for (let j = 0; j < k * 2; j++) idx.push(0, 1 + ((j + 1) % (k * 2)), 1 + j);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    g.add(mesh(geo, SHEET()));
  }
  g.add(at(mesh(new THREE.ConeGeometry(0.032, 0.1, 6, 1, true), mat(0xb89a48, { roughness: 0.7 })), 0, H + 0.045, 0));
  return bake(g);
}

// a tree fern: a shaggy trunk under a crown of arching fronds, an old one or two hanging down
function treeFern(rng) {
  const g = group();
  const H = range(rng, 0.52, 0.62), lean = range(rng, -0.05, 0.05);
  g.add(taper([[0, 0, 0], [lean * 0.4, H * 0.5, 0], [lean, H, 0]], 0.05, 0.036, mat(0x5a3e2a, { roughness: 0.95 }), 3, 6));
  const top = [lean, H, 0], n = 9, az0 = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const az = az0 + (i / n) * TAU + range(rng, -0.2, 0.2), L = range(rng, 0.4, 0.5);
    g.add(frond(top, az, L, range(rng, 0.55, 0.8), range(rng, 0.9, 1.15), 0.08, 11, 0x2a6e28, 0x7ab83e, { flat: true, serr: 0.75 }));
  }
  for (let i = 0; i < 2; i++) {
    const az = az0 + rng() * TAU;
    g.add(frond([lean, H - 0.02, 0], az, 0.3, 0.1, 1.3, 0.055, 8, 0x6a5428, 0x9a7a3a, { flat: true, serr: 0.6 }));
  }
  return bake(g);
}

// a giant dragonfly in flight toward the viewer, four glassy, veined wings spread
function wingMat() {
  return keep('wing', () => {
    const t = canvasTex(256, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(214,236,255,0.30)'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(40,46,60,0.85)'; g.lineWidth = 1.4;
      for (let k = 1; k < 7; k++) { g.beginPath(); g.moveTo(0, (k / 7) * h); g.bezierCurveTo(w * 0.4, (k / 7) * h * 0.9, w * 0.8, h * (0.25 + k * 0.08), w, h * 0.5); g.stroke(); }
      g.lineWidth = 0.8;
      for (let x = 6; x < w; x += 9) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 3, h); g.stroke(); }
      g.fillStyle = 'rgba(30,30,40,0.95)'; g.fillRect(w * 0.84, 0, w * 0.07, h * 0.16);
      g.fillStyle = 'rgba(40,46,60,0.95)'; g.fillRect(0, 0, w, 4);
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.15, metalness: 0.1 });
  });
}
function meganeura(rng) {
  const g = group();
  const body = mat(0x1f6f7a, { roughness: 0.32, metalness: 0.35 });
  // the abdomen: long, banded
  const ab = loft([[0.14, 0, 0, 0.042], [-0.1, -0.005, 0, 0.034], [-0.4, -0.02, 0, 0.026], [-0.68, -0.035, 0, 0.022], [-0.78, -0.03, 0, 0.012]], {
    segs: 30, radial: 10, paint: (u, s) => mix(0x2a95a8, 0x123038, sstep(0.55, 0.8, Math.sin(u * 11 * TAU)) * 0.85 + (s < -0.3 ? 0.3 : 0)),
  });
  g.add(ab);
  // the thorax and head, with big compound eyes
  g.add(blob([0.24, 0.01, 0], [0.13, 0.085, 0.08], SKIN(), (u, s) => mix(0x184a40, 0x4aa060, sstep(-0.2, 0.8, s) * 0.6), 14));
  g.add(blob([0.38, 0.0, 0], [0.04, 0.05, 0.06], body, null, 10));
  for (const s of [1, -1]) g.add(blob([0.405, 0.03, s * 0.052], [0.058, 0.06, 0.055], mat(0x3a8a3a, { roughness: 0.2, metalness: 0.2 }), null, 12));
  // legs folded under
  const legm = mat(0x1a2224);
  for (const s of [1, -1]) for (const [x, k] of [[0.3, 0.6], [0.24, 0.4], [0.18, 0.2]]) {
    g.add(stick([x, -0.05, s * 0.03], [x + 0.03, -0.11, s * 0.08], 0.008, 0.007, legm, 4));
    g.add(stick([x + 0.03, -0.11, s * 0.08], [x + 0.08 + k * 0.05, -0.12, s * 0.06], 0.007, 0.005, legm, 4));
  }
  // four wings: a plane with veins painted on, a dark leading edge
  const wm = wingMat(), cost = mat(0x24282e, { roughness: 0.4 });
  for (const s of [1, -1]) for (const [x, len, chord, sweep] of [[0.29, 1.0, 0.15, 0.08], [0.17, 0.96, 0.19, -0.1]]) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.25); sh.bezierCurveTo(0.3, 0.1, 0.7, 0.0, 1.0, 0.25); sh.bezierCurveTo(1.03, 0.7, 0.95, 1.0, 0.85, 1.0);
    sh.lineTo(0.05, 1.0); sh.lineTo(0, 0.7); sh.lineTo(0, 0.25);
    const geo = new THREE.ShapeGeometry(sh, 10);
    // shape x runs along the span, y across the chord (y = 1 the leading edge)
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = p.getY(i);
      p.setXYZ(i, x - (1 - v) * chord + u * sweep, 0.03 + u * 0.08 + u * u * 0.03, s * (0.05 + u * len));
    }
    geo.computeVertexNormals();
    const w = mesh(geo, wm); w.castShadow = false;
    g.add(w);
    g.add(taper([[x, 0.03, s * 0.05], [x + sweep * 0.5, 0.075, s * (0.05 + len * 0.5)], [x + sweep * 0.98, 0.14, s * (0.05 + len * 0.98)]], 0.009, 0.004, cost, 8, 5));
  }
  return fly(g, [0.64, range(rng, -0.2, -0.1), range(rng, 0.7, 0.85)], [0, 1, 0.4]);
}

// a sail-backed synapsid: sprawling legs, a deep toothy skull and a ribbed, banded sail
function dimetrodon(rng) {
  const g = group();
  const pal = { back: 0x4f6e68, belly: 0xd9cfa6, stripe: 0x2f4846, dark: 0x2a3230, n: 14, u0: 0.05, u1: 0.95, ph: rng() * TAU, line: -0.2 };
  const tz = range(rng, -0.25, 0.25);
  const body = loft([
    [-1.3, 0.1, tz, 0.012], [-1.0, 0.16, tz * 0.6, 0.038, 0.038], [-0.62, 0.26, tz * 0.15, 0.08, 0.08], [-0.3, 0.32, 0, 0.13, 0.15],
    [0.1, 0.34, 0, 0.15, 0.17], [0.44, 0.34, 0, 0.13, 0.15], [0.6, 0.37, 0, 0.09, 0.09],
  ], { segs: 44, radial: 14, paint: hide(pal) });
  g.add(body);
  const hp = hide({ ...pal, n: 0, line: -0.1 });
  g.add(loft([[0.56, 0.41, 0, 0.1, 0.08], [0.72, 0.42, 0, 0.115, 0.078], [0.88, 0.37, 0, 0.08, 0.06], [0.98, 0.335, 0, 0.055, 0.045]], { segs: 14, radial: 12, paint: hp }));
  g.add(loft([[0.62, 0.34, 0, 0.05, 0.065], [0.8, 0.31, 0, 0.04, 0.05], [0.96, 0.3, 0, 0.026, 0.038]], { segs: 8, radial: 10, paint: hp }));
  eyes(g, 0.72, 0.465, 0.06, 0.026, { iris: 0xd8a030 });
  for (const s of [1, -1]) for (const [x, h] of [[0.93, 0.07], [0.86, 0.05], [0.8, 0.04]]) g.add(spike([x, 0.32, s * 0.035], [0.1, -1, 0], 0.011, h, IVORY(), 6));
  // the sail: membrane between spines, banded, highest over the middle of the back
  const x0 = -0.36, x1 = 0.5, k = 15, top = [], bot = [];
  for (let i = 0; i <= k * 2; i++) {
    const x = x0 + (x1 - x0) * (i / (k * 2)), q = (x - x0) / (x1 - x0);
    const hgt = 0.78 * Math.pow(Math.sin(Math.PI * Math.min(1, q * 1.04)), 0.85) * (1 - 0.15 * q) + 0.03;
    const y0 = body.surf(uAtX(body, x), Math.PI / 2, 0.9).y;
    bot.push([x, y0, 0]);
    top.push([x, y0 + hgt * (i % 2 ? 0.93 : 1), 0]);
  }
  const pos = [], cols = [], idx = [], rows = 4;
  const ribC = col(0x7a2a1e), lowC = col(0xf0b04a), midC = col(0xe0692e), hiC = col(0xb83224);
  for (let i = 0; i < top.length; i++) for (let r = 0; r <= rows; r++) {
    const t = r / rows, p = V3(bot[i]).lerp(V3(top[i]), t);
    let c = t < 0.5 ? mix(lowC, midC, t * 2) : mix(midC, hiC, (t - 0.5) * 2);
    if (i % 2 === 0) c = mix(c, ribC, 0.75);
    pos.push(p.x, p.y, p.z); cols.push(c.r, c.g, c.b);
  }
  for (let i = 0; i < top.length - 1; i++) for (let r = 0; r < rows; r++) {
    const a = i * (rows + 1) + r, b = a + rows + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  sg.setIndex(idx); sg.computeVertexNormals();
  g.add(mesh(sg, SHEET()));
  // the spines, standing proud of the membrane on both faces
  const spine = mat(0x6a2a1e, { roughness: 0.5 });
  for (let i = 0; i < top.length; i += 2) {
    for (const s of [1, -1]) g.add(stick([bot[i][0], bot[i][1], s * 0.008], [top[i][0], top[i][1] + 0.025, s * 0.004], 0.011, 0.006, spine, 5));
  }
  // sprawling legs
  for (const s of [1, -1]) {
    const f = s > 0 ? 0.05 : -0.05;
    for (const [hx, kx, fx] of [[-0.3, -0.26, -0.3 + f], [0.42, 0.45, 0.47 - f]]) {
      g.add(leg([[hx, 0.3, s * 0.1, 0.075], [kx, 0.27, s * 0.27, 0.055], [fx, 0.12, s * 0.31, 0.042], [fx, 0.0, s * 0.3, 0.042]], pal, { foot: 0.08 }));
      g.add(blob([fx + 0.05, 0.015, s * 0.3], [0.07, 0.02, 0.05], SKIN(), limbPaint(pal, 1e9), 10));
      for (const a of [-0.6, -0.3, 0, 0.3, 0.6]) g.add(spike([fx + 0.05 + Math.cos(a) * 0.06, 0.012, s * 0.3 + Math.sin(a) * 0.05], [Math.cos(a), -0.2, Math.sin(a)], 0.008, 0.03, HORN(), 5));
    }
  }
  return bake(g);
}

// ---------- the Jurassic ----------

// a stubby cycad: a barrel of leaf bases under a stiff rosette of fronds, a cone in the middle
function cycad(rng) {
  const g = group();
  const H = range(rng, 0.28, 0.36);
  g.add(lathe([[0.12, 0], [0.135, 0.05], [0.13, H * 0.5], [0.115, H * 0.85], [0.08, H], [0.0, H + 0.02]], cushionBark('cycad', '#8a5c30', '#4a2e18', '#b08048', [5, 3]), 8));
  const n = 11, az0 = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const az = az0 + (i / n) * TAU + range(rng, -0.15, 0.15), L = range(rng, 0.5, 0.6);
    g.add(frond([0, H - 0.01, 0], az, L, range(rng, 0.8, 1.2), range(rng, 0.6, 0.85), 0.08, 6, 0x1f5a28, 0x5a9a38, { serr: 0.65, fold: 0.4 }));
  }
  g.add(at(mesh(new THREE.ConeGeometry(0.055, 0.15, 7), mat(0xd29a3a, { roughness: 0.6 })), 0, H + 0.085, 0));
  return bake(g);
}

// a monkey-puzzle: a straight trunk carrying tiers of star-shaped, upturned branch pads
function araucaria(rng) {
  const g = group();
  const H = range(rng, 0.95, 1.05);
  g.add(at(mesh(new THREE.CylinderGeometry(0.02, 0.042, H * 0.9, 6, 1, true), mat(0x6a4a32, { roughness: 0.9 })), 0, H * 0.45, 0));
  const lo = col(0x1a4224), hi = col(0x4a8a44), tipC = col(0x86b45a);
  const radii = [0.3, 0.37, 0.34, 0.22], ys = [0.5, 0.63, 0.76, 0.87];
  for (let t = 0; t < 4; t++) {
    const y = H * ys[t], R = radii[t] * range(rng, 0.9, 1.08), th = 0.075;
    const rot = rng() * TAU, k = 14, pos = [0, y + th * 0.7, 0], cols = [hi.r, hi.g, hi.b], idx = [];
    for (let j = 0; j < k; j++) {
      // seven arms, each turned up at its end
      const a = rot + (j / k) * TAU, arm = j % 2 === 0, r = R * (arm ? 1 : 0.32);
      pos.push(Math.cos(a) * r * 0.55, y + th * (arm ? 0.45 : 0.4), Math.sin(a) * r * 0.55); const c1 = mix(hi, lo, 0.2); cols.push(c1.r, c1.g, c1.b);
      pos.push(Math.cos(a) * r, y + (arm ? th * 1.7 : th * 0.1), Math.sin(a) * r); const c2 = arm ? tipC : mix(hi, lo, 0.6); cols.push(c2.r, c2.g, c2.b);
    }
    pos.push(0, y - th * 0.3, 0); cols.push(lo.r, lo.g, lo.b);
    const bot = 1 + k * 2, v = (j, ring) => 1 + (j % k) * 2 + ring;
    for (let j = 0; j < k; j++) {
      idx.push(0, v(j + 1, 0), v(j, 0));
      idx.push(v(j, 0), v(j + 1, 0), v(j, 1), v(j + 1, 0), v(j + 1, 1), v(j, 1));
      idx.push(bot, v(j, 1), v(j + 1, 1));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    g.add(mesh(geo, SKIN()));
  }
  g.add(at(mesh(new THREE.ConeGeometry(0.045, 0.1, 6), mat(0x3a7a40, { roughness: 0.8 })), 0, H * 0.88 + 0.1, 0));
  return bake(g);
}

// a low clump of arching ferns
function fernClump(rng) {
  const g = group();
  const n = 9, az0 = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const az = az0 + (i / n) * TAU + range(rng, -0.25, 0.25), L = range(rng, 0.45, 0.6), rise = range(rng, 1.0, 1.6);
    g.add(frond([Math.cos(az) * 0.03, 0, Math.sin(az) * 0.03], az, L, rise, rise - range(rng, 0.2, 0.45), 0.065, 21, 0x226a22, 0x96cc4c, { flat: true, serr: 0.75, lean: 0.35 }));
  }
  return bake(g);
}

// the hero sauropod: an upraised neck, forelegs longer than the hind, a small arched head
function brachiosaurus(rng) {
  const g = group();
  const pal = { back: 0x5c9a52, belly: 0xeadca0, stripe: 0x386a40, dark: 0x40503a, n: 12, u0: 0.04, u1: 0.5, ph: rng() * TAU };
  const sw = range(rng, -0.25, 0.25), tw = range(rng, 0.08, 0.18);
  g.add(loft([
    [-2.0, 0.52, -0.3 + sw, 0.014], [-1.6, 0.68, -0.16 + sw / 2, 0.07, 0.065], [-1.15, 0.88, -0.04, 0.16, 0.15], [-0.7, 1.04, 0, 0.29, 0.26],
    [-0.3, 1.13, 0, 0.42, 0.38], [0.15, 1.2, 0, 0.52, 0.44], [0.58, 1.36, 0, 0.5, 0.42], [0.92, 1.72, 0, 0.32, 0.28],
    [1.1, 2.2, tw * 0.25, 0.21, 0.19], [1.2, 2.65, tw * 0.6, 0.155, 0.145], [1.28, 3.0, tw * 0.85, 0.125, 0.12], [1.33, 3.22, tw, 0.11, 0.105],
  ], { segs: 84, radial: 18, paint: hide(pal) }));
  const hp = hide({ ...pal, n: 0, line: -0.45 });
  const z = tw;
  g.add(loft([[1.22, 3.28, z, 0.085, 0.078], [1.34, 3.33, z + 0.01, 0.125, 0.105], [1.5, 3.3, z + 0.02, 0.1, 0.09], [1.66, 3.24, z + 0.03, 0.075, 0.072], [1.76, 3.21, z + 0.035, 0.056, 0.06]], { segs: 18, radial: 14, paint: hp }));
  g.add(blob([1.45, 3.43, z + 0.015], [0.1, 0.07, 0.065], SKIN(), hp, 12));
  eyes(g, 1.35, 3.4, 0.085, 0.03, { cz: z + 0.01 });
  // legs: near front and far hind forward, the others back
  const L = [
    [[0.6, 1.25, 0.27, 0.2], [0.68, 0.68, 0.29, 0.14], [0.73, 0.16, 0.29, 0.115], [0.74, 0, 0.29, 0.135]],
    [[0.6, 1.25, -0.27, 0.2], [0.54, 0.68, -0.29, 0.14], [0.47, 0.16, -0.29, 0.115], [0.46, 0, -0.29, 0.135]],
    [[-0.32, 1.05, 0.27, 0.27], [-0.29, 0.55, 0.29, 0.17], [-0.43, 0.16, 0.29, 0.13], [-0.43, 0, 0.29, 0.15]],
    [[-0.32, 1.05, -0.27, 0.27], [-0.16, 0.55, -0.29, 0.17], [-0.19, 0.16, -0.29, 0.13], [-0.18, 0, -0.29, 0.15]],
  ];
  for (const p of L) { g.add(leg(p, pal)); nails(g, p[3][0], 0, p[3][2], p[3][3]); }
  return bake(g);
}

// a long, low sauropod: a level neck, a whip of a tail, a row of spines down its back
function diplodocus(rng) {
  const g = group();
  const pal = { back: 0xc0803e, belly: 0xf0dcb0, stripe: 0x7a4426, dark: 0x5a3a24, n: 22, u0: 0.12, u1: 0.62, ph: rng() * TAU };
  const sw = range(rng, -0.4, 0.4);
  const body = loft([
    [-3.6, 0.5, -0.5 + sw, 0.006], [-3.0, 0.6, -0.3 + sw / 2, 0.02], [-2.4, 0.74, -0.12 + sw / 5, 0.05, 0.045], [-1.8, 0.88, -0.03, 0.1, 0.09],
    [-1.2, 1.0, 0, 0.18, 0.16], [-0.65, 1.07, 0, 0.3, 0.27], [-0.25, 1.06, 0, 0.4, 0.34], [0.25, 1.0, 0, 0.42, 0.36], [0.7, 0.98, 0, 0.36, 0.32],
    [1.05, 1.06, 0, 0.22, 0.2], [1.55, 1.2, 0, 0.145, 0.13], [2.1, 1.32, 0, 0.11, 0.1], [2.6, 1.38, 0, 0.09, 0.085], [2.88, 1.37, 0, 0.08, 0.075],
  ], { segs: 110, radial: 16, paint: hide(pal) });
  g.add(body);
  const hp = hide({ ...pal, n: 0, line: -0.45 });
  g.add(loft([[2.84, 1.41, 0, 0.075, 0.07], [2.98, 1.4, 0, 0.088, 0.076], [3.14, 1.33, 0, 0.062, 0.058], [3.28, 1.26, 0, 0.045, 0.05]], { segs: 14, radial: 12, paint: hp }));
  eyes(g, 2.98, 1.45, 0.065, 0.022);
  // the spines
  const sp = mat(0x8a4a2a, { roughness: 0.6 });
  for (let u = 0.25; u < 0.9; u += 0.018) {
    const f = body.frame(u), b = body.surf(u, Math.PI / 2, 0.9), h = Math.min(f.ry, 0.2) * 0.32 + 0.015;
    g.add(spike(b.toArray(), f.U.toArray(), h * 0.45, h, sp, 5));
  }
  const L = [
    [[0.7, 0.9, 0.24, 0.16], [0.75, 0.48, 0.26, 0.11], [0.8, 0.13, 0.26, 0.095], [0.81, 0, 0.26, 0.105]],
    [[0.7, 0.9, -0.24, 0.16], [0.66, 0.48, -0.26, 0.11], [0.6, 0.13, -0.26, 0.095], [0.59, 0, -0.26, 0.105]],
    [[-0.25, 0.98, 0.25, 0.23], [-0.22, 0.52, 0.27, 0.14], [-0.34, 0.14, 0.27, 0.11], [-0.34, 0, 0.27, 0.125]],
    [[-0.25, 0.98, -0.25, 0.23], [-0.1, 0.52, -0.27, 0.14], [-0.12, 0.14, -0.27, 0.11], [-0.11, 0, -0.27, 0.125]],
  ];
  for (const p of L) { g.add(leg(p, pal)); nails(g, p[3][0], 0, p[3][2], p[3][3]); }
  return bake(g);
}

// a stegosaur: an arched back of alternating plates, a low small head, four spikes on the tail
function stegosaurus(rng) {
  const g = group();
  const pal = { back: 0x6f8a3a, belly: 0xe2d6a2, stripe: 0x4a6430, dark: 0x3a4028, n: 10, u0: 0.1, u1: 0.8, ph: rng() * TAU };
  const tz = range(rng, -0.2, 0.2);
  const body = loft([
    [-1.65, 0.66, tz, 0.03], [-1.3, 0.78, tz * 0.5, 0.07, 0.065], [-0.85, 0.94, 0, 0.16, 0.14], [-0.4, 1.02, 0, 0.31, 0.27],
    [0.05, 0.95, 0, 0.36, 0.33], [0.45, 0.78, 0, 0.29, 0.26], [0.75, 0.62, 0, 0.17, 0.15], [0.95, 0.53, 0, 0.11, 0.1],
  ], { segs: 60, radial: 16, paint: hide(pal) });
  g.add(body);
  const hp = hide({ ...pal, n: 0, line: -0.4 });
  g.add(loft([[0.9, 0.56, 0, 0.1, 0.09], [1.06, 0.5, 0, 0.09, 0.08], [1.22, 0.41, 0, 0.055, 0.055], [1.3, 0.37, 0, 0.034, 0.04]], { segs: 12, radial: 12, paint: hp }));
  eyes(g, 1.07, 0.55, 0.065, 0.022);
  // the plates, in two alternating rows, biggest over the hips
  const plateOutline = [[-0.42, 0], [-0.5, 0.18], [-0.34, 0.55], [-0.08, 0.93], [0.06, 0.95], [0.34, 0.52], [0.47, 0.16], [0.38, 0]];
  const plate = (s) => {
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(plateOutline.map(([x, y]) => new THREE.Vector2(x * s, y * s))), { depth: 0.035, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
    geo.translate(0, 0, -0.0175);
    paintGeo(geo, (x, y) => {
      const t = y / s;
      return t < 0.3 ? mix(0x8a9a40, 0xe8a83a, t / 0.3) : mix(0xe8a83a, 0xc8402a, (t - 0.3) / 0.6);
    });
    return mesh(geo, SKIN());
  };
  const N = 17;
  for (let i = 0; i < N; i++) {
    const u = 0.2 + 0.72 * (i / (N - 1)), f = body.frame(u), side = i % 2 ? 1 : -1;
    const s = 0.1 + 0.36 * Math.exp(-Math.pow((u - 0.5) / 0.2, 2));
    const p = body.surf(u, Math.PI / 2, 0.8);
    const pl = plate(s);
    const holder = group(pl);
    holder.position.set(p.x, p.y, side * 0.035);
    holder.rotation.set(side * 0.14, 0, Math.atan2(f.T.y, f.T.x) - 0.08, 'XYZ');
    g.add(holder);
  }
  // the thagomizer
  for (const [u, k] of [[0.05, 1], [0.1, 1.1]]) for (const s of [1, -1]) {
    const p = body.surf(u, Math.PI / 2, 0.5);
    g.add(spike([p.x, p.y, p.z + s * 0.02], [-0.55, 0.45, s * 0.75], 0.03 * k, 0.3 * k, IVORY(), 10));
  }
  const L = [
    [[0.45, 0.72, 0.2, 0.13], [0.53, 0.38, 0.23, 0.09], [0.55, 0.1, 0.23, 0.08], [0.56, 0, 0.23, 0.09]],
    [[0.45, 0.72, -0.2, 0.13], [0.42, 0.38, -0.23, 0.09], [0.38, 0.1, -0.23, 0.08], [0.37, 0, -0.23, 0.09]],
    [[-0.4, 0.95, 0.22, 0.21], [-0.36, 0.52, 0.25, 0.12], [-0.48, 0.13, 0.25, 0.09], [-0.47, 0, 0.25, 0.1]],
    [[-0.4, 0.95, -0.22, 0.21], [-0.24, 0.52, -0.25, 0.12], [-0.28, 0.13, -0.25, 0.09], [-0.27, 0, -0.25, 0.1]],
  ];
  for (const p of L) { g.add(leg(p, pal)); nails(g, p[3][0], 0, p[3][2], p[3][3]); }
  return bake(g);
}

// a theropod's body: legs, arms and a skull with its jaw, shared by the allosaur and the tyrant
function theropod(g, o) {
  const { pal, spine, segs = 64, hip, legs, arm, claws = 3 } = o;
  const body = loft(spine, { segs, radial: 16, paint: hide(pal) });
  g.add(body);
  for (const s of [1, -1]) {
    const lg = legs[s > 0 ? 0 : 1];
    g.add(leg(lg.map(([x, y, r, rz]) => [x, y, s * hip[2] * 1.12, r, rz ?? r]), pal, { foot: 0.3, segs: 18, radial: 14 }));
    const b = lg[lg.length - 1];
    birdFoot(g, b[0], b[1], s * hip[2] * 1.12, o.toe, b[2] * 0.75, pal);
    // the arm, ending in claws
    const [sh, el, ha, r0] = arm;
    g.add(loft([[sh[0], sh[1], s * sh[2], r0], [el[0], el[1], s * el[2], r0 * 0.75], [ha[0], ha[1], s * ha[2], r0 * 0.62]], { segs: 8, radial: 8, ref: [1, 0, 0], paint: limbPaint(pal, 1e9) }));
    for (let c = 0; c < claws; c++) {
      const dz = (c - (claws - 1) / 2) * r0 * 0.7;
      g.add(spike([ha[0] + r0 * 0.4, ha[1], s * (ha[2] + dz)], [0.6, -0.8, 0], r0 * 0.3, r0 * 1.4, IVORY(), 5));
    }
  }
  return body;
}

// a skull and its jaw: the jaw hinges at `hinge` and opens by `open` radians. Teeth along both.
function skull(g, o) {
  const { up, jaw, hinge, open = 0, pal, teeth = 6, tooth = 0.05, u0 = 0.4, mouth = 0x8a2a2a } = o;
  const hp = hide({ ...pal, n: 0, line: -0.55 });
  const top = loft(up, { segs: 22, radial: 16, paint: hp });
  g.add(top);
  const jg = group();
  const low = loft(jaw, { segs: 16, radial: 14, paint: hide({ ...pal, n: 0, line: 0.2 }) });
  jg.add(low);
  const tm = IVORY();
  for (let i = 0; i < teeth; i++) {
    const u = u0 + (0.92 - u0) * (i / (teeth - 1)), h = tooth * (1 - 0.35 * (i / teeth));
    for (const s of [1, -1]) {
      const a = top.surf(u, s > 0 ? -1.1 : -Math.PI + 1.1, 0.88);
      g.add(spike(a.toArray(), [0.15, -1, 0], h * 0.32, h, tm, 6));
      const b = low.surf(Math.min(0.9, u * 0.95), s > 0 ? 0.9 : Math.PI - 0.9, 0.9);
      jg.add(spike(b.toArray(), [0.1, 1, 0], h * 0.28, h * 0.85, tm, 6));
    }
  }
  if (open > 0) {
    // the inside of the mouth and a tongue, so the open jaw shows red, not daylight
    const f0 = low.frame(0.5);
    jg.add(blob([f0.c.x, f0.c.y + f0.ry * 0.7, 0], [Math.abs(up[up.length - 1][0] - hinge[0]) * 0.42, f0.ry * 0.6, f0.rz * 0.75], mat(0xc0505a, { roughness: 0.5 }), null, 12));
  }
  const pivot = group(jg);
  pivot.position.set(hinge[0], hinge[1], 0);
  jg.position.set(-hinge[0], -hinge[1], 0);
  pivot.rotation.z = -open;
  g.add(pivot);
  if (open > 0) {
    const f = top.frame(0.45);
    g.add(blob([f.c.x - 0.02, f.c.y - f.ry * 0.55, 0], [Math.abs(up[up.length - 1][0] - hinge[0]) * 0.4, f.ry * 0.5, f.rz * 0.7], mat(mouth, { roughness: 0.6 }), null, 12));
  }
  return top;
}

// a big Jurassic theropod: a long low skull with horns before its eyes, three-fingered hands
function allosaurus(rng) {
  const g = group();
  const pal = { back: 0xc8862e, belly: 0xf2e0b4, stripe: 0x6e3c1c, dark: 0x4a3020, n: 16, u0: 0.1, u1: 0.85, ph: rng() * TAU };
  const tz = range(rng, -0.25, 0.25);
  theropod(g, {
    pal, segs: 64,
    spine: [[-1.8, 0.98, tz, 0.012], [-1.4, 1.02, tz * 0.6, 0.05, 0.045], [-0.98, 1.07, tz * 0.2, 0.1, 0.09], [-0.56, 1.12, 0, 0.17, 0.15], [-0.15, 1.14, 0, 0.25, 0.2],
      [0.25, 1.1, 0, 0.27, 0.21], [0.5, 1.15, 0, 0.19, 0.155], [0.66, 1.31, 0, 0.13, 0.115], [0.74, 1.46, 0, 0.11, 0.1]],
    hip: [-0.12, 1.12, 0.15],
    legs: [[[-0.12, 1.14, 0.16], [-0.04, 0.9, 0.2, 0.13], [0.07, 0.62, 0.1, 0.09], [-0.1, 0.2, 0.06], [-0.04, 0.05, 0.055]],
      [[-0.12, 1.14, 0.16], [-0.13, 0.89, 0.2, 0.13], [-0.1, 0.6, 0.1, 0.09], [-0.36, 0.26, 0.06], [-0.32, 0.05, 0.055]]],
    toe: 0.17,
    arm: [[0.42, 1.0, 0.15], [0.5, 0.83, 0.2], [0.64, 0.78, 0.2], 0.045],
  });
  skull(g, {
    pal, hinge: [0.76, 1.44], open: 0.08, teeth: 7, tooth: 0.04,
    up: [[0.66, 1.53, 0, 0.11, 0.09], [0.82, 1.54, 0, 0.12, 0.095], [1.0, 1.5, 0, 0.095, 0.08], [1.15, 1.46, 0, 0.07, 0.064], [1.23, 1.44, 0, 0.055, 0.054]],
    jaw: [[0.7, 1.43, 0, 0.065, 0.075], [0.9, 1.41, 0, 0.055, 0.066], [1.14, 1.39, 0, 0.034, 0.05]],
  });
  eyes(g, 0.84, 1.6, 0.075, 0.026, { iris: 0xe0b030, look: [0.5, 0.05, 1] });
  for (const s of [1, -1]) {
    g.add(spike([0.91, 1.63, s * 0.05], [0.25, 1, s * 0.2], 0.03, 0.08, mat(0xc0402a, { roughness: 0.5 }), 8));
    g.add(blob([1.0, 1.585, s * 0.035], [0.12, 0.022, 0.018], mat(0xc0402a, { roughness: 0.5 }), null, 8));
  }
  return bake(g);
}

// ---------- the Cretaceous ----------

// a tyrant lizard: a huge roaring head, tiny two-fingered arms, a tail held out to balance
function trex(rng) {
  const g = group();
  const pal = { back: 0x8e4a2a, belly: 0xeecb8c, stripe: 0x4a2212, dark: 0x3a2014, n: 15, u0: 0.12, u1: 0.8, ph: rng() * TAU };
  const tz = range(rng, -0.3, 0.3);
  theropod(g, {
    pal, segs: 72, claws: 2,
    spine: [[-2.05, 1.06, tz, 0.014], [-1.58, 1.13, tz * 0.6, 0.07, 0.065], [-1.08, 1.21, tz * 0.2, 0.15, 0.13], [-0.56, 1.27, 0, 0.25, 0.21],
      [-0.1, 1.29, 0, 0.34, 0.27], [0.35, 1.23, 0, 0.36, 0.28], [0.68, 1.34, 0, 0.27, 0.22], [0.86, 1.52, 0, 0.21, 0.18], [0.94, 1.64, 0, 0.18, 0.16]],
    hip: [-0.06, 1.24, 0.2],
    legs: [[[-0.06, 1.28, 0.2], [0.03, 1.0, 0.28, 0.17], [0.16, 0.7, 0.13, 0.12], [-0.04, 0.24, 0.08], [0.04, 0.06, 0.07]],
      [[-0.06, 1.28, 0.2], [-0.06, 0.99, 0.28, 0.17], [0.0, 0.68, 0.13, 0.12], [-0.32, 0.3, 0.08], [-0.26, 0.06, 0.07]]],
    toe: 0.22,
    arm: [[0.55, 1.08, 0.2], [0.6, 0.97, 0.25], [0.7, 0.99, 0.24], 0.04],
  });
  skull(g, {
    pal, hinge: [0.86, 1.68], open: 0.42, teeth: 7, tooth: 0.07, u0: 0.42,
    up: [[0.78, 1.84, 0, 0.2, 0.18], [0.98, 1.86, 0, 0.21, 0.17], [1.2, 1.8, 0, 0.16, 0.13], [1.42, 1.74, 0, 0.12, 0.1], [1.6, 1.7, 0, 0.095, 0.085]],
    jaw: [[0.8, 1.62, 0, 0.12, 0.15], [1.0, 1.6, 0, 0.1, 0.13], [1.25, 1.58, 0, 0.07, 0.105], [1.5, 1.57, 0, 0.052, 0.08]],
  });
  eyes(g, 1.0, 1.95, 0.14, 0.032, { iris: 0xf0b020, look: [0.6, 0.0, 1] });
  const hp = hide({ ...pal, n: 0, line: -0.5 });
  for (const s of [1, -1]) {
    g.add(blob([1.03, 2.0, s * 0.125], [0.075, 0.032, 0.04], SKIN(), hp, 10, -0.15));    // the brow
    g.add(blob([1.56, 1.79, s * 0.04], [0.016, 0.012, 0.013], HORN(), null, 6));        // a nostril
  }
  return bake(g);
}

// a horned face: a frill edged with knobs, two long brow horns, a nose horn and a parrot's beak
function triceratops(rng) {
  const g = group();
  const pal = { back: 0x5f7488, belly: 0xdcd6c4, stripe: 0x3e4e60, dark: 0x2e343c, n: 12, u0: 0.1, u1: 0.85, ph: rng() * TAU };
  const tz = range(rng, -0.15, 0.15);
  g.add(loft([
    [-1.45, 0.55, tz, 0.03], [-1.1, 0.68, tz * 0.5, 0.09, 0.085], [-0.7, 0.86, 0, 0.23, 0.21], [-0.3, 0.93, 0, 0.38, 0.36],
    [0.15, 0.89, 0, 0.42, 0.4], [0.55, 0.82, 0, 0.34, 0.31], [0.8, 0.8, 0, 0.22, 0.2],
  ], { segs: 56, radial: 18, paint: hide(pal) }));
  const hp = hide({ ...pal, n: 0, line: -0.4 });
  g.add(loft([[0.72, 0.86, 0, 0.2, 0.18], [0.95, 0.82, 0, 0.21, 0.17], [1.2, 0.68, 0, 0.15, 0.12], [1.38, 0.57, 0, 0.1, 0.085], [1.47, 0.5, 0, 0.065, 0.06]], { segs: 20, radial: 16, paint: hp }));
  g.add(taper([[1.38, 0.56, 0], [1.5, 0.5, 0], [1.56, 0.4, 0]], 0.06, 0.008, HORN(), 10, 10));        // the beak
  eyes(g, 1.05, 0.88, 0.13, 0.03);
  const bone = IVORY();
  g.add(taper([[1.3, 0.66, 0], [1.37, 0.76, 0], [1.42, 0.86, 0]], 0.045, 0.004, bone, 8, 10));       // the nose horn
  for (const s of [1, -1]) g.add(taper([[1.0, 0.95, s * 0.1], [1.2, 1.1, s * 0.15], [1.45, 1.2, s * 0.17], [1.62, 1.25, s * 0.17]], 0.052, 0.004, bone, 14, 10));
  // the frill: a shell, scalloped round its edge, curved forward round the head, leaning back
  const a = 0.5, b = 0.42, cy = 0.2, n = 40, rings = 7, th = 0.022, bend = 1.0;
  const back = col(pal.back), pos = [], cols = [], idx = [];
  const fpaint = (q, tip) => {
    let c = mix(back, 0xe8902e, sstep(0.25, 0.5, q));
    c = mix(c, 0xb8302a, sstep(0.66, 0.8, q));
    return tip ? col(0xf0d478) : mix(c, 0xf0d478, sstep(0.93, 1.0, q));
  };
  for (const face of [1, -1]) for (let i = 0; i <= n; i++) {
    const t = -0.32 + (Math.PI + 0.64) * (i / n), tip = i % 2 === 1, k = tip ? 1.065 : 1.0;
    const inner = [Math.cos(t) * 0.17, Math.max(0, Math.sin(t)) * 0.12];
    for (let r = 0; r <= rings; r++) {
      const kk = r === rings ? k : 1, outer = [Math.cos(t) * a * kk, cy + Math.sin(t) * b * kk];
      const q = r / rings, x = inner[0] + (outer[0] - inner[0]) * q, y = inner[1] + (outer[1] - inner[1]) * q;
      pos.push(x, y, face * th * (1 - 0.5 * q) - bend * x * x);
      const c = fpaint(q, tip && r === rings); cols.push(c.r, c.g, c.b);
    }
  }
  const R = rings + 1, half = (n + 1) * R, v = (face, i, r) => (face > 0 ? 0 : half) + i * R + r;
  for (let i = 0; i < n; i++) for (let r = 0; r < rings; r++) {
    idx.push(v(1, i, r), v(1, i + 1, r), v(1, i, r + 1), v(1, i, r + 1), v(1, i + 1, r), v(1, i + 1, r + 1));
    idx.push(v(-1, i, r), v(-1, i, r + 1), v(-1, i + 1, r), v(-1, i, r + 1), v(-1, i + 1, r + 1), v(-1, i + 1, r));
  }
  for (let i = 0; i < n; i++) idx.push(v(1, i, rings), v(1, i + 1, rings), v(-1, i, rings), v(-1, i, rings), v(1, i + 1, rings), v(-1, i + 1, rings));
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  fg.setIndex(idx); fg.computeVertexNormals();
  const frill = mesh(fg, mat(0xffffff, { vertexColors: true, roughness: 0.58, side: THREE.DoubleSide }));
  frill.rotation.y = -Math.PI / 2;
  const tilt = group(frill);
  tilt.rotation.z = 0.88;
  tilt.position.set(0.82, 0.92, 0);
  g.add(tilt);
  const L = [
    [[0.55, 0.72, 0.28, 0.17], [0.62, 0.4, 0.33, 0.12], [0.64, 0.1, 0.32, 0.1], [0.65, 0, 0.32, 0.11]],
    [[0.55, 0.72, -0.28, 0.17], [0.5, 0.4, -0.33, 0.12], [0.46, 0.1, -0.32, 0.1], [0.45, 0, -0.32, 0.11]],
    [[-0.3, 0.82, 0.28, 0.23], [-0.27, 0.42, 0.3, 0.14], [-0.38, 0.12, 0.3, 0.11], [-0.38, 0, 0.3, 0.12]],
    [[-0.3, 0.82, -0.28, 0.23], [-0.16, 0.42, -0.3, 0.14], [-0.18, 0.12, -0.3, 0.11], [-0.17, 0, -0.3, 0.12]],
  ];
  for (const p of L) { g.add(leg(p, pal)); nails(g, p[3][0], 0, p[3][2], p[3][3]); }
  return bake(g);
}

// a duckbill on all fours, its head up, a long hollow crest sweeping back from its skull
function parasaurolophus(rng) {
  const g = group();
  const pal = { back: 0x3a7f8a, belly: 0xece0b4, stripe: 0x24525e, dark: 0x263a40, n: 18, u0: 0.08, u1: 0.72, ph: rng() * TAU };
  const tz = range(rng, -0.25, 0.25);
  g.add(loft([
    [-1.75, 0.95, tz, 0.02, 0.015], [-1.35, 1.0, tz * 0.6, 0.09, 0.05], [-0.9, 1.06, tz * 0.2, 0.17, 0.1], [-0.45, 1.1, 0, 0.27, 0.19],
    [-0.05, 1.08, 0, 0.32, 0.24], [0.4, 0.98, 0, 0.3, 0.23], [0.72, 0.96, 0, 0.21, 0.17], [0.95, 1.14, 0, 0.13, 0.11], [1.07, 1.4, 0, 0.1, 0.09], [1.11, 1.56, 0, 0.09, 0.085],
  ], { segs: 72, radial: 16, paint: hide(pal) }));
  const hp = hide({ ...pal, n: 0, line: -0.35 });
  g.add(loft([[1.05, 1.63, 0, 0.1, 0.08], [1.22, 1.61, 0, 0.09, 0.075], [1.38, 1.53, 0, 0.065, 0.06], [1.5, 1.47, 0, 0.048, 0.072], [1.57, 1.45, 0, 0.038, 0.07]], { segs: 16, radial: 14, paint: hp }));
  g.add(blob([1.56, 1.43, 0], [0.04, 0.02, 0.07], mat(0xd8b070, { roughness: 0.5 }), null, 10));
  eyes(g, 1.2, 1.67, 0.065, 0.024);
  g.add(loft([[1.3, 1.62, 0, 0.045], [1.16, 1.74, 0, 0.055], [0.95, 1.84, 0, 0.055], [0.72, 1.9, 0, 0.045]], {
    segs: 20, radial: 12, cap: [1, 1.2], paint: (u, s) => mix(0xe0602e, 0xb83020, sstep(0.3, 1, u)).lerp(col(0xf0a040), sstep(0.2, 1, s) * 0.35 * (1 - u)),
  }));
  for (const s of [1, -1]) {
    const f = s > 0 ? 1 : -1;
    g.add(leg([[0.0, 1.04, s * 0.2, 0.16], [0.04 + f * 0.03, 0.82, s * 0.22, 0.21, 0.13], [0.1 + f * 0.05, 0.56, s * 0.23, 0.1, 0.09], [-0.08 + f * 0.1, 0.2, s * 0.23, 0.068], [-0.02 + f * 0.1, 0, s * 0.23, 0.075]], pal, { foot: 0.25, segs: 18 }));
    nails(g, -0.02 + f * 0.1, 0, s * 0.24, 0.075);
    g.add(leg([[0.72, 0.86, s * 0.17, 0.09], [0.7 - f * 0.04, 0.48, s * 0.2, 0.06], [0.76 - f * 0.08, 0.06, s * 0.2, 0.048], [0.77 - f * 0.08, 0, s * 0.2, 0.052]], pal, { foot: 0.15 }));
    nails(g, 0.77 - f * 0.08, 0, s * 0.2, 0.05);
  }
  return bake(g);
}

// an armoured dinosaur: low and broad, its back studded, spikes along its flanks, a club on its tail
function ankylosaurus(rng) {
  const g = group();
  const pal = { back: 0x9a7448, belly: 0xe2d2a8, stripe: 0x6a4a2c, dark: 0x3a2c20, n: 0, line: -0.05 };
  const tz = range(rng, -0.3, 0.3);
  const body = loft([
    [-1.35, 0.42, tz, 0.04], [-1.0, 0.46, tz * 0.6, 0.065, 0.065], [-0.65, 0.52, tz * 0.2, 0.14, 0.16], [-0.3, 0.56, 0, 0.27, 0.42],
    [0.15, 0.56, 0, 0.29, 0.45], [0.52, 0.51, 0, 0.22, 0.36], [0.72, 0.46, 0, 0.13, 0.17],
  ], { segs: 52, radial: 20, paint: hide(pal) });
  g.add(body);
  const hp = hide({ ...pal, line: -0.3 });
  g.add(loft([[0.68, 0.48, 0, 0.13, 0.15], [0.86, 0.47, 0, 0.12, 0.15], [1.0, 0.43, 0, 0.08, 0.1], [1.08, 0.41, 0, 0.055, 0.07]], { segs: 14, radial: 14, paint: hp }));
  eyes(g, 0.9, 0.52, 0.12, 0.022);
  const stud = mat(0xe8d6a4, { roughness: 0.55 }), spk = IVORY();
  for (const s of [1, -1]) {
    g.add(spike([0.76, 0.56, s * 0.13], [-0.6, 0.35, s * 0.7], 0.035, 0.11, spk, 8));
    g.add(spike([0.84, 0.42, s * 0.14], [-0.3, -0.3, s * 1], 0.03, 0.08, spk, 8));
  }
  // rows of osteoderms across the back, spikes along the flanks
  let row = 0;
  for (let u = 0.34; u < 0.95; u += 0.065, row++) {
    const f = body.frame(u);
    for (const a of [0.42, 0.85, Math.PI / 2, Math.PI - 0.85, Math.PI - 0.42]) {
      if (row % 2 && Math.abs(a - Math.PI / 2) < 0.01) continue;
      const aa = a + (row % 2 ? 0.2 : 0), p = body.surf(u, aa, 0.97);
      const nrm = f.U.clone().multiplyScalar(Math.sin(aa) / f.ry).addScaledVector(f.S, Math.cos(aa) / f.rz).normalize();
      g.add(spike(p.toArray(), nrm.toArray(), 0.05, 0.07, stud, 7));
    }
    for (const s of [1, -1]) {
      const p = body.surf(u, s > 0 ? 0.08 : Math.PI - 0.08, 0.95);
      g.add(spike(p.toArray(), [-0.25, 0.1, s], 0.04, 0.12 + 0.05 * Math.sin(u * Math.PI), spk, 8));
    }
  }
  for (let u = 0.08; u < 0.32; u += 0.05) for (const s of [1, -1]) {
    const p = body.surf(u, s > 0 ? 0.3 : Math.PI - 0.3, 0.95);
    g.add(spike(p.toArray(), [-0.2, 0.6, s], 0.025, 0.06, stud, 6));
  }
  // the club
  const clubm = mat(0xc8a878, { roughness: 0.5 });
  g.add(blob([-1.42, 0.43, 0.08], [0.13, 0.09, 0.1], clubm, null, 12));
  g.add(blob([-1.42, 0.43, -0.08], [0.13, 0.09, 0.1], clubm, null, 12));
  g.add(blob([-1.52, 0.43, 0], [0.1, 0.075, 0.09], clubm, null, 12));
  const L = [
    [[0.5, 0.42, 0.28, 0.11], [0.54, 0.18, 0.31, 0.085], [0.55, 0, 0.31, 0.09]],
    [[0.5, 0.42, -0.28, 0.11], [0.46, 0.18, -0.31, 0.085], [0.45, 0, -0.31, 0.09]],
    [[-0.3, 0.45, 0.3, 0.14], [-0.3, 0.2, 0.33, 0.1], [-0.36, 0, 0.33, 0.1]],
    [[-0.3, 0.45, -0.3, 0.14], [-0.22, 0.2, -0.33, 0.1], [-0.2, 0, -0.33, 0.1]],
  ];
  for (const p of L) { g.add(leg(p, pal, { foot: 0.1 })); nails(g, p[2][0], 0, p[2][2], p[2][3]); }
  return bake(g);
}

// a pterosaur gliding toward the viewer on gull wings: a long beak and a long crest
function pteranodon(rng) {
  const g = group();
  const pal = { back: 0xe2d4b8, belly: 0xf6eedc, line: -0.2 };
  g.add(loft([[-0.3, 0, 0, 0.03], [-0.12, 0.01, 0, 0.065, 0.07], [0.08, 0.02, 0, 0.065, 0.07], [0.2, 0.05, 0, 0.04], [0.28, 0.09, 0, 0.035]], { segs: 18, radial: 12, paint: hide(pal) }));
  const hp = hide({ ...pal, line: -0.4 });
  g.add(loft([[0.25, 0.11, 0, 0.045, 0.036], [0.34, 0.11, 0, 0.042, 0.032], [0.5, 0.09, 0, 0.024, 0.018], [0.66, 0.07, 0, 0.008, 0.007], [0.72, 0.065, 0, 0.002]], { segs: 18, radial: 10, paint: hp, cap: [1, 0] }));
  eyes(g, 0.3, 0.125, 0.028, 0.012);
  const cg = new THREE.ExtrudeGeometry(new THREE.Shape([[0.27, 0.12], [0.33, 0.15], [0.1, 0.3], [0.02, 0.31], [0.06, 0.27]].map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 });
  cg.translate(0, 0, -0.006);
  paintGeo(cg, (x, y) => mix(0xe85a2a, 0xb02820, sstep(0.15, 0.3, y)));
  g.add(mesh(cg, SKIN()));
  // the wings: a membrane from the long finger to the ankle, top and bottom painted apart
  for (const s of [1, -1]) {
    const o = [[0.1, 0.03], [0.17, 0.3], [0.2, 0.58], [0.08, 0.95], [-0.1, 1.3], [-0.17, 1.14], [-0.25, 0.82], [-0.33, 0.48], [-0.38, 0.22], [-0.33, 0.04]];
    const wg = new THREE.ExtrudeGeometry(new THREE.Shape(o.map(([x, z]) => new THREE.Vector2(x, z))), { depth: 0.016, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1, curveSegments: 4 });
    wg.translate(0, 0, -0.008);
    const p = wg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getY(i), y = p.getZ(i);
      p.setXYZ(i, x, y + 0.38 * z - 0.24 * z * z, s * z);
    }
    const wgeo = s < 0 ? flipWinding(wg) : (wg.computeVertexNormals(), wg);
    paintGeo(wgeo, (x, y, z, nx, ny) => {
      const span = Math.abs(z) / 1.3, top = ny > 0;
      return top ? mix(0xd8843e, 0x9a4c2a, sstep(0.35, 1, span)) : mix(0xf0d8b8, 0xc89a78, span);
    });
    g.add(mesh(wgeo, SKIN()));
    g.add(taper([[0.12, 0.04, s * 0.03], [0.17, 0.09, s * 0.3], [0.19, 0.1, s * 0.58]], 0.03, 0.018, mat(0x9a5a30, { roughness: 0.6 }), 8, 8));
    g.add(stick([-0.26, -0.005, s * 0.04], [-0.4, -0.02, s * 0.1], 0.016, 0.012, mat(0xd8c8a8), 6));
  }
  return fly(g, [0.64, range(rng, -0.25, -0.15), range(rng, 0.7, 0.85)], [0, 1, 0.3]);
}
// a geometry with its triangles turned over (for a mirrored part)
function flipWinding(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name], k = a.itemSize;
    for (let i = 0; i < a.count; i += 3) for (let j = 0; j < k; j++) {
      const t = a.array[(i + 1) * k + j]; a.array[(i + 1) * k + j] = a.array[(i + 2) * k + j]; a.array[(i + 2) * k + j] = t;
    }
  }
  g.computeVertexNormals();
  return g;
}

// a plesiosaur at the surface: a long neck and small head rising from a ring of water, its back awash
function plesiosaur(rng) {
  const g = group();
  const pal = { back: 0x3e6e8a, belly: 0xd8e0d0, stripe: 0x24465e, n: 0, line: -0.35 };
  const sea = (geo) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, 0); geo.computeVertexNormals(); return geo; };
  const bend = range(rng, -0.25, 0.25);
  const body = loft([[-0.75, -0.02, bend, 0.01], [-0.5, 0.0, bend * 0.4, 0.06, 0.07], [-0.15, 0.02, 0, 0.13, 0.2], [0.18, 0.02, 0, 0.13, 0.19],
    [0.36, 0.08, 0, 0.095], [0.46, 0.3, 0, 0.072], [0.5, 0.55, 0, 0.06], [0.57, 0.76, 0, 0.05], [0.67, 0.86, 0, 0.045]], { segs: 60, radial: 14, paint: hide(pal), cap: [1, 1] });
  sea(body.geometry);
  g.add(body);
  g.add(loft([[0.63, 0.88, 0, 0.052, 0.047], [0.73, 0.9, 0, 0.058, 0.05], [0.86, 0.86, 0, 0.038, 0.035], [0.96, 0.83, 0, 0.022, 0.024]], { segs: 12, radial: 12, paint: hide({ ...pal, line: -0.4 }) }));
  eyes(g, 0.74, 0.93, 0.04, 0.017);
  for (const s of [1, -1]) {
    const fl = loft([[0.1, 0.0, s * 0.17, 0.035, 0.06], [0.05, 0.01, s * 0.33, 0.025, 0.07], [-0.08, 0.0, s * 0.48, 0.012, 0.035]], { segs: 10, radial: 10, ref: [0, 1, 0], paint: hide(pal) });
    sea(fl.geometry); g.add(fl);
  }
  // the water: a disc, rings of foam at the neck and round the back
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), mat(0x3d8ec0, { roughness: 0.15, transparent: true, opacity: 0.72 }));
  water.scale.set(0.95, 1, 0.62); water.position.set(-0.05, 0.004, 0); water.receiveShadow = true;
  g.add(water);
  const foam = mat(0xf2f8fa, { roughness: 0.5 });
  const ring = (x, z, rx, rz, t) => { const o = mesh(new THREE.TorusGeometry(1, t, 6, 28).rotateX(Math.PI / 2), foam); o.scale.set(rx, Math.min(rx, rz) * 0.5, rz); o.position.set(x, 0.008, z); return o; };
  g.add(ring(0.37, 0, 0.12, 0.1, 0.18));
  g.add(ring(-0.08, 0, 0.42, 0.25, 0.05));
  g.add(ring(-0.08, 0, 0.62, 0.4, 0.025));
  g.add(ring(-0.05, 0, 0.94, 0.61, 0.012));
  return bake(g);
}

// an early flowering tree: a short trunk, rounded leafy crowns, pink-white cups of blossom
function magnolia(rng) {
  const g = group();
  const wood = mat(0x6a4c3a, { roughness: 0.85 });
  g.add(taper([[0, 0, 0], [0.01, 0.18, 0], [0.03, 0.34, 0]], 0.045, 0.03, wood, 3, 6));
  const leafA = col(0x2f6a3a), leafB = col(0x68a656), blooms = [];
  const crowns = [[-0.17, 0.5, 0.05, 0.19], [0.17, 0.53, -0.03, 0.2], [0.0, 0.69, 0.02, 0.21]];
  const leaves = mat(0xffffff, { vertexColors: true, roughness: 0.55 });
  for (const [x, y, z, r] of crowns) {
    const rr = r * range(rng, 0.9, 1.1);
    g.add(stick([0.03, 0.32, 0], [x * 0.8, y - rr * 0.4, z], 0.022, 0.014, wood, 5));
    const geo = new THREE.SphereGeometry(1, 7, 5);
    paintGeo(geo, (a, b) => mix(leafA, leafB, (b + 1) / 2));
    const o = mesh(geo, leaves);
    o.scale.set(rr, rr * 0.82, rr); o.position.set(x, y, z);
    g.add(o);
    blooms.push([x, y, z, rr]);
  }
  // blossoms: open cups, pink at the heart and white at the rim, on the sunny side of each crown
  const cup = mat(0xffffff, { vertexColors: true, roughness: 0.5, side: THREE.DoubleSide });
  for (let i = 0; i < 14; i++) {
    const [x, y, z, r] = blooms[i % 3];
    const th = range(rng, -2.6, 1.2), ph = range(rng, -0.1, 1.2);
    const n = new THREE.Vector3(Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph) + 0.5).normalize();
    const geo = new THREE.ConeGeometry(0.078, 0.07, 6, 1, true);
    paintGeo(geo, (a, b) => mix(0xc8447e, 0xecd4de, sstep(0.03, -0.025, b)));
    const o = mesh(geo, cup);
    o.quaternion.setFromUnitVectors(UP, n.clone().negate());
    o.position.set(x + n.x * r * 1.02, y + n.y * r * 0.84, z + n.z * r * 1.02);
    g.add(o);
  }
  return bake(g);
}

// a nest of eggs, one hatching: a baby peeks out with the shell's cap on its head
function nest(rng) {
  const g = group();
  g.add(lathe([[0.36, 0], [0.41, 0.04], [0.42, 0.08], [0.39, 0.125], [0.34, 0.145], [0.29, 0.12], [0.25, 0.07], [0.17, 0.045], [0.0, 0.04]], mat(0x7a5a38, { roughness: 0.95 }), 22));
  const twigs = [0x5a3c22, 0x8a6a40, 0x6e4c2c];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + rng() * 0.3, r = range(rng, 0.33, 0.4), y = range(rng, 0.07, 0.14);
    const t = new THREE.Vector3(-Math.sin(a), range(rng, -0.25, 0.25), Math.cos(a)).applyAxisAngle(UP, range(rng, -0.5, 0.5)).normalize();
    const c = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), L = range(rng, 0.1, 0.14);
    g.add(stick(c.clone().addScaledVector(t, -L).toArray(), c.clone().addScaledVector(t, L).toArray(), 0.012, 0.009, mat(twigs[i % 3], { roughness: 0.9 }), 5));
  }
  const eggProfile = [[0, 0], [0.045, 0.008], [0.066, 0.04], [0.072, 0.085], [0.064, 0.13], [0.046, 0.17], [0.022, 0.193], [0, 0.2]];
  const seed = rng() * 100;
  const speckle = (x, y, z) => (hash(Math.round(x * 90) + seed, Math.round(y * 90), Math.round(z * 90)) > 0.82 ? 0x8a6a4a : 0xe4d6b8);
  const egg = (x, z, tilt, az) => {
    const geo = new THREE.LatheGeometry(eggProfile.map(([r, y]) => new THREE.Vector2(r, y)), 12);
    paintGeo(geo, speckle);
    const o = mesh(geo, SKIN());
    const h = group(o); h.rotation.set(0, az, tilt, 'YXZ'); h.position.set(x, 0.045, z);
    return h;
  };
  for (const [x, z, t, a] of [[-0.13, -0.08, 0.5, 0.4], [0.06, -0.15, 0.45, 1.9], [0.15, 0.02, 0.55, 3.1], [-0.16, 0.1, 0.5, -0.5]]) g.add(egg(x, z, t, a));
  // the hatching egg: the lower shell with a jagged rim, a baby, its cap
  const shell = mat(0xe4d6b8, { roughness: 0.55, side: THREE.DoubleSide });
  const jag = (prof, top) => {
    const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14);
    const p = geo.attributes.position, k = prof.length;
    for (let i = 0; i < p.count; i++) if (i % k === (top ? 0 : k - 1)) p.setY(i, p.getY(i) + ((Math.floor(i / k) % 2) ? 0.018 : -0.008));
    geo.computeVertexNormals();
    return mesh(geo, shell);
  };
  const hx = 0.0, hz = 0.12;
  const low = jag([[0, 0], [0.045, 0.008], [0.066, 0.04], [0.072, 0.085], [0.068, 0.115]], false);
  g.add(at(low, hx, 0.04, hz));
  const pal = { back: 0x7ab84a, belly: 0xf0e08a, line: -0.2 };
  const baby = group();
  baby.add(loft([[0, 0.06, 0, 0.045], [0.0, 0.13, 0.005, 0.042], [0.0, 0.19, 0.01, 0.045]], { segs: 8, radial: 12, paint: hide(pal), ref: [0, 0, 1] }));
  baby.add(blob([0, 0.235, 0.02], [0.06, 0.055, 0.06], SKIN(), hide(pal), 14));
  baby.add(blob([0, 0.215, 0.07], [0.04, 0.032, 0.045], SKIN(), hide({ ...pal, line: 0.0 }), 12));
  for (const s of [1, -1]) {
    baby.add(at(mesh(new THREE.SphereGeometry(0.019, 10, 8), mat(0xf6f1e4, { roughness: 0.35 })), s * 0.035, 0.25, 0.055));
    baby.add(at(mesh(new THREE.SphereGeometry(0.013, 10, 8), mat(0x15110f, { roughness: 0.1 })), s * 0.04, 0.252, 0.068));
    baby.add(blob([s * 0.055, 0.135, 0.035], [0.016, 0.014, 0.022], SKIN(), hide(pal), 8));
  }
  const cap = jag([[0.064, 0.13], [0.046, 0.17], [0.022, 0.193], [0, 0.2]], true);
  const ch = group(cap); ch.position.set(0.005, 0.15, 0.01); ch.rotation.set(-0.15, 0, -0.35);
  baby.add(ch);
  baby.position.set(hx, 0.04, hz);
  baby.rotation.y = 0.35;
  g.add(baby);
  for (let i = 0; i < 3; i++) {
    const a = range(rng, -1.2, 0.6), r = range(rng, 0.12, 0.2);
    const sh = mesh(new THREE.CircleGeometry(0.03, 3), shell);
    sh.rotation.set(-Math.PI / 2 + range(rng, -0.4, 0.4), 0, rng() * TAU);
    sh.position.set(Math.cos(a) * r, 0.055, Math.sin(a) * r + 0.06);
    g.add(sh);
  }
  return bake(g);
}

export const flat = [];
export default {
  lepidodendron, calamites, treeFern, meganeura, dimetrodon,
  cycad, araucaria, fernClump, brachiosaurus, diplodocus, stegosaurus, allosaurus,
  trex, triceratops, parasaurolophus, ankylosaurus, pteranodon, plesiosaur, magnolia, nest,
};
