// The sea's level and the height of the land at the time shown (model:earth/shore-level, model:earth/land-height;
// core/heights.ts): each node's bell above the level and the chance it lay below, at the elevation field's keyframes.
// Nothing of it is drawn on the globe yet. A keyframe's file is fetched when a click on the ground first asks for it,
// and its arrays are kept for the panel to read a place's own node.
import { decodeTile } from '../../core/container.ts';
import type { HeightKeyHeader, HeightsIndex } from '../../core/heights.ts';
import type { Build } from './data.ts';

/** A keyframe's values at each node (core/heights.ts, HeightKeyHeader). */
export interface HeightKey {
  map: Int16Array;
  mean: Int16Array;
  sd: Uint8Array;
  chance: Uint8Array;
  rests: Uint8Array;
}

export class Heights {
  /** the index: the keyframes' levels, the rule as fitted, and how the two held; null where the build has none */
  readonly index: HeightsIndex | null;
  private keys = new Map<number, HeightKey>();
  private coming = new Map<number, Promise<HeightKey | undefined>>();
  /** keyframes whose file did not come: not asked for again */
  private failed = new Set<number>();

  constructor(private build: Build, private changed: () => void) {
    this.index = build.heights ?? null;
  }

  /** Whether a keyframe something asked for is still on its way. */
  get busy(): boolean {
    return this.coming.size > 0;
  }

  /** Whether the heights are made on a field: they start from that field's heights, at its keyframes. */
  covers(field: string): boolean {
    return this.index?.elevation === field;
  }

  /** A keyframe's values, if its file has come. */
  key(ageMa: number): HeightKey | undefined {
    return this.keys.get(ageMa);
  }

  /** A keyframe's values, fetched if they have not been: undefined where the build has no such keyframe. */
  load(ageMa: number): Promise<HeightKey | undefined> {
    const have = this.keys.get(ageMa);
    if (have) return Promise.resolve(have);
    let p = this.coming.get(ageMa);
    if (p) return p;
    const ref = this.index?.keyframes.find((k) => k.ageMa === ageMa);
    if (!ref || this.failed.has(ageMa)) return Promise.resolve(undefined);
    p = this.build
      .getBytes(ref.file)
      .then((data) => {
        const { header, arrays } = decodeTile<HeightKeyHeader>(data);
        const key: HeightKey = { map: arrays[header.map] as Int16Array, mean: arrays[header.mean] as Int16Array, sd: arrays[header.sd] as Uint8Array, chance: arrays[header.chance] as Uint8Array, rests: arrays[header.rests] as Uint8Array };
        this.keys.set(ageMa, key);
        return key;
      })
      .catch((err) => {
        console.error(`heights ${ref.file}:`, err);
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
}
