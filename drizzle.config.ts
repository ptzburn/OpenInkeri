import { defineConfig } from 'drizzle-kit';

// Only `generate` runs against this config: it diffs the schema against the
// last snapshot in ./drizzle and writes drizzle/<timestamp>_<name>/migration.sql.
// Wrangler applies those files to D1 (see the db:migrate scripts and
// migrations_pattern in wrangler.jsonc), so no database credentials live here.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/database/schema.ts',
  out: './drizzle',
});
