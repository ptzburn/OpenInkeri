// Import of a parish's registers and lists, transcribed in spreadsheets
// before the app existed, into a database that already holds the places
// (scripts/import-baptisms.ts) and may hold admins' edits: marriages and
// deaths, household lists (a parish book's households) and taxpayer lists
// (the Swedish-era mantal lists, by estate and farm).
//
//   node scripts/import-registers.ts --parish Губаницы \
//     --marriages "temp-data/Губаницы 1892-1919 - Венчания.csv" \
//     --deaths "temp-data/Губаницы 1892-1919 - Смерти.csv" \
//     --households "temp-data/Губаницы 1927-1937 - Общий список.csv" --out registers.sql
//   node scripts/import-registers.ts --parish Туутари=Tuutari \
//     --title "Туутари и Хиетамяки: налогоплательщики 1696" \
//     --taxpayers "temp-data/Tuutari&Hietamäki - Налогоплательщики.csv" --out taxpayers.sql
//   pnpm exec wrangler d1 execute DB --local --file registers.sql
//
// It reads the database it will write to (local, or --remote) through
// Wrangler for the parish, the places and their spellings, the relation
// terms and the next free ids, and only writes SQL: Wrangler applies it. It
// adds rows and changes none, so apply the file once, before anyone edits in
// between; a register whose source is already there is refused. A parish
// not in the database yet is created (`--parish Русское=Suomeksi`).
//
// Every cell is kept as written in record.raw. The parsed values (dates,
// name parts, places, rank, religion and civil status) are best effort:
// what it couldn't read is left empty for admins to fill in and summarised
// on stderr. Rank, religion and civil status stay text for admins to
// resolve to terms later; the lists' roles in the household ("Сын",
// "Боболь") become relation terms as the sheet translates them, one term
// per wording, for admins to merge.
import { execFileSync } from 'node:child_process';
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
    parish: { type: 'string' },
    marriages: { type: 'string' },
    deaths: { type: 'string' },
    households: { type: 'string' },
    taxpayers: { type: 'string' },
    // The source's title, instead of "<parish>: <kind>", for one register.
    title: { type: 'string' },
    out: { type: 'string' },
    remote: { type: 'boolean', default: false },
  },
});
if (
  !args.parish ||
  !args.out ||
  (!args.marriages && !args.deaths && !args.households && !args.taxpayers)
) {
  console.error(
    'usage: --parish <name>[=<Finnish name>] [--marriages <csv>] [--deaths <csv>]' +
      ' [--households <csv>] [--taxpayers <csv>] --out <sql> [--remote]',
  );
  process.exit(1);
}
const [parishName, parishNameFi] = args.parish.split('=').map(clean);

// --- The database -----------------------------------------------------------------

function select<T>(sql: string): T[] {
  const out = execFileSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      'DB',
      args.remote ? '--remote' : '--local',
      '--json',
      '--command',
      sql,
    ],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return (JSON.parse(out) as { results: T[] }[])[0].results;
}

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
const [found] = select<{ id: number }>(
  `SELECT id FROM parish WHERE name_ru = ${quote(parishName)}`,
);
const parishRows: Row[] = [];
const parish = found ?? {
  id: select<{ id: number }>('SELECT coalesce(max(id), 0) + 1 AS id FROM parish')[0].id,
};
if (!found) {
  parishRows.push({ id: parish.id, name_ru: parishName, name_fi: parishNameFi ?? null });
  console.error(`creating the parish ${parishName}`);
}
const existingSources = new Set(
  select<{ title: string }>('SELECT title FROM source').map((s) => s.title),
);
const [next] = select<{ record: number; persona: number; source: number }>(
  `SELECT (SELECT coalesce(max(id), 0) + 1 FROM record) AS record,
          (SELECT coalesce(max(id), 0) + 1 FROM persona) AS persona,
          (SELECT coalesce(max(id), 0) + 1 FROM source) AS source`,
);

// Given names already in the registers, so "Катерина Луиза" reads as two
// given names rather than a given name and a surname (see splitName).
for (const { given } of select<{ given: string }>(
  `SELECT DISTINCT given_ru AS given FROM persona WHERE given_ru IS NOT NULL
   UNION SELECT DISTINCT given_fi FROM persona WHERE given_fi IS NOT NULL`,
)) {
  for (const t of given.split(/[\s-]+/)) if (/^\p{Lu}/u.test(t)) givenNames.add(t);
}

