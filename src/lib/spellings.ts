import { foldForSearch } from '~/lib/search-text';

// Linking a value as a source writes it ("Нисковицы", "Сын") to the row it
// names (a place, a relation term, a clergyman), by that row's names and
// spellings. The record form links while the admin types; saveRecord links
// what was posted without a link (before JavaScript loads), by the same rule.

/** Rows by their spellings, folded (case, ё = е, spaces). */
export type SpellingIndex = Map<string, number[]>;

export function spellingIndex(rows: { id: number; spellings: string[] }[]): SpellingIndex {
  const index: SpellingIndex = new Map();
  for (const row of rows) {
    for (const spelling of row.spellings) {
      const key = foldForSearch(spelling);
      const ids = index.get(key) ?? [];
      if (!ids.includes(row.id)) ids.push(row.id);
      index.set(key, ids);
    }
  }
  return index;
}

/** The rows a value as written names: none, one, or several to choose from. */
export function rowsSpelled(index: SpellingIndex, text: string | null | undefined): number[] {
  const key = text ? foldForSearch(text) : '';
  return key ? (index.get(key) ?? []) : [];
}

/** A row's spellings from its names (and aliases): the ones there are, each once, in the order given. */
export const spellingsOf = (...values: (string | null | undefined)[]): string[] => [
  ...new Set(values.filter((s): s is string => !!s)),
];
