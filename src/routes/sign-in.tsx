import { Title } from '@solidjs/meta';
import { useSearchParams, useSubmissions } from '@solidjs/router';
import { Show } from 'solid-js';

import Field from '../components/field';
import { type AccountError, safeNext, signIn } from '../lib/account';

export default function SignIn() {
  const [search] = useSearchParams();
  const submissions = useSubmissions(signIn);
  const error = () => submissions.at(-1)?.error as AccountError | undefined;
  const next = () => safeNext(search.next) ?? '';

  return (
    <main class="mx-auto max-w-sm text-left">
      <Title>Sign in - Solid App</Title>
      <h1 class="my-6 text-center text-4xl font-bold">Sign in</h1>
      {/* Posts to the server function before JavaScript loads too. */}
      <form method="post" action={signIn} class="flex flex-col gap-4">
        <input type="hidden" name="next" value={next()} />
        <Show when={error()?.message}>
          {(message) => (
            <div role="alert" class="alert alert-error alert-soft">
              {message()}
            </div>
          )}
        </Show>
        <Field
          label="Email"
          name="email"
          type="email"
          autocomplete="email"
          required
          error={error()?.issues?.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          error={error()?.issues?.password}
        />
        <button type="submit" class="btn btn-primary">
          Sign in
        </button>
      </form>
      <p class="mt-6 text-center">
        No account yet?{' '}
        <a
          class="link link-primary"
          href={`/sign-up${next() ? `?next=${encodeURIComponent(next())}` : ''}`}
        >
          Sign up
        </a>
      </p>
    </main>
  );
}
