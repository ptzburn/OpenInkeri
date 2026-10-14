import { Loading, Show, createMemo } from 'solid-js';
import Map from '~icons/ri/map-2-line';
import Team from '~icons/ri/team-line';
// Typed client env, validated and baked in at build time (see env.ts).
import { env } from 'virtual:env/client';

import AccountMenu from '~/components/account-menu';
import LanguageSwitcher from '~/components/language-switcher';
import ThemeSwitcher from '~/components/theme-switcher';
import { getCurrentUser } from '~/lib/account';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// The drawer's sidebar: the app name with the language and theme toggles,
// the navigation and, at the bottom, the account corner. Admin-only links
// stay hidden from everyone else; the pages and server functions guard
// themselves anyway.
export default function Sidebar() {
  const user = createMemo(() => getCurrentUser());

  return (
    <aside class="flex min-h-full w-64 flex-col bg-base-200">
      <div class="flex items-center justify-between py-3 pr-3 pl-6">
        <a href={paths()} class="text-xl font-bold">
          {env.VITE_APP_NAME}
        </a>
        <div class="flex">
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
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
