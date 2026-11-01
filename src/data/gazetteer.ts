// The locality form's search: the gazetteer (the settlements of Ingria and
// around it, from OpenStreetMap and Wikidata; scripts/import-gazetteer.ts
// loads it) as the admin types, and the whole map through Nominatim when
// asked. A hit fills the form: names, coordinates, the nearest parish.
import { query } from '@solidjs/router';
import { sql } from 'drizzle-orm';

import { FIELD_MAX } from '~/lib/field-limits';
import { type GazetteerHit, type GazetteerKind, distanceKm, gazetteerKinds } from '~/lib/gazetteer';
import { CYRILLIC_NAME_PATTERN, matchesPattern } from '~/lib/name-scripts';
import { foldForSearch } from '~/lib/search-text';
import { getLocale } from '~/paraglide/runtime.js';
import { db } from '~/server/database';
import { gazetteer } from '~/server/database/schema';
import { adminOnly } from '~/server/guards';

/** How many hits a search shows. */
export const GAZETTEER_HITS = 8;

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// Nominatim's usage policy asks for a User-Agent that names the application.
const USER_AGENT = 'Open Inkeri genealogy (https://openinkeri.hokkanen.io)';

// --- The nearest parish ----------------------------------------------------------

type Located = { latitude: number; longitude: number };

/** Our parishes, where their churches stand. */
async function parishChurches() {
  const parishes = await db.query.parish.findMany({
    columns: { id: true, nameRu: true, nameFi: true },
    with: { church: { columns: { latitude: true, longitude: true } } },
  });
  return parishes.flatMap((p) =>
    p.church?.latitude !== null && p.church?.longitude !== null && p.church
      ? [
          {
            id: p.id,
            name: { ru: p.nameRu, fi: p.nameFi },
            latitude: p.church.latitude!,
            longitude: p.church.longitude!,
          },
        ]
      : [],
  );
}

/** The parish whose church is nearest the point, and how far, to a tenth of a kilometre. */
// Beyond this a settlement is outside our parishes (Ingria's are some 15 km
// apart): no parish is proposed for a hit in Finland or India.
const PARISH_REACH_KM = 40;

function nearestParish(
  at: Located,
  churches: Awaited<ReturnType<typeof parishChurches>>,
): GazetteerHit['parish'] {
  let best: GazetteerHit['parish'] = null;
  for (const church of churches) {
    const km = distanceKm(at, church);
    if (km <= PARISH_REACH_KM && (!best || km < best.km)) {
      best = { id: church.id, name: church.name, km };
    }
  }
  return best && { ...best, km: Math.round(best.km * 10) / 10 };
}

// --- The gazetteer -----------------------------------------------------------------

// SQLite's LIKE wildcards in the search, escaped with a backslash.
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The gazetteer's settlements a name of which contains the search (folded,
 * ~/lib/search-text), the ones a name starts with first; at most
 * GAZETTEER_HITS, each with the nearest parish church.
 */
export const getGazetteerHits = query(async (search: string): Promise<GazetteerHit[]> => {
  'use server';
  adminOnly();
  const key = foldForSearch(search).slice(0, FIELD_MAX.search);
  if (key.length < 2) return [];
  const contains = `%${escapeLike(key)}%`;
  // search_text is the folded names joined by ' | ': a name starts with the
  // key at the start of the text or after a separator.
  const starts = `${escapeLike(key)}%`;
  const startsLater = `% | ${escapeLike(key)}%`;
  const rows = await db
    .select({
      source: gazetteer.source,
      sourceId: gazetteer.sourceId,
      kind: gazetteer.kind,
      name: gazetteer.name,
      nameRu: gazetteer.nameRu,
      nameFi: gazetteer.nameFi,
      names: gazetteer.names,
      latitude: gazetteer.latitude,
      longitude: gazetteer.longitude,
    })
    .from(gazetteer)
    .where(sql`${gazetteer.searchText} LIKE ${contains} ESCAPE '\\'`)
    .orderBy(
      sql`CASE WHEN ${gazetteer.searchText} LIKE ${starts} ESCAPE '\\' OR ${gazetteer.searchText} LIKE ${startsLater} ESCAPE '\\' THEN 0 ELSE 1 END`,
      gazetteer.name,
    )
    .limit(GAZETTEER_HITS);
  if (!rows.length) return [];
  const churches = await parishChurches();
  return rows.map((row) => ({
    ...row,
    names: JSON.parse(row.names) as string[],
    detail: null,
    parish: nearestParish(row, churches),
  }));
}, 'gazetteer-hits');

