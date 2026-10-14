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
