import { useAction } from '@solidjs/router';
import type { JSX } from '@solidjs/web';
import { For, Loading, Show, createEffect, createMemo, createSignal } from 'solid-js';

import { PARTIAL_DATE_PATTERN, formatPartialDate } from '~/lib/format';
import {
  type BaptismEdit,
  type EditError,
  type EditOptions,
  type EditedRole,
  editedRoles,
  getBaptismEdit,
  getEditOptions,
  updateBaptism,
} from '~/lib/record-edit';
import { baptismLocations, recordStatuses } from '~/lib/record-kinds';
import { m } from '~/paraglide/messages.js';

const statusLabels: Record<(typeof recordStatuses)[number], () => string> = {
  ok: m.record_edit_status_ok,
  lost: m.record_edit_status_lost,
  illegible: m.record_edit_status_illegible,
};
const locationLabels: Record<(typeof baptismLocations)[number], () => string> = {
  pastorate: m.record_edit_location_pastorate,
  church: m.record_edit_location_church,
  chapel: m.record_edit_location_chapel,
  village: m.record_edit_location_village,
  home: m.record_edit_location_home,
  other: m.record_edit_location_other,
};
const roleLabels: Record<EditedRole, () => string> = {
  child: m.records_col_child,
  father: m.records_col_father,
  mother: m.records_col_mother,
};
const nameParts = [
  ['given', m.record_edit_given],
  ['patronymic', m.record_edit_patronymic],
  ['surname', m.record_edit_surname],
  ['maiden', m.record_edit_maiden],
] as const;

/**
 * The admin's dialog for editing one baptism record. It opens whenever
 * `recordId` is set and calls `onClose` when it closes (Cancel, Escape, a
 * click outside, or a save).
 */
export default function BaptismEditDialog(props: { recordId: number | null; onClose: () => void }) {
  let dialog: HTMLDialogElement | undefined;
  createEffect(
    () => props.recordId,
    (id) => {
      if (id && !dialog?.open) dialog?.showModal();
      if (!id && dialog?.open) dialog.close();
    },
    { name: 'baptism-edit-dialog-open' },
  );

  return (
    <dialog
      ref={(el) => (dialog = el)}
      class="modal"
      aria-labelledby="baptism-edit-title"
      onClose={() => props.onClose()}
    >
      <div class="modal-box w-11/12 max-w-4xl">
        <h2 id="baptism-edit-title" class="mb-4 text-lg font-bold">
          {m.record_edit_title()}
        </h2>
        <Show when={props.recordId}>
          {(id) => (
            <Loading
              fallback={<span class="loading loading-spinner" aria-label={m.app_loading()} />}
            >
              <EditForm id={id()} onDone={() => dialog?.close()} />
            </Loading>
          )}
        </Show>
      </div>
      {/* A click outside the box closes the dialog. */}
      <form method="dialog" class="modal-backdrop">
        <button>{m.record_edit_cancel()}</button>
      </form>
    </dialog>
  );
}

function asEditError(error: unknown): EditError {
  return error && typeof error === 'object' && 'message' in error
    ? (error as EditError)
    : { message: m.record_edit_failed() };
}

