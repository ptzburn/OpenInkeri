// What the register imports share: reading the spreadsheets' CSV, reading
// their dates and names, and writing SQL for Wrangler to apply. The scripts
// run in Node outside the app's module resolution, so nothing here imports
// from src/.
import { readFileSync } from 'node:fs';

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

const MAIDEN_RU = new Set(['ур.', 'ур', 'у.', 'рожд.', 'урожд.']);
const MAIDEN_FI = new Set(['o.s.', 'os.', 'geb.', 'ur.', 'sünd.']);
const PATRONYMIC_RU_MALE = /(ов|ев|ёв|ин|ович|евич|ич|\u00a0сын)$/;
const PATRONYMIC_RU_FEMALE = /(ова|ева|ёва|ина|овна|евна|ична|инична|\u00a0дочь)$/;
const PATRONYMIC_FI = /.(p\.|t\.|s\.|S\.|T\.|poika|tytär|sohn)$/;
// Swedish: Matson, Erson, Persdotter, abbreviated s:on, d:r.
const PATRONYMIC_SV = /.(son|s:on|dotter|d:r)$/;
const PARTICLES = new Set(['фон', 'де', 'ван', 'von', 'de', 'van']);

export type NameParts = {
  name: string | null;
  given: string | null;
  patronymic: string | null;
  surname: string | null;
  maiden: string | null;
  note: string | null;
};

const join = (tokens: string[]) =>
  tokens.length ? tokens.join(' ').replaceAll('\u00a0', ' ') : null;

export function splitName(
  cell: string,
  language: 'ru' | 'fi' | 'sv',
  sex: 'male' | 'female',
): NameParts | null {
  let text = value(cell);
  if (!text) return null;
  // Parenthesised remarks are kept as the persona's note: "Ян Блом (названый отец)".
  const remarks = [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  text = clean(text.replace(/\([^)]*\)/g, ' '));
  const note = remarks.length ? remarks.join('; ') : null;
  const whole = { name: text, given: null, patronymic: null, surname: null, maiden: null, note };
  if (!text) return null;

  // Two-word patronymics ("Andruksen p.", "Иона дочь") become one token,
  // joined by a no-break space until the parts are returned.
  if (language !== 'ru') {
    text = text
      .replace(/(^|\s)o\. s\./g, '$1o.s.')
      .replace(/(\S) (p\.|t\.|poika|tytär)(?= |$)/g, '$1\u00a0$2');
  } else text = text.replace(/(\S) (дочь|сын)(?= |$)/g, '$1\u00a0$2');
  const tokens = text.split(' ');
  const markers = language === 'ru' ? MAIDEN_RU : MAIDEN_FI;

  // Not a name ("Родители найденной девочки неизвестны", "См список …"):
  // keep the text, split nothing.
  const lowercase = tokens.some(
    (t) => /^\p{Ll}/u.test(t) && !markers.has(t) && !PARTICLES.has(t) && !/^[дd]'\p{Lu}/u.test(t),
  );
  if (lowercase || /^См(?!\p{L})/u.test(text)) {
    warn('names not split', text);
    return whole;
  }

  const markerAt = tokens.findIndex((t) => markers.has(t));
  const maiden = markerAt >= 0 ? join(tokens.slice(markerAt + 1)) : null;
  const rest = markerAt >= 0 ? tokens.slice(0, markerAt) : tokens;
  if (rest.length === 0) return { ...whole, maiden };
  if (rest.length === 1) return { ...whole, given: join(rest), maiden };

  const isPatronymic = (t: string) =>
    language === 'fi'
      ? PATRONYMIC_FI.test(t)
      : language === 'sv'
        ? PATRONYMIC_SV.test(t)
        : (sex === 'male' ? PATRONYMIC_RU_MALE : PATRONYMIC_RU_FEMALE).test(t);

  // A man's name of two words is a given name and a surname ("Карл Илвес").
  // Otherwise the patronymic sits after the given names and before the
  // surname; a woman named with a maiden name may have no surname after it.
  const lastCandidate = sex === 'female' || markerAt >= 0 ? rest.length - 1 : rest.length - 2;
  let patronymicAt = -1;
  if (!(sex === 'male' && rest.length === 2 && language === 'ru')) {
    for (let i = lastCandidate; i >= 1; i--) {
      if (isPatronymic(rest[i])) {
        patronymicAt = i;
        break;
      }
    }
  }
  if (patronymicAt >= 0) {
    return {
      ...whole,
      given: join(rest.slice(0, patronymicAt)),
      patronymic: join([rest[patronymicAt]]),
      surname: join(rest.slice(patronymicAt + 1)),
      maiden,
    };
  }
  // No patronymic: trailing given names belong to the given name.
  let end = rest.length - 1;
  if (sex === 'female' && givenNames.has(rest[end]) && markerAt < 0) end = rest.length;
  let surnameStart = end;
  while (surnameStart > 1 && PARTICLES.has(rest[surnameStart - 1])) surnameStart--;
  return {
    ...whole,
    given: join(rest.slice(0, surnameStart)),
    surname: join(rest.slice(surnameStart)),
    maiden,
  };
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
