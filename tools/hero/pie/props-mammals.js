// The age of mammals (an African savanna about 3 Ma, with early hominins), the last Ice Age (20 ka),
// and the nature every era shares: props for the pie. See pie/README.md for the rules.
// Animals walk along +x with their profile toward +z; everything stands on y = 0. Each factory
// builds its parts, paints the coats on their vertices, and bakes them into one mesh per material.
import { THREE, mergeGeometries, mat, glow, mesh, at, group, lathe, extrude, cyl, C, range, pick } from './kit.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------------------------
// helpers

const V3 = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const UP = new THREE.Vector3(0, 1, 0);
const DS = THREE.DoubleSide;
const TAU = Math.PI * 2;
const col = (hex) => new THREE.Color(hex);
const lerp = THREE.MathUtils.lerp;
const sstep = THREE.MathUtils.smoothstep;
const seedOf = (rng) => Math.floor(rng() * 2147483647);
// a material whose colours are painted on the vertices (see paint); named, so each coat has its own
const painted = (name, o = {}) => mat(0xffffff, { vertexColors: true, name, ...o });

// a hash of an integer lattice point and a seed, in [0, 1); smooth value noise built on it
function hash3(i, j, k, s) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1440662683) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function noise(x, y, z, s) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const fx = x - i, fy = y - j, fz = z - k;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const h = (a, b, c) => hash3(i + a, j + b, k + c, s);
  const x00 = lerp(h(0, 0, 0), h(1, 0, 0), u), x10 = lerp(h(0, 1, 0), h(1, 1, 0), u);
  const x01 = lerp(h(0, 0, 1), h(1, 0, 1), u), x11 = lerp(h(0, 1, 1), h(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
// cellular noise: the distances to the nearest and second-nearest cell centre, and the nearest's id
function cells(p, size, s) {
  const x = p.x / size, y = p.y / size, z = p.z / size;
  const i0 = Math.floor(x), j0 = Math.floor(y), k0 = Math.floor(z);
  let d1 = 9, d2 = 9, id = 0;
  for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = k0 - 1; k <= k0 + 1; k++) {
    const dx = i + hash3(i, j, k, s) - x, dy = j + hash3(i, j, k, s + 1) - y, dz = k + hash3(i, j, k, s + 2) - z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < d1) { d2 = d1; d1 = d; id = hash3(i, j, k, s + 3); } else if (d < d2) d2 = d;
  }
  return [d1, d2, id];
}

// weld a geometry's seams and give it smooth normals (drops its uvs)
function relax(geo) {
  let g = geo.clone();
  for (const n of Object.keys(g.attributes)) if (n !== 'position') g.deleteAttribute(n);
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  return g;
}
// push a geometry's surface in and out along its normals: fur, foliage, rock
function lumpy(geo, amp, freq, s) {
  const g = relax(geo);
  const pos = g.attributes.position, nor = g.attributes.normal, p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    p.addScaledVector(n, amp * (2 * noise(p.x * freq + 17.3, p.y * freq + 5.1, p.z * freq + 9.7, s) - 1));
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}
const place = (x, c, r, e = [0, 0, 0]) => {
  x.position.set(c[0], c[1], c[2]);
  if (typeof r === 'number') x.scale.setScalar(r); else x.scale.set(r[0], r[1], r[2]);
  x.rotation.set(e[0], e[1], e[2]);
  return x;
};
// an ellipsoid: centre, radii, rotation
const egg = (m, c, r, seg = 16, e) => place(mesh(new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1)), m), c, r, e);
// a shaggy ellipsoid: a body under fur
const fuzz = (m, c, r, e, seg, amp, freq, s) =>
  place(mesh(lumpy(new THREE.SphereGeometry(1, seg, seg >> 1), amp, freq, s), m), c, r, e);
// a lumpy ball of low detail: a crown of leaves, a rock
const blob = (m, c, r, s, amp = 0.14, freq = 1.7, detail = 1, e) =>
  place(mesh(lumpy(new THREE.IcosahedronGeometry(1, detail), amp, freq, s), m), c, r, e);

// a rod from a to b, radius r0 at a and r1 at b
function rod(m, a, b, r0, r1 = r0, seg = 8) {
  const A = V3(a), d = V3(b).sub(A);
  const x = mesh(new THREE.CylinderGeometry(r1, r0, d.length(), seg), m);
  x.position.copy(A).addScaledVector(d, 0.5);
  x.quaternion.setFromUnitVectors(UP, d.normalize());
  return x;
}
// a cone from its base at a to its tip at b: a lock of hair, a horn, a flame
function spike(m, a, b, r, seg = 5, open = true) {
  const A = V3(a), d = V3(b).sub(A);
  const x = mesh(new THREE.ConeGeometry(r, d.length(), seg, 1, open), m);
  x.position.copy(A).addScaledVector(d, 0.5);
  x.quaternion.setFromUnitVectors(UP, d.normalize());
  return x;
}
// a smooth tube along a curve, its radius following radii (evenly spaced along it); caps are balls
function tube(m, pts, radii, segs = 12, radial = 8, caps = [false, false]) {
  const curve = new THREE.CatmullRomCurve3(pts.map(V3));
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const R = (t) => {
    if (radii.length === 1) return radii[0];
    const f = t * (radii.length - 1), i = Math.min(Math.floor(f), radii.length - 2);
    return lerp(radii[i], radii[i + 1], f - i);
  };
  const pos = geo.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, r = R(t);
    curve.getPointAt(t, c);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  const out = mesh(relax(geo), m);
  if (!caps[0] && !caps[1]) return out;
  const g = group(out);
  if (caps[0]) g.add(egg(m, pts[0], R(0), radial));
  if (caps[1]) g.add(egg(m, pts[pts.length - 1], R(1), radial));
  return g;
}

// colour each vertex of the meshes made of m by f(world position, world normal) → THREE.Color
function paint(g, m, f) {
  g.updateMatrixWorld(true);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  g.traverse((o) => {
    if (!o.isMesh || o.material !== m) return;
    const pos = o.geometry.attributes.position, nor = o.geometry.attributes.normal;
    nm.getNormalMatrix(o.matrixWorld);
    const cs = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (nor) n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); else n.set(0, 1, 0);
      const c = f(p, n);
      cs[3 * i] = c.r; cs[3 * i + 1] = c.g; cs[3 * i + 2] = c.b;
    }
    o.geometry.setAttribute('color', new THREE.BufferAttribute(cs, 3));
  });
}
// the same, one colour per triangle, by its centre, its normal and its index: panels, facets
function paintFaces(g, m, f) {
  g.updateMatrixWorld(true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  g.traverse((o) => {
    if (!o.isMesh || o.material !== m) return;
    if (o.geometry.index) o.geometry = o.geometry.toNonIndexed();
    const pos = o.geometry.attributes.position, cs = new Float32Array(pos.count * 3);
    for (let t = 0; t < pos.count; t += 3) {
      a.fromBufferAttribute(pos, t).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, t + 1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, t + 2).applyMatrix4(o.matrixWorld);
      n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
      const k = f(a.add(b).add(c).multiplyScalar(1 / 3), n, t / 3);
      for (let v = t; v < t + 3; v++) { cs[3 * v] = k.r; cs[3 * v + 1] = k.g; cs[3 * v + 2] = k.b; }
    }
    o.geometry.setAttribute('color', new THREE.BufferAttribute(cs, 3));
  });
}

// merge a prop's meshes into one per material (and shadow setting), so a thousand trees draw cheaply
function flipWinding(geo) {
  for (const at of Object.values(geo.attributes)) {
    const s = at.itemSize, arr = at.array;
    for (let t = 0; t < at.count; t += 3) for (let c = 0; c < s; c++) {
      const i1 = (t + 1) * s + c, i2 = (t + 2) * s + c, x = arr[i1];
      arr[i1] = arr[i2]; arr[i2] = x;
    }
  }
}
function bake(g) {
  g.updateMatrixWorld(true);
  const bins = new Map();
  g.traverse((o) => {
    if (!o.isMesh) return;
    const key = o.material.uuid + (o.castShadow ? '+' : '-');
    if (!bins.has(key)) bins.set(key, { m: o.material, cast: o.castShadow, geos: [] });
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    if (o.matrixWorld.determinant() < 0) flipWinding(geo);
    bins.get(key).geos.push(geo);
  });
  const out = group();
  for (const { m, cast, geos } of bins.values()) {
    const keep = Object.keys(geos[0].attributes).filter((n) => geos.every((x) => x.attributes[n]));
    for (const x of geos) {
      for (const n of Object.keys(x.attributes)) if (!keep.includes(n)) x.deleteAttribute(n);
      x.clearGroups();
    }
    const x = mesh(mergeGeometries(geos), m);
    x.castShadow = cast;
    out.add(x);
  }
  return out;
}

