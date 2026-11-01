// What the admins' edit forms share on the server: Valibot fields for the
// values a form posts (all strings), and how a refused save answers. Only
// 'use server' bodies use these, so Valibot stays out of the browser bundle.
import 'server-only';
import { respond } from '@solidjs/web';
import * as v from 'valibot';

import { FIELD_MAX } from '~/lib/field-limits';
import { parsePartialDate } from '~/lib/format';
import { CYRILLIC_NAME_PATTERN, LATIN_NAME_PATTERN, matchesPattern } from '~/lib/name-scripts';
import type { FormError } from '~/lib/form-error';
import { m } from '~/paraglide/messages.js';

/** Whitespace runs as one space, trimmed: for one-line values like names. */
export const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** A one-line text field: whitespace collapsed, at most `max` characters, null when empty. */
export const line = (max: number = FIELD_MAX.line) =>
  v.pipe(
    v.optional(v.string(), ''),
    v.transform(collapse),
    v.maxLength(max),
    v.transform((s) => s || null),
  );

/** A required one-line text field: whitespace collapsed, 1 to `max` characters. */
export const requiredLine = (max: number = FIELD_MAX.line) =>
  v.pipe(v.string(), v.transform(collapse), v.minLength(1), v.maxLength(max));

/** A required Russian name (of a parish or village): in Cyrillic, see ~/lib/name-scripts. */
export const russianName = () =>
  v.pipe(
    requiredLine(),
    v.check((s) => matchesPattern(CYRILLIC_NAME_PATTERN, s)),
  );

/** An optional Finnish name: in Latin letters, null when empty. */
export const finnishName = () =>
  v.pipe(
    line(),
    v.check((s) => s === null || matchesPattern(LATIN_NAME_PATTERN, s)),
  );

/** A text field that keeps its line breaks (notes): trimmed, null when empty. */
export const text = v.pipe(
  v.optional(v.string(), ''),
  v.trim(),
  v.maxLength(FIELD_MAX.text),
  v.transform((s) => s || null),
);

/** A date typed as the pages show it (12.3.1895, 3.1895, 1895), stored as ISO; null when empty. */
export const partialDate = v.pipe(
  v.optional(v.string(), ''),
  v.transform(parsePartialDate),
  v.check((d) => d !== undefined),
  v.transform((d) => d ?? null),
);

/** A row id: a positive integer. */
export const rowId = v.pipe(v.number(), v.integer(), v.minValue(1));

/** A <select> of ids, where '' is "none" (null); also the id of a form's row, empty when it creates one. */
export const optionalId = v.pipe(
  v.optional(v.string(), ''),
  v.transform((s) => (s === '' ? null : Number(s))),
  v.nullable(rowId),
);

/**
 * Where the list was (its search, page, filter), as a form posts it in a
 * hidden field: '' for unset, which the form writes for a param the URL
 * didn't have, reads as absent; anything else as `schema` reads it.
 */
export const listParam = <S extends v.GenericSchema<string>>(schema: S) =>
  v.pipe(
    v.optional(v.string(), ''),
    v.transform((s) => s || undefined),
    v.optional(schema),
  );

/** The version a form's row was loaded at (0 for a new row), for the conflict check. */
export const version = v.pipe(
  v.optional(v.string(), '0'),
  v.transform(Number),
  v.number(),
  v.integer(),
);

/**
 * Parses a form's values. An issue without a message of its own gets '',
 * not Valibot's English one, so fieldsAtFault passes on only the reasons
 * the app wrote (in the reader's language).
 */
export const parseForm = <S extends v.GenericSchema>(schema: S, input: unknown) =>
  v.safeParse(schema, input, { message: '' });

/** The form fields a failed parseForm found at fault, by name, each with its first reason. */
export function fieldsAtFault(issues: readonly v.BaseIssue<unknown>[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path?.[0]?.key;
    if (typeof key === 'string') fields[key] ||= issue.message;
  }
  return fields;
}

/**
 * A refused save, to throw from an action: the page shows `error` as the
 * submission's error. It changed nothing, so the page keeps the form as the
 * admin typed it: src/server-config.ts collects no fresh page data for a
 * thrown refusal, and the router revalidates nothing after an error.
 *
 * Don't add `revalidate` here: any X-Revalidate header (even an empty one)
 * makes the browser transport treat the response like a thrown redirect and
 * hand it to the action as its result, so the error never shows.
 */
export const refuse = (error: FormError, status: number) => respond(error, { status });

/** A refusal naming the fields a failed parseForm found at fault, each with its reason. */
export const refuseFields = (issues: readonly v.BaseIssue<unknown>[]) =>
  refuse({ message: m.form_invalid(), fields: fieldsAtFault(issues) }, 400);

/** A form's values, parsed, or the refusal naming the fields at fault. */
export function parseOrRefuse<S extends v.GenericSchema>(
  schema: S,
  input: unknown,
): v.InferOutput<S> {
  const parsed = parseForm(schema, input);
  if (!parsed.success) throw refuseFields(parsed.issues);
  return parsed.output;
}
