import type { RouteDefinition, RouteSectionProps } from '@solidjs/router';
import { For, Show, createMemo } from 'solid-js';

import { requireUser } from '~/lib/account';
import { getUsers } from '~/lib/users';
import { paths } from '~/router';

// Signed-in only. The preload starts the check as navigation begins; the
// component reads the same cached query, so a signed-out visitor is
// redirected to /sign-in before any of the section renders. The server
// functions check the session themselves too (src/lib/users.ts).
export const route = {
  preload: ({ location }) => {
    void requireUser(location.pathname);
    void getUsers();
  },
} satisfies RouteDefinition;

// A layout route: pairing users.tsx with the users/ directory nests every
// page inside it under this component.
export default function UsersLayout(props: RouteSectionProps) {
  const me = createMemo(() => requireUser(props.location.pathname));
  const users = createMemo(() => getUsers());

  return (
    <Show when={me()}>
      <main>
        <h1 class="my-6 text-4xl font-bold">Users</h1>
        <nav aria-label="Users" class="mb-8">
          <ul class="menu menu-horizontal justify-center gap-1 rounded-box bg-base-200">
            <For each={users()}>
              {(user) => (
                <li>
                  <a class="aria-[current=page]:menu-active" href={paths.users(user.id)}>
                    {user.name}
                  </a>
                </li>
              )}
            </For>
          </ul>
        </nav>
        {props.children}
      </main>
    </Show>
  );
}