function EditForm(props: { id: number; onDone: () => void }) {
  const record = createMemo((): Promise<BaptismEdit> => getBaptismEdit(props.id), {
    name: 'baptism-edit',
  });
  const options = createMemo((): Promise<EditOptions> => getEditOptions(), {
    name: 'edit-options',
  });
  const save = useAction(updateBaptism);
  const [error, setError] = createSignal<EditError | null>(null, { name: 'edit-error' });
  const [saving, setSaving] = createSignal(false, { name: 'edit-saving' });
  const invalid = (field: string) => error()?.fields?.includes(field) ?? false;

  return (
    // Keyed: each record (and each fresh read of it) gets a fresh form.
    <Show when={record()} keyed fallback={<p>{m.record_edit_missing()}</p>}>
      {(r) => (
        <form
          class="flex flex-col gap-6"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setError(null);
            setSaving(true);
            try {
              await save(data);
              props.onDone();
            } catch (failure) {
              setError(asEditError(failure));
            } finally {
              setSaving(false);
            }
          }}
        >
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="version" value={r.version} />

          <Section title={m.record_edit_record()}>
            <Select
              name="status"
              label={m.record_edit_status()}
              value={r.status}
              options={recordStatuses.map((s) => ({ value: s, label: statusLabels[s]() }))}
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
              none={m.record_edit_none()}
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
                rows={3}
                class={['textarea w-full', invalid('note') && 'textarea-error']}
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
              none={m.record_edit_none()}
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
              none={m.record_edit_none()}
              options={baptismLocations.map((l) => ({ value: l, label: locationLabels[l]() }))}
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

          <section class="flex flex-col gap-3">
            <h3 class="font-semibold">{m.record_edit_people()}</h3>
            <p class="text-sm text-base-content/60">{m.record_edit_remove_hint()}</p>
            <For each={editedRoles}>
              {(role) => <PersonFields role={role} person={r.people[role]} invalid={invalid} />}
            </For>
          </section>

          <Show when={error()}>
            {(shown) => (
              <div role="alert" class="alert alert-error alert-soft">
                {shown().message}
              </div>
            )}
          </Show>
          <div class="modal-action">
            <button type="button" class="btn" onClick={() => props.onDone()}>
              {m.record_edit_cancel()}
            </button>
            <button type="submit" class="btn btn-primary" disabled={saving()}>
              <Show when={saving()}>
                <span class="loading loading-spinner loading-sm" aria-hidden="true" />
              </Show>
              {m.record_edit_save()}
            </button>
          </div>
        </form>
      )}
    </Show>
  );
}

type Person = NonNullable<BaptismEdit>['people'][EditedRole];

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
      <legend class="fieldset-legend">{roleLabels[props.role]()}</legend>
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
            none={m.record_edit_none()}
            options={[
              { value: 'male', label: m.record_edit_sex_male() },
              { value: 'female', label: m.record_edit_sex_female() },
            ]}
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
      <details class="mt-2">
        <summary class="cursor-pointer text-sm">{m.record_edit_name_parts()}</summary>
        <div class="mt-2 grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-2">
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
      </details>
    </fieldset>
  );
}

function Section(props: { title: string; children: JSX.Element }) {
  return (
    <section class="flex flex-col gap-1">
      <h3 class="font-semibold">{props.title}</h3>
      <div class="grid gap-x-4 sm:grid-cols-2">{props.children}</div>
    </section>
  );
}

function TextInput(props: {
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
        value={props.value ?? ''}
        maxlength={2000}
        class={['input w-full', props.invalid && 'input-error']}
        aria-invalid={props.invalid ? 'true' : undefined}
      />
    </label>
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
        class={['input w-full', props.invalid && 'input-error']}
        aria-invalid={props.invalid ? 'true' : undefined}
      />
      <span class="label">{m.record_edit_date_hint()}</span>
    </label>
  );
}

type Option = { value: string | number; label: string };

// A <select> with the current value's option marked selected; `none` adds
// an empty first option (sent as '', read as "none").
function Select(props: {
  name: string;
  label: string;
  value: string | number | null | undefined;
  options: Option[];
  none?: string;
  invalid: boolean;
}) {
  const current = () => String(props.value ?? '');
  return (
    <label class="fieldset">
      <span class="fieldset-legend">{props.label}</span>
      <select
        name={props.name}
        class={['select w-full', props.invalid && 'select-error']}
        aria-invalid={props.invalid ? 'true' : undefined}
      >
        <Show when={props.none}>
          {(label) => (
            <option value="" selected={current() === ''}>
              {label()}
            </option>
          )}
        </Show>
        <For each={props.options}>
          {(option) => (
            <option value={option.value} selected={current() === String(option.value)}>
              {option.label}
            </option>
          )}
        </For>
      </select>
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
