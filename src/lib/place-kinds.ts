// The fixed options of a place: shared by the database schema (place.kind,
// place.coordinate_status) and the villages pages, which must not import the
// schema itself. The schema imports this file relatively, as drizzle-kit
// loads it.
// What a locality is: where people lived, as the records name it. A
// baptism's church or chapel is the record's location instead (see
// baptismLocations in ./record-kinds.ts).
export const placeKinds = ['village', 'manor', 'town', 'other'] as const;
export const coordinateStatuses = ['verified', 'approximate', 'unknown'] as const;

export type PlaceKind = (typeof placeKinds)[number];
export type CoordinateStatus = (typeof coordinateStatuses)[number];
