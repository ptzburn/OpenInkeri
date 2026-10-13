import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { Show, createMemo } from 'solid-js';

import Counter from '~/components/counter';
import { getCurrentUser } from '~/lib/account';
import logo from '~/logo.svg';
import { paths } from '~/router';

// The preload starts these fetches as navigation begins — and it doubles as
// the page's single-flight manifest: after a mutation, the server reruns it
// to put the refreshed data on the action response itself.
export const route = {
  preload: () => void getCurrentUser(),
} satisfies RouteDefinition;

export default function Home() {
  // A server-function read: the signed-in user, or null.
  const me = createMemo(() => getCurrentUser());

  return (
    <main>
      <Title>Home - Solid App</Title>
      <img
        src={logo}
        class="pointer-events-none mx-auto h-[24vmin] animate-[spin_20s_linear_infinite] motion-reduce:animate-none"
        alt="Solid logo"
      />
      <h1 class="my-6 text-4xl font-bold">Hello Solid!</h1>
      <Counter />
      <p class="my-6">
        Edit{' '}
        <code class="rounded bg-base-200 px-1.5 py-0.5 font-mono text-sm">
          src/routes/index.tsx
        </code>{' '}
        and save to reload.
      </p>
      {/* The signed-in user comes from the session the middleware read
          (see src/middleware.ts); signing in happens on /sign-in. */}
      <Show
        when={me()}
        fallback={
          <p class="my-6">
            <a class="link link-primary" href={paths['sign-in']()}>
              Sign in with GitHub
            </a>
          </p>
        }
      >
        {(user) => (
          <p class="my-6">
            Signed in as <strong>{user().name}</strong>.
          </p>
        )}
      </Show>
      <a
        class="link link-primary font-semibold"
        href="https://v2.solidjs.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Learn Solid
      </a>
    </main>
  );
}
