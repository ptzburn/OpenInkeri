// Config for the better-auth CLI only (`pnpm auth:generate`). The runtime
// instance (src/server/auth.ts) needs the Worker's D1 binding, which doesn't
// exist in Node, so the CLI gets the same schema-shaping options. The
// relations-v2 adapter makes it emit Drizzle 1.0 relations; generating never
// touches the database, so it gets a placeholder.
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { betterAuth } from 'better-auth';

import { authOptions } from './src/server/auth-options';

export const auth = betterAuth({
  ...authOptions,
  database: drizzleAdapter({}, { provider: 'sqlite' }),
});
