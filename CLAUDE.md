# Agent Guide

This is a SolidJS 2.x project (`solid-js` 2.0 release candidate). Solid is not React: components run once (there is no re-render), reactivity is fine-grained through signals, and effects/memos have Solid-specific semantics. Do not port React patterns.

Solid 2 is also not Solid 1. Most Solid code you have seen is 1.x, and much of it is wrong here. When unsure about an API, check the docs (below) instead of relying on memory.

## Solid 2 rules (vs. Solid 1 habits)

- **Imports:** stores come from `solid-js` (no `solid-js/store`); `render`, `hydrate`, DOM `JSX` types come from `@solidjs/web` (no `solid-js/web`).
- **Writes are staged:** a setter commits on the next microtask, so reading right after `setX()` returns the old value. No `batch`. Use `flush()` only at imperative boundaries (mainly tests).
- **No writes in owned scopes:** don't call setters in component bodies or memo computations — derive with `createMemo` or function-form `createSignal(fn)`; write from event handlers, actions, or effect functions.
- **Props stay on `props`:** don't destructure props or read reactive values at the top of a component body. Read them in JSX or computations; `untrack` only for a deliberate one-time read.
- **Effects are split:** `createEffect(() => source(), (value) => { sideEffect(value); return cleanup; })`. The compute function tracks and must not write; the effect function is untracked. No `on(...)`, no `onCleanup` inside effects, no `initialValue` argument (second `createMemo` arg is options).
- **Lifecycle:** `onMount` → `onSettled`. `catchError`/`onError` → `<Errored>` or the effect `error` callback.
- **Stores use draft setters:** `setState((d) => { d.user.name = "x"; })`. No path setters, `produce`, `createMutable`, `unwrap` (→ `snapshot`), `mergeProps` (→ `merge`), `splitProps` (→ `omit`), `createSelector` (→ `createProjection`).
- **Async is built into computations:** no `createResource`. Use `createMemo(() => fetchX(id()))` under `<Loading>`; `isPending(() => x())` for refetch state; `refresh(x)` to refetch; `action` + `createOptimistic`/`createOptimisticStore` for mutations. No `startTransition`/`useTransition`.
- **Components:** `Suspense` → `Loading`, `ErrorBoundary` → `Errored` (fallback gets an error accessor), `SuspenseList` → `Reveal`, `Index` → `<For keyed={false}>`, `<Ctx.Provider>` → `<Ctx value={...}>`, `<Dynamic>` → `dynamic(() => source)`.
- **JSX:** no `classList` (use object/array `class`), no `use:` directives (use `ref` callbacks), no `on:`/`attr:`/`bool:` prefixes, no `/*@once*/`.

Full list: [Migrating from Solid 1.x](https://v2.solidjs.com/migration/from-solid-1.md).

The linter (`eslint-plugin-solid` v2 rules, configured in vite.config.ts) catches many of these. Run `npm run check` (format, lint, type check) after editing components and fix what it reports.

Imports: `~/x` is `src/x` (tsconfig `paths`, which Vite reads via `resolve.tsconfigPaths`). Use it instead of `../`; same-folder `./` imports stay relative. Files the drizzle-kit and `auth` CLIs load (`src/server/auth-options.ts`, `src/server/database/schema.ts` and what they import) stay on relative imports.

Code layout: `src/data/` holds the server functions, one module per entity (`account`, `session`, `users`, `records`, `places`, `parishes`, `theme`): router `query`s and `action`s whose `'use server'` bodies run on the server while the browser gets a stub that calls them. `src/lib/` holds plain helpers that run on both sides (formatting, route params, search folding, shared enums, shared types); nothing there touches the database. `src/server/` holds server-only internals (better-auth, the database, guards, form helpers), imported only from server-function bodies. `src/components/` holds shared UI, including the admin forms' pieces (`form-fields.tsx`: fields, `useFormErrors`, `FormActions`; `edit-page.tsx`, `edit-link-cell.tsx`, `search-box.tsx`). Name queries `getXs` (a list), `getX` (one), `getXEdit` (one row for its edit form) and `getXOptions` (a form's select choices), and actions `saveX` (create or update, from a form) or a verb (`renameMe`, `signOut`). Shared types and constants each have one home, so reuse them rather than writing a local copy: an option list's labels go in `src/components/labels.ts` (a `Record` over the list's type, so a new option without a label fails the type check); field lengths come from `FIELD_MAX` (`src/lib/field-limits.ts`), read by both the server's validation and the inputs' `maxlength`; and a memo that reads a query is annotated `(): Promise<QueryData<typeof getX>>` (`src/lib/query-data.ts`), not with a per-query alias.

