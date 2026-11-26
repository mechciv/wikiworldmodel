// Place names and dated ground in the local camera projection. Map shapes take no pointer
// events: houses, monuments, and the terrain beneath them keep their normal picking order.
import { mapCue, type MapRoom as Rect } from './map-cue.ts';
import { fromLocal, toLocal } from '../../../core/city.ts';
import type { CityRecord } from '../../../core/landscape.ts';
import { settlementFocus } from '../../../core/site-navigation.ts';
import type { Scenario } from '../../../core/scenario.ts';
import type { GroundSampler } from '../../../world/generators/city/ground.ts';
import type { BorderRow, LocalBorders } from '../city/local-borders.ts';
import type { PeopleSummary } from '../city/lifeworker.ts';
import { projectLocal, type LocalView } from '../city/view.ts';

type Place = { lat: number; lon: number };
export type SitePin = Place & { id: string; label: string; record?: CityRecord; select: () => void };
type Screen = { x: number; y: number };

export function mapRoom(stage: HTMLElement, panel: HTMLElement, bar: HTMLElement): Rect {
  const { width, height, x, y } = stage.getBoundingClientRect();
  const box = { left: 10, right: width - 10, top: 68, bottom: height - 72 };
  const controls = bar.getBoundingClientRect();
  if (controls.height) box.bottom = Math.min(box.bottom, controls.top - y - 10);
  if (!panel.hidden) {
    const p = panel.getBoundingClientRect();
    if (p.width > width * 0.8) box.bottom = Math.min(box.bottom, p.top - y - 8);
    else box.right = Math.min(box.right, p.left - x - 10);
  }
  return box;
}

/** Clip to the camera's near plane before projecting. A ring can surround the eye or have every vertex offscreen. */
function clipped(v: LocalView, ground: GroundSampler, coords: number[], closed: boolean): Screen[] {
  const points: Screen[] = [];
  const vertices = [];
  for (let i = 0; i < coords.length; i += 2) {
    const x = coords[i],
      y = coords[i + 1],
      z = ground.at(x, y);
    const depth = (x - v.eye[0]) * v.forward[0] + (y - v.eye[1]) * v.forward[1] + (z - v.eye[2]) * v.forward[2];
    vertices.push({ x, y, z, depth });
  }
  const near = Math.max(1, v.near);
  for (let i = 0; i < vertices.length; i++) {
    const b = vertices[i],
      a = vertices[(i + vertices.length - 1) % vertices.length];
    if ((closed || i > 0) && a.depth >= near !== b.depth >= near) {
      const f = (near - a.depth) / (b.depth - a.depth);
      points.push(projectLocal(v, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f)!);
    }
    if (b.depth >= near) points.push(projectLocal(v, b.x, b.y, b.z)!);
  }
  return points;
}

export class SiteMap {
  readonly el = document.createElement('div');
  private canvas = document.createElement('canvas');
  private pins = new Map<string, HTMLButtonElement>();
  private country = document.createElement('button');
  private shapes: { path: Path2D; pin: SitePin; description: string; generated: boolean; visible: boolean }[] = [];
  clusterSite: string | null = null;
  private frontiers = new Map<BorderRow, Path2D>();
  private key = '';
  private people?: PeopleSummary;
  private borders?: LocalBorders;
  private ground?: GroundSampler;
  private row?: BorderRow;

  constructor(
    private frame: (id: string) => void,
    private inspectBorder: (row: BorderRow) => void,
  ) {
    this.el.className = 'site-map';
    this.country.className = 'local-country';
    this.country.onclick = () => {
      if (this.row) this.inspectBorder(this.row);
    };
    this.el.append(this.canvas, this.country);
    this.el.hidden = true;
  }

  extentFor(id: string) {
    return this.el.hidden ? undefined : this.shapes.find(s => s.pin.id === id);
  }

  hide(): void {
    this.el.hidden = true;
    this.key = '';
  }

