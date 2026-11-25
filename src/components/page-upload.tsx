import { revalidate } from '@solidjs/router';
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createStore,
  onCleanup,
} from 'solid-js';
import FolderIcon from '~icons/ri/folder-add-line';
import AddIcon from '~icons/ri/image-add-line';

import { TableBox } from '~/components/list-page';
import { getSourcePages } from '~/data/sources';
import { FIELD_MAX } from '~/lib/field-limits';
import {
  PAGE_PHOTO_MAX_BYTES,
  type PageUploadResult,
  byFileName,
  pageLabelOf,
  pageUploadUrl,
} from '~/lib/photos';
import { m } from '~/paraglide/messages.js';

type Status = 'waiting' | 'uploading' | 'added' | 'skipped' | 'failed';

interface Row {
  id: number;
  file: File;
  /** Its page as the register numbers it, as typed. */
  label: string;
  status: Status;
  /** Why it failed. */
  message?: string;
}

const statusLabels: Record<Exclude<Status, 'failed'>, () => string> = {
  waiting: m.source_photos_waiting,
  uploading: m.source_photos_uploading,
  added: m.source_photos_added,
  skipped: m.source_photos_skipped,
};

// What a folder holds besides its photos (.DS_Store, Thumbs.db) stays out.
const isPhoto = (file: File) =>
  file.type.startsWith('image/') || /\.(heic|heif|avif)$/i.test(file.name);

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * An admin's adding of page photos to source `sourceId`, on its page: Add
 * photos and Add a folder pick them, listed in file-name order with the
 * page each name gives (~/lib/photos), which can be corrected; Upload sends
 * them one at a time (src/routes/api/sources/[id]/pages.ts), each added
 * after the source's last page as it lands, so its thumbnail shows. A
 * photo already in the source is skipped, so a folder added again after
 * an upload stopped (Stop, or leaving the page) picks up where it was.
 * Closing the tab while uploading asks first.
 */
