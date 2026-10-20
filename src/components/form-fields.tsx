import { type Action, useSubmissions } from '@solidjs/router';
import { For, Show, createMemo, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';

import { FIELD_MAX } from '~/lib/field-limits';
import { localName } from '~/lib/format';
import type { FormError } from '~/lib/form-error';
import { useToast } from '~/components/toaster';
import { m } from '~/paraglide/messages.js';

// What the admins' edit forms share: their refused saves, their fields (a
// label above the control, and under it why its value is wrong) and the
// Save and Cancel bar.

/**
 * Why a field is at fault: undefined while it's fine; after a refused save,
 * the server's reason for it, or '' when the server gave none of its own.
 */
export type Fault = string | undefined;

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
  /** Why the latest refusal named this field, if it did. */
  const invalid = (field: string): Fault => error()?.fields?.[field];
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

/**
 * Why a field's value is wrong, right after its control (which has daisyUI's
 * `validator` class). It shows while the control is invalid: to the browser
 * (`required`, `pattern`), once the admin has left it or tried to save, or to
 * the server (`aria-invalid`, from `fault`). It says the server's reason,
 * else `error`, else to check the value.
 */
export function FieldError(props: { fault: Fault; error?: string }) {
  return (
    <span class="validator-hint hidden">
      {props.fault || props.error || m.form_field_invalid()}
    </span>
  );
}

/** The aria-invalid of a control the server refused. */
export const ariaInvalid = (fault: Fault) => (fault === undefined ? undefined : 'true');

export function TextInput(props: {
  name: string;
  label: string;
  value: string | null | undefined;
  invalid: Fault;
  required?: boolean;
  maxlength?: number;
  pattern?: string;
  inputmode?: 'numeric';
  hint?: string;
  /** What a value the browser rejects should be, e.g. "Four digits". */
  error?: string;
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
        inputmode={props.inputmode}
        class="validator input w-full"
        aria-invalid={ariaInvalid(props.invalid)}
      />
      <FieldError fault={props.invalid} error={props.error} />
      <Show when={props.hint}>{(hint) => <span class="label">{hint()}</span>}</Show>
    </label>
  );
}

export function TextArea(props: {
  name: string;
  label: string;
  value: string | null | undefined;
  invalid: Fault;
  rows: number;
  maxlength?: number;
  hint?: string;
  /** The wrapper's classes, e.g. a grid column span. */
  class?: string;
}) {
  return (
    <label class={['fieldset', props.class]}>
      <span class="fieldset-legend">{props.label}</span>
      <textarea
        name={props.name}
        rows={props.rows}
        maxlength={props.maxlength}
        class="validator textarea w-full"
        aria-invalid={ariaInvalid(props.invalid)}
      >
        {props.value ?? ''}
      </textarea>
      <FieldError fault={props.invalid} />
      <Show when={props.hint}>
        {(hint) => <span class="label whitespace-normal">{hint()}</span>}
      </Show>
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
  invalid: Fault;
}) {
  const current = () => String(props.value ?? '');
  return (
    <label class="fieldset">
      <span class="fieldset-legend">{props.label}</span>
      <select
        name={props.name}
        class="validator select w-full"
        aria-invalid={ariaInvalid(props.invalid)}
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
      <FieldError fault={props.invalid} />
    </label>
  );
}

/**
 * An edit page's Delete section, for an action whose form posts `id`,
 * `version` and a ticked `confirm` box (a box instead of a confirm dialog,
 * so it works before JavaScript loads too; the server checks it again).
 * While something still depends on the row, `inUse` says what, and the box
 * and button are disabled (the server refuses too, in case something was
 * linked since the page loaded). A delete that went through shows `deleted`
 * as a toast on the page its action redirects to.
 */
export function DeleteSection<U>(props: {
  action: Action<[FormData], U>;
  id: number;
  version: number;
  title: string;
  text: string;
  confirmLabel: string;
  inUse: string | undefined;
  deleted: string;
  /** Further hidden fields the action reads. */
  children?: JSX.Element;
}) {
  // A section posts to one action for its life: read it once.
  const action = untrack(() => props.action);
  const isThisForm = (form: FormData) => form.get('id') === String(props.id);
  const { error } = useFormErrors(action, isThisForm);
  const toast = useToast();
  useFormDone(action, isThisForm, () => toast(props.deleted));
  // Read by the warning, the box and the button.
  const inUse = createMemo(() => props.inUse, { name: 'delete-in-use' });

  return (
    <section
      class="flex max-w-3xl flex-col gap-3 rounded-box border border-error/40 p-4"
      aria-labelledby="delete-section"
    >
      <h2 id="delete-section" class="text-lg font-semibold text-error">
        {props.title}
      </h2>
      <p class="text-sm">{props.text}</p>
      <Show when={inUse()}>
        {(message) => <div class="alert alert-warning alert-soft">{message()}</div>}
      </Show>
      <form method="post" action={action} class="group flex flex-col gap-3">
        <input type="hidden" name="id" value={props.id} />
        <input type="hidden" name="version" value={props.version} />
        {props.children}
        <label class="label text-base-content">
          <input
            type="checkbox"
            name="confirm"
            required
            disabled={!!inUse()}
            class="checkbox checkbox-error"
          />
          {props.confirmLabel}
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
          disabled={!!inUse()}
          class="btn self-start btn-error group-aria-busy:pointer-events-none group-aria-busy:opacity-60"
        >
          <span
            class="loading hidden loading-sm loading-spinner group-aria-busy:inline-block"
            aria-hidden="true"
          />
          {props.title}
        </button>
      </form>
    </section>
  );
}
