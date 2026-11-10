// The early Earth's props: the Hadean, the Archean, Snowball Earth, the Ediacaran and the Cambrian.
// Each is (rng) => THREE.Group standing on y = 0 with its front toward +z (see pie/README.md).
// Caricatures, not reconstructions: a toy volcano, a toy trilobite.
import { THREE, mat, glow, mesh, at, group, taper, lathe, C, range, mergeGeometries } from './kit.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------------------------
// helpers

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const col = (c) => (c && c.isColor ? c.clone() : new THREE.Color(c));
const mix = (a, b, t) => col(a).lerp(col(b), clamp(t));
// a colour a little lighter or darker, for faceted rock and ice
const vary = (c, rng, k = 0.2) => col(c).multiplyScalar(1 + (rng() - 0.5) * k);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// painted materials, coloured per vertex: smooth, or faceted
const VS = (o = {}) => mat(0xffffff, { vertexColors: true, ...o });
const VF = (o = {}) => mat(0xffffff, { vertexColors: true, flat: true, ...o });
// a flame or a glowing haze: lit from within, see-through
const fire = (c, k, opacity) => mat(c, { emissive: c, emissiveIntensity: k, transparent: true, opacity, depthWrite: false });
const unshadowed = (m) => { m.castShadow = false; m.receiveShadow = false; return m; };

// smooth noise, a sum of plane waves in random directions; about [-1, 1]
function noise3(rng, oct = 5, f = 1) {
  const t = [];
  let w = 0;
  for (let i = 0; i < oct; i++) {
    const d = V(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    const k = f * Math.pow(1.8, i) * (0.8 + 0.4 * rng()), a = Math.pow(0.55, i);
    w += a;
    t.push([d.x * k, d.y * k, d.z * k, rng() * TAU, a]);
  }
  return (x, y, z) => {
    let s = 0;
    for (const [a, b, c, p, m] of t) s += m * Math.sin(a * x + b * y + c * z + p);
    return (s / w) * 1.6;
  };
}

// triangles one by one, each with its own colour: faceted rock, ice, water
class Tris {
  constructor() { this.p = []; this.c = []; }
  // colour: a colour, or (centroid, normal) => colour; out: the way the face should look
  tri(a, b, c, color, out) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (out && nx * out[0] + ny * out[1] + nz * out[2] < 0) { [b, c] = [c, b]; nx = -nx; ny = -ny; nz = -nz; }
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    if (color != null) {
      let k = color;
      if (typeof color === 'function') {
        const l = Math.hypot(nx, ny, nz) || 1;
        k = color(V((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3), V(nx / l, ny / l, nz / l));
      }
      k = col(k);
      for (let i = 0; i < 3; i++) this.c.push(k.r, k.g, k.b);
    }
  }
  quad(a, b, c, d, color, out) { this.tri(a, b, c, color, out); this.tri(a, c, d, color, out); }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    if (this.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    return g;
  }
}

// a polar grid of points: ring i at nominal radius rs[i], n sectors; f(r, θ) → [x, y, z]
function polar(rs, n, f) {
  return rs.map((r) => (r === 0 ? [f(0, 0)] : Array.from({ length: n }, (_, j) => f(r, (j / n) * TAU))));
}
// its surface, as triangles facing `out`
function surface(T, P, color, out = [0, 1, 0]) {
  for (let i = 0; i + 1 < P.length; i++) {
    const A = P[i], B = P[i + 1], n = B.length;
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n;
      if (A.length === 1) T.tri(A[0], B[j], B[j1], color, out);
      else T.quad(A[j], B[j], B[j1], A[j1], color, out);
    }
  }
}
// a point on a polar grid's surface, between its vertices
function onGrid(P, rs, r, th) {
  let i = 0;
  while (i < rs.length - 2 && rs[i + 1] < r) i++;
  const t = clamp((r - rs[i]) / (rs[i + 1] - rs[i]));
  const n = P[P.length - 1].length, a = ((((th / TAU) * n) % n) + n) % n, j = Math.floor(a), f = a - j;
  const get = (ii, jj) => (P[ii].length === 1 ? P[ii][0] : P[ii][jj % n]);
  const l = (p, q, s) => [lerp(p[0], q[0], s), lerp(p[1], q[1], s), lerp(p[2], q[2], s)];
  return l(l(get(i, j), get(i, j + 1), f), l(get(i + 1, j), get(i + 1, j + 1), f), t);
}

// colour each triangle of a geometry by fn(centroid, normal)
function paint(g, fn) {
  if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position, cs = new Float32Array(p.count * 3);
  const a = V(), b = V(), c = V(), e = V();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const n = V().subVectors(b, a).cross(e.subVectors(c, a)).normalize();
    const k = col(fn(a.clone().add(b).add(c).divideScalar(3), n));
    for (let m = 0; m < 3; m++) cs.set([k.r, k.g, k.b], (i + m) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cs, 3));
  g.computeVertexNormals();
  return g;
}

// a part of a fused mesh: a geometry, coloured, moved, turned and scaled
const _o = new THREE.Object3D();
function piece(geo, color, pos = [0, 0, 0], r = [0, 0, 0], s = 1) {
  _o.position.set(...pos);
  if (r.isQuaternion) _o.quaternion.copy(r); else _o.rotation.set(...r);
  if (Array.isArray(s)) _o.scale.set(...s); else _o.scale.setScalar(s);
  _o.updateMatrix();
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(_o.matrix);
  if (color != null) tint(g, color);
  return g;
}
function tint(g, c) {
  const k = col(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([k.r, k.g, k.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const fuse = (parts, m) => mesh(mergeGeometries(parts), m);
// merge a group's meshes that share a material (and shadowing) into one, so a prop costs few draw calls
function compact(g) {
  for (const o of g.children) if (o.isGroup) compact(o);
  const sets = new Map();
  for (const o of g.children) {
    if (!o.isMesh || Array.isArray(o.material)) continue;
    const k = `${o.material.uuid}/${o.castShadow}/${o.renderOrder}`;
    if (!sets.has(k)) sets.set(k, []);
    sets.get(k).push(o);
  }
  for (const list of sets.values()) {
    if (list.length < 2) continue;
    const m = list[0].material, keep = m.vertexColors ? ['position', 'normal', 'color'] : ['position', 'normal'];
    const geos = list.map((o) => {
      o.updateMatrix();
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const a of Object.keys(geo.attributes)) if (!keep.includes(a)) geo.deleteAttribute(a);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      return geo.applyMatrix4(o.matrix);
    });
    const merged = mesh(mergeGeometries(geos), m);
    merged.castShadow = list[0].castShadow; merged.receiveShadow = list[0].receiveShadow; merged.renderOrder = list[0].renderOrder;
    for (const o of list) g.remove(o);
    g.add(merged);
  }
  return g;
}

// shared shapes, cloned into parts
const SPH = new THREE.SphereGeometry(1, 16, 10);
const SPH_S = new THREE.SphereGeometry(1, 10, 7);
const PUFF = new THREE.SphereGeometry(1, 10, 7);
const BEAD = new THREE.SphereGeometry(1, 8, 5);
const PUFF_S = new THREE.SphereGeometry(1, 8, 6);
const PUFF_XS = new THREE.SphereGeometry(1, 7, 5);
const FOAM = new THREE.SphereGeometry(1, 6, 3);
const CONE = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0);   // base at 0, tip at +y
const Y = V(0, 1, 0);
const toward = (d) => new THREE.Quaternion().setFromUnitVectors(Y, V(...d).normalize());
// a tapering tube's geometry
const tube = (pts, r0, r1, segs = 16, radial = 8) => taper(pts, r0, r1, mat(0xffffff), segs, radial).geometry;

// a lumpy rock
function rockGeo(rng, r, detail = 0, rough = 0.35) {
  const g = new THREE.IcosahedronGeometry(r, detail), nz = noise3(rng, 3, 1.3 / r), p = g.attributes.position, v = V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + rough * nz(v.x, v.y, v.z));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
function rock(rng, r, c, squash = 0.65, detail = 0) {
  const g = paint(rockGeo(rng, r, detail), () => vary(c, rng, 0.35));
  g.scale(1, squash, 1);
  return mesh(g, VF());
}

// a smooth sheet over a (u, v) grid; its faces turned toward out(p)
function sheet(nu, nv, f, paintF, out) {
  const pos = [], cs = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const p = f(i / nu, j / nv), k = col(paintF(i / nu, j / nv));
    pos.push(...p); cs.push(k.r, k.g, k.b);
  }
  const id = (i, j) => i * (nv + 1) + j;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) idx.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
  // turn the faces outward, judged at a triangle near the middle
  const i0 = nu >> 1, j0 = nv >> 1, P = (i, j) => V(...pos.slice(id(i, j) * 3, id(i, j) * 3 + 3));
  const a = P(i0, j0), b = P(i0 + 1, j0), c = P(i0 + 1, j0 + 1);
  const n = V().subVectors(b, a).cross(V().subVectors(c, a));
  if (n.dot(V(...out(a))) < 0) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// puffs of smoke or steam along a rising, leaning, widening column, fused into one mesh
function column(rng, { y0 = 0, h = 1, r0 = 0.05, r1 = 0.2, lean = 0.1, levels = 8, greys, geo = PUFF, per = [2, 4], x0 = 0, z0 = 0 }) {
  const parts = [];
  for (let k = 0; k < levels; k++) {
    const t = k / (levels - 1), y = y0 + h * Math.pow(t, 0.92), r = lerp(r0, r1, Math.pow(t, 1.15));
    const cx = x0 + lean * t * t, m = Math.round(lerp(per[0], per[1], t));
    const a0 = rng() * TAU;
    for (let i = 0; i < m; i++) {
      const a = a0 + (i * TAU) / m + rng() * 0.6, d = m === 1 ? 0 : r * range(rng, 0.35, 0.65), s = r * range(rng, 0.62, 0.92);
      const c = greys[Math.min(greys.length - 1, Math.floor(t * (greys.length - 0.01) + (rng() - 0.5) * 0.8 + 0.4))];
      parts.push(piece(geo, vary(c, rng, 0.1), [cx + d * Math.cos(a), y + range(rng, -0.25, 0.25) * r, z0 + d * Math.sin(a)], [0, rng() * TAU, 0], [s, s * 0.86, s]));
    }
  }
  return parts;
}

// Voronoi cells of sites inside a polygon (both [x, z])
function clipHalf(poly, nx, nz, d) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + nz * a[1] - d, db = nx * b[0] + nz * b[1] - d;
    if (da <= 0) out.push(a);
    if ((da < 0) !== (db < 0) && da !== db) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
function cells(sites, boundary) {
  return sites.map((s, i) => {
    let poly = boundary.slice();
    sites.forEach((o, j) => {
      if (j !== i) poly = clipHalf(poly, o[0] - s[0], o[1] - s[1], (o[0] * o[0] + o[1] * o[1] - s[0] * s[0] - s[1] * s[1]) / 2);
    });
    return poly;
  });
}
function inside([x, z], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
// a molten surface inside a polygon, under plates of dark crust with glowing seams
function crust(rng, boundary, count, y, o = {}) {
  const { gap = 0.013, thick = 0.016, top = 0x2c2523, open = 0, core = 0.45 } = o;
  const g = group();
  const shape = (pts) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))).rotateX(-Math.PI / 2);
  g.add(unshadowed(at(mesh(shape(boundary), glow(0xff6a1c, 2.4)), 0, y - 0.004, 0)));
  g.add(unshadowed(at(mesh(shape(boundary.map(([x, z]) => [x * core, z * core])), glow(0xffc25a, 2.6)), 0, y - 0.0025, 0)));
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of boundary) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const minD = Math.sqrt(((x1 - x0) * (z1 - z0)) / count) * 0.55, sites = [];
  for (let t = 0; t < 3000 && sites.length < count; t++) {
    const p = [range(rng, x0, x1), range(rng, z0, z1)];
    if (inside(p, boundary) && sites.every((s) => Math.hypot(s[0] - p[0], s[1] - p[1]) > minD)) sites.push(p);
  }
  const T = new Tris(), S = new Tris();
  for (const poly of cells(sites, boundary)) {
    if (poly.length < 3 || rng() < open) continue;
    let cx = 0, cz = 0;
    for (const [x, z] of poly) { cx += x; cz += z; }
    cx /= poly.length; cz /= poly.length;
    const q = poly.map(([x, z]) => { const dx = cx - x, dz = cz - z, d = Math.hypot(dx, dz) || 1, s = Math.min(gap, d * 0.4) / d; return [x + dx * s, z + dz * s]; });
    const tx = (rng() - 0.5) * 0.08, tz = (rng() - 0.5) * 0.08, h = y + thick * range(rng, 0.6, 1.1);
    const Yh = (x, z) => h + tx * (x - cx) + tz * (z - cz);
    const kc = vary(top, rng, 0.5), kr = mix(top, 0x6a2a18, 0.5);
    const cen = [cx, Yh(cx, cz) + thick * 0.35, cz];
    for (let m = 0; m < q.length; m++) {
      const a = q[m], b = q[(m + 1) % q.length];
      const A = [a[0], Yh(a[0], a[1]), a[1]], B = [b[0], Yh(b[0], b[1]), b[1]];
      // the plate's top, its edges a little redder
      const mA = [lerp(A[0], cen[0], 0.3), lerp(A[1], cen[1], 0.3), lerp(A[2], cen[2], 0.3)], mB = [lerp(B[0], cen[0], 0.3), lerp(B[1], cen[1], 0.3), lerp(B[2], cen[2], 0.3)];
      T.tri(cen, mA, mB, kc, [0, 1, 0]);
      T.quad(mA, A, B, mB, kr, [0, 1, 0]);
      S.quad(A, B, [B[0], y - 0.006, B[2]], [A[0], y - 0.006, A[2]], null, [(a[0] + b[0]) / 2 - cx, 0, (a[1] + b[1]) / 2 - cz]);
    }
  }
  g.add(mesh(T.geo(), VF()));
  g.add(unshadowed(mesh(S.geo(), glow(0xff5a18, 1.6))));
  return g;
}
// an outline, a wobbly ellipse: [x, z] points
function blob(rng, n, rx, rz, wob = 0.12) {
  const nz = noise3(rng, 3, 1.4);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU, k = 1 + wob * nz(Math.cos(a), 0, Math.sin(a));
    return [rx * k * Math.cos(a), rz * k * Math.sin(a)];
  });
}

