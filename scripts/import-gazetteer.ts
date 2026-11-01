// Import of the gazetteer: the settlements of Ingria and around it, from
// OpenStreetMap (every place=* in Leningrad Oblast and Saint Petersburg,
// through Overpass) and Wikidata (every settlement with coordinates in the
// same box, with its Russian, Finnish, Swedish and English labels), for the
// locality form's search (src/data/gazetteer.ts, ~/lib/gazetteer). A
// Wikidata item that names an OpenStreetMap place next to it adds its names
// to that place; the rest become rows of their own.
//
//   node scripts/import-gazetteer.ts --out gazetteer.sql
//   node scripts/import-gazetteer.ts --osm osm.json --wikidata wikidata.json --out gazetteer.sql
//   node scripts/import-gazetteer.ts --no-osm --out gazetteer.sql
//   pnpm exec wrangler d1 execute DB --local --file gazetteer.sql
//
// --osm and --wikidata read answers saved from the services (the JSON that
// Overpass and the SPARQL endpoint return) instead of asking them; --no-osm
// leaves OpenStreetMap out where Overpass can't be reached, and --overpass
// asks another Overpass server (overpass.openstreetmap.fr, say) where the
// main one can't be. The SQL replaces
// the whole table: nothing references its rows (a locality added from one
// copies its values), so apply it whenever the sources have moved on, to the
// local database first, then with --remote.
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { type GazetteerKind, distanceKm, gazetteerKinds } from '../src/lib/gazetteer.ts';
import { foldForSearch } from '../src/lib/search-text.ts';
import { type Row, inserts } from './import-common.ts';

const USER_AGENT = 'Open Inkeri genealogy import (https://openinkeri.hokkanen.io)';

// The box around Ingria, Leningrad Oblast and Saint Petersburg with the
// edges of Finland, Estonia and the Novgorod land, asked of both services
// (a box, not Overpass areas: not every Overpass server keeps those).
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const BOX = { south: 58.4, west: 27.7, north: 61.4, east: 35.7 };
const SPARQL = 'https://query.wikidata.org/sparql';

// A Wikidata item names a place when a name of each folds the same and they
// stand within this distance (Wikidata's coordinates are often rounded).
const SAME_PLACE_KM = 3;

// --- Arguments ----------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    out: { type: 'string' },
    osm: { type: 'string' },
    wikidata: { type: 'string' },
    'no-osm': { type: 'boolean', default: false },
    overpass: { type: 'string', default: OVERPASS },
  },
});
if (!args.out) {
  console.error(
    'Usage: node scripts/import-gazetteer.ts --out gazetteer.sql [--osm file] [--wikidata file] [--no-osm]',
  );
  process.exit(2);
}

// --- Entries ------------------------------------------------------------------------

interface Entry {
  source: 'osm' | 'wikidata';
  sourceId: string;
  kind: GazetteerKind;
  name: string;
  nameRu: string | null;
  nameFi: string | null;
  names: string[];
  latitude: number;
  longitude: number;
}

const cyrillic = (s: string) => /\p{Script=Cyrillic}/u.test(s);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// Distinct names, the first kept first; OpenStreetMap separates several with ';'.
function names(...values: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    for (const part of (value ?? '').split(';')) {
      const name = clean(part);
      if (name && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

// --- OpenStreetMap ------------------------------------------------------------------

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

// Allotments (садоводства, by the thousand) are no settlement a record names.
const SKIPPED: readonly GazetteerKind[] = ['settlement', 'allotments'];
const PLACES = gazetteerKinds.filter((k) => !SKIPPED.includes(k)).join('|');
const overpassQuery = `[out:json][timeout:600][bbox:${BOX.south},${BOX.west},${BOX.north},${BOX.east}];nwr["place"~"^(${PLACES})$"];out center tags;`;

async function fetchOsm(): Promise<OsmElement[]> {
  console.error(
    `Asking ${args.overpass} for the places of Leningrad Oblast and Saint Petersburg...`,
  );
  const response = await fetch(args.overpass!, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(overpassQuery)}`,
  });
  if (!response.ok) throw new Error(`Overpass answered ${response.status}`);
  return ((await response.json()) as { elements: OsmElement[] }).elements;
}

const osmNameTags = [
  'name',
  'name:ru',
  'name:fi',
  'name:en',
  'name:sv',
  'name:et',
  'name:de',
  'official_name',
  'old_name',
  'old_name:ru',
  'old_name:fi',
  'old_name:sv',
  'alt_name',
  'alt_name:ru',
  'alt_name:fi',
  'loc_name',
];

function osmEntries(elements: OsmElement[]): Entry[] {
  const entries: Entry[] = [];
  for (const element of elements) {
    const tags = element.tags ?? {};
    const name = clean(tags.name ?? tags['name:ru'] ?? tags['name:fi'] ?? '');
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (!name || lat === undefined || lon === undefined) continue;
    if (SKIPPED.includes(tags.place as GazetteerKind)) continue;
    entries.push({
      source: 'osm',
      sourceId: `${element.type}/${element.id}`,
      kind: gazetteerKinds.includes(tags.place as GazetteerKind)
        ? (tags.place as GazetteerKind)
        : 'settlement',
      name,
      nameRu: clean(tags['name:ru'] ?? '') || (cyrillic(name) ? name : null),
      nameFi: clean(tags['name:fi'] ?? '') || null,
      names: names(name, ...osmNameTags.map((tag) => tags[tag])),
      latitude: lat,
      longitude: lon,
    });
  }
  return entries;
}

// --- Wikidata -----------------------------------------------------------------------

// What a settlement is on Wikidata (instance of), as the gazetteer's kinds.
const WIKIDATA_KINDS: Record<string, GazetteerKind> = {
  Q532: 'village', // village
  Q5084: 'village', // hamlet: Russian деревня, a village by any other name
  Q350895: 'locality', // abandoned village
  Q3257686: 'locality', // locality
  Q2514025: 'settlement', // posyolok
  Q15078955: 'town', // urban-type settlement in Russia
  Q2989457: 'town', // urban-type settlement
  Q7930989: 'town', // city or town
  Q3957: 'town', // town
  Q4946461: 'town', // spa town
  Q515: 'city', // city
  Q1549591: 'city', // big city
  Q123705: 'neighbourhood', // neighbourhood
  Q486972: 'settlement', // human settlement
};

const sparqlQuery = `
SELECT ?item (SAMPLE(?type) AS ?type) (SAMPLE(?coord) AS ?coord)
  (SAMPLE(?ru) AS ?ru) (SAMPLE(?fi) AS ?fi) (SAMPLE(?sv) AS ?sv) (SAMPLE(?en) AS ?en)
  (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts)
WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(${BOX.west} ${BOX.south})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(${BOX.east} ${BOX.north})"^^geo:wktLiteral .
  }
  ?item wdt:P31 ?type .
  VALUES ?type { ${Object.keys(WIKIDATA_KINDS)
    .map((q) => `wd:${q}`)
    .join(' ')} }
  OPTIONAL { ?item rdfs:label ?ru FILTER(LANG(?ru) = "ru") }
  OPTIONAL { ?item rdfs:label ?fi FILTER(LANG(?fi) = "fi") }
  OPTIONAL { ?item rdfs:label ?sv FILTER(LANG(?sv) = "sv") }
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item skos:altLabel ?alt FILTER(LANG(?alt) IN ("ru", "fi", "sv")) }
}
GROUP BY ?item`;

interface SparqlResults {
  results: { bindings: Record<string, { value: string } | undefined>[] };
}

async function fetchWikidata(): Promise<SparqlResults> {
  console.error('Asking Wikidata for the settlements of the box...');
  const url = `${SPARQL}?query=${encodeURIComponent(sparqlQuery)}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
  });
  if (!response.ok) throw new Error(`Wikidata answered ${response.status}`);
  return (await response.json()) as SparqlResults;
}