  extentAt(x: number, y: number, includeHidden = false) {
    const ctx = this.canvas.getContext('2d')!;
    return this.shapes.find((s) => (s.visible || includeHidden) && ctx.isPointInPath(s.path, x, y, 'evenodd'));
  }

  frontierAt(x: number, y: number): BorderRow | undefined {
    const ctx = this.canvas.getContext('2d')!;
    ctx.save();
    ctx.lineWidth = 8;
    const row = [...this.frontiers].find(([, path]) => ctx.isPointInStroke(path, x, y))?.[0];
    ctx.restore();
    return row;
  }

  draw(
    v: LocalView,
    origin: Place,
    ground: GroundSampler,
    pins: SitePin[],
    people: PeopleSummary | undefined,
    borders: LocalBorders | undefined,
    t: number,
    scenario: Scenario,
    selected: string | null,
    room: Rect,
  ): void {
    this.el.hidden = false;
    const key = JSON.stringify([
      v.eye,
      v.target,
      v.forward,
      v.width,
      v.height,
      room,
      t,
      scenario,
      selected,
      this.clusterSite,
      pins.map((p) => [p.id, p.lat, p.lon, p.label, p.record?.id]),
    ]);
    if (key === this.key && this.people === people && this.borders === borders && this.ground === ground) return;
    this.key = key;
    this.people = people;
    this.borders = borders;
    this.ground = ground;
    if (this.canvas.width !== v.width) this.canvas.width = v.width;
    if (this.canvas.height !== v.height) this.canvas.height = v.height;
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, v.width, v.height);
    this.shapes = [];
    const [lat, lon] = fromLocal(origin, v.target[0], v.target[1]);
    this.row = borders?.at(lon, lat);
    this.country.hidden = !this.row;
    if (this.row) {
      this.country.textContent = this.row.label ?? this.row.name;
      this.country.title = 'Inspect historical territory · borders mapped to 0.01°';
      this.country.style.left = room.left + 'px';
      this.country.style.top = Math.max(room.top, room.bottom - 26) + 'px';
    }
    const pathOf = (path: Path2D, coords: number[], closed: boolean) => {
      const pts = clipped(v, ground, coords, closed);
      if (pts.length < 2) return;
      path.moveTo(pts[0].x, pts[0].y);
      let last = pts[0];
      for (const p of pts.slice(1))
        if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) > 0.7 || p === pts.at(-1)) {
          path.lineTo(p.x, p.y);
          last = p;
        }
      if (closed) path.closePath();
    };
    this.frontiers.clear();
    const reach = Math.min(400000, Math.max(2500, v.range * 5));
    for (const {
      coords: [ax, ay, bx, by],
      row,
    } of borders?.segments ?? []) {
      if (
        Math.min(ax, bx) > v.target[0] + reach ||
        Math.max(ax, bx) < v.target[0] - reach ||
        Math.min(ay, by) > v.target[1] + reach ||
        Math.max(ay, by) < v.target[1] - reach
      )
        continue;
      let frontier = this.frontiers.get(row);
      if (!frontier) {
        frontier = new Path2D();
        this.frontiers.set(row, frontier);
      }
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4000));
      for (let j = 0; j < n; j++)
        pathOf(frontier, [ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n, ax + ((bx - ax) * (j + 1)) / n, ay + ((by - ay) * (j + 1)) / n], false);
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(30,25,52,.62)';
    for (const path of this.frontiers.values()) ctx.stroke(path);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#ddcafa';
    for (const path of this.frontiers.values()) ctx.stroke(path);

    const seen = new Set<string>();
    const boxes: Rect[] = [];
    for (const pin of pins) {
      if (seen.has(pin.id)) continue;
      const [x, y] = toLocal(origin, pin.lat, pin.lon);
      const chosen = pin.id === selected;
      const data = pin.record && settlementFocus(pin.record, t, scenario);
      const footprint = new Path2D();
      let description = '';
      if (data?.extents.length) {
        for (const area of data.extents)
          for (const polygon of area.polygons) {
            for (const ring of polygon)
              pathOf(
                footprint,
                ring.flatMap(([lo, la]) => toLocal(origin, la, lo)),
                true,
              );
          }
        description = data.extents.map((e) => (e.basis === 'evidence' ? 'Recorded' : 'Reconstructed') + ' settlement extent · ' + [e.ref, e.source].filter(Boolean).join(' · ')).join(' / ');
      } else if (people) {
        const town = people.settlements.find((s) => s.city && (s.record ? s.record === pin.id : s.city === pin.label));
        if (town)
          for (const s of people.settlements) {
            if (!s.outline || (s !== town && s.unitOf !== town.city)) continue;
            pathOf(footprint, s.outline, true);
            description = 'Reconstructed settlement extent · occupied ground in the generated settlement plan';
          }
      }
      const generated = !data?.extents.length;
      const visible = !generated || (chosen && this.clusterSite === selected);
      if (description) this.shapes.push({ path: footprint, pin, description, generated, visible });
      if (description && visible) {
        ctx.fillStyle = chosen ? 'rgba(242,187,98,.14)' : 'rgba(242,187,98,.07)';
        ctx.lineWidth = v.range > 15000 ? 0.65 : 1.15;
        ctx.strokeStyle = chosen ? 'rgba(255,217,144,.60)' : 'rgba(255,217,144,.43)';
        ctx.setLineDash(data?.extents.some((e) => e.basis === 'evidence') ? [] : [4, 4]);
        ctx.fill(footprint, 'evenodd');
        ctx.stroke(footprint);
        ctx.setLineDash([]);
      }
      const z = ground.at(x, y);
      const p = projectLocal(v, x, y, z);
      const distance = Math.hypot(x - v.target[0], y - v.target[1]);
      const occluded =
        v.clearance < 3000 &&
        distance > 150 &&
        [0.25, 0.5, 0.75, 0.9].some(
          (f) => ground.at(v.eye[0] + (x - v.eye[0]) * f, v.eye[1] + (y - v.eye[1]) * f) > v.eye[2] + (z - v.eye[2]) * f + 2,
        );
      const label = data?.cores.length === 1 && data.cores[0].label ? pin.label + ' · ' + data.cores[0].label : pin.label;
      const half = Math.min((room.right - room.left) / 2, Math.max(52, label.length * 3.9 + 16));
      let px = p?.x ?? 0,
        py = p?.y ?? 0;
      const off = !p || occluded || px < room.left + half || px > room.right - half || py < room.top + 15 || py > room.bottom - 15;
      if (off && !chosen) continue;
      let text = label;
      if (off) {
        const dx = x - v.target[0],
          dy = y - v.target[1];
        const right = dx * v.right[0] + dy * v.right[1],
          up = dy * v.right[0] - dx * v.right[1];
        const cue = mapCue(label, Math.atan2(right, up), distance, room);
        px = cue.x;
        py = cue.y;
        text = cue.text;
      }
      const box = { left: px - half, right: px + half, top: py - 13, bottom: py + 13 };
      if (!chosen && boxes.some((b) => b.left < box.right && b.right > box.left && b.top < box.bottom && b.bottom > box.top)) continue;
      boxes.push(box);
      seen.add(pin.id);
      let button = this.pins.get(pin.id);
      if (!button) {
        button = document.createElement('button');
        button.className = 'site-pin';
        button.dataset.entity = pin.id;
        this.el.append(button);
        this.pins.set(pin.id, button);
      }
      button.textContent = text;
      button.classList.toggle('selected', chosen);
      button.title = [off ? 'Frame settlement' : 'Inspect settlement', description].filter(Boolean).join(' · ');
      button.onclick = off ? () => this.frame(pin.id) : pin.select;
      button.style.left = px + 'px';
      button.style.top = py + 'px';
    }
    for (const [id, node] of this.pins)
      if (!seen.has(id)) {
        node.remove();
        this.pins.delete(id);
      }
  }
}
