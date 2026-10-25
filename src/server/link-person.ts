// Linking a mention (a persona) to the person it is: from the link page and
// the person page (src/data/people.ts, linkPersona) and from the record form
// as a record is saved (src/data/records.ts). With 'new', the person is
// first made from the mention: its names and sex (or its role's), a
// baptised child's birth date, the deceased's death date.
import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import * as v from 'valibot';

import { type EditedRole, sexOfRole } from '~/lib/record-people';
import { type Sex } from '~/lib/record-kinds';
import { recordSearchText } from '~/lib/search-text';
import { db } from '~/server/database';
import { type PersonaRole, changeLog, person, persona } from '~/server/database/schema';
import { rowId } from '~/server/forms';

/** Who a mention is linked to, as a form posts it: a person's id, or 'new' for a person made from the mention. */
export const linkTarget = v.union([
  v.literal('new'),
  v.pipe(v.string(), v.transform(Number), rowId),
]);
export type LinkTarget = v.InferOutput<typeof linkTarget>;

/** As linkTarget, where '' (or nothing) means no link asked. */
export const optionalLinkTarget = v.pipe(
  v.optional(v.string(), ''),
  v.union([
    v.pipe(
      v.literal(''),
      v.transform(() => null),
    ),
    linkTarget,
  ]),
);

interface By {
  userId: string;
  now: Date;
}

/** What a person made from a mention takes from it. */
export interface MentionValues {
  id: number;
  role: PersonaRole;
  sex: Sex | null;
  nameRu: string | null;
  nameFi: string | null;
  birthDate: string | null;
  deathDate: string | null;
  /** The record's date and, for a baptism, the birth date it gives. */
  recordDate: string | null;
  recordBirthDate: string | null;
}

/** Creates a person from a mention and logs it; returns the person's id. */
export async function createPersonFrom(mention: MentionValues, by: By): Promise<number> {
  const values = {
    sex: mention.sex ?? sexOfRole[mention.role as EditedRole] ?? null,
    nameRu: mention.nameRu,
    nameFi: mention.nameFi,
    birthDate:
      mention.birthDate ?? (mention.role === 'child' ? (mention.recordBirthDate ?? null) : null),
    deathDate: mention.deathDate ?? (mention.role === 'deceased' ? mention.recordDate : null),
  };
  const [created] = await db
    .insert(person)
    .values({
      ...values,
      searchText: recordSearchText([values.nameRu, values.nameFi]) || null,
      createdBy: by.userId,
      updatedAt: by.now,
      updatedBy: by.userId,
    })
    .returning({ id: person.id });
  await db.insert(changeLog).values({
    userId: by.userId,
    entity: 'person',
    entityId: created.id,
    action: 'create',
    after: { ...values, fromPersonaId: mention.id },
  });
  return created.id;
}

/** The statements that link an unlinked mention to a person, with their log entry (for one batch). */
export function linkStatements(mentionId: number, personId: number, by: By) {
  return [
    db
      .update(persona)
      .set({ personId, updatedAt: by.now, updatedBy: by.userId })
      .where(and(eq(persona.id, mentionId), isNull(persona.personId))),
    db.insert(changeLog).values({
      userId: by.userId,
      entity: 'persona',
      entityId: mentionId,
      action: 'update',
      before: { id: mentionId, personId: null },
      after: { id: mentionId, personId },
    }),
  ] as const;
}
