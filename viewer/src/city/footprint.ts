// Orthographic view into a local impression. Ray/surface intersections use the same generated
// height field at every angle. Shading comes from its surface normal; no image plates are used.
import type { Footprint } from '../../../core/footprint.ts';
import { footprintDepth, footprintSection } from '../../../world/generators/life/footprint/v1.ts';

export class FootprintSurface {
  private readonly nx = 160;
  private readonly ny = 320;
  private readonly z = new Float32Array(this.nx * this.ny);
  private readonly dx: number;
  private readonly dy: number;
  private readonly startY: number;

  constructor(private readonly form: Footprint) {
    this.dx = form.width_mm * 1.28 / (this.nx - 1);
    this.startY = -form.length_mm * .04 - (form.heel_drag_approx_mm ?? 0);
    this.dy = (form.length_mm * 1.04 - this.startY) / (this.ny - 1);
    for (let j = 0; j < this.ny; j++) {
      const y = j * this.dy + this.startY;
      const [cx, radius] = footprintSection(form, y);
      const drag = form.heel_drag_approx_mm;
      if (drag && y < 0 && y > -drag) {
        const along = 1 + y / drag;
        for (let i = 0; i < this.nx; i++) {
          const across = (i * this.dx - form.width_mm * .64) / (form.heel_width_mm * .28);
          this.z[j * this.nx + i] = -form.length_mm * .014 * Math.sin(Math.PI * along) * Math.exp(-across * across * 2);
        }
      }
      if (!radius) continue;
      for (let i = 0; i < this.nx; i++) {
        const across = (i * this.dx - form.width_mm * .64 - cx) / radius;
        const depth = footprintDepth(y / form.length_mm, form.side === 'left' ? -across : across, !!form.toes);
        // Vertical exaggeration is a drawing choice. This view has no calibrated depth axis.
        this.z[j * this.nx + i] = -form.length_mm * .058 * depth;
      }
    }
  }

  private height(x: number, y: number): number {
    const u = (x + this.form.width_mm * .64) / this.dx;
    const v = (y + this.form.length_mm * .5 - this.startY) / this.dy;
    if (u < 0 || v < 0 || u >= this.nx - 1 || v >= this.ny - 1) return 0;
    const i = Math.floor(u), j = Math.floor(v);
    const k = j * this.nx + i;
    const a = u - i, b = v - j;
    return (this.z[k] * (1 - a) + this.z[k + 1] * a) * (1 - b) +
      (this.z[k + this.nx] * (1 - a) + this.z[k + this.nx + 1] * a) * b;
  }

  mmPerPixel(width: number, height: number, zoom: number): number {
    const extent = this.form.length_mm + (this.form.heel_drag_approx_mm ?? 0);
    return extent * 1.25 / (Math.min(width, height) * zoom);
  }

  draw(width: number, height: number, azimuth: number, elevation: number, zoom: number): Uint8ClampedArray<ArrayBuffer> {
    const pixels = new Uint8ClampedArray(width * height * 4);
    const c = Math.cos(azimuth), s = Math.sin(azimuth);
    const sin = Math.sin(elevation), cot = Math.cos(elevation) / sin;
    const scale = this.mmPerPixel(width, height, zoom);
    const centerY = -(this.form.heel_drag_approx_mm ?? 0) / 2;
    for (let py = 0; py < height; py++) {
      const v = (height / 2 - py) * scale / sin;
      for (let px = 0; px < width; px++) {
        const u = (px - width / 2) * scale;
        const baseX = c * u - s * v, baseY = centerY + s * u + c * v;
        let x = baseX, y = baseY, z = this.height(x, y);
        if (z < 0) {
          for (let k = 0; k < 5; k++) {
            x = baseX + s * z * cot;
            y = baseY - c * z * cot;
            z = this.height(x, y);
          }
        }
        const gx = (this.height(x + this.dx, y) - this.height(x - this.dx, y)) / (2 * this.dx);
        const gy = (this.height(x, y + this.dy) - this.height(x, y - this.dy)) / (2 * this.dy);
        const light = Math.max(0, (.8 * gx + .34 * gy + .49) / Math.hypot(gx, gy, 1));
        const tone = .65 + .48 * light + .9 * z / this.form.length_mm;
        const i = (py * width + px) * 4;
        pixels[i] = 222 * tone; pixels[i + 1] = 199 * tone; pixels[i + 2] = 163 * tone; pixels[i + 3] = 255;
      }
    }
    return pixels;
  }
}