// --- The whole map, through Nominatim ---------------------------------------------

interface NominatimResult {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  lat: string;
  lon: string;
  type: string;
  name: string;
  display_name: string;
  namedetails?: Record<string, string>;
}

// Nominatim allows one request a second for the whole application: requests
// from this Worker queue behind each other.
let nominatimTurn = Promise.resolve();
const NOMINATIM_GAP = 1100;

function nominatimSlot(): Promise<void> {
  const turn = nominatimTurn.then(() => new Promise<void>((r) => setTimeout(r, NOMINATIM_GAP)));
  nominatimTurn = turn;
  return turn;
}

// Its policy also asks for results to be cached: the Worker's cache keeps an
// answer for a day, so the same search costs Nominatim nothing. Outside the
// Worker (tests) there is no cache.
async function fetchNominatim(url: string): Promise<NominatimResult[]> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const request = new Request(url, { headers: { 'User-Agent': USER_AGENT } });
  const cached = await cache?.match(request);
  if (cached) return (await cached.json()) as NominatimResult[];
  await nominatimSlot();
  const response = await fetch(request);
  if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
  const text = await response.text();
  await cache?.put(
    request,
    new Response(text, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
    }),
  );
  return JSON.parse(text) as NominatimResult[];
}

// The names a Nominatim result goes by, its name first: name:* in the
// languages the records use, old and alternative names.
const nameTags = /^(name|old_name|alt_name|official_name|loc_name)(:(ru|fi|en|sv|et|de))?$/;

function hitOf(result: NominatimResult, churches: Awaited<ReturnType<typeof parishChurches>>) {
  const details = result.namedetails ?? {};
  const names = [
    ...new Set([
      result.name,
      ...Object.entries(details)
        .filter(([tag]) => nameTags.test(tag))
        .flatMap(([, value]) => value.split(';'))
        .map((s) => s.trim()),
    ]),
  ].filter(Boolean);
  const at = { latitude: Number(result.lat), longitude: Number(result.lon) };
  const hit: GazetteerHit = {
    source: 'nominatim',
    sourceId: `${result.osm_type}/${result.osm_id}`,
    kind: gazetteerKinds.includes(result.type as GazetteerKind)
      ? (result.type as GazetteerKind)
      : 'settlement',
    name: result.name,
    nameRu:
      details['name:ru'] ??
      (matchesPattern(CYRILLIC_NAME_PATTERN, result.name) ? result.name : null),
    nameFi: details['name:fi'] ?? null,
    names,
    ...at,
    detail: result.display_name,
    parish: nearestParish(at, churches),
  };
  return hit;
}

/**
 * Settlements anywhere on OpenStreetMap named like the search, through
 * Nominatim, for a locality the gazetteer doesn't have (outside Ingria, or
 * not in it yet). Asked for with a button, never as the admin types:
 * Nominatim's policy forbids that. At most GAZETTEER_HITS.
 */
export const getMapHits = query(async (search: string): Promise<GazetteerHit[]> => {
  'use server';
  adminOnly();
  const q = search.replace(/\s+/g, ' ').trim().slice(0, FIELD_MAX.search);
  if (q.length < 2) return [];
  const url = new URL(NOMINATIM);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('namedetails', '1');
  url.searchParams.set('featureType', 'settlement');
  url.searchParams.set('limit', String(GAZETTEER_HITS));
  // Where a hit is, in the reader's language first.
  url.searchParams.set('accept-language', [...new Set([getLocale(), 'ru', 'fi', 'en'])].join(','));
  const [results, churches] = await Promise.all([fetchNominatim(url.href), parishChurches()]);
  return results.filter((r) => r.name).map((r) => hitOf(r, churches));
}, 'map-hits');
