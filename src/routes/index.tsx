import { Title } from '@solidjs/meta';
import MapIcon from '~icons/ri/map-2-line';
import { env } from 'virtual:env/client';

import { m } from '~/paraglide/messages.js';

// Home: the whole content area is reserved for the map.
export default function Home() {
  return (
    <main class="flex flex-1 p-4">
      <Title>{env.VITE_APP_NAME}</Title>
      {/* Placeholder until the map lands. */}
      <div class="grid flex-1 place-items-center rounded-box border-2 border-dashed border-base-300 text-base-content/40">
        <div class="flex flex-col items-center gap-2">
          <MapIcon class="size-12" aria-hidden="true" />
          <p>{m.home_map_soon()}</p>
        </div>
      </div>
    </main>
  );
}
