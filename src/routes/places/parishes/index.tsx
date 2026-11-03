import { useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo, createSignal } from 'solid-js';
import ArrowIcon from '~icons/ri/arrow-right-s-line';

import type { QueryData } from '~/lib/query-data';
import { byLocalName, localName, namesOf, parishInUse } from '~/lib/format';
import { MapPage } from '~/components/edit-page';
import MapPanel from '~/components/map-panel';
import SearchBox from '~/components/search-box';
import { ListBody, useCanEdit, useListBusy } from '~/components/list-page';
import {
  MapListFoot,
  MapListHead,
  MapListRow,
  type RowActions,
  RowNames,
  parishMarkers,
  scrollToRow,
  usePlacesMap,
} from '~/components/places-map';
import { type ParishRow, deleteParish, getParishes } from '~/data/parishes';
import { DeleteDialog } from '~/components/form-fields';
import { getPlaceMarkers, getPlaceTotals } from '~/data/places';
import { stringParams } from '~/lib/route-params';
import { foldForSearch } from '~/lib/search-text';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import type { Crumbs } from '~/lib/breadcrumbs';

// Signed-in users only: getParishes redirects a signed-out visitor to
// sign-in (src/data/parishes.ts). A few dozen parishes at most: the whole
// list comes at once, and ?q= searches it here by either name, so a search
// survives reloads and can be shared.
const crumbs: Crumbs = () => [{ label: m.parishes_title() }];

export const route = defineFileRoute('/places/parishes/', {
  info: { crumbs },
  search: stringParams('q'),
  preload: () => {
    void getParishes();
    void getPlaceMarkers();
    void getPlaceTotals();
  },
});

// The villages list narrowed to a parish.
const villagesOf = (parish: ParishRow) => paths.places.villages({ parish: String(parish.id) });

// A parish whose name in either language contains the search (folded: case, ё = е).
const matches = (parish: ParishRow, folded: string) =>
  [parish.nameRu, parish.nameFi].some((name) => !!name && foldForSearch(name).includes(folded));

/**
 * The parishes: the map is the page, the list its panel (MapPanel). Only
 * parishes are on the map, a cross each (parishMarkers), until one is
 * picked, in the list or by its cross: then its localities show around it,
 * framed, and the other parishes go faint. The search narrows the crosses
 * too, and frames them.
 */