// ---------------------------------------------------------------------------------------------
// the Hadean: fire and rock

function volcano(rng) {
  const g = group();
  const H = 1, R = 0.86, rim = 0.17, Rf = 0.11, floorY = H - 0.05;
  const nr = noise3(rng, 5, 1.2), nz = noise3(rng, 5, 4), nc = noise3(rng, 4, 3), gp = rng() * TAU;
  const rs = [0, 0.06, Rf, 0.145, rim, 0.2, 0.24, 0.29, 0.35, 0.42, 0.5, 0.58, 0.66, 0.73, 0.8, R];
  const n = 40;
  const P = polar(rs, n, (r, th) => {
    const cx = Math.cos(th), cz = Math.sin(th);
    const s = r > rim ? (r - rim) / (R - rim) : 0;   // 0 at the rim, 1 at the foot
    let y = r <= Rf ? floorY - 0.02 : r <= rim ? lerp(floorY - 0.02, H, sstep(Rf, rim, r)) : H * Math.pow(1 - s, 1.75);
    if (r >= rim) y += 0.03 * nr(cx * 2, 0, cz * 2) * (1 - s);
    y += 0.02 * nz(cx * r, y, cz * r) * sstep(0, 0.12, s) * (1 - s * 0.6);
    if (r >= R) y = 0;
    const gully = 0.026 * Math.sin(11 * th + gp + 2.5 * nr(cx, 1, cz)) * sstep(0, 0.3, s);
    const rr = r === 0 ? 0 : r * (1 + 0.09 * nr(cx * 1.3, 2, cz * 1.3) * s) + gully;
    return [rr * cx, y, rr * cz];
  });
  // lava spilling over the rim, mostly toward the viewer; one flow forks
  const flows = [];
  const spill = [[0.05, 0.034, 0.9], [0.75, 0.026, 0.55], [-0.7, 0.028, 0.7], [1.55, 0.02, 0.4], [-1.6, 0.022, 0.5], [2.9, 0.026, 0.6]];
  for (const [da, w, len0] of spill) {
    const a0 = Math.PI / 2 + da + (rng() - 0.5) * 0.2, len = len0 * range(rng, 0.85, 1.1), ph = rng() * TAU, pts = [];
    pts.push([0.6 * Rf * Math.cos(a0), floorY + 0.02, 0.6 * Rf * Math.sin(a0)]);
    const path = (u, a) => {
      const r = rim + 0.004 + u * len * (R - rim), p = onGrid(P, rs, r, a + 0.13 * Math.sin(ph + u * 6) * u);
      return [p[0] * (1 + 0.012 * u), p[1] + 0.012, p[2] * (1 + 0.012 * u)];
    };
    for (let k = 0; k <= 16; k++) pts.push(path(k / 16, a0));
    flows.push([pts, w]);
    if (da === 0.05) {   // a fork
      const fork = [];
      for (let k = 0; k <= 8; k++) { const u = 0.35 + (k / 8) * 0.4; fork.push(path(u, a0 + 0.3 * (u - 0.35))); }
      flows.push([fork, w * 0.7]);
    }
  }
  const fp = flows.flatMap(([p]) => p);
  const nearFlow = (c) => {
    let d = 9;
    for (const p of fp) d = Math.min(d, (c.x - p[0]) ** 2 + (c.y - p[1]) ** 2 + (c.z - p[2]) ** 2);
    return Math.sqrt(d);
  };
  const T = new Tris(), throat = new Tris();
  for (let i = 0; i + 1 < P.length; i++) {   // the crater's throat glows a dull red; the flanks are rock
    const A = P[i], B = P[i + 1];
    const dest = rs[i + 1] <= rim ? throat : T;
    surface(dest, [A, B], (c) => {
      const r = Math.hypot(c.x, c.z), t = c.y / H;
      if (r < rim * 0.98) return vary(mix(0xa8401a, 0x4a2a22, sstep(floorY - 0.03, H, c.y)), rng, 0.3);
      let k = t > 0.66 ? mix(0x3a3330, 0x262222, (t - 0.66) / 0.34) : t > 0.25 ? mix(0x5a4b41, 0x3a3330, (t - 0.25) / 0.41) : mix(0x76634f, 0x5a4b41, t / 0.25);
      if (nc(c.x * 2, c.y * 7, c.z * 2) > 0.45) k.lerp(col(0x8e7e6a), 0.5);   // bands of ash
      const d = nearFlow(c);
      if (d < 0.07) k.lerp(col(0x4e1c0e), 1 - d / 0.07);                      // scorched beside the lava
      if (t > 0.9) k.lerp(col(0x7a2c16), (t - 0.9) * 5);                       // the rim, lit from within
      return vary(k, rng, 0.3);
    });
  }
  g.add(mesh(T.geo(), VF()));
  g.add(mesh(throat.geo(), VF({ emissive: 0xff3a08, emissiveIntensity: 0.55 })));
  const lava = glow(C.lava, 2.8);
  for (const [pts, w] of flows) {
    g.add(taper(pts, w, w * 0.35, lava, 30, 6));
    g.add(at(mesh(new THREE.SphereGeometry(w * 0.45, 6, 4), lava), ...pts[pts.length - 1]));
  }
  // the crater's lake, domed up to the rim, and lava thrown up from it
  const dome = mesh(new THREE.SphereGeometry(1, 20, 6, 0, TAU, 0, Math.PI / 2), glow(0xff7a22, 3));
  dome.scale.set(Rf * 1.25, 0.05, Rf * 1.25);
  g.add(at(dome, 0, floorY - 0.012, 0));
  g.add(at(mesh(new THREE.CircleGeometry(Rf * 0.6, 14).rotateX(-Math.PI / 2), glow(0xffd27a, 3)), 0.01, floorY + 0.04, -0.01));
  for (let k = 0; k < 8; k++) {
    const a = rng() * TAU, d = range(rng, 0, 0.07);
    g.add(at(mesh(new THREE.OctahedronGeometry(range(rng, 0.012, 0.026)), glow(k % 2 ? 0xffb040 : 0xff7a22, 3)), d * Math.cos(a), H + range(rng, 0.0, 0.14), d * Math.sin(a)));
  }
  for (let k = 0; k < 7; k++) {
    const a = Math.PI / 2 + (rng() - 0.5) * 4, r = range(rng, 0.78, 0.92), s = range(rng, 0.03, 0.055);
    g.add(at(rock(rng, s, 0x51463f), r * Math.cos(a), s * 0.35, r * Math.sin(a)));
  }
  return g;
}

function shieldVolcano(rng) {
  const g = group();
  const H = 0.3, R = 1.3, Rc = 0.36, Rl = 0.3, lake = H - 0.04;
  const nr = noise3(rng, 4, 1.5), nz = noise3(rng, 5, 5), nc = noise3(rng, 4, 3);
  const rs = [0.26, Rl, 0.335, Rc, 0.41, 0.48, 0.57, 0.67, 0.78, 0.89, 1.0, 1.1, 1.2, R];
  const n = 48;
  const P = polar(rs, n, (r, th) => {
    const cx = Math.cos(th), cz = Math.sin(th);
    const s = r > Rc ? (r - Rc) / (R - Rc) : 0;
    let y = r <= Rl ? lake - 0.012 : r <= Rc ? lerp(lake - 0.012, H, sstep(Rl, Rc, r)) : H * Math.pow(1 - s * s, 1.25);
    y += 0.014 * nz(cx * r, 0, cz * r) * (r > Rl ? 1 : 0) * (1 - s * 0.5);
    if (r >= R) y = 0;
    const rr = r * (1 + 0.1 * nr(cx, 0, cz) * sstep(0.3, 1, s) + 0.02 * nr(cx * 3, 1, cz * 3) * s);
    return [rr * cx, Math.max(0, y), rr * cz];
  });
  // lava running down the flanks, a fork in one
  const flows = [];
  for (const da of [0.15, -0.75, 0.95, 2.2]) {
    const a0 = Math.PI / 2 + da + (rng() - 0.5) * 0.3, len = range(rng, 0.45, 0.85), ph = rng() * TAU, pts = [];
    for (let k = 0; k <= 16; k++) {
      const u = k / 16, r = Rl + 0.02 + u * len * (R - Rl);
      const p = onGrid(P, rs, r, a0 + 0.09 * Math.sin(ph + u * 6) * u);
      pts.push([p[0], p[1] + 0.012, p[2]]);
    }
    flows.push(pts);
    if (flows.length === 1) {
      const fork = [], a1 = a0 + 0.08;
      for (let k = 0; k <= 8; k++) {
        const u = 0.4 + (k / 8) * 0.4, r = Rl + 0.02 + u * len * (R - Rl);
        const p = onGrid(P, rs, r, a1 + 0.25 * (u - 0.4));
        fork.push([p[0], p[1] + 0.012, p[2]]);
      }
      flows.push(fork);
    }
  }
  // older, cooled flows: darker tongues on the flanks
  const old = Array.from({ length: 6 }, () => rng() * TAU);
  const fp = flows.flat();
  const nearFlow = (c) => { let d = 9; for (const p of fp) d = Math.min(d, (c.x - p[0]) ** 2 + (c.z - p[2]) ** 2); return Math.sqrt(d); };
  const T = new Tris();
  surface(T, P, (c) => {
    const r = Math.hypot(c.x, c.z), th = Math.atan2(c.z, c.x), t = c.y / H;
    if (r < Rc * 0.95 && c.y < H - 0.005) return vary(0x6a2a18, rng, 0.3);
    let k = mix(0x6e5c4c, 0x463c36, t);
    if (nc(c.x * 2, 0, c.z * 2) > 0.35) k.lerp(col(0x7a4a32), 0.5);   // rusty patches
    for (const a of old) {
      const d = Math.abs(((th - a + Math.PI * 3) % TAU) - Math.PI) * r;
      if (d < 0.05 + 0.03 * nr(c.x * 4, 2, c.z * 4) && r < 1.15) k.lerp(col(0x2a2422), 0.75);
    }
    const d = nearFlow(c);
    if (d < 0.07) k.lerp(col(0x4a1c10), 1 - d / 0.07);
    return vary(k, rng, 0.24);
  });
  g.add(mesh(T.geo(), VF()));
  const lava = glow(C.lava, 2.6);
  for (const pts of flows) g.add(taper(pts, 0.034, 0.012, lava, 24, 6));
  // the lava lake
  const edge = Array.from({ length: 28 }, (_, i) => { const p = onGrid(P, rs, Rl, (i / 28) * TAU); return [p[0] * 1.04, p[2] * 1.04]; });
  g.add(crust(rng, edge, 13, lake, { thick: 0.012, gap: 0.012, core: 0.5 }));
  // a spatter cone on the flank
  const sa = Math.PI / 2 - 1.5 + rng() * 0.4, sp = onGrid(P, rs, 0.75, sa);
  const sc = lathe([[0.1, 0], [0.075, 0.04], [0.04, 0.075], [0.028, 0.07], [0.02, 0.055]], VF(), 9);
  sc.geometry = paint(sc.geometry, () => vary(0x3a2e2a, rng, 0.4));
  g.add(at(sc, sp[0], sp[1] - 0.012, sp[2]));
  g.add(at(mesh(new THREE.CircleGeometry(0.026, 8).rotateX(-Math.PI / 2), glow(0xff8a2a, 3)), sp[0], sp[1] + 0.05, sp[2]));
  return g;
}

