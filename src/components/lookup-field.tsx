import type { JSX } from '@solidjs/web';
import { For, Show, createMemo, createSignal } from 'solid-js';
import ChevronIcon from '~icons/ri/arrow-down-s-line';

import { createCombobox } from '~/components/combobox';
import { type Fault, FieldError, ariaInvalid } from '~/components/form-fields';
import { FIELD_MAX } from '~/lib/field-limits';
import { type Names, localName } from '~/lib/format';
import { foldForSearch } from '~/lib/search-text';
import { type SpellingIndex, rowsSpelled, spellingIndex } from '~/lib/spellings';
import { m } from '~/paraglide/messages.js';

/** A row a value can be linked to: a place, a relation, a clergyman. */
export interface LookupOption {
  value: number;
  label: string;
  spellings: string[];
}

/**
 * How a lookup's field adds the row a value names when none has that
 * spelling: the form posts "<field>Create=on" and the new row's fields,
 * named "<field>New.<column>" (`fields` draws them, prefilled from the
 * value as written), and the save creates the row (src/server/
 * linked-rows.ts).
 */
export interface LookupCreate {
  /** Said over the fields: "Add as a new locality". */
  label: string;
  /**
   * The value as written comes as an accessor: read it in JSX (`text={text()}`),
   * so a keystroke updates the prefilled value and keeps the fields, with
   * what was typed in them, as they are.
   */
  fields: (prefix: string, text: () => string) => JSX.Element;
}

/** The rows of one kind, for every field that links to them. */
export interface Lookup {
  options: LookupOption[];
  index: SpellingIndex;
  /** Shown under a value that names none of them, when a row can be added here. */
  create?: LookupCreate;
}

/** A lookup's options, indexed by their spellings. */
export const lookupOf = (options: LookupOption[], create?: LookupCreate): Lookup => ({
  options,
  index: spellingIndex(options.map((o) => ({ id: o.value, spellings: o.spellings }))),
  create,
});

/** A lookup over rows as the option queries list them (an id and spellings), each labelled by `label`; none while they load. */
export const lookupRows = <R extends { id: number; spellings: string[] }>(
  rows: R[] | undefined,
  label: (row: R) => string,
  create?: LookupCreate,
): Lookup =>
  lookupOf(
    (rows ?? []).map((row) => ({ value: row.id, label: label(row), spellings: row.spellings })),
    create,
  );

/** The name, in the reader's language, of the row with the id among the rows: a lookup field's text as loaded; null when none has it. */
export const namedRow = (rows: { id: number; name: Names }[] | undefined, id: number | null) =>
  localName(rows?.find((row) => row.id === id)?.name ?? null) || null;

/** A row the dropdown offers, with the spelling of it the text matched (its first name when nothing is typed). */
interface Match {
  option: LookupOption;
  spelling: string;
}

// The names a lookup's field posts beside the value: "placeText" → "placeCreate", "placeNew".
const createName = (textName: string) => textName.replace(/Text$/, 'Create');
const newPrefix = (textName: string) => textName.replace(/Text$/, 'New');

/**
 * A value as the source writes it, typed once, and the row it is linked to.
 * A combobox: its dropdown lists the rows a spelling of which contains the
 * text, each once, with that spelling when it isn't in the row's name; it
 * opens on focus and on typing, the chevron (or the arrow key) opens it on
 * every row to browse, and the arrow keys, Enter, a click and Escape work
 * as expected. Picking a row, or typing a spelling that names exactly one,
 * links to it, silently. A spelling several rows share opens a choice among
 * them under the input; a value that names no row shows, when the lookup
 * allows it, the fields of the row to add, prefilled from the value, and
 * the save adds it. Posts `textName` and `idName`; before JavaScript loads,
 * the server links an unlinked spelling by the same rule.
 */
