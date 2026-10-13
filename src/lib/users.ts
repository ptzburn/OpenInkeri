// The users pages' data: server functions ('use server') the UI calls
// directly. On the server they are plain function calls; in the browser the
// compiler turns each into a typed fetch against the /_server endpoint.
// query() caches reads per key; action() marks writes, and the router
// revalidates queries after an action settles.
//
// Every function checks the session itself: the route guard decides what
// renders, but these are public URLs anyone can call. Listing and reading
// users is for admins; renaming yourself only needs a session.
import { action, query } from '@solidjs/router';
import { getRequestEvent, redirect, respond } from '@solidjs/web';

import { paths } from '~/router';
import { auth, forwardCookies, isAdmin, requestHeaders } from '~/server/auth';
import { db } from '~/server/database';

function signedIn() {
  const user = getRequestEvent()?.locals.user;
  if (!user) throw redirect(paths['sign-in']());
  return user;
}

function adminOnly() {
  const user = signedIn();
  if (!isAdmin(user)) throw respond({ message: 'Admins only.' }, { status: 403 });
  return user;
}

export const getUsers = query(async () => {
  'use server';
  adminOnly();
  return db.query.user.findMany({
    columns: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
}, 'users');

export const getUser = query(async (id: string) => {
  'use server';
  adminOnly();
  const user = await db.query.user.findFirst({
    columns: { id: true, name: true, createdAt: true },
    where: { id },
  });
  return user ?? null;
}, 'user');

/** Renames the signed-in user; nobody can rename anyone else. */
export const renameMe = action(async (form: FormData) => {
  'use server';
  const user = signedIn();
  const raw = form.get('name');
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name || name.length > 100) {
    throw respond({ message: 'Enter a name of 1–100 characters.' }, { status: 400 });
  }
  try {
    const { headers } = await auth.api.updateUser({
      body: { name },
      headers: requestHeaders(),
      returnHeaders: true,
    });
    // The session cookie cache carries the name; this refreshes it.
    forwardCookies(headers);
    // The single-flight refresh reads the user from this request's locals
    // (getCurrentUser), so give it the new name too.
    getRequestEvent()!.locals.user = { ...user, name };
  } catch (error) {
    console.error('Renaming the user failed', error);
    throw respond({ message: 'Could not save the name. Try again.' }, { status: 500 });
  }
}, 'rename-me');
