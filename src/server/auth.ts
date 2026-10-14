// The better-auth instance, as a server-only module. Schema-shaping options
// live in ./auth-options.ts so the CLI can load them; this file adds what
// needs the Worker: the D1 database, the secrets, and waitUntil.
import 'server-only';
import { getRequestEvent } from '@solidjs/web';
import type { RequestEvent, ResponseStub } from '@solidjs/web';
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { waitUntil } from 'cloudflare:workers';
import { env } from 'virtual:env/server';

import { db } from './database';
import * as schema from './database/schema';
import { authOptions } from './auth-options';

export const auth = betterAuth({
  ...authOptions,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
  // GitHub is the only way in: its first sign-in creates the account. The
  // OAuth app's callback URL is <origin>/api/auth/callback/github.
  socialProviders: {
    github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
  },
  databaseHooks: {
    user: {
      create: {
        // Whoever signs up while the user table is still empty becomes the
        // admin, so a fresh deployment needs no CLI step to get one.
        before: async (user) => {
          if ((await db.$count(schema.user)) > 0) return;
          return { data: { ...user, role: 'admin' } };
        },
      },
    },
  },
  user: {
    // Users can delete their own account (from the account page). Without a
    // password, better-auth only allows it from a session signed in within
    // the last day (session.freshAge), so a stolen old cookie can't do it.
    deleteUser: {
      enabled: true,
      // The app must keep an admin: the last one can't leave. Admins are
      // few, so filtering them in JS (role may be a comma list) is cheap.
      beforeDelete: async (user) => {
        const admins = (
          await db.query.user.findMany({
            columns: { id: true, role: true },
            where: { role: { like: '%admin%' } },
          })
        ).filter(isAdmin);
        if (admins.length === 1 && admins[0]!.id === user.id) {
          throw new APIError('BAD_REQUEST', { message: 'The last admin', code: LAST_ADMIN });
        }
      },
    },
  },
  // GitHub's access token is stored on the account row; encrypt it with the
  // secret so a database leak doesn't hand out working tokens.
  account: { encryptOAuthTokens: true },
  session: {
    // Keep the session in a signed cookie for 5 minutes, so most requests
    // skip the D1 lookup. A revoked session can live on for that long.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: {
    // Cloudflare sets the client IP here; rate limiting keys on it.
    ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    // Let work that shouldn't delay the response finish after it is sent.
    backgroundTasks: { handler: waitUntil },
  },
});

export type User = typeof auth.$Infer.Session.user;

/** The error code deleteUser fails with when the last admin tries to leave. */
export const LAST_ADMIN = 'LAST_ADMIN';

/** Whether the admin plugin counts this user as an admin (role may be a comma list). */
export function isAdmin(user: Pick<User, 'role'>): boolean {
  return user.role?.split(',').includes('admin') ?? false;
}

function event(): RequestEvent & { response: ResponseStub } {
  const e = getRequestEvent();
  if (!e) throw new Error('auth: no request event — call from a server function or middleware');
  return e as RequestEvent & { response: ResponseStub };
}

/** Copies better-auth's Set-Cookie headers onto the outgoing response. */
export function forwardCookies(headers: Headers): void {
  const response = event().response;
  for (const cookie of headers.getSetCookie()) response.headers.append('set-cookie', cookie);
}

/**
 * The browser's request headers, for auth.api.* calls from server functions:
 * better-auth reads the session cookie, client IP and user agent from them.
 * Pass `returnHeaders: true` and hand the result's headers to forwardCookies.
 *
 * auth.api.* skips better-auth's rate limiter and origin check (both live in
 * its HTTP router). Server functions are covered by Solid's own CSRF check;
 * anything that takes a redirect target from the request must validate it.
 */
export function requestHeaders(): Headers {
  return event().request.headers;
}