Links and redirects: build app URLs with `paths` from `~/router` (typed from the file routes, e.g. `paths['sign-in']()`, `paths.users(id)`), not string literals. A route's search params get a schema through `export const route = defineFileRoute(path, { search })`, built with `stringParams(...)` from `~/lib/route-params` (a hand-written Standard Schema: it never fails, so the raw strings a failing schema would leave in place never reach the page). Extend that helper for other shapes rather than reaching for Valibot.

Validation: keep it on the server and keep validation libraries out of the browser bundle. Validate input with Valibot inside `'use server'` function bodies (the compiler drops those bodies, and imports only they use, from the client's copy of the module); browser-side checks are limited to HTML attributes (`required`, `maxlength`, `pattern`). Never import `valibot` from a module that runs in the browser (components, routes, `src/lib`, or `src/data` outside server-function bodies). The edit actions share their Valibot fields, `fieldsAtFault()` and `refuse()` through `src/server/forms.ts`. `env.ts` is fine: it runs at build/boot, and the client gets only the validated values.

## Documentation (fetch on demand)

The Solid 2 docs at https://v2.solidjs.com are written for agents as well as people:

- `https://v2.solidjs.com/llms.txt` — index with a one-line summary of every page. Start here to find the right page.
- Every page is available as Markdown: append `.md` to the path (e.g. `https://v2.solidjs.com/concepts/reactivity.md`). Relative links inside a page resolve against `https://v2.solidjs.com`.
- Do **not** fetch `llms-full.txt` — it is ~1.4 MB.

Read the relevant page before using an API you haven't used in this codebase, before introducing a new pattern (stores, async data, actions, boundaries, routing, SSR), and whenever behavior surprises you. Particularly useful: Concepts → Reactivity, Async reactivity; Guides → Thinking in Solid, Avoid unnecessary effects, Testing; the API reference under `/reference/`.

## Versioned skills (in node_modules)

The installed packages ship agent skills that match their exact installed versions. They are wrapped in `.claude/skills/` so they load automatically; the sources are:

- `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md` — repair guide mapping every dev-mode diagnostic code (e.g. `REACTIVE_WRITE_IN_OWNED_SCOPE`, `STRICT_READ_UNTRACKED`) to its prescribed fix. Read it whenever a Solid diagnostic code appears in test output or the browser console.
- `node_modules/@solidjs/diagnostics/skills/agent-loops/SKILL.md` — how to capture reactive evidence (which scopes re-ran and why, wasted recomputes, cost tables) and assert budgets, in tests and against live pages.
- `node_modules/@solidjs/web/skills/server-components/SKILL.md` — rules for writing `"use server"` server components and their client slots.
- `node_modules/drizzle-kit/skills/drizzle-*/SKILL.md` — drizzle-kit workflow: config and generate-vs-push (`drizzle-migrations`), `generate`, `push`, `pull`, resolving `missing_hints`, output modes, and response/error codes. Run drizzle-kit as `pnpm exec drizzle-kit`. Don't run `drizzle-kit skills`: it copies snapshots into the repo that go stale on upgrade.

## Drizzle ORM 1.0 (release candidate)

The database is Cloudflare D1 (SQLite) through `drizzle-orm` and `drizzle-kit`, both pinned to `1.0.0-rc.4`. Drizzle 1.0 is not 0.x: most Drizzle code you have seen is 0.x, and its relations and relational-query syntax is wrong here.

- **Relations:** one `defineRelations(schema, (r) => ({ ... }))` from `drizzle-orm`, with `r.one.<table>({ from, to })` / `r.many.<table>(...)`. `fields` → `from`, `references` → `to`, `relationName` → `alias`; `through` defines many-to-many directly. Split large definitions with `defineRelationsPart`. Never use the per-table `relations()` (it now lives in `drizzle-orm/_relations` only for legacy code).
- **Client:** `drizzle(env.DB, { relations })` from `drizzle-orm/d1` — pass `relations`, not `schema`. It lives in `src/server/database/` (`schema.ts`, `relations.ts`, `index.ts` exports `db`); import `db` only from server code. `env` comes from `cloudflare:workers`; the `DB` binding is declared in `wrangler.jsonc` and typed in `worker-configuration.d.ts` — run `pnpm cf-typegen` after changing bindings (it deliberately ignores `.env`).
- **Workflow:** edit `schema.ts` → `pnpm db:generate` (writes `src/server/database/migrations/<timestamp>_<name>/migration.sql`; review it) → `pnpm db:migrate` (applies to local D1 via Wrangler, which reads the nested folders through `migrations_pattern`). Production: CI applies pending migrations on every push to `main`, right before deploying the Worker (`.github/workflows/ci.yml`); don't run `pnpm db:migrate:remote` yourself unless asked. Don't use `drizzle-kit push`/`migrate` — Wrangler owns applying migrations to D1.
- **Relational queries:** `where` and `orderBy` are objects, not callbacks: `db.query.users.findMany({ where: { id: 1 }, orderBy: { id: "asc" }, with: { posts: true } })`. `where` supports `AND`/`OR`/`NOT`/`RAW`, operator objects (`{ age: { gt: 18 } }`), and filtering on relations.
- **Renamed helpers:** `getTableColumns` → `getColumns`. Casing is set per table with `snakeCase.table(...)` / `camelCase.table(...)` from `drizzle-orm/sqlite-core`, not `drizzle({ casing })`. Generated columns take `sql\`...\``, not raw strings.
- **Validation:** schema-to-Valibot comes from `drizzle-orm/valibot` (not the `drizzle-valibot` package).
- **Migrations:** each migration is its own folder (no `meta/_journal.json`). Change the schema, then generate migrations through the `drizzle-generate` skill; don't hand-write migration SQL.
- **Production-safe migrations:** a migration goes live before the code that needs it, so the deployed code must keep working on the new schema. Add tables and nullable or defaulted columns; rename or drop only in a later change, once nothing deployed uses the old shape. If a generated migration rebuilds a table (`__new_<table>`, `DROP TABLE`, `PRAGMA foreign_keys=OFF`), stop and tell the user before it ships: D1 ignores that pragma and keeps foreign keys enforced, so dropping a parent table such as `user` can cascade-delete its `session` and `account` rows.

Docs: `https://orm.drizzle.team/llms.txt` is the index. Use the SQLite pages (`https://orm.drizzle.team/docs/sqlite/...`), and the "sqlite/Upgrade to v1.0 RC" section for v1 changes (`v0-v1-changes`, `relations-v1-v2`, `connect-cloudflare-d1`). Pages are HTML only; there is no `.md` variant. When the docs and the installed types disagree, the types in `node_modules/drizzle-orm` win.

## daisyUI

Styling is Tailwind CSS 4 + daisyUI 5. The `daisyui` plugin (enabled in `.claude/settings.json`) provides the official daisyUI skill: read it before writing markup. Its examples are plain HTML; in Solid JSX keep `class` (never `className`) and replace inline `onclick="..."` strings with `onClick` handlers or `ref` callbacks. Don't install `daisyui-blueprint` from the same marketplace — it needs a paid license.

## better-auth

`better-auth`, `@better-auth/drizzle-adapter` and the `auth` CLI are pinned to the same version (`1.7.7`); upgrade them together.

- **Adapter:** import `drizzleAdapter` from `@better-auth/drizzle-adapter/relations-v2` with `provider: "sqlite"`. The default `better-auth/adapters/drizzle` targets Drizzle 0.x relations and is wrong here.
- **Schema:** after changing options in `src/server/auth-options.ts` (or adding a plugin), run `pnpm auth:generate` (the pinned CLI with `auth.cli.ts`; never `auth@latest` via `dlx`/`npx`), then `pnpm db:generate`. It rewrites `src/server/database/auth-schema.ts`, including `authRelations` (`defineRelationsPart`), which `relations.ts` spreads after the app's relations. Never `auth migrate`. Schema-shaping options go in `auth-options.ts` (no runtime imports, so the CLI can load it); runtime-only options (D1, secret, `waitUntil`, cookie cache) go in `src/server/auth.ts`.
- **This app's wiring:** `src/middleware.ts` reads the session once and sets `event.locals.user` (typed in `src/server/locals.d.ts`); server functions read that, never cookies. Auth mutations are server functions (`src/data/session.ts`, `src/data/account.ts`, `src/data/users.ts`) that call `auth.api.*` with `headers: requestHeaders(), returnHeaders: true` and pass the returned headers to `forwardCookies` (both from `src/server/auth.ts`). `auth.api.*` skips better-auth's rate limiter and origin check, which only run in its HTTP router: Solid's server-function CSRF check covers the origin, and a redirect target (`callbackURL`) taken from the request must be validated first. An action that changes the signed-in user (sign-out, profile edits) must also update `getRequestEvent()!.locals.user`: the single-flight refresh after the action runs in the same request and reads `locals`, not the new cookies. Every server function that returns private data checks `locals.user` itself; route guards (`requireUser`, `requireAdmin`) only decide what renders; the server functions check through `signedIn()`/`adminOnly()` from `src/server/guards.ts`.
- **Sign-in:** GitHub, Google and VK (`socialProviders` in `src/server/auth.ts`, credentials `<PROVIDER>_CLIENT_ID`/`_SECRET` in `env.ts`); there is no email/password. GitHub is required; Google and VK are optional and turn on when both their values are set (`authProviders`, which the sign-in page reads through `getSignInProviders`). The provider ids and their order live in `src/lib/auth-providers.ts`; adding one means its `socialProviders` entry, env vars, an icon (`auth-provider-icon.tsx`) and labels (`labels.ts`). A verified email from Google or GitHub links to an existing user with that email; VK's emails are unverified, so a taken one fails with `account_not_linked` (the sign-in page explains it). Credentials are runtime-only options, so they stay out of `auth-options.ts`. If passwords ever come back, don't use better-auth's default scrypt: it runs as pure JS on Workers and exceeds the Free plan's 10 ms CPU limit; hash with PBKDF2 through Web Crypto instead.
- **Client:** there is no browser-side auth client; the UI goes through the server functions above. If one is ever needed, don't use `better-auth/solid` — it is built on Solid 1 (the source of the `solid-js ^1` peer warning). Use `createAuthClient` from `better-auth/client` and bridge it to Solid 2 primitives. The docs' SolidStart integration page assumes Solid 1; adapt it with the Solid 2 rules above.

Skills: `.claude/skills/` has better-auth's feature skills (`better-auth-security-best-practices`, `email-and-password-best-practices`, `two-factor-authentication-best-practices`, `organization-best-practices`), copied from `github.com/better-auth/skills` and tracked in `skills-lock.json`. They are not version-matched; refresh them with `npx skills update -p`. Their setup steps are generic: where they say `npx auth@latest migrate`, `better-auth/adapters/drizzle` or `better-auth/solid`, follow the rules above instead. Their upstream `create-auth` and `best-practices` skills are deliberately not installed because they contradict these rules.

Docs: the `better-auth` MCP server (in `.mcp.json`) searches the documentation; prefer it. Otherwise `https://better-auth.com/docs/llms.txt` is the index for the 1.7 line, and every page has a Markdown variant (append `.md`, e.g. `https://better-auth.com/docs/adapters/drizzle.md`). When the docs and the installed types disagree, the types in `node_modules/better-auth` win.

## Paraglide JS (i18n)

Translations are an inlang project compiled by Paraglide JS (`@inlang/paraglide-js`, with `@inlang/cli` for checks). Paraglide ships no agent skill or MCP server; its version-matched docs are two generated READMEs. Both are git-ignored, so search tools may skip them; read them directly before localization work:

- `project.inlang/README.md` — the inlang project: settings, checks, machine translation, editors.
- `src/paraglide/README.md` — the compiled output: `m.*`, the runtime, strategies, markup.

Rules for this app:

- **Messages:** edit `messages/{locale}.json`. Locales are `ru` (the base), `en` and `fi`, set in `project.inlang/settings.json`; their order is the language switcher's order. Every key goes in all three files. Keys are snake_case, prefixed by area (`app_open_menu`, `sidebar_language`). Never edit `src/paraglide/`: it is generated and git-ignored. `paraglideVitePlugin` (vite.config.ts) regenerates it on every dev/build start, and `pnpm check` runs `paraglide-js compile` before type checking, so a fresh clone and CI have it too. Restart the dev server if a new key has no `m.*` function. `pnpm check:i18n` reports missing translations and unused messages.
- **Using them:** `import { m } from '~/paraglide/messages.js'` and call `m.key()` / `m.key({ name })` in JSX or computations. They are plain functions, not signals: `setLocale()` (from `~/paraglide/runtime.js`) writes the cookie and reloads the page, so nothing needs to react to a locale change. Don't make locale reactive with `setLocale(…, { reload: false })` or `overwriteSetLocale`.
- **Locale detection:** `strategy: ['cookie', 'preferredLanguage', 'baseLocale']` in `project.inlang/paraglide.config.ts`, the one place for compiler options (the Vite plugin and the CLI both read it): the `PARAGLIDE_LOCALE` cookie, then `Accept-Language`, then `ru`. The language switcher (`src/components/language-switcher.tsx`, in the sidebar header) calls `setLocale`, which writes the cookie and reloads. There are no locale URL prefixes; adding the `url` strategy means wiring the router's URLs through `localizeHref`/`deLocalizeUrl` (see the i18n routing doc). Keep to strategies the server can read on the first request (no `localStorage`), or SSR and hydration disagree.
- **Server:** `detectLocale` in `src/middleware.ts` runs first and wraps the rest of the chain in `paraglideMiddleware`, so `getLocale()` and `m.*` use the request's locale in the document (`<html lang>`), the render, server functions and API routes. It relies on AsyncLocalStorage (`nodejs_compat` in wrangler.jsonc); never set `disableAsyncLocalStorage`.
- **Markup in messages:** don't install `@inlang/paraglide-js-solid` — it is built on Solid 1 (`solid-js ^1.8` peer). Render `m.key.parts()` yourself.

Docs: `https://paraglidejs.com/llms.txt` indexes the HTML site. The Markdown sources are in `github.com/opral/paraglide-js` under `docs/` (e.g. `docs/middleware.md`, `docs/strategy.md`, `docs/i18n-routing.md`, `docs/markup.md`); fetch them with `gh api repos/opral/paraglide-js/contents/docs/<page>.md --jq .content | base64 -d`. The repo has no release tags, so those track `main`; when they disagree with the installed version, the generated READMEs and the types in `src/paraglide/*.d.ts` win. There is no SolidStart guide; the Vite and middleware pages apply.

## Reactive diagnostics — capture evidence instead of guessing

Use these whenever you are debugging reactivity (something doesn't update, updates too often, or is slow) or verifying a change didn't regress update granularity:

- **In tests:** `captureArtifact()` from `@solidjs/diagnostics` wraps a scenario and returns a serializable artifact of diagnostics + rerun attribution; matchers from `@solidjs/diagnostics/vitest` (`toHaveNoDiagnostics`, `toStayWithinRerunBudget`, `toHaveNoWaste`, …) assert on it. No browser needed. Component tests should assert `toHaveNoDiagnostics` so Solid 2 mistakes fail the test with a code.
- **Against the running dev server** (`diagnostics: true` in vite.config.ts; dev-only, no-op in builds). Requires an open page connected to the dev server (e.g. via a browser tool):
  - `GET /__solid/diagnostics` — status and connected client count
  - `POST /__solid/diagnostics` with JSON `{"method":"begin"}` then `{"method":"end"}` — capture a session into an artifact
  - `{"method":"whyDidRun","params":{"name":"<scope name>"}}` — recorded re-runs of one named scope in the open session
  - `{"method":"costs"}` — running cost tables for the open session

Name your signals/memos/effects (the `{ name: "..." }` option) — attribution reports scopes by name.

Fix diagnostics; never suppress them.
