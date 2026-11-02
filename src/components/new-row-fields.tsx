import type { JSX } from '@solidjs/web';
import { Show, createSignal } from 'solid-js';

import { type Fault, FieldError, Select, TextInput } from '~/components/form-fields';
import { placeKindLabels } from '~/components/labels';
import { type Lookup, lookupRows } from '~/components/lookup-field';
import PlaceLocator, { type Location } from '~/components/place-locator';
import type { ParishOption } from '~/data/parishes';
import { FIELD_MAX } from '~/lib/field-limits';
import { type Names, localName, placeLabel } from '~/lib/format';
import { type GazetteerHit, placeKindOf } from '~/lib/gazetteer';
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

/** What a new row's name fields are called: "Name in Russian" unless said otherwise. */
interface NameLabels {
  ru: string;
  fi: string;
}

/** What a new locality's fields are called, where it is something in particular (a church). */
export interface PlaceLabels extends NameLabels {
  kind: string;
  location: string;
}

const inCyrillic = (text: string) => matchesPattern(CYRILLIC_NAME_PATTERN, text);
const inLatin = (text: string) => matchesPattern(LATIN_NAME_PATTERN, text);

// A row's names: the value as written as the one in its own alphabet,
// hidden, and the other one to type. A value in neither alphabet (digits,
// say) shows both, for the server's refusal to land somewhere visible.
// `values` fills the ones to type (a settlement found on the map), and
// `onInput` hears them typed, for a form that follows them.
function NameInputs(
  props: NewRowProps & {
    labels?: NameLabels;
    values?: { ru: string | null; fi: string | null };
    onInput?: (field: 'ru' | 'fi', value: string) => void;
  },
) {
  const russian = () => inCyrillic(props.text);
  const finnish = () => !russian() && inLatin(props.text);
  const labels = () => props.labels ?? { ru: m.form_name_ru(), fi: m.form_name_fi() };
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
          label={labels().ru}
          value={props.values?.ru}
          pattern={CYRILLIC_NAME_PATTERN}
          error={m.form_name_ru_script()}
          required
          maxlength={FIELD_MAX.line}
          invalid={props.invalid(`${props.prefix}.nameRu`)}
          onInput={(value) => props.onInput?.('ru', value)}
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
          label={labels().fi}
          value={props.values?.fi}
          pattern={LATIN_NAME_PATTERN}
          error={m.form_name_fi_script()}
          maxlength={FIELD_MAX.line}
          invalid={props.invalid(`${props.prefix}.nameFi`)}
          onInput={(value) => props.onInput?.('fi', value)}
        />
      </Show>
    </>
  );
}

// The box around a new row's fields; `plain` leaves it out, the fields
// following the lookup's own as if the form's.
function Fields(props: { plain?: boolean; children: JSX.Element }) {
  return (
    <div
      class={
        props.plain
          ? 'contents'
          : 'mt-2 grid gap-x-4 rounded-box border border-base-300 p-3 sm:grid-cols-2'
      }
    >
      {props.children}
    </div>
  );
}

/**
 * A new locality: its names, type, parish and where it stands. `kind` is
 * the type to start from (a village, or a manor for an estate); `parishes`
 * the choices of parish, starting at `parishId` (the source's), or none
 * when the parish is fixed (a parish's own church). A settlement found on
 * the locator's map fills the name to type, the type and, when there is a
 * choice, the parish whose church is nearest, all still editable; and is
 * handed on to `onFound`. A page that is a map itself (the parish's) finds
 * the settlement in its own search, given as `start`, and sets `location`
 * on its map. `plain` leaves the box out, the fields following the lookup's
 * own, named by `labels` for what the locality is to the form (a church).
 */
