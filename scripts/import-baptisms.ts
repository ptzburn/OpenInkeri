// One-time import of the Губаницы birth and baptism register (1892–1919)
// and its village list, transcribed in spreadsheets before the app existed.
//
//   node scripts/import-baptisms.ts --people temp-data/people.csv \
//     --villages temp-data/villages.csv --out baptisms.sql [--reset]
//   pnpm exec wrangler d1 execute DB --local --file baptisms.sql
//
// It only writes SQL; Wrangler applies it. Every cell is kept as written in
// record.raw, and the parsed values (dates, name parts, places, clergy) are
// best effort: what it couldn't read is left empty for admins to fill in and
// summarised on stderr. --reset first empties the genealogy tables, admin
// edits included, so use it only on a local database.
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';

import {
  type NameParts,
  type Row,
  blank,
  clean,
  dayMonth,
  fold,
  givenNames,
  inserts,
  isoDate,
  readCsv,
  searchText,
  sexOfChild,
  splitName,
  value,
  warn,
  warningLines,
} from './import-common.ts';

const { values: args } = parseArgs({
  options: {
    people: { type: 'string' },
    villages: { type: 'string' },
    out: { type: 'string' },
    reset: { type: 'boolean', default: false },
  },
});
if (!args.people || !args.villages || !args.out) {
  console.error('usage: --people <csv> --villages <csv> --out <sql> [--reset]');
  process.exit(1);
}

// --- Villages ---------------------------------------------------------------------

// A coordinate that 63 unrelated villages share in the sheet: it stands for
// "not located yet".
const PLACEHOLDER_COORDINATES = '60.079321, 31.892664';

const [, ...villageRows] = readCsv(args.villages);

const parishes = new Map<string, number>();
const parishId = (name: string) => {
  if (!parishes.has(name)) parishes.set(name, parishes.size + 1);
  return parishes.get(name)!;
};

type PlaceDraft = {
  id: number;
  nameRu: string;
  parishes: Map<string, number>; // parish name → mentions
  coordinates: { text: string; mentions: number } | null;
  aliases: Set<string>;
};
const places = new Map<string, PlaceDraft>();

for (const [spelling, mentions, canonical, coordinates, parish] of villageRows) {
  if (blank(canonical) || blank(spelling)) continue;
  const name = clean(canonical);
  let p = places.get(name);
  if (!p) {
    p = {
      id: places.size + 1,
      nameRu: name,
      parishes: new Map(),
      coordinates: null,
      aliases: new Set(),
    };
    places.set(name, p);
  }
  const count = Number(mentions) || 0;
  p.aliases.add(clean(spelling));
  if (!blank(parish)) p.parishes.set(clean(parish), (p.parishes.get(clean(parish)) ?? 0) + count);
  const coords = clean(coordinates ?? '');
  if (coords && coords !== PLACEHOLDER_COORDINATES) {
    if (p.coordinates && p.coordinates.text !== coords) {
      warn(
        'place with several coordinates (kept the most mentioned)',
        `${name}: ${p.coordinates.text} | ${coords}`,
      );
    }
    if (!p.coordinates || count > p.coordinates.mentions)
      p.coordinates = { text: coords, mentions: count };
  }
}

// Spelling → place. A spelling of two places is ambiguous and left unresolved.
const placeBySpelling = new Map<string, number | null>();
for (const p of places.values()) {
  for (const a of p.aliases) {
    const known = placeBySpelling.get(a);
    if (known !== undefined && known !== p.id) {
      warn('spelling of several places (not resolved)', a);
      placeBySpelling.set(a, null);
    } else placeBySpelling.set(a, p.id);
  }
}