// Relation terms ("Сын", "Боболь") by wording, and the ones to create.
const termRows: Row[] = [];
const terms = new Map(
  select<{ id: number; ru: string }>("SELECT id, ru FROM term WHERE vocabulary = 'relation'").map(
    (t) => [t.ru, t.id],
  ),
);
let nextTerm = select<{ id: number }>('SELECT coalesce(max(id), 0) + 1 AS id FROM term')[0].id;
function relationTerm(text: string | null): number | null {
  if (!text) return null;
  // One wording, one term: "сын" and "Сын " are the same.
  const ru = text.charAt(0).toUpperCase() + text.slice(1);
  if (!terms.has(ru)) {
    terms.set(ru, nextTerm);
    termRows.push({ id: nextTerm++, vocabulary: 'relation', ru });
  }
  return terms.get(ru)!;
}

// Spelling → place: the places' names and their spellings. A spelling of two
// places is ambiguous and left unresolved.
const placeNames = new Map<number, string>();
const placeBySpelling = new Map<string, number | null>();
const addSpelling = (spelling: string, id: number) => {
  const known = placeBySpelling.get(spelling);
  placeBySpelling.set(spelling, known !== undefined && known !== id ? null : id);
};
for (const p of select<{ id: number; name_ru: string; name_fi: string | null }>(
  'SELECT id, name_ru, name_fi FROM place',
)) {
  placeNames.set(p.id, p.name_ru);
  addSpelling(clean(p.name_ru), p.id);
  if (p.name_fi) addSpelling(clean(p.name_fi), p.id);
}
for (const a of select<{ place_id: number; name: string }>(
  'SELECT place_id, name FROM place_alias',
))
  addSpelling(clean(a.name), a.place_id);

// A place as written: as it is, else without a leading "имение", "мыза" or
// "деревня" ("имение Губаницы" is Губаницы) or a trailing Swedish "By"
// ("Witala By" is Witala).
function resolvePlace(text: string | null): number | null {
  if (!text) return null;
  if (/\p{Script=Latin}\p{Script=Cyrillic}|\p{Script=Cyrillic}\p{Script=Latin}/u.test(text))
    warn('places mixing Latin and Cyrillic letters (a typo?)', text);
  const bare = text
    .replace(/^(имение|мыза|деревня|дер\.|д\.|село|с\.)\s+/i, '')
    .replace(/\s+by$/i, '');
  const id = placeBySpelling.get(text) ?? placeBySpelling.get(bare) ?? null;
  if (id === null) {
    warn(
      placeBySpelling.get(text) === null || placeBySpelling.get(bare) === null
        ? 'spellings of several places (not resolved)'
        : 'places not in the database',
      text,
    );
  }
  return id;
}

// --- Cells ------------------------------------------------------------------------

// "Крестьянин, лютеранин, холост" → rank, religion and civil status.
const RELIGION =
  /лютеран|православн|католи|реформат|баптист|раскольни|старообряд|евангел|иуде|англикан/i;
const CIVIL_STATUS = /холост|девиц|вдов|женат|замужн|развед|дитя|младен/i;
function standing(cell: string) {
  const parts = (value(cell) ?? '').split(',').map(clean).filter(Boolean);
  const pick = (test: (p: string) => boolean) => parts.filter(test).join(', ') || null;
  return {
    rank_text: pick((p) => !RELIGION.test(p) && !CIVIL_STATUS.test(p)),
    religion_text: pick((p) => RELIGION.test(p)),
    civil_status_text: pick((p) => !RELIGION.test(p) && CIVIL_STATUS.test(p)),
  };
}

// An age in three columns (years, months, days) as the registers write it:
// "62", "3 г. 2 мес. 9 дн.", "11 мес. 19 дн.".
function age(years: string, months: string, days: string): string | null {
  const n = (s: string) => (/^\d+$/.test(clean(s)) ? Number(clean(s)) : null);
  const [y, mo, d] = [n(years), n(months), n(days)];
  if (y !== null && mo === null && d === null) return String(y);
  const yearWord = (v: number) =>
    v % 10 >= 1 && v % 10 <= 4 && (v % 100 < 11 || v % 100 > 14) ? 'г.' : 'л.';
  const parts = [
    y !== null && `${y} ${yearWord(y)}`,
    mo !== null && `${mo} мес.`,
    d !== null && `${d} дн.`,
  ].filter(Boolean);
  if (!parts.length && !blank(years)) warn('unreadable ages', clean(years));
  return parts.join(' ') || value(years);
}

