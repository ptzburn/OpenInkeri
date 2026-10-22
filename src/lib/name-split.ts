// A name as a register writes it, split into its parts: given names,
// patronymic, surname and maiden name. The record form splits a person's
// names when they are typed (and saveRecord when they are saved), as the
// imports did (scripts/import-common.ts). Node runs the import scripts
// without the app's module resolution, so this module imports nothing.

export type NameLanguage = 'ru' | 'fi' | 'sv';

export interface NameParts {
  /** The name without its parenthesised remarks. */
  name: string;
  given: string | null;
  patronymic: string | null;
  surname: string | null;
  maiden: string | null;
  /** The parenthesised remarks ("названый отец"), joined. */
  note: string | null;
  /** False when the text doesn't read as a name, and nothing was split. */
  split: boolean;
}

const MAIDEN_RU = new Set(['ур.', 'ур', 'у.', 'рожд.', 'урожд.']);
const MAIDEN_FI = new Set(['o.s.', 'os.', 'geb.', 'ur.', 'sünd.']);
const PATRONYMIC_RU_MALE = /(ов|ев|ёв|ин|ович|евич|ич| сын)$/;
const PATRONYMIC_RU_FEMALE = /(ова|ева|ёва|ина|овна|евна|ична|инична| дочь)$/;
const PATRONYMIC_FI = /.(p\.|t\.|s\.|S\.|T\.|poika|tytär|sohn)$/;
// Swedish: Matson, Erson, Persdotter, abbreviated s:on, d:r.
const PATRONYMIC_SV = /.(son|s:on|dotter|d:r)$/;
const PARTICLES = new Set(['фон', 'де', 'ван', 'von', 'de', 'van']);

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const join = (tokens: string[]) => (tokens.length ? tokens.join(' ').replaceAll(' ', ' ') : null);

/**
 * Splits a name in `language` (the Latin-script one is Finnish, or Swedish
 * in a Swedish register) of a person of `sex`. `isGiven` says whether a word
 * is a known given name, so "Катерина Луиза" reads as two given names
 * rather than a given name and a surname. Null for an empty name.
 */
export function splitName(
  text: string,
  language: NameLanguage,
  sex: 'male' | 'female',
  isGiven: (word: string) => boolean = () => false,
): NameParts | null {
  // Parenthesised remarks are kept apart: "Ян Блом (названый отец)".
  const remarks = [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  text = collapse(text.replace(/\([^)]*\)/g, ' '));
  if (!text) return null;
  const note = remarks.length ? remarks.join('; ') : null;
  const whole = { name: text, given: null, patronymic: null, surname: null, maiden: null, note };

  // Two-word patronymics ("Andruksen p.", "Иона дочь") become one token,
  // joined by a no-break space until the parts are returned.
  if (language !== 'ru') {
    text = text
      .replace(/(^|\s)o\. s\./g, '$1o.s.')
      .replace(/(\S) (p\.|t\.|poika|tytär)(?= |$)/g, '$1 $2');
  } else text = text.replace(/(\S) (дочь|сын)(?= |$)/g, '$1 $2');
  const tokens = text.split(' ');
  const markers = language === 'ru' ? MAIDEN_RU : MAIDEN_FI;

  // Not a name ("Родители найденной девочки неизвестны", "См список …"):
  // keep the text, split nothing.
  const lowercase = tokens.some(
    (t) => /^\p{Ll}/u.test(t) && !markers.has(t) && !PARTICLES.has(t) && !/^[дd]'\p{Lu}/u.test(t),
  );
  if (lowercase || /^См(?!\p{L})/u.test(text)) return { ...whole, split: false };

  const markerAt = tokens.findIndex((t) => markers.has(t));
  const maiden = markerAt >= 0 ? join(tokens.slice(markerAt + 1)) : null;
  const rest = markerAt >= 0 ? tokens.slice(0, markerAt) : tokens;
  if (rest.length === 0) return { ...whole, maiden, split: true };
  if (rest.length === 1) return { ...whole, given: join(rest), maiden, split: true };

  const isPatronymic = (t: string) =>
    language === 'fi'
      ? PATRONYMIC_FI.test(t)
      : language === 'sv'
        ? PATRONYMIC_SV.test(t)
        : (sex === 'male' ? PATRONYMIC_RU_MALE : PATRONYMIC_RU_FEMALE).test(t);

  // A man's name of two words is a given name and a surname ("Карл Илвес").
  // Otherwise the patronymic sits after the given names and before the
  // surname; a woman named with a maiden name may have no surname after it.
  const lastCandidate = sex === 'female' || markerAt >= 0 ? rest.length - 1 : rest.length - 2;
  let patronymicAt = -1;
  if (!(sex === 'male' && rest.length === 2 && language === 'ru')) {
    for (let i = lastCandidate; i >= 1; i--) {
      if (isPatronymic(rest[i])) {
        patronymicAt = i;
        break;
      }
    }
  }
  if (patronymicAt >= 0) {
    return {
      ...whole,
      given: join(rest.slice(0, patronymicAt)),
      patronymic: join([rest[patronymicAt]]),
      surname: join(rest.slice(patronymicAt + 1)),
      maiden,
      split: true,
    };
  }
  // No patronymic: trailing given names belong to the given name.
  let end = rest.length - 1;
  if (sex === 'female' && isGiven(rest[end]) && markerAt < 0) end = rest.length;
  let surnameStart = end;
  while (surnameStart > 1 && PARTICLES.has(rest[surnameStart - 1])) surnameStart--;
  return {
    ...whole,
    given: join(rest.slice(0, surnameStart)),
    surname: join(rest.slice(surnameStart)),
    maiden,
    split: true,
  };
}

/** The word of a woman's name that `isGiven` is asked about, if any (see splitName). */
export function lastWord(text: string): string | null {
  const words = collapse(text.replace(/\([^)]*\)/g, ' ')).split(' ');
  return words.at(-1) || null;
}
