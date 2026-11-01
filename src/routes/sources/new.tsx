import { defineFileRoute } from '@solidjs/router/fs';
import { Show, createMemo } from 'solid-js';

import EditPage from '~/components/edit-page';
import SourceEditForm from '~/components/source-edit-form';
import { requireAdmin } from '~/data/session';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Admins only: the form starts empty, so requireAdmin is the page's read
// and guard (signed out to sign-in, others home). saveSource checks again.
export const route = defineFileRoute('/sources/new', {
  preload: () => void requireAdmin(),
});

export default function NewSource() {
  const allowed = createMemo(() => requireAdmin(), { name: 'source-new-admin' });

  return (
    <EditPage title={m.source_new_title()}>
      <Show when={allowed()}>
        <SourceEditForm cancelHref={paths.sources()} />
      </Show>
    </EditPage>
  );
}
