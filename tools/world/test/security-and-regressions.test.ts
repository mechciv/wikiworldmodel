// Regression tests for security hardening and bug fixes across core, tools, viewer, and generators.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { fromLocal, toLocal } from '../../../core/city.ts';
import { decodeTile, encodeTile } from '../../../core/container.ts';
import { EnergyBalance, type EnergyBalanceParams } from '../../../core/ebm.ts';
import { fingerprint, fingerprintProblems } from '../../../core/fingerprint.ts';
import { canonicalForm } from '../../../core/form.ts';
import { sceneTiles } from '../../../core/landscape.ts';
import { tilesNear } from '../../../core/months.ts';
import { buildFieldPalette, plotAt } from '../../../core/plots.ts';
import { splitRef } from '../../../core/refs.ts';
import { insideOutline } from '../../../core/relief.ts';
import { sample } from '../../../core/samples.ts';
import { ORIGIN, solve } from '../../../core/stn.ts';
import { contains, TERRITORY_SCALE } from '../../../core/territory.ts';
import { parseDuration, parsePoint, parseTime } from '../../../core/time.ts';
import { ancestors, indexTree, subtree } from '../../../core/tree.ts';
import { waterYear, type WaterParams } from '../../../core/water.ts';
import { Camera } from '../../../viewer/src/camera.ts';
import { quantize, type ViewState } from '../../../viewer/src/state.ts';
import { esc, isSafeBuildId, safeHref } from '../../../viewer/src/ui/html.ts';
import { MAT, Mesh, STRIDE } from '../../../world/generators/city/kit.ts';
import { area, triangulate } from '../../../world/generators/city/math.ts';
import { drawDwelling } from '../../../world/generators/people/dwellings.ts';
import { enter, leave, reset } from '../../../world/generators/people/parts.ts';
import { drawWell } from '../../../world/generators/people/yard.ts';
import { LOT_DOMUS, raiseLot, type FabricPlan } from '../../../world/generators/rome/fabric/v1.ts';
import { createFeedbackMiddleware } from '../src/feedbackStore.ts';
import { safeJoin, safeUrlBasename } from '../src/paths.ts';

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('Workstream A: security hardening', () => {
  it('safeJoin blocks traversal, absolute paths, NUL bytes, and sibling-prefix escapes', () => {
    const root = '/tmp/wwm-safe-root';
    expect(safeJoin(root, 'sub/file.json')).toBe('/tmp/wwm-safe-root/sub/file.json');
    for (const bad of ['../etc/passwd', '/etc/passwd', 'a/../../outside', 'a\0b', 'C:\\evil', '.', '']) {
      expect(() => safeJoin(root, bad)).toThrow();
    }
    expect(() => safeUrlBasename('https://example.com/a/..')).toThrow();
    expect(() => safeUrlBasename('https://example.com/a/b\\c')).toThrow();
    expect(safeUrlBasename('https://example.com/data/file.zip?v=1#frag')).toBe('file.zip');
  });

  it('viewer html helpers escape markup, block unsafe href schemes, and validate build IDs', () => {
    expect(esc(`<img src=x onerror="alert('1')">&`)).toBe('&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;');
    expect(safeHref('https://example.org/doc')).toBe('https://example.org/doc');
    expect(safeHref('http://localhost:5173/test')).toBe('http://localhost:5173/test');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeHref('vbscript:msgbox(1)')).toBeUndefined();
    expect(isSafeBuildId('0123456789abcdef')).toBe(true);
    expect(isSafeBuildId('build_v1.2-test')).toBe(true);
    expect(isSafeBuildId('../evil')).toBe(false);
    expect(isSafeBuildId('"><script>')).toBe(false);
  });

  it('feedbackStore enforces Origin, Content-Type, malformed URI handling, and nosniff', async () => {
    const base = mkdtempSync(join(tmpdir(), 'wwm-sec-fb-'));
    tempDirs.push(base);
    const middleware = createFeedbackMiddleware(join(base, '.feedback'), base);
    const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const url = (path: string) => `http://127.0.0.1:${port}${path}`;

    try {
      const badOrigin = await fetch(url('/api/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
        body: '{}',
      });
      expect(badOrigin.status).toBe(403);
      expect(badOrigin.headers.get('x-content-type-options')).toBe('nosniff');

      const badMime = await fetch(url('/api/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{}',
      });
      expect(badMime.status).toBe(415);

      const badUri = await fetch(url('/api/feedback/%E0%A4%A/screenshot.png'));
      expect(badUri.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('LWT1 decodeTile rejects negative offsets, OOB lengths, misalignment, and prototype keys', () => {
    const good = encodeTile({ ok: true }, [new Int16Array([1, 2, 3, 4])], JSON.stringify);
    const decoded = decodeTile<{ ok: boolean }>(good.buffer.slice(good.byteOffset, good.byteOffset + good.byteLength) as ArrayBuffer);
    expect(decoded.header.ok).toBe(true);

    const craft = (headerObj: Record<string, unknown>, payloadBytes = 16) => {
      const json = new TextEncoder().encode(JSON.stringify(headerObj));
      const headerLen = Math.ceil(json.length / 8) * 8;
      const buf = new Uint8Array(8 + headerLen + payloadBytes);
      buf.set([0x4c, 0x57, 0x54, 0x31], 0);
      new DataView(buf.buffer).setUint32(4, headerLen, true);
      buf.fill(0x20, 8, 8 + headerLen);
      buf.set(json, 8);
      return buf.buffer;
    };

    expect(() => decodeTile(craft({ buffers: [{ type: 'uint8', offset: -8, length: 4 }] }))).toThrow();
    expect(() => decodeTile(craft({ buffers: [{ type: 'uint8', offset: 0, length: 999 }] }))).toThrow();
    expect(() => decodeTile(craft({ buffers: [{ type: 'int32', offset: 2, length: 2 }] }))).toThrow();
    expect(() => decodeTile(craft({ buffers: [{ type: 'constructor', offset: 0, length: 1 }] }))).toThrow();
  });
});

describe('Workstream B: core solver, time, refs, samples, fingerprint, and forms', () => {
  it('splitRef splits dataset row refs on # before @', () => {
    expect(splitRef('src:cliopatria-0.2.1#Qin%20Dynasty@-210')).toEqual({
      record: 'src:cliopatria-0.2.1',
      part: 'Qin%20Dynasty@-210',
    });
    expect(splitRef('earth/lips/deccan-traps@main')).toEqual({
      record: 'earth/lips/deccan-traps',
      phase: 'main',
    });
  });

  it('time parser rejects 0 BCE, decimal BCE, negative BP, and Oct 5-14 1582; handles Oct 1582 end & Gyr', () => {
    expect(() => parsePoint('0 BCE')).toThrow();
    expect(() => parsePoint('1.5 BCE')).toThrow();
    expect(() => parsePoint('-50 BP')).toThrow();
    expect(() => parsePoint('10 October 1582 CE')).toThrow();
    const oct = parseTime('October 1582 CE');
    expect(oct.kind).toBe('interval');
    if (oct.kind === 'interval') {
      expect(oct.hi).toBeCloseTo(parsePoint('1 November 1582 CE').t, 6);
    }
    expect(parseDuration('1 Gyr')).toBe(1e9);
    expect(() => parseTime({ lo: 'not-a-date', hi: '100 CE' })).toThrow();
  });

  it('STN detects tight sub-day conflicts without collapsing under EPS = 1e-3', () => {
    const res = solve(
      [ORIGIN, 'a', 'b'],
      [
        { from: ORIGIN, to: 'a', lo: 100, hi: 100, source: 'c1' },
        { from: ORIGIN, to: 'b', lo: 100.0001, hi: 100.0001, source: 'c2' },
        { from: 'a', to: 'b', lo: -Infinity, hi: -0.0002, source: 'c3' },
      ],
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const srcs = res.conflict.constraints.map((c) => c.source);
      expect(srcs).toContain('c1');
      expect(srcs).toContain('c3');
    }
  });

  it('samples includes values[0] across members ensemble', () => {
    const vals = [10, 20, 30];
    const seen = new Set([1, 2, 3].map((m) => sample({ kind: 'members', values: vals }, 'seed', m)));
    expect(seen).toEqual(new Set(vals));
  });

  it('fingerprint detects NaN and Infinity instead of passing silently', () => {
    const good = fingerprint([{ name: 'x', values: [1, 2, 3, 4] }]);
    const bad = fingerprint([{ name: 'x', values: [1, Number.NaN, 3, 4] }]);
    expect(fingerprintProblems(good, bad).length).toBeGreaterThan(0);
    expect(fingerprintProblems(bad, bad).length).toBeGreaterThan(0);
  });

  it('canonicalForm strips null deletions recursively', () => {
    const f = canonicalForm({
      kind: 'plant',
      parts: {
        trunk: { type: 'trunk', taper: 0.5, dead: null } as never,
        removed: null as never,
      },
    } as never);
    expect('removed' in f.parts).toBe(false);
    expect('dead' in (f.parts.trunk as Record<string, unknown>)).toBe(false);
  });
});

describe('Workstream C: domain and scientific model bugs', () => {
  it('tilesNear and sceneTiles cover all intermediate longitude bands at high latitude and full ring at the pole', () => {
    const near88 = tilesNear(88, 0, { step: 0.5, tile_deg: 10 });
    expect(near88.length).toBeGreaterThanOrEqual(8);
    const pole = tilesNear(89.5, 0, { step: 0.5, tile_deg: 10 });
    expect(pole.length).toBe(36);
    const sPole = sceneTiles({ tileDeg: 10, reach_deg: 4 }, 88, 0);
    expect(sPole.length).toBeGreaterThanOrEqual(36);
  });

  it('city local projection and polygon containment wrap across the antimeridian', () => {
    const [x, y] = toLocal({ lat: 0, lon: 179.9 }, 0, -179.9);
    expect(x).toBeGreaterThan(20_000);
    expect(x).toBeLessThan(25_000);
    expect(Math.abs(y)).toBeLessThan(1);
    const [lat, lon] = fromLocal({ lat: 0, lon: 179.9 }, x, y);
    expect(lat).toBeCloseTo(0, 4);
    expect(lon).toBeCloseTo(-179.9, 3);

    const ring = [[179, -1], [-179, -1], [-179, 1], [179, 1]];
    expect(insideOutline([[ring]], 179.5, 0)).toBe(true);
    expect(insideOutline([[ring]], -179.5, 0)).toBe(true);
    expect(insideOutline([[ring]], 0, 0)).toBe(false);
    const flatRing = ring.flatMap(([lo, la]) => [lo * TERRITORY_SCALE, la * TERRITORY_SCALE]);
    const row = { name: 'Pacific', from: 0, to: 100, area: 1, at: [180, 0] as [number, number], rings: [flatRing] };
    expect(contains(row, 179.5, 0)).toBe(true);
    expect(contains(row, -179.5, 0)).toBe(true);
    expect(contains(row, 0, 0)).toBe(false);
  });

  it('waterYear handles bare rock (soil_mm = 0) without NaN', () => {
    const W: WaterParams = {
      hamon: { a: 13.97, b: 4.95, c: 0.062 },
      t_rain: 3.3,
      t_snow: -10,
      t_snow_high: -1,
      high_m: 1000,
      melt_max: 0.5,
      direct: 0.05,
      soil_mm: 0,
      rfactor: 0.5,
      obliquity_deg: 23.44,
      equinox_day: 80,
    };
    const out = waterYear(new Array(12).fill(10), new Array(12).fill(50), 45, 200, W);
    expect(Number.isFinite(out.runoff)).toBe(true);
    expect(out.runoff).toBeGreaterThan(0);
  });

  it('EnergyBalance rejects non-positive CO2', () => {
    const field = parse(readFileSync(new URL('../../../world/fields/earth/snowball-co2.yaml', import.meta.url), 'utf8')) as { params: EnergyBalanceParams };
    const m = new EnergyBalance(field.params);
    expect(() => m.forcing(0)).toThrow();
    expect(() => m.forcing(-1e-4)).toThrow();
  });

  it('tree traversal terminates safely on cyclic parent references', () => {
    const est = (v: number | null) => ({ best: v, lo: v ?? 0, hi: v ?? 0, derived: false });
    const nodes = [
      { id: 'a', label: 'A', parent: 1, time: { start: est(-100), end: est(null), instant: false } },
      { id: 'b', label: 'B', parent: 0, time: { start: est(-90), end: est(null), instant: false } },
    ];
    const idx = indexTree(nodes);
    expect(subtree(idx, 0).length).toBeLessThanOrEqual(2);
    expect(ancestors(nodes, 0).length).toBeLessThanOrEqual(2);
  });

  it('buildFieldPalette shifts Southern Hemisphere perennial phase and plotAt stays bounded', () => {
    const crops = [{ kind: 'wheat' as const, share: 'staple' as const }, { kind: 'olive' as const, share: 'secondary' as const }];
    const north = buildFieldPalette(crops, 1, 40);
    const south = buildFieldPalette(crops, 1, -40);
    expect(north.slots[0].state).not.toBe(south.slots[0].state);
    const hit = plotAt(123.4, 567.8, { plot: 60, aspect: 1.5, kind: 1 });
    expect(hit.fx).toBeGreaterThanOrEqual(0);
    expect(hit.fx).toBeLessThanOrEqual(1);
    expect(hit.fy).toBeGreaterThanOrEqual(0);
    expect(hit.fy).toBeLessThanOrEqual(1);
  });
});

describe('Workstream E: viewer camera and state', () => {
  it('Camera.project rejects behind-camera points and Camera.pick rejects sky rays', () => {
    const cam = new Camera();
    cam.update({ lat: 0, lon: 0, dist: 2.5, heading: 0, tilt: 75 }, 800, 600);
    expect(cam.project([-1, 0, 0]).visible).toBe(false);
    expect(cam.pick(400, 1)).toBeUndefined();
  });

  it('quantize clamps dist <= 1 while preserving street-level 2.5 m distance', () => {
    const base: ViewState = {
      t: 315,
      cam: { lat: 41.9, lon: 12.5, dist: 0.5 },
      window: [-1000, 1950],
      evidence: false,
      clouds: true,
      alt: [],
      picks: [],
      sel: null,
      hour: 17.4,
    };
    expect(quantize(base).cam.dist).toBeGreaterThan(1);
    const street = quantize({ ...base, cam: { lat: 41.9, lon: 12.5, dist: 1 + 2.5 / 6371000 } });
    expect((street.cam.dist - 1) * 6371000).toBeCloseTo(2.5, 1);
  });
});

describe('Workstream F: procedural generators', () => {
  it('Mesh.v normalizes and clamps non-unit normals without wrapping 256 -> 0', () => {
    const m = new Mesh();
    const idx = m.v(0, 0, 0, 0, 0, 1.5, 0, 0);
    const { vertices } = m.arrays();
    const b = new Uint8Array(vertices);
    expect(b[idx * 28 + 14]).toBe(255);
  });

  it('triangulate handles a concave polygon whose reflex vertex blocks direct hole-bridge visibility', () => {
    const concaveOuter = [0, 0, 10, 0, 10, 4, 6, 5, 10, 6, 10, 10, 0, 10];
    const hole = [2, 3, 2, 7, 4, 7, 4, 3];
    const { points, tris } = triangulate(concaveOuter, [hole]);
    let totalArea = 0;
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i] * 2;
      const b = tris[i + 1] * 2;
      const c = tris[i + 2] * 2;
      const triArea = 0.5 * ((points[b] - points[a]) * (points[c + 1] - points[a + 1]) - (points[b + 1] - points[a + 1]) * (points[c] - points[a]));
      expect(triArea).toBeGreaterThan(-1e-6);
      totalArea += triArea;
    }
    expect(totalArea).toBeCloseTo(area(concaveOuter) - area(hole), 3);
  });

  it('drawWell orients its top rim normals upward (+Z)', () => {
    const m = new Mesh();
    drawWell(m, 0);
    const { vertices } = m.arrays();
    const f = new Float32Array(vertices);
    const b = new Uint8Array(vertices);
    let rimUp = 0;
    let rimDown = 0;
    for (let i = 0; i < m.verts; i++) {
      const z = f[i * 7 + 2];
      const nz = (b[i * 28 + 14] - 128) / 127;
      if (Math.abs(z - 0.75) < 1e-3 && Math.abs(nz) > 0.8) {
        if (nz > 0) rimUp++;
        else rimDown++;
      }
    }
    expect(rimUp).toBeGreaterThan(0);
    expect(rimDown).toBe(0);
  });

  it('raiseLot builds east and west courtyard roofs on a domus far from the origin', () => {
    const cx = 100;
    const cy = 100;
    const h = 10; // 20 x 20 = 400 m² > 300 m² courtyard threshold
    const plan: FabricPlan = {
      lots: 1,
      offset: new Int32Array([0, 8]),
      points: new Float32Array([cx - h, cy - h, cx + h, cy - h, cx + h, cy + h, cx - h, cy + h]),
      base: new Float32Array([0]),
      top: new Float32Array([8]),
      type: new Uint8Array([LOT_DOMUS]),
      region: new Uint8Array([1]),
      style: new Uint8Array([1]),
      treeCount: 0,
      trees: new Float32Array(0),
      treeType: new Uint8Array(0),
      regionLots: [],
      domain: [],
    };
    const m = new Mesh();
    raiseLot(m, plan, 0, 0);
    const { vertices, indices } = m.arrays();
    const f = new Float32Array(vertices);
    const b = new Uint8Array(vertices);
    let eastRoof = 0;
    let westRoof = 0;
    let northRoof = 0;
    let southRoof = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const i0 = indices[t];
      if (b[i0 * STRIDE + 24] !== MAT.tile) continue;
      const mx = (f[i0 * 7] + f[indices[t + 1] * 7] + f[indices[t + 2] * 7]) / 3;
      const my = (f[i0 * 7 + 1] + f[indices[t + 1] * 7 + 1] + f[indices[t + 2] * 7 + 1]) / 3;
      if (Math.abs(my - cy) < 4) {
        if (mx > cx + 4) eastRoof++;
        if (mx < cx - 4) westRoof++;
      }
      if (Math.abs(mx - cx) < 4) {
        if (my > cy + 4) northRoof++;
        if (my < cy - 4) southRoof++;
      }
    }
    expect(northRoof).toBeGreaterThan(0);
    expect(southRoof).toBeGreaterThan(0);
    expect(eastRoof).toBeGreaterThan(0);
    expect(westRoof).toBeGreaterThan(0);
  });

  it('drawDwelling keeps upper-storey windows open when stacked directly above ground-floor openings', () => {
    const m = new Mesh(1024);
    drawDwelling(
      m,
      { plan: 'rectangular', width: 8, length: 10, storeys: 2, walls: 'fired-brick', roof: 'gable', roof_material: 'tile', windows: 'small', entrance: 'end' },
      0,
      0,
    );
    const { vertices, indices } = m.arrays();
    const f = new Float32Array(vertices);
    const b = new Uint8Array(vertices);
    // Find upper-storey dark window backing quads on the front wall (+y) at z > 2.8.
    const upperFrontWindows: { x: number; y: number; z: number }[] = [];
    for (let t = 0; t < indices.length; t += 3) {
      const i0 = indices[t];
      const i1 = indices[t + 1];
      const i2 = indices[t + 2];
      if (b[i0 * STRIDE + 24] !== MAT.dark) continue;
      const mx = (f[i0 * 7] + f[i1 * 7] + f[i2 * 7]) / 3;
      const my = (f[i0 * 7 + 1] + f[i1 * 7 + 1] + f[i2 * 7 + 1]) / 3;
      const mz = (f[i0 * 7 + 2] + f[i1 * 7 + 2] + f[i2 * 7 + 2]) / 3;
      if (my > 4.0 && mz > 2.8) upperFrontWindows.push({ x: mx, y: my, z: mz });
    }
    expect(upperFrontWindows.length).toBeGreaterThan(0);
    // No front exterior wall triangle (brick/wall facing +y) may cover any upper-storey window center.
    for (const w of upperFrontWindows) {
      let occluded = false;
      for (let t = 0; t < indices.length; t += 3) {
        const i0 = indices[t];
        const i1 = indices[t + 1];
        const i2 = indices[t + 2];
        if (b[i0 * STRIDE + 24] !== MAT.brick) continue;
        const ny = (b[i0 * STRIDE + 13] - 128) / 127;
        if (ny < 0.8) continue;
        const y0 = f[i0 * 7 + 1];
        if (y0 < w.y) continue;
        const xs = [f[i0 * 7], f[i1 * 7], f[i2 * 7]];
        const zs = [f[i0 * 7 + 2], f[i1 * 7 + 2], f[i2 * 7 + 2]];
        if (w.x > Math.min(...xs) + 1e-3 && w.x < Math.max(...xs) - 1e-3 && w.z > Math.min(...zs) + 1e-3 && w.z < Math.max(...zs) - 1e-3) {
          occluded = true;
          break;
        }
      }
      expect(occluded).toBe(false);
    }
  });

  it('parts.leave guards against stack underflow', () => {
    const m = new Mesh();
    reset(m);
    expect(() => {
      leave(m);
      leave(m);
      enter(m, 1, 2, 3, 0, 1);
      leave(m);
    }).not.toThrow();
  });
});
