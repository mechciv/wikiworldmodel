// Names over a city. Each label carries its entity id, so a click opens the record. Labels come
// and go with distance: the great monuments from afar, the small ones up close, and never two on
// top of each other.
import type { CityStructure } from '../../../core/city.ts';
import type { GroundSampler } from '../../../world/generators/city/ground.ts';
import { structureTop, type Skyline } from '../city/skyline.ts';
import { projectLocal, type LocalView } from '../city/view.ts';
import { RISE_YEARS } from '../gl/cityShaders.ts';

/** How far away, in metres, a label of each rank still shows. */
const REACH = [16000, 1500, 520, 140];

/** Minimum interval (ms) between full terrain/skyline occlusion passes while the camera is moving. */
const INTERACTIVE_FULL_MS = 180;

export class CityLabels {
  readonly el: HTMLElement;
  private nodes = new Map<string, HTMLButtonElement>();
  private lastPos = new Map<string, [number, number]>();
  onSelect: (id: string) => void = () => {};
  private named: { s: CityStructure; index: number }[] = [];
  private tops: ArrayLike<number> = [];
  private textOf: (s: CityStructure, t: number) => string = (s) => s.label;
  private shown: { s: CityStructure; index: number; top: number }[] = [];
  private lastFullAt = -Infinity;
  private lastFullT = NaN;
  private lastFullSelected: string | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'city-labels';
  }

  setStructures(list: CityStructure[], tops: ArrayLike<number>, site: string, text: (s: CityStructure, t: number) => string): void {
    this.textOf = text;
    this.tops = tops;
    this.named = list.map((s, index) => ({ s, index })).filter(({ s }) => !/map does not name|^A stretch/.test(s.label) && s.label !== site && s.kind !== 'works/road' && s.kind !== 'open/district');
    this.shown = [];
    this.lastFullAt = -Infinity;
  }

  private placeNode(id: string, node: HTMLButtonElement, x: number, y: number): void {
    const prev = this.lastPos.get(id);
    if (!prev || Math.abs(prev[0] - x) >= 0.25 || Math.abs(prev[1] - y) >= 0.25) {
      node.style.transform = `translate(calc(${x.toFixed(1)}px - 50%), ${y.toFixed(1)}px)`;
      this.lastPos.set(id, [x, y]);
    }
    if (node.style.display !== '') node.style.display = '';
  }

  /** Place the names for a view. `visible`, where it is given, says whether a point can be seen from the eye at all. */
  update(v: LocalView, ground: GroundSampler, skyline: Skyline, t: number, selected: string | null, visible?: (x: number, y: number, z: number) => boolean, interactive = false): void {
    const now = performance.now();
    // During active camera motion, cheaply re-project currently visible labels between periodic full
    // occlusion/clash passes so panning/zooming over dense cities stays free of skyline raycast spikes.
    if (interactive && this.shown.length > 0 && now - this.lastFullAt < INTERACTIVE_FULL_MS && Math.abs(t - this.lastFullT) < 0.5 && selected === this.lastFullSelected) {
      for (const item of this.shown) {
        const node = this.nodes.get(item.s.id);
        if (!node) continue;
        const p = projectLocal(v, item.s.at[0], item.s.at[1], item.top);
        if (!p || p.x < -40 || p.y < 40 || p.x > v.width + 40 || p.y > v.height - 90) {
          if (node.style.display !== 'none') node.style.display = 'none';
        } else {
          this.placeNode(item.s.id, node, p.x, p.y);
        }
      }
      return;
    }

    const boxes: [number, number, number, number][] = [];
    const seen = new Set<string>();
    const near: { s: CityStructure; index: number; top: number; x: number; y: number; d: number }[] = [];
    for (const { s, index } of this.named) {
      // Named while it is at least half up.
      if ((s.time.start.best ?? -Infinity) - RISE_YEARS / 2 > t || t > (s.time.end.best ?? Infinity) + RISE_YEARS / 2) continue;
      const dx = s.at[0] - v.eye[0];
      const dy = s.at[1] - v.eye[1];
      const reach = REACH[s.rank] ?? 280;
      const horizontal = dx * dx + dy * dy;
      const dz = s.base - v.eye[2];
      const d = Math.sqrt(horizontal + dz * dz);
      if (d > reach && selected !== s.id) continue;
      const top = structureTop(s, this.tops[index]) + 4;
      const p = projectLocal(v, s.at[0], s.at[1], top);
      if (!p || p.x < -40 || p.y < 40 || p.x > v.width + 40 || p.y > v.height - 90) continue;
      // Hidden behind a hill, or a building?
      let hidden = false;
      if (d > 200) {
        for (let k = 1; k < 8; k++) {
          const f = k / 8;
          const z = v.eye[2] + (top - v.eye[2]) * f;
          if (ground.at(v.eye[0] + dx * f, v.eye[1] + dy * f) > z + 2) {
            hidden = true;
            break;
          }
        }
      }
      if (hidden || (selected !== s.id && skyline.blocked(v.eye[0], v.eye[1], v.eye[2], s.at[0], s.at[1], top, t, index))) continue;
      if (visible && selected !== s.id && !visible(s.at[0], s.at[1], s.base)) continue;
      near.push({ s, index, top, x: p.x, y: p.y, d });
    }
    near.sort((a, b) => a.s.rank - b.s.rank || a.d - b.d || (a.s.id < b.s.id ? -1 : 1));
    const said = new Set<string>();
    const nextShown: { s: CityStructure; index: number; top: number }[] = [];
    for (const n of near) {
      const text = this.textOf(n.s, t);
      // A river of many stretches is named once.
      if (said.has(text) && selected !== n.s.id) continue;
      const w = 12 + text.length * 7.2;
      const box: [number, number, number, number] = [n.x - w / 2, n.y - 12, n.x + w / 2, n.y + 12];
      const clash = boxes.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3]);
      if (clash && selected !== n.s.id) continue;
      boxes.push(box);
      said.add(text);
      seen.add(n.s.id);
      nextShown.push({ s: n.s, index: n.index, top: n.top });
      let node = this.nodes.get(n.s.id);
      if (!node) {
        node = document.createElement('button');
        node.className = 'city-label';
        node.dataset.entity = n.s.id;
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onSelect(n.s.id);
        });
        node.addEventListener('pointerdown', (e) => e.stopPropagation());
        this.el.appendChild(node);
        this.nodes.set(n.s.id, node);
      }
      if (node.textContent !== text) node.textContent = text;
      node.classList.toggle('major', n.s.rank === 0);
      node.classList.toggle('generated', !n.s.curated);
      node.classList.toggle('selected', selected === n.s.id);
      this.placeNode(n.s.id, node, n.x, n.y);
    }
    for (const [id, node] of this.nodes) {
      if (!seen.has(id) && node.style.display !== 'none') node.style.display = 'none';
    }
    this.shown = nextShown;
    this.lastFullAt = now;
    this.lastFullT = t;
    this.lastFullSelected = selected;
  }
}
