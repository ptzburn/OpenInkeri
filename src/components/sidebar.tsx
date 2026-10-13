import { Loading, Show, createMemo } from 'solid-js';
import Map from '~icons/ri/map-2-line';
import Team from '~icons/ri/team-line';
// Typed client env, validated and baked in at build time (see env.ts).
import { env } from 'virtual:env/client';

import AccountMenu from '~/components/account-menu';
import { getCurrentUser } from '~/lib/account';
import { paths } from '~/router';

// The drawer's sidebar: the app name, the navigation and, at the bottom, the
// account corner. Links only signed-in users can open stay hidden from
// everyone else; the pages and server functions guard themselves anyway.
export default function Sidebar() {
  const user = createMemo(() => getCurrentUser());

  return (
    <aside class="flex min-h-full w-64 flex-col bg-base-200">
      <a href={paths()} class="px-6 py-5 text-xl font-bold">
        {env.VITE_APP_NAME}
      </a>
      {/* The router marks the matching link aria-current="page". */}
      <nav aria-label="Main" class="grow">
        <ul class="menu w-full gap-1">
          <li>
            <a class="aria-[current=page]:menu-active" href={paths()}>
              <Map class="size-5" aria-hidden="true" />
              Home
            </a>
          </li>
          <Loading>
            <Show when={user()}>
              <li>
                <a class="aria-[current=page]:menu-active" href={paths.users()}>
                  <Team class="size-5" aria-hidden="true" />
                  Users
                </a>
              </li>
            </Show>
          </Loading>
        </ul>
      </nav>
      <div class="border-t border-base-300 p-4">
        <AccountMenu />
      </div>
    </aside>
  );
}
