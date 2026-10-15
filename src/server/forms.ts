// What the admins' edit forms share on the server: Valibot fields for the
// values a form posts (all strings), and how a refused save answers. Only
// 'use server' bodies use these, so Valibot stays out of the browser bundle.
import 'server-only';
import { respond } from '@solidjs/web';
import * as v from 'valibot';

import { FIELD_MAX } from '~/lib/field-limits';
import type { FormError } from '~/lib/form-error';

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

/** A text field that keeps its line breaks (notes): trimmed, null when empty. */
export const text = v.pipe(
  v.optional(v.string(), ''),
  v.trim(),
  v.maxLength(FIELD_MAX.text),
  v.transform((s) => s || null),
);

/** A row id: a positive integer. */
export const rowId = v.pipe(v.number(), v.integer(), v.minValue(1));

/** A <select> of ids, where '' is "none" (null); also the id of a form's row, empty when it creates one. */
export const optionalId = v.pipe(
  v.optional(v.string(), ''),
  v.transform((s) => (s === '' ? null : Number(s))),
  v.nullable(rowId),
);

/** The version a form's row was loaded at (0 for a new row), for the conflict check. */
export const version = v.pipe(
  v.optional(v.string(), '0'),
  v.transform(Number),
  v.number(),
  v.integer(),
);

/** The form fields a failed parse found at fault, by name. */
export function fieldsAtFault(issues: readonly v.BaseIssue<unknown>[]): string[] {
  const keys = issues.map((issue) => issue.path?.[0]?.key);
  return [...new Set(keys.filter((key): key is string => typeof key === 'string'))];
}

/**
 * A refused save, to throw from an action. It changed nothing, so it
 * revalidates no query and the page keeps the form as the admin typed it
 * (by default an action's response revalidates every query, which would
 * reload the row into the form).
 */
export const refuse = (error: FormError, status: number) =>
  respond(error, { status, revalidate: [] });
