import type { JSX } from '@solidjs/web';
import { For, Show, createMemo } from 'solid-js';

import type { QueryData } from '~/lib/query-data';
import { FIELD_MAX } from '~/lib/field-limits';
import { FormActions, Select, TextInput, useFormErrors } from '~/components/form-fields';
import {
  baptismLocationLabels,
  editedRoleLabels,
  recordStatusLabels,
  sexLabels,
} from '~/components/labels';
import { PARTIAL_DATE_PATTERN, formatPartialDate } from '~/lib/format';
import {
  type RecordEditPerson,
  getRecordEdit,
  getRecordEditOptions,
  saveRecord,
} from '~/data/records';
import { type EditableKind, baptismLocations, recordStatuses, sexes } from '~/lib/record-kinds';
import {
  type EditedRole,
  type PersonField,
  editedRoles,
  personFieldsOf,
} from '~/lib/record-people';
import { m } from '~/paraglide/messages.js';

const nameParts = [
  ['given', m.record_edit_given],
  ['patronymic', m.record_edit_patronymic],
  ['surname', m.record_edit_surname],
  ['maiden', m.record_edit_maiden],
] as const;

// The record's date, by kind.
const dateLabels: Record<EditableKind, () => string> = {
  baptisms: m.records_col_baptised,
  marriages: m.records_col_married,
  deaths: m.records_col_died,
};

type Option = { value: number; label: string };

/** Where the records list was, to return there after saving. */
export interface ListPlace {
  kind?: string;
  q?: string;
  page?: string;
}

/**
 * The admin's form for one baptism, marriage or death record: the record,
 * its kind's details and the people it names (~/lib/record-people). It
 * posts to the saveRecord action (and works before JavaScript loads); a
 * save redirects to the list at `returnTo`, and Cancel goes to
 * `cancelHref`. A save the server refuses keeps the form as typed, says why
 * and marks the fields at fault.
 */
