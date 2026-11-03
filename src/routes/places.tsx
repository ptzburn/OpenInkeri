import type { RouteSectionProps } from '@solidjs/router';

import { SharedMap } from '~/components/places-map';

// A layout route: pairing places.tsx with the places/ directory nests every
// places page (the lists, the forms) inside it, over one map that stays as
// they change. A box as tall as the viewport under the header (navbar:
// min-h-16), the map filling it edge to edge and each page's panel over it.
// Without an index, /places falls through to the [...404] catch-all.
export default function PlacesLayout(props: RouteSectionProps) {
  return (
    <main class="relative h-[calc(100dvh-4rem)] min-w-0 flex-none overflow-hidden">
      <SharedMap>{props.children}</SharedMap>
    </main>
  );
}
