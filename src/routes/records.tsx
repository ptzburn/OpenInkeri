import { Title } from '@solidjs/meta';
import { useSearchParams } from '@solidjs/router';
import type { JSX } from '@solidjs/web';
import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createEffect, createMemo, isPending, onSettled, untrack } from 'solid-js';
import { env } from 'virtual:env/client';
import PreviousIcon from '~icons/ri/arrow-left-s-line';
import NextIcon from '~icons/ri/arrow-right-s-line';
import SearchIcon from '~icons/ri/search-line';

import { formatPartialDate } from '~/lib/format';
import { type RecordList, type RecordRow, getRecords } from '~/lib/records';
import { stringParams } from '~/lib/search';
import { m } from '~/paraglide/messages.js';
import { getLocale } from '~/paraglide/runtime.js';
import { paths } from '~/router';

const pageNumber = (page: string | undefined) => Number(page) || 1;

// Signed-in users only: getRecords redirects a signed-out visitor to
// sign-in (src/lib/records.ts). ?q= is the search and ?page= the page, so
// both survive reloads and can be shared.
export const route = defineFileRoute('/records', {
  search: stringParams('q', 'page'),
  preload: ({ location }) => {
    const { q, page } = location.query;
    void getRecords(
      typeof q === 'string' ? q : '',
      pageNumber(typeof page === 'string' ? page : undefined),
    );
  },
});

// A name in the reader's language: the Finnish form for en and fi when the
// register gives one, the Russian otherwise.
type Names = { ru: string | null; fi: string | null } | null;
function localName(names: Names): string {
  if (!names) return '';
  const ru = getLocale() === 'ru';
  return (ru ? (names.ru ?? names.fi) : (names.fi ?? names.ru)) ?? '';
}

