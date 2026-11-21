// The rock record near a place: what the rocks that hold a stage's fossils are made of, and where they were laid down.
// A fossil collection of the Paleobiology Database names its lithologies (sandstone, gypsum, "shale"), their adjectives
// (red, coarse, desiccation cracks, paleosol), and its environment (a lake, a dune, a channel, a reef). For a stage,
// each collection dated to it is a site, where its plate stood at the stage's slice. This is what a scene's ground and
// setting can be drawn from (docs/SCENES.md); it draws nothing itself, and it is evidence only near a site: what a
// rock says of the ground a few kilometres off it says less and less of the ground a few hundred off.
import { kmBetween } from './landscape.ts';
import type { SourceRecord } from './records.ts';

export interface RocksBinRef {
  /** astronomical years */
  from: number;
  to: number;
  /** the moment the sites are placed for: the stage's middle, as the atlases' */
  slice: number;
  name: string;
  file: string;
  sites: number;
}

/** How a kind of collection agrees with the land and sea of the elevation field at its stage, which does not read it. */
export interface RocksAgreement {
  /** sites the database calls terrestrial only, and how many of them stand on the field's land */
  land: number;
  land_on_land: number;
  /** sites it calls marine only, and how many of them lie in the field's sea */
  sea: number;
  sea_in_sea: number;
}

export interface RocksIndex {
  format: 'lightworld-rocks@1';
  title: string;
  description?: string;
  source: string;
  sourceRecord?: SourceRecord;
  /** how near a site must be for its rock to be the place's own, and how far it may be and still say something of it, in km */
  here_km: number;
  near_km: number;
  /** the database's classes of environment, by the bit each has in a site's classes */
  classes: string[];
  /** the type the database gives each lithology the stages name */
  lithologies: Record<string, string>;
  bins: RocksBinRef[];
  /** every stage's sites together, against the elevation field */
  agreement: RocksAgreement;
  /** how many of the dataset's collections have a measured age of their own, of how many */
  measured: { collections: number; of: number };
}

/** How many numbers a site takes in a stage's flat list. */
export const ROCK_SITE = 10;

/**
 * One stage. `sites` is flat tens: latitude and longitude at the slice, in hundredths of a degree; the collection's
 * number; how much of its span the stage holds, 1–255; its classes of environment, as bits; then words: its
 * environment, its first lithology and that one's adjectives, its second and that one's.
 */
export interface RocksBin {
  format: 'lightworld-rocks-bin@1';
  from: number;
  to: number;
  slice: number;
  name: string;
  words: string[];
  sites: number[];
}

export interface RockLithology {
  name: string;
  /** what the database says of it: grain, colour, bedding, what grew or dried in it */
  adjectives: string[];
}

export interface RockSite {
  lat: number;
  lon: number;
  /** the collection's number in the Paleobiology Database: its row is src:<dataset>#coll:<number> */
  collection: number;
  /** how much of the collection's span the stage holds, 0–1 */
  share: number;
  classes: string[];
  environment: string;
  lithologies: RockLithology[];
}

const adjectives = (s: string): string[] => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

/** The site at a place in a stage's list, read out of its numbers. */
export function rockSite(bin: RocksBin, classes: string[], i: number): RockSite {
  const s = bin.sites;
  const k = i * ROCK_SITE;
  const w = (n: number) => bin.words[n] ?? '';
  const lithologies: RockLithology[] = [];
  for (const at of [k + 6, k + 8]) if (w(s[at])) lithologies.push({ name: w(s[at]), adjectives: adjectives(w(s[at + 1])) });
  return {
    lat: s[k] / 100,
    lon: s[k + 1] / 100,
    collection: s[k + 2],
    share: s[k + 3] / 255,
    classes: classes.filter((_, bit) => s[k + 4] & (1 << bit)),
    environment: w(s[k + 5]),
    lithologies,
  };
}

/** A stage's sites sorted into boxes of latitude and longitude, so that those near a place are found without reading them all. */
export interface RockBoxes {
  step: number;
  nx: number;
  ny: number;
  /** the sites in each box that has any, by their place in the stage's list */
  boxes: Map<number, number[]>;
}

export function rockBoxes(bin: RocksBin, step = 2): RockBoxes {
  const nx = Math.round(360 / step);
  const ny = Math.round(180 / step);
  const boxes = new Map<number, number[]>();
  const n = bin.sites.length / ROCK_SITE;
  for (let i = 0; i < n; i++) {
    const row = Math.max(0, Math.min(ny - 1, Math.floor((90 - bin.sites[i * ROCK_SITE] / 100) / step)));
    const col = ((Math.floor((bin.sites[i * ROCK_SITE + 1] / 100 + 180) / step) % nx) + nx) % nx;
    const k = row * nx + col;
    const list = boxes.get(k);
    if (list) list.push(i);
    else boxes.set(k, [i]);
  }
  return { step, nx, ny, boxes };
}

