// The villages pages' data: server functions ('use server') behind router
// queries, like ./records.ts. The list is for signed-in users; creating and
// editing places is for admins.
//
// A save writes the place, its spellings, a change_log entry and the
// records it touches in one D1 batch. Records it touches:
//   - a rename refreshes the search_text of the records linked to the place,
//     as their place or where one of their people lived (it holds the
//     place's name, see ~/lib/search-text);
//   - a spelling added to the place links the records, and the people's
//     residences, that have that village as written but no place yet,
//     unless another place has the same spelling (then which one is meant
//     stays for an admin to pick).
import { action, query } from '@solidjs/router';
import { redirect } from '@solidjs/web';
import { and, count, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import * as v from 'valibot';

import { FIELD_MAX } from '~/lib/field-limits';
import { parseCoordinates } from '~/lib/coordinates';
import { type Names, placeInUse } from '~/lib/format';
import {
  type CoordinateStatus,
  type PlaceKind,
  coordinateStatuses,
  placeKinds,
} from '~/lib/place-kinds';
import { searchTextOf } from '~/lib/search-text';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import { db } from '~/server/database';
import {
  changeLog,
  parish,
  persona,
  place,
  placeAlias,
  record,
  recordBaptism,
  recordHolding,
} from '~/server/database/schema';
import {
  collapse,
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
  createParish,
  deleteCreated,
  insertPlace,
  newParish,
  parishNamed,
  parseNewRow,
} from '~/server/linked-rows';

// The read functions' results, spelled out: the pages' types feed the
// routes' and so `paths`, which this module uses, so inferred types would be
// circular (see AccountData in ./account.ts).
export interface PlaceRow {
  id: number;
  kind: PlaceKind;
  nameRu: string;
  nameFi: string | null;
  parishId: number | null;
  parish: { ru: string; fi: string | null } | null;
  latitude: number | null;
  longitude: number | null;
  coordinateStatus: CoordinateStatus;
  spellings: string[];
  records: number;
}

export interface PlaceListData {
  places: PlaceRow[];
  /** Villages as written in records that link to no place, most frequent first. */
  unlinked: { text: string; records: number }[];
}

export interface PlaceEditData {
  id: number;
  version: number;
  kind: PlaceKind;
  nameRu: string;
  nameFi: string | null;
  parishId: number | null;
  latitude: number | null;
  longitude: number | null;
  coordinateStatus: CoordinateStatus;
  note: string | null;
  spellings: string[];
  /** What still links to it: while anything does, it can't be deleted. */
  records: number;
  birthplaces: number;
  /** Parishes whose church stands here. */
  churches: number;
}

export interface PlaceOption {
  id: number;
  name: Names;
  parishId: number | null;
  parish: Names | null;
  /** Its names and the spellings records use for it, for a lookup field to link a locality as typed. */
  spellings: string[];
}

/** Every place, by Russian name, with its spellings and how many records link to it. */
export const getPlaces = query(async (): Promise<PlaceListData> => {
  'use server';
  signedIn();
  const [places, linked, unlinked] = await Promise.all([
    db.query.place.findMany({
      columns: {
        id: true,
        kind: true,
        nameRu: true,
        nameFi: true,
        parishId: true,
        latitude: true,
        longitude: true,
        coordinateStatus: true,
      },
      with: {
        parish: { columns: { nameRu: true, nameFi: true } },
        aliases: { columns: { name: true }, orderBy: { name: 'asc' } },
      },
    }),
    db
      .select({ placeId: record.placeId, records: count() })
      .from(record)
      .where(isNotNull(record.placeId))
      .groupBy(record.placeId),
    db
      .select({ text: record.placeText, records: count() })
      .from(record)
      .where(and(isNull(record.placeId), isNotNull(record.placeText)))
      .groupBy(record.placeText),
  ]);
  const counts = new Map(linked.map((row) => [row.placeId, row.records]));
  return {
    places: places
      .map(({ parish, aliases, ...p }) => ({
        ...p,
        parish: parish ? { ru: parish.nameRu, fi: parish.nameFi } : null,
        spellings: aliases.map((a) => a.name),
        records: counts.get(p.id) ?? 0,
      }))
      .sort((a, b) => a.nameRu.localeCompare(b.nameRu, 'ru')),
    unlinked: unlinked
      .filter((row): row is { text: string; records: number } => !!row.text)
      .sort((a, b) => b.records - a.records || a.text.localeCompare(b.text, 'ru')),
  };
}, 'places');

async function loadPlace(id: number) {
  return db.query.place.findFirst({
    where: { id },
    columns: {
      id: true,
      version: true,
      kind: true,
      nameRu: true,
      nameFi: true,
      parishId: true,
      latitude: true,
      longitude: true,
      coordinateStatus: true,
      note: true,
    },
    with: { aliases: { columns: { name: true }, orderBy: { name: 'asc' } } },
  });
}

/**
 * What links to a place: records (as their village, their baptism's place
 * or a household's estate) and personas born there. Deleting the place would
 * set all of these to null.
 */
async function countUses(id: number) {
  const [records, birthplaces, churches] = await Promise.all([
    db.$count(
      record,
      or(
        eq(record.placeId, id),
        inArray(
          record.id,
          db
            .select({ id: recordBaptism.recordId })
            .from(recordBaptism)
            .where(eq(recordBaptism.locationPlaceId, id)),
        ),
        inArray(
          record.id,
          db
            .select({ id: recordHolding.recordId })
            .from(recordHolding)
            .where(eq(recordHolding.estatePlaceId, id)),
        ),
        // A bride or groom who lived there.
        inArray(
          record.id,
          db.select({ id: persona.recordId }).from(persona).where(eq(persona.residenceId, id)),
        ),
      ),
    ),
    db.$count(persona, eq(persona.birthplaceId, id)),
    db.$count(parish, eq(parish.churchPlaceId, id)),
  ]);
  return { records, birthplaces, churches };
}

/** One place for its edit page, with what still links to it, or null if there is none. */
export const getPlaceEdit = query(async (id: number): Promise<PlaceEditData | null> => {
  'use server';
  adminOnly();
  const placeId = v.parse(rowId, id);
  const [found, uses] = await Promise.all([loadPlace(placeId), countUses(placeId)]);
  if (!found) return null;
  const { aliases, ...rest } = found;
  return { ...rest, spellings: aliases.map((a) => a.name), ...uses };
}, 'place-edit');

/** Every place, by both names, with its parish: a form's choices of locality. */
export const getPlaceOptions = query(async (): Promise<PlaceOption[]> => {
  'use server';
  adminOnly();
  const places = await db.query.place.findMany({
    columns: { id: true, nameRu: true, nameFi: true, parishId: true },
    with: {
      parish: { columns: { nameRu: true, nameFi: true } },
      aliases: { columns: { name: true } },
    },
    orderBy: { nameRu: 'asc' },
  });
  return places.map((p) => ({
    id: p.id,
    name: { ru: p.nameRu, fi: p.nameFi },
    parishId: p.parishId,
    parish: p.parish ? { ru: p.parish.nameRu, fi: p.parish.nameFi } : null,
    spellings: [
      ...new Set([p.nameRu, ...(p.nameFi ? [p.nameFi] : []), ...p.aliases.map((a) => a.name)]),
    ],
  }));
}, 'place-options');

// --- The form ----------------------------------------------------------------------

// Where the list was (search, parish filter), to return there after saving
// or deleting. The redirect is built from these, never taken whole from the
// request.
const returnTo = {
  returnQ: v.optional(v.pipe(v.string(), v.maxLength(FIELD_MAX.search))),
  returnParish: v.optional(v.pipe(v.string(), v.regex(/^[1-9]\d{0,8}$|^$/))),
};

/** The villages list as the form came from it. */
const backToList = (input: { returnQ?: string; returnParish?: string }) =>
  paths.places.villages({
    q: input.returnQ || undefined,
    parish: input.returnParish || undefined,
  });

const form = v.object({
  ...returnTo,
  id: optionalId, // empty for a new place
  version,
  nameRu: russianName(),
  nameFi: finnishName(),
  kind: v.picklist(placeKinds),
  // The parish as typed, the one it is linked to, and the box asking to
  // add it (its fields are read apart, see savePlace).
  parishText: line(),
  parishId: optionalId,
  parishCreate: createFlag,
  coordinates: v.pipe(
    v.optional(v.string(), ''),
    v.transform(parseCoordinates),
    v.check((c) => c !== undefined),
    v.transform((c) => c ?? null),
  ),
  coordinateStatus: v.picklist(coordinateStatuses),
  note: text,
  // One spelling a line, as written in the sources.
  spellings: v.pipe(
    v.optional(v.string(), ''),
    v.transform((s) => [...new Set(s.split('\n').map(collapse).filter(Boolean))]),
    v.check((list) => list.every((s) => s.length <= FIELD_MAX.line)),
  ),
});

/**
 * Creates a place (no id in the form) or saves the edit page's form over
 * one, then redirects to the villages list (with the search and parish
 * filter it came from). The parish typed by name links to the one it
 * names; one not known yet is created first when the form asks (without a
 * church: the place being saved may well be it, and the parish page sets it).
 * Refused, with the fields at fault, when a value doesn't read; and when the
 * place changed since the page loaded it (its version moved on).
 *
 * Coordinates without a status count as approximate; no coordinates are
 * always unknown.
 */
export const savePlace = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const entries = Object.fromEntries(formData);
  const parsed = parseForm(form, entries);
  if (!parsed.success) {
    throw refuse({ message: m.form_invalid(), fields: fieldsAtFault(parsed.issues) }, 400);
  }
  const input = parsed.output;

  const before = input.id ? await loadPlace(input.id) : null;
  if (input.id && !before) throw refuse({ message: m.place_edit_missing() }, 404);
  if (before && before.version !== input.version) {
    throw refuse({ message: m.place_edit_conflict() }, 409);
  }
  // A parish deleted since the page loaded.
  let parishId = input.parishId;
  if (
    parishId &&
    !(await db.query.parish.findFirst({ where: { id: parishId }, columns: { id: true } }))
  ) {
    throw refuse({ message: m.form_invalid(), fields: { parishId: '' } }, 400);
  }
  if (!parishId && input.parishText) parishId = await parishNamed(input.parishText);
  const now = new Date();
  const createdRows: Created[] = [];
  if (!parishId && input.parishText && input.parishCreate) {
    const newRow = parseNewRow(newParish, 'parishNew', entries);
    if (!newRow.success) {
      throw refuse({ message: m.form_invalid(), fields: fieldsAtFault(newRow.issues) }, 400);
    }
    const created = await createParish(newRow.output, { userId: user.id, now });
    createdRows.push(created);
    parishId = created.id;
  }

  const coordinateStatus: CoordinateStatus = !input.coordinates
    ? 'unknown'
    : input.coordinateStatus === 'unknown'
      ? 'approximate'
      : input.coordinateStatus;
  const fields = {
    kind: input.kind,
    nameRu: input.nameRu,
    nameFi: input.nameFi,
    parishId,
    latitude: input.coordinates?.lat ?? null,
    longitude: input.coordinates?.lng ?? null,
    coordinateStatus,
    note: input.note,
  };
  const stamp = { updatedAt: now, updatedBy: user.id };

  // A new place gets its id first: its spellings and records point to it.
  // Were the insert to fail, a parish just created for it goes too.
  let id: number;
  try {
    id = input.id ?? (await insertPlace(fields, { userId: user.id, now }));
  } catch (error) {
    console.error('Saving a place failed', error);
    await deleteCreated(createdRows);
    throw refuse({ message: m.form_failed() }, 500);
  }

  const statements = createdRows.flatMap((row) => row.statements);
  if (before) {
    statements.push(
      db
        .update(place)
        .set({ ...fields, version: before.version + 1, ...stamp })
        .where(and(eq(place.id, id), eq(place.version, before.version))),
    );
  }

  const oldSpellings = new Set(before?.aliases.map((a) => a.name) ?? []);
  const removed = [...oldSpellings].filter((s) => !input.spellings.includes(s));
  const added = input.spellings.filter((s) => !oldSpellings.has(s));
  if (removed.length) {
    statements.push(
      db
        .delete(placeAlias)
        .where(and(eq(placeAlias.placeId, id), inArray(placeAlias.name, removed))),
    );
  }
  for (const name of added) statements.push(db.insert(placeAlias).values({ placeId: id, name }));

  // Records whose search_text changes: those linked to a renamed place (as
  // the record's place or where one of its people lived), and those an added
  // spelling links. Only spellings no other place has link.
  const others = added.length
    ? await db.query.placeAlias.findMany({
        where: { name: { in: added }, placeId: { ne: id } },
        columns: { name: true },
      })
    : [];
  const linking = added.filter((s) => !others.some((o) => o.name === s));
  const renamed = !!before && before.nameRu !== input.nameRu;
  const touched =
    renamed || linking.length
      ? await db.query.record.findMany({
          where: {
            OR: [
              ...(renamed ? [{ placeId: id }, { personas: { residenceId: id } }] : []),
              ...(linking.length
                ? [
                    { placeId: { isNull: true as const }, placeText: { in: linking } },
                    {
                      personas: {
                        residenceId: { isNull: true as const },
                        residenceText: { in: linking },
                      },
                    },
                  ]
                : []),
            ],
          },
          columns: { id: true, version: true, placeId: true, placeText: true },
          with: {
            place: { columns: { nameRu: true } },
            personas: {
              columns: {
                id: true,
                nameRu: true,
                nameFi: true,
                residenceId: true,
                residenceText: true,
              },
              with: { residence: { columns: { nameRu: true } } },
              orderBy: { id: 'asc' },
            },
          },
        })
      : [];
  const links = (placeId: number | null, text: string | null) =>
    placeId === null && text !== null && linking.includes(text);
  // A place's name as it will be: this place's is the one being saved.
  const nameOf = (placeId: number | null, current: string | undefined) =>
    placeId === id ? input.nameRu : (current ?? null);
  const linked: number[] = [];
  for (const r of touched) {
    const placeId = links(r.placeId, r.placeText) ? id : r.placeId;
    const residents = r.personas.filter((p) => links(p.residenceId, p.residenceText));
    const searchText = searchTextOf({
      placeText: r.placeText,
      placeName: nameOf(placeId, r.place?.nameRu),
      people: r.personas.map((p) => {
        const residenceId = residents.includes(p) ? id : p.residenceId;
        return { ...p, residenceName: nameOf(residenceId, p.residence?.nameRu) };
      }),
    });
    // A rename changes no field of the record itself: only its search text
    // follows, without a new version. Linking changes the record.
    if (placeId === r.placeId && !residents.length) {
      statements.push(
        db
          .update(record)
          .set({ searchText, ...stamp })
          .where(eq(record.id, r.id)),
      );
      continue;
    }
    linked.push(r.id);
    statements.push(
      db
        .update(record)
        .set({ placeId, searchText, version: r.version + 1, ...stamp })
        .where(eq(record.id, r.id)),
    );
    if (residents.length) {
      statements.push(
        db
          .update(persona)
          .set({ residenceId: id, ...stamp })
          .where(
            inArray(
              persona.id,
              residents.map((p) => p.id),
            ),
          ),
      );
    }
    statements.push(
      db.insert(changeLog).values({
        userId: user.id,
        entity: 'record',
        entityId: r.id,
        action: 'update',
        before: {
          placeId: r.placeId,
          version: r.version,
          ...(residents.length && {
            residences: residents.map((p) => ({ id: p.id, residenceId: null })),
          }),
        },
        after: {
          placeId,
          version: r.version + 1,
          ...(residents.length && {
            residences: residents.map((p) => ({ id: p.id, residenceId: id })),
          }),
        },
      }),
    );
  }

  const after = { ...fields, spellings: input.spellings, linkedRecords: linked };
  statements.push(
    db.insert(changeLog).values({
      userId: user.id,
      entity: 'place',
      entityId: id,
      action: before ? 'update' : 'create',
      before: before
        ? { ...before, aliases: undefined, spellings: before.aliases.map((a) => a.name) }
        : null,
      after: before ? { ...after, version: before.version + 1 } : after,
    }),
  );

  try {
    await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  } catch (error) {
    console.error('Saving a place failed', error);
    // A new place whose spellings couldn't be written goes again, and so
    // does a parish created for it (after the place, which points to it).
    if (!before) await db.delete(place).where(eq(place.id, id));
    await deleteCreated(createdRows);
    throw refuse({ message: m.form_failed() }, 500);
  }
  throw redirect(backToList(input));
}, 'save-place');

