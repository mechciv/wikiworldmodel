// The reader of SoilGrids' topsoil (tools/world/src/soilgrids.ts): the projection ISRIC serves its grids in, the mean
// of a grid over the cells of a snapshot, and the snapshot's text. And what the build reads of today's maps of the
// ground (tools/world/src/build/groundmaps.ts): the topsoil's bytes, an ASCII grid and the table of its classes.
import { describe, expect, it } from 'vitest';
import { ascGrid, classTable, soilBytes } from '../src/build/groundmaps.ts';
import { cellMeans, homolosine, parseTopsoil, snapshotText, soilCells, type SoilRaster } from '../src/soilgrids.ts';

const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;
/** Where the projection changes from the sinusoidal to Mollweide's. */
const SWITCH = 40 + 44 / 60 + 11.8 / 3600;

describe('the interrupted Goode homolosine projection', () => {
  it('is the sinusoidal near the equator, about the middle meridian of its lobe', () => {
    // On a lobe's middle meridian, east is that meridian's and north the latitude's arc.
    for (const [lat, lon] of [[0, 30], [20, 30], [-30, 20], [10, -100], [-10, -60], [-20, 140], [-5, -160]]) {
      const [x, y] = homolosine(lat, lon);
      expect(x).toBeCloseTo(R * rad(lon), 3);
      expect(y).toBeCloseTo(R * rad(lat), 3);
    }
    // Off it, a parallel is as long as it is on the globe: ten degrees east at 30° N is cos 30° of ten degrees' arc.
    expect(homolosine(30, 40)[0] - homolosine(30, 30)[0]).toBeCloseTo(R * rad(10) * Math.cos(rad(30)), 3);
  });

  it("is Mollweide's beyond 40° 44′, meeting the sinusoidal there with no step", () => {
    // Within a few metres, a thousandth of a pixel: the latitude they meet at is given to a tenth of a second.
    for (const lon of [30, 60, -100, -150]) {
      const below = homolosine(SWITCH - 1e-6, lon);
      const above = homolosine(SWITCH + 1e-6, lon);
      expect(Math.abs(above[0] - below[0])).toBeLessThan(5);
      expect(Math.abs(above[1] - below[1])).toBeLessThan(5);
      const south = [homolosine(-SWITCH + 1e-6, lon), homolosine(-SWITCH - 1e-6, lon)];
      expect(Math.abs(south[0][0] - south[1][0])).toBeLessThan(5);
      expect(Math.abs(south[0][1] - south[1][1])).toBeLessThan(5);
    }
    // A pole is a point on each lobe's middle meridian, and nearer the equator than its arc.
    const pole = homolosine(90, 75);
    expect(pole[0]).toBeCloseTo(R * rad(30), 3);
    expect(pole[1]).toBeCloseTo(R * (Math.SQRT2 - 0.0528035274542), 3);
    expect(homolosine(-90, 0)[1]).toBeCloseTo(-pole[1], 3);
    // And it keeps areas: a degree of latitude there is shorter than at the equator.
    expect(homolosine(81, 30)[1] - homolosine(80, 30)[1]).toBeLessThan(R * rad(1));
  });

  it('cuts the north into two lobes and the south into four, with a gap between them away from the equator', () => {
    // Either side of the cut at 40° W in the north, and of those at 100° W, 20° W and 80° E in the south.
    for (const [lat, cut] of [[50, -40], [-50, -100], [-50, -20], [-50, 80]]) {
      const west = homolosine(lat, cut - 1e-9)[0];
      const east = homolosine(lat, cut + 1e-9)[0];
      expect(east - west).toBeGreaterThan(500_000);
    }
    // At the equator the lobes touch.
    expect(Math.abs(homolosine(0, -40 + 1e-9)[0] - homolosine(0, -40 - 1e-9)[0])).toBeLessThan(1);
  });
});

