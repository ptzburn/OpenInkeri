import { useLocation } from '@solidjs/router';
import { Loading, Show, createMemo } from 'solid-js';

import { getCurrentUser, signOut } from '~/lib/account';

// The navbar's account corner: the user's name and Sign out, or a Sign in
// link that brings them back to this page afterwards. The read is the same
// cached query the pages use, so it costs no extra request.
export default function AccountMenu() {
  const user = createMemo(() => getCurrentUser());
  const location = useLocation();

  return (
    <Loading fallback={<span class="loading loading-dots loading-sm" />}>
      <Show
        when={user()}
        fallback={
          <a
            class="btn btn-ghost aria-[current=page]:btn-active"
            href={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`}
          >
            Sign in
          </a>
        }
      >
        {(current) => (
          <form action={signOut} method="post" class="flex items-center gap-2">
            <span class="max-w-40 truncate">{current().name}</span>
            <button type="submit" class="btn btn-ghost btn-sm">
              Sign out
            </button>
          </form>
        )}
      </Show>
    </Loading>
  );
}
