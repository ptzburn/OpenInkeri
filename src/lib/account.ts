// Sign-in (with GitHub) and sign-out as server functions behind router
// actions: the forms post to them before JavaScript loads, and after
// hydration the router calls them over the transport. Each one goes through
// better-auth's HTTP handler (callAuth), so its rate limiting and origin
// check apply.
import { action, query } from '@solidjs/router';
import { getRequestEvent, redirect, respond } from '@solidjs/web';

import { callAuth } from '~/server/auth';

/**
 * Where to go after signing in: only a path on this origin, so a crafted
 * `next=//attacker.example` can't send the user to another site.
 */
export function safeNext(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined;
  if (value.startsWith('//') || value.startsWith('/\\')) return undefined;
  if (value.startsWith('/sign-in')) return undefined;
  return value;
}

/** The signed-in user (set on the request by src/middleware.ts), or null. */
export const getCurrentUser = query(async () => {
  'use server';
  const user = getRequestEvent()?.locals.user;
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}, 'current-user');

/** For pages that need a user: redirects to sign-in, then back to `next`. */
export const requireUser = query(async (next: string) => {
  'use server';
  const user = getRequestEvent()?.locals.user;
  if (!user) throw redirect(`/sign-in?next=${encodeURIComponent(next)}`);
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
 * the account on the first visit) and redirects to `next`. A failure there
 * lands on /sign-in?error=<code>.
 */
export const signInWithGitHub = action(async (form: FormData) => {
  'use server';
  const next = safeNext(form.get('next')) ?? '/';
  const response = await callAuth('/sign-in/social', {
    provider: 'github',
    callbackURL: next,
    errorCallbackURL: `/sign-in?next=${encodeURIComponent(next)}`,
  });
  const body = response.ok ? ((await response.json()) as { url?: string }) : undefined;
  if (!body?.url) {
    const message =
      response.status === 429
        ? 'Too many attempts. Try again in a minute.'
        : 'Could not reach GitHub. Try again.';
    throw respond({ message } satisfies SignInError, {
      status: response.ok ? 502 : response.status,
    });
  }
  throw redirect(body.url);
}, 'sign-in-github');

export const signOut = action(async () => {
  'use server';
  await callAuth('/sign-out');
  throw redirect('/');
}, 'sign-out');
