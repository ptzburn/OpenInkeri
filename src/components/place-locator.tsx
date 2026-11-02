import { For, Loading, Show, createMemo, createSignal, untrack } from 'solid-js';
import RemoveIcon from '~icons/ri/delete-bin-line';
import CloseIcon from '~icons/ri/close-line';
import PinIcon from '~icons/ri/map-pin-line';

import type { QueryData } from '~/lib/query-data';
import type { Fault } from '~/components/form-fields';
import { coordinateStatusLabels } from '~/components/labels';
import LocationPicker from '~/components/location-picker';
import PlaceSearch from '~/components/place-search';
import { getPlaceMarkers } from '~/data/places';
import { formatCoordinates, parseCoordinates } from '~/lib/coordinates';
import type { GazetteerHit } from '~/lib/gazetteer';
import { m } from '~/paraglide/messages.js';

type Located = 'approximate' | 'verified';

/**
 * Where a locality stands, as a map or a search set it: the coordinates,
 * how sure they are (approximate: a map's centre or a hand's placing;
 * verified: checked against sources), and a button that removes the
 * marker; "not located yet" without them. `fault` is the server's refusal
 * of the coordinates, if any.
 */
export function LocationLine(props: {
  /** Its legend, when not "Location". */
  label?: string;
  coordinates: string;
  status: Located | 'unknown';
  onStatus: (status: Located) => void;
  onRemove: () => void;
  fault: Fault;
}) {
  return (
    <div class="fieldset">
      <span class="fieldset-legend">{props.label ?? m.place_edit_location()}</span>
      <Show
        when={parseCoordinates(props.coordinates)}
        fallback={
          <p class="py-1 text-sm text-base-content/60">{m.place_edit_coordinates_none()}</p>
        }
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span class="grow text-sm tabular-nums">{props.coordinates}</span>
          {/* The status and the button wrap together, to the right. */}
          <div class="ml-auto flex items-center gap-2">
            <div class="join" role="group" aria-label={m.place_edit_coordinate_status()}>
              <For each={['approximate', 'verified'] as const}>
                {(status) => (
                  <button
                    type="button"
                    class={['btn join-item btn-xs', { 'btn-active': props.status === status }]}
                    aria-pressed={props.status === status ? 'true' : 'false'}
                    onClick={() => props.onStatus(status)}
                  >
                    {coordinateStatusLabels[status]()}
                  </button>
                )}
              </For>
            </div>
            <div class="tooltip tooltip-left" data-tip={m.place_edit_remove_marker()}>
              <button
                type="button"
                class="btn btn-square btn-ghost btn-xs"
                aria-label={m.place_edit_remove_marker()}
                onClick={() => props.onRemove()}
              >
                <RemoveIcon class="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </Show>
      <Show when={props.fault !== undefined}>
        <p class="text-sm text-error">{props.fault || m.form_field_invalid()}</p>
      </Show>
    </div>
  );
}

/** Where a locality being added stands, as a map or a search sets it. */
export interface Location {
  coordinates: () => string;
  status: () => Located;
  /** Placed by hand or from a search: approximate until checked (again). */
  set: (lat: number, lng: number) => void;
  setStatus: (status: Located) => void;
  clear: () => void;
}

/** A locality's location, not set yet. Call it in a component body: the signals need an owner. */
export function createLocation(): Location {
  const [coordinates, setCoordinates] = createSignal('', { name: 'location-coordinates' });
  const [status, setStatus] = createSignal<Located>('approximate', { name: 'location-status' });
  return {
    coordinates,
    status,
    set: (lat, lng) => {
      setCoordinates(formatCoordinates(lat, lng));
      setStatus('approximate');
    },
    setStatus,
    clear: () => setCoordinates(''),
  };
}

/**
 * Where a locality added in a lookup field stands (NewPlaceFields): its
 * location line, and a button that opens a dialog with the gazetteer's
 * search over a map, as on the locality page. A click on the map or a
 * settlement found sets the coordinates; a settlement found is also handed
 * to `onFound`, for the fields around to take its names and kind. Posted
 * hidden as "<prefix>.coordinates" and "<prefix>.coordinateStatus", with
 * the form the box is in: the dialog is inside it, and saves nothing itself.
 * Without JavaScript the box shows "not located yet" and nothing opens.
 * On a page that is a map (the parish's), that map sets the `location`
 * instead, and there is no dialog.
 */
