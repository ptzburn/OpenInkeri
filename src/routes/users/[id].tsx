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
import SettingsIcon from '~icons/ri/user-settings-line';

import UserAvatar from '~/components/user-avatar';
import { FIELD_MAX } from '~/lib/field-limits';
import type { ActionError } from '~/lib/form-error';
import { formatDate } from '~/lib/format';
import { banUser, getUser, makeAdmin, removeAdmin, signOutUser, unbanUser } from '~/data/users';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// The preload starts the fetch as navigation begins, and doubles as the
// page's single-flight manifest: after an admin action here, the action's
// response carries the user's refreshed badges.
export const route = {
  preload: ({ params }) => void getUser(params.id!),
} satisfies RouteDefinition;

/**
 * The latest of these submissions for this user (each action is bound to
 * the user's id), so another user's outcome doesn't show here.
 */
function latestFor<S extends { input: unknown[] }>(submissions: S[], id: string): S | undefined {
  return submissions.findLast((submission) => submission.input[0] === id);
}

const errorOf = (submission?: { error?: unknown }) =>
  (submission?.error as ActionError | undefined)?.message;

/**
 * What an admin can do to someone else: admin rights, signing them out
 * everywhere, and banning. The server refuses these on your own account
 * (that's the account page), so the page doesn't offer them there.
 */
function UserAdmin(props: {
  user: { id: string; isAdmin: boolean; banned: boolean | null; banReason: string | null };
}) {
  const roleChanges = useSubmissions(makeAdmin);
  const roleRemovals = useSubmissions(removeAdmin);
  const signOuts = useSubmissions(signOutUser);
  const bans = useSubmissions(banUser);
  const unbans = useSubmissions(unbanUser);
  const latest = <S extends { input: unknown[] }>(submissions: S[]) =>
    latestFor(submissions, props.user.id);
  const roleError = () => errorOf(latest(roleChanges)) ?? errorOf(latest(roleRemovals));
  const signOut = () => latest(signOuts);
  const banError = () => errorOf(latest(bans)) ?? errorOf(latest(unbans));

  return (
    <section class="flex max-w-xl flex-col gap-4" aria-labelledby="user-admin">
      <div>
        <h3 id="user-admin" class="text-lg font-semibold">
          {m.user_admin_section()}
        </h3>
        <p class="text-sm text-base-content/60">{m.user_admin_delay()}</p>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap gap-2">
          <form
            action={
              props.user.isAdmin ? removeAdmin.with(props.user.id) : makeAdmin.with(props.user.id)
            }
            method="post"
          >
            <button type="submit" class="btn btn-sm">
              {props.user.isAdmin ? m.user_remove_admin() : m.user_make_admin()}
            </button>
          </form>
          <form action={signOutUser.with(props.user.id)} method="post">
            <button type="submit" class="btn btn-sm">
              {m.user_sign_out_everywhere()}
            </button>
          </form>
        </div>
        <Show when={roleError() ?? errorOf(signOut())}>
          {(message) => (
            <p role="alert" class="text-sm text-error">
              {message()}
            </p>
          )}
        </Show>
        <Show when={signOut()?.result}>
          <p role="status" class="text-sm text-success">
            {m.user_signed_out_everywhere()}
          </p>
        </Show>
      </div>

      <div class="flex flex-col gap-3 rounded-box border border-error/40 p-4">
        <Show
          when={props.user.banned}
          fallback={
            <form action={banUser.with(props.user.id)} method="post">
              <fieldset class="fieldset">
                <legend class="fieldset-legend">{m.user_ban_title()}</legend>
                <p class="text-sm">{m.user_ban_hint()}</p>
                <div class="join">
                  <input
                    name="reason"
                    maxlength={FIELD_MAX.line}
                    class="input join-item w-full"
                    placeholder={m.user_ban_reason()}
                    aria-label={m.user_ban_reason()}
                  />
                  <button type="submit" class="btn join-item btn-error">
                    {m.user_ban()}
                  </button>
                </div>
              </fieldset>
            </form>
          }
        >
          <p class="text-sm">
            {props.user.banReason
              ? m.user_banned_because({ reason: props.user.banReason })
              : m.user_banned()}
          </p>
          <form action={unbanUser.with(props.user.id)} method="post">
            <button type="submit" class="btn btn-sm">
              {m.user_unban()}
            </button>
          </form>
        </Show>
        <Show when={banError()}>
          {(message) => (
            <p role="alert" class="text-sm text-error">
              {message()}
            </p>
          )}
        </Show>
      </div>
    </section>
  );
}

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
          <Show when={shown().isMe} fallback={<UserAdmin user={shown()} />}>
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