function lavaPool(rng) {
  const g = group();
  const no = noise3(rng, 4, 1.5), nz = noise3(rng, 4, 6);
  const k = (th) => 1 + 0.12 * no(Math.cos(th), 0, Math.sin(th));
  const Rin = 0.5, Rc = 0.62, Ro = 0.82, lev = 0.04, ex = 1.15;
  const rs = [Rin * 0.9, Rin, Rin + 0.04, Rc - 0.035, Rc, Rc + 0.05, 0.72, Ro];
  const n = 48;
  const P = polar(rs, n, (r, th) => {
    const cx = Math.cos(th) * ex, cz = Math.sin(th);
    let y = r <= Rin ? lev - 0.015 : r <= Rc ? lerp(lev - 0.004, 0.1, sstep(Rin, Rc, r)) : 0.1 * Math.pow((Ro - r) / (Ro - Rc), 1.4);
    if (r > Rin) y += 0.02 * nz(cx * r, 0, cz * r);
    if (r >= Ro) y = 0;
    const rr = r * k(th);
    return [rr * cx, Math.max(0, y), rr * cz];
  });
  const T = new Tris();
  surface(T, P, (c, nm) => {
    const r = Math.hypot(c.x / ex, c.z);
    const inward = nm.x * c.x + nm.z * c.z < 0;
    let kk;
    if (r < Rin * 1.12 && inward) kk = mix(0x7a2a14, 0x3a2622, (c.y - lev) / 0.05);   // the hot inner wall
    else if (c.y > 0.07) kk = col(0x4a423e);
    else kk = mix(0x2c2826, 0x3e3632, c.y / 0.07);
    return vary(kk, rng, 0.35);
  });
  g.add(mesh(T.geo(), VF()));
  const edge = Array.from({ length: 30 }, (_, i) => { const p = onGrid(P, rs, Rin, (i / 30) * TAU); return [p[0] * 1.02, p[2] * 1.02]; });
  g.add(crust(rng, edge, 17, lev, { thick: 0.016, gap: 0.016, open: 0.06 }));
  // glowing cracks in the crust around it
  const crack = glow(0xff5a18, 2.4);
  for (let c = 0; c < 10; c++) {
    let th = (c / 10) * TAU + rng() * 0.4, r = Rc - 0.01;
    const pts = [];
    while (r < Ro - 0.03) {
      const p = onGrid(P, rs, r, th);
      pts.push([p[0], p[1] + 0.005, p[2]]);
      th += (rng() - 0.5) * 0.22;
      r += range(rng, 0.035, 0.06);
    }
    if (pts.length > 2) g.add(unshadowed(taper(pts, 0.011, 0.004, crack, 10, 4)));
  }
  return g;
}

function impactor(rng) {
  const g = group();
  const dir = V(1, -0.78, 0).normalize(), R = 0.27;
  // the rock: dark and faceted, its leading face heated white, then orange, then red
  const rg = rockGeo(rng, R, 1, 0.3);   // an icosahedron: already one vertex per corner of each face
  const p = rg.attributes.position, hot = new Tris(), warm = new Tris(), cold = new Tris();
  const a = V(), b = V(), c = V(), e = V();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const nm = V().subVectors(b, a).cross(e.subVectors(c, a)).normalize(), d = nm.dot(dir);
    const tri = [a.toArray(), b.toArray(), c.toArray()];
    if (d > 0.86) hot.tri(...tri);
    else if (d > 0.62) warm.tri(...tri);
    else cold.tri(...tri, vary(d > 0.3 ? 0x8a3418 : pickRock(rng), rng, 0.3));
  }
  g.add(mesh(cold.geo(), VF()));
  g.add(mesh(hot.geo(), mat(0xffd27a, { emissive: 0xffc860, emissiveIntensity: 2.6, flatShading: true })));
  g.add(mesh(warm.geo(), mat(0xff7a2a, { emissive: 0xff5a14, emissiveIntensity: 1.6, flatShading: true })));
  // the trail, behind and above it: layers of flame, each a lathe along the way it came
  const back = dir.clone().negate(), q = new THREE.Quaternion().setFromUnitVectors(Y, back);
  const flame = (L, W, y0, m, wob, seed) => {
    const prof = [];
    for (let i = 0; i <= 4; i++) { const f = (i / 4) * (Math.PI / 2); prof.push(new THREE.Vector2(W * Math.sin(f) + 1e-4, y0 - W * 0.45 * Math.cos(f))); }
    for (let i = 1; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(W * Math.pow(1 - t, 0.85) * (1 + 0.12 * Math.sin(t * 9 + seed)) + 1e-4, y0 + t * L)); }
    const geo = new THREE.LatheGeometry(prof, 18), pp = geo.attributes.position, v = V();
    for (let i = 0; i < pp.count; i++) {
      v.fromBufferAttribute(pp, i);
      if (v.y > y0) {
        const an = Math.atan2(v.x, v.z), t = (v.y - y0) / L;
        const k = 1 + 0.3 * Math.sin(4 * an + v.y * 7 + seed) * t;
        v.x = v.x * k + wob * Math.sin(v.y * 5 + seed) * t * W;
        v.z *= k;
      }
      pp.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const fm = unshadowed(mesh(geo, m));
    fm.quaternion.copy(q);
    return fm;
  };
  g.add(flame(1.75, R * 1.12, 0.1, fire(0xff3a0c, 1.5, 0.5), 0.35, 1));
  g.add(flame(1.2, R * 0.92, 0.08, fire(0xff7a1c, 2.2, 0.85), 0.25, 2.5));
  g.add(flame(0.65, R * 0.72, 0.06, glow(0xffe08a, 3), 0.15, 4));
  // sparks thrown off it
  for (let k = 0; k < 12; k++) {
    const t = range(rng, 0.25, 1.2), w = R * 1.4 * (1.2 - t * 0.6);
    const pos = back.clone().multiplyScalar(t * 1.6).add(V(0, 0, 1).applyQuaternion(q).multiplyScalar(range(rng, -1, 1) * w)).add(V(1, 0, 0).applyQuaternion(q).multiplyScalar(range(rng, -1, 1) * w));
    const s = mesh(new THREE.OctahedronGeometry(range(rng, 0.012, 0.03) * (1.2 - t * 0.5)), glow(k % 3 ? 0xffa040 : 0xffe08a, 3));
    g.add(unshadowed(at(s, pos.x, pos.y, pos.z)));
  }
  return g;
}

const pickRock = (rng) => [0x3a3230, 0x4a403a, 0x524640, 0x2e2828][Math.floor(rng() * 4)];

function smokePlume(rng) {
  const g = group();
  const parts = column(rng, { y0: 0.06, h: 0.78, r0: 0.07, r1: 0.24, lean: range(rng, 0.1, 0.2) * (rng() < 0.5 ? -1 : 1), levels: 9, per: [2, 5], greys: [0x3e3a37, 0x524d49, 0x67615c, 0x7d7771, 0x948e87] });
  g.add(fuse(parts, VS({ roughness: 1 })));
  return g;
}

function steam(rng) {
  const g = group();
  const lean = range(rng, -0.08, 0.08), parts = [];
  // a little cloud rising and spreading: [x, y, z, r]
  const puffs = [[0, 0.05, 0, 0.05], [0.025, 0.14, 0.01, 0.07], [-0.035, 0.24, 0, 0.08], [0.05, 0.3, -0.02, 0.075], [0, 0.4, 0.02, 0.1], [-0.08, 0.45, -0.01, 0.075], [0.09, 0.47, 0, 0.07]];
  for (const [x, y, z, r] of puffs) {
    const s = r * range(rng, 0.85, 1.15);
    parts.push(piece(PUFF_XS, y < 0.2 ? 0xdfe2e5 : 0xf6f7f8, [x + lean * y * 2 + range(rng, -0.015, 0.015), y, z], [0, rng() * TAU, 0], [s, s * 0.85, s]));
  }
  g.add(fuse(parts, VS({ roughness: 1 })));
  return g;
}

function moon(rng) {
  let geo = new THREE.IcosahedronGeometry(1, 12);
  geo.deleteAttribute('uv'); geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  const unit = () => V(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
  const craters = [];
  const add = (m, a0, a1, d) => { for (let i = 0; i < m; i++) craters.push({ c: unit(), a: range(rng, a0, a1), d: d * range(rng, 0.8, 1.2) }); };
  // a few big ones toward the viewer, so they read
  for (const v of [[-0.38, 0.32, 0.87], [0.5, 0.08, 0.86], [-0.08, -0.32, 0.94]]) craters.push({ c: V(...v).normalize(), a: range(rng, 0.22, 0.3), d: 0.08 });
  add(3, 0.24, 0.34, 0.09); add(9, 0.11, 0.18, 0.07); add(22, 0.045, 0.09, 0.05);
  // one young crater with bright rays
  const young = { c: V(0.25, 0.55, 0.8).normalize(), a: 0.09, d: 0.08, young: true };
  craters.push(young);
  const e1 = V().crossVectors(young.c, V(0, 1, 0)).normalize(), e2 = V().crossVectors(young.c, e1);
  const nm = noise3(rng, 4, 1.5), ns = noise3(rng, 4, 9), nrays = noise3(rng, 2, 3);
  const p = geo.attributes.position, cs = new Float32Array(p.count * 3), v = V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let h = 0.004 * ns(v.x, v.y, v.z), light = 0;
    for (const k of craters) {
      const x = Math.acos(clamp(v.dot(k.c), -1, 1)) / k.a;
      // a bowl with a dark floor, a raised rim catching the light, and a fading apron of ejecta
      if (x < 1) { h += k.d * (x * x - 1) * 0.6 + k.d * 0.3 * Math.pow(x, 6); light += x < 0.8 ? -0.28 : 0.3 * (x - 0.8) / 0.2; }
      else if (x < 1.6) { const t = (x - 1) / 0.6; h += k.d * 0.3 * (1 - t) * (1 - t); light += 0.3 * (1 - t) * (1 - t); }
      if (k.young && x > 0.9 && x < 4.5) {
        const psi = Math.atan2(v.dot(e2), v.dot(e1));
        light += 0.6 * Math.pow(Math.max(0, Math.sin(6 * psi + 2 * nrays(v.x, v.y, v.z))), 6) * (1 - (x - 0.9) / 3.6);
      }
    }
    const mare = sstep(0.25, 0.5, nm(v.x, v.y, v.z));
    const k = mix(0xaaa59d, 0x6c6864, mare).multiplyScalar(clamp(1 + light + 0.03 * ns(v.z, v.x, v.y), 0.45, 1.5));
    cs.set([k.r, k.g, k.b], i * 3);
    v.multiplyScalar(0.5 * (1 + h));
    p.setXYZ(i, v.x, v.y + 0.5, v.z);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cs, 3));
  geo.computeVertexNormals();
  return group(mesh(geo, VS({ roughness: 0.95 })));
}

