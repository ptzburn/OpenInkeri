// better-auth options that shape the database schema, kept free of runtime
// imports (no D1 binding, no env) so the `auth` CLI can load them in Node
// to generate src/server/database/auth-schema.ts (see auth.cli.ts).
// The runtime instance in ./auth.ts spreads these and adds the rest,
// including the GitHub credentials.
import type { BetterAuthOptions } from 'better-auth';

export const authOptions = {
  // Derive the origin from the request, but only for these hosts. Add the
  // custom domain here when there is one.
  baseURL: { allowedHosts: ['localhost:3060', 'openinkeri.*.workers.dev'] },
  rateLimit: {
    // Workers isolates don't share memory, so the default in-memory store
    // would count per isolate. D1 keeps one count for every request.
    storage: 'database',
    customRules: {
      '/sign-in/social': { window: 60, max: 10 },
    },
  },
} satisfies BetterAuthOptions;
