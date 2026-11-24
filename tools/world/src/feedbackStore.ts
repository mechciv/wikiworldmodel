// Local filesystem storage and HTTP middleware for viewer scene feedback (/api/feedback).
// Each submission is saved in its own folder under the feedback root (by default .feedback/)
// with screenshot.png and feedback.json side by side.
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, relative, resolve, sep } from 'node:path';
import {
  isSafeFeedbackId,
  makeFeedbackId,
  parseFeedbackSubmission,
  type FeedbackResponse,
  type StoredFeedback,
} from '../../../core/feedback.ts';

/** Max JSON request size: enough for a 16 MiB PNG base64-encoded plus metadata. */
export const MAX_FEEDBACK_BODY_BYTES = 24 * 1024 * 1024;

export interface SaveFeedbackResult {
  record: StoredFeedback;
  dir: string;
}

/** Persist a validated feedback submission and its PNG screenshot under `root/<id>/`. */
export function saveFeedback(root: string, raw: unknown, now = new Date()): { ok: true; result: SaveFeedbackResult } | { ok: false; error: string } {
  const parsed = parseFeedbackSubmission(raw);
  if (!parsed.ok) return parsed;
  const { value, screenshotBytes } = parsed;
  const id = makeFeedbackId(now, randomBytes(4).toString('hex'));
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  const screenshot = 'screenshot.png';
  writeFileSync(join(dir, screenshot), screenshotBytes);
  const record: StoredFeedback = {
    id,
    createdAt: now.toISOString(),
    feedback: value.feedback,
    build: value.build,
    url: value.url,
    search: value.search,
    state: value.state,
    context: value.context,
    screenshot,
    screenshotBytes: screenshotBytes.length,
  };
  writeFileSync(join(dir, 'feedback.json'), JSON.stringify(record, null, 2) + '\n');
  return { ok: true, result: { record, dir } };
}

/** Read all stored feedback records in `root`, newest first. */
export function listFeedback(root: string): StoredFeedback[] {
  if (!existsSync(root)) return [];
  const items: StoredFeedback[] = [];
  for (const name of readdirSync(root)) {
    if (!isSafeFeedbackId(name)) continue;
    const meta = join(root, name, 'feedback.json');
    if (!existsSync(meta)) continue;
    try {
      items.push(JSON.parse(readFileSync(meta, 'utf8')) as StoredFeedback);
    } catch {
      // Skip unreadable or partially written folders.
    }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;
    req.on('data', (chunk: Buffer | string) => {
      if (done) return;
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      total += buf.length;
      if (total > maxBytes) {
        done = true;
        rejectBody(Object.assign(new Error('Request body too large.'), { statusCode: 413 }));
        req.resume();
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolveBody(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => {
      if (done) return;
      done = true;
      rejectBody(err);
    });
  });
}

/**
 * Connect/Vite middleware handling:
 * - POST /api/feedback — validate and store a screenshot + view parameters + note
 * - GET  /api/feedback — list stored feedback entries (newest first)
 * - GET  /api/feedback/<id>/screenshot.png — serve a stored screenshot
 */
export function createFeedbackMiddleware(rootDir: string, displayBase?: string) {
  const root = resolve(rootDir);
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const pathname = (req.url ?? '').split('?')[0];
    if (pathname !== '/api/feedback' && !pathname.startsWith('/api/feedback/')) return next();

    if (pathname === '/api/feedback') {
      if (req.method === 'GET') {
        sendJson(res, 200, { items: listFeedback(root) });
        return;
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        sendJson(res, 405, { error: 'Method not allowed.' });
        return;
      }
      void readBody(req, MAX_FEEDBACK_BODY_BYTES)
        .then((text) => {
          let raw: unknown;
          try {
            raw = JSON.parse(text);
          } catch {
            sendJson(res, 400, { error: 'Body must be valid JSON.' });
            return;
          }
          const saved = saveFeedback(root, raw);
          if (!saved.ok) {
            sendJson(res, 400, { error: saved.error });
            return;
          }
          const { record, dir } = saved.result;
          const base = displayBase ? resolve(displayBase) : undefined;
          const pathLabel = base && dir.startsWith(base + sep) ? relative(base, dir).replace(/\\/g, '/') : dir;
          const response: FeedbackResponse = { id: record.id, createdAt: record.createdAt, path: pathLabel };
          sendJson(res, 201, response);
        })
        .catch((err: unknown) => {
          const code = typeof err === 'object' && err !== null && 'statusCode' in err ? Number((err as { statusCode: unknown }).statusCode) : 500;
          const message = err instanceof Error ? err.message : 'Failed to store feedback.';
          sendJson(res, Number.isFinite(code) ? code : 500, { error: message });
        });
      return;
    }

    const match = /^\/api\/feedback\/([^/]+)\/screenshot\.png$/.exec(pathname);
    if (match && req.method === 'GET') {
      const id = decodeURIComponent(match[1]);
      if (!isSafeFeedbackId(id)) {
        sendJson(res, 400, { error: 'Invalid feedback id.' });
        return;
      }
      const file = resolve(root, id, 'screenshot.png');
      if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
        sendJson(res, 404, { error: 'Screenshot not found.' });
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-store');
      createReadStream(file).pipe(res);
      return;
    }

    sendJson(res, 404, { error: 'Not found.' });
  };
}
