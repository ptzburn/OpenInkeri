import type { StandardSchemaV1 } from '@solidjs/router';

/**
 * A route's search schema (defineFileRoute's `search`) for optional string
 * params, written against Standard Schema directly so no validation library
 * ships to the browser: the router runs this schema there, on every URL.
 * Each listed key keeps a single string value; a missing or repeated param
 * becomes undefined, and keys not listed are dropped.
 */
export function stringParams<const K extends string>(
  ...keys: K[]
): StandardSchemaV1<Partial<Record<K, string>>> {
  return {
    '~standard': {
      version: 1,
      vendor: 'openinkeri',
      validate(value) {
        const raw = (value ?? {}) as Record<string, unknown>;
        const params: Partial<Record<K, string>> = {};
        for (const key of keys) {
          if (typeof raw[key] === 'string') params[key] = raw[key];
        }
        return { value: params };
      },
    },
  };
}
