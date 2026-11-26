// Who the world's data comes from, and on what terms: the datasets the build reads and the
// databases its records cite. The build credits them in the viewer (`credits` in tileset.json) and
// writes them out as ATTRIBUTION.md in each build; `npm run world -- attribution` writes the
// repository's copy, which a unit test keeps current.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GroundMaterials } from '../../../core/materials.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { REPO } from './paths.ts';
import type { World } from './world.ts';

/** Attribution for what the build shows: its datasets, and the databases its records cite. */
export function credits(world: World): Tileset['credits'] {
  const out: Tileset['credits'] = [];
  // Tiles of one dataset share a credit.
  for (const d of Object.values(world.manifest.datasets)) if (!out.some((c) => c.label === d.credit)) out.push({ label: d.credit!, license: d.license! });
  const ground = groundMaterials();
  return [...out, ...citedDatabases(world).map(({ label, licenses }) => ({ label, license: licenses.join(' and ') })), ...(ground ? [{ label: `The ground's materials, scanned by ${ground.source}`, license: ground.license }] : [])];
}

/**
 * The scanned materials the viewer draws the ground with (core/materials.ts), as the list that goes out with them says;
 * nothing where the viewer has none.
 */
export function groundMaterials(file = join(REPO, 'viewer/public/materials/ground.json')): GroundMaterials | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as GroundMaterials) : null;
}

/** The databases whose entries the records cite, each with every licence it was read under. */
function citedDatabases(world: World): { label: string; licenses: string[] }[] {
  const cited = new Set(world.entities.flatMap((e) => [...e.claims, ...e.relations].flatMap((c) => [...c.sources, ...c.against].map((s) => s.ref))));
  // A database may have changed its licence between the snapshots read: credit each one.
  const databases = new Map<string, Set<string>>();
  for (const id of cited) {
    const s = world.source.get(id);
    if (s?.type === 'database-record' && s.license && s.container) databases.set(s.container, (databases.get(s.container) ?? new Set()).add(s.license));
  }
  return [...databases].sort(([a], [b]) => (a < b ? -1 : 1)).map(([label, licenses]) => ({ label, licenses: [...licenses].sort() }));
}

/**
 * The fonts the site serves, named by the licence files beside them (site/fonts/OFL-<Name>.txt); or, given the viewer's
 * folder, the fonts the viewer bundles, named by the licence files that go with it (viewer/public/fonts).
 */
export function siteFonts(dir = join(REPO, 'site/fonts')): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^OFL-.+\.txt$/.test(f))
    .map((f) => f.slice(4, -4).replace(/-/g, ' '))
    .sort();
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const safeMdUrl = (raw: string): string => {
  const s = oneLine(raw);
  if (!/^https?:\/\//i.test(s)) throw new Error(`unsafe attribution URL: ${JSON.stringify(raw)}`);
  return s.replace(/[\s()<>]/g, (c) => encodeURIComponent(c));
};

/** ATTRIBUTION.md: every dataset with its citation, licence and credit; the cited databases; the fonts. */
export function attributionMarkdown(world: World, fonts: string[] = siteFonts(), viewerFonts: string[] = siteFonts(join(REPO, 'viewer/public/fonts')), ground: GroundMaterials | null = groundMaterials()): string {
  const lines = [
    '# Attribution',
    '',
    '<!-- Written by `npm run world -- attribution` from world/manifest.yaml and the sources the records cite. Do not edit by hand. -->',
    '',
    "WikiWorldModel's own code is under the Apache License 2.0 ([LICENSE](LICENSE)), and its records and",
    'documentation are dedicated to the public domain under CC0 1.0 ([LICENSE-DATA](LICENSE-DATA)). It is',
    'built on the work of others, credited here. Anything that shows the world, or is made from it, credits',
    'them in the same way: the viewer does, under *Data and licences*.',
    '',
    '## Datasets',
    '',
    'The build reads these datasets, each pinned by its checksum in [world/manifest.yaml](world/manifest.yaml),',
    'under the licence given. A build may read only CC0, CC BY and public-domain data.',
    '',
  ];
  for (const [id, d] of Object.entries(world.manifest.datasets)) {
    lines.push(`### ${oneLine(d.title ?? d.credit ?? id)}`, '', oneLine(d.citation), '');
    lines.push(`- Licence: ${d.license ?? 'none stated'}${d.license_note ? `. ${oneLine(d.license_note)}` : ''}`);
    if (d.credit) lines.push(`- Credit: ${oneLine(d.credit)}`);
    if (d.doi) lines.push(`- DOI: [${oneLine(d.doi)}](${safeMdUrl(`https://doi.org/${oneLine(d.doi)}`)})`);
    if (d.url) lines.push(`- From: <${safeMdUrl(d.url)}>`);
    lines.push(`- Source id: \`${id}\``, '');
  }
  lines.push(
    '## World history atlas',
    '',
    'The atlas uses selected period definitions from the public-domain [PeriodO initial collection](https://github.com/periodo/periodo-data/blob/51fe03a205ac049b818c83bafe852bec2dc2b6e9/initial-data.json). Each entry names the work and definition it follows.',
    'Its geographic index uses simplified, grouped land outlines from [Natural Earth 1:110m Admin 0, v5.1.2](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_110m_admin_0_countries.geojson), in the public domain.',
    '',
  );
  const databases = citedDatabases(world);
  if (databases.length) {
    lines.push(
      '## Databases the records cite',
      '',
      'Records cite entries in these databases for facts, with short quotes as evidence. Nothing is imported',
      'from them as data; the quotes stay under the terms given.',
      '',
      '| Database | Licence |',
      '|---|---|',
      ...databases.map(({ label, licenses }) => `| ${label.replace(/\|/g, '\\|')} | ${licenses.join(', ')} |`),
      '',
    );
  }
  if (fonts.length || viewerFonts.length) {
    lines.push('## Fonts', '');
    if (fonts.length) {
      lines.push(
        `The site's fonts are served from [site/fonts/](site/fonts/), each under the SIL Open Font License 1.1 in the`,
        `OFL file beside it: ${fonts.join(', ')}.`,
      );
    }
    if (viewerFonts.length) {
      lines.push(
        `The viewer's come from Fontsource's packages, under the same licence, whose text goes out with the viewer from`,
        `[viewer/public/fonts/](viewer/public/fonts/): ${viewerFonts.join(', ')}.`,
      );
    }
    lines.push('');
  }
  if (ground?.layers.length) {
    lines.push(
      '## Materials',
      '',
      `The viewer draws the ground with scans of earth, sand, stones, rock, mud and snow from [${oneLine(ground.source)}](${safeMdUrl(ground.url)}),`,
      `each dedicated to the public domain under ${ground.license}, packed into [viewer/public/materials/](viewer/public/materials/)`,
      'by `tools/materials/pack.ts` from the files [tools/materials/ground.yaml](tools/materials/ground.yaml) pins. A scan gives a',
      'material its grain and says nothing of any place: which material a ground has, and its colour, are the world\'s.',
      '',
      '| Material | Scan | By |',
      '|---|---|---|',
      ...ground.layers.map((l) => `| ${l.title} | [${oneLine(l.name)}](${safeMdUrl(l.from)}) | ${l.authors.join(', ')} |`),
      '',
    );
  }
  lines.push(
    '## Code',
    '',
    'The libraries the code depends on keep their own licences, listed in `package-lock.json` and',
    '`tools/world/importers/requirements.txt`.',
    '',
  );
  return lines.join('\n');
}
