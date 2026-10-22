import { describe, expect, test } from 'vite-plus/test';

import {
  type MatchMention,
  ageYears,
  comparePatronymics,
  nameGroups,
  nameStem,
  suggestionsFor,
} from './person-match';

const gorki = { id: 1, name: { ru: 'Горки', fi: 'Korkka' }, lat: 59.6135, lon: 30.2252 };
// About 4 km from Горки.
const nearby = { id: 2, name: { ru: 'Пекколово', fi: 'Pekkola' }, lat: 59.6492, lon: 30.2069 };
const far = { id: 3, name: { ru: 'Торосово', fi: 'Torossova' }, lat: 59.5164, lon: 29.5673 };

let nextId = 100;
function mention(fields: Partial<MatchMention>): MatchMention {
  nextId += 1;
  return {
    personaId: nextId,
    recordId: nextId,
    role: 'child',
    sex: 'female',
    date: null,
    birthDate: null,
    deathDate: null,
    ageText: null,
    givenRu: null,
    givenFi: null,
    patronymicRu: null,
    patronymicFi: null,
    surnameRu: null,
    surnameFi: null,
    maidenRu: null,
    maidenFi: null,
    father: null,
    place: null,
    ...fields,
  };
}

// Maria, baptised in Горки in 1895; her father is Иоанн Варис.
const baptism = mention({
  role: 'child',
  date: '1895-03-12',
  birthDate: '1895-03-01',
  givenRu: 'Мария',
  father: { givenRu: 'Иоанн', givenFi: 'Juho', surnameRu: 'Варис', surnameFi: 'Varis' },
  place: gorki,
});
const summary = { sex: null, birthDate: null, deathDate: null };

describe('nameStem', () => {
  test('reduces a patronymic and a given name to the stem they share', () => {
    expect(nameStem('Иоаннова')).toBe(nameStem('Иоанн'));
    expect(nameStem('Матфеевна')).toBe(nameStem('Матфей'));
    expect(nameStem('Juhonp.')).toBe(nameStem('Juho'));
    expect(nameStem('Aatamint.')).toBe(nameStem('Aatami'));
  });
});

describe('comparePatronymics', () => {
  test('stems that start one another agree; another stem in the same script differs', () => {
    const stems = (...names: string[]) => names.map(nameStem);
    expect(comparePatronymics(stems('Мартин'), stems('Мартиновна'))).toBe('same');
    expect(comparePatronymics(stems('Иоанн'), stems('Петровна'))).toBe('different');
    // A Russian and a Finnish patronymic no group joins can't be told apart.
    expect(comparePatronymics(stems('Иоанн'), stems('Juhont.'))).toBe('unknown');
  });

  test('forms of one name agree through their group', () => {
    const groups = nameGroups([
      ['вениамин', 'penjam'],
      ['пеньян', 'penjam'],
      ['иоанн', 'juhana'],
    ]);
    expect(groups.forms('пеньян').sort()).toEqual(['penjam', 'вениамин', 'пеньян']);
    expect(groups.forms('мария')).toEqual(['мария']);
    const stems = (...names: string[]) => names.map(nameStem);
    expect(comparePatronymics(stems('Пеньян'), stems('Вениаминова'), groups)).toBe('same');
    expect(comparePatronymics(stems('Иоанн'), stems('Juhanant.'), groups)).toBe('same');
  });
});

describe('ageYears', () => {
  test('reads the ways registers write an age', () => {
    expect(ageYears('25')).toBe(25);
    expect(ageYears('86 л. 9 мес. 25 дн.')).toBe(86);
    expect(ageYears('3 г. 2 мес. 9 дн.')).toBe(3);
    expect(ageYears('11 мес. 19 дн.')).toBe(0);
    expect(ageYears('около')).toBeNull();
  });
});

