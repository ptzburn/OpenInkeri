// Registers @testing-library/jest-dom's matchers (toHaveTextContent etc.)
// with vitest's expect, including their types.
import '@testing-library/jest-dom/vitest';

// jsdom has no showModal()/close() on <dialog> (and no invoker commands), so
// the delete confirmation's fallback click handlers open and close it here;
// a close fires the close event, as in a browser.
// The server tests run in node, with no DOM at all.
if (
  typeof HTMLDialogElement !== 'undefined' &&
  !Reflect.has(HTMLDialogElement.prototype, 'showModal')
) {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      value(this: HTMLDialogElement) {
        if (!this.open) return;
        this.open = false;
        this.dispatchEvent(new Event('close'));
      },
    },
  });
}

// jsdom's window.scrollTo only logs "Not implemented"; the router calls it
// on every navigation to restore the scroll position.
if (typeof window !== 'undefined') window.scrollTo = () => {};
