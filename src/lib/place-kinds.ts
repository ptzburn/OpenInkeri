// The fixed options of a place: shared by the database schema (place.kind,
// place.coordinate_status) and the villages pages, which must not import the
// schema itself. The schema imports this file relatively, as drizzle-kit
// loads it.
export const placeKinds = ['village', 'manor', 'church', 'town', 'region', 'other'] as const;
export const coordinateStatuses = ['verified', 'approximate', 'unknown'] as const;

export type PlaceKind = (typeof placeKinds)[number];
export type CoordinateStatus = (typeof coordinateStatuses)[number];
