// Sign a headless browser in: insert a session for a local user into the
// local D1 database and print the session cookie better-auth expects
// (`better-auth.session_token=<token>.<signature>`), signed with
// BETTER_AUTH_SECRET from .env, the way better-call signs it for the app.
//
//   node .claude/skills/run-app/session.mjs [user-id] > cookie.txt
//
// Without a user id, the first admin is used. Sessions made here carry the
// user agent "run-app"; earlier ones with it are deleted first.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const d1 = (command) =>
  JSON.parse(
    execFileSync(
      'pnpm',
      ['exec', 'wrangler', 'd1', 'execute', 'DB', '--local', '--json', '--command', command],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ),
  )[0].results;

const secret = readFileSync(path.join(root, '.env'), 'utf8')
  .match(/^BETTER_AUTH_SECRET=(.+)$/m)[1]
  .trim()
  .replace(/^["']|["']$/g, '');
// better-call is better-auth's dependency, not the app's: resolve it from there.
const { serializeSignedCookie } = createRequire(
  realpathSync(path.join(root, 'node_modules/better-auth/package.json')),
)('better-call');

const userId =
  process.argv[2] ??
  d1("select id from user where role like '%admin%' order by created_at limit 1")[0]?.id;
if (!userId)
  throw new Error('No user in the local database: sign in once through the browser first.');

d1("delete from session where user_agent = 'run-app'");
const token = randomBytes(24).toString('base64url');
const id = randomBytes(16).toString('base64url');
const now = Date.now();
d1(
  `insert into session (id, expires_at, token, created_at, updated_at, user_agent, user_id) values ('${id}', ${now + 86400_000}, '${token}', ${now}, ${now}, 'run-app', '${userId}')`,
);
const cookie = await serializeSignedCookie('better-auth.session_token', token, secret, {});
process.stdout.write(cookie.split(';')[0] + '\n');