export function NewPlaceFields(
  props: NewRowProps & {
    plain?: boolean;
    labels?: PlaceLabels;
    kind?: PlaceKind;
    parishes?: { id: number; name: Names }[];
    parishId?: number | null;
    start?: GazetteerHit | null;
    location?: Location;
    onFound?: (hit: GazetteerHit) => void;
  },
) {
  // What the fields show: as they start (from the settlement the page
  // found, if any), then as typed or chosen (the fields report back, so a
  // settlement found lands whatever they held).
  const [names, setNames] = createSignal(
    () => ({ ru: props.start?.nameRu ?? null, fi: props.start?.nameFi ?? null }),
    { name: 'new-place-names' },
  );
  const [kind, setKind] = createSignal<PlaceKind>(
    () => (props.start && placeKindOf(props.start.kind)) || props.kind || 'village',
    { name: 'new-place-kind' },
  );
  const [parishId, setParishId] = createSignal(() => props.parishId ?? null, {
    name: 'new-place-parish',
  });
  const found = (hit: GazetteerHit) => {
    setNames((n) => ({ ru: hit.nameRu ?? n.ru, fi: hit.nameFi ?? n.fi }));
    const placeKind = placeKindOf(hit.kind);
    if (placeKind) setKind(placeKind);
    if (hit.parish && props.parishes?.some((p) => p.id === hit.parish!.id)) {
      setParishId(hit.parish.id);
    }
    props.onFound?.(hit);
  };
  return (
    <Fields plain={props.plain}>
      <NameInputs
        prefix={props.prefix}
        text={props.text}
        invalid={props.invalid}
        labels={props.labels}
        values={names()}
        onInput={(field, value) => setNames((n) => ({ ...n, [field]: value }))}
      />
      <Select
        name={`${props.prefix}.kind`}
        label={props.labels?.kind ?? m.place_edit_kind()}
        value={kind()}
        options={placeKinds.map((k) => ({ value: k, label: placeKindLabels[k]() }))}
        invalid={props.invalid(`${props.prefix}.kind`)}
        onChange={(value) => setKind(value as PlaceKind)}
      />
      <Show when={props.parishes}>
        {(parishes) => (
          <Select
            name={`${props.prefix}.parishId`}
            label={m.place_edit_parish()}
            value={parishId()}
            none={m.form_none()}
            options={parishes().map((p) => ({ value: p.id, label: localName(p.name) }))}
            invalid={props.invalid(`${props.prefix}.parishId`)}
            onChange={(value) => setParishId(Number(value) || null)}
          />
        )}
      </Show>
      <PlaceLocator
        prefix={props.prefix}
        name={props.text}
        label={props.labels?.location}
        parishId={parishId()}
        location={props.location}
        invalid={props.invalid}
        onFound={found}
      />
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

/** A new household or farm relation: its wording in each language, the Russian one required, in Cyrillic. */
export function NewRelationFields(props: NewRowProps) {
  return (
    <Fields>
      <TextInput
        name={`${props.prefix}.ru`}
        label={m.form_name_ru()}
        value={inCyrillic(props.text) ? props.text : null}
        pattern={CYRILLIC_NAME_PATTERN}
        error={m.form_name_ru_script()}
        required
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
 * a locality already; and asks for the other name `plain`, under its parish
 * field, with no box around it.
 */
export function NewParishFields(props: NewRowProps & { church?: boolean; plain?: boolean }) {
  return (
    <Fields plain={props.plain}>
      {/* Named for the parish: a form adding a locality has name fields of its own. */}
      <NameInputs
        prefix={props.prefix}
        text={props.text}
        invalid={props.invalid}
        labels={{ ru: m.parish_new_name_ru(), fi: m.parish_new_name_fi() }}
      />
      <Show when={props.church ?? true}>
        <div class="fieldset sm:col-span-2">
          <label class="label gap-2 whitespace-normal">
            <input
              type="checkbox"
              name={`${props.prefix}.church`}
              checked
              class="checkbox checkbox-sm"
            />
            {m.parish_new_church()}
          </label>
        </div>
      </Show>
    </Fields>
  );
}

// --- The lookups the forms share --------------------------------------------------

/**
 * The parishes a source or locality links to, by either name; one not known
 * yet can be added in the field, with a locality of its name as its church
 * unless `church` is false (a locality's form is adding one already). With
 * `plain`, nothing says a parish is being added: the other name's field
 * just follows the parish field.
 */
export const parishLookup = (
  parishes: ParishOption[] | undefined,
  invalid: (field: string) => Fault,
  options: { church?: boolean; plain?: boolean } = {},
): Lookup =>
  lookupRows(parishes, (p) => localName(p.name), {
    label: options.plain ? undefined : m.lookup_create_parish(),
    fields: (prefix, text) => (
      <NewParishFields
        prefix={prefix}
        text={text()}
        invalid={invalid}
        church={options.church}
        plain={options.plain}
      />
    ),
  });

/**
 * The localities a form links to, with their parish when it isn't their
 * namesake; one not known yet can be added in the field. `added` says how:
 * its kind by the field's prefix (an estate is a manor), and the parishes to
 * choose from, starting at `parishId`; neither when the parish is fixed.
 * With `plain`, nothing says a locality is being added: its fields, named
 * by `labels`, just follow the field (see NewPlaceFields).
 * `onFound` hears a settlement found on its map, for the form around; on a
 * page that is a map, `start` is the settlement its search found and
 * `location` what its map sets (see NewPlaceFields).
 */
export const placeLookup = (
  places: { id: number; name: Names; parish: Names | null; spellings: string[] }[] | undefined,
  invalid: (field: string) => Fault,
  added: {
    plain?: boolean;
    labels?: PlaceLabels;
    kind?: (prefix: string) => PlaceKind;
    parishes?: () => { id: number; name: Names }[];
    parishId?: () => number | null;
    start?: () => GazetteerHit | null;
    location?: Location;
    onFound?: (hit: GazetteerHit) => void;
  } = {},
): Lookup =>
  lookupRows(places, placeLabel, {
    label: added.plain ? undefined : m.lookup_create_place(),
    fields: (prefix, text) => (
      <NewPlaceFields
        prefix={prefix}
        text={text()}
        plain={added.plain}
        labels={added.labels}
        kind={added.kind?.(prefix)}
        parishes={added.parishes?.()}
        parishId={added.parishId?.()}
        start={added.start?.()}
        location={added.location}
        invalid={invalid}
        onFound={added.onFound}
      />
    ),
  });
