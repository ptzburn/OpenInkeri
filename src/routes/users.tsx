import type { RouteDefinition } from '@solidjs/router';
import type { ParentProps } from 'solid-js';
import { For, createMemo } from 'solid-js';

import { getUsers } from '../lib/users';
import { paths } from '../router';

export const route = {
  preload: () => void getUsers(),
} satisfies RouteDefinition;

// A layout route: pairing users.tsx with the users/ directory nests every
// page inside it under this component.
export default function UsersLayout(props: ParentProps) {
  // Data loading through a server function: on the server a direct call,
  // in the browser a typed fetch (see src/lib/users.ts).
  const users = createMemo(() => getUsers());

  return (
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
  );
}
