// A demo of the viewer as it is: the running viewer, used as a reader would use it (a pointer that moves and
// clicks, text typed, a panel scrolled, the time strip dragged), photographed frame by frame.
//
//   npx tsx tools/site/demo.ts <out dir> [--url http://localhost:5173/] [--fps 60] [--until s] [--name demo]
//                              [--crf 17] [--pointers <dir>] [--pointer-scale 1.5] [--trips] [--from impact]
//
// It writes <out>/shots/00000.jpg and on, and lays them together as <out>/<name>.mp4 with ffmpeg. (--fps 15 makes
// a quick take to look over, and --from impact one of the tour's last journey alone.)
//
// One thing of the page's is left out: the trips "Go to…" offers before anything is typed (--trips leaves them
// in). Every place the tour goes to is typed, as any place can be, and the offers beside it would make the tour
// look as if it could go only where they lead.
//
// Nothing is drawn over the page but the pointer, which a screen recording would show and a browser's own
// picture of the page does not: the pointer the page asks for where it is (a hand over a button, a grip over
// the globe), in this machine's own pictures where a directory of them is given (--pointers: a PNG for each
// name CSS gives a cursor, and pointers.json with each one's size and the point it points with, in points), and
// else an arrow and a text bar drawn here. It dips a little while the button is down, since a film has no click
// to hear.
//
// The page's clock is the take's: the time the viewer's animations run by (performance.now, the frames it asks
// for, its CSS transitions, and the blink of the text caret) goes on by one frame of film between pictures,
// however long the picture took. So a flight lasts in the film what it lasts for a reader, and no frame is
// dropped. What a reader waits for and the film does not is loading: before each picture the take waits until
// the viewer has what the view needs, the clock stopped. Some of what the viewer loads it asks for only once the
// view has rested a while by its own clock, so after a few seconds of waiting the clock goes on, unfilmed, until
// it has it: but never while the viewer is making a move of its own, which would go on unseen. How long was
// waited, and how much of the viewer's time went by unfilmed, is printed and written to <out>/take.json, so that
// nobody takes the film for a measure of speed; and with it what the film shows from when, each part of the tour
// and each move of a journey the viewer makes (through time, across the globe, down), to pace the tour by.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Locator, type Page } from '@playwright/test';
import { positionOf } from '../../core/timescale.ts';

const SIZE = { width: 1920, height: 1080 };

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function numberOption(name: string, otherwise: number): number {
  const v = option(name);
  if (v === undefined) return otherwise;
  const x = Number(v);
  if (v.trim() === '' || Number.isNaN(x)) throw new Error(`--${name} ${JSON.stringify(v)} is not a number`);
  return x;
}

/** A picture of the pointer: its size and the point it points with, in CSS pixels. */
interface Pointer {
  src: string;
  w: number;
  h: number;
  x: number;
  y: number;
  /** drawn here, flat: it is given the shadow a system's pointer has */
  drawn?: boolean;
}

/**
 * The pointer's pictures, by the name CSS gives each cursor: an arrow and a text bar drawn here, and over them
 * whatever a directory gives (pointers.json, and a PNG by each name in it). Sizes are in points, and all are drawn
 * so many times that size: a film is looked at smaller than a screen.
 */
