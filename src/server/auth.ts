// The better-auth instance, as a server-only module. Schema-shaping options
// live in ./auth-options.ts so the CLI can load them; this file adds what
// needs the Worker: the D1 database, the secret, and waitUntil.
import 'server-only';
import { getRequestEvent } from '@solidjs/web';
import type { RequestEvent, ResponseStub } from '@solidjs/web';
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { betterAuth } from 'better-auth';
import { waitUntil } from 'cloudflare:workers';
import { env } from 'virtual:env/server';

import { db } from './database';
import * as schema from './database/schema';
import { authOptions } from './auth-options';

export const auth = betterAuth({
  ...authOptions,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
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

// Headers a call through the handler needs from the browser's request:
// the session cookie, Origin for the CSRF check, and the client IP and
// user agent for rate limiting and the session record.
const FORWARDED = ['cookie', 'origin', 'referer', 'user-agent', 'cf-connecting-ip'];

/**
 * POSTs to a better-auth endpoint (e.g. '/sign-in/email') through its HTTP
 * handler, as the browser would. Calling auth.api.* directly would skip the
 * handler's rate limiting and origin check, which server functions need:
 * they are public URLs. Cookies on the result are forwarded to the response.
 */
export async function callAuth(path: string, body: object = {}): Promise<Response> {
  const request = event().request;
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await auth.handler(
    new Request(new URL(`/api/auth${path}`, request.url), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
  forwardCookies(response.headers);
  return response;
}
