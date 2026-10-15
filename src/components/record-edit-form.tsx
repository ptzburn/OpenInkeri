import type { JSX } from '@solidjs/web';
import { For, Show, createMemo, createSignal } from 'solid-js';

import type { QueryData } from '~/lib/query-data';
import { FIELD_MAX } from '~/lib/field-limits';
import {
  DeleteSection,
  FormActions,
  Select,
  TextInput,
  useFormDone,
  useFormErrors,
} from '~/components/form-fields';
import { useToast } from '~/components/toaster';
import {
  baptismLocationLabels,
  editedRoleLabels,
  recordStatusLabels,
  sexLabels,
} from '~/components/labels';
import { PARTIAL_DATE_PATTERN, formatPartialDate } from '~/lib/format';
import {
  type RecordEditData,
  type RecordEditPerson,
  deleteRecord,
  getRecordEdit,
  getRecordEditOptions,
  saveRecord,
} from '~/data/records';
import { type RecordKind, baptismLocations, recordStatuses, sexes } from '~/lib/record-kinds';
import {
  type EditedRole,
  type PersonField,
  editedRoles,
  isListKind,
  listFields,
  personFieldsOf,
} from '~/lib/record-people';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

const nameParts = [
  ['given', m.record_edit_given],
  ['patronymic', m.record_edit_patronymic],
  ['surname', m.record_edit_surname],
  ['maiden', m.record_edit_maiden],
] as const;

// The record's date, by kind.
const dateLabels: Record<RecordKind, () => string> = {
  baptisms: m.records_col_baptised,
  marriages: m.records_col_married,
  deaths: m.records_col_died,
  households: m.records_col_list_date,
  taxpayers: m.records_col_list_date,
};

type Option = { value: number; label: string };

/** Where the records list was, to return there after saving. */
export interface ListPlace {
  kind?: string;
  q?: string;
  page?: string;
}

// What a new record's form starts from: empty, of the list's type.
const blank = (kind: RecordKind): RecordEditData => ({
  id: 0,
  kind,
  sourceId: null,
  page: null,
  language: null,
  version: 0,
  status: 'ok',
  date: null,
  placeText: null,
  placeId: null,
  note: null,
  baptism: null,
  death: null,
  holding: null,
  people: {},
  members: [],
});

/**
 * The admin's form for one record, or for a new one of type `kind` without
 * `id`: its source and page, the record, its kind's details and the people
 * it names (~/lib/record-people). A register's form has one person in each
 * role; a list's (a household, a farm) has all its people, and more can be
 * added: one blank person is always at the end (also before JavaScript
 * loads), and Add person brings another. It posts to the saveRecord action
 * (and works before JavaScript loads); a save redirects to the list at
 * `returnTo` (a new record to the list's last page) with a toast, and
 * Cancel goes to `cancelHref`. A save the server refuses keeps the form as
 * typed, says why and marks the fields at fault. An existing record's form
 * is followed by its Delete section.
 */
