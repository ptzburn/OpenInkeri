// Display formats shared by the pages.
import { m } from '~/paraglide/messages.js';
import { getLocale } from '~/paraglide/runtime.js';

// Day.month.year with two digits each (13.10.2026, 01.02.2026), as Finnish
// prints it. The calendar day is taken in UTC: the server renders the page
// and the browser hydrates it, and a fixed zone makes both print the same day.
const dateFormat = new Intl.DateTimeFormat('fi', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

/** A date as the app shows it: 13.10.2026, 01.02.2026. */
export function formatDate(date: Date | string | number): string {
  return dateFormat.format(new Date(date));
}

/**
 * A record's date as stored (ISO 8601 cut to what the source says: '1895',
 * '1895-03', '1895-03-02') in the same style: 02.03.1895, 03.1895, 1895.
 */
export function formatPartialDate(date: string | null | undefined): string {
  if (!date) return '';
  return date.split('-').reverse().join('.');
}

/** A person's life years as known: 02.03.1895–1960, 1895–, –1960; '' when neither is. */
export function lifespan(born: string | null, died: string | null): string {
  return born || died ? `${formatPartialDate(born)}–${formatPartialDate(died)}` : '';
}

/**
 * The reverse of formatPartialDate: '02.03.1895', '03.1895' or '1895' (the
 * zeros optional: '2.3.1895') as stored, '1895-03-02'. '' is null; anything
 * else, or a day the month doesn't have, is undefined.
 */
export function parsePartialDate(text: string): string | null | undefined {
  const value = text.trim();
  if (!value) return null;
  const match = /^(?:(?:(\d{1,2})\.)?(\d{1,2})\.)?(\d{4})$/.exec(value);
  if (!match) return undefined;
  const [, day, month, year] = match;
  if (!month) return year;
  const m = Number(month);
  if (m < 1 || m > 12) return undefined;
  const ym = `${year}-${String(m).padStart(2, '0')}`;
  if (!day) return ym;
  const d = Number(day);
  const days = new Date(Date.UTC(Number(year), m, 0)).getUTCDate();
  return d >= 1 && d <= days ? `${ym}-${String(d).padStart(2, '0')}` : undefined;
}

/** The input pattern for partial dates (HTML pattern attribute). */
export const PARTIAL_DATE_PATTERN = String.raw`(\d{1,2}\.)?(\d{1,2}\.)?\d{4}`;

// The browser and system a user agent names, in the order to test them:
// Edge and Opera also say Chrome, Chrome also says Safari, and Android also
// says Linux.
const browsers: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];
const systems: [RegExp, string][] = [
  [/Windows/, 'Windows'],
  [/iPhone|iPad/, 'iOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/**
 * A short name for the device a session signed in from, such as
 * "Firefox, macOS", or undefined when the user agent names neither.
 */
export function describeUserAgent(userAgent: string | null | undefined): string | undefined {
  if (!userAgent) return undefined;
  const find = (list: [RegExp, string][]) => list.find(([test]) => test.test(userAgent))?.[1];
  const parts = [find(browsers), find(systems)].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

/**
 * A name in the reader's language: the Finnish form for en and fi when there
 * is one, the Russian otherwise (and the Finnish when there is no Russian).
 */
export function localName(names: { ru: string | null; fi: string | null } | null): string {
  if (!names) return '';
  const ru = getLocale() === 'ru';
  return (ru ? (names.ru ?? names.fi) : (names.fi ?? names.ru)) ?? '';
}

/** A row's names in both languages, as the option lists carry them. */
export type Names = { ru: string; fi: string | null };

/**
 * A locality as a form's choice: its name in the reader's language, with
 * its parish's when that isn't the same name ("Горки (Губаницы)").
 */
export function placeLabel(place: { name: Names; parish: Names | null }): string {
  const name = localName(place.name);
  const parish = place.parish ? localName(place.parish) : null;
  return parish && parish !== name ? `${name} (${parish})` : name;
}

/** A term (a vocabulary's value) in the reader's language, or in Russian when it has no translation. */
export function localTerm(
  term: { ru: string; fi: string | null; en: string | null } | null,
): string {
  if (!term) return '';
  const locale = getLocale();
  return (locale === 'fi' ? term.fi : locale === 'en' ? term.en : null) ?? term.ru;
}

/**
 * Whether the lists show a Finnish-name column: not in Russian, where the
 * Russian name is all the reader needs. The locale only changes with a page
 * reload, so this needs no tracking.
 */
export function finnishNamesShown(): boolean {
  return getLocale() !== 'ru';
}

/** Counts as one phrase ("3 villages and 1 source"), skipping the absent ones; undefined if none. */
function listUses(parts: (string | undefined)[]): string | undefined {
  const present = parts.filter((part) => part !== undefined);
  if (!present.length) return undefined;
  return new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(present);
}

/**
 * Why a parish can't be deleted yet, naming only what still belongs to it
 * ("3 villages and 1 source"), or undefined when nothing does. The parish
 * edit page shows it up front; deleteParish refuses with the same words.
 */
export function parishInUse(uses: { villages: number; sources: number }): string | undefined {
  const list = listUses([
    uses.villages ? m.parish_delete_villages({ count: uses.villages }) : undefined,
    uses.sources ? m.parish_delete_sources({ count: uses.sources }) : undefined,
  ]);
  return list && m.parish_delete_in_use({ uses: list });
}

/** The same for a locality: the records, birthplaces and parish churches still linked to it. */
export function placeInUse(uses: {
  records: number;
  birthplaces: number;
  churches: number;
}): string | undefined {
  const list = listUses([
    uses.records ? m.place_delete_records({ count: uses.records }) : undefined,
    uses.birthplaces ? m.place_delete_birthplaces({ count: uses.birthplaces }) : undefined,
    uses.churches ? m.place_delete_churches({ count: uses.churches }) : undefined,
  ]);
  return list && m.place_delete_in_use({ uses: list });
}
