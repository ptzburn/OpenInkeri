import { For, Show, createSignal } from 'solid-js';

import { type Fault, FieldError, ariaInvalid } from '~/components/form-fields';
import { FIELD_MAX } from '~/lib/field-limits';
import { splitName } from '~/lib/name-split';
import { type NameField, nameFields } from '~/lib/record-people';
import { m } from '~/paraglide/messages.js';

const parts = [
  ['given', m.record_edit_given],
  ['patronymic', m.record_edit_patronymic],
  ['surname', m.record_edit_surname],
  ['maiden', m.record_edit_maiden],
] as const;
type Lang = 'Ru' | 'Fi';
type Part = (typeof parts)[number][0];

/**
 * A person's names as written, in Russian and in the Latin-script language
 * (Swedish in a Swedish register, Finnish otherwise), and their parts:
 * given name, patronymic, surname and maiden name, which search and display
 * use. The parts are split from a name as it is typed (~/lib/name-split)
 * and shown on one line under the names; opening it shows them as fields to
 * correct a misread split. Once one is corrected, typing a name no longer
 * splits it, and "<prefix>.split" posts "manual" so the server keeps them;
 * otherwise the server splits typed names again (it knows more given names).
 * The names are fields of the parent's two-column grid; the parts span both.
 */
export default function NameFields(props: {
  prefix: string;
  /** The stored names and parts, by field. */
  value: (field: NameField) => string | null;
  swedish: boolean;
  /** The person's sex, until the form's sex field says. */
  sex: 'male' | 'female';
  invalid: (field: string) => Fault;
}) {
  const field = (name: string) => `${props.prefix}.${name}`;
  // The form is keyed by its record, so these start from it once.
  const [names, setNames] = createSignal(
    () =>
      Object.fromEntries(nameFields.map((f) => [f, props.value(f) ?? ''])) as Record<
        NameField,
        string
      >,
    { name: 'name-fields' },
  );
  const [corrected, setCorrected] = createSignal(false, { name: 'name-corrected' });
  const latinLabel = () => (props.swedish ? m.record_edit_part_sv() : m.record_edit_part_fi());
  // The parts a name has, for the line under the names.
  const split = (lang: Lang) => parts.filter(([part]) => names()[`${part}${lang}`]);
  const partsInvalid = () =>
    nameFields.some((f) => !f.startsWith('name') && props.invalid(field(f)) !== undefined);

  const typed = (lang: Lang, text: string, form: HTMLFormElement | null) => {
    // The sex as the form now says, for the patronymic's ending.
    const said = (form?.elements.namedItem(field('sex')) as HTMLSelectElement | null)?.value;
    const sex = said === 'male' || said === 'female' ? said : props.sex;
    const split = corrected()
      ? undefined
      : splitName(text, lang === 'Ru' ? 'ru' : props.swedish ? 'sv' : 'fi', sex);
    setNames((prev) => {
      const next = { ...prev, [`name${lang}`]: text };
      if (split !== undefined) {
        for (const [part] of parts) next[`${part}${lang}`] = split?.[part] ?? '';
      }
      return next;
    });
  };
  const partTyped = (name: `${Part}${Lang}`, text: string) => {
    setCorrected(true);
    setNames((prev) => ({ ...prev, [name]: text }));
  };

  return (
    <>
      <NameInput
        name={field('nameRu')}
        label={m.record_edit_name_ru()}
        value={names().nameRu}
        invalid={props.invalid(field('nameRu'))}
        onInput={(text, form) => typed('Ru', text, form)}
      />
      <NameInput
        name={field('nameFi')}
        label={props.swedish ? m.record_edit_name_sv() : m.record_edit_name_fi()}
        value={names().nameFi}
        invalid={props.invalid(field('nameFi'))}
        onInput={(text, form) => typed('Fi', text, form)}
      />
      <input type="hidden" name={field('split')} value={corrected() ? 'manual' : 'auto'} />
      <details class="mb-2 text-sm sm:col-span-2" open={partsInvalid()}>
        <summary class="cursor-pointer">
          <span class="font-medium">{m.record_edit_name_parts()}</span>
          <Show when={corrected()}>
            <span class="ml-2 badge badge-soft badge-sm">{m.record_edit_split_corrected()}</span>
          </Show>
          <For each={['Ru', 'Fi'] as const}>
            {(lang) => (
              <Show when={names()[`name${lang}`].trim()}>
                <span class="mt-1 block">
                  <span class="text-base-content/60">
                    {lang === 'Ru' ? m.record_edit_part_ru() : latinLabel()}:{' '}
                  </span>
                  <Show
                    when={split(lang).length}
                    fallback={
                      <span class="text-base-content/60 italic">{m.record_edit_split_none()}</span>
                    }
                  >
                    <For each={split(lang)}>
                      {([part, label], i) => (
                        <>
                          <Show when={i() > 0}>{' · '}</Show>
                          <span class="text-base-content/60">{label()} </span>
                          {names()[`${part}${lang}`]}
                        </>
                      )}
                    </For>
                  </Show>
                </span>
              </Show>
            )}
          </For>
          <span class="mt-1 block link text-xs">{m.record_edit_split_correct()}</span>
        </summary>
        <div class="mt-2 grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-2">
          <span />
          <span class="text-xs text-base-content/60">{m.record_edit_part_ru()}</span>
          <span class="text-xs text-base-content/60">{latinLabel()}</span>
          <For each={parts}>
            {([part, label]) => (
              <>
                <span class="text-sm">{label()}</span>
                <For each={['Ru', 'Fi'] as const}>
                  {(lang) => (
                    <NamePartInput
                      name={field(`${part}${lang}`)}
                      value={names()[`${part}${lang}`]}
                      label={`${label()}, ${lang === 'Ru' ? m.record_edit_part_ru() : latinLabel()}`}
                      invalid={props.invalid(field(`${part}${lang}`))}
                      onInput={(text) => partTyped(`${part}${lang}`, text)}
                    />
                  )}
                </For>
              </>
            )}
          </For>
        </div>
      </details>
    </>
  );
}

function NameInput(props: {
  name: string;
  label: string;
  value: string;
  invalid: Fault;
  onInput: (text: string, form: HTMLFormElement | null) => void;
}) {
  return (
    <label class="fieldset">
      <span class="fieldset-legend">{props.label}</span>
      <input
        name={props.name}
        value={props.value}
        maxlength={FIELD_MAX.text}
        class="validator input w-full"
        aria-invalid={ariaInvalid(props.invalid)}
        onInput={(e) => props.onInput(e.currentTarget.value, e.currentTarget.form)}
      />
      <FieldError fault={props.invalid} />
    </label>
  );
}

// One cell of the name parts grid: its label is the row's and the column's.
function NamePartInput(props: {
  name: string;
  value: string;
  label: string;
  invalid: Fault;
  onInput: (text: string) => void;
}) {
  return (
    <div class="flex flex-col">
      <input
        name={props.name}
        value={props.value}
        maxlength={FIELD_MAX.text}
        aria-label={props.label}
        class="validator input input-sm w-full"
        aria-invalid={ariaInvalid(props.invalid)}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
      <FieldError fault={props.invalid} />
    </div>
  );
}
