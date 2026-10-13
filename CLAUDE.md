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
