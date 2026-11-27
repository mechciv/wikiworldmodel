// The rows of a large table, read as they come (docs/plans/ENTITIES.md, step 5): a list of millions, such as the
// Catalogue of Life's 5.5 million names, is a table of gigabytes, more than a string can hold, and often a member of a
// zip of a gigabyte. So nothing here reads a whole file. A member is read from the archive where it lies, by its place in
// the archive's directory, and inflated as it is read; a line is cut into only the columns that are asked for.
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { Readable } from 'node:stream';
import { createInflateRaw } from 'node:zlib';
import { centralDirectory, type Member } from './hyde.ts';

/** The members of a zip on disk, read from the directory at its end. */
export async function zipMembers(path: string): Promise<Member[]> {
  const fh = await open(path, 'r');
  try {
    const { size } = await fh.stat();
    // The directory is at the end; read more of the end until it is all there.
    for (let want = Math.min(size, 1 << 20); ; want = Math.min(size, want * 8)) {
      const tail = Buffer.alloc(want);
      await fh.read(tail, 0, want, size - want);
      try {
        return centralDirectory(new Uint8Array(tail.buffer, tail.byteOffset, tail.length), size - want);
      } catch (err) {
        if (want >= size || !/before the tail/.test((err as Error).message)) throw err;
      }
    }
  } finally {
    await fh.close();
  }
}

/** A member of a zip on disk as a stream of its bytes, inflated. */
export async function zipMemberStream(path: string, name: string): Promise<Readable> {
  const member = (await zipMembers(path)).find((m) => m.name === name);
  if (!member) throw new Error(`${path} has no member ${name}`);
  return memberStream(path, member);
}

async function memberStream(path: string, m: Member): Promise<Readable> {
  // The member's data starts after its local header, whose name and extra field may differ in length from the directory's.
  const fh = await open(path, 'r');
  const head = Buffer.alloc(30);
  try {
    await fh.read(head, 0, 30, m.offset);
  } finally {
    await fh.close();
  }
  if (head.readUInt32LE(0) !== 0x04034b50) throw new Error(`${path}: no local header for ${m.name}`);
  const start = m.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  if (m.compressed === 0) return Readable.from([]);
  const raw = createReadStream(path, { start, end: start + m.compressed - 1, highWaterMark: 1 << 20 });
  if (m.method === 0) return raw;
  if (m.method !== 8) throw new Error(`${path}: ${m.name} is compressed by method ${m.method}, which is not read as a stream`);
  return raw.pipe(createInflateRaw({ chunkSize: 1 << 20 }));
}

/** Where a table's text is: a file, or a member of a zip. */
export interface TableSource {
  path: string;
  member?: string;
}

/** How a table's cells are parted: by tabs, with no quoting, or by commas, with fields in double quotes. */
export type Delimited = 'tsv' | 'csv';

/** The format of a table by the name of its file. */
export const delimitedOf = (name: string): Delimited | undefined => (/\.(tsv|tab|txt)$/i.test(name) ? 'tsv' : /\.csv$/i.test(name) ? 'csv' : undefined);

/**
 * Each row of a table, as the values of the columns asked for, in their order; a column the table lacks is ''. Values
 * are trimmed, as parseTable trims them. Blank lines are skipped. Returns the table's header.
 */
