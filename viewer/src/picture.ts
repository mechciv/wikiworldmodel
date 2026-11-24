// A picture of the view to keep (docs/plans/RENDERING.md, step 8): the canvas as a PNG, with the view's link written into
// it, so that the picture can always be made again from the same build, time and camera.

import { encodePngDataUrl } from '../../core/feedback.ts';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A PNG with a text chunk of `keyword` and `text` (Latin-1) put after its header. */
export function pngWithText(png: Uint8Array, keyword: string, text: string): Uint8Array {
  const latin = (s: string) => Uint8Array.from([...s].map((ch) => (ch.charCodeAt(0) < 256 ? ch.charCodeAt(0) : 63)));
  const data = new Uint8Array([...latin(keyword), 0, ...latin(text)]);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(latin('tEXt'), 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  // The signature (8 bytes), then the header chunk: 4 of length, 4 of type, 13 of data, 4 of its check.
  const at = 8 + 25;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return out;
}

export interface CapturedPicture {
  png: Uint8Array;
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Capture the view as a PNG with its reproducible link in a `Source` text chunk.
 * Visible overlay canvases (rivers, fossils, hazards, fields) are composited on top in DOM order.
 */
export async function capturePicture(
  canvas: HTMLCanvasElement,
  link: string,
  overlays: HTMLCanvasElement[] = [],
): Promise<CapturedPicture | null> {
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) return null;

  const visibleOverlays = overlays.filter((layer) => {
    if (layer === canvas || layer.hidden || layer.width <= 0 || layer.height <= 0) return false;
    const style = getComputedStyle(layer);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  });

  let source: HTMLCanvasElement = canvas;
  if (visibleOverlays.length > 0) {
    const composite = document.createElement('canvas');
    composite.width = width;
    composite.height = height;
    const ctx = composite.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, 0, width, height);
      for (const layer of visibleOverlays) ctx.drawImage(layer, 0, 0, width, height);
      source = composite;
    }
  }

  const blob = await new Promise<Blob | null>((done) => source.toBlob(done, 'image/png'));
  if (!blob) return null;
  const png = pngWithText(new Uint8Array(await blob.arrayBuffer()), 'Source', link);
  return { png, dataUrl: encodePngDataUrl(png), width, height };
}

/** Save the canvas as a PNG named for the place and time, its link inside it. */
export async function savePicture(canvas: HTMLCanvasElement, link: string, name: string): Promise<void> {
  const captured = await capturePicture(canvas, link);
  if (!captured) return;
  const url = URL.createObjectURL(new Blob([captured.png as BlobPart], { type: 'image/png' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.png`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
