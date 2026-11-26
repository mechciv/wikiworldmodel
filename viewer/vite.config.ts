import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { createBrotliCompress, createGzip, constants as zlibConstants } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import { createFeedbackMiddleware } from '../tools/world/src/feedbackStore.ts';

const REPO = resolve(import.meta.dirname, '..');
const BUILDS = resolve(REPO, 'dist/builds');
const BUILD_BLOBS = resolve(REPO, '.cache/build/blobs');
const FEEDBACK = process.env.WIKIWORLDMODEL_FEEDBACK_DIR ? resolve(process.env.WIKIWORLDMODEL_FEEDBACK_DIR) : resolve(REPO, '.feedback');

const TYPES: Record<string, string> = { '.json': 'application/json', '.lwt': 'application/octet-stream', '.md': 'text/markdown; charset=utf-8' };

function resolveBuildAsset(rel: string): { path: string; isBlob: boolean } | undefined {
  const direct = resolve(BUILDS, rel);
  if (direct.startsWith(BUILDS + sep) && existsSync(direct) && statSync(direct).isFile()) {
    return { path: direct, isBlob: rel.startsWith('blobs/') };
  }
  const m = /^blobs\/([0-9a-f]{64})$/.exec(rel);
  if (m) {
    const cached = join(BUILD_BLOBS, m[1]);
    if (existsSync(cached) && statSync(cached).isFile()) {
      return { path: cached, isBlob: true };
    }
  }
  return undefined;
}

/** Serve world builds (dist/builds and content-addressed blobs/) at /builds/ during development and preview. */
function builds(): Plugin {
  const serve = (req: { url?: string; headers?: Record<string, string | string[] | undefined> }, res: import('node:http').ServerResponse, next: () => void) => {
    const url = (req.url ?? '').split('?')[0];
    if (!url.startsWith('/builds/')) return next();
    let rel: string;
    try {
      rel = decodeURIComponent(url.slice('/builds/'.length));
    } catch {
      res.statusCode = 400;
      res.end();
      return;
    }
    const found = resolveBuildAsset(rel);
    if (!found) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const ext = extname(found.path);
    const stat = statSync(found.path);
    res.setHeader('Content-Type', found.isBlob ? 'application/octet-stream' : (TYPES[ext] ?? 'application/octet-stream'));
    res.setHeader('Cache-Control', url.endsWith('index.json') ? 'no-cache' : 'public, max-age=31536000, immutable');
    const accept = String(req.headers?.['accept-encoding'] ?? '');
    const compressible = stat.size >= 256 && (found.isBlob || ext === '.json' || ext === '.lwt' || ext === '.md' || ext === '.bin');
    if (compressible && /\bbr\b/.test(accept)) {
      res.setHeader('Content-Encoding', 'br');
      res.setHeader('Vary', 'Accept-Encoding');
      createReadStream(found.path)
        .pipe(createBrotliCompress({ params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } }))
        .pipe(res);
      return;
    }
    if (compressible && /\bgzip\b/.test(accept)) {
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      createReadStream(found.path).pipe(createGzip({ level: 4 })).pipe(res);
      return;
    }
    createReadStream(found.path).pipe(res);
  };
  return {
    name: 'wikiworldmodel-builds',
    configureServer: (s) => void s.middlewares.use(serve),
    configurePreviewServer: (s) => void s.middlewares.use(serve),
  };
}

/** Store and serve local scene feedback (.feedback/) at /api/feedback during development and preview. */
function feedback(): Plugin {
  const handle = createFeedbackMiddleware(FEEDBACK, REPO);
  return {
    name: 'wikiworldmodel-feedback',
    configureServer: (s) => void s.middlewares.use(handle),
    configurePreviewServer: (s) => void s.middlewares.use(handle),
  };
}

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [builds(), feedback()],
  server: { fs: { allow: [REPO] } },
  build: {
    outDir: resolve(import.meta.dirname, '../dist/site'),
    emptyOutDir: true,
    target: 'es2022',
    // The globe and its two coverage views.
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), coverage: resolve(import.meta.dirname, 'coverage.html'), history: resolve(import.meta.dirname, 'history.html') } },
  },
});
