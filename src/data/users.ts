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
//
// The admin actions (roles, bans, signing someone out) go through the admin
// plugin's auth.api.* endpoints, which check admin rights again against the
// session. None of them acts on the admin's own account, so the acting
// admin stays one: the app never loses its last admin this way. A change
// reaches the user's signed-in devices once their session cookie cache
// expires, within 5 minutes (session.cookieCache in src/server/auth.ts).
// Input is validated with Valibot inside the 'use server' bodies only, which
// keeps it off the client.
import { action, query } from '@solidjs/router';
import { respond } from '@solidjs/web';
import * as v from 'valibot';

import { FIELD_MAX } from '~/lib/field-limits';
import type { ActionError } from '~/lib/form-error';
import { m } from '~/paraglide/messages.js';
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
  banReason: true,
  createdAt: true,
} as const;

// What the admin plugin stores when a ban is given without a reason.
const NO_BAN_REASON = 'No reason';

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
  const { role, banReason, ...rest } = user;
  return {
    ...rest,
    banReason: banReason === NO_BAN_REASON ? null : banReason,
    isAdmin: isAdmin({ role }),
    isMe: user.id === me.id,
  };
}, 'user');

/**
 * The user an admin action acts on: the id the page bound with .with(id).
 * It travels in the action URL, so anyone can send any value; it must be a
 * string and not the admin's own id.
 */
function otherUser(id: unknown): string {
  const me = adminOnly();
  if (typeof id !== 'string' || !id) {
    throw respond({ message: m.user_not_found() } satisfies ActionError, { status: 400 });
  }
  if (id === me.id) {
    throw respond({ message: m.user_action_self() } satisfies ActionError, { status: 400 });
  }
  return id;
}

/** Runs an admin plugin call, turning its failure into the page's message. */
async function adminCall(what: string, call: () => Promise<unknown>): Promise<void> {
  try {
    await call();
  } catch (error) {
    console.error(`${what} failed`, error);
    throw respond({ message: m.user_action_failed() } satisfies ActionError, { status: 500 });
  }
}

/** Gives a user admin rights. */
export const makeAdmin = action(async (id: string, _form: FormData) => {
  'use server';
  const userId = otherUser(id);
  await adminCall('Making an admin', () =>
    auth.api.setRole({ body: { userId, role: 'admin' }, headers: requestHeaders() }),
  );
}, 'make-admin');

/** Takes a user's admin rights away. */
export const removeAdmin = action(async (id: string, _form: FormData) => {
  'use server';
  const userId = otherUser(id);
  await adminCall('Removing an admin', () =>
    auth.api.setRole({ body: { userId, role: 'user' }, headers: requestHeaders() }),
  );
}, 'remove-admin');

/**
 * Bans a user, with an optional reason: the admin plugin ends their
 * sessions and refuses them a new one until they are unbanned.
 */
export const banUser = action(async (id: string, form: FormData) => {
  'use server';
  const userId = otherUser(id);
  const parsed = v.safeParse(
    v.object({ reason: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(FIELD_MAX.line))) }),
    Object.fromEntries(form),
  );
  if (!parsed.success) {
    throw respond({ message: m.user_ban_reason_invalid() } satisfies ActionError, { status: 400 });
  }
  const banReason = parsed.output.reason || undefined;
  await adminCall('Banning a user', () =>
    auth.api.banUser({ body: { userId, banReason }, headers: requestHeaders() }),
  );
}, 'ban-user');

/** Lifts a user's ban. */
export const unbanUser = action(async (id: string, _form: FormData) => {
  'use server';
  const userId = otherUser(id);
  await adminCall('Unbanning a user', () =>
    auth.api.unbanUser({ body: { userId }, headers: requestHeaders() }),
  );
}, 'unban-user');

/** Ends every session a user has, on all their devices. */
export const signOutUser = action(async (id: string, _form: FormData) => {
  'use server';
  const userId = otherUser(id);
  await adminCall('Signing a user out', () =>
    auth.api.revokeUserSessions({ body: { userId }, headers: requestHeaders() }),
  );
  return true;
}, 'sign-out-user');
