import { type RouteProps, useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show, createMemo } from 'solid-js';

import RecordEditForm, {
  listPlaceOf,
  recordFormCrumbs,
  returnHref,
} from '~/components/record-edit-form';
import EditPage from '~/components/edit-page';
import { getRecordEdit, getRecordEditOptions, requireRecordOffPhoto } from '~/data/records';
import { idParam, stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import type { Crumbs } from '~/lib/breadcrumbs';

// Admins only: getRecordEdit redirects anyone else (signed out to sign-in,
// others home). This page is for records whose page has no photo (those
// imported from transcriptions): requireRecordOffPhoto sends one on a
// photographed page to its photo, where it is edited beside it. The list's
// ?kind=, ?q=, ?page= and ?source= ride along, so saving or cancelling
// returns to the same place in the list.
const crumbs: Crumbs = ({ query }) => recordFormCrumbs(listPlaceOf(query), m.record_edit_title());

export const route = defineFileRoute('/records/:id/edit', {
  info: { crumbs },
  search: stringParams('kind', 'q', 'page', 'source'),
  preload: ({ params }) => {
    const id = idParam(params.id);
    if (id) {
      void requireRecordOffPhoto(id);
      void getRecordEdit(id);
      void getRecordEditOptions();
    }
  },
});

export default function EditRecord(props: RouteProps<'/records/:id/edit'>) {
  const [search] = useSearchParams(paths.records);
  const id = () => idParam(props.params.id);
  const offPhoto = createMemo(
    () => {
      const record = id();
      return record ? requireRecordOffPhoto(record) : false;
    },
    { name: 'record-off-photo' },
  );
  const listPlace = () => listPlaceOf(search);
  const listHref = () => returnHref(listPlace());

  return (
    <EditPage title={m.record_edit_title()}>
      <Show when={id()} fallback={<p>{m.record_edit_missing()}</p>}>
        {(record) => (
          <Show when={offPhoto()}>
            <RecordEditForm id={record()} returnTo={listPlace()} cancelHref={listHref()} />
          </Show>
        )}
      </Show>
    </EditPage>
  );
}
