// The rock record near a place (rocks/index.json, rocks/bins/<i>.json): for each stage of the atlases, every collection
// of the Paleobiology Database dated to it, where its plate stood at the stage's slice, with what the database says of
// its rock and of the environment it was laid down in (core/rocks.ts). The build draws nothing from it yet. It also
// holds the elevation field to it: a collection the database calls terrestrial should stand on the field's land at its
// stage, and a marine one lie in its sea, and the field reads neither.
import { ROCK_SITE, type RocksAgreement, type RocksBin, type RocksBinRef, type RocksIndex } from '../../../../core/rocks.ts';
import { conj, rotate, toLatLon, unitVector, type Quat } from '../../../../core/quat.ts';
import type { PeriodRecord } from '../../../../core/records.ts';
import { fromMa, toMa } from '../../../../core/time.ts';
import type { RocksSnapshot } from '../pbdb.ts';
import { stableStringify } from '../util.ts';
import { atlasBins, rowShare } from './atlas.ts';
import { SRC_W, type Snapshot } from './fields.ts';
import { sourceRecord, type Solved } from './records.ts';

export interface RocksParams {
  /** how near a site must be for its rock to be the place's own, and how far it may be and still say something of it, in km */
  here_km: number;
  near_km: number;
  /** a collection dated to a span longer than this says too little of any stage, in Myr; and one longer than this many times a stage too little of that stage: the atlases' */
  longest_span: number;
  longest_span_in_stages: number;
  /** a stage is cut if it is longer than this, and joined to the next if shorter, in Myr: the atlases', so that the rocks and the lists have the same stages */
  longest_bin: number;
  shortest_bin: number;
}

export interface RocksOut {
  index: RocksIndex;
  files: Map<string, string>;
  /** in memory, for the build's own questions: each stage's sites, as written, in the order of the index's bins */
  bins: RocksBin[];
}

/** The words a field's rows say mean the dataset gives nothing, for a column: a site keeps none of them. */
export type NoneWords = (column: string) => Set<string>;

/**
 * `none` gives the words of the dataset that say nothing ("not reported"), by the column a row has them in. `isoline`
 * is the height the elevation field's coast stands at.
 */