// The date a register gives as day.month in the row's year.
function dateIn(year: number | null, cell: string, what: string): string | null {
  const dm = dayMonth(cell);
  if (!dm || !year) {
    if (!blank(cell)) warn(`unreadable ${what} dates`, clean(cell));
    return year ? String(year) : null;
  }
  const date = isoDate(dm.year ?? year, dm.month, dm.day);
  if (!date) warn(`unreadable ${what} dates`, `${clean(cell)} (${year})`);
  return date;
}

// A date after `after` given as day.month: in the same year, or the next
// when it falls earlier in the year (died 31.12, buried 08.01).
function dateAfter(after: string | null, cell: string, what: string): string | null {
  const dm = dayMonth(cell);
  const year = after ? Number(after.slice(0, 4)) : null;
  if (!dm || !year) {
    if (!blank(cell)) warn(`unreadable ${what} dates`, clean(cell));
    return null;
  }
  const same = isoDate(dm.year ?? year, dm.month, dm.day);
  if (!same) {
    warn(`unreadable ${what} dates`, `${clean(cell)} (${year})`);
    return null;
  }
  return !dm.year && after!.length === 10 && same < after!
    ? isoDate(year + 1, dm.month, dm.day)
    : same;
}

const yearOf = (cell: string) => (/^\d{4}$/.test(clean(cell)) ? Number(clean(cell)) : null);

// --- Rows -------------------------------------------------------------------------

const sourceRows: Row[] = [];
const recordRows: Row[] = [];
const deathRows: Row[] = [];
const holdingRows: Row[] = [];
const personaRows: Row[] = [];
const recordSearch = new Map<number, (string | null | undefined)[]>();

function addPersona(
  recordId: number,
  role: string,
  sex: string | null,
  ru: NameParts | null,
  fi: NameParts | null,
  fields: Row = {},
) {
  const row: Row = {
    id: next.persona + personaRows.length,
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
    age_text: null,
    birth_date: null,
    death_date: null,
    birthplace_text: null,
    birthplace_id: null,
    residence_text: null,
    residence_id: null,
    rank_text: null,
    religion_text: null,
    civil_status_text: null,
    relation_text: null,
    relation_term_id: null,
    has_wife: null,
    note: [ru?.note, fi?.note].filter(Boolean).join('; ') || null,
    note_original: null,
    ...fields,
  };
  personaRows.push(row);
  // Names, and where the person lived, are what a search finds.
  const residence = row.residence_id as number | null;
  recordSearch
    .get(recordId)!
    .push(
      row.name_ru as string | null,
      row.name_fi as string | null,
      row.residence_text as string | null,
      residence ? placeNames.get(residence) : null,
    );
  return row;
}

function addRecord(sourceId: number, fields: Row) {
  const id = next.record + recordRows.length;
  const placeId = fields.place_id as number | null;
  recordRows.push({
    id,
    source_id: sourceId,
    status: 'ok',
    date: null,
    place_text: null,
    place_id: null,
    note: null,
    ...fields,
  });
  recordSearch.set(id, [
    fields.place_text as string | null,
    placeId ? placeNames.get(placeId) : null,
  ]);
  return id;
}

// The sheets' rows after their header rows, without empty ones, keyed by
// the given column names for record.raw.
function sheet(path: string, headerRows: number, headers: string[]) {
  return readCsv(path)
    .slice(headerRows)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      const cells = headers.map((_, i) => r[i] ?? '');
      const raw = Object.fromEntries(
        headers.map((h, i) => [h, cells[i]]).filter(([, v]) => v.trim()),
      );
      return { cells, raw: JSON.stringify(raw) };
    });
}

// A register's source: its years are the rows' (their first column)
// unless given; its language is that of the original register.
function addSource(
  kind: string,
  title: string,
  rows: { cells: string[] }[],
  { years, language = 'ru' }: { years?: number[]; language?: string } = {},
) {
  title = args.title ?? title;
  if (existingSources.has(title)) {
    console.error(`already imported: ${title}`);
    process.exit(1);
  }
  years ??= rows.map((r) => yearOf(r.cells[0])).filter((y): y is number => y !== null);
  const id = next.source + sourceRows.length;
  sourceRows.push({
    id,
    kind,
    parish_id: parish.id,
    title,
    year_from: years.length ? Math.min(...years) : null,
    year_to: years.length ? Math.max(...years) : null,
    language,
  });
  return id;
}

