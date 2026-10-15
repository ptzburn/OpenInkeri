import { For, Show } from 'solid-js';

// Fields the admins' edit forms share: a label above the control, and the
// control marked when the server refused its value.

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
        maxlength={props.maxlength ?? 2000}
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