export default function PageUpload(props: { sourceId: number }) {
  const [rows, setRows] = createStore<Row[]>([]);
  const [running, setRunning] = createSignal(false, { name: 'page-upload-running' });
  // Asked to stop after the photo being sent: by Stop, or by leaving.
  let stopping = false;
  let nextId = 1;
  let photosInput: HTMLInputElement | undefined;
  let folderInput: HTMLInputElement | undefined;

  const waiting = createMemo(() => rows.filter((r) => r.status === 'waiting').length, {
    name: 'page-upload-waiting',
  });
  const finished = createMemo(
    () => !running() && rows.length > 0 && !rows.some((r) => r.status === 'waiting'),
    { name: 'page-upload-finished' },
  );
  const count = (status: Status) => rows.filter((r) => r.status === status).length;

  onCleanup(() => (stopping = true));
  // Closing or reloading the tab mid-upload gets the browser's warning.
  createEffect(
    () => running(),
    (on) => {
      if (!on) return;
      const warn = (event: BeforeUnloadEvent) => event.preventDefault();
      window.addEventListener('beforeunload', warn);
      return () => window.removeEventListener('beforeunload', warn);
    },
  );

  const choose = (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])]
      .filter(isPhoto)
      .sort((a, b) => byFileName(a.name, b.name));
    input.value = ''; // the same photos can be chosen again
    setRows((draft) => {
      // A finished list gives way to the new one.
      if (!draft.some((r) => r.status === 'waiting')) draft.length = 0;
      for (const file of files) {
        const tooLarge = file.size > PAGE_PHOTO_MAX_BYTES;
        draft.push({
          id: nextId++,
          file,
          label: pageLabelOf(file.name) ?? '',
          status: tooLarge ? 'failed' : 'waiting',
          message: tooLarge ? m.source_photo_too_large() : undefined,
        });
      }
    });
  };

  const update = (id: number, change: Partial<Row>) =>
    setRows((draft) => {
      const row = draft.find((r) => r.id === id);
      if (row) Object.assign(row, change);
    });

  const upload = async () => {
    stopping = false;
    setRunning(true);
    for (const row of rows.filter((r) => r.status === 'waiting')) {
      if (stopping) break;
      update(row.id, { status: 'uploading' });
      let result: PageUploadResult;
      try {
        const response = await fetch(
          pageUploadUrl(props.sourceId, {
            name: row.file.name,
            label: row.label.trim() || null,
            hash: await sha256(row.file),
          }),
          {
            method: 'POST',
            body: row.file,
            headers: { 'content-type': row.file.type || 'application/octet-stream' },
          },
        );
        result = (await response.json()) as PageUploadResult;
      } catch {
        result = { status: 'refused', message: m.form_failed() };
      }
      if (result.status === 'refused') {
        update(row.id, { status: 'failed', message: result.message });
      } else {
        update(row.id, { status: result.status });
        // Its thumbnail joins the source's pages.
        if (result.status === 'added') revalidate(getSourcePages.keyFor(props.sourceId));
      }
    }
    setRunning(false);
  };

  return (
    <>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-sm"
          disabled={running()}
          onClick={() => photosInput?.click()}
        >
          <AddIcon class="size-4" aria-hidden="true" />
          {m.source_photos_add()}
        </button>
        <button
          type="button"
          class="btn btn-sm"
          disabled={running()}
          onClick={() => folderInput?.click()}
        >
          <FolderIcon class="size-4" aria-hidden="true" />
          {m.source_photos_add_folder()}
        </button>
        <input
          ref={(el) => (photosInput = el)}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          class="hidden"
          aria-label={m.source_photos_add()}
          onChange={(event) => choose(event.currentTarget)}
        />
        <input
          ref={(el) => {
            folderInput = el;
            el.webkitdirectory = true;
          }}
          type="file"
          class="hidden"
          aria-label={m.source_photos_add_folder()}
          onChange={(event) => choose(event.currentTarget)}
        />
      </div>
      <Show when={rows.length}>
        <section
          class="flex flex-col gap-3 rounded-box border border-base-300 p-4"
          aria-label={m.source_photos_add()}
        >
          <p class="text-sm text-base-content/70">{m.source_photos_hint()}</p>
          <TableBox>
            <thead>
              <tr>
                <th>{m.source_photos_col_file()}</th>
                <th>{m.record_edit_page()}</th>
                <th>{m.source_photos_col_status()}</th>
              </tr>
            </thead>
            <tbody>
              <For each={rows} keyed={(row) => row.id}>
                {(row) => (
                  <tr>
                    <td class="max-w-64 truncate" title={row().file.name}>
                      {row().file.name}
                    </td>
                    <td>
                      <input
                        class="input input-sm w-28"
                        value={row().label}
                        maxlength={FIELD_MAX.line}
                        disabled={row().status !== 'waiting'}
                        aria-label={`${m.record_edit_page()}: ${row().file.name}`}
                        onInput={(event) => update(row().id, { label: event.currentTarget.value })}
                      />
                    </td>
                    <td
                      class={[
                        'whitespace-nowrap',
                        {
                          'text-error': row().status === 'failed',
                          'text-success': row().status === 'added',
                          'text-base-content/60': row().status === 'waiting',
                        },
                      ]}
                    >
                      <Show when={row().status === 'uploading'}>
                        <span class="loading loading-xs loading-spinner" aria-hidden="true" />{' '}
                      </Show>
                      {row().status === 'failed'
                        ? row().message
                        : statusLabels[row().status as Exclude<Status, 'failed'>]()}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </TableBox>
          <Show when={finished()}>
            <p role="status" class="text-sm">
              {m.source_photos_done({
                added: count('added'),
                skipped: count('skipped'),
                failed: count('failed'),
              })}
            </p>
          </Show>
          <div class="flex flex-wrap justify-end gap-2">
            <Show
              when={running()}
              fallback={
                <button
                  type="button"
                  class="btn"
                  onClick={() => setRows((draft) => void (draft.length = 0))}
                >
                  {finished() ? m.source_photos_close() : m.form_cancel()}
                </button>
              }
            >
              <button type="button" class="btn" onClick={() => (stopping = true)}>
                {m.source_photos_stop()}
              </button>
            </Show>
            <Show when={waiting() || running()}>
              <button
                type="button"
                class="btn btn-primary"
                disabled={running()}
                onClick={() => void upload()}
              >
                <Show when={running()}>
                  <span class="loading loading-sm loading-spinner" aria-hidden="true" />
                </Show>
                {m.source_photos_upload({ count: waiting() })}
              </button>
            </Show>
          </div>
        </section>
      </Show>
    </>
  );
}
