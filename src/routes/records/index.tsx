import { Title } from '@solidjs/meta';
import { useSearchParams } from '@solidjs/router';
import type { JSX } from '@solidjs/web';
import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo, isPending } from 'solid-js';
import { env } from 'virtual:env/client';
import PreviousIcon from '~icons/ri/arrow-left-s-line';
import NextIcon from '~icons/ri/arrow-right-s-line';
import AddIcon from '~icons/ri/add-line';

import type { QueryData } from '~/lib/query-data';
import { recordKindLabels } from '~/components/labels';
import EditLinkCell from '~/components/edit-link-cell';
import SearchBox from '~/components/search-box';
import { getCurrentUser } from '~/data/session';
import { formatPartialDate, localName, localTerm } from '~/lib/format';
import { type RecordKind, isRecordKind, recordKinds } from '~/lib/record-kinds';
import { type RecordRow, getRecords } from '~/data/records';
import { stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

const pageNumber = (page: string | undefined) => Number(page) || 1;
// Baptisms unless ?kind= names another kind.
const kindOf = (kind: string | undefined): RecordKind => (isRecordKind(kind) ? kind : 'baptisms');

// Signed-in users only: getRecords redirects a signed-out visitor to
// sign-in (src/data/records.ts). ?kind= is the kind of record, ?q= the search
// and ?page= the page, so all survive reloads and can be shared.
export const route = defineFileRoute('/records/', {
  search: stringParams('kind', 'q', 'page'),
  preload: ({ location }) => {
    const { kind, q, page } = location.query;
    const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
    void getRecords(kindOf(text(kind)), text(q) ?? '', pageNumber(text(page)));
  },
});

export default function Records() {
  const [search, setSearch] = useSearchParams(paths.records);
  const kind = createMemo(() => kindOf(search.kind), { name: 'records-kind' });
  const list = createMemo(
    (): Promise<QueryData<typeof getRecords>> =>
      getRecords(kind(), search.q ?? '', pageNumber(search.page)),
    { name: 'records-list' },
  );
  // Admins edit records on their edit page; the server functions check the
  // role again, so this only decides what is offered.
  const me = createMemo(() => getCurrentUser(), { name: 'records-me' });
  const canEdit = () => !!me()?.isAdmin;

  // A search goes in the URL in place of the current entry, from page 1.
  const searchFor = (value: string) =>
    setSearch({ q: value || undefined, page: undefined }, { replace: true });

  // Links keep the search; baptisms, the default kind, and page 1 stay out
  // of the URL.
  const link = (to: RecordKind, page = 1) =>
    paths.records({
      kind: to === 'baptisms' ? undefined : to,
      q: search.q,
      page: page > 1 ? String(page) : undefined,
    });
  const pageLink = (page: number) => link(kind(), page);

  return (
    <main class="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-8">
      <Title>{`${m.records_title()} - ${env.VITE_APP_NAME}`}</Title>
      <header class="flex flex-wrap items-center gap-2">
        <h1 class="text-2xl font-bold">{m.records_title()}</h1>
        <span class="badge badge-sm">{list()?.total}</span>
        {/* A new record of the open tab's type; the list's place rides
            along for Cancel. */}
        <Show when={canEdit()}>
          <a
            href={paths.records.new({ kind: search.kind, q: search.q, page: search.page })}
            class="btn ml-auto btn-sm btn-primary"
          >
            <AddIcon class="size-4" aria-hidden="true" />
            {m.records_add()}
          </a>
        </Show>
      </header>
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
      </SearchBox>
      <div class="transition-opacity" style={{ opacity: isPending(list) ? 0.5 : 1 }}>
        <Show
          when={list()?.records.length}
          fallback={
            <p class="py-6 text-center text-base-content/60">
              {!list()?.counts[kind()]
                ? m.records_kind_empty()
                : search.q
                  ? m.records_no_match({ search: search.q })
                  : m.records_empty()}
            </p>
          }
        >
          <div class="overflow-x-auto rounded-box border border-base-300">
            <table class="table table-sm">
              <thead>
                <tr>
                  <For each={columns[kind()]}>{(label) => <th>{label()}</th>}</For>
                  <Show when={canEdit()}>
                    <th>
                      <span class="sr-only">{m.records_col_actions()}</span>
                    </th>
                  </Show>
                </tr>
              </thead>
              <tbody>
                {/* Keyed by id: a row already shown keeps its DOM across pages
                    and searches. */}
                <For each={list()?.records ?? []} keyed={(row) => row.id}>
                  {(row) => (
                    <RecordTableRow
                      kind={kind()}
                      row={row()}
                      // The link carries the list's place, to return to it.
                      editHref={
                        canEdit()
                          ? paths
                              .records(row().id)
                              .edit({ kind: search.kind, q: search.q, page: search.page })
                          : undefined
                      }
                    />
                  )}
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

// The columns of each kind's table, before the edit link's.
const columns: Record<RecordKind, (() => string)[]> = {
  baptisms: [
    m.records_col_born,
    m.records_col_baptised,
    m.records_col_child,
    m.records_col_father,
    m.records_col_mother,
    m.records_col_village,
    m.records_col_note,
  ],
  marriages: [m.records_col_married, m.records_col_groom, m.records_col_bride, m.records_col_note],
  deaths: [
    m.records_col_died,
    m.records_col_buried,
    m.records_col_deceased,
    m.records_col_age,
    m.records_col_death_place,
    m.records_col_cause,
    m.records_col_note,
  ],
  households: [m.records_col_village, m.records_col_household, m.records_col_people],
  taxpayers: [
    m.records_col_estate,
    m.records_col_village,
    m.records_col_farm,
    m.records_col_people,
  ],
};

function RecordTableRow(props: { kind: RecordKind; row: RecordRow; editHref?: string }) {
  const date = (value: string | null) => (
    <td class="tabular-nums whitespace-nowrap">{formatPartialDate(value)}</td>
  );
  const lost = () => (
    <Show when={props.row.lost}>
      <span class="badge shrink-0 badge-soft badge-sm whitespace-nowrap">{m.records_lost()}</span>
    </Show>
  );
  const stillborn = () => (
    <Show when={props.row.stillborn}>
      <span class="text-base-content/60 italic">{m.records_stillborn()}</span>
    </Show>
  );
  const note = () => (
    <td class="max-w-64 truncate text-base-content/70" title={props.row.note ?? undefined}>
      {props.row.note}
    </td>
  );

  return (
    <tr class={props.row.lost ? 'text-base-content/50' : undefined}>
      <Show when={props.kind === 'baptisms'}>
        {date(props.row.birthDate)}
        {date(props.row.date)}
        <td>
          <div class="flex flex-wrap items-center gap-1">
            {lost()}
            {stillborn()}
            <span class="font-medium">{localName(props.row.child)}</span>
            <Show when={props.row.multipleBirth}>
              {(count) => (
                <span class="badge shrink-0 badge-soft badge-sm whitespace-nowrap badge-info">
                  {count() >= 3 ? m.records_triplets() : m.records_twins()}
                </span>
              )}
            </Show>
            <Show when={props.row.illegitimate}>
              <span class="badge shrink-0 badge-outline badge-sm whitespace-nowrap">
                {m.records_illegitimate()}
              </span>
            </Show>
          </div>
        </td>
        <td>{localName(props.row.father)}</td>
        <td>{localName(props.row.mother)}</td>
        <td>
          <Place place={props.row.village} asWritten={props.row.villageAsWritten} />
        </td>
        {note()}
      </Show>
      <Show when={props.kind === 'marriages'}>
        {date(props.row.date)}
        <td>
          {lost()}
          <Spouse person={props.row.groom} />
        </td>
        <td>
          <Spouse person={props.row.bride} />
        </td>
        {note()}
      </Show>
      <Show when={props.kind === 'deaths'}>
        {date(props.row.date)}
        {date(props.row.burialDate)}
        <td>
          <div class="flex flex-wrap items-center gap-1">
            {lost()}
            {stillborn()}
            <span class="font-medium">{localName(props.row.deceased)}</span>
          </div>
        </td>
        <td class="whitespace-nowrap">{props.row.deceased?.age}</td>
        <td>
          <Place place={props.row.village} asWritten={props.row.villageAsWritten} />
        </td>
        <td>{props.row.cause}</td>
        {note()}
      </Show>
      <Show when={props.kind === 'households'}>
        <td>
          {lost()}
          <Place place={props.row.village} asWritten={props.row.villageAsWritten} />
        </td>
        <td class="tabular-nums">{props.row.holding?.holdingNo}</td>
        <td>
          <Members members={props.row.members} />
        </td>
      </Show>
      <Show when={props.kind === 'taxpayers'}>
        <td>{props.row.holding?.estateText}</td>
        <td>
          {lost()}
          <Place place={props.row.village} asWritten={props.row.villageAsWritten} />
        </td>
        <td class="tabular-nums">{props.row.holding?.holdingNo}</td>
        <td>
          <Members members={props.row.members} />
        </td>
      </Show>
      <EditLinkCell href={props.editHref} label={m.record_edit_open()} />
    </tr>
  );
}

type Names = { ru: string | null; fi: string | null };

// The canonical place; the spelling in the source shows on hover when it
// differs, and stands in for the place when none was resolved.
function Place(props: { place: Names | null; asWritten: string | null }) {
  return (
    <span
      title={
        props.asWritten && props.asWritten !== props.place?.ru
          ? m.records_as_written({ text: props.asWritten })
          : undefined
      }
    >
      {localName(props.place) || props.asWritten}
    </span>
  );
}

// A bride or groom: the name, then their age and where they lived.
function Spouse(props: { person: RecordRow['groom'] }) {
  return (
    <Show when={props.person}>
      {(p) => (
        <div class="flex flex-col">
          <span class="font-medium">{localName(p())}</span>
          <span class="text-xs text-base-content/60">
            <Show when={p().age}>{(age) => m.records_age({ age: age() })}</Show>
            <Show when={p().age && (p().residence || p().residenceAsWritten)}> · </Show>
            <Place place={p().residence} asWritten={p().residenceAsWritten} />
          </span>
        </div>
      )}
    </Show>
  );
}

// A household's or farm's people, one a line: the name, how they belong to
// it, and what the list says of them.
function Members(props: { members: RecordRow['members'] }) {
  return (
    <ul class="flex flex-col gap-0.5">
      <For each={props.members} keyed={(p) => p.id}>
        {(p) => (
          <li>
            <span class="font-medium">{localName(p())}</span>
            <Show when={localTerm(p().relation) || p().relationAsWritten}>
              {(relation) => (
                <span
                  class="text-base-content/60"
                  title={
                    p().relation && p().relationAsWritten !== p().relation?.ru
                      ? (p().relationAsWritten ?? undefined)
                      : undefined
                  }
                >
                  {` — ${relation()}`}
                </span>
              )}
            </Show>
            <Show when={p().hasWife}>
              <span class="text-base-content/60">{`, ${m.records_with_wife()}`}</span>
            </Show>
            <Show when={p().birthDate || p().deathDate}>
              <span class="text-xs whitespace-nowrap text-base-content/60 tabular-nums">
                {` · ${formatPartialDate(p().birthDate)} – ${formatPartialDate(p().deathDate)}`}
              </span>
            </Show>
            <Show when={p().note}>
              {(note) => <span class="block text-xs text-base-content/60">{note()}</span>}
            </Show>
          </li>
        )}
      </For>
    </ul>
  );
}
