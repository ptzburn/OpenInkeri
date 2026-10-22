// The longest values the forms take, in characters: the server's validation
// (src/server/forms.ts, src/data/*) refuses longer ones and the inputs'
// `maxlength` stops them being typed, so both read these.
export const FIELD_MAX = {
  /** One-line values: names, spellings. */
  line: 200,
  /** Notes and other free text. */
  text: 2000,
  /** A list's search (?q=), carried back after a save. */
  search: 200,
  /** Your display name on the account page. */
  displayName: 100,
} as const;
