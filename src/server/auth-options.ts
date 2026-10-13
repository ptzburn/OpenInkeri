// better-auth options that shape the database schema, kept free of runtime
// imports (no D1 binding, no env) so the `auth` CLI can load them in Node
// to generate src/server/database/auth-schema.ts (see auth.cli.ts).
// The runtime instance in ./auth.ts spreads these and adds the rest.
import type { BetterAuthOptions } from 'better-auth';

import { hashPassword, verifyPassword } from './password';

export const authOptions = {
  // Derive the origin from the request, but only for these hosts. Add the
  // custom domain here when there is one.
  baseURL: { allowedHosts: ['localhost:3060', 'openinkeri.*.workers.dev'] },
  emailAndPassword: {
    enabled: true,
    // Signing up signs the user in. Email verification and password reset
    // come later, together with an email provider.
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: { hash: hashPassword, verify: verifyPassword },
  },
  rateLimit: {
    // Workers isolates don't share memory, so the default in-memory store
    // would count per isolate. D1 keeps one count for every request.
    storage: 'database',
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 3 },
    },
  },
} satisfies BetterAuthOptions;
