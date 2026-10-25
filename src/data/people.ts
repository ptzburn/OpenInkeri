// The people pages' data: server functions ('use server') behind router
// queries and actions, like ./sources.ts. A person is one real individual:
// the mentions (personas) of them in records that an admin linked together.
// Their family isn't entered: ~/lib/person-family reads it from the records
// that name them. Reading people is for signed-in users; creating, editing,
// deleting, linking and unlinking are for admins, and each writes a
// change_log entry with the change.
import { action, query } from '@solidjs/router';
import { redirect } from '@solidjs/web';
import { and, count, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import * as v from 'valibot';

import { FIELD_MAX } from '~/lib/field-limits';
import { type Family, familyOf } from '~/lib/person-family';
import {
  type MatchMention,
  type MatchReason,
  nameGroups,
  suggestionsFor,
} from '~/lib/person-match';
import { type RecordKind, type Sex, sexes } from '~/lib/record-kinds';
import { foldForSearch, recordSearchText } from '~/lib/search-text';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import { db } from '~/server/database';
import { type PersonaRole, changeLog, person, persona } from '~/server/database/schema';
import {
  fieldsAtFault,
  line,
  parseForm,
  partialDate,
  refuse,
  rowId,
  text,
  version,
} from '~/server/forms';
import { isAdmin } from '~/server/auth';
import { adminOnly, signedIn } from '~/server/guards';
import { createPersonFrom, linkStatements, linkTarget } from '~/server/link-person';

export const PEOPLE_PAGE_SIZE = 50;

// The read functions' results, spelled out: the pages' types feed the
// routes' and so `paths`, which this module uses, so inferred types would be
// circular (see AccountData in ./account.ts).
type Names = { ru: string | null; fi: string | null };

export interface PersonRow {
  id: number;
  name: Names;
  sex: Sex | null;
  birthDate: string | null;
  deathDate: string | null;
  /** How many mentions in records are linked to them. */
  mentions: number;
}

export interface PeopleData {
  total: number;
  page: number;
  pages: number;
  people: PersonRow[];
}

/** One mention of a person: what one record says. */
export interface PersonMention {
  personaId: number;
  recordId: number;
  kind: RecordKind;
  role: PersonaRole;
  /** The record's date: baptised, married, died, or the list's date. */
  date: string | null;
  /** A baptised child's birth date. */
  birthDate: string | null;
  /** The name as this record writes it. */
  name: Names;
  age: string | null;
  /** Where they lived, or the record's place. */
  place: Names | null;
  placeAsWritten: string | null;
}

export interface PersonData {
  id: number;
  version: number;
  sex: Sex | null;
  name: Names;
  birthDate: string | null;
  deathDate: string | null;
  note: string | null;
  /** Oldest first; undated last. */
  mentions: PersonMention[];
  family: Family;
}

export interface PersonEditData {
  id: number;
  version: number;
  sex: Sex | null;
  nameRu: string | null;
  nameFi: string | null;
  birthDate: string | null;
  deathDate: string | null;
  note: string | null;
  mentions: number;
}

/** An unlinked mention that could be the person, and why it was suggested. */
export interface PersonSuggestion {
  mention: PersonMention;
  score: number;
  reasons: MatchReason[];
}

/** The mention an admin links on the link page, and the people it could be. */
export interface LinkData {
  mention: PersonMention & { personId: number | null };
  /** The search the candidates match: the one asked, else the mention's given name. */
  search: string;
  candidates: PersonRow[];
}

const searchTextOfPerson = (names: { nameRu: string | null; nameFi: string | null }) =>
  recordSearchText([names.nameRu, names.nameFi]) || null;

// %, _ and \ in a search are literal characters, not patterns.
const likeFolded = (search: string) => `%${foldForSearch(search).replace(/[\\%_]/g, '\\$&')}%`;

const personRowColumns = {
  id: true,
  nameRu: true,
  nameFi: true,
  sex: true,
  birthDate: true,
  deathDate: true,
} as const;

// The filter for people whose names contain `search` (all when it's empty).
// The relational query aliases its tables, so the filter takes the table it
// is applied to.
const nameFilter = (search: string) => (table: typeof person) =>
  foldForSearch(search) ? sql`${table.searchText} like ${likeFolded(search)} escape '\\'` : sql`1`;

// People matching `filter`, by Russian name, with their mention counts.
async function findPeople(
  filter: ReturnType<typeof nameFilter>,
  limit: number,
  offset = 0,
): Promise<PersonRow[]> {
  const rows = await db.query.person.findMany({
    where: { RAW: filter },
    orderBy: { nameRu: 'asc', nameFi: 'asc', id: 'asc' },
    limit,
    offset,
    columns: personRowColumns,
  });
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({ personId: persona.personId, n: count() })
        .from(persona)
        .where(inArray(persona.personId, ids))
        .groupBy(persona.personId)
    : [];
  const mentions = new Map(counts.map((c) => [c.personId, c.n]));
  return rows.map(({ nameRu, nameFi, ...r }) => ({
    ...r,
    name: { ru: nameRu, fi: nameFi },
    mentions: mentions.get(r.id) ?? 0,
  }));
}

/**
 * One page of people, by Russian name, optionally narrowed to those whose
 * names contain `search` (case-insensitive, ё = е). `page` counts from 1 and
 * is clamped to the pages there are.
 */
export const getPeople = query(async (search: string, page: number): Promise<PeopleData> => {
  'use server';
  signedIn();
  const filter = nameFilter(search);
  const total = await db.$count(person, filter(person));
  const pages = Math.max(1, Math.ceil(total / PEOPLE_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const people = await findPeople(filter, PEOPLE_PAGE_SIZE, (current - 1) * PEOPLE_PAGE_SIZE);
  return { total, page: current, pages, people };
}, 'people');

// Mentions as the person page and the link page show them.
async function loadMentions(
  where: { personId: number } | { id: number } | { id: { in: number[] } },
) {
  const rows = await db.query.persona.findMany({
    where,
    columns: {
      id: true,
      recordId: true,
      role: true,
      personId: true,
      nameRu: true,
      nameFi: true,
      givenRu: true,
      givenFi: true,
      ageText: true,
      residenceText: true,
    },
    with: {
      residence: { columns: { nameRu: true, nameFi: true } },
      record: {
        columns: { id: true, date: true, placeText: true },
        with: {
          source: { columns: { kind: true } },
          place: { columns: { nameRu: true, nameFi: true } },
          baptism: { columns: { birthDate: true } },
        },
      },
    },
  });
  return rows.map((p) => {
    const place = p.residence ?? p.record.place;
    const mention: PersonMention = {
      personaId: p.id,
      recordId: p.recordId,
      kind: p.record.source.kind,
      role: p.role,
      date: p.record.date,
      birthDate: p.role === 'child' ? (p.record.baptism?.birthDate ?? null) : null,
      name: { ru: p.nameRu, fi: p.nameFi },
      age: p.ageText,
      place: place ? { ru: place.nameRu, fi: place.nameFi } : null,
      placeAsWritten: p.residence ? p.residenceText : p.record.placeText,
    };
    return { mention, personId: p.personId, given: p.givenRu ?? p.givenFi };
  });
}

// Oldest first, by birth for a baptised child; undated last.
const whenOf = (m: PersonMention) => m.birthDate ?? m.date ?? '9999';
const yearOf = (date: string | null) => (date ? Number(date.slice(0, 4)) : null);

/** One person with their mentions and the family their records name, or null if there is none. */
export const getPerson = query(async (id: number): Promise<PersonData | null> => {
  'use server';
  signedIn();
  const personId = v.parse(rowId, id);
  const found = await db.query.person.findFirst({
    where: { id: personId },
    columns: { ...personRowColumns, version: true, note: true },
  });
  if (!found) return null;

  const mentions = (await loadMentions({ personId }))
    .map((found) => found.mention)
    .sort((a, b) => whenOf(a).localeCompare(whenOf(b)));

  // Everyone named in the person's records, and the records' years.
  const recordIds = [...new Set(mentions.map((m) => m.recordId))];
  const others = recordIds.length
    ? await db.query.persona.findMany({
        where: { recordId: { in: recordIds } },
        columns: {
          id: true,
          recordId: true,
          role: true,
          personId: true,
          nameRu: true,
          nameFi: true,
        },
        with: { person: { columns: { nameRu: true, nameFi: true } } },
      })
    : [];
  const years = new Map(mentions.map((m) => [m.recordId, yearOf(m.date)]));
  const family = familyOf(
    personId,
    others.map((p) => ({
      id: p.id,
      recordId: p.recordId,
      role: p.role,
      personId: p.personId,
      name: p.person
        ? { ru: p.person.nameRu, fi: p.person.nameFi }
        : { ru: p.nameRu, fi: p.nameFi },
    })),
    (recordId) => years.get(recordId) ?? null,
  );

  const { nameRu, nameFi, ...rest } = found;
  return { ...rest, name: { ru: nameRu, fi: nameFi }, mentions, family };
}, 'person');

async function loadPerson(id: number) {
  return db.query.person.findFirst({
    where: { id },
    columns: {
      id: true,
      version: true,
      sex: true,
      nameRu: true,
      nameFi: true,
      birthDate: true,
      deathDate: true,
      note: true,
    },
  });
}

const countMentions = (id: number) => db.$count(persona, eq(persona.personId, id));

/** One person for their edit page, with how many mentions are linked, or null if there is none. */
export const getPersonEdit = query(async (id: number): Promise<PersonEditData | null> => {
  'use server';
  adminOnly();
  const personId = v.parse(rowId, id);
  const [row, mentions] = await Promise.all([loadPerson(personId), countMentions(personId)]);
  return row ? { ...row, mentions } : null;
}, 'person-edit');

/**
 * The mention an admin is linking, and the people it could be: those whose
 * names contain `search`, or, when it's empty, the mention's given name.
 * Null when there is no such mention.
 */
export const getLinkCandidates = query(
  async (personaId: number, search: string): Promise<LinkData | null> => {
    'use server';
    adminOnly();
    const [found] = await loadMentions({ id: v.parse(rowId, personaId) });
    if (!found) return null;
    const { given, personId } = found;
    const mention = { ...found.mention, personId };
    const asked = v.parse(v.pipe(v.string(), v.maxLength(FIELD_MAX.search)), search).trim();
    const used = asked || given || mention.name.ru || mention.name.fi || '';
    const candidates = await findPeople(nameFilter(used), PEOPLE_PAGE_SIZE);
    return { mention, search: used, candidates };
  },
  'link-candidates',
);

// --- Suggestions ------------------------------------------------------------------

// What the matching reads of a mention (~/lib/person-match), with its record.
const matchColumns = {
  id: true,
  recordId: true,
  role: true,
  sex: true,
  birthDate: true,
  deathDate: true,
  ageText: true,
  givenRu: true,
  givenFi: true,
  patronymicRu: true,
  patronymicFi: true,
  surnameRu: true,
  surnameFi: true,
  maidenRu: true,
  maidenFi: true,
  residenceId: true,
} as const;
const matchRecord = {
  columns: { date: true, placeId: true },
  with: { baptism: { columns: { birthDate: true } } },
} as const;

/**
 * The unlinked mentions that could be this person, best first (at most 20),
 * each with why: see ~/lib/person-match. Candidates share a given name with
 * one of the person's mentions (found through the folded given names), are
 * of the same sex or unknown, and aren't lay baptizers (who are unnamed).
 * Suggestions are for admins, who link: anyone else signed in gets none
 * rather than a redirect, so the person page can preload them for everyone.
 */
export const getPersonSuggestions = query(async (id: number): Promise<PersonSuggestion[]> => {
  'use server';
  if (!isAdmin(signedIn())) return [];
  const personId = v.parse(rowId, id);
  const found = await db.query.person.findFirst({
    where: { id: personId },
    columns: { sex: true, birthDate: true, deathDate: true },
  });
  if (!found) return [];
  // The name forms the registers write for one another: the given names
  // mentions give in both languages, seen together at least twice (once
  // may be a slip).
  const [own, pairs] = await Promise.all([
    db.query.persona.findMany({
      where: { personId },
      columns: matchColumns,
      with: { record: matchRecord },
    }),
    db
      .select({ ru: persona.givenRuFolded, fi: persona.givenFiFolded })
      .from(persona)
      .where(and(isNotNull(persona.givenRuFolded), isNotNull(persona.givenFiFolded)))
      .groupBy(persona.givenRuFolded, persona.givenFiFolded)
      .having(sql`count(*) >= 2`),
  ]);
  const groups = nameGroups(pairs.map((p) => [p.ru!, p.fi!]));
  const givens = [
    ...new Set(
      own
        .flatMap((p) => [p.givenRu, p.givenFi])
        .filter((g): g is string => !!g)
        .map(foldForSearch)
        .flatMap(groups.forms),
    ),
  ];
  if (!givens.length) return [];

  // Mentions sharing a given name, unlinked, of a sex that fits.
  const sex = found.sex ?? own.find((p) => p.sex)?.sex ?? null;
  const candidateFilter = (table: typeof persona) =>
    and(
      isNull(table.personId),
      sql`${table.role} <> 'lay_baptizer'`,
      sql`(${inArray(table.givenRuFolded, givens)} or ${inArray(table.givenFiFolded, givens)})`,
      sex ? sql`(${table.sex} is null or ${table.sex} = ${sex})` : undefined,
    )!;
  const [candidates, places] = await Promise.all([
    db.query.persona.findMany({
      where: { RAW: candidateFilter },
      columns: matchColumns,
      with: { record: matchRecord },
    }),
    db.query.place.findMany({
      columns: { id: true, nameRu: true, nameFi: true, latitude: true, longitude: true },
    }),
  ]);

  // The fathers in the records of the person's and the candidates' child
  // and deceased mentions: they give those mentions their patronymic and
  // surname.
  const fatherless = [...own, ...candidates]
    .filter((p) => p.role === 'child' || p.role === 'deceased')
    .map((p) => p.recordId);
  const fathers = new Map<number, MatchMention['father']>();
  if (fatherless.length) {
    const rows = await db.query.persona.findMany({
      where: {
        role: 'father',
        RAW: (table) =>
          sql`${table.recordId} in (select ${persona.recordId} from ${persona} where ${and(
            or(eq(persona.personId, personId), candidateFilter(persona)),
            sql`${persona.role} in ('child', 'deceased')`,
          )})`,
      },
      columns: { recordId: true, givenRu: true, givenFi: true, surnameRu: true, surnameFi: true },
    });
    for (const { recordId, ...father } of rows) fathers.set(recordId, father);
  }

  const placeOf = new Map(
    places.map((p) => [
      p.id,
      { id: p.id, name: { ru: p.nameRu, fi: p.nameFi }, lat: p.latitude, lon: p.longitude },
    ]),
  );
  const asMatch = ({ id, record, residenceId, ...p }: (typeof own)[number]): MatchMention => {
    const placeId = residenceId ?? record.placeId;
    return {
      ...p,
      personaId: id,
      date: record.date,
      birthDate: p.birthDate ?? (p.role === 'child' ? (record.baptism?.birthDate ?? null) : null),
      father: fathers.get(p.recordId) ?? null,
      place: placeId ? (placeOf.get(placeId) ?? null) : null,
    };
  };

  const matches = suggestionsFor(own.map(asMatch), found, candidates.map(asMatch), { groups });
  if (!matches.length) return [];
  const shown = new Map(
    (await loadMentions({ id: { in: matches.map((m) => m.personaId) } })).map((f) => [
      f.mention.personaId,
      f.mention,
    ]),
  );
  return matches.flatMap(({ personaId, score, reasons }) => {
    const mention = shown.get(personaId);
    return mention ? [{ mention, score, reasons }] : [];
  });
}, 'person-suggestions');

// --- Editing a person --------------------------------------------------------------

const form = v.pipe(
  v.object({
    id: v.pipe(v.string(), v.transform(Number), rowId),
    version,
    sex: v.pipe(
      v.optional(v.string(), ''),
      v.transform((s) => s || null),
      v.nullable(v.picklist(sexes)),
    ),
    nameRu: line(),
    nameFi: line(),
    birthDate: partialDate,
    deathDate: partialDate,
    note: text,
  }),
  v.forward(
    v.check(
      (p) => !!(p.nameRu || p.nameFi),
      () => m.person_name_required(),
    ),
    ['nameRu'],
  ),
);

/**
 * Saves the edit page's form over a person, then redirects to their page.
 * Refused, with the fields at fault, when a value doesn't read or both
 * names are empty, and when the person changed since the page loaded them.
 * (People are created from a mention, by linkPersona.)
 */
export const savePerson = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const parsed = parseForm(form, Object.fromEntries(formData));
  if (!parsed.success) {
    throw refuse({ message: m.form_invalid(), fields: fieldsAtFault(parsed.issues) }, 400);
  }
  const { id, version, ...fields } = parsed.output;
  const before = await loadPerson(id);
  if (!before) throw refuse({ message: m.person_missing() }, 404);
  if (before.version !== version) throw refuse({ message: m.person_edit_conflict() }, 409);

  const values = { ...fields, searchText: searchTextOfPerson(fields) };
  try {
    await db.batch([
      db
        .update(person)
        .set({ ...values, version: before.version + 1, updatedAt: new Date(), updatedBy: user.id })
        .where(and(eq(person.id, id), eq(person.version, before.version))),
      db.insert(changeLog).values({
        userId: user.id,
        entity: 'person',
        entityId: id,
        action: 'update',
        before,
        after: { ...before, ...fields, version: before.version + 1 },
      }),
    ]);
  } catch (error) {
    console.error('Saving a person failed', error);
    throw refuse({ message: m.form_failed() }, 500);
  }
  throw redirect(paths.people(id)());
}, 'save-person');

const deletion = v.object({
  id: v.pipe(v.string(), v.transform(Number), rowId),
  version,
  confirm: v.literal('on'),
});

/**
 * Deletes the edit page's person once its confirm box is ticked, then
 * redirects to the people list. Their mentions stay in their records,
 * unlinked (on delete set null); change_log keeps which they were. Refused,
 * like a save, when the person changed since the page loaded them.
 */
export const deletePerson = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const parsed = v.safeParse(deletion, Object.fromEntries(formData));
  if (!parsed.success) throw refuse({ message: m.person_delete_unconfirmed() }, 400);
  const { id, version } = parsed.output;

  const before = await loadPerson(id);
  if (!before) throw refuse({ message: m.person_missing() }, 404);
  if (before.version !== version) throw refuse({ message: m.person_edit_conflict() }, 409);
  const linked = await db.select({ id: persona.id }).from(persona).where(eq(persona.personId, id));

  try {
    await db.batch([
      db.delete(person).where(and(eq(person.id, id), eq(person.version, version))),
      db.insert(changeLog).values({
        userId: user.id,
        entity: 'person',
        entityId: id,
        action: 'delete',
        before: { ...before, personaIds: linked.map((p) => p.id) },
      }),
    ]);
  } catch (error) {
    console.error('Deleting a person failed', error);
    throw refuse({ message: m.person_delete_failed() }, 500);
  }
  throw redirect(paths.people());
}, 'delete-person');

