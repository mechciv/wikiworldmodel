// "Improve this scene" modal: captures the current view's screenshot and reproducible parameters,
// lets the user write feedback, and stores both through /api/feedback (with a local download
// fallback if no feedback endpoint is available on the host).
import {
  formatViewSummary,
  MAX_FEEDBACK_LENGTH,
  type FeedbackContext,
  type FeedbackResponse,
  type FeedbackSubmission,
  type FeedbackViewState,
} from '../../../core/feedback.ts';
import type { CapturedPicture } from '../picture.ts';

export interface CapturedScene {
  build: string;
  url: string;
  search: string;
  state: FeedbackViewState;
  context: FeedbackContext;
  screenshot: CapturedPicture;
}

export interface FeedbackHost {
  capture(): Promise<CapturedScene | null>;
  endpoint?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export class FeedbackDialog {
  readonly el: HTMLElement;
  private form: HTMLFormElement;
  private preview: HTMLImageElement;
  private previewSize: HTMLElement;
  private summary: HTMLElement;
  private paramsPre: HTMLElement;
  private details: HTMLDetailsElement;
  private input: HTMLTextAreaElement;
  private status: HTMLElement;
  private submitBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private downloadBtn: HTMLButtonElement;
  private opener: HTMLElement | null = null;
  private captured: CapturedScene | null = null;
  private busy = false;
  private saved = false;

  constructor(private host: FeedbackHost) {
    this.el = document.createElement('div');
    this.el.className = 'feedback-modal';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="fb-dialog" role="dialog" aria-modal="true" aria-labelledby="fb-title">
        <header>
          <h1 id="fb-title">Improve this scene</h1>
          <button type="button" class="fb-close" aria-label="Close">×</button>
        </header>
        <div class="fb-body">
          <figure class="fb-shot">
            <img class="fb-preview" alt="Screenshot of the current view" />
            <figcaption class="fb-size"></figcaption>
          </figure>
          <div class="fb-summary" aria-label="Captured view parameters"></div>
          <details class="fb-details">
            <summary>Captured parameters</summary>
            <pre class="fb-params"></pre>
          </details>
          <form class="fb-form">
            <label class="fb-label" for="fb-text">What would make this view better?</label>
            <textarea
              id="fb-text"
              class="fb-input"
              rows="4"
              maxlength="${MAX_FEEDBACK_LENGTH}"
              placeholder="Describe what looks wrong, missing, or could be improved in this scene…"
            ></textarea>
            <p class="fb-status" aria-live="polite"></p>
            <footer>
              <span class="fb-hint">Screenshot and view parameters are attached automatically.</span>
              <div class="fb-actions">
                <button type="button" class="fb-download" hidden>Download files</button>
                <button type="button" class="fb-cancel">Cancel</button>
                <button type="submit" class="fb-submit" disabled>Save feedback</button>
              </div>
            </footer>
          </form>
        </div>
      </div>`;

    this.form = this.el.querySelector('.fb-form')!;
    this.preview = this.el.querySelector('.fb-preview')!;
    this.previewSize = this.el.querySelector('.fb-size')!;
    this.summary = this.el.querySelector('.fb-summary')!;
    this.paramsPre = this.el.querySelector('.fb-params')!;
    this.details = this.el.querySelector('.fb-details')!;
    this.input = this.el.querySelector('.fb-input')!;
    this.status = this.el.querySelector('.fb-status')!;
    this.submitBtn = this.el.querySelector('.fb-submit')!;
    this.cancelBtn = this.el.querySelector('.fb-cancel')!;
    this.downloadBtn = this.el.querySelector('.fb-download')!;

    this.el.querySelector<HTMLButtonElement>('.fb-close')!.onclick = () => this.close();
    this.cancelBtn.onclick = () => this.close();
    this.downloadBtn.onclick = () => this.downloadBundle();

    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el && !this.busy) this.close();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.busy) {
        e.stopPropagation();
        this.close();
      }
    });
    this.input.addEventListener('input', () => {
      this.saved = false;
      this.syncButtons();
    });
    this.input.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !this.submitBtn.disabled) {
        e.preventDefault();
        this.form.requestSubmit();
      }
    });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  async open(): Promise<void> {
    if (this.busy) return;
    this.opener = document.activeElement as HTMLElement | null;
    const captured = await this.host.capture();
    if (!captured) return;

    this.captured = captured;
    this.saved = false;
    this.busy = false;
    this.preview.src = captured.screenshot.dataUrl;
    this.previewSize.textContent = `${captured.screenshot.width} × ${captured.screenshot.height}`;

    const pills = formatViewSummary({ build: captured.build, state: captured.state, context: captured.context });
    this.summary.innerHTML = pills.map((p) => `<span class="fb-pill">${esc(p)}</span>`).join('');
    this.paramsPre.textContent = JSON.stringify(
      {
        build: captured.build,
        url: captured.url,
        search: captured.search,
        state: captured.state,
        context: captured.context,
      },
      null,
      2,
    );
    this.details.open = false;
    this.input.value = '';
    this.input.disabled = false;
    this.setStatus('', 'idle');
    this.downloadBtn.hidden = true;
    this.cancelBtn.textContent = 'Cancel';
    this.submitBtn.hidden = false;
    this.submitBtn.textContent = 'Save feedback';
    this.syncButtons();

    this.el.hidden = false;
    if (!matchMedia('(pointer: coarse)').matches) this.input.focus();
  }

  close(): void {
    this.el.hidden = true;
    this.captured = null;
    this.preview.removeAttribute('src');
    this.opener?.focus?.();
  }

  private setStatus(text: string, kind: 'idle' | 'ok' | 'err'): void {
    this.status.textContent = text;
    this.status.className = kind === 'idle' ? 'fb-status' : `fb-status fb-status-${kind}`;
  }

  private syncButtons(): void {
    const hasText = this.input.value.trim().length > 0;
    this.submitBtn.disabled = this.busy || this.saved || !hasText || !this.captured;
  }

  private payload(): FeedbackSubmission | null {
    if (!this.captured) return null;
    const feedback = this.input.value.trim();
    if (!feedback) return null;
    return {
      feedback,
      build: this.captured.build,
      url: this.captured.url,
      search: this.captured.search,
      state: this.captured.state,
      context: this.captured.context,
      screenshotDataUrl: this.captured.screenshot.dataUrl,
    };
  }

  private async submit(): Promise<void> {
    const body = this.payload();
    if (!body || this.busy) return;
    this.busy = true;
    this.input.disabled = true;
    this.submitBtn.textContent = 'Saving…';
    this.setStatus('', 'idle');
    this.syncButtons();

    try {
      const res = await fetch(this.host.endpoint ?? '/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const contentType = res.headers.get('content-type') ?? '';
      const data = contentType.includes('application/json') ? ((await res.json()) as Partial<FeedbackResponse & { error?: string }>) : null;
      if (!res.ok) {
        const unavailable = res.status === 404 || res.status === 405;
        const message = unavailable
          ? 'No feedback endpoint is running on this host. You can download the screenshot and parameters instead.'
          : data?.error ?? `Could not save feedback (HTTP ${res.status}).`;
        this.setStatus(message, 'err');
        this.downloadBtn.hidden = false;
        this.input.disabled = false;
        this.submitBtn.textContent = 'Save feedback';
        return;
      }
      this.saved = true;
      const where = data?.path ? `Saved to ${data.path}` : 'Feedback saved.';
      this.setStatus(where, 'ok');
      this.submitBtn.hidden = true;
      this.downloadBtn.hidden = true;
      this.cancelBtn.textContent = 'Done';
      this.cancelBtn.focus();
    } catch {
      this.setStatus('Could not reach the feedback endpoint. You can download the screenshot and parameters instead.', 'err');
      this.downloadBtn.hidden = false;
      this.input.disabled = false;
      this.submitBtn.textContent = 'Save feedback';
    } finally {
      this.busy = false;
      this.syncButtons();
    }
  }

  private downloadBundle(): void {
    if (!this.captured) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `wikiworldmodel-feedback-${stamp}`;
    const pngBlob = new Blob([this.captured.screenshot.png as BlobPart], { type: 'image/png' });
    triggerDownload(pngBlob, `${base}.png`);
    const meta = {
      createdAt: new Date().toISOString(),
      feedback: this.input.value.trim(),
      build: this.captured.build,
      url: this.captured.url,
      search: this.captured.search,
      state: this.captured.state,
      context: this.captured.context,
      screenshot: `${base}.png`,
    };
    const jsonBlob = new Blob([JSON.stringify(meta, null, 2) + '\n'], { type: 'application/json' });
    triggerDownload(jsonBlob, `${base}.json`);
    this.setStatus(`Downloaded ${base}.png and ${base}.json.`, 'ok');
  }
}
