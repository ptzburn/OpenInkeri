// Which alphabet a parish's or village's names are written in: the Russian
// name in Cyrillic (the pre-1918 letters і, ѣ, ѳ, ѵ of the old registers
// included), the Finnish one in Latin letters (å, ä, ö included). Besides
// letters, both allow what real names use: spaces, hyphens ("Санкт-Петербург"),
// parentheses ("Сало (Оржевка)"), periods, commas, apostrophes and "?" for
// an unreadable or unknown name.
//
// The inputs take these as their HTML `pattern` (which browsers compile with
// the v flag, so the class escapes the characters that flag reserves), and
// the server checks them through src/server/forms.ts.

const punctuation = String.raw`\s\-\(\)\.,\?'’`;

/** A Russian name: Cyrillic letters and punctuation. */
export const CYRILLIC_NAME_PATTERN = String.raw`[\p{Script=Cyrillic}${punctuation}]+`;

/** A Finnish name: Latin letters and punctuation. */
export const LATIN_NAME_PATTERN = String.raw`[\p{Script=Latin}${punctuation}]+`;

/** Whether all of `text` matches `pattern`, as the browser checks an input's `pattern`. */
export function matchesPattern(pattern: string, text: string): boolean {
  return new RegExp(`^(?:${pattern})$`, 'v').test(text);
}
