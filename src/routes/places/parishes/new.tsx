import { defineFileRoute } from '@solidjs/router/fs';
import { Show, createMemo } from 'solid-js';

import EditPage from '~/components/edit-page';
import ParishEditForm from '~/components/parish-edit-form';
import { requireAdmin } from '~/data/session';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Admins only: the form starts empty, so requireAdmin is the page's read
// and guard (signed out to sign-in, others home). saveParish checks again.
export const route = defineFileRoute('/places/parishes/new', {
  preload: () => void requireAdmin(),
});

export default function NewParish() {
  const allowed = createMemo(() => requireAdmin(), { name: 'parish-new-admin' });

  return (
    <EditPage title={m.parish_new_title()}>
      <Show when={allowed()}>
        <ParishEditForm cancelHref={paths.places.parishes()} />
      </Show>
    </EditPage>
  );
}
