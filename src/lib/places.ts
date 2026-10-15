// The villages pages' data: server functions ('use server') behind router
// queries, like ./records.ts. The list is for signed-in users; creating and
// editing places is for admins.
//
// A save writes the place, its spellings, a change_log entry and the
// records it touches in one D1 batch. Records it touches:
//   - a rename refreshes the search_text of the records linked to the place
//     (it holds the place's name, see ~/lib/search-text);
//   - a spelling added to the place links the records that have that
//     village as written but no place yet, unless another place has the
//     same spelling (then which one is meant stays for an admin to pick).
import { action, query } from '@solidjs/router';
import { redirect } from '@solidjs/web';
import { and, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import * as v from 'valibot';

import {
  type CoordinateStatus,
  type PlaceKind,
  coordinateStatuses,
  parseCoordinates,
  placeKinds,
} from '~/lib/place-kinds';
import { recordSearchText } from '~/lib/search-text';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import { db } from '~/server/database';
import { changeLog, place, placeAlias, record } from '~/server/database/schema';
import {
  collapse,
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
}

export interface ParishOption {
  id: number;
  name: string;
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

/** What a component's getPlaces read holds (undefined while redirecting). */
export type PlaceList = PlaceListData | undefined;

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

/** One place for its edit page, or null if there is none. */
export const getPlaceEdit = query(async (id: number): Promise<PlaceEditData | null> => {
  'use server';
  adminOnly();
  const found = await loadPlace(v.parse(rowId, id));
  if (!found) return null;
  const { aliases, ...rest } = found;
  return { ...rest, spellings: aliases.map((a) => a.name) };
}, 'place-edit');

/** What a component's getPlaceEdit read holds (undefined while redirecting). */
export type PlaceEdit = PlaceEditData | null | undefined;

/** The parishes a place can belong to. */
export const getParishes = query(async (): Promise<ParishOption[]> => {
  'use server';
  adminOnly();
  const parishes = await db.query.parish.findMany({
    columns: { id: true, nameRu: true },
    orderBy: { nameRu: 'asc' },
  });
  return parishes.map((p) => ({ id: p.id, name: p.nameRu }));
}, 'parishes');

export type Parishes = ParishOption[] | undefined;

// --- The form ----------------------------------------------------------------------

const form = v.object({
  // Where the list was (search, parish filter), to return there after
  // saving. The redirect is built from these, never taken whole from the
  // request.
  returnQ: v.optional(v.pipe(v.string(), v.maxLength(200))),
  returnParish: v.optional(v.pipe(v.string(), v.regex(/^[1-9]\d{0,8}$|^$/))),
  id: optionalId, // empty for a new place
  version,
  nameRu: requiredLine(),
  nameFi: line(),
  kind: v.picklist(placeKinds),
  parishId: optionalId,
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
    v.check((list) => list.every((s) => s.length <= 200)),
  ),
});

/**
 * Creates a place (no id in the form) or saves the edit page's form over
 * one, then redirects to the villages list (with the search and parish
 * filter it came from).
 * Refused, with the fields at fault, when a value doesn't read; and when the
 * place changed since the page loaded it (its version moved on).
 *
 * Coordinates without a status count as approximate; no coordinates are
 * always unknown.
 */
export const savePlace = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const parsed = v.safeParse(form, Object.fromEntries(formData));
  if (!parsed.success) {
    throw refuse({ message: m.form_invalid(), fields: fieldsAtFault(parsed.issues) }, 400);
  }
  const input = parsed.output;

  const before = input.id ? await loadPlace(input.id) : null;
  if (input.id && !before) throw refuse({ message: m.place_edit_missing() }, 404);
  if (before && before.version !== input.version) {
    throw refuse({ message: m.place_edit_conflict() }, 409);
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
    parishId: input.parishId,
    latitude: input.coordinates?.lat ?? null,
    longitude: input.coordinates?.lng ?? null,
    coordinateStatus,
    note: input.note,
  };
  const now = new Date();
  const stamp = { updatedAt: now, updatedBy: user.id };

  // A new place gets its id first: its spellings and records point to it.
  let id = input.id;
  if (!id) {
    const [created] = await db
      .insert(place)
      .values({ ...fields, createdBy: user.id, ...stamp })
      .returning({ id: place.id });
    id = created.id;
  }

  const statements = [];
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

  // Records whose search_text changes: those linked to a renamed place, and
  // those an added spelling links. Only spellings no other place has link.
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
              ...(renamed ? [{ placeId: id }] : []),
              ...(linking.length
                ? [{ placeId: { isNull: true as const }, placeText: { in: linking } }]
                : []),
            ],
          },
          columns: { id: true, version: true, placeId: true, placeText: true },
          with: { personas: { columns: { nameRu: true, nameFi: true }, orderBy: { id: 'asc' } } },
        })
      : [];
  const linked: number[] = [];
  for (const r of touched) {
    const links = r.placeId === null;
    if (links) linked.push(r.id);
    const searchText =
      recordSearchText([
        ...r.personas.flatMap((p) => [p.nameRu, p.nameFi]),
        r.placeText,
        input.nameRu,
      ]) || null;
    statements.push(
      db
        .update(record)
        // A rename changes no field of the record itself: only its search
        // text follows, without a new version.
        .set(
          links
            ? { placeId: id, searchText, version: r.version + 1, ...stamp }
            : { searchText, ...stamp },
        )
        .where(eq(record.id, r.id)),
    );
    if (links) {
      statements.push(
        db.insert(changeLog).values({
          userId: user.id,
          entity: 'record',
          entityId: r.id,
          action: 'update',
          before: { placeId: null, version: r.version },
          after: { placeId: id, version: r.version + 1 },
        }),
      );
    }
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
    // A new place whose spellings couldn't be written goes again.
    if (!before) await db.delete(place).where(eq(place.id, id));
    throw refuse({ message: m.form_failed() }, 500);
  }
  throw redirect(
    paths.places.villages({
      q: input.returnQ || undefined,
      parish: input.returnParish || undefined,
    }),
  );
}, 'save-place');
