import { Title } from '@solidjs/meta';
import { useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { env } from 'virtual:env/client';
import BackIcon from '~icons/ri/arrow-left-line';

import PlaceEditForm from '~/components/place-edit-form';
import { getParishes } from '~/lib/places';
import { stringParams } from '~/lib/search';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Admins only: getParishes redirects anyone else (signed out to sign-in,
// others home). The list's ?q= and ?parish= ride along, as on the edit
// page; a new village starts in the parish the list was narrowed to.
export const route = defineFileRoute('/places/villages/new', {
  search: stringParams('q', 'parish'),
  preload: () => void getParishes(),
});

export default function NewVillage() {
  const [search] = useSearchParams(paths.places.villages);
  const listHref = () => paths.places.villages({ q: search.q, parish: search.parish });

  return (
    <main class="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-8">
      <Title>{`${m.place_new_title()} - ${env.VITE_APP_NAME}`}</Title>
      <a href={listHref()} class="btn self-start btn-ghost btn-sm">
        <BackIcon class="size-4" aria-hidden="true" />
        {m.place_edit_back()}
      </a>
      <h1 class="text-2xl font-bold">{m.place_new_title()}</h1>
      <PlaceEditForm returnTo={{ q: search.q, parish: search.parish }} cancelHref={listHref()} />
    </main>
  );
}