function crater(rng) {
  const g = group();
  const nr = noise3(rng, 4, 1.4), nz = noise3(rng, 5, 5), ph = rng() * TAU;
  const Rf = 0.38, Rc = 0.56, Ro = 1.05, peak = rng() < 0.75;
  const rs = [0, 0.06, 0.12, 0.19, 0.27, 0.34, Rf, 0.43, 0.48, 0.52, Rc, 0.61, 0.68, 0.77, 0.87, 0.96, Ro];
  const n = 48;
  const P = polar(rs, n, (r, th) => {
    const cx = Math.cos(th), cz = Math.sin(th);
    let y = r <= Rf ? 0.015 + (peak ? 0.07 * Math.exp(-((r / 0.085) ** 2)) : 0) : r <= Rc ? lerp(0.015, 0.17, Math.pow(sstep(Rf, Rc, r), 1.2)) : 0.17 * Math.pow((Ro - r) / (Ro - Rc), 2);
    y += 0.012 * nz(cx * r * 2, 0, cz * r * 2) + (r > Rf && r < Rc ? 0.01 * Math.sin(r * 90) : 0);
    if (r >= Ro) y = 0;
    const rr = r * (1 + 0.06 * nr(cx, 0, cz));
    return [rr * cx, Math.max(0, y), rr * cz];
  });
  const ray = (c, r) => Math.pow(Math.max(0, Math.sin(7 * Math.atan2(c.z, c.x) + ph + 1.5 * nr(c.x * 3, 1, c.z * 3))), 5) * sstep(Ro, Rc, r);
  const T = new Tris();
  surface(T, P, (c) => {
    const r = Math.hypot(c.x, c.z);
    let k;
    if (r < Rf * 0.98) k = c.y > 0.04 ? col(0x5e544e) : col(0x3a3330);
    else if (r < Rc * 0.97) k = mix(0x4a403b, 0x8d7f70, (r - Rf) / (Rc - Rf));
    else k = mix(0x9a8c7c, 0x5e544c, (r - Rc) / (Ro - Rc)).lerp(col(0xb8aa96), ray(c, r) * 0.7);
    return vary(k, rng, 0.2);
  });
  g.add(mesh(T.geo(), VF()));
  // a few cracks of impact melt still glowing in the floor
  const melt = glow(0xff6a1a, 1.8);
  for (let c = 0; c < 3; c++) {
    let th = rng() * TAU, r = range(rng, 0.12, 0.2);
    const pts = [];
    for (let k = 0; k < 4; k++) { const p = onGrid(P, rs, r, th); pts.push([p[0], p[1] + 0.004, p[2]]); th += (rng() - 0.5) * 0.6; r += 0.05; }
    g.add(unshadowed(taper(pts, 0.008, 0.003, melt, 8, 4)));
  }
  for (let k = 0; k < 11; k++) {
    const a = rng() * TAU, r = range(rng, 0.62, 1.0), s = range(rng, 0.018, 0.04), p = onGrid(P, rs, r, a);
    g.add(at(rock(rng, s, 0x6e6258), p[0], p[1] + s * 0.25, p[2]));
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// the Archean: islands, vents and microbes

function volcanicIsland(rng) {
  const g = group();
  const nr = noise3(rng, 4, 1.6), nz = noise3(rng, 5, 6), nc = noise3(rng, 4, 8);
  const shape = (th) => 1 + 0.16 * nr(Math.cos(th), 0, Math.sin(th));
  // the sea: shallow over the reef, deeper outside
  const ws = [0.38, 0.46, 0.56, 0.68, 0.82, 1.0];
  const W = polar(ws, 40, (r, th) => {
    const k = lerp(shape(th), 1 + 0.04 * nr(Math.cos(th) * 3, 2, Math.sin(th) * 3), sstep(0.5, 1, r));
    return [r * k * Math.cos(th), 0.014 + 0.004 * nz(Math.cos(th) * r * 3, 0, Math.sin(th) * r * 3), r * k * Math.sin(th)];
  });
  const T = new Tris();
  surface(T, W, (c) => {
    const r = Math.hypot(c.x, c.z);
    return vary(r < 0.52 ? 0x66d6c8 : r < 0.68 ? mix(0x4cbac4, 0x3a9cc0, (r - 0.52) / 0.16) : mix(0x3a9cc0, 0x2a6ea4, (r - 0.68) / 0.3), rng, 0.08);
  });
  g.add(mesh(T.geo(), VF({ roughness: 0.3 })));
  // a broken ring of surf
  const F = new Tris();
  for (let j = 0; j < 40; j++) {
    const a0 = (j / 40) * TAU, a1 = ((j + 1) / 40) * TAU;
    if (nc(Math.cos(a0) * 2, 0, Math.sin(a0) * 2) < -0.3) continue;
    const pt = (r, a) => [r * shape(a) * Math.cos(a), 0.02, r * shape(a) * Math.sin(a)];
    F.quad(pt(0.44, a0), pt(0.5, a0), pt(0.5, a1), pt(0.44, a1), 0xf4fbff, [0, 1, 0]);
  }
  g.add(mesh(F.geo(), VF({ roughness: 0.6 })));
  // the island: a black-sand shore, rocky shoulders, a steaming cone
  const rs = [0, 0.035, 0.07, 0.1, 0.14, 0.19, 0.25, 0.31, 0.37, 0.42, 0.46];
  const P = polar(rs, 36, (r, th) => {
    const cx = Math.cos(th), cz = Math.sin(th);
    let y = r <= 0.035 ? 0.33 : r <= 0.07 ? lerp(0.33, 0.42, sstep(0.035, 0.07, r)) : r <= 0.25 ? 0.12 + 0.3 * Math.pow((0.25 - r) / 0.18, 1.35) : r <= 0.37 ? lerp(0.12, 0.05, (r - 0.25) / 0.12) : lerp(0.05, -0.01, (r - 0.37) / 0.09);
    y += (r > 0.07 ? 0.025 : 0.008) * nz(cx * r * 2, 0, cz * r * 2) * (r > 0.2 ? 1.4 : 0.8);
    const k = shape(th), off = 0.05 * Math.max(0, 1 - r / 0.3);
    return [r * k * cx - off, Math.max(-0.01, y), r * k * cz - off * 0.5];
  });
  const I = new Tris();
  surface(I, P, (c) => {
    const r = Math.hypot(c.x + 0.05, c.z + 0.025);
    let k;
    if (r < 0.06 && c.y < 0.41) k = col(0x5a2a1e);
    else if (c.y > 0.13) {
      k = mix(0x4b403a, 0x3a3230, (c.y - 0.13) / 0.29);
      if (nc(c.x * 3, c.y * 3, c.z * 3) > 0.35 && c.y > 0.28) k = col(0xd8c24a);   // sulphur round the vent
      else if (nc(c.z * 2, c.y * 6, c.x * 2) > 0.4) k.lerp(col(0x7a3e28), 0.6);
    } else if (c.y > 0.035) k = mix(0x6f6050, 0x5a4c42, nz(c.x * 5, 1, c.z * 5) * 0.5 + 0.5);
    else k = rng() < 0.5 ? col(0x353130) : col(0x6a5c4a);
    return vary(k, rng, 0.25);
  });
  g.add(mesh(I.geo(), VF()));
  g.add(at(mesh(new THREE.CircleGeometry(0.04, 10).rotateX(-Math.PI / 2), glow(0xff7a2a, 1.8)), -0.05, 0.345, -0.025));
  // steam from the vent, and a fumarole on the shoulder
  const st = column(rng, { y0: 0.45, h: 0.38, r0: 0.045, r1: 0.1, lean: 0.1, levels: 5, per: [1, 3], greys: [0xe8eaec, 0xf6f7f8], geo: PUFF_S, x0: -0.05, z0: -0.025 });
  st.push(...column(rng, { y0: 0.14, h: 0.12, r0: 0.025, r1: 0.04, lean: 0.03, levels: 3, per: [1, 1], greys: [0xeef0f2], geo: PUFF_S, x0: 0.16, z0: 0.12 }));
  g.add(fuse(st, VS({ roughness: 1 })));
  // sea stacks
  for (let k = 0; k < 2; k++) {
    const a = Math.PI / 2 + (k ? 0.9 : -1.1) + rng() * 0.3, r = range(rng, 0.58, 0.66), s = range(rng, 0.035, 0.05);
    g.add(at(rock(rng, s, 0x4a403a, 1.2), r * Math.cos(a), s * 0.6, r * Math.sin(a)));
  }
  return g;
}

function blackSmoker(rng) {
  const g = group();
  const nz = noise3(rng, 4, 4), nc = noise3(rng, 3, 2.2), nm = noise3(rng, 3, 3);
  // the mound it stands on, with a few pale mats of microbes
  const rs = [0, 0.08, 0.16, 0.24, 0.32, 0.4, 0.48];
  const hm = (r) => 0.12 * Math.pow(Math.max(0, 1 - (r / 0.48) ** 2), 0.9);
  const M = polar(rs, 30, (r, th) => {
    const cx = Math.cos(th), cz = Math.sin(th), rr = r * (1 + 0.1 * nz(cx, 0, cz));
    return [rr * cx, r >= 0.48 ? 0 : hm(r) + 0.02 * nz(cx * r * 3, 1, cz * r * 3), rr * cz];
  });
  const T = new Tris();
  surface(T, M, (c) => {
    const k = nm(c.x * 2, 0, c.z * 2);
    return vary(k > 0.9 ? 0xe2ddd0 : k < -0.6 ? 0x7a4426 : 0x3e3530, rng, 0.25);
  });
  // chimneys: lumpy stacks of dark sulphide with rust and a little sulphur, sooty at the mouth
  const S = new Tris(), mouths = [];
  const chimney = (x0, z0, y0, H, R0, R1, lean) => {
    const n = 11, K = Math.max(6, Math.round(H / 0.045)), rings = [];
    for (let k = 0; k <= K; k++) {
      const t = k / K, y = y0 + t * H;
      const r = lerp(R0, R1, Math.pow(t, 0.8)) + 0.025 * Math.pow(Math.max(0, Math.sin(t * 15 + x0 * 9)), 8);
      const ax = x0 + lean * t * t * H, ring = [];
      for (let j = 0; j < n; j++) {
        const th = (j / n) * TAU, rr = r * (1 + 0.22 * nz(Math.cos(th) * 1.5 + x0 * 7, y * 7, Math.sin(th) * 1.5 + z0 * 7));
        ring.push([ax + rr * Math.cos(th), y, z0 + rr * Math.sin(th)]);
      }
      rings.push({ ring, ax, y, r });
    }
    const top = y0 + H;
    const cfn = (c) => {
      const k = nc(c.x * 3, c.y * 3, c.z * 3);
      let kk = k > 1.0 ? 0xb08a3a : k > 0.5 ? 0x7e4424 : k < -0.8 && c.y < top - 0.25 ? 0xb3aa98 : 0x352c28;
      if (c.y > top - 0.07) kk = 0x1e1b1a;
      return vary(kk, rng, 0.3);
    };
    for (let k = 0; k < K; k++) {
      const A = rings[k], B = rings[k + 1];
      for (let j = 0; j < n; j++) {
        const j1 = (j + 1) % n, a = A.ring[j], b = B.ring[j], c = B.ring[j1], d = A.ring[j1];
        S.quad(a, b, c, d, cfn, [(a[0] + c[0]) / 2 - A.ax, 0, (a[2] + c[2]) / 2 - z0]);
      }
    }
    // the mouth: a lip and a throat
    const lip = rings[K];
    const inner = lip.ring.map(([x, y, z]) => [lerp(lip.ax, x, 0.6), y - 0.015, lerp(z0, z, 0.6)]);
    for (let j = 0; j < n; j++) { const j1 = (j + 1) % n; S.quad(lip.ring[j], lip.ring[j1], inner[j1], inner[j], 0x2a2624, [0, 1, 0]); }
    mouths.push({ x: lip.ax, y: lip.y, z: z0, r: lip.r });
  };
  chimney(0, 0, 0.06, 0.72, 0.15, 0.065, 0.08);
  chimney(0.22, -0.08, 0.05, 0.36, 0.095, 0.05, -0.12);
  chimney(-0.2, 0.06, 0.05, 0.22, 0.085, 0.045, 0.1);
  g.add(mesh(T.geo(), VF()));
  g.add(mesh(S.geo(), VF()));
  // a red glow in each mouth, and black smoke pouring up
  const smoke = [];
  mouths.forEach((m, i) => {
    g.add(unshadowed(at(mesh(new THREE.CircleGeometry(m.r * 0.6, 10).rotateX(-Math.PI / 2), glow(0xff5a1a, 2.4)), m.x, m.y - 0.012, m.z)));
    const h = [0.62, 0.32, 0.22][i];
    smoke.push(...column(rng, { y0: m.y + 0.04, h, r0: m.r * 0.9, r1: m.r * 0.9 + h * 0.28, lean: 0.12 * h, levels: Math.round(4 + h * 9), per: [1, 3], greys: [0x161414, 0x221f1f, 0x2e2a2a, 0x3c3838], x0: m.x, z0: m.z, geo: PUFF_S }));
  });
  g.add(fuse(smoke, VS({ roughness: 1 })));
  // pale tube worms crowding its foot, toward the viewer
  const worms = [];
  for (let k = 0; k < 12; k++) {
    const a = Math.PI / 2 + range(rng, -1.1, 1.1), r = range(rng, 0.17, 0.3), x = r * Math.cos(a), z = r * Math.sin(a);
    const y = hm(r) - 0.01, h = range(rng, 0.08, 0.17), lx = range(rng, -0.02, 0.02), lz = range(rng, 0.0, 0.03);
    worms.push(piece(tube([[x, y, z], [x + lx * 0.4, y + h * 0.6, z + lz * 0.4], [x + lx, y + h, z + lz]], 0.015, 0.013, 6, 6), 0xf0ebe0));
    worms.push(piece(SPH_S, k % 3 ? 0xe2706a : 0xf2b0a8, [x + lx, y + h + 0.014, z + lz], [0, 0, 0], [0.019, 0.026, 0.019]));
  }
  g.add(fuse(worms, VS({ roughness: 0.6 })));
  return g;
}

function stromatolite(rng) {
  const g = group();
  // the domes, layer on layer of microbial mat and trapped sand, crowded in shallow water
  const domes = [], m = 4 + Math.floor(rng() * 4);
  for (let t = 0; t < 900 && domes.length < m; t++) {
    const shrink = t > 300 ? 0.7 : 1;   // squeeze in smaller ones if the big ones crowd them out
    const r = domes.length === 0 ? range(rng, 0.16, 0.19) : range(rng, 0.08, 0.15) * shrink;
    const a = rng() * TAU, d = domes.length === 0 ? range(rng, 0, 0.05) : range(rng, 0.12, 0.46 - r * 0.5);
    const x = d * Math.cos(a), z = d * Math.sin(a) * 0.8;
    if (domes.every((o) => Math.hypot(o.x - x, o.z - z) > (o.r + r) * 1.02)) domes.push({ x, z, r });
  }
  // the water and the sand under it hug the cluster
  const out = blob(rng, 22, 0.62, 0.5, 0.1);
  const S = new Tris(), Wt = new Tris();
  for (let j = 0; j < out.length; j++) {
    const p = out[j], q = out[(j + 1) % out.length];
    S.tri([0, 0.004, 0], [p[0] * 1.06, 0.004, p[1] * 1.06], [q[0] * 1.06, 0.004, q[1] * 1.06], vary(0xd8c290, rng, 0.1), [0, 1, 0]);
    Wt.tri([0, 0.055, 0], [p[0], 0.055, p[1]], [q[0], 0.055, q[1]], 0xffffff, [0, 1, 0]);
  }
  g.add(mesh(S.geo(), VF()));
  g.add(unshadowed(mesh(Wt.geo(), mat(0x46bcc4, { transparent: true, opacity: 0.55, roughness: 0.15, depthWrite: false }))));
  const bands = [0xd8bf8e, 0xb08a62, 0xe4d2a8, 0x9e7c58, 0xcaa878];
  for (const { x, z, r } of domes) {
    const h = r * range(rng, 1.8, 2.8), L = Math.max(5, Math.round(h / 0.028)), shift = Math.floor(rng() * bands.length);
    const env = (t) => (t < 0.62 ? r * (0.74 + 0.28 * Math.sin(Math.PI * (t / 0.62) * 0.5)) : r * 1.02 * Math.sqrt(Math.max(0, 1 - ((t - 0.62) / 0.39) ** 2)));
    const pts = [[r * 0.8, 0]], cs = [bands[shift % bands.length]];
    for (let k = 0; k < L; k++) {
      const t0 = k / L, t1 = (k + 1) / L;
      if (t1 > 0.97) break;
      pts.push([env(t0 + 0.4 / L) * 1.014, h * (t0 + 0.4 / L)], [env(t1) * 0.996, h * t1]);
      const c = bands[(k + shift) % bands.length];
      cs.push(c, c);
    }
    pts.push([r * 0.3, h * 0.995], [0.0001, h]);
    cs.push(0x5e6a34, 0x56622e);
    // the living mat on top: dark olive, fading into the layers below
    for (let i = Math.max(1, cs.length - 6); i < cs.length - 2; i++) cs[i] = mix(cs[i], 0x66703a, (i - (cs.length - 6)) / 4);
    const d = lathe(pts, VS({ roughness: 0.9 }), 18);
    const geo = d.geometry, np = pts.length, cc = new Float32Array(geo.attributes.position.count * 3);
    const nz = noise3(rng, 3, 9 / r), p = geo.attributes.position, v = V();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 1 + 0.06 * nz(v.x, v.y, v.z);
      p.setXYZ(i, v.x * k, v.y, v.z * k);
      const kc = vary(cs[i % np], rng, 0.05);
      cc.set([kc.r, kc.g, kc.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    geo.computeVertexNormals();
    g.add(at(d, x, 0, z));
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Snowball Earth: ice

function iceberg(rng) {
  const g = group();
  const T = new Tris();
  const tabular = rng() < 0.5, m = tabular ? 10 : 13;
  // an outline with its points in and out a little, so the cliffs are faceted
  const out = blob(rng, m, tabular ? 0.58 : 0.48, tabular ? 0.42 : 0.4, 0.16).map(([x, z], i) => { const k = i % 2 ? (tabular ? 0.9 : 0.94) : (tabular ? 1.07 : 1.03); return [x * k, z * k]; });
  // rings of the outline up the berg: [height, scale, dx, dz]
  const rings = tabular
    ? [[0, 1.04], [0.05, 1.06], [0.11, 1.0], [0.24, 1.0], [0.37, 0.98], [0.41, 0.95]]
    : [[0, 1.04], [0.05, 1.05], [0.14, 0.94, 0.02, 0], [0.32, 0.74, 0.06, 0.02], [0.52, 0.5, 0.1, 0.03], [0.7, 0.27, 0.12, 0.04]];
  const nz = noise3(rng, 3, 5);
  const R = rings.map(([y, s, dx = 0, dz = 0], i) => out.map(([x, z]) => {
    const j = i < 2 ? 0 : 0.05 * nz(x * 3, y * 3, z * 3);
    return [x * (s + j) + dx, tabular ? y * (1 - 0.22 * (x + 0.6)) : y, z * (s + j) + dz];
  }));
  const top = rings[rings.length - 1][0];
  const wall = tabular ? [0xa8d2ee, 0x7fb8e2, 0xc4e2f4, 0x6aa8da, 0x98c8ea] : [0xbcdcef, 0x9ccbea, 0xd2e8f5, 0x86bde4, 0xaed6ee];
  const cfn = (c, nm) => {
    if (nm.y > 0.7) return vary(C.snow, rng, 0.04);
    if (c.y < 0.055) return vary(0x5aa6d0, rng, 0.08);   // the wave-cut notch at the waterline
    const t = c.y / top, a = Math.atan2(c.z, c.x);
    let k = col(wall[Math.floor(((a + Math.PI) / TAU) * m + 0.5) % wall.length]);
    k.lerp(col(0x6aaad8), (1 - t) * 0.45);
    if (t > 0.85) k.lerp(col(0xe8f3fa), 0.6);
    return vary(k, rng, 0.06);
  };
  for (let i = 0; i + 1 < R.length; i++) {
    for (let j = 0; j < m; j++) {
      const j1 = (j + 1) % m, a = R[i][j], b = R[i + 1][j], c = R[i + 1][j1], d = R[i][j1];
      T.quad(a, b, c, d, cfn, [(a[0] + c[0]) / 2 - (rings[i][2] || 0), 0, (a[2] + c[2]) / 2 - (rings[i][3] || 0)]);
    }
  }
  // the top: nearly flat on a tabular berg, a point on a pinnacle
  const last = R[R.length - 1];
  let cx = 0, cz = 0;
  for (const [x, , z] of last) { cx += x; cz += z; }
  const apex = [cx / m + (tabular ? 0.05 : 0.02), tabular ? last.reduce((s, p) => s + p[1], 0) / m + 0.01 : top + 0.16, cz / m];
  for (let j = 0; j < m; j++) T.tri(apex, last[j], last[(j + 1) % m], cfn, [0, 1, 0]);
  if (!tabular) {   // a second, smaller spire
    const b = out.map(([x, z]) => [x * 0.42 - 0.22, z * 0.42 + 0.08]), h2 = range(rng, 0.34, 0.44);
    const apex2 = [-0.25, h2 + 0.1, 0.09];
    for (let j = 0; j < m; j++) {
      const p = b[j], q = b[(j + 1) % m], P2 = [p[0] * 0.75 - 0.06, h2, p[1] * 0.75 + 0.02], Q2 = [q[0] * 0.75 - 0.06, h2, q[1] * 0.75 + 0.02];
      T.quad([p[0], 0, p[1]], P2, Q2, [q[0], 0, q[1]], cfn, [p[0] + 0.22, 0, p[1] - 0.08]);
      T.tri(apex2, P2, Q2, cfn, [0, 1, 0]);
    }
  }
  // ice under the water, seen through it
  const S = new Tris();
  for (let j = 0; j < m; j++) {
    const p = out[j], q = out[(j + 1) % m];
    S.tri([0, 0.006, 0], [p[0] * 1.25, 0.006, p[1] * 1.25], [q[0] * 1.25, 0.006, q[1] * 1.25], 0x86d4e0, [0, 1, 0]);
  }
  g.add(mesh(T.geo(), VF({ roughness: 0.35 })));
  g.add(mesh(S.geo(), VF({ roughness: 0.3 })));
  return g;
}

function iceRidge(rng) {
  const g = group();
  const nx = 22, nzc = 9, W = 0.34;
  const nz = noise3(rng, 4, 3), nj = noise3(rng, 4, 11);
  const peaks = Array.from({ length: 6 }, (_, i) => ({ x: -0.8 + (i / 5) * 1.6 + range(rng, -0.12, 0.12), h: range(rng, 0.35, 0.8), w: range(rng, 0.14, 0.3) }));
  peaks[2 + Math.floor(rng() * 2)].h = 0.9;
  const crest = (x) => {
    let c = 0.18;
    for (const p of peaks) c = Math.max(c, p.h * (1 - Math.abs(x - p.x) / p.w));
    return c * sstep(-1, -0.72, x) * sstep(1, 0.72, x);
  };
  const P = [];
  for (let i = 0; i <= nx; i++) {
    const x = -1 + (2 * i) / nx, c = crest(x), zc = 0.05 * Math.sin(3 * x + 1), row = [];
    for (let j = 0; j <= nzc; j++) {
      const zn = -1 + (2 * j) / nzc, edge = i === 0 || i === nx || j === 0 || j === nzc;
      const z = zc * (1 - zn * zn) + zn * W * (1 + 0.15 * nz(x * 2, 0, zn));
      let y = c * (1 - Math.pow(Math.abs(zn), 1.25));
      if (!edge) y = Math.max(0, y + 0.035 * nj(x, y, z));
      else y = 0;
      row.push([x + (edge ? 0 : 0.012 * nj(z, x, 1)), y, z]);
    }
    P.push(row);
  }
  const T = new Tris();
  for (let i = 0; i < nx; i++) for (let j = 0; j < nzc; j++) {
    T.quad(P[i][j], P[i + 1][j], P[i + 1][j + 1], P[i][j + 1], (c, nm) => {
      const cr = crest(c.x);
      if (nm.y > 0.8 || (c.y > 0.62 * cr && nm.y > 0.3) || (c.y > 0.8 * cr && cr > 0.25)) return vary(C.snow, rng, 0.05);
      let k = mix(0x5f9fcf, 0xb4dcf2, c.y / 0.7);
      if (rng() < 0.12) k = col(0x4a86b8);
      else if (rng() < 0.15) k.lerp(col(0x9ae0ee), 0.6);
      return vary(k, rng, 0.1);
    }, [0, 1, 0]);
  }
  g.add(mesh(T.geo(), VF({ roughness: 0.4 })));
  return g;
}

// ---------------------------------------------------------------------------------------------
// the Ediacaran: quilted fronds and discs on the sea floor

function charnia(rng) {
  const g = group();
  const parts = [];
  // the holdfast: a ringed disc in the mud
  const hold = new THREE.LatheGeometry([[0.17, 0], [0.17, 0.012], [0.15, 0.022], [0.13, 0.03], [0.115, 0.027], [0.09, 0.04], [0.07, 0.037], [0.05, 0.05], [0.03, 0.052], [0.0001, 0.06]].map(([r, y]) => new THREE.Vector2(r, y)), 22);
  parts.push(piece(hold, 0xc98a68));
  // the stalk
  const lean = range(rng, -0.08, 0.08);
  const stalkTop = [0.02 + lean * 0.3, 0.27, 0];
  parts.push(piece(tube([[0, 0.04, 0], [0.01, 0.18, 0], stalkTop], 0.03, 0.022, 10, 10), 0xd49070));
  // the frond: a leaf bending back at the tip, quilted with branches either side of a midrib
  const y0 = 0.25, len = 0.8, n = 17, sway = range(rng, -0.05, 0.05);
  const axis = (t) => [stalkTop[0] + lean * t * 0.6 + sway * Math.sin(Math.PI * t), y0 + t * len, -0.1 * t * t];
  const half = (t) => 0.135 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.75) + 0.008;
  const leaf = (front) => sheet(18, 8, (u, v) => {
    const t = 0.02 + u * 0.96, p = axis(t), w = (v * 2 - 1) * half(t), bulge = 0.016 * (1 - (v * 2 - 1) ** 2);
    return [p[0] + w, p[1] + Math.abs(w) * 0.25, p[2] + (front ? bulge : -bulge) - 0.004];
  }, (u) => mix(0xc27a5a, 0xe6a684, u), (p) => [0, 0, front ? 1 : -1]).toNonIndexed();
  parts.push(leaf(true), leaf(false));
  parts.push(piece(tube(Array.from({ length: 8 }, (_, i) => { const p = axis(i / 7); return [p[0], p[1], p[2] + 0.012]; }), 0.02, 0.006, 20, 8), 0xb86e50));
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5 + (side > 0 ? 0.5 : 0)) / (n + 0.6), w = half(t);
      if (w < 0.03) continue;
      const p = axis(t), ang = 0.62;
      const dir = [side * Math.cos(ang), Math.sin(ang), 0];
      const a = w * 0.52, b = (len / n) * 0.42, c = 0.018;
      const k = mix(0xd98c6c, 0xf6c4a0, t).multiplyScalar(i % 2 ? 1.04 : 0.94);
      parts.push(piece(SPH_S, k, [p[0] + dir[0] * a * 0.98, p[1] + dir[1] * a * 0.98, p[2] + 0.016], [-0.12 * t, 0, side * ang], [a, b, c]));
    }
  }
  g.add(fuse(parts, VS({ roughness: 0.7 })));
  return g;
}

function dickinsonia(rng) {
  const g = group();
  const L = 1, Wd = 0.78, n = 22, parts = [];
  // the body under the segments, and its midline
  parts.push(piece(SPH, 0xc47e5e, [0, 0.01, 0], [0, 0, 0], [L / 2 + 0.012, 0.016, Wd / 2 + 0.012]));
  parts.push(piece(SPH, 0x9a5638, [0.02, 0.024, 0], [0, 0, 0], [L / 2 - 0.05, 0.014, 0.016]));
  // segments either side, offset by half a segment (glide symmetry), fanning out toward the ends
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const u = -1 + (2 * (i + 0.5 + (s > 0 ? 0.25 : -0.25))) / n;
      if (Math.abs(u) > 0.97) continue;
      const hw = (Wd / 2) * Math.sqrt(Math.max(0, 1 - u * u)) - 0.02;
      if (hw < 0.03) continue;
      const al = s * 0.5 * u * Math.abs(u) ** 0.3;
      const dx = s * Math.sin(al), dz = s * Math.cos(al), d = 0.02 + hw / 2;
      const x = (u * L) / 2 * 0.95;
      const k = mix(0xd68e6e, 0xe8ad8a, (i % 2) * 0.7 + 0.15).multiplyScalar(lerp(0.92, 1.05, 1 - Math.abs(u)));
      parts.push(piece(SPH_S, vary(k, rng, 0.05), [x + dx * d, 0.02, dz * d], [0, al, 0], [(L / n) * 0.62, 0.024 * (0.6 + 0.4 * Math.sqrt(1 - u * u)), hw / 2 + 0.008]));
    }
  }
  g.add(fuse(parts, VS({ roughness: 0.75 })));
  return g;
}

