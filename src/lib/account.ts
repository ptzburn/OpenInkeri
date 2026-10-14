// Sign-in (with GitHub), sign-out and the account page's reads and writes,
// as server functions behind router queries and actions: the forms post to
// them before JavaScript loads, and after hydration the router calls them
// over the transport. They call better-auth directly through auth.api.*;
// Solid's server-function CSRF check guards them.
//
// Input is validated with Valibot inside the 'use server' bodies only: the
// compiler leaves those bodies (and imports only they use) out of the
// browser's copy of this module, so Valibot stays off the client.
import { action, query } from '@solidjs/router';
import { getRequestEvent, redirect, respond } from '@solidjs/web';
import { isAPIError } from 'better-auth/api';
import * as v from 'valibot';

import { paths } from '~/router';
import { m } from '~/paraglide/messages.js';
import { LAST_ADMIN, auth, forwardCookies, isAdmin, requestHeaders } from '~/server/auth';

/**
 * The signed-in user's active sessions, through auth.api.listSessions, or
 * null when better-auth won't list them: like deleting the account, that
 * needs a session signed in within the last day (session.freshAge).
 */
async function listSessions() {
  try {
    return await auth.api.listSessions({ headers: requestHeaders() });
  } catch (error) {
    if (isAPIError(error) && error.body?.code === 'SESSION_NOT_FRESH') return null;
    throw error;
  }
}

function signedIn() {
  const user = getRequestEvent()?.locals.user;
  if (!user) throw redirect(paths['sign-in']());
  return user;
}

/** The signed-in user (set on the request by src/middleware.ts), or null. */
export const getCurrentUser = query(async () => {
  'use server';
  const user = getRequestEvent()?.locals.user;
  if (!user) return null;
  // image is the GitHub avatar URL better-auth stored at sign-in.
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    isAdmin: isAdmin(user),
  };
}, 'current-user');

/** For pages that need a user: redirects signed-out visitors to sign-in. */
export const requireUser = query(async () => {
  'use server';
  const user = getRequestEvent()?.locals.user;
  if (!user) throw redirect(paths['sign-in']());
  return { id: user.id, name: user.name, email: user.email };
}, 'require-user');

/** What a failed action carries in `submission.error` (see useSubmissions). */
export interface ActionError {
  message: string;
}

/**
 * Starts GitHub sign-in: better-auth stores the OAuth state in a cookie and
 * returns GitHub's authorize URL, which the browser is sent to. GitHub sends
 * the user back to /api/auth/callback/github, which signs them in (creating
 * the account on the first visit) and redirects home. A failure there lands
 * on /sign-in?error=<code>.
 */
export const signInWithGitHub = action(async () => {
  'use server';
  return startGitHubSignIn(paths());
}, 'sign-in-github');

/**
 * Signs in once more and comes back to the account page: deleting the
 * account needs a session from the last day.
 */
export const signInAgain = action(async () => {
  'use server';
  return startGitHubSignIn(paths.account());
}, 'sign-in-again');

async function startGitHubSignIn(callbackURL: string): Promise<never> {
  let url: string | undefined;
  try {
    const { headers, response } = await auth.api.signInSocial({
      body: {
        provider: 'github',
        callbackURL,
        errorCallbackURL: paths['sign-in'](),
      },
      headers: requestHeaders(),
      returnHeaders: true,
    });
    forwardCookies(headers);
    url = response.url;
  } catch (error) {
    console.error('GitHub sign-in failed to start', error);
  }
  if (!url) {
    throw respond({ message: m.sign_in_unreachable() } satisfies ActionError, {
      status: 502,
    });
  }
  throw redirect(url);
}

export const signOut = action(async () => {
  'use server';
  const { headers } = await auth.api.signOut({ headers: requestHeaders(), returnHeaders: true });
  forwardCookies(headers);
  // The single-flight refresh of the next page's queries runs in this same
  // request, with the locals the middleware set before the sign-out.
  // Clear the user there, or getCurrentUser still returns them.
  getRequestEvent()!.locals.user = undefined;
  getRequestEvent()!.locals.sessionId = undefined;
  throw redirect(paths());
}, 'sign-out');

/**
 * What getAccount returns. Spelled out: the account page's types feed
 * `paths`, which this module uses, so an inferred type would be circular.
 */
export interface AccountData {
  user: {
    name: string;
    email: string;
    image?: string | null;
    createdAt: Date;
    isAdmin: boolean;
  };
  sessions:
    | {
        id: string;
        createdAt: Date;
        ipAddress: string | null;
        userAgent: string | null;
        isCurrent: boolean;
      }[]
    | null;
}

/**
 * The account page's data: the signed-in user and their active sessions
 * (one per browser or device signed in), this one first, then the newest,
 * or null when the session is too old to list them (the page then offers
 * to sign in again). Session tokens stay on the server; the page names a
 * session by its id.
 */
