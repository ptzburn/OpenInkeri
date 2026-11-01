import { onSettled } from 'solid-js';

/** How long typing pauses before a search goes out. */
export const TYPING_PAUSE = 300;

/**
 * `fn`, called with the last arguments once calls pause for `ms`: a search
 * as you type. Call it from a component body: a call still waiting when the
 * component goes is dropped with it (it would search for a page that is
 * gone). `now` runs a waiting call at once (Enter), or nothing.
 */
export function createDebounced<A extends unknown[]>(fn: (...args: A) => void, ms = TYPING_PAUSE) {
  let waiting: ReturnType<typeof setTimeout> | undefined;
  let last: A | undefined;
  const cancel = () => {
    clearTimeout(waiting);
    waiting = undefined;
  };
  onSettled(() => cancel);
  const call = (...args: A) => {
    last = args;
    cancel();
    waiting = setTimeout(() => {
      waiting = undefined;
      fn(...args);
    }, ms);
  };
  const now = () => {
    if (waiting === undefined) return;
    cancel();
    fn(...last!);
  };
  return { call, cancel, now };
}
