import { useMatch } from '@solidjs/router';
import { Loading, Show, createMemo } from 'solid-js';
import Archive from '~icons/ri/archive-line';
import Book from '~icons/ri/book-open-line';
import Map from '~icons/ri/map-2-line';
import MapPin from '~icons/ri/map-pin-2-line';
import Fold from '~icons/ri/menu-fold-line';
import Unfold from '~icons/ri/menu-unfold-line';
import Team from '~icons/ri/team-line';
import Group from '~icons/ri/group-line';
// Typed client env, validated and baked in at build time (see env.ts).
import { env } from 'virtual:env/client';

import AccountMenu from '~/components/account-menu';
import { getCurrentUser } from '~/data/session';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Folded (from lg up, see app.css), a link shows its icon and says its name
// in a tooltip to the right.
const folded = 'sidebar-collapsed:tooltip sidebar-collapsed:tooltip-right';

// The drawer's sidebar: the app name, the navigation and, at the bottom,
// the account corner. Links for signed-in users, or for admins, stay hidden
// from everyone else; the pages and server functions guard themselves anyway.
// From lg up a button folds it to its icons (`collapsed`, kept by App).
export default function Sidebar(props: { collapsed: boolean; onToggle: () => void }) {
  const user = createMemo(() => getCurrentUser(), { name: 'sidebar-user' });
  const inPlaces = useMatch(() => '/places/*');

  return (
    <aside class="flex min-h-full w-64 flex-col border-r border-base-300 bg-base-200 sidebar-collapsed:w-14">
      {/* As tall as the header beside it (navbar: min-h-16), with the same
          bottom border, so one line runs under both. Folded, only the fold
          button is left, centred. */}
      <div class="flex min-h-16 items-center justify-between border-b border-base-300 pr-2 pl-6 sidebar-collapsed:justify-center sidebar-collapsed:px-0">
        <a href={paths()} class="text-xl font-bold sidebar-collapsed:hidden">
          {env.VITE_APP_NAME}
        </a>
        <button
          type="button"
          class="btn hidden btn-square btn-ghost btn-sm lg:inline-flex"
          aria-expanded={props.collapsed ? 'false' : 'true'}
          aria-controls="app-nav"
          aria-label={props.collapsed ? m.sidebar_expand() : m.sidebar_collapse()}
          title={props.collapsed ? m.sidebar_expand() : m.sidebar_collapse()}
          onClick={() => props.onToggle()}
        >
          <Show when={props.collapsed} fallback={<Fold class="size-5" aria-hidden="true" />}>
            <Unfold class="size-5" aria-hidden="true" />
          </Show>
        </button>
      </div>
      {/* The router marks a link data-active on its page and the pages under
          it (Home only on itself), so Users stays lit on /users/:id. */}
      <nav id="app-nav" aria-label={m.sidebar_nav_label()} class="grow">
        <ul class="menu w-full gap-1">
          <li>
            <a
              class={['data-active:menu-active', folded]}
              data-tip={m.sidebar_home()}
              href={paths()}
            >
              <Map class="size-5" aria-hidden="true" />
              <span class="sidebar-collapsed:hidden">{m.sidebar_home()}</span>
            </a>
          </li>
          <Loading>
            <Show when={user()}>
              <li>
                <a
                  class={['data-active:menu-active', folded]}
                  data-tip={m.records_title()}
                  href={paths.records()}
                >
                  <Book class="size-5" aria-hidden="true" />
                  <span class="sidebar-collapsed:hidden">{m.records_title()}</span>
                </a>
              </li>
              <li>
                <a
                  class={['data-active:menu-active', folded]}
                  data-tip={m.people_title()}
                  href={paths.people()}
                >
                  <Group class="size-5" aria-hidden="true" />
                  <span class="sidebar-collapsed:hidden">{m.people_title()}</span>
                </a>
              </li>
              <li>
                <a
                  class={['data-active:menu-active', folded]}
                  data-tip={m.sources_title()}
                  href={paths.sources()}
                >
                  <Archive class="size-5" aria-hidden="true" />
                  <span class="sidebar-collapsed:hidden">{m.sources_title()}</span>
                </a>
              </li>
              <li>
                {/* Opens the villages tab, and stays lit on the parishes
                    tab and the edit pages too. */}
                <a
                  class={[{ 'menu-active': !!inPlaces() }, folded]}
                  data-tip={m.places_title()}
                  href={paths.places.villages()}
                >
                  <MapPin class="size-5" aria-hidden="true" />
                  <span class="sidebar-collapsed:hidden">{m.places_title()}</span>
                </a>
              </li>
            </Show>
            <Show when={user()?.isAdmin}>
              <li>
                <a
                  class={['data-active:menu-active', folded]}
                  data-tip={m.users_title()}
                  href={paths.users()}
                >
                  <Team class="size-5" aria-hidden="true" />
                  <span class="sidebar-collapsed:hidden">{m.users_title()}</span>
                </a>
              </li>
            </Show>
          </Loading>
        </ul>
      </nav>
      {/* As tall as the forms' save bar (min-h-18, see FormActions'
          callers), folded or not, so the line over it runs level with the
          bar's. */}
      <div class="flex min-h-18 items-center border-t border-base-300 px-4 sidebar-collapsed:px-1">
        <AccountMenu />
      </div>
    </aside>
  );
}
