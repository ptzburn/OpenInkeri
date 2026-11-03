import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo, createSignal } from 'solid-js';
import ArrowIcon from '~icons/ri/arrow-right-s-line';

import type { QueryData } from '~/lib/query-data';
import { byLocalName, localName, namesOf } from '~/lib/format';
import { MapPage } from '~/components/edit-page';
import MapPanel from '~/components/map-panel';
import { ListBody, useCanEdit, useListBusy } from '~/components/list-page';
import {
  MapListFoot,
  MapListHead,
  MapListRow,
  RowNames,
  parishMarkers,
  scrollToRow,
  usePlacesMap,
} from '~/components/places-map';
import { type ParishRow, getParishes } from '~/data/parishes';
import { getPlaceMarkers } from '~/data/places';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import type { Crumbs } from '~/lib/breadcrumbs';

// Signed-in users only: getParishes redirects a signed-out visitor to
// sign-in (src/data/parishes.ts). A few dozen parishes at most: no search
// and no pages.
const crumbs: Crumbs = () => [{ label: m.parishes_title() }];

export const route = defineFileRoute('/places/parishes/', {
  info: { crumbs },
  preload: () => {
    void getParishes();
    void getPlaceMarkers();
  },
});

// The villages list narrowed to a parish.
const villagesOf = (parish: ParishRow) => paths.places.villages({ parish: String(parish.id) });

/**
 * The parishes: the map is the page, the list its panel (MapPanel). Only
 * parishes are on the map, a cross each (parishMarkers), until one is
 * picked, in the list or by its cross: then its localities show around it,
 * framed, and the other parishes go faint.
 */
export default function Parishes() {
  const list = createMemo((): Promise<QueryData<typeof getParishes>> => getParishes(), {
    name: 'parishes-list',
  });
  // By the name the list shows.
  const sorted = createMemo(() => [...(list() ?? [])].sort(byLocalName), {
    name: 'parishes-sorted',
  });
  const busy = useListBusy(list);
  const canEdit = useCanEdit('parishes-me');
  const [selected, setSelected] = createSignal<number | null>(null, { name: 'parishes-selected' });
  // The parish whose row is pointed at: its cross is named on the map.
  const [pointed, setPointed] = createSignal<number | null>(null, { name: 'parishes-pointed' });
  let rows: HTMLUListElement | undefined;
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
    // The crosses, and the localities of the parish picked as dots.
    get markers() {
      const parish = selected();
      const all = crosses();
      if (parish === null) return all;
      const drawn = new Set(all.map((cross) => cross.id));
      const own = (located() ?? [])
        .filter((n) => n.parishId === parish && !drawn.has(n.id))
        .map((n) => ({ ...n, church: null }));
      return [...all, ...own];
    },
    get highlight() {
      return selected();
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
        hint={`${m.parishes_map_hint()} ${m.parishes_map_legend()}`}
        head={<MapListHead current="parishes" />}
        foot={
          canEdit() ? (
            <MapListFoot href={paths.places.parishes.new()} label={m.parishes_add()} />
          ) : undefined
        }
        bodyClass="p-2"
      >
        <ListBody busy={busy()} count={list()?.length} empty={m.parishes_empty()}>
          <ul ref={(el) => (rows = el)} class="list">
            <For each={sorted()} keyed={(parish) => parish.id}>
              {(parish) => (
                <ParishListRow
                  parish={parish()}
                  selected={selected() === parish().id}
                  onMap={!located() || onMap().has(parish().id)}
                  onSelect={() => setSelected(parish().id)}
                  onPoint={(on) => setPointed(on ? parish().id : null)}
                  editHref={canEdit() ? paths.places.parishes(parish().id).edit() : undefined}
                />
              )}
            </For>
          </ul>
        </ListBody>
      </MapPanel>
    </MapPage>
  );
}

/** A parish in the list: its names, what belongs to it and its note; its localities a link away. */
function ParishListRow(props: {
  parish: ParishRow;
  selected: boolean;
  /** Whether the map has its cross; a row without one says so. */
  onMap: boolean;
  onSelect: () => void;
  onPoint: (on: boolean) => void;
  editHref?: string;
}) {
  return (
    <MapListRow
      id={props.parish.id}
      selected={props.selected}
      onSelect={props.onSelect}
      onPoint={props.onPoint}
      editHref={props.editHref}
      editLabel={m.parish_edit_open()}
      actions={
        <Show when={props.parish.villages}>
          <a
            href={villagesOf(props.parish)}
            class="btn btn-square btn-ghost btn-sm"
            aria-label={m.parishes_show_villages({ parish: localName(namesOf(props.parish)) })}
            title={m.parishes_show_villages({ parish: localName(namesOf(props.parish)) })}
          >
            <ArrowIcon class="size-4" aria-hidden="true" />
          </a>
        </Show>
      }
    >
      <RowNames names={namesOf(props.parish)} />
      <span class="text-xs text-base-content/60">
        {m.parish_delete_villages({ count: props.parish.villages })} ·{' '}
        {m.parish_delete_sources({ count: props.parish.sources })}
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
