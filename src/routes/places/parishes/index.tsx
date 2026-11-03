import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo, createSignal } from 'solid-js';
import ArrowIcon from '~icons/ri/arrow-right-s-line';

import type { QueryData } from '~/lib/query-data';
import { finnishNamesShown } from '~/lib/format';
import { MapPage } from '~/components/edit-page';
import MapPanel from '~/components/map-panel';
import { ListBody, useCanEdit, useListBusy } from '~/components/list-page';
import {
  MapListFoot,
  MapListHead,
  MapListRow,
  PlacesMap,
  scrollToRow,
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
 * The parishes: the map is the page, the list its panel (MapPanel). A
 * parish picked, in the list or by a dot of its own (a locality of it, or
 * its church), is drawn plain on the map, the others faint, and framed.
 */
export default function Parishes() {
  const list = createMemo((): Promise<QueryData<typeof getParishes>> => getParishes(), {
    name: 'parishes-list',
  });
  const busy = useListBusy(list);
  const canEdit = useCanEdit('parishes-me');
  const [selected, setSelected] = createSignal<number | null>(null, { name: 'parishes-selected' });
  let rows: HTMLUListElement | undefined;

  return (
    <MapPage title={m.parishes_title()}>
      <MapPanel
        title={m.parishes_title()}
        sheet={m.parishes_sheet()}
        hint={`${m.parishes_map_hint()} ${m.parish_edit_map_legend()}`}
        map={(mapClass) => (
          <PlacesMap
            class={mapClass}
            highlight={selected()}
            onSelect={(marker) => {
              const parish = marker.church?.id ?? marker.parishId;
              if (parish === null) return;
              setSelected(parish);
              scrollToRow(rows, parish);
            }}
          />
        )}
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
            <For each={list() ?? []} keyed={(parish) => parish.id}>
              {(parish) => (
                <ParishListRow
                  parish={parish()}
                  selected={selected() === parish().id}
                  onSelect={() => setSelected(parish().id)}
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
  onSelect: () => void;
  editHref?: string;
}) {
  return (
    <MapListRow
      id={props.parish.id}
      selected={props.selected}
      onSelect={props.onSelect}
      editHref={props.editHref}
      editLabel={m.parish_edit_open()}
      actions={
        <Show when={props.parish.villages}>
          <a
            href={villagesOf(props.parish)}
            class="btn btn-square btn-ghost btn-sm"
            aria-label={m.parishes_show_villages({ parish: props.parish.nameRu })}
            title={m.parishes_show_villages({ parish: props.parish.nameRu })}
          >
            <ArrowIcon class="size-4" aria-hidden="true" />
          </a>
        </Show>
      }
    >
      <span>
        <span class="font-medium">{props.parish.nameRu}</span>
        <Show when={finnishNamesShown() && props.parish.nameFi}>
          {(fi) => <span class="text-base-content/60"> · {fi()}</span>}
        </Show>
      </span>
      <span class="text-xs text-base-content/60">
        {m.parish_delete_villages({ count: props.parish.villages })} ·{' '}
        {m.parish_delete_sources({ count: props.parish.sources })}
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