export default function RecordEditForm(props: {
  id?: number;
  kind?: RecordKind;
  returnTo: ListPlace;
  cancelHref: string;
}) {
  const record = createMemo(
    (): Promise<QueryData<typeof getRecordEdit>> | RecordEditData =>
      props.id ? getRecordEdit(props.id) : blank(props.kind ?? 'baptisms'),
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
  const relations = createMemo(
    (): Option[] => (options()?.relations ?? []).map((t) => ({ value: t.id, label: t.name })),
    { name: 'edit-relations' },
  );
  // Blank people at the end of a list's form, to add.
  const [added, setAdded] = createSignal(1, { name: 'edit-added-people' });
  const isThisForm = (form: FormData) => form.get('id') === (props.id ? String(props.id) : '');
  // This form's refused saves (the latest shown, its fields marked).
  const { error, invalid } = useFormErrors(saveRecord, isThisForm);
  // A save lands on the records list with a toast.
  const toast = useToast();
  useFormDone(saveRecord, isThisForm, () =>
    toast(props.id ? m.record_saved() : m.record_created()),
  );
  // The sources of the record's type, and the language of the one picked
  // first (a new record's names are labelled by it).
  const sourcesOf = (kind: RecordKind) =>
    (options()?.sources ?? []).filter((source) => source.kind === kind);
  const languageOf = (r: RecordEditData) =>
    r.language ??
    sourcesOf(r.kind).find((s) => s.id === r.sourceId)?.language ??
    sourcesOf(r.kind)[0]?.language ??
    null;

  return (
    // Keyed: each record (and each fresh read of it) gets a fresh form. A
    // refused save revalidates nothing, so what was typed stays.
    <Show when={record()} keyed fallback={<p>{m.record_edit_missing()}</p>}>
      {(r) => (
        <>
          {/* A record needs a source of its type to go in. */}
          <Show when={options() && !sourcesOf(r.kind).length}>
            <div role="alert" class="alert alert-warning alert-soft">
              <span>{m.record_no_sources()}</span>
              <a href={paths.sources.new()} class="link">
                {m.sources_add()}
              </a>
            </div>
          </Show>
          {/* While a save is in flight the router marks the form aria-busy. */}
          <form method="post" action={saveRecord} class="group flex flex-col gap-6">
            <input type="hidden" name="returnKind" value={props.returnTo.kind ?? ''} />
            <input type="hidden" name="returnQ" value={props.returnTo.q ?? ''} />
            <input type="hidden" name="returnPage" value={props.returnTo.page ?? ''} />
            <input type="hidden" name="id" value={r.id || ''} />
            <input type="hidden" name="version" value={r.version} />

            {/* Two columns from xl up: the record and its details beside the
              people it names. */}
            <div class="grid items-start gap-8 xl:grid-cols-2">
              <div class="flex flex-col gap-6">
                <Section title={m.record_edit_record()}>
                  <Select
                    name="sourceId"
                    label={m.record_edit_source()}
                    value={r.sourceId}
                    options={sourcesOf(r.kind).map((s) => ({ value: s.id, label: s.title }))}
                    invalid={invalid('sourceId')}
                  />
                  <TextInput
                    name="page"
                    label={m.record_edit_page()}
                    value={r.page}
                    hint={m.record_edit_page_hint()}
                    maxlength={FIELD_MAX.line}
                    invalid={invalid('page')}
                  />
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
                      options={(options()?.clergy ?? []).map((c) => ({
                        value: c.id,
                        label: c.name,
                      }))}
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

                <Show when={isListKind(r.kind)}>
                  <Section title={m.record_edit_holding()}>
                    <TextInput
                      name="holdingNo"
                      label={
                        r.kind === 'households'
                          ? m.records_col_household()
                          : `${m.records_col_farm()}: ${m.record_edit_holding_no()}`
                      }
                      value={r.holding?.holdingNo}
                      maxlength={FIELD_MAX.line}
                      invalid={invalid('holdingNo')}
                    />
                    <Show when={r.kind === 'taxpayers'}>
                      <TextInput
                        name="tenantText"
                        label={m.record_edit_tenant()}
                        value={r.holding?.tenantText}
                        invalid={invalid('tenantText')}
                      />
                      <PlaceInputs
                        idName="estatePlaceId"
                        textName="estateText"
                        label={m.records_col_estate()}
                        id={r.holding?.estatePlaceId}
                        text={r.holding?.estateText}
                        places={places()}
                        invalid={invalid}
                      />
                    </Show>
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
                {/* A list's people, numbered in the form; then a register's,
                  one in each role. */}
                <Show
                  when={isListKind(r.kind) ? r.kind : undefined}
                  fallback={
                    <For
                      each={
                        editedRoles[r.kind as keyof typeof editedRoles] as readonly EditedRole[]
                      }
                    >
                      {(role) => (
                        <PersonFields
                          prefix={role}
                          legend={editedRoleLabels[role]()}
                          fields={personFieldsOf(r.kind as keyof typeof editedRoles, role)}
                          person={r.people[role] ?? null}
                          latin={languageOf(r)}
                          places={places()}
                          relations={relations()}
                          invalid={invalid}
                        />
                      )}
                    </For>
                  }
                >
                  {(kind) => (
                    <>
                      <For each={r.members}>
                        {(person, i) => (
                          <PersonFields
                            prefix={`members.${i()}`}
                            legend={`${i() + 1}. ${
                              relations().find((t) => t.value === person.relationTermId)?.label ??
                              person.relationText ??
                              ''
                            }`}
                            fields={listFields[kind()]}
                            person={person}
                            latin={languageOf(r)}
                            places={places()}
                            relations={relations()}
                            invalid={invalid}
                          />
                        )}
                      </For>
                      <For each={Array.from({ length: added() }, (_, k) => r.members.length + k)}>
                        {(n) => (
                          <PersonFields
                            prefix={`members.${n}`}
                            legend={`${n + 1}. ${m.record_edit_new_person()}`}
                            fields={listFields[kind()]}
                            person={null}
                            latin={languageOf(r)}
                            places={places()}
                            relations={relations()}
                            invalid={invalid}
                          />
                        )}
                      </For>
                      <button
                        type="button"
                        class="btn self-start"
                        onClick={() => setAdded((n) => n + 1)}
                      >
                        {m.record_edit_add_person()}
                      </button>
                    </>
                  )}
                </Show>
              </section>
            </div>

            {/* Kept in view at the bottom of the window while scrolling. */}
            <FormActions
              error={error()}
              cancelHref={props.cancelHref}
              class="sticky bottom-0 -mx-4 border-t border-base-300 bg-base-100 px-4 py-3 lg:-mx-8 lg:px-8"
            />
          </form>
          <Show when={r.id}>
            <DeleteSection
              action={deleteRecord}
              id={r.id}
              version={r.version}
              title={m.record_delete()}
              text={m.record_delete_text()}
              confirmLabel={m.record_delete_confirm()}
              inUse={undefined}
              deleted={m.record_deleted()}
            >
              <input type="hidden" name="returnKind" value={props.returnTo.kind ?? ''} />
              <input type="hidden" name="returnQ" value={props.returnTo.q ?? ''} />
              <input type="hidden" name="returnPage" value={props.returnTo.page ?? ''} />
            </DeleteSection>
          </Show>
        </>
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
  note: m.records_col_note,
  noteOriginal: m.record_edit_note_original,
};

/**
 * One person's fields, named "<prefix>.<field>": their names as written and
 * in parts, then `fields`. A person already on the record posts its id (a
 * list's people are told apart by it). The Latin-script name is Swedish in a
 * Swedish register, Finnish otherwise.
 */
function PersonFields(props: {
  prefix: string;
  legend: string;
  fields: readonly PersonField[];
  person: RecordEditPerson | null;
  latin: string | null;
  places: Option[];
  relations: Option[];
  invalid: (field: string) => boolean;
}) {
  const field = (name: string) => `${props.prefix}.${name}`;
  const value = (name: string) =>
    ((props.person as Record<string, unknown> | null)?.[name] ?? null) as string | null;
  const swedish = () => props.latin === 'sv';

  // One field's input; a place or a relation takes its id and text fields
  // together, drawn at the id.
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
      case 'birthDate':
      case 'deathDate':
        return (
          <DateInput
            name={field(f)}
            label={f === 'birthDate' ? m.records_col_born() : m.record_edit_death_date()}
            value={value(f)}
            invalid={props.invalid(field(f))}
          />
        );
      case 'hasWife':
        return (
          <div class="flex flex-col justify-end pb-2">
            <Checkbox
              name={field('hasWife')}
              label={m.record_edit_has_wife()}
              checked={props.person?.hasWife ?? false}
            />
          </div>
        );
      case 'relationTermId':
        return (
          <>
            <Select
              name={field('relationTermId')}
              label={m.record_edit_relation()}
              value={props.person?.relationTermId}
              none={m.form_none()}
              options={props.relations}
              invalid={props.invalid(field('relationTermId'))}
            />
            <TextInput
              name={field('relationText')}
              label={`${m.record_edit_relation()}: ${m.record_edit_as_written()}`}
              value={value('relationText')}
              invalid={props.invalid(field('relationText'))}
            />
          </>
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
      case 'relationText':
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
      <legend class="fieldset-legend">{props.legend}</legend>
      <Show when={props.person}>
        {(person) => <input type="hidden" name={field('id')} value={person().id} />}
      </Show>
      <div class="grid gap-x-4 sm:grid-cols-2">
        <TextInput
          name={field('nameRu')}
          label={m.record_edit_name_ru()}
          value={value('nameRu')}
          invalid={props.invalid(field('nameRu'))}
        />
        <TextInput
          name={field('nameFi')}
          label={swedish() ? m.record_edit_name_sv() : m.record_edit_name_fi()}
          value={value('nameFi')}
          invalid={props.invalid(field('nameFi'))}
        />
        <For each={props.fields}>{(f) => input(f)}</For>
      </div>
      {/* The parts are what search and display use; the import split them
          from the names as written, so they are where a misread split is
          fixed. */}
      <div class="mt-3">
        <p class="mb-2 text-sm font-medium">{m.record_edit_name_parts()}</p>
        <div class="grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-2">
          <span />
          <span class="text-xs text-base-content/60">{m.record_edit_part_ru()}</span>
          <span class="text-xs text-base-content/60">
            {swedish() ? m.record_edit_part_sv() : m.record_edit_part_fi()}
          </span>
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
                  aria-label={`${label()}, ${swedish() ? m.record_edit_part_sv() : m.record_edit_part_fi()}`}
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
