// The records pages' data: server functions ('use server') behind router
// queries and actions, like ./users.ts. Reading records is for signed-in
// users: a signed-out visitor is redirected to sign-in, which also makes the
// read the page's guard. Editing is for admins.
//
// The edit page's form (src/components/record-edit-form.tsx) reads a
// record of any kind with getRecordEdit and the places, clergy and
// relations to choose from with getRecordEditOptions, and saves through
// saveRecord. A save covers the record, its kind's details (record_baptism,
// record_death, record_holding) and the people the form edits
// (~/lib/record-people), and goes to D1 as one batch (one transaction) with
// a change_log entry holding the record before and after. record.raw, the
// row as first transcribed, is never edited.
import { action, query } from '@solidjs/router';
import { redirect } from '@solidjs/web';
import { and, count, eq, sql } from 'drizzle-orm';
import * as v from 'valibot';

import { FIELD_MAX } from '~/lib/field-limits';
import {
  type BaptismLocation,
  type RecordKind,
  type Sex,
  baptismLocations,
  recordKinds,
  recordStatuses,
  sexes,
} from '~/lib/record-kinds';
import {
  type EditedRole,
  type NameField,
  type PersonField,
  editedRoles,
  isListKind,
  listFields,
  listRoles,
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
  recordHolding,
  source,
} from '~/server/database/schema';
import {
  fieldsAtFault,
  line,
  optionalId,
  parseForm,
  partialDate,
  refuse,
  rowId,
  text,
  version,
} from '~/server/forms';
import { adminOnly, signedIn } from '~/server/guards';

export const RECORDS_PAGE_SIZE = 50;

/**
 * One page of records of one kind, in register order, optionally narrowed to
 * those whose names or village contain `search` (case-insensitive, ё = е).
 * `page` counts from 1 and is clamped to the pages there are. Also returns
 * how many records each kind has, whatever the search, for the kind tabs.
 *
 * Each row carries the fields of every kind; the page shows the current
 * kind's. A list's rows (households, taxpayers' farms) carry their people.
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
      holding: { columns: { holdingNo: true, estateText: true, tenantText: true } },
      personas: {
        columns: {
          id: true,
          role: true,
          nameRu: true,
          nameFi: true,
          ageText: true,
          residenceText: true,
          relationText: true,
          hasWife: true,
          birthDate: true,
          deathDate: true,
          note: true,
          noteOriginal: true,
        },
        with: {
          residence: { columns: { nameRu: true, nameFi: true } },
          relation: { columns: { ru: true, fi: true, en: true } },
        },
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
      // A household or farm: its number, estate and tenant, and its people.
      holding: r.holding,
      members: isListKind(kind)
        ? r.personas.map((p) => ({
            id: p.id,
            ru: p.nameRu,
            fi: p.nameFi,
            relation: p.relation,
            relationAsWritten: p.relationText,
            hasWife: p.hasWife,
            birthDate: p.birthDate,
            deathDate: p.deathDate,
            note: p.note ?? p.noteOriginal,
          }))
        : [],
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
  birthDate: string | null;
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
  relationText: string | null;
  relationTermId: number | null;
  hasWife: boolean | null;
  note: string | null;
  noteOriginal: string | null;
  /** The person this mention is linked to, by the names on their page. */
  person: { id: number; name: { ru: string | null; fi: string | null } } | null;
}

export interface RecordEditData {
  /** 0 for a record not created yet. */
  id: number;
  kind: RecordKind;
  sourceId: number | null;
  /** The page as the source numbers it ("221об"). */
  page: string | null;
  /** The language of the original register: ru, fi, sv… */
  language: string | null;
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
  holding: {
    holdingNo: string | null;
    estateText: string | null;
    estatePlaceId: number | null;
    tenantText: string | null;
  } | null;
  /** A register's people: the first person in each role its form edits. */
  people: Partial<Record<EditedRole, RecordEditPerson | null>>;
  /** A list's people, all of them, in order. */
  members: RecordEditPerson[];
}

