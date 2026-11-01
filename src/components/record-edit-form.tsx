import type { JSX } from '@solidjs/web';
import { For, Show, createMemo, createSignal } from 'solid-js';

import type { QueryData } from '~/lib/query-data';
import { FIELD_MAX } from '~/lib/field-limits';
import {
  DeleteSection,
  type Fault,
  FormActions,
  Select,
  TextArea,
  TextInput,
  useFormDone,
  saveBarClass,
  useFormErrors,
} from '~/components/form-fields';
import { type Lookup, LookupField, lookupOf } from '~/components/lookup-field';
import NameFields from '~/components/name-fields';
import PersonLinkField from '~/components/person-link-field';
import { NewClergyFields, NewPlaceFields, NewRelationFields } from '~/components/new-row-fields';
import { useToast } from '~/components/toaster';
import {
  baptismLocationLabels,
  editedRoleLabels,
  recordStatusLabels,
  sexLabels,
} from '~/components/labels';
import {
  PARTIAL_DATE_PATTERN,
  formatPartialDate,
  localName,
  localTerm,
  placeLabel,
} from '~/lib/format';
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
  type ListKind,
  type PersonField,
  editedRoles,
  isListKind,
  listFields,
  personFieldsOf,
  sexOfRole,
} from '~/lib/record-people';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// The record's date, by kind.
const dateLabels: Record<RecordKind, () => string> = {
  baptisms: m.records_col_baptised,
  marriages: m.records_col_married,
  deaths: m.records_col_died,
  households: m.records_col_list_date,
  taxpayers: m.records_col_list_date,
};

/** Where the records list was, to return there after saving. */
export interface ListPlace {
  kind?: string;
  q?: string;
  page?: string;
  source?: string;
}

