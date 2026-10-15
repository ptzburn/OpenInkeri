// The records pages' data: server functions ('use server') behind router
// queries and actions, like ./users.ts. Reading records is for signed-in
// users: a signed-out visitor is redirected to sign-in, which also makes the
// read the page's guard. Editing is for admins.
//
// The edit page's form (src/components/record-edit-form.tsx) reads a
// baptism, marriage or death record with getRecordEdit and the places and
// clergy to choose from with getRecordEditOptions, and saves through
// saveRecord. A save covers the record, its kind's details (record_baptism,
// record_death) and the people the form edits (~/lib/record-people), and
// goes to D1 as one batch (one transaction) with a change_log entry holding
// the record before and after. record.raw, the row as first transcribed, is
// never edited.
import { action, query } from '@solidjs/router';
import { redirect } from '@solidjs/web';
import { and, count, eq, sql } from 'drizzle-orm';
import * as v from 'valibot';

import { FIELD_MAX } from '~/lib/field-limits';
import { parsePartialDate } from '~/lib/format';
import {
  type BaptismLocation,
  type EditableKind,
  type RecordKind,
  type Sex,
  baptismLocations,
  isEditableKind,
  recordKinds,
  recordStatuses,
  sexes,
} from '~/lib/record-kinds';
import {
  type EditedRole,
  type NameField,
  type PersonField,
  editedRoles,
  nameFields,
  personFieldsOf,
  sexOfRole,
} from '~/lib/record-people';
import { foldForSearch, searchTextOf } from '~/lib/search-text';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import { db } from '~/server/database';
import {
  type PersonaRole,
  changeLog,
  persona,
  record,
  recordBaptism,
  recordDeath,
  source,
} from '~/server/database/schema';
import { fieldsAtFault, optionalId, refuse, rowId, text, version } from '~/server/forms';
import { adminOnly, signedIn } from '~/server/guards';

export const RECORDS_PAGE_SIZE = 50;

/**
 * One page of records of one kind, in register order, optionally narrowed to
 * those whose names or village contain `search` (case-insensitive, ё = е).
 * `page` counts from 1 and is clamped to the pages there are. Also returns
 * how many records each kind has, whatever the search, for the kind tabs.
 *
 * Each row carries the fields of every listed kind (baptisms, marriages,
 * deaths); the page shows the current kind's.
 */
