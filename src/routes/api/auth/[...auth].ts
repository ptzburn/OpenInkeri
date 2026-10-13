// better-auth's HTTP endpoints (/api/auth/*), including GitHub's OAuth
// callback (/api/auth/callback/github). The app's forms go through server
// functions in src/lib/account.ts, which call this same handler.
import { toSolidStartHandler } from 'better-auth/solid-start';

import { auth } from '~/server/auth';

export const { GET, POST } = toSolidStartHandler(auth);
