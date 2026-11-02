import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo, createSignal } from 'solid-js';
import ArrowIcon from '~icons/ri/arrow-right-s-line';

import type { QueryData } from '~/lib/query-data';
import { finnishNamesShown } from '~/lib/format';
import EditLinkCell from '~/components/edit-link-cell';
import { MapPage } from '~/components/edit-page';
import MapPanel from '~/components/map-panel';
import ListPage, {
  ActionsHeader,
  AddLink,
  ListBody,
  NameHeaders,
  TableBox,
  useCanEdit,
  useListBusy,
} from '~/components/list-page';
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
import { type ParishRow, getParishes } from '~/data/parishes';
import { getPlaceMarkers } from '~/data/places';
import { getPlacesView } from '~/data/places-view';
import type { PlacesView } from '~/lib/places-view';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import type { Crumbs } from '~/lib/breadcrumbs';

// Signed-in users only: getParishes redirects a signed-out visitor to
// sign-in (src/data/parishes.ts). A few dozen parishes at most: no search
// and no pages. The list shows as the panel of a map or as a table, as the
// reader chose last (its cookie).
const crumbs: Crumbs = () => [{ label: m.parishes_title() }];

export const route = defineFileRoute('/places/parishes/', {
  info: { crumbs },
  preload: () => {
    void getPlacesView();
    void getParishes();
    void getPlaceMarkers();
  },
});

/** What both views show: the parishes, and whether the reader may add and edit them. */
function useParishes() {
  const list = createMemo((): Promise<QueryData<typeof getParishes>> => getParishes(), {
    name: 'parishes-list',
  });
  return { list, busy: useListBusy(list), canEdit: useCanEdit('parishes-me') };
}
type Parishes = ReturnType<typeof useParishes>;

export default function ParishesPage() {
  const parishes = useParishes();
  const [view, setView] = usePlacesView();
  return (
    <Show when={view() === 'table'} fallback={<ParishesMap parishes={parishes} onView={setView} />}>
      <ParishesTable parishes={parishes} onView={setView} />
    </Show>
  );
}

// The villages list narrowed to a parish.
const villagesOf = (parish: ParishRow) => paths.places.villages({ parish: String(parish.id) });

/**
 * The map view: the map is the page, the parishes its panel (MapPanel). A
 * parish picked, in the list or by a dot of its own (a locality of it, or
 * its church), is drawn plain on the map, the others faint, and framed.
 */
function ParishesMap(props: { parishes: Parishes; onView: (view: PlacesView) => void }) {
  const p = () => props.parishes;
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
        head={<MapListHead current="parishes" onView={props.onView} />}
        foot={
          p().canEdit() ? (
            <MapListFoot href={paths.places.parishes.new()} label={m.parishes_add()} />
          ) : undefined
        }
        bodyClass="p-2"
      >
        <ListBody busy={p().busy()} count={p().list()?.length} empty={m.parishes_empty()}>
          <ul ref={(el) => (rows = el)} class="list">
            <For each={p().list() ?? []} keyed={(parish) => parish.id}>
              {(parish) => (
                <ParishListRow
                  parish={parish()}
                  selected={selected() === parish().id}
                  onSelect={() => setSelected(parish().id)}
                  editHref={p().canEdit() ? paths.places.parishes(parish().id).edit() : undefined}
                />
              )}
            </For>
          </ul>
        </ListBody>
      </MapPanel>
    </MapPage>
  );
}

/** A parish in the map view's list: its names, what belongs to it and its note; its localities a link away. */
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

/** The table view: the parishes' counts and notes in columns. */
function ParishesTable(props: { parishes: Parishes; onView: (view: PlacesView) => void }) {
  const p = () => props.parishes;
  const list = () => p().list();
  const busy = () => p().busy();
  const canEdit = () => p().canEdit();

  return (
    <ListPage
      title={m.parishes_title()}
      heading={m.places_title()}
      aside={
        <div class="ml-auto flex items-center gap-2">
          <ViewSwitch view="table" onView={(view) => props.onView(view)} />
          <Show when={canEdit()}>
            <AddLink href={paths.places.parishes.new()} label={m.parishes_add()} />
          </Show>
        </div>
      }
    >
      <PlacesTabs current="parishes" />
      <ListBody busy={busy()} count={list()?.length} empty={m.parishes_empty()}>
        <TableBox>
          <thead>
            <tr>
              <NameHeaders />
              <th class="text-right">{m.parishes_col_villages()}</th>
              <th class="text-right">{m.parishes_col_sources()}</th>
              <th>{m.form_note()}</th>
              <ActionsHeader when={canEdit()} />
            </tr>
          </thead>
          <tbody>
            <For each={list() ?? []} keyed={(parish) => parish.id}>
              {(parish) => (
                <ParishTableRow
                  parish={parish()}
                  editHref={canEdit() ? paths.places.parishes(parish().id).edit() : undefined}
                />
              )}
            </For>
          </tbody>
        </TableBox>
      </ListBody>
    </ListPage>
  );
}

function ParishTableRow(props: { parish: ParishRow; editHref?: string }) {
  return (
    <tr>
      <td class="font-medium">{props.parish.nameRu}</td>
      <Show when={finnishNamesShown()}>
        <td>{props.parish.nameFi}</td>
      </Show>
      {/* The count opens the villages list narrowed to this parish. */}
      <td class="text-right tabular-nums">
        <Show when={props.parish.villages} fallback={0}>
          <a
            href={villagesOf(props.parish)}
            class="link"
            title={m.parishes_show_villages({ parish: props.parish.nameRu })}
          >
            {props.parish.villages}
          </a>
        </Show>
      </td>
      <td class="text-right tabular-nums">{props.parish.sources}</td>
      <td class="max-w-64 truncate text-base-content/70" title={props.parish.note ?? undefined}>
        {props.parish.note}
      </td>
      <EditLinkCell href={props.editHref} label={m.parish_edit_open()} />
    </tr>
  );
}
