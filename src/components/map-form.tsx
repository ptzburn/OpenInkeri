import type { JSX } from '@solidjs/web';

import { FormActions } from '~/components/form-fields';
import MapPanel from '~/components/map-panel';
import PlaceSearch from '~/components/place-search';
import type { FormError } from '~/lib/form-error';
import type { GazetteerHit } from '~/lib/gazetteer';

/**
 * A form as a panel over the places map (MapPanel): the locality's and the
 * parish's, which show what the map holds through useMapView.
 * The gazetteer's search is the panel's top (floating over the map on a
 * phone), the fields (`children`) its body, and Cancel and Save are pinned
 * at its bottom: as tall as the sidebar's account corner (min-h-18) so the
 * line over each runs level. Its buttons submit the form by its id, and
 * follow its busy state through the panel's section, their shared group.
 */
export default function MapForm(props: {
  /** What the page is (the panel's accessible name): there is no heading, the map is the page. */
  title: string;
  /** The sheet's handle's name, e.g. "Locality form". */
  sheet: string;
  /** The form's id, which the footer's buttons submit. */
  form: string;
  hint: string;
  /** What the search finds, when not "Find the locality". */
  searchLabel?: string;
  onFound: (hit: GazetteerHit) => void;
  error: FormError | undefined;
  cancelHref: string;
  children: JSX.Element;
}) {
  return (
    <MapPanel
      title={props.title}
      sheet={props.sheet}
      hint={props.hint}
      top={(topClass) => (
        <PlaceSearch
          onPick={(hit) => props.onFound(hit)}
          label={props.searchLabel}
          class={topClass}
        />
      )}
      foot={
        <FormActions
          form={props.form}
          error={props.error}
          cancelHref={props.cancelHref}
          class="min-h-18 justify-center border-t border-base-300 bg-base-100/90 px-4 backdrop-blur-md"
        />
      }
    >
      {props.children}
    </MapPanel>
  );
}
