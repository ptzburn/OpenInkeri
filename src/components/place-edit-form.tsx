import { Show, createMemo, createSignal } from 'solid-js';
import MapIcon from '~icons/ri/map-pin-2-line';

import type { QueryData } from '~/lib/query-data';
import { FIELD_MAX } from '~/lib/field-limits';
import { localName, placeInUse } from '~/lib/format';
import { CYRILLIC_NAME_PATTERN, LATIN_NAME_PATTERN } from '~/lib/name-scripts';
import {
  DeleteSection,
  FormActions,
  Select,
  TextArea,
  TextInput,
  postedName,
  useFormDone,
  useFormErrors,
} from '~/components/form-fields';
import { useToast } from '~/components/toaster';
import { coordinateStatusLabels, placeKindLabels } from '~/components/labels';
import { type Lookup, LookupField, lookupOf } from '~/components/lookup-field';
import LocationPicker from '~/components/location-picker';
import { NewParishFields } from '~/components/new-row-fields';
import PlaceSearch from '~/components/place-search';
import { COORDINATES_PATTERN, formatCoordinates, mapLink } from '~/lib/coordinates';
import { type GazetteerHit, placeKindOf } from '~/lib/gazetteer';
import {
  type CoordinateStatus,
  type PlaceKind,
  coordinateStatuses,
  placeKinds,
} from '~/lib/place-kinds';
import { getParishOptions } from '~/data/parishes';
import { type PlaceEditData, deletePlace, getPlaceEdit, savePlace } from '~/data/places';
import { m } from '~/paraglide/messages.js';

// What a new place's form starts from.
const blank: PlaceEditData = {
  id: 0,
  version: 0,
  kind: 'village',
  nameRu: '',
  nameFi: null,
  parishId: null,
  latitude: null,
  longitude: null,
  coordinateStatus: 'unknown',
  note: null,
  spellings: [],
  records: 0,
  birthplaces: 0,
  churches: 0,
};

/**
 * The admin's form for one place, or for a new one without `id`: its names,
 * kind, parish, coordinates, note and the spellings the sources use for it.
 * A search over the gazetteer (PlaceSearch) comes first: a settlement picked
 * there fills the names, kind, coordinates and the nearest parish, all still
 * editable.
 * The parish is typed by name and linked to the one it names; one not known
 * yet can be added in its field (LookupField), without a church: the parish
 * page sets that later. It posts to the savePlace action (and works before
 * JavaScript loads); a
 * save redirects to the villages list as it was (`returnTo`: its search and
 * parish filter), and Cancel goes to `cancelHref`. A new place starts in the
 * parish the list was narrowed to. A save is confirmed with a toast; one the
 * server refuses keeps the form as typed, says why and marks the fields at fault.
 * An existing place's form is followed by its Delete section.
 */
