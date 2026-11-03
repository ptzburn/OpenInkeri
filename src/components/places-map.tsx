import {
  Show,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  untrack,
  useContext,
} from 'solid-js';
import type { JSX } from '@solidjs/web';
import DeleteIcon from '~icons/ri/delete-bin-line';
import EditIcon from '~icons/ri/pencil-line';
import MoreIcon from '~icons/ri/more-2-fill';

import type { QueryData } from '~/lib/query-data';
import LocationPicker, { type MapMarker, parishPoints } from '~/components/location-picker';
import { AddLink } from '~/components/list-page';
import PlacesTabs from '~/components/places-tabs';
import { type PlaceMarker, getPlaceMarkers } from '~/data/places';
import { finnishNamesShown, localName, namesOf } from '~/lib/format';
import { m } from '~/paraglide/messages.js';

// The places section's one map, which its layout keeps under every page,
// and what the places lists (villages and parishes) share over it: their
// map's view, the panel's top and bottom, and its rows.

/** What a page of the places layout shows on its map: LocationPicker's props but for its box. */
export type MapView = Omit<Parameters<typeof LocationPicker>[0], 'class' | 'panel'>;

// How a page shows its view on the layout's map; it hands back how to stop.
const MapViewContext = createContext<(view: MapView) => () => void>();

/**
 * The places layout's map (src/routes/places.tsx): one map under every page
 * in it, kept as they change, so going from a list to a form, or between
 * the lists, moves the view instead of starting a map anew. Each page says
 * what it shows (useMapView); the page shown last has it. The pages' panels
 * lie over it (MapPanel).
 */
export function SharedMap(props: { children: JSX.Element }) {
  const [view, setView] = createSignal<MapView | null>(null, { name: 'places-map-view' });
  const show = (next: MapView) => {
    setView(() => next);
    return () => setView((current) => (current === next ? null : current));
  };
  return (
    <MapViewContext value={show}>
      <LocationPicker
        class="place-map absolute inset-0 h-full"
        panel
        value={view()?.value}
        onPick={
          view()?.onPick ? (lat, lng) => untrack(() => view()?.onPick?.(lat, lng)) : undefined
        }
        onSelect={(id) => untrack(() => view()?.onSelect?.(id))}
        markers={view()?.markers}
        highlight={view()?.highlight}
        focus={view()?.focus}
        target={view()?.target}
        pointed={view()?.pointed}
        frame={view()?.frame}
      />
      {props.children}
    </MapViewContext>
  );
}

/**
 * Shows `view` on the places layout's map while the calling component
 * lives; its fields are read as the map needs them, so getters keep them
 * current. A click places the marker only where the view has `onPick`.
 * Call it in a component body.
 */
export function useMapView(view: MapView) {
  const show = useContext(MapViewContext);
  createEffect(
    () => show,
    (show) => show?.(view),
    { name: 'places-map-show' },
  );
}

/**
 * A places list's map: every located locality, or the page's own `markers`
 * (the parishes); `plain` draws parish churches as the localities they are.
 * `highlight` is the parish drawn plain, the others faint. `only`, when
 * given, keeps the dots of those localities (a search's matches). The view
 * frames what the list is about: a search's matches, else the parish
 * highlighted, else every dot, each time that changes (and on coming back
 * to the list). A click on a dot is handed to `onSelect`; `target` flies to
 * a locality and names it, `pointed` names it where it is. Call it in a
 * component body, with getters.
 */
export function usePlacesMap(view: {
  markers?: MapMarker[];
  plain?: boolean;
  only?: Set<number> | null;
  highlight?: number | null;
  target?: number | null;
  pointed?: number | null;
  onSelect: (marker: MapMarker) => void;
}) {
  const located = createMemo((): Promise<QueryData<typeof getPlaceMarkers>> => getPlaceMarkers(), {
    name: 'places-map-markers',
  });
  const shown = (): MapMarker[] => {
    const all: MapMarker[] = view.markers ?? located() ?? [];
    const only = view.only;
    const kept = only ? all.filter((marker) => only.has(marker.id)) : all;
    return view.plain ? kept.map((marker) => ({ ...marker, church: null })) : kept;
  };
  useMapView({
    get markers() {
      return shown();
    },
    get frame() {
      const parish = view.highlight;
      return view.only || parish == null ? shown() : parishPoints(shown(), parish);
    },
    get highlight() {
      return view.highlight;
    },
    get target() {
      return view.target;
    },
    get pointed() {
      return view.pointed;
    },
    onSelect: (id) => {
      const marker = shown().find((n) => n.id === id);
      if (marker) view.onSelect(marker);
    },
  });
}

