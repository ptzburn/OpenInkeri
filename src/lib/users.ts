// The users pages' data: server functions ('use server') the UI calls
// directly. On the server they are plain function calls; in the browser the
// compiler turns each into a typed fetch against the /_server endpoint.
// query() caches reads per key; action() marks writes, and the router
// revalidates queries after an action settles.
//
// Every function checks the session itself, since these are public URLs
// anyone can call. Listing and reading users is for admins; renaming
// yourself only needs a session. The checks redirect (signed-out visitors to
// sign-in, everyone else home), so the reads double as the users pages'
// guard: the pages render straight away, their reads start together, and
// no separate guard request runs ahead of them.
import { action, query } from '@solidjs/router';
import { getRequestEvent, redirect, respond } from '@solidjs/web';

import { paths } from '~/router';
import { m } from '~/paraglide/messages.js';
import { auth, forwardCookies, isAdmin, requestHeaders } from '~/server/auth';
import { db } from '~/server/database';

function signedIn() {
  const user = getRequestEvent()?.locals.user;
  if (!user) throw redirect(paths['sign-in']());
  return user;
}

function adminOnly() {
  const user = signedIn();
  if (!isAdmin(user)) throw redirect(paths());
  return user;
}

// What the users pages show of someone; the raw role string stays on the
// server, reduced to the one flag the UI needs.
const columns = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  banned: true,
  createdAt: true,
} as const;

/**
 * Lists users oldest first, through the admin plugin's listUsers (which
 * checks admin rights against the session itself, and caps the list at 100).
 * It searches one field: a search with an @ looks at emails, anything else
 * at names; '' lists everyone. (The search is always a string: server
 * function arguments travel as JSON, which has no undefined.)
 */
export const getUsers = query(async (search: string) => {
  'use server';
  adminOnly();
  const value = search.trim();
  const { users, total } = await auth.api.listUsers({
    query: {
      ...(value && {
        searchValue: value,
        searchField: value.includes('@') ? 'email' : 'name',
        searchOperator: 'contains',
      }),
      sortBy: 'createdAt',
      sortDirection: 'asc',
    },
    headers: requestHeaders(),
  });
  return {
    users: users.map(({ id, name, email, image, role, banned, createdAt }) => ({
      id,
      name,
      email,
      image,
      banned,
      createdAt,
      isAdmin: isAdmin({ role }),
    })),
    total,
  };
}, 'users');

/**
 * What a component's getUsers read holds. A signed-out or non-admin visitor
 * makes it redirect, and on the server the router then resolves the read to
 * undefined (the 302 discards the body; the client holds the read pending
 * instead), so a server render can't assume a list.
 */
export type UserList = Awaited<ReturnType<typeof getUsers>> | undefined;

/** One user, and whether it is the signed-in one (who may rename it). */
export const getUser = query(async (id: string) => {
  'use server';
  const me = adminOnly();
  const user = await db.query.user.findFirst({ columns, where: { id } });
  if (!user) return null;
  const { role, ...rest } = user;
  return { ...rest, isAdmin: isAdmin({ role }), isMe: user.id === me.id };
}, 'user');

/** Renames the signed-in user; nobody can rename anyone else. */
export const renameMe = action(async (form: FormData) => {
  'use server';
  const user = signedIn();
  const raw = form.get('name');
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name || name.length > 100) {
    throw respond({ message: m.user_rename_invalid() }, { status: 400 });
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
    throw respond({ message: m.user_rename_failed() }, { status: 500 });
  }
}, 'rename-me');