export default function PlaceLocator(props: {
  prefix: string;
  /** The locality as written, for the dialog's title. */
  name: string;
  /** The location line's legend, when not "Location". */
  label?: string;
  /** The parish chosen, whose church the map starts at. */
  parishId?: number | null;
  /** Set by the page's own map; the locator keeps its own otherwise. */
  location?: Location;
  invalid: (field: string) => Fault;
  onFound?: (hit: GazetteerHit) => void;
}) {
  // Whose the location is, for the box's life.
  const outside = untrack(() => props.location);
  const location = outside ?? createLocation();
  // The map is drawn while the dialog is open: MapLibre measures its box as
  // it starts, and a closed dialog's is empty.
  const [open, setOpen] = createSignal(false, { name: 'locator-open' });
  let dialog: HTMLDialogElement | undefined;
  const located = () => !!parseCoordinates(location.coordinates());
  const found = (hit: GazetteerHit) => {
    location.set(hit.latitude, hit.longitude);
    props.onFound?.(hit);
  };
  const titleId = () => `${props.prefix}-locate-title`;

  return (
    <div class="sm:col-span-2">
      <input type="hidden" name={`${props.prefix}.coordinates`} value={location.coordinates()} />
      <input type="hidden" name={`${props.prefix}.coordinateStatus`} value={location.status()} />
      <LocationLine
        label={props.label}
        coordinates={location.coordinates()}
        status={located() ? location.status() : 'unknown'}
        onStatus={location.setStatus}
        onRemove={location.clear}
        fault={props.invalid(`${props.prefix}.coordinates`)}
      />
      <Show
        when={!outside}
        fallback={<p class="text-xs text-base-content/60">{m.lookup_locate_here()}</p>}
      >
        <button
          type="button"
          class="btn btn-sm"
          onClick={() => {
            dialog?.showModal();
            setOpen(true);
          }}
        >
          <PinIcon class="size-4" aria-hidden="true" />
          {located() ? m.lookup_locate_change() : m.lookup_locate()}
        </button>
        {/* Full screen on a phone, a large box over the form from sm up. Its
          controls are buttons, not a form: a form can't hold another. */}
        <dialog
          ref={(el) => (dialog = el)}
          class="modal"
          aria-labelledby={titleId()}
          onClose={() => setOpen(false)}
        >
          <div class="modal-box flex h-[85dvh] max-h-none w-11/12 max-w-5xl flex-col gap-3 overflow-visible p-4 max-sm:h-dvh max-sm:w-full max-sm:max-w-none max-sm:rounded-none">
            <div class="flex items-center justify-between gap-2">
              <h3 id={titleId()} class="text-lg font-bold">
                {m.lookup_locate_title({ name: props.name })}
              </h3>
              <button
                type="button"
                class="btn btn-square btn-ghost btn-sm"
                aria-label={m.form_cancel()}
                onClick={() => dialog?.close()}
              >
                <CloseIcon class="size-5" aria-hidden="true" />
              </button>
            </div>
            <Show when={open()}>
              <PlaceSearch onPick={found} />
              {/* The map waits for the localities around it. */}
              <Loading
                fallback={
                  <div class="grid min-h-0 flex-1 place-items-center rounded-box bg-base-200">
                    <span class="loading loading-md loading-spinner" aria-hidden="true" />
                  </div>
                }
              >
                <LocatorMap
                  coordinates={location.coordinates()}
                  parishId={props.parishId ?? null}
                  onPick={location.set}
                />
              </Loading>
              <p class="text-xs text-base-content/60">
                {m.place_edit_map_hint()} {m.place_edit_map_legend()}
              </p>
            </Show>
            <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
              <div class="min-w-64 grow">
                <LocationLine
                  coordinates={location.coordinates()}
                  status={located() ? location.status() : 'unknown'}
                  onStatus={location.setStatus}
                  onRemove={location.clear}
                  fault={undefined}
                />
              </div>
              <button type="button" class="btn btn-primary" onClick={() => dialog?.close()}>
                {m.lookup_locate_done()}
              </button>
            </div>
          </div>
        </dialog>
      </Show>
    </div>
  );
}

// The dialog's map, once it opens: the localities already located around,
// the map starting at the chosen parish's church.
function LocatorMap(props: {
  coordinates: string;
  parishId: number | null;
  onPick: (lat: number, lng: number) => void;
}) {
  const markers = createMemo((): Promise<QueryData<typeof getPlaceMarkers>> => getPlaceMarkers(), {
    name: 'locator-markers',
  });
  const church = () => {
    const found = (markers() ?? []).find((n) => n.church?.id === props.parishId);
    return found ? { lat: found.latitude, lng: found.longitude } : null;
  };
  return (
    <LocationPicker
      class="min-h-0 flex-1 rounded-box"
      value={props.coordinates}
      onPick={(lat, lng) => props.onPick(lat, lng)}
      markers={markers()}
      focus={church()}
    />
  );
}
