import { describe, expect, test } from 'vite-plus/test';

import { type FamilyPersona, familyOf } from './person-family';

// Maria (person 1): baptised in record 10 (1895), a bride in record 20
// (1915), a mother in record 30 (1916) and record 40 (1918).
const name = (ru: string) => ({ ru, fi: null });
const personas: FamilyPersona[] = [
  { id: 1, recordId: 10, role: 'child', personId: 1, name: name('Мария') },
  { id: 2, recordId: 10, role: 'father', personId: 2, name: name('Иван') },
  { id: 3, recordId: 10, role: 'mother', personId: null, name: name('Анна') },
  { id: 4, recordId: 20, role: 'bride', personId: 1, name: name('Мария') },
  { id: 5, recordId: 20, role: 'groom', personId: 3, name: name('Юхо') },
  { id: 6, recordId: 30, role: 'mother', personId: 1, name: name('Мария') },
  { id: 7, recordId: 30, role: 'father', personId: 3, name: name('Юхо') },
  { id: 8, recordId: 30, role: 'child', personId: null, name: name('Пётр') },
  { id: 9, recordId: 40, role: 'mother', personId: 1, name: name('Мария') },
  { id: 10, recordId: 40, role: 'father', personId: 3, name: name('Юхо') },
  { id: 11, recordId: 40, role: 'child', personId: 4, name: name('Ольга') },
];
const years: Record<number, number> = { 10: 1895, 20: 1915, 30: 1916, 40: 1918 };
const yearOf = (recordId: number) => years[recordId] ?? null;

describe('familyOf', () => {
  test('reads parents, spouses and children from the records', () => {
    const family = familyOf(1, personas, yearOf);
    expect(family.parents).toEqual([
      { personId: 2, name: name('Иван'), recordIds: [10], year: 1895 },
      { personId: null, name: name('Анна'), recordIds: [10], year: 1895 },
    ]);
    // Juho is her groom in 1915 and the father of her children: one spouse.
    expect(family.spouses).toEqual([
      { personId: 3, name: name('Юхо'), recordIds: [20, 30, 40], year: 1915 },
    ]);
    expect(family.children).toEqual([
      { personId: null, name: name('Пётр'), recordIds: [30], year: 1916 },
      { personId: 4, name: name('Ольга'), recordIds: [40], year: 1918 },
    ]);
  });

  test('from the other side: a father has his children and wife', () => {
    const family = familyOf(3, personas, yearOf);
    expect(family.parents).toEqual([]);
    expect(family.spouses.map((r) => r.personId)).toEqual([1]);
    expect(family.children.map((r) => r.name.ru)).toEqual(['Пётр', 'Ольга']);
  });

  test('a person with no family in their records has none', () => {
    const lone: FamilyPersona[] = [
      { id: 1, recordId: 1, role: 'member', personId: 9, name: name('Матти') },
      { id: 2, recordId: 1, role: 'member', personId: null, name: name('Лиза') },
    ];
    expect(familyOf(9, lone, () => null)).toEqual({ parents: [], spouses: [], children: [] });
  });
});
