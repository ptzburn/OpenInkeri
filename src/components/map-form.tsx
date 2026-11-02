import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { FormActions } from '~/components/form-fields';
import PlaceSearch from '~/components/place-search';
import type { FormError } from '~/lib/form-error';
import type { GazetteerHit } from '~/lib/gazetteer';

/**
 * A form as a panel over a map, the map being the page (MapPage): the
 * locality's and the parish's. From lg up the panel is a column along the
 * map's left edge, against the sidebar, the map showing through: the
 * gazetteer's search at its top, the fields (`children`) scrolling under
 * it, and Cancel and Save pinned at the bottom, their line level with the
 * sidebar's account corner. Below lg the search floats at the top of the
 * map and the rest is a sheet at its bottom: collapsed it shows the top of
 * the fields, with the map above; it opens (to most of the height) on its
 * handle or as a field is focused, and closes on the handle, for a tap on
 * the map. `hint` says how to use the map, as a chip over it.
 */
export default function MapForm(props: {
  /** What the page is (the panel's accessible name): there is no heading, the map is the page. */
  title: string;
  /** The sheet's handle's name, e.g. "Locality form". */
  sheet: string;
  /** The form's id, which the footer's buttons submit. */
  form: string;
  /** The map (a LocationPicker), given the frame's `class`. */
  map: (mapClass: string) => JSX.Element;
  hint: string;
  /** What the search finds, when not "Find the locality". */
  searchLabel?: string;
  onFound: (hit: GazetteerHit) => void;
  error: FormError | undefined;
  cancelHref: string;
  children: JSX.Element;
}) {
  const [open, setOpen] = createSignal(false, { name: 'map-form-sheet-open' });
  return (
    <div class="absolute inset-0">
      {props.map('place-map absolute inset-0 h-full')}
      {/* How to use the map and what is on it, as a chip over it: at its
          bottom left beside the panel, or above the sheet on a phone (while
          the sheet is collapsed and the map in view). */}
      <p
        class={[
          'pointer-events-none absolute z-1 max-w-sm rounded-box bg-base-100/80 px-3 py-1.5 text-xs text-base-content/70 backdrop-blur-sm',
          'max-lg:bottom-[calc(33.333%+0.75rem)] max-lg:left-3',
          open() ? 'max-lg:hidden' : '',
          'lg:bottom-4 lg:left-[calc(var(--container-md)+1rem)]',
        ]}
      >
        {props.hint}
      </p>
      {/* The form's column. Below lg it is nothing of its own (taps go
          through to the map): the search and the sheet are placed apart. */}
      <div class="absolute inset-0 max-lg:pointer-events-none lg:right-auto lg:flex lg:w-md lg:flex-col lg:border-r lg:border-base-300 lg:bg-base-100/90 lg:backdrop-blur-md">
        <PlaceSearch
          onPick={(hit) => props.onFound(hit)}
          label={props.searchLabel}
          class="max-lg:pointer-events-auto max-lg:absolute max-lg:inset-x-3 max-lg:top-3 max-lg:z-2 max-lg:rounded-field max-lg:shadow-lg lg:border-b lg:border-base-300 lg:px-4 lg:py-3"
        />
        <section
          class={[
            'group flex flex-col overflow-hidden max-lg:pointer-events-auto',
            'max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-1 max-lg:rounded-t-box max-lg:border-t max-lg:border-base-300 max-lg:bg-base-100/90 max-lg:shadow-xl max-lg:backdrop-blur-md max-lg:transition-[height] max-lg:duration-300 max-lg:ease-out',
            open() ? 'max-lg:h-[88%]' : 'max-lg:h-1/3',
            'lg:min-h-0 lg:flex-1',
          ]}
          aria-label={props.title}
          onFocusIn={() => setOpen(true)}
        >
          <button
            type="button"
            class="flex w-full justify-center py-2 lg:hidden"
            aria-label={props.sheet}
            aria-expanded={open() ? 'true' : 'false'}
            onClick={() => setOpen((o) => !o)}
            // Its tap must not count as a focus that opens the sheet.
            onFocusIn={(event) => event.stopPropagation()}
          >
            <span class="h-1.5 w-10 rounded-full bg-base-content/30" aria-hidden="true" />
          </button>
          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">{props.children}</div>
          {/* The panel's footer, fixed under the scrolling body: as tall as
              the sidebar's account corner (min-h-18) so the line over each
              runs level, and as see-through as the panel. Its buttons submit
              the form above by its id, and follow its busy state through
              the section, their shared group. */}
          <FormActions
            form={props.form}
            error={props.error}
            cancelHref={props.cancelHref}
            class="min-h-18 justify-center border-t border-base-300 bg-base-100/90 px-4 backdrop-blur-md"
          />
        </section>
      </div>
    </div>
  );
}
