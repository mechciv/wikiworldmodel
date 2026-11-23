// The kinds of leaves a plant's cards can show (docs/plans/RENDERING.md, step 1). A plant's leaves are held on cards,
// and a card shows a tile of an atlas: a spray of leaves on its twig, or, from a way off, a bough of such sprays. Which
// kind of leaf a plant has is its form's to say (a part's `leaf`), or follows from its part's type and material; how a
// kind looks is drawn by the viewer (viewer/src/gl/leafatlas.ts), and is nobody's record. This is the list both share:
// each kind's tiles in the atlas, and how big a spray and a bough of it are, which is how big a card of it is drawn.

/** A tile's size in the atlas, in texels: across its twig, and along it. */
export const LEAF_TILE = { across: 256, along: 512 } as const;

export interface LeafKind {
  /** how many different sprays of it the atlas has */
  sprays: number;
  /** a spray's length along its twig and its width across, in metres: a card of it is drawn so big */
  spray: [number, number];
  /** how many boughs of it the atlas has: branches clothed in its sprays, for a tree from a way off; none for a leaf that is a whole frond or a tuft */
  boughs: number;
  /** a bough's length and width, in metres */
  bough: [number, number];
  /** what it is, in words */
  what: string;
}

/**
 * The kinds, in the atlas's order. A new kind goes at the end: the tiles before it keep their places.
 */
export const LEAF_KINDS = {
  // Needles and scales.
  'needle-flat': { sprays: 3, spray: [0.42, 0.26], boughs: 1, bough: [1.7, 1.2], what: 'needles in two flat ranks along feathery shoots: a redwood, a swamp cypress, a yew, a fir' },
  'needle-tuft': { sprays: 3, spray: [0.44, 0.36], boughs: 1, bough: [1.7, 1.3], what: 'long needles in bundles, brushes of them at the ends of twigs: a pine' },
  'needle-scale': { sprays: 3, spray: [0.42, 0.3], boughs: 1, bough: [1.7, 1.2], what: 'shoots clothed in small scale leaves, in flattened branching sprays: a cypress, a cheirolepid, a walchian' },
  'needle-awl': { sprays: 3, spray: [0.4, 0.18], boughs: 1, bough: [1.6, 1.0], what: 'short stiff leaves all round a shoot, like a bottle brush: a spruce, a monkey puzzle, a scale tree' },
  // Fronds: a card of one is a whole leaf.
  'frond-fern': { sprays: 3, spray: [1.0, 0.36], boughs: 0, bough: [0, 0], what: "a fern's frond: leaflets either side of its stalk, each cut again" },
  'frond-cycad': { sprays: 2, spray: [1.0, 0.3], boughs: 0, bough: [0, 0], what: 'a stiff frond of narrow leaflets, close together: a cycad, a bennettite' },
  'frond-feather': { sprays: 2, spray: [1.0, 0.5], boughs: 0, bough: [0, 0], what: 'a long frond of drooping leaflets: a feather palm' },
  'frond-fan': { sprays: 2, spray: [1.0, 1.0], boughs: 0, bough: [0, 0], what: 'a pleated fan on a stalk, its segments parted towards their tips: a fan palm' },
  'frond-seed': { sprays: 2, spray: [1.0, 0.6], boughs: 0, bough: [0, 0], what: 'a great frond twice divided, its leaflets small and rounded: a seed fern, a tree fern' },
  // Broad leaves.
  'broad-oval': { sprays: 3, spray: [0.46, 0.38], boughs: 1, bough: [1.7, 1.4], what: 'plain oval leaves, alternate along a twig: most broad-leaved trees' },
  'broad-lobed': { sprays: 2, spray: [0.5, 0.46], boughs: 1, bough: [1.7, 1.4], what: 'leaves cut into lobes, as a plane tree or a maple' },
  'broad-fan': { sprays: 2, spray: [0.4, 0.34], boughs: 1, bough: [1.6, 1.3], what: 'fan-shaped leaves in clusters on short shoots: a ginkgo' },
  'broad-tongue': { sprays: 2, spray: [0.55, 0.46], boughs: 1, bough: [1.7, 1.4], what: 'tongue-shaped leaves with a strong midrib, in tufts: a glossopterid' },
  'broad-strap': { sprays: 2, spray: [0.85, 0.55], boughs: 1, bough: [2.0, 1.6], what: 'long strap-shaped leaves at the ends of twigs: a cordaite' },
  'broad-small': { sprays: 2, spray: [0.34, 0.26], boughs: 1, bough: [1.3, 1.0], what: 'small leaves on wiry twigs: a shrub of dry ground' },
  'broad-compound': { sprays: 2, spray: [0.46, 0.4], boughs: 1, bough: [1.7, 1.4], what: 'leaves of many small leaflets either side of a stalk: an acacia, a legume' },
  // What grows low.
  'blade-grass': { sprays: 4, spray: [1.0, 1.0], boughs: 0, bough: [0, 0], what: 'a tuft of narrow blades, some bent over' },
  'blade-reed': { sprays: 2, spray: [1.0, 0.5], boughs: 0, bough: [0, 0], what: 'a few tall strap leaves and stems, upright' },
  'blade-rush': { sprays: 2, spray: [1.0, 0.7], boughs: 0, bough: [0, 0], what: 'thin bare stems, upright and a little spread: a rush, a joint fir, an early land plant' },
  whorl: { sprays: 2, spray: [1.0, 0.36], boughs: 0, bough: [0, 0], what: 'a jointed stem with a ring of thin branches at each joint: a horsetail' },
  herb: { sprays: 3, spray: [1.0, 1.0], boughs: 0, bough: [0, 0], what: 'a low leafy plant: soft leaves on short stems from the ground' },
  moss: { sprays: 2, spray: [1.0, 1.0], boughs: 0, bough: [0, 0], what: 'a cushion of tiny leaves' },
} as const satisfies Record<string, LeafKind>;