export function buildRocks(s: Solved, periods: PeriodRecord[], elevation: Snapshot[], snap: RocksSnapshot, dataset: string, field: { title: string; description?: string }, p: RocksParams, none: NoneWords, isoline: number, log: (m: string) => void): RocksOut {
  // Where each collection was: its plate, from the plates of today's land, as the atlases find a site's.
  const now = [...elevation].sort((a, b) => a.ageMa - b.ageMa)[0];
  const plateNear = (lat: number, lon: number): number => {
    const j0 = Math.round(90 - lat);
    const i0 = Math.round(lon + 180);
    for (let r = 0; r <= 3; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(dj), Math.abs(di)) !== r) continue;
          const j = Math.max(0, Math.min(180, j0 + dj));
          const i = (((i0 + di) % SRC_W) + SRC_W) % SRC_W;
          const q = now.plate[j * SRC_W + i];
          if (q) return q;
        }
      }
    }
    return 0;
  };
  const plates = snap.collections.map((c) => plateNear(c[1], c[2]));
  // A plate's turn is the same for every collection on it, so each is worked out once: back from today, and forth to
  // each stage's slice. Null where the plate model does not carry the plate there.
  const back = new Map<number, Quat | null>();
  const backOf = (plate: number): Quat | null => {
    let q = back.get(plate);
    if (q === undefined) {
      q = plate && s.model.reaches(plate, 0) ? conj(s.model.total(plate, 0)) : null;
      back.set(plate, q);
    }
    return q;
  };
  const bitOf = (name: string) => {
    const k = snap.classes.indexOf(name);
    return k < 0 ? 0 : 1 << k;
  };
  const LAND = bitOf('terrestrial');
  const SEA = bitOf('marine');
  const noEnvironment = none('environment');
  const noLithology = none('lithology');
  const noLithology2 = none('lithology2');
  const said = (word: number, not: Set<string>): string => {
    const w = snap.words[word] ?? '';
    return not.has(w) ? '' : w;
  };
  const files = new Map<string, string>();
  const refs: RocksBinRef[] = [];
  const bins: RocksBin[] = [];
  const agreement: RocksAgreement = { land: 0, land_on_land: 0, sea: 0, sea_in_sea: 0 };
  const named = new Set<string>();
  atlasBins(periods, p.longest_bin, p.shortest_bin).forEach((bin, binIndex) => {
    const olderMa = toMa(bin.from);
    const youngerMa = toMa(bin.to);
    const midMa = (olderMa + youngerMa) / 2;
    const slice = fromMa(midMa);
    const key = [...elevation].sort((a, b) => Math.abs(a.ageMa - midMa) - Math.abs(b.ageMa - midMa))[0];
    if (Math.abs(key.ageMa - midMa) > 12) return;
    const words = new Map<string, number>([['', 0]]);
    const word = (w: string) => {
      let k = words.get(w);
      if (k === undefined) {
        k = words.size;
        words.set(w, k);
      }
      return k;
    };
    const sites: number[] = [];
    let count = 0;
    const forth = new Map<number, Quat | null>();
    const forthOf = (plate: number): Quat | null => {
      let q = forth.get(plate);
      if (q === undefined) {
        q = plate && s.model.reaches(plate, midMa) ? s.model.total(plate, midMa) : null;
        forth.set(plate, q);
      }
      return q;
    };
    snap.collections.forEach((c, i) => {
      const share = rowShare(c[3], c[4], olderMa, youngerMa, p);
      if (!share) return;
      const to = forthOf(plates[i]);
      const from = backOf(plates[i]);
      if (!to || !from) return;
      const [la, lo] = toLatLon(rotate(to, rotate(from, unitVector(c[1], c[2]))));
      const lithology1 = said(c[8], noLithology);
      const lithology2 = said(c[12], noLithology2);
      for (const l of [lithology1, lithology2]) if (l) named.add(l);
      // An adjective describes a lithology: with none named, it has nothing to describe.
      sites.push(Math.round(la * 100), Math.round(lo * 100), c[0], Math.max(1, Math.min(255, Math.round(share * 255))), c[16], word(said(c[5], noEnvironment)), word(lithology1), word(lithology1 ? (snap.words[c[9]] ?? '') : ''), word(lithology2), word(lithology2 ? (snap.words[c[13]] ?? '') : ''));
      count++;
      // The field's land and sea at the stage, at the node nearest the site: neither reads the other.
      const e = key.elev[Math.max(0, Math.min(180, Math.round(90 - la))) * SRC_W + (((Math.round(lo + 180) % SRC_W) + SRC_W) % SRC_W)];
      const onLand = e >= isoline;
      if (c[16] & LAND && !(c[16] & SEA)) {
        agreement.land++;
        if (onLand) agreement.land_on_land++;
      } else if (c[16] & SEA && !(c[16] & LAND)) {
        agreement.sea++;
        if (!onLand) agreement.sea_in_sea++;
      }
    });
    const file = `rocks/bins/${binIndex}.json`;
    const out: RocksBin = { format: 'lightworld-rocks-bin@1', from: bin.from, to: bin.to, slice, name: bin.name, words: [...words.keys()], sites };
    if (sites.length !== count * ROCK_SITE) throw new Error(`rocks: a site of ${bin.name} is not ${ROCK_SITE} numbers`);
    files.set(file, stableStringify(out));
    bins.push(out);
    refs.push({ from: bin.from, to: bin.to, slice, name: bin.name, file, sites: count });
  });
  const types = new Map(snap.lithologies.map(([l, t]) => [snap.words[l], snap.words[t]]));
  const lithologies: Record<string, string> = {};
  for (const l of [...named].sort()) if (types.has(l)) lithologies[l] = types.get(l)!;
  const index: RocksIndex = {
    format: 'lightworld-rocks@1',
    title: field.title,
    description: field.description,
    source: dataset,
    sourceRecord: s.world.source.get(dataset) ? sourceRecord(s.world.source.get(dataset)!) : undefined,
    here_km: p.here_km,
    near_km: p.near_km,
    classes: snap.classes,
    lithologies,
    bins: refs,
    agreement,
    measured: { collections: new Set(snap.ages.map((a) => a[0])).size, of: snap.collections.length },
  };
  files.set('rocks/index.json', stableStringify(index));
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : 'none');
  log(`rocks   ${refs.reduce((n, r) => n + r.sites, 0)} sites in ${refs.length} stages, of ${snap.collections.length} collections; ${pct(agreement.land_on_land, agreement.land)} of the terrestrial stand on the elevation field's land at their stage, ${pct(agreement.sea_in_sea, agreement.sea)} of the marine lie in its sea`);
  return { index, files, bins };
}
