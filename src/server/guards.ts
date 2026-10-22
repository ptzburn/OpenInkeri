// Session checks for server functions. Every server function is a public
// URL anyone can call, so each one checks the session itself; route guards
// only decide what renders. The checks redirect, so a page's read doubles as
// its guard: signed-out visitors go to sign-in, signed-in non-admins home.
import 'server-only';
import { getRequestEvent, redirect } from '@solidjs/web';

import { paths } from '~/router';
import { isAdmin } from '~/server/auth';

/** The signed-in user (set on the request by src/middleware.ts), or a redirect to sign-in. */
export function signedIn() {
  const user = getRequestEvent()?.locals.user;
  if (!user) throw redirect(paths['sign-in']());
  return user;
}

/** The signed-in admin, or a redirect: to sign-in when signed out, else home. */
export function adminOnly() {
  const user = signedIn();
  if (!isAdmin(user)) throw redirect(paths());
  return user;
}
