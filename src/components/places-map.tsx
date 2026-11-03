import { Show, createMemo } from 'solid-js';
import type { JSX } from '@solidjs/web';
import EditIcon from '~icons/ri/pencil-line';

import type { QueryData } from '~/lib/query-data';
import LocationPicker from '~/components/location-picker';
import { AddLink } from '~/components/list-page';
import PlacesTabs from '~/components/places-tabs';
import { type PlaceMarker, getPlaceMarkers } from '~/data/places';

// What the places lists (villages and parishes) share: each is a map with
// the list as its panel (MapPanel), and these are the map, the panel's top
// and bottom, and its rows.

/**
 * The map behind a places list's panel: every located locality, parish
 * churches as crosses, `highlight` the parish drawn plain. `only`, when
 * given, keeps the dots of those localities (a search's matches) and frames
 * them. A click on a dot is handed to `onSelect`; `target` flies to a
 * locality and names it, `pointed` names it where it is.
 */
export function PlacesMap(props: {
  class: string;
  only?: Set<number> | null;
  highlight?: number | null;
  target?: number | null;
  pointed?: number | null;
  onSelect: (marker: PlaceMarker) => void;
}) {
  const markers = createMemo((): Promise<QueryData<typeof getPlaceMarkers>> => getPlaceMarkers(), {
    name: 'places-map-markers',
  });
  const shown = () => {
    const only = props.only;
    const all = markers() ?? [];
    return only ? all.filter((marker) => only.has(marker.id)) : all;
  };
  return (
    <LocationPicker
      class={props.class}
      panel
      markers={shown()}
      fit={!!props.only}
      highlight={props.highlight}
      target={props.target}
      pointed={props.pointed}
      onSelect={(id) => {
        const marker = markers()?.find((n) => n.id === id);
        if (marker) props.onSelect(marker);
      }}
    />
  );
}

/**
 * A row of a places list: `children` in a button that picks the row
 * (`selected` shows it picked; pointing at it or focusing it is told to
 * `onPoint`), then `actions`, and for admins a link to the row's edit page.
 * `id` marks the row for `scrollToRow`.
 */
export function MapListRow(props: {
  id: number;
  selected: boolean;
  onSelect: () => void;
  onPoint?: (on: boolean) => void;
  editHref?: string;
  editLabel: string;
  actions?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <li
      data-row={props.id}
      class={['list-row items-center gap-1 px-2 py-2', { 'bg-primary/10': props.selected }]}
    >
      <button
        type="button"
        class="list-col-grow flex min-w-0 cursor-pointer flex-col items-start gap-0.5 text-left"
        aria-pressed={props.selected ? 'true' : 'false'}
        onClick={() => props.onSelect()}
        onPointerEnter={() => props.onPoint?.(true)}
        onPointerLeave={() => props.onPoint?.(false)}
        onFocus={() => props.onPoint?.(true)}
        onBlur={() => props.onPoint?.(false)}
      >
        {props.children}
      </button>
      {props.actions}
      <Show when={props.editHref}>
        {(href) => (
          <a
            href={href()}
            class="btn btn-square btn-ghost btn-sm"
            aria-label={props.editLabel}
            title={props.editLabel}
          >
            <EditIcon class="size-4" aria-hidden="true" />
          </a>
        )}
      </Show>
    </li>
  );
}

/** Scrolls a places list to the row of `id` (MapListRow), when it is there. */
export const scrollToRow = (list: HTMLElement | undefined, id: number) =>
  list
    ?.querySelector(`[data-row="${id}"]`)
    ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

/**
 * The bottom of a places list's panel, for admins: its Add button, in a bar as
 * tall as a form's (min-h-18), level with the sidebar's account corner.
 */
export function MapListFoot(props: { href: string; label: string }) {
  return (
    <div class="flex min-h-18 items-center justify-center border-t border-base-300 bg-base-100/90 px-4 backdrop-blur-md">
      <AddLink href={props.href} label={props.label} class="" />
    </div>
  );
}

/** The top of a places list's panel: the places tabs, then `children` (the search). */
export function MapListHead(props: { current: 'villages' | 'parishes'; children?: JSX.Element }) {
  return (
    <div class="flex flex-col gap-3 border-b border-base-300 px-4 pt-2 pb-3 lg:pt-3">
      <PlacesTabs current={props.current} />
      {props.children}
    </div>
  );
}
