import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { httpStatus } from '@solidjs/web';
import { env } from 'virtual:env/client';

// The catch-all route. httpStatus() sets the response status during SSR
// (a no-op in the browser); it runs in preload so the status code is set
// before the response head flushes.
export const route = {
  preload: () => httpStatus(404),
} satisfies RouteDefinition;

export default function NotFound() {
  return (
    <main class="mx-auto w-full max-w-3xl px-4 py-12 text-center">
      <Title>{`Not Found - ${env.VITE_APP_NAME}`}</Title>
      <h1 class="my-6 text-4xl font-bold">Page Not Found</h1>
      <p>
        Visit{' '}
        <a
          class="link link-primary font-semibold"
          href="https://docs.solidjs.com"
          target="_blank"
          rel="noreferrer"
        >
          docs.solidjs.com
        </a>{' '}
        to learn how to build Solid apps.
      </p>
    </main>
  );
}
