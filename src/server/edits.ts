// What the admins' save and delete actions share, over the form fields in
// ./forms.ts: the row a form edits, loaded and checked (gone: 404; changed
// since the page loaded it: 409); a row a lookup field names, resolved to
// its id or to the fields of the row to add; the change_log row every write
// leaves; a delete with its log; and the writes themselves, which log a
// failure, undo what went in ahead of the batch and refuse (500). Only 'use
// server' bodies use this, so Valibot stays out of the browser bundle.
import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as v from 'valibot';

import { m } from '~/paraglide/messages.js';
import { db } from '~/server/database';
import { type changeActions, changeLog } from '~/server/database/schema';
import { parseNewRow } from '~/server/linked-rows';
import { refuse, refuseFields, rowId, version } from '~/server/forms';

/** A table with the id and version columns the edit pages key on. */
type EditedTable = SQLiteTable & { id: SQLiteColumn; version: SQLiteColumn };

/** Who writes. */
export interface Writer {
  userId: string;
}

/** How one entity's refusals read: the row is gone (404), or it changed since the page loaded it (409). */
export interface Refusals {
  missing: () => string;
  conflict: () => string;
}

/**
 * The row a form edits, as it is now. Refused when it is gone, and when its
 * version moved on since the page loaded it, so one admin's save doesn't
 * silently undo another's.
 */
export async function rowForEdit<R extends { version: number }>(
  load: (id: number) => Promise<R | null | undefined>,
  id: number,
  loadedVersion: number,
  says: Refusals,
): Promise<R> {
  const before = await load(id);
  if (!before) throw refuse({ message: says.missing() }, 404);
  if (before.version !== loadedVersion) throw refuse({ message: says.conflict() }, 409);
  return before;
}

/** Whether a row with the id is in the table (a linked row deleted since the page loaded isn't). */
export const rowExists = async (table: SQLiteTable & { id: SQLiteColumn }, id: number) =>
  (await db.$count(table, eq(table.id, id))) > 0;

/** A row a lookup field names (src/components/lookup-field.tsx), as the form posted it. */
export interface LookupPosted {
  /** The value as written. */
  text: string | null;
  /** The row it is linked to. */
  id: number | null;
  /** The box asking to add the row, when ticked. */
  create?: 'on';
}

/**
 * The row a lookup field names: the one it is linked to (refused, naming
 * the field, when that row is gone), else the one the text names (the form
 * links as the admin types; this covers a form posted before JavaScript
 * loaded), else, when the box asking to add it is ticked, the new row's
 * fields as posted under `prefix` (refused, naming them, when they don't
 * read), for the caller to create. Neither leaves the value as written,
 * unlinked.
 */
export async function lookupRow<E extends v.ObjectEntries>(
  posted: LookupPosted,
  options: {
    /** The posted id's name, for the refusal. */
    idName: string;
    /** What the new row's fields are posted under ("parishNew"). */
    prefix: string;
    table: SQLiteTable & { id: SQLiteColumn };
    /** The one row the text names, by its spellings. */
    named: (text: string) => Promise<number | null>;
    /** The new row's fields, by column (src/server/linked-rows.ts). */
    columns: E;
    entries: Record<string, unknown>;
  },
): Promise<{ id: number | null; add: v.InferOutput<v.ObjectSchema<E, undefined>> | null }> {
  let id = posted.id;
  if (id && !(await rowExists(options.table, id))) {
    throw refuse({ message: m.form_invalid(), fields: { [options.idName]: '' } }, 400);
  }
  if (!id && posted.text) id = await options.named(posted.text);
  if (id || !posted.text || posted.create !== 'on') return { id, add: null };
  const parsed = parseNewRow(options.columns, options.prefix, options.entries);
  if (!parsed.success) throw refuseFields(parsed.issues);
  return { id: null, add: parsed.output };
}

/** The change_log row a write leaves: the row as it was and as it is. */
export const logChange = (
  by: Writer,
  entity: string,
  entityId: number,
  action: (typeof changeActions)[number],
  before: object | null,
  after: object | null = null,
) => db.insert(changeLog).values({ userId: by.userId, entity, entityId, action, before, after });

/**
 * Runs a save's or delete's writes and returns what they return. When D1
 * fails, logs it as `what`, undoes what the writes before the batch
 * inserted (`undo`) and refuses with `failed` (500). Refuse before calling
 * this, not inside `work`: a refusal thrown there would count as a failure.
 */
export async function writing<T>(
  what: string,
  work: () => Promise<T>,
  options: { undo?: () => Promise<unknown>; failed?: () => string } = {},
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    console.error(`${what} failed`, error);
    await options.undo?.();
    throw refuse({ message: (options.failed ?? m.form_failed)() }, 500);
  }
}

/** What a Delete section's form posts (src/components/form-fields.tsx), with `extra` fields (where the list was). */
export const deletionForm = <E extends v.ObjectEntries = Record<never, never>>(extra?: E) =>
  v.object({
    ...(extra ?? ({} as E)),
    id: v.pipe(v.string(), v.transform(Number), rowId),
    version,
    confirm: v.literal('on'),
  });

/** A Delete section's form, parsed; refused with `unconfirmed` when it doesn't read (the confirmation missing). */
export function parseDeletion<S extends v.GenericSchema>(
  schema: S,
  formData: FormData,
  unconfirmed: () => string,
): v.InferOutput<S> {
  const parsed = v.safeParse(schema, Object.fromEntries(formData));
  if (!parsed.success) throw refuse({ message: unconfirmed() }, 400);
  return parsed.output;
}

/**
 * Deletes the row an edit page loaded (at the version it loaded), logging
 * it as it was (`logged`, when the log keeps more than the row). Refused
 * with `failed` when D1 fails.
 */
export async function deleteRow(options: {
  table: EditedTable;
  entity: string;
  row: { id: number; version: number };
  by: Writer;
  logged?: object;
  failed: () => string;
}): Promise<void> {
  const { table, entity, row, by } = options;
  await writing(
    `Deleting a ${entity}`,
    () =>
      db.batch([
        db.delete(table).where(and(eq(table.id, row.id), eq(table.version, row.version))),
        logChange(by, entity, row.id, 'delete', options.logged ?? row),
      ]),
    { failed: options.failed },
  );
}