function pointers(dir: string | undefined, scale: number): Record<string, Pointer> {
  const svg = (box: string, body: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${body}</svg>`)}`;
  const bar = 'M4.5 4.5h2a2.5 2.5 0 0 1 2.5 2.5a2.5 2.5 0 0 1 2.5-2.5h2M4.5 31.5h2a2.5 2.5 0 0 0 2.5-2.5a2.5 2.5 0 0 0 2.5 2.5h2M9 7v22M7 18h4';
  const all: Record<string, Pointer> = {
    default: { src: svg('0 0 26 30', '<path d="M2 2v21.5l5.6-5 3.9 9.1 3.6-1.5-3.9-9h7.5z" fill="#111" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/>'), w: 26 / 1.5, h: 30 / 1.5, x: 2 / 1.5, y: 2 / 1.5, drawn: true },
    text: { src: svg('0 0 18 36', `<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${bar}" stroke="#fff" stroke-width="4.2"/><path d="${bar}" stroke="#111" stroke-width="1.7"/></g>`), w: 9, h: 18, x: 4.5, y: 9, drawn: true },
  };
  if (dir) {
    const given = JSON.parse(readFileSync(join(dir, 'pointers.json'), 'utf8')) as Record<string, { w: number; h: number; x: number; y: number }>;
    for (const [name, p] of Object.entries(given)) all[name] = { w: p.w, h: p.h, x: p.x, y: p.y, src: `data:image/png;base64,${readFileSync(join(dir, `${name}.png`)).toString('base64')}` };
  }
  for (const p of Object.values(all)) for (const k of ['w', 'h', 'x', 'y'] as const) p[k] *= scale;
  return all;
}

/**
 * Run in the page before any of its own code: the page's clock becomes the take's, and a pointer is drawn.
 *
 * - performance.now and Date.now read the take's time, and a frame the page asks for is given when the take
 *   says so, with that time. Timers stay the browser's: the viewer animates nothing by them.
 * - CSS transitions and animations are stopped as they start and moved on by the take's time. The text caret is
 *   kept from blinking by the browser's clock, and blinks by the take's: on for half a second from the last key.
 * - The pointer is a picture that follows the mouse the take moves, and takes no clicks itself: the one the page
 *   asks for where it is, as a browser chooses it (over text that can be selected, the text bar; while a button
 *   is down, what the thing pressed asks for).
 * - What the film leaves out of the page is hidden by a style sheet, from before the page first draws.
 */
const inPage = (pictures: Record<string, Pointer>, leftOut: string) => `(() => {
  const POINTERS = ${JSON.stringify(pictures)};
  const LEFT_OUT = ${JSON.stringify(leftOut)};
  let T = 0;
  const started = Date.now();
  const real = performance.now.bind(performance);
  let asked = new Map();
  let id = 0;
  performance.now = () => T;
  Date.now = () => started + T;
  window.requestAnimationFrame = (cb) => (asked.set(++id, cb), id);
  window.cancelAnimationFrame = (i) => void asked.delete(i);
  const frame = () => {
    const now = [...asked.values()];
    asked = new Map();
    for (const cb of now) cb(T);
  };
  // What the viewer is still loading: not a move that is under way, nor a resting picture being made finer.
  const waiting = () => (window.__wikiworldmodel ? window.__wikiworldmodel.waiting() : ['the viewer']);
  const loading = () => waiting().filter((x) => x !== 'flight' && x !== 'refining');
  const begun = new WeakMap();
  const animate = () => {
    for (const a of document.getAnimations()) {
      let at = begun.get(a);
      if (at === undefined) {
        at = T;
        begun.set(a, at);
        a.pause();
      }
      const end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
      if (T - at >= end) a.finish();
      else a.currentTime = T - at;
    }
  };

  const pointer = document.createElement('div');
  pointer.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px)';
  const pictures = {};
  for (const [name, p] of Object.entries(POINTERS)) {
    const img = new Image();
    img.src = p.src;
    img.style.cssText = 'position:absolute;max-width:none;left:' + -p.x + 'px;top:' + -p.y + 'px;width:' + p.w + 'px;height:' + p.h + 'px;visibility:hidden;transform-origin:' + p.x + 'px ' + p.y + 'px' + (p.drawn ? ';filter:drop-shadow(0 1px 1.5px rgba(0,0,0,0.45))' : '');
    pointer.appendChild(img);
    pictures[name] = img;
  }
  const caret = document.createElement('style');
  caret.textContent = '* { caret-animation: manual; } html.take-caret-off * { caret-color: transparent !important; }' + LEFT_OUT;
  let keyed = 0;
  for (const e of ['keydown', 'focusin']) window.addEventListener(e, () => (keyed = T), true);
  const place = () => {
    document.documentElement.appendChild(pointer);
    document.head.appendChild(caret);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place);
  else place();

  const onText = (el, x, y) => {
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) return !/^(button|checkbox|radio|range|submit|reset|file|color|image)$/.test(el.type);
    if (getComputedStyle(el).userSelect === 'none') return false;
    const r = document.createRange();
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
      r.selectNodeContents(n);
      for (const b of r.getClientRects()) if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) return true;
    }
    return false;
  };
  let held = null;
  const shapeAt = (x, y, down) => {
    const under = document.elementFromPoint(x, y);
    if (!down) held = null;
    else held ??= under;
    const el = held ?? under;
    if (!el) return 'default';
    const asks = getComputedStyle(el).cursor.split(',').pop().trim();
    const name = asks === 'auto' ? (onText(el, x, y) ? 'text' : 'default') : asks;
    return pictures[name] ? name : 'default';
  };

  window.__take = {
    /** The pointer's pictures are ready to be drawn; and whether the caret can be kept to the take's clock. */
    async ready() {
      await Promise.all(Object.values(pictures).map((img) => img.decode()));
      return CSS.supports('caret-animation', 'manual');
    },
    /** So many of the viewer's frames, each so long after the last; then the page's own animations moved on. */
    async frames(n, ms, x, y, down) {
      let waited = 0;
      let unfilmed = 0;
      let on = [];
      for (let i = 0; i < n; i++) {
        T += ms;
        frame();
        const t0 = real();
        // The viewer takes in what has loaded when it draws: draw again, the clock stopped, until it has it. Some
        // of what it loads it only asks for once the view has rested a while by its own clock, and with the clock
        // stopped that never comes: after a few seconds of waiting the clock goes on again, a frame at a time, and
        // that time is not filmed. Never while the viewer is making a move, which would go on with the clock,
        // unseen: a city takes longer than that to make what a view of it needs, and the way down to it is the film's.
        for (on = loading(); on.length && real() - t0 < 90000; on = loading()) {
          await new Promise((done) => setTimeout(done, 10));
          if (real() - t0 > 3000 && !waiting().includes('flight')) {
            T += ms;
            unfilmed += ms;
          }
          frame();
        }
        waited += real() - t0;
      }
      animate();
      const shape = shapeAt(x, y, down);
      pointer.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      for (const [name, img] of Object.entries(pictures)) {
        img.style.visibility = name === shape ? 'visible' : 'hidden';
        img.style.transform = down ? 'scale(0.9)' : '';
      }
      document.documentElement.classList.toggle('take-caret-off', (T - keyed) % 1000 >= 500);
      return { waited, unfilmed, on, shape };
    },
    /** Draw, the clock stopped, and say what is still loading. */
    pump() {
      frame();
      return loading();
    },
    now: () => T,
  };
})();`;

/** The frames a second the viewer draws, as on a screen: the film takes every so many of them. */
const SCREEN_HZ = 60;

interface TakePage {
  __take: { ready(): Promise<boolean>; frames(n: number, ms: number, x: number, y: number, down: boolean): Promise<{ waited: number; unfilmed: number; on: string[]; shape: string }>; pump(): string[]; now(): number };
}

type Point = { x: number; y: number };

/** Where on an element to go: its middle, or so far across and down it (0 to 1). */
async function pointOf(target: Locator | Point, at: [number, number] = [0.5, 0.5]): Promise<Point> {
  if ('x' in target) return target;
  const box = await target.boundingBox();
  if (!box) throw new Error(`nothing to point at: ${target}`);
  return { x: box.x + box.width * at[0], y: box.y + box.height * at[1] };
}

/** A take: the page, and the film's frames of it so far. */
class Take {
  private frames = 0;
  private at: Point = { x: SIZE.width * 0.76, y: SIZE.height * 0.74 };
  private down = false;
  /** seconds the take has waited, the clock stopped, for the viewer to have what its view needs */
  waited = 0;
  /** seconds of the viewer's own clock that went by, unfilmed, while it loaded what only time brings it to ask for */
  unfilmed = 0;
  private slow: { frame: number; ms: number }[] = [];
  /** how many frames each of the pointer's pictures was on */
  readonly shapes: Record<string, number> = {};
  /** what the film shows from when, in its own seconds: the tour's parts, and within a journey of the viewer's its moves */
  readonly parts: { at: number; what: string }[] = [];

  constructor(
    readonly page: Page,
    private out: string,
    readonly fps: number,
    private until: number,
    /** the text caret is the take's to blink: it is photographed, where a browser's picture of a page leaves it out */
    private caret: boolean,
  ) {}

  get seconds(): number {
    return this.frames / this.fps;
  }

  /** Past the part asked for (--until): the tour stops here. */
  get done(): boolean {
    return this.seconds >= this.until;
  }

  /** From here the film shows this. */
  part(what: string): void {
    if (!this.done) this.parts.push({ at: this.seconds, what });
  }

  /** One frame of film: the clock goes on, the viewer draws, what it needs is waited for, and the page is photographed. */
  private async frame(): Promise<void> {
    if (this.done) return;
    const { page } = this;
    await page.mouse.move(this.at.x, this.at.y);
    const n = Math.max(1, Math.round(SCREEN_HZ / this.fps));
    const r = await page.evaluate(({ n, ms, x, y, down }) => (window as unknown as TakePage).__take.frames(n, ms, x, y, down), { n, ms: 1000 / this.fps / n, x: this.at.x, y: this.at.y, down: this.down });
    this.waited += r.waited / 1000;
    this.unfilmed += r.unfilmed / 1000;
    if (r.on.length) console.warn(`frame ${this.frames}: still loading ${r.on.join(', ')} after a minute and a half; going on`);
    if (r.waited > 400) this.slow.push({ frame: this.frames, ms: Math.round(r.waited) });
    this.shapes[r.shape] = (this.shapes[r.shape] ?? 0) + 1;
    writeFileSync(join(this.out, 'shots', `${String(this.frames).padStart(5, '0')}.jpg`), await page.screenshot({ type: 'jpeg', quality: 97, caret: this.caret ? 'initial' : 'hide' }));
    this.frames++;
  }

  /** Let so many seconds of film go by. */
  async hold(seconds: number): Promise<void> {
    for (let i = 0, n = Math.round(seconds * this.fps); i < n && !this.done; i++) await this.frame();
  }

  /** A moment of the hand's, too short to round away: at least a frame. */
  private async beat(seconds: number): Promise<void> {
    await this.hold(Math.max(1 / this.fps, seconds));
  }

  /** Is the pointer on the thing, or on something within it? If not, a click here is a click on something else. */
  private on(target: Locator): Promise<boolean> {
    return target.evaluate((el, at) => {
      const hit = document.elementFromPoint(at.x, at.y);
      return !!hit && el.contains(hit);
    }, this.at);
  }

  /**
   * Until the viewer's own journey (through time, then down to the place) is over: it is `there`, and has made no
   * move for a little while.
   *
   * Between two moves of a journey the viewer may be fetching what the next one needs, and not say so: a city's
   * scene, before it flies to a building of it. Making no move and not yet there, it is loading, and that is waited
   * for like the rest, the clock stopped. So is a flight held above a scene that is still being made.
   */
  async arrive(there: () => Promise<boolean> = async () => true, most = 40): Promise<void> {
    if (this.done) return;
    const view = () => this.page.evaluate(() => {
      const h = window.__wikiworldmodel!;
      const { t, cam } = h.state();
      return { moving: h.waiting().includes('flight'), at: JSON.stringify([t, cam]), t, place: `${cam.lat},${cam.lon}`, dist: cam.dist };
    });
    let last = '';
    let still = 0;
    let calm = 0;
    // Which of its moves the viewer is making, by what changed since the frame before: the year, the place or the height.
    let was: Awaited<ReturnType<typeof view>> | undefined;
    let doing = '';
    const moved = (now: Awaited<ReturnType<typeof view>>) => {
      const is = !was ? '' : now.t !== was.t ? 'through time' : now.dist > was.dist ? 'up' : now.dist < was.dist ? 'down' : now.place !== was.place ? 'across' : '';
      if (is && is !== doing) this.part(`  ${is}`);
      if (is) doing = is;
      was = now;
    };
    // The viewer moves the time of a sweep every 80 ms: a view the same for nearly twice that is held.
    const held = Math.max(2, Math.round(0.15 * this.fps));
    for (let i = 0, n = Math.round(most * this.fps); i < n && !this.done; i++) {
      await this.frame();
      const v = await view();
      moved(v);
      still = v.at === last ? still + 1 : 0;
      last = v.at;
      if (v.moving) {
        calm = 0;
        // A flight into a scene holds above it until the scene is made, and the viewer does not say it is waiting
        // while it is still high up. A view that has not changed for longer than a sweep through time goes between
        // its steps is such a hold: its frames, all one picture, are taken back, and the scene is waited for with
        // the viewer's clock going on unfilmed (stopped, the flight would never see that it could go on).
        if (still >= held) {
          this.frames -= still;
          const t0 = performance.now();
          for (;;) {
            const ms = 1000 / SCREEN_HZ;
            await this.page.evaluate(({ ms, x, y, down }) => (window as unknown as TakePage).__take.frames(1, ms, x, y, down), { ms, x: this.at.x, y: this.at.y, down: this.down });
            this.unfilmed += ms / 1000;
            const now = await view();
            if (!now.moving || now.at !== last) break;
            // A flight that waits on a scene nobody is fetching never ends.
            if (performance.now() - t0 > 90_000) throw new Error(`at ${this.seconds.toFixed(1)} s the viewer's flight has stopped short of where it was going`);
            await new Promise((r) => setTimeout(r, 30));
          }
          const ms = performance.now() - t0;
          this.waited += ms / 1000;
          if (ms > 400) this.slow.push({ frame: this.frames, ms: Math.round(ms) });
          still = 0;
        }
        continue;
      }
      calm++;
      if (await there()) {
        if (doing !== 'there') this.part('  there');
        doing = 'there';
        if (calm >= Math.round(0.4 * this.fps)) return;
        continue;
      }
      const t0 = performance.now();
      for (;;) {
        // As for what it does say it is loading: the clock stopped, and after a few seconds going on, unfilmed.
        if (performance.now() - t0 < 3000) await this.page.evaluate(() => (window as unknown as TakePage).__take.pump());
        else {
          const ms = 1000 / SCREEN_HZ;
          await this.page.evaluate(({ ms, x, y, down }) => (window as unknown as TakePage).__take.frames(1, ms, x, y, down), { ms, x: this.at.x, y: this.at.y, down: this.down });
          this.unfilmed += ms / 1000;
        }
        if ((await view()).moving || (await there())) break;
        if (performance.now() - t0 > 90_000) throw new Error(`at ${this.seconds.toFixed(1)} s the viewer made no move for a minute and a half, and was not where it was going`);
        await new Promise((r) => setTimeout(r, 20));
      }
      const ms = performance.now() - t0;
      this.waited += ms / 1000;
      if (ms > 400) this.slow.push({ frame: this.frames, ms: Math.round(ms) });
      calm = 0;
    }
    if (!this.done) throw new Error(`after ${most} s of film the viewer had not arrived`);
  }

  /** Move the pointer to a place as a hand does: off the straight line a little, quick in the middle, in a time that grows with the way. */
  async move(target: Locator | Point, at?: [number, number], seconds?: number): Promise<void> {
    if (this.done) return;
    const from = { ...this.at };
    const to = await pointOf(target, at);
    const way = Math.hypot(to.x - from.x, to.y - from.y);
    if (way < 1) return;
    const n = Math.max(2, Math.round((seconds ?? 0.28 + 0.5 * Math.sqrt(way / 1000)) * this.fps));
    // The bend: to one side of the line, more for a longer way, the same for the same two places.
    const bend = Math.min(60, way * 0.12) * (to.x >= from.x ? -1 : 1);
    const [nx, ny] = [-(to.y - from.y) / way, (to.x - from.x) / way];
    for (let i = 1; i <= n && !this.done; i++) {
      const u = i / n;
      const e = u * u * u * (u * (6 * u - 15) + 10);
      const off = bend * 4 * e * (1 - e);
      this.at = { x: from.x + (to.x - from.x) * e + nx * off, y: from.y + (to.y - from.y) * e + ny * off };
      await this.frame();
    }
    this.at = to;
  }

  async press(): Promise<void> {
    if (this.done) return;
    await this.page.mouse.down();
    this.down = true;
    await this.beat(0.09);
  }

  async release(): Promise<void> {
    // Let go even past the part asked for: a button left down would be the next take's.
    await this.page.mouse.up();
    this.down = false;
    await this.beat(0.06);
  }

  /** Go to a thing and click it. */
  async click(target: Locator | Point, at?: [number, number]): Promise<void> {
    if (this.done) return;
    await this.move(target, at);
    await this.hold(0.12);
    if (this.done) return;
    if (!('x' in target) && !(await this.on(target))) throw new Error(`at ${this.seconds.toFixed(1)} s the pointer is not on ${target}: a click here would be on something else`);
    await this.press();
    await this.release();
  }

  /**
   * Scroll what holds a thing until the thing is so far down it (0 to 1), the pointer over what holds it: by small
   * steps, quick in the middle, as two fingers on a pad do. Where it will scroll no further, it is left there.
   */
  async scroll(within: Locator, target: Locator, where = 0.5): Promise<void> {
    if (this.done) return;
    if (!(await this.on(within))) await this.move(within, [0.5, 0.55]);
    const way = async () => {
      const [box, to] = [await within.boundingBox(), await target.boundingBox()];
      if (!box || !to) throw new Error(`nothing to scroll to: ${target}`);
      return to.y + to.height / 2 - (box.y + box.height * where);
    };
    const all = await way();
    if (Math.abs(all) < 2) return;
    const n = Math.max(4, Math.round((0.5 + 0.4 * Math.sqrt(Math.abs(all) / 400)) * this.fps));
    let stuck = 0;
    for (let i = 1; i <= n && !this.done && stuck < 3; i++) {
      const u = i / n;
      // What is left to go now, against what should be left by this frame: the wheel is turned by the difference.
      const left = await way();
      const turn = Math.round(left - all * (1 - u * u * u * (u * (6 * u - 15) + 10)));
      if (turn) await this.page.mouse.wheel(0, turn);
      await this.frame();
      stuck = turn && Math.abs((await way()) - left) < 0.5 ? stuck + 1 : 0;
    }
  }

  /** Press on one place, move to another, and let go there: over so many seconds, at a pace if one is given (how much of the way is done by how much of the time). */
  async drag(from: Point, to: Point, seconds: number, pace: (u: number) => number = (u) => u): Promise<void> {
    if (this.done) return;
    await this.move(from);
    await this.hold(0.15);
    if (this.done) return;
    await this.press();
    for (let i = 1, n = Math.round(seconds * this.fps); i <= n && !this.done; i++) {
      const e = pace(i / n);
      this.at = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      await this.frame();
    }
    await this.hold(0.2);
    await this.release();
  }

  /** Turn the wheel so far where the pointer is, over so many seconds: a little each frame, quick in the middle. */
  async wheel(all: number, seconds: number): Promise<void> {
    let sent = 0;
    for (let i = 1, n = Math.max(1, Math.round(seconds * this.fps)); i <= n && !this.done; i++) {
      const u = i / n;
      const upTo = all * u * u * (3 - 2 * u);
      await this.page.mouse.wheel(0, upTo - sent);
      sent = upTo;
      await this.frame();
    }
  }

  /**
   * Turn the wheel where the pointer is until a measure of the page has come down to a value: at up to so much a
   * second, easing in, and slower as it nears, so that it comes to rest there.
   *
   * Where the wheel is turned about a point of the page that the turning itself moves (`aim`: a time on the time
   * strip, as the strip is zoomed a millionfold about it and the last thousandth of a pixel comes to count), the
   * pointer keeps to that point, as a hand would.
   */
  async wheelTo(rate: number, measure: () => Promise<number>, to: number, most = 6, aim?: () => Promise<Point>): Promise<void> {
    // How much of the measure's logarithm a turn of the wheel by one took off, on the frame before: no frame turns
    // it by more than takes off most of what is left, so that a take of few frames a second does not go past.
    let per = 0;
    for (let i = 0, n = Math.round(most * this.fps); i < n && !this.done; i++) {
      const now = await measure();
      const left = (now - to) / to;
      // Nothing to measure (what was measured has left the view), or there: the wheel is let go.
      if (!Number.isFinite(left) || left < 0.02) return;
      const on = await aim?.();
      if (on && Math.hypot(on.x - this.at.x, on.y - this.at.y) > 0.2) {
        this.at = on;
        await this.page.mouse.move(on.x, on.y);
      }
      let turn = (rate / this.fps) * Math.min(1, (i + 1) / (0.3 * this.fps)) * Math.min(1, left / 0.35);
      if (per > 0) turn = Math.sign(turn) * Math.min(Math.abs(turn), (0.7 * Math.log(now / to)) / per);
      await this.page.mouse.wheel(0, turn);
      await this.frame();
      const then = await measure();
      if (turn && now > 0 && then > 0 && Number.isFinite(then)) per = Math.log(now / then) / Math.abs(turn);
    }
  }

  /** Type as a person does: a key, then a few frames, unevenly. */
  async type(text: string, perSecond = 11): Promise<void> {
    let k = 0;
    for (const ch of text) {
      if (this.done) return;
      await this.page.keyboard.type(ch);
      // Uneven without chance: the same text is typed the same way every take.
      const beat = 1 + 0.45 * Math.sin(1.7 * k++ + ch.charCodeAt(0));
      await this.hold(Math.max(1 / this.fps, beat / perSecond));
    }
  }

  report(): void {
    console.log(`${this.frames} frames, ${this.seconds.toFixed(1)} s of film; ${this.waited.toFixed(1)} s were waited for the viewer to load what it showed, the clock stopped, but for ${this.unfilmed.toFixed(1)} s of its own time that went by unfilmed`);
    console.log(`  the pointer: ${Object.entries(this.shapes).map(([name, n]) => `${name} ${n}`).join(', ')}`);
    for (const s of this.slow.sort((a, b) => b.ms - a.ms).slice(0, 8)) console.log(`  frame ${s.frame} (${(s.frame / this.fps).toFixed(1)} s): ${s.ms} ms`);
    console.log('what it shows, from when and for how long:');
    for (const [i, p] of this.parts.entries()) console.log(`  ${p.at.toFixed(1).padStart(5)} s ${((this.parts[i + 1]?.at ?? this.seconds) - p.at).toFixed(1).padStart(5)} s  ${p.what}`);
  }
}

// ── The tour ────────────────────────────────────────────────────────────────────────────────────

const easeInOut = (u: number) => u * u * (3 - 2 * u);

/** How far from an animal the view comes to rest when it goes close to one, in metres: a choice of the film's. */
const CLOSE_UP = 15;

/** The trips "Go to…" offers before anything is typed, and their heading: left out of the film, which types where it goes. */
const TRIPS = '.tm-body > h2, .tm-trips { display: none !important; }';
const WITH_TRIPS = process.argv.includes('--trips');

/** Keys a second, typing where to go: slow enough to be read as it is typed. */
const TYPING = 9;

/**
 * At the Moon-forming impact the film drags the time on through the states the Earth's record has after it, each to
 * a little past its end, so that the next state is plainly the one shown: by this share of the state's length. A
 * choice of the film's, as are the seconds each drag takes; where the states end is read from the build.
 */
const PAST = 0.08;

/** The tour from its last journey on (--from impact): to work on that part alone, not for a film. */
const FROM_IMPACT = option('from') === 'impact';

async function tour(take: Take): Promise<void> {
  const { page } = take;
  const state = () => page.evaluate(() => window.__wikiworldmodel!.state());
  const panel = page.locator('.inspect');
  const goTo = page.locator('.when-to');
  const how = page.locator('.tg-evidence');
  /** Hold the take to what it means to show: a click that missed, or a place not reached, stops it here. */
  const sure = async (what: string, is: () => Promise<boolean>) => {
    if (take.done || (await is())) return;
    const now = await page.evaluate(() => ({ state: window.__wikiworldmodel!.state(), waiting: window.__wikiworldmodel!.waiting() }));
    throw new Error(`at ${take.seconds.toFixed(1)} s the take is not as the tour has it: ${what}\n${JSON.stringify(now)}`);
  };
  const near = (a: number, b: number, by: number) => Math.abs(a - b) <= by;

  const asked = page.getByRole('searchbox', { name: 'A place, a time, or both' });
  const typed = (text: string) => sure(`"${text}" is typed`, async () => (await asked.inputValue()) === text);

  // Where a time is along the strip, as the strip itself has it: by the width it measures itself by, from the edge
  // its pointer positions are counted from. (Zoomed far in, a hundredth of a pixel is many years.)
  const strip = page.locator('.timebar canvas').first();
  const box = await strip.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + el.clientLeft, y: r.top + el.clientTop, width: el.clientWidth };
  });
  const xAt = async (t: number) => {
    const { window: w } = await state();
    const p0 = positionOf(w[0]);
    return box.x + (box.width * (positionOf(t) - p0)) / (positionOf(w[1]) - p0);
  };
  // Between the rows of periods: on the ruler above them a drag moves the strip, and on the track below a click opens a record.
  const y = box.y + 34;

  if (!FROM_IMPACT) {
    // The viewer as it opens to a reader who comes with no link: "Go to…", waiting for a place, a time or both.
    await sure('"Go to…" is open', () => page.locator('.tm-dialog').isVisible());
    await sure('its trips are left out', async () => WITH_TRIPS || (await page.locator('.tm-trip:visible').count()) === 0);
    take.part('"Go to…", as the viewer opens: a place typed, and a moment of it chosen');
    await take.hold(1.2);
    // A place alone: its stretch of time opens, to choose a moment along, set at the time its scene is drawn for.
    await take.type('Hell Creek', TYPING);
    await typed('Hell Creek');
    await take.hold(0.8);
    await take.click(page.getByRole('option').filter({ hasText: 'Hell Creek ecosystem' }));
    const go = page.locator('.tm-go');
    await sure('the stretch of time of the place is open', () => go.isVisible());
    // Off the time it shows, which the pointer would be standing on, to the button under it.
    await take.hold(0.2);
    await take.move(go);
    await take.hold(1.1);
    await take.click(go);
    take.part('to the Hell Creek');
    const inHellCreek = async () => (await state()).sel === 'life/hell-creek/ecosystem' && (await page.evaluate(() => window.__wikiworldmodel!.scene()?.site)) === 'hell-creek' && (await state()).cam.dist < 1.001;
    await take.arrive(inHellCreek);
    await sure('in the Hell Creek, its record open', inHellCreek);
    take.part('the Hell Creek: its record');
    await take.hold(1.5);

    // Its record has opened: read, close it, and turn to look about (shift-drag turns the view).
    await take.click(panel.locator('button.close'));
    await sure('the record is closed', async () => (await state()).sel === null);
    await take.hold(0.3);
    take.part('the Hell Creek: a look about');
    const before = (await state()).cam.heading ?? 0;
    await page.keyboard.down('Shift');
    await take.drag({ x: 900, y: 640 }, { x: 1180, y: 628 }, 1.8, easeInOut);
    await page.keyboard.up('Shift');
    await sure('the view has turned', async () => !near((await state()).cam.heading ?? 0, before, 3));
    await take.hold(0.4);

    // An animal: its name opens its record, and "Look closer" goes to one of them.
    take.part('the Hell Creek: Tyrannosaurus, its record');
    await take.click(page.locator('.city-label').filter({ hasText: /^Tyrannosaurus$/ }));
    await sure("Tyrannosaurus' record is open", async () => (await state()).sel === 'life/taxa/tyrannosaurus');
    await take.hold(1.6);
    const far = (await state()).cam;
    take.part('the Hell Creek: "Look closer"');
    await take.click(page.getByRole('button', { name: 'Look closer' }));
    await take.arrive(undefined, 12);
    await sure('the view has gone to the animal', async () => JSON.stringify((await state()).cam) !== JSON.stringify(far));
    await take.hold(1.0);
    await take.click(panel.locator('button.close'));
    await take.hold(0.3);
    // And nearer still: the wheel goes towards what the pointer is on, until the animal fills the view.
    take.part('the Hell Creek: nearer, by the wheel');
    const animals = () => page.evaluate(() => window.__wikiworldmodel!.organismsAt('life/taxa/tyrannosaurus').sort((a, b) => a.depth - b.depth));
    const metres = async () => (await animals())[0]?.depth ?? Infinity;
    await sure('a Tyrannosaurus is in view', async () => (await animals()).length > 0);
    const animal = (await animals())[0];
    if (animal) await take.move({ x: animal.x, y: animal.y });
    await take.wheelTo(-520, metres, CLOSE_UP);
    await sure('the Tyrannosaurus is near, and in view', async () => near(await metres(), CLOSE_UP, CLOSE_UP * 0.15));
    await take.hold(1.5);

    // "Go to…" again: a place and a year. The year is typed bare, which the viewer reads as one of the common era:
    // with "CE" after it, at the "C" the viewer finds nothing for a moment, and says so.
    take.part('"Go to…": a place and a year typed');
    await take.click(goTo);
    await sure('"Go to…" is open', () => page.locator('.tm-dialog').isVisible());
    await take.hold(0.4);
    await take.type('Colosseum 82', TYPING);
    await typed('Colosseum 82');
    await take.hold(0.9);
    await take.click(page.getByRole('option').filter({ hasText: 'Colosseum' }).first());
    take.part('to the Colosseum in 82 CE');
    const atColosseum = async () => {
      const s = await state();
      return s.sel === 'rome/colosseum' && near(s.t, 82, 1) && s.cam.dist < 1.001;
    };
    await take.arrive(atColosseum);
    await sure('at the Colosseum in 82 CE, its record open', atColosseum);
    take.part('the Colosseum: its record');
    await take.hold(1.6);
    await take.click(panel.locator('button.close'));
    await take.hold(0.3);

    // (Past the part asked for, the page is not where the rest of the tour would have it.)
    if (take.done) return;

    // The light: the hour of the day, on the scene's own slider. Back to the morning, and on to the afternoon.
    const light = page.getByRole('slider', { name: 'Hour of the day' });
    const lightBox = (await light.boundingBox())!;
    const [first, last] = await light.evaluate((el: HTMLInputElement) => [Number(el.min), Number(el.max)]);
    // Where the slider's knob is for an hour: a knob as wide as the slider is high stops its own half-width short of each end.
    const knobAt = (hour: number) => ({ x: lightBox.x + lightBox.height / 2 + ((lightBox.width - lightBox.height) * (hour - first)) / (last - first), y: lightBox.y + lightBox.height / 2 });
    take.part('the Colosseum: the light of the day');
    await take.drag(knobAt((await state()).hour), knobAt(8.4), 2.2, easeInOut);
    await sure('the light is the morning\'s', async () => near((await state()).hour, 8.4, 0.8));
    await take.hold(0.4);
    await take.drag(knobAt((await state()).hour), knobAt(15.6), 1.9, easeInOut);
    await sure('the light is the afternoon\'s', async () => near((await state()).hour, 15.6, 0.8));
    await take.hold(0.4);

    // The time strip: scroll to zoom it about the year shown, then drag back through the 70s and on again. The
    // viewer raises a structure over the years up to its record's start. (The years dragged to are the film's choice
    // of where to stop, as the hours of the light are: what stands when is the viewer's to show.)
    take.part('the Colosseum: back through the years it was built in, and on');
    await take.move({ x: await xAt((await state()).t), y });
    await take.hold(0.2);
    const wide = (await state()).window;
    await take.wheel(-2000, 0.9);
    await sure('the time strip is zoomed in', async () => {
      const w = (await state()).window;
      return w[1] - w[0] < (wide[1] - wide[0]) / 6;
    });
    await take.hold(0.3);
    await take.drag({ x: await xAt((await state()).t), y }, { x: await xAt(69.5), y }, 2.3, easeInOut);
    await sure('time is back before the Colosseum was begun', async () => near((await state()).t, 69.5, 1.5));
    await take.hold(0.4);
    await take.drag({ x: await xAt(69.5), y }, { x: await xAt(83), y }, 2.6, easeInOut);
    await sure('time is on to when it stood', async () => near((await state()).t, 83, 1.5));
    await take.hold(0.7);

    // How we know: what is from a record, and what is made up to fill the city.
    take.part('the Colosseum: "How we know"');
    await take.click(how);
    await sure('"How we know" is on', async () => (await state()).evidence);
    await take.hold(2.0);
    await take.click(how);
    await sure('"How we know" is off', async () => !(await state()).evidence);
    await take.hold(0.4);

    if (take.done) return;
  }

  // A third journey, the furthest back: a name, and one of what the world has by it.
  take.part('"Go to…": a name typed, and one of what it finds chosen');
  // (Begun here, the viewer has "Go to…" open already.)
  if (!FROM_IMPACT) await take.click(goTo);
  await sure('"Go to…" is open', () => page.locator('.tm-dialog').isVisible());
  await take.hold(0.4);
  await take.type('Moon', TYPING);
  await typed('Moon');
  await take.hold(1.1);
  await take.click(page.getByRole('option').filter({ hasText: 'Moon-forming impact' }));
  take.part('to the Moon-forming impact');
  const atImpact = async () => (await state()).sel === 'earth/events/moon-forming-impact' && (await state()).t < -4.4e9;
  await take.arrive(atImpact);
  await sure('at the Moon-forming impact, its record open', atImpact);
  take.part('the impact: its record');
  await take.hold(1.4);
  await take.click(panel.locator('button.close'));
  await sure('the record is closed', async () => (await state()).sel === null);
  await take.hold(0.3);
  if (take.done) return;

  // And on from it, as at the Colosseum: the time strip zoomed to the years after the impact, and the time dragged
  // through them. The Earth's record has a state for each stretch of what followed (rock vapour, a magma ocean
  // freezing, its steam raining out, a hot ocean losing its carbon dioxide) and says of each that it gave way little
  // by little; the viewer draws the planet passing from each into the next. They differ a thousandfold in length,
  // so the film goes through them at three widths of the time strip, and slowly over the rain, which at the pace
  // of the freezing would be over within a frame. Where each state ends is the build's to say, and is read from
  // it; how far past each the film drags, and how long it takes over each, are the film's choices.
  const impact = (await state()).t;
  const after = await page.evaluate(async (from) => {
    const file = (await (await fetch(new URL(`builds/${window.__wikiworldmodel!.build}/planet.json`, document.baseURI))).json()) as { planet: { phases: { label: string; time: { start: { best: number }; end: { best: number | null } }; values: Record<string, { value: unknown }[] | undefined> }[] } };
    return file.planet.phases
      .filter((p) => p.time.start.best >= from - 0.5)
      .map((p) => ({ label: p.label, start: p.time.start.best, end: p.time.end.best, gradual: (p.values.change ?? []).some((c) => c.value === 'gradual') }));
  }, impact);
  if (after.length < 5 || !after.slice(0, 4).every((s) => s.gradual && s.end !== null && s.end > s.start)) {
    throw new Error(`the tour takes the Earth's record to have four states from the Moon-forming impact on that each gave way little by little, and one after them: the build has ${JSON.stringify(after)}`);
  }
  const [vapour, magma, rain, hot, oceans] = after as { label: string; start: number; end: number; gradual: boolean }[];
  const past = (s: { start: number; end: number }) => Math.round(s.end + PAST * (s.end - s.start));
  /** The state the planet is in at the time shown, as the viewer's own panel of the planet names it. */
  const planet = async () => ((await page.locator('.planet-phase .planet-value').textContent()) ?? '').trim();
  const beyond = async () => (await state()).window[1] - impact;
  /** The pointer back to the impact on the time strip, and the wheel turned there until the strip shows the years to a time after it, and an eighth more. */
  const show = async (until: number, rate: number) => {
    const to = (until - impact) * 1.12;
    const onImpact = async () => ({ x: await xAt(impact), y });
    await take.move(await onImpact());
    await take.hold(0.15);
    if ((await beyond()) > to) await take.wheelTo(-rate, beyond, to, 6, onImpact);
    else await take.wheelTo(rate, async () => 1 / (await beyond()), 1 / to, 6, onImpact);
    await sure(`the time strip shows the ${Math.round(until - impact)} years after the impact, and few more`, async () => {
      const w = (await state()).window;
      return w[0] < impact && w[1] > until && near(w[1] - impact, to, to * 0.08);
    });
    await take.hold(0.2);
  };
  /**
   * Where to press on the time strip to take hold of the time shown. Pressed, the strip takes the pointer's place
   * to a whole pixel, which zoomed out is thousands of years, and here can be a state of the planet back: so the
   * press is on the first whole pixel at or after the time shown.
   */
  const hold = async () => Math.ceil(await xAt((await state()).t));
  /** Press on the time strip at the time shown, and drag on to a later one. */
  const dragOn = async (until: number, seconds: number, pace: (u: number) => number = easeInOut) => {
    await take.drag({ x: await hold(), y }, { x: await xAt(until), y }, seconds, pace);
    await sure(`time is on to ${Math.round(until - impact)} years after the impact`, async () => near((await state()).t, until, Math.max(2, (until - impact) * 0.02)));
  };
  await sure(`the planet is as the impact left it: ${vapour.label}`, async () => (await planet()) === vapour.label);
  // What state the planet is in, the viewer says in its panel of the planet: unfolded, to read as the time goes on.
  take.part('the impact: the planet\'s state, in the viewer\'s own panel');
  await take.click(page.locator('.planet-toggle'));
  await sure('the panel of the planet is unfolded', () => page.locator('.planet-readings').isVisible());
  await take.hold(0.5);

  // A thousand years or so: the rock vapour rains out, and leaves the magma ocean under its steam.
  take.part(`the impact: on through "${vapour.label}"`);
  await show(past(vapour), 7000);
  await dragOn(past(vapour), 2.6);
  await sure(`the planet is on to the next state: ${magma.label}`, async () => (await planet()) === magma.label);
  await take.hold(0.3);

  // Some millions: the magma ocean freezes over. And at the end of it, slowly, the few thousand years of the rain.
  take.part(`the impact: on through "${magma.label}", and "${rain.label}"`);
  await show(past(rain), 4500);
  {
    const from = await hold();
    const frozen = ((await xAt(magma.end)) - from) / ((await xAt(past(rain))) - from);
    const [freezing, raining] = [3.4, 0.9];
    const turn = freezing / (freezing + raining);
    await dragOn(past(rain), freezing + raining, (u) => (u < turn ? frozen * easeInOut(u / turn) : frozen + (1 - frozen) * ((u - turn) / (1 - turn))));
  }
  await sure(`the planet is on past the rain: ${hot.label}`, async () => (await planet()) === hot.label);
  await take.hold(0.3);

  // Tens of millions: the carbon dioxide goes, and the sky clears over the ocean.
  take.part(`the impact: on through "${hot.label}"`);
  await show(past(hot), 3000);
  await dragOn(past(hot), 3.6);
  await sure(`the planet is on to the state after: ${oceans.label}`, async () => (await planet()) === oceans.label);
  await take.hold(1.3);

  // And where it began: "Go to…".
  take.part('"Go to…" again');
  await take.click(goTo);
  await sure('"Go to…" is open', () => page.locator('.tm-dialog').isVisible());
  await take.hold(2.4);
}

