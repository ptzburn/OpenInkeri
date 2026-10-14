import { type RouteSectionProps, useMatch, useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createEffect, createMemo, isPending, untrack } from 'solid-js';
import * as v from 'valibot';
import SearchIcon from '~icons/ri/search-line';

import UserAvatar from '~/components/user-avatar';
import { getUsers } from '~/lib/users';
import { paths } from '~/router';

// Admins only: getUsers redirects a signed-out visitor to /sign-in and a
// signed-in non-admin home (src/lib/users.ts), and the section shows nothing
// until it answers. The preload starts it as navigation begins.
//
// ?q= holds the list's search, so a search survives reloads, can be shared,
// and stays put while you open users from its results.
export const route = defineFileRoute('/users', {
  search: v.object({ q: v.fallback(v.optional(v.string()), undefined) }),
  preload: ({ location }) => {
    const q = location.query.q;
    void getUsers(typeof q === 'string' ? q : '');
  },
});

// A layout route: pairing users.tsx with the users/ directory nests every
// page inside it under this component. From lg up the list is a fixed column
// beside the page (an overview at /users, the user at /users/:id), so picking
// someone never moves it; below that they take turns: /users shows the list,
// /users/:id the user.
export default function UsersLayout(props: RouteSectionProps) {
  const [search, setSearch] = useSearchParams(paths.users);
  const list = createMemo(() => getUsers(search.q ?? ''));
  const detail = useMatch(() => '/users/:id');

  // Searching as you type, once typing pauses; replace keeps each keystroke
  // out of the history. The value goes in untrimmed; getUsers trims it.
  //
  // The input is not bound to ?q: the URL catches up only once a search's
  // results arrive, and a bound value would then rewind whatever was typed
  // meanwhile. It starts from ?q (rendered on the server too), and follows
  // the URL only when the change came from elsewhere (back/forward, a link)
  // while you aren't typing in it.
  let input: HTMLInputElement | undefined;
  let typing: ReturnType<typeof setTimeout> | undefined;
  const initialSearch = untrack(() => search.q ?? '');
  createEffect(
    () => search.q ?? '',
    (q) => {
      if (input && document.activeElement !== input) input.value = q;
    },
  );
  const searchFor = (value: string) => {
    clearTimeout(typing);
    setSearch({ q: value || undefined }, { replace: true });
  };

  return (
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
          <span class="badge badge-sm">{list().total}</span>
        </header>
        {/* A plain GET form, so searching works before JavaScript loads. */}
        <form
          role="search"
          class="px-4 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            searchFor(new FormData(event.currentTarget).get('q') as string);
          }}
        >
          <label class="input w-full">
            <SearchIcon class="size-4 opacity-50" aria-hidden="true" />
            <input
              type="search"
              name="q"
              ref={(el) => (input = el)}
              value={initialSearch}
              placeholder="Name, or email with @"
              aria-label="Search users"
              onInput={(event) => {
                const value = event.currentTarget.value;
                clearTimeout(typing);
                typing = setTimeout(() => searchFor(value), 300);
              }}
            />
          </label>
        </form>
        {/* The router marks the selected user's link aria-current="page". */}
        <nav
          aria-labelledby="users-heading"
          class="transition-opacity"
          style={{ opacity: isPending(list) ? 0.5 : 1 }}
        >
          <Show
            when={list().users.length}
            fallback={
              <p class="px-4 py-6 text-center text-base-content/60">No users match “{search.q}”.</p>
            }
          >
            <ul class="list p-2">
              <For each={list().users}>
                {(user) => (
                  <li>
                    <a
                      href={paths.users(user.id, { q: search.q })}
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
          </Show>
        </nav>
      </section>
      <div class={['min-w-0 flex-1 lg:flex', detail() ? 'flex' : 'hidden']}>{props.children}</div>
    </main>
  );
}
