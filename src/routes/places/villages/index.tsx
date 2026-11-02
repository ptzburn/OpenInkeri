import { useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo, createSignal } from 'solid-js';
import CloseIcon from '~icons/ri/close-line';
import MapIcon from '~icons/ri/map-pin-2-line';

import type { QueryData } from '~/lib/query-data';
import EditLinkCell from '~/components/edit-link-cell';
import { MapPage } from '~/components/edit-page';
import ListPage, {
  ActionsHeader,
  AddLink,
  ListBody,
  NameHeaders,
  TableBox,
  useCanEdit,
  useListBusy,
} from '~/components/list-page';
import MapPanel from '~/components/map-panel';
import SearchBox from '~/components/search-box';
import { coordinateStatusLabels, placeKindLabels } from '~/components/labels';
import PlacesTabs from '~/components/places-tabs';
import {
  MapListFoot,
  MapListHead,
  MapListRow,
  PlacesMap,
  ViewSwitch,
  scrollToRow,
  usePlacesView,
} from '~/components/places-view';
import { finnishNamesShown, localName } from '~/lib/format';
import { mapLink } from '~/lib/coordinates';
import { type PlaceRow, getPlaceMarkers, getPlaces } from '~/data/places';
import { getPlacesView } from '~/data/places-view';
import type { PlacesView } from '~/lib/places-view';
import { stringParams } from '~/lib/route-params';
import { foldForSearch } from '~/lib/search-text';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import type { Crumbs } from '~/lib/breadcrumbs';

// Signed-in users only: getPlaces redirects a signed-out visitor to sign-in
// (src/data/places.ts). ?q= is the search and ?parish= narrows the list to
// one parish (the parishes list links there), so both survive reloads, can
// be shared, and come back after editing a village. The list shows as the
// panel of a map or as a table, as the reader chose last (its cookie).
const crumbs: Crumbs = () => [{ label: m.villages_title() }];

export const route = defineFileRoute('/places/villages/', {
  info: { crumbs },
  search: stringParams('q', 'parish'),
  preload: () => {
    void getPlacesView();
    void getPlaces();
    void getPlaceMarkers();
  },
});

// A few hundred places: the whole list comes at once and the search
// narrows it here, by either name or any spelling (case-insensitive, ё = е).
const matches = (place: PlaceRow, folded: string) =>
  [place.nameRu, place.nameFi, ...place.spellings].some(
    (name) => !!name && foldForSearch(name).includes(folded),
  );

/** What both views show: the list, as the search and the parish narrow it. */
function useVillages() {
  const [search, setSearch] = useSearchParams(paths.places.villages);
  const list = createMemo((): Promise<QueryData<typeof getPlaces>> => getPlaces(), {
    name: 'villages-list',
  });
  const parishId = () => Number(search.parish) || null;
  // The places the search matches, in any parish: the map's dots.
  const matching = createMemo(
    () => {
      const folded = foldForSearch(search.q ?? '');
      const all = list()?.places ?? [];
      return folded ? all.filter((p) => matches(p, folded)) : all;
    },
    { name: 'villages-matching' },
  );
  // And of those, the ones in the parish chosen: the list's rows.
  const shown = createMemo(
    () => {
      const parish = parishId();
      return parish ? matching().filter((p) => p.parishId === parish) : matching();
    },
    { name: 'villages-shown' },
  );
  // The filtered parish's name, from any of its places.
  const parishName = () => {
    const parish = parishId();
    const place = parish ? list()?.places.find((p) => p.parishId === parish) : undefined;
    return localName(place?.parish ?? null) || (search.parish ?? '');
  };
  // Where the edit pages return to: this list as it is now.
  const listPlace = () => ({ q: search.q, parish: search.parish });
  return {
    search,
    // A search goes in the URL in place of the current entry.
    searchFor: (value: string) => setSearch({ q: value || undefined }, { replace: true }),
    list,
    parishId,
    matching,
    shown,
    parishName,
    listPlace,
    busy: useListBusy(list),
    canEdit: useCanEdit('villages-me'),
  };
}
type Villages = ReturnType<typeof useVillages>;

export default function VillagesPage() {
  const villages = useVillages();
  const [view, setView] = usePlacesView();
  return (
    <Show when={view() === 'table'} fallback={<VillagesMap villages={villages} onView={setView} />}>
      <VillagesTable villages={villages} onView={setView} />
    </Show>
  );
}