// ---------------------------------------------------------------------------------------------
// the Cambrian: the first animals with eyes and legs

function eyes(g, list, r, c = 0x1e1410) {
  // dark glossy eyes, each with a glint toward the light, for a toy's look
  const eye = mat(c, { roughness: 0.22, flat: true }), glint = mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.7 });
  for (const [x, y, z] of list) {
    g.add(at(mesh(new THREE.SphereGeometry(r, 10, 7), eye), x, y, z));
    g.add(unshadowed(at(mesh(new THREE.SphereGeometry(r * 0.28, 6, 4), glint), x - r * 0.35, y + r * 0.55, z + r * 0.62 * Math.sign(z || 1))));
  }
}

function trilobite(rng) {
  const g = group();
  const lift = 0.035, S = [];
  const head = 0x8b4a26, border = 0xab683c, glab = 0x7c3c1e, axial = 0x6e3319, plA = 0x92502b, plB = 0xa25e36, spine = 0xb7783f, limb = 0xc58b58;
  // a shield: half an ellipse ahead of (dir 1) or behind (dir -1) x = 0, domed, with a rolled border
  const prof = (rho, h) => {
    if (rho < 0.74) return 0.24 * h + 0.76 * h * Math.pow(1 - (rho / 0.74) ** 2, 0.55);
    if (rho < 0.83) return lerp(0.24 * h, 0.17 * h, (rho - 0.74) / 0.09);
    if (rho < 0.93) return lerp(0.17 * h, 0.27 * h, sstep(0.83, 0.93, rho));
    return lerp(0.27 * h, 0.06 * h, (rho - 0.93) / 0.07);
  };
  const rhos = [0, 0.14, 0.28, 0.42, 0.54, 0.64, 0.72, 0.78, 0.84, 0.89, 0.93, 0.965, 1];
  const shield = (x0, a, b, h, dir, cIn, cRim) => sheet(26, rhos.length - 1, (u, v) => {
    const ph = -Math.PI / 2 + u * Math.PI, rho = rhos[Math.round(v * (rhos.length - 1))];
    return [x0 + dir * a * rho * Math.cos(ph), lift + prof(rho, h), b * rho * Math.sin(ph)];
  }, (u, v) => (rhos[Math.round(v * (rhos.length - 1))] < 0.8 ? cIn : cRim), () => [0, 1, 0]).toNonIndexed();
  // the head shield, its raised middle (the glabella) in rings, and long spines from its corners
  S.push(shield(0, 0.28, 0.33, 0.14, 1, head, border));
  S.push(piece(SPH, glab, [0.125, lift + 0.105, 0], [0, 0, 0.1], [0.12, 0.06, 0.085]));
  S.push(piece(SPH, axial, [0.02, lift + 0.11, 0], [0, 0, 0], [0.032, 0.055, 0.08]));
  for (const s of [-1, 1]) {
    S.push(piece(SPH_S, head, [0.07, lift + 0.105, s * 0.155], [0, 0, 0], [0.05, 0.038, 0.045]));
    S.push(piece(tube([[0.01, lift + 0.02, s * 0.325], [-0.15, lift + 0.014, s * 0.352], [-0.34, lift + 0.008, s * 0.342], [-0.52, lift + 0.002, s * 0.29]], 0.03, 0.004, 18, 8), border));
  }
  // the thorax: ten segments, each an axial ring and two pleurae ending in short spines
  const nt = 10, dx = 0.043;
  for (let i = 0; i < nt; i++) {
    const x = -0.02 - i * dx, w = 0.3 - i * 0.008;
    S.push(piece(SPH, i % 2 ? plA : plB, [x, lift + 0.03, 0], [0, 0, 0], [0.03, 0.042, w]));
    S.push(piece(SPH, axial, [x, lift + 0.07, 0], [0, 0, 0], [0.03, 0.048, 0.092]));
    for (const s of [-1, 1]) S.push(piece(CONE, spine, [x - 0.005, lift + 0.02, s * (w - 0.02)], toward([-0.75, -0.05, s * 0.65]), [0.014, 0.065, 0.014]));
  }
  // the tail shield, its axis in rings
  const xp = -0.02 - nt * dx + 0.02;
  S.push(shield(xp, 0.17, 0.23, 0.09, -1, head, border));
  for (let k = 0; k < 4; k++) S.push(piece(SPH, axial, [xp - 0.02 - k * 0.032, lift + 0.065 - k * 0.008, 0], [0, 0, 0], [0.022, 0.045 - k * 0.006, 0.075 - k * 0.012]));
  // antennae, raised in an arc, and the tips of little legs peeping out from under the edge
  for (const s of [-1, 1]) {
    S.push(piece(tube([[0.24, lift + 0.02, s * 0.06], [0.35, lift + 0.05, s * 0.11], [0.46, lift + 0.13, s * 0.18], [0.53, lift + 0.24, s * 0.24], [0.55, lift + 0.31, s * 0.28]], 0.013, 0.005, 18, 6), limb));
    for (let k = 0; k < 7; k++) {
      const x = 0.1 - k * 0.075;
      S.push(piece(tube([[x, lift + 0.01, s * 0.22], [x + 0.02, lift + 0.012, s * 0.3], [x + 0.035, 0.002, s * 0.345]], 0.011, 0.007, 6, 6), limb));
    }
  }
  g.add(fuse(S, VS({ roughness: 0.45 })));
  eyes(g, [[0.07, lift + 0.14, 0.16], [0.07, lift + 0.14, -0.16]], 0.034);
  return g;
}

