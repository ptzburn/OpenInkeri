// Registers @testing-library/jest-dom's matchers (toHaveTextContent etc.)
// with vitest's expect, including their types.
import '@testing-library/jest-dom/vitest';

// jsdom has no showModal()/close() on <dialog> (and no invoker commands), so
// the delete confirmation's fallback click handlers open and close it here.
if (!Reflect.has(HTMLDialogElement.prototype, 'showModal')) {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
}