// A list's years, from its file name ("Губаницы 1927-1937 - Общий список.csv").
const yearsInName = (path: string) =>
  [
    ...(path
      .split('/')
      .at(-1)!
      .match(/\b(1[5-9]\d\d)(?:\s*[-–]\s*(1[5-9]\d\d))?\b/) ?? []),
  ]
    .slice(1)
    .filter(Boolean)
    .map(Number);

// --- Marriages ----------------------------------------------------------------------

if (args.marriages) {
  const rows = sheet(args.marriages, 2, [
    'Год',
    '№',
    'День бракосочетания',
    'ФИО жениха (рус.)',
    'ФИО жениха (suomi)',
    'Жених: звание, религия, состояние',
    'Место проживания жениха',
    'Возраст жениха',
    'ФИО невесты (рус.)',
    'ФИО невесты (suomi)',
    'Невеста: звание, религия, состояние',
    'Место проживания невесты',
    'Возраст невесты',
    'Примечания',
  ]);
  const sourceId = addSource('marriages', `${args.parish}: венчания`, rows);

  for (const { cells, raw } of rows) {
    const year = yearOf(cells[0]);
    if (!year) warn('rows without a year', raw);
    // The couple's villages are each spouse's; the record has none.
    const id = addRecord(sourceId, {
      date: dateIn(year, cells[2], 'wedding'),
      note: value(cells[13]),
      raw,
    });
    for (const [role, sex, at] of [
      ['groom', 'male', 3],
      ['bride', 'female', 8],
    ] as const) {
      const ru = splitName(cells[at], 'ru', sex);
      const fi = splitName(cells[at + 1], 'fi', sex);
      const residence = value(cells[at + 3]);
      addPersona(id, role, sex, ru, fi, {
        ...standing(cells[at + 2]),
        residence_text: residence,
        residence_id: resolvePlace(residence),
        age_text: value(cells[at + 4]),
      });
    }
  }
}

// --- Deaths -------------------------------------------------------------------------

function sexOfDeceased(name: string | null, civilStatus: string | null): 'male' | 'female' | null {
  if (civilStatus && /вдовец|женат|холост/i.test(civilStatus)) return 'male';
  if (civilStatus && /вдова|замужн|девица/i.test(civilStatus)) return 'female';
  return sexOfChild(name, name ?? '');
}

if (args.deaths) {
  const rows = sheet(args.deaths, 3, [
    'Год',
    '№',
    'День смерти',
    'День погребения',
    'Место смерти',
    'ФИО (рус.)',
    'ФИО (suomi)',
    'Звание',
    'Место рождения',
    'Возраст: годы',
    'Возраст: месяцы',
    'Возраст: дни',
    'Гражданское состояние',
    'Причина смерти',
    'Место погребения',
    'Примечания',
  ]);
  const sourceId = addSource('deaths', `${args.parish}: умершие`, rows);

  for (const { cells, raw } of rows) {
    const year = yearOf(cells[0]);
    if (!year) warn('rows without a year', raw);
    const died = dateIn(year, cells[2], 'death');
    const placeText = value(cells[4]);
    const note = value(cells[15]);
    const id = addRecord(sourceId, {
      date: died,
      place_text: placeText,
      place_id: resolvePlace(placeText),
      note,
      raw,
    });

    const nameRu = value(cells[5]);
    const stillborn = /мертворожд/i.test(nameRu ?? '');
    deathRows.push({
      record_id: id,
      burial_date: dateAfter(died, cells[3], 'burial'),
      burial_place_text: value(cells[14]),
      cause_text: value(cells[13]),
      stillborn,
    });

    // A child's rank column is its parents'; the notes name the parents
    // ("родители: Иосиф Иоаннов Таттарь, Евва ур. Вальконен").
    const civilStatus = value(cells[12]);
    const child = stillborn || /дитя|младен/i.test(civilStatus ?? '');
    const rank = value(cells[7]);
    const sex = sexOfDeceased(nameRu, civilStatus);
    const birthplace = value(cells[8]);
    addPersona(
      id,
      'deceased',
      sex,
      // A stillborn child has no name, only the record of the death.
      stillborn ? null : splitName(cells[5], 'ru', sex ?? 'male'),
      stillborn ? null : splitName(cells[6], 'fi', sex ?? 'male'),
      {
        age_text: age(cells[9], cells[10], cells[11]),
        death_date: died,
        birthplace_text: birthplace,
        birthplace_id: resolvePlace(birthplace),
        rank_text: child ? null : rank,
        civil_status_text: civilStatus,
      },
    );

    const parents = note
      ?.match(/родители\s*:\s*([^;\n]+)/i)?.[1]
      .split(',')
      .map(clean);
    if (parents?.[0]) {
      addPersona(id, 'father', 'male', splitName(parents[0], 'ru', 'male'), null, {
        rank_text: child ? rank : null,
      });
    } else if (child && rank) warn('children without parents in the notes', nameRu ?? raw);
    if (parents?.[1])
      addPersona(id, 'mother', 'female', splitName(parents[1], 'ru', 'female'), null);
  }
}

