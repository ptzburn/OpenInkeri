import type { RouteProps } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show } from 'solid-js';

import { MapPage } from '~/components/edit-page';
import ParishEditForm from '~/components/parish-edit-form';
import { getParishEdit } from '~/data/parishes';
import { getPlaceMarkers, getPlaceOptions } from '~/data/places';
import { idParam } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import type { Crumbs } from '~/lib/breadcrumbs';

// Admins only: getParishEdit redirects anyone else (signed out to sign-in,
// others home).
const crumbs: Crumbs = () => [
  { label: m.parishes_title(), href: paths.places.parishes() },
  { label: m.parish_edit_title() },
];

export const route = defineFileRoute('/places/parishes/:id/edit', {
  info: { crumbs },
  preload: ({ params }) => {
    const id = idParam(params.id);
    if (id) {
      void getParishEdit(id);
      void getPlaceOptions();
      void getPlaceMarkers();
    }
  },
});

export default function EditParish(props: RouteProps<'/places/parishes/:id/edit'>) {
  return (
    <MapPage title={m.parish_edit_title()}>
      <Show when={idParam(props.params.id)} fallback={<p class="p-4">{m.parish_edit_missing()}</p>}>
        {(id) => (
          <ParishEditForm
            id={id()}
            title={m.parish_edit_title()}
            cancelHref={paths.places.parishes()}
          />
        )}
      </Show>
    </MapPage>
  );
}
