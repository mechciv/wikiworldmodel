// Scene feedback captured from the viewer: a screenshot of the current view, the reproducible
// parameters that drew it, and the reader's note. Shared between the viewer and the local storage
// endpoint so both validate and read the exact same shape.

export interface FeedbackCamera {
  lat: number;
  lon: number;
  dist: number;
  heading?: number;
  tilt?: number;
}

export interface FeedbackViewState {
  /** astronomical year */
  t: number;
  /** human-readable time as shown in the viewer */
  timeLabel: string;
  cam: FeedbackCamera;
  /** the time control's window, [older, younger] astronomical years */
  window: [number, number];
  evidence: boolean;
  clouds: boolean;
  alt: string[];
  picks: string[];
  sel: string | null;
  hour: number;
  month?: number;
  tree?: boolean;
  layers?: string[];
  people?: boolean;
  quality?: 'fast';
  clock?: number;
  still?: boolean;
}

export type FeedbackMode = 'globe' | 'city' | 'life';

export interface FeedbackContext {
  mode: FeedbackMode;
  siteId?: string;
  siteName?: string;
  viewport: { width: number; height: number; dpr: number };
  canvas: { width: number; height: number };
  userAgent?: string;
}

/** What the viewer posts to /api/feedback. */
export interface FeedbackSubmission {
  feedback: string;
  build: string;
  url: string;
  search: string;
  state: FeedbackViewState;
  context: FeedbackContext;
  /** data:image/png;base64,... */
  screenshotDataUrl: string;
}

/** What is written beside screenshot.png in storage. */
export interface StoredFeedback {
  id: string;
  createdAt: string;
  feedback: string;
  build: string;
  url: string;
  search: string;
  state: FeedbackViewState;
  context: FeedbackContext;
  screenshot: string;
  screenshotBytes: number;
}

/** What POST /api/feedback returns on success. */
export interface FeedbackResponse {
  id: string;
  createdAt: string;
  path: string;
}

export const MAX_FEEDBACK_LENGTH = 10_000;
export const MAX_SCREENSHOT_BYTES = 16 * 1024 * 1024;
export const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const SAFE_ID = /^[0-9A-Za-z._-]+$/;

/** Whether an id is safe to use as a single path segment. */
export function isSafeFeedbackId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && id !== '.' && id !== '..' && SAFE_ID.test(id);
}

/** A sortable, filesystem-safe id for a stored feedback entry. */
export function makeFeedbackId(now = new Date(), suffix?: string): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const tag = suffix ?? Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  return `${stamp}-${tag}`;
}

/** Decode a standard base64 string into bytes without relying on Node-only globals. */
export function decodeBase64(b64: string): Uint8Array | null {
  const cleaned = b64.replace(/\s+/g, '');
  if (!cleaned || cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) return null;
  try {
    const bin = atob(cleaned);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Encode bytes to a PNG data URL without overflowing the call stack on large images. */
export function encodePngDataUrl(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + step)));
  }
  return PNG_DATA_URL_PREFIX + btoa(chunks.join(''));
}

/** Whether bytes begin with the 8-byte PNG signature. */
export function isPngBytes(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_MAGIC.length) return false;
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return false;
  }
  return true;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Validate an incoming submission and decode its PNG screenshot. */