export default function PlaceEditForm(props: {
  id?: number;
  returnTo: { q?: string; parish?: string };
  cancelHref: string;
}) {
  const place = createMemo(
    (): Promise<QueryData<typeof getPlaceEdit>> | PlaceEditData =>
      props.id
        ? getPlaceEdit(props.id)
        : { ...blank, parishId: Number(props.returnTo.parish) || null },
    { name: 'place-edit' },
  );
  const parishes = createMemo(
    (): Promise<QueryData<typeof getParishOptions>> => getParishOptions(),
    {
      name: 'parish-options',
    },
  );
  const isThisForm = (form: FormData) => form.get('id') === (props.id ? String(props.id) : '');
  // This form's refused saves (the latest shown, its fields marked).
  const { error, invalid } = useFormErrors(savePlace, isThisForm);
  // The parishes to link to, by either name; a new one can be added here.
  const parishLookup = createMemo(
    (): Lookup =>
      lookupOf(
        (parishes() ?? []).map((p) => ({
          value: p.id,
          label: localName(p.name),
          spellings: p.spellings,
        })),
        {
          label: m.lookup_create_parish(),
          fields: (prefix, text) => (
            <NewParishFields prefix={prefix} text={text()} invalid={invalid} church={false} />
          ),
        },
      ),
    { name: 'place-parish-lookup' },
  );
  const parishName = (id: number | null) =>
    localName((parishes() ?? []).find((p) => p.id === id)?.name ?? null) || null;
  // A save lands on the localities list with a toast, naming the place as
  // saved (a rename shows the new name).
  const toast = useToast();
  useFormDone(savePlace, isThisForm, (form) => {
    const name = postedName(form);
    toast(props.id ? m.place_saved({ name }) : m.place_created({ name }));
  });

  return (
    // Keyed: each place (and each fresh read of it) gets a fresh form.
    <Show when={place()} keyed fallback={<p>{m.place_edit_missing()}</p>}>
      {(p) => {
        // What the fields show: as loaded, until a settlement picked in the
        // search fills them. The coordinates are shared with the map, which
        // sets them too; what the admin types in the other fields stays in
        // the inputs.
        const [nameRu, setNameRu] = createSignal(p.nameRu, { name: 'place-name-ru' });
        const [nameFi, setNameFi] = createSignal(p.nameFi, { name: 'place-name-fi' });
        const [kind, setKind] = createSignal<PlaceKind>(p.kind, { name: 'place-kind' });
        const [parishId, setParishId] = createSignal(p.parishId, { name: 'place-parish-id' });
        const [coordinates, setCoordinates] = createSignal(
          formatCoordinates(p.latitude, p.longitude),
          { name: 'place-coordinates' },
        );
        const [coordinateStatus, setCoordinateStatus] = createSignal<CoordinateStatus>(
          p.coordinateStatus,
          { name: 'place-coordinate-status' },
        );
        // A settlement from the gazetteer: its names, what it is, where it
        // stands (approximate: a map's centre, until checked) and the
        // parish whose church is nearest.
        const fill = (hit: GazetteerHit) => {
          if (hit.nameRu) setNameRu(hit.nameRu);
          if (hit.nameFi) setNameFi(hit.nameFi);
          const placeKind = placeKindOf(hit.kind);
          if (placeKind) setKind(placeKind);
          setCoordinates(formatCoordinates(hit.latitude, hit.longitude));
          setCoordinateStatus('approximate');
          if (hit.parish) setParishId(hit.parish.id);
        };
        return (
          <>
            {/* While a save is in flight the router marks the form aria-busy. */}
            <form method="post" action={savePlace} class="group flex max-w-7xl flex-col gap-6">
              <input type="hidden" name="returnQ" value={props.returnTo.q ?? ''} />
              <input type="hidden" name="returnParish" value={props.returnTo.parish ?? ''} />
              <input type="hidden" name="id" value={p.id || ''} />
              <input type="hidden" name="version" value={p.version} />

              {/* From lg up, two panes: the search and the fields on the
                  left, the map on the right, pinned under the header while
                  the fields scroll, with the coordinates it sets beneath it.
                  Below lg the map follows the search, above the fields. */}
              <div class="grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
                <PlaceSearch onPick={fill} />
                <div class="flex flex-col gap-2 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
                  <LocationPicker
                    class="h-[50vh] min-h-72 lg:h-[calc(100dvh-18rem)] lg:min-h-96"
                    value={coordinates()}
                    onPick={(lat, lng) => setCoordinates(formatCoordinates(lat, lng))}
                  />
                  <div class="grid gap-x-4 sm:grid-cols-2">
                    <TextInput
                      name="coordinates"
                      label={m.place_edit_coordinates()}
                      value={coordinates()}
                      pattern={COORDINATES_PATTERN}
                      maxlength={60}
                      hint={m.place_edit_coordinates_hint()}
                      invalid={invalid('coordinates')}
                      onInput={setCoordinates}
                    />
                    <Select
                      name="coordinateStatus"
                      label={m.place_edit_coordinate_status()}
                      value={coordinateStatus()}
                      options={coordinateStatuses.map((s) => ({
                        value: s,
                        label: coordinateStatusLabels[s](),
                      }))}
                      invalid={invalid('coordinateStatus')}
                    />
                    <Show when={p.latitude !== null && p.longitude !== null}>
                      <a
                        href={mapLink(p.latitude!, p.longitude!)}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="link self-start text-sm sm:col-span-2"
                      >
                        <MapIcon class="mr-1 inline size-4 align-text-bottom" aria-hidden="true" />
                        {m.villages_show_on_map()}
                      </a>
                    </Show>
                  </div>
                </div>
                <div class="grid gap-x-4 sm:grid-cols-2 lg:col-start-1">
                  <TextInput
                    name="nameRu"
                    label={m.form_name_ru()}
                    value={nameRu()}
                    pattern={CYRILLIC_NAME_PATTERN}
                    hint={m.form_name_ru_hint()}
                    required
                    maxlength={FIELD_MAX.line}
                    invalid={invalid('nameRu')}
                  />
                  <TextInput
                    name="nameFi"
                    label={m.form_name_fi()}
                    value={nameFi()}
                    pattern={LATIN_NAME_PATTERN}
                    hint={m.form_name_fi_hint()}
                    maxlength={FIELD_MAX.line}
                    invalid={invalid('nameFi')}
                  />
                  <Select
                    name="kind"
                    label={m.place_edit_kind()}
                    value={kind()}
                    options={placeKinds.map((k) => ({ value: k, label: placeKindLabels[k]() }))}
                    invalid={invalid('kind')}
                  />
                  <LookupField
                    textName="parishText"
                    idName="parishId"
                    label={m.place_edit_parish()}
                    text={parishName(parishId())}
                    id={parishId()}
                    lookup={parishLookup()}
                    invalid={invalid}
                  />
                  <TextArea
                    name="spellings"
                    label={m.place_edit_spellings()}
                    value={p.spellings.join('\n')}
                    rows={5}
                    hint={m.place_edit_spellings_hint()}
                    invalid={invalid('spellings')}
                    class="sm:col-span-2"
                  />
                  <TextArea
                    name="note"
                    label={m.form_note()}
                    value={p.note}
                    rows={4}
                    maxlength={FIELD_MAX.text}
                    invalid={invalid('note')}
                    class="sm:col-span-2"
                  />
                </div>
              </div>

              {/* Kept in view at the bottom of the window while scrolling,
                  over the pinned map. */}
              <FormActions
                error={error()}
                cancelHref={props.cancelHref}
                class="sticky bottom-0 z-10 -mx-4 border-t border-base-300 bg-base-100 px-4 py-3 lg:-mx-8 lg:px-8"
              />
            </form>
            <Show when={p.id}>
              <DeleteSection
                action={deletePlace}
                id={p.id}
                version={p.version}
                title={m.place_delete()}
                text={m.place_delete_text()}
                inUse={placeInUse(p)}
                deleted={m.place_deleted({ name: localName({ ru: p.nameRu, fi: p.nameFi }) })}
              >
                {/* Back to the list as it was, like a save. */}
                <input type="hidden" name="returnQ" value={props.returnTo.q ?? ''} />
                <input type="hidden" name="returnParish" value={props.returnTo.parish ?? ''} />
              </DeleteSection>
            </Show>
          </>
        );
      }}
    </Show>
  );
}