export default function Parishes() {
  const [search, setSearch] = useSearchParams(paths.places.parishes);
  const list = createMemo((): Promise<QueryData<typeof getParishes>> => getParishes(), {
    name: 'parishes-list',
  });
  // By the name the list shows, as the search leaves them.
  const shown = createMemo(
    () => {
      const folded = foldForSearch(search.q ?? '');
      const all = [...(list() ?? [])].sort(byLocalName);
      return folded ? all.filter((parish) => matches(parish, folded)) : all;
    },
    { name: 'parishes-shown' },
  );
  const shownIds = createMemo(() => new Set(shown().map((parish) => parish.id)), {
    name: 'parishes-shown-ids',
  });
  // A search goes in the URL in place of the current entry.
  const searchFor = (value: string) => setSearch({ q: value || undefined }, { replace: true });
  const busy = useListBusy(list);
  const canEdit = useCanEdit('parishes-me');
  const [selected, setSelected] = createSignal<number | null>(null, { name: 'parishes-selected' });
  // The parish whose row is pointed at: its cross is named on the map.
  const [pointed, setPointed] = createSignal<number | null>(null, { name: 'parishes-pointed' });
  let rows: HTMLUListElement | undefined;
  // The parish an admin asked to delete, which the one dialog confirms.
  const [deleting, setDeleting] = createSignal<ParishRow | null>(null, {
    name: 'parishes-deleting',
  });
  let deleteDialog: HTMLDialogElement | undefined;
  const askDelete = (parish: ParishRow) => {
    setDeleting(parish);
    deleteDialog?.showModal();
  };
  const located = createMemo((): Promise<QueryData<typeof getPlaceMarkers>> => getPlaceMarkers(), {
    name: 'parishes-located',
  });
  const crosses = createMemo(() => parishMarkers(located() ?? [], list() ?? []), {
    name: 'parishes-crosses',
  });
  // The parishes with a cross; the others' rows say they aren't on the map.
  const onMap = createMemo(() => new Set(crosses().map((cross) => cross.parishId)), {
    name: 'parishes-on-map',
  });
  usePlacesMap({
    // The crosses of the parishes listed, and the localities of the parish
    // picked (while it is listed) as dots.
    get markers() {
      const parish = selected();
      const listed = shownIds();
      const all = crosses().filter(
        (cross) => cross.parishId !== null && listed.has(cross.parishId),
      );
      if (parish === null || !listed.has(parish)) return all;
      const drawn = new Set(all.map((cross) => cross.id));
      const own = (located() ?? [])
        .filter((n) => n.parishId === parish && !drawn.has(n.id))
        .map((n) => ({ ...n, church: null }));
      return [...all, ...own];
    },
    get highlight() {
      const parish = selected();
      return parish !== null && shownIds().has(parish) ? parish : null;
    },
    get pointed() {
      const parish = pointed();
      return parish === null
        ? null
        : (crosses().find((cross) => cross.church?.id === parish)?.id ?? null);
    },
    onSelect: (marker) => {
      const parish = marker.church?.id ?? marker.parishId;
      if (parish === null) return;
      setSelected(parish);
      scrollToRow(rows, parish);
    },
  });

  return (
    <MapPage title={m.parishes_title()}>
      <MapPanel
        title={m.parishes_title()}
        sheet={m.parishes_sheet()}
        head={
          <MapListHead current="parishes">
            <SearchBox
              value={search.q}
              onSearch={searchFor}
              name="parishes-search-input"
              label={m.parishes_search_label()}
              placeholder={m.parishes_search_placeholder()}
            />
            {/* How many of all a search leaves, said to screen readers as it
                changes; empty while the list is whole. */}
            <p class="sr-only" aria-live="polite">
              {search.q
                ? m.places_shown_of({ shown: shown().length, total: list()?.length ?? 0 })
                : ''}
            </p>
          </MapListHead>
        }
        foot={
          canEdit() ? (
            <MapListFoot href={paths.places.parishes.new()} label={m.parishes_add()} />
          ) : undefined
        }
        bodyClass="p-2"
      >
        <ListBody
          busy={busy()}
          count={shown().length}
          empty={search.q ? m.parishes_no_match({ search: search.q }) : m.parishes_empty()}
        >
          <ul ref={(el) => (rows = el)} class="list">
            <For each={shown()} keyed={(parish) => parish.id}>
              {(parish) => (
                <ParishListRow
                  parish={parish()}
                  selected={selected() === parish().id}
                  onMap={!located() || onMap().has(parish().id)}
                  onSelect={() => setSelected(parish().id)}
                  onPoint={(on) => setPointed(on ? parish().id : null)}
                  actions={
                    canEdit()
                      ? {
                          editHref: paths.places.parishes(parish().id).edit(),
                          edit: m.parish_edit_open(),
                          delete: m.parish_delete(),
                          onDelete: () => askDelete(parish()),
                        }
                      : undefined
                  }
                />
              )}
            </For>
          </ul>
        </ListBody>
        {/* One confirmation for the list, for the row whose menu asked. */}
        <Show when={canEdit()}>
          <DeleteDialog
            action={deleteParish}
            id={deleting()?.id ?? 0}
            version={deleting()?.version ?? 0}
            title={m.parish_delete()}
            text={m.parish_delete_text()}
            inUse={deleting() ? parishInUse(deleting()!) : undefined}
            deleted={m.parish_deleted({ name: localName(namesOf(deleting()) ?? null) })}
            ref={(el) => (deleteDialog = el)}
          />
        </Show>
      </MapPanel>
    </MapPage>
  );
}

/** A parish in the list: its names, how many localities it has and its note; picked, a link to those localities. */
function ParishListRow(props: {
  parish: ParishRow;
  selected: boolean;
  /** Whether the map has its cross; a row without one says so. */
  onMap: boolean;
  onSelect: () => void;
  onPoint: (on: boolean) => void;
  actions?: RowActions;
}) {
  return (
    <MapListRow
      id={props.parish.id}
      selected={props.selected}
      onSelect={props.onSelect}
      onPoint={props.onPoint}
      actions={props.actions}
      // Picked, with localities: the way to the list of them, the ones the
      // map can't show among them.
      more={
        props.selected && props.parish.villages ? (
          <a
            href={villagesOf(props.parish)}
            class="link inline-flex items-center gap-0.5 text-sm link-hover link-primary"
          >
            {m.parishes_show_localities({ count: props.parish.villages })}
            <ArrowIcon class="size-4" aria-hidden="true" />
          </a>
        ) : undefined
      }
    >
      <RowNames names={namesOf(props.parish)} />
      <span class="text-xs text-base-content/60">
        {m.parish_delete_villages({ count: props.parish.villages })}
        <Show when={!props.onMap}>
          {' · '}
          <span class="text-warning">{m.parishes_not_on_map()}</span>
        </Show>
      </span>
      <Show when={props.parish.note}>
        {(note) => (
          <span class="w-full truncate text-xs text-base-content/70" title={note()}>
            {note()}
          </span>
        )}
      </Show>
    </MapListRow>
  );
}