export const getRecords = query(async (kind: RecordKind, search: string, page: number) => {
  'use server';
  signedIn();
  kind = v.parse(v.picklist(recordKinds), kind);
  const folded = foldForSearch(search);
  // %, _ and \ in the search are literal characters, not patterns.
  const pattern = `%${folded.replace(/[\\%_]/g, '\\$&')}%`;
  // The relational query aliases its tables, so the filter takes the table
  // it is applied to.
  const filter = (table: typeof record) =>
    and(
      sql`${table.sourceId} in (select ${source.id} from ${source} where ${source.kind} = ${kind})`,
      folded ? sql`${table.searchText} like ${pattern} escape '\\'` : undefined,
    )!;

  const totals = await db
    .select({ kind: source.kind, records: count() })
    .from(record)
    .innerJoin(source, eq(record.sourceId, source.id))
    .groupBy(source.kind);
  const counts = Object.fromEntries(
    recordKinds.map((k) => [k, totals.find((t) => t.kind === k)?.records ?? 0]),
  ) as Record<RecordKind, number>;

  const total = await db.$count(record, filter(record));
  const pages = Math.max(1, Math.ceil(total / RECORDS_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);

  const rows = await db.query.record.findMany({
    where: { RAW: filter },
    orderBy: { id: 'asc' },
    limit: RECORDS_PAGE_SIZE,
    offset: (current - 1) * RECORDS_PAGE_SIZE,
    columns: { id: true, status: true, date: true, placeText: true, note: true },
    with: {
      place: { columns: { nameRu: true, nameFi: true } },
      baptism: {
        columns: { birthDate: true, stillborn: true, multipleBirth: true, illegitimate: true },
      },
      death: { columns: { burialDate: true, causeText: true, stillborn: true } },
      personas: {
        columns: { role: true, nameRu: true, nameFi: true, ageText: true, residenceText: true },
        with: { residence: { columns: { nameRu: true, nameFi: true } } },
        orderBy: { id: 'asc' },
      },
    },
  });

  // The first person in a role: names, age and where they lived.
  const named = (personas: (typeof rows)[number]['personas'], role: PersonaRole) => {
    const p = personas.find((p) => p.role === role);
    return p
      ? {
          ru: p.nameRu,
          fi: p.nameFi,
          age: p.ageText,
          residence: p.residence ? { ru: p.residence.nameRu, fi: p.residence.nameFi } : null,
          residenceAsWritten: p.residenceText,
        }
      : null;
  };

  return {
    kind,
    counts,
    total,
    page: current,
    pages,
    records: rows.map((r) => ({
      id: r.id,
      lost: r.status === 'lost',
      // Baptised, married or died.
      date: r.date,
      birthDate: r.baptism?.birthDate ?? null,
      stillborn: r.baptism?.stillborn ?? r.death?.stillborn ?? false,
      multipleBirth: r.baptism?.multipleBirth ?? null,
      illegitimate: r.baptism?.illegitimate ?? false,
      burialDate: r.death?.burialDate ?? null,
      cause: r.death?.causeText ?? null,
      // Where the people lived; for a death, where it happened.
      village: r.place ? { ru: r.place.nameRu, fi: r.place.nameFi } : null,
      villageAsWritten: r.placeText,
      child: named(r.personas, 'child'),
      father: named(r.personas, 'father'),
      mother: named(r.personas, 'mother'),
      groom: named(r.personas, 'groom'),
      bride: named(r.personas, 'bride'),
      deceased: named(r.personas, 'deceased'),
      note: r.note,
    })),
  };
}, 'records');

/** One row of the records list. */
export type RecordRow = Awaited<ReturnType<typeof getRecords>>['records'][number];

// --- Editing a record --------------------------------------------------------------

// The read functions' results, spelled out: the edit page's types feed the
// routes' and so `paths`, which this module uses, so inferred types would be
// circular (see AccountData in ./account.ts).
export interface RecordEditPerson extends Record<NameField, string | null> {
  id: number;
  role: string;
  sex: (typeof sexes)[number] | null;
  deathDate: string | null;
  origin: string | null;
  ageText: string | null;
  rankText: string | null;
  religionText: string | null;
  civilStatusText: string | null;
  residenceText: string | null;
  residenceId: number | null;
  birthplaceText: string | null;
  birthplaceId: number | null;
}

export interface RecordEditData {
  id: number;
  kind: EditableKind;
  version: number;
  status: (typeof recordStatuses)[number];
  date: string | null;
  placeText: string | null;
  placeId: number | null;
  note: string | null;
  baptism: {
    birthDate: string | null;
    officiantText: string | null;
    officiantId: number | null;
    location: (typeof baptismLocations)[number] | null;
    locationPlaceId: number | null;
    emergencyDate: string | null;
    multipleBirth: number | null;
    illegitimate: boolean;
    stillborn: boolean;
  } | null;
  death: {
    burialDate: string | null;
    burialPlaceText: string | null;
    causeText: string | null;
    causeTermId: number | null;
    stillborn: boolean;
  } | null;
  /** The first person in each role the kind's form edits (a record names one of each). */
  people: Partial<Record<EditedRole, RecordEditPerson | null>>;
}

export interface RecordEditOptionsData {
  places: { id: number; name: string; parish: string | null }[];
  clergy: { id: number; name: string }[];
}

const personaColumns = {
  id: true,
  role: true,
  sex: true,
  ...(Object.fromEntries(nameFields.map((f) => [f, true])) as Record<NameField, true>),
  deathDate: true,
  origin: true,
  ageText: true,
  rankText: true,
  religionText: true,
  civilStatusText: true,
  residenceText: true,
  residenceId: true,
  birthplaceText: true,
  birthplaceId: true,
} as const;

// A record as the edit form edits it, and as change_log records it.
async function loadRecord(id: number) {
  return db.query.record.findFirst({
    where: { id },
    columns: {
      id: true,
      version: true,
      status: true,
      date: true,
      placeText: true,
      placeId: true,
      note: true,
    },
    with: {
      source: { columns: { kind: true } },
      baptism: { columns: { recordId: false } },
      death: { columns: { recordId: false } },
      personas: { columns: personaColumns, orderBy: { id: 'asc' } },
    },
  });
}

/** One baptism, marriage or death record for the edit page, or null if there is none. */
export const getRecordEdit = query(async (id: number): Promise<RecordEditData | null> => {
  'use server';
  adminOnly();
  const found = await loadRecord(v.parse(rowId, id));
  const kind = found?.source.kind;
  if (!found || !isEditableKind(kind)) return null;
  const { source: _, personas, ...rest } = found;
  const people = Object.fromEntries(
    editedRoles[kind].map((role: EditedRole) => [
      role,
      personas.find((p) => p.role === role) ?? null,
    ]),
  );
  return { ...rest, kind, people };
}, 'record-edit');

/** The places and clergy an edited record can point to, by name. */
export const getRecordEditOptions = query(async (): Promise<RecordEditOptionsData> => {
  'use server';
  adminOnly();
  const [places, clergy] = await Promise.all([
    db.query.place.findMany({
      columns: { id: true, nameRu: true },
      with: { parish: { columns: { nameRu: true } } },
      orderBy: { nameRu: 'asc' },
    }),
    db.query.clergy.findMany({ columns: { id: true, nameRu: true }, orderBy: { nameRu: 'asc' } }),
  ]);
  return {
    places: places.map((p) => ({ id: p.id, name: p.nameRu, parish: p.parish?.nameRu ?? null })),
    clergy: clergy.map((c) => ({ id: c.id, name: c.nameRu })),
  };
}, 'record-edit-options');

// --- The form ----------------------------------------------------------------------

// A date typed as on the page (12.3.1895, 3.1895, 1895), stored as ISO.
const date = v.pipe(
  v.optional(v.string(), ''),
  v.transform(parsePartialDate),
  v.check((d) => d !== undefined),
  v.transform((d) => d ?? null),
);
// A <select> of fixed values, where '' is "none".
const choice = <T extends readonly [string, ...string[]]>(options: T) =>
  v.pipe(
    v.optional(v.string(), ''),
    v.transform((s) => s || null),
    v.nullable(v.picklist(options)),
  );
const checkbox = v.pipe(
  v.optional(v.string()),
  v.transform((s) => s === 'on'),
);
const recordId = v.pipe(v.string(), v.transform(Number), rowId);

// What every kind's form posts.
const common = {
  // Where the list was (kind, search, page), to return there after saving.
  // The redirect is built from these, never taken whole from the request.
  returnKind: v.optional(v.picklist(recordKinds)),
  returnQ: v.optional(v.pipe(v.string(), v.maxLength(FIELD_MAX.search))),
  returnPage: v.optional(v.pipe(v.string(), v.regex(/^[1-9]\d{0,5}$/))),
  id: recordId,
  version,
  status: v.picklist(recordStatuses),
  date,
  note: text,
};

const place = { placeId: optionalId, placeText: text };

// The record's own fields and its details, by kind. A marriage has no
// place of its own: the bride and groom each have where they lived.
const kindFields = {
  baptisms: {
    ...place,
    birthDate: date,
    emergencyDate: date,
    officiantId: optionalId,
    officiantText: text,
    location: choice(baptismLocations),
    multipleBirth: v.pipe(
      v.optional(v.string(), ''),
      v.transform((s) => (s === '' ? null : Number(s))),
      v.nullable(v.picklist([2, 3])),
    ),
    illegitimate: checkbox,
    stillborn: checkbox,
  },
  marriages: {},
  deaths: {
    ...place,
    burialDate: date,
    burialPlaceText: text,
    causeText: text,
    stillborn: checkbox,
  },
} satisfies Record<EditableKind, v.ObjectEntries>;

const personField = {
  sex: choice(sexes),
  deathDate: date,
  origin: text,
  ageText: text,
  rankText: text,
  religionText: text,
  civilStatusText: text,
  residenceId: optionalId,
  residenceText: text,
  birthplaceId: optionalId,
  birthplaceText: text,
} satisfies Record<PersonField, v.GenericSchema>;

// A kind's whole form: its people's fields are named "role.field".
const formOf = (kind: EditableKind) =>
  v.object({
    ...common,
    ...kindFields[kind],
    ...Object.fromEntries(
      editedRoles[kind].flatMap((role) => [
        ...nameFields.map((f) => [`${role}.${f}`, text] as const),
        ...personFieldsOf(kind, role).map((f) => [`${role}.${f}`, personField[f]] as const),
      ]),
    ),
  });

type Values = Record<string, string | number | boolean | null>;

// The values of one person in the parsed form.
function personValues(input: Values, kind: EditableKind, role: EditedRole): Values {
  return Object.fromEntries(
    [...nameFields, ...personFieldsOf(kind, role)].map((f) => [f, input[`${role}.${f}`] ?? null]),
  );
}

/**
 * Saves the edit page's form over a baptism, marriage or death record, then
 * redirects to the records list where the admin came from (the redirect
 * revalidates, so the list shows the change). The record's kind comes from
 * the database, not the form. Refused, with the fields at fault, when a
 * value doesn't read; and when the record changed since the page loaded it
 * (its version moved on), so one admin's save doesn't silently undo
 * another's. The check reads the version just before the batch, so two
 * saves within the same moment could still both pass.
 *
 * A person whose fields are all emptied is removed from the record; one
 * given a name where there was none is added.
 */
export const saveRecord = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const entries = Object.fromEntries(formData);
  const id = v.safeParse(recordId, entries.id);
  if (!id.success) throw refuse({ message: m.form_invalid(), fields: ['id'] }, 400);

  const before = await loadRecord(id.output);
  const kind = before?.source.kind;
  if (!before || !isEditableKind(kind)) throw refuse({ message: m.record_edit_missing() }, 404);
  const parsed = v.safeParse(formOf(kind), entries);
  if (!parsed.success) {
    throw refuse({ message: m.form_invalid(), fields: fieldsAtFault(parsed.issues) }, 400);
  }
  const input = parsed.output as typeof parsed.output & Values;
  if (before.version !== input.version) {
    throw refuse({ message: m.record_edit_conflict() }, 409);
  }

  const now = new Date();
  const stamp = { updatedAt: now, updatedBy: user.id };
  const statements = [];
  const people = editedRoles[kind].map((role: EditedRole) => ({
    role,
    values: personValues(input, kind, role),
    current: before.personas.find((p) => p.role === role) ?? null,
  }));

  const kept = [];
  for (const { role, values, current } of people) {
    const empty = Object.values(values).every((value) => value === null);
    // The deceased died on the record's date.
    if (role === 'deceased' && !empty) values.deathDate = input.date;
    if (current && empty) {
      statements.push(db.delete(persona).where(eq(persona.id, current.id)));
      continue;
    }
    if (current) {
      statements.push(
        db
          .update(persona)
          .set({ ...values, ...stamp })
          .where(eq(persona.id, current.id)),
      );
    } else if (!empty) {
      statements.push(
        db.insert(persona).values({
          recordId: input.id,
          role,
          ...values,
          sex: 'sex' in values ? (values.sex as Sex | null) : (sexOfRole[role] ?? null),
          createdBy: user.id,
          ...stamp,
        }),
      );
    } else continue;
    kept.push({ ...current, ...values });
  }

  // The kind's details: one row beside the record, written whole.
  let details: { baptism?: object; death?: object } = {};
  if (kind === 'baptisms') {
    const baptism = {
      birthDate: input.birthDate as string | null,
      officiantText: input.officiantText as string | null,
      officiantId: input.officiantId as number | null,
      location: input.location as BaptismLocation | null,
      emergencyDate: input.emergencyDate as string | null,
      multipleBirth: input.multipleBirth as number | null,
      illegitimate: input.illegitimate as boolean,
      stillborn: input.stillborn as boolean,
    };
    statements.push(
      db
        .insert(recordBaptism)
        .values({ recordId: input.id, ...baptism })
        .onConflictDoUpdate({ target: recordBaptism.recordId, set: baptism }),
    );
    details = { baptism: { ...before.baptism, ...baptism } };
  } else if (kind === 'deaths') {
    const death = {
      burialDate: input.burialDate as string | null,
      burialPlaceText: input.burialPlaceText as string | null,
      causeText: input.causeText as string | null,
      stillborn: input.stillborn as boolean,
    };
    statements.push(
      db
        .insert(recordDeath)
        .values({ recordId: input.id, ...death })
        .onConflictDoUpdate({ target: recordDeath.recordId, set: death }),
    );
    details = { death: { ...before.death, ...death } };
  }

  const placed = 'placeId' in input;
  const placeId = placed ? (input.placeId as number | null) : before.placeId;
  const placeText = placed ? (input.placeText as string | null) : before.placeText;

  // search_text: every name in the record (people the form doesn't edit,
  // like a lay baptizer, too), its place and where its people lived, as
  // written and the places' names.
  const others = before.personas.filter((p) => !people.some((e) => e.current?.id === p.id));
  const everyone = [...others, ...kept] as {
    nameRu: string | null;
    nameFi: string | null;
    residenceText?: string | null;
    residenceId?: number | null;
  }[];
  const placeIds = [placeId, ...everyone.map((p) => p.residenceId)].filter(
    (n): n is number => typeof n === 'number',
  );
  const placeNames = new Map(
    placeIds.length
      ? (
          await db.query.place.findMany({
            where: { id: { in: [...new Set(placeIds)] } },
            columns: { id: true, nameRu: true },
          })
        ).map((p) => [p.id, p.nameRu])
      : [],
  );
  const fields = {
    status: input.status,
    date: input.date,
    placeId,
    placeText,
    note: input.note,
    searchText: searchTextOf({
      placeText,
      placeName: placeId ? placeNames.get(placeId) : null,
      people: everyone.map((p) => ({
        nameRu: p.nameRu,
        nameFi: p.nameFi,
        residenceText: p.residenceText,
        residenceName: p.residenceId ? placeNames.get(p.residenceId) : null,
      })),
    }),
  };
  statements.unshift(
    db
      .update(record)
      .set({ ...fields, version: before.version + 1, ...stamp })
      .where(and(eq(record.id, input.id), eq(record.version, before.version))),
  );

  const { source: _, ...beforeLog } = before;
  statements.push(
    db.insert(changeLog).values({
      userId: user.id,
      entity: 'record',
      entityId: input.id,
      action: 'update',
      before: beforeLog,
      after: {
        ...beforeLog,
        ...fields,
        version: before.version + 1,
        ...details,
        people: Object.fromEntries(people.map(({ role, values }) => [role, values])),
      },
    }),
  );

  try {
    await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  } catch (error) {
    console.error('Saving a record failed', error);
    throw refuse({ message: m.form_failed() }, 500);
  }
  throw redirect(
    paths.records({
      kind: input.returnKind === 'baptisms' ? undefined : input.returnKind, // the default
      q: input.returnQ || undefined,
      page: input.returnPage,
    }),
  );
}, 'save-record');
