// A farming settlement laid out from its access ways. Each side lane grows out from the through lane over
// passable ground. A household takes a frontage on a side lane and keeps an entrance to it. All distances
// and lines here are procedural. The regional people, house dimensions and any stated facing come from the caller.
import { hash2, PI, TAU } from '../../city/math.ts';
import { plotAt, plotDomainAt, plotNumber, plotPlaceInDomain, type PlotStyle } from '../../../../core/plots.ts';

export type Point = [number, number];
export interface Lane { line: number[]; width: number }
export interface LaneWidths { main: number; side: number; foot: number }
interface Lot { at: Point; face: number; variant: number; rank: number }
interface Footprint { w: number; l: number; door: number }
export interface FarmLayout {
  lots: Lot[];
  lanes: Lane[];
  /** The through lane’s ends in the fields, to which paths from neighbours can connect. */
  exits: Point[];
  radius: number;
  boundary: Point[];
}

function cornersOf(at: Point, face: number, shape: Footprint): Point[] {
  const sin = Math.sin(face), cos = Math.cos(face);
  return [-1, 1].flatMap(a => [-1, 1].map(b =>
    [at[0] + a * cos * shape.w / 2 + b * sin * shape.l / 2, at[1] - a * sin * shape.w / 2 + b * cos * shape.l / 2] as Point));
}

/** Test the full width of the way, including samples between its two ends. */
function walkable(a: Point, b: Point, width: number, fits: (x: number, y: number) => boolean): boolean {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (!length) return fits(...a);
  const nx = -dy / length * width / 2, ny = dx / length * width / 2;
  const steps = Math.ceil(length / 4);
  for (let i = 0; i <= steps; i++) {
    const x = a[0] + dx * i / steps, y = a[1] + dy * i / steps;
    if (!fits(x, y) || !fits(x + nx, y + ny) || !fits(x - nx, y - ny)) return false;
  }
  return true;
}

/** Extend a field entrance to the nearest reachable balk of the same domain parcel that the ground shader draws. */
function fieldEdge(tip: Point, style: PlotStyle, fits: (x: number, y: number) => boolean, width: number): Point {
  const { domain } = plotDomainAt(tip[0], tip[1], style);
  const p = plotAt(tip[0], tip[1], style);
  const stagger = style.kind === 1 ? 0.15 : 0.65;
  const shift = plotNumber(p.ci, domain.salt, 41) * p.sy * stagger;
  const candidates: Point[] = [
    plotPlaceInDomain(p.ci * p.sx, p.along, domain, style),
    plotPlaceInDomain((p.ci + 1) * p.sx, p.along, domain, style),
    plotPlaceInDomain(p.across, p.cj * p.sy - shift, domain, style),
    plotPlaceInDomain(p.across, (p.cj + 1) * p.sy - shift, domain, style),
  ];
  const distance = (pt: Point) => Math.hypot(pt[0] - tip[0], pt[1] - tip[1]);
  return candidates.sort((a, b) => distance(a) - distance(b)).find(pt => distance(pt) <= 45 && walkable(tip, pt, width, fits)) ?? tip;
}