export default function RecordEditForm(props: {
  id: number;
  returnTo: ListPlace;
  cancelHref: string;
}) {
  const record = createMemo(
    (): Promise<QueryData<typeof getRecordEdit>> => getRecordEdit(props.id),
    { name: 'record-edit' },
  );
  const options = createMemo(
    (): Promise<QueryData<typeof getRecordEditOptions>> => getRecordEditOptions(),
    { name: 'edit-options' },
  );
  // The places to pick from, with their parish when it isn't their namesake.
  const places = createMemo(
    (): Option[] =>
      (options()?.places ?? []).map((place) => ({
        value: place.id,
        label:
          place.parish && place.parish !== place.name
            ? `${place.name} (${place.parish})`
            : place.name,
      })),
    { name: 'edit-places' },
  );
  // This form's refused saves (the latest shown, its fields marked).
  const { error, invalid } = useFormErrors(
    saveRecord,
    (form) => form.get('id') === String(props.id),
  );

  return (
    // Keyed: each record (and each fresh read of it) gets a fresh form. A
    // refused save revalidates nothing, so what was typed stays.
    <Show when={record()} keyed fallback={<p>{m.record_edit_missing()}</p>}>
      {(r) => (
        // While a save is in flight the router marks the form aria-busy.
        <form method="post" action={saveRecord} class="group flex flex-col gap-6">
          <input type="hidden" name="returnKind" value={props.returnTo.kind ?? ''} />
          <input type="hidden" name="returnQ" value={props.returnTo.q ?? ''} />
          <input type="hidden" name="returnPage" value={props.returnTo.page ?? ''} />
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="version" value={r.version} />

          {/* Two columns from xl up: the record and its details beside the
              people it names. */}
          <div class="grid items-start gap-8 xl:grid-cols-2">
            <div class="flex flex-col gap-6">
              <Section title={m.record_edit_record()}>
                <Select
                  name="status"
                  label={m.record_edit_status()}
                  value={r.status}
                  options={recordStatuses.map((s) => ({
                    value: s,
                    label: recordStatusLabels[s](),
                  }))}
                  invalid={invalid('status')}
                />
                <DateInput
                  name="date"
                  label={dateLabels[r.kind]()}
                  value={r.date}
                  invalid={invalid('date')}
                />
                <Show when={r.kind === 'baptisms'}>
                  <DateInput
                    name="birthDate"
                    label={m.records_col_born()}
                    value={r.baptism?.birthDate}
                    invalid={invalid('birthDate')}
                  />
                </Show>
                {/* A marriage has no place of its own: the bride and groom
                    each have where they lived. */}
                <Show when={r.kind !== 'marriages'}>
                  <PlaceInputs
                    idName="placeId"
                    textName="placeText"
                    label={
                      r.kind === 'deaths' ? m.records_col_death_place() : m.record_edit_village()
                    }
                    id={r.placeId}
                    text={r.placeText}
                    places={places()}
                    invalid={invalid}
                  />
                </Show>
                <label class="fieldset sm:col-span-2">
                  <span class="fieldset-legend">{m.records_col_note()}</span>
                  <textarea
                    name="note"
                    maxlength={FIELD_MAX.text}
                    rows={3}
                    class={['textarea w-full', { 'textarea-error': invalid('note') }]}
                    aria-invalid={invalid('note') ? 'true' : undefined}
                  >
                    {r.note ?? ''}
                  </textarea>
                </label>
              </Section>

              <Show when={r.kind === 'baptisms'}>
                <Section title={m.record_edit_baptism()}>
                  <Select
                    name="officiantId"
                    label={m.record_edit_officiant()}
                    value={r.baptism?.officiantId}
                    none={m.form_none()}
                    options={(options()?.clergy ?? []).map((c) => ({ value: c.id, label: c.name }))}
                    invalid={invalid('officiantId')}
                  />
                  <TextInput
                    name="officiantText"
                    label={`${m.record_edit_officiant()}: ${m.record_edit_as_written()}`}
                    value={r.baptism?.officiantText}
                    invalid={invalid('officiantText')}
                  />
                  <Select
                    name="location"
                    label={m.record_edit_location()}
                    value={r.baptism?.location}
                    none={m.form_none()}
                    options={baptismLocations.map((l) => ({
                      value: l,
                      label: baptismLocationLabels[l](),
                    }))}
                    invalid={invalid('location')}
                  />
                  <DateInput
                    name="emergencyDate"
                    label={m.record_edit_emergency()}
                    value={r.baptism?.emergencyDate}
                    invalid={invalid('emergencyDate')}
                  />
                  <Select
                    name="multipleBirth"
                    label={m.record_edit_multiple_birth()}
                    value={r.baptism?.multipleBirth}
                    none={m.record_edit_single()}
                    options={[
                      { value: 2, label: m.records_twins() },
                      { value: 3, label: m.records_triplets() },
                    ]}
                    invalid={invalid('multipleBirth')}
                  />
                  <div class="flex flex-col justify-end gap-2 pb-2">
                    <Checkbox
                      name="illegitimate"
                      label={m.records_illegitimate()}
                      checked={r.baptism?.illegitimate ?? false}
                    />
                    <Checkbox
                      name="stillborn"
                      label={m.records_stillborn()}
                      checked={r.baptism?.stillborn ?? false}
                    />
                  </div>
                </Section>
              </Show>

              <Show when={r.kind === 'deaths'}>
                <Section title={m.record_edit_death()}>
                  <DateInput
                    name="burialDate"
                    label={m.records_col_buried()}
                    value={r.death?.burialDate}
                    invalid={invalid('burialDate')}
                  />
                  <TextInput
                    name="burialPlaceText"
                    label={m.record_edit_burial_place()}
                    value={r.death?.burialPlaceText}
                    invalid={invalid('burialPlaceText')}
                  />
                  <TextInput
                    name="causeText"
                    label={m.records_col_cause()}
                    value={r.death?.causeText}
                    invalid={invalid('causeText')}
                  />
                  <div class="flex flex-col justify-end gap-2 pb-2">
                    <Checkbox
                      name="stillborn"
                      label={m.records_stillborn()}
                      checked={r.death?.stillborn ?? false}
                    />
                  </div>
                </Section>
              </Show>
            </div>

            <section class="flex flex-col gap-3">
              <h2 class="text-lg font-semibold">{m.record_edit_people()}</h2>
              <p class="text-sm text-base-content/60">{m.record_edit_remove_hint()}</p>
              <For each={editedRoles[r.kind] as readonly EditedRole[]}>
                {(role) => (
                  <PersonFields
                    kind={r.kind}
                    role={role}
                    person={r.people[role] ?? null}
                    places={places()}
                    invalid={invalid}
                  />
                )}
              </For>
            </section>
          </div>

          {/* Kept in view at the bottom of the window while scrolling. */}
          <FormActions
            error={error()}
            cancelHref={props.cancelHref}
            class="sticky bottom-0 -mx-4 border-t border-base-300 bg-base-100 px-4 py-3 lg:-mx-8 lg:px-8"
          />
        </form>
      )}
    </Show>
  );
}

// A place picked from the list, and the place as the source writes it.
function PlaceInputs(props: {
  idName: string;
  textName: string;
  label: string;
  id: number | null | undefined;
  text: string | null | undefined;
  places: Option[];
  invalid: (field: string) => boolean;
}) {
  return (
    <>
      <Select
        name={props.idName}
        label={props.label}
        value={props.id}
        none={m.form_none()}
        options={props.places}
        invalid={props.invalid(props.idName)}
      />
      <TextInput
        name={props.textName}
        label={`${props.label}: ${m.record_edit_as_written()}`}
        value={props.text}
        invalid={props.invalid(props.textName)}
      />
    </>
  );
}

// The text fields a person may have, by field.
const textFieldLabels: Partial<Record<PersonField, () => string>> = {
  origin: m.record_edit_origin,
  ageText: m.records_col_age,
  rankText: m.record_edit_rank,
  religionText: m.record_edit_religion,
  civilStatusText: m.record_edit_civil_status,
};

