// How the places lists show, the map with the list as its panel or the
// table, kept in a cookie like the sidebar's fold (./sidebar.ts): the server
// renders the view chosen from the first byte, and an edit page leads back
// to it.
import { query } from '@solidjs/router';
import { getRequestEvent, parseCookieHeader, serializeCookie } from '@solidjs/web';

import type { PlacesView } from '~/lib/places-view';

const COOKIE = 'places-view';

/** The view the reader chose last; the map when unset. */
export const getPlacesView = query(async (): Promise<PlacesView> => {
  'use server';
  const value = parseCookieHeader(getRequestEvent()?.request.headers.get('cookie'))[COOKIE];
  return value === 'table' ? 'table' : 'map';
}, 'places-view');

/**
 * Remembers the view for later page loads, and for the other places list
 * now (the query's cached answer); call from an event handler.
 */
export function savePlacesView(view: PlacesView): void {
  document.cookie = serializeCookie(COOKIE, view, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  query.set(getPlacesView.keyFor(), view);
}
