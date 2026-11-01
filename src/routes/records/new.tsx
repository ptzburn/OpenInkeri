import { useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show, createMemo } from 'solid-js';

import EditPage from '~/components/edit-page';
import RecordEditForm from '~/components/record-edit-form';
import { getRecordEditOptions } from '~/data/records';
import { requireAdmin } from '~/data/session';
import { isRecordKind } from '~/lib/record-kinds';
import { idParam, stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Admins only: the form starts empty, so requireAdmin is the page's read
// and guard (signed out to sign-in, others home). saveRecord checks again.
// The list's ?kind=, ?q=, ?page= and ?source= ride along: the kind is the
// new record's type, the source the one it starts in, and cancelling
// returns to the same place in the list. ?after= is the record saved just
// before with Save and add next, which the new one follows on its page.
export const route = defineFileRoute('/records/new', {
  search: stringParams('kind', 'q', 'page', 'source', 'after'),
  preload: () => {
    void requireAdmin();
    void getRecordEditOptions();
  },
});

export default function NewRecord() {
  const [search] = useSearchParams(paths.records.new);
  const allowed = createMemo(() => requireAdmin(), { name: 'record-new-admin' });
  const listPlace = () => ({
    kind: search.kind,
    q: search.q,
    page: search.page,
    source: search.source,
  });
  const listHref = () => paths.records(listPlace());

  return (
    <EditPage title={m.record_new_title()}>
      <Show when={allowed()}>
        <RecordEditForm
          kind={isRecordKind(search.kind) ? search.kind : 'baptisms'}
          after={idParam(search.after) ?? undefined}
          returnTo={listPlace()}
          cancelHref={listHref()}
        />
      </Show>
    </EditPage>
  );
}
