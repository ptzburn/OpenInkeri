import type { RouteProps } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show } from 'solid-js';

import EditPage from '~/components/edit-page';
import SourceEditForm from '~/components/source-edit-form';
import { getParishOptions } from '~/data/parishes';
import { getSourceEdit } from '~/data/sources';
import { idParam } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Admins only: getSourceEdit redirects anyone else (signed out to sign-in,
// others home).
export const route = defineFileRoute('/sources/:id/edit', {
  preload: ({ params }) => {
    const id = idParam(params.id);
    if (id) {
      void getSourceEdit(id);
      void getParishOptions();
    }
  },
});

export default function EditSource(props: RouteProps<'/sources/:id/edit'>) {
  return (
    <EditPage
      title={m.source_edit_title()}
      backHref={paths.sources()}
      backLabel={m.source_edit_back()}
    >
      <Show when={idParam(props.params.id)} fallback={<p>{m.source_edit_missing()}</p>}>
        {(id) => <SourceEditForm id={id()} cancelHref={paths.sources()} />}
      </Show>
    </EditPage>
  );
}
