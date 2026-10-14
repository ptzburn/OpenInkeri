// Display formats shared by the pages.

// Day.month.year, the Finnish way (13.10.2026, 1.2.2026). The calendar day is
// taken in UTC: the server renders the page and the browser hydrates it, and
// a fixed zone makes both print the same day.
const dateFormat = new Intl.DateTimeFormat('fi', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** A date as the app shows it: 13.10.2026. */
export function formatDate(date: Date | string | number): string {
  return dateFormat.format(new Date(date));
}

/**
 * A record's date as stored (ISO 8601 cut to what the source says: '1895',
 * '1895-03', '1895-03-12') in the same style: 12.3.1895, 3.1895, 1895.
 */
export function formatPartialDate(date: string | null | undefined): string {
  if (!date) return '';
  return date
    .split('-')
    .map((part) => String(Number(part)))
    .reverse()
    .join('.');
}

/**
 * The reverse of formatPartialDate: '12.3.1895', '3.1895' or '1895' (leading
 * zeros allowed) as stored, '1895-03-12'. '' is null; anything else, or a
 * day the month doesn't have, is undefined.
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
