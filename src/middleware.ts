// The server middleware chain (wired via `start.middleware` in
// vite.config.ts). Each function is `(event, next) => Response`: the request
// is `event.request`, and `next()` takes no arguments — assign
// `event.request` before calling it to hand a different request downstream.
// Per-request render inputs (`event.nonce`, `event.renderMode`) go on the
// event before `next()` too, since the page render runs inside it. The chain
// fronts every request the server dispatches — page renders, server function
// calls, and API routes alike — and runs inside the request-event scope, so
// getRequestEvent() and the session helpers work here exactly as in
// application code.
import type { StartMiddleware } from '@solidjs/vite-plugin';
import { createAPIHandler } from 'filesystem-routing/api';
import routes from 'virtual:file-routes';

import { paraglideMiddleware } from './paraglide/server.js';
import { auth, forwardCookies } from './server/auth';

// Detects the request's locale (see `strategy` in vite.config.ts) and runs
// the rest of the chain in an AsyncLocalStorage scope, so getLocale() and
// m.* return that locale anywhere downstream: the document, the streamed
// render, server functions and API routes. Without the `url` strategy the
// middleware never redirects or rewrites the URL, so the original request
// goes on unchanged.
const detectLocale: StartMiddleware = (event, next) =>
  paraglideMiddleware(event.request, () => next());

// Reads the session once per request and puts the user on event.locals,
// where server functions, API routes and the page render all read it
// (server functions called during the render get a copy). better-auth may
// refresh the session cookie while reading it; those cookies are forwarded.
// Its own endpoints read the session themselves, so they're skipped.
const attachUser: StartMiddleware = async (event, next) => {
  if (!new URL(event.request.url).pathname.startsWith('/api/auth/')) {
    const { headers, response } = await auth.api.getSession({
      headers: event.request.headers,
      returnHeaders: true,
    });
    forwardCookies(headers);
    event.locals.user = response?.user;
  }
  return next();
};

// createAPIHandler serves the GET/POST/... exports of route modules
// (see src/routes/api) and passes everything else down the chain. It still
// speaks the previous (request, next) shape and calls next() with no
// arguments, so adapt it onto the event.
const api = createAPIHandler(routes);

const handleAPI: StartMiddleware = (event, next) => api(event.request, next);

export default [detectLocale, attachUser, handleAPI];
