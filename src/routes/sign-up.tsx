import { Title } from '@solidjs/meta';
import { useSearchParams, useSubmissions } from '@solidjs/router';
import { Show } from 'solid-js';

import Field from '../components/field';
import { type AccountError, safeNext, signUp } from '../lib/account';

export default function SignUp() {
  const [search] = useSearchParams();
  const submissions = useSubmissions(signUp);
  const error = () => submissions.at(-1)?.error as AccountError | undefined;
  const next = () => safeNext(search.next) ?? '';

  return (
    <main class="mx-auto max-w-sm text-left">
      <Title>Sign up - Solid App</Title>
      <h1 class="my-6 text-center text-4xl font-bold">Create an account</h1>
      <form method="post" action={signUp} class="flex flex-col gap-4">
        <input type="hidden" name="next" value={next()} />
        <Show when={error()?.message}>
          {(message) => (
            <div role="alert" class="alert alert-error alert-soft">
              {message()}
            </div>
          )}
        </Show>
        <Field
          label="Name"
          name="name"
          autocomplete="name"
          required
          maxlength={100}
          error={error()?.issues?.name}
        />
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
          autocomplete="new-password"
          required
          minlength={8}
          maxlength={128}
          error={error()?.issues?.password}
        />
        <button type="submit" class="btn btn-primary">
          Sign up
        </button>
      </form>
      <p class="mt-6 text-center">
        Already have an account?{' '}
        <a
          class="link link-primary"
          href={`/sign-in${next() ? `?next=${encodeURIComponent(next())}` : ''}`}
        >
          Sign in
        </a>
      </p>
    </main>
  );
}
