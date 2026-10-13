// better-auth's HTTP endpoints (/api/auth/*). The app's forms go through
// server functions in src/lib/auth.ts, which call this same handler.
import { toSolidStartHandler } from 'better-auth/solid-start';

import { auth } from '../../../server/auth';

export const { GET, POST } = toSolidStartHandler(auth);
