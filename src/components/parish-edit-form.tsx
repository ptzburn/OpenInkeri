import { useSubmissions } from '@solidjs/router';
import { Show, createMemo } from 'solid-js';

import { TextInput } from '~/components/form-fields';
import {
  type ParishEdit,
  type ParishEditData,
  type ParishError,
  getParishEdit,
  saveParish,
} from '~/lib/parishes';
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
    (): Promise<ParishEdit> | ParishEditData => (props.id ? getParishEdit(props.id) : blank),
    { name: 'parish-edit' },
  );
  // This parish's settled saves: only refusals land here (a success
  // redirects), the latest one shown. Each new save clears them first.
  const submissions = useSubmissions(
    saveParish,
    ([form]) => form.get('id') === (props.id ? String(props.id) : ''),
  );
  saveParish.onSubmit(() => {
    for (const submission of submissions) submission.clear();
  });
  const error = () => submissions.at(-1)?.error as ParishError | undefined;
  const invalid = (field: string) => error()?.fields?.includes(field) ?? false;

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
              label={m.place_edit_name_ru()}
              value={p.nameRu}
              required
              maxlength={200}
              invalid={invalid('nameRu')}
            />
            <TextInput
              name="nameFi"
              label={m.place_edit_name_fi()}
              value={p.nameFi}
              maxlength={200}
              invalid={invalid('nameFi')}
            />
            <label class="fieldset sm:col-span-2">
              <span class="fieldset-legend">{m.place_edit_note()}</span>
              <textarea
                name="note"
                rows={4}
                maxlength={2000}
                class={['textarea w-full', { 'textarea-error': invalid('note') }]}
                aria-invalid={invalid('note') ? 'true' : undefined}
              >
                {p.note ?? ''}
              </textarea>
            </label>
          </div>

          <div class="flex flex-col gap-3 border-t border-base-300 pt-4">
            <Show when={error()}>
              {(shown) => (
                <div role="alert" class="alert alert-error alert-soft">
                  {shown().message}
                </div>
              )}
            </Show>
            <div class="flex justify-end gap-2">
              <a href={props.cancelHref} class="btn">
                {m.place_edit_cancel()}
              </a>
              <button
                type="submit"
                class="btn btn-primary group-aria-busy:pointer-events-none group-aria-busy:opacity-60"
              >
                <span
                  class="loading hidden loading-sm loading-spinner group-aria-busy:inline-block"
                  aria-hidden="true"
                />
                {m.place_edit_save()}
              </button>
            </div>
          </div>
        </form>
      )}
    </Show>
  );
}
