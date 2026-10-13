import { Title } from '@solidjs/meta';
import { For, createMemo } from 'solid-js';
import { env } from 'virtual:env/client';

import UserAvatar from '~/components/user-avatar';
import { getUsers } from '~/lib/users';
import { paths } from '~/router';

// The layout's index page: an overview beside the list until someone is
// picked (from lg up; below that the layout shows only the list). It reads
// the layout's cached query, so it costs no extra request. Without an index,
// /users would fall through to the [...404] catch-all.
export default function UsersIndex() {
  const users = createMemo(() => getUsers());
  const admins = createMemo(() => users().filter((user) => user.isAdmin).length);
  const banned = createMemo(() => users().filter((user) => user.banned).length);
  // getUsers lists the oldest first.
  const newest = createMemo(() => users().slice(-5).reverse());

  return (
    <section class="flex flex-1 flex-col gap-8 p-4 lg:p-8">
      <Title>{`Users - ${env.VITE_APP_NAME}`}</Title>
      <h2 class="text-2xl font-bold">Overview</h2>
      <div class="stats stats-vertical self-start bg-base-200 sm:stats-horizontal">
        <div class="stat">
          <div class="stat-title">Users</div>
          <div class="stat-value">{users().length}</div>
        </div>
        <div class="stat">
          <div class="stat-title">Admins</div>
          <div class="stat-value">{admins()}</div>
        </div>
        <div class="stat">
          <div class="stat-title">Banned</div>
          <div class="stat-value">{banned()}</div>
        </div>
      </div>
      <div class="max-w-xl">
        <h3 class="mb-2 text-lg font-semibold">Recently joined</h3>
        <ul class="list rounded-box bg-base-200">
          <For each={newest()}>
            {(user) => (
              <li>
                <a href={paths.users(user.id)} class="list-row items-center hover:bg-base-300">
                  <UserAvatar name={user.name} image={user.image} class="w-8" />
                  <span class="truncate font-medium">{user.name}</span>
                  <span class="text-sm text-base-content/60">
                    {new Date(user.createdAt).toLocaleDateString('en')}
                  </span>
                </a>
              </li>
            )}
          </For>
        </ul>
      </div>
    </section>
  );
}