describe("a grid's mean over the cells of a snapshot", () => {
  // A grid of 5 km pixels over 0–10° N and about 25–35° E, on the lobe whose middle is 30° E: every pixel 500 west of
  // a line, and nothing east of it.
  const raster = (edgeLon: number): SoilRaster => {
    const x0 = R * rad(25);
    const y0 = R * rad(10);
    const width = Math.ceil((R * rad(10)) / 5000);
    const height = Math.ceil((R * rad(10)) / 5000);
    const data = new Int16Array(width * height).fill(-32768);
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) if (x0 + (col + 0.5) * 5000 < R * rad(edgeLon)) data[row * width + col] = 500;
    return { width, height, data, x0, y0, dx: 5000, dy: 5000, nodata: -32768 };
  };
  const at = (m: { nx: number }, lat: number, lon: number, cell: number) => Math.floor((90 - lat) / cell) * m.nx + Math.floor((lon + 180) / cell);

  it('is the mean of the pixels under a lattice of points across each cell, with the share of them that had one', () => {
    const m = cellMeans(raster(30), 5, 6);
    expect([m.nx, m.ny]).toEqual([72, 36]);
    // West of the line the cell is full; east of it, and outside the grid, there is nothing.
    expect(m.mean[at(m, 2, 27, 5)]).toBe(500);
    expect(m.share[at(m, 2, 27, 5)]).toBe(1);
    expect(m.share[at(m, 2, 32, 5)]).toBe(0);
    expect(Number.isNaN(m.mean[at(m, 2, 32, 5)])).toBe(true);
    expect(m.share[at(m, 20, 27, 5)]).toBe(0);
    expect(m.share[at(m, -2, 27, 5)]).toBe(0);
    // A line through the middle of a cell leaves it half full, at the same mean.
    const half = cellMeans(raster(27.5), 5, 6);
    expect(half.mean[at(half, 2, 27, 5)]).toBe(500);
    expect(half.share[at(half, 2, 27, 5)]).toBeGreaterThan(0.4);
    expect(half.share[at(half, 2, 27, 5)]).toBeLessThan(0.6);
  });

  it('keeps a cell with soil over enough of it, in percent, and writes and reads it back', () => {
    const one = (mean: number, share: number) => ({ mean: Float32Array.of(mean, mean, NaN, mean), share: Float32Array.of(share, 0.05, 0, 1), nx: 2, ny: 2 });
    const cells = soilCells({ sand: one(523.4, 0.5), silt: one(300, 0.5), clay: one(176.6, 0.5), coarse: one(81, 0.5) }, 90);
    // The second cell has soil under a twentieth of it and the third under none: neither is kept.
    expect(cells).toEqual([
      { lat: 0, lon: -180, land: 0.5, sand: 52.3, silt: 30, clay: 17.7, coarse: 8.1 },
      { lat: -90, lon: -90, land: 1, sand: 52.3, silt: 30, clay: 17.7, coarse: 8.1 },
    ]);
    const text = snapshotText(cells, [{ name: 'sand', bytes: 10, sha256: 'ab' }]);
    expect(text.split('\n').filter((l) => !l.startsWith('#'))).toEqual(['lat,lon,land,sand,silt,clay,coarse', '0,-180,0.5,52.3,30,17.7,8.1', '-90,-90,1,52.3,30,17.7,8.1', '']);
    expect(text).toMatch(/sand_0-5cm_mean_5000\.tif,10,ab/);
    expect(parseTopsoil(text)).toEqual(cells);
  });
});

describe("what the build reads of today's maps of the ground", () => {
  it("packs the topsoil four bytes a cell, in half percents, by each row's south-west corner", () => {
    const text = '# a comment\nlat,lon,land,sand,silt,clay,coarse\n0,-180,1,52.3,30,17.7,8.1\n-90,90,0.4,10,20,70,0\n';
    const b = soilBytes(text, 90);
    expect(b.length).toBe(4 * 2 * 4);
    expect([...b.slice(0, 4)]).toEqual([105, 60, 35, 16]);
    // The southern row's last cell but one.
    expect([...b.slice((4 + 3) * 4, (4 + 3) * 4 + 4)]).toEqual([20, 40, 140, 0]);
    expect(b.filter((v) => v > 0).length).toBe(7);
    expect(() => soilBytes('lat,lon,land,sand,silt,clay,coarse\n10,-180,1,50,30,20,0\n', 90)).toThrow(/not a corner/);
  });

  it('reads an ASCII grid from the north, and the table of its classes', () => {
    const g = ascGrid('ncols         4\nnrows         2\nxllcorner     -180\nyllcorner     -90\ncellsize      90\nNODATA_value  -9999\n1 2 -9999 16\n-9999 -9999 3 -9999\n');
    expect(g).toMatchObject({ nx: 4, ny: 2, res: 90, west: -180, south: -90, nodata: -9999 });
    expect([...g.values]).toEqual([1, 2, -9999, 16, -9999, -9999, 3, -9999]);
    expect(() => ascGrid('ncols 4\nnrows 2\ncellsize 90\n1 2 3\n')).toThrow(/has 3 values/);
    const t = classTable('"OBJECTID";"Value_";"Count_";"xx"\n1;1;35356728.000000;"su"\n2;2;6329752.000000;"vb"\n\n');
    expect([...t]).toEqual([
      [1, 'su'],
      [2, 'vb'],
    ]);
  });
});
