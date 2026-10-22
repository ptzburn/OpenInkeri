import { Title } from '@solidjs/meta';
import { useSearchParams, useSubmissions } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo } from 'solid-js';
import { env } from 'virtual:env/client';

import AuthProviderIcon from '~/components/auth-provider-icon';
import { signInContinueLabels } from '~/components/labels';
import { getSignInProviders, signIn } from '~/data/session';
import type { ActionError } from '~/lib/form-error';
import type { QueryData } from '~/lib/query-data';
import { stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// ?error= is the code better-auth sends back after a failed provider round trip.
export const route = defineFileRoute('/sign-in', {
  search: stringParams('error'),
  preload: () => void getSignInProviders(),
});

/** What to say for better-auth's ?error= code (src/server/auth.ts explains the first). */
function callbackError(code: string): string {
  switch (code) {
    case 'account_not_linked':
      return m.sign_in_email_taken();
    case 'unable_to_get_user_info':
      return m.sign_in_no_email();
    // The admin plugin refuses a banned user a session (src/data/users.ts).
    case 'BANNED_USER':
      return m.sign_in_banned();
    default:
      return m.sign_in_incomplete();
  }
}

export default function SignIn() {
  const [search] = useSearchParams(paths['sign-in']);
  const providers = createMemo(
    (): Promise<QueryData<typeof getSignInProviders>> => getSignInProviders(),
    { name: 'sign-in-providers' },
  );
  const submissions = useSubmissions(signIn);
  // Either the action failed before leaving for the provider, or better-auth
  // sent the user back here with ?error=<code> after the round trip.
  const error = () =>
    (submissions.at(-1)?.error as ActionError | undefined)?.message ??
    (search.error ? callbackError(search.error) : undefined);

  return (
    <main class="mx-auto w-full max-w-sm px-4 py-12 text-center">
      <Title>{`${m.account_sign_in()} - ${env.VITE_APP_NAME}`}</Title>
      <h1 class="my-6 text-4xl font-bold">{m.account_sign_in()}</h1>
      <div class="flex flex-col gap-4">
        <Show when={error()}>
          {(message) => (
            <div role="alert" class="alert alert-error alert-soft">
              {message()}
            </div>
          )}
        </Show>
        <For each={providers()}>
          {(provider) => (
            // Posts to the server function before JavaScript loads too.
            <form method="post" action={signIn.with(provider)}>
              <button type="submit" class="btn btn-block btn-neutral">
                <AuthProviderIcon provider={provider} class="size-5" />
                {signInContinueLabels[provider]()}
              </button>
            </form>
          )}
        </For>
      </div>
      <p class="mt-6 text-sm text-base-content/70">{m.sign_in_first_time()}</p>
    </main>
  );
}
