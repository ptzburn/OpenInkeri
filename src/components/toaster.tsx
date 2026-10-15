import {
  For,
  type ParentProps,
  createContext,
  createSignal,
  onSettled,
  useContext,
} from 'solid-js';
import CloseIcon from '~icons/ri/close-line';

import { m } from '~/paraglide/messages.js';

// Short confirmations after an action, e.g. "Parish X deleted." on the list
// a delete redirects to. The list lives in ToastProvider (one per app in the
// browser, one per request on the server), not at module scope, which the
// server would share between requests. Toasts only appear after a client-side
// action: without JavaScript a form post reloads the page and shows none.

interface Toast {
  id: number;
  message: string;
}

/** How long a toast stays up, unless closed first. */
const TOAST_MS = 5000;

const ToastContext = createContext<(message: string) => void>();

/** Shows a short confirmation in the corner of the page. Call during component setup. */
export function useToast(): (message: string) => void {
  return useContext(ToastContext);
}

/** Provides useToast() to the app below it and shows its toasts above the page. */
export function ToastProvider(props: ParentProps) {
  const [toasts, setToasts] = createSignal<Toast[]>([], { name: 'toasts' });
  let nextId = 0;
  const show = (message: string) => {
    const toast = { id: ++nextId, message };
    setToasts((list) => [...list, toast]);
  };
  const dismiss = (id: number) => setToasts((list) => list.filter((toast) => toast.id !== id));

  return (
    <ToastContext value={show}>
      {props.children}
      {/* A live region from the first render, so screen readers announce
          the toasts added to it. Above the drawer's sidebar (z-10). */}
      <div role="status" aria-live="polite" class="toast toast-end z-20">
        <For each={toasts()}>
          {(toast) => <ToastItem message={toast.message} onClose={() => dismiss(toast.id)} />}
        </For>
      </div>
    </ToastContext>
  );
}

function ToastItem(props: { message: string; onClose: () => void }) {
  // Closes itself after TOAST_MS; the timer goes with the toast.
  onSettled(() => {
    const timer = setTimeout(() => props.onClose(), TOAST_MS);
    return () => clearTimeout(timer);
  });

  return (
    <div class="alert alert-success">
      <span>{props.message}</span>
      <button
        type="button"
        class="btn btn-circle btn-ghost btn-xs"
        aria-label={m.toast_close()}
        onClick={() => props.onClose()}
      >
        <CloseIcon class="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
