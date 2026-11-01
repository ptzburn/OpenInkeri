import { useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { createMemo } from 'solid-js';

import type { QueryData } from '~/lib/query-data';
import ListPage, { CountBadge, ListBody, useListBusy } from '~/components/list-page';
import Pagination from '~/components/pagination';
import PeopleTable from '~/components/people-table';
import SearchBox from '~/components/search-box';
import { getPeople } from '~/data/people';
import { stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

const pageNumber = (page: string | undefined) => Number(page) || 1;

// Signed-in users only: getPeople redirects a signed-out visitor to sign-in
// (src/data/people.ts). ?q= is the search and ?page= the page, so both
// survive reloads and can be shared. People are made from mentions in the
// record form, so there is no Add button here.
export const route = defineFileRoute('/people/', {
  search: stringParams('q', 'page'),
  preload: ({ location }) => {
    const { q, page } = location.query;
    const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
    void getPeople(text(q) ?? '', pageNumber(text(page)));
  },
});

export default function People() {
  const [search, setSearch] = useSearchParams(paths.people);
  const list = createMemo(
    (): Promise<QueryData<typeof getPeople>> => getPeople(search.q ?? '', pageNumber(search.page)),
    { name: 'people-list' },
  );
  const busy = useListBusy(list);

  // A search goes in the URL in place of the current entry, from page 1.
  const searchFor = (value: string) =>
    setSearch({ q: value || undefined, page: undefined }, { replace: true });
  const pageLink = (page: number) =>
    paths.people({ q: search.q, page: page > 1 ? String(page) : undefined });

  return (
    <ListPage title={m.people_title()} aside={<CountBadge count={list()?.total} />}>
      <p class="max-w-3xl text-sm text-base-content/70">{m.people_intro()}</p>
      <SearchBox
        value={search.q}
        onSearch={searchFor}
        name="people-search-input"
        label={m.people_search_label()}
        placeholder={m.people_search_placeholder()}
        class="max-w-md"
      />
      <ListBody
        busy={busy()}
        count={list()?.people.length}
        empty={search.q ? m.people_no_match({ search: search.q }) : m.people_empty()}
      >
        <PeopleTable people={list()?.people ?? []} />
        <Pagination
          page={list()?.page ?? 1}
          pages={list()?.pages ?? 1}
          link={pageLink}
          label={m.people_pagination_label()}
        />
      </ListBody>
    </ListPage>
  );
}
