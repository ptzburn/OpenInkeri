// The D1 database, as a server-only module. `env` from cloudflare:workers is
// the Worker's bindings; DB is declared in wrangler.jsonc and typed by
// `pnpm cf-typegen` (worker-configuration.d.ts).
import 'server-only';
import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';

import { relations } from './relations';

export const db = drizzle(env.DB, { relations });
