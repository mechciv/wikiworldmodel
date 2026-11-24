// Validation, PNG encoding/decoding, ID generation and summary pills for scene feedback (core/feedback.ts).
import { describe, expect, it } from 'vitest';
import {
  decodeBase64,
  encodePngDataUrl,
  formatViewSummary,
  isPngBytes,
  isSafeFeedbackId,
  makeFeedbackId,
  MAX_FEEDBACK_LENGTH,
  parseFeedbackSubmission,
  type FeedbackSubmission,
} from './feedback.ts';

// Minimal valid 1x1 transparent PNG.
const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function sampleSubmission(overrides: Partial<FeedbackSubmission> = {}): FeedbackSubmission {
  return {
    feedback: 'The river mouth looks too straight here.',
    build: 'abc123',
    url: 'http://localhost:5173/?b=abc123&t=100CE&lat=41.89&lon=12.49&d=1.0005',
    search: '?b=abc123&t=100CE&lat=41.89&lon=12.49&d=1.0005',
    state: {
      t: 100,
      timeLabel: '100 CE',
      cam: { lat: 41.89, lon: 12.49, dist: 1.0005, heading: 35, tilt: 72 },
      window: [-500, 500],
      evidence: false,
      clouds: true,
      alt: [],
      picks: [],
      sel: 'places/rome',
      hour: 17.4,
      layers: ['rivers'],
    },
    context: {
      mode: 'city',
      siteId: 'rome',
      siteName: 'Rome',
      viewport: { width: 1280, height: 760, dpr: 1 },
      canvas: { width: 1280, height: 760 },
      userAgent: 'test-agent',
    },
    screenshotDataUrl: encodePngDataUrl(TINY_PNG),
    ...overrides,
  };
}

describe('feedback helpers', () => {
  it('round-trips PNG bytes through data URL encoding and base64 decoding', () => {
    const url = encodePngDataUrl(TINY_PNG);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    const decoded = decodeBase64(url.slice('data:image/png;base64,'.length));
    expect(decoded).not.toBeNull();
    expect(isPngBytes(decoded!)).toBe(true);
    expect([...decoded!]).toEqual([...TINY_PNG]);
  });

  it('produces sortable, path-safe feedback ids', () => {
    const id = makeFeedbackId(new Date('2026-11-24T08:00:00.123Z'), 'deadbeef');
    expect(id).toBe('2026-11-24T08-00-00-123Z-deadbeef');
    expect(isSafeFeedbackId(id)).toBe(true);
    expect(isSafeFeedbackId('../etc/passwd')).toBe(false);
    expect(isSafeFeedbackId('a/b')).toBe(false);
    expect(isSafeFeedbackId('..')).toBe(false);
    expect(isSafeFeedbackId('')).toBe(false);
  });

  it('validates a well-formed submission and trims feedback text', () => {
    const parsed = parseFeedbackSubmission(sampleSubmission({ feedback: '  More cypress trees near the hills.  ' }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.feedback).toBe('More cypress trees near the hills.');
    expect(parsed.screenshotBytes.length).toBe(TINY_PNG.length);
  });

  it('rejects empty or oversized feedback, invalid PNGs, and non-finite camera numbers', () => {
    expect(parseFeedbackSubmission(sampleSubmission({ feedback: '   ' })).ok).toBe(false);
    expect(parseFeedbackSubmission(sampleSubmission({ feedback: 'x'.repeat(MAX_FEEDBACK_LENGTH + 1) })).ok).toBe(false);
    expect(parseFeedbackSubmission(sampleSubmission({ screenshotDataUrl: 'data:image/jpeg;base64,/9j/4AAQ' })).ok).toBe(false);
    expect(parseFeedbackSubmission(sampleSubmission({ screenshotDataUrl: 'data:image/png;base64,bm90LWEtcG5n' })).ok).toBe(false);
    const badCam = sampleSubmission();
    badCam.state.cam.lat = Number.NaN;
    expect(parseFeedbackSubmission(badCam).ok).toBe(false);
  });

  it('formats concise summary pills for both scene and globe views', () => {
    const scene = sampleSubmission();
    const pills = formatViewSummary({ build: scene.build, state: scene.state, context: scene.context });
    expect(pills).toContain('Rome');
    expect(pills).toContain('100 CE');
    expect(pills).toContain('41.8900°N, 12.4900°E');
    expect(pills).toContain('3.2 km');
    expect(pills).toContain('Selected: places/rome');
    expect(pills).toContain('Layers: rivers');
    expect(pills).toContain('build abc123');

    const globe = sampleSubmission({
      state: { ...scene.state, cam: { lat: -38.2, lon: -22.5, dist: 3 }, sel: null, layers: undefined, evidence: true },
      context: { ...scene.context, mode: 'globe', siteId: undefined, siteName: undefined },
    });
    const globePills = formatViewSummary({ build: globe.build, state: globe.state, context: globe.context });
    expect(globePills).toContain('Globe view');
    expect(globePills).toContain('38.2°S, 22.5°W');
    expect(globePills).toContain('How we know');
  });
});