// thin blades from a list of {pts, w, side}: grass, reeds, fronds. Non-indexed, coloured by f(t).
function blades(list, f) {
  const P = [], K = [], v = new THREE.Vector3(), s = new THREE.Vector3();
  for (const { pts, w, side } of list) {
    s.set(...side).normalize();
    const L = [], R = [];
    pts.forEach((p, i) => {
      v.set(...p);
      L.push(v.clone().addScaledVector(s, -w[i] / 2));
      R.push(v.clone().addScaledVector(s, w[i] / 2));
    });
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const tri = (a, ta, b, tb, c, tc) => { P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); K.push(ta, tb, tc); };
      if (w[i + 1] === 0) tri(L[i], t0, R[i], t0, L[i + 1], t1);
      else { tri(L[i], t0, R[i], t0, R[i + 1], t1); tri(L[i], t0, R[i + 1], t1, L[i + 1], t1); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const cs = new Float32Array(K.length * 3);
  K.forEach((t, i) => { const c = f(t); cs[3 * i] = c.r; cs[3 * i + 1] = c.g; cs[3 * i + 2] = c.b; });
  geo.setAttribute('color', new THREE.BufferAttribute(cs, 3));
  geo.computeVertexNormals();
  return geo;
}

// a quadruped's leg: hip, knee, ankle points; a foot is added by the caller
const leg = (m, pts, radii, segs = 8, radial = 10) => tube(m, pts, radii, segs, radial);

// a smooth body lofted along x through keys [x, belly, back, half-width]: the back and belly lines run
// as given and the ends close in round caps of the given lengths; o.shag combs hair into it. Returns
// the mesh and at(x) → [centre y, half-height, half-width], to set eyes, ears and hair on it.
function loft(m, keys, o = {}) {
  const { caps = [0.06, 0.06], rings = 36, capRings = 6, radial = 28, p = 2.3, shag = 0, freq = [16, 4, 16], s = 0 } = o;
  const A = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(k[0], k[1], k[2])), false, 'catmullrom', 0.5);
  const B = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(k[0], k[3], 0)), false, 'catmullrom', 0.5);
  const ring = (u) => {
    const a = A.getPoint(u), b = B.getPoint(u);
    return [a.x, (a.y + a.z) / 2, Math.max(0, (a.z - a.y) / 2), Math.max(0, b.y)];
  };
  const R = [], r0 = ring(0), r1 = ring(1);
  for (let k = 0; k < capRings; k++) {
    const f = ((k / capRings) * Math.PI) / 2;
    R.push([r0[0] - caps[0] * Math.cos(f), r0[1], r0[2] * Math.sin(f), r0[3] * Math.sin(f)]);
  }
  for (let i = 0; i <= rings; i++) R.push(ring(i / rings));
  for (let k = capRings - 1; k >= 0; k--) {
    const f = ((k / capRings) * Math.PI) / 2;
    R.push([r1[0] + caps[1] * Math.cos(f), r1[1], r1[2] * Math.sin(f), r1[3] * Math.sin(f)]);
  }
  const P = [], I = [], f = (v) => Math.sign(v) * Math.abs(v) ** (2 / p);
  for (const [x, cy, ry, w] of R) {
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * TAU;
      P.push(x, cy + ry * f(Math.sin(th)), w * f(Math.cos(th)));
    }
  }
  for (let i = 0; i < R.length - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    I.push(a, b, a + 1, b, b + 1, a + 1);
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setIndex(I);
  geo = relax(geo);
  if (shag) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      n.fromBufferAttribute(nor, i);
      v.addScaledVector(n, shag * (2 * noise(v.x * freq[0], v.y * freq[1], v.z * freq[2], s) - 1));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
  }
  const at = (x) => {
    let i = 0;
    while (i < R.length - 2 && R[i + 1][0] < x) i++;
    const a = R[i], b = R[i + 1], t = THREE.MathUtils.clamp((x - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1);
    return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
  };
  return { body: mesh(geo, m), at };
}
// the depth z of a lofted body's surface at (x, y), less an inset: where an eye or an ear goes
function surf(at, x, y, inset = 0) {
  const [cy, ry, w] = at(x);
  return w * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)) - inset;
}

// ---------------------------------------------------------------------------------------------
// the African savanna, about 3 Ma

// a flat-topped umbrella thorn: a forked trunk under layered flat crowns
function acacia(rng) {
  const g = group(), s = seedOf(rng);
  const bark = mat(0x5a4030), crown = painted('acacia');
  const lean = range(rng, -0.06, 0.06);
  g.add(tube(bark, [[0, 0, 0], [0.03 + lean, 0.2, 0], [lean, 0.38, 0]], [0.05, 0.034, 0.03], 3, 6));
  const top = 0.62 + range(rng, -0.04, 0.04);
  const arms = [[0.34, top, 0.06], [-0.3, top - 0.01, -0.1], [0.04, top, -0.26], [-0.06, top + 0.01, 0.24]];
  for (const [x, y, z] of arms) g.add(tube(bark, [[lean, 0.36, 0], [x * 0.45 + lean, y - 0.14, z * 0.45], [x, y, z]], [0.026, 0.016], 3, 5));
  // the crowns: wide, thin, with a ragged rim
  const disk = (cx, cy, cz, R, h, sc) => {
    const geo = new THREE.LatheGeometry([[0.001, 0], [R * 0.8, 0.005], [R, h * 0.4], [R * 0.82, h * 0.9], [0.001, h]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
    const pos = geo.attributes.position, p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const a = Math.atan2(p.z, p.x), k = 1 + 0.32 * (noise(Math.cos(a) * 2 + cx * 9, Math.sin(a) * 2, cz * 9, s) - 0.5);
      pos.setXYZ(i, p.x * k, p.y, p.z * k * sc);
    }
    return at(mesh(relax(geo), crown), cx, cy, cz);
  };
  g.add(disk(0, top - 0.02, 0, 0.56, 0.1, 0.8));
  g.add(disk(range(rng, 0.08, 0.2), top + 0.05, range(rng, -0.05, 0.08), 0.34, 0.085, 0.85));
  g.add(disk(range(rng, -0.3, -0.18), top + 0.025, range(rng, -0.1, 0.05), 0.26, 0.08, 0.9));
  const lo = col(0x2c4222), hi = col(0x6a8a36), c = new THREE.Color();
  paint(g, crown, (p, n) => c.copy(lo).lerp(hi, sstep(n.y, -0.2, 0.95)));
  return bake(g);
}

// a tuft of tall golden grass
function savannaGrass(rng) {
  const g = group(), list = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + range(rng, -0.3, 0.3), out = range(rng, 0.15, 0.45), h = range(rng, 0.6, 1);
    const dx = Math.cos(a), dz = Math.sin(a);
    const b = [dx * 0.04, 0, dz * 0.04];
    list.push({
      pts: [b, [b[0] + dx * out * 0.35, h * 0.5, b[2] + dz * out * 0.35], [b[0] + dx * out, h, b[2] + dz * out]],
      w: [0.075, 0.05, 0], side: [-dz, 0, dx],
    });
  }
  const lo = col(0x86743a), hi = col(0xe8c870), c = new THREE.Color();
  g.add(mesh(blades(list, (t) => c.copy(lo).lerp(hi, Math.sqrt(t))), painted('grass', { side: DS })));
  return g;
}

