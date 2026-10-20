// Fills persona.given_ru_folded and given_fi_folded, the given names folded
// for the person page's suggestions, where they are missing or out of step
// with the names: once for the mentions written before the columns existed.
// The app and the imports write them with the names from then on.
//
//   node scripts/fold-given-names.ts --out folded.sql [--remote]
//   pnpm exec wrangler d1 execute DB --local --file folded.sql
//
// It reads the database (local, or --remote) through Wrangler and only
// writes SQL: Wrangler applies it.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { fold } from './import-common.ts';

const { values: args } = parseArgs({
  options: {
    out: { type: 'string' },
    remote: { type: 'boolean', default: false },
  },
});
if (!args.out) {
  console.error('usage: --out <sql> [--remote]');
  process.exit(1);
}

const out = execFileSync(
  'pnpm',
  [
    'exec',
    'wrangler',
    'd1',
    'execute',
    'DB',
    args.remote ? '--remote' : '--local',
    '--json',
    '--command',
    `SELECT id, given_ru, given_fi, given_ru_folded, given_fi_folded FROM persona
     WHERE given_ru IS NOT NULL OR given_fi IS NOT NULL
        OR given_ru_folded IS NOT NULL OR given_fi_folded IS NOT NULL`,
  ],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
);
const rows = (
  JSON.parse(out) as {
    results: {
      id: number;
      given_ru: string | null;
      given_fi: string | null;
      given_ru_folded: string | null;
      given_fi_folded: string | null;
    }[];
  }[]
)[0].results;

const literal = (s: string | null) => (s === null ? 'NULL' : `'${s.replaceAll("'", "''")}'`);
const updates: string[] = [];
for (const row of rows) {
  const ru = row.given_ru ? fold(row.given_ru) : null;
  const fi = row.given_fi ? fold(row.given_fi) : null;
  if (ru === row.given_ru_folded && fi === row.given_fi_folded) continue;
  updates.push(
    `UPDATE persona SET given_ru_folded = ${literal(ru)}, given_fi_folded = ${literal(fi)} WHERE id = ${row.id};`,
  );
}
writeFileSync(args.out, updates.join('\n') + '\n');
console.error(`${updates.length} of ${rows.length} mentions to update → ${args.out}`);
