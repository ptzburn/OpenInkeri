import { type BeforeLeaveEventArgs, useBeforeLeave } from '@solidjs/router';
import { createUniqueId, onSettled } from 'solid-js';

import { m } from '~/paraglide/messages.js';

// What a form would post, to compare: its text values in order (an edit form
// posts no files).
const snapshot = (form: HTMLFormElement) =>
  JSON.stringify([...new FormData(form)].filter(([, value]) => typeof value === 'string'));

/**
 * Warns before leaving an edit form with changes it hasn't saved: placed
 * inside the form, it compares what the form would post with what it posted
 * as it settled (loaded), so a change typed and undone is no change, and
 * what the map or a lookup set counts like anything typed. Leaving within
 * the app (a link, Cancel, the browser's Back) asks in a modal dialog, as
 * the Delete section does: Stay (also Escape), or Leave without saving.
 * Closing or reloading the tab gets the browser's own warning, the only one
 * a page may give there.
 *
 * A form submitted on the page (the save, or the Delete section's) leaves
 * freely, by the redirect that follows. A refusal keeps the page: the next
 * click or key press there guards it again.
 */
export default function LeaveGuard() {
  let anchor: HTMLSpanElement | undefined;
  let dialog: HTMLDialogElement | undefined;
  let form: HTMLFormElement | null = null;
  let loaded: string | null = null;
  let posting = false;
  // The navigation stopped, to go on with if the admin chooses to leave.
  let stopped: BeforeLeaveEventArgs | null = null;
  const id = createUniqueId();
  const dirty = () => !posting && !!form && loaded !== null && snapshot(form) !== loaded;

  onSettled(() => {
    form = anchor?.closest('form') ?? null;
    if (!form) return;
    loaded = snapshot(form);
    const submitted = () => (posting = true);
    // Pressed before a submit (a click on Save, Enter in a field), so a
    // submit still counts after it.
    const stayed = () => (posting = false);
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty()) event.preventDefault();
    };
    document.addEventListener('submit', submitted, true);
    document.addEventListener('pointerdown', stayed, true);
    document.addEventListener('keydown', stayed, true);
    window.addEventListener('beforeunload', unload);
    return () => {
      document.removeEventListener('submit', submitted, true);
      document.removeEventListener('pointerdown', stayed, true);
      document.removeEventListener('keydown', stayed, true);
      window.removeEventListener('beforeunload', unload);
    };
  });

  useBeforeLeave((event) => {
    if (event.defaultPrevented || !dirty()) return;
    event.preventDefault();
    stopped = event;
    dialog?.showModal();
  });

  return (
    // No box of its own (the form may be a grid), and not hidden: a hidden
    // parent would hide the dialog too.
    <span ref={(el) => (anchor = el)} class="contents">
      {/* Shown in the top layer when open; its buttons are plain buttons,
          so the form around posts nothing. */}
      <dialog
        ref={(el) => (dialog = el)}
        class="modal"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-text`}
        onClose={() => (stopped = null)}
      >
        <div class="modal-box">
          <h3 id={`${id}-title`} class="text-lg font-bold">
            {m.form_leave_title()}
          </h3>
          <p id={`${id}-text`} class="py-4">
            {m.form_leave_text()}
          </p>
          <div class="modal-action">
            <button type="button" class="btn" onClick={() => dialog?.close()}>
              {m.form_leave_stay()}
            </button>
            <button
              type="button"
              class="btn btn-error"
              onClick={() => {
                const leaving = stopped;
                dialog?.close();
                leaving?.retry(true);
              }}
            >
              {m.form_leave_go()}
            </button>
          </div>
        </div>
      </dialog>
    </span>
  );
}