export type LeafKindName = keyof typeof LEAF_KINDS;

export const LEAF_KIND_NAMES = Object.keys(LEAF_KINDS) as LeafKindName[];

/** Where each kind's tiles are in the atlas: its first spray, and its first bough. */
const FIRST: Record<string, { spray: number; bough: number }> = {};
let count = 0;
for (const name of LEAF_KIND_NAMES) {
  const k: LeafKind = LEAF_KINDS[name];
  FIRST[name] = { spray: count, bough: count + k.sprays };
  count += k.sprays + k.boughs;
}

/** How many tiles the atlas has. */
export const LEAF_TILES = count;

/** The tile of a kind's spray: one of its sprays, by any whole number. */
export function sprayTile(kind: LeafKindName, pick: number): number {
  const n = LEAF_KINDS[kind].sprays;
  return FIRST[kind].spray + ((((pick | 0) % n) + n) % n);
}

/** The tile of a kind's bough, by any whole number; a kind with no boughs gives one of its sprays. */
export function boughTile(kind: LeafKindName, pick: number): number {
  const n = LEAF_KINDS[kind].boughs;
  return n ? FIRST[kind].bough + ((((pick | 0) % n) + n) % n) : sprayTile(kind, pick);
}

/** Which kind a tile is of, and whether it is a bough. */
export function tileKind(tile: number): { kind: LeafKindName; bough: boolean; nth: number } {
  for (const name of LEAF_KIND_NAMES) {
    const k: LeafKind = LEAF_KINDS[name];
    const at = tile - FIRST[name].spray;
    if (at >= 0 && at < k.sprays + k.boughs) return { kind: name, bough: at >= k.sprays, nth: at >= k.sprays ? at - k.sprays : at };
  }
  throw new Error(`the leaf atlas has no tile ${tile}`);
}

/**
 * A card's texture coordinates for a tile: across it from `u` 0 to 1, in the tile's own whole number so that it never
 * runs into the next; and along it in v, 0 at the twig's foot.
 */
export const tileU = (tile: number, u: number): number => tile + 0.01 + 0.98 * (u < 0 ? 0 : u > 1 ? 1 : u);

/** The kind of leaf a plant's part has where its form does not say: by its part's type and its material. */
export function defaultLeaf(type: string, mat: string | undefined): LeafKindName {
  const m = mat ?? (type === 'conifer' || type === 'whorled' || type === 'scale-tree' ? 'needle' : type === 'broadleaf' || type === 'shrub' ? 'broad' : 'frond');
  switch (type) {
    case 'conifer':
      return m === 'broad' ? 'broad-tongue' : m === 'frond' ? 'needle-scale' : 'needle-flat';
    case 'broadleaf':
      return m === 'frond' ? 'broad-strap' : m === 'needle' ? 'needle-tuft' : 'broad-oval';
    case 'scale-tree':
      return 'needle-awl';
    case 'palm':
      return 'frond-fan';
    case 'fern':
      return m === 'needle' ? 'frond-cycad' : 'frond-fern';
    case 'whorled':
      return 'whorl';
    case 'shrub':
      return m === 'frond' ? 'moss' : m === 'needle' ? 'needle-scale' : 'broad-small';
    case 'tuft':
      return m === 'broad' ? 'herb' : m === 'needle' ? 'blade-rush' : 'blade-grass';
    default:
      return 'broad-oval';
  }
}