// an African elephant: high shoulders, a dip in the back, great ears, tusks and trunk
function elephant(rng) {
  const g = group();
  const skin = mat(0x8f8a85), pad = mat(0x7a746e), ivory = mat(0xe0d4b8), nail = mat(0xdcd2c0), dark = mat(0x221c18), lip = mat(0x9a7e78);
  const { body } = loft(skin, [
    [-0.56, 0.44, 0.82, 0.19], [-0.46, 0.38, 0.875, 0.245], [-0.26, 0.37, 0.86, 0.26], [-0.04, 0.37, 0.875, 0.265],
    [0.16, 0.39, 0.93, 0.265], [0.32, 0.45, 0.9, 0.225], [0.42, 0.52, 0.84, 0.17]], { caps: [0.07, 0.06], rings: 30, radial: 32 });
  g.add(body);
  g.add(egg(skin, [0.49, 0.75, 0], [0.16, 0.19, 0.16], 24, [0, 0, -0.15]));   // head
  g.add(egg(skin, [0.58, 0.71, 0], [0.09, 0.14, 0.11], 18, [0, 0, -0.35]));   // the brow, running into the trunk
  g.add(egg(lip, [0.56, 0.57, 0], [0.055, 0.035, 0.055], 12));
  g.add(tube(skin, [[0.6, 0.74, 0], [0.68, 0.62, 0], [0.71, 0.45, 0], [0.7, 0.28, 0], [0.71, 0.14, 0], [0.77, 0.08, 0]],
    [0.085, 0.068, 0.053, 0.043, 0.036, 0.03], 24, 12, [false, true]));
  for (const sd of [1, -1]) {
    g.add(tube(ivory, [[0.56, 0.62, sd * 0.08], [0.63, 0.53, sd * 0.1], [0.72, 0.47, sd * 0.115], [0.82, 0.48, sd * 0.11], [0.88, 0.54, sd * 0.09]],
      [0.03, 0.026, 0.02, 0.012, 0.003], 16, 8));
    // the ears: an Africa-shaped flap, flared back from the head
    const ear = [[0.02, 0.02], [-0.06, 0.06], [-0.17, 0.065], [-0.27, 0.03], [-0.33, -0.05], [-0.345, -0.15], [-0.31, -0.25],
      [-0.25, -0.31], [-0.19, -0.38], [-0.14, -0.47], [-0.09, -0.5], [-0.05, -0.43], [-0.035, -0.32], [0, -0.22], [0.03, -0.1]];
    const e = extrude(ear.map(([x, y]) => [x * 0.92, y * 0.92]), 0.018, skin, 0.012);
    e.position.set(0.45, 0.9, sd * 0.165);
    e.rotation.set(0, sd * 0.42, 0);
    g.add(e);
    g.add(egg(dark, [0.585, 0.8, sd * 0.12], 0.014, 8));
  }
  const legs = [[0.24, 0.13, 0.06], [0.24, -0.13, -0.04], [-0.3, 0.13, -0.05], [-0.3, -0.13, 0.05]];
  for (const [x, z, st] of legs) {
    g.add(leg(skin, [[x, 0.62, z], [x + st * 0.45, 0.34, z], [x + st, 0.07, z]], [0.12, 0.1, 0.092], 8, 12));
    g.add(at(cyl(0.1, 0.096, 0.075, pad, 16), x + st, 0.0375, z));
    for (const a of [-0.7, 0, 0.7]) g.add(egg(nail, [x + st + 0.092 * Math.cos(a), 0.028, z + 0.092 * Math.sin(a)], [0.02, 0.022, 0.026], 8));
  }
  g.add(tube(skin, [[-0.6, 0.74, 0], [-0.67, 0.62, 0], [-0.69, 0.44, 0]], [0.022, 0.016, 0.012], 8, 6));
  g.add(egg(dark, [-0.69, 0.42, 0], [0.018, 0.04, 0.018], 8));
  return bake(g);
}

// a giraffe: long neck, a net of chestnut patches, ossicones
function giraffe(rng) {
  const g = group(), s = seedOf(rng);
  const coat = painted('giraffe'), hoof = mat(0x3a2a20), dark = mat(0x2a1c14), muzzle = mat(0xd9bb8e), mane = mat(0x7a4220);
  const { body } = loft(coat, [[-0.22, 0.47, 0.645, 0.09], [-0.12, 0.44, 0.655, 0.105], [0.0, 0.44, 0.67, 0.11], [0.12, 0.45, 0.71, 0.115], [0.18, 0.5, 0.72, 0.1]],
    { caps: [0.06, 0.05], rings: 30, radial: 40 });
  g.add(body);
  const neck = [[0.13, 0.6, 0], [0.2, 0.73, 0], [0.265, 0.86, 0], [0.31, 0.95, 0]];
  g.add(tube(coat, neck, [0.08, 0.056, 0.043, 0.036], 30, 20));
  // the short mane, along the back of the neck
  const nc = new THREE.CatmullRomCurve3(neck.map(V3)), mp = [];
  for (let i = 0; i <= 6; i++) {
    const t = 0.08 + 0.88 * (i / 6), p = nc.getPointAt(t), d = nc.getTangentAt(t);
    mp.push(p.addScaledVector(new THREE.Vector3(-d.y, d.x, 0), lerp(0.07, 0.034, t)).toArray());
  }
  g.add(tube(mane, mp, [0.014, 0.012, 0.008], 12, 6));
  const legs = [[0.12, 0.06, 0.05, false], [0.12, -0.06, -0.04, false], [-0.15, 0.06, -0.05, true], [-0.15, -0.06, 0.04, true]];
  for (const [x, z, st, hind] of legs) {
    const pts = hind
      ? [[x, 0.55, z], [x + 0.05 + st * 0.2, 0.42, z], [x - 0.02 + st * 0.6, 0.26, z], [x + st, 0.04, z]]
      : [[x, 0.53, z], [x + st * 0.4, 0.26, z], [x + st * 0.9, 0.08, z], [x + st, 0.04, z]];
    g.add(tube(coat, pts, hind ? [0.05, 0.034, 0.022, 0.02] : [0.042, 0.026, 0.021, 0.02], 14, 10));
    g.add(egg(hoof, [x + st + 0.005, 0.022, z], [0.026, 0.024, 0.024], 10));
  }
  // the head: long, muzzle down; ossicones, ears, eyes
  g.add(egg(coat, [0.355, 0.955, 0], [0.085, 0.042, 0.04], 28, [0, 0, -0.5]));
  g.add(egg(muzzle, [0.425, 0.912, 0], [0.036, 0.031, 0.031], 14, [0, 0, -0.5]));
  for (const sd of [1, -1]) {
    g.add(rod(dark, [0.31, 0.985, sd * 0.016], [0.297, 1.04, sd * 0.024], 0.009, 0.008, 6));
    g.add(egg(dark, [0.297, 1.042, sd * 0.024], 0.013, 8));
    g.add(egg(coat, [0.3, 0.975, sd * 0.05], [0.013, 0.009, 0.032], 10, [0, 0, 0.3]));
    g.add(egg(dark, [0.372, 0.972, sd * 0.032], 0.008, 6));
  }
  g.add(tube(coat, [[-0.27, 0.6, 0], [-0.3, 0.5, 0], [-0.31, 0.38, 0]], [0.012, 0.008], 8, 6));
  g.add(egg(dark, [-0.31, 0.35, 0], [0.016, 0.035, 0.016], 8));
  // the coat: chestnut patches in a thin net of cream, fading to cream on the lower legs
  const line = col(0xf0dcb0), pa = col(0xa8561c), pb = col(0x7a3812), c = new THREE.Color();
  paint(g, coat, (p) => {
    const [d1, d2, id] = cells(p, 0.068, s);
    c.copy(pa).lerp(pb, id).lerp(line, 1 - sstep(d2 - d1, 0.06, 0.14));
    return c.lerp(line, 1 - sstep(p.y, 0.12, 0.3));
  });
  return bake(g);
}

// a hominin, Australopithecus: upright on short legs, long arms, hairy, a jutting ape's face
function hominin(rng, stone) {
  const g = group();
  const hair = mat(0x5e3f2c), skin = mat(0x8e6c56), rock = mat(0x9a948a, { flat: true });
  const st = range(rng, 0.035, 0.06);
  for (const sd of [1, -1]) {
    const fx = sd * st;
    g.add(tube(hair, [[0, 0.43, sd * 0.055], [fx * 0.4 + 0.03, 0.23, sd * 0.058], [fx, 0.05, sd * 0.055]], [0.048, 0.036, 0.026], 4, 6));
    g.add(egg(skin, [fx + 0.025, 0.022, sd * 0.055], [0.055, 0.022, 0.032], 6));
  }
  g.add(egg(hair, [0.005, 0.585, 0], [0.095, 0.19, 0.105], 12, [0, 0, -0.14]));     // a funnel chest
  g.add(egg(hair, [0.04, 0.5, 0], [0.08, 0.09, 0.09], 8));                          // a round belly
  g.add(egg(hair, [0.035, 0.73, 0], [0.075, 0.06, 0.12], 8));                       // shoulders
  g.add(egg(hair, [0.075, 0.84, 0], [0.068, 0.07, 0.062], 10));                     // braincase
  g.add(egg(skin, [0.125, 0.81, 0], [0.05, 0.044, 0.044], 8));                      // the jutting face
  g.add(egg(skin, [0.115, 0.852, 0], [0.026, 0.014, 0.052], 6));                    // brow ridge
  for (const sd of [1, -1]) {
    const carry = stone && sd > 0;
    const pts = carry
      ? [[0.035, 0.74, 0.11], [0.07, 0.6, 0.13], [0.15, 0.56, 0.1]]
      : [[0.035, 0.74, sd * 0.11], [0.04 - sd * 0.02, 0.58, sd * 0.13], [0.07 - sd * 0.04, 0.43, sd * 0.125]];
    g.add(tube(hair, pts, [0.036, 0.029, 0.024], 4, 6));
    g.add(egg(skin, pts[2], 0.027, 6));
    if (carry) g.add(blob(rock, [0.18, 0.565, 0.1], [0.05, 0.04, 0.045], 7, 0.25, 2, 0));
  }
  return g;
}
// a small group of two adults and a youngster, one adult carrying a stone
function australopithecus(rng) {
  const g = group();
  const members = [[0.12, -0.12, 1, false], [-0.22, -0.02, 0.94, true], [0.1, 0.16, 0.7, false]];
  for (const [x, z, sc, stone] of members) {
    const h = hominin(rng, stone);
    h.position.set(x, 0, z);
    h.rotation.y = -0.4 + range(rng, -0.15, 0.15);
    h.scale.setScalar(sc);
    g.add(h);
  }
  return bake(g);
}

