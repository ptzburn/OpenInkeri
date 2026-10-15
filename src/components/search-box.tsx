import type { JSX } from '@solidjs/web';
import { createEffect, onSettled, untrack } from 'solid-js';
import SearchIcon from '~icons/ri/search-line';

/**
 * A list's search box, searching as you type: `onSearch` gets the text once
 * typing pauses (or on Enter), and the page puts it in the URL (?q=, with
 * `replace` so each keystroke stays out of the history). It is a plain GET
 * form named `q`, so searching works before JavaScript loads too; `children`
 * go inside it (hidden inputs that carry the list's other params, a filter
 * chip). The value going out is untrimmed; the reads trim it.
 */
export default function SearchBox(props: {
  /** The search in the URL (?q=). */
  value: string | undefined;
  onSearch: (value: string) => void;
  label: string;
  placeholder: string;
  /** Names the effect that follows the URL, for diagnostics. */
  name: string;
  class?: string;
  inputClass?: string;
  children?: JSX.Element;
}) {
  let typing: ReturnType<typeof setTimeout> | undefined;
  const search = (value: string) => {
    clearTimeout(typing);
    props.onSearch(value);
  };
  // A search still waiting when the page goes must not fire: it would put
  // ?q= on whatever page came next.
  onSettled(() => () => clearTimeout(typing));

  // The input is not bound to the URL: the URL catches up only once a
  // search's results arrive, and a bound value would then rewind whatever
  // was typed meanwhile (latest() doesn't help: the router's search isn't a
  // held signal it can see ahead of). It starts from the URL (rendered on
  // the server too), and follows it only when the change came from
  // elsewhere (back/forward, a link) while you aren't typing in it.
  let input: HTMLInputElement | undefined;
  const initial = untrack(() => props.value ?? '');
  createEffect(
    () => props.value ?? '',
    (value) => {
      if (input && document.activeElement !== input) input.value = value;
    },
    { name: untrack(() => props.name) },
  );

  return (
    <form
      role="search"
      class={props.class}
      onSubmit={(event) => {
        event.preventDefault();
        search(new FormData(event.currentTarget).get('q') as string);
      }}
    >
      <label class={['input w-full', props.inputClass]}>
        <SearchIcon class="size-4 opacity-50" aria-hidden="true" />
        <input
          type="search"
          name="q"
          ref={(el) => (input = el)}
          value={initial}
          placeholder={props.placeholder}
          aria-label={props.label}
          onInput={(event) => {
            const value = event.currentTarget.value;
            clearTimeout(typing);
            typing = setTimeout(() => search(value), 300);
          }}
        />
      </label>
      {props.children}
    </form>
  );
}
