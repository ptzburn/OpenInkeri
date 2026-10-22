// What the register imports share: reading the spreadsheets' CSV, reading
// their dates and names, and writing SQL for Wrangler to apply. The scripts
// run in Node outside the app's module resolution, so they import from src/
// only by relative path, and only modules that import nothing themselves
// (src/lib/name-split.ts).
import { readFileSync } from 'node:fs';

import {
  type NameLanguage,
  type NameParts as SplitParts,
  splitName as split,
} from '../src/lib/name-split.ts';

// --- CSV --------------------------------------------------------------------------

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

export const readCsv = (path: string) => parseCsv(readFileSync(path, 'utf8').replace(/^﻿/, ''));

// --- Helpers ----------------------------------------------------------------------

// Spellings are compared and stored with whitespace collapsed: the sheets put
// line breaks inside cells ("Горки\n(Молосковицы)").
export const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// A cell that says nothing: empty, a dash, or "lost".
export const blank = (s: string | undefined) => {
  const v = clean(s ?? '');
  return v === '' || v === '-' || v === '—' || v.toLowerCase() === 'утрачено';
};
export const value = (s: string | undefined) => (blank(s) ? null : clean(s!));

const pad = (n: number) => String(n).padStart(2, '0');

export function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day > days ? null : `${year}-${pad(month)}-${pad(day)}`;
}

// "2.1", "02.01", "23,6", "1.1 (1894)", "08.02 утв 15.03" → day, month and
// the year when the cell states one.
export function dayMonth(cell: string): { day: number; month: number; year?: number } | null {
  const m = clean(cell).match(/^(\d{1,2})[.,](\d{1,2})(?:[.,](\d{4}))?\s*(?:\((\d{4})\))?/);
  if (!m) return null;
  const year = m[3] ?? m[4];
  return { day: Number(m[1]), month: Number(m[2]), ...(year && { year: Number(year) }) };
}

export type SqlValue = string | number | boolean | null | undefined;
export type Row = Record<string, SqlValue>;

export const sqlValue = (v: SqlValue): string =>
  v === null || v === undefined
    ? 'NULL'
    : typeof v === 'number'
      ? String(v)
      : typeof v === 'boolean'
        ? v
          ? '1'
          : '0'
        : `'${String(v).replaceAll("'", "''")}'`;

// Multi-row INSERTs, kept well under D1's 100 KB statement limit.
export function inserts(table: string, rows: Row[]): string[] {
  if (rows.length === 0) return [];
  const columns = Object.keys(rows[0]);
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += 50) {
    const values = rows
      .slice(i, i + 50)
      .map((r) => `(${columns.map((c) => sqlValue(r[c])).join(', ')})`)
      .join(',\n  ');
    out.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES\n  ${values};`);
  }
  return out;
}

export const warnings = new Map<string, Set<string>>();
export const warn = (kind: string, text: string) => {
  if (!warnings.has(kind)) warnings.set(kind, new Set());
  warnings.get(kind)!.add(text);
};

// --- Names ------------------------------------------------------------------------

// Given names seen in the register, so "Катерина Луиза" reads as two given
// names rather than a given name and a surname.
export const givenNames = new Set<string>();

// The imports also build parts by hand, for a cell that holds no name.
export type NameParts = Omit<SplitParts, 'split' | 'name'> & { name: string | null };

// A name cell split as the record form splits names (src/lib/name-split.ts),
// with the given names seen in the registers; a cell that doesn't read as a
// name is kept whole, with a warning.
export function splitName(
  cell: string,
  language: NameLanguage,
  sex: 'male' | 'female',
): NameParts | null {
  const text = value(cell);
  const parts = text ? split(text, language, sex, (word) => givenNames.has(word)) : null;
  if (!parts) return null;
  const { split: read, ...rest } = parts;
  if (!read) warn('names not split', rest.name);
  return rest;
}

// Russian given names ending in -а/-я that are men's.
const MALE_IN_A = new Set([
  'Иона',
  'Илья',
  'Никита',
  'Фома',
  'Лука',
  'Кузьма',
  'Савва',
  'Сава',
  'Ионас',
]);

export function sexOfChild(name: string | null, note: string): 'male' | 'female' | null {
  const text = `${name ?? ''} ${note}`.toLowerCase();
  if (/(?<!\p{L})(сын|мальчик|умер)(?!\p{L})|мертворожденный|незаконнорожденный/u.test(text))
    return 'male';
  if (/(?<!\p{L})(дочь|девочка|умерла)(?!\p{L})|мертворожденная|незаконнорожденная/u.test(text))
    return 'female';
  const first = name?.split(/[\s-]/)[0];
  if (!first) return null;
  if (MALE_IN_A.has(first)) return 'male';
  return /[ая]$/.test(first) ? 'female' : 'male';
}

// record.search_text, folded as foldForSearch/recordSearchText in
// src/lib/search-text.ts do it (keep them in step).
export const fold = (text: string) =>
  text.toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
export const searchText = (parts: (string | null | undefined)[]) =>
  parts
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .map(fold)
    .join(' | ') || null;

/** The warnings, one line per kind, the first dozen of each. */
export const warningLines = () =>
  [...warnings].map(
    ([kind, items]) =>
      `${kind} (${items.size}): ${[...items].slice(0, 12).join(' | ')}${items.size > 12 ? ' …' : ''}`,
  );