// a maned lion, walking
function lion(rng) {
  const g = group(), s = seedOf(rng);
  const coat = painted('lion'), maneM = painted('lion-mane'), nose = mat(0x3a2420), dark = mat(0x1e1410), tuft = mat(0x4a2614);
  const { body } = loft(coat, [[-0.42, 0.39, 0.66, 0.12], [-0.3, 0.36, 0.69, 0.15], [-0.12, 0.38, 0.65, 0.14], [0.08, 0.34, 0.66, 0.15],
    [0.24, 0.32, 0.7, 0.17], [0.36, 0.4, 0.72, 0.15], [0.44, 0.52, 0.76, 0.1]], { caps: [0.06, 0.04], rings: 30, radial: 28 });
  g.add(body);
  const legs = [[0.27, 0.085, 0.07, false], [0.27, -0.085, -0.05, false], [-0.31, 0.085, -0.06, true], [-0.31, -0.085, 0.05, true]];
  for (const [x, z, st, hind] of legs) {
    const pts = hind
      ? [[x, 0.52, z], [x + 0.08 + st * 0.3, 0.32, z], [x - 0.02 + st * 0.8, 0.14, z], [x + st, 0.04, z]]
      : [[x, 0.5, z], [x + st * 0.3, 0.28, z], [x + st, 0.05, z]];
    g.add(tube(coat, pts, hind ? [0.08, 0.06, 0.042, 0.04] : [0.072, 0.052, 0.044], 10, 10));
    g.add(egg(coat, [x + st + 0.025, 0.028, z], [0.055, 0.03, 0.045], 10));
  }
  // the mane: a shaggy ruff round the head and down the chest
  g.add(fuzz(maneM, [0.45, 0.7, 0], [0.19, 0.23, 0.21], [0, 0, -0.3], 24, 0.14, 3, s));
  g.add(fuzz(maneM, [0.36, 0.55, 0], [0.13, 0.17, 0.15], [0, 0, -0.4], 18, 0.12, 3, s + 1));
  g.add(egg(coat, [0.56, 0.72, 0], [0.11, 0.105, 0.1], 20));          // face
  g.add(egg(coat, [0.655, 0.675, 0], [0.07, 0.055, 0.065], 16));      // muzzle
  g.add(egg(nose, [0.718, 0.695, 0], [0.018, 0.016, 0.026], 8));
  g.add(egg(coat, [0.63, 0.625, 0], [0.05, 0.025, 0.045], 10));       // chin
  for (const sd of [1, -1]) {
    g.add(egg(coat, [0.52, 0.83, sd * 0.07], [0.03, 0.035, 0.018], 8));
    g.add(egg(dark, [0.635, 0.745, sd * 0.05], 0.011, 8));
  }
  g.add(tube(coat, [[-0.44, 0.6, 0], [-0.56, 0.52, 0], [-0.63, 0.36, 0], [-0.63, 0.24, 0], [-0.68, 0.19, 0]], [0.028, 0.02, 0.016], 14, 6));
  g.add(egg(tuft, [-0.69, 0.19, 0], [0.04, 0.03, 0.03], 10, [0, 0, 0.6]));
  const gold = col(0xd8a456), belly = col(0xedd2a0), back = col(0xb88238), c = new THREE.Color();
  paint(g, coat, (p, n) => c.copy(gold).lerp(back, sstep(n.y, 0.3, 1) * 0.5).lerp(belly, sstep(-n.y, 0.2, 0.9) * 0.8));
  const m1 = col(0xb06428), m2 = col(0x5a2810);
  paint(g, maneM, (p) => c.copy(m1).lerp(m2, sstep(0.6 - p.x, 0, 0.3) * 0.8 + noise(p.x * 30, p.y * 30, p.z * 30, s) * 0.3));
  return bake(g);
}

// ---------------------------------------------------------------------------------------------
// the last Ice Age, 20,000 years ago

// russet hair, darker below, combed into strands that match the body's grooves
function hairPaint(g, m, s, base, hi, lo) {
  const c = new THREE.Color(), B = col(base), H = col(hi), L = col(lo);
  paint(g, m, (p, n) => {
    const h = sstep(p.y, 0.04, 0.95), strand = noise(p.x * 16, p.y * 4, p.z * 16, s);
    c.copy(L).lerp(B, h).lerp(H, Math.max(0, n.y) * 0.55 * h);
    return c.multiplyScalar(0.72 + 0.56 * strand);
  });
}
// a long skirt of hair hanging from a lofted body, from x0 to x1, longest toward the front
function skirt(lock, at, x0, x1, n, len0, len1, rng) {
  for (let i = 0; i < n; i++) {
    for (const sd of [1, -1]) for (const inner of [1, 0.55]) {
      const x = lerp(x0, x1, (i + (inner < 1 ? 0.5 : 0)) / (n - 1)) + range(rng, -0.012, 0.012);
      const [cy, ry, w] = at(x), b = cy - ry;
      const len = lerp(len0, len1, sstep(x, x0, x1)) * range(rng, 0.7, 1.25);
      const top = cy - ry * range(rng, 0.3, 0.5), z = w * 0.78 * inner, out = range(rng, 0.02, 0.06);
      lock([x, top, sd * z], [x + range(rng, 0.01, 0.05), b - len * (inner < 1 ? 1.1 : 1), sd * (w * 0.86 * inner + out)], range(rng, 0.038, 0.05));
    }
  }
}

// a woolly mammoth: high domed head, shoulder hump, sloping back, long curling tusks, shaggy russet coat
function mammoth(rng) {
  const g = group(), s = seedOf(rng);
  const coat = painted('mammoth'), ivory = mat(0xdccfae), sole = mat(0x4a3e36), nail = mat(0xcfc2a8), eye = mat(0x140e0a);
  const { body, at: B } = loft(coat, [
    [-0.5, 0.46, 0.8, 0.2], [-0.42, 0.38, 0.845, 0.24], [-0.26, 0.35, 0.875, 0.265], [-0.06, 0.34, 0.91, 0.275],
    [0.12, 0.36, 0.975, 0.275], [0.26, 0.42, 0.935, 0.245], [0.35, 0.5, 0.885, 0.2], [0.43, 0.55, 0.99, 0.165],
    [0.5, 0.57, 1.02, 0.15], [0.57, 0.6, 0.93, 0.125], [0.62, 0.62, 0.8, 0.09]],
  { caps: [0.08, 0.04], rings: 44, radial: 36, shag: 0.014, s });
  g.add(body);
  g.add(tube(coat, [[0.58, 0.7, 0], [0.64, 0.56, 0], [0.655, 0.4, 0], [0.64, 0.24, 0], [0.66, 0.12, 0], [0.7, 0.075, 0], [0.75, 0.09, 0]],
    [0.075, 0.062, 0.05, 0.04, 0.034, 0.03, 0.026], 22, 10, [false, true]));
  for (const sd of [1, -1]) {
    g.add(tube(ivory, [[0.56, 0.64, sd * 0.07], [0.6, 0.48, sd * 0.11], [0.7, 0.36, sd * 0.17], [0.84, 0.33, sd * 0.22],
      [0.97, 0.42, sd * 0.22], [1.02, 0.56, sd * 0.15], [0.99, 0.66, sd * 0.07]], [0.036, 0.034, 0.03, 0.025, 0.018, 0.011, 0.004], 30, 10));
    g.add(egg(coat, [0.4, 0.84, sd * surf(B, 0.4, 0.84, 0.01)], [0.045, 0.06, 0.03], 12, [0, sd * 0.4, 0]));   // small ears
    g.add(egg(eye, [0.535, 0.84, sd * surf(B, 0.535, 0.84, 0.006)], 0.014, 8));
  }
  const lock = (a, b, r = 0.045) => g.add(spike(coat, a, b, r, 5));
  const legs = [[0.2, 0.13, 0.05], [0.2, -0.13, -0.04], [-0.32, 0.13, -0.05], [-0.32, -0.13, 0.04]];
  for (const [x, z, st] of legs) {
    g.add(leg(coat, [[x, 0.6, z], [x + st * 0.4, 0.34, z], [x + st, 0.06, z]], [0.115, 0.1, 0.092], 8, 12));
    g.add(at(cyl(0.096, 0.092, 0.06, sole, 14), x + st, 0.03, z));
    for (const a of [-0.7, 0, 0.7]) g.add(egg(nail, [x + st + 0.09 * Math.cos(a), 0.026, z + 0.09 * Math.sin(a)], [0.02, 0.02, 0.024], 8));
    for (let i = 0; i < 6; i++) {   // shaggy trousers
      const a = (i / 6) * TAU + 0.3, cx = Math.cos(a), cz = Math.sin(a);
      lock([x + st * 0.6 + cx * 0.08, 0.32, z + cz * 0.08], [x + st * 0.85 + cx * 0.12, 0.14, z + cz * 0.12], 0.04);
    }
  }
  skirt(lock, B, -0.46, 0.36, 28, 0.12, 0.24, rng);
  for (let i = 0; i < 10; i++) {      // a beard down the throat
    const x = lerp(0.36, 0.56, i / 9), [cy, ry, w] = B(x), z = range(rng, -0.6, 0.6) * w;
    lock([x, cy - ry * 0.5, z], [x + 0.02, cy - ry - 0.16 + range(rng, -0.03, 0.03), z * 1.2]);
  }
  g.add(tube(coat, [[-0.55, 0.72, 0], [-0.6, 0.62, 0], [-0.62, 0.52, 0]], [0.03, 0.02, 0.016], 8, 8));
  for (const dz of [-0.02, 0, 0.02]) lock([-0.62, 0.55, dz], [-0.64, 0.43, dz * 2], 0.025);
  hairPaint(g, coat, s, 0x7e3e22, 0xa86238, 0x4a2214);
  return bake(g);
}