// --- Linking mentions --------------------------------------------------------------

const linking = v.object({
  persona: v.pipe(v.string(), v.transform(Number), rowId),
  // A person's id, or 'new' for a new person made from the mention.
  person: linkTarget,
});

/**
 * Links a mention to a person, then redirects to the person's page. With
 * person 'new', first creates the person from the mention: its names and
 * sex (or its role's), a baptised child's birth date, the deceased's death
 * date. Refused when the mention is already linked (unlink it first), and
 * when the person already has a mention in the same record: one record
 * names one person once.
 */
export const linkPersona = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const parsed = v.safeParse(linking, Object.fromEntries(formData));
  if (!parsed.success) throw refuse({ message: m.form_invalid() }, 400);
  const input = parsed.output;

  const mention = await db.query.persona.findFirst({
    where: { id: input.persona },
    columns: {
      id: true,
      recordId: true,
      role: true,
      sex: true,
      nameRu: true,
      nameFi: true,
      birthDate: true,
      deathDate: true,
      personId: true,
    },
    with: {
      record: {
        columns: { date: true },
        with: { baptism: { columns: { birthDate: true } } },
      },
    },
  });
  if (!mention) throw refuse({ message: m.person_link_missing() }, 404);
  if (mention.personId !== null) throw refuse({ message: m.person_link_already() }, 409);

  let personId: number;
  const by = { userId: user.id, now: new Date() };
  if (input.person === 'new') {
    const { record, ...values } = mention;
    personId = await createPersonFrom(
      { ...values, recordDate: record.date, recordBirthDate: record.baptism?.birthDate ?? null },
      by,
    );
  } else {
    personId = input.person;
    const target = await db.query.person.findFirst({
      where: { id: personId },
      columns: { id: true },
    });
    if (!target) throw refuse({ message: m.person_missing() }, 404);
    const sameRecord = await db.$count(
      persona,
      and(eq(persona.recordId, mention.recordId), eq(persona.personId, personId)),
    );
    if (sameRecord) throw refuse({ message: m.person_link_same_record() }, 409);
  }

  try {
    await db.batch(linkStatements(mention.id, personId, by));
  } catch (error) {
    console.error('Linking a mention failed', error);
    throw refuse({ message: m.form_failed() }, 500);
  }
  throw redirect(paths.people(personId)());
}, 'link-persona');

