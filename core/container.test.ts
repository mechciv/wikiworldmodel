// Binary LWT1 tile container round-trip and bounds/alignment/prototype hardening.
import { describe, expect, it } from 'vitest';
import { decodeTile, encodeTile } from './container.ts';

describe('LWT1 container', () => {
  it('round-trips typed buffers and rejects negative offsets, OOB lengths, misalignment, and prototype keys', () => {
    const good = encodeTile({ ok: true }, [new Int16Array([1, 2, 3, 4])], JSON.stringify);
    const decoded = decodeTile<{ ok: boolean }>(good.buffer.slice(good.byteOffset, good.byteOffset + good.byteLength) as ArrayBuffer);
    expect(decoded.header.ok).toBe(true);
    expect([...decoded.arrays[0]]).toEqual([1, 2, 3, 4]);

    const craft = (headerObj: Record<string, unknown>, payloadBytes = 16) => {
      const json = new TextEncoder().encode(JSON.stringify(headerObj));
      const headerLen = Math.ceil(json.length / 8) * 8;
      const buf = new Uint8Array(8 + headerLen + payloadBytes);
      buf.set([0x4c, 0x57, 0x54, 0x31], 0);
      new DataView(buf.buffer).setUint32(4, headerLen, true);
      buf.fill(0x20, 8, 8 + headerLen);
      buf.set(json, 8);
      return buf.buffer;
    };

    expect(() => decodeTile(craft({ buffers: [{ type: 'uint8', offset: -8, length: 4 }] }))).toThrow();
    expect(() => decodeTile(craft({ buffers: [{ type: 'uint8', offset: 0, length: 999 }] }))).toThrow();
    expect(() => decodeTile(craft({ buffers: [{ type: 'int32', offset: 2, length: 2 }] }))).toThrow();
    expect(() => decodeTile(craft({ buffers: [{ type: 'constructor', offset: 0, length: 1 }] }))).toThrow();
  });
});
