import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { createFeedbackMiddleware } from '../tools/world/src/feedbackStore.ts';

const REPO = resolve(__dirname, '..');
const BUILDS = resolve(REPO, 'dist/builds');
const FEEDBACK = process.env.WIKIWORLDMODEL_FEEDBACK_DIR ? resolve(process.env.WIKIWORLDMODEL_FEEDBACK_DIR) : resolve(REPO, '.feedback');

const TYPES: Record<string, string> = { '.json': 'application/json', '.lwt': 'application/octet-stream' };

/** Serve world builds (dist/builds) at /builds/ during development and preview. */
function builds(): Plugin {
  const serve = (req: { url?: string }, res: import('node:http').ServerResponse, next: () => void) => {
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
    const path = resolve(BUILDS, rel);
    if (!path.startsWith(BUILDS + sep) || !existsSync(path) || !statSync(path).isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('Content-Type', TYPES[extname(path)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', url.endsWith('index.json') ? 'no-cache' : 'public, max-age=31536000, immutable');
    createReadStream(path).pipe(res);
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
  root: __dirname,
  base: './',
  plugins: [builds(), feedback()],
  server: { fs: { allow: [REPO] } },
  build: {
    outDir: resolve(__dirname, '../dist/site'),
    emptyOutDir: true,
    target: 'es2022',
    // Two pages: the globe, and the coverage of the world (viewer/src/coverage).
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), coverage: resolve(__dirname, 'coverage.html') } },
  },
});
