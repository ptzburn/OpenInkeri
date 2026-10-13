// Sign-up, sign-in and sign-out as server functions behind router actions:
// the forms post to them before JavaScript loads, and after hydration the
// router calls them over the transport. Each one goes through better-auth's
// HTTP handler (callAuth), so its rate limiting and origin check apply.
import { action, query } from '@solidjs/router';
import { getRequestEvent, redirect, respond } from '@solidjs/web';
import * as v from 'valibot';

import { callAuth } from '../server/auth';

/** What a failed submission carries in `submission.error` (see useSubmissions). */
export interface AccountError {
  message?: string;
  issues?: Partial<Record<'name' | 'email' | 'password', string>>;
}

const Email = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email('Enter a valid email address'));

const SignUp = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Enter your name'), v.maxLength(100)),
  email: Email,
  password: v.pipe(
    v.string(),
    v.minLength(8, 'Use at least 8 characters'),
    v.maxLength(128, 'Use at most 128 characters'),
  ),
});

const SignIn = v.object({
  email: Email,
  password: v.pipe(v.string(), v.minLength(1, 'Enter your password')),
});

function invalid(issues: v.BaseIssue<unknown>[]): never {
  const result: AccountError['issues'] = {};
  for (const issue of issues) {
    const field = issue.path?.[0]?.key as keyof NonNullable<AccountError['issues']> | undefined;
    if (field && !result[field]) result[field] = issue.message;
  }
  throw respond({ issues: result } satisfies AccountError, { status: 400 });
}

/**
 * Where to go after signing in: only a path on this origin, so a crafted
 * `next=//attacker.example` can't send the user to another site.
 */
export function safeNext(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined;
  if (value.startsWith('//') || value.startsWith('/\\')) return undefined;
  if (value.startsWith('/sign-in') || value.startsWith('/sign-up')) return undefined;
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

export const signUp = action(async (form: FormData) => {
  'use server';
  const parsed = v.safeParse(SignUp, Object.fromEntries(form));
  if (!parsed.success) invalid(parsed.issues);

  const response = await callAuth('/sign-up/email', parsed.output);
  if (!response.ok) {
    const message =
      response.status === 429
        ? 'Too many attempts. Try again in a minute.'
        : response.status === 422
          ? 'An account with this email already exists.'
          : 'Could not create the account. Try again.';
    throw respond({ message } satisfies AccountError, { status: response.status });
  }
  throw redirect(safeNext(form.get('next')) ?? '/');
}, 'sign-up');

export const signIn = action(async (form: FormData) => {
  'use server';
  const parsed = v.safeParse(SignIn, Object.fromEntries(form));
  if (!parsed.success) invalid(parsed.issues);

  const response = await callAuth('/sign-in/email', parsed.output);
  if (!response.ok) {
    // One message for a wrong email and a wrong password alike, so the form
    // doesn't reveal which emails have accounts.
    const message =
      response.status === 429
        ? 'Too many attempts. Try again in a minute.'
        : 'Email or password is incorrect.';
    throw respond({ message } satisfies AccountError, { status: response.status });
  }
  throw redirect(safeNext(form.get('next')) ?? '/');
}, 'sign-in');

export const signOut = action(async () => {
  'use server';
  await callAuth('/sign-out');
  throw redirect('/');
}, 'sign-out');
