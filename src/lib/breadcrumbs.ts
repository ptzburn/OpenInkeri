// The header's breadcrumbs come from the route: a page's `defineFileRoute`
// gives `info.crumbs`, and the header (src/components/breadcrumbs.tsx) reads
// it off the current match. The routes are flat (an edit page is not nested
// under its list), so a page names its whole trail, not just its own step.

/** One step: a page above this one (with `href`), or the page itself (without). */
export interface Crumb {
  label: string;
  href?: string;
}

/** What a page's crumbs are made from: its route params and the URL's query. */
export interface CrumbContext {
  params: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
}

/**
 * A page's breadcrumbs after Home: the pages above it, then itself. A step
 * named by a row (a person's name) waits on its query, the same one the
 * page reads; a row that isn't there leaves its step out. A route declares
 * them as a `const crumbs: Crumbs` outside its `defineFileRoute`: inside,
 * their `paths` would be part of the type `paths` is inferred from.
 */
export type Crumbs = (context: CrumbContext) => Crumb[] | Promise<Crumb[]>;

declare module '@solidjs/router' {
  interface RouteInfo {
    crumbs?: Crumbs;
  }
}
