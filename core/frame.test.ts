import { describe, expect, it } from 'vitest';
import { makeFrame, type FrameLine } from './frame.ts';

const box = (id: string, x0: number, y0: number, x1: number, y1: number): FrameLine => ({
  id,
  kind: 'edge',
  points: [x0, y0, x1, y0, x1, y1, x0, y1],
  closed: true,
});
const street = (id: string, ...points: number[]): FrameLine => ({ id, kind: 'street', points });
const ground = box('ground', -100, -100, 100, 100);
/** The face that holds a point. */
const faceAt = (f: ReturnType<typeof makeFrame>, x: number, y: number) =>
  f.faces.find((face) => {
    const r = face.outer;
    let c = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2)
      if (r[i + 1] > y !== r[j + 1] > y && x < ((r[j] - r[i]) * (y - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c;
    return c;
  })!;

describe('the frame', () => {
  it('cuts the ground into the faces its lines enclose', () => {
    const f = makeFrame([ground, street('a', -100, 0, 100, 0), street('b', 0, -100, 0, 100)]);
    expect(f.faces.length).toBe(4);
    for (const face of f.faces) expect(face.area).toBeCloseTo(10000, 6);
    // Every face is counter-clockwise and says which lines run along each of its sides.
    for (const face of f.faces) {
      expect(face.sides.length).toBe(face.outer.length / 2);
      expect(new Set(face.sides)).toEqual(new Set(['a', 'b', 'ground']));
    }
  });

  it('finds the same faces whatever order the lines come in', () => {
    const lines = [ground, street('a', -100, 0, 100, 0), street('b', 0, -100, 0, 100), street('c', -100, -60, 100, 40)];
    const ids = makeFrame(lines).faces.map((f) => f.id);
    expect(makeFrame([...lines].reverse()).faces.map((f) => f.id)).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves a face alone when a line ends on its edge from the other side', () => {
    const before = makeFrame([ground, street('a', -100, 0, 100, 0)]);
    const after = makeFrame([ground, street('a', -100, 0, 100, 0), street('c', 0, -100, 0, 0)]);
    expect(faceAt(after, 10, 50).id).toBe(faceAt(before, 10, 50).id);
    // The other side is cut in two, each a new face.
    expect(after.faces.length).toBe(3);
    expect(faceAt(after, -10, -50).id).not.toBe(faceAt(before, -10, -50).id);
    // The face above keeps the line's own points only: the junction below is not one of its corners.
    expect(faceAt(after, 10, 50).plain).toEqual(faceAt(before, 10, 50).plain);
    expect(faceAt(after, 10, 50).outer.length).toBe(faceAt(before, 10, 50).outer.length + 2);
  });

  it('makes new faces only where a line is drawn across', () => {
    const lines = [ground, street('a', -100, 0, 100, 0), street('b', 0, -100, 0, 100)];
    const before = makeFrame(lines);
    const after = makeFrame([...lines, street('d', 50, 0, 50, 100)]);
    expect(after.faces.length).toBe(5);
    for (const [x, y] of [[-50, 50], [-50, -50], [50, -50]]) expect(faceAt(after, x, y).id).toBe(faceAt(before, x, y).id);
    expect(faceAt(after, 25, 50).id).not.toBe(faceAt(before, 25, 50).id);
    expect(faceAt(after, 25, 50).area + faceAt(after, 75, 50).area).toBeCloseTo(10000, 6);
  });

  it('runs a street along a wall as one edge with both lines', () => {
    const f = makeFrame([ground, { id: 'w', kind: 'wall', points: [-100, -50, 100, -50] }, street('t', -50, -50, 50, -50)]);
    const along = f.edges.filter((e) => e.lines.length === 2);
    expect(along.length).toBe(1);
    expect(along[0].lines).toEqual(['t', 'w']);
    expect(f.faces.length).toBe(2);
  });

  it('holds a ring that touches nothing as a hole of the face round it, and a face of its own', () => {
    const f = makeFrame([ground, { ...box('r', 20, 20, 40, 40), kind: 'wall' }]);
    expect(f.faces.length).toBe(2);
    const out = faceAt(f, -50, -50);
    expect(out.holes.length).toBe(1);
    expect(out.area).toBeCloseTo(40000 - 400, 6);
    expect(faceAt(f, 30, 30).area).toBeCloseTo(400, 6);
  });

  it('keeps a line that ends inside a face as a spur of it', () => {
    const f = makeFrame([ground, street('s', -100, 10, 30, 10), street('u', 50, -50, 60, -40)]);
    expect(f.faces.length).toBe(1);
    const [face] = f.faces;
    expect(face.area).toBeCloseTo(40000, 6);
    expect(face.spurs.map((s) => s.lines).sort()).toEqual(['s', 'u']);
    expect(face.spurs.find((s) => s.lines === 's')!.points).toEqual([-100, 10, 30, 10]);
  });

  it('closes a tangle of lines into faces that cover the ground once', () => {
    let s = 12345;
    const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296) * 200 - 100;
    const lines: FrameLine[] = [ground];
    for (let i = 0; i < 40; i++) lines.push(street(`l${i}`, r(), r(), r(), r(), r(), r()));
    const f = makeFrame(lines);
    const total = f.faces.reduce((a, face) => a + face.area, 0);
    expect(total).toBeCloseTo(40000, 3);
    for (const face of f.faces) expect(face.area).toBeGreaterThan(0);
    expect(new Set(f.faces.map((face) => face.id)).size).toBe(f.faces.length);
  });
});
