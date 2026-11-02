import { useLocation, useRouteMatches } from '@solidjs/router';
import { For, Loading, createMemo } from 'solid-js';
import HomeIcon from '~icons/ri/map-2-line';

import type { Crumb } from '~/lib/breadcrumbs';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

/**
 * The header's breadcrumbs: Home (the sidebar's icon for it), then the
 * trail the current route gives in `info.crumbs` (src/lib/breadcrumbs.ts),
 * its last step the page itself. A page without one (Home, sign-in) shows
 * none. The nav is always there, hidden when empty, so the header renders
 * the same nodes on the server and in the browser. A phone has room for one
 * step, the way back: the page above (no Home, which the menu has, and not
 * the page itself, which its heading says); a page with nothing above shows
 * none there, and the header keeps the app's name (data-back says which).
 */
export default function Breadcrumbs() {
  const matches = useRouteMatches();
  const location = useLocation();
  const crumbs = createMemo(
    (): Crumb[] | Promise<Crumb[]> => {
      const match = matches().findLast((match) => match.route.info?.crumbs);
      const make = match?.route.info?.crumbs;
      if (!match || !make) return [];
      // The query from the URL itself, not useSearchParams: read here, in
      // the header ahead of the page, the router would set its search
      // params up under the header, and the server and the browser would
      // then number the page's hydration ids differently.
      const query = Object.fromEntries(new URLSearchParams(location.search));
      return make({ params: match.params, query });
    },
    { name: 'breadcrumbs' },
  );
  // The one step a phone shows, if any.
  const onPhone = () => crumbs().findLastIndex((crumb) => crumb.href);

  return (
    <Loading fallback={null}>
      <nav
        aria-label={m.breadcrumbs_label()}
        class={['breadcrumbs min-w-0 px-2 text-sm', { hidden: !crumbs().length }]}
        data-back={onPhone() >= 0 ? '' : undefined}
      >
        <ul>
          <li class="max-sm:hidden">
            <a href={paths()} aria-label={m.sidebar_home()}>
              <HomeIcon class="size-4" aria-hidden="true" />
            </a>
          </li>
          {/* By position: a trail made again (a refreshed name) is new
              objects for the same steps. */}
          <For each={crumbs()} keyed={false}>
            {(crumb, index) => (
              <li class={index === onPhone() ? 'max-sm:before:hidden' : 'max-sm:hidden'}>
                {crumb().href ? (
                  <a href={crumb().href}>{crumb().label}</a>
                ) : (
                  <span aria-current={index === crumbs().length - 1 ? 'page' : undefined}>
                    {crumb().label}
                  </span>
                )}
              </li>
            )}
          </For>
        </ul>
      </nav>
    </Loading>
  );
}
