import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { For, Show, createMemo } from 'solid-js';

import Counter from '../components/counter';
import { getCurrentUser, getUsers, login, logout } from '../lib/users';
import logo from '../logo.svg';

// The preload starts these fetches as navigation begins — and it doubles as
// the page's single-flight manifest: after a mutation, the server reruns it
// to put the refreshed data on the action response itself.
export const route = {
  preload: () => {
    void getCurrentUser();
    void getUsers();
  },
} satisfies RouteDefinition;

export default function Home() {
  // Server-function reads: the signed-in user comes off the session cookie
  // (see src/server/session.ts); the user list feeds the sign-in form.
  const me = createMemo(() => getCurrentUser());
  const users = createMemo(() => getUsers());

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
      {/* The session pillar: login/logout are actions posting to server
          functions — plain form posts, so they work before hydration too. */}
      <Show
        when={me()}
        fallback={
          <form action={login} method="post" class="join my-6">
            <select name="id" class="select join-item w-auto" aria-label="User">
              <For each={users()}>{(user) => <option value={user.id}>{user.name}</option>}</For>
            </select>
            <button type="submit" class="btn btn-primary join-item">
              Sign in
            </button>
          </form>
        }
      >
        {(user) => (
          <form action={logout} method="post" class="my-6 flex items-center justify-center gap-3">
            <span>
              Signed in as <strong>{user().name}</strong>.
            </span>
            <button type="submit" class="btn btn-outline btn-sm">
              Sign out
            </button>
          </form>
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
