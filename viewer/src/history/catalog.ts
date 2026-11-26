// Editorial guides to the build's index. An id identifies a record; a name identifies a run
// of border rows as grouped by searchRows. Neither adds a date or a claim to the model.
import type { SearchEntry, SearchFile } from '../../../core/records.ts';
import areas from './regions.json';
import references from './references.json';

export const REGIONS = [
  'Africa',
  'West Asia',
  'South & Central Asia',
  'East & Southeast Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
] as const;
export type Region = (typeof REGIONS)[number] | 'Unplaced';
export type Status = 'record' | 'border' | 'reference';
export const STATUS: Record<Status, string> = { record: 'Model record', border: 'Border data', reference: 'Reference only' };
export interface Entry {
  id: string;
  label: string;
  region: Region;
  status: Status;
  kind: string;
  highlight: boolean;
  start: number | null;
  end: number | null;
  ranges: [number, number][]; // border intervals, half-open
  source?: SearchEntry;
  reference?: (typeof references)[number];
}

const guides: Record<(typeof REGIONS)[number], { records: string[]; borders: string[] }> = {
  Africa: {
    records: [
      'people/prehistory/lomekwian',
      'people/prehistory/oldowan',
      'people/prehistory/acheulean',
      'people/prehistory/still-bay',
      'people/polities/egypt-old-kingdom',
      'people/polities/egypt-new-kingdom',
      'people/first-cities/great-zimbabwe',
      'people/polities/mali-empire',
    ],
    borders: ['Kingdom of Kush', 'Songhai Empire', 'Ashanti Empire', 'Arab Republic of Egypt'],
  },
  'West Asia': {
    records: [
      'people/traditions/natufian-round-house',
      'people/first-cities/catalhoyuk',
      'people/first-cities/uruk',
      'people/polities/babylon-first-dynasty',
    ],
    borders: ['Sumerian City-States', 'Akkadian Empire', 'Achaemenid Empire', 'Abbasid Caliphate', 'Ottoman Empire'],
  },
  'South & Central Asia': {
    records: [
      'people/traditions/mehrgarh-mudbrick-house',
      'people/first-cities/harappa',
      'people/polities/maurya-empire',
      'people/polities/mughal-empire',
      'people/polities/chagatai-khanate',
    ],
    borders: ['Indus Valley Civilization', 'Gupta Empire', 'Chola Empire', 'Republic of India'],
  },
  'East & Southeast Asia': {
    records: [
      'people/traditions/jomon-pit-dwelling',
      'people/first-cities/liangzhu',
      'people/polities/han',
      'people/first-cities/angkor',
      'people/polities/yuan-dynasty',
    ],
    borders: ['Shang Dynasty', 'Zhou Dynasty', 'Ming Dynasty', 'Tokugawa Shogunate', "People's Republic of China"],
  },
  Europe: {
    records: [
      'people/prehistory/mousterian',
      'people/prehistory/aurignacian',
      'people/polities/rome',
      'people/polities/frankish-kingdom',
      'people/polities/holy-roman-empire',
      'people/polities/united-kingdom',
    ],
    borders: ['Kingdom of France'],
  },
  'North America': {
    records: [
      'people/dispersals/americas-arrival',
      'people/first-cities/teotihuacan',
      'people/first-cities/cahokia',
      'people/polities/triple-alliance',
      'people/traditions/northern-iroquoian-longhouse',
    ],
    borders: ['Olmec Civilization', 'Mayan City-States', 'Canada'],
  },
  'South America': {
    records: ['people/dispersals/monte-verde', 'people/first-cities/caral'],
    borders: ['Chimu Empire', 'Inca Empire', 'Empire of Brazil', 'Republic of Peru'],
  },
  Oceania: {
    records: [
      'people/dispersals/sahul-madjedbebe',
      'people/domestication/banana-kuk',
      'people/traditions/lapita-stilt-house',
      'people/traditions/latte-house',
    ],
    borders: ['Kingdom of Fiji', 'New Zealand', 'Republic of Fiji'],
  },
};
const regionsById = new Map<string, Region>();
const featuredBorders = new Map<string, Region>();
for (const r of REGIONS) {
  for (const id of guides[r].records) regionsById.set(id, r);
  for (const label of guides[r].borders) featuredBorders.set(label, r);
}
const featuredRecords = new Set(regionsById.keys());
// Countries with no label point in the search index, plus other settlements in the same corpus.
const others: Partial<Record<Region, Record<string, string>>> = {
  Africa: { 'first-cities': 'memphis meroe' },
  'West Asia': { polities: 'ilkhanate', 'first-cities': 'ur hattusa' },
  'South & Central Asia': { polities: 'golden-horde', 'first-cities': 'mohenjo-daro', trade: 'protectorate-of-the-western-regions' },
  'East & Southeast Asia': { polities: 'empire-of-japan qin republic-of-china mongol-empire', 'first-cities': 'anyang erlitou' },
  Europe: {
    polities:
      'crown-of-castile federal-republic-of-germany fr-yugoslavia german-democratic-republic german-reich great-britain ireland kingdom-of-england kingdom-of-ireland kingdom-of-scotland russia second-polish-republic sfr-yugoslavia soviet-union western-roman-empire',
  },
  'North America': { polities: 'palenque tenochtitlan texcoco tlacopan tlatelolco tlaxcala united-states', 'first-cities': 'monte-alban tikal' },
};
for (const [r, groups] of Object.entries(others))
  for (const [group, names] of Object.entries(groups)) {
    for (const name of names.split(' ')) regionsById.set(`people/${group}/${name}`, r as Region);
  }

