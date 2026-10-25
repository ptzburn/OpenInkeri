// Rows a form creates while naming them: a locality, a clergyman or a
// relation typed into a record's form, a parish typed into a source's, the
// church locality typed into a parish's. The lookup field offers it when the
// value as written names no row; ticked, the form posts "<field>Create=on"
// and the new row's fields as "<field>New.<column>" (src/components/
// lookup-field.tsx), and the save creates the row before its own batch, so
// the record, source or parish can point to it. Only 'use server' bodies use
// this, so Valibot stays out of the browser bundle.
import 'server-only';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';

import { type PlaceKind, placeKinds } from '~/lib/place-kinds';
import { db } from '~/server/database';
import { changeLog, clergy, parish, place, placeAlias, term } from '~/server/database/schema';
import { finnishName, line, optionalId, parseForm, russianName } from '~/server/forms';

/** The box that asks for a new row: posted as 'on' when ticked, not at all otherwise. */
export const createFlag = v.optional(v.literal('on'));

// An unticked box isn't posted at all.
const checkbox = v.pipe(
  v.optional(v.string(), ''),
  v.transform((s) => s === 'on'),
);

/** What the forms post for a new row of each kind, by column. */
export const newPlace = {
  nameRu: russianName(),
  nameFi: finnishName(),
  kind: v.optional(v.picklist(placeKinds), 'village'),
  parishId: optionalId,
};
export const newClergy = { nameRu: russianName(), nameFi: finnishName() };
export const newRelation = { ru: russianName(), fi: line(), en: line() };
export const newParish = {
  nameRu: russianName(),
  nameFi: finnishName(),
  /** Also a locality of the same name, as the parish church's. */
  church: checkbox,
};

/**
 * Reads a new row's fields, posted as "<prefix>.<column>", into an object by
 * column. A failed parse's issues name the posted fields, for fieldsAtFault.
 */
export function parseNewRow<E extends v.ObjectEntries>(
  columns: E,
  prefix: string,
  entries: Record<string, unknown>,
):
  | { success: true; output: v.InferOutput<v.ObjectSchema<E, undefined>> }
  | { success: false; issues: readonly v.BaseIssue<unknown>[] } {
  const schema = v.object(
    Object.fromEntries(Object.entries(columns).map(([column, s]) => [`${prefix}.${column}`, s])),
  );
  const parsed = parseForm(schema, entries);
  if (!parsed.success) return parsed;
  return {
    success: true,
    output: Object.fromEntries(
      Object.entries(parsed.output).map(([key, value]) => [key.slice(prefix.length + 1), value]),
    ) as v.InferOutput<v.ObjectSchema<E, undefined>>,
  };
}

/** Who creates the row, and when. */
export interface By {
  userId: string;
  now: Date;
}

const audit = (by: By) => ({ createdBy: by.userId, updatedAt: by.now, updatedBy: by.userId });

/** A row created for a form, with the statements that go in the form's batch (its log, spellings). */
export interface Created {
  id: number;
  /** Its names and spellings, so another value in the same form that names it links to it. */
  spellings: string[];
  statements: Statement[];
  /** The rows inserted for it (none for a term that existed), to remove if the form's batch fails. */
  inserted: { table: keyof typeof tables; id: number }[];
}
type Statement = Parameters<typeof db.batch>[0][number];

const logCreate = (entity: string, entityId: number, after: object, by: By) =>
  db.insert(changeLog).values({ userId: by.userId, entity, entityId, action: 'create', after });

const names = (...values: (string | null | undefined)[]) => [
  ...new Set(values.filter((s): s is string => !!s)),
];

/** Inserts a place and returns its id; the caller logs it (see createPlace). */
export async function insertPlace(
  values: Omit<typeof place.$inferInsert, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  by: By,
) {
  const [created] = await db
    .insert(place)
    .values({ ...values, ...audit(by) })
    .returning({ id: place.id });
  return created.id;
}

/**
 * A locality named in a form. The value as written becomes one of its
 * spellings when it is neither of its names, so records keep linking to it.
 */
export async function createPlace(
  fields: { nameRu: string; nameFi: string | null; kind: PlaceKind; parishId: number | null },
  by: By,
  asWritten: string | null = null,
): Promise<Created> {
  const id = await insertPlace(fields, by);
  const spellings =
    asWritten && asWritten !== fields.nameRu && asWritten !== fields.nameFi ? [asWritten] : [];
  return {
    id,
    spellings: names(fields.nameRu, fields.nameFi, ...spellings),
    statements: [
      ...spellings.map((name) => db.insert(placeAlias).values({ placeId: id, name })),
      logCreate('place', id, { ...fields, spellings }, by),
    ],
    inserted: [{ table: 'place', id }],
  };
}

export async function createClergy(
  fields: { nameRu: string; nameFi: string | null },
  by: By,
): Promise<Created> {
  const [created] = await db
    .insert(clergy)
    .values({ ...fields, ...audit(by) })
    .returning({ id: clergy.id });
  return {
    id: created.id,
    spellings: names(fields.nameRu, fields.nameFi),
    statements: [logCreate('clergy', created.id, fields, by)],
    inserted: [{ table: 'clergy', id: created.id }],
  };
}

/**
 * A household or farm relation. A term's Russian name is unique in its
 * vocabulary, so one that exists already is linked to rather than refused.
 */
export async function createRelation(
  fields: { ru: string; fi: string | null; en: string | null },
  by: By,
): Promise<Created> {
  const existing = await db.query.term.findFirst({
    where: { vocabulary: 'relation', ru: fields.ru },
    columns: { id: true, ru: true, fi: true, en: true },
  });
  if (existing) {
    return {
      id: existing.id,
      spellings: names(existing.ru, existing.fi, existing.en),
      statements: [],
      inserted: [],
    };
  }
  const values = { vocabulary: 'relation' as const, ...fields };
  const [created] = await db
    .insert(term)
    .values({ ...values, ...audit(by) })
    .returning({ id: term.id });
  return {
    id: created.id,
    spellings: names(fields.ru, fields.fi, fields.en),
    statements: [logCreate('term', created.id, values, by)],
    inserted: [{ table: 'term', id: created.id }],
  };
}

/**
 * A parish named in a source's form, with (when asked) a locality of the
 * same name as its church: the usual case, where the church village gives
 * the parish its name.
 */
export async function createParish(
  fields: { nameRu: string; nameFi: string | null; church: boolean },
  by: By,
): Promise<Created> {
  const { church, ...values } = fields;
  const [created] = await db
    .insert(parish)
    .values({ ...values, ...audit(by) })
    .returning({ id: parish.id });
  const statements: Statement[] = [];
  const inserted: Created['inserted'] = [{ table: 'parish', id: created.id }];
  let churchPlaceId: number | null = null;
  if (church) {
    const village = await createPlace({ ...values, kind: 'village', parishId: created.id }, by);
    churchPlaceId = village.id;
    statements.push(
      ...village.statements,
      db.update(parish).set({ churchPlaceId }).where(eq(parish.id, created.id)),
    );
    inserted.push(...village.inserted);
  }
  statements.push(logCreate('parish', created.id, { ...values, churchPlaceId }, by));
  return { id: created.id, spellings: names(values.nameRu, values.nameFi), statements, inserted };
}

const tables = { place, clergy, term, parish } as const;

/** Removes the rows created for a form whose batch then failed, so the save can go again. */
export async function deleteCreated(created: Created[]) {
  for (const { table, id } of created.flatMap((c) => c.inserted).reverse()) {
    await db.delete(tables[table]).where(eq(tables[table].id, id));
  }
}
