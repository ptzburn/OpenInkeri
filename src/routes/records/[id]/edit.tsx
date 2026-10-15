import { type RouteProps, useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show } from 'solid-js';

import RecordEditForm from '~/components/record-edit-form';
import EditPage from '~/components/edit-page';
import { getRecordEdit, getRecordEditOptions } from '~/data/records';
import { idParam, stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Admins only: getRecordEdit redirects anyone else (signed out to sign-in,
// others home). The list's ?kind=, ?q= and ?page= ride along, so saving or
// cancelling returns to the same place in the list.
export const route = defineFileRoute('/records/:id/edit', {
  search: stringParams('kind', 'q', 'page'),
  preload: ({ params }) => {
    const id = idParam(params.id);
    if (id) {
      void getRecordEdit(id);
      void getRecordEditOptions();
    }
  },
});

export default function EditRecord(props: RouteProps<'/records/:id/edit'>) {
  const [search] = useSearchParams(paths.records);
  const listHref = () => paths.records({ kind: search.kind, q: search.q, page: search.page });

  return (
    <EditPage title={m.record_edit_title()} backHref={listHref()} backLabel={m.record_edit_back()}>
      <Show when={idParam(props.params.id)} fallback={<p>{m.record_edit_missing()}</p>}>
        {(id) => (
          <RecordEditForm
            id={id()}
            returnTo={{ kind: search.kind, q: search.q, page: search.page }}
            cancelHref={listHref()}
          />
        )}
      </Show>
    </EditPage>
  );
}
