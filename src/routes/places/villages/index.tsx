import { useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo, createSignal } from 'solid-js';
import CloseIcon from '~icons/ri/close-line';

import type { QueryData } from '~/lib/query-data';
import { MapPage } from '~/components/edit-page';
import { ListBody, useCanEdit, useListBusy } from '~/components/list-page';
import MapPanel from '~/components/map-panel';
import SearchBox from '~/components/search-box';
import { coordinateStatusLabels, placeKindLabels } from '~/components/labels';
import {
  MapListFoot,
  MapListHead,
  MapListRow,
  RowNames,
  scrollToRow,
  usePlacesMap,
} from '~/components/places-map';
import { byLocalName, localName, namesOf } from '~/lib/format';
import { type PlaceRow, getPlaceMarkers, getPlaces } from '~/data/places';
import { stringParams } from '~/lib/route-params';
import { foldForSearch } from '~/lib/search-text';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import type { Crumbs } from '~/lib/breadcrumbs';

// Signed-in users only: getPlaces redirects a signed-out visitor to sign-in
// (src/data/places.ts). ?q= is the search and ?parish= narrows the list to
// one parish (the parishes list links there), so both survive reloads, can
// be shared, and come back after editing a village.
const crumbs: Crumbs = () => [{ label: m.villages_title() }];

