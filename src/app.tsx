import { Title } from '@solidjs/meta';
import { Loading, createSignal } from 'solid-js';
import MenuIcon from '~icons/ri/menu-line';
// Typed client env, validated and baked in at build time (see env.ts).
import { env } from 'virtual:env/client';

import LanguageSwitcher from './components/language-switcher';
import Sidebar from './components/sidebar';
import ThemeSwitcher from './components/theme-switcher';
import { ToastProvider } from './components/toaster';
import { getSidebarCollapsed, saveSidebarCollapsed } from './data/sidebar';
import { m } from './paraglide/messages.js';
import { Router } from './router';
import './app.css';

export default function App() {
  let drawer: HTMLInputElement | undefined;

  return (
    <Router>
      {(props) => {
        // From lg up the sidebar can fold to its icons (the sidebar-collapsed
        // variants in app.css); the choice starts from its cookie, which the
        // server read, and the fold button writes it back. A query needs the
        // router, so this lives inside it.
        const [collapsed, setCollapsed] = createSignal(() => getSidebarCollapsed(), {
          name: 'sidebar-collapsed',
        });
        const toggleSidebar = () => {
          const next = !collapsed();
          setCollapsed(next);
          saveSidebarCollapsed(next);
        };
        return (
          <ToastProvider>
            <Title>{env.VITE_APP_NAME}</Title>
            {/* The sidebar stays open from lg up, folded or not; below that
              the checkbox toggles it over the page. */}
            <div
              class="drawer lg:drawer-open"
              data-sidebar={collapsed() ? 'collapsed' : 'expanded'}
            >
              <input
                id="app-drawer"
                type="checkbox"
                class="drawer-toggle"
                ref={(el) => (drawer = el)}
              />
              <div class="drawer-content flex min-h-dvh flex-col">
                {/* Below lg the menu button and app name open the sidebar over
                  the page; from lg up the sidebar shows the name itself,
                  unless it is folded: then the header does.
                  Sticky to the top as the page scrolls (the page is the
                  scroller: drawer-content has no overflow of its own); its
                  z-index stays under the drawer's 10, so the opened sidebar
                  still covers it. */}
                <header class="navbar sticky top-0 z-5 border-b border-base-300 bg-base-100">
                  <div class="navbar-start">
                    <label
                      for="app-drawer"
                      aria-label={m.app_open_menu()}
                      class="btn btn-square btn-ghost lg:hidden"
                    >
                      <MenuIcon class="size-6" aria-hidden="true" />
                    </label>
                    <span class="px-2 text-lg font-bold sidebar-expanded:hidden">
                      {env.VITE_APP_NAME}
                    </span>
                  </div>
                  <div class="navbar-end">
                    <LanguageSwitcher />
                    <ThemeSwitcher />
                  </div>
                </header>
                <Loading
                  fallback={
                    <main class="grid flex-1 place-items-center">
                      <span
                        class="loading loading-spinner loading-lg"
                        aria-label={m.app_loading()}
                      />
                    </main>
                  }
                >
                  {props.children}
                </Loading>
              </div>
              {/* Following a link closes the drawer on small screens. Folded,
                the links' tooltips reach out past the sidebar. */}
              <div
                class="drawer-side z-10 sidebar-collapsed:overflow-visible"
                onClick={(event) => {
                  if ((event.target as Element).closest('a')) drawer!.checked = false;
                }}
              >
                <label for="app-drawer" aria-label={m.app_close_menu()} class="drawer-overlay" />
                <Sidebar collapsed={collapsed()} onToggle={toggleSidebar} />
              </div>
            </div>
          </ToastProvider>
        );
      }}
    </Router>
  );
}
