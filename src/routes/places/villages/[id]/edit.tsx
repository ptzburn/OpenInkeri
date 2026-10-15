import { Title } from '@solidjs/meta';
import { type RouteProps, useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show } from 'solid-js';
import { env } from 'virtual:env/client';
import BackIcon from '~icons/ri/arrow-left-line';

import PlaceEditForm from '~/components/place-edit-form';
import { getParishes, getPlaceEdit } from '~/lib/places';
import { stringParams } from '~/lib/search';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// A place id from the URL, or null when it can't be one (then the page says
// so without asking the server).
const placeId = (id: string | undefined) => {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Admins only: getPlaceEdit redirects anyone else (signed out to sign-in,
// others home). The list's ?q= and ?parish= ride along, so saving or
// cancelling returns to the same list.
export const route = defineFileRoute('/places/villages/:id/edit', {
  search: stringParams('q', 'parish'),
  preload: ({ params }) => {
    const id = placeId(params.id);
    if (id) {
      void getPlaceEdit(id);
      void getParishes();
    }
  },
});

export default function EditVillage(props: RouteProps<'/places/villages/:id/edit'>) {
  const [search] = useSearchParams(paths.places.villages);
  const listHref = () => paths.places.villages({ q: search.q, parish: search.parish });
  const id = () => placeId(props.params.id);

  return (
    <main class="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-8">
      <Title>{`${m.place_edit_title()} - ${env.VITE_APP_NAME}`}</Title>
      <a href={listHref()} class="btn self-start btn-ghost btn-sm">
        <BackIcon class="size-4" aria-hidden="true" />
        {m.place_edit_back()}
      </a>
      <h1 class="text-2xl font-bold">{m.place_edit_title()}</h1>
      <Show when={id()} fallback={<p>{m.place_edit_missing()}</p>}>
        {(shown) => (
          <PlaceEditForm
            id={shown()}
            returnTo={{ q: search.q, parish: search.parish }}
            cancelHref={listHref()}
          />
        )}
      </Show>
    </main>
  );
}
