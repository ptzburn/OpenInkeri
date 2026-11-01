import { useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo } from 'solid-js';
import { dynamic } from '@solidjs/web';
import TwinsIcon from '~icons/ri/group-line';
import TripletsIcon from '~icons/ri/team-line';
import UnwedIcon from '~icons/ri/link-unlink';

import type { QueryData } from '~/lib/query-data';
import { recordKindLabels } from '~/components/labels';
import EditLinkCell from '~/components/edit-link-cell';
import ListPage, {
  ActionsHeader,
  AddLink,
  CountBadge,
  ListBody,
  TableBox,
  useCanEdit,
  useListBusy,
} from '~/components/list-page';
import Pagination from '~/components/pagination';
import SearchBox from '~/components/search-box';
import { formatPartialDate, localName, localTerm } from '~/lib/format';
import { type RecordKind, isRecordKind, recordKinds } from '~/lib/record-kinds';
import { type RecordRow, getRecords } from '~/data/records';
import { idParam, stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

const pageNumber = (page: string | undefined) => Number(page) || 1;
// Baptisms unless ?kind= names another kind.
const kindOf = (kind: string | undefined): RecordKind => (isRecordKind(kind) ? kind : 'baptisms');

// Signed-in users only: getRecords redirects a signed-out visitor to
// sign-in (src/data/records.ts). ?kind= is the kind of record, ?source= the
// source of that kind the list is narrowed to (the sources list links
// there), ?q= the search and ?page= the page, so all survive reloads and
// can be shared.
export const route = defineFileRoute('/records/', {
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
        <>
          <CountBadge count={list()?.total} />
          {/* A new record of the open tab's type; the list's place rides
              along for Cancel. */}
          <Show when={canEdit()}>
            <AddLink href={paths.records.new(listPlace())} label={m.records_add()} />
          </Show>
        </>
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
            <span class="badge gap-1 badge-soft badge-primary">
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
        <TableBox>
          <thead>
            <tr>
              <For each={columns[kind()]}>{(label) => <th>{label()}</th>}</For>
              <ActionsHeader when={canEdit()} />
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
                  editHref={canEdit() ? paths.records(row().id).edit(listPlace()) : undefined}
                />
              )}
            </For>
          </tbody>
        </TableBox>
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

// A status shown as an icon beside the name, its meaning in the tooltip and
// the accessible name, so a row of a parish register stays one line.
function StatusIcon(props: { icon: typeof TwinsIcon; label: string; class?: string }) {
  const Icon = dynamic(() => props.icon);
  return (
    <span class={['inline-flex shrink-0 text-base-content/70', props.class]} title={props.label}>
      <Icon class="size-4" role="img" aria-label={props.label} />
    </span>
  );
}

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
                <Show
                  when={count() >= 3}
                  fallback={
                    <StatusIcon icon={TwinsIcon} label={m.records_twins()} class="text-info" />
                  }
                >
                  <StatusIcon icon={TripletsIcon} label={m.records_triplets()} class="text-info" />
                </Show>
              )}
            </Show>
            <Show when={props.row.illegitimate}>
              <StatusIcon icon={UnwedIcon} label={m.records_illegitimate()} />
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
