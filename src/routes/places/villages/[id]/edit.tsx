import { type RouteProps, useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show } from 'solid-js';

import { MapPage } from '~/components/edit-page';
import PlaceEditForm, { villageListPlaceOf } from '~/components/place-edit-form';
import { getParishOptions } from '~/data/parishes';
import { getPlaceEdit, getPlaceMarkers } from '~/data/places';
import { idParam, stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import type { Crumbs } from '~/lib/breadcrumbs';

// Admins only: getPlaceEdit redirects anyone else (signed out to sign-in,
// others home). The list's ?q= and ?parish= ride along, so saving or
// cancelling returns to the same list.
const crumbs: Crumbs = ({ query }) => [
  { label: m.villages_title(), href: paths.places.villages(villageListPlaceOf(query)) },
  { label: m.place_edit_title() },
];

export const route = defineFileRoute('/places/villages/:id/edit', {
  info: { crumbs },
  search: stringParams('q', 'parish'),
  preload: ({ params }) => {
    const id = idParam(params.id);
    if (id) {
      void getPlaceEdit(id);
      void getParishOptions();
      void getPlaceMarkers();
    }
  },
});

export default function EditVillage(props: RouteProps<'/places/villages/:id/edit'>) {
  const [search] = useSearchParams(paths.places.villages);
  const listPlace = () => villageListPlaceOf(search);
  const listHref = () => paths.places.villages(listPlace());

  return (
    <MapPage title={m.place_edit_title()}>
      <Show when={idParam(props.params.id)} fallback={<p>{m.place_edit_missing()}</p>}>
        {(id) => (
          <PlaceEditForm
            title={m.place_edit_title()}
            id={id()}
            returnTo={listPlace()}
            cancelHref={listHref()}
          />
        )}
      </Show>
    </MapPage>
  );
}
