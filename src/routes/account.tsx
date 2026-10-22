import { Title } from '@solidjs/meta';
import { type RouteDefinition, useSubmissions } from '@solidjs/router';
import { For, Show, createMemo, isPending } from 'solid-js';
import { env } from 'virtual:env/client';
import CalendarIcon from '~icons/ri/calendar-line';
import DeviceIcon from '~icons/ri/computer-line';
import MailIcon from '~icons/ri/mail-line';

import type { QueryData } from '~/lib/query-data';
import { FIELD_MAX } from '~/lib/field-limits';
import AuthProviderIcon from '~/components/auth-provider-icon';
import { authProviderLabels } from '~/components/labels';
import UserAvatar from '~/components/user-avatar';
import {
  type DeleteAccountError,
  deleteAccount,
  getAccount,
  renameMe,
  revokeOtherSessions,
  revokeSession,
} from '~/data/account';
import { getCurrentUser, signInAgain } from '~/data/session';
import type { AuthProvider } from '~/lib/auth-providers';
import type { ActionError } from '~/lib/form-error';
import { describeUserAgent, formatDate } from '~/lib/format';
import { m } from '~/paraglide/messages.js';

// The preload starts the read as navigation begins, and doubles as the
// page's single-flight manifest: after an action here, the server reruns it
// to put the refreshed data on the action response itself.
export const route = {
  preload: () => {
    void getAccount();
    // Not read on this page: listed so a rename refreshes the sidebar's
    // name in the same response.
    void getCurrentUser();
  },
} satisfies RouteDefinition;

/**
 * Sign in again, with each provider linked to the account (usually one),
 * for a fresh session: listing sessions and deleting the account need one.
 */
function SignInAgain(props: { providers: AuthProvider[] }) {
  // One child for the alert it sits in: an alert puts each child in a column.
  return (
    <div class="flex flex-wrap gap-2">
      <For each={props.providers}>
        {(provider) => (
          <form action={signInAgain.with(provider)} method="post">
            <button type="submit" class="btn btn-sm">
              <AuthProviderIcon provider={provider} class="size-4" />
              {props.providers.length > 1
                ? m.account_sign_in_again_with({ provider: authProviderLabels[provider]() })
                : m.account_sign_in_again()}
            </button>
          </form>
        )}
      </For>
    </div>
  );
}

/** The latest submission's error message, if it failed. */
function lastError<E extends ActionError>(submissions: { error?: unknown }[]) {
  return submissions.at(-1)?.error as E | undefined;
}

