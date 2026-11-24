// Content-addressed DAG build engine: each stage hashes its inputs and source code,
// streams its output files directly into a content-addressed blob directory on disk
// (`.cache/build/blobs/<sha256>`), and records a small JSON stage manifest.
// Nothing is held in an all-in-RAM file map, and unchanged stages hit cache in milliseconds.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { blobPath, hasBlob, linkOrCopy, putBlob, putBlobFile } from '../blobs.ts';
import { BUILD_CACHE, REPO } from '../paths.ts';
import { sha256, stableStringify } from '../util.ts';

const DAG_VERSION = 1;
const REL_IMPORT_RE = /(?:(?:from|import)\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\))/g;
const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export interface FileRef {
  sha256: string;
  bytes: number;
}

export interface StageManifest<M = Record<string, unknown>> {
  format: 'lightworld-stage@1';
  stage: string;
  key: string;
  files: Record<string, FileRef>;
  /** Cache-only blobs stored in `blobDir` for downstream stages (never emitted into the final build). */
  internal?: string[];
  meta: M;
}

export interface StageResult<M> {
  meta: M;
  files: Record<string, FileRef>;
  hit: boolean;
  key: string;
  ms: number;
}

export interface StageStat {
  name: string;
  key: string;
  hit: boolean;
  ms: number;
  fileCount: number;
  bytes: number;
}

/**
 * Sink handed to a DAG stage's compute function. Every `put` streams directly to the
 * content-addressed blob directory on disk and retains only `{ sha256, bytes }` metadata in RAM.
 */
export class ArtifactSink {
  readonly files = new Map<string, FileRef>();
  readonly internal = new Set<string>();

  constructor(readonly blobDir: string) {}

  /** Write a build output file directly to the content-addressed blob store. */
  async put(relPath: string, content: Uint8Array | string): Promise<FileRef> {
    const ref = await putBlob(content, this.blobDir);
    this.files.set(relPath, ref);
    return ref;
  }

  /** Ingest an existing file on disk into the content-addressed blob store without buffering it in RAM. */
  async putFile(relPath: string, existingPath: string): Promise<FileRef> {
    const ref = await putBlobFile(existingPath, this.blobDir);
    this.files.set(relPath, ref);
    return ref;
  }

  /**
   * Write a cache-only blob to `blobDir` (for example exact Float32Arrays needed by downstream stages
   * on cache misses) without adding it to the final build output or `buildId` hash.
   */
  async putInternal(content: Uint8Array | string): Promise<FileRef> {
    const ref = await putBlob(content, this.blobDir);
    this.internal.add(ref.sha256);
    return ref;
  }

  /** Read back a build output file already written to this sink from disk. */
  async readBytes(relPath: string): Promise<Uint8Array> {
    const ref = this.files.get(relPath);
    if (!ref) throw new Error(`ArtifactSink: unknown path "${relPath}"`);
    return new Uint8Array(await readFile(blobPath(ref.sha256, this.blobDir)));
  }

  /** Read back a UTF-8 build output file already written to this sink from disk. */
  async readText(relPath: string): Promise<string> {
    const ref = this.files.get(relPath);
    if (!ref) throw new Error(`ArtifactSink: unknown path "${relPath}"`);
    return readFile(blobPath(ref.sha256, this.blobDir), 'utf8');
  }
}

function safeStageName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

export interface DagOptions {
  cacheDir?: string;
  /** Recompute every stage even if a matching manifest exists in cache (still writes fresh results). */
  noCache?: boolean;
  /** Root directory for resolving `codeFiles` paths (defaults to repository root). */
  codeRoot?: string;
  log?: (line: string) => void;
}

/**
 * Content-addressed DAG runner for incremental, streaming-to-disk world builds.
 */
export class DagRunner {
  readonly cacheDir: string;
  readonly blobDir: string;
  readonly stagesDir: string;
  readonly noCache: boolean;
  readonly codeRoot: string;
  readonly files = new Map<string, FileRef>();
  readonly stats: StageStat[] = [];
  private readonly log?: (line: string) => void;
  private readonly codeFileCache = new Map<string, { hash: string; deps: string[] }>();

  constructor(opts: DagOptions = {}) {
    this.cacheDir = opts.cacheDir ?? BUILD_CACHE;
    this.blobDir = join(this.cacheDir, 'blobs');
    this.stagesDir = join(this.cacheDir, 'stages');
    this.noCache = opts.noCache ?? false;
    this.codeRoot = opts.codeRoot ?? REPO;
    this.log = opts.log;
  }

  private resolveLocalImport(fromFull: string, spec: string): string | undefined {
    const base = resolve(dirname(fromFull), spec);
    const candidates = [base, `${base}.ts`, `${base}.js`, join(base, 'index.ts'), join(base, 'index.js')];
    for (const cand of candidates) {
      if (!existsSync(cand)) continue;
      try {
        if (!statSync(cand).isFile()) continue;
      } catch {
        continue;
      }
      const rel = relative(this.codeRoot, cand);
      if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue;
      return rel.replace(/\\/g, '/');
    }
    return undefined;
  }

