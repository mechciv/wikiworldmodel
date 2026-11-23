import type { GroundLevel } from '../../../core/city.ts';

/** The terrain shader's normal and shoreline texture. Living scenes make it in their worker. */
export function groundNormals(g: Omit<GroundLevel, 'url'>, z: Int16Array): Uint8Array<ArrayBuffer> {
  const n = new Uint8Array(g.nx * g.ny * 4);
  // Its heights are whole steps of its unit above its base: decimetres above nought, where it does not say.
  const unit = g.unit ?? 0.1;
  const base = g.base ?? 0;
  const scale = unit / (2 * g.cell);
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) {
      const l = z[j * g.nx + Math.max(0, i - 1)];
      const r = z[j * g.nx + Math.min(g.nx - 1, i + 1)];
      const d = z[Math.max(0, j - 1) * g.nx + i];
      const u = z[Math.min(g.ny - 1, j + 1) * g.nx + i];
      const nx = (l - r) * scale;
      const ny = (d - u) * scale;
      const q = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const at = (j * g.nx + i) * 4;
      n[at] = Math.round((nx * q * 0.5 + 0.5) * 255);
      n[at + 1] = Math.round((ny * q * 0.5 + 0.5) * 255);
      // How far above the sea, finely near the shore: the coast is drawn where this crosses a half.
      n[at + 2] = Math.max(0, Math.min(255, Math.floor(127 + (z[j * g.nx + i] * unit + base) * 0.4)));
      n[at + 3] = 255;
    }
  }
  return n;
}
