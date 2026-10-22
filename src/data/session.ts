// Who is signed in, and signing in (with GitHub, Google or VK) and out, as server
// functions behind router queries and actions: the sign-in and sign-out
// forms post to them before JavaScript loads. They call better-auth directly
// through auth.api.*; Solid's server-function CSRF check guards them. The
// account page's own reads and writes are in ./account.ts.
import { action, query } from '@solidjs/router';
import { getRequestEvent, redirect, respond } from '@solidjs/web';

import type { AuthProvider } from '~/lib/auth-providers';
import type { ActionError } from '~/lib/form-error';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import { auth, authProviders, forwardCookies, isAdmin, requestHeaders } from '~/server/auth';
import { adminOnly, signedIn } from '~/server/guards';

/** The signed-in user (set on the request by src/middleware.ts), or null. */
export const getCurrentUser = query(async () => {
  'use server';
  const user = getRequestEvent()?.locals.user;
  if (!user) return null;
  // image is the avatar URL better-auth took from the provider at sign-up.
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

/** The providers the sign-in page offers (src/server/auth.ts). */
export const getSignInProviders = query(async (): Promise<AuthProvider[]> => {
  'use server';
  return authProviders;
}, 'sign-in-providers');

/**
 * Starts signing in with a provider: better-auth stores the OAuth state in a
 * cookie and returns the provider's authorize URL, which the browser is sent
 * to. The provider sends the user back to /api/auth/callback/<provider>,
 * which signs them in (creating the account on the first visit) and
 * redirects home. A failure there lands on /sign-in?error=<code>. The page
 * binds the provider (signIn.with(provider)); it travels in the action URL,
 * so anyone can send any value, and it is checked against the offered ones.
 */
export const signIn = action(async (provider: AuthProvider, _form: FormData) => {
  'use server';
  return startSignIn(provider, paths());
}, 'sign-in');

/**
 * Signs in once more and comes back to the account page: deleting the
 * account needs a session from the last day. The page offers the providers
 * linked to the account (getAccount's providers).
 */
export const signInAgain = action(async (provider: AuthProvider, _form: FormData) => {
  'use server';
  return startSignIn(provider, paths.account());
}, 'sign-in-again');

async function startSignIn(provider: AuthProvider, callbackURL: string): Promise<never> {
  if (!authProviders.includes(provider)) {
    throw respond({ message: m.sign_in_unknown_provider() } satisfies ActionError, {
      status: 400,
    });
  }
  let url: string | undefined;
  try {
    const { headers, response } = await auth.api.signInSocial({
      body: {
        provider,
        callbackURL,
        errorCallbackURL: paths['sign-in'](),
      },
      headers: requestHeaders(),
      returnHeaders: true,
    });
    forwardCookies(headers);
    url = response.url;
  } catch (error) {
    console.error(`Sign-in with ${provider} failed to start`, error);
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
