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
  type BaptismEditPerson,
  type EditedRole,
  editedRoles,
  getBaptismEdit,
  getBaptismEditOptions,
  saveBaptism,
} from '~/data/records';
import { baptismLocations, recordStatuses, sexes } from '~/lib/record-kinds';
import { m } from '~/paraglide/messages.js';

const nameParts = [
  ['given', m.record_edit_given],
  ['patronymic', m.record_edit_patronymic],
  ['surname', m.record_edit_surname],
  ['maiden', m.record_edit_maiden],
] as const;

/** Where the records list was, to return there after saving. */
export interface ListPlace {
  kind?: string;
  q?: string;
  page?: string;
}

/**
 * The admin's form for one baptism record: the record, its baptism details
 * and its child, father and mother. It posts to the saveBaptism action
 * (and works before JavaScript loads); a save redirects to the list at
 * `returnTo`, and Cancel goes to `cancelHref`. A save the server refuses
 * keeps the form as typed, says why and marks the fields at fault.
 */
export default function BaptismEditForm(props: {
  id: number;
  returnTo: ListPlace;
  cancelHref: string;
}) {
  const record = createMemo(
    (): Promise<QueryData<typeof getBaptismEdit>> => getBaptismEdit(props.id),
    {
      name: 'baptism-edit',
    },
  );
  const options = createMemo(
    (): Promise<QueryData<typeof getBaptismEditOptions>> => getBaptismEditOptions(),
    {
      name: 'edit-options',
    },
  );
  // This form's refused saves (the latest shown, its fields marked).
  const { error, invalid } = useFormErrors(
    saveBaptism,
    (form) => form.get('id') === String(props.id),
  );

  return (
    // Keyed: each record (and each fresh read of it) gets a fresh form. A
    // refused save revalidates nothing, so what was typed stays.
    <Show when={record()} keyed fallback={<p>{m.record_edit_missing()}</p>}>
      {(r) => (
        // While a save is in flight the router marks the form aria-busy.
        <form method="post" action={saveBaptism} class="group flex flex-col gap-6">
          <input type="hidden" name="returnKind" value={props.returnTo.kind ?? ''} />
          <input type="hidden" name="returnQ" value={props.returnTo.q ?? ''} />
          <input type="hidden" name="returnPage" value={props.returnTo.page ?? ''} />
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="version" value={r.version} />

          {/* Two columns from xl up: the record and its baptism beside the
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
                  label={m.records_col_baptised()}
                  value={r.date}
                  invalid={invalid('date')}
                />
                <DateInput
                  name="birthDate"
                  label={m.records_col_born()}
                  value={r.baptism?.birthDate}
                  invalid={invalid('birthDate')}
                />
                <Select
                  name="placeId"
                  label={m.record_edit_village()}
                  value={r.placeId}
                  none={m.form_none()}
                  options={(options()?.places ?? []).map((place) => ({
                    value: place.id,
                    label:
                      place.parish && place.parish !== place.name
                        ? `${place.name} (${place.parish})`
                        : place.name,
                  }))}
                  invalid={invalid('placeId')}
                />
                <TextInput
                  name="placeText"
                  label={`${m.record_edit_village()}: ${m.record_edit_as_written()}`}
                  value={r.placeText}
                  invalid={invalid('placeText')}
                />
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
            </div>

            <section class="flex flex-col gap-3">
              <h2 class="text-lg font-semibold">{m.record_edit_people()}</h2>
              <p class="text-sm text-base-content/60">{m.record_edit_remove_hint()}</p>
              <For each={editedRoles}>
                {(role) => <PersonFields role={role} person={r.people[role]} invalid={invalid} />}
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

type Person = BaptismEditPerson | null;

function PersonFields(props: {
  role: EditedRole;
  person: Person;
  invalid: (field: string) => boolean;
}) {
  const field = (name: string) => `${props.role}.${name}`;
  const value = (name: string) =>
    ((props.person as Record<string, unknown> | null)?.[name] ?? null) as string | null;

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
        <Show
          when={props.role === 'child'}
          fallback={
            <TextInput
              name={field('origin')}
              label={m.record_edit_origin()}
              value={value('origin')}
              invalid={props.invalid(field('origin'))}
            />
          }
        >
          <Select
            name={field('sex')}
            label={m.record_edit_sex()}
            value={value('sex')}
            none={m.form_none()}
            options={sexes.map((s) => ({ value: s, label: sexLabels[s]() }))}
            invalid={props.invalid(field('sex'))}
          />
          <DateInput
            name={field('deathDate')}
            label={m.record_edit_death_date()}
            value={value('deathDate')}
            invalid={props.invalid(field('deathDate'))}
          />
        </Show>
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
