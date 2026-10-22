/**
 * What a component's read of a router query holds: the query's result, or
 * undefined. A query that redirects (a signed-out or non-admin visitor; see
 * src/server/guards.ts) resolves to undefined in the server render (the 302
 * discards the body; the client holds the read pending instead), so a
 * server render can't assume the result. Annotate the read's memo with it:
 * `createMemo((): Promise<QueryData<typeof getPlaces>> => getPlaces())`.
 */
export type QueryData<Q extends (...args: never[]) => unknown> = Q extends (
  ...args: never[]
) => infer R
  ? Awaited<R> | undefined
  : never;