const deletion = v.object({
  ...returnTo,
  id: v.pipe(v.string(), v.transform(Number), rowId),
  version,
  confirm: v.literal('on'),
});

/**
 * Deletes the edit page's place, with its spellings, once confirmed in its
 * dialog, then redirects to the villages list it came from. Refused while
 * records, birthplaces or parish churches still link to it (the links would quietly go
 * blank), and, like a save, when the place changed since the page loaded it.
 */
export const deletePlace = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const parsed = v.safeParse(deletion, Object.fromEntries(formData));
  if (!parsed.success) throw refuse({ message: m.place_delete_unconfirmed() }, 400);
  const input = parsed.output;

  const before = await loadPlace(input.id);
  if (!before) throw refuse({ message: m.place_edit_missing() }, 404);
  if (before.version !== input.version) throw refuse({ message: m.place_edit_conflict() }, 409);
  const inUse = placeInUse(await countUses(input.id));
  if (inUse) throw refuse({ message: inUse }, 409);

  try {
    // The spellings go with the place (on delete cascade).
    await db.batch([
      db.delete(place).where(and(eq(place.id, input.id), eq(place.version, input.version))),
      db.insert(changeLog).values({
        userId: user.id,
        entity: 'place',
        entityId: input.id,
        action: 'delete',
        before: { ...before, aliases: undefined, spellings: before.aliases.map((a) => a.name) },
      }),
    ]);
  } catch (error) {
    console.error('Deleting a place failed', error);
    throw refuse({ message: m.place_delete_failed() }, 500);
  }
  throw redirect(backToList(input));
}, 'delete-place');
