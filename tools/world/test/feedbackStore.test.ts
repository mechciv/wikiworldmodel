// Local filesystem persistence and HTTP middleware for scene feedback (/api/feedback).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { encodePngDataUrl, type FeedbackResponse, type FeedbackSubmission, type StoredFeedback } from '../../../core/feedback.ts';
import { createFeedbackMiddleware, listFeedback, saveFeedback } from '../src/feedbackStore.ts';

const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function makePayload(feedback = 'Shoreline cliff should be steeper.'): FeedbackSubmission {
  return {
    feedback,
    build: 'build-1',
    url: 'http://localhost:5173/?b=build-1&t=66.5Ma&lat=47.5&lon=-106.9&d=1.0001',
    search: '?b=build-1&t=66.5Ma&lat=47.5&lon=-106.9&d=1.0001',
    state: {
      t: -66_500_000,
      timeLabel: '66.5 Ma',
      cam: { lat: 47.5, lon: -106.9, dist: 1.0001, heading: 120, tilt: 78 },
      window: [-70_000_000, -60_000_000],
      evidence: false,
      clouds: true,
      alt: [],
      picks: [],
      sel: null,
      hour: 17.4,
    },
    context: {
      mode: 'life',
      siteId: 'hell-creek',
      siteName: 'Hell Creek',
      viewport: { width: 1280, height: 760, dpr: 1 },
      canvas: { width: 1280, height: 760 },
    },
    screenshotDataUrl: encodePngDataUrl(TINY_PNG),
  };
}

const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'wikiworldmodel-feedback-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('feedbackStore', () => {
  it('writes screenshot.png and feedback.json and lists entries newest first', () => {
    const root = tempDir();
    const first = saveFeedback(root, makePayload('First note'), new Date('2026-11-24T01:00:00.000Z'));
    const second = saveFeedback(root, makePayload('Second note'), new Date('2026-11-24T02:00:00.000Z'));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const png = readFileSync(join(first.result.dir, 'screenshot.png'));
    expect([...png]).toEqual([...TINY_PNG]);
    const meta = JSON.parse(readFileSync(join(first.result.dir, 'feedback.json'), 'utf8')) as StoredFeedback;
    expect(meta.feedback).toBe('First note');
    expect(meta.screenshot).toBe('screenshot.png');
    expect(meta.screenshotBytes).toBe(TINY_PNG.length);
    expect(meta.state.cam.lat).toBe(47.5);
    expect(meta.context.siteName).toBe('Hell Creek');

    const items = listFeedback(root);
    expect(items.map((x) => x.feedback)).toEqual(['Second note', 'First note']);
  });

  it('serves POST /api/feedback, GET /api/feedback, and GET /api/feedback/<id>/screenshot.png over HTTP', async () => {
    const base = tempDir();
    const root = join(base, '.feedback');
    const middleware = createFeedbackMiddleware(root, base);
    const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const url = (path: string) => `http://127.0.0.1:${port}${path}`;

    try {
      const post = await fetch(url('/api/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makePayload('Trees are floating slightly above the slope.')),
      });
      expect(post.status).toBe(201);
      const saved = (await post.json()) as FeedbackResponse;
      expect(saved.id).toBeTruthy();
      expect(saved.path).toBe(`.feedback/${saved.id}`);

      const list = await fetch(url('/api/feedback'));
      expect(list.status).toBe(200);
      const body = (await list.json()) as { items: StoredFeedback[] };
      expect(body.items).toHaveLength(1);
      expect(body.items[0].feedback).toBe('Trees are floating slightly above the slope.');

      const shot = await fetch(url(`/api/feedback/${encodeURIComponent(saved.id)}/screenshot.png`));
      expect(shot.status).toBe(200);
      expect(shot.headers.get('content-type')).toBe('image/png');
      const shotBytes = new Uint8Array(await shot.arrayBuffer());
      expect([...shotBytes]).toEqual([...TINY_PNG]);

      // Rejects invalid submissions and path traversal attempts.
      const bad = await fetch(url('/api/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: '' }),
      });
      expect(bad.status).toBe(400);

      const traversal = await fetch(url('/api/feedback/..%2F..%2Fetc/screenshot.png'));
      expect(traversal.status).toBe(400);

      const badMethod = await fetch(url('/api/feedback'), { method: 'DELETE' });
      expect(badMethod.status).toBe(405);

      const badOrigin = await fetch(url('/api/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
        body: '{}',
      });
      expect(badOrigin.status).toBe(403);
      expect(badOrigin.headers.get('x-content-type-options')).toBe('nosniff');

      const badMime = await fetch(url('/api/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{}',
      });
      expect(badMime.status).toBe(415);

      const badUri = await fetch(url('/api/feedback/%E0%A4%A/screenshot.png'));
      expect(badUri.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