export interface RecordEditOptionsData {
  places: { id: number; name: string; parish: string | null }[];
  clergy: { id: number; name: string }[];
  /** How a person belongs to a household or farm ("Сын", "Боболь"). */
  relations: { id: number; name: string }[];
  /** The sources a record can be in: one of its own type. */
  sources: { id: number; title: string; kind: RecordKind; language: string | null }[];
}

const personaColumns = {
  id: true,
  role: true,
  sex: true,
  ...(Object.fromEntries(nameFields.map((f) => [f, true])) as Record<NameField, true>),
  birthDate: true,
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
  relationText: true,
  relationTermId: true,
  hasWife: true,
  note: true,
  noteOriginal: true,
  personId: true,
} as const;

// A record as the edit form edits it, and as change_log records it.
async function loadRecord(id: number) {
  return db.query.record.findFirst({
    where: { id },
    columns: {
      id: true,
      version: true,
      sourceId: true,
      page: true,
      status: true,
      date: true,
      placeText: true,
      placeId: true,
      note: true,
    },
    with: {
      source: { columns: { kind: true, language: true } },
      baptism: { columns: { recordId: false } },
      death: { columns: { recordId: false } },
      holding: { columns: { recordId: false } },
      personas: { columns: personaColumns, orderBy: { id: 'asc' } },
    },
  });
}

/** One record for the edit page, or null if there is none. */
export const getRecordEdit = query(async (id: number): Promise<RecordEditData | null> => {
  'use server';
  adminOnly();
  const found = await loadRecord(v.parse(rowId, id));
  if (!found) return null;
  const { source, personas: mentions, ...rest } = found;
  const kind = source.kind;
  // Each mention with the person it is linked to.
  const personIds = [
    ...new Set(mentions.flatMap((p) => (p.personId === null ? [] : [p.personId]))),
  ];
  const linked = new Map(
    personIds.length
      ? (
          await db.query.person.findMany({
            where: { id: { in: personIds } },
            columns: { id: true, nameRu: true, nameFi: true },
          })
        ).map((p) => [p.id, { id: p.id, name: { ru: p.nameRu, fi: p.nameFi } }])
      : [],
  );
  const personas: RecordEditPerson[] = mentions.map(({ personId, ...p }) => ({
    ...p,
    person: personId === null ? null : (linked.get(personId) ?? null),
  }));
  if (isListKind(kind)) {
    const members = personas.filter((p) => p.role === listRoles[kind]);
    return { ...rest, kind, language: source.language, people: {}, members };
  }
  const people = Object.fromEntries(
    editedRoles[kind].map((role: EditedRole) => [
      role,
      personas.find((p) => p.role === role) ?? null,
    ]),
  );
  return { ...rest, kind, language: source.language, people, members: [] };
}, 'record-edit');

/** The sources, places, clergy and relations an edited record can point to, by name. */
export const getRecordEditOptions = query(async (): Promise<RecordEditOptionsData> => {
  'use server';
  adminOnly();
  const [places, clergy, relations, sources] = await Promise.all([
    db.query.place.findMany({
      columns: { id: true, nameRu: true },
      with: { parish: { columns: { nameRu: true } } },
      orderBy: { nameRu: 'asc' },
    }),
    db.query.clergy.findMany({ columns: { id: true, nameRu: true }, orderBy: { nameRu: 'asc' } }),
    db.query.term.findMany({
      where: { vocabulary: 'relation' },
      columns: { id: true, ru: true },
      orderBy: { ru: 'asc' },
    }),
    db.query.source.findMany({
      columns: { id: true, title: true, kind: true, language: true },
      orderBy: { title: 'asc' },
    }),
  ]);
  return {
    places: places.map((p) => ({ id: p.id, name: p.nameRu, parish: p.parish?.nameRu ?? null })),
    clergy: clergy.map((c) => ({ id: c.id, name: c.nameRu })),
    relations: relations.map((t) => ({ id: t.id, name: t.ru })),
    sources,
  };
}, 'record-edit-options');

// --- The form ----------------------------------------------------------------------

// A <select> of fixed values, where '' is "none".
const choice = <T extends readonly [string, ...string[]]>(options: T) =>
  v.pipe(
    v.optional(v.string(), ''),
    v.transform((s) => s || null),
    v.nullable(v.picklist(options)),
  );
