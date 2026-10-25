import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';

import { type Fault, Select, TextInput } from '~/components/form-fields';
import { placeKindLabels } from '~/components/labels';
import { FIELD_MAX } from '~/lib/field-limits';
import { CYRILLIC_NAME_PATTERN, LATIN_NAME_PATTERN, matchesPattern } from '~/lib/name-scripts';
import { type PlaceKind, placeKinds } from '~/lib/place-kinds';
import { m } from '~/paraglide/messages.js';

// The fields of a row a lookup field offers to add (LookupCreate in
// ./lookup-field.tsx), named "<prefix>.<column>" as src/server/linked-rows.ts
// reads them. They are prefilled from the value as written: as the Russian
// name when it is in Cyrillic, as the Finnish one when in Latin letters. The
// fields have no `required` or `pattern`: they are hidden until their box is
// ticked, and a hidden invalid field would stop the form from submitting.
// The server checks them (russianName, finnishName).

interface NewRowProps {
  prefix: string;
  /** The value as written, to start from. */
  text: string;
  invalid: (field: string) => Fault;
}

const inCyrillic = (text: string) => matchesPattern(CYRILLIC_NAME_PATTERN, text);
const inLatin = (text: string) => matchesPattern(LATIN_NAME_PATTERN, text);

// A row's names in both alphabets, the value as written in its own.
function NameInputs(props: NewRowProps & { english?: boolean }) {
  return (
    <>
      <TextInput
        name={`${props.prefix}.nameRu`}
        label={m.form_name_ru()}
        value={inCyrillic(props.text) ? props.text : null}
        hint={m.form_name_ru_hint()}
        maxlength={FIELD_MAX.line}
        invalid={props.invalid(`${props.prefix}.nameRu`)}
      />
      <TextInput
        name={`${props.prefix}.nameFi`}
        label={m.form_name_fi()}
        value={inLatin(props.text) ? props.text : null}
        hint={m.form_name_fi_hint()}
        maxlength={FIELD_MAX.line}
        invalid={props.invalid(`${props.prefix}.nameFi`)}
      />
    </>
  );
}

function Fields(props: { children: JSX.Element }) {
  return (
    <div class="mt-2 grid gap-x-4 rounded-box border border-base-300 p-3 sm:grid-cols-2">
      {props.children}
    </div>
  );
}

/**
 * A new locality: its names, type and parish. `kind` is the type to start
 * from (a village, or a manor for an estate); `parishes` the choices of
 * parish, starting at `parishId` (the source's), or none when the parish is
 * fixed (a parish's own church).
 */
export function NewPlaceFields(
  props: NewRowProps & {
    kind?: PlaceKind;
    parishes?: { id: number; name: string }[];
    parishId?: number | null;
  },
) {
  return (
    <Fields>
      <NameInputs prefix={props.prefix} text={props.text} invalid={props.invalid} />
      <Select
        name={`${props.prefix}.kind`}
        label={m.place_edit_kind()}
        value={props.kind ?? 'village'}
        options={placeKinds.map((k) => ({ value: k, label: placeKindLabels[k]() }))}
        invalid={props.invalid(`${props.prefix}.kind`)}
      />
      <Show when={props.parishes}>
        {(parishes) => (
          <Select
            name={`${props.prefix}.parishId`}
            label={m.place_edit_parish()}
            value={props.parishId}
            none={m.form_none()}
            options={parishes().map((p) => ({ value: p.id, label: p.name }))}
            invalid={props.invalid(`${props.prefix}.parishId`)}
          />
        )}
      </Show>
    </Fields>
  );
}

/** A new clergyman: his names. */
export function NewClergyFields(props: NewRowProps) {
  return (
    <Fields>
      <NameInputs prefix={props.prefix} text={props.text} invalid={props.invalid} />
    </Fields>
  );
}

/** A new household or farm relation: its wording in each language. */
export function NewRelationFields(props: NewRowProps) {
  return (
    <Fields>
      <TextInput
        name={`${props.prefix}.ru`}
        label={m.form_name_ru()}
        value={inCyrillic(props.text) ? props.text : null}
        hint={m.form_name_ru_hint()}
        maxlength={FIELD_MAX.line}
        invalid={props.invalid(`${props.prefix}.ru`)}
      />
      <TextInput
        name={`${props.prefix}.fi`}
        label={m.form_name_fi()}
        value={inLatin(props.text) ? props.text : null}
        maxlength={FIELD_MAX.line}
        invalid={props.invalid(`${props.prefix}.fi`)}
      />
      <TextInput
        name={`${props.prefix}.en`}
        label={m.form_name_en()}
        value={null}
        maxlength={FIELD_MAX.line}
        invalid={props.invalid(`${props.prefix}.en`)}
      />
    </Fields>
  );
}

/**
 * A new parish: its names, and whether a locality of the same name is added
 * as its church (the usual case: the church village names the parish).
 */
export function NewParishFields(props: NewRowProps) {
  return (
    <Fields>
      <NameInputs prefix={props.prefix} text={props.text} invalid={props.invalid} />
      <label class="label cursor-pointer gap-2 sm:col-span-2">
        <input
          type="checkbox"
          name={`${props.prefix}.church`}
          checked
          class="checkbox checkbox-sm"
        />
        {m.parish_new_church()}
      </label>
    </Fields>
  );
}
