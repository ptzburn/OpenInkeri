import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';
import PreviousIcon from '~icons/ri/arrow-left-s-line';
import NextIcon from '~icons/ri/arrow-right-s-line';

import { m } from '~/paraglide/messages.js';

/**
 * A long list's previous and next links around "page 2 of 7"; nothing when
 * it has a single page. `link` builds a page's URL (keeping the list's
 * search and filters).
 */
export default function Pagination(props: {
  page: number;
  pages: number;
  link: (page: number) => string;
  label: string;
}) {
  return (
    <Show when={props.pages > 1}>
      <nav aria-label={props.label} class="mt-4 flex items-center justify-center gap-4">
        <div class="join">
          <PageLink
            href={props.link(props.page - 1)}
            disabled={props.page <= 1}
            label={m.records_previous()}
          >
            <PreviousIcon class="size-5" aria-hidden="true" />
          </PageLink>
          <span class="join-item btn pointer-events-none btn-sm">
            {m.records_page_of({ page: props.page, pages: props.pages })}
          </span>
          <PageLink
            href={props.link(props.page + 1)}
            disabled={props.page >= props.pages}
            label={m.records_next()}
          >
            <NextIcon class="size-5" aria-hidden="true" />
          </PageLink>
        </div>
      </nav>
    </Show>
  );
}

function PageLink(props: {
  href: string;
  disabled: boolean;
  label: string;
  children: JSX.Element;
}) {
  return (
    <Show
      when={!props.disabled}
      fallback={
        <span
          class="join-item btn btn-disabled btn-sm"
          aria-disabled="true"
          aria-label={props.label}
        >
          {props.children}
        </span>
      }
    >
      <a href={props.href} class="join-item btn btn-sm" aria-label={props.label}>
        {props.children}
      </a>
    </Show>
  );
}