const unlinking = v.object({
  persona: v.pipe(v.string(), v.transform(Number), rowId),
  person: v.pipe(v.string(), v.transform(Number), rowId),
});

/**
 * Unlinks a mention from a person (the mention stays in its record), then
 * redirects to the person's page. Nothing changes when the mention isn't
 * linked to that person any more.
 */
export const unlinkPersona = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const parsed = v.safeParse(unlinking, Object.fromEntries(formData));
  if (!parsed.success) throw refuse({ message: m.form_invalid() }, 400);
  const { persona: personaId, person: personId } = parsed.output;

  const linked = await db.$count(
    persona,
    and(eq(persona.id, personaId), eq(persona.personId, personId)),
  );
  if (linked) {
    try {
      await db.batch([
        db
          .update(persona)
          .set({ personId: null, updatedAt: new Date(), updatedBy: user.id })
          .where(and(eq(persona.id, personaId), eq(persona.personId, personId))),
        db.insert(changeLog).values({
          userId: user.id,
          entity: 'persona',
          entityId: personaId,
          action: 'update',
          before: { id: personaId, personId },
          after: { id: personaId, personId: null },
        }),
      ]);
    } catch (error) {
      console.error('Unlinking a mention failed', error);
      throw refuse({ message: m.form_failed() }, 500);
    }
  }
  throw redirect(paths.people(personId)());
}, 'unlink-persona');
