// Which unlinked mentions could be a person: the person page's "Possible
// mentions". A mention is compared with what the person's linked mentions
// say together: the given name must match; a different sex, patronymic or
// a birth year that can't fit rules it out; the same patronymic, surname,
// a close birth year and the same or a nearby village add points, and each
// is shown as the reason. A baptised child's mention names only the given
// name: the father in the same record supplies the patronymic and surname.
//
// The registers write one name several ways: the church's Вениамин, the
// spoken Пеньян, the Finnish Penjam. NameGroups learns which forms are one
// name from the mentions that give a name in both languages.
import type { Sex } from '~/lib/record-kinds';
import { foldForSearch } from '~/lib/search-text';
import type { PersonaRole } from '~/server/database/schema';

/** One mention, with what its record adds (see the fields). */
export interface MatchMention {
  personaId: number;
  recordId: number;
  role: PersonaRole;
  sex: Sex | null;
  /** The record's date (ISO, cut to what it says). */
  date: string | null;
  /** The mention's birth date, or a baptised child's from the record. */
  birthDate: string | null;
  deathDate: string | null;
  ageText: string | null;
  givenRu: string | null;
  givenFi: string | null;
  patronymicRu: string | null;
  patronymicFi: string | null;
  surnameRu: string | null;
  surnameFi: string | null;
  maidenRu: string | null;
  maidenFi: string | null;
  /** The father named in the same record, for a child's or a deceased's mention. */
  father: {
    givenRu: string | null;
    givenFi: string | null;
    surnameRu: string | null;
    surnameFi: string | null;
  } | null;
  /** Where they lived, or the record's place. */
  place: {
    id: number;
    name: { ru: string | null; fi: string | null };
    lat: number | null;
    lon: number | null;
  } | null;
}

/** Why a mention was suggested, for the page to say in the reader's language. */
export type MatchReason =
  | { kind: 'patronymic' }
  | { kind: 'surname' }
  | { kind: 'born'; year: number }
  | { kind: 'village'; name: { ru: string | null; fi: string | null } }
  | { kind: 'near'; name: { ru: string | null; fi: string | null }; km: number };

export interface Match {
  personaId: number;
  score: number;
  reasons: MatchReason[];
}

/** What a person's linked mentions (and their page's summary) say together. */
export interface MatchProfile {
  sex: Sex | null;
  /** Their given names, folded, in every form the registers write them. */
  givens: Set<string>;
  patronymics: string[];
  surnames: Set<string>;
  /** The surnames they were born with: a child's father's, a woman's maiden name. */
  birthSurnames: string[];
  /** Born between these years; null when nothing says. */
  born: [number, number] | null;
  diedYear: number | null;
  places: NonNullable<MatchMention['place']>[];
  recordIds: Set<number>;
  /** The roles their mentions have: one baptism and one death in a life. */
  roles: Set<PersonaRole>;
}

// The roles a life has once: a second baptism or death is someone else.
const once: PersonaRole[] = ['child', 'deceased'];

const yearOf = (date: string | null) => (date ? Number(date.slice(0, 4)) : null);

/**
 * Whole years of an age as registers write it: "25", "86 л. 9 мес. 25 дн.",
 * "3 г. 2 мес.", "11 мес. 19 дн." (0). Null when it doesn't read.
 */
export function ageYears(text: string | null): number | null {
  if (!text) return null;
  const t = text.trim();
  if (/^\d{1,2}\s*(мес|нед|дн)/u.test(t)) return 0;
  const years = /^(\d{1,3})(?:\s*(?:л|г|год|года|лет)\.?)?(?:\s|$)/u.exec(t);
  return years ? Number(years[1]) : null;
}

