// Text folded for searching. SQLite's LIKE and lower() fold case only for
// ASCII, so record.search_text is stored folded and searches are folded the
// same way before they reach the database. scripts/import-baptisms.ts
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
