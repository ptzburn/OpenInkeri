import { Title } from '@solidjs/meta';
import { Loading } from 'solid-js';
import MenuIcon from '~icons/ri/menu-line';
// Typed client env, validated and baked in at build time (see env.ts).
import { env } from 'virtual:env/client';

import Sidebar from './components/sidebar';
import { Router } from './router';
import './app.css';

export default function App() {
  let drawer: HTMLInputElement | undefined;

  return (
    <Router>
      {(props) => (
        <>
          <Title>{env.VITE_APP_NAME}</Title>
          {/* The sidebar stays open from lg up; below that the checkbox
              toggles it over the page. */}
          <div class="drawer lg:drawer-open">
            <input
              id="app-drawer"
              type="checkbox"
              class="drawer-toggle"
              ref={(el) => (drawer = el)}
            />
            <div class="drawer-content flex min-h-dvh flex-col">
              <header class="navbar bg-base-200 lg:hidden">
                <label for="app-drawer" aria-label="Open menu" class="btn btn-square btn-ghost">
                  <MenuIcon class="size-6" aria-hidden="true" />
                </label>
                <span class="px-2 text-lg font-bold">{env.VITE_APP_NAME}</span>
              </header>
              <Loading
                fallback={
                  <main class="grid flex-1 place-items-center">
                    <span class="loading loading-spinner loading-lg" aria-label="Loading" />
                  </main>
                }
              >
                {props.children}
              </Loading>
            </div>
            {/* Following a link closes the drawer on small screens. */}
            <div
              class="drawer-side z-10"
              onClick={(event) => {
                if ((event.target as Element).closest('a')) drawer!.checked = false;
              }}
            >
              <label for="app-drawer" aria-label="Close menu" class="drawer-overlay" />
              <Sidebar />
            </div>
          </div>
        </>
      )}
    </Router>
  );
}
