// The people an admin's record form edits, and which of their fields, by
// kind of record: the form (src/components/record-edit-form.tsx) draws them
// and the save (src/data/records.ts) reads them back. Registers name one
// person in each of a few roles (a baptism's child, father and mother);
// lists name any number of people in one role (a household's members, a
// farm's taxpayers), each with how they belong to it.
import type { PersonaRole } from '~/server/database/schema';
import type { RecordKind } from '~/lib/record-kinds';

/** The kinds whose records list any number of people, and the role they all have. */
export const listRoles = {
  households: 'member',
  taxpayers: 'taxpayer',
} as const satisfies Partial<Record<RecordKind, PersonaRole>>;
export type ListKind = keyof typeof listRoles;
export type RoleKind = Exclude<RecordKind, ListKind>;

export const isListKind = (kind: RecordKind): kind is ListKind => kind in listRoles;

/** The roles each register's form edits, one person each. */
export const editedRoles = {
  baptisms: ['child', 'father', 'mother'],
  marriages: ['groom', 'bride'],
  deaths: ['deceased', 'father', 'mother'],
} as const satisfies Record<RoleKind, readonly PersonaRole[]>;
export type EditedRole = (typeof editedRoles)[RoleKind][number];

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
  | 'birthDate'
  | 'deathDate'
  | 'origin'
  | 'ageText'
  | 'rankText'
  | 'religionText'
  | 'civilStatusText'
  | 'residenceId'
  | 'residenceText'
  | 'birthplaceId'
  | 'birthplaceText'
  | 'relationTermId'
  | 'relationText'
  | 'hasWife'
  | 'note'
  | 'noteOriginal';

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
  [K in RoleKind]: Record<(typeof editedRoles)[K][number], readonly PersonField[]>;
};

/** The fields besides the name that a register's form edits for one role. */
export function personFieldsOf(kind: RoleKind, role: EditedRole): readonly PersonField[] {
  return (personFields[kind] as Partial<Record<EditedRole, readonly PersonField[]>>)[role] ?? [];
}

/** The fields besides the name that a list's form edits for each person. */
export const listFields = {
  households: [
    'relationTermId',
    'relationText',
    'sex',
    'birthDate',
    'deathDate',
    'birthplaceId',
    'birthplaceText',
    'noteOriginal',
    'note',
  ],
  taxpayers: ['relationTermId', 'relationText', 'sex', 'hasWife', 'noteOriginal', 'note'],
} as const satisfies Record<ListKind, readonly PersonField[]>;

/** The sex a role implies, for a person added to a record without one. */
export const sexOfRole: Partial<Record<EditedRole, 'male' | 'female'>> = {
  father: 'male',
  mother: 'female',
  groom: 'male',
  bride: 'female',
};