export const route = defineFileRoute('/places/villages/', {
  info: { crumbs },
  search: stringParams('q', 'parish'),
  preload: () => {
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

/**
 * The localities: the map is the page, the list its panel (MapPanel). A row
 * picked flies the map to its locality; a dot clicked picks its row, and a
 * row pointed at names its dot. The search narrows the dots too and frames
 * them; the parish filter draws its parish plain and the others faint.
 */
export default function Villages() {
  const [search, setSearch] = useSearchParams(paths.places.villages);
  const list = createMemo((): Promise<QueryData<typeof getPlaces>> => getPlaces(), {
    name: 'villages-list',
  });
  const parishId = () => Number(search.parish) || null;
  // Every place, by the name the list shows.
  const sorted = createMemo(() => [...(list()?.places ?? [])].sort(byLocalName), {
    name: 'villages-sorted',
  });
  const folded = () => foldForSearch(search.q ?? '');
  // The places the search matches, in any parish: the map's dots.
  const matching = createMemo(
    () => {
      const key = folded();
      return key ? sorted().filter((p) => matches(p, key)) : sorted();
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
  // The search's matches, for the map to keep their dots alone.
  const only = createMemo(() => (search.q ? new Set(matching().map((p) => p.id)) : null), {
    name: 'villages-map-only',
  });
  // The filtered parish's name, from any of its places.
  const parishName = () => {
    const parish = parishId();
    const place = parish ? list()?.places.find((p) => p.parishId === parish) : undefined;
    return localName(place?.parish ?? null) || (search.parish ?? '');
  };
  // Where the edit pages return to: this list as it is now.
  const listPlace = () => ({ q: search.q, parish: search.parish });
  const busy = useListBusy(list);
  const canEdit = useCanEdit('villages-me');
  const [selected, setSelected] = createSignal<number | null>(null, { name: 'villages-selected' });
  const [pointed, setPointed] = createSignal<number | null>(null, { name: 'villages-pointed' });
  let rows: HTMLUListElement | undefined;

  // Only localities here: parish churches are drawn as the localities they are.
  usePlacesMap({
    plain: true,
    get only() {
      return only();
    },
    get highlight() {
      return parishId();
    },
    get target() {
      return selected();
    },
    get pointed() {
      return pointed();
    },
    onSelect: (marker) => {
      setSelected(marker.id);
      scrollToRow(rows, marker.id);
    },
  });

  // A search goes in the URL in place of the current entry.
  const searchFor = (value: string) => setSearch({ q: value || undefined }, { replace: true });

  return (
    <MapPage title={m.villages_title()}>
      <MapPanel
        title={m.villages_title()}
        sheet={m.villages_sheet()}
        hint={`${m.villages_map_hint()} ${m.villages_map_legend()}`}
        head={
          <MapListHead current="villages">
            {/* The search form carries the parish filter along. */}
            <SearchBox
              value={search.q}
              onSearch={searchFor}
              name="villages-search-input"
              label={m.villages_search_label()}
              placeholder={m.villages_search_placeholder()}
              class="flex flex-wrap items-center gap-2"
              inputClass="max-w-md"
            >
              <Show when={search.parish}>
                {(parish) => (
                  <>
                    <input type="hidden" name="parish" value={parish()} />
                    <span class="badge gap-1 badge-soft">
                      {m.villages_parish_filter({ parish: parishName() })}
                      <a
                        href={paths.places.villages({ q: search.q })}
                        aria-label={m.villages_clear_filter()}
                        title={m.villages_clear_filter()}
                      >
                        <CloseIcon class="size-4" aria-hidden="true" />
                      </a>
                    </span>
                  </>
                )}
              </Show>
              <span class="badge badge-sm">{shown().length}</span>
            </SearchBox>
          </MapListHead>
        }
        foot={
          canEdit() ? (
            <MapListFoot href={paths.places.villages.new(listPlace())} label={m.villages_add()} />
          ) : undefined
        }
        bodyClass="gap-4 p-2"
      >
        <ListBody
          busy={busy()}
          count={shown().length}
          empty={search.q ? m.villages_no_match({ search: search.q }) : m.villages_empty()}
        >
          <ul ref={(el) => (rows = el)} class="list">
            <For each={shown()} keyed={(place) => place.id}>
              {(place) => (
                <PlaceListRow
                  place={place()}
                  search={folded()}
                  showParish={!parishId()}
                  selected={selected() === place().id}
                  onSelect={() => setSelected(place().id)}
                  onPoint={(on) => setPointed(on ? place().id : null)}
                  editHref={
                    canEdit() ? paths.places.villages(place().id).edit(listPlace()) : undefined
                  }
                />
              )}
            </For>
          </ul>
        </ListBody>

        {/* For admins: the spellings to add to a village, so their records link. */}
        <Show when={canEdit() && list()?.unlinked.length}>
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
      </MapPanel>
    </MapPage>
  );
}

/**
 * A locality in the list, on one line where it fits: its names, its type
 * when it isn't a village, a mark when the map can't show it, and its
 * parish unless the list is narrowed to one. A search that found it only by
 * a spelling of it (`search`, folded) shows that spelling under it.
 */
function PlaceListRow(props: {
  place: PlaceRow;
  search: string;
  showParish: boolean;
  selected: boolean;
  onSelect: () => void;
  onPoint: (on: boolean) => void;
  editHref?: string;
}) {
  const located = () => props.place.latitude !== null && props.place.longitude !== null;
  const matched = () => {
    const key = props.search;
    const { nameRu, nameFi } = props.place;
    if (!key || [nameRu, nameFi].some((name) => name && foldForSearch(name).includes(key))) {
      return undefined;
    }
    return props.place.spellings.find((s) => foldForSearch(s).includes(key));
  };
  return (
    <MapListRow
      id={props.place.id}
      selected={props.selected}
      onSelect={props.onSelect}
      onPoint={props.onPoint}
      editHref={props.editHref}
      editLabel={m.place_edit_open()}
    >
      <RowNames names={namesOf(props.place)}>
        <Show when={props.place.kind !== 'village'}>
          <span class="badge badge-ghost badge-xs">{placeKindLabels[props.place.kind]()}</span>
        </Show>
        {/* Not on the map: picking it moves nothing there. */}
        <Show when={!located()}>
          <span class="text-xs text-warning">{coordinateStatusLabels.unknown()}</span>
        </Show>
        <Show when={props.showParish && localName(props.place.parish)}>
          {(parish) => <span class="text-xs text-base-content/60">{parish()}</span>}
        </Show>
      </RowNames>
      <Show when={matched()}>
        {(spelling) => (
          <span class="text-xs text-base-content/60">
            {m.villages_also_written({ spelling: spelling() })}
          </span>
        )}
      </Show>
    </MapListRow>
  );
}
