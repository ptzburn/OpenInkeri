import { Title } from '@solidjs/meta';
import { Loading } from 'solid-js';
// Typed client env, validated and baked in at build time (see env.ts).
import { env } from 'virtual:env/client';
import AccountMenu from './components/account-menu';
import { paths, Router } from './router';
import './app.css';

export default function App() {
  return (
    <Router>
      {(props) => (
        <>
          <Title>{env.VITE_APP_NAME}</Title>
          {/* The router marks the matching link aria-current="page". */}
          <nav class="navbar justify-center gap-1 bg-neutral text-neutral-content">
            <a class="btn btn-ghost aria-[current=page]:btn-active" href={paths()}>
              Дом
            </a>
            <a class="btn btn-ghost aria-[current=page]:btn-active" href={paths.users()}>
              Пользователи
            </a>
            <div class="ml-auto">
              <AccountMenu />
            </div>
          </nav>
          <div class="mx-auto max-w-3xl px-4 py-12 text-center">
            <Loading
              fallback={
                <main>
                  <span class="loading loading-spinner loading-lg" aria-label="Loading" />
                </main>
              }
            >
              {props.children}
            </Loading>
          </div>
        </>
      )}
    </Router>
  );
}