/** The search, with the parish filter it carries along and how many it shows. */
function VillagesSearch(props: { villages: Villages }) {
  const v = () => props.villages;
  return (
    <SearchBox
      value={v().search.q}
      onSearch={(value) => v().searchFor(value)}
      name="villages-search-input"
      label={m.villages_search_label()}
      placeholder={m.villages_search_placeholder()}
      class="flex flex-wrap items-center gap-2"
      inputClass="max-w-md"
    >
      <Show when={v().search.parish}>
        {(parish) => (
          <>
            <input type="hidden" name="parish" value={parish()} />
            <span class="badge gap-1 badge-soft">
              {m.villages_parish_filter({ parish: v().parishName() })}
              <a
                href={paths.places.villages({ q: v().search.q })}
                aria-label={m.villages_clear_filter()}
                title={m.villages_clear_filter()}
              >
                <CloseIcon class="size-4" aria-hidden="true" />
              </a>
            </span>
          </>
        )}
      </Show>
      <span class="badge badge-sm">{v().shown().length}</span>
    </SearchBox>
  );
}

/** For admins: the spellings to add to a village, so their records link. */
function UnlinkedSpellings(props: { villages: Villages }) {
  const list = () => props.villages.list();
  return (
    <Show when={props.villages.canEdit() && list()?.unlinked.length}>
      <details class="collapse-arrow collapse max-w-xl border border-base-300 bg-base-100">
        <summary class="collapse-title font-semibold">
          {m.villages_unlinked_title()}{' '}
          <span class="badge badge-sm">
            {list()?.unlinked.reduce((sum, u) => sum + u.records, 0)}
          </span>
        </summary>
        <div class="collapse-content flex flex-col gap-3 text-sm">
          <p class="text-base-content/70">{m.villages_unlinked_hint()}</p>
          <ul class="flex flex-wrap gap-2">
            {/* Keyed by text: a reload after a save returns new objects. */}
            <For each={list()?.unlinked ?? []} keyed={(u) => u.text}>
              {(u) => (
                <li class="badge gap-1 badge-outline">
                  {u().text}
                  <span class="text-base-content/60">{u().records}</span>
                </li>
              )}
            </For>
          </ul>
        </div>
      </details>
    </Show>
  );
}

const emptyText = (villages: Villages) =>
  villages.search.q ? m.villages_no_match({ search: villages.search.q }) : m.villages_empty();

/**
 * The map view: the map is the page, the list its panel (MapPanel). A row
 * picked flies the map to its locality; a dot clicked picks its row, and a
 * row pointed at names its dot. The search narrows the dots too and frames
 * them; the parish filter draws its parish plain and the others faint.
 */
function VillagesMap(props: { villages: Villages; onView: (view: PlacesView) => void }) {
  const v = () => props.villages;
  const [selected, setSelected] = createSignal<number | null>(null, { name: 'villages-selected' });
  const [pointed, setPointed] = createSignal<number | null>(null, { name: 'villages-pointed' });
  // The search's matches, for the map to keep their dots alone.
  const only = createMemo(
    () =>
      v().search.q
        ? new Set(
            v()
              .matching()
              .map((p) => p.id),
          )
        : null,
    { name: 'villages-map-only' },
  );
  let rows: HTMLUListElement | undefined;

  return (
    <MapPage title={m.villages_title()}>
      <MapPanel
        title={m.villages_title()}
        sheet={m.villages_sheet()}
        hint={`${m.villages_map_hint()} ${m.place_edit_map_legend()}`}
        map={(mapClass) => (
          <PlacesMap
            class={mapClass}
            only={only()}
            highlight={v().parishId()}
            target={selected()}
            pointed={pointed()}
            onSelect={(marker) => {
              setSelected(marker.id);
              scrollToRow(rows, marker.id);
            }}
          />
        )}
        head={
          <MapListHead current="villages" onView={props.onView}>
            <VillagesSearch villages={v()} />
          </MapListHead>
        }
        foot={
          v().canEdit() ? (
            <MapListFoot
              href={paths.places.villages.new(v().listPlace())}
              label={m.villages_add()}
            />
          ) : undefined
        }
        bodyClass="gap-4 p-2"
      >
        <ListBody busy={v().busy()} count={v().shown().length} empty={emptyText(v())}>
          <ul ref={(el) => (rows = el)} class="list">
            <For each={v().shown()} keyed={(place) => place.id}>
              {(place) => (
                <PlaceListRow
                  place={place()}
                  selected={selected() === place().id}
                  onSelect={() => setSelected(place().id)}
                  onPoint={(on) => setPointed(on ? place().id : null)}
                  editHref={
                    v().canEdit()
                      ? paths.places.villages(place().id).edit(v().listPlace())
                      : undefined
                  }
                />
              )}
            </For>
          </ul>
        </ListBody>
        <UnlinkedSpellings villages={v()} />
      </MapPanel>
    </MapPage>
  );
}

