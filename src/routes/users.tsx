import { type RouteDefinition, type RouteSectionProps, useMatch } from '@solidjs/router';
import { For, Show, createMemo } from 'solid-js';

import UserAvatar from '~/components/user-avatar';
import { requireAdmin } from '~/lib/account';
import { getUsers } from '~/lib/users';
import { paths } from '~/router';

// Admins only. The preload starts the check as navigation begins; the
// component reads the same cached query, so a signed-out visitor is
// redirected to /sign-in, and a signed-in non-admin home, before any of the
// section renders. The server
// functions check the session themselves too (src/lib/users.ts).
export const route = {
  preload: () => {
    void requireAdmin();
    void getUsers();
  },
} satisfies RouteDefinition;

// A layout route: pairing users.tsx with the users/ directory nests every
// page inside it under this component. From lg up the list is a fixed column
// beside the page (an overview at /users, the user at /users/:id), so picking
// someone never moves it; below that they take turns: /users shows the list,
// /users/:id the user.
export default function UsersLayout(props: RouteSectionProps) {
  const me = createMemo(() => requireAdmin());
  const users = createMemo(() => getUsers());
  const detail = useMatch(() => '/users/:id');

  return (
    <Show when={me()}>
      <main class="flex flex-1 flex-col lg:flex-row">
        <section
          aria-labelledby="users-heading"
          class={[
            'flex-col border-base-300 lg:flex lg:w-80 lg:shrink-0 lg:border-r',
            detail() ? 'hidden' : 'flex',
          ]}
        >
          <header class="flex items-center gap-2 px-4 pt-6 pb-2">
            <h1 id="users-heading" class="text-2xl font-bold">
              Users
            </h1>
            <span class="badge badge-sm">{users().length}</span>
          </header>
          {/* The router marks the selected user's link aria-current="page". */}
          <nav aria-labelledby="users-heading">
            <ul class="list p-2">
              <For each={users()}>
                {(user) => (
                  <li>
                    <a
                      href={paths.users(user.id)}
                      class="list-row items-center hover:bg-base-200 aria-[current=page]:bg-base-300"
                    >
                      <UserAvatar name={user.name} image={user.image} class="w-10" />
                      <div class="min-w-0">
                        <div class="truncate font-medium">{user.name}</div>
                        <div class="truncate text-sm text-base-content/60">{user.email}</div>
                      </div>
                      <Show when={user.isAdmin}>
                        <span class="badge badge-soft badge-sm">Admin</span>
                      </Show>
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </nav>
        </section>
        <div class={['min-w-0 flex-1 lg:flex', detail() ? 'flex' : 'hidden']}>{props.children}</div>
      </main>
    </Show>
  );
}