  private async inspectCodeFile(rel: string): Promise<{ hash: string; deps: string[] }> {
    const cached = this.codeFileCache.get(rel);
    if (cached) return cached;
    const full = join(this.codeRoot, rel);
    if (!existsSync(full)) {
      const entry = { hash: 'missing', deps: [] };
      this.codeFileCache.set(rel, entry);
      return entry;
    }
    const raw = await readFile(full);
    const hash = sha256(raw);
    const deps: string[] = [];
    if (/\.(?:[cm]?ts|[cm]?js)$/.test(rel)) {
      const text = raw.toString('utf8');
      REL_IMPORT_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = REL_IMPORT_RE.exec(text))) {
        const spec = m[1] ?? m[2];
        if (!spec) continue;
        const resolved = this.resolveLocalImport(full, spec);
        if (resolved) deps.push(resolved);
      }
    }
    const entry = { hash, deps };
    this.codeFileCache.set(rel, entry);
    return entry;
  }

  /**
   * Hash a set of source files relative to `codeRoot` together with their full transitive
   * relative import closure, memoized per file path.
   */
  async codeHash(relPaths: string[]): Promise<string> {
    const visited = new Map<string, string>();
    const queue = relPaths.map((p) => p.replace(/\\/g, '/'));
    while (queue.length) {
      const rel = queue.pop()!;
      if (visited.has(rel)) continue;
      const { hash, deps } = await this.inspectCodeFile(rel);
      visited.set(rel, hash);
      for (const dep of deps) if (!visited.has(dep)) queue.push(dep);
    }
    const parts = [...visited.entries()]
      .sort(([a], [b]) => cmpStr(a, b))
      .map(([rel, h]) => `${rel} ${h}`);
    return sha256(parts.join('\n'));
  }

  /** Deterministic stage cache key from stage name, structured inputs, and relevant source files. */
  async stageKey(name: string, inputs: unknown, codeFiles?: string[]): Promise<string> {
    const code = codeFiles?.length ? await this.codeHash(codeFiles) : undefined;
    return sha256(stableStringify({ v: DAG_VERSION, stage: name, ...(code ? { code } : {}), inputs }));
  }

  /**
   * Execute a build stage if its cache key is missing (or any referenced blob is gone),
   * or return its cached metadata and register its output file refs in milliseconds.
   */
  async runStage<M>(
    name: string,
    inputs: unknown,
    compute: (sink: ArtifactSink) => Promise<M>,
    opts: { codeFiles?: string[] } = {},
  ): Promise<StageResult<M>> {
    const started = Date.now();
    const key = await this.stageKey(name, inputs, opts.codeFiles);
    const stageDir = join(this.stagesDir, safeStageName(name));
    const manifestPath = join(stageDir, `${key}.json`);

    if (!this.noCache && existsSync(manifestPath)) {
      try {
        const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as StageManifest<M>;
        if (parsed.format === 'lightworld-stage@1' && parsed.stage === name && parsed.key === key && parsed.files) {
          const entries = Object.entries(parsed.files);
          const allBlobsPresent =
            entries.every(([, ref]) => hasBlob(ref.sha256, this.blobDir)) &&
            (parsed.internal ?? []).every((h) => hasBlob(h, this.blobDir));
          if (allBlobsPresent) {
            let bytes = 0;
            for (const [relPath, ref] of entries) {
              this.files.set(relPath, ref);
              bytes += ref.bytes;
            }
            const ms = Date.now() - started;
            this.stats.push({ name, key, hit: true, ms, fileCount: entries.length, bytes });
            this.log?.(`cache   hit  ${name} (${entries.length} file${entries.length === 1 ? '' : 's'})`);
            return { meta: parsed.meta, files: parsed.files, hit: true, key, ms };
          }
        }
      } catch {
        // Corrupt or truncated cache manifest: fall through and recompute cleanly.
      }
    }

    const sink = new ArtifactSink(this.blobDir);
    const meta = await compute(sink);

    const sortedEntries = [...sink.files.entries()].sort(([a], [b]) => cmpStr(a, b));
    const filesObj: Record<string, FileRef> = {};
    let bytes = 0;
    for (const [relPath, ref] of sortedEntries) {
      filesObj[relPath] = ref;
      this.files.set(relPath, ref);
      bytes += ref.bytes;
    }

    const manifest: StageManifest<M> = {
      format: 'lightworld-stage@1',
      stage: name,
      key,
      files: filesObj,
      ...(sink.internal.size ? { internal: [...sink.internal].sort() } : {}),
      meta,
    };
    await mkdir(stageDir, { recursive: true });
    const tmp = `${manifestPath}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
    await writeFile(tmp, stableStringify(manifest));
    await rename(tmp, manifestPath);

    const ms = Date.now() - started;
    this.stats.push({ name, key, hit: false, ms, fileCount: sortedEntries.length, bytes });
    return { meta, files: filesObj, hit: false, key, ms };
  }

  /** Stream a top-level file directly to the blob store and register it as a build output. */
  async putDirect(relPath: string, content: Uint8Array | string): Promise<FileRef> {
    const ref = await putBlob(content, this.blobDir);
    this.files.set(relPath, ref);
    return ref;
  }

  hasFile(relPath: string): boolean {
    return this.files.has(relPath);
  }

  fileRef(relPath: string): FileRef | undefined {
    return this.files.get(relPath);
  }

  /** Lazily read a registered build output's bytes from disk. */
  async readBlobBytes(relPath: string): Promise<Uint8Array> {
    const ref = this.files.get(relPath);
    if (!ref) throw new Error(`DagRunner: unknown build file "${relPath}"`);
    return new Uint8Array(await readFile(blobPath(ref.sha256, this.blobDir)));
  }

  /** Synchronously read a registered build output's bytes from disk (for sync viewer-parity callbacks). */
  readBlobBytesSync(relPath: string): Uint8Array {
    const ref = this.files.get(relPath);
    if (!ref) throw new Error(`DagRunner: unknown build file "${relPath}"`);
    const buf = readFileSync(blobPath(ref.sha256, this.blobDir));
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  /** Lazily read a registered build output as UTF-8 text from disk. */
  async readBlobText(relPath: string): Promise<string> {
    const ref = this.files.get(relPath);
    if (!ref) throw new Error(`DagRunner: unknown build file "${relPath}"`);
    return readFile(blobPath(ref.sha256, this.blobDir), 'utf8');
  }

  /** Synchronously read a registered build output as UTF-8 text from disk. */
  readBlobTextSync(relPath: string): string {
    const ref = this.files.get(relPath);
    if (!ref) throw new Error(`DagRunner: unknown build file "${relPath}"`);
    return readFileSync(blobPath(ref.sha256, this.blobDir), 'utf8');
  }

  /** Read an arbitrary blob (including internal cache blobs) by its sha256 from `blobDir`. */
  async readBlobByHash(hash: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(blobPath(hash, this.blobDir)));
  }

  /** Synchronously read an arbitrary blob by its sha256 from `blobDir`. */
  readBlobByHashSync(hash: string): Uint8Array {
    const buf = readFileSync(blobPath(hash, this.blobDir));
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  /**
   * Compute the build's content hash from the sorted `(path, sha256)` pairs plus `extra`
   * (typically `stableStringify(tileset)`), without re-reading or buffering any file bytes.
   */
  contentHash(extra = ''): string {
    const listing = [...this.files.entries()]
      .sort(([a], [b]) => cmpStr(a, b))
      .map(([p, ref]) => `${p} ${ref.sha256}`)
      .join('\n');
    return sha256(listing + extra);
  }

  /** Sorted logical-path → sha256 mapping for `manifest.json`. */
  manifestFiles(exclude?: Set<string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [p, ref] of [...this.files.entries()].sort(([a], [b]) => cmpStr(a, b))) {
      if (exclude?.has(p)) continue;
      out[p] = ref.sha256;
    }
    return out;
  }

  /** Total uncompressed byte size across all registered build output files. */
  totalBytes(): number {
    let sum = 0;
    for (const ref of this.files.values()) sum += ref.bytes;
    return sum;
  }

  /**
   * Atomically materialize all registered build files into `destDir` via hard-links (with copy
   * fallback across filesystems) from `blobDir`. When `sharedBlobsDir` is supplied, also ensures
   * every referenced blob is hard-linked into `sharedBlobsDir/<sha256>` so local servers and
   * publishers can serve content-addressed blobs directly without duplicating bytes on disk.
   */
  async materialize(destDir: string, sharedBlobsDir?: string): Promise<void> {
    const tmp = `${destDir}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
    if (sharedBlobsDir) await mkdir(sharedBlobsDir, { recursive: true });

    const linkedShared = new Set<string>();
    const dirsCreated = new Set<string>([tmp]);

    for (const [relPath, ref] of this.files) {
      const src = blobPath(ref.sha256, this.blobDir);
      const dst = join(tmp, relPath);
      const parent = dirname(dst);
      if (!dirsCreated.has(parent)) {
        await mkdir(parent, { recursive: true });
        dirsCreated.add(parent);
      }
      await linkOrCopy(src, dst);

      if (sharedBlobsDir && !linkedShared.has(ref.sha256)) {
        linkedShared.add(ref.sha256);
        const sharedDst = blobPath(ref.sha256, sharedBlobsDir);
        if (!existsSync(sharedDst)) {
          await linkOrCopy(src, sharedDst);
        }
      }
    }

    await rm(destDir, { recursive: true, force: true });
    await rename(tmp, destDir);
  }

  summary(): { hits: number; misses: number; totalMs: number } {
    let hits = 0;
    let misses = 0;
    let totalMs = 0;
    for (const s of this.stats) {
      if (s.hit) hits++;
      else misses++;
      totalMs += s.ms;
    }
    return { hits, misses, totalMs };
  }
}