/** A locality in the map view's list: its names, type, parish, records and spellings. */
function PlaceListRow(props: {
  place: PlaceRow;
  selected: boolean;
  onSelect: () => void;
  onPoint: (on: boolean) => void;
  editHref?: string;
}) {
  // The spellings that differ from the name itself.
  const spellings = () => props.place.spellings.filter((s) => s !== props.place.nameRu);
  const located = () => props.place.latitude !== null && props.place.longitude !== null;
  return (
    <MapListRow
      id={props.place.id}
      selected={props.selected}
      onSelect={props.onSelect}
      onPoint={props.onPoint}
      editHref={props.editHref}
      editLabel={m.place_edit_open()}
    >
      <span>
        <span class="font-medium">{props.place.nameRu}</span>
        <Show when={finnishNamesShown() && props.place.nameFi}>
          {(fi) => <span class="text-base-content/60"> · {fi()}</span>}
        </Show>
      </span>
      <span class="text-xs text-base-content/60">
        {[
          placeKindLabels[props.place.kind](),
          localName(props.place.parish),
          m.villages_records_count({ count: props.place.records }),
        ]
          .filter(Boolean)
          .join(' · ')}
        {/* Not on the map: said, as the map can't show it. */}
        <Show when={!located()}>
          {' · '}
          <span class="text-warning">{coordinateStatusLabels.unknown()}</span>
        </Show>
      </span>
      <Show when={spellings().length}>
        <span class="flex flex-wrap gap-1 pt-0.5">
          <For each={spellings()}>
            {(s) => <span class="badge badge-ghost badge-xs whitespace-nowrap">{s}</span>}
          </For>
        </span>
      </Show>
    </MapListRow>
  );
}

/** The table view: every column, the coordinates linking out to a map. */
function VillagesTable(props: { villages: Villages; onView: (view: PlacesView) => void }) {
  const v = () => props.villages;
  return (
    <ListPage
      title={m.villages_title()}
      heading={m.places_title()}
      aside={
        <div class="ml-auto flex items-center gap-2">
          <ViewSwitch view="table" onView={(view) => props.onView(view)} />
          <Show when={v().canEdit()}>
            <AddLink href={paths.places.villages.new(v().listPlace())} label={m.villages_add()} />
          </Show>
        </div>
      }
    >
      <PlacesTabs current="villages" />
      <VillagesSearch villages={v()} />

      <ListBody busy={v().busy()} count={v().shown().length} empty={emptyText(v())}>
        <TableBox>
          <thead>
            <tr>
              <NameHeaders />
              <th>{m.villages_col_kind()}</th>
              <th>{m.villages_col_parish()}</th>
              <th>{m.villages_col_spellings()}</th>
              <th class="text-right">{m.villages_col_records()}</th>
              <th>{m.villages_col_coordinates()}</th>
              <ActionsHeader when={v().canEdit()} />
            </tr>
          </thead>
          <tbody>
            <For each={v().shown()} keyed={(place) => place.id}>
              {(place) => (
                <PlaceTableRow
                  place={place()}
                  editHref={
                    v().canEdit()
                      ? paths.places.villages(place().id).edit(v().listPlace())
                      : undefined
                  }
                />
              )}
            </For>
          </tbody>
        </TableBox>
      </ListBody>

      <UnlinkedSpellings villages={v()} />
    </ListPage>
  );
}

function PlaceTableRow(props: { place: PlaceRow; editHref?: string }) {
  // The spellings that differ from the name itself.
  const spellings = () => props.place.spellings.filter((s) => s !== props.place.nameRu);
  return (
    <tr>
      <td>
        <span class="font-medium">{props.place.nameRu}</span>
      </td>
      <Show when={finnishNamesShown()}>
        <td>{props.place.nameFi}</td>
      </Show>
      <td>{placeKindLabels[props.place.kind]()}</td>
      <td>{localName(props.place.parish)}</td>
      <td>
        <ul class="flex flex-wrap gap-1">
          <For each={spellings()}>
            {(s) => <li class="badge badge-ghost badge-sm whitespace-nowrap">{s}</li>}
          </For>
        </ul>
      </td>
      <td class="text-right tabular-nums">{props.place.records}</td>
      <td class="whitespace-nowrap">
        <Show
          when={props.place.latitude !== null && props.place.longitude !== null}
          fallback={
            <span class="text-base-content/50">
              {coordinateStatusLabels[props.place.coordinateStatus]()}
            </span>
          }
        >
          <a
            href={mapLink(props.place.latitude!, props.place.longitude!)}
            target="_blank"
            rel="noopener noreferrer"
            class="link inline-flex items-center gap-1"
            title={m.villages_show_on_map()}
          >
            <MapIcon class="size-4" aria-hidden="true" />
            {coordinateStatusLabels[props.place.coordinateStatus]()}
          </a>
        </Show>
      </td>
      <EditLinkCell href={props.editHref} label={m.place_edit_open()} />
    </tr>
  );
}
