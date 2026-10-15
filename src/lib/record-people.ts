// The people an admin's record form edits, and which of their fields, by
// kind of record: the form (src/components/record-edit-form.tsx) draws them
// and the save (src/data/records.ts) reads them back.
import type { PersonaRole } from '~/server/database/schema';
import type { EditableKind } from '~/lib/record-kinds';

/** The roles each kind's form edits, one person each. */
export const editedRoles = {
  baptisms: ['child', 'father', 'mother'],
  marriages: ['groom', 'bride'],
  deaths: ['deceased', 'father', 'mother'],
} as const satisfies Record<EditableKind, readonly PersonaRole[]>;
export type EditedRole = (typeof editedRoles)[EditableKind][number];

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
export type NameField = (typeof nameFields)[number];

/** A person's fields besides the name that a form may edit. */
export type PersonField =
  | 'sex'
  | 'deathDate'
  | 'origin'
  | 'ageText'
  | 'rankText'
  | 'religionText'
  | 'civilStatusText'
  | 'residenceId'
  | 'residenceText'
  | 'birthplaceId'
  | 'birthplaceText';

const spouse = [
  'ageText',
  'rankText',
  'religionText',
  'civilStatusText',
  'residenceId',
  'residenceText',
] as const;

const personFields = {
  baptisms: { child: ['sex', 'deathDate'], father: ['origin'], mother: ['origin'] },
  marriages: { groom: spouse, bride: spouse },
  // The deceased's death date is the record's, so it isn't a field. A
  // child's rank in the register is its parents', kept on the father.
  deaths: {
    deceased: ['sex', 'ageText', 'civilStatusText', 'rankText', 'birthplaceId', 'birthplaceText'],
    father: ['rankText'],
    mother: [],
  },
} as const satisfies {
  [K in EditableKind]: Record<(typeof editedRoles)[K][number], readonly PersonField[]>;
};

/** The fields besides the name that a kind's form edits for one role. */
export function personFieldsOf(kind: EditableKind, role: EditedRole): readonly PersonField[] {
  return (personFields[kind] as Partial<Record<EditedRole, readonly PersonField[]>>)[role] ?? [];
}

/** The sex a role implies, for a person added to a record without one. */
export const sexOfRole: Partial<Record<EditedRole, 'male' | 'female'>> = {
  father: 'male',
  mother: 'female',
  groom: 'male',
  bride: 'female',
};