// --- Household lists ------------------------------------------------------------

// "Korpelainen Aleksanteri Mikkelinp.": surname first, then the given names
// and the patronymic.
function surnameFirst(cell: string): NameParts | null {
  const text = value(cell);
  if (!text) return null;
  const tokens = text.split(' ');
  const parts: NameParts = {
    name: text,
    given: null,
    patronymic: null,
    surname: null,
    maiden: null,
    note: null,
  };
  if (tokens.length === 1) return { ...parts, surname: text };
  const patronymic = /.(p\.|t\.|poika|tytär)$/.test(tokens.at(-1)!) ? tokens.pop()! : null;
  const [surname, ...given] = tokens;
  return { ...parts, surname, given: given.join(' ') || null, patronymic };
}

// A date as the lists write it: 03.05.1880.
function fullDate(cell: string, what: string): string | null {
  const m = clean(cell).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) {
    if (!blank(cell)) warn(`unreadable ${what} dates`, clean(cell));
    return null;
  }
  const date = isoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  if (!date) warn(`unreadable ${what} dates`, clean(cell));
  return date;
}

const FEMALE_RELATION =
  /дочь|сестра|мать|служанка|вдова|жена|тёща|теща|свекровь|постоялица|невестка|племянница|внучка|свояченица|падчерица|бабушка|тётя|тетя/i;

if (args.households) {
  const rows = sheet(args.households, 1, [
    'Деревня',
    'Двор',
    'Роль',
    'ФИО',
    'Дата рождения',
    'Место рождения',
    'Дата смерти',
    'Примечания',
  ]);
  const sourceId = addSource('households', `${parishName}: общий список`, rows, {
    years: yearsInName(args.households),
    language: 'fi',
  });
  const year = sourceRows.at(-1)!.year_from as number | null;

  // A household is a run of rows with the same двор number; a second head
  // under the same number starts another (numbers restart in each village).
  type Household = { no: string; villages: string[]; rows: typeof rows; head: boolean };
  const households: Household[] = [];
  for (const row of rows) {
    const no = clean(row.cells[1]);
    const head = clean(row.cells[2]).toLowerCase().startsWith('глава');
    const last = households.at(-1);
    if (!last || last.no !== no || (head && last.head)) {
      households.push({ no, villages: [], rows: [], head });
    }
    const current = households.at(-1)!;
    current.rows.push(row);
    current.head ||= head;
    if (value(row.cells[0])) current.villages.push(value(row.cells[0])!);
  }

  for (const h of households) {
    // The household's village is the one most of its rows give.
    const counts = new Map<string, number>();
    for (const v of h.villages) counts.set(v, (counts.get(v) ?? 0) + 1);
    const village = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (counts.size > 1) warn('households in several villages', [...counts.keys()].join(' / '));
    const id = addRecord(sourceId, {
      date: year ? String(year) : null,
      place_text: village,
      place_id: resolvePlace(village),
      raw: JSON.stringify(h.rows.map((r) => JSON.parse(r.raw))),
    });
    holdingRows.push({
      record_id: id,
      holding_no: value(h.no),
      estate_text: null,
      tenant_text: null,
    });

    for (const { cells } of h.rows) {
      const name = surnameFirst(cells[3]);
      const relation = value(cells[2]);
      const patronymic = name?.patronymic ?? '';
      const sex = /(t\.|tytär)$/.test(patronymic)
        ? 'female'
        : /(p\.|poika)$/.test(patronymic)
          ? 'male'
          : relation && FEMALE_RELATION.test(relation)
            ? 'female'
            : 'male';
      const birthplace = value(cells[5]);
      addPersona(id, 'member', sex, null, name, {
        relation_text: relation,
        relation_term_id: relationTerm(relation),
        birth_date: fullDate(cells[4], 'birth'),
        birthplace_text: birthplace,
        birthplace_id: resolvePlace(birthplace),
        death_date: fullDate(cells[6], 'death'),
        note_original: value(cells[7]),
      });
    }
  }
}