// a woolly rhinoceros: long and low, head hung near the ground, two horns, a shaggy coat
function woollyRhino(rng) {
  const g = group(), s = seedOf(rng);
  const coat = painted('rhino'), horn = mat(0x3e3228), sole = mat(0x3a332c), eye = mat(0x16100c);
  const { body, at: B } = loft(coat, [
    [-0.5, 0.33, 0.66, 0.19], [-0.36, 0.27, 0.72, 0.235], [-0.12, 0.26, 0.72, 0.25], [0.1, 0.27, 0.77, 0.25],
    [0.24, 0.29, 0.8, 0.235], [0.38, 0.3, 0.72, 0.2], [0.5, 0.26, 0.58, 0.15], [0.62, 0.2, 0.47, 0.115],
    [0.72, 0.16, 0.38, 0.09], [0.8, 0.15, 0.3, 0.075]],
  { caps: [0.07, 0.05], rings: 44, radial: 34, shag: 0.013, s });
  g.add(body);
  // the horns: the front one long, flat and swept forward, the rear one short
  const f = tube(horn, [[0.77, 0.27, 0], [0.84, 0.36, 0], [0.9, 0.5, 0], [0.93, 0.66, 0]], [0.06, 0.042, 0.022, 0.004], 14, 10);
  f.scale.set(1, 1, 0.6);
  g.add(f);
  const r = tube(horn, [[0.65, 0.4, 0], [0.675, 0.47, 0], [0.69, 0.54, 0]], [0.042, 0.024, 0.004], 8, 8);
  r.scale.set(1, 1, 0.65);
  g.add(r);
  for (const sd of [1, -1]) {
    g.add(egg(coat, [0.5, 0.58, sd * surf(B, 0.5, 0.56, 0.02)], [0.025, 0.05, 0.016], 8, [0, 0, 0.4]));
    g.add(egg(eye, [0.665, 0.37, sd * surf(B, 0.665, 0.37, -0.004)], 0.015, 8));
  }
  const lock = (a, b, rr = 0.042) => g.add(spike(coat, a, b, rr, 5));
  const legs = [[0.26, 0.13, 0.05], [0.26, -0.13, -0.04], [-0.32, 0.13, -0.05], [-0.32, -0.13, 0.04]];
  for (const [x, z, st] of legs) {
    g.add(leg(coat, [[x, 0.45, z], [x + st * 0.4, 0.25, z], [x + st, 0.05, z]], [0.1, 0.085, 0.078], 8, 12));
    g.add(at(cyl(0.08, 0.078, 0.05, sole, 12), x + st, 0.025, z));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU, cx = Math.cos(a), cz = Math.sin(a);
      lock([x + st * 0.6 + cx * 0.07, 0.26, z + cz * 0.07], [x + st * 0.8 + cx * 0.1, 0.12, z + cz * 0.1], 0.032);
    }
  }
  skirt(lock, B, -0.46, 0.56, 26, 0.1, 0.17, rng);
  g.add(tube(coat, [[-0.55, 0.58, 0], [-0.6, 0.5, 0], [-0.61, 0.42, 0]], [0.025, 0.016], 6, 6));
  lock([-0.61, 0.45, 0], [-0.62, 0.36, 0], 0.025);
  hairPaint(g, coat, s, 0x7a5434, 0xb08452, 0x3e2818);
  return bake(g);
}

// a sabre-toothed cat, Smilodon: a heavy, short-tailed cat with long fangs, mouth open
function smilodon(rng) {
  const g = group(), s = seedOf(rng);
  const coat = painted('smilodon'), fang = mat(0xf2e8d4), nose = mat(0x3a2622), dark = mat(0x1c1410), mouth = mat(0x7a2a26);
  const { body } = loft(coat, [[-0.36, 0.38, 0.63, 0.12], [-0.24, 0.36, 0.66, 0.14], [-0.06, 0.36, 0.63, 0.14], [0.1, 0.33, 0.68, 0.16],
    [0.24, 0.31, 0.72, 0.18], [0.36, 0.42, 0.75, 0.15], [0.44, 0.56, 0.77, 0.1]], { caps: [0.06, 0.04], rings: 30, radial: 28 });
  g.add(body);
  const legs = [[0.22, 0.09, 0.06, false], [0.22, -0.09, -0.04, false], [-0.28, 0.085, -0.05, true], [-0.28, -0.085, 0.04, true]];
  for (const [x, z, st, hind] of legs) {
    const pts = hind
      ? [[x, 0.52, z], [x + 0.09 + st * 0.3, 0.32, z], [x - 0.01 + st * 0.8, 0.15, z], [x + st, 0.04, z]]
      : [[x, 0.52, z], [x + 0.02 + st * 0.3, 0.3, z], [x + st, 0.05, z]];
    g.add(tube(coat, pts, hind ? [0.085, 0.062, 0.044, 0.042] : [0.1, 0.075, 0.058], 10, 10));
    g.add(egg(coat, [x + st + 0.03, 0.032, z], [0.07, 0.034, 0.056], 10));
  }
  g.add(egg(coat, [0.51, 0.72, 0], [0.1, 0.09, 0.09], 20));            // head
  g.add(egg(coat, [0.61, 0.685, 0], [0.07, 0.05, 0.062], 16));         // upper jaw
  g.add(egg(nose, [0.675, 0.705, 0], [0.018, 0.015, 0.026], 8));
  g.add(egg(mouth, [0.6, 0.635, 0], [0.05, 0.03, 0.042], 12, [0, 0, -0.3]));
  g.add(egg(coat, [0.58, 0.6, 0], [0.06, 0.022, 0.045], 12, [0, 0, -0.55]));   // the dropped lower jaw
  for (const sd of [1, -1]) {
    const f = tube(fang, [[0.635, 0.665, sd * 0.05], [0.645, 0.6, sd * 0.052], [0.64, 0.53, sd * 0.05], [0.62, 0.46, sd * 0.047]],
      [0.021, 0.019, 0.013, 0.002], 12, 8);
    f.scale.set(1, 1, 0.6);
    g.add(f);
    g.add(egg(coat, [0.46, 0.8, sd * 0.06], [0.03, 0.033, 0.016], 8));
    g.add(egg(dark, [0.585, 0.75, sd * 0.06], 0.011, 8));
  }
  g.add(tube(coat, [[-0.4, 0.57, 0], [-0.47, 0.54, 0], [-0.5, 0.48, 0]], [0.036, 0.028, 0.02], 6, 8, [false, true]));
  const tawny = col(0xc68e4c), belly = col(0xeed6a6), back = col(0x9a6632), spot = col(0x8a5a2a), c = new THREE.Color();
  paint(g, coat, (p, n) => {
    c.copy(tawny).lerp(back, sstep(n.y, 0.4, 1) * 0.5);
    c.lerp(spot, sstep(noise(p.x * 18, p.y * 18, p.z * 18, s), 0.66, 0.74) * 0.18);
    return c.lerp(belly, sstep(-n.y, 0.2, 0.9) * 0.85);
  });
  return bake(g);
}