export const shapes = areas as Record<(typeof REGIONS)[number], number[][][]>;
/** The region containing the first border label point. A coastal or island point can fall
 * outside the simplified land, so use its nearest coast, wrapping across the date line. */
export function regionAt(lon: number, lat: number): Region {
  let nearest: Region = 'Unplaced',
    distance = Infinity;
  const scale = Math.cos((lat * Math.PI) / 180);
  for (const region of REGIONS)
    for (const ring of shapes[region]) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x, y] = ring[i],
          [px, py] = ring[j];
        if (y > lat !== py > lat && lon < ((px - x) * (lat - y)) / (py - y) + x) inside = !inside;
        const dx = (((x - lon + 540) % 360) - 180) * scale;
        const d = dx * dx + (y - lat) ** 2;
        if (d < distance) {
          distance = d;
          nearest = region;
        }
      }
      if (inside) return region;
    }
  return nearest;
}

/** Preserve interruptions between dated border observations, including gaps inside a named run. */
export function borderRanges(e: SearchEntry): [number, number][] {
  const ranges: [number, number][] = [];
  for (const [a, b] of [...(e.places ?? [])].sort((u, v) => u[0] - v[0])) {
    const last = ranges.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else ranges.push([a, b]);
  }
  return ranges;
}

export function catalog(search: SearchFile): Entry[] {
  const entries: Entry[] = [];
  for (const e of [...search.entities, ...(search.rows ?? [])]) {
    const polity = e.kind === 'polity' || e.kind.startsWith('polity/');
    if (!polity && !regionsById.has(e.id)) continue;
    const ranges = borderRanges(e);
    const place = e.places?.[0];
    const region = regionsById.get(e.id) ?? featuredBorders.get(e.label) ?? (place ? regionAt(place[2], place[3]) : 'Unplaced');
    // No inferred reign stretching to the present where a record lacks an end. One dated
    // edge is drawn as a point; linked border observations have their own dated intervals.
    const dates = [e.time.start.best, e.time.end.best, ...ranges.flat()].filter((t): t is number => t != null && Number.isFinite(t));
    entries.push({
      id: e.id,
      label: e.label,
      status: e.dataset ? 'border' : 'record',
      kind: e.kind,
      region,
      highlight: featuredRecords.has(e.id) || (!!e.dataset && featuredBorders.has(e.label)),
      ranges,
      source: e,
      start: dates.length ? Math.min(...dates) : null,
      end: dates.length ? Math.max(...dates) : null,
    });
  }
  // These archaeological period definitions are independent reference points. The crosswalk names a record
  // explicitly where the same subject has one. A nearby city or a similar name is insufficient.
  for (const ref of references) {
    const linked = ref.modelId && entries.find((e) => e.id === ref.modelId);
    if (linked) {
      linked.reference = ref;
      linked.start = Math.min(linked.start ?? ref.start, ref.start);
      linked.end = Math.max(linked.end ?? ref.end, ref.end);
      continue;
    }
    entries.push({
      id: ref.id,
      label: ref.label,
      region: ref.region as Region,
      status: 'reference',
      kind: 'Archaeological period',
      highlight: true,
      start: ref.start,
      end: ref.end,
      ranges: [],
      reference: ref,
    });
  }
  return entries;
}
