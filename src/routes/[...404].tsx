import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { httpStatus } from '@solidjs/web';
import { env } from 'virtual:env/client';

import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// The catch-all route. httpStatus() sets the response status during SSR
// (a no-op in the browser); it runs in preload so the status code is set
// before the response head flushes.
export const route = {
  preload: () => httpStatus(404),
} satisfies RouteDefinition;

export default function NotFound() {
  return (
    <main class="mx-auto w-full max-w-3xl px-4 py-12 text-center">
      <Title>{`${m.not_found_title()} - ${env.VITE_APP_NAME}`}</Title>
      <h1 class="my-6 text-4xl font-bold">{m.not_found_title()}</h1>
      <p>{m.not_found_text()}</p>
      <a class="btn mt-6 btn-primary" href={paths()}>
        {m.not_found_home()}
      </a>
    </main>
  );
}
