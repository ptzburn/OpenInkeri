import { type RouteProps, useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show } from 'solid-js';

import EditPage from '~/components/edit-page';
import PlaceEditForm from '~/components/place-edit-form';
import { getParishOptions } from '~/data/parishes';
import { getPlaceEdit } from '~/data/places';
import { idParam, stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Admins only: getPlaceEdit redirects anyone else (signed out to sign-in,
// others home). The list's ?q= and ?parish= ride along, so saving or
// cancelling returns to the same list.
export const route = defineFileRoute('/places/villages/:id/edit', {
  search: stringParams('q', 'parish'),
  preload: ({ params }) => {
    const id = idParam(params.id);
    if (id) {
      void getPlaceEdit(id);
      void getParishOptions();
    }
  },
});

export default function EditVillage(props: RouteProps<'/places/villages/:id/edit'>) {
  const [search] = useSearchParams(paths.places.villages);
  const listHref = () => paths.places.villages({ q: search.q, parish: search.parish });

  return (
    <EditPage title={m.place_edit_title()} backHref={listHref()} backLabel={m.place_edit_back()}>
      <Show when={idParam(props.params.id)} fallback={<p>{m.place_edit_missing()}</p>}>
        {(id) => (
          <PlaceEditForm
            id={id()}
            returnTo={{ q: search.q, parish: search.parish }}
            cancelHref={listHref()}
          />
        )}
      </Show>
    </EditPage>
  );
}
