import { footprintText, type Footprint } from '../../../core/footprint.ts';
import { FootprintSurface } from '../city/footprint.ts';
import './footprint.css';

/** Opens from a chosen, sourced claim in the ordinary record inspector. The site has a regional
 * location; the specimen is therefore shown in its own frame, with no invented geographic pin. */
export function inspectFootprint(form: Footprint, recordLabel: string, onSource: () => void): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'footprint-detail';
  dialog.setAttribute('aria-label', 'Footprint model');
  dialog.innerHTML = `<header><h2></h2><button type="button" class="foot-close" aria-label="Close footprint model">×</button></header>
    <div class="foot-view"><canvas width="840" height="440" aria-label="Rotatable relief model of the impression"></canvas>
      <span class="foot-scale"></span></div>
    <div class="foot-controls">
      <label>Rotate <input type="range" min="-180" max="180" value="-48" step="1"></label>
      <label>Tilt <input type="range" min="45" max="85" value="57" step="1"></label>
      <label>Zoom <input type="range" min="0.7" max="1.7" value="1.14" step="0.02"></label>
    </div>
    <p class="foot-dimensions"></p>
    <p>Reconstruction from measured spans. The outline between them and the depth are illustrative.</p>
    <button type="button" class="foot-source">See measurements and source</button>`;
  const title = dialog.querySelector('h2')!;
  title.textContent = `${recordLabel} · ${form.specimen}`;
  dialog.querySelector('.foot-dimensions')!.textContent = footprintText(form);
  const canvas = dialog.querySelector('canvas')!;
  const ctx = canvas.getContext('2d');
  const surface = new FootprintSurface(form);
  const scale = dialog.querySelector<HTMLElement>('.foot-scale')!;
  const [turn, tilt, zoom] = Array.from(dialog.querySelectorAll('input'));
  let frame = 0;
  function draw() {
    frame = 0;
    if (!ctx) return;
    const width = Math.min(1000, Math.max(320, Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio, 1.5))));
    const height = Math.round(width * .53);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const radians = Math.PI / 180;
    const pixels = surface.draw(width, height, turn.valueAsNumber * radians, tilt.valueAsNumber * radians, zoom.valueAsNumber);
    ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
    // A horizontal screen measurement stays in the ground plane under an orthographic camera.
    const approx = form.length_mm / 5;
    const unit = 10 ** Math.floor(Math.log10(approx));
    const mm = (approx >= 5 * unit ? 5 : approx >= 2 * unit ? 2 : 1) * unit;
    scale.textContent = `${mm} mm`;
    scale.style.width = `${mm / surface.mmPerPixel(width, height, zoom.valueAsNumber) * canvas.clientWidth / width}px`;
  }
  const redraw = () => { if (!frame) frame = requestAnimationFrame(draw); };
  for (const input of [turn, tilt, zoom]) input.oninput = redraw;
  let drag: { x: number; y: number; turn: number; tilt: number } | undefined;
  canvas.onpointerdown = (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, turn: turn.valueAsNumber, tilt: tilt.valueAsNumber };
  };
  canvas.onpointermove = (e) => {
    if (!drag) return;
    turn.value = String(((drag.turn + (e.clientX - drag.x) * .5 + 540) % 360) - 180);
    tilt.value = String(drag.tilt + (e.clientY - drag.y) * .2);
    redraw();
  };
  canvas.onlostpointercapture = () => { drag = undefined; };
  const resized = new ResizeObserver(redraw);
  dialog.querySelector<HTMLButtonElement>('.foot-close')!.onclick = () => dialog.close();
  dialog.querySelector<HTMLButtonElement>('.foot-source')!.onclick = () => { dialog.close(); onSource(); };
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  dialog.addEventListener('close', () => {
    cancelAnimationFrame(frame);
    resized.disconnect();
    dialog.remove();
  }, { once: true });
  document.body.appendChild(dialog);
  dialog.showModal();
  draw();
  resized.observe(canvas);
}