// The years a mention says they were born in, by how it names them: a
// birth date exactly; an age a year wide; a role the span of life it fits
// (a parent 16 to 70, a mother to 50; a bride or groom 15 to 60).
function bornOf(m: MatchMention): [number, number] | null {
  const birth = yearOf(m.birthDate);
  if (birth !== null) return [birth, birth];
  const year = yearOf(m.date);
  if (year === null) return null;
  const age = ageYears(m.ageText);
  if (age !== null) return [year - age - 1, year - age];
  switch (m.role) {
    case 'child':
      return [year - 1, year];
    case 'father':
      return [year - 70, year - 16];
    case 'mother':
      return [year - 50, year - 15];
    case 'groom':
    case 'bride':
      return [year - 60, year - 15];
    case 'deceased':
      return [year - 105, year];
    default:
      return [year - 105, year];
  }
}

// A patronymic, or a father's given name, reduced to the stem they share:
// "Иоаннова" and "Иоанн", "Матфеев" and "Матфей", "Juhonp." and "Juho".
const vowels = /[аеиоуыэюяйьaeiouyäö]+$/u;
export function nameStem(name: string): string {
  return foldForSearch(name)
    .split(' ')[0]
    .replace(/(овна|евна|ична|ович|евич|ич|ова|ева|ина|ов|ев|ин|ntytär|npoika|np\.?|nt\.?)$/u, '')
    .replace(vowels, '');
}

// A surname folded, with a Russian feminine ending and a final soft sign or
// vowel taken off: "Варисова" and "Варисов", "Кракули" and "Кракуль".
const surnameKey = (name: string) =>
  foldForSearch(name)
    .replace(/(ова|ева|ина|ая)$/u, (s) => s.slice(0, -1))
    .replace(/[ьйиы]$/u, '');

/** Given names the registers write for one another. */
export interface NameGroups {
  /** A folded given name's forms: itself and the others written for it. */
  forms: (name: string) => string[];
  /** The group a given name's or patronymic's stem belongs to, if any. */
  groupOfStem: (stem: string) => number | undefined;
}

/**
 * Name groups from pairs of folded given names that mentions give for one
 * name in Russian and in Finnish ("вениамин" and "penjam", "пеньян" and
 * "penjam"): names joined by pairs, directly or through others, are one.
 */
export function nameGroups(pairs: [string, string][]): NameGroups {
  const parent = new Map<string, string>();
  const root = (name: string): string => {
    let r = name;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(name, r);
    return r;
  };
  for (const [a, b] of pairs) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = root(a);
    const rb = root(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const members = new Map<string, string[]>();
  for (const name of parent.keys()) {
    const r = root(name);
    members.set(r, [...(members.get(r) ?? []), name]);
  }
  const ids = new Map([...members.keys()].map((r, i) => [r, i]));
  // Each name under its stem and under itself without its final vowels: a
  // patronymic keeps what a given name's stem loses ("Вениаминова" →
  // "вениамин", but "Вениамин" → "вениам").
  const stems = new Map<string, number>();
  for (const [r, names] of members) {
    for (const name of names) {
      stems.set(nameStem(name), ids.get(r)!);
      stems.set(foldForSearch(name).split(' ')[0].replace(vowels, ''), ids.get(r)!);
    }
  }
  return {
    forms: (name) => (parent.has(name) ? members.get(root(name))! : [name]),
    groupOfStem: (stem) => stems.get(stem),
  };
}

const NO_GROUPS = nameGroups([]);

const givensOf = (m: Pick<MatchMention, 'givenRu' | 'givenFi'>) =>
  [m.givenRu, m.givenFi].filter((g): g is string => !!g).map(foldForSearch);

function patronymicsOf(m: MatchMention): string[] {
  const own = [m.patronymicRu, m.patronymicFi];
  const fromFather =
    m.father && (m.role === 'child' || m.role === 'deceased')
      ? [m.father.givenRu, m.father.givenFi]
      : [];
  return [...own, ...fromFather]
    .filter((name): name is string => !!name)
    .map(nameStem)
    .filter((stem) => stem.length >= 2);
}

// Stems are the same name when one starts the other: "Мартин" loses "ин"
// as a given name ("март") and keeps it in "Мартинов" ("мартин"). Two
// letters are too few to tell names apart that way.
const sameStem = (a: string, b: string) =>
  a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));

const cyrillic = /\p{Script=Cyrillic}/u;

