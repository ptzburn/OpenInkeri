// The parishes pages' data: server functions ('use server') behind router
// queries, like ./places.ts. The list is for signed-in users; creating and
// editing parishes is for admins. A save writes the parish and a change_log
// entry in one D1 batch.
import { action, query } from '@solidjs/router';
import { redirect } from '@solidjs/web';
import { and, count, eq, isNotNull } from 'drizzle-orm';
import * as v from 'valibot';

import { parishInUse } from '~/lib/format';
import { rowsSpelled, spellingIndex } from '~/lib/spellings';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import { db } from '~/server/database';
import { changeLog, parish, place, source } from '~/server/database/schema';
import {
  fieldsAtFault,
  finnishName,
  line,
  optionalId,
  parseForm,
  refuse,
  rowId,
  russianName,
  text,
  version,
} from '~/server/forms';
import { adminOnly, signedIn } from '~/server/guards';
import {
  type Created,
  createFlag,
  createPlace,
  deleteCreated,
  newPlace,
  parseNewRow,
} from '~/server/linked-rows';

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

export interface ParishOption {
  id: number;
  name: string;
  /** Its names in both languages, for a lookup field to link a parish as typed. */
  spellings: string[];
}

export interface ParishEditData {
  id: number;
  version: number;
  nameRu: string;
  nameFi: string | null;
  /** The locality the parish church stands in. */
  churchPlaceId: number | null;
  note: string | null;
  /** How many places and registers belong to it: while any do, it can't be deleted. */
  villages: number;
  sources: number;
}

/** Every parish, by Russian name, with how many places and registers belong to it. */
export const getParishes = query(async (): Promise<ParishRow[]> => {
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
}, 'parishes');

/** The parishes a place or source can belong to, for the forms' choices. */
export const getParishOptions = query(async (): Promise<ParishOption[]> => {
  'use server';
  adminOnly();
  const parishes = await db.query.parish.findMany({
    columns: { id: true, nameRu: true, nameFi: true },
    orderBy: { nameRu: 'asc' },
  });
  return parishes.map((p) => ({
    id: p.id,
    name: p.nameRu,
    spellings: p.nameFi ? [p.nameRu, p.nameFi] : [p.nameRu],
  }));
}, 'parish-options');

async function loadParish(id: number) {
  return db.query.parish.findFirst({
    where: { id },
    columns: {
      id: true,
      version: true,
      nameRu: true,
      nameFi: true,
      churchPlaceId: true,
      note: true,
    },
  });
}

/** How many places and registers belong to a parish. */
async function countUses(id: number) {
  const [villages, sources] = await Promise.all([
    db.$count(place, eq(place.parishId, id)),
    db.$count(source, eq(source.parishId, id)),
  ]);
  return { villages, sources };
}

/** One parish for its edit page, with what still belongs to it, or null if there is none. */
export const getParishEdit = query(async (id: number): Promise<ParishEditData | null> => {
  'use server';
  adminOnly();
  const parishId = v.parse(rowId, id);
  const [row, uses] = await Promise.all([loadParish(parishId), countUses(parishId)]);
  return row ? { ...row, ...uses } : null;
}, 'parish-edit');

// --- The form ----------------------------------------------------------------------

const form = v.object({
  id: optionalId, // empty for a new parish
  version,
  nameRu: russianName(),
  nameFi: finnishName(),
  // The church's locality as typed, the one it is linked to, and the box
  // asking to add it (its fields are read apart, see saveParish).
  churchText: line(),
  churchPlaceId: optionalId,
  churchCreate: createFlag,
  note: text,
});

/**
 * Creates a parish (no id in the form) or saves the edit page's form over
 * one, then redirects to the parishes list. Refused, with the fields at
 * fault, when a value doesn't read; and when the parish changed since the
 * page loaded it (its version moved on).
 *
 * The church's locality is typed by name and linked to the locality it
 * names (the form does this as the admin types; here for a form posted
 * before JavaScript loaded); one not known yet is added in this parish when
 * the form asks (src/server/linked-rows.ts).
 */
