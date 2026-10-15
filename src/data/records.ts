// The records pages' data: server functions ('use server') behind router
// queries and actions, like ./users.ts. Reading records is for signed-in
// users: a signed-out visitor is redirected to sign-in, which also makes the
// read the page's guard. Editing is for admins.
//
// The edit page's form (src/components/baptism-edit-form.tsx) reads a
// record with getBaptismEdit and the places and clergy to choose from with
// getBaptismEditOptions, and saves through saveBaptism. A save covers the
// record, its baptism details and its child, father and mother, and goes to
// D1 as one batch (one transaction) with a change_log entry holding the
// record before and after. record.raw, the row as first transcribed, is
// never edited.
import { action, query } from '@solidjs/router';
import { redirect } from '@solidjs/web';
import { and, count, eq, sql } from 'drizzle-orm';
import * as v from 'valibot';

import { FIELD_MAX } from '~/lib/field-limits';
import { parsePartialDate } from '~/lib/format';
import {
  type RecordKind,
  baptismLocations,
  recordKinds,
  recordStatuses,
  sexes,
} from '~/lib/record-kinds';
import { foldForSearch, recordSearchText } from '~/lib/search-text';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import { db } from '~/server/database';
import {
  type PersonaRole,
  changeLog,
  persona,
  record,
  recordBaptism,
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
 * Only baptisms have columns on the page yet: the other kinds' fields are
 * read here once their registers are imported.
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
      personas: { columns: { role: true, nameRu: true, nameFi: true }, orderBy: { id: 'asc' } },
    },
  });

  const named = (personas: (typeof rows)[number]['personas'], role: string) => {
    const persona = personas.find((p) => p.role === role);
    return persona ? { ru: persona.nameRu, fi: persona.nameFi } : null;
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
      baptismDate: r.date,
      birthDate: r.baptism?.birthDate ?? null,
      stillborn: r.baptism?.stillborn ?? false,
      multipleBirth: r.baptism?.multipleBirth ?? null,
      illegitimate: r.baptism?.illegitimate ?? false,
      village: r.place ? { ru: r.place.nameRu, fi: r.place.nameFi } : null,
      villageAsWritten: r.placeText,
      child: named(r.personas, 'child'),
      father: named(r.personas, 'father'),
      mother: named(r.personas, 'mother'),
      note: r.note,
    })),
  };
}, 'records');

/** One row of the records list. */
export type RecordRow = Awaited<ReturnType<typeof getRecords>>['records'][number];

// --- Editing a baptism -------------------------------------------------------------

/** The roles the edit form edits, one person each: persona roles, checked against the schema's. */
export const editedRoles = ['child', 'father', 'mother'] as const satisfies readonly PersonaRole[];
export type EditedRole = (typeof editedRoles)[number];

/** A person's name fields, as written and in parts, in both languages. */
export const nameFields = [
  'nameRu',
  'givenRu',
  'patronymicRu',
  'surnameRu',
  'maidenRu',
  'nameFi',
  'givenFi',
  'patronymicFi',
  'surnameFi',
  'maidenFi',
] as const;

// The read functions' results, spelled out: the edit page's types feed the
// routes' and so `paths`, which this module uses, so inferred types would be
// circular (see AccountData in ./account.ts).
export interface BaptismEditPerson extends Record<(typeof nameFields)[number], string | null> {
  id: number;
  role: string;
  sex: (typeof sexes)[number] | null;
  deathDate: string | null;
  origin: string | null;
}

export interface BaptismEditData {
  id: number;
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
    emergencyDate: string | null;
    multipleBirth: number | null;
    illegitimate: boolean;
    stillborn: boolean;
  } | null;
  people: Record<EditedRole, BaptismEditPerson | null>;
}

export interface BaptismEditOptionsData {
  places: { id: number; name: string; parish: string | null }[];
  clergy: { id: number; name: string }[];
}

const personaColumns = {
  id: true,
  role: true,
  sex: true,
  nameRu: true,
  givenRu: true,
  patronymicRu: true,
  surnameRu: true,
  maidenRu: true,
  nameFi: true,
  givenFi: true,
  patronymicFi: true,
  surnameFi: true,
  maidenFi: true,
  deathDate: true,
  origin: true,
} as const;

// A baptism as the edit form edits it, and as change_log records it.
async function loadBaptism(id: number) {
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
      personas: { columns: personaColumns, orderBy: { id: 'asc' } },
    },
  });
}

/** One baptism record for the edit page, or null if there is none. */
export const getBaptismEdit = query(async (id: number): Promise<BaptismEditData | null> => {
  'use server';
  adminOnly();
  const found = await loadBaptism(v.parse(rowId, id));
  if (!found || found.source.kind !== 'baptisms') return null;
  const { source: _, personas, ...rest } = found;
  // The first person in each edited role (a record names one of each).
  const people = Object.fromEntries(
    editedRoles.map((role) => [role, personas.find((p) => p.role === role) ?? null]),
  ) as Record<EditedRole, BaptismEditPerson | null>;
  return { ...rest, people };
}, 'baptism-edit');

/** The places and clergy an edited record can point to, by name. */
export const getBaptismEditOptions = query(async (): Promise<BaptismEditOptionsData> => {
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
}, 'baptism-edit-options');

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

const personFields = (role: EditedRole) => ({
  ...Object.fromEntries(nameFields.map((f) => [`${role}.${f}`, text])),
  ...(role === 'child'
    ? { [`${role}.sex`]: choice(sexes), [`${role}.deathDate`]: date }
    : { [`${role}.origin`]: text }),
});

