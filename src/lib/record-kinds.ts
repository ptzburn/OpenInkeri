// The kinds of source, and so of record: shared by the database schema
// (source.kind) and the records page, which must not import the schema
// itself. The schema imports this file relatively, as drizzle-kit loads it.
export const recordKinds = ['baptisms', 'marriages', 'deaths', 'households', 'taxpayers'] as const;

export type RecordKind = (typeof recordKinds)[number];

export const isRecordKind = (value: unknown): value is RecordKind =>
  recordKinds.includes(value as RecordKind);
