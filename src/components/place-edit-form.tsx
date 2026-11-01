import { Show, createMemo, createSignal } from 'solid-js';

import type { QueryData } from '~/lib/query-data';
import { FIELD_MAX } from '~/lib/field-limits';
import { localName, namesOf, placeInUse } from '~/lib/format';
import {
  DeleteSection,
  FormActions,
  NamePair,
  Select,
  TextArea,
  panelBarClass,
  postedName,
  useEditForm,
} from '~/components/form-fields';
import { placeKindLabels } from '~/components/labels';
import { type Lookup, LookupField, namedRow } from '~/components/lookup-field';
import LocationPicker from '~/components/location-picker';
import { parishLookup } from '~/components/new-row-fields';
import PlaceSearch from '~/components/place-search';
import { formatCoordinates, parseCoordinates } from '~/lib/coordinates';
import { type GazetteerHit, placeKindOf } from '~/lib/gazetteer';
import { type CoordinateStatus, type PlaceKind, placeKinds } from '~/lib/place-kinds';
import { getParishOptions } from '~/data/parishes';
import {
  type PlaceEditData,
  deletePlace,
  getPlaceEdit,
  getPlaceMarkers,
  savePlace,
} from '~/data/places';
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
 *
 * The map is the page and the form a panel over it (MapPage), without a
 * heading: the search, the coordinates the map sets, the fields, and Cancel
 * and Save pinned at the bottom; on a small screen, a sheet at the bottom
 * of the map.
 */
