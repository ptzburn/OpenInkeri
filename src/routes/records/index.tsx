import { useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo } from 'solid-js';

import type { QueryData } from '~/lib/query-data';
import { recordKindLabels } from '~/components/labels';
import ListPage, { CountBadge, ListBody, useCanEdit, useListBusy } from '~/components/list-page';
import RecordTable from '~/components/record-table';
import Pagination from '~/components/pagination';
import SearchBox from '~/components/search-box';
import { type RecordKind, isRecordKind, recordKinds } from '~/lib/record-kinds';
import { getRecords } from '~/data/records';
import { idParam, stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import type { Crumbs } from '~/lib/breadcrumbs';

const pageNumber = (page: string | undefined) => Number(page) || 1;
// Baptisms unless ?kind= names another kind.
const kindOf = (kind: string | undefined): RecordKind => (isRecordKind(kind) ? kind : 'baptisms');

// Signed-in users only: getRecords redirects a signed-out visitor to
// sign-in (src/data/records.ts). ?kind= is the kind of record, ?source= the
// source of that kind the list is narrowed to (the sources list links
// there), ?q= the search and ?page= the page, so all survive reloads and
// can be shared.
const crumbs: Crumbs = () => [{ label: m.records_title() }];

export const route = defineFileRoute('/records/', {
  info: { crumbs },
  search: stringParams('kind', 'q', 'page', 'source'),
  preload: ({ location }) => {
    const { kind, q, page, source } = location.query;
    const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
    void getRecords(
      kindOf(text(kind)),
      text(q) ?? '',
      pageNumber(text(page)),
      idParam(text(source)),
    );
  },
});

export default function Records() {
  const [search, setSearch] = useSearchParams(paths.records);
  const kind = createMemo(() => kindOf(search.kind), { name: 'records-kind' });
  const list = createMemo(
    (): Promise<QueryData<typeof getRecords>> =>
      getRecords(kind(), search.q ?? '', pageNumber(search.page), idParam(search.source)),
    { name: 'records-list' },
  );
  const busy = useListBusy(list);
  const canEdit = useCanEdit('records-me');

  // A search goes in the URL in place of the current entry, from page 1.
  const searchFor = (value: string) =>
    setSearch({ q: value || undefined, page: undefined }, { replace: true });

  // Links keep the search; baptisms, the default kind, and page 1 stay out
  // of the URL. Pages keep the source too; another kind's tab has none of
  // its records.
  const link = (to: RecordKind, page = 1) =>
    paths.records({
      kind: to === 'baptisms' ? undefined : to,
      q: search.q,
      page: page > 1 ? String(page) : undefined,
      source: to === kind() ? search.source : undefined,
    });
  const pageLink = (page: number) => link(kind(), page);
  // Where the edit pages return to: this list as it is now.
  const listPlace = () => ({
    kind: search.kind,
    q: search.q,
    page: search.page,
    source: search.source,
  });

  return (
    <ListPage
      title={m.records_title()}
      aside={
        // No Add record: records are transcribed beside their page's photo.
        <CountBadge count={list()?.total} />
      }
    >
      {/* Every tab links to /records, so the current one is marked by kind. */}
      <nav aria-label={m.records_kinds_label()} class="tabs tabs-border overflow-x-auto">
        <For each={recordKinds}>
          {(k) => (
            <a
              href={link(k)}
              class={['tab gap-2 whitespace-nowrap', { 'tab-active': k === kind() }]}
            >
              {recordKindLabels[k]()}
              <span class="badge badge-sm">{list()?.counts[k] ?? ''}</span>
            </a>
          )}
        </For>
      </nav>
      {/* The search form carries the kind along. */}
      <SearchBox
        value={search.q}
        onSearch={searchFor}
        name="records-search-input"
        label={m.records_search_label()}
        placeholder={m.records_search_placeholder()}
        class="max-w-md"
      >
        <Show when={kind() !== 'baptisms'}>
          <input type="hidden" name="kind" value={kind()} />
        </Show>
        <Show when={search.source}>
          {(source) => <input type="hidden" name="source" value={source()} />}
        </Show>
      </SearchBox>
      {/* The source the list is narrowed to, and the way back to all. */}
      <Show when={list()?.source}>
        {(source) => (
          <div class="flex flex-wrap items-center gap-2">
            <span class="badge gap-1 badge-soft">
              {m.records_source({ title: source().title })}
            </span>
            <a href={paths.records({ kind: search.kind, q: search.q })} class="link text-sm">
              {m.records_source_clear()}
            </a>
          </div>
        )}
      </Show>
      <ListBody
        busy={busy()}
        count={list()?.records.length}
        empty={
          !list()?.counts[kind()]
            ? m.records_kind_empty()
            : search.q
              ? m.records_no_match({ search: search.q })
              : m.records_empty()
        }
      >
        <RecordTable
          kind={kind()}
          rows={list()?.records ?? []}
          canEdit={canEdit()}
          // The link carries the list's place, to return to it.
          editHref={(row) => paths.records(row.id).edit(listPlace())}
        />
        <Pagination
          page={list()?.page ?? 1}
          pages={list()?.pages ?? 1}
          link={pageLink}
          label={m.records_pagination_label()}
        />
      </ListBody>
    </ListPage>
  );
}