/**
 * Whether two sets of patronymic stems agree: 'same' when two are the same
 * name (by their stems, or in one name group); 'different' when both have
 * stems in one script and none agree; 'unknown' otherwise (a Russian and a
 * Finnish patronymic that no group joins can't be told apart).
 */
export function comparePatronymics(
  a: string[],
  b: string[],
  groups: NameGroups = NO_GROUPS,
): 'same' | 'different' | 'unknown' {
  const same = (x: string, y: string) => {
    if (sameStem(x, y)) return true;
    const g = groups.groupOfStem(x);
    return g !== undefined && g === groups.groupOfStem(y);
  };
  if (a.some((x) => b.some((y) => same(x, y)))) return 'same';
  const script = (stems: string[]) => new Set(stems.map((s) => cyrillic.test(s)));
  const sa = script(a);
  return [...script(b)].some((s) => sa.has(s)) ? 'different' : 'unknown';
}

function surnamesOf(m: MatchMention): string[] {
  const own = [m.surnameRu, m.surnameFi, m.maidenRu, m.maidenFi];
  const fromFather =
    m.father && (m.role === 'child' || m.role === 'deceased')
      ? [m.father.surnameRu, m.father.surnameFi]
      : [];
  return [...own, ...fromFather].filter((s): s is string => !!s).map(surnameKey);
}

// The surname a mention says they were born with: a child's (or a
// deceased child's) father's; a woman's maiden name, or a bride's surname
// (she marries under it); a man's own.
function birthSurnamesOf(m: MatchMention): string[] {
  const names =
    m.father && (m.role === 'child' || m.role === 'deceased')
      ? [m.father.surnameRu, m.father.surnameFi]
      : m.sex === 'female'
        ? m.role === 'bride'
          ? [m.surnameRu, m.surnameFi, m.maidenRu, m.maidenFi]
          : [m.maidenRu, m.maidenFi]
        : [m.surnameRu, m.surnameFi];
  return names.filter((s): s is string => !!s).map(surnameKey);
}

/** Whether two sets of birth surnames differ: none agree, and both have some in one script. */
function differentSurnames(a: string[], b: string[]): boolean {
  if (!a.length || !b.length || a.some((x) => b.includes(x))) return false;
  const scripts = new Set(a.map((s) => cyrillic.test(s)));
  return b.some((s) => scripts.has(cyrillic.test(s)));
}

/**
 * What a person's mentions say together, and their page's summary (an
 * admin's birth or death date wins over the estimates). The birth years are
 * the span all the mentions fit; when they don't agree, the narrowest.
 */
export function profileOf(
  mentions: MatchMention[],
  summary: { sex: Sex | null; birthDate: string | null; deathDate: string | null },
  groups: NameGroups = NO_GROUPS,
): MatchProfile {
  let born: [number, number] | null = null;
  const summaryBirth = yearOf(summary.birthDate);
  if (summaryBirth !== null) born = [summaryBirth, summaryBirth];
  else {
    for (const range of mentions.map(bornOf)) {
      if (!range) continue;
      if (!born) born = range;
      else {
        const lo = Math.max(born[0], range[0]);
        const hi = Math.min(born[1], range[1]);
        born = lo <= hi ? [lo, hi] : range[1] - range[0] < born[1] - born[0] ? range : born;
      }
    }
  }
  const died =
    yearOf(summary.deathDate) ??
    yearOf(mentions.find((m) => m.role === 'deceased')?.date ?? null) ??
    yearOf(mentions.find((m) => m.deathDate)?.deathDate ?? null);
  return {
    sex: summary.sex ?? mentions.find((m) => m.sex)?.sex ?? null,
    givens: new Set(mentions.flatMap(givensOf).flatMap(groups.forms)),
    patronymics: mentions.flatMap(patronymicsOf),
    surnames: new Set(mentions.flatMap(surnamesOf)),
    birthSurnames: mentions.flatMap(birthSurnamesOf),
    born,
    diedYear: died,
    places: mentions.flatMap((m) => (m.place ? [m.place] : [])),
    recordIds: new Set(mentions.map((m) => m.recordId)),
    roles: new Set(mentions.map((m) => m.role)),
  };
}

