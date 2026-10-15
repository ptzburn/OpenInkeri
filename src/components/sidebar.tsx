import { useMatch } from '@solidjs/router';
import { Loading, Show, createMemo } from 'solid-js';
import Book from '~icons/ri/book-open-line';
import Map from '~icons/ri/map-2-line';
import MapPin from '~icons/ri/map-pin-2-line';
import Team from '~icons/ri/team-line';
// Typed client env, validated and baked in at build time (see env.ts).
import { env } from 'virtual:env/client';

import AccountMenu from '~/components/account-menu';
import { getCurrentUser } from '~/lib/account';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// The drawer's sidebar: the app name, the navigation and, at the bottom,
// the account corner. Links for signed-in users, or for admins, stay hidden
// from everyone else; the pages and server functions guard themselves anyway.
export default function Sidebar() {
  const user = createMemo(() => getCurrentUser(), { name: 'sidebar-user' });
  const inPlaces = useMatch(() => '/places/*');

  return (
    <aside class="flex min-h-full w-64 flex-col border-r border-base-300 bg-base-200">
      {/* As tall as the header beside it (navbar: min-h-16), with the same
          bottom border, so one line runs under both. */}
      <div class="flex min-h-16 items-center border-b border-base-300 px-6">
        <a href={paths()} class="text-xl font-bold">
          {env.VITE_APP_NAME}
        </a>
      </div>
      {/* The router marks a link data-active on its page and the pages under
          it (Home only on itself), so Users stays lit on /users/:id. */}
      <nav aria-label={m.sidebar_nav_label()} class="grow">
        <ul class="menu w-full gap-1">
          <li>
            <a class="data-active:menu-active" href={paths()}>
              <Map class="size-5" aria-hidden="true" />
              {m.sidebar_home()}
            </a>
          </li>
          <Loading>
            <Show when={user()}>
              <li>
                <a class="data-active:menu-active" href={paths.records()}>
                  <Book class="size-5" aria-hidden="true" />
                  {m.records_title()}
                </a>
              </li>
              <li>
                {/* Opens the villages tab, and stays lit on the parishes
                    tab and the edit pages too. */}
                <a class={{ 'menu-active': !!inPlaces() }} href={paths.places.villages()}>
                  <MapPin class="size-5" aria-hidden="true" />
                  {m.places_title()}
                </a>
              </li>
            </Show>
            <Show when={user()?.isAdmin}>
              <li>
                <a class="data-active:menu-active" href={paths.users()}>
                  <Team class="size-5" aria-hidden="true" />
                  {m.users_title()}
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