export function farmLanes(origin: Point, count: number, seed: number, lotSide: number, footprints: Footprint[],
  facing: number | undefined, dispersed: boolean, widths: LaneWidths, gates: number, fieldRadius: number, plots: PlotStyle,
  fits: (x: number, y: number) => boolean, contour?: number): FarmLayout {
  const seedAngle = hash2(1, 7, seed);
  // A preferred orientation constrains the houses. Their approach can still turn with the hillside.
  const base = facing ?? contour ?? seedAngle * TAU;
  const towardContour = contour === undefined ? 0 : Math.atan(Math.tan(contour - base));
  const axis = base + Math.max(-0.3, Math.min(0.3, towardContour)) + (seedAngle - 0.5) * 0.35;
  const sin = Math.sin(axis), cos = Math.cos(axis);
  const point = (x: number, y: number): Point => [origin[0] + cos * x + sin * y, origin[1] - sin * x + cos * y];
  const w = Math.max(...footprints.map(s => s.w)), l = Math.max(...footprints.map(s => s.l));
  // A handful of compounds share a turnoff. Some yards have a second frontage further along it.
  // The near pair and rear pair leave the turnoff between them, even where their doors all face south.
  const pitch = Math.max(w + 4, lotSide * 0.9) * (dispersed ? 1.55 : 1);
  const depth = Math.max(l + 7, lotSide) * (dispersed ? 1.45 : 1);
  const lanes: Lane[] = [], lots: Lot[] = [], exits: Point[] = [], corners: Point[] = [];
  // A single holding stays at its seeded site. Two or three holdings share a field track with
  // separate turnoffs. They have no village centre to reserve or streets to grow around it.
  if (dispersed && count <= 3) {
    const stops: { x: number; p: Point }[] = [];
    for (let i = 0; i < count; i++) {
      const variant = Math.floor(hash2(i, 12, seed) * footprints.length);
      const shape = footprints[variant];
      const x = (i === 2 ? -1 : i) * pitch * (1 + hash2(i, 2, seed));
      const y = i ? (hash2(i, 3, seed) - 0.5) * depth * 0.5 : 0;
      const at = point(x, y), face = facing ?? axis;
      const door: Point = [at[0] + Math.sin(face) * shape.door, at[1] + Math.cos(face) * shape.door];
      const turn = point(x, y + Math.max(shape.door + 6, shape.l / 2 + 3));
      if (!fits(...at) || !walkable(door, turn, widths.foot, fits)) continue;
      if (x && (!stops.length || !walkable(stops[0].p, turn, widths.main, fits))) continue;
      const edges = cornersOf(at, face, shape);
      if (edges.some(c => !fits(...c))) continue;
      corners.push(...edges);
      lots.push({ at, face, variant, rank: Math.floor(hash2(i, 9, seed) * 256) });
      lanes.push({ line: [...door, ...turn], width: widths.foot });
      stops.push({ x, p: turn });
    }
    stops.sort((a, b) => a.x - b.x);
    const through = stops.map(s => s.p);
    if (stops.length) for (const dir of [-1, 1]) {
      const end = dir < 0 ? stops[0].p : stops[stops.length - 1].p;
      const reach = Math.min(pitch * 0.5, 30);
      const tip: Point = [end[0] + dir * cos * reach, end[1] - dir * sin * reach];
      if (!walkable(end, tip, widths.main, fits)) continue;
      if (dir < 0) through.unshift(tip);
      else through.push(tip);
      exits.push(tip);
      const edge = fieldEdge(tip, plots, fits, widths.foot);
      if (edge !== tip) lanes.push({ line: [...tip, ...edge], width: widths.foot });
    }
    if (through.length > 1) lanes.push({ line: through.flat(), width: widths.main });
    const radius = corners.reduce((r, p) => Math.max(r, Math.hypot(p[0] - origin[0], p[1] - origin[1])), 0) + widths.main;
    return { lots, lanes, exits, radius, boundary: enclosureOutline(corners, widths.main + 3) };
  }
  const bands = Math.max(1, Math.round(Math.sqrt(count / 4)));
  const clusters = Math.max(1, Math.round(count / (bands * 4.8)));
  const bend = (y: number) => Math.sin(y / (depth * 3) + seed % 17) * pitch * 0.62
    + Math.sin(y / (depth * 1.7) + seed % 7) * pitch * 0.23;
  const spinePoint = (y: number) => point(bend(y) - bend(0), y);
  const streets = new LaneGround([]);
  const occupied = new LaneGround([]);
  const clear = (x: number, y: number) => fits(x, y) && !occupied.contains(x, y);
  const roots = Array.from({ length: bands * 2 + 6 }, (_, k) => {
    const band = k % 2 ? -(k + 1) / 2 : k / 2;
    return [-1, 1].map(dir => {
      const y = depth * (band * 2.65 + dir * (0.25 + hash2(k, dir + 2, seed) * 0.36));
      return { k, band, dir, y, at: spinePoint(y), reachable: false };
    });
  }).flat();
  // Reserve the whole spine in geographic order before growing the neighbourhoods, stopping at an obstacle.
  for (const sign of [-1, 1]) {
    let last = origin;
    for (const root of roots.filter(r => sign * r.y > 0).sort((a, b) => sign * (a.y - b.y))) {
      if (!walkable(last, root.at, widths.main, fits)) break;
      root.reachable = true;
      streets.add([...last, ...root.at], widths.main);
      last = root.at;
    }
  }
  const spine: { y: number; at: Point }[] = [{ y: 0, at: origin }];
  let radius = 0;
  for (const { k, band, dir, y, at: root, reachable } of roots) {
    if (lots.length === count) break;
    if (!reachable) continue;
    spine.push({ y, at: root });
    const taper = Math.max(0.55, 1 - Math.abs(band) / (bands + 1));
    const offset = bend(y) - bend(0);
    const sign = facing !== undefined || dir > 0 ? 1 : -1;
    const street: number[] = [...root];
    let last = root;
    let distance = pitch * (0.6 + 0.4 * hash2(k, dir + 4, seed));
    const reach = Math.max(1, Math.round(clusters * taper * (0.85 + 0.45 * hash2(k, dir + 7, seed))));
    for (let i = 0; i < reach && lots.length < count; i++) {
      const slot = (k * (clusters + 3) + i) * 2 + Number(dir > 0);
      distance += pitch * (1.25 + 0.45 * hash2(slot, 5, seed));
      const x = offset + dir * distance;
      const laneY = y + depth * (hash2(slot, 6, seed) - 0.5) * 0.43;
      const turn = point(x, laneY);
      if (!walkable(last, turn, widths.side, clear)) break;
      streets.add([...last, ...turn], widths.side);
      street.push(...turn);
      last = turn;
      const yardWay = [...turn];
      let yardEnd = turn;
      const back = hash2(slot, 13, seed) < 0.65 && !dispersed;
      for (let r = 0; r <= Number(back); r++) {
        const dy = (0.38 + r * 1.02 + 0.12 * hash2(slot, 19 + r, seed)) * depth;
        const along = laneY - sign * dy;
        const junction = point(x, along);
        if (!walkable(yardEnd, junction, widths.foot, clear)) break;
        streets.add([...yardEnd, ...junction], widths.foot);
        let used = false;
        for (const side of [-1, 1]) {
          if (lots.length === count || (side > 0 && hash2(slot, r + 9, seed) < 0.2)) continue;
          const id = slot * 4 + r * 2 + Number(side > 0);
          const variant = Math.floor(hash2(id, 12, seed) * footprints.length);
          const shape = footprints[variant];
          const setback = 1.5 + 1.8 * hash2(id, 4, seed);
          const parcelRadius = Math.hypot(shape.w, shape.l) / 2;
          const across = x + side * (Math.max(pitch * 0.47, parcelRadius + widths.foot / 2 + 1) + pitch * 0.13 * hash2(id, 18, seed));
          const hy = along - sign * (shape.door + setback);
          const angle = (hash2(id, 24, seed) - 0.5) * 0.21;
          const face = (facing ?? axis) + (sign > 0 ? 0 : PI) + angle;
          const at = point(across, hy);
          const door: Point = [at[0] + Math.sin(face) * shape.door, at[1] + Math.cos(face) * shape.door];
          const front = point(across, along);
          // The long dimension reserves yard space too. Test its corners against the same terrain as the streets.
          const edges = cornersOf(at, face, shape);
          if (occupied.near(...at, parcelRadius) || streets.near(...at, parcelRadius) || edges.some(c => !fits(...c)) || !fits(...at) || !walkable(door, front, widths.foot, clear)
            || !walkable(front, junction, widths.foot, clear)) continue;
          occupied.add([...at, ...at], parcelRadius * 2);
          streets.add([...junction, ...front, ...door], widths.foot);
          lots.push({ at, face, variant, rank: Math.floor(hash2(id, 9, seed) * 256) });
          lanes.push({ line: [...junction, ...front, ...door], width: widths.foot });
          used = true;
          for (const c of edges) {
            radius = Math.max(radius, Math.hypot(c[0] - origin[0], c[1] - origin[1]));
            corners.push(c);
          }
        }
        if (used) {
          yardWay.push(...junction);
          yardEnd = junction;
        }
      }
      if (yardWay.length > 2) lanes.push({ line: yardWay, width: widths.foot });
      distance += pitch * (0.48 + 0.4 * hash2(slot, 14, seed));
    }
    if (street.length > 2) lanes.push({ line: street, width: widths.side });
  }
  // Keep the main way connected in order even when its two banks were populated at different times.
  spine.sort((a, b) => a.y - b.y);
  const through = spine.map(s => s.at);
  corners.push(...through);
  const boundary = enclosureOutline(corners, widths.main + 3);
  radius += widths.main + 2;
  if (lots.length) {
    for (const sign of [-1, 1]) {
      if (sign < 0 && gates <= 1) continue;
      const last = sign < 0 ? through[0] : through[through.length - 1];
      const y = sign * (radius + Math.min(50, Math.max(4, (fieldRadius - radius) * 0.4)));
      const tip = spinePoint(y);
      if (!walkable(last, tip, widths.main, clear)) continue;
      if (sign < 0) through.unshift(tip);
      else through.push(tip);
      const edge = fieldEdge(tip, plots, fits, widths.foot);
      if (edge !== tip && Math.hypot(edge[0] - origin[0], edge[1] - origin[1]) > radius + 2)
        lanes.push({ line: [...tip, ...edge], width: widths.foot });
      exits.push(tip);
    }
    if (through.length > 1) lanes.push({ line: through.flat(), width: widths.main });
  }
  return { lots, lanes, exits, radius, boundary };
}

