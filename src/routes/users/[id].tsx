import { Title } from '@solidjs/meta';
import {
  type RouteDefinition,
  type RouteProps,
  useSearchParams,
  useSubmissions,
} from '@solidjs/router';
import { Show, createMemo, isPending } from 'solid-js';
import { env } from 'virtual:env/client';
import BackIcon from '~icons/ri/arrow-left-line';
import CalendarIcon from '~icons/ri/calendar-line';
import MailIcon from '~icons/ri/mail-line';

import UserAvatar from '~/components/user-avatar';
import { getCurrentUser } from '~/lib/account';
import { formatDate } from '~/lib/format';
import { getUser, renameMe } from '~/lib/users';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// The preload starts these fetches as navigation begins — and it doubles as
// the page's single-flight manifest: after the rename mutation, the server
// reruns it to put the refreshed data on the action response itself.
export const route = {
  preload: ({ params }) => {
    void getUser(params.id!);
    // Not read on this page: listed so a rename refreshes the sidebar's
    // name in the same response.
    void getCurrentUser();
  },
} satisfies RouteDefinition;

export default function User(props: RouteProps<'/users/:id'>) {
  // Server-function reads through memos — the surrounding <Loading>
  // boundary (in app.tsx) shows its fallback until the promises settle.
  const user = createMemo(() => getUser(props.params.id), { name: 'user' });
  const [search] = useSearchParams(paths.users);
  const renames = useSubmissions(renameMe);
  const error = () => (renames.at(-1)?.error as { message?: string } | undefined)?.message;

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
          {/* Only on your own page: the server enforces that too, since
              renameMe only ever renames the signed-in user. */}
          <Show when={shown().isMe}>
            <form action={renameMe} method="post" class="max-w-xl">
              <fieldset class="fieldset">
                <legend class="fieldset-legend">{m.user_display_name()}</legend>
                <div class="join">
                  <input
                    name="name"
                    value={shown().name}
                    required
                    maxlength={100}
                    class="input join-item w-full"
                    aria-label={m.user_name()}
                  />
                  <button type="submit" class="btn btn-primary join-item">
                    {m.user_rename()}
                  </button>
                </div>
                <Show when={error()}>
                  {(message) => (
                    <p role="alert" class="label text-error">
                      {message()}
                    </p>
                  )}
                </Show>
              </fieldset>
            </form>
          </Show>
        </section>
      )}
    </Show>
  );
}
