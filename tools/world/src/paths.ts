import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const WORLD = join(REPO, 'world');
export const CACHE = join(REPO, '.cache');
export const BLOBS = process.env.WIKIWORLDMODEL_BLOB_DIR ? resolve(process.env.WIKIWORLDMODEL_BLOB_DIR) : join(CACHE, 'blobs');
export const BUILD_CACHE = process.env.WIKIWORLDMODEL_BUILD_CACHE ? resolve(process.env.WIKIWORLDMODEL_BUILD_CACHE) : join(CACHE, 'build');
export const DIST = join(REPO, 'dist');
export const BUILDS = join(DIST, 'builds');