export async function eachRow(source: TableSource, format: Delimited, columns: readonly string[], onRow: (values: string[]) => void): Promise<string[]> {
  const stream = source.member ? await zipMemberStream(source.path, source.member) : createReadStream(source.path, { highWaterMark: 1 << 20 });
  const decoder = new StringDecoder('utf8');
  let header: string[] | undefined;
  let at: number[] = [];
  let line: LineParser | undefined;
  const begin = (fields: string[]) => {
    header = fields.map((f, i) => (i === 0 ? f.replace(/^﻿/, '') : f).trim());
    at = columns.map((c) => header!.indexOf(c));
  };
  if (format === 'tsv') {
    // Cut from the bytes, not from text: a tab or a new line is never part of another character in UTF-8, and a cell
    // decoded on its own is a string of its own, where a slice of a chunk's text would hold the whole chunk in memory.
    let rest: Buffer = Buffer.alloc(0);
    const take = (buf: Buffer, final: boolean) => {
      let from = 0;
      for (let nl = buf.indexOf(10, from); nl >= 0; nl = buf.indexOf(10, from)) {
        tsvLine(buf, from, nl > from && buf[nl - 1] === 13 ? nl - 1 : nl);
        from = nl + 1;
      }
      rest = Buffer.from(buf.subarray(from));
      if (final && rest.length) tsvLine(rest, 0, rest[rest.length - 1] === 13 ? rest.length - 1 : rest.length), (rest = Buffer.alloc(0));
    };
    const tsvLine = (b: Buffer, from: number, to: number) => {
      if (to <= from) return;
      if (!header) return begin(b.toString('utf8', from, to).split('\t'));
      onRow(tsvFields(b, from, to, at));
    };
    for await (const chunk of stream) take(rest.length ? Buffer.concat([rest, chunk as Buffer]) : (chunk as Buffer), false);
    take(rest, true);
  } else {
    line = new LineParser((fields) => {
      if (!header) return begin(fields);
      if (fields.length === 1 && fields[0] === '') return;
      onRow(at.map((i) => (i >= 0 && i < fields.length ? fields[i].trim() : '')));
    });
    for await (const chunk of stream) line.write(decoder.write(chunk as Buffer));
    line.write(decoder.end());
    line.end();
  }
  return header ?? [];
}

/** The cells of a line of a tab-separated table at the places asked for, decoded one by one without splitting the rest. */
function tsvFields(b: Buffer, from: number, to: number, at: number[]): string[] {
  const out = new Array<string>(at.length).fill('');
  let want = 0;
  for (const i of at) if (i > want) want = i;
  let col = 0;
  let start = from;
  while (col <= want && start <= to) {
    let end = b.indexOf(9, start);
    if (end < 0 || end > to) end = to;
    for (let k = 0; k < at.length; k++) if (at[k] === col) out[k] = end > start ? b.toString('utf8', start, end).trim() : '';
    col++;
    start = end + 1;
    if (end === to) break;
  }
  return out;
}

/** A comma-separated table, parsed as it comes: a field in double quotes may hold commas, quotes ("") and new lines. */
class LineParser {
  private fields: string[] = [];
  private cur = '';
  private quoted = false;
  /** a quote just closed inside a quoted field, which a second quote would make a quote of its own */
  private closing = false;
  constructor(private readonly onLine: (fields: string[]) => void) {}

  write(text: string): void {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (this.quoted) {
        if (this.closing) {
          this.closing = false;
          if (ch === '"') {
            this.cur += '"';
            continue;
          }
          this.quoted = false;
        } else if (ch === '"') {
          this.closing = true;
          continue;
        } else {
          this.cur += ch;
          continue;
        }
      }
      if (ch === '"' && this.cur.trim() === '') {
        this.quoted = true;
        this.cur = '';
      } else if (ch === ',') {
        this.fields.push(this.cur);
        this.cur = '';
      } else if (ch === '\n') {
        this.fields.push(this.cur.endsWith('\r') ? this.cur.slice(0, -1) : this.cur);
        this.onLine(this.fields);
        this.fields = [];
        this.cur = '';
      } else this.cur += ch;
    }
  }

  end(): void {
    if (this.closing) (this.closing = false), (this.quoted = false);
    if (this.cur !== '' || this.fields.length) {
      this.fields.push(this.cur.endsWith('\r') ? this.cur.slice(0, -1) : this.cur);
      this.onLine(this.fields);
    }
    this.fields = [];
    this.cur = '';
  }
}
