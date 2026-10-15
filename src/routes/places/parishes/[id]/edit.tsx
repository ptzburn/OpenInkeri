import type { RouteProps } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show } from 'solid-js';

import EditPage from '~/components/edit-page';
import ParishEditForm from '~/components/parish-edit-form';
import { getParishEdit } from '~/lib/parishes';
import { idParam } from '~/lib/search';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Admins only: getParishEdit redirects anyone else (signed out to sign-in,
// others home).
export const route = defineFileRoute('/places/parishes/:id/edit', {
  preload: ({ params }) => {
    const id = idParam(params.id);
    if (id) void getParishEdit(id);
  },
});

export default function EditParish(props: RouteProps<'/places/parishes/:id/edit'>) {
  return (
    <EditPage
      title={m.parish_edit_title()}
      backHref={paths.places.parishes()}
      backLabel={m.parish_edit_back()}
    >
      <Show when={idParam(props.params.id)} fallback={<p>{m.parish_edit_missing()}</p>}>
        {(id) => <ParishEditForm id={id()} cancelHref={paths.places.parishes()} />}
      </Show>
    </EditPage>
  );
}
