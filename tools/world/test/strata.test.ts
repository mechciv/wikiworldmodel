// What a build gives of the columns of rock with ages (strata.lwt, strata/columns/<n>.json; model:earth/strata), held to
// the snapshot it was made from: a place is in the column whose footprint holds it, a column has the units the snapshot
// gives it, a place's ground at a time is made of the units its column has then, the rock record is read as it was
// before the units' words were added, and the columns are counted against the land and sea of the elevation field.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTile } from '../../../core/container.ts';
import type { CoverageFile } from '../../../core/records.ts';
import type { RocksBin, RocksIndex } from '../../../core/rocks.ts';
import { strataCell, strataColumn, strataColumns, strataFileOf, type StrataColumn, type StrataColumns, type StrataFile, type StrataHeader } from '../../../core/strata.ts';
import { bedrockWords, groundOfStrata, substrateWords, type SubstrateFile } from '../../../core/substrate.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { inOutline } from '../src/build/strata.ts';
import { refLine, type ColumnsSnapshot } from '../src/macrostrat.ts';
import { loadWorld, type World } from '../src/world.ts';
import { dataset, latestBuild } from './helpers.ts';

const json = <T>(name: string): T => JSON.parse(readFileSync(join(latestBuild(), name), 'utf8')) as T;

let world: World;
let ts: Tileset;
let rule: SubstrateFile;
let header: StrataHeader;
let rows: Uint32Array;
let runs: Uint16Array;
let snap: ColumnsSnapshot;
const files = new Map<string, StrataColumns>();
const w = (k: number) => snap.words[k] ?? '';

/** A file of columns of the build, read once. */
const columnsOf = (file: string): StrataColumns => {
  let c = files.get(file);
  if (!c) {
    c = strataColumns(json<StrataFile>(file));
    files.set(file, c);
  }
  return c;
};
/** The column a place of today's Earth lies in, by the build's grid and the file that holds it. */
const columnAt = (lat: number, lon: number): StrataColumn | undefined => {
  const k = strataCell(header.grid, rows, runs, lat, lon);
  const ref = k ? strataFileOf(header.files, k) : undefined;
  return ref ? strataColumn(columnsOf(ref.file), k) : undefined;
};