// the giant deer, Megaloceros: a big deer with a dark neck and shoulder hump, and vast palmate antlers
function megaloceros(rng) {
  const g = group();
  const coat = painted('deer'), head = mat(0x8e5a36), hoof = mat(0x2a2018), nose = mat(0x2a201c), antler = mat(0xd4bf94);
  const { body } = loft(coat, [[-0.28, 0.5, 0.72, 0.1], [-0.18, 0.48, 0.74, 0.12], [0, 0.47, 0.72, 0.12], [0.13, 0.45, 0.79, 0.13], [0.22, 0.5, 0.81, 0.11]],
    { caps: [0.06, 0.06], rings: 28, radial: 26 });
  g.add(body);
  const legs = [[0.17, 0.07, 0.05, false], [0.17, -0.07, -0.04, false], [-0.22, 0.07, -0.05, true], [-0.22, -0.07, 0.04, true]];
  for (const [x, z, st, hind] of legs) {
    const pts = hind
      ? [[x, 0.62, z], [x + 0.06 + st * 0.3, 0.42, z], [x - 0.03 + st * 0.8, 0.2, z], [x + st, 0.03, z]]
      : [[x, 0.58, z], [x + st * 0.4, 0.3, z], [x + st, 0.03, z]];
    g.add(tube(coat, pts, hind ? [0.065, 0.045, 0.022, 0.018] : [0.052, 0.026, 0.018], 12, 8));
    g.add(egg(hoof, [x + st + 0.008, 0.018, z], [0.022, 0.02, 0.018], 8));
  }
  g.add(tube(coat, [[0.17, 0.68, 0], [0.27, 0.79, 0], [0.34, 0.87, 0]], [0.1, 0.072, 0.055], 10, 14));   // the neck
  g.add(egg(coat, [0.26, 0.68, 0], [0.06, 0.07, 0.05], 10, [0, 0, -0.5]));                                // a dewlap
  g.add(egg(head, [0.39, 0.875, 0], [0.085, 0.048, 0.045], 18, [0, 0, -0.5]));
  g.add(egg(head, [0.455, 0.835, 0], [0.04, 0.035, 0.035], 12, [0, 0, -0.4]));
  g.add(egg(nose, [0.488, 0.822, 0], [0.012, 0.014, 0.02], 8));
  g.add(egg(coat, [-0.34, 0.68, 0], [0.03, 0.05, 0.025], 8, [0, 0, 0.5]));   // a short tail
  for (const sd of [1, -1]) {
    g.add(egg(head, [0.355, 0.91, sd * 0.05], [0.032, 0.012, 0.016], 8, [0, sd * 0.6, 0.5]));
    g.add(egg(hoof, [0.41, 0.885, sd * 0.038], 0.009, 6));
    // an antler: a beam out of the skull, a brow tine forward, a broad palm raised up and out, tines along its back
    const beam = [[0.36, 0.92, sd * 0.03], [0.355, 0.97, sd * 0.09], [0.34, 1.01, sd * 0.15]];
    g.add(tube(antler, beam, [0.022, 0.019, 0.021], 8, 8));
    g.add(spike(antler, [0.357, 0.955, sd * 0.075], [0.46, 1.0, sd * 0.13], 0.013, 6, false));
    const U = new THREE.Vector3(-0.2, 0.28, sd).normalize();
    const W = new THREE.Vector3(-0.9, 0.5, 0);
    W.addScaledVector(U, -W.dot(U)).normalize();
    const N = new THREE.Vector3().crossVectors(U, W);
    const palm = [[0, -0.02], [0.1, -0.05], [0.22, -0.07], [0.34, -0.06], [0.43, -0.03], [0.5, -0.07], [0.48, 0], [0.53, 0.05],
      [0.47, 0.08], [0.5, 0.15], [0.43, 0.13], [0.43, 0.21], [0.37, 0.16], [0.35, 0.24], [0.3, 0.17], [0.26, 0.23], [0.22, 0.15],
      [0.17, 0.19], [0.13, 0.11], [0.06, 0.06], [0, 0.03]];
    const pm = extrude(palm.map(([u, v]) => [u * 1.1, v * 1.1]), 0.016, antler, 0.007);
    pm.geometry.applyMatrix4(new THREE.Matrix4().makeBasis(U, W, N).setPosition(V3(beam[2])));
    g.add(pm);
  }
  const brown = col(0x9a643c), dark = col(0x553620), pale = col(0xe4d2ac), c = new THREE.Color();
  paint(g, coat, (p, n) => {
    c.copy(brown).lerp(dark, sstep(p.x, 0.04, 0.2) * sstep(p.y, 0.6, 0.72));
    c.lerp(pale, sstep(-n.y, 0.4, 0.9) * sstep(p.y, 0.4, 0.5));
    return c.lerp(pale, sstep(-p.x, 0.27, 0.33) * sstep(p.y, 0.5, 0.6));
  });
  return bake(g);
}

// one Ice Age hunter in furs, facing +x: holding a spear upright, throwing it, or carrying it low
function hunter(rng, furHex, trimHex, pose) {
  const g = group();
  const fur = mat(furHex), trim = mat(trimHex), skin = mat(C.skin), boot = mat(0x4a3424), legM = mat(0x5e4430);
  const wood = mat(0x8a6038), flint = mat(0x4e4a48, { flat: true });
  const st = range(rng, 0.03, 0.06);
  for (const sd of [1, -1]) {
    const fx = sd * st;
    g.add(tube(legM, [[0, 0.36, sd * 0.05], [fx * 0.5 + 0.015, 0.19, sd * 0.052], [fx, 0.05, sd * 0.05]], [0.042, 0.034, 0.03], 3, 6));
    g.add(egg(boot, [fx + 0.018, 0.03, sd * 0.05], [0.05, 0.032, 0.036], 8));
  }
  g.add(lathe([[0.085, 0.27], [0.105, 0.3], [0.092, 0.42], [0.1, 0.56], [0.075, 0.65], [0.03, 0.69]], fur, 10));   // the parka
  g.add(lathe([[0.1, 0.262], [0.116, 0.285], [0.103, 0.315]], trim, 10));                                          // its fur hem
  g.add(egg(fur, [-0.008, 0.755, 0], [0.068, 0.075, 0.068], 10));        // the hood
  g.add(egg(trim, [0.03, 0.75, 0], [0.025, 0.07, 0.068], 10));           // its fur ruff
  g.add(egg(skin, [0.045, 0.745, 0], [0.032, 0.045, 0.042], 8));        // the face
  const arm = (pts) => { g.add(tube(fur, pts, [0.034, 0.03, 0.027], 4, 6)); g.add(egg(boot, pts[2], 0.03, 6)); };
  const spear = (a, b) => {
    g.add(rod(wood, a, b, 0.009, 0.009, 5));
    const d = V3(b).sub(V3(a)).normalize();
    g.add(spike(flint, b, V3(b).addScaledVector(d, 0.085).toArray(), 0.02, 4, false));
  };
  if (pose === 'throw') {
    arm([[0, 0.64, 0.095], [-0.06, 0.74, 0.11], [-0.04, 0.86, 0.1]]);
    arm([[0, 0.63, -0.095], [0.08, 0.65, -0.11], [0.16, 0.7, -0.1]]);
    spear([-0.42, 0.78, 0.1], [0.46, 0.98, 0.1]);
  } else if (pose === 'carry') {
    arm([[0, 0.63, 0.095], [0.04, 0.52, 0.12], [0.1, 0.49, 0.11]]);
    arm([[0, 0.63, -0.095], [0.06, 0.56, -0.11], [0.16, 0.56, -0.08]]);
    spear([-0.3, 0.34, 0.1], [0.58, 0.68, 0.0]);
  } else {
    arm([[0, 0.63, 0.095], [0.03, 0.52, 0.12], [0.09, 0.47, 0.11]]);
    arm([[0, 0.63, -0.095], [-0.01, 0.5, -0.11], [0.01, 0.4, -0.1]]);
    spear([0.1, 0.0, 0.11], [0.12, 1.06, 0.11]);
  }
  return g;
}
// a party of four hunters in furs, with spears
function hunters(rng) {
  const g = group();
  const furs = [0x8a6240, 0x6e4e34, 0xa0603a, 0x9c7c5a], trims = [0xeadfc8, 0xd9c8a6];
  const spots = [[0.08, 0.14, 'throw'], [-0.32, -0.02, 'hold'], [0.34, -0.12, 'carry'], [-0.06, -0.3, 'hold']];
  spots.forEach(([x, z, pose], i) => {
    const h = hunter(rng, furs[i], trims[i % 2], pose);
    h.position.set(x, 0, z);
    h.rotation.y = -0.45 + range(rng, -0.2, 0.2);
    h.scale.setScalar(range(rng, 0.92, 1.05));
    g.add(h);
  });
  return bake(g);
}

