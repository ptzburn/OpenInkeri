import { Title } from '@solidjs/meta';
import { useSearchParams, useSubmissions } from '@solidjs/router';
import { Show } from 'solid-js';
import GitHub from '~icons/ri/github-fill';

import { type SignInError, safeNext, signInWithGitHub } from '~/lib/account';

export default function SignIn() {
  const [search] = useSearchParams();
  const submissions = useSubmissions(signInWithGitHub);
  const next = () => safeNext(search.next) ?? '';
  // Either the action failed before leaving for GitHub, or better-auth sent
  // the user back here with ?error=<code> after the round trip.
  const error = () =>
    (submissions.at(-1)?.error as SignInError | undefined)?.message ??
    (search.error ? 'Signing in with GitHub did not complete. Try again.' : undefined);

  return (
    <main class="mx-auto max-w-sm">
      <Title>Sign in - Solid App</Title>
      <h1 class="my-6 text-4xl font-bold">Sign in</h1>
      {/* Posts to the server function before JavaScript loads too. */}
      <form method="post" action={signInWithGitHub} class="flex flex-col gap-4">
        <input type="hidden" name="next" value={next()} />
        <Show when={error()}>
          {(message) => (
            <div role="alert" class="alert alert-error alert-soft">
              {message()}
            </div>
          )}
        </Show>
        <button type="submit" class="btn btn-neutral">
          <GitHub class="size-5" aria-hidden="true" />
          Continue with GitHub
        </button>
      </form>
      <p class="mt-6 text-sm text-base-content/70">
        First time here? Signing in with GitHub creates your account.
      </p>
    </main>
  );
}
