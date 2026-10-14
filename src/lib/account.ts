// Sign-in (with GitHub) and sign-out as server functions behind router
// actions: the forms post to them before JavaScript loads, and after
// hydration the router calls them over the transport. They call better-auth
// directly through auth.api.*; Solid's server-function CSRF check guards them.
import { action, query } from '@solidjs/router';
import { getRequestEvent, redirect, respond } from '@solidjs/web';

import { paths } from '~/router';
import { m } from '~/paraglide/messages.js';
import { auth, forwardCookies, isAdmin, requestHeaders } from '~/server/auth';

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

/** What a failed sign-in carries in `submission.error` (see useSubmissions). */
export interface SignInError {
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
  let url: string | undefined;
  try {
    const { headers, response } = await auth.api.signInSocial({
      body: {
        provider: 'github',
        callbackURL: paths(),
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
    throw respond({ message: m.sign_in_unreachable() } satisfies SignInError, {
      status: 502,
    });
  }
  throw redirect(url);
}, 'sign-in-github');

export const signOut = action(async () => {
  'use server';
  const { headers } = await auth.api.signOut({ headers: requestHeaders(), returnHeaders: true });
  forwardCookies(headers);
  // The single-flight refresh of the next page's queries runs in this same
  // request, with the locals the middleware set before the sign-out.
  // Clear the user there, or getCurrentUser still returns them.
  getRequestEvent()!.locals.user = undefined;
  throw redirect(paths());
}, 'sign-out');