// a teardrop flame, bent by the draught
function flame(m, h, r, bend, a) {
  const geo = new THREE.LatheGeometry([[0, 0], [0.7, 0.1], [1, 0.26], [0.7, 0.5], [0.3, 0.78], [0, 1]].map(([x, y]) => new THREE.Vector2(x * r, y * h)), 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / h;
    pos.setX(i, pos.getX(i) + Math.cos(a) * bend * y * y);
    pos.setZ(i, pos.getZ(i) + Math.sin(a) * bend * y * y);
  }
  const x = mesh(relax(geo), m);
  x.castShadow = false;
  return x;
}
// a campfire: a ring of stones, crossed logs, flames, embers and a little smoke
function campfire(rng) {
  const g = group(), s = seedOf(rng);
  const stone = mat(0x77726c, { flat: true }), log = mat(0x5e3c22), char = mat(0x2a1c16);
  const outer = glow(0xff5a14, 2), middle = glow(0xff9a2a, 2.4), core = glow(0xffe08a, 2.6), ember = glow(0xff4410, 1.8);
  const smoke = mat(0xa8a29c, { transparent: true, opacity: 0.42, depthWrite: false });
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + range(rng, -0.12, 0.12), rr = 0.37 + range(rng, -0.02, 0.02);
    g.add(blob(stone, [Math.cos(a) * rr, 0.035, Math.sin(a) * rr], [range(rng, 0.07, 0.09), range(rng, 0.05, 0.075), range(rng, 0.06, 0.08)], s + i, 0.2, 1.5, 0, [0, a, 0]));
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    g.add(rod(i % 2 ? log : char, [Math.cos(a) * 0.27, 0.03, Math.sin(a) * 0.27], [Math.cos(a) * 0.03, 0.24, Math.sin(a) * 0.03], 0.032, 0.022, 6));
  }
  const bed = at(cyl(0.22, 0.2, 0.03, ember, 14), 0, 0.015, 0);
  bed.castShadow = false;
  g.add(bed);
  for (let i = 0; i < 7; i++) {
    const a = range(rng, 0, TAU), rr = range(rng, 0.05, 0.17);
    const e = blob(ember, [Math.cos(a) * rr, 0.04, Math.sin(a) * rr], 0.03, s + 40 + i, 0.2, 2, 0);
    e.castShadow = false;
    g.add(e);
  }
  const tongues = [[0, 0, 0.52, 0.11, 0.08], [0.08, 0.03, 0.38, 0.08, 0.07], [-0.07, 0.05, 0.42, 0.08, 0.09], [0.03, -0.08, 0.34, 0.07, 0.06], [-0.06, -0.05, 0.3, 0.07, 0.07]];
  for (const [x, z, h, r, b] of tongues) {
    const a = range(rng, 0, TAU);
    g.add(at(flame(outer, h, r, b, a), x, 0.03, z));
    g.add(at(flame(middle, h * 0.7, r * 0.7, b * 0.7, a), x, 0.035, z));
    g.add(at(flame(core, h * 0.4, r * 0.45, b * 0.4, a), x, 0.04, z));
  }
  let x = 0.03, z = 0;
  for (let i = 0; i < 3; i++) {
    x += range(rng, 0.03, 0.06); z += range(rng, -0.03, 0.01);
    const p = blob(smoke, [x, 0.64 + i * 0.12, z], 0.05 + i * 0.018, s + 70 + i, 0.15, 1.5, 1);
    p.castShadow = false;
    g.add(p);
  }
  return bake(g);
}

// a hide tent on a ring of mammoth bones, with two tusks arched over its door
function hideTent(rng) {
  const g = group(), s = seedOf(rng);
  const hide = painted('hide'), bone = mat(0xe8dcc0), pole = mat(0x6a4a2e), doorM = mat(0x24170e), flap = mat(0xc49c6a);
  const tent = lathe([[0.44, 0], [0.4, 0.12], [0.31, 0.36], [0.19, 0.6], [0.07, 0.82], [0.0, 0.86]], hide, 14);
  tent.rotation.y = range(rng, 0, TAU);
  g.add(tent);
  const tones = [col(0xb48a58), col(0xa07648), col(0xc59d68), col(0x9a7044)], seams = col(0x6e4e30);
  paintFaces(g, hide, (p) => {
    const a = Math.atan2(p.z, p.x), panel = Math.floor(((a + Math.PI) / TAU) * 14 + 0.5);
    const t = tones[Math.floor(hash3(panel, Math.floor(p.y * 4), 0, s) * tones.length)];
    return p.y < 0.03 ? seams : t;
  });
  // the door, on the front, and its flap thrown back
  const door = extrude([[-0.11, 0], [0.11, 0], [0.085, 0.17], [0.035, 0.27], [-0.035, 0.27], [-0.085, 0.17]], 0.012, doorM);
  door.position.set(0, 0, 0.452);
  door.rotation.x = -0.36;
  g.add(door);
  const fl = extrude([[0, 0], [0.12, 0], [0.02, 0.27]], 0.012, flap);
  fl.position.set(0.1, 0, 0.44);
  fl.rotation.set(-0.36, 0.45, 0);
  g.add(fl);
  // tusks arched over the door
  for (const sd of [1, -1]) {
    g.add(tube(bone, [[sd * 0.2, 0, 0.49], [sd * 0.22, 0.17, 0.52], [sd * 0.15, 0.34, 0.5], [sd * 0.02, 0.42, 0.46]],
      [0.03, 0.026, 0.02, 0.012], 12, 7));
  }
  // jawbones weighing down the hem
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * TAU + Math.PI / 2 + 0.24;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.42) continue;
    const r = 0.45, x = Math.cos(a) * r, z = Math.sin(a) * r;
    g.add(egg(bone, [x, 0.035, z], [0.06, 0.04, 0.035], 7, [0, -a + range(rng, -0.3, 0.3), range(rng, -0.2, 0.2)]));
  }
  // the poles, crossed above the smoke hole
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    g.add(rod(pole, [Math.cos(a) * 0.05, 0.76, Math.sin(a) * 0.05], [-Math.cos(a) * 0.07, 1.0, -Math.sin(a) * 0.07], 0.011, 0.009, 5));
  }
  return bake(g);
}

// a conifer: stacked tiers with ragged rims, and a layer of snow on each if asked
function tierGeo(R, H, y0, seg, rot, out = 1, lift = 0, upper = false) {
  const prof = upper
    ? [[0.76 * R, y0 + 0.28 * H], [0.42 * R, y0 + 0.6 * H], [0.001, y0 + H]]
    : [[0.15 * R, y0 + 0.12 * H], [R, y0], [0.5 * R, y0 + 0.5 * H], [0.001, y0 + H]];
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * out, y + lift)), seg, rot);
  const pos = geo.attributes.position, np = prof.length;
  for (let i = 0; i <= seg; i++) {
    const k = i * np + (upper ? 0 : 1), even = i % 2 === 0;
    const sc = even ? 1.08 : 0.95;
    pos.setXYZ(k, pos.getX(k) * sc, pos.getY(k) - (even ? (upper ? 0.05 : 0.04) * H : 0), pos.getZ(k) * sc);
  }
  return relax(geo);
}
function conifer(rng, snow) {
  const g = group();
  const needles = mat(snow ? 0x24563c : pick(rng, [C.pine, 0x2f6a40, 0x285a34])), trunk = mat(0x5a3c26), cap = mat(0xccd6e0);
  const tiers = snow ? 3 : 4, seg = 12;
  g.add(at(cyl(0.05, 0.035, 0.3, trunk, 6), 0, 0.15, 0));
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1), R = lerp(0.36, 0.16, f) * range(rng, 0.92, 1.08), H = lerp(0.5, 0.38, f);
    const y0 = 0.16 + f * (snow ? 0.66 : 0.72);
    const rot = range(rng, 0, TAU);
    g.add(mesh(tierGeo(R, H, y0, seg, rot), needles));
    if (snow) g.add(mesh(tierGeo(R, H, y0, seg, rot, 1.07, 0.014, true), cap));
  }
  return bake(g);
}
function snowPine(rng) { return conifer(rng, true); }

// ---------------------------------------------------------------------------------------------
// the nature every era shares

function pine(rng) { return conifer(rng, false); }

// a round deciduous tree
function oak(rng) {
  const g = group(), s = seedOf(rng);
  const bark = mat(0x6a4a32), leaf = mat(pick(rng, [0x3f8a3a, 0x478f3c, 0x3a7f38])), top = mat(0x5ea24a);
  g.add(tube(bark, [[0, 0, 0], [0.015, 0.22, 0], [-0.01, 0.44, 0]], [0.075, 0.052, 0.04], 3, 6));
  g.add(tube(bark, [[0, 0.3, 0], [0.1, 0.42, 0.02], [0.18, 0.52, 0.04]], [0.035, 0.02], 2, 5));
  g.add(tube(bark, [[0, 0.28, 0], [-0.1, 0.4, -0.02], [-0.17, 0.5, -0.05]], [0.035, 0.02], 2, 5));
  g.add(blob(leaf, [0, 0.7, 0], 0.33, s));
  g.add(blob(leaf, [-0.21, 0.6, 0.06], 0.22, s + 1));
  g.add(blob(leaf, [0.22, 0.62, -0.04], 0.24, s + 2));
  g.add(blob(top, [0.03, 0.9, 0.06], 0.2, s + 3));
  return bake(g);
}

// a rounded shrub
function bush(rng) {
  const g = group(), s = seedOf(rng);
  const a = mat(pick(rng, [0x4c8a3c, 0x548f40, 0x467f38])), b = mat(0x62a04c);
  g.add(blob(a, [0, 0.21, 0], [0.26, 0.23, 0.24], s));
  g.add(blob(a, [-0.2, 0.14, 0.05], [0.17, 0.15, 0.16], s + 1));
  g.add(blob(b, [0.18, 0.15, -0.02], [0.18, 0.16, 0.17], s + 2));
  return bake(g);
}

