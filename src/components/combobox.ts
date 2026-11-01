// What a combobox's input and listbox share (the lookup field, the locality
// search): whether the list is open, the row the arrow keys are on, the
// keys, the ids the ARIA attributes join, and keeping the active row in
// view. The markup stays with each component.
import { createEffect, createSignal, untrack } from 'solid-js';

export interface ComboboxOptions<T, K extends string | number> {
  /** What the element ids start with ("placeText"): the input, the list, each option. */
  name: () => string;
  /** The rows the list shows, in order. */
  rows: () => T[];
  /** What names a row for the keys and its id: its value, or its place in the list. */
  keyOf: (row: T, index: number) => K;
  /** Whether the open list has anything to show; the keys only move on a shown list. */
  visible?: () => boolean;
  /** Told the row chosen, with Enter or a click. */
  pick: (row: T) => void;
  /** Hears the list close (Escape, Tab, blur, a pick), for state that goes with it. */
  closed?: () => void;
  /** Hears the arrow key open a closed list; without it the key moves onto the first row too. */
  opened?: () => void;
  /** Enter never reaches the form around the input (one that isn't a field of it). */
  enterStays?: boolean;
}

/**
 * A combobox's state and keys, for a component to wire to its input and
 * listbox: `open` and `shown` (open with something to show), `active` (the
 * key of the row the arrow keys are on), the ids, and what the input's
 * events call: `typed` (the list opens, on no row), `show` (focus, a click),
 * `close` (blur) and `onKeyDown` (the arrows, Enter, Escape, Tab). `pick`
 * is a click on a row. The active row scrolls into view.
 */
export function createCombobox<T, K extends string | number>(options: ComboboxOptions<T, K>) {
  const name = untrack(options.name);
  const [open, setOpen] = createSignal(false, { name: `${name}-open` });
  const [active, setActive] = createSignal<K | null>(null, { name: `${name}-active` });
  const shown = () => open() && (options.visible?.() ?? true);
  const ids = {
    input: () => `${options.name()}-input`,
    list: () => `${options.name()}-list`,
    option: (key: K) => `${options.name()}-option-${key}`,
  };
  const activeIndex = () =>
    options.rows().findIndex((row, i) => options.keyOf(row, i) === active());

  const show = () => setOpen(true);
  const typed = () => {
    setOpen(true);
    setActive(null);
  };
  const close = () => {
    setOpen(false);
    setActive(null);
    options.closed?.();
  };
  const pick = (row: T) => {
    options.pick(row);
    close();
  };
  const move = (step: 1 | -1) => {
    const rows = options.rows();
    if (!rows.length) return;
    const at = activeIndex();
    const next = at === -1 ? (step === 1 ? 0 : rows.length - 1) : at + step;
    const index = Math.min(Math.max(next, 0), rows.length - 1);
    setActive(() => options.keyOf(rows[index], index));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (shown()) move(1);
        else if (options.opened) {
          options.opened();
          setOpen(true);
        } else {
          setOpen(true);
          move(1);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (open()) move(-1);
        break;
      case 'Enter': {
        const at = open() ? activeIndex() : -1;
        if (at !== -1 || options.enterStays) event.preventDefault();
        if (at !== -1) pick(options.rows()[at]);
        break;
      }
      case 'Escape':
        if (open()) {
          event.preventDefault();
          close();
        }
        break;
      case 'Tab':
        close();
        break;
    }
  };

  // The row the arrow keys reach stays in view.
  createEffect(
    () => active(),
    (key) => {
      if (key !== null) {
        document.getElementById(ids.option(key))?.scrollIntoView?.({ block: 'nearest' });
      }
    },
    { name: `${name}-scroll` },
  );

  return {
    open,
    shown,
    active,
    isActive: (key: K) => active() === key,
    ids,
    show,
    typed,
    close,
    pick,
    move,
    onKeyDown,
  };
}