describe('suggestionsFor', () => {
  test('finds her as a bride and as a mother, with the reasons', () => {
    const bride = mention({
      role: 'bride',
      date: '1915-06-01',
      ageText: '20',
      givenRu: 'Мария',
      patronymicRu: 'Иоаннова',
      surnameRu: 'Варис',
      place: gorki,
    });
    const mother = mention({
      role: 'mother',
      date: '1918-02-01',
      givenRu: 'Мария',
      patronymicRu: 'Иоанновна',
      maidenRu: 'Варис',
      place: nearby,
    });
    const [first, second] = suggestionsFor([baptism], summary, [mother, bride]);
    expect(first).toEqual({
      personaId: bride.personaId,
      score: 9,
      reasons: [
        { kind: 'patronymic' },
        { kind: 'born', year: 1895 },
        { kind: 'surname' },
        { kind: 'village', name: gorki.name },
      ],
    });
    // A mother's birth year is too wide to count, the village is nearby.
    expect(second).toEqual({
      personaId: mother.personaId,
      score: 6,
      reasons: [
        { kind: 'patronymic' },
        { kind: 'surname' },
        { kind: 'near', name: gorki.name, km: 4 },
      ],
    });
  });

  test('finds a bride whose father the baptism names in another form (a real case)', () => {
    // Мария, baptised in 1897: her father is Пеньян Кракуль; at her wedding
    // in 1918, aged 20, she is Мария Вениаминова Кракули.
    const kraculi = mention({
      role: 'child',
      date: '1897-08-17',
      birthDate: '1897-08-11',
      givenRu: 'Мария',
      father: { givenRu: 'Пеньян', givenFi: 'Penjam', surnameRu: 'Кракуль', surnameFi: null },
    });
    const bride = mention({
      role: 'bride',
      date: '1918-01-14',
      ageText: '20',
      givenRu: 'Мария',
      patronymicRu: 'Вениаминова',
      surnameRu: 'Кракули',
    });
    const groups = nameGroups([
      ['вениамин', 'penjam'],
      ['пеньян', 'penjam'],
    ]);
    expect(suggestionsFor([kraculi], summary, [bride], { groups })).toEqual([
      {
        personaId: bride.personaId,
        score: 7,
        reasons: [{ kind: 'patronymic' }, { kind: 'born', year: 1898 }, { kind: 'surname' }],
      },
    ]);
  });

  test('rules out what can’t be her', () => {
    const others = [
      // Another father's daughter.
      mention({
        role: 'bride',
        date: '1915-06-01',
        givenRu: 'Мария',
        patronymicRu: 'Петрова',
        place: gorki,
      }),
      // A mother before she was born.
      mention({
        role: 'mother',
        date: '1890-01-01',
        givenRu: 'Мария',
        patronymicRu: 'Иоаннова',
        place: gorki,
      }),
      // A younger sister baptised Мария too: one baptism in a life.
      mention({
        ...baptism,
        personaId: 900,
        recordId: 900,
        date: '1897-01-05',
        birthDate: '1897-01-01',
      }),
      // A man, and another given name.
      mention({ role: 'groom', sex: 'male', date: '1915-06-01', givenRu: 'Мария', place: gorki }),
      mention({
        role: 'bride',
        date: '1915-06-01',
        givenRu: 'Анна',
        patronymicRu: 'Иоаннова',
        place: gorki,
      }),
    ];
    expect(suggestionsFor([baptism], summary, others)).toEqual([]);
  });

  test('a woman born with another surname drops out, though her father had the same name', () => {
    // A real case: many a Мария Вениаминова was a mother; this one was born Кокко.
    const kokko = mention({
      role: 'mother',
      date: '1916-01-01',
      givenRu: 'Мария',
      patronymicRu: 'Иоаннова',
      maidenRu: 'Кокко',
    });
    expect(suggestionsFor([baptism], summary, [kokko])).toEqual([]);
  });

  test('a mother can’t be younger than 15: a role’s span has no slack', () => {
    const young = mention({
      role: 'mother',
      date: '1909-01-01',
      givenRu: 'Мария',
      patronymicRu: 'Иоаннова',
      maidenRu: 'Варис',
    });
    expect(suggestionsFor([baptism], summary, [young])).toEqual([]);
  });

  test('a given name alone is not enough, and the record she is in is skipped', () => {
    const vague = mention({ role: 'mother', date: '1920-01-01', givenRu: 'Мария', place: far });
    const sameRecord = mention({ ...baptism, personaId: 901, role: 'mother', givenRu: 'Мария' });
    expect(suggestionsFor([baptism], summary, [vague, sameRecord])).toEqual([]);
  });

  test('nothing is suggested after her death', () => {
    const died = { ...summary, deathDate: '1916' };
    const later = mention({
      role: 'mother',
      date: '1920-01-01',
      givenRu: 'Мария',
      patronymicRu: 'Иоанновна',
      place: gorki,
    });
    expect(suggestionsFor([baptism], died, [later])).toEqual([]);
  });
});