// Your own account, for everyone signed in: getAccount redirects a
// signed-out visitor to /sign-in (and, like getUsers, resolves to undefined
// in that server render).
export default function Account() {
  const account = createMemo((): Promise<QueryData<typeof getAccount>> => getAccount(), {
    name: 'account',
  });
  const renames = useSubmissions(renameMe);
  const deletions = useSubmissions(deleteAccount);
  const reauthentications = useSubmissions(signInAgain);
  const revocations = useSubmissions(revokeSession);
  const deleteError = () => lastError<DeleteAccountError>(deletions);

  return (
    <main
      class="flex flex-1 flex-col gap-8 p-4 transition-opacity lg:p-8"
      style={{ opacity: isPending(account) ? 0.5 : 1 }}
    >
      <Title>{`${m.account_title()} - ${env.VITE_APP_NAME}`}</Title>
      <h1 class="text-2xl font-bold">{m.account_title()}</h1>
      {/* Sign in again is offered in two places; a failure to start it
          shows here, above both. */}
      <Show when={lastError(reauthentications)?.message}>
        {(message) => (
          <div role="alert" class="alert max-w-xl alert-error alert-soft">
            {message()}
          </div>
        )}
      </Show>
      <Show when={account()}>
        {(shown) => (
          <>
            <section class="flex max-w-xl flex-col gap-4" aria-labelledby="account-profile">
              <h2 id="account-profile" class="sr-only">
                {m.account_profile()}
              </h2>
              <header class="flex items-center gap-4">
                <UserAvatar name={shown().user.name} image={shown().user.image} class="w-20" />
                <div class="min-w-0">
                  <p class="truncate text-xl font-semibold">{shown().user.name}</p>
                  <Show when={shown().user.isAdmin}>
                    <span class="badge badge-soft">{m.user_badge_admin()}</span>
                  </Show>
                </div>
              </header>
              <ul class="list rounded-box bg-base-200">
                <li class="list-row items-center">
                  <MailIcon class="size-5 text-base-content/60" aria-hidden="true" />
                  <span class="truncate">{shown().user.email}</span>
                </li>
                <li class="list-row items-center">
                  <CalendarIcon class="size-5 text-base-content/60" aria-hidden="true" />
                  <span>{m.user_joined({ date: formatDate(shown().user.createdAt) })}</span>
                </li>
              </ul>
              <p class="text-sm text-base-content/60">{m.account_email_from_provider()}</p>
              <form action={renameMe} method="post">
                <fieldset class="fieldset">
                  <legend class="fieldset-legend">{m.account_display_name()}</legend>
                  <div class="join">
                    <input
                      name="name"
                      value={shown().user.name}
                      required
                      maxlength={FIELD_MAX.displayName}
                      class="input join-item w-full"
                      aria-label={m.account_name()}
                    />
                    <button type="submit" class="btn btn-primary join-item">
                      {m.account_rename()}
                    </button>
                  </div>
                  <Show when={lastError(renames)?.message}>
                    {(message) => (
                      <p role="alert" class="label text-error">
                        {message()}
                      </p>
                    )}
                  </Show>
                </fieldset>
              </form>
            </section>

            <section class="flex max-w-xl flex-col gap-2" aria-labelledby="account-sessions">
              <h2 id="account-sessions" class="text-lg font-semibold">
                {m.account_sessions()}
              </h2>
              <p class="text-sm text-base-content/60">{m.account_sessions_hint()}</p>
              {/* better-auth lists sessions only to a session from the last
                  day; an older one gets the way to a fresh one instead. */}
              <Show
                when={shown().sessions}
                fallback={
                  <div
                    role="status"
                    class="alert alert-vertical alert-info alert-soft sm:alert-horizontal"
                  >
                    <span>{m.account_sessions_reauthenticate()}</span>
                    <SignInAgain providers={shown().providers} />
                  </div>
                }
              >
                {(sessions) => (
                  <>
                    <ul class="list rounded-box bg-base-200">
                      <For each={sessions()} keyed={(session) => session.id}>
                        {(session) => (
                          <li class="list-row items-center">
                            <DeviceIcon class="size-5 text-base-content/60" aria-hidden="true" />
                            <div class="min-w-0">
                              <div class="truncate font-medium">
                                {describeUserAgent(session().userAgent) ??
                                  m.account_session_unknown()}
                              </div>
                              <div class="truncate text-sm text-base-content/60">
                                {m.account_session_signed_in({
                                  date: formatDate(session().createdAt),
                                })}
                                <Show when={session().ipAddress}>{(ip) => ` · ${ip()}`}</Show>
                              </div>
                            </div>
                            <Show
                              when={!session().isCurrent}
                              fallback={
                                <span class="badge badge-outline badge-sm">
                                  {m.account_session_current()}
                                </span>
                              }
                            >
                              <form action={revokeSession.with(session().id)} method="post">
                                <button type="submit" class="btn btn-ghost btn-sm">
                                  {m.account_session_revoke()}
                                </button>
                              </form>
                            </Show>
                          </li>
                        )}
                      </For>
                    </ul>
                    <Show when={sessions().length > 1}>
                      <form action={revokeOtherSessions} method="post">
                        <button type="submit" class="btn btn-sm">
                          {m.account_sessions_revoke_others()}
                        </button>
                      </form>
                    </Show>
                    <Show when={lastError(revocations)?.message}>
                      {(message) => (
                        <p role="alert" class="text-sm text-error">
                          {message()}
                        </p>
                      )}
                    </Show>
                  </>
                )}
              </Show>
            </section>

            <section
              class="flex max-w-xl flex-col gap-3 rounded-box border border-error/40 p-4"
              aria-labelledby="account-delete"
            >
              <h2 id="account-delete" class="text-lg font-semibold text-error">
                {m.account_delete()}
              </h2>
              <p class="text-sm">{m.account_delete_text()}</p>
              {/* A ticked box instead of a confirm dialog, so it works before
                  JavaScript loads too; the server checks it again. */}
              <form action={deleteAccount} method="post" class="flex flex-col gap-3">
                <label class="label text-base-content">
                  <input type="checkbox" name="confirm" required class="checkbox checkbox-error" />
                  {m.account_delete_confirm()}
                </label>
                <button type="submit" class="btn self-start btn-error">
                  {m.account_delete()}
                </button>
              </form>
              <Show when={deleteError()}>
                {(error) => (
                  <div
                    role="alert"
                    class="alert alert-vertical alert-error alert-soft sm:alert-horizontal"
                  >
                    <span>{error().message}</span>
                    <Show when={(error() as DeleteAccountError).reauthenticate}>
                      <SignInAgain providers={shown().providers} />
                    </Show>
                  </div>
                )}
              </Show>
            </section>
          </>
        )}
      </Show>
    </main>
  );
}