export const getAccount = query(async (): Promise<AccountData> => {
  'use server';
  const user = signedIn();
  const current = getRequestEvent()!.locals.sessionId;
  const sessions = await listSessions();
  return {
    user: {
      name: user.name,
      email: user.email,
      image: user.image,
      createdAt: user.createdAt,
      isAdmin: isAdmin(user),
    },
    sessions:
      sessions &&
      sessions
        .map(({ id, createdAt, ipAddress, userAgent }) => ({
          id,
          createdAt,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
          isCurrent: id === current,
        }))
        .sort(
          (a, b) =>
            Number(b.isCurrent) - Number(a.isCurrent) ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        ),
  };
}, 'account');

/** Renames the signed-in user; nobody can rename anyone else. */
export const renameMe = action(async (form: FormData) => {
  'use server';
  const user = signedIn();
  const parsed = v.safeParse(
    v.object({ name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)) }),
    Object.fromEntries(form),
  );
  if (!parsed.success) {
    throw respond({ message: m.account_rename_invalid() } satisfies ActionError, { status: 400 });
  }
  const { name } = parsed.output;
  try {
    const { headers } = await auth.api.updateUser({
      body: { name },
      headers: requestHeaders(),
      returnHeaders: true,
    });
    // The session cookie cache carries the name; this refreshes it.
    forwardCookies(headers);
    // The single-flight refresh reads the user from this request's locals
    // (getCurrentUser, getAccount), so give it the new name too.
    getRequestEvent()!.locals.user = { ...user, name };
  } catch (error) {
    console.error('Renaming the user failed', error);
    throw respond({ message: m.account_rename_failed() } satisfies ActionError, { status: 500 });
  }
}, 'rename-me');

/**
 * Signs one of your other devices out. The page binds the session's id
 * (revokeSession.with(id)); it travels in the action URL, so the no-JS post
 * carries it too. Anyone can call this with any value, so the id is checked
 * and looked up among your own sessions only; this one is left to Sign out.
 * Looking it up needs what listing does: a session from the last day.
 * A device can stay signed in for up to the cookie cache's 5 minutes.
 */
export const revokeSession = action(async (id: string, _form: FormData) => {
  'use server';
  signedIn();
  if (typeof id !== 'string' || id === getRequestEvent()!.locals.sessionId) return;
  const sessions = await listSessions();
  if (!sessions) {
    throw respond({ message: m.account_sessions_reauthenticate() } satisfies ActionError, {
      status: 403,
    });
  }
  const session = sessions.find((session) => session.id === id);
  if (!session) return; // Already gone.
  await auth.api.revokeSession({ body: { token: session.token }, headers: requestHeaders() });
}, 'revoke-session');

/**
 * Signs every device but this one out. better-auth asks only for a valid
 * session here; the page shows the button only beside the list, though.
 */
export const revokeOtherSessions = action(async () => {
  'use server';
  signedIn();
  await auth.api.revokeOtherSessions({ headers: requestHeaders() });
}, 'revoke-other-sessions');

/** What a failed deleteAccount carries: reauthenticate offers Sign in again. */
export interface DeleteAccountError extends ActionError {
  reauthenticate?: boolean;
}

/**
 * Deletes the signed-in user with their sessions and linked GitHub account,
 * then signs out and goes home. The form's confirm checkbox must be ticked.
 * better-auth refuses a session older than a day (the page then offers to
 * sign in again), and the hook in src/server/auth.ts refuses the last admin.
 */
export const deleteAccount = action(async (form: FormData) => {
  'use server';
  signedIn();
  const fail = (error: DeleteAccountError, status: number) => respond(error, { status });
  if (!v.is(v.object({ confirm: v.literal('on') }), Object.fromEntries(form))) {
    throw fail({ message: m.account_delete_unconfirmed() }, 400);
  }
  try {
    const { headers } = await auth.api.deleteUser({
      body: {},
      headers: requestHeaders(),
      returnHeaders: true,
    });
    // Clears the session cookies.
    forwardCookies(headers);
  } catch (error) {
    const code = isAPIError(error) ? error.body?.code : undefined;
    if (code === 'SESSION_EXPIRED') {
      throw fail({ message: m.account_delete_reauthenticate(), reauthenticate: true }, 403);
    }
    if (code === LAST_ADMIN) throw fail({ message: m.account_delete_last_admin() }, 409);
    console.error('Deleting the account failed', error);
    throw fail({ message: m.account_delete_failed() }, 500);
  }
  // As in signOut: the refresh after this runs with this request's locals.
  getRequestEvent()!.locals.user = undefined;
  getRequestEvent()!.locals.sessionId = undefined;
  throw redirect(paths());
}, 'delete-account');
