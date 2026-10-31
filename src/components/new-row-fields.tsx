import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';

import { type Fault, FieldError, Select, TextInput } from '~/components/form-fields';
import { placeKindLabels } from '~/components/labels';
import { FIELD_MAX } from '~/lib/field-limits';
import { type Names, localName } from '~/lib/format';
import { CYRILLIC_NAME_PATTERN, LATIN_NAME_PATTERN, matchesPattern } from '~/lib/name-scripts';
import { type PlaceKind, placeKinds } from '~/lib/place-kinds';
import { m } from '~/paraglide/messages.js';

// The fields of a row a lookup field adds (LookupCreate in
// ./lookup-field.tsx), named "<prefix>.<column>" as src/server/linked-rows.ts
// reads them. The value as written is one of the row's names already: the
// Russian one when it is in Cyrillic, the Finnish one when in Latin letters.
// It is posted as that name, hidden, and only the other name is asked for:
// the Finnish, optional, or the Russian, which every row must have. The
// server checks them (russianName, finnishName).

interface NewRowProps {
  prefix: string;
  /** The value as written, to start from. */
  text: string;
  invalid: (field: string) => Fault;
}

const inCyrillic = (text: string) => matchesPattern(CYRILLIC_NAME_PATTERN, text);
const inLatin = (text: string) => matchesPattern(LATIN_NAME_PATTERN, text);

// A row's names: the value as written as the one in its own alphabet,
// hidden, and the other one to type. A value in neither alphabet (digits,
// say) shows both, for the server's refusal to land somewhere visible.
function NameInputs(props: NewRowProps) {
  const russian = () => inCyrillic(props.text);
  const finnish = () => !russian() && inLatin(props.text);
  return (
    <>
      <Show
        when={!russian()}
        fallback={
          <>
            <input type="hidden" name={`${props.prefix}.nameRu`} value={props.text} />
            <FieldError fault={props.invalid(`${props.prefix}.nameRu`)} />
          </>
        }
      >
        <TextInput
          name={`${props.prefix}.nameRu`}
          label={m.form_name_ru()}
          value={null}
          required
          hint={m.form_name_ru_hint()}
          maxlength={FIELD_MAX.line}
          invalid={props.invalid(`${props.prefix}.nameRu`)}
        />
      </Show>
      <Show
        when={!finnish()}
        fallback={
          <>
            <input type="hidden" name={`${props.prefix}.nameFi`} value={props.text} />
            <FieldError fault={props.invalid(`${props.prefix}.nameFi`)} />
          </>
        }
      >
        <TextInput
          name={`${props.prefix}.nameFi`}
          label={m.form_name_fi()}
          value={null}
          hint={m.form_name_fi_hint()}
          maxlength={FIELD_MAX.line}
          invalid={props.invalid(`${props.prefix}.nameFi`)}
        />
      </Show>
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
    parishes?: { id: number; name: Names }[];
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
            options={parishes().map((p) => ({ value: p.id, label: localName(p.name) }))}
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
 * as its church (the usual case: the church village names the parish). A
 * locality's own form leaves the church out (`church={false}`): it is adding
 * a locality already.
 */
export function NewParishFields(props: NewRowProps & { church?: boolean }) {
  return (
    <Fields>
      <NameInputs prefix={props.prefix} text={props.text} invalid={props.invalid} />
      <Show when={props.church ?? true}>
        <label class="label cursor-pointer gap-2 sm:col-span-2">
          <input
            type="checkbox"
            name={`${props.prefix}.church`}
            checked
            class="checkbox checkbox-sm"
          />
          {m.parish_new_church()}
        </label>
      </Show>
    </Fields>
  );
}
