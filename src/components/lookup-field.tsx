import type { JSX } from '@solidjs/web';
import { For, Show, createMemo, createSignal } from 'solid-js';

import { type Fault, FieldError, ariaInvalid } from '~/components/form-fields';
import { FIELD_MAX } from '~/lib/field-limits';
import { type SpellingIndex, rowsSpelled, spellingIndex } from '~/lib/spellings';
import { m } from '~/paraglide/messages.js';

/** A row a value can be linked to: a place, a relation, a clergyman. */
export interface LookupOption {
  value: number;
  label: string;
  spellings: string[];
}

/**
 * How a lookup's field offers to add the row a value names when none has
 * that spelling. Ticked, the form posts "<field>Create=on" and the new row's
 * fields, named "<field>New.<column>" (`fields` draws them, prefilled from
 * the value as written), and the save creates the row (src/server/
 * linked-rows.ts).
 */
export interface LookupCreate {
  /** The box's label: "Add as a new locality". */
  label: string;
  fields: (prefix: string, text: string) => JSX.Element;
}

/** The rows of one kind, for every field that links to them. */
export interface Lookup {
  options: LookupOption[];
  index: SpellingIndex;
  /** The <datalist> of their spellings (see SpellingList). */
  listId: string;
  /** Said under a value that names none of them. */
  unlinked: string;
  /** Offered under a value that names none of them, when a row can be added here. */
  create?: LookupCreate;
}

/** A lookup's options, indexed by their spellings. */
export const lookupOf = (
  options: LookupOption[],
  listId: string,
  unlinked: string,
  create?: LookupCreate,
): Lookup => ({
  options,
  index: spellingIndex(options.map((o) => ({ id: o.value, spellings: o.spellings }))),
  listId,
  unlinked,
  create,
});

// The names a lookup's field posts beside the value: "placeText" → "placeCreate", "placeNew".
const createName = (textName: string) => textName.replace(/Text$/, 'Create');
const newPrefix = (textName: string) => textName.replace(/Text$/, 'New');

/**
 * A value as the source writes it, typed once, and the row it is linked to.
 * The input suggests the known spellings; typing one that names exactly one
 * row links to it, and the line under the input says which, or that it
 * names several (then the choice opens) or none. The line opens a <select>
 * to link to another row, or to none, and, when the lookup allows it, a box
 * to add the row the value names (its fields show once ticked). Posts
 * `textName` and `idName`; before JavaScript loads, the server links an
 * unlinked spelling by the same rule, and the box and fields still work.
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
  const [creating, setCreating] = createSignal(false, { name: 'lookup-creating' });
  const named = createMemo(() => rowsSpelled(props.lookup.index, text()), {
    name: 'lookup-named',
  });
  const linked = () => props.lookup.options.find((o) => o.value === id());
  // Several rows have the spelling and none of them is chosen.
  const undecided = () => named().length > 1 && !named().includes(id() ?? 0);
  // A value that names no row, where one can be added.
  const unknown = () => !!props.lookup.create && !!text().trim() && !named().length && !linked();

  const typed = (value: string) => {
    setText(value);
    const rows = rowsSpelled(props.lookup.index, value);
    // A spelling of one row links to it; one of several keeps the choice
    // if it is among them; none (or nothing typed) unlinks. A row found
    // isn't to be added.
    if (rows.length === 1) setId(rows[0]);
    else if (!rows.includes(id() ?? 0)) setId(null);
    if (rows.length) setCreating(false);
  };
  const chose = (value: number | null) => {
    setId(value);
    if (value !== null) setCreating(false);
  };
  const createId = () => `${createName(props.textName)}-box`;

  return (
    <div class="fieldset">
      <label class="flex flex-col gap-2">
        <span class="fieldset-legend">{props.label}</span>
        <input
          name={props.textName}
          value={text()}
          list={props.lookup.listId}
          autocomplete="off"
          maxlength={FIELD_MAX.text}
          class="validator input w-full"
          aria-invalid={ariaInvalid(props.invalid(props.textName))}
          onInput={(e) => typed(e.currentTarget.value)}
        />
        <FieldError fault={props.invalid(props.textName)} />
      </label>
      {/* What the value is linked to; opening it offers the others. */}
      <details class="text-sm" open={undecided() || creating() || !!props.invalid(props.idName)}>
        <summary class="cursor-pointer">
          <Show
            when={linked()}
            fallback={
              <span class={undecided() || unknown() ? 'text-warning' : 'text-base-content/60'}>
                {undecided()
                  ? m.lookup_several()
                  : unknown()
                    ? m.lookup_unknown({ name: text().trim() })
                    : text().trim()
                      ? props.lookup.unlinked
                      : m.lookup_none()}
              </span>
            }
          >
            {(row) => (
              <span class="text-base-content/80">{m.lookup_linked({ name: row().label })}</span>
            )}
          </Show>
        </summary>
        <select
          name={props.idName}
          aria-label={m.lookup_choose({ field: props.label })}
          class="validator select mt-1 w-full select-sm"
          aria-invalid={ariaInvalid(props.invalid(props.idName))}
          onChange={(e) => chose(Number(e.currentTarget.value) || null)}
        >
          <option value="" selected={id() === null}>
            {m.form_none()}
          </option>
          {/* The rows the value names first, when there are several. */}
          <For each={undecided() ? orderedBy(props.lookup.options, named()) : props.lookup.options}>
            {(option) => (
              <option value={option.value} selected={id() === option.value}>
                {option.label}
              </option>
            )}
          </For>
        </select>
        <FieldError fault={props.invalid(props.idName)} />
        {/* Or a new row: its fields open with the box (by CSS, so before
            JavaScript loads too), prefilled from the value as written. */}
        <Show when={props.lookup.create}>
          {(create) => (
            <div class="mt-2">
              <input
                type="checkbox"
                id={createId()}
                name={createName(props.textName)}
                checked={creating()}
                class="peer checkbox checkbox-sm align-middle"
                onChange={(e) => setCreating(e.currentTarget.checked)}
              />
              <label for={createId()} class="ml-2 cursor-pointer align-middle">
                {create().label}
              </label>
              <div class="hidden peer-checked:block">
                {create().fields(newPrefix(props.textName), text().trim())}
              </div>
            </div>
          )}
        </Show>
      </details>
    </div>
  );
}

// The options, those in `first` ahead of the rest.
const orderedBy = (options: LookupOption[], first: number[]) => [
  ...options.filter((o) => first.includes(o.value)),
  ...options.filter((o) => !first.includes(o.value)),
];

/** The <datalist> a lookup's inputs suggest from: each spelling once, with what it names. */
export function SpellingList(props: { lookup: Lookup }) {
  const entries = createMemo(
    () => {
      const seen = new Map<string, string[]>();
      for (const option of props.lookup.options) {
        for (const spelling of option.spellings) {
          const labels = seen.get(spelling) ?? [];
          labels.push(option.label);
          seen.set(spelling, labels);
        }
      }
      return [...seen].map(([spelling, labels]) => ({
        spelling,
        // The datalist shows the label beside the value, so the same
        // text twice is left out.
        label: labels.length === 1 && labels[0] === spelling ? undefined : labels.join(' · '),
      }));
    },
    { name: 'lookup-spellings' },
  );
  return (
    <datalist id={props.lookup.listId}>
      <For each={entries()}>{(e) => <option value={e.spelling} label={e.label} />}</For>
    </datalist>
  );
}
