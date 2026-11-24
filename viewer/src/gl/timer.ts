// How long each pass of a frame takes, for the reference views (docs/plans/RENDERING.md, step 0). Where the browser
// has timer queries the GPU says how long each pass took, a few frames later; where it has none, each pass is waited
// for, which is slower and says only what the whole of a pass costs as the machine draws it. A browser's finish() need
// not wait for the GPU, so the wait is a read of one pixel, which must. Off unless asked for: a frame drawn while nobody
// measures pays nothing but a test of a flag at each pass.
import type { GL } from './context.ts';

/** What the passes of the frames measured took, each the median over the frames, in milliseconds. */
export interface FrameProfile {
  /** "gpu" from timer queries; "finish" from waiting for the GPU after each pass */
  method: 'gpu' | 'finish';
  frames: number;
  /** each pass's median, in the order the passes were first drawn */
  passes: Record<string, number>;
  /** the median of the frames' totals */
  total: number;
}

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export class FrameTimer {
  private ext: TimerExt | null;
  private on = false;
  private frame = 0;
  /** a pixel to read back, which waits for the GPU to finish what it was given */
  private sync: { fb: WebGLFramebuffer; tex: WebGLTexture; px: Uint8Array } | null = null;
  /** the pass being measured, and when it started where the GPU is waited for */
  private open: { name: string; query: WebGLQuery | null; t0: number } | null = null;
  /** queries asked of the GPU and not yet answered */
  private asked: { frame: number; name: string; query: WebGLQuery }[] = [];
  /** each frame's passes, as they are answered */
  private frames = new Map<number, Map<string, number>>();
  /** frames a disjoint interval spoiled: what they answered is not kept */
  private spoiled = new Set<number>();
  private order: string[] = [];

  constructor(private gl: GL) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  }

  get measuring(): boolean {
    return this.on;
  }

  get method(): FrameProfile['method'] {
    return this.ext ? 'gpu' : 'finish';
  }

  /** Start measuring, from nothing. */
  start(): void {
    this.drop();
    this.on = true;
  }

  /** A pass starts; the one before it, if any, ends. */
  pass(name: string): void {
    if (!this.on) return;
    this.close();
    const gl = this.gl;
    if (this.ext) {
      const query = gl.createQuery()!;
      gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
      this.open = { name, query, t0: 0 };
    } else {
      this.wait();
      this.open = { name, query: null, t0: performance.now() };
    }
    if (!this.order.includes(name)) this.order.push(name);
  }

  /** The frame is drawn: its last pass ends, and whatever the GPU has answered is kept. */
  endFrame(): void {
    if (!this.on) return;
    this.close();
    this.poll();
    this.frame++;
  }

  /** How many frames have been answered in full so far. */
  get answered(): number {
    this.poll();
    let n = 0;
    for (const [f] of this.frames) if (!this.asked.some((a) => a.frame === f)) n++;
    return n;
  }

  /** Stop measuring, and say what the frames answered took. */
  stop(): FrameProfile {
    this.close();
    this.poll();
    const done = [...this.frames].filter(([f]) => !this.asked.some((a) => a.frame === f)).map(([, m]) => m);
    const passes: Record<string, number> = {};
    for (const name of this.order) passes[name] = median(done.map((m) => m.get(name) ?? 0));
    const total = median(done.map((m) => [...m.values()].reduce((a, b) => a + b, 0)));
    const out: FrameProfile = { method: this.method, frames: done.length, passes, total };
    this.drop();
    return out;
  }

  private close(): void {
    const o = this.open;
    if (!o) return;
    this.open = null;
    const gl = this.gl;
    if (o.query && this.ext) {
      gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.asked.push({ frame: this.frame, name: o.name, query: o.query });
      return;
    }
    this.wait();
    this.add(this.frame, o.name, performance.now() - o.t0);
  }

  /** Wait until the GPU has done all it was given: read one pixel of a target of its own, as reading back must wait. */
  private wait(): void {
    const gl = this.gl;
    if (!this.sync) {
      const t = gl.createTexture()!;
      const keep = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindTexture(gl.TEXTURE_2D, keep);
      const fb = gl.createFramebuffer()!;
      const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
      this.sync = { fb, tex: t, px: new Uint8Array(4) };
    }
    const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.sync.fb);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.sync.px);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
  }

  private add(frame: number, name: string, ms: number): void {
    if (this.spoiled.has(frame)) return;
    let m = this.frames.get(frame);
    if (!m) this.frames.set(frame, (m = new Map()));
    m.set(name, (m.get(name) ?? 0) + ms);
  }

  private poll(): void {
    if (!this.ext || !this.asked.length) return;
    const gl = this.gl;
    // A disjoint interval, such as the GPU changing its clock, spoils every query that spanned it: they are dropped.
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
    const keep: typeof this.asked = [];
    for (const a of this.asked) {
      if (!gl.getQueryParameter(a.query, gl.QUERY_RESULT_AVAILABLE)) {
        keep.push(a);
        continue;
      }
      const ns = gl.getQueryParameter(a.query, gl.QUERY_RESULT) as number;
      gl.deleteQuery(a.query);
      if (disjoint) {
        this.spoiled.add(a.frame);
        this.frames.delete(a.frame);
      } else this.add(a.frame, a.name, ns / 1e6);
    }
    this.asked = keep;
  }

  private drop(): void {
    if (this.open?.query && this.ext) this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.open = null;
    for (const a of this.asked) this.gl.deleteQuery(a.query);
    this.asked = [];
    this.frames.clear();
    this.spoiled.clear();
    this.order = [];
    this.frame = 0;
    this.on = false;
  }

  dispose(): void {
    this.drop();
    if (this.sync) {
      this.gl.deleteFramebuffer(this.sync.fb);
      this.gl.deleteTexture(this.sync.tex);
      this.sync = null;
    }
  }
}
