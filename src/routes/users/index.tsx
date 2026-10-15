import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { For, createMemo } from 'solid-js';
import { env } from 'virtual:env/client';

import type { QueryData } from '~/lib/query-data';
import UserAvatar from '~/components/user-avatar';
import { formatDate } from '~/lib/format';
import { getUsers } from '~/data/users';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// The overview counts everyone, whatever the list is searching for. Without
// a search that is the layout's own read (same query key), so it costs no
// extra request; with one, the preload starts it alongside the layout's.
export const route = {
  preload: () => void getUsers(''),
} satisfies RouteDefinition;

// The layout's index page: an overview beside the list until someone is
// picked (from lg up; below that the layout shows only the list). Without an
// index, /users would fall through to the [...404] catch-all.
export default function UsersIndex() {
  const list = createMemo((): Promise<QueryData<typeof getUsers>> => getUsers(''), {
    name: 'overview-list',
  });
  const users = createMemo(() => list()?.users ?? [], { name: 'overview-users' });
  const admins = createMemo(() => users().filter((user) => user.isAdmin).length, {
    name: 'overview-admins',
  });
  const banned = createMemo(() => users().filter((user) => user.banned).length, {
    name: 'overview-banned',
  });
  // getUsers lists the oldest first.
  const newest = createMemo(() => users().slice(-5).reverse(), { name: 'overview-newest' });

  return (
    <section class="flex flex-1 flex-col gap-8 p-4 lg:p-8">
      <Title>{`${m.users_title()} - ${env.VITE_APP_NAME}`}</Title>
      <h2 class="text-2xl font-bold">{m.users_overview()}</h2>
      <div class="stats stats-vertical self-start bg-base-200 sm:stats-horizontal">
        <div class="stat">
          <div class="stat-title">{m.users_title()}</div>
          <div class="stat-value">{users().length}</div>
        </div>
        <div class="stat">
          <div class="stat-title">{m.users_stat_admins()}</div>
          <div class="stat-value">{admins()}</div>
        </div>
        <div class="stat">
          <div class="stat-title">{m.users_stat_banned()}</div>
          <div class="stat-value">{banned()}</div>
        </div>
      </div>
      <div class="max-w-xl">
        <h3 class="mb-2 text-lg font-semibold">{m.users_recently_joined()}</h3>
        <ul class="list rounded-box bg-base-200">
          <For each={newest()}>
            {(user) => (
              <li>
                <a href={paths.users(user.id)} class="list-row items-center hover:bg-base-300">
                  <UserAvatar name={user.name} image={user.image} class="w-8" />
                  <span class="truncate font-medium">{user.name}</span>
                  <span class="text-sm text-base-content/60">{formatDate(user.createdAt)}</span>
                </a>
              </li>
            )}
          </For>
        </ul>
      </div>
    </section>
  );
}