// The middle value; of an even count, halfway between the two middle ones.
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
};

/**
 * The parishes as the parishes map shows them, one cross each: at its
 * church locality when one is set and located, or else (`estimated`) at the
 * middle of its located localities, keyed by the parish's id negated so as
 * not to meet a locality's. A parish with neither isn't there.
 */
export function parishMarkers(
  located: PlaceMarker[],
  parishes: { id: number; nameRu: string; nameFi: string | null }[],
): MapMarker[] {
  return parishes.flatMap((parish): MapMarker[] => {
    const church = located.find((n) => n.church?.id === parish.id);
    if (church) return [church];
    const own = located.filter((n) => n.parishId === parish.id);
    if (!own.length) return [];
    const names = namesOf(parish);
    return [
      {
        id: -parish.id,
        name: names,
        latitude: median(own.map((n) => n.latitude)),
        longitude: median(own.map((n) => n.longitude)),
        parishId: parish.id,
        parish: names,
        church: { id: parish.id, name: names },
        estimated: true,
      },
    ];
  });
}

/** What an admin can do with a row of a places list, as its menu offers it. */
export interface RowActions {
  editHref: string;
  /** The menu items' labels: "Edit locality", "Delete locality". */
  edit: string;
  delete: string;
  onDelete: () => void;
}

/**
 * A row of a places list: `children` in a button that picks the row
 * (`selected` shows it picked; pointing at it or focusing it is told to
 * `onPoint`), for admins (`actions`) a menu behind a "more" button with Edit
 * (a link) and Delete (which hands over to `onDelete`, the list's one
 * confirmation), and `more` on a line of its own under them (a link: a
 * button can't hold one). `id` marks the row for `scrollToRow`. The menu is
 * daisyUI's popover dropdown, anchored to its button: in the top layer, the
 * panel's scrolling can't clip it.
 */
export function MapListRow(props: {
  id: number;
  selected: boolean;
  onSelect: () => void;
  onPoint?: (on: boolean) => void;
  actions?: RowActions;
  more?: JSX.Element;
  children: JSX.Element;
}) {
  const menuId = () => `row-menu-${props.id}`;
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
      <Show when={props.actions}>
        {(actions) => (
          <>
            <button
              type="button"
              class="btn btn-square btn-ghost btn-sm [anchor-name:var(--menu-anchor)]"
              style={{ '--menu-anchor': `--${menuId()}` }}
              popovertarget={menuId()}
              aria-label={m.places_row_actions()}
              title={m.places_row_actions()}
            >
              <MoreIcon class="size-4" aria-hidden="true" />
            </button>
            <ul
              id={menuId()}
              popover
              class="dropdown dropdown-end menu w-48 rounded-box bg-base-100 shadow-sm [position-anchor:var(--menu-anchor)]"
              style={{ '--menu-anchor': `--${menuId()}` }}
            >
              <li>
                <a href={actions().editHref}>
                  <EditIcon class="size-4" aria-hidden="true" />
                  {actions().edit}
                </a>
              </li>
              <li>
                {/* The menu closes itself (popovertargetaction), the dialog opens. */}
                <button
                  type="button"
                  class="text-error"
                  popovertarget={menuId()}
                  popovertargetaction="hide"
                  onClick={() => actions().onDelete()}
                >
                  <DeleteIcon class="size-4" aria-hidden="true" />
                  {actions().delete}
                </button>
              </li>
            </ul>
          </>
        )}
      </Show>
      <Show when={props.more}>
        {(more) => <div class="list-col-wrap col-start-1">{more()}</div>}
      </Show>
    </li>
  );
}

/**
 * A row's names, as the places lists show them: the one in the reader's
 * language first, the other dimmed after it (outside Russian, which shows
 * the Russian alone), then `children` on the same line.
 */
export function RowNames(props: {
  names: { ru: string; fi: string | null };
  children?: JSX.Element;
}) {
  const other = () => {
    const { ru, fi } = props.names;
    if (!finnishNamesShown() || !fi || fi === ru) return null;
    return localName(props.names) === fi ? ru : fi;
  };
  return (
    <span class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span class="font-medium">{localName(props.names)}</span>
      <Show when={other()}>{(name) => <span class="text-base-content/60">{name()}</span>}</Show>
      {props.children}
    </span>
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
