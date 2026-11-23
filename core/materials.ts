// The scanned materials the renderer draws the ground with (docs/plans/RENDERING.md, "Procedural first"): what earth,
// sand, pebbles, rock, mud and snow look like from a metre or two. They are the same for every place and time, and say
// nothing of any: which material a ground has and what colour it is are the world's and the scene's. A scan gives a
// material its grain, in the place's own tone. tools/materials/pack.ts writes them, with this list of them
// (viewer/public/materials/ground.json); viewer/src/gl/materials.ts reads it.

export const GROUND_FORMAT = 'wikiworldmodel-materials@1';

/**
 * The layers, by their place in the list: the renderer names them so (viewer/src/gl/cityShaders.ts). A new layer goes at
 * the end.
 */
export const GROUND_LAYERS = ['soil', 'earth', 'sand', 'grit', 'pebbles', 'stones', 'rock', 'strata', 'mud', 'cracked', 'crust', 'snow'] as const;
export type GroundLayer = (typeof GROUND_LAYERS)[number];

export interface GroundMaterialLayer {
  key: string;
  /** what it is a scan of, in words */
  title: string;
  /** how much ground one repeat of it covers, in metres */
  metres: number;
  /** its mean colour, in linear light: the renderer divides a scan's colour by it, and multiplies by the place's */
  mean: [number, number, number];
  /** its mean roughness, 0–1, and the mean of its height, 0–1 of its own range */
  rough: number;
  lift: number;
  /** how much of its own changes of hue are kept, 0–1: the rest of its colour is only light and dark */
  chroma: number;
  /** its colour's image; and the image of its normal's two parts, its height and its roughness, side by side */
  colour: string;
  data: string;
  /** optional pre-packed GPU block-compressed KTX2 mipmapped textures (colour+height and normal+roughness+sky), by hardware format */
  ktx2?: Partial<Record<'astc' | 'bc7' | 'etc2' | 'bc3', { colour: string; normal: string }>>;
  /** the scan's name and who made it, and its page */
  name: string;
  authors: string[];
  from: string;
}

export interface GroundMaterials {
  format: typeof GROUND_FORMAT;
  /** each layer's side, in pixels */
  size: number;
  license: string;
  source: string;
  url: string;
  layers: GroundMaterialLayer[];
}
