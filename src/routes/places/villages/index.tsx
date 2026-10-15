import { Title } from '@solidjs/meta';
import { useIsRouting, useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo, isPending } from 'solid-js';
import { env } from 'virtual:env/client';
import AddIcon from '~icons/ri/add-line';
import CloseIcon from '~icons/ri/close-line';
import MapIcon from '~icons/ri/map-pin-2-line';

import EditLinkCell from '~/components/edit-link-cell';
import SearchBox from '~/components/search-box';
import { kindLabels, statusLabels } from '~/components/place-labels';
import PlacesTabs from '~/components/places-tabs';
import { getCurrentUser } from '~/data/session';
import { localName } from '~/lib/format';
import { mapLink } from '~/lib/place-kinds';
import { type PlaceList, type PlaceRow, getPlaces } from '~/data/places';
import { stringParams } from '~/lib/route-params';
import { foldForSearch } from '~/lib/search-text';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Signed-in users only: getPlaces redirects a signed-out visitor to sign-in
// (src/data/places.ts). ?q= is the search and ?parish= narrows the list to
// one parish (the parishes list links there), so both survive reloads, can
// be shared, and come back after editing a village.
export const route = defineFileRoute('/places/villages/', {
  search: stringParams('q', 'parish'),
  preload: () => void getPlaces(),
});

// A few hundred places: the whole list comes at once and the search
// narrows it here, by either name or any spelling (case-insensitive, ё = е).
const matches = (place: PlaceRow, folded: string) =>
  [place.nameRu, place.nameFi, ...place.spellings].some(
    (name) => !!name && foldForSearch(name).includes(folded),
  );

export default function Villages() {
  const [search, setSearch] = useSearchParams(paths.places.villages);
  const list = createMemo((): Promise<PlaceList> => getPlaces(), { name: 'villages-list' });
  const parishId = () => Number(search.parish) || null;
  const shown = createMemo(
    () => {
      const folded = foldForSearch(search.q ?? '');
      const parish = parishId();
      return (list()?.places ?? []).filter(
        (p) => (!parish || p.parishId === parish) && (!folded || matches(p, folded)),
      );
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
  // The list dims while it reloads (after a save) and while a link from
  // it is opening the next page, so a click shows at once.
  const isRouting = useIsRouting();
  const busy = () => isRouting() || isPending(list);
  // Admins add and edit villages; the server functions check the role
  // again, so this only decides what is offered.
  const me = createMemo(() => getCurrentUser(), { name: 'villages-me' });
  const canEdit = () => !!me()?.isAdmin;

  // A search goes in the URL in place of the current entry.
  const searchFor = (value: string) => setSearch({ q: value || undefined }, { replace: true });

  return (
    <main class="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-8">
      <Title>{`${m.villages_title()} - ${env.VITE_APP_NAME}`}</Title>
      <header class="flex flex-wrap items-center gap-2">
        <h1 class="text-2xl font-bold">{m.places_title()}</h1>
        <Show when={canEdit()}>
          <a href={paths.places.villages.new(listPlace())} class="btn ml-auto btn-sm btn-primary">
            <AddIcon class="size-4" aria-hidden="true" />
            {m.villages_add()}
          </a>
        </Show>
      </header>
      <PlacesTabs current="villages" />
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
              <span class="badge gap-1 badge-soft badge-primary">
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

      <div class="transition-opacity" style={{ opacity: busy() ? 0.5 : 1 }}>
        <Show
          when={shown().length}
          fallback={
            <p class="py-6 text-center text-base-content/60">
              {search.q ? m.villages_no_match({ search: search.q }) : m.villages_empty()}
            </p>
          }
        >
          <div class="overflow-x-auto rounded-box border border-base-300">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>{m.villages_col_ru()}</th>
                  <th>{m.villages_col_fi()}</th>
                  <th>{m.villages_col_parish()}</th>
                  <th>{m.villages_col_spellings()}</th>
                  <th class="text-right">{m.villages_col_records()}</th>
                  <th>{m.villages_col_coordinates()}</th>
                  <Show when={canEdit()}>
                    <th>
                      <span class="sr-only">{m.records_col_actions()}</span>
                    </th>
                  </Show>
                </tr>
              </thead>
              <tbody>
                <For each={shown()} keyed={(place) => place.id}>
                  {(place) => (
                    <PlaceTableRow
                      place={place()}
                      editHref={
                        canEdit() ? paths.places.villages(place().id).edit(listPlace()) : undefined
                      }
                    />
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>

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
    </main>
  );
}

function PlaceTableRow(props: { place: PlaceRow; editHref?: string }) {
  // The spellings that differ from the name itself.
  const spellings = () => props.place.spellings.filter((s) => s !== props.place.nameRu);
  return (
    <tr>
      <td>
        <div class="flex flex-wrap items-center gap-1">
          <span class="font-medium">{props.place.nameRu}</span>
          <Show when={props.place.kind !== 'village'}>
            <span class="badge badge-soft badge-sm whitespace-nowrap">
              {kindLabels[props.place.kind]()}
            </span>
          </Show>
        </div>
      </td>
      <td>{props.place.nameFi}</td>
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
            <span class="text-base-content/50">{statusLabels[props.place.coordinateStatus]()}</span>
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
            {statusLabels[props.place.coordinateStatus]()}
          </a>
        </Show>
      </td>
      <EditLinkCell href={props.editHref} label={m.place_edit_open()} />
    </tr>
  );
}