export default function Records() {
  const [search, setSearch] = useSearchParams(paths.records);
  const list = createMemo(
    (): Promise<RecordList> => getRecords(search.q ?? '', pageNumber(search.page)),
    { name: 'records-list' },
  );

  // Searching as you type, like the users list (src/routes/users.tsx): once
  // typing pauses, replacing the history entry, and back to the first page.
  let typing: ReturnType<typeof setTimeout> | undefined;
  const searchFor = (value: string) => {
    clearTimeout(typing);
    setSearch({ q: value || undefined, page: undefined }, { replace: true });
  };
  onSettled(() => () => clearTimeout(typing));

  // The input follows ?q only when it changed elsewhere (back/forward, a
  // link) while you aren't typing in it; see the users list for why it
  // isn't bound.
  let input: HTMLInputElement | undefined;
  const initialSearch = untrack(() => search.q ?? '');
  createEffect(
    () => search.q ?? '',
    (q) => {
      if (input && document.activeElement !== input) input.value = q;
    },
    { name: 'records-search-input' },
  );

  const pageLink = (page: number) =>
    paths.records({ q: search.q, page: page > 1 ? String(page) : undefined });

  return (
    <main class="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-8">
      <Title>{`${m.records_title()} - ${env.VITE_APP_NAME}`}</Title>
      <header class="flex items-center gap-2">
        <h1 class="text-2xl font-bold">{m.records_title()}</h1>
        <span class="badge badge-sm">{list()?.total}</span>
      </header>
      {/* A plain GET form, so searching works before JavaScript loads. */}
      <form
        role="search"
        class="max-w-md"
        onSubmit={(event) => {
          event.preventDefault();
          searchFor(new FormData(event.currentTarget).get('q') as string);
        }}
      >
        <label class="input w-full">
          <SearchIcon class="size-4 opacity-50" aria-hidden="true" />
          <input
            type="search"
            name="q"
            ref={(el) => (input = el)}
            value={initialSearch}
            placeholder={m.records_search_placeholder()}
            aria-label={m.records_search_label()}
            onInput={(event) => {
              const value = event.currentTarget.value;
              clearTimeout(typing);
              typing = setTimeout(() => searchFor(value), 300);
            }}
          />
        </label>
      </form>
      <div class="transition-opacity" style={{ opacity: isPending(list) ? 0.5 : 1 }}>
        <Show
          when={list()?.records.length}
          fallback={
            <p class="py-6 text-center text-base-content/60">
              {search.q ? m.records_no_match({ search: search.q }) : m.records_empty()}
            </p>
          }
        >
          <div class="overflow-x-auto rounded-box border border-base-300">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>{m.records_col_entry_no()}</th>
                  <th>{m.records_col_born()}</th>
                  <th>{m.records_col_baptised()}</th>
                  <th>{m.records_col_child()}</th>
                  <th>{m.records_col_father()}</th>
                  <th>{m.records_col_mother()}</th>
                  <th>{m.records_col_village()}</th>
                  <th>{m.records_col_note()}</th>
                </tr>
              </thead>
              <tbody>
                {/* Keyed by id: a row already shown keeps its DOM across pages
                    and searches. */}
                <For each={list()?.records ?? []} keyed={(row) => row.id}>
                  {(row) => <RecordTableRow row={row()} />}
                </For>
              </tbody>
            </table>
          </div>
          <Show when={(list()?.pages ?? 1) > 1}>
            <nav
              aria-label={m.records_pagination_label()}
              class="mt-4 flex items-center justify-center gap-4"
            >
              <div class="join">
                <PageLink
                  href={pageLink((list()?.page ?? 1) - 1)}
                  disabled={(list()?.page ?? 1) <= 1}
                  label={m.records_previous()}
                >
                  <PreviousIcon class="size-5" aria-hidden="true" />
                </PageLink>
                <span class="join-item btn pointer-events-none btn-sm">
                  {m.records_page_of({ page: list()?.page ?? 1, pages: list()?.pages ?? 1 })}
                </span>
                <PageLink
                  href={pageLink((list()?.page ?? 1) + 1)}
                  disabled={(list()?.page ?? 1) >= (list()?.pages ?? 1)}
                  label={m.records_next()}
                >
                  <NextIcon class="size-5" aria-hidden="true" />
                </PageLink>
              </div>
            </nav>
          </Show>
        </Show>
      </div>
    </main>
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

function RecordTableRow(props: { row: RecordRow }) {
  return (
    <tr class={props.row.lost ? 'text-base-content/50' : undefined}>
      <td class="tabular-nums">{props.row.entryNo}</td>
      <td class="tabular-nums whitespace-nowrap">{formatPartialDate(props.row.birthDate)}</td>
      <td class="tabular-nums whitespace-nowrap">{formatPartialDate(props.row.baptismDate)}</td>
      <td>
        <div class="flex flex-wrap items-center gap-1">
          <Show when={props.row.lost}>
            <span class="badge badge-soft badge-sm">{m.records_lost()}</span>
          </Show>
          <Show when={props.row.stillborn}>
            <span class="text-base-content/60 italic">{m.records_stillborn()}</span>
          </Show>
          <span class="font-medium">{localName(props.row.child)}</span>
          <Show when={props.row.multipleBirth}>
            {(count) => (
              <span class="badge badge-soft badge-sm badge-info">
                {count() >= 3 ? m.records_triplets() : m.records_twins()}
              </span>
            )}
          </Show>
          <Show when={props.row.illegitimate}>
            <span class="badge badge-outline badge-sm">{m.records_illegitimate()}</span>
          </Show>
        </div>
      </td>
      <td>{localName(props.row.father)}</td>
      <td>{localName(props.row.mother)}</td>
      <td>
        {/* The canonical village; the spelling in the register shows on hover
            when it differs. */}
        <span
          title={
            props.row.villageAsWritten && props.row.villageAsWritten !== props.row.village?.ru
              ? m.records_as_written({ text: props.row.villageAsWritten })
              : undefined
          }
        >
          {localName(props.row.village) || props.row.villageAsWritten}
        </span>
      </td>
      <td class="max-w-64 truncate text-base-content/70" title={props.row.note ?? undefined}>
        {props.row.note}
      </td>
    </tr>
  );
}
