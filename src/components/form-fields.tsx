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

/** Like useFormDone, for a submission of this form that the server refused. */
function useFormRefused<U>(
  action: Action<[FormData], U>,
  isThisForm: (form: FormData) => boolean,
  refused: (form: FormData) => void,
) {
  action.onSettled((submission) => {
    const [form] = submission.input;
    if (submission.error && isThisForm(form)) refused(form);
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
 * back) and Save; with `saveAndNext`, also Save and add next, which posts
 * `next=on`. The form must have the `group` class: while a save is in
 * flight the router marks it aria-busy, which shows the spinner and stops
 * further clicks. A form that pins it to the window's bottom passes
 * `saveBarClass(...)`.
 */
export function FormActions(props: {
  error?: FormError;
  cancelHref: string;
  saveAndNext?: boolean;
  /** What Save and next does here, when not "Save and add next". */
  nextLabel?: string;
  /** Which button is the primary one; Save unless said otherwise. */
  primary?: 'save' | 'next';
  class?: string;
}) {
  return (
    <div class={['flex flex-col gap-3', props.class]}>
      <Show when={props.error}>
        {(error) => (
          <div role="alert" class="alert alert-error alert-soft">
            {error().message}
          </div>
        )}
      </Show>
      {/* Save comes first, drawn last: Enter in a field submits with the
          form's first button, which should be a plain Save (even where Save
          and next is the primary one). */}
      <div class="flex flex-row-reverse flex-wrap justify-start gap-2">
        <button
          type="submit"
          class={[
            'btn group-aria-busy:pointer-events-none group-aria-busy:opacity-60',
            props.primary !== 'next' && 'btn-primary',
          ]}
        >
          <span
            class="loading hidden loading-sm loading-spinner group-aria-busy:inline-block"
            aria-hidden="true"
          />
          {m.form_save()}
        </button>
        <Show when={props.saveAndNext}>
          <button
            type="submit"
            name="next"
            value="on"
            class={[
              'btn group-aria-busy:pointer-events-none group-aria-busy:opacity-60',
              // The primary button is drawn at the end (the row is reversed).
              props.primary === 'next' && 'order-first btn-primary',
            ]}
          >
            {props.nextLabel ?? m.form_save_and_next()}
          </button>
        </Show>
        <a href={props.cancelHref} class="btn">
          {m.form_cancel()}
        </a>
      </div>
    </div>
  );
}

/**
 * FormActions pinned to the window's bottom while the form scrolls, over the
 * page's padding, as tall as the sidebar's account corner (min-h-18) so the
 * line over each runs level. Where nothing follows the form (`last`: a new
 * row, with no Delete section) it reaches the page's bottom edge too.
 */
export const saveBarClass = (last: boolean) =>
  [
    'sticky bottom-0 z-10 -mx-4 min-h-18 justify-center border-t border-base-300 bg-base-100 px-4 lg:-mx-8 lg:px-8',
    last ? '-mb-4 lg:-mb-8' : '',
  ].join(' ');

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
  /** Told what is typed, for a form that follows the value (the coordinates' map). */
  onInput?: (value: string) => void;
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
        onInput={(event) => props.onInput?.(event.currentTarget.value)}
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
  /** Told the value chosen, for a form that follows it (the coordinates' status). */
  onChange?: (value: string) => void;
}) {
  const current = () => String(props.value ?? '');
  return (
    <label class="fieldset">
      <span class="fieldset-legend">{props.label}</span>
      <select
        name={props.name}
        class="validator select w-full"
        aria-invalid={ariaInvalid(props.invalid)}
        onChange={(event) => props.onChange?.(event.currentTarget.value)}
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

/** Whether this browser runs invoker commands (commandfor/command) itself. */
const invokerCommands = () => 'commandForElement' in HTMLButtonElement.prototype;

/**
 * An edit page's Delete section, for an action whose form posts `id`,
 * `version` and `confirm=on`. Its button opens a native modal dialog
 * (daisyUI's modal) through invoker commands, where Cancel, Escape and the
 * backdrop close it and the dialog's form posts the delete; the server
 * checks the confirmation again. While something still depends on the row,
 * `inUse` says what, and the button is disabled (the server refuses too, in
 * case something was linked since the page loaded). A refused delete closes
 * the dialog and says why in the section. A delete that went through shows
 * `deleted` as a toast on the page its action redirects to.
 */
export function DeleteSection<U>(props: {
  action: Action<[FormData], U>;
  id: number;
  version: number;
  title: string;
  text: string;
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
  // Read by the warning and the button.
  const inUse = createMemo(() => props.inUse, { name: 'delete-in-use' });

  // The confirmation is a native modal dialog, opened and closed by invoker
  // commands (commandfor/command), so it needs no script. A browser without
  // them (before Chrome 135, Firefox 144, Safari 26.2) gets the same through
  // the click handlers, which do nothing where the commands work.
  let dialog: HTMLDialogElement | undefined;
  const dialogId = () => `delete-${props.id}`;
  // A refusal closes the dialog: its reason shows in the section underneath.
  useFormRefused(action, isThisForm, () => dialog?.close());

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
      <Show when={error()}>
        {(error) => (
          <div role="alert" class="alert alert-error alert-soft">
            {error().message}
          </div>
        )}
      </Show>
      <button
        type="button"
        commandfor={dialogId()}
        command="show-modal"
        disabled={!!inUse()}
        class="btn self-start btn-error"
        onClick={() => {
          if (!invokerCommands()) dialog?.showModal();
        }}
      >
        {props.title}
      </button>
      <dialog
        ref={(el) => (dialog = el)}
        id={dialogId()}
        class="modal"
        aria-labelledby={`${dialogId()}-title`}
        aria-describedby={`${dialogId()}-text`}
      >
        <div class="modal-box">
          <h3 id={`${dialogId()}-title`} class="text-lg font-bold">
            {props.title}
          </h3>
          <p id={`${dialogId()}-text`} class="py-4">
            {props.text}
          </p>
          {/* While the delete is in flight the router marks the form aria-busy. */}
          <form method="post" action={action} class="group">
            <input type="hidden" name="id" value={props.id} />
            <input type="hidden" name="version" value={props.version} />
            <input type="hidden" name="confirm" value="on" />
            {props.children}
            <div class="modal-action">
              <button
                type="button"
                commandfor={dialogId()}
                command="close"
                class="btn"
                onClick={() => {
                  if (!invokerCommands()) dialog?.close();
                }}
              >
                {m.form_cancel()}
              </button>
              <button
                type="submit"
                class="btn btn-error group-aria-busy:pointer-events-none group-aria-busy:opacity-60"
              >
                <span
                  class="loading hidden loading-sm loading-spinner group-aria-busy:inline-block"
                  aria-hidden="true"
                />
                {props.title}
              </button>
            </div>
          </form>
        </div>
        {/* A click on the backdrop closes the dialog, natively. Pointer only:
            keyboards and screen readers have Cancel and Escape. */}
        <form method="dialog" class="modal-backdrop" aria-hidden="true">
          <button tabindex="-1">{m.form_cancel()}</button>
        </form>
      </dialog>
    </section>
  );
}
