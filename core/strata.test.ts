import { describe, expect, it } from 'vitest';
import { strataCell, strataColumn, strataColumns, strataFileOf, strataRuns, unitsAt, type StrataFile, type StrataUnit } from './strata.ts';

describe('a grid of column numbers', () => {
  // Four cells of 90° across and two down: a column in the north-west, another over the two cells east of it, and
  // nothing in the south but one cell on the far east.
  const grid = { res: 90, nx: 4, ny: 2 };
  const cells = Uint16Array.of(1, 2, 2, 0, 0, 0, 0, 3);
  const { rows, runs } = strataRuns(cells, grid.nx, grid.ny);

  it('is kept as runs along its rows, and read back cell for cell', () => {
    expect([...rows]).toEqual([0, 3, 5]);
    expect([...runs]).toEqual([1, 1, 2, 2, 1, 0, 3, 0, 1, 3]);
    for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) expect(strataCell(grid, rows, runs, 45 - j * 90, -135 + i * 90)).toBe(cells[j * grid.nx + i]);
  });

  it('finds a place in its cell: at its edges, round the world and at the poles', () => {
    expect(strataCell(grid, rows, runs, 89.9, -179.9)).toBe(1);
    expect(strataCell(grid, rows, runs, 0.1, -90.1)).toBe(1);
    expect(strataCell(grid, rows, runs, 0.1, -90)).toBe(2);
    expect(strataCell(grid, rows, runs, 90, 0)).toBe(2);
    expect(strataCell(grid, rows, runs, -90, 135)).toBe(3);
    // A longitude counted on past 180° is the same place.
    expect(strataCell(grid, rows, runs, -45, 135 - 360)).toBe(3);
    expect(strataCell(grid, rows, runs, 45, -135 + 360)).toBe(1);
    expect(strataCell(grid, rows, runs, 45, 180)).toBe(1);
  });

  it('refuses a grid that is not its size', () => {
    expect(() => strataRuns(cells, 3, 2)).toThrow(/6|8/);
  });

  it('keeps an empty row as one run', () => {
    const empty = strataRuns(new Uint16Array(8), 4, 2);
    expect([...empty.runs]).toEqual([4, 0, 4, 0]);
    expect(strataCell(grid, empty.rows, empty.runs, 10, 10)).toBe(0);
  });
});

const file: StrataFile = {
  format: 'lightworld-strata-columns@1',
  first: 5,
  last: 6,
  words: ['', 'Red Basin', 'River Beds', 'sandstone', 'siliciclastic', 'sandstones', 'sedimentary', 'red', 'delta plain', 'non-marine', 'A. Author, 1985, A chart.', 'Far Hills', 'basalt', 'volcanic', 'mafic', 'igneous', 'marine', 'Bay Beds'],
  // By their places in these lists: sandstone 0, basalt 1; a delta plain of the land 0, and one of the sea 1.
  lithologies: [
    [3, 4, 5, 6],
    [12, 13, 14, 15],
  ],
  environments: [
    [8, 9],
    [8, 16],
  ],
  refs: [[1, 10]],
  columns: [
    [70, 1, [1], [[900, 2, 160, 150, [0], [[0, 625, 7], [1, 375]]], [901, 17, 150, 140, [1, 0], [[0, 1000]]]]],
    [71, 11, [], []],
  ],
};

describe('the columns of a file', () => {
  it('are read out of its numbers, with what the vocabulary says of their words', () => {
    const c = strataColumns(file);
    const sandstone = { name: 'sandstone', type: 'siliciclastic', group: 'sandstones', cls: 'sedimentary' };
    expect(c.columns[0]).toEqual({
      column: 70,
      name: 'Red Basin',
      refs: ['A. Author, 1985, A chart.'],
      units: [
        { unit: 900, name: 'River Beds', older: 160, younger: 150, environments: [{ name: 'delta plain', cls: 'non-marine' }], lithologies: [{ ...sandstone, share: 0.625, attributes: ['red'] }, { name: 'basalt', type: 'volcanic', group: 'mafic', cls: 'igneous', share: 0.375, attributes: [] }] },
        // One name for two environments: each keeps the class its own entry has.
        { unit: 901, name: 'Bay Beds', older: 150, younger: 140, environments: [{ name: 'delta plain', cls: 'marine' }, { name: 'delta plain', cls: 'non-marine' }], lithologies: [{ ...sandstone, share: 1, attributes: [] }] },
      ],
    });
    expect(c.columns[1]).toEqual({ column: 71, name: 'Far Hills', refs: [], units: [] });
  });

  it('are found by their numbers in the grid', () => {
    const c = strataColumns(file);
    expect(strataColumn(c, 5)!.name).toBe('Red Basin');
    expect(strataColumn(c, 6)!.name).toBe('Far Hills');
    expect(strataColumn(c, 4)).toBeUndefined();
    expect(strataColumn(c, 7)).toBeUndefined();
    const files = [{ first: 1, last: 4, file: 'a' }, { first: 5, last: 6, file: 'b' }];
    expect(strataFileOf(files, 5)!.file).toBe('b');
    expect(strataFileOf(files, 4)!.file).toBe('a');
    expect(strataFileOf(files, 0)).toBeUndefined();
    expect(strataFileOf(files, 7)).toBeUndefined();
  });
});

const unit = (n: number, older: number, younger: number): StrataUnit => ({ unit: n, name: `unit ${n}`, older, younger, environments: [], lithologies: [] });

describe('the units of a column at an age', () => {
  // From the top: 10 to 0, a gap, two that stopped together at 50, a gap, 300 to 200.
  const column = { units: [unit(1, 10, 0), unit(2, 80, 50), unit(3, 60, 50), unit(4, 300, 200), unit(5, 70, 55)] };
  const numbers = (us: StrataUnit[]) => us.map((u) => u.unit);

  it('are those whose span holds it, ends and all', () => {
    expect(numbers(unitsAt(column, 5).laid)).toEqual([1]);
    expect(numbers(unitsAt(column, 0).laid)).toEqual([1]);
    expect(numbers(unitsAt(column, 10).laid)).toEqual([1]);
    expect(numbers(unitsAt(column, 58).laid)).toEqual([2, 3, 5]);
    expect(numbers(unitsAt(column, 75).laid)).toEqual([2]);
    expect(numbers(unitsAt(column, 250).laid)).toEqual([4]);
  });

  it('are none in a gap, where the youngest from wholly before are named instead', () => {
    const gap = unitsAt(column, 30);
    expect(gap.laid).toEqual([]);
    // Two stopped together at 50; the one that stopped at 55 is older than they.
    expect(numbers(gap.before)).toEqual([2, 3]);
    expect(numbers(unitsAt(column, 150).before)).toEqual([4]);
    expect(unitsAt(column, 150).laid).toEqual([]);
    // Before the column's oldest unit there is nothing from before.
    expect(unitsAt(column, 400)).toEqual({ laid: [], before: [] });
    // And with a unit being laid down, the youngest from before it is still named.
    expect(numbers(unitsAt(column, 5).before)).toEqual([2, 3]);
  });
});