function PersonFields(props: {
  kind: EditableKind;
  role: EditedRole;
  person: RecordEditPerson | null;
  places: Option[];
  invalid: (field: string) => boolean;
}) {
  const field = (name: string) => `${props.role}.${name}`;
  const value = (name: string) =>
    ((props.person as Record<string, unknown> | null)?.[name] ?? null) as string | null;

  // One field's input; a place takes its id and text fields together, drawn
  // at the id.
  const input = (f: PersonField) => {
    switch (f) {
      case 'sex':
        return (
          <Select
            name={field('sex')}
            label={m.record_edit_sex()}
            value={value('sex')}
            none={m.form_none()}
            options={sexes.map((s) => ({ value: s, label: sexLabels[s]() }))}
            invalid={props.invalid(field('sex'))}
          />
        );
      case 'deathDate':
        return (
          <DateInput
            name={field('deathDate')}
            label={m.record_edit_death_date()}
            value={value('deathDate')}
            invalid={props.invalid(field('deathDate'))}
          />
        );
      case 'residenceId':
      case 'birthplaceId': {
        const place = f === 'residenceId' ? 'residence' : 'birthplace';
        return (
          <PlaceInputs
            idName={field(`${place}Id`)}
            textName={field(`${place}Text`)}
            label={place === 'residence' ? m.record_edit_residence() : m.record_edit_birthplace()}
            id={props.person?.[`${place}Id`]}
            text={props.person?.[`${place}Text`]}
            places={props.places}
            invalid={props.invalid}
          />
        );
      }
      case 'residenceText':
      case 'birthplaceText':
        return null;
      default:
        return (
          <TextInput
            name={field(f)}
            label={textFieldLabels[f]?.() ?? f}
            value={value(f)}
            invalid={props.invalid(field(f))}
          />
        );
    }
  };

  return (
    <fieldset class="fieldset rounded-box border border-base-300 p-4">
      <legend class="fieldset-legend">{editedRoleLabels[props.role]()}</legend>
      <div class="grid gap-x-4 sm:grid-cols-2">
        <TextInput
          name={field('nameRu')}
          label={m.record_edit_name_ru()}
          value={value('nameRu')}
          invalid={props.invalid(field('nameRu'))}
        />
        <TextInput
          name={field('nameFi')}
          label={m.record_edit_name_fi()}
          value={value('nameFi')}
          invalid={props.invalid(field('nameFi'))}
        />
        <For each={personFieldsOf(props.kind, props.role)}>{(f) => input(f)}</For>
      </div>
      {/* The parts are what search and display use; the import split them
          from the names as written, so they are where a misread split is
          fixed. */}
      <div class="mt-3">
        <p class="mb-2 text-sm font-medium">{m.record_edit_name_parts()}</p>
        <div class="grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-2">
          <span />
          <span class="text-xs text-base-content/60">{m.record_edit_part_ru()}</span>
          <span class="text-xs text-base-content/60">{m.record_edit_part_fi()}</span>
          <For each={nameParts}>
            {([part, label]) => (
              <>
                <span class="text-sm">{label()}</span>
                <input
                  name={field(`${part}Ru`)}
                  value={value(`${part}Ru`) ?? ''}
                  aria-label={`${label()}, ${m.record_edit_part_ru()}`}
                  class="input input-sm w-full"
                />
                <input
                  name={field(`${part}Fi`)}
                  value={value(`${part}Fi`) ?? ''}
                  aria-label={`${label()}, ${m.record_edit_part_fi()}`}
                  class="input input-sm w-full"
                />
              </>
            )}
          </For>
        </div>
      </div>
    </fieldset>
  );
}

function Section(props: { title: string; children: JSX.Element }) {
  return (
    <section class="flex flex-col gap-1">
      <h2 class="text-lg font-semibold">{props.title}</h2>
      <div class="grid gap-x-4 sm:grid-cols-2">{props.children}</div>
    </section>
  );
}

// A date as the page shows it (12.3.1895, 3.1895, 1895); the server reads
// it back (parsePartialDate) and the pattern catches typos before sending.
function DateInput(props: {
  name: string;
  label: string;
  value: string | null | undefined;
  invalid: boolean;
}) {
  return (
    <label class="fieldset">
      <span class="fieldset-legend">{props.label}</span>
      <input
        name={props.name}
        value={formatPartialDate(props.value)}
        pattern={PARTIAL_DATE_PATTERN}
        inputmode="numeric"
        class={['input w-full', { 'input-error': props.invalid }]}
        aria-invalid={props.invalid ? 'true' : undefined}
      />
      <span class="label">{m.record_edit_date_hint()}</span>
    </label>
  );
}

function Checkbox(props: { name: string; label: string; checked: boolean }) {
  return (
    <label class="label cursor-pointer gap-2">
      <input
        type="checkbox"
        name={props.name}
        checked={props.checked}
        class="checkbox checkbox-sm"
      />
      {props.label}
    </label>
  );
}