/** A margin around the occupied lots. The convex hull also keeps every lane between two courts inside. */
function enclosureOutline(corners: Point[], margin: number): Point[] {
  const points = corners.flatMap(([x, y]) => [[x - margin, y], [x + margin, y], [x, y - margin], [x, y + margin]] as Point[])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (points: Point[]) => {
    const edge: Point[] = [];
    for (const p of points) {
      while (edge.length >= 2) {
        const a = edge[edge.length - 2], b = edge[edge.length - 1];
        if ((b[0] - a[0]) * (p[1] - a[1]) > (b[1] - a[1]) * (p[0] - a[0])) break;
        edge.pop();
      }
      edge.push(p);
    }
    edge.pop();
    return edge;
  };
  return [...half(points), ...half(points.reverse())];
}

/** Index short pieces of lane so local plants and field materials leave their ground clear. */
export class LaneGround {
  private cells = new Map<number, { ax: number; ay: number; dx: number; dy: number; length2: number; half: number }[]>();
  constructor(lanes: Lane[]) {
    for (const { line, width } of lanes) this.add(line, width);
  }
  add(line: number[], width: number): void {
    const half = width / 2 + 0.4;
    for (let i = 2; i < line.length; i += 2) {
      const ax = line[i - 2], ay = line[i - 1], bx = line[i], by = line[i + 1];
      const dx = bx - ax, dy = by - ay;
      const part = {ax, ay, dx, dy, length2: dx * dx + dy * dy, half};

      for (let y = Math.floor((Math.min(ay, by) - half) / 32); y <= Math.floor((Math.max(ay, by) + half) / 32); y++) {
        for (let x = Math.floor((Math.min(ax, bx) - half) / 32); x <= Math.floor((Math.max(ax, bx) + half) / 32); x++) {
          const key = x * 65536 + y;
          (this.cells.get(key) ?? this.cells.set(key, []).get(key)!).push(part);
        }
      }
    }
  }
  contains(x: number, y: number): boolean {
    return this.inCell(x, y, Math.floor(x / 32), Math.floor(y / 32), 0);
  }
  near(x: number, y: number, radius: number): boolean {
    for (let j = Math.floor((y - radius) / 32); j <= Math.floor((y + radius) / 32); j++) {
      for (let i = Math.floor((x - radius) / 32); i <= Math.floor((x + radius) / 32); i++) {
        if (this.inCell(x, y, i, j, radius)) return true;
      }
    }
    return false;
  }
  private inCell(x: number, y: number, i: number, j: number, radius: number): boolean {
    const parts = this.cells.get(i * 65536 + j);
    if (!parts) return false;
    for (const p of parts) {
      const u = p.length2 ? Math.max(0, Math.min(1, ((x - p.ax) * p.dx + (y - p.ay) * p.dy) / p.length2)) : 0;
      if ((x - p.ax - u * p.dx) ** 2 + (y - p.ay - u * p.dy) ** 2 <= (p.half + radius) ** 2) return true;
    }
    return false;
  }
}