// Kilometres between two points (haversine).
function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// How many years two close birth estimates (from dates or ages) may be off
// before they can't be the same person: registers round ages, and a year
// can be misread. A role's span ("a mother is 15 to 50") has no slack.
const SLACK = 2;
// A different surname at birth, in the same script: a strong sign of
// another person, but surnames are spelt many ways, so it costs points
// rather than ruling the mention out.
const BIRTH_SURNAME_PENALTY = 3;
const NEARBY_KM = 10;

/** How well `m` fits the person, or null when it can't be them. */
export function matchOf(
  person: MatchProfile,
  m: MatchMention,
  groups: NameGroups = NO_GROUPS,
): Match | null {
  if (person.recordIds.has(m.recordId)) return null;
  if (once.includes(m.role) && person.roles.has(m.role)) return null;
  if (person.sex && m.sex && person.sex !== m.sex) return null;
  if (!givensOf(m).some((g) => person.givens.has(g))) return null;

  const reasons: MatchReason[] = [];
  let score = 0;

  const patronymics = comparePatronymics(person.patronymics, patronymicsOf(m), groups);
  if (patronymics === 'different') return null;
  if (patronymics === 'same') {
    score += 3;
    reasons.push({ kind: 'patronymic' });
  }

  const born = bornOf(m);
  if (person.born && born) {
    const lo = Math.max(person.born[0], born[0]);
    const hi = Math.min(person.born[1], born[1]);
    const narrow = (r: [number, number]) => r[1] - r[0] <= 3;
    const close = narrow(person.born) && narrow(born);
    if (lo > hi + (close ? SLACK : 0)) return null;
    if (close) {
      score += 2;
      reasons.push({ kind: 'born', year: Math.round((born[0] + born[1]) / 2) });
    }
  }

  const year = yearOf(m.date);
  if (person.diedYear !== null && year !== null && year > person.diedYear + 1) return null;

  if (surnamesOf(m).some((s) => person.surnames.has(s))) {
    score += 2;
    reasons.push({ kind: 'surname' });
  }
  if (differentSurnames(person.birthSurnames, birthSurnamesOf(m))) {
    score -= BIRTH_SURNAME_PENALTY;
  }

  const place = m.place;
  if (place) {
    if (person.places.some((p) => p.id === place.id)) {
      score += 2;
      reasons.push({ kind: 'village', name: place.name });
    } else if (place.lat !== null && place.lon !== null) {
      const here = { lat: place.lat, lon: place.lon };
      const near = person.places
        .filter((p) => p.lat !== null && p.lon !== null)
        .map((p) => ({ p, d: km(here, { lat: p.lat!, lon: p.lon! }) }))
        .sort((a, b) => a.d - b.d)[0];
      if (near && near.d <= NEARBY_KM) {
        score += 1;
        reasons.push({ kind: 'near', name: near.p.name, km: Math.round(near.d) });
      }
    }
  }

  return { personaId: m.personaId, score, reasons };
}

/**
 * The mentions that could be the person, best first; at least `minScore`
 * points each. A patronymic alone (3) isn't enough: hundreds of women are
 * Мария Иоанновна; it takes a surname, a birth year or a village besides.
 */
export function suggestionsFor(
  mentions: MatchMention[],
  summary: { sex: Sex | null; birthDate: string | null; deathDate: string | null },
  candidates: MatchMention[],
  {
    groups = NO_GROUPS,
    limit = 20,
    minScore = 4,
  }: { groups?: NameGroups; limit?: number; minScore?: number } = {},
): Match[] {
  const person = profileOf(mentions, summary, groups);
  if (!person.givens.size) return [];
  return candidates
    .map((c) => matchOf(person, c, groups))
    .filter((m): m is Match => m !== null && m.score >= minScore)
    .sort((a, b) => b.score - a.score || a.personaId - b.personaId)
    .slice(0, limit);
}
