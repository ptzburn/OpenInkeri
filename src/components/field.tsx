import { Show, omit } from 'solid-js';
import type { JSX } from '@solidjs/web';

// A labelled form input with a server-side error under it. The input stays
// uncontrolled: the browser builds the FormData on submit.
export default function Field(
  props: {
    label: string;
    name: string;
    error?: string;
  } & JSX.InputHTMLAttributes<HTMLInputElement>,
) {
  const input = omit(props, 'label', 'error', 'class');
  return (
    <label class="flex flex-col gap-1">
      <span class="label">{props.label}</span>
      <input
        {...input}
        class="input w-full"
        aria-invalid={props.error ? 'true' : undefined}
        aria-describedby={props.error ? `${props.name}-error` : undefined}
      />
      <Show when={props.error}>
        {(message) => (
          <span id={`${props.name}-error`} role="alert" class="text-sm text-error">
            {message()}
          </span>
        )}
      </Show>
    </label>
  );
}
