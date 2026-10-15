// The parishes pages' data: server functions ('use server') behind router
// queries, like ./places.ts. The list is for signed-in users; creating and
// editing parishes is for admins. A save writes the parish and a change_log
// entry in one D1 batch. (The parishes a place can pick from are
// getParishes in ./places.ts.)
import { action, query } from '@solidjs/router';
import { redirect } from '@solidjs/web';
import { and, count, eq, isNotNull } from 'drizzle-orm';
import * as v from 'valibot';

import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import { db } from '~/server/database';
import { changeLog, parish, place, source } from '~/server/database/schema';
import {
  fieldsAtFault,
  line,
  optionalId,
  refuse,
  requiredLine,
  rowId,
  text,
  version,
} from '~/server/forms';
import { adminOnly, signedIn } from '~/server/guards';

// The read functions' results, spelled out: the pages' types feed the
// routes' and so `paths`, which this module uses, so inferred types would be
// circular (see AccountData in ./account.ts).
export interface ParishRow {
  id: number;
  nameRu: string;
  nameFi: string | null;
  note: string | null;
  villages: number;
  sources: number;
}

export interface ParishEditData {
  id: number;
  version: number;
  nameRu: string;
  nameFi: string | null;
  note: string | null;
}

/** Every parish, by Russian name, with how many places and registers belong to it. */
export const getParishList = query(async (): Promise<ParishRow[]> => {
  'use server';
  signedIn();
  const [parishes, places, sources] = await Promise.all([
    db.query.parish.findMany({ columns: { id: true, nameRu: true, nameFi: true, note: true } }),
    db
      .select({ parishId: place.parishId, n: count() })
      .from(place)
      .where(isNotNull(place.parishId))
      .groupBy(place.parishId),
    db
      .select({ parishId: source.parishId, n: count() })
      .from(source)
      .where(isNotNull(source.parishId))
      .groupBy(source.parishId),
  ]);
  const placeCounts = new Map(places.map((row) => [row.parishId, row.n]));
  const sourceCounts = new Map(sources.map((row) => [row.parishId, row.n]));
  return parishes
    .map((p) => ({
      ...p,
      villages: placeCounts.get(p.id) ?? 0,
      sources: sourceCounts.get(p.id) ?? 0,
    }))
    .sort((a, b) => a.nameRu.localeCompare(b.nameRu, 'ru'));
}, 'parish-list');

/** What a component's getParishList read holds (undefined while redirecting). */
export type ParishList = ParishRow[] | undefined;

async function loadParish(id: number) {
  return db.query.parish.findFirst({
    where: { id },
    columns: { id: true, version: true, nameRu: true, nameFi: true, note: true },
  });
}

/** One parish for its edit page, or null if there is none. */
export const getParishEdit = query(async (id: number): Promise<ParishEditData | null> => {
  'use server';
  adminOnly();
  return (await loadParish(v.parse(rowId, id))) ?? null;
}, 'parish-edit');

/** What a component's getParishEdit read holds (undefined while redirecting). */
export type ParishEdit = ParishEditData | null | undefined;

// --- The form ----------------------------------------------------------------------

const form = v.object({
  id: optionalId, // empty for a new parish
  version,
  nameRu: requiredLine(),
  nameFi: line(),
  note: text,
});

/**
 * Creates a parish (no id in the form) or saves the edit page's form over
 * one, then redirects to the parishes list. Refused, with the fields at
 * fault, when a value doesn't read; and when the parish changed since the
 * page loaded it (its version moved on).
 */
export const saveParish = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const parsed = v.safeParse(form, Object.fromEntries(formData));
  if (!parsed.success) {
    throw refuse({ message: m.form_invalid(), fields: fieldsAtFault(parsed.issues) }, 400);
  }
  const { id, version, ...fields } = parsed.output;

  const before = id ? await loadParish(id) : null;
  if (id && !before) throw refuse({ message: m.parish_edit_missing() }, 404);
  if (before && before.version !== version) {
    throw refuse({ message: m.parish_edit_conflict() }, 409);
  }

  const stamp = { updatedAt: new Date(), updatedBy: user.id };
  try {
    if (before) {
      await db.batch([
        db
          .update(parish)
          .set({ ...fields, version: before.version + 1, ...stamp })
          .where(and(eq(parish.id, before.id), eq(parish.version, before.version))),
        db.insert(changeLog).values({
          userId: user.id,
          entity: 'parish',
          entityId: before.id,
          action: 'update',
          before,
          after: { ...before, ...fields, version: before.version + 1 },
        }),
      ]);
    } else {
      // The change_log entry needs the new id, so it is written after the
      // insert rather than in one batch with it.
      const [created] = await db
        .insert(parish)
        .values({ ...fields, createdBy: user.id, ...stamp })
        .returning({ id: parish.id });
      await db.insert(changeLog).values({
        userId: user.id,
        entity: 'parish',
        entityId: created.id,
        action: 'create',
        after: fields,
      });
    }
  } catch (error) {
    console.error('Saving a parish failed', error);
    throw refuse({ message: m.form_failed() }, 500);
  }
  throw redirect(paths.places.parishes());
}, 'save-parish');
