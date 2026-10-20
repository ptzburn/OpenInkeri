// A person's family as the records say it: who else a record names beside
// one of the person's mentions, by the two roles. A baptism's or a death's
// child has the record's father and mother as parents; a parent has the
// other parent as spouse and the child as a child; a groom and a bride are
// spouses. Household and taxpayer lists say how people belong to the head
// of the household, not to each other, so they give no family here yet.
import type { PersonaRole } from '~/server/database/schema';

/** One person a record names, with the person it is linked to, if any. */
export interface FamilyPersona {
  id: number;
  recordId: number;
  role: PersonaRole;
  /** The person this mention is linked to. */
  personId: number | null;
  /** The names: the linked person's when there is one, else as written. */
  name: { ru: string | null; fi: string | null };
}

/** A relative: a person (several mentions merged), or one unlinked mention. */
export interface Relative {
  personId: number | null;
  name: { ru: string | null; fi: string | null };
  /** The records that name them together, oldest first. */
  recordIds: number[];
  /** The year of the first of those records, if it has a date. */
  year: number | null;
}

export interface Family {
  parents: Relative[];
  spouses: Relative[];
  children: Relative[];
}

type Kin = keyof Family;

// Who a mention's role makes the others in its record, by their roles.
const kinOf: Partial<Record<PersonaRole, Partial<Record<PersonaRole, Kin>>>> = {
  child: { father: 'parents', mother: 'parents' },
  deceased: { father: 'parents', mother: 'parents' },
  father: { mother: 'spouses', child: 'children', deceased: 'children' },
  mother: { father: 'spouses', child: 'children', deceased: 'children' },
  groom: { bride: 'spouses' },
  bride: { groom: 'spouses' },
};

/**
 * The family of person `personId`, from `personas`: everyone named in the
 * records that mention the person (their own mentions included). A relative
 * linked to a person is listed once, however many records name them; an
 * unlinked one once per mention. Each list is ordered by year.
 */
export function familyOf(
  personId: number,
  personas: FamilyPersona[],
  yearOf: (recordId: number) => number | null,
): Family {
  const found: Record<Kin, Map<string, Relative>> = {
    parents: new Map(),
    spouses: new Map(),
    children: new Map(),
  };
  for (const own of personas.filter((p) => p.personId === personId)) {
    const kins = kinOf[own.role] ?? {};
    for (const other of personas) {
      if (other.recordId !== own.recordId || other.personId === personId) continue;
      const kin = kins[other.role];
      if (!kin) continue;
      const key = other.personId === null ? `mention ${other.id}` : `person ${other.personId}`;
      const year = yearOf(other.recordId);
      const known = found[kin].get(key);
      if (!known) {
        found[kin].set(key, {
          personId: other.personId,
          name: other.name,
          recordIds: [other.recordId],
          year,
        });
      } else if (!known.recordIds.includes(other.recordId)) {
        known.recordIds.push(other.recordId);
        if (year !== null && (known.year === null || year < known.year)) known.year = year;
      }
    }
  }
  const byYear = (a: number | null, b: number | null) => (a ?? Infinity) - (b ?? Infinity);
  const ordered = (relatives: Map<string, Relative>) =>
    [...relatives.values()]
      .map((r) => ({ ...r, recordIds: r.recordIds.sort((a, b) => byYear(yearOf(a), yearOf(b))) }))
      .sort((a, b) => byYear(a.year, b.year));
  return {
    parents: ordered(found.parents),
    spouses: ordered(found.spouses),
    children: ordered(found.children),
  };
}
