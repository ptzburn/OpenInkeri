import { For, Show, createMemo, createSignal } from 'solid-js';

import { type Fault, FieldError, ariaInvalid } from '~/components/form-fields';
import { FIELD_MAX } from '~/lib/field-limits';
import { type SpellingIndex, rowsSpelled } from '~/lib/spellings';
import { m } from '~/paraglide/messages.js';

/** A row a value can be linked to: a place, a relation, a clergyman. */
export interface LookupOption {
  value: number;
  label: string;
  spellings: string[];
}

/** The rows of one kind, for every field that links to them. */
export interface Lookup {
  options: LookupOption[];
  index: SpellingIndex;
  /** The <datalist> of their spellings (see SpellingList). */
  listId: string;
  /** Said under a value that names none of them. */
  unlinked: string;
}

/**
 * A value as the source writes it, typed once, and the row it is linked to.
 * The input suggests the known spellings; typing one that names exactly one
 * row links to it, and the line under the input says which, or that it
 * names several (then the choice opens) or none. The line opens a <select>
 * to link to another row, or to none. Posts `textName` and `idName`; before
 * JavaScript loads, the server links an unlinked spelling by the same rule.
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
  const named = createMemo(() => rowsSpelled(props.lookup.index, text()), {
    name: 'lookup-named',
  });
  const linked = () => props.lookup.options.find((o) => o.value === id());
  // Several rows have the spelling and none of them is chosen.
  const undecided = () => named().length > 1 && !named().includes(id() ?? 0);

  const typed = (value: string) => {
    setText(value);
    const rows = rowsSpelled(props.lookup.index, value);
    // A spelling of one row links to it; one of several keeps the choice
    // if it is among them; none (or nothing typed) unlinks.
    if (rows.length === 1) setId(rows[0]);
    else if (!rows.includes(id() ?? 0)) setId(null);
  };

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
      <details class="text-sm" open={undecided() || !!props.invalid(props.idName)}>
        <summary class="cursor-pointer">
          <Show
            when={linked()}
            fallback={
              <span class={undecided() ? 'text-warning' : 'text-base-content/60'}>
                {undecided()
                  ? m.lookup_several()
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
          onChange={(e) => setId(Number(e.currentTarget.value) || null)}
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
