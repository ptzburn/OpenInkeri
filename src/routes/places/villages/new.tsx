import { useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';

import EditPage from '~/components/edit-page';
import PlaceEditForm from '~/components/place-edit-form';
import { getParishOptions } from '~/data/parishes';
import { stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Admins only: getParishOptions redirects anyone else (signed out to sign-in,
// others home). The list's ?q= and ?parish= ride along, as on the edit
// page; a new village starts in the parish the list was narrowed to.
export const route = defineFileRoute('/places/villages/new', {
  search: stringParams('q', 'parish'),
  preload: () => void getParishOptions(),
});

export default function NewVillage() {
  const [search] = useSearchParams(paths.places.villages);
  const listHref = () => paths.places.villages({ q: search.q, parish: search.parish });

  return (
    <EditPage title={m.place_new_title()} backHref={listHref()} backLabel={m.place_edit_back()}>
      <PlaceEditForm returnTo={{ q: search.q, parish: search.parish }} cancelHref={listHref()} />
    </EditPage>
  );
}
