// The color theme the visitor picked, kept in a cookie so the server renders
// the page in it from the first byte (no flash, no inline script).
import { query } from '@solidjs/router';
import { getRequestEvent, parseCookieHeader, serializeCookie } from '@solidjs/web';

export const themes = ['light', 'dark'] as const;
export type Theme = (typeof themes)[number];

const COOKIE = 'theme';

function isTheme(value: unknown): value is Theme {
  return themes.includes(value as Theme);
}

/** The theme from the request's cookie; 'light' when unset. */
export const getTheme = query(async (): Promise<Theme> => {
  'use server';
  const value = parseCookieHeader(getRequestEvent()?.request.headers.get('cookie'))[COOKIE];
  return isTheme(value) ? value : 'light';
}, 'theme');

/** Remembers the theme for later page loads; call from an event handler. */
export function saveTheme(theme: Theme): void {
  document.cookie = serializeCookie(COOKIE, theme, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}
