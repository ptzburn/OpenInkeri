// The gazetteer: the settlements of Ingria and around it, as OpenStreetMap
// and Wikidata know them (scripts/import-gazetteer.ts loads them into the
// gazetteer table), for the locality form's search. A hit found there, or
// on the whole map through Nominatim, fills the form: names, coordinates,
// the nearest parish. Shared by the schema (which imports it relatively, as
// drizzle-kit loads it), the server function and the form, so it imports
// nothing but the place kinds.
import type { PlaceKind } from './place-kinds';

/** What a settlement is, as OpenStreetMap tags it (place=*); Wikidata's classes map onto these. */
export const gazetteerKinds = [
  'city',
  'town',
  'village',
  'hamlet',
  'farm',
  'isolated_dwelling',
  'neighbourhood',
  'locality',
  'allotments',
  'settlement',
] as const;
export type GazetteerKind = (typeof gazetteerKinds)[number];

/** Where a hit comes from: the gazetteer table's sources, or a live Nominatim search. */
export const gazetteerSources = ['osm', 'wikidata', 'nominatim'] as const;
export type GazetteerSource = (typeof gazetteerSources)[number];

/** A settlement the search found, with what the locality form takes from it. */
export interface GazetteerHit {
  source: GazetteerSource;
  /** "way/251708753", "Q14620709", or Nominatim's "node/123". */
  sourceId: string;
  kind: GazetteerKind;
  /** Its name where it is (Russian in Russia). */
  name: string;
  nameRu: string | null;
  nameFi: string | null;
  /** Every name it goes by, the name first: for the search and to show the spelling matched. */
  names: string[];
  latitude: number;
  longitude: number;
  /** Where it is, when the source says (Nominatim's display name); the gazetteer has the parish instead. */
  detail: string | null;
  /** The nearest parish church among ours, and how far, when one is within reach. */
  parish: { id: number; name: { ru: string; fi: string | null }; km: number } | null;
  /** A locality in the database that this is (one of its names, within a kilometre): adding it would double it. */
  existing: { id: number; name: { ru: string; fi: string | null } } | null;
  /** The nearest locality in the database, and how far, when one is within reach: where the hit is, in our terms. */
  near: { name: { ru: string; fi: string | null }; km: number } | null;
}

/** The kind of locality a settlement becomes when it is added from a hit; null leaves the form's choice. */
export function placeKindOf(kind: GazetteerKind): PlaceKind | null {
  switch (kind) {
    case 'city':
    case 'town':
      return 'town';
    case 'farm':
      return 'manor';
    case 'village':
    case 'hamlet':
    case 'isolated_dwelling':
    case 'neighbourhood':
    case 'locality':
    case 'settlement':
      return 'village';
    default:
      return null;
  }
}

/** Distance between two points on the ground, in kilometres (haversine). */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