/**
 * A stage's sites within some km of a place, the nearest first, each with how far it is. The place is where it was at
 * the stage's slice. With the stage's `boxes`, only the boxes the distance reaches are read.
 */
export function rocksNear(bin: RocksBin, classes: string[], lat: number, lon: number, km: number, boxes?: RockBoxes): (RockSite & { km: number })[] {
  const out: (RockSite & { km: number })[] = [];
  // A degree of latitude is 111 km everywhere: sites further than that in latitude alone need no more looking at.
  const band = km / 111 + 0.01;
  const look = (i: number) => {
    const la = bin.sites[i * ROCK_SITE] / 100;
    if (Math.abs(la - lat) > band) return;
    const d = kmBetween(lat, lon, la, bin.sites[i * ROCK_SITE + 1] / 100);
    if (d <= km) out.push({ ...rockSite(bin, classes, i), km: d });
  };
  if (boxes) {
    const { step, nx, ny } = boxes;
    const row0 = Math.max(0, Math.floor((90 - (lat + band)) / step));
    const row1 = Math.min(ny - 1, Math.floor((90 - (lat - band)) / step));
    // How far round the degrees of longitude reach, at the latitude nearest a pole: all the way, close to one.
    const widest = Math.cos((Math.min(89.9, Math.abs(lat) + band) * Math.PI) / 180);
    const reach = band / Math.max(widest, 1e-3);
    const cols = reach >= 180 ? nx : Math.min(nx, Math.floor((lon + reach + 180) / step) - Math.floor((lon - reach + 180) / step) + 1);
    const col0 = reach >= 180 ? 0 : Math.floor((lon - reach + 180) / step);
    for (let row = row0; row <= row1; row++) {
      for (let c = 0; c < cols; c++) {
        const list = boxes.boxes.get(row * nx + ((((col0 + c) % nx) + nx) % nx));
        if (list) for (const i of list) look(i);
      }
    }
  } else {
    const n = bin.sites.length / ROCK_SITE;
    for (let i = 0; i < n; i++) look(i);
  }
  return out.sort((a, b) => a.km - b.km || a.collection - b.collection);
}

/** What the sites of a tier say, added up: each by how much of its span the stage holds. */
export interface RockTally {
  sites: number;
  /** km to the nearest of them; null where there is none */
  nearest: number | null;
  /** each heaviest first: a word, and its share of the tier's weight */
  environments: [string, number][];
  lithologies: [string, number][];
  adjectives: [string, number][];
  classes: [string, number][];
}

export type RockTier = 'here' | 'near' | 'nothing';

export interface RockAnswer {
  /** the nearest tier that has a site: here, where one lies within here_km; near, within near_km; or nothing */
  tier: RockTier;
  here: RockTally;
  near: RockTally;
}

function tally(sites: (RockSite & { km: number })[]): RockTally {
  // A word the dataset uses for "nothing said" never reaches a stage's list: the build leaves it empty.
  const add = (m: Map<string, number>, key: string, w: number) => {
    if (key) m.set(key, (m.get(key) ?? 0) + w);
  };
  const env = new Map<string, number>();
  const lith = new Map<string, number>();
  const adj = new Map<string, number>();
  const cls = new Map<string, number>();
  let total = 0;
  for (const s of sites) {
    total += s.share;
    add(env, s.environment, s.share);
    for (const c of s.classes) add(cls, c, s.share);
    // A collection's two lithologies share its weight; an adjective counts with the lithology it describes.
    for (const l of s.lithologies) {
      add(lith, l.name, s.share / s.lithologies.length);
      for (const a of l.adjectives) add(adj, a, s.share / s.lithologies.length);
    }
  }
  const shares = (m: Map<string, number>): [string, number][] => [...m].map(([k, w]): [string, number] => [k, total ? Math.round((w / total) * 1000) / 1000 : 0]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return { sites: sites.length, nearest: sites.length ? Math.round(sites[0].km) : null, environments: shares(env), lithologies: shares(lith), adjectives: shares(adj), classes: shares(cls) };
}

/**
 * What the rocks say of a place in a stage, in two tiers: the sites within `here_km`, whose rock is the place's own as
 * near as a collection's coordinates tell, and those out to `near_km`, whose rock says something of the country round
 * it. The place is where it was at the stage's slice.
 */
export function rocksAt(bin: RocksBin, index: Pick<RocksIndex, 'classes' | 'here_km' | 'near_km'>, lat: number, lon: number): RockAnswer {
  const all = rocksNear(bin, index.classes, lat, lon, index.near_km);
  const here = all.filter((s) => s.km <= index.here_km);
  const near = all.filter((s) => s.km > index.here_km);
  return { tier: here.length ? 'here' : near.length ? 'near' : 'nothing', here: tally(here), near: tally(near) };
}

/** The stage of an index that holds a time, if one does. */
export function rocksBinAt(index: Pick<RocksIndex, 'bins'>, t: number): RocksBinRef | undefined {
  return index.bins.find((b) => t >= b.from && t <= b.to);
}
