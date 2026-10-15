// Text folded for searching. SQLite's LIKE and lower() fold case only for
// ASCII, so record.search_text is stored folded and searches are folded the
// same way before they reach the database. scripts/import-common.ts
// repeats this (it runs outside the app's module resolution); keep the two
// in step.

/** Lowercase, ё as е, whitespace collapsed. */
export function foldForSearch(text: string): string {
  return text.toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
}

/** The search_text of a record: its names and places, folded and joined. */
export function recordSearchText(parts: (string | null | undefined)[]): string {
  return parts
    .filter((part): part is string => !!part)
    .map(foldForSearch)
    .join(' | ');
}

/** What a record's search_text is made of. */
export interface SearchedRecord {
  /** The record's place, as written and the name of the place it was resolved to. */
  placeText: string | null;
  placeName?: string | null;
  /** Its people's names, and where they lived, as written and as resolved. */
  people: {
    nameRu: string | null;
    nameFi: string | null;
    residenceText?: string | null;
    residenceName?: string | null;
  }[];
}

/** A record's search_text: every name in it, and its places. Null when there are none. */
export function searchTextOf(r: SearchedRecord): string | null {
  return (
    recordSearchText([
      r.placeText,
      r.placeName,
      ...r.people.flatMap((p) => [p.nameRu, p.nameFi, p.residenceText, p.residenceName]),
    ]) || null
  );
}