export function parseFeedbackSubmission(
  raw: unknown,
): { ok: true; value: FeedbackSubmission; screenshotBytes: Uint8Array } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: 'Body must be a JSON object.' };
  if (typeof raw.feedback !== 'string') return { ok: false, error: 'feedback must be a string.' };
  const feedback = raw.feedback.trim();
  if (!feedback) return { ok: false, error: 'Feedback text is required.' };
  if (feedback.length > MAX_FEEDBACK_LENGTH) return { ok: false, error: `Feedback exceeds ${MAX_FEEDBACK_LENGTH} characters.` };

  if (typeof raw.build !== 'string' || !raw.build.trim()) return { ok: false, error: 'build is required.' };
  if (typeof raw.url !== 'string' || !raw.url.trim()) return { ok: false, error: 'url is required.' };
  if (typeof raw.search !== 'string') return { ok: false, error: 'search must be a string.' };

  if (!isRecord(raw.state)) return { ok: false, error: 'state is required.' };
  const st = raw.state;
  if (!isFiniteNum(st.t)) return { ok: false, error: 'state.t must be a finite number.' };
  if (typeof st.timeLabel !== 'string') return { ok: false, error: 'state.timeLabel must be a string.' };
  if (!isRecord(st.cam) || !isFiniteNum(st.cam.lat) || !isFiniteNum(st.cam.lon) || !isFiniteNum(st.cam.dist)) {
    return { ok: false, error: 'state.cam must include finite lat, lon and dist.' };
  }
  if (st.cam.heading !== undefined && !isFiniteNum(st.cam.heading)) return { ok: false, error: 'state.cam.heading must be finite.' };
  if (st.cam.tilt !== undefined && !isFiniteNum(st.cam.tilt)) return { ok: false, error: 'state.cam.tilt must be finite.' };
  if (!Array.isArray(st.window) || st.window.length !== 2 || !isFiniteNum(st.window[0]) || !isFiniteNum(st.window[1])) {
    return { ok: false, error: 'state.window must be a pair of finite numbers.' };
  }
  if (typeof st.evidence !== 'boolean' || typeof st.clouds !== 'boolean') {
    return { ok: false, error: 'state.evidence and state.clouds must be booleans.' };
  }
  if (!isStringArray(st.alt) || !isStringArray(st.picks)) {
    return { ok: false, error: 'state.alt and state.picks must be string arrays.' };
  }
  if (st.sel !== null && typeof st.sel !== 'string') return { ok: false, error: 'state.sel must be a string or null.' };
  if (!isFiniteNum(st.hour)) return { ok: false, error: 'state.hour must be a finite number.' };
  if (st.month !== undefined && !isFiniteNum(st.month)) return { ok: false, error: 'state.month must be a finite number.' };
  if (st.tree !== undefined && typeof st.tree !== 'boolean') return { ok: false, error: 'state.tree must be a boolean.' };
  if (st.layers !== undefined && !isStringArray(st.layers)) return { ok: false, error: 'state.layers must be a string array.' };
  if (st.people !== undefined && typeof st.people !== 'boolean') return { ok: false, error: 'state.people must be a boolean.' };
  if (st.quality !== undefined && st.quality !== 'fast') return { ok: false, error: 'state.quality must be "fast" when set.' };
  if (st.clock !== undefined && !isFiniteNum(st.clock)) return { ok: false, error: 'state.clock must be a finite number.' };
  if (st.still !== undefined && typeof st.still !== 'boolean') return { ok: false, error: 'state.still must be a boolean.' };

  if (!isRecord(raw.context)) return { ok: false, error: 'context is required.' };
  const ctx = raw.context;
  if (ctx.mode !== 'globe' && ctx.mode !== 'city' && ctx.mode !== 'life') {
    return { ok: false, error: 'context.mode must be globe, city or life.' };
  }
  if (ctx.siteId !== undefined && typeof ctx.siteId !== 'string') return { ok: false, error: 'context.siteId must be a string.' };
  if (ctx.siteName !== undefined && typeof ctx.siteName !== 'string') return { ok: false, error: 'context.siteName must be a string.' };
  if (!isRecord(ctx.viewport) || !isFiniteNum(ctx.viewport.width) || !isFiniteNum(ctx.viewport.height) || !isFiniteNum(ctx.viewport.dpr)) {
    return { ok: false, error: 'context.viewport must include finite width, height and dpr.' };
  }
  if (!isRecord(ctx.canvas) || !isFiniteNum(ctx.canvas.width) || !isFiniteNum(ctx.canvas.height)) {
    return { ok: false, error: 'context.canvas must include finite width and height.' };
  }
  if (ctx.userAgent !== undefined && typeof ctx.userAgent !== 'string') return { ok: false, error: 'context.userAgent must be a string.' };

  if (typeof raw.screenshotDataUrl !== 'string' || !raw.screenshotDataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    return { ok: false, error: 'screenshotDataUrl must be a base64 PNG data URL.' };
  }
  const b64 = raw.screenshotDataUrl.slice(PNG_DATA_URL_PREFIX.length);
  // Quick upper bound before decoding: 4 base64 chars produce at most 3 bytes.
  if (Math.ceil((b64.length * 3) / 4) > MAX_SCREENSHOT_BYTES + 4) {
    return { ok: false, error: `Screenshot exceeds ${MAX_SCREENSHOT_BYTES} bytes.` };
  }
  const screenshotBytes = decodeBase64(b64);
  if (!screenshotBytes || !isPngBytes(screenshotBytes)) {
    return { ok: false, error: 'screenshotDataUrl does not contain a valid PNG image.' };
  }
  if (screenshotBytes.length > MAX_SCREENSHOT_BYTES) {
    return { ok: false, error: `Screenshot exceeds ${MAX_SCREENSHOT_BYTES} bytes.` };
  }

  const cam: FeedbackCamera = {
    lat: st.cam.lat,
    lon: st.cam.lon,
    dist: st.cam.dist,
    ...(st.cam.heading !== undefined ? { heading: st.cam.heading } : {}),
    ...(st.cam.tilt !== undefined ? { tilt: st.cam.tilt } : {}),
  };
  const state: FeedbackViewState = {
    t: st.t,
    timeLabel: st.timeLabel,
    cam,
    window: [st.window[0], st.window[1]],
    evidence: st.evidence,
    clouds: st.clouds,
    alt: st.alt,
    picks: st.picks,
    sel: st.sel,
    hour: st.hour,
    ...(st.month !== undefined ? { month: st.month } : {}),
    ...(st.tree !== undefined ? { tree: st.tree } : {}),
    ...(st.layers !== undefined ? { layers: st.layers } : {}),
    ...(st.people !== undefined ? { people: st.people } : {}),
    ...(st.quality !== undefined ? { quality: st.quality } : {}),
    ...(st.clock !== undefined ? { clock: st.clock } : {}),
    ...(st.still !== undefined ? { still: st.still } : {}),
  };
  const context: FeedbackContext = {
    mode: ctx.mode,
    ...(ctx.siteId !== undefined ? { siteId: ctx.siteId } : {}),
    ...(ctx.siteName !== undefined ? { siteName: ctx.siteName } : {}),
    viewport: { width: ctx.viewport.width, height: ctx.viewport.height, dpr: ctx.viewport.dpr },
    canvas: { width: ctx.canvas.width, height: ctx.canvas.height },
    ...(ctx.userAgent !== undefined ? { userAgent: ctx.userAgent } : {}),
  };

  return {
    ok: true,
    value: {
      feedback,
      build: raw.build.trim(),
      url: raw.url.trim(),
      search: raw.search,
      state,
      context,
      screenshotDataUrl: raw.screenshotDataUrl,
    },
    screenshotBytes,
  };
}