// a swimmer's body: segments, each with a broad flap either side, rippling in a wave

function swimmer(S, rng, { x0, n, dx, rx, ry, rz, taper, flapW, flapX, cols }) {
  const ph = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const x = x0 - i * dx, f = 1 - i * taper;
    S.push(piece(SPH, i % 2 ? cols[0] : cols[1], [x, 0, 0], [0, 0, 0], [rx, ry * f, rz * f]));
    for (const s of [-1, 1]) {
      const w = flapW * (1 - i * taper * 0.9), roll = 0.08 + 0.22 * Math.sin(i * 0.7 + ph);
      // the flap hinges at the body's side and tips down or up with the wave
      const hz = s * rz * f * 0.8, cz = hz + s * w * Math.cos(roll), cy = -w * Math.sin(roll) * 0.9 - 0.005;
      S.push(piece(SPH_S, i % 2 ? cols[2] : cols[3], [x - flapX, cy, cz], [s * roll, -s * 0.18, 0], [dx * 0.95, 0.009, w]));
    }
  }
}

function anomalocaris(rng) {
  const g = group(), S = [];
  const arm = 0xe58a52, thorn = 0xf3d6a8;
  swimmer(S, rng, { x0: 0.22, n: 11, dx: 0.056, rx: 0.05, ry: 0.05, rz: 0.07, taper: 0.045, flapW: 0.14, flapX: 0.014, cols: [0xd2553a, 0xc44a32, 0xe8865a, 0xd8643e] });
  // the tail fan: three pairs of blades
  for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
    const a = s * (0.3 + k * 0.32);
    S.push(piece(SPH_S, k === 1 ? 0xd8643e : 0xc44a32, [-0.36 - 0.085 * Math.cos(a), 0.01 + k * 0.012, -0.085 * Math.sin(a) * 1.2], [0, a, 0.08], [0.11, 0.009, 0.034]));
  }
  // the head, with a pale shield on top
  S.push(piece(SPH, 0xd85c3e, [0.33, 0.01, 0], [0, 0, 0.1], [0.12, 0.08, 0.095]));
  S.push(piece(SPH, 0xeda07a, [0.35, 0.07, 0], [0, 0, 0.12], [0.095, 0.03, 0.065]));
  // eyes on short stalks
  for (const s of [-1, 1]) S.push(piece(tube([[0.37, 0.05, s * 0.05], [0.37, 0.1, s * 0.11], [0.35, 0.12, s * 0.16]], 0.02, 0.016, 8, 8), 0xd85c3e));
  // the great grasping arms, curling down and back, thorned on the inside
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([[0.43, -0.02, s * 0.04], [0.54, -0.01, s * 0.065], [0.62, -0.06, s * 0.075], [0.63, -0.15, s * 0.07], [0.57, -0.21, s * 0.06], [0.5, -0.19, s * 0.05]].map((p) => V(...p)));
    const m = 13, ctr = V(0.55, -0.11, s * 0.065);
    for (let i = 0; i <= m; i++) {
      const t = i / m, p = curve.getPoint(t), r = lerp(0.034, 0.012, t);
      S.push(piece(SPH_S, i % 2 ? arm : 0xd8743e, [p.x, p.y, p.z], [0, 0, 0], r));
      if (i > 1 && i < m) {
        const d = ctr.clone().sub(p).normalize();
        for (const o of [-1, 1]) S.push(piece(CONE, thorn, [p.x, p.y, p.z + o * r * 0.4], toward([d.x, d.y, d.z + o * 0.4]), [r * 0.3, r * 1.6, r * 0.3]));
      }
    }
  }
  g.add(fuse(S, VS({ roughness: 0.55 })));
  eyes(g, [[0.345, 0.13, 0.17], [0.345, 0.13, -0.17]], 0.04);
  // swimming up, nose high
  g.rotation.z = 0.16;
  const wrap = group(g);
  g.position.y = -new THREE.Box3().setFromObject(wrap).min.y;
  return wrap;
}