export const saveParish = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const entries = Object.fromEntries(formData);
  const parsed = parseForm(form, entries);
  if (!parsed.success) {
    throw refuse({ message: m.form_invalid(), fields: fieldsAtFault(parsed.issues) }, 400);
  }
  const { id, version, churchText, churchCreate, ...fields } = parsed.output;

  const before = id ? await loadParish(id) : null;
  if (id && !before) throw refuse({ message: m.parish_edit_missing() }, 404);
  if (before && before.version !== version) {
    throw refuse({ message: m.parish_edit_conflict() }, 409);
  }

  // A church in a locality deleted since the page loaded.
  if (
    fields.churchPlaceId &&
    !(await db.query.place.findFirst({
      where: { id: fields.churchPlaceId },
      columns: { id: true },
    }))
  ) {
    throw refuse({ message: m.form_invalid(), fields: { churchPlaceId: '' } }, 400);
  }
  if (!fields.churchPlaceId && churchText) {
    const places = await db.query.place.findMany({
      columns: { id: true, nameRu: true, nameFi: true },
      with: { aliases: { columns: { name: true } } },
    });
    const named = rowsSpelled(
      spellingIndex(
        places.map((p) => ({
          id: p.id,
          spellings: [p.nameRu, ...(p.nameFi ? [p.nameFi] : []), ...p.aliases.map((a) => a.name)],
        })),
      ),
      churchText,
    );
    if (named.length === 1) fields.churchPlaceId = named[0];
  }
  const church =
    !fields.churchPlaceId && churchText && churchCreate
      ? parseNewRow(newPlace, 'churchNew', entries)
      : null;
  if (church && !church.success) {
    throw refuse({ message: m.form_invalid(), fields: fieldsAtFault(church.issues) }, 400);
  }

  const now = new Date();
  const by = { userId: user.id, now };
  const stamp = { updatedAt: now, updatedBy: user.id };
  const added: Created[] = [];
  let parishId = before?.id;
  try {
    // A new parish gets its id first: its church's locality belongs to it.
    if (!parishId) {
      const [created] = await db
        .insert(parish)
        .values({ ...fields, createdBy: user.id, ...stamp })
        .returning({ id: parish.id });
      parishId = created.id;
    }
    if (church?.success) {
      const village = await createPlace({ ...church.output, parishId }, by, churchText);
      added.push(village);
      fields.churchPlaceId = village.id;
    }
    const after = before ? { ...before, ...fields, version: before.version + 1 } : fields;
    await db.batch([
      before
        ? db
            .update(parish)
            .set({ ...fields, version: before.version + 1, ...stamp })
            .where(and(eq(parish.id, before.id), eq(parish.version, before.version)))
        : db.update(parish).set(fields).where(eq(parish.id, parishId)),
      db.insert(changeLog).values({
        userId: user.id,
        entity: 'parish',
        entityId: parishId,
        action: before ? 'update' : 'create',
        before,
        after,
      }),
      ...added.flatMap((row) => row.statements),
    ]);
  } catch (error) {
    console.error('Saving a parish failed', error);
    // A new parish whose church or log couldn't be written goes again.
    if (!before && parishId) await db.delete(parish).where(eq(parish.id, parishId));
    await deleteCreated(added);
    throw refuse({ message: m.form_failed() }, 500);
  }
  throw redirect(paths.places.parishes());
}, 'save-parish');

const deletion = v.object({
  id: v.pipe(v.string(), v.transform(Number), rowId),
  version,
  confirm: v.literal('on'),
});

/**
 * Deletes the edit page's parish once its confirm box is ticked, then
 * redirects to the parishes list. Refused while villages or sources still
 * belong to the parish: their links would quietly go blank (the foreign
 * keys set null), so they move elsewhere first. Also refused, like a save,
 * when the parish changed since the page loaded it.
 */
export const deleteParish = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const parsed = v.safeParse(deletion, Object.fromEntries(formData));
  if (!parsed.success) throw refuse({ message: m.parish_delete_unconfirmed() }, 400);
  const { id, version } = parsed.output;

  const before = await loadParish(id);
  if (!before) throw refuse({ message: m.parish_edit_missing() }, 404);
  if (before.version !== version) throw refuse({ message: m.parish_edit_conflict() }, 409);
  const inUse = parishInUse(await countUses(id));
  if (inUse) throw refuse({ message: inUse }, 409);

  try {
    await db.batch([
      db.delete(parish).where(and(eq(parish.id, id), eq(parish.version, version))),
      db.insert(changeLog).values({
        userId: user.id,
        entity: 'parish',
        entityId: id,
        action: 'delete',
        before,
      }),
    ]);
  } catch (error) {
    console.error('Deleting a parish failed', error);
    throw refuse({ message: m.parish_delete_failed() }, 500);
  }
  throw redirect(paths.places.parishes());
}, 'delete-parish');
