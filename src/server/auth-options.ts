// better-auth options that shape the database schema, kept free of runtime
// imports (no D1 binding, no env) so the `auth` CLI can load them in Node
// to generate src/server/database/auth-schema.ts (see auth.cli.ts).
// The runtime instance in ./auth.ts spreads these and adds the rest,
// including the sign-in providers and their credentials.
import type { BetterAuthOptions } from 'better-auth';
import { admin } from 'better-auth/plugins';

export const authOptions = {
  // Derive the origin from the request, but only for these hosts: local
  // dev, the workers.dev URL, and the custom domain (routes in wrangler.jsonc).
  baseURL: {
    allowedHosts: ['localhost:3060', 'openinkeri.*.workers.dev', 'openinkeri.hokkanen.io'],
  },
  rateLimit: {
    // Workers isolates don't share memory, so the default in-memory store
    // would count per isolate. D1 keeps one count for every request.
    storage: 'database',
    customRules: {
      '/sign-in/social': { window: 60, max: 10 },
    },
  },
  // User management: roles (user/admin), bans, impersonation. Adds role and
  // ban columns to user and impersonatedBy to session. The first user to
  // sign up becomes an admin (see databaseHooks in ./auth.ts).
  plugins: [admin()],
} satisfies BetterAuthOptions;
