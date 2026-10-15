import { Show, createMemo } from 'solid-js';

import type { QueryData } from '~/lib/query-data';
import { FIELD_MAX } from '~/lib/field-limits';
import { FormActions, TextInput, useFormErrors } from '~/components/form-fields';
import { type ParishEditData, getParishEdit, saveParish } from '~/data/parishes';
import { m } from '~/paraglide/messages.js';

// What a new parish's form starts from.
const blank: ParishEditData = { id: 0, version: 0, nameRu: '', nameFi: null, note: null };

/**
 * The admin's form for one parish, or for a new one without `id`: its names
 * and a note. It posts to the saveParish action (and works before
 * JavaScript loads); a save redirects to the parishes list, and Cancel goes
 * to `cancelHref`. A save the server refuses keeps the form as typed, says
 * why and marks the fields at fault.
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
        // While a save is in flight the router marks the form aria-busy.
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
      )}
    </Show>
  );
}