function opabinia(rng) {
  const g = group(), S = [];
  const bodyB = 0x4c9a90, flapB = 0x5eaa98, accent = 0xe0703a, stalk = 0xa8d6c8;
  swimmer(S, rng, { x0: 0.2, n: 14, dx: 0.04, rx: 0.036, ry: 0.05, rz: 0.06, taper: 0.032, flapW: 0.1, flapX: 0.01, cols: [0x3f8a82, bodyB, 0x7cc2ae, flapB] });
  // the tail fan, its blades raised in a V
  for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
    const a = s * (0.25 + k * 0.28);
    S.push(piece(SPH_S, accent, [-0.33 - 0.075 * Math.cos(a), 0.02 + k * 0.018, -0.075 * Math.sin(a)], [s * 0.5, a, 0.2], [0.09, 0.008, 0.028]));
  }
  // the head
  S.push(piece(SPH, bodyB, [0.27, 0.01, 0], [0, 0, 0.05], [0.09, 0.065, 0.08]));
  // five eyes on stalks
  const ends = [[0.29, 0.05, 0, 0.3, 0.19, 0], [0.32, 0.05, 0.04, 0.37, 0.16, 0.1], [0.32, 0.05, -0.04, 0.37, 0.16, -0.1], [0.24, 0.05, 0.045, 0.22, 0.16, 0.12], [0.24, 0.05, -0.045, 0.22, 0.16, -0.12]];
  for (const [x, y, z, ex, ey, ez] of ends) S.push(piece(tube([[x, y, z], [(x + ex) / 2, (y + ey) / 2 + 0.01, (z + ez) / 2], [ex, ey, ez]], 0.012, 0.009, 8, 6), stalk));
  // the proboscis, reaching forward and down, a claw at its end
  const curve = new THREE.CatmullRomCurve3([[0.34, -0.02, 0], [0.44, -0.06, 0], [0.55, -0.08, 0], [0.64, -0.06, 0], [0.7, -0.01, 0]].map((p) => V(...p)));
  for (let i = 0; i <= 16; i++) {
    const p = curve.getPoint(i / 16), r = lerp(0.024, 0.015, i / 16);
    S.push(piece(SPH_S, i % 2 ? bodyB : flapB, [p.x, p.y, p.z], [0, 0, 0], [r, r, r]));
  }
  for (const s of [-1, 1]) {
    S.push(piece(tube([[0.7, -0.01, 0], [0.745, 0.0 + s * 0.035, 0], [0.785, s * 0.03, 0], [0.8, s * 0.008, 0]], 0.015, 0.004, 10, 6), accent));
    for (let k = 0; k < 3; k++) S.push(piece(CONE, accent, [0.74 + k * 0.018, s * (0.028 - k * 0.004) - 0.005, 0], toward([0, -s, 0]), [0.005, 0.02, 0.005]));
  }
  g.add(fuse(S, VS({ roughness: 0.55 })));
  eyes(g, ends.map(([, , , ex, ey, ez]) => [ex, ey + 0.014, ez]), 0.027);
  g.rotation.z = 0.06;
  const wrap = group(g);
  g.position.y = -new THREE.Box3().setFromObject(wrap).min.y;
  return wrap;
}

function hallucigenia(rng) {
  const g = group(), S = [];
  const body = 0xd9806c, leg = 0xe8a28e, spine = 0xf2e4c4, tip = 0xc88a5a, claw = 0x5a3a2a;
  // the body: a soft tube, tail drooping, the head lifted
  const spinePath = [[-0.56, 0.16, 0], [-0.44, 0.22, 0], [-0.2, 0.25, 0], [0.1, 0.255, 0], [0.32, 0.27, 0], [0.43, 0.31, 0]];
  S.push(piece(tube(spinePath, 0.022, 0.036, 30, 10), body));
  S.push(piece(SPH, 0xe39282, [0.48, 0.33, 0], [0, 0, 0.3], [0.065, 0.052, 0.05]));
  for (const s of [-1, 1]) S.push(piece(SPH_S, 0x2a1a14, [0.525, 0.35, s * 0.026], [0, 0, 0], 0.011));
  // seven pairs of spines up, seven pairs of legs down
  for (let k = 0; k < 7; k++) {
    const x = -0.33 + k * 0.1, y = 0.255 + (x > 0.25 ? 0.01 : 0), h = 0.24 + 0.05 * Math.sin(k * 0.45 + 0.6);
    for (const s of [-1, 1]) {
      S.push(piece(tube([[x, y + 0.02, s * 0.014], [x - 0.02, y + h * 0.55, s * 0.04], [x - 0.055, y + h, s * 0.065]], 0.017, 0.003, 10, 6), spine));
      S.push(piece(CONE, tip, [x - 0.052, y + h - 0.012, s * 0.063], toward([-0.4, 1, s * 0.3]), [0.005, 0.02, 0.005]));
      const lx = x + 0.025;
      S.push(piece(tube([[lx, y - 0.02, s * 0.015], [lx + 0.03, y - 0.1, s * 0.055], [lx + 0.01, 0.06, s * 0.07], [lx + 0.03, 0.012, s * 0.075]], 0.016, 0.009, 12, 6), leg));
      S.push(piece(CONE, claw, [lx + 0.03, 0.016, s * 0.075], toward([0.6, -1, 0]), [0.008, 0.02, 0.008]));
    }
  }
  // thin tentacles under the neck
  for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
    const x = 0.33 + k * 0.035;
    S.push(piece(tube([[x, 0.27, s * 0.01], [x + 0.03, 0.2, s * 0.04], [x + 0.06, 0.15 - k * 0.01, s * 0.05]], 0.007, 0.003, 8, 5), leg));
  }
  g.add(fuse(S, VS({ roughness: 0.6 })));
  return g;
}

