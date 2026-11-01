import { Title } from '@solidjs/meta';
import { useIsRouting } from '@solidjs/router';
import type { JSX } from '@solidjs/web';
import { Show, createMemo, isPending } from 'solid-js';
import { env } from 'virtual:env/client';
import AddIcon from '~icons/ri/add-line';

import { getCurrentUser } from '~/data/session';
import { finnishNamesShown } from '~/lib/format';
import { m } from '~/paraglide/messages.js';

// What the list pages (records, people, sources, villages, parishes) share:
// the page frame, what goes beside the heading, the dimming while the list
// is on its way, the table's box and its common header cells. The edit
// pages have ./edit-page.tsx.

/** A list page: the tab title, the heading with what goes beside it (`aside`: a count, an Add button), the content. */
export default function ListPage(props: {
  title: string;
  /** The heading, when not the title (the Places pages are titled by their tab). */
  heading?: string;
  aside?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <main class="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-8">
      <Title>{`${props.title} - ${env.VITE_APP_NAME}`}</Title>
      <header class="flex flex-wrap items-center gap-2">
        <h1 class="text-2xl font-bold">{props.heading ?? props.title}</h1>
        {props.aside}
      </header>
      {props.children}
    </main>
  );
}

/** How many the list has, beside the heading. */
export function CountBadge(props: { count: number | undefined }) {
  return <span class="badge badge-sm">{props.count}</span>;
}

/** The list's Add button, at the header's right, for those who may add. */
export function AddLink(props: { href: string; label: string }) {
  return (
    <a href={props.href} class="btn ml-auto btn-sm btn-primary">
      <AddIcon class="size-4" aria-hidden="true" />
      {props.label}
    </a>
  );
}

/**
 * Whether the reader may add and edit rows: an admin. The server functions
 * check the role again, so this only decides what is offered. `name` names
 * the memo for diagnostics.
 */
export function useCanEdit(name: string): () => boolean {
  const me = createMemo(() => getCurrentUser(), { name });
  return () => !!me()?.isAdmin;
}

/**
 * Whether the list is on its way: reloading (after a save), or a link from
 * it opening the next page, so a click shows at once. The list dims
 * meanwhile (ListBody).
 */
export function useListBusy(list: () => unknown): () => boolean {
  const isRouting = useIsRouting();
  return () => isRouting() || isPending(list);
}

/** The list's content, dimmed while `busy`; with nothing to show (`count` 0 or unknown), `empty` says so instead. */
export function ListBody(props: {
  busy: boolean;
  count: number | undefined;
  empty: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <div class="transition-opacity" style={{ opacity: props.busy ? 0.5 : 1 }}>
      <Show
        when={props.count}
        fallback={<p class="py-6 text-center text-base-content/60">{props.empty}</p>}
      >
        {props.children}
      </Show>
    </div>
  );
}

/** A table in its scrolling box. */
export function TableBox(props: { children: JSX.Element }) {
  return (
    <div class="overflow-x-auto rounded-box border border-base-300">
      <table class="table table-sm">{props.children}</table>
    </div>
  );
}

/** The header cells over a row's names: the name (in Russian), and outside Russian the Finnish one too. */
export function NameHeaders() {
  return (
    <>
      <th>{finnishNamesShown() ? m.villages_col_ru() : m.villages_col_name()}</th>
      <Show when={finnishNamesShown()}>
        <th>{m.villages_col_fi()}</th>
      </Show>
    </>
  );
}

/** The header cell over the edit links (EditLinkCell), for those who may edit; `span` when the rows have more action cells. */
export function ActionsHeader(props: { when: boolean; span?: number }) {
  return (
    <Show when={props.when}>
      <th colspan={props.span}>
        <span class="sr-only">{m.records_col_actions()}</span>
      </th>
    </Show>
  );
}
