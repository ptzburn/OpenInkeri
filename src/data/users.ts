// The users pages' data: server functions ('use server') the UI calls
// directly. On the server they are plain function calls; in the browser the
// compiler turns each into a typed fetch against the /_server endpoint.
// query() caches reads per key.
//
// Every function checks the session itself, since these are public URLs
// anyone can call. Listing and reading users is for admins; your own
// account's reads and writes are in ./account.ts. The checks redirect
// (signed-out visitors to sign-in, everyone else home), so the reads double
// as the users pages' guard: the pages render straight away, their reads
// start together, and no separate guard request runs ahead of them.
import { query } from '@solidjs/router';

import { auth, isAdmin, requestHeaders } from '~/server/auth';
import { db } from '~/server/database';
import { adminOnly } from '~/server/guards';

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

/** One user, and whether it is the signed-in one. */
export const getUser = query(async (id: string) => {
  'use server';
  const me = adminOnly();
  const user = await db.query.user.findFirst({ columns, where: { id } });
  if (!user) return null;
  const { role, ...rest } = user;
  return { ...rest, isAdmin: isAdmin({ role }), isMe: user.id === me.id };
}, 'user');