export function LookupField(props: {
  textName: string;
  idName: string;
  label: string;
  text: string | null | undefined;
  id: number | null | undefined;
  lookup: Lookup;
  invalid: (field: string) => Fault;
}) {
  // The form is keyed by its record, so these start from it once.
  const [text, setText] = createSignal(() => props.text ?? '', { name: 'lookup-text' });
  const [id, setId] = createSignal(() => props.id ?? null, { name: 'lookup-id' });
  // Opened to browse (the chevron, or the arrow key on a closed field): every
  // row, whatever is typed. Typing goes back to the rows matching the text.
  const [browsing, setBrowsing] = createSignal(false, { name: 'lookup-browsing' });
  const named = createMemo(() => rowsSpelled(props.lookup.index, text()), {
    name: 'lookup-named',
  });
  const linked = () => props.lookup.options.find((o) => o.value === id());
  // Several rows have the spelling and none of them is chosen.
  const undecided = () => named().length > 1 && !named().includes(id() ?? 0);
  const several = () => props.lookup.options.filter((o) => named().includes(o.value));
  // The rows a spelling of which contains the text, each with that spelling.
  const found = createMemo(
    (): Match[] => {
      const key = foldForSearch(text());
      if (!key) return [];
      const rows: Match[] = [];
      for (const option of props.lookup.options) {
        const spelling = option.spellings.find((s) => foldForSearch(s).includes(key));
        if (spelling !== undefined) rows.push({ option, spelling });
      }
      return rows;
    },
    { name: 'lookup-found' },
  );
  // What the dropdown offers: the rows found (none when the text is in no
  // spelling); every row, by its first name, when nothing is typed or the
  // field was opened to browse.
  const matches = createMemo(
    (): Match[] =>
      !text().trim() || browsing()
        ? props.lookup.options.map((option) => ({
            option,
            spelling: option.spellings[0] ?? option.label,
          }))
        : found(),
    { name: 'lookup-matches' },
  );
  // A value no spelling contains, where a row can be added: its fields show.
  // Not before: while rows match what is typed so far, the dropdown has them.
  const unknown = () => !!props.lookup.create && !!text().trim() && !found().length && !linked();
  const typedText = () => text().trim();
  // The spelling is worth showing when the row's name doesn't contain it.
  const spelledApart = (match: Match) =>
    !foldForSearch(match.option.label).includes(foldForSearch(match.spelling));

  // The dropdown and the keys, over the matches (each by its row's value).
  // It can be open with no rows to show (a text that matches nothing), and
  // then the chevron or the arrow key browse instead of closing. A row
  // picked from it: its matched spelling becomes the value.
  const box = createCombobox({
    name: () => props.textName,
    rows: matches,
    keyOf: (match) => match.option.value,
    visible: () => matches().length > 0,
    pick: (match) => {
      setText(match.spelling);
      setId(match.option.value);
    },
    closed: () => setBrowsing(false),
    opened: () => setBrowsing(true),
  });
  const typed = (value: string) => {
    setText(value);
    setBrowsing(false);
    box.typed();
    const rows = rowsSpelled(props.lookup.index, value);
    // A spelling of one row links to it; one of several keeps the choice
    // if it is among them; none (or nothing typed) unlinks.
    if (rows.length === 1) setId(rows[0]);
    else if (!rows.includes(id() ?? 0)) setId(null);
  };

  let input: HTMLInputElement | undefined;

  return (
    <div class="fieldset">
      <label for={box.ids.input()} class="fieldset-legend">
        {props.label}
      </label>
      <div class="relative">
        <div class="input validator w-full pr-1">
          <input
            ref={(el) => (input = el)}
            id={box.ids.input()}
            name={props.textName}
            value={text()}
            role="combobox"
            aria-expanded={box.open() ? 'true' : 'false'}
            aria-controls={box.ids.list()}
            aria-autocomplete="list"
            aria-activedescendant={
              box.active() === null ? undefined : box.ids.option(box.active()!)
            }
            autocomplete="off"
            maxlength={FIELD_MAX.text}
            class="grow"
            aria-invalid={ariaInvalid(props.invalid(props.textName))}
            onInput={(e) => typed(e.currentTarget.value)}
            onFocus={box.show}
            onClick={box.show}
            onBlur={box.close}
            onKeyDown={box.onKeyDown}
          />
          {/* Not a tab stop: the input is the control. Its mousedown keeps the
              focus (and so the dropdown) where it is. */}
          <button
            type="button"
            tabindex="-1"
            aria-label={m.lookup_choices({ field: props.label })}
            aria-expanded={box.open() ? 'true' : 'false'}
            aria-controls={box.ids.list()}
            class="btn btn-square btn-ghost btn-xs"
            onMouseDown={(e) => {
              e.preventDefault();
              input?.focus();
              if (box.shown()) box.close();
              else {
                setBrowsing(true);
                box.show();
              }
            }}
          >
            <ChevronIcon class="size-5" aria-hidden="true" />
          </button>
        </div>
        <Show when={box.shown()}>
          <ul
            id={box.ids.list()}
            role="listbox"
            aria-label={props.label}
            class="menu absolute top-full left-0 z-20 mt-1 max-h-64 w-full flex-nowrap overflow-y-auto rounded-box border border-base-300 bg-base-100 shadow-lg menu-sm"
            onMouseDown={(e) => e.preventDefault()}
          >
            <For each={matches()}>
              {(match) => (
                <li
                  id={box.ids.option(match.option.value)}
                  role="option"
                  aria-selected={box.isActive(match.option.value) ? 'true' : 'false'}
                >
                  <span
                    class={{ 'menu-active': box.isActive(match.option.value) }}
                    onClick={() => box.pick(match)}
                  >
                    {match.option.label}
                    <Show when={spelledApart(match)}>
                      <span class="text-xs opacity-60">{match.spelling}</span>
                    </Show>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
      <FieldError fault={props.invalid(props.textName)} />
      {/* The row linked, posted as the id. A spelling several rows share,
          none of them chosen: the choice among them, instead. */}
      <Show
        when={undecided()}
        fallback={<input type="hidden" name={props.idName} value={id() ?? ''} />}
      >
        <select
          name={props.idName}
          aria-label={m.lookup_several()}
          class="validator select mt-1 w-full select-sm"
          aria-invalid={ariaInvalid(props.invalid(props.idName))}
          onChange={(e) => setId(Number(e.currentTarget.value) || null)}
        >
          <option value="">{m.lookup_several()}</option>
          <For each={several()}>
            {(option) => <option value={option.value}>{option.label}</option>}
          </For>
        </select>
      </Show>
      <FieldError fault={props.invalid(props.idName)} />
      {/* A value naming no row: the fields of the row to add, prefilled from
          the value as written, with the flag that asks the save for it. */}
      <Show when={unknown() ? props.lookup.create : undefined}>
        {(create) => (
          <div class="mt-2">
            <input type="hidden" name={createName(props.textName)} value="on" />
            <p class="text-sm text-base-content/70">{create().label}</p>
            {create().fields(newPrefix(props.textName), typedText)}
          </div>
        )}
      </Show>
    </div>
  );
}