// An unticked box isn't posted at all: its default makes it false, where
// a bare optional would leave the key out and the update would skip it.
const checkbox = v.pipe(
  v.optional(v.string(), ''),
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
  id: optionalId, // empty for a new record
  version,
  sourceId: v.pipe(v.string(), v.transform(Number), rowId),
  page: line(),
  status: v.picklist(recordStatuses),
  date: partialDate,
  note: text,
};

const place = { placeId: optionalId, placeText: text };

// The record's own fields and its details, by kind. A marriage has no
// place of its own: the bride and groom each have where they lived.
const kindFields = {
  baptisms: {
    ...place,
    birthDate: partialDate,
    emergencyDate: partialDate,
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
    burialDate: partialDate,
    burialPlaceText: text,
    causeText: text,
    stillborn: checkbox,
  },
  households: { ...place, holdingNo: line() },
  taxpayers: {
    ...place,
    holdingNo: line(),
    estatePlaceId: optionalId,
    estateText: text,
    tenantText: text,
  },
} satisfies Record<RecordKind, v.ObjectEntries>;

const personField = {
  sex: choice(sexes),
  birthDate: partialDate,
  deathDate: partialDate,
  origin: text,
  ageText: text,
  rankText: text,
  religionText: text,
  civilStatusText: text,
  residenceId: optionalId,
  residenceText: text,
  birthplaceId: optionalId,
  birthplaceText: text,
  relationTermId: optionalId,
  relationText: text,
  hasWife: checkbox,
  note: text,
  noteOriginal: text,
} satisfies Record<PersonField, v.GenericSchema>;

// A list's form numbers its people: "members.0.nameRu", "members.0.id" (empty
// for a person added in the form). At most this many in one save.
const MAX_MEMBERS = 200;
const memberIndexes = (entries: Record<string, unknown>) =>
  [...new Set(Object.keys(entries).flatMap((key) => key.match(/^members\.(\d{1,3})\./)?.[1] ?? []))]
    .map(Number)
    .sort((a, b) => a - b);

// One person's fields, named "<prefix>.<field>".
const personEntries = (prefix: string, fields: readonly PersonField[]) => [
  ...nameFields.map((f) => [`${prefix}.${f}`, text] as const),
  ...fields.map((f) => [`${prefix}.${f}`, personField[f]] as const),
];

// A kind's whole form: a register's people are named "role.field", a
// list's "members.N.field".
const formOf = (kind: RecordKind, members: number[]) =>
  v.object({
    ...common,
    ...kindFields[kind],
    ...Object.fromEntries(
      isListKind(kind)
        ? members.flatMap((n) => [
            [`members.${n}.id`, optionalId] as const,
            ...personEntries(`members.${n}`, listFields[kind]),
          ])
        : editedRoles[kind].flatMap((role: EditedRole) =>
            personEntries(role, personFieldsOf(kind, role)),
          ),
    ),
  });

type Values = Record<string, string | number | boolean | null>;

// The values of one person in the parsed form.
const personValues = (input: Values, prefix: string, fields: readonly PersonField[]): Values =>
  Object.fromEntries([...nameFields, ...fields].map((f) => [f, input[`${prefix}.${f}`] ?? null]));

/**
 * Saves the edit page's form over a record, then redirects to the records
 * list where the admin came from (the redirect revalidates, so the list
 * shows the change). The record's kind comes from the database, not the
 * form. Refused, with the fields at fault, when a value doesn't read; and
 * when the record changed since the page loaded it (its version moved on),
 * so one admin's save doesn't silently undo another's. The check reads the
 * version just before the batch, so two saves within the same moment could
 * still both pass.
 *
 * A person whose fields are all emptied is removed from the record; one
 * given a name where there was none is added (in a list, as many as the
 * form brings).
 */
