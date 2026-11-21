// What a build gives of today's maps of the ground (ground.lwt; model:earth/substrate): the topsoil lies on the land of
// the map of bedrock, which reads none of it; each is held for the span its field names, as the chart dates it; and a
// place has its topsoil in the Holocene and only the rock under it before, back through the Quaternary.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTile } from '../../../core/container.ts';
import type { CoverageFile, PeriodsFile } from '../../../core/records.ts';
import { bedrockAt, groundHeld, soilAt, substrateOfSoil, type GroundHeader, type GroundMaps, type SubstrateFile } from '../../../core/substrate.ts';
import { fromMa } from '../../../core/time.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { parseTopsoil } from '../src/soilgrids.ts';
import { loadWorld, type World } from '../src/world.ts';
import { dataset, latestBuild } from './helpers.ts';

const json = <T>(name: string): T => JSON.parse(readFileSync(join(latestBuild(), name), 'utf8')) as T;

let world: World;
let ts: Tileset;
let file: SubstrateFile;
let maps: GroundMaps;

beforeAll(async () => {
  world = await loadWorld();
  ts = json<Tileset>('tileset.json');
  file = json<SubstrateFile>(ts.files.substrate!);
  const bytes = readFileSync(join(latestBuild(), ts.files.ground!));
  const { header, arrays } = decodeTile<GroundHeader>(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  maps = { header, soil: arrays[header.soil!.array] as Uint8Array, bedrock: arrays[header.bedrock!.array] as Uint8Array };
});

describe("today's maps of the ground", () => {
  it("lays today's topsoil on the land of today's bedrock, better than a cell off any way", () => {
    const s = maps.header.soil!;
    const b = maps.header.bedrock!;
    expect(file.ground).toBe(ts.files.ground);
    expect([s.res, s.nx, s.ny]).toEqual([b.res, b.nx, b.ny]);
    const { nx, ny, res } = s;
    const soil = (k: number) => maps.soil![k * 4] + maps.soil![k * 4 + 1] + maps.soil![k * 4 + 2] > 0;
    // Land a soil could lie on: a class the rule reads, which leaves out water bodies, ice and cells with no data.
    const land = (k: number) => {
      const c = b.classes[String(maps.bedrock![k])];
      return !!c && !!file.rule.bedrock![c.code];
    };
    // Of the cells either map has between two latitudes, the share both have, with the soil moved some cells north and east.
    const agree = (dj: number, di: number, south: number, north: number) => {
      let same = 0;
      let n = 0;
      for (let j = 0; j < ny; j++) {
        const lat = 90 - (j + 0.5) * res;
        if (lat < south || lat > north || j + dj < 0 || j + dj >= ny) continue;
        for (let i = 0; i < nx; i++) {
          const a = soil((j + dj) * nx + ((i + di + nx) % nx));
          const c = land(j * nx + i);
          if (!a && !c) continue;
          n++;
          if (a === c) same++;
        }
      }
      return same / n;
    };
    // The whole of it north of Antarctica; then the bands where the grids' projection is Mollweide's, north and south,
    // and the band between where it is the sinusoidal: a slip in any would show as a better fit a cell off.
    for (const [south, north] of [[-58, 84], [41, 84], [-40, 40], [-58, -41]]) {
      const none = agree(0, 0, south, north);
      expect(none, `${south}° to ${north}°`).toBeGreaterThan(0.8);
      for (const [dj, di] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(agree(dj, di, south, north), `${south}° to ${north}°, moved ${dj}, ${di}`).toBeLessThan(none - 0.01);
    }
  });

  it('holds the topsoil through the Holocene and the bedrock through the Quaternary, as the chart dates them', () => {
    const periods = json<PeriodsFile>(ts.files.periods).periods;
    for (const [as, map] of [['topsoil', maps.header.soil!], ['bedrock', maps.header.bedrock!]] as const) {
      const f = world.fields.find((x) => x.data?.as === as)!;
      const p = periods.find((x) => x.id === (f.params as unknown as { held: string }).held)!;
      expect(map.field).toBe(f.id);
      expect(map.source).toBe(f.data!.from);
      expect(map.held).toBe(p.name);
      // From the period's own start, to within a year; and on past the present, as far as its field holds it.
      expect(Math.abs(map.span[0] - p.start)).toBeLessThan(1);
      expect(map.span[1]).toBeGreaterThan(fromMa(0));
      expect(groundHeld(map, p.start + 1)).toBe(true);
      expect(groundHeld(map, fromMa(0))).toBe(true);
      expect(groundHeld(map, p.start - 1000)).toBe(false);
    }
    expect(maps.header.soil!.held).toBe('Holocene');
    expect(maps.header.bedrock!.held).toBe('Quaternary');
    expect(maps.header.soil!.span[0]).toBeGreaterThan(maps.header.bedrock!.span[0]);
    // The rule's file tells a viewer those spans, so that it sends for the maps only at a time one of them covers.
    expect(file.held).toEqual([maps.header.soil!.span, maps.header.bedrock!.span]);
  });

  it('gives a place its topsoil as its snapshot has it, and the rock under it as its map names it', async () => {
    const f = world.fields.find((x) => x.data?.as === 'topsoil')!;
    const rows = parseTopsoil(readFileSync(await dataset(f.data!.from), 'utf8'));
    // Every hundredth cell of the snapshot: its four parts to the half percent the build keeps, and a ground that adds up.
    for (let k = 0; k < rows.length; k += 100) {
      const r = rows[k];
      const [lat, lon] = [r.lat + 0.25, r.lon + 0.25];
      const parts = soilAt(maps, lat, lon)!;
      for (const p of ['sand', 'silt', 'clay', 'coarse'] as const) expect(Math.abs(parts[p] - r[p])).toBeLessThanOrEqual(0.25);
      const ground = substrateOfSoil(maps, file.rule, lat, lon)!;
      expect(ground).toMatchObject({ tier: 'model', from: 'soil', weight: 1, source: f.data!.from, held: 'Holocene' });
      expect(ground.materials.reduce((n, [, w]) => n + w, 0)).toBeCloseTo(1, 2);
      expect(ground.colours).toEqual([]);
    }
    // The classes the build gives are the field's, and a place's rock is one of them, with the kind the rule reads it as.
    const rock = world.fields.find((x) => x.data?.as === 'bedrock')!;
    const classes = (rock.params as unknown as { classes: { value: number; code: string; label: string }[] }).classes;
    expect(maps.header.bedrock!.classes).toEqual(Object.fromEntries(classes.map((c) => [String(c.value), { code: c.code, label: c.label }])));
    const seen = new Set<string>();
    for (let lat = -55; lat < 80; lat += 5) {
      for (let lon = -177.5; lon < 180; lon += 5) {
        const under = bedrockAt(maps, file.rule, lat, lon);
        if (!under) continue;
        seen.add(under.code);
        expect(classes.find((c) => c.code === under.code)!.label).toBe(under.label);
        expect(under.rock).toBe(file.rule.bedrock![under.code].rock);
        expect(under).toMatchObject({ tier: 'model', field: rock.id, source: rock.data!.from, held: 'Quaternary' });
      }
    }
    // Most of the rule's classes turn up on a grid that coarse, and none it does not read.
    expect(seen.size).toBeGreaterThan(8);
    expect([...seen].every((c) => c in file.rule.bedrock!)).toBe(true);
    // The middle of the Pacific has neither.
    expect(substrateOfSoil(maps, file.rule, 0, -150)).toBeUndefined();
    expect(bedrockAt(maps, file.rule, 0, -150)).toBeUndefined();
  });

  it('answers for the ground of most land in the Holocene and through the Quaternary, and not before from these maps', () => {
    const coverage = json<CoverageFile>(ts.files.coverage);
    const of = (label: string) => {
      const x = coverage.tiers!.find((s) => s.span === label)!.layers.substrate;
      return { evidence: x.evidence, model: x.model, all: x.evidence + x.model + x.generic + x.unknown };
    };
    // A fifth of the globe's places at least: most of its land that is not under ice.
    const recent = of('the last 10 kyr');
    expect(recent.model / recent.all).toBeGreaterThan(0.18);
    const glacial = of('1 Ma–100 ka');
    expect(glacial.model / glacial.all).toBeGreaterThan(0.18);
    // Before the Quaternary only the rocks of fossil collections say anything, of far fewer places.
    const deep = of('100–10 Ma');
    expect((deep.model + deep.evidence) / deep.all).toBeLessThan(0.1);
    // And what answers the layer when is on the coverage page: each map for the span it is held for.
    const lanes = coverage.matrix!.sources.filter((s) => s.layer === 'substrate');
    for (const m of [maps.header.soil!, maps.header.bedrock!]) expect(lanes.find((s) => s.id === m.field)).toMatchObject({ tier: 'model', span: m.span, res_deg: m.res });
  });
});
