// Whether the sidebar is folded to its icons (from lg up), kept in a cookie
// so the server renders it folded from the first byte, like the theme
// (./theme.ts). Below lg the sidebar is a drawer over the page and the
// choice doesn't apply.
import { query } from '@solidjs/router';
import { getRequestEvent, parseCookieHeader, serializeCookie } from '@solidjs/web';

const COOKIE = 'sidebar';

/** Whether the visitor folded the sidebar; unfolded when unset. */
export const getSidebarCollapsed = query(async (): Promise<boolean> => {
  'use server';
  const value = parseCookieHeader(getRequestEvent()?.request.headers.get('cookie'))[COOKIE];
  return value === 'collapsed';
}, 'sidebar-collapsed');

/** Remembers the fold for later page loads; call from an event handler. */
export function saveSidebarCollapsed(collapsed: boolean): void {
  document.cookie = serializeCookie(COOKIE, collapsed ? 'collapsed' : 'expanded', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}
