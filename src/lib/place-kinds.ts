// The fixed options of a place: shared by the database schema (place.kind,
// place.coordinate_status) and the villages pages, which must not import the
// schema itself. The schema imports this file relatively, as drizzle-kit
// loads it.
export const placeKinds = ['village', 'manor', 'church', 'town', 'region', 'other'] as const;
export const coordinateStatuses = ['verified', 'approximate', 'unknown'] as const;

export type PlaceKind = (typeof placeKinds)[number];
export type CoordinateStatus = (typeof coordinateStatuses)[number];

/**
 * Coordinates as typed or pasted ("59.613487, 30.225190", the form map
 * sites copy), or undefined when they don't read as a latitude and
 * longitude. Empty is null: no coordinates.
 */
export function parseCoordinates(text: string): { lat: number; lng: number } | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = /^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(trimmed);
  if (!match) return undefined;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { lat, lng };
}

/** The HTML pattern for coordinates; the server reads them with parseCoordinates. */
export const COORDINATES_PATTERN = String.raw`\s*-?\d{1,2}(\.\d+)?\s*[,;\s]\s*-?\d{1,3}(\.\d+)?\s*`;

/** Coordinates as the form shows them, the way they are pasted. */
export const formatCoordinates = (lat: number | null, lng: number | null) =>
  lat === null || lng === null ? '' : `${lat}, ${lng}`;

/** A place on OpenStreetMap, to check its coordinates. */
export const mapLink = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`;
