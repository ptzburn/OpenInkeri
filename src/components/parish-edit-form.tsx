import { Show, createMemo } from 'solid-js';

import type { QueryData } from '~/lib/query-data';
import { FIELD_MAX } from '~/lib/field-limits';
import { FormActions, TextInput, useFormErrors } from '~/components/form-fields';
import { type ParishEditData, deleteParish, getParishEdit, saveParish } from '~/data/parishes';
import { m } from '~/paraglide/messages.js';

// What a new parish's form starts from.
const blank: ParishEditData = { id: 0, version: 0, nameRu: '', nameFi: null, note: null };

/**
 * The admin's form for one parish, or for a new one without `id`: its names
 * and a note. It posts to the saveParish action (and works before
 * JavaScript loads); a save redirects to the parishes list, and Cancel goes
 * to `cancelHref`. A save the server refuses keeps the form as typed, says
 * why and marks the fields at fault. An existing parish's form is followed
 * by its Delete section.
 */
export default function ParishEditForm(props: { id?: number; cancelHref: string }) {
  const parish = createMemo(
    (): Promise<QueryData<typeof getParishEdit>> | ParishEditData =>
      props.id ? getParishEdit(props.id) : blank,
    { name: 'parish-edit' },
  );
  // This form's refused saves (the latest shown, its fields marked).
  const { error, invalid } = useFormErrors(
    saveParish,
    (form) => form.get('id') === (props.id ? String(props.id) : ''),
  );

  return (
    // Keyed: each parish (and each fresh read of it) gets a fresh form.
    <Show when={parish()} keyed fallback={<p>{m.parish_edit_missing()}</p>}>
      {(p) => (
        <>
          {/* While a save is in flight the router marks the form aria-busy. */}
          <form method="post" action={saveParish} class="group flex max-w-3xl flex-col gap-6">
            <input type="hidden" name="id" value={p.id || ''} />
            <input type="hidden" name="version" value={p.version} />

            <div class="grid gap-x-4 sm:grid-cols-2">
              <TextInput
                name="nameRu"
                label={m.form_name_ru()}
                value={p.nameRu}
                required
                maxlength={FIELD_MAX.line}
                invalid={invalid('nameRu')}
              />
              <TextInput
                name="nameFi"
                label={m.form_name_fi()}
                value={p.nameFi}
                maxlength={FIELD_MAX.line}
                invalid={invalid('nameFi')}
              />
              <label class="fieldset sm:col-span-2">
                <span class="fieldset-legend">{m.form_note()}</span>
                <textarea
                  name="note"
                  rows={4}
                  maxlength={FIELD_MAX.text}
                  class={['textarea w-full', { 'textarea-error': invalid('note') }]}
                  aria-invalid={invalid('note') ? 'true' : undefined}
                >
                  {p.note ?? ''}
                </textarea>
              </label>
            </div>

            <FormActions
              error={error()}
              cancelHref={props.cancelHref}
              class="border-t border-base-300 pt-4"
            />
          </form>
          <Show when={p.id}>
            <DeleteParish id={p.id} version={p.version} />
          </Show>
        </>
      )}
    </Show>
  );
}

/**
 * Deletes the parish: a ticked box instead of a confirm dialog, so it works
 * before JavaScript loads too; the server checks it again, and refuses a
 * parish that villages or sources still belong to.
 */
function DeleteParish(props: { id: number; version: number }) {
  const { error } = useFormErrors(deleteParish, (form) => form.get('id') === String(props.id));

  return (
    <section
      class="flex max-w-3xl flex-col gap-3 rounded-box border border-error/40 p-4"
      aria-labelledby="parish-delete"
    >
      <h2 id="parish-delete" class="text-lg font-semibold text-error">
        {m.parish_delete()}
      </h2>
      <p class="text-sm">{m.parish_delete_text()}</p>
      <form method="post" action={deleteParish} class="group flex flex-col gap-3">
        <input type="hidden" name="id" value={props.id} />
        <input type="hidden" name="version" value={props.version} />
        <label class="label text-base-content">
          <input type="checkbox" name="confirm" required class="checkbox checkbox-error" />
          {m.parish_delete_confirm()}
        </label>
        <Show when={error()}>
          {(error) => (
            <div role="alert" class="alert alert-error alert-soft">
              {error().message}
            </div>
          )}
        </Show>
        <button
          type="submit"
          class="btn self-start btn-error group-aria-busy:pointer-events-none group-aria-busy:opacity-60"
        >
          <span
            class="loading hidden loading-sm loading-spinner group-aria-busy:inline-block"
            aria-hidden="true"
          />
          {m.parish_delete()}
        </button>
      </form>
    </section>
  );
}