function sponge(rng) {
  const g = group();
  const base = rock(rng, 0.27, 0x6a5e54, 0.32, 1);
  g.add(at(base, 0, 0.03, 0));
  const warm = [0xe8823a, 0xe8c24a, 0xd0503a, 0xe06a5a, 0xc8405a, 0xf0a040];
  const order = warm.map((c) => [rng(), c]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const nz = noise3(rng, 3, 14);
  const make = (pts, c, x, z, lx, lz) => {
    const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14);
    const p = geo.attributes.position, v = V(), cs = new Float32Array(p.count * 3), np = pts.length;
    const inner = Math.floor(np / 2) + 1;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const j = i % np, k = 1 + 0.08 * nz(v.x + x, v.y, v.z + z);
      v.x *= k; v.z *= k;
      v.x += lx * v.y * v.y; v.z += lz * v.y * v.y;
      p.setXYZ(i, v.x + x, v.y + 0.04, v.z + z);
      const cc = j >= inner + 1 ? col(c).multiplyScalar(0.38) : mix(c, 0xffffff, (v.y / pts[np >> 1][1]) * 0.12);
      cs.set([cc.r, cc.g, cc.b], i * 3);
    }
    geo.deleteAttribute('uv');
    geo.setAttribute('color', new THREE.BufferAttribute(cs, 3));
    geo.computeVertexNormals();
    return geo.toNonIndexed();
  };
  const tubeP = (r, h) => [[r * 0.75, 0], [r, h * 0.12], [r * 1.02, h * 0.5], [r * 1.08, h * 0.86], [r * 1.18, h], [r * 1.04, h * 1.03], [r * 0.82, h * 0.99], [r * 0.72, h * 0.85], [r * 0.66, h * 0.45]];
  const vaseP = (r, h) => [[r * 0.4, 0], [r * 0.55, h * 0.2], [r * 0.8, h * 0.55], [r * 1.05, h * 0.88], [r * 1.12, h], [r * 1.0, h * 1.02], [r * 0.86, h * 0.95], [r * 0.6, h * 0.6], [r * 0.4, h * 0.3]];
  const parts = [
    make(tubeP(0.075, range(rng, 0.55, 0.68)), order[0], -0.04, -0.02, -0.06, 0),
    make(tubeP(0.058, range(rng, 0.38, 0.46)), order[1], 0.1, 0.04, 0.12, 0.03),
    make(tubeP(0.046, range(rng, 0.26, 0.32)), order[2], -0.15, 0.08, -0.12, 0.05),
    make(vaseP(0.15, range(rng, 0.28, 0.34)), order[3], 0.12, -0.12, 0.05, -0.05),
    make(tubeP(0.035, range(rng, 0.18, 0.22)), order[4], 0.0, 0.14, 0.05, 0.1),
  ];
  for (let k = 0; k < 3; k++) {   // little round sponges
    const a = Math.PI / 2 + range(rng, -1.2, 1.2), r = range(rng, 0.14, 0.22), s = range(rng, 0.03, 0.045);
    parts.push(piece(SPH_S, order[(k + 2) % order.length], [r * Math.cos(a), 0.06 + s * 0.5, r * Math.sin(a)], [0, 0, 0], [s, s * 0.8, s]));
  }
  g.add(fuse(parts, VS({ roughness: 0.85 })));
  return g;
}

function jellyfish(rng) {
  const g = group();
  const pink = 0xf2a0d8;
  // the bell: a dome with a scalloped rim, its inside a second, inner surface
  const prof = [[0.0001, 1], [0.12, 0.985], [0.24, 0.94], [0.33, 0.87], [0.39, 0.78], [0.42, 0.69], [0.42, 0.62], [0.4, 0.585], [0.35, 0.6], [0.27, 0.65], [0.15, 0.69], [0.0001, 0.7]];
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 32);
  const p = geo.attributes.position, v = V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.x, v.z), k = 1 + 0.06 * Math.max(0, 1 - (v.y - 0.585) / 0.12) * Math.cos(8 * a);
    p.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  geo.computeVertexNormals();
  const bell = unshadowed(mesh(geo, mat(pink, { emissive: pink, emissiveIntensity: 0.45, transparent: true, opacity: 0.55, roughness: 0.25, depthWrite: false })));
  bell.renderOrder = 2;
  g.add(bell);
  // four horseshoe gonads, seen through the bell
  for (let k = 0; k < 4; k++) {
    const t = unshadowed(mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 14, Math.PI * 1.5), glow(0xff6ab4, 0.8)));
    t.rotation.set(-Math.PI / 2, 0, (k * Math.PI) / 2 + Math.PI / 4);
    t.position.set(0.11 * Math.cos((k * Math.PI) / 2), 0.77, 0.11 * Math.sin((k * Math.PI) / 2));
    g.add(t);
  }
  // frilly oral arms, hanging from the middle: ribbons ruffled along their edges, twisting as they hang
  const arms = [];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + 0.3, ph = rng() * TAU, pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, r = 0.05 + 0.07 * t;
      pts.push(V(r * Math.cos(a) + 0.035 * Math.sin(t * 7 + ph), 0.69 - t * 0.5, r * Math.sin(a) + 0.035 * Math.cos(t * 6 + ph)));
    }
    const curve = new THREE.CatmullRomCurve3(pts), segs = 44, radial = 8;
    const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false), p = geo.attributes.position, v = V();
    const fr = curve.computeFrenetFrames(segs, false);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, c = curve.getPointAt(t), w = 0.05 * (1 - 0.6 * t) * (1 + 0.35 * Math.sin(t * 38 + ph)), tw = t * 5 + a;
      const n1 = fr.normals[i].clone().multiplyScalar(Math.cos(tw)).addScaledVector(fr.binormals[i], Math.sin(tw));
      for (let j = 0; j <= radial; j++) {
        const q = i * (radial + 1) + j;
        v.fromBufferAttribute(p, q).sub(c);
        const along = v.dot(n1);   // a flat ribbon: wide one way, thin the other
        v.multiplyScalar(0.012).addScaledVector(n1, along * (w - 0.012));
        p.setXYZ(q, c.x + v.x, c.y + v.y, c.z + v.z);
      }
    }
    geo.computeVertexNormals();
    arms.push(piece(geo, mix(0xf8c4e6, 0xe890c8, 0.4)));
  }
  g.add(unshadowed(fuse(arms, VS({ emissive: 0x6a3050, emissiveIntensity: 0.6, roughness: 0.4, transparent: true, opacity: 0.85, side: THREE.DoubleSide }))));
  // fine tentacles from the rim, and lights along it
  const tent = [];
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * TAU + 0.1, r = 0.39, ph = rng() * TAU, L = range(rng, 0.42, 0.56), pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, rr = r * (1 - 0.18 * t) + 0.03 * Math.sin(t * 6 + ph);
      pts.push([rr * Math.cos(a) + 0.02 * Math.sin(t * 8 + ph), 0.6 - t * L, rr * Math.sin(a)]);
    }
    tent.push(piece(tube(pts, 0.008, 0.002, 14, 4), 0xffd0ee));
  }
  g.add(unshadowed(fuse(tent, VS({ emissive: 0xff9ad8, emissiveIntensity: 0.5, roughness: 0.4 }))));
  const dots = [];
  for (let k = 0; k < 18; k++) { const a = ((k + 0.5) / 18) * TAU + 0.1; dots.push(piece(PUFF_S, 0xffffff, [0.41 * Math.cos(a), 0.6, 0.41 * Math.sin(a)], [0, 0, 0], 0.012)); }
  g.add(unshadowed(fuse(dots, glow(0xffc8f4, 2.6))));
  return g;
}

function algae(rng) {
  const g = group();
  g.add(at(rock(rng, 0.06, 0x4a3e34, 0.6), 0, 0.015, 0));
  const greens = [0x5aa846, 0x78b850, 0x8a9a3a, 0x4a9a50], reds = [0xc04a50, 0xd06a4a, 0xa83c50];
  const parts = [], m = 9, seg = 9;
  for (let f = 0; f < m; f++) {
    const a = (f / m) * TAU + rng() * 0.5, h = range(rng, 0.55, 1.0), lean = range(rng, 0.15, 0.4), wmax = range(rng, 0.055, 0.085);
    const c0 = f % 3 === 1 ? pick2(rng, reds) : pick2(rng, greens);
    const dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-Math.sin(a), 0, Math.cos(a)), ph = rng() * TAU;
    const pos = [], cs = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const c = V(0, 0.02 + h * t, 0).addScaledVector(dir, 0.02 + lean * Math.pow(t, 1.5)).addScaledVector(side, 0.08 * Math.sin(t * 4.5 + ph) * t);
      const w = wmax * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.65))), 0.7) + 0.008 * (1 - t);
      const ruffle = 0.018 * Math.sin(t * 19 + ph) * t;
      const k = col(c0).multiplyScalar(lerp(0.65, 1.2, t));
      for (const o of [-1, 0, 1]) {
        const q = c.clone().addScaledVector(side, o * w).addScaledVector(dir, o === 0 ? 0.01 : ruffle * o);
        pos.push(q.x, q.y, q.z); cs.push(k.r, k.g, k.b);
      }
    }
    for (let i = 0; i < seg; i++) for (let o = 0; o < 2; o++) {
      const a0 = i * 3 + o, b0 = (i + 1) * 3 + o;
      idx.push(a0, b0, b0 + 1, a0, b0 + 1, a0 + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    parts.push(geo.toNonIndexed());
  }
  g.add(fuse(parts, VS({ side: THREE.DoubleSide, roughness: 0.6 })));
  return g;
}

const pick2 = (rng, xs) => xs[Math.floor(rng() * xs.length) % xs.length];

function wave(rng) {
  const g = group();
  // the curl seen side-on [x, y]: up the back, over the crest, the lip pitching forward and
  // curling back under itself, down the hollow face; the wave runs toward +x
  const prof = [[-0.56, 0], [-0.42, 0.04], [-0.28, 0.12], [-0.15, 0.23], [-0.04, 0.35], [0.07, 0.44], [0.18, 0.47], [0.28, 0.43], [0.34, 0.35], [0.34, 0.27], [0.29, 0.25], [0.24, 0.29], [0.18, 0.27], [0.13, 0.2], [0.12, 0.1], [0.17, 0.03], [0.25, 0]];
  const tone = [0x1f6aa8, 0x2a7fbc, 0x3a96cc, 0x52b0da, 0x7ccbe6, 0xb0e4f0, 0xe6f7fa, 0xf4fbfd, 0xd8f1f8, 0x9ad6ea, 0x5aaed6, 0x3a8cc0, 0x2a72a8, 0x22609a, 0x235f90, 0x2a6a9a];
  const m = 5, st = [];
  for (let i = 0; i <= m; i++) {
    const u = i / m, z = -0.34 + 0.68 * u, s = Math.pow(Math.sin(Math.PI * u), 0.5), curl = Math.pow(Math.sin(Math.PI * u), 1.4);
    st.push(prof.map(([x, y], j) => [j >= 7 ? lerp(0.1, x, curl) : x * lerp(0.75, 1, s), y * s * (j >= 7 ? lerp(0.6, 1, curl) : 1), z + 0.04 * Math.sin(x * 3)]));
  }
  const T = new Tris();
  for (let i = 0; i < m; i++) for (let j = 0; j + 1 < prof.length; j++) T.quad(st[i][j], st[i + 1][j], st[i + 1][j + 1], st[i][j + 1], vary(tone[j], rng, 0.08));
  g.add(mesh(T.geo(), VF({ side: THREE.DoubleSide, roughness: 0.3 })));
  // foam on the lip and where it lands, a few drops of spray
  const foam = [];
  for (let i = 1; i < m; i++) {
    const p = st[i][8], q = st[i][6], s = Math.pow(Math.sin(Math.PI * (i / m)), 0.7);
    foam.push(piece(FOAM, 0xf7fbff, [p[0] + 0.01, p[1] + 0.02, p[2]], [0, rng() * TAU, 0], [0.065 * s, 0.05 * s, 0.075 * s]));
    if (i > 1 && i < m - 1) foam.push(piece(FOAM, 0xeef7fb, [q[0], q[1] + 0.01, q[2]], [0, rng() * TAU, 0], [0.06 * s, 0.03 * s, 0.07 * s]));
    if (i % 2) foam.push(piece(FOAM, 0xf2f8fb, [0.3, 0.02, p[2]], [0, 0, 0], [0.07 * s, 0.035 * s, 0.07 * s]));
  }
  foam.push(piece(FOAM, 0xffffff, [0.4, 0.4, range(rng, -0.1, 0.1)], [0, 0, 0], 0.02), piece(FOAM, 0xffffff, [0.44, 0.33, range(rng, -0.1, 0.1)], [0, 0, 0], 0.014));
  g.add(fuse(foam, VS({ roughness: 0.7 })));
  return g;
}

export const flat = ['lavaPool', 'crater', 'dickinsonia'];
const lib = {
  volcano, shieldVolcano, lavaPool, impactor, smokePlume, steam, moon, crater,
  volcanicIsland, blackSmoker, stromatolite,
  iceberg, iceRidge,
  charnia, dickinsonia,
  trilobite, anomalocaris, opabinia, hallucigenia, sponge, jellyfish, algae, wave,
};
for (const [k, f] of Object.entries(lib)) lib[k] = (rng) => compact(f(rng));
export default lib;
