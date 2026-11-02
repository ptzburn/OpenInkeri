import { useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';

import { MapPage } from '~/components/edit-page';
import PlaceEditForm from '~/components/place-edit-form';
import { getParishOptions } from '~/data/parishes';
import { getPlaceMarkers } from '~/data/places';
import { stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import type { Crumbs } from '~/lib/breadcrumbs';

// Admins only: getParishOptions redirects anyone else (signed out to sign-in,
// others home). The list's ?q= and ?parish= ride along, as on the edit
// page; a new village starts in the parish the list was narrowed to.
const crumbs: Crumbs = ({ query }) => [
  {
    label: m.villages_title(),
    href: paths.places.villages({ q: query.q, parish: query.parish }),
  },
  { label: m.place_new_title() },
];

export const route = defineFileRoute('/places/villages/new', {
  info: { crumbs },
  search: stringParams('q', 'parish'),
  preload: () => {
    void getParishOptions();
    void getPlaceMarkers();
  },
});

export default function NewVillage() {
  const [search] = useSearchParams(paths.places.villages);
  const listHref = () => paths.places.villages({ q: search.q, parish: search.parish });

  return (
    <MapPage title={m.place_new_title()}>
      <PlaceEditForm
        title={m.place_new_title()}
        returnTo={{ q: search.q, parish: search.parish }}
        cancelHref={listHref()}
      />
    </MapPage>
  );
}
