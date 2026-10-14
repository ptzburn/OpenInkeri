// Editing a baptism record: server functions for admins only. The edit
// page's form (src/components/baptism-edit-form.tsx) reads a record with
// getBaptismEdit and the places and clergy to choose from with
// getEditOptions, and saves through updateBaptism.
//
// A save covers the record, its baptism details and its child, father and
// mother, and goes to D1 as one batch (one transaction) with a change_log
// entry holding the record before and after. record.raw, the row as first
// transcribed, is never edited.
import { action, query } from '@solidjs/router';
import { getRequestEvent, redirect, respond } from '@solidjs/web';
import { and, eq } from 'drizzle-orm';
import * as v from 'valibot';

import { parsePartialDate } from '~/lib/format';
import { baptismLocations, recordKinds, recordStatuses, sexes } from '~/lib/record-kinds';
import { recordSearchText } from '~/lib/search-text';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import { isAdmin } from '~/server/auth';
import { db } from '~/server/database';
import { changeLog, persona, record, recordBaptism } from '~/server/database/schema';

/** The roles the edit form edits, one person each. */
export const editedRoles = ['child', 'father', 'mother'] as const;
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

export interface EditOptionsData {
  places: { id: number; name: string; parish: string | null }[];
  clergy: { id: number; name: string }[];
}

/** What a failed updateBaptism carries: a message, and the fields at fault. */
export interface EditError {
  message: string;
  fields?: string[];
}

function adminOnly() {
  const user = getRequestEvent()?.locals.user;
  if (!user) throw redirect(paths['sign-in']());
  if (!isAdmin(user)) throw redirect(paths());
  return user;
}

const recordId = v.pipe(v.number(), v.integer(), v.minValue(1));

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
  const found = await loadBaptism(v.parse(recordId, id));
  if (!found || found.source.kind !== 'baptisms') return null;
  const { source: _, personas, ...rest } = found;
  // The first person in each edited role (a record names one of each).
  const people = Object.fromEntries(
    editedRoles.map((role) => [role, personas.find((p) => p.role === role) ?? null]),
  ) as Record<EditedRole, BaptismEditPerson | null>;
  return { ...rest, people };
}, 'baptism-edit');

/** What a component's getBaptismEdit read holds (undefined while redirecting). */
export type BaptismEdit = BaptismEditData | null | undefined;

/** The places and clergy an edited record can point to, by name. */
export const getEditOptions = query(async (): Promise<EditOptionsData> => {
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
}, 'edit-options');

export type EditOptions = EditOptionsData | undefined;

// --- The form ----------------------------------------------------------------------

// A text field: trimmed, and null when empty.
const text = v.pipe(
  v.optional(v.string(), ''),
  v.trim(),
  v.maxLength(2000),
  v.transform((s) => s || null),
);
// A date typed as on the page (12.3.1895, 3.1895, 1895), stored as ISO.
const date = v.pipe(
  v.optional(v.string(), ''),
  v.transform(parsePartialDate),
  v.check((d) => d !== undefined),
  v.transform((d) => d ?? null),
);
// A <select> of ids or of fixed values, where '' is "none".
const ref = v.pipe(
  v.optional(v.string(), ''),
  v.transform((s) => (s === '' ? null : Number(s))),
  v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
);
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
  returnQ: v.optional(v.pipe(v.string(), v.maxLength(200))),
  returnPage: v.optional(v.pipe(v.string(), v.regex(/^[1-9]\d{0,5}$/))),
  id: v.pipe(v.string(), v.transform(Number), recordId),
  version: v.pipe(v.string(), v.transform(Number), v.number(), v.integer()),
  status: v.picklist(recordStatuses),
  date,
  birthDate: date,
  emergencyDate: date,
  placeId: ref,
  placeText: text,
  note: text,
  officiantId: ref,
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

// A refused save changed nothing: it revalidates no query, so the page
// keeps the form as the admin typed it (by default an action's response
// revalidates every query, which would reload the record into the form).
const refuse = (error: EditError, status: number) => respond(error, { status, revalidate: [] });

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
export const updateBaptism = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const parsed = v.safeParse(form, Object.fromEntries(formData));
  if (!parsed.success) {
    const fields = [
      ...new Set(
        parsed.issues.map((issue) => issue.path?.[0]?.key).filter((key) => typeof key === 'string'),
      ),
    ];
    throw refuse({ message: m.record_edit_invalid(), fields }, 400);
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
    throw refuse({ message: m.record_edit_failed() }, 500);
  }
  throw redirect(
    paths.records({
      kind: input.returnKind === 'baptisms' ? undefined : input.returnKind, // the default
      q: input.returnQ || undefined,
      page: input.returnPage,
    }),
  );
}, 'update-baptism');
