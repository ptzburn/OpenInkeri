// A place's coordinates as the locality form posts them ("59.613487,
// 30.225190", set by its map or its search) and as the pages show and link
// them.

/**
 * Coordinates as posted ("59.613487, 30.225190", the form map sites copy),
 * or undefined when they don't read as a latitude and longitude. Empty is
 * null: no coordinates.
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

/** Coordinates as the form shows them, the way they are pasted. */
export const formatCoordinates = (lat: number | null, lng: number | null) =>
  lat === null || lng === null ? '' : `${lat}, ${lng}`;

/** A place on OpenStreetMap, to check its coordinates. */
export const mapLink = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`;