/** Short, readable summary pills of the captured view parameters for the dialog. */
export function formatViewSummary(params: { build: string; state: FeedbackViewState; context: FeedbackContext }): string[] {
  const { build, state, context } = params;
  const items: string[] = [];
  if (context.siteName) items.push(context.siteName);
  else if (context.mode === 'globe') items.push('Globe view');
  else items.push(context.mode === 'life' ? 'Living scene' : 'City scene');

  if (state.timeLabel) items.push(state.timeLabel);
  const lat = `${Math.abs(state.cam.lat).toFixed(state.cam.dist < 1.05 ? 4 : 1)}°${state.cam.lat >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(state.cam.lon).toFixed(state.cam.dist < 1.05 ? 4 : 1)}°${state.cam.lon >= 0 ? 'E' : 'W'}`;
  items.push(`${lat}, ${lon}`);

  const km = Math.max(0, (state.cam.dist - 1) * 6371);
  items.push(km < 1 ? `${Math.round(km * 1000)} m` : km < 100 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString('en-US')} km`);

  if (state.sel) items.push(`Selected: ${state.sel}`);
  if (state.evidence) items.push('How we know');
  if (state.layers?.length) items.push(`Layers: ${state.layers.join(', ')}`);
  if (state.alt.length) items.push(`Alternatives: ${state.alt.length}`);
  items.push(`build ${build}`);
  return items;
}
