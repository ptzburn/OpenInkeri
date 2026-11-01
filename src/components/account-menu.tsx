import { Loading, Show, createMemo } from 'solid-js';
import SignInIcon from '~icons/ri/login-box-line';
import SignOutIcon from '~icons/ri/logout-box-r-line';

import UserAvatar from '~/components/user-avatar';
import { getCurrentUser, signOut } from '~/data/session';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// The sidebar's account corner: the user's avatar and name (a link to their
// account page) and Sign out, or a Sign in link. The read is the same cached
// query the pages use, so it costs no extra request. With the sidebar folded
// to its icons (app.css), only the avatar or the sign-in icon is left.
export default function AccountMenu() {
  const user = createMemo(() => getCurrentUser(), { name: 'account-menu-user' });

  return (
    <Loading fallback={<span class="loading loading-dots loading-sm" />}>
      <Show
        when={user()}
        fallback={
          <a
            class="btn btn-block btn-ghost aria-[current=page]:btn-active sidebar-collapsed:px-0"
            href={paths['sign-in']()}
            title={m.account_sign_in()}
          >
            <SignInIcon class="size-5" aria-hidden="true" />
            <span class="sidebar-collapsed:hidden">{m.account_sign_in()}</span>
          </a>
        }
      >
        {(current) => (
          <form action={signOut} method="post" class="flex items-center gap-2">
            <a
              href={paths.account()}
              title={m.account_title()}
              class="btn min-w-0 grow justify-start btn-ghost px-1 aria-[current=page]:btn-active"
            >
              <UserAvatar name={current().name} image={current().image} class="w-8" />
              <span class="truncate font-medium sidebar-collapsed:hidden">{current().name}</span>
            </a>
            <button
              type="submit"
              class="btn btn-square btn-ghost btn-sm sidebar-collapsed:hidden"
              aria-label={m.account_sign_out()}
            >
              <SignOutIcon class="size-5" aria-hidden="true" />
            </button>
          </form>
        )}
      </Show>
    </Loading>
  );
}