// ── The take ────────────────────────────────────────────────────────────────────────────────────

const out = process.argv[2];
if (!out || out.startsWith('--')) {
  console.error('usage: demo.ts <out dir> [--url http://localhost:5173/] [--fps 60] [--until s] [--name demo] [--crf 17] [--pointers <dir>] [--pointer-scale 1.5] [--trips]');
  process.exit(1);
}
const fps = numberOption('fps', 60);
rmSync(join(out, 'shots'), { recursive: true, force: true });
mkdirSync(join(out, 'shots'), { recursive: true });
// The GPU, not SwiftShader: this is for looking at, not for golden images.
// And a wheel that scrolls a panel at once: a scroll the browser eases by its own clock is not the take's to film.
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-smooth-scrolling'] });
try {
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  page.setDefaultTimeout(30_000);
  page.on('console', (m) => m.type() === 'error' && console.error(`[page] ${m.text()}`));
  page.on('pageerror', (e) => console.error(`[page] ${e.message}`));
  await page.addInitScript({ content: inPage(pointers(option('pointers'), numberOption('pointer-scale', 1.5)), WITH_TRIPS ? '' : TRIPS) });
  await page.goto(option('url') ?? 'http://localhost:5173/');
  const caret = await page.evaluate(() => (window as unknown as TakePage).__take.ready());
  if (!caret) console.warn('this browser cannot keep the text caret from blinking by its own clock: the caret is left out of the film');
  const take = new Take(page, out, fps, numberOption('until', Infinity), caret);
  // The viewer starts as it draws: draw, the clock stopped, until it is there and has what it needs.
  for (let i = 0; ; i++) {
    const ready = await page.evaluate(() => (window as unknown as TakePage).__take.pump().length === 0);
    if (ready) break;
    if (i > 6000) throw new Error('the viewer did not start');
    await new Promise((r) => setTimeout(r, 20));
  }
  const build = await page.evaluate(() => window.__wikiworldmodel!.build);
  const t0 = performance.now();
  await tour(take);
  take.report();
  // Frames taken back and not filmed again are not the film's.
  for (let i = Math.round(take.seconds * fps); ; i++) {
    const stale = join(out, 'shots', `${String(i).padStart(5, '0')}.jpg`);
    if (!existsSync(stale)) break;
    rmSync(stale);
  }
  console.log(`drawn in ${Math.round((performance.now() - t0) / 1000)} s, from build ${build}`);
  writeFileSync(join(out, 'take.json'), JSON.stringify({ build, fps, frames: Math.round(take.seconds * fps), seconds: take.seconds, waited: take.waited, unfilmed: take.unfilmed, parts: take.parts }) + '\n');
  const to = join(out, `${option('name') ?? 'demo'}.mp4`);
  execFileSync(
    'ffmpeg',
    [
      '-loglevel', 'error', '-y', '-framerate', String(fps), '-i', join(out, 'shots', '%05d.jpg'),
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', option('crf') ?? '17', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-movflags', '+faststart', to,
    ],
    { stdio: 'inherit' },
  );
  console.log(to);
} finally {
  await browser.close();
}