const placeRows = [...places.values()].map((p) => {
  const [parish] = [...p.parishes.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const [lat, lng] = p.coordinates?.text.split(',').map((n) => Number(n.trim())) ?? [];
  return {
    id: p.id,
    kind: /мыза/i.test(p.nameRu) ? 'manor' : /петербург/i.test(p.nameRu) ? 'town' : 'village',
    name_ru: p.nameRu,
    parish_id: parish ? parishId(parish) : null,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    // Taken from the sheet, not checked by anyone in the app yet.
    coordinate_status: Number.isFinite(lat) ? 'approximate' : 'unknown',
  };
});

const aliasRows = [...places.values()].flatMap((p) =>
  [...p.aliases].map((name) => ({ place_id: p.id, name })),
);

// --- Clergy and baptism place ---------------------------------------------------

const clergy = new Map<string, number>();
const clergyId = (surname: string) => {
  if (!clergy.has(surname)) clergy.set(surname, clergy.size + 1);
  return clergy.get(surname)!;
};

// The last clergyman named in the cell: the one who baptised, or who
// confirmed an emergency baptism ("… утв. п. Берг").
function officiant(cell: string): number | null {
  // A title, then initials or first names ("Я.", "Густ.", "Адольф"), then the surname.
  const pattern =
    /(?:пастор(?:-викарий)?|п\.-в\.|п-р|п\.|кистер|викарий|утв[^А-ЯЁ]*П\.)\s*(?:[А-ЯЁ][а-яё]*\.\s*|[А-ЯЁ][а-яё]+\s+(?=[А-ЯЁ]))*([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?)/g;
  const matches = [...cell.matchAll(pattern)];
  const surname = matches.at(-1)?.[1];
  return surname ? clergyId(surname) : null;
}

function location(cell: string): { kind: string | null; placeId: number | null } {
  const text = clean(cell);
  if (/пасторат/i.test(text)) return { kind: 'pastorate', placeId: null };
  if (/церкв/i.test(text)) return { kind: 'church', placeId: null };
  if (/^(У родителей|На дому|Дома)(?!\p{L})/iu.test(text)) return { kind: 'home', placeId: null };
  const m = text.match(/^В ([А-ЯЁ][а-яё]+(?: [А-ЯЁ][а-яё]+)?)/);
  if (!m) return { kind: null, placeId: null };
  if (m[1] === 'Тешково')
    return { kind: 'chapel', placeId: placeBySpelling.get('Тешково') ?? null };
  return { kind: 'village', placeId: placeBySpelling.get(m[1]) ?? null };
}

// "24.11.1891 К. Мейель, утв-л пастор Берг", "8.01 Михел Лейнонен(?)":
// a layperson baptised the child at home on that date.
function emergency(
  cell: string,
  year: number | null,
): { date: string | null; baptizer: string | null } | null {
  const m = clean(cell).match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s*(.*)$/);
  if (!m) return null;
  let y = m[3] ? Number(m[3]) : year;
  if (y !== null && y < 100) y += 1800;
  const date = y === null ? null : isoDate(y, Number(m[2]), Number(m[1]));
  const who = clean(m[4].split(',')[0].replace(/\(\?\)/g, ''));
  // "8.09.1891 пастор П. Лааманен" is a private baptism by a pastor.
  const baptizer = who && !/^(пастор|п\.|кистер)/i.test(who) ? who : null;
  return { date, baptizer };
}

// --- Baptisms ---------------------------------------------------------------------

const peopleRows = readCsv(args.people);
const HEADERS = [
  'Год рождения',
  'День рождения',
  'День крещения',
  '№',
  'Имя младенца (рус.)',
  'Имя младенца (suomi)',
  'Деревня',
  'ФИО отца (рус.)',
  'ФИО отца (suomi)',
  'ФИО матери (рус.)',
  'ФИО матери (suomi)',
  'Крестил',
  'Примечания',
];
// The sheet has three header rows (title, column names, languages).
const body = peopleRows.slice(3).filter((r) => r.some((c) => c.trim()));

for (const r of body) {
  for (const cell of [r[4], r[5]]) {
    for (const t of clean(cell ?? '').split(/[\s-]+/)) if (/^\p{Lu}/u.test(t)) givenNames.add(t);
  }
}

const SOURCE_ID = 1;
const sectionRows: Row[] = [];
const recordRows: Row[] = [];
const baptismRows: Row[] = [];
const personaRows: Row[] = [];
let sectionId: number | null = null;

function persona(
  recordId: number,
  role: string,
  sex: string | null,
  ru: NameParts | null,
  fi: NameParts | null,
) {
  personaRows.push({
    id: personaRows.length + 1,
    record_id: recordId,
    role,
    sex,
    name_ru: ru?.name ?? null,
    given_ru: ru?.given ?? null,
    patronymic_ru: ru?.patronymic ?? null,
    surname_ru: ru?.surname ?? null,
    maiden_ru: ru?.maiden ?? null,
    name_fi: fi?.name ?? null,
    given_fi: fi?.given ?? null,
    patronymic_fi: fi?.patronymic ?? null,
    surname_fi: fi?.surname ?? null,
    maiden_fi: fi?.maiden ?? null,
    given_ru_folded: ru?.given ? fold(ru.given) : null,
    given_fi_folded: fi?.given ? fold(fi.given) : null,
    origin: null as string | null,
    death_date: null as string | null,
    note: [ru?.note, fi?.note].filter(Boolean).join('; ') || null,
  });
  return personaRows.at(-1)!;
}

for (const r of body) {
  const cells = HEADERS.map((_, i) => r[i] ?? '');

  // A heading: text in the first cell only.
  if (
    cells[0].trim() &&
    cells.slice(1).every((c) => !c.trim()) &&
    !/^\d{4}$/.test(cells[0].trim())
  ) {
    const title = clean(cells[0]);
    if (/отсутству|утрачен/i.test(title)) {
      // "Страницы 221об-222 отсутствуют": a gap, kept as a lost entry.
      recordRows.push({
        id: recordRows.length + 1,
        source_id: SOURCE_ID,
        section_id: sectionId,
        status: 'lost',
        note: title,
        raw: JSON.stringify({ [HEADERS[0]]: cells[0] }),
      });
    } else {
      sectionId = sectionRows.length + 1;
      sectionRows.push({ id: sectionId, source_id: SOURCE_ID, title });
    }
    continue;
  }

  const id = recordRows.length + 1;
  const raw = Object.fromEntries(HEADERS.map((h, i) => [h, cells[i]]).filter(([, v]) => v.trim()));
  const note = clean(cells[12]);
  const lost = clean(cells[4]).toLowerCase() === 'утрачено';

  const birthYear = /^\d{4}$/.test(cells[0].trim()) ? Number(cells[0].trim()) : null;
  const born = dayMonth(cells[1]);
  const birthDate =
    born && birthYear
      ? isoDate(born.year ?? birthYear, born.month, born.day)
      : birthYear
        ? String(birthYear)
        : null;
  if (born && birthYear && !birthDate) warn('unreadable birth dates', `${cells[1]} (${birthYear})`);
  if (!born && !blank(cells[1])) warn('unreadable birth dates', clean(cells[1]));

  // The year column is the birth year. A child born in late December and
  // baptised in January was baptised the next year.
  const baptised = dayMonth(cells[2]);
  let baptismDate: string | null = null;
  if (baptised && birthYear) {
    let year = baptised.year ?? birthYear;
    if (
      !baptised.year &&
      born &&
      (baptised.month < born.month || (baptised.month === born.month && baptised.day < born.day))
    ) {
      year++;
    }
    baptismDate = isoDate(year, baptised.month, baptised.day);
    if (!baptismDate) warn('unreadable baptism dates', `${cells[2]} (${birthYear})`);
  } else if (!blank(cells[2])) warn('unreadable baptism dates', clean(cells[2]));

  const placeText = value(cells[6]);
  const placeId = placeText ? (placeBySpelling.get(placeText) ?? null) : null;
  if (placeText && !placeId) warn('villages not in the village list', placeText);

  recordRows.push({
    id,
    source_id: SOURCE_ID,
    section_id: sectionId,
    status: lost ? 'lost' : 'ok',
    date: baptismDate,
    place_text: placeText,
    place_id: placeId,
    note: value(cells[12]),
    raw: JSON.stringify(raw),
  });

  const officiantText = value(cells[11]);
  const where = officiantText ? location(officiantText) : { kind: null, placeId: null };
  const lay = officiantText ? emergency(officiantText, birthYear) : null;
  const childName = value(cells[4]);
  const stillborn = /мертворожд/i.test(childName ?? '');

  baptismRows.push({
    record_id: id,
    birth_date: birthDate,
    officiant_text: officiantText,
    officiant_id: officiantText ? officiant(officiantText) : null,
    location: lay ? 'home' : where.kind,
    location_place_id: where.placeId,
    emergency_date: lay?.date ?? null,
    multiple_birth: /тройн/i.test(note) ? 3 : /двойн/i.test(note) ? 2 : null,
    illegitimate: /незаконнорожд|вне брака|внебрачн/i.test(note),
    stillborn,
  });
  if (lost) continue;

  // People. A stillborn child has no name, only the record of the birth.
  const childSex = sexOfChild(stillborn ? null : childName, `${childName ?? ''} ${note}`);
  const child = persona(
    id,
    'child',
    childSex,
    childName && !stillborn
      ? {
          name: childName,
          given: childName,
          patronymic: null,
          surname: null,
          maiden: null,
          note: null,
        }
      : null,
    value(cells[5])
      ? {
          name: value(cells[5]),
          given: value(cells[5]),
          patronymic: null,
          surname: null,
          maiden: null,
          note: null,
        }
      : null,
  );
  const died = note.match(/умер(?:ла)?\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
  if (died) child.death_date = isoDate(Number(died[3]), Number(died[2]), Number(died[1]));

  const fatherRu = splitName(cells[7], 'ru', 'male');
  const fatherFi = splitName(cells[8], 'fi', 'male');
  const motherRu = splitName(cells[9], 'ru', 'female');
  const motherFi = splitName(cells[10], 'fi', 'female');
  const isPerson = (n: NameParts | null) => n && (n.given || n.surname || n.maiden);
  const father =
    isPerson(fatherRu) || isPerson(fatherFi)
      ? persona(id, 'father', 'male', fatherRu, fatherFi)
      : null;
  const mother =
    isPerson(motherRu) || isPerson(motherFi)
      ? persona(id, 'mother', 'female', motherRu, motherFi)
      : null;

  // "отец: эстонец", "отец - крестьянин Везенбергского уезда", "родители из Молосковицкого прихода".
  for (const line of cells[12].split('\n').map(clean)) {
    const fatherOrigin = line.match(/^отец\s*[:\-–]\s*(.+)$/i);
    const motherOrigin = line.match(/^мать\s*[:\-–]\s*(.+)$/i);
    const parents = line.match(/^родители\s+(из\s.+)$/i);
    if (fatherOrigin && father) father.origin = fatherOrigin[1].replace(/,$/, '');
    if (motherOrigin && mother) mother.origin = motherOrigin[1].replace(/,$/, '');
    if (parents) {
      if (father) father.origin ??= parents[1];
      if (mother) mother.origin ??= parents[1];
    }
  }

  if (lay?.baptizer) {
    persona(
      id,
      'lay_baptizer',
      null,
      {
        name: lay.baptizer,
        given: null,
        patronymic: null,
        surname: null,
        maiden: null,
        note: null,
      },
      null,
    );
  }
}

// --- Search text ------------------------------------------------------------------

// record.search_text: the entry's names in both languages, the village as
// written and its canonical name.
const placeNames = new Map([...places.values()].map((p) => [p.id, p.nameRu]));
const namesByRecord = new Map<number, string[]>();
for (const p of personaRows) {
  const names = namesByRecord.get(p.record_id as number) ?? [];
  for (const name of [p.name_ru, p.name_fi]) if (typeof name === 'string') names.push(name);
  namesByRecord.set(p.record_id as number, names);
}
for (const r of recordRows) {
  const parts = [
    ...(namesByRecord.get(r.id as number) ?? []),
    r.place_text,
    typeof r.place_id === 'number' ? placeNames.get(r.place_id) : null,
  ];
  r.search_text = searchText(parts as (string | null | undefined)[]);
}

// --- SQL --------------------------------------------------------------------------

const years = baptismRows
  .map((b) => Number(String(b.birth_date ?? '').slice(0, 4)))
  .filter(Boolean);
const gubanitsy = parishId('Губаницы');

const statements = [
  ...(args.reset
    ? [
        'change_log',
        'persona',
        'person',
        'record_holding',
        'record_death',
        'record_baptism',
        'record',
        'source_section',
        'source',
        'clergy',
        'term',
        'place_alias',
        'place',
        'parish',
      ].map((t) => `DELETE FROM ${t};`)
    : []),
  ...inserts(
    'parish',
    [...parishes].map(([name, id]) => ({ id, name_ru: name })),
  ),
  ...inserts('place', placeRows),
  ...inserts('place_alias', aliasRows),
  ...inserts(
    'clergy',
    [...clergy].map(([name, id]) => ({ id, name_ru: name })),
  ),
  ...inserts('source', [
    {
      id: SOURCE_ID,
      kind: 'baptisms',
      parish_id: gubanitsy,
      title: 'Губаницы: список рожденных и крещенных',
      year_from: Math.min(...years),
      year_to: Math.max(...years),
      language: 'ru',
    },
  ]),
  ...inserts('source_section', sectionRows),
  ...inserts('record', recordRows),
  ...inserts('record_baptism', baptismRows),
  ...inserts('persona', personaRows),
];
writeFileSync(args.out, statements.join('\n') + '\n');

// --- Report -----------------------------------------------------------------------

const count = (role: string) => personaRows.filter((p) => p.role === role).length;
console.error(
  [
    `parishes ${parishes.size}, places ${placeRows.length} (${placeRows.filter((p) => p.latitude === null).length} without coordinates), spellings ${aliasRows.length}`,
    `clergy ${clergy.size}: ${[...clergy.keys()].join(', ')}`,
    `sections ${sectionRows.length}, records ${recordRows.length} (${recordRows.filter((r) => r.status === 'lost').length} lost)`,
    `personas: children ${count('child')}, fathers ${count('father')}, mothers ${count('mother')}, lay baptizers ${count('lay_baptizer')}`,
    `records without a resolved village: ${recordRows.filter((r) => r.place_text && !r.place_id).length}`,
    `records without a baptism date: ${recordRows.filter((r) => r.status === 'ok' && !r.date).length}`,
    ...warningLines(),
    `wrote ${statements.length} statements to ${args.out}`,
  ].join('\n'),
);