// palm fronds: each folded into a shallow V along its midrib, its edge cut into leaflets swept to the tip
function frondGeo(list, f) {
  const P = [], K = [], S = new THREE.Vector3(), T = new THREE.Vector3(), side = new THREE.Vector3(), E = [];
  for (const { pts, w } of list) {
    const n = pts.length - 1;
    for (const sd of [1, -1]) {
      E.length = 0;
      for (let i = 0; i <= n; i++) {
        S.set(...pts[i]);
        T.set(...pts[Math.min(n, i + 1)]).sub(new THREE.Vector3(...pts[Math.max(0, i - 1)])).normalize();
        side.crossVectors(T, UP).normalize().multiplyScalar(sd);
        E.push(S.clone().addScaledVector(side, w[i]).addScaledVector(UP, -w[i] * 0.45).addScaledVector(T, w[i] * 0.45));
      }
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[i + 1], t0 = i / n, t1 = (i + 1) / n;
        P.push(...a, ...b, E[i + 1].x, E[i + 1].y, E[i + 1].z, ...a, E[i + 1].x, E[i + 1].y, E[i + 1].z, E[i].x, E[i].y, E[i].z);
        K.push(t0, t1, t1, t0, t1, t0);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const cs = new Float32Array(K.length * 3);
  K.forEach((t, i) => { const c = f(t); cs[3 * i] = c.r; cs[3 * i + 1] = c.g; cs[3 * i + 2] = c.b; });
  geo.setAttribute('color', new THREE.BufferAttribute(cs, 3));
  geo.computeVertexNormals();
  return geo;
}
// a palm with a curved, ringed trunk and arching fronds
function palm(rng) {
  const g = group();
  const bark = mat(0x8c6c48), frondM = painted('frond', { side: DS }), nut = mat(0x5a3a1e);
  const lean = range(rng, 0.16, 0.3), sw = range(rng, -0.06, 0.06);
  const top = [lean, 0.82, sw];
  const rings = [];
  for (let i = 0; i < 6; i++) rings.push(lerp(0.056, 0.038, i / 5), lerp(0.045, 0.031, i / 5));
  g.add(tube(bark, [[0, 0, 0], [lean * 0.12, 0.3, sw * 0.2], [lean * 0.48, 0.6, sw * 0.6], top], rings, 11, 5));
  const list = [];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + range(rng, -0.2, 0.2), L = range(rng, 0.42, 0.54), rise = range(rng, 0.08, 0.16);
    const pts = [], w = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7;
      pts.push([top[0] + Math.cos(a) * L * t, top[1] + 0.02 + rise * t * 2 - (rise * 2 + 0.26) * t * t, top[2] + Math.sin(a) * L * t]);
      w.push(i === 7 ? 0 : 0.085 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.06)) ** 0.6 * (i % 2 ? 0.55 : 1));
    }
    list.push({ pts, w });
  }
  const lo = col(0x2c742c), hi = col(0x80bc4c), c = new THREE.Color();
  g.add(mesh(frondGeo(list, (t) => c.copy(lo).lerp(hi, t)), frondM));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    g.add(egg(nut, [top[0] + Math.cos(a) * 0.04, top[1] - 0.03, top[2] + Math.sin(a) * 0.04], 0.03, 5));
  }
  return bake(g);
}

// a clump of reeds with a few bulrush heads
function reeds(rng) {
  const g = group(), list = [];
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = range(rng, 0, TAU), r0 = range(rng, 0, 0.08), out = range(rng, 0.05, 0.3), h = range(rng, 0.6, 1);
    const dx = Math.cos(a), dz = Math.sin(a), b = [dx * r0, 0, dz * r0];
    list.push({
      pts: [b, [b[0] + dx * out * 0.25, h * 0.45, b[2] + dz * out * 0.25], [b[0] + dx * out * 0.6, h * 0.8, b[2] + dz * out * 0.6], [b[0] + dx * out, h, b[2] + dz * out]],
      w: [0.04, 0.034, 0.022, 0], side: [-dz, 0, dx],
    });
  }
  const lo = col(0x3e6a2c), hi = col(0xb0c060), c = new THREE.Color();
  g.add(mesh(blades(list, (t) => c.copy(lo).lerp(hi, t * t)), painted('reed', { side: DS })));
  const stalk = mat(0x6a8a3a), head = mat(0x6a4024);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + range(rng, -0.4, 0.4), x = Math.cos(a) * 0.05, z = Math.sin(a) * 0.05, h = range(rng, 0.8, 1.05);
    const tx = x + range(rng, -0.04, 0.04), tz = z + range(rng, -0.04, 0.04);
    g.add(rod(stalk, [x, 0, z], [tx, h, tz], 0.008, 0.006, 4));
    g.add(rod(head, [lerp(x, tx, 0.78), h * 0.78, lerp(z, tz, 0.78)], [lerp(x, tx, 0.94), h * 0.94, lerp(z, tz, 0.94)], 0.026, 0.024, 6));
  }
  return bake(g);
}

// a rock, and a smaller one beside it
function boulder(rng) {
  const g = group(), s = seedOf(rng);
  const m = painted('stone', { flat: true });
  g.add(blob(m, [0, 0.2, 0], [0.42, 0.3, 0.36], s, 0.2, 1.3, 1, [0, range(rng, 0, TAU), 0]));
  g.add(blob(m, [0.38, 0.08, 0.16], [0.17, 0.13, 0.15], s + 1, 0.22, 1.5, 1, [0, range(rng, 0, TAU), 0]));
  const a = col(0x8e877c), b = col(0x6e675e), hi = col(0xa8a296), c = new THREE.Color();
  paintFaces(g, m, (p, n, i) => c.copy(a).lerp(b, hash3(i, 7, 0, s)).lerp(hi, Math.max(0, n.y) * 0.4));
  return bake(g);
}

// a puffy cumulus cloud with a flat, shaded base
function cloud(rng) {
  const g = group();
  const m = painted('cloud', { roughness: 1, emissive: 0x0c0d10 });
  const puffs = [[0, 0.24, 0, 0.58, 0.2, 0.36], [-0.3, 0.36, 0, 0.28], [0.05, 0.5, 0.02, 0.36], [0.36, 0.38, 0, 0.26],
    [-0.1, 0.4, 0.17, 0.25], [0.22, 0.3, 0.18, 0.2], [-0.52, 0.26, 0.04, 0.17], [0.56, 0.26, -0.02, 0.16], [0.12, 0.38, -0.18, 0.24]];
  for (const [x, y, z, rx, ry = rx, rz = rx] of puffs) {
    const j = range(rng, 0.88, 1.12);
    g.add(egg(m, [x * j, y * j, z], [rx * j, ry * j, rz * j], 18));
  }
  const top = col(0xd6dbe2), under = col(0x9eabbf), c = new THREE.Color();
  paint(g, m, (p) => c.copy(under).lerp(top, sstep(p.y, 0.1, 0.48)));
  const out = bake(g), geo = out.children[0].geometry, pos = geo.attributes.position, nor = geo.attributes.normal;
  const floor = 0.1;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < floor) { pos.setY(i, 0); nor.setXYZ(i, 0, -1, 0); } else pos.setY(i, pos.getY(i) - floor);
  }
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return out;
}

// a small V of birds, flying along +x, the rear ones a little higher
function bird(flap) {
  const P = [];
  const tri = (a, b, c) => P.push(...a, ...b, ...c);
  const nose = [0.05, 0, 0], tail = [-0.045, 0.004, 0], up = [0, 0.012, 0], dn = [0, -0.01, 0];
  for (const sd of [1, -1]) {
    const sz = [0, 0, sd * 0.013];
    tri(nose, up, sz); tri(nose, sz, dn); tri(tail, sz, up); tri(tail, dn, sz);
    const ey = 0.03 * flap, ty = ey - 0.012 + 0.02 * flap;
    const rf = [0.016, 0.002, sd * 0.01], rb = [-0.018, 0.002, sd * 0.01];
    const ef = [0.01, ey, sd * 0.065], eb = [-0.022, ey, sd * 0.06], tip = [-0.03, ty, sd * 0.13];
    tri(rf, ef, eb); tri(rf, eb, rb); tri(ef, tip, eb);
    tri([-0.04, 0.003, 0], [-0.07, 0.003, sd * 0.02], [-0.07, 0.003, 0]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.computeVertexNormals();
  return geo;
}
function birds(rng) {
  const g = group(), m = mat(0x2e2a30, { side: DS });
  const n = 7;
  for (let i = 0; i < n; i++) {
    const k = Math.ceil(i / 2), side = i === 0 ? 0 : i % 2 ? 1 : -1;
    const b = mesh(bird(range(rng, -0.6, 0.9)), m);
    b.position.set(-k * 0.17 + range(rng, -0.02, 0.02), k * 0.06 + range(rng, -0.015, 0.015), side * k * 0.15);
    b.rotation.set(range(rng, -0.15, 0.15), range(rng, -0.1, 0.1), range(rng, -0.08, 0.08));
    g.add(b);
  }
  const out = bake(g), geo = out.children[0].geometry;
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox.min.y, 0);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return out;
}

export const flat = [];
export default {
  acacia, savannaGrass, elephant, giraffe, australopithecus, lion,
  mammoth, woollyRhino, smilodon, megaloceros, hunters, campfire, hideTent, snowPine,
  pine, oak, bush, palm, reeds, boulder, cloud, birds,
};