// What a new record's form starts from: empty, of the list's type, in the
// source the list shows if any.
const blank = (kind: RecordKind, sourceId: number | null = null): RecordEditData => ({
  id: 0,
  kind,
  sourceId,
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

// The record after `previous` (Save and add next): on the same page of the
// same source. A list's next household or farm is usually in the same
// village, estate and list date; a register's next baptism usually has the
// same officiant. Dates and villages of register entries differ, so they
// start empty rather than risk staying unchanged.
const nextAfter = (previous: RecordEditData): RecordEditData => {
  const next = blank(previous.kind, previous.sourceId);
  next.page = previous.page;
  next.language = previous.language;
  if (isListKind(previous.kind)) {
    next.date = previous.date;
    next.placeId = previous.placeId;
    next.placeText = previous.placeText;
    next.holding = previous.holding && {
      holdingNo: null,
      estateText: previous.holding.estateText,
      estatePlaceId: previous.holding.estatePlaceId,
      tenantText: null,
    };
  }
  if (previous.baptism) {
    next.baptism = {
      birthDate: null,
      officiantText: previous.baptism.officiantText,
      officiantId: previous.baptism.officiantId,
      location: null,
      locationPlaceId: null,
      emergencyDate: null,
      multipleBirth: null,
      illegitimate: false,
      stillborn: false,
    };
  }
  return next;
};

/**
 * The admin's form for one record, or for a new one without `id`: of the
 * type of the source the list shows (`returnTo.source`, which the new record
 * then stays in: the source isn't asked again, and Save and add next leads),
 * else of type `kind`; or following record `after` on its page. Its source
 * and page, the record, its kind's details and the people it names
 * (~/lib/record-people). A register's form has one person in each role; a
 * list's (a household, a farm) has all its people, and more can be added:
 * one blank person is always at the end (also before JavaScript loads), and
 * Add person brings another. A locality, clergyman or relation the record
 * names that isn't known yet can be added in its field (LookupField). It
 * posts to the saveRecord action (and works before JavaScript loads); a save
 * redirects to the list at `returnTo` (a new record to the list's last page)
 * with a toast, Save and add next to a new record's form that follows this
 * one, and Cancel goes to `cancelHref`. A save the server refuses keeps the
 * form as typed, says why and marks the fields at fault. An existing
 * record's form is followed by its Delete section.
 */
export default function RecordEditForm(props: {
  id?: number;
  kind?: RecordKind;
  after?: number;
  returnTo: ListPlace;
  cancelHref: string;
}) {
  const options = createMemo(
    (): Promise<QueryData<typeof getRecordEditOptions>> => getRecordEditOptions(),
    { name: 'edit-options' },
  );
  // The source the list shows, which a new record is added to.
  const startSource = createMemo(
    () => options()?.sources.find((s) => String(s.id) === props.returnTo.source),
    { name: 'edit-start-source' },
  );
  const inSource = () => !props.id && !!startSource();
  const record = createMemo(
    (): Promise<QueryData<typeof getRecordEdit>> | RecordEditData => {
      if (props.id) return getRecordEdit(props.id);
      const source = startSource();
      const kind = source?.kind ?? props.kind ?? 'baptisms';
      const after = props.after;
      // A record of another type than the list's starts empty.
      if (after) {
        return getRecordEdit(after).then((previous) =>
          previous?.kind === kind ? nextAfter(previous) : blank(kind, source?.id ?? null),
        );
      }
      return blank(kind, source?.id ?? null);
    },
    { name: 'record-edit' },
  );
  const isThisForm = (form: FormData) => form.get('id') === (props.id ? String(props.id) : '');
  // This form's refused saves (the latest shown, its fields marked).
  const { error, invalid } = useFormErrors(saveRecord, isThisForm);
  // The parish of the source the record is (or starts) in: where a locality
  // added in the form starts.
  const sourceParishId = () => {
    const sourceId = startSource()?.id ?? record()?.sourceId ?? null;
    return options()?.sources.find((s) => s.id === sourceId)?.parishId ?? null;
  };
  // The places to link to, with their parish when it isn't their namesake;
  // the relations of a list's people; the clergy. Each can be added in its
  // field: a new locality starts in the source's parish, an estate as a manor.
  const places = createMemo(
    (): Lookup =>
      lookupOf(
        (options()?.places ?? []).map((place) => ({
          value: place.id,
          label: placeLabel(place),
          spellings: place.spellings,
        })),
        {
          label: m.lookup_create_place(),
          fields: (prefix, text) => (
            <NewPlaceFields
              prefix={prefix}
              text={text()}
              kind={prefix.startsWith('estate') ? 'manor' : 'village'}
              parishes={options()?.parishes ?? []}
              parishId={sourceParishId()}
              invalid={invalid}
            />
          ),
        },
      ),
    { name: 'edit-places' },
  );
  const relations = createMemo(
    (): Lookup =>
      lookupOf(
        (options()?.relations ?? []).map((t) => ({
          value: t.id,
          label: localTerm(t.name),
          spellings: t.spellings,
        })),
        {
          label: m.lookup_create_relation(),
          fields: (prefix, text) => (
            <NewRelationFields prefix={prefix} text={text()} invalid={invalid} />
          ),
        },
      ),
    { name: 'edit-relations' },
  );
  const clergy = createMemo(
    (): Lookup =>
      lookupOf(
        (options()?.clergy ?? []).map((c) => ({
          value: c.id,
          label: localName(c.name),
          spellings: c.spellings,
        })),
        {
          label: m.lookup_create_clergy(),
          fields: (prefix, text) => (
            <NewClergyFields prefix={prefix} text={text()} invalid={invalid} />
          ),
        },
      ),
    { name: 'edit-clergy' },
  );
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
          <form method="post" action={saveRecord} class="group flex max-w-5xl flex-col gap-6">
            <input type="hidden" name="returnKind" value={props.returnTo.kind ?? ''} />
            <input type="hidden" name="returnQ" value={props.returnTo.q ?? ''} />
            <input type="hidden" name="returnPage" value={props.returnTo.page ?? ''} />
            <input type="hidden" name="returnSource" value={props.returnTo.source ?? ''} />
            <input type="hidden" name="id" value={r.id || ''} />
            <input type="hidden" name="version" value={r.version} />

            {/* In the order a register entry reads: the entry (where and
                when), the people it names, then what else the entry says.
                Status, notes and the rarer details fold away at the end. */}
            <Section title={m.record_edit_record()} wide>
              {/* A record added to the list's source stays in it. */}
              <Show
                when={inSource() ? startSource() : undefined}
                fallback={
                  <div class="sm:col-span-2">
                    <Select
                      name="sourceId"
                      label={m.record_edit_source()}
                      value={r.sourceId}
                      options={sourcesOf(r.kind).map((s) => ({ value: s.id, label: s.title }))}
                      invalid={invalid('sourceId')}
                    />
                  </div>
                }
              >
                {(source) => (
                  <div class="fieldset sm:col-span-2">
                    <span class="fieldset-legend">{m.record_edit_source()}</span>
                    <input type="hidden" name="sourceId" value={source().id} />
                    <p class="py-2 font-medium">{source().title}</p>
                  </div>
                )}
              </Show>
              <TextInput
                name="page"
                label={m.record_edit_page()}
                value={r.page}
                hint={m.record_edit_page_hint()}
                maxlength={FIELD_MAX.line}
                invalid={invalid('page')}
              />
              <Show when={isListKind(r.kind)}>
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
              </Show>
              <Show when={r.kind === 'baptisms'}>
                <DateInput
                  name="birthDate"
                  label={m.records_col_born()}
                  value={r.baptism?.birthDate}
                  invalid={invalid('birthDate')}
                />
              </Show>
              <DateInput
                name="date"
                label={dateLabels[r.kind]()}
                value={r.date}
                invalid={invalid('date')}
              />
              <Show when={r.kind === 'deaths'}>
                <DateInput
                  name="burialDate"
                  label={m.records_col_buried()}
                  value={r.death?.burialDate}
                  invalid={invalid('burialDate')}
                />
              </Show>
              {/* A marriage has no place of its own: the bride and groom
                each have where they lived. */}
              <Show when={r.kind !== 'marriages'}>
                <LookupField
                  textName="placeText"
                  idName="placeId"
                  label={
                    r.kind === 'deaths' ? m.records_col_death_place() : m.record_edit_village()
                  }
                  text={r.placeText}
                  id={r.placeId}
                  lookup={places()}
                  invalid={invalid}
                />
              </Show>
              <Show when={r.kind === 'taxpayers'}>
                <LookupField
                  textName="estateText"
                  idName="estatePlaceId"
                  label={m.records_col_estate()}
                  text={r.holding?.estateText}
                  id={r.holding?.estatePlaceId}
                  lookup={places()}
                  invalid={invalid}
                />
                <TextInput
                  name="tenantText"
                  label={m.record_edit_tenant()}
                  value={r.holding?.tenantText}
                  invalid={invalid('tenantText')}
                />
              </Show>
            </Section>

            <section class="flex flex-col gap-3">
              <h2 class="text-lg font-semibold">{m.record_edit_people()}</h2>
              <p class="text-sm text-base-content/60">{m.record_edit_remove_hint()}</p>
              {/* A list's people, numbered in the form; then a register's,
                one in each role. */}
              <Show
                when={isListKind(r.kind) ? r.kind : undefined}
                fallback={
                  <For
                    each={editedRoles[r.kind as keyof typeof editedRoles] as readonly EditedRole[]}
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
                  <ListPeople
                    kind={kind()}
                    members={r.members}
                    latin={languageOf(r)}
                    places={places()}
                    relations={relations()}
                    invalid={invalid}
                  />
                )}
              </Show>
            </section>

            {/* What else a baptism or death entry says, as a rule. */}
            <Show when={r.kind === 'baptisms'}>
              <Section title={m.record_edit_baptism()} wide>
                <LookupField
                  textName="officiantText"
                  idName="officiantId"
                  label={m.record_edit_officiant()}
                  text={r.baptism?.officiantText}
                  id={r.baptism?.officiantId}
                  lookup={clergy()}
                  invalid={invalid}
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
              </Section>
            </Show>
            <Show when={r.kind === 'deaths'}>
              <Section title={m.record_edit_death()} wide>
                <div class="sm:col-span-2">
                  <TextInput
                    name="causeText"
                    label={m.records_col_cause()}
                    value={r.death?.causeText}
                    invalid={invalid('causeText')}
                  />
                </div>
              </Section>
            </Show>

            {/* The rest: open when any of it is set, so nothing hides. */}
            <details class="rounded-box border border-base-300 p-4" open={hasMore(r)}>
              <summary class="cursor-pointer text-lg font-semibold">{m.record_edit_more()}</summary>
              <div class="mt-2 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <Show when={r.kind === 'baptisms'}>
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
                </Show>
                <Show when={r.kind === 'deaths'}>
                  <TextInput
                    name="burialPlaceText"
                    label={m.record_edit_burial_place()}
                    value={r.death?.burialPlaceText}
                    invalid={invalid('burialPlaceText')}
                  />
                  <div class="flex flex-col justify-end gap-2 pb-2">
                    <Checkbox
                      name="stillborn"
                      label={m.records_stillborn()}
                      checked={r.death?.stillborn ?? false}
                    />
                  </div>
                </Show>
                <TextArea
                  name="note"
                  label={m.records_col_note()}
                  value={r.note}
                  rows={3}
                  maxlength={FIELD_MAX.text}
                  invalid={invalid('note')}
                  class="sm:col-span-2 lg:col-span-4"
                />
              </div>
            </details>

            {/* Kept in view at the bottom of the window while scrolling. */}
            {/* A new record can be followed by the next one on its page: in
                a source, that is the usual way on. */}
            <FormActions
              error={error()}
              cancelHref={props.cancelHref}
              saveAndNext={!r.id}
              primary={inSource() ? 'next' : 'save'}
              class={saveBarClass(!r.id)}
            />
          </form>
          <Show when={r.id}>
            <DeleteSection
              action={deleteRecord}
              id={r.id}
              version={r.version}
              title={m.record_delete()}
              text={m.record_delete_text()}
              inUse={undefined}
              deleted={m.record_deleted()}
            >
              <input type="hidden" name="returnKind" value={props.returnTo.kind ?? ''} />
              <input type="hidden" name="returnQ" value={props.returnTo.q ?? ''} />
              <input type="hidden" name="returnPage" value={props.returnTo.page ?? ''} />
              <input type="hidden" name="returnSource" value={props.returnTo.source ?? ''} />
            </DeleteSection>
          </Show>
        </>
      )}
    </Show>
  );
}

