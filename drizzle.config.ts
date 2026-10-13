import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// `generate` diffs the schema against the last snapshot in ./drizzle and
// writes drizzle/<timestamp>_<name>/migration.sql. Wrangler applies those
// files to D1 (see the db:migrate scripts and migrations_pattern in
// wrangler.jsonc), so generating needs no database.
//
// `studio` (pnpm db:studio) opens the LOCAL D1 database: the SQLite file
// Wrangler keeps under .wrangler/, named by a hash, so it's looked up here.
// It exists after the first `pnpm db:migrate` or `pnpm dev`.
const LOCAL_D1 = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';

function localDatabase(): string | undefined {
  try {
    const file = readdirSync(LOCAL_D1).find(
      (name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite',
    );
    return file && join(LOCAL_D1, file);
  } catch {
    return undefined;
  }
}

const url = localDatabase();

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/database/schema.ts',
  out: './drizzle',
  ...(url && { dbCredentials: { url } }),
});
