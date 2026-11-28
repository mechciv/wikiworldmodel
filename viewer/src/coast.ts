// How likely the sea was at the time shown (model:earth/sea-chance, core/coast.ts): the chance of sea and what was found
// near each node of the elevation field's grid, at the field's keyframes. A keyframe's file is fetched when something
// first asks for it, the globe in evidence mode or a click on the ground, and goes to the GPU to be moved with its
// plates as the elevation is (gl/field.ts). Its bytes are kept too, for the panel to read a place's own node.
import { byteFinds, type CoastIndex, type CoastKeyHeader } from '../../core/coast.ts';
import { decodeTile } from '../../core/container.ts';
import type { Build } from './data.ts';
import type { FieldRenderer } from './gl/field.ts';

/** A keyframe's bytes at each node: the chance of sea, and the marine and land localities found near (core/coast.ts). */
export interface CoastKeyBytes {
  chance: Uint8Array;
  marine: Uint8Array;
  land: Uint8Array;
}

export class Coast {
  /** the index, once it has come: the rule as fitted, the keyframes, and how the model held on what it did not see */
  index: CoastIndex | null = null;
  private indexComing: Promise<void> | null = null;
  private keys = new Map<number, CoastKeyBytes>();
  private coming = new Map<number, Promise<CoastKeyBytes | undefined>>();
  /** keyframes whose file did not come: not asked for again */
  private failed = new Set<number>();

  constructor(private build: Build, private field: FieldRenderer, private changed: () => void) {
    const file = build.tileset.files.coast;
    if (!file) return;
    this.indexComing = build
      .getJSON<CoastIndex>(file)
      .then((ix) => {
        this.index = ix;
        this.changed();
      })
      .catch((err) => console.error(`coast ${file}:`, err))
      .finally(() => (this.indexComing = null));
  }

  /** Whether the index or a keyframe something asked for is still on its way. */
  get busy(): boolean {
    return !!this.indexComing || this.coming.size > 0;
  }

  /** Whether the chance is made on a field: it starts from that field's coast, at its keyframes. */
  covers(field: string): boolean {
    return this.index?.elevation === field;
  }

  /** A keyframe's bytes, if its file has come. */
  key(ageMa: number): CoastKeyBytes | undefined {
    return this.keys.get(ageMa);
  }

  /** A keyframe's bytes, fetched if they have not been: undefined where the build has no such keyframe. */
  load(ageMa: number): Promise<CoastKeyBytes | undefined> {
    const have = this.keys.get(ageMa);
    if (have) return Promise.resolve(have);
    let p = this.coming.get(ageMa);
    if (p) return p;
    const ix = this.index;
    const ref = ix?.keyframes.find((k) => k.ageMa === ageMa);
    if (!ix || !ref || this.failed.has(ageMa)) return Promise.resolve(undefined);
    p = this.build
      .getBytes(ref.file)
      .then((data) => {
        const { header, arrays } = decodeTile<CoastKeyHeader>(data);
        const key: CoastKeyBytes = { chance: arrays[header.chance] as Uint8Array, marine: arrays[header.marine] as Uint8Array, land: arrays[header.land] as Uint8Array };
        // For the globe, four bytes a node: the chance, how far the finds near outweigh the field (a half where they
        // weigh the same), and the two counts.
        const n = key.chance.length;
        const values = new Uint8Array(n * 4);
        for (let i = 0; i < n; i++) {
          const found = byteFinds(key.marine[i]) + byteFinds(key.land[i]);
          values[i * 4] = key.chance[i];
          values[i * 4 + 1] = Math.round((255 * found) / (found + ix.rule.strength));
          values[i * 4 + 2] = key.marine[i];
          values[i * 4 + 3] = key.land[i];
        }
        this.field.addSea(header.grid, ageMa, values, arrays[header.plate] as Uint16Array);
        this.keys.set(ageMa, key);
        return key;
      })
      .catch((err) => {
        console.error(`coast ${ref.file}:`, err);
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

  /** Whether the chance is on the GPU at two keyframes of a field; what is missing is fetched. */
  ready(field: string, k0: number, k1: number): boolean {
    if (!this.covers(field)) return false;
    let all = true;
    for (const age of k0 === k1 ? [k0] : [k0, k1]) {
      if (this.field.hasSea(age)) continue;
      all = false;
      void this.load(age);
    }
    return all;
  }
}