beforeAll(async () => {
  world = await loadWorld();
  ts = json<Tileset>('tileset.json');
  rule = json<SubstrateFile>(ts.files.substrate!);
  const bytes = readFileSync(join(latestBuild(), ts.files.strata!));
  const tile = decodeTile<StrataHeader>(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  header = tile.header;
  rows = tile.arrays[header.grid.rows] as Uint32Array;
  runs = tile.arrays[header.grid.runs] as Uint16Array;
  snap = JSON.parse(readFileSync(await dataset(header.source, 'snapshot'), 'utf8')) as ColumnsSnapshot;
});

describe('the columns of rock with ages', () => {
  it('puts a place in the column whose footprint holds it, recounted from the snapshot\'s outlines', () => {
    const field = world.fields.find((f) => f.data?.as === 'strata')!;
    expect(header.field).toBe(field.id);
    expect(header.source).toBe(field.data!.from);
    expect(rule.strata).toBe(ts.files.strata);
    const { res, nx, ny } = header.grid;
    expect(res).toBe((field.params as unknown as { cell_deg: number }).cell_deg);
    expect([nx, ny]).toEqual([Math.round(360 / res), Math.round(180 / res)]);
    expect(header.columns).toBe(snap.columns.length);
    // Column by column: every cell whose middle its footprint holds. The smaller of two footprints has a cell both hold.
    const holder = new Map<number, number>();
    const held = new Uint32Array(snap.columns.length);
    snap.columns.forEach((c, k) => {
      let [west, south, east, north] = [180, 90, -180, -90];
      for (const poly of c[8]) {
        for (let p = 0; p < poly[0].length; p += 2) {
          west = Math.min(west, poly[0][p]);
          east = Math.max(east, poly[0][p]);
          south = Math.min(south, poly[0][p + 1]);
          north = Math.max(north, poly[0][p + 1]);
        }
      }
      for (let j = Math.max(0, Math.floor((90 - north) / res)); j <= Math.min(ny - 1, Math.floor((90 - south) / res)); j++) {
        for (let i = Math.max(0, Math.floor((west + 180) / res)); i <= Math.min(nx - 1, Math.floor((east + 180) / res)); i++) {
          if (!inOutline(c[8], -180 + (i + 0.5) * res, 90 - (j + 0.5) * res)) continue;
          const cell = j * nx + i;
          const other = holder.get(cell);
          if (other === undefined || c[6] < snap.columns[other][6]) holder.set(cell, k);
        }
      }
    });
    for (const k of holder.values()) held[k]++;
    // A column too small to hold any cell's middle has the cell its own point lies in, unless the build lists it as lost.
    const coverage = json<CoverageFile>(ts.files.coverage).strata!;
    const lost = new Set(coverage.lost);
    let moved = 0;
    snap.columns.forEach((c, k) => {
      if (held[k]) return;
      if (lost.has(c[0])) {
        expect(strataCell(header.grid, rows, runs, c[4], c[5])).not.toBe(k + 1);
        return;
      }
      expect(strataCell(header.grid, rows, runs, c[4], c[5]), `column ${c[0]}, too small for a cell`).toBe(k + 1);
      holder.set(Math.floor((90 - c[4]) / res) * nx + Math.floor((c[5] + 180) / res), k);
      moved++;
    });
    expect(moved + lost.size).toBeLessThan(snap.columns.length / 100);
    // The grid is that, cell for cell: every cell with a column, and of the rest every seventh each way.
    for (const [cell, k] of holder) expect(strataCell(header.grid, rows, runs, 90 - (Math.floor(cell / nx) + 0.5) * res, -180 + ((cell % nx) + 0.5) * res)).toBe(k + 1);
    for (let j = 3; j < ny; j += 7) for (let i = 3; i < nx; i += 7) if (!holder.has(j * nx + i)) expect(strataCell(header.grid, rows, runs, 90 - (j + 0.5) * res, -180 + (i + 0.5) * res)).toBe(0);
    expect(coverage.cells).toBe(holder.size);
    expect(coverage.columns).toBe(snap.columns.length);
    expect(coverage.units).toBe(snap.units.length);
    // A column's own point is in a cell of its own, but for a few dozen: small footprints, New Zealand's above all,
    // where the middle of the point's cell lies over the edge in a neighbour's, and drill sites inside the rectangle
    // of another.
    let own = 0;
    snap.columns.forEach((c, k) => {
      if (strataCell(header.grid, rows, runs, c[4], c[5]) === k + 1) own++;
    });
    expect(own / snap.columns.length).toBeGreaterThan(0.95);
    // The middle of the Pacific, the Sahara and Siberia lie in none.
    for (const [lat, lon] of [[0, -150], [23, 10], [62, 100]]) expect(columnAt(lat, lon)).toBeUndefined();
  });

  it('gives a column the units its snapshot has, word for word', () => {
    // The files hold every column once, in the order of the grid's numbers.
    expect(header.files[0].first).toBe(1);
    expect(header.files.at(-1)!.last).toBe(snap.columns.length);
    header.files.forEach((f, i) => {
      if (i) expect(f.first).toBe(header.files[i - 1].last + 1);
    });
    const lithology = new Map(snap.lithologies.map((l) => [l[0], l]));
    const environment = new Map(snap.environments.map((e) => [e[0], e]));
    const refs = new Map(snap.refs.map((r) => [r[0], refLine(snap, r)]));
    const units = new Map<number, ColumnsSnapshot['units']>();
    for (const u of snap.units) units.set(u[1], [...(units.get(u[1]) ?? []), u]);
    let seen = 0;
    snap.columns.forEach((c, k) => {
      const ref = strataFileOf(header.files, k + 1)!;
      const column = strataColumn(columnsOf(ref.file), k + 1)!;
      expect(column.column).toBe(c[0]);
      expect(column.name).toBe(w(c[1]));
      expect(column.refs).toEqual(c[7].map((r) => refs.get(r)));
      const given = units.get(c[0]) ?? [];
      expect(column.units.length).toBe(given.length);
      given.forEach((u, n) => {
        const got = column.units[n];
        expect([got.unit, got.name, got.older, got.younger]).toEqual([u[0], w(u[4]) || w(u[3]), u[5], u[6]]);
        // Each environment with the class its own entry of the vocabulary has, and each lithology with its type, group and class.
        expect(got.environments).toEqual(u[17].map((e) => ({ name: w(environment.get(e)![1]), cls: w(environment.get(e)![3]) })));
        expect(got.lithologies).toEqual(
          u[16].map(([l, share, ...atts]) => {
            const v = lithology.get(l)!;
            return { name: w(v[1]), type: w(v[2]), group: w(v[3]), cls: w(v[4]), share: Math.round(share * 1000) / 1000, attributes: atts.map(w) };
          }),
        );
        seen++;
      });
    });
    expect(seen).toBe(snap.units.length);
    // The vocabulary calls two environments a delta plain, one of the sea and one of the land: the units of each keep their own.
    const plains = snap.environments.filter((e) => w(e[1]) === 'delta plain');
    expect(plains.map((e) => w(e[3])).sort()).toEqual(['marine', 'non-marine']);
    for (const e of plains) {
      const u = snap.units.find((x) => x[17].includes(e[0]))!;
      const k = snap.columns.findIndex((c) => c[0] === u[1]);
      const got = strataColumn(columnsOf(strataFileOf(header.files, k + 1)!.file), k + 1)!.units.find((x) => x.unit === u[0])!;
      expect(got.environments).toContainEqual({ name: 'delta plain', cls: w(e[3]) });
    }
    // It spans its units' own time, from the start of the oldest to the end of the youngest.
    const field = world.fields.find((f) => f.data?.as === 'strata')!;
    expect(String(field.time!.lo)).toBe(`${Math.max(...snap.units.map((u) => u[5]))} Ma`);
    expect(String(field.time!.hi)).toBe(`${Math.min(...snap.units.map((u) => u[6]))} Ma`);
  });

  it('makes a place\'s ground of the units its column has at two times, counted again from the snapshot', () => {
    // Huntsville, Alabama, in the column for Madison County.
    const [lat, lon] = [34.73, -86.59];
    const here = columnAt(lat, lon)!;
    expect(here.name).toBe('Madison Co, Alabama');
    const c = snap.columns.find((x) => x[0] === here.column)!;
    expect(inOutline(c[8], lon, lat)).toBe(true);
    const lithology = new Map(snap.lithologies.map((l) => [l[0], w(l[1])]));
    const classOf = new Map(snap.environments.map((e) => [e[0], w(e[3])]));
    const mine = snap.units.filter((u) => u[1] === c[0]);
    const of = { field: header.field, source: header.source, ...(header.credit ? { credit: header.credit } : {}) };
    const at = (ageMa: number) => groundOfStrata(here, ageMa, of, rule.rule);

    // 322.9 Ma, in the Pennsylvanian: the snapshot has one unit of the column then, laid down by rivers and deltas.
    const then = mine.filter((u) => u[5] >= 322.9 && u[6] <= 322.9);
    expect(then.map((u) => w(u[4]))).toEqual(['Pottsville Formation']);
    expect(then[0][17].map((e) => classOf.get(e))).toEqual(['non-marine']);
    // Its lithologies, by what each was laid down as: a sandstone as sand, a shale as mud, a siltstone as silt, a coal as peat.
    const as: Record<string, string> = { sandstone: 'sand', shale: 'mud', siltstone: 'silt', coal: 'organic' };
    const shares = new Map<string, number>();
    for (const [l, share] of then[0][16]) shares.set(as[lithology.get(l)!], (shares.get(as[lithology.get(l)!]) ?? 0) + share);
    expect([...shares.keys()].sort()).toEqual(['mud', 'organic', 'sand', 'silt']);
    const ground = at(322.9).substrate!;
    expect(ground).toMatchObject({ tier: 'model', from: 'strata', weight: 1, source: header.source, rows: [`${header.source}#unit:${then[0][0]}`], column: 'Madison Co, Alabama' });
    expect(ground.units).toEqual([{ name: 'Pottsville Formation', older: then[0][5], younger: then[0][6] }]);
    expect(Object.fromEntries(ground.materials)).toEqual(Object.fromEntries([...shares].map(([m, s]) => [m, Math.round(s * 1000) / 1000])));
    expect(ground.materials[0]).toEqual(['sand', 0.625]);
    expect(at(322.9).bedrock).toBeUndefined();
    expect(substrateWords(ground)).toBe('Ground of sand, mud, peat: Pottsville Formation, 323.4 to 322.3 Ma, the unit being laid down then in the column of rock for Madison Co, Alabama');
    // It is credited to Macrostrat and to the chart the column was compiled from.
    expect(ground.credit).toContain(world.manifest.datasets[header.source].credit!);
    expect(ground.credit).toContain('this column from Childs, O.E., 1985, Correlation of stratigraphic units of North America; COSUNA.');

    // 200 Ma, in the Jurassic: the column has nothing so young. The youngest unit from before is the rock under the ground.
    expect(mine.filter((u) => u[5] >= 200 && u[6] <= 200)).toEqual([]);
    const youngest = Math.min(...mine.filter((u) => u[6] > 200).map((u) => u[6]));
    const before = mine.filter((u) => u[6] === youngest);
    expect(before.map((u) => u[0])).toEqual([then[0][0]]);
    const under = at(200);
    expect(under.substrate).toBeUndefined();
    expect(under.bedrock).toMatchObject({ tier: 'model', from: 'strata', rock: 'siliciclastic', label: 'sandstone', laid: false, rows: [`${header.source}#unit:${before[0][0]}`], source: header.source, field: header.field });
    expect(bedrockWords(under.bedrock!)).toBe('Over sandstone: Pottsville Formation, 323.4 to 322.3 Ma, the youngest unit from before this time in the column of rock for Madison Co, Alabama');

    // 327 Ma, in the Mississippian: the unit of the time was laid down under the sea, and says nothing of a land.
    const sea = mine.filter((u) => u[5] >= 327 && u[6] <= 327);
    expect(sea.length).toBeGreaterThan(0);
    expect(sea.every((u) => u[17].length > 0 && u[17].every((e) => classOf.get(e) === 'marine'))).toBe(true);
    expect(at(327)).toEqual({});
  });

  it('reads the rock record\'s collections as it did before the units\' words were added', () => {
    const index = json<RocksIndex>(ts.files.rocks!);
    const r = rule.rule;
    // Three names both databases use have entries of their own now: each is read as its type in the rock record was.
    for (const name of ['marl', 'ash', 'tuff']) {
      expect(index.lithologies[name], name).toBeDefined();
      expect(r.lithologies[name], name).toEqual(r.types[index.lithologies[name]]);
    }
    // The other names added for the units are none of the rock record's.
    for (const name of ['sand', 'silt', 'clay', 'mud', 'till', 'diamictite', 'volcaniclastic', 'mixed carbonate-siliciclastic', 'welded tuff', 'ignimbrite']) {
      expect(r.lithologies[name], name).toBeDefined();
      expect(index.lithologies[name], name).toBeUndefined();
    }
    // Nor is any adjective added for them one a collection uses: a site's adjectives are a list joined by commas.
    const added = ['light gray', 'dark gray', 'greenish gray', 'bluish gray', 'brownish gray', 'reddish gray', 'yellowish gray', 'light brown', 'dark brown', 'yellowish brown', 'reddish brown', 'brownish red', 'mud cracks', 'symmetric ripples', 'ripple laminations', 'climbing ripples', 'bioturbated', 'bioturbated-weakly', 'bioturbated-moderately', 'bioturbated-thoroughly', 'burrowed', 'concretions-calcareous', 'concretions-ironstone', 'concretions-phosphatic', 'concretions-sideritic', 'sandy', 'silty', 'argillaceous', 'shaly', 'clayey', 'muddy', 'conglomeratic', 'gravelly'];
    for (const a of added) expect(r.adjectives[a], a).toBeDefined();
    const used = new Set<string>();
    for (const ref of index.bins) for (const word of json<RocksBin>(ref.file).words) for (const a of word.split(',')) used.add(a.trim());
    expect(used.has('red')).toBe(true);
    expect(added.filter((a) => used.has(a))).toEqual([]);
    // And a group is the units' vocabulary's alone: the rock record names a type for a lithology, and nothing else.
    expect(Object.keys(r.groups ?? {}).length).toBeGreaterThan(0);
    expect(Object.values(index.lithologies).every((type) => typeof type === 'string')).toBe(true);
  });

  it('is held against the elevation field\'s land and sea, stage by stage, and counts where they disagree', () => {
    const a = json<CoverageFile>(ts.files.coverage).strata!.agreement!;
    expect(a.land).toBe(a.land_land + a.land_gap + a.land_sea + a.land_nothing);
    expect(a.sea).toBe(a.sea_land + a.sea_gap + a.sea_sea + a.sea_nothing);
    expect(a.land).toBeGreaterThan(10000);
    expect(a.sea).toBeGreaterThan(10000);
    // In the field's sea, a column with a unit of the time has one laid down under the sea far more often than on land.
    expect(a.sea_sea).toBeGreaterThan(a.sea_land * 3);
    // On its land, a column most often has a gap: no rock of the time is left there.
    expect(a.land_gap).toBeGreaterThan(a.land_land + a.land_sea);
    // And where it has a unit of the time there, it was laid down under the sea alone about as often as on land:
    // the disagreement the coastline's model records. It is counted, and it is not most of the field's land.
    expect(a.land_sea).toBeGreaterThan(0);
    expect(a.land_sea / a.land).toBeLessThan(0.2);
  });

  it('answers for the ground through deep time where its columns reach, and is on the coverage page', () => {
    const coverage = json<CoverageFile>(ts.files.coverage);
    const lane = coverage.matrix!.sources.find((s) => s.layer === 'substrate' && s.id === header.field)!;
    expect(lane).toMatchObject({ tier: 'model', span: header.span, res_deg: header.grid.res });
    const of = (label: string) => {
      const x = coverage.tiers!.find((s) => s.span === label)!.layers.substrate;
      return (x.evidence + x.model) / (x.evidence + x.model + x.generic + x.unknown);
    };
    // Before the Quaternary the columns answer for more places than the fossil collections alone did.
    expect(of('100–10 Ma')).toBeGreaterThan(0.02);
    expect(of('1000–100 Ma')).toBeGreaterThan(0.01);
  });
});