const form = v.object({
  // Where the list was (kind, search, page), to return there after saving.
  // The redirect is built from these, never taken whole from the request.
  returnKind: v.optional(v.picklist(recordKinds)),
  returnQ: v.optional(v.pipe(v.string(), v.maxLength(FIELD_MAX.search))),
  returnPage: v.optional(v.pipe(v.string(), v.regex(/^[1-9]\d{0,5}$/))),
  id: v.pipe(v.string(), v.transform(Number), rowId),
  version,
  status: v.picklist(recordStatuses),
  date,
  birthDate: date,
  emergencyDate: date,
  placeId: optionalId,
  placeText: text,
  note: text,
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
  ...personFields('child'),
  ...personFields('father'),
  ...personFields('mother'),
});

// The values of one person in the parsed form.
function personValues(input: Record<string, unknown>, role: EditedRole) {
  const pick = (field: string) => (input[`${role}.${field}`] ?? null) as string | null;
  return {
    ...Object.fromEntries(nameFields.map((f) => [f, pick(f)])),
    ...(role === 'child'
      ? { sex: pick('sex') as (typeof sexes)[number] | null, deathDate: pick('deathDate') }
      : { origin: pick('origin') }),
  } as Record<(typeof nameFields)[number], string | null> & {
    sex?: (typeof sexes)[number] | null;
    deathDate?: string | null;
    origin?: string | null;
  };
}

/**
 * Saves the edit page's form over a baptism record, then redirects to the
 * records list where the admin came from (the redirect revalidates, so the
 * list shows the change). Refused, with the fields at fault, when a value
 * doesn't read; and when the record changed since the page loaded it (its
 * version moved on), so one admin's save doesn't silently undo another's.
 * The check reads the version just before the batch, so two saves within
 * the same moment could still both pass.
 *
 * A person whose fields are all emptied is removed from the record; one
 * given a name where there was none is added.
 */
export const saveBaptism = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const parsed = v.safeParse(form, Object.fromEntries(formData));
  if (!parsed.success) {
    throw refuse({ message: m.form_invalid(), fields: fieldsAtFault(parsed.issues) }, 400);
  }
  const input = parsed.output as typeof parsed.output & Record<string, unknown>;

  const before = await loadBaptism(input.id);
  if (!before || before.source.kind !== 'baptisms') {
    throw refuse({ message: m.record_edit_missing() }, 404);
  }
  if (before.version !== input.version) {
    throw refuse({ message: m.record_edit_conflict() }, 409);
  }

  const now = new Date();
  const stamp = { updatedAt: now, updatedBy: user.id };
  const statements = [];
  const people = editedRoles.map((role) => ({
    role,
    values: personValues(input, role),
    current: before.personas.find((p) => p.role === role) ?? null,
  }));

  for (const { role, values, current } of people) {
    const empty = Object.values(values).every((value) => value === null);
    if (current && empty) {
      statements.push(db.delete(persona).where(eq(persona.id, current.id)));
    } else if (current) {
      statements.push(
        db
          .update(persona)
          .set({ ...values, ...stamp })
          .where(eq(persona.id, current.id)),
      );
    } else if (!empty) {
      const sex = role === 'father' ? 'male' : role === 'mother' ? 'female' : (values.sex ?? null);
      statements.push(
        db.insert(persona).values({
          recordId: input.id,
          role,
          ...values,
          sex,
          createdBy: user.id,
          ...stamp,
        }),
      );
    }
  }

  const baptism = {
    birthDate: input.birthDate,
    officiantText: input.officiantText,
    officiantId: input.officiantId,
    location: input.location,
    emergencyDate: input.emergencyDate,
    multipleBirth: input.multipleBirth,
    illegitimate: input.illegitimate,
    stillborn: input.stillborn,
  };
  statements.push(
    db
      .insert(recordBaptism)
      .values({ recordId: input.id, ...baptism })
      .onConflictDoUpdate({ target: recordBaptism.recordId, set: baptism }),
  );

  // search_text: every name in the record (people the form doesn't edit,
  // like a lay baptizer, too), the village as written and its place's name.
  const placeName = input.placeId
    ? (await db.query.place.findFirst({ where: { id: input.placeId }, columns: { nameRu: true } }))
        ?.nameRu
    : null;
  const others = before.personas.filter((p) => !editedRoles.includes(p.role as EditedRole));
  const names = [
    ...others.flatMap((p) => [p.nameRu, p.nameFi]),
    ...people.flatMap(({ values }) => [values.nameRu, values.nameFi]),
  ];
  const fields = {
    status: input.status,
    date: input.date,
    placeId: input.placeId,
    placeText: input.placeText,
    note: input.note,
    searchText: recordSearchText([...names, input.placeText, placeName]) || null,
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
        baptism: { ...before.baptism, ...baptism },
        people: Object.fromEntries(people.map(({ role, values }) => [role, values])),
      },
    }),
  );

  try {
    await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  } catch (error) {
    console.error('Saving a baptism failed', error);
    throw refuse({ message: m.form_failed() }, 500);
  }
  throw redirect(
    paths.records({
      kind: input.returnKind === 'baptisms' ? undefined : input.returnKind, // the default
      q: input.returnQ || undefined,
      page: input.returnPage,
    }),
  );
}, 'save-baptism');
