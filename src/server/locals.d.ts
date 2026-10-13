// Types what src/middleware.ts puts on the request event's `locals`.
import type { User } from './auth';

declare module '@solidjs/web' {
  interface RequestEventLocals {
    /** The signed-in user, or undefined. Set by the attachUser middleware. */
    user?: User;
  }
}