export default function PlaceEditForm(props: {
  id?: number;
  /** What the page is (the sheet's accessible name): there is no heading, the map is the page. */
  title: string;
  returnTo: { q?: string; parish?: string };
  cancelHref: string;
}) {
  // Not a read of props.returnTo here: the router sets up its search params
  // on their first read, under whichever owner reads them, and the server
  // (which reads them first in this memo) and the browser (which has read
  // them earlier) then number the form's hydration ids differently, so a
  // page loaded directly keeps its server-rendered form without its
  // behaviour. The parish the list was narrowed to is read where the
  // parish signal starts instead.
  const place = createMemo(
    (): Promise<QueryData<typeof getPlaceEdit>> | PlaceEditData =>
      props.id ? getPlaceEdit(props.id) : blank,
    { name: 'place-edit' },
  );
  const parishes = createMemo(
    (): Promise<QueryData<typeof getParishOptions>> => getParishOptions(),
    {
      name: 'parish-options',
    },
  );
  // The localities already located, for the map to show around this one.
  const markers = createMemo((): Promise<QueryData<typeof getPlaceMarkers>> => getPlaceMarkers(), {
    name: 'place-markers',
  });
  // This form's refused saves (the latest shown, its fields marked), and a
  // save landing on the localities list with a toast naming the place as
  // saved (a rename shows the new name).
  const { error, invalid } = useEditForm(
    savePlace,
    () => props.id,
    (form) => {
      const name = postedName(form);
      return props.id ? m.place_saved({ name }) : m.place_created({ name });
    },
  );
  // The parishes to link to, by either name; a new one can be added here,
  // without a church (this form is adding a locality already) and without
  // a word about it: its other name's field just appears under the parish.
  const parishChoices = createMemo(
    (): Lookup => parishLookup(parishes(), invalid, { church: false, plain: true }),
    { name: 'place-parish-lookup' },
  );

  return (
    // Keyed: each place (and each fresh read of it) gets a fresh form.
    <Show when={place()} keyed fallback={<p>{m.place_edit_missing()}</p>}>
      {(p) => {
        // What the fields show: as loaded, then as typed (the inputs report
        // back, so a hit whose value equals the loaded one still lands: a
        // write equal to the signal's value changes nothing), until a
        // settlement picked in the search fills them. The coordinates are
        // shared with the map, which sets them too.
        const [nameRu, setNameRu] = createSignal(p.nameRu, { name: 'place-name-ru' });
        const [nameFi, setNameFi] = createSignal(p.nameFi, { name: 'place-name-fi' });
        const [kind, setKind] = createSignal<PlaceKind>(p.kind, { name: 'place-kind' });
        // A new place starts in the parish the list was narrowed to.
        const [parishId, setParishId] = createSignal(
          p.id ? p.parishId : Number(props.returnTo.parish) || null,
          { name: 'place-parish-id' },
        );
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
        // The other localities on the map, and the church of the parish
        // chosen, where the map starts while this one has no coordinates.
        const neighbours = () => (markers() ?? []).filter((n) => n.id !== p.id);
        const church = () => {
          const found = (markers() ?? []).find((n) => n.church?.id === parishId());
          return found ? { lat: found.latitude, lng: found.longitude } : null;
        };
        // Below lg the panel is a sheet at the bottom of the map: collapsed
        // it shows the coordinates, with the map above; it
        // opens (to most of the height) on its handle or as a field is
        // focused, and closes on the handle, for a tap on the map.
        const [open, setOpen] = createSignal(false, { name: 'place-sheet-open' });
        return (
          // The map is the page, filling the box under the header; the
          // form's column lies over it (see below), its fields scrolling
          // inside it, Cancel and Save at the bottom, their line level with
          // the sidebar's account corner.
          <div class="absolute inset-0">
            <LocationPicker
              class="place-map absolute inset-0 h-full"
              value={coordinates()}
              onPick={(lat, lng) => {
                setCoordinates(formatCoordinates(lat, lng));
                // Placed by hand: approximate until checked (again).
                setCoordinateStatus('approximate');
              }}
              markers={neighbours()}
              focus={church()}
            />
            {/* The form's column: from lg up a sheet along the map's left
                edge, against the sidebar, the map showing through, with the
                search at its top. Below lg it is nothing of its own (taps go
                through to the map): the search floats at the top of the map
                and the rest is the sheet at its bottom. */}
            <div class="absolute inset-0 max-lg:pointer-events-none lg:right-auto lg:flex lg:w-md lg:flex-col lg:border-r lg:border-base-300 lg:bg-base-100/90 lg:backdrop-blur-md">
              <PlaceSearch
                onPick={fill}
                class="max-lg:pointer-events-auto max-lg:absolute max-lg:inset-x-3 max-lg:top-3 max-lg:z-2 max-lg:rounded-field max-lg:shadow-lg lg:border-b lg:border-base-300 lg:px-4 lg:py-3"
              />
              <section
                class={[
                  'flex flex-col overflow-hidden max-lg:pointer-events-auto',
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
                  aria-label={m.place_edit_sheet()}
                  aria-expanded={open() ? 'true' : 'false'}
                  onClick={() => setOpen((o) => !o)}
                  // Its tap must not count as a focus that opens the sheet.
                  onFocusIn={(event) => event.stopPropagation()}
                >
                  <span class="h-1.5 w-10 rounded-full bg-base-content/30" aria-hidden="true" />
                </button>
                <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pt-4">
                  {/* While a save is in flight the router marks the form aria-busy. */}
                  <form method="post" action={savePlace} class="group flex flex-1 flex-col gap-4">
                    <input type="hidden" name="returnQ" value={props.returnTo.q ?? ''} />
                    <input type="hidden" name="returnParish" value={props.returnTo.parish ?? ''} />
                    <input type="hidden" name="id" value={p.id || ''} />
                    <input type="hidden" name="version" value={p.version} />
                    {/* The coordinates the map or the search set, and their
                      status, posted hidden: nobody types them. */}
                    <input type="hidden" name="coordinates" value={coordinates()} />
                    <input type="hidden" name="coordinateStatus" value={coordinateStatus()} />

                    {/* The coordinates read back, with a box to tick once the
                      spot is checked against sources, and a link that removes
                      the marker: without coordinates the place counts as not
                      located (the server does the same). */}
                    <div class="flex flex-col gap-1 text-sm">
                      <p class="text-xs text-base-content/60">{m.place_edit_map_hint()}</p>
                      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <Show
                          when={parseCoordinates(coordinates())}
                          fallback={
                            <span class="text-base-content/60">
                              {m.place_edit_coordinates_none()}
                            </span>
                          }
                        >
                          <span class="tabular-nums">{coordinates()}</span>
                          <label class="label cursor-pointer gap-2">
                            <input
                              type="checkbox"
                              class="checkbox checkbox-sm"
                              checked={coordinateStatus() === 'verified'}
                              onChange={(event) =>
                                setCoordinateStatus(
                                  event.currentTarget.checked ? 'verified' : 'approximate',
                                )
                              }
                            />
                            {m.place_edit_verified()}
                          </label>
                          <button
                            type="button"
                            class="link link-hover text-base-content/60 sm:ml-auto"
                            onClick={() => {
                              setCoordinates('');
                              setCoordinateStatus('unknown');
                            }}
                          >
                            {m.place_edit_remove_marker()}
                          </button>
                        </Show>
                      </div>
                      <Show when={invalid('coordinates') !== undefined}>
                        <p class="text-error">{invalid('coordinates') || m.form_field_invalid()}</p>
                      </Show>
                    </div>

                    <div class="grid content-start gap-x-4 sm:grid-cols-2">
                      <NamePair
                        nameRu={nameRu()}
                        nameFi={nameFi()}
                        invalid={invalid}
                        onInput={(field, value) =>
                          field === 'nameRu' ? setNameRu(value) : setNameFi(value)
                        }
                      />
                      <Select
                        name="kind"
                        label={m.place_edit_kind()}
                        value={kind()}
                        options={placeKinds.map((k) => ({ value: k, label: placeKindLabels[k]() }))}
                        invalid={invalid('kind')}
                        onChange={(value) => setKind(value as PlaceKind)}
                      />
                      <LookupField
                        textName="parishText"
                        idName="parishId"
                        label={m.place_edit_parish()}
                        text={namedRow(parishes(), parishId())}
                        id={parishId()}
                        lookup={parishChoices()}
                        invalid={invalid}
                        class="sm:col-span-2"
                      />
                      {/* The spellings the sources use come with the records
                        that name the locality: a new one has none to edit. */}
                      <Show when={p.id}>
                        <TextArea
                          name="spellings"
                          label={m.place_edit_spellings()}
                          value={p.spellings.join('\n')}
                          rows={5}
                          hint={m.place_edit_spellings_hint()}
                          invalid={invalid('spellings')}
                          class="sm:col-span-2"
                        />
                      </Show>
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

                    <FormActions
                      error={error()}
                      cancelHref={props.cancelHref}
                      class={panelBarClass}
                    />
                  </form>
                  <Show when={p.id}>
                    <div class="mb-4">
                      <DeleteSection
                        action={deletePlace}
                        id={p.id}
                        version={p.version}
                        title={m.place_delete()}
                        text={m.place_delete_text()}
                        inUse={placeInUse(p)}
                        deleted={m.place_deleted({ name: localName(namesOf(p)) })}
                      >
                        {/* Back to the list as it was, like a save. */}
                        <input type="hidden" name="returnQ" value={props.returnTo.q ?? ''} />
                        <input
                          type="hidden"
                          name="returnParish"
                          value={props.returnTo.parish ?? ''}
                        />
                      </DeleteSection>
                    </div>
                  </Show>
                </div>
              </section>
            </div>
          </div>
        );
      }}
    </Show>
  );
}
