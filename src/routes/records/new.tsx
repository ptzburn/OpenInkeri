import { useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show, createMemo } from 'solid-js';

import EditPage from '~/components/edit-page';
import RecordEditForm from '~/components/record-edit-form';
import { getRecordEditOptions } from '~/data/records';
import { requireAdmin } from '~/data/session';
import { isRecordKind } from '~/lib/record-kinds';
import { stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Admins only: the form starts empty, so requireAdmin is the page's read
// and guard (signed out to sign-in, others home). saveRecord checks again.
// The list's ?kind=, ?q= and ?page= ride along: the kind is the new
// record's type, and cancelling returns to the same place in the list.
export const route = defineFileRoute('/records/new', {
  search: stringParams('kind', 'q', 'page'),
  preload: () => {
    void requireAdmin();
    void getRecordEditOptions();
  },
});

export default function NewRecord() {
  const [search] = useSearchParams(paths.records.new);
  const allowed = createMemo(() => requireAdmin(), { name: 'record-new-admin' });
  const listHref = () => paths.records({ kind: search.kind, q: search.q, page: search.page });

  return (
    <EditPage title={m.record_new_title()} backHref={listHref()} backLabel={m.record_edit_back()}>
      <Show when={allowed()}>
        <RecordEditForm
          kind={isRecordKind(search.kind) ? search.kind : 'baptisms'}
          returnTo={{ kind: search.kind, q: search.q, page: search.page }}
          cancelHref={listHref()}
        />
      </Show>
    </EditPage>
  );
}
