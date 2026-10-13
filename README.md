# OpenInkeri

A SolidJS 2 app (`solid-js` 2.0 release candidate) with streaming SSR, deployed to Cloudflare Workers.

## Setup

This project is developed only inside a dev container. A dev container is a ready-made Linux environment that runs inside Docker. It comes with everything this project needs already installed (Node.js 24, pnpm, the GitHub CLI, and Claude Code; the [Vite+](https://viteplus.dev) toolchain comes from the project's dependencies), so you don't install any of those on your own computer.

**1. Install the tools (once per computer)**

- [Git](https://git-scm.com/downloads), to download the code.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), which runs the container. After installing, start Docker Desktop and leave it running. On Windows, it will ask you to enable [WSL 2](https://learn.microsoft.com/windows/wsl/install); say yes.
- [Visual Studio Code](https://code.visualstudio.com/) (VS Code), the code editor.
- The [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) for VS Code. Open the link and click **Install**, or search for "Dev Containers" in VS Code's Extensions panel.

**2. Get the code**

Open a terminal (Terminal on macOS, PowerShell on Windows) and run:

```bash
git clone https://github.com/ptzburn/OpenInkeri.git
code OpenInkeri
```

If `code` isn't found, open VS Code and use **File → Open Folder…** to open the `OpenInkeri` folder instead.

**3. Open it in the container**

VS Code shows a popup: "Folder contains a Dev Container configuration file". Click **Reopen in Container**. If you missed it, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> on macOS), type "Reopen in Container", and press <kbd>Enter</kbd>.

The first start downloads and builds the container, which takes a few minutes. Later starts are fast.

**4. Open a terminal in the container**

Use **Terminal → New Terminal** (or <kbd>Ctrl</kbd>+<kbd>\`</kbd>). Commands you type there run inside the container. Continue with [Install and configure](#install-and-configure).

> Prefer not to install anything? [GitHub Codespaces](https://github.com/features/codespaces) runs the same dev container in your browser: on the repo page, click **Code → Codespaces → Create codespace on main**, then continue from step 4.

Your GitHub CLI and Claude Code logins are stored outside the container, so you only log in once, even after the container is rebuilt. Port 3060 (the dev server) is forwarded, so http://localhost:3060 works in your normal browser.

### Install and configure

Run these in the dev container's terminal:

```bash
pnpm install            # also installs the git hooks (lefthook)
cp .env.example .env
openssl rand -base64 32 # paste the output as BETTER_AUTH_SECRET in .env
pnpm db:migrate         # create the local D1 database
pnpm dev                # http://localhost:3060
```

`.env` is git-ignored. `BETTER_AUTH_SECRET` must be at least 32 characters; the server refuses to start without it. See [Typed environment variables](#typed-environment-variables) and [Authentication](#authentication) for details.

### Git hooks

`pnpm install` sets up [lefthook](https://lefthook.dev) hooks (`lefthook.yml`):

- **pre-commit:** formats and lint-fixes the staged files.
- **pre-push:** runs `vp check` (format, lint, type check). Tests run in CI (`.github/workflows/ci.yml`) along with the same checks and a build, on every pull request.

Make sure git knows who you are before committing (the dev container doesn't set this):

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### Deploying

Deploys are handled by Cloudflare Workers Builds, connected to this repo in the Cloudflare dashboard, so you normally don't deploy by hand. To deploy from your machine anyway, run `npx wrangler login` once (or set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in `.env`), set the production secret with `npx wrangler secret put BETTER_AUTH_SECRET`, then run `pnpm run deploy`. Deploys don't apply database migrations: run `pnpm db:migrate:remote` after deploying a change that adds one.

### Working with AI agents

`CLAUDE.md` is the guide for coding agents: Solid 2 conventions, versioned skills, and how to capture reactive diagnostics. Keep it up to date when conventions change.

[Claude Code](https://code.claude.com/docs) is preinstalled in the dev container. The project shares one Claude Code setup through the repo:

- `CLAUDE.md`: project instructions every session starts with.
- `.claude/settings.json`: team settings: no Claude attribution in commits or PRs, the plugins below, and commands Claude may run without asking.
- `.claude/skills/`: Solid skills that point at the docs shipped with the installed packages.

The first time, run `claude` in the dev container terminal and log in with your own account. When it asks whether to trust this folder, say yes; the shared settings only apply after that. Then install the team plugins once:

```bash
claude plugin install cloudflare@cloudflare --scope project
claude plugin install superpowers@claude-plugins-official --scope project
```

- **cloudflare:** skills and docs for Workers, Wrangler, and other Cloudflare products.
- **superpowers:** workflows for brainstorming, planning, test-driven development, systematic debugging, and code review.

For personal tweaks, use `.claude/settings.local.json`. It's git-ignored.

---

The sections below come from the Solid `fullstack` template this project started from, and explain how its pieces work.

## Solid `fullstack` template

`basic` plus a server. Same structure, same conventions — the diff against `basic` is what a server adds:

- **Data loading through server functions** — `'use server'` functions the UI calls like local async functions (`src/lib/users.ts`).
- **A single-flight mutation** — a `<form>` posting to an `action()` server function; the response carries the refreshed page data, so the UI updates in one round trip. Works before hydration too.
- **Email and password auth** — [better-auth](https://better-auth.com) on D1 (this project replaced the template's demo cookie session; see [Authentication](#authentication)).
- **An API route** — uppercase method exports under `src/routes/api` answer HTTP requests (better-auth's endpoints live at `src/routes/api/auth/[...auth].ts`).

**Deployment contract:** there is a server. `vite build` emits static client assets to `dist/client`, a request handler to `dist/server/server.js`, and — via `start: { node: true }` — a ready-to-run Node server at `dist/server/node.js` that `npm start` runs. Streaming SSR is the default posture — set `ssr: false` in `vite.config.ts` for a static shell + API server: pages render on the client while server functions, sessions, and API routes keep working. Same template, one boolean.

## Server functions

A function marked `'use server'` always runs on the server. On the server it is a plain call; in the browser the compiler turns it into a typed fetch against the `/_server` endpoint — you never write the endpoint. Wrap reads in `query()` (cached per key, shared between preload and render) and writes in `action()`; both come from `@solidjs/router`. `src/lib/` holds the data layer (`account.ts` for auth, `users.ts` for the users pages).

Inside a server function, `getRequestEvent()` (from `@solidjs/web`) is the current request — headers, `locals`, the mutable `response` head.

## Single-flight mutations

The payoff the whole stack builds toward. When a form submits, the router sends the action call with a single-flight marker; on the server, after the mutation runs, the registered collector (`src/server-config.ts`) reruns the target route's `preload` and folds the refreshed `query()` data into the **same response**. The router seeds its cache from that envelope — no follow-up refetch, no stale frame in between.

Watch the network tab while renaming yourself on your `/users/<id>` page: exactly one `POST /_server` — the heading _and_ the user list in the layout both update from that one response. Without single-flight that interaction is a POST followed by one GET per revalidated query.

Two things make a route single-flight-complete, and both are already good practice: reads go through `query()`, and the route's `preload` touches every query the page renders (that is what the server reruns — `src/routes/users/[id].tsx` calls it "the page's single-flight manifest"). The no-JS fallback is the same machinery minus the envelope: the plain form POST runs the action and answers `303 See Other` back to the page, which re-renders with fresh data — one round trip there too.

## Authentication

Email and password sign-up, sign-in and sign-out with [better-auth](https://better-auth.com), storing users and sessions in D1 through Drizzle. Email verification and password reset are not set up yet; they need an email provider.

- **`src/server/auth.ts`** — the better-auth instance. Options that shape the database schema live in `src/server/auth-options.ts`, so the `auth` CLI can load them (`pnpm auth:generate` writes `src/server/database/auth-schema.ts` via `auth.cli.ts`; then `pnpm db:generate` writes the migration).
- **`src/middleware.ts`** — reads the session once per request and sets `event.locals.user`. A 5-minute signed cookie cache saves most requests a D1 lookup.
- **`src/lib/account.ts`** — `signUp`, `signIn` and `signOut` as server functions behind router actions, so the forms on `/sign-up` and `/sign-in` work before JavaScript loads. They call better-auth through its HTTP handler (`callAuth`), not `auth.api.*`, so its rate limiting and origin check apply. `requireUser` guards pages and sends signed-out visitors to `/sign-in?next=…`.
- **Passwords** are hashed with PBKDF2-SHA256 through Web Crypto at 100,000 iterations (`src/server/password.ts`), because better-auth's default scrypt runs as pure JavaScript on Workers and costs far more CPU.
- **Rate limiting** applies in production only: 5 sign-ins and 3 sign-ups per IP per minute, counted in D1 so every Worker isolate shares the count.

## Typed environment variables

`env.ts` at the project root declares every variable as a [Standard Schema](https://standardschema.dev) validator (valibot here; zod or arktype work identically — nothing is imported from the plugin). The plugin probes it automatically and serves two fully typed virtual modules; generated types land in `solid-env.d.ts`.

- **`virtual:env/server`** — every var, **read from `process.env` when the server boots** and validated then: secrets rotate without a rebuild, platform-injected vars work, and no secret value exists in any build artifact. A misconfigured server fails at boot with a per-key report (delete `BETTER_AUTH_SECRET` from `.env` and run `npm start` to see it). Importing this module from client code fails the build, naming the importer.
- **`virtual:env/client`** — the `VITE_`-prefixed vars, validated and **baked into the bundle** at build time (defaults applied, zero schema-library bytes shipped). The prefix is the line: client values are public, server values never leave the server.

The plugin folds `.env` files into `process.env` for dev, build, and preview — no `loadEnv` boilerplate. Copy `.env.example` to `.env` to get started (`.env` is git-ignored); `npm start` picks it up via `--env-file-if-exists`, and deploy platforms provide the real environment.

## Server-only modules

`src/server/database/index.ts` and `src/server/auth.ts` import the `server-only` marker: if any code path would pull them into the client bundle, the build **fails at resolve time**, naming the importer — instead of silently shipping your data layer to the browser. (`client-only` marks the reverse.)

## Middleware and API routes

`src/middleware.ts` (wired via `start.middleware` in `vite.config.ts`) exports a chain of event-first functions, `(event, next) => Response`, fronting every request — page renders, server function calls, and API routes alike. The request is `event.request`. `next()` takes no arguments; assign `event.request` before calling it to hand a different request downstream, and set `event.nonce` or `event.renderMode` on the event before `next()` when a request needs them (the page render runs inside it). The chain runs inside the request-event scope, so `getRequestEvent()` works there exactly as in application code. Its first middleware reads the better-auth session and sets `event.locals.user`.

A route module may export uppercase `GET`/`POST`/... handlers — an API route. A module with handlers but no default export is a route without a page (`src/routes/api/auth/[...auth].ts`). Handlers are dispatched by the `createAPIHandler` middleware; `fileRoutes({ httpMethods: true })` scans for them with one router serving both sides — handler modules, and the server-only code they import, never enter the client bundle. `createAPIHandler` still takes `(request, next)`, so the template adapts it onto the event-first chain.

## File-system routing

Routing works exactly as in `basic` (see its README): the `fileRoutes` plugin scans `src/routes`, `@solidjs/router/fs` consumes the result. The router instance lives in `src/router.ts` so the single-flight collector and the app share one source of truth.

Link preloading is opt-in. The router is created with `preloadLinks: intentPreload()`, so hovering, focusing, or touching a link warms that route's code and runs its `preload` — the same functions single-flight reruns — before the click. Drop the option to ship no preload listeners; `preload="false"` on a link opts that one link out.

## Testing

Two vitest projects, because they need different halves of the framework: `client` runs the DOM component tests from `basic` in jsdom, and `server` runs the server tests (password hashing) in node against the real server runtime — full request/response cycles through the same code paths production takes, with the plugin's env module stubbed (`vitest-env-server-stub.ts`).

## Development scripts

Run these with pnpm (`pnpm <script>`; use `pnpm run deploy` for deploy, since `pnpm deploy` is a different pnpm command):

| Script              | What it does                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `dev`               | Dev server with streaming SSR, running in local workerd, at [localhost:3060](http://localhost:3060).    |
| `build`             | Builds client assets to `dist/client` and the Worker request handler to `dist/server`.                  |
| `serve`             | Previews the production build locally.                                                                  |
| `test`              | Runs both test projects (`client` component tests in jsdom, `server` tests in node).                    |
| `check`             | Format check, lint (including the Solid 2 rules), and type check.                                       |
| `lint`              | Lint only, for `src`.                                                                                   |
| `deploy`            | Builds and deploys to Cloudflare Workers with wrangler.                                                 |
| `db:generate`       | Writes a Drizzle migration to `drizzle/` from changes in `src/server/database/schema.ts`.               |
| `db:migrate`        | Applies pending migrations to the local D1 database (in `.wrangler/`).                                  |
| `db:migrate:remote` | Applies pending migrations to the production D1 database.                                               |
| `cf-typegen`        | Regenerates `worker-configuration.d.ts` (binding and runtime types) after editing `wrangler.jsonc`.     |
| `db:studio`         | Opens Drizzle Studio on the local D1 database (run `pnpm db:migrate` or `pnpm dev` first).              |
| `auth:generate`     | Regenerates the better-auth tables in `src/server/database/auth-schema.ts` after changing auth options. |

Learn more on the [Solid 2 docs](https://v2.solidjs.com) and come chat on the [Solid Discord](https://discord.com/invite/solidjs).

## Deployment

The built server entry exposes one adapter-agnostic web `Request -> Response` handler in two forms:

```js
import app, { handleRequest } from './dist/server/server.js';
// serve dist/client statically; everything else:
const response = await handleRequest(request);
const sameResponse = await app.fetch(request);
```

The default `{ fetch(request) }` export follows the Fetchable convention used by deployment integrations. It intentionally ignores host arguments after the request instead of forwarding them as Solid handler options.

`dist/server/node.js` is the Node version of the same contract, emitted by the build. The platform recipes below own the server environment themselves, so they drop `start.node` from the `solid()` call. Any target needs exactly three things:

1. **Serve `dist/client` statically**, and route everything else — pages, `/_server`, API routes — to `handleRequest`.
2. **Provide the server env vars** (`BETTER_AUTH_SECRET` here) in the process environment: the server bundle reads and validates them **at boot**, not at build time, so they come from the platform's env/secret settings — never from a build artifact. Client `VITE_` vars are the opposite: baked in at `vite build`, so set those on the build machine/CI.
3. **Resolve the bundle's dependencies**: `dist/server` imports its npm deps (`solid-js`, `@solidjs/web`, `valibot`, ...) as bare specifiers rather than inlining them, so whatever runs or re-bundles it needs `node_modules` present — true in every recipe below. The bundle itself is pure web-standard code (no `node:` imports, no top-level `await`).

### Node

The default — nothing to add. `start: { node: true }` in `vite.config.ts` makes the build emit `dist/server/node.js`: it serves `dist/client` statically (hashed assets under `assets/` as `Cache-Control: public, max-age=31536000, immutable`, everything else `must-revalidate`) and hands every other request to `handleRequest`. `npm run build`, then `npm start` runs it (loading `.env` if present; real deployments set the environment instead). Any node host (a VPS, Fly.io, Railway, ...) that runs `node dist/server/node.js` with `PORT` (and optionally `HOST`) and `BETTER_AUTH_SECRET` set is done. The entry speaks plain HTTP — terminate TLS and compress at the reverse proxy or CDN in front of it.

The file also exports `listener` (the `(req, res)` function), `createListener({ static?, event? })`, and `serve({ port, host, static, event })`, so it composes with an existing server — e.g. `app.use(listener)` in Express, or `createListener({ static: false })` behind Express's own static handling.

**Client IP:** the emitted entry passes the raw Node request into the request event — `handleRequest(request, { event: { nativeEvent: req } })` — so anywhere in a request (middleware, server functions) `getRequestEvent().nativeEvent.socket.remoteAddress` is the peer address. Behind a proxy or load balancer that address is the proxy's: read the forwarding headers off `getRequestEvent().request` instead (`x-forwarded-for` and friends) — only when you trust the proxy that set them.

### Nitro

[Nitro v3](https://nitro.build) should own the server environment so its presets, route rules, tasks, and runtime features apply to the Solid handler. Install `nitro`, then add `nitro({ serverEntry: false })` after `solid()`:

```ts
import { nitro } from 'nitro/vite';

export default defineConfig({
  plugins: [
    solid({
      start: { middleware: './src/middleware.ts' },
      ssr: true,
      serverFunctions: { configure: './src/server-config.ts' },
      extensions: ['.jsx', '.tsx'],
    }),
    nitro({ serverEntry: false }),
    fileRoutes({ httpMethods: true }),
  ],
});
```

Nitro adopts Solid's normal `ssr` environment and its `index` Fetchable service entry. No `start.external`, custom source entry, or Rollup input is needed.

### Cloudflare Workers

The [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/) should own the server environment so development runs in workerd with the same bindings and runtime behavior as production. Install `@cloudflare/vite-plugin` and `wrangler`, then map the Worker to Solid's normal `ssr` environment:

```ts
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    solid({
      start: { middleware: './src/middleware.ts' },
      ssr: true,
      serverFunctions: { configure: './src/server-config.ts' },
      extensions: ['.jsx', '.tsx'],
    }),
    fileRoutes({ httpMethods: true }),
  ],
});
```

```jsonc
// wrangler.jsonc
{
  "name": "my-app",
  "main": "virtual:solid-ssr-handler",
  "compatibility_date": "2026-08-11",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS",
  },
}
```

The Cloudflare plugin adopts the `ssr` environment and resolves its virtual Fetchable entry directly. `nodejs_compat` provides `node:async_hooks` for the per-request event scope and exposes Worker variables through `process.env` with a compatibility date of 2025-04-01 or later.

```bash
$ npm run build
$ echo "BETTER_AUTH_SECRET=..." > .dev.vars    # local dev secrets
$ npx wrangler dev                          # local workerd — no account needed
$ npx wrangler secret put BETTER_AUTH_SECRET    # production secret
$ npx wrangler deploy
```

Streaming SSR, server functions, and the session cookie (pure WebCrypto) all work in workerd unchanged. Remember the flip side of baked client env: `VITE_` vars are fixed at `vite build`, not by worker vars.

### Netlify

The [Netlify Vite plugin](https://www.npmjs.com/package/@netlify/vite-plugin) consumes Solid's normal `ssr` build and turns its default Fetchable entry into a streaming Netlify Function. Install `@netlify/vite-plugin`, then add it after `solid()`:

```ts
import netlify from '@netlify/vite-plugin';

export default defineConfig({
  plugins: [
    solid({
      start: {
        middleware: './src/middleware.ts',
      },
      ssr: true,
      serverFunctions: { configure: './src/server-config.ts' },
      extensions: ['.jsx', '.tsx'],
    }),
    netlify({ build: { enabled: true } }),
    fileRoutes({ httpMethods: true }),
  ],
});
```

Keep Solid's normal server build enabled — do not set `start.external`. For a direct @solidjs/vite-plugin project, set the build defaults explicitly:

```toml
[build]
command = "npm run build"
publish = "dist/client"
```

The plugin generates the catch-all function, gives static files precedence, preserves streaming, and emulates Netlify platform features during `vite dev`. Set `BETTER_AUTH_SECRET` in the site's environment settings. No handwritten Netlify Function or Netlify CLI is required.

## This project was created with the [Solid CLI](https://github.com/solidjs-community/solid-cli)