export const saveRecord = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const entries = Object.fromEntries(formData);
  const id = v.safeParse(optionalId, entries.id);
  if (!id.success) throw refuse({ message: m.form_invalid(), fields: { id: '' } }, 400);
  const sourceId = v.safeParse(recordId, entries.sourceId);
  const chosen = sourceId.success
    ? await db.query.source.findFirst({
        where: { id: sourceId.output },
        columns: { id: true, kind: true },
      })
    : null;
  if (!chosen) throw refuse({ message: m.form_invalid(), fields: { sourceId: '' } }, 400);

  // An existing record keeps its type: it can move only to another source
  // of the same type. A new one takes its source's.
  const existing = id.output ? await loadRecord(id.output) : null;
  if (id.output && !existing) throw refuse({ message: m.record_edit_missing() }, 404);
  const kind = existing?.source.kind ?? chosen.kind;
  if (chosen.kind !== kind) {
    throw refuse(
      { message: m.form_invalid(), fields: { sourceId: m.record_edit_source_kind() } },
      400,
    );
  }
  const indexes = memberIndexes(entries);
  if (indexes.length > MAX_MEMBERS) throw refuse({ message: m.form_invalid() }, 400);
  const parsed = parseForm(formOf(kind, indexes), entries);
  if (!parsed.success) {
    throw refuse({ message: m.form_invalid(), fields: fieldsAtFault(parsed.issues) }, 400);
  }
  const input = parsed.output as typeof parsed.output & Values;
  if (existing && existing.version !== input.version) {
    throw refuse({ message: m.record_edit_conflict() }, 409);
  }

  // A new record gets its id first: its details and people point to it.
  // Then the save goes on as for any record, from the empty one.
  const now = new Date();
  const stamp = { updatedAt: now, updatedBy: user.id };
  let before = existing;
  if (!before) {
    const [created] = await db
      .insert(record)
      .values({ sourceId: chosen.id, status: input.status, createdBy: user.id, ...stamp })
      .returning({ id: record.id });
    before = (await loadRecord(created.id))!;
  }
  const created = !existing;
  const rid = before.id;

  // Who the form edits: a register's roles, or a list's people by index.
  type Edited = {
    key: string;
    role: PersonaRole;
    values: Values;
    current: (typeof before.personas)[number] | null;
  };
  let edited: Edited[];
  if (isListKind(kind)) {
    const role = listRoles[kind];
    edited = indexes.map((n) => {
      const personaId = input[`members.${n}.id`] as number | null;
      return {
        key: String(n),
        role,
        values: personValues(input, `members.${n}`, listFields[kind]),
        current: personaId
          ? (before.personas.find((p) => p.id === personaId && p.role === role) ?? null)
          : null,
      };
    });
    // A person the form names who is no longer on the record: someone else
    // changed it, though its version check missed it.
    if (edited.some((e) => input[`members.${e.key}.id`] && !e.current)) {
      throw refuse({ message: m.record_edit_conflict() }, 409);
    }
  } else {
    edited = editedRoles[kind].map((role: EditedRole) => ({
      key: role,
      role,
      values: personValues(input, role, personFieldsOf(kind, role)),
      current: before.personas.find((p) => p.role === role) ?? null,
    }));
  }

  const statements = [];
  const kept = [];
  for (const { role, values, current } of edited) {
    // An unticked box says nothing either.
    const empty = Object.values(values).every((value) => value === null || value === false);
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
          recordId: rid,
          role,
          ...values,
          sex:
            'sex' in values ? (values.sex as Sex | null) : (sexOfRole[role as EditedRole] ?? null),
          createdBy: user.id,
          ...stamp,
        }),
      );
    } else continue;
    kept.push({ ...current, ...values });
  }

  // The kind's details: one row beside the record, written whole.
  let details: { baptism?: object; death?: object; holding?: object } = {};
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
        .values({ recordId: rid, ...baptism })
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
        .values({ recordId: rid, ...death })
        .onConflictDoUpdate({ target: recordDeath.recordId, set: death }),
    );
    details = { death: { ...before.death, ...death } };
  } else if (isListKind(kind)) {
    // A household has only its number; a farm also its estate and tenant.
    const holding = {
      holdingNo: input.holdingNo as string | null,
      ...(kind === 'taxpayers' && {
        estateText: input.estateText as string | null,
        estatePlaceId: input.estatePlaceId as number | null,
        tenantText: input.tenantText as string | null,
      }),
    };
    statements.push(
      db
        .insert(recordHolding)
        .values({ recordId: rid, ...holding })
        .onConflictDoUpdate({ target: recordHolding.recordId, set: holding }),
    );
    details = { holding: { ...before.holding, ...holding } };
  }

  const placed = 'placeId' in input;
  const placeId = placed ? (input.placeId as number | null) : before.placeId;
  const placeText = placed ? (input.placeText as string | null) : before.placeText;

  // search_text: every name in the record (people the form doesn't edit,
  // like a lay baptizer, too), its place and where its people lived, as
  // written and the places' names.
  const others = before.personas.filter((p) => !edited.some((e) => e.current?.id === p.id));
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
    sourceId: chosen.id,
    page: input.page as string | null,
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
      // A new record stays at its first version.
      .set({ ...fields, version: created ? before.version : before.version + 1, ...stamp })
      .where(and(eq(record.id, rid), eq(record.version, before.version))),
  );

  const { source: _, ...beforeLog } = before;
  statements.push(
    db.insert(changeLog).values({
      userId: user.id,
      entity: 'record',
      entityId: rid,
      action: created ? 'create' : 'update',
      before: created ? null : beforeLog,
      after: {
        ...beforeLog,
        ...fields,
        version: created ? before.version : before.version + 1,
        ...details,
        people: edited.map(({ key, current, values }) => ({
          key,
          id: current?.id ?? null,
          ...values,
        })),
      },
    }),
  );

  try {
    await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  } catch (error) {
    console.error('Saving a record failed', error);
    // A new record whose details or people couldn't be written goes again.
    if (created) await db.delete(record).where(eq(record.id, rid));
    throw refuse({ message: m.form_failed() }, 500);
  }
  // A new record is the last of its type, so the list opens on its last
  // page (unsearched); an edit returns to where the admin came from.
  if (created) {
    const total = await db.$count(
      record,
      sql`${record.sourceId} in (select ${source.id} from ${source} where ${source.kind} = ${kind})`,
    );
    const last = Math.ceil(total / RECORDS_PAGE_SIZE);
    throw redirect(
      paths.records({
        kind: kind === 'baptisms' ? undefined : kind,
        page: last > 1 ? String(last) : undefined,
      }),
    );
  }
  throw redirect(backToList(input));
}, 'save-record');