function wikidataEntries(results: SparqlResults): Entry[] {
  const entries: Entry[] = [];
  for (const b of results.results.bindings) {
    const id = b.item?.value.split('/').pop();
    const point = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value ?? '');
    const ru = clean(b.ru?.value ?? '') || null;
    const fi = clean(b.fi?.value ?? '') || null;
    const name = ru ?? fi ?? clean(b.en?.value ?? b.sv?.value ?? '');
    if (!id || !point || !name) continue;
    entries.push({
      source: 'wikidata',
      sourceId: id,
      kind: WIKIDATA_KINDS[b.type?.value.split('/').pop() ?? ''] ?? 'settlement',
      name,
      nameRu: ru,
      nameFi: fi,
      names: names(name, ru, fi, b.sv?.value, b.en?.value, ...(b.alts?.value ?? '').split('|')),
      longitude: Number(point[1]),
      latitude: Number(point[2]),
    });
  }
  return entries;
}

// --- Merging ------------------------------------------------------------------------

// Wikidata items that name an OpenStreetMap place next to them add their
// names to it (the Finnish name above all: OpenStreetMap often lacks it);
// the others are entries of their own.
function merge(osm: Entry[], wikidata: Entry[]): { entries: Entry[]; merged: number } {
  const byName = new Map<string, Entry[]>();
  for (const entry of osm) {
    for (const name of entry.names) {
      const key = foldForSearch(name);
      byName.set(key, [...(byName.get(key) ?? []), entry]);
    }
  }
  const entries = [...osm];
  let merged = 0;
  for (const item of wikidata) {
    const near = item.names
      .flatMap((name) => byName.get(foldForSearch(name)) ?? [])
      .filter((entry) => distanceKm(entry, item) <= SAME_PLACE_KM)
      .sort((a, b) => distanceKm(a, item) - distanceKm(b, item));
    const match = near[0];
    if (match) {
      match.nameFi ??= item.nameFi;
      match.nameRu ??= item.nameRu;
      match.names = names(...match.names, ...item.names);
      merged++;
    } else entries.push(item);
  }
  return { entries, merged };
}

// --- SQL ----------------------------------------------------------------------------

function rowOf(entry: Entry): Row {
  return {
    source: entry.source,
    source_id: entry.sourceId,
    kind: entry.kind,
    name: entry.name,
    name_ru: entry.nameRu,
    name_fi: entry.nameFi,
    names: JSON.stringify(entry.names),
    search_text: entry.names.map(foldForSearch).join(' | '),
    latitude: entry.latitude,
    longitude: entry.longitude,
  };
}

const readJson = <T>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T;

const osm = args['no-osm']
  ? []
  : osmEntries(
      args.osm ? readJson<{ elements: OsmElement[] }>(args.osm).elements : await fetchOsm(),
    );
const wikidata = wikidataEntries(
  args.wikidata ? readJson<SparqlResults>(args.wikidata) : await fetchWikidata(),
);
const { entries, merged } = merge(osm, wikidata);

const statements = [
  '-- The gazetteer, replaced whole (scripts/import-gazetteer.ts).',
  'DELETE FROM gazetteer;',
  ...inserts('gazetteer', entries.map(rowOf)),
];
writeFileSync(args.out, statements.join('\n') + '\n');

const withFi = entries.filter((e) => e.nameFi).length;
console.error(
  `${entries.length} settlements (${osm.length} from OpenStreetMap, ${wikidata.length} from Wikidata, ${merged} of them merged into OpenStreetMap places), ${withFi} with a Finnish name → ${args.out}`,
);
