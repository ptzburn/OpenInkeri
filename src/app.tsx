import { Title } from '@solidjs/meta';
import { Loading, createSignal, onSettled } from 'solid-js';
import MenuIcon from '~icons/ri/menu-line';
// Typed client env, validated and baked in at build time (see env.ts).
import { env } from 'virtual:solid-env/client';

import Breadcrumbs from './components/breadcrumbs';
import LanguageSwitcher from './components/language-switcher';
import Logo from './components/logo';
import Sidebar, { type Shortcut, SidebarToggle } from './components/sidebar';
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
        // Cmd+B (Ctrl+B off a Mac, where Ctrl+B moves the caret back in a
        // field) toggles the sidebar: folds it from lg up, opens or closes
        // the drawer below. By the key's place, not its letter: a Russian
        // layout types "и" there. Known once in the browser: the server
        // can't tell a Mac, and the fold button's title says it then.
        const [shortcut, setShortcut] = createSignal<Shortcut | null>(null, {
          name: 'sidebar-shortcut',
        });
        onSettled(() => {
          const mac = /Mac|iPhone|iPad/.test(navigator.platform);
          setShortcut(
            mac ? { label: '⌘B', aria: 'Meta+B' } : { label: 'Ctrl+B', aria: 'Control+B' },
          );
          const pressed = (event: KeyboardEvent) => {
            const command = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
            if (event.code !== 'KeyB' || !command || event.altKey || event.shiftKey) return;
            event.preventDefault();
            if (matchMedia('(min-width: 64rem)').matches) toggleSidebar();
            else if (drawer) drawer.checked = !drawer.checked;
          };
          document.addEventListener('keydown', pressed);
          return () => document.removeEventListener('keydown', pressed);
        });
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
                  the page; from lg up a button in the same place folds the
                  sidebar to its icons and back, and the name is the
                  sidebar's alone (folded, not shown). The breadcrumbs
                  follow, taking the row's width (navbar-end only what its
                  buttons need); on a phone, a page with a page above shows
                  the way back to it in place of the name.
                  Sticky to the top as the page scrolls (the page is the
                  scroller: drawer-content has no overflow of its own); its
                  z-index stays under the drawer's 10, so the opened sidebar
                  still covers it. */}
                <header class="navbar sticky top-0 z-5 border-b border-base-300 bg-base-100">
                  <div class="group navbar-start w-auto min-w-0 flex-1">
                    <label
                      for="app-drawer"
                      aria-label={m.app_open_menu()}
                      aria-keyshortcuts={shortcut()?.aria}
                      class="btn drawer-button btn-square btn-ghost lg:hidden"
                    >
                      <MenuIcon class="size-6" aria-hidden="true" />
                    </label>
                    <SidebarToggle
                      collapsed={collapsed()}
                      onToggle={toggleSidebar}
                      shortcut={shortcut()}
                    />
                    <span class="flex shrink-0 items-center gap-2 px-2 text-lg font-bold lg:hidden max-sm:group-has-[nav[data-back]]:hidden">
                      <Logo class="size-6" />
                      {env.VITE_APP_NAME}
                    </span>
                    <Breadcrumbs />
                  </div>
                  <div class="navbar-end w-auto shrink-0">
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
                class="drawer-side sidebar-collapsed:overflow-visible"
                onClick={(event) => {
                  if ((event.target as Element).closest('a')) drawer!.checked = false;
                }}
              >
                <label for="app-drawer" aria-label={m.app_close_menu()} class="drawer-overlay" />
                <Sidebar />
              </div>
            </div>
          </ToastProvider>
        );
      }}
    </Router>
  );
}