// The records list as a form came from it (kind, search, page). The
// redirect is built from these, never taken whole from the request.
const backToList = (input: { returnKind?: RecordKind; returnQ?: string; returnPage?: string }) =>
  paths.records({
    kind: input.returnKind === 'baptisms' ? undefined : input.returnKind, // the default
    q: input.returnQ || undefined,
    page: input.returnPage,
  });

const deletion = v.object({
  returnKind: common.returnKind,
  returnQ: common.returnQ,
  returnPage: common.returnPage,
  id: recordId,
  version,
  confirm: v.literal('on'),
});

/**
 * Deletes the edit page's record, with its details and the people it names
 * (on delete cascade), once its confirm box is ticked, then redirects to the
 * records list it came from. change_log keeps the record as it was. Refused,
 * like a save, when it changed since the page loaded it.
 */
export const deleteRecord = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const parsed = v.safeParse(deletion, Object.fromEntries(formData));
  if (!parsed.success) throw refuse({ message: m.record_delete_unconfirmed() }, 400);
  const input = parsed.output;

  const before = await loadRecord(input.id);
  if (!before) throw refuse({ message: m.record_edit_missing() }, 404);
  if (before.version !== input.version) throw refuse({ message: m.record_edit_conflict() }, 409);

  const { source: _, ...beforeLog } = before;
  try {
    await db.batch([
      db.delete(record).where(and(eq(record.id, input.id), eq(record.version, input.version))),
      db.insert(changeLog).values({
        userId: user.id,
        entity: 'record',
        entityId: input.id,
        action: 'delete',
        before: beforeLog,
      }),
    ]);
  } catch (error) {
    console.error('Deleting a record failed', error);
    throw refuse({ message: m.record_delete_failed() }, 500);
  }
  throw redirect(backToList(input));
}, 'delete-record');
