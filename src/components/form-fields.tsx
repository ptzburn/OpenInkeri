import { type Action, useSubmissions } from '@solidjs/router';
import { For, Show } from 'solid-js';

import { FIELD_MAX } from '~/lib/field-limits';
import { localName } from '~/lib/format';
import type { FormError } from '~/lib/form-error';
import { m } from '~/paraglide/messages.js';

// What the admins' edit forms share: their refused saves, their fields (a
// label above the control, marked when the server refused its value) and
// the Save and Cancel bar.

/**
 * The latest refused save of one form, for an action whose forms post a
 * FormError when refused. `isThisForm` picks this form's submissions out of
 * the action's (by the row id it posted, say). A save that succeeds
 * redirects, so it never lands here; each new save clears the old refusals
 * as it starts.
 */
export function useFormErrors<U>(
  action: Action<[FormData], U>,
  isThisForm: (form: FormData) => boolean,
) {
  const submissions = useSubmissions(action, ([form]) => isThisForm(form));
  action.onSubmit(() => {
    for (const submission of submissions) submission.clear();
  });
  const error = () => submissions.at(-1)?.error as FormError | undefined;
  /** Whether the latest refusal named this field. */
  const invalid = (field: string) => error()?.fields?.includes(field) ?? false;
  return { error, invalid };
}

/**
 * Calls `done` with the posted form when one of this form's submissions of
 * `action` goes through (settles without an error), e.g. to show a toast. It runs after the
 * action's redirect, when the page that posted may already be disposed:
 * reading its props still works, but anything that needs an owner (useToast()
 * and other useContext calls, new signals or memos) must happen in the
 * component body, with `done` only calling what that returned.
 */
export function useFormDone<U>(
  action: Action<[FormData], U>,
  isThisForm: (form: FormData) => boolean,
  done: (form: FormData) => void,
) {
  action.onSettled((submission) => {
    const [form] = submission.input;
    if (!submission.error && isThisForm(form)) done(form);
  });
}

/**
 * The name a parish or locality form posted (its nameRu and nameFi fields),
 * in the reader's language, for a toast after the save: what the admin
 * typed, so a rename shows the new name.
 */
export function postedName(form: FormData): string {
  const posted = (field: string) => {
    const value = form.get(field);
    return (typeof value === 'string' && value.trim()) || null;
  };
  return localName({ ru: posted('nameRu'), fi: posted('nameFi') });
}

/**
 * The bottom of an edit form: why the last save was refused, Cancel (a link
 * back) and Save. The form must have the `group` class: while a save is in
 * flight the router marks it aria-busy, which shows the spinner and stops
 * further clicks.
 */
export function FormActions(props: { error?: FormError; cancelHref: string; class?: string }) {
  return (
    <div class={['flex flex-col gap-3', props.class]}>
      <Show when={props.error}>
        {(error) => (
          <div role="alert" class="alert alert-error alert-soft">
            {error().message}
          </div>
        )}
      </Show>
      <div class="flex justify-end gap-2">
        <a href={props.cancelHref} class="btn">
          {m.form_cancel()}
        </a>
        <button
          type="submit"
          class="btn btn-primary group-aria-busy:pointer-events-none group-aria-busy:opacity-60"
        >
          <span
            class="loading hidden loading-sm loading-spinner group-aria-busy:inline-block"
            aria-hidden="true"
          />
          {m.form_save()}
        </button>
      </div>
    </div>
  );
}

export function TextInput(props: {
  name: string;
  label: string;
  value: string | null | undefined;
  invalid: boolean;
  required?: boolean;
  maxlength?: number;
  pattern?: string;
  hint?: string;
}) {
  return (
    <label class="fieldset">
      <span class="fieldset-legend">{props.label}</span>
      <input
        name={props.name}
        value={props.value ?? ''}
        required={props.required}
        maxlength={props.maxlength ?? FIELD_MAX.text}
        pattern={props.pattern}
        class={['input w-full', { 'input-error': props.invalid }]}
        aria-invalid={props.invalid ? 'true' : undefined}
      />
      <Show when={props.hint}>{(hint) => <span class="label">{hint()}</span>}</Show>
    </label>
  );
}

type Option = { value: string | number; label: string };

// A <select> with the current value's option marked selected; `none` adds
// an empty first option (sent as '', read as "none").
export function Select(props: {
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
        class={['select w-full', { 'select-error': props.invalid }]}
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
