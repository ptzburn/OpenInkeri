import { Title } from '@solidjs/meta';
import { type RouteDefinition, type RouteProps, useSearchParams } from '@solidjs/router';
import { Show, createMemo, isPending } from 'solid-js';
import { env } from 'virtual:env/client';
import BackIcon from '~icons/ri/arrow-left-line';
import CalendarIcon from '~icons/ri/calendar-line';
import MailIcon from '~icons/ri/mail-line';
import SettingsIcon from '~icons/ri/user-settings-line';

import UserAvatar from '~/components/user-avatar';
import { formatDate } from '~/lib/format';
import { getUser } from '~/data/users';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// The preload starts the fetch as navigation begins.
export const route = {
  preload: ({ params }) => void getUser(params.id!),
} satisfies RouteDefinition;

export default function User(props: RouteProps<'/users/:id'>) {
  // Server-function reads through memos — the surrounding <Loading>
  // boundary (in app.tsx) shows its fallback until the promises settle.
  const user = createMemo(() => getUser(props.params.id), { name: 'user' });
  const [search] = useSearchParams(paths.users);

  return (
    <Show when={user()} fallback={<p class="p-6">{m.user_not_found()}</p>}>
      {(shown) => (
        <section
          class="flex flex-1 flex-col gap-6 p-4 transition-opacity lg:p-8"
          style={{ opacity: isPending(user) ? 0.5 : 1 }}
        >
          <Title>{`${shown().name} - ${env.VITE_APP_NAME}`}</Title>
          {/* Below lg the list is hidden while a user is open; back keeps
              its search. */}
          <a href={paths.users({ q: search.q })} class="btn self-start btn-ghost btn-sm lg:hidden">
            <BackIcon class="size-4" aria-hidden="true" />
            {m.user_back()}
          </a>
          <header class="flex items-center gap-4">
            <UserAvatar name={shown().name} image={shown().image} class="w-20" />
            <div class="min-w-0">
              <h2 class="truncate text-2xl font-bold">{shown().name}</h2>
              <div class="mt-1 flex flex-wrap gap-1">
                <Show when={shown().isAdmin}>
                  <span class="badge badge-soft">{m.user_badge_admin()}</span>
                </Show>
                <Show when={shown().banned}>
                  <span class="badge badge-soft badge-error">{m.user_badge_banned()}</span>
                </Show>
                <Show when={shown().isMe}>
                  <span class="badge badge-outline">{m.user_badge_you()}</span>
                </Show>
              </div>
            </div>
          </header>
          <ul class="list max-w-xl rounded-box bg-base-200">
            <li class="list-row items-center">
              <MailIcon class="size-5 text-base-content/60" aria-hidden="true" />
              <a href={`mailto:${shown().email}`} class="link truncate link-hover">
                {shown().email}
              </a>
            </li>
            <li class="list-row items-center">
              <CalendarIcon class="size-5 text-base-content/60" aria-hidden="true" />
              <span>{m.user_joined({ date: formatDate(shown().createdAt) })}</span>
            </li>
          </ul>
          {/* Your own details are edited on the account page. */}
          <Show when={shown().isMe}>
            <a href={paths.account()} class="btn self-start btn-sm">
              <SettingsIcon class="size-4" aria-hidden="true" />
              {m.account_manage()}
            </a>
          </Show>
        </section>
      )}
    </Show>
  );
}
