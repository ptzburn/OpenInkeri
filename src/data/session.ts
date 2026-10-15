// Who is signed in, and signing in (with GitHub) and out, as server
// functions behind router queries and actions: the sign-in and sign-out
// forms post to them before JavaScript loads. They call better-auth directly
// through auth.api.*; Solid's server-function CSRF check guards them. The
// account page's own reads and writes are in ./account.ts.
import { action, query } from '@solidjs/router';
import { getRequestEvent, redirect, respond } from '@solidjs/web';

import type { ActionError } from '~/lib/form-error';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import { auth, forwardCookies, isAdmin, requestHeaders } from '~/server/auth';
import { adminOnly, signedIn } from '~/server/guards';

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
  const user = signedIn();
  return { id: user.id, name: user.name, email: user.email };
}, 'require-user');

/**
 * For admin pages that read nothing else first: redirects signed-out
 * visitors to sign-in and everyone else who isn't an admin home.
 */
export const requireAdmin = query(async () => {
  'use server';
  adminOnly();
  return true;
}, 'require-admin');

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
