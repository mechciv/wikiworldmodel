// Draws the atlas of leaves (leafatlas.ts) off the page, once: it takes a second or two, which a visitor should not
// wait through. The page asks for it when the first scene is made at full quality, and is sent every level's texels.
import { makeLeafAtlas } from './leafatlas.ts';

self.onmessage = () => {
  const atlas = makeLeafAtlas();
  (self as unknown as Worker).postMessage(atlas, atlas.levels.map((l) => l.buffer as ArrayBuffer));
};