// --- Taxpayer lists -------------------------------------------------------------

if (args.taxpayers) {
  const all = readCsv(args.taxpayers);
  // The first row is the list's year ("1696"), the second the column names.
  const listYear = yearOf(all[0]?.[0] ?? '');
  const rows = sheet(args.taxpayers, 2, [
    'Поместье',
    'Арендатор',
    'Место',
    '№ хозяйства',
    'Человек',
    'С женой',
    'Роль (ориг.)',
    'Роль (рус.)',
    'Примечание (ориг.)',
    'Примечание (рус.)',
    'Примечание (рус., кратко)',
  ]);
  const sourceId = addSource(
    'taxpayers',
    `${parishName}: налогоплательщики${listYear ? ` ${listYear}` : ''}`,
    rows,
    { years: listYear ? [listYear] : [], language: 'sv' },
  );

  // A farm is a run of rows with the same estate, place and number. People
  // without a number (soldiers' wives, a länsman and his household) are
  // grouped by place the same way.
  let key: string | null = null;
  let id = 0;
  for (const { cells, raw } of rows) {
    const [estate, tenant, place, no] = [cells[0], cells[1], cells[2], cells[3]].map(value);
    const roleRu = value(cells[7]);
    const here = `${estate}|${place}|${no}`;
    if (here !== key) {
      key = here;
      id = addRecord(sourceId, {
        date: listYear ? String(listYear) : null,
        place_text: place,
        place_id: resolvePlace(place),
        raw: '[]',
      });
      holdingRows.push({ record_id: id, holding_no: no, estate_text: estate, tenant_text: tenant });
    }
    // The record's raw holds its rows, as a household's does.
    const record = recordRows.at(-1)!;
    record.raw = JSON.stringify([...JSON.parse(record.raw as string), JSON.parse(raw)]);

    const name = splitName(
      cells[4],
      'sv',
      roleRu && FEMALE_RELATION.test(roleRu) ? 'female' : 'male',
    );
    const relationOriginal = value(cells[6]);
    // The translated note, its short form and remarks in the name's brackets.
    const notes = [value(cells[9]), value(cells[10]), name?.note].filter(Boolean);
    addPersona(
      id,
      'taxpayer',
      roleRu && FEMALE_RELATION.test(roleRu) ? 'female' : 'male',
      null,
      name,
      {
        relation_text: relationOriginal ?? roleRu,
        relation_term_id: relationTerm(roleRu),
        has_wife: clean(cells[5]) === 'да' ? true : clean(cells[5]) === 'нет' ? false : null,
        note: notes.join('; ') || null,
        note_original: value(cells[8]),
      },
    );
  }
}

// --- SQL --------------------------------------------------------------------------

for (const r of recordRows) r.search_text = searchText(recordSearch.get(r.id as number)!);

const statements = [
  ...inserts('parish', parishRows),
  ...inserts('term', termRows),
  ...inserts('source', sourceRows),
  ...inserts('record', recordRows),
  ...inserts('record_death', deathRows),
  ...inserts('record_holding', holdingRows),
  ...inserts('persona', personaRows),
];
writeFileSync(args.out, statements.join('\n') + '\n');

// --- Report -----------------------------------------------------------------------

const count = (role: string) => personaRows.filter((p) => p.role === role).length;
console.error(
  [
    `sources ${sourceRows.length}, records ${recordRows.length} (from id ${next.record})`,
    `personas: grooms ${count('groom')}, brides ${count('bride')}, deceased ${count('deceased')}, fathers ${count('father')}, mothers ${count('mother')}, household members ${count('member')}, taxpayers ${count('taxpayer')}`,
    `relation terms created: ${termRows.length}`,
    `records without a date: ${recordRows.filter((r) => !r.date).length}`,
    ...warningLines(),
    `wrote ${statements.length} statements to ${args.out}`,
  ].join('\n'),
);