// A list's people, numbered in the form ("members.0.nameRu"), then blank
// ones to add: one, and another for each click on Add person. It is drawn
// inside the form's keyed Show, so each record starts again with one blank.
function ListPeople(props: {
  kind: ListKind;
  members: RecordEditPerson[];
  latin: string | null;
  places: Lookup;
  relations: Lookup;
  invalid: (field: string) => Fault;
}) {
  const [added, setAdded] = createSignal(1, { name: 'edit-added-people' });
  // The blanks' numbers, after the people already on the record.
  const blanks = createMemo(
    () => {
      const first = props.members.length;
      return Array.from({ length: added() }, (_, k) => first + k);
    },
    { name: 'edit-blank-people' },
  );

  return (
    <>
      <For each={props.members}>
        {(person, i) => (
          <PersonFields
            prefix={`members.${i()}`}
            legend={`${i() + 1}. ${
              props.relations.options.find((t) => t.value === person.relationTermId)?.label ??
              person.relationText ??
              ''
            }`}
            fields={listFields[props.kind]}
            person={person}
            latin={props.latin}
            places={props.places}
            relations={props.relations}
            invalid={props.invalid}
          />
        )}
      </For>
      <For each={blanks()}>
        {(n) => (
          <PersonFields
            prefix={`members.${n}`}
            legend={`${n + 1}. ${m.record_edit_new_person()}`}
            fields={listFields[props.kind]}
            person={null}
            latin={props.latin}
            places={props.places}
            relations={props.relations}
            invalid={props.invalid}
          />
        )}
      </For>
      <button type="button" class="btn self-start" onClick={() => setAdded((n) => n + 1)}>
        {m.record_edit_add_person()}
      </button>
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
  places: Lookup;
  relations: Lookup;
  invalid: (field: string) => Fault;
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
          <LookupField
            textName={field('relationText')}
            idName={field('relationTermId')}
            label={m.record_edit_relation()}
            text={value('relationText')}
            id={props.person?.relationTermId}
            lookup={props.relations}
            invalid={props.invalid}
          />
        );
      case 'residenceId':
      case 'birthplaceId': {
        const place = f === 'residenceId' ? 'residence' : 'birthplace';
        return (
          <LookupField
            textName={field(`${place}Text`)}
            idName={field(`${place}Id`)}
            label={place === 'residence' ? m.record_edit_residence() : m.record_edit_birthplace()}
            text={props.person?.[`${place}Text`]}
            id={props.person?.[`${place}Id`]}
            lookup={props.places}
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
      {/* The person this mention is linked to. */}
      <Show when={props.person?.person}>
        {(linked) => (
          <p class="mb-2 text-sm">
            {m.record_edit_person()}:{' '}
            <a href={paths.people(linked().id)()} class="link font-medium">
              {localName(linked().name)}
            </a>
          </p>
        )}
      </Show>
      <div class="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
        <NameFields
          prefix={props.prefix}
          value={value}
          swedish={swedish()}
          sex={props.person?.sex ?? sexOfRole[props.prefix as EditedRole] ?? 'male'}
          invalid={props.invalid}
        />
        <For each={props.fields}>{(f) => input(f)}</For>
        {/* Or who they are, decided with the save. */}
        <Show when={!props.person?.person}>
          <PersonLinkField prefix={props.prefix} />
        </Show>
      </div>
    </fieldset>
  );
}

// `wide` lays short fields four to a row on large screens.
function Section(props: { title: string; children: JSX.Element; wide?: boolean }) {
  return (
    <section class="flex flex-col gap-1">
      <h2 class="text-lg font-semibold">{props.title}</h2>
      <div class={['grid gap-x-4 sm:grid-cols-2', props.wide && 'lg:grid-cols-4']}>
        {props.children}
      </div>
    </section>
  );
}

// Whether any of what the form folds away is set: then it starts open.
const hasMore = (r: RecordEditData) =>
  r.status !== 'ok' ||
  !!r.note ||
  !!r.baptism?.emergencyDate ||
  !!r.baptism?.multipleBirth ||
  !!r.baptism?.illegitimate ||
  !!r.baptism?.stillborn ||
  !!r.death?.burialPlaceText ||
  !!r.death?.stillborn;

// A date as the page shows it (12.3.1895, 3.1895, 1895); the server reads
// it back (parsePartialDate) and the pattern catches typos before sending.
function DateInput(props: {
  name: string;
  label: string;
  value: string | null | undefined;
  invalid: Fault;
}) {
  return (
    <TextInput
      name={props.name}
      label={props.label}
      value={formatPartialDate(props.value)}
      pattern={PARTIAL_DATE_PATTERN}
      inputmode="numeric"
      maxlength={FIELD_MAX.line}
      hint={m.record_edit_date_hint()}
      invalid={props.invalid}
    />
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
