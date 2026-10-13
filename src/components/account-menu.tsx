import { Loading, Show, createMemo } from 'solid-js';
import SignInIcon from '~icons/ri/login-box-line';
import SignOutIcon from '~icons/ri/logout-box-r-line';

import { getCurrentUser, signOut } from '~/lib/account';
import { paths } from '~/router';

// The sidebar's account corner: the user's avatar, name and Sign out, or a Sign in
// link. The read is the same cached query the pages use, so it costs no
// extra request.
export default function AccountMenu() {
  const user = createMemo(() => getCurrentUser());

  return (
    <Loading fallback={<span class="loading loading-dots loading-sm" />}>
      <Show
        when={user()}
        fallback={
          <a
            class="btn btn-block btn-ghost aria-[current=page]:btn-active"
            href={paths['sign-in']()}
          >
            <SignInIcon class="size-5" aria-hidden="true" />
            Sign in
          </a>
        }
      >
        {(current) => (
          <form action={signOut} method="post" class="flex items-center gap-2">
            <Show
              when={current().image}
              fallback={
                <div class="avatar avatar-placeholder">
                  <div class="w-8 rounded-full bg-neutral text-neutral-content">
                    <span>{current().name.charAt(0).toUpperCase()}</span>
                  </div>
                </div>
              }
            >
              {(image) => (
                <div class="avatar">
                  <div class="w-8 rounded-full">
                    <img src={image()} alt="" referrerpolicy="no-referrer" />
                  </div>
                </div>
              )}
            </Show>
            <span class="min-w-0 grow truncate font-medium">{current().name}</span>
            <button type="submit" class="btn btn-square btn-ghost btn-sm" aria-label="Sign out">
              <SignOutIcon class="size-5" aria-hidden="true" />
            </button>
          </form>
        )}
      </Show>
    </Loading>
  );
}
