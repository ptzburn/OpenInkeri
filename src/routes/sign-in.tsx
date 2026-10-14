import { Title } from '@solidjs/meta';
import { useSearchParams, useSubmissions } from '@solidjs/router';
import { Show } from 'solid-js';
import { env } from 'virtual:env/client';
import GitHub from '~icons/ri/github-fill';

import { type ActionError, signInWithGitHub } from '~/lib/account';
import { m } from '~/paraglide/messages.js';

export default function SignIn() {
  const [search] = useSearchParams();
  const submissions = useSubmissions(signInWithGitHub);
  // Either the action failed before leaving for GitHub, or better-auth sent
  // the user back here with ?error=<code> after the round trip.
  const error = () =>
    (submissions.at(-1)?.error as ActionError | undefined)?.message ??
    (search.error ? m.sign_in_incomplete() : undefined);

  return (
    <main class="mx-auto w-full max-w-sm px-4 py-12 text-center">
      <Title>{`${m.account_sign_in()} - ${env.VITE_APP_NAME}`}</Title>
      <h1 class="my-6 text-4xl font-bold">{m.account_sign_in()}</h1>
      {/* Posts to the server function before JavaScript loads too. */}
      <form method="post" action={signInWithGitHub} class="flex flex-col gap-4">
        <Show when={error()}>
          {(message) => (
            <div role="alert" class="alert alert-error alert-soft">
              {message()}
            </div>
          )}
        </Show>
        <button type="submit" class="btn btn-neutral">
          <GitHub class="size-5" aria-hidden="true" />
          {m.sign_in_continue_github()}
        </button>
      </form>
      <p class="mt-6 text-sm text-base-content/70">{m.sign_in_first_time()}</p>
    </main>
  );
}
