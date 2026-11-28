// The climate of the deep past with its spread at the time shown (model:earth/climate-conditioned,
// core/climatechance.ts): at each node of the climate field's grid the central climate, its spreads, the chance of each
// class and the beds that tell of climate found near, at the field's keyframes. A keyframe's file is fetched when a
// click on the land first asks for it. Nothing of it is drawn on the globe: the land is painted from the run.
import { decodeNode, type ClimateNode } from '../../core/climate.ts';
import { byteChance, byteFinds, byteWarmSd, byteWetSd, nodeOf, PAIRS, type ChanceIndex, type ChanceKeyHeader, type Pair, type Spreads } from '../../core/climatechance.ts';
import { decodeTile } from '../../core/container.ts';
import type { Build } from './data.ts';

/** A keyframe's bytes, as its file keeps them (core/climatechance.ts ChanceKeyHeader). */
export interface ChanceKeyBytes {
  central: Uint8Array;
  spread: Uint8Array;
  chances: Uint8Array;
  found: Uint8Array;
  told: Uint8Array;
  plate: Uint16Array;
}

/** What a keyframe has at a node. */
export interface ChanceNode {
  central: ClimateNode;
  spreads: Spreads;
  /** the chance of each class, in the index's order */
  chances: number[];
  /** the beds found near, for each pair its `more` kind and its `less`, each counted by how near it lies */
  found: Record<Pair, [number, number]>;
  /** how much of the square of the spread what was found took away, of the warmth and of the aridity */
  told: { warm: number; wet: number };
}

export class ClimateChance {
  /** the index, once it has come: the rule as fitted, the keyframes, and how the model held on what it did not see */
  index: ChanceIndex | null = null;
  private indexComing: Promise<void> | null = null;
  private keys = new Map<number, ChanceKeyBytes>();
  private coming = new Map<number, Promise<ChanceKeyBytes | undefined>>();
  /** keyframes whose file did not come: not asked for again */
  private failed = new Set<number>();

  constructor(private build: Build, private changed: () => void) {
    const file = build.tileset.files.climateChance;
    if (!file) return;
    this.indexComing = build
      .getJSON<ChanceIndex>(file)
      .then((ix) => {
        this.index = ix;
        this.changed();
      })
      .catch((err) => console.error(`climate chance ${file}:`, err))
      .finally(() => (this.indexComing = null));
  }

  /** Whether the index or a keyframe something asked for is still on its way. */
  get busy(): boolean {
    return !!this.indexComing || this.coming.size > 0;
  }

  /** Whether it is made on a climate field: it starts from that field's runs, at its keyframes. */
  covers(field: string): boolean {
    return this.index?.climate === field;
  }

  /** The keyframe nearest an age, in Ma; undefined until the index has come. */
  nearest(ageMa: number): number | undefined {
    const ks = this.index?.keyframes;
    if (!ks?.length) return undefined;
    return ks.reduce((best, k) => (Math.abs(k.ageMa - ageMa) < Math.abs(best.ageMa - ageMa) ? k : best)).ageMa;
  }

  /** A keyframe's bytes, if its file has come. */
  key(ageMa: number): ChanceKeyBytes | undefined {
    return this.keys.get(ageMa);
  }

  /** A keyframe's bytes, fetched if they have not been: undefined where the build has no such keyframe. */
  load(ageMa: number): Promise<ChanceKeyBytes | undefined> {
    const have = this.keys.get(ageMa);
    if (have) return Promise.resolve(have);
    let p = this.coming.get(ageMa);
    if (p) return p;
    const ref = this.index?.keyframes.find((k) => k.ageMa === ageMa);
    if (!ref || this.failed.has(ageMa)) return Promise.resolve(undefined);
    p = this.build
      .getBytes(ref.file)
      .then((data) => {
        const { header, arrays } = decodeTile<ChanceKeyHeader>(data);
        const key: ChanceKeyBytes = { central: arrays[header.central] as Uint8Array, spread: arrays[header.spread] as Uint8Array, chances: arrays[header.chances] as Uint8Array, found: arrays[header.found] as Uint8Array, told: arrays[header.told] as Uint8Array, plate: arrays[header.plate] as Uint16Array };
        this.keys.set(ageMa, key);
        return key;
      })
      .catch((err) => {
        console.error(`climate chance ${ref.file}:`, err);
        this.failed.add(ageMa);
        return undefined;
      })
      .finally(() => {
        this.coming.delete(ageMa);
        this.changed();
      });
    this.coming.set(ageMa, p);
    return p;
  }

  /** What a keyframe has at the node nearest a place, as the place stood at the keyframe: undefined until its file has come, and where the run has no climate. */
  at(ageMa: number, lat: number, lon: number): ChanceNode | undefined {
    const ix = this.index;
    const key = this.keys.get(ageMa);
    if (!ix || !key) return undefined;
    const n = nodeOf(ix.grid, lat, lon);
    const C = ix.classes.length;
    const chances = Array.from(key.chances.subarray(n * C, (n + 1) * C), byteChance);
    if (!chances.some((c) => c > 0)) return undefined;
    return {
      central: decodeNode([key.central[n * 4] / 255, key.central[n * 4 + 1] / 255, key.central[n * 4 + 2] / 255, key.central[n * 4 + 3] / 255]),
      spreads: { warm: byteWarmSd(key.spread[n * 2]), swing: ix.rule.error.swing_sd, wet: byteWetSd(key.spread[n * 2 + 1]) },
      chances,
      found: Object.fromEntries(PAIRS.map((pair, i) => [pair, [byteFinds(key.found[n * PAIRS.length * 2 + i * 2]), byteFinds(key.found[n * PAIRS.length * 2 + i * 2 + 1])]])) as Record<Pair, [number, number]>,
      told: { warm: byteChance(key.told[n * 2]), wet: byteChance(key.told[n * 2 + 1]) },
    };
  }
}
