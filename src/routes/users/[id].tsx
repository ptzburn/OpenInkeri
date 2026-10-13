import { Title } from '@solidjs/meta';
import { type RouteDefinition, type RouteProps, useSubmissions } from '@solidjs/router';
import { Show, createMemo, isPending } from 'solid-js';

import { getCurrentUser } from '~/lib/account';
import { getUser, renameMe } from '~/lib/users';

// The preload starts these fetches as navigation begins — and it doubles as
// the page's single-flight manifest: after the rename mutation, the server
// reruns it to put the refreshed data on the action response itself.
export const route = {
  preload: ({ params }) => {
    void getUser(params.id!);
    void getCurrentUser();
  },
} satisfies RouteDefinition;

export default function User(props: RouteProps<'/users/:id'>) {
  // Server-function reads through memos — the surrounding <Loading>
  // boundary (in app.tsx) shows its fallback until the promises settle.
  const user = createMemo(() => getUser(props.params.id));
  const me = createMemo(() => getCurrentUser());
  const renames = useSubmissions(renameMe);
  const error = () => (renames.at(-1)?.error as { message?: string } | undefined)?.message;

  return (
    <Show when={user()} fallback={<p>No such user.</p>}>
      {(shown) => (
        <section class="transition-opacity" style={{ opacity: isPending(user) ? 0.5 : 1 }}>
          <Title>{`${shown().name} - Solid App`}</Title>
          <h2 class="text-2xl font-semibold">{shown().name}</h2>
          <p class="mt-1 text-base-content/70">
            Joined {new Date(shown().createdAt).toLocaleDateString('en')}
          </p>
          {/* Only on your own page: the server enforces that too, since
              renameMe only ever renames the signed-in user. */}
          <Show when={me()?.id === shown().id}>
            <form action={renameMe} method="post" class="join mt-6">
              <input
                name="name"
                value={shown().name}
                required
                maxlength={100}
                class="input join-item"
                aria-label="Name"
              />
              <button type="submit" class="btn btn-primary join-item">
                Rename
              </button>
            </form>
            <Show when={error()}>
              {(message) => (
                <p role="alert" class="mt-2 text-error">
                  {message()}
                </p>
              )}
            </Show>
          </Show>
        </section>
      )}
    </Show>
  );
}
