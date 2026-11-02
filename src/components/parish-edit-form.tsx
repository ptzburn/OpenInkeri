import { Show, createMemo, createSignal, untrack } from 'solid-js';
import ArrowIcon from '~icons/ri/arrow-right-s-line';

import type { QueryData } from '~/lib/query-data';
import { FIELD_MAX } from '~/lib/field-limits';
import { localName, namesOf, parishInUse } from '~/lib/format';
import {
  DeleteSection,
  NamePair,
  TextArea,
  postedName,
  useEditForm,
} from '~/components/form-fields';
import LocationPicker from '~/components/location-picker';
import { type Lookup, LookupField, addsRow, namedRow } from '~/components/lookup-field';
import MapForm from '~/components/map-form';
import { placeLookup } from '~/components/new-row-fields';
import { createLocation } from '~/components/place-locator';
import { type ParishEditData, deleteParish, getParishEdit, saveParish } from '~/data/parishes';
import { getPlaceMarkers, getPlaceOptions } from '~/data/places';
import type { GazetteerHit } from '~/lib/gazetteer';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// What a new parish's form starts from.
const blank: ParishEditData = {
  id: 0,
  version: 0,
  nameRu: '',
  nameFi: null,
  churchPlaceId: null,
  note: null,
  villages: 0,
  sources: 0,
};

/**
 * The admin's form for one parish, or for a new one without `id`: its names,
 * the locality its church stands in and a note. The locality is typed by
 * name and linked to the one it names; one not known yet can be added in
 * its field (LookupField), in this parish. It posts to the saveParish action
 * (and works before JavaScript loads); a save redirects to the parishes
 * list, and Cancel goes to `cancelHref`. A save the server refuses keeps the
 * form as typed, says why and marks the fields at fault. A save is confirmed
 * with a toast; an existing parish's form ends with what belongs to it and
 * its Delete section.
 *
 * The map is the page and the form a panel over it (MapForm), as for a
 * locality: the map shows the parish, its church and localities plain and
 * the other parishes' faint. A settlement found in the panel's search
 * becomes the church: the locality it is, when recorded already, or a new
 * one, with its names and position (and the parish's names, while empty).
 * While a new church is being added, a click on the map places it.
 */
export default function ParishEditForm(props: {
  id?: number;
  /** What the page is (the panel's accessible name): there is no heading, the map is the page. */
  title: string;
  cancelHref: string;
}) {
  const parish = createMemo(
    (): Promise<QueryData<typeof getParishEdit>> | ParishEditData =>
      props.id ? getParishEdit(props.id) : blank,
    { name: 'parish-edit' },
  );
  const places = createMemo((): Promise<QueryData<typeof getPlaceOptions>> => getPlaceOptions(), {
    name: 'parish-places',
  });
  // The localities already located, for the map.
  const markers = createMemo((): Promise<QueryData<typeof getPlaceMarkers>> => getPlaceMarkers(), {
    name: 'parish-markers',
  });
  // This form's refused saves (the latest shown, its fields marked), and a
  // save landing on the parishes list with a toast naming the parish as
  // saved (a rename shows the new name).
  const { error, invalid } = useEditForm(
    saveParish,
    () => props.id,
    (form) => {
      const name = postedName(form);
      return props.id ? m.parish_saved({ name }) : m.parish_created({ name });
    },
  );
  return (
    // Keyed: each parish (and each fresh read of it) gets a fresh form.
    <Show when={parish()} keyed fallback={<p class="p-4">{m.parish_edit_missing()}</p>}>
      {(p) => {
        // The names as loaded, then as typed: a settlement found for the
        // church fills the ones still empty (a parish is named after its
        // church village as a rule).
        const [nameRu, setNameRu] = createSignal(p.nameRu, { name: 'parish-name-ru' });
        const [nameFi, setNameFi] = createSignal(p.nameFi, { name: 'parish-name-fi' });
        // The church as the search set it (null: as loaded), which the field
        // follows; what the field holds then, as it reports it; and the
        // settlement a new church starts from.
        const [churchSet, setChurchSet] = createSignal<{ text: string; id: number | null } | null>(
          null,
          { name: 'parish-church-set' },
        );
        const churchText = () => churchSet()?.text ?? namedRow(places(), p.churchPlaceId);
        const churchId = () => {
          const set = churchSet();
          return set ? set.id : p.churchPlaceId;
        };
        const [churchTyped, setChurchTyped] = createSignal(() => churchText() ?? '', {
          name: 'parish-church-typed',
        });
        const [churchLinked, setChurchLinked] = createSignal(() => churchId(), {
          name: 'parish-church-linked',
        });
        const [churchHit, setChurchHit] = createSignal<GazetteerHit | null>(null, {
          name: 'parish-church-hit',
        });
        // The church locality last linked in the field or the search: the
        // map flies to it (not as the page loads, which shows the parish).
        const [target, setTarget] = createSignal<number | null>(null, {
          name: 'parish-church-target',
        });
        // The church linked has no position: the map can't show it.
        const unplaced = () => {
          const id = churchLinked();
          const all = markers();
          return id !== null && all && !all.some((n) => n.id === id)
            ? namedRow(places(), id)
            : null;
        };
        // Where a new church stands: this page's map sets it.
        const location = createLocation();
        // The church's choices: every locality, with its parish when it isn't
        // its namesake; a new one can be added here, in this parish.
        const churchLookup = createMemo(
          (): Lookup =>
            placeLookup(places(), invalid, {
              start: churchHit,
              location,
              // As a locality's form adds a parish: no box, and the fields
              // named for the church.
              plain: true,
              labels: {
                ru: m.parish_church_new_name_ru(),
                fi: m.parish_church_new_name_fi(),
                kind: m.parish_church_new_kind(),
                location: m.parish_church_new_location(),
              },
            }),
          { name: 'parish-church-lookup' },
        );
        // A new church is being added: the map places it.
        const adding = () => addsRow(churchLookup(), churchTyped(), churchLinked());
        // The localities on the map as this form would leave them: the
        // church locality linked drawn as this parish's church, and the one
        // it was, if another, as a plain locality. The parish's names as
        // loaded (or typed, for a new one) name it; typing them redraws
        // nothing.
        const shown = createMemo(
          () => {
            const linked = churchLinked();
            const parish = {
              id: p.id,
              name: untrack(() => ({ ru: nameRu(), fi: nameFi() })),
            };
            return (markers() ?? []).map((n) => {
              const isChurch = n.id === linked;
              const wasChurch = !!p.id && n.church?.id === p.id;
              if (isChurch === wasChurch) return n;
              return { ...n, church: isChurch ? parish : null };
            });
          },
          { name: 'parish-map-markers' },
        );
        // The church linked, on the map: where the view goes.
        const church = () => {
          const at = (markers() ?? []).find((n) => n.id === churchLinked());
          return at ? { lat: at.latitude, lng: at.longitude } : null;
        };
        const found = (hit: GazetteerHit) => {
          if (hit.nameRu && !nameRu().trim()) setNameRu(hit.nameRu);
          if (hit.nameFi && !nameFi()?.trim()) setNameFi(hit.nameFi);
          if (hit.existing) {
            setChurchHit(null);
            setChurchSet({ text: localName(hit.existing.name), id: hit.existing.id });
            setTarget(hit.existing.id);
            return;
          }
          setChurchHit(hit);
          setChurchSet({ text: hit.nameRu ?? hit.name, id: null });
          location.set(hit.latitude, hit.longitude);
        };
        return (
          <MapForm
            title={props.title}
            sheet={m.parish_edit_sheet()}
            form="parish-form"
            map={(mapClass) => (
              <LocationPicker
                class={mapClass}
                panel
                value={adding() ? location.coordinates() : ''}
                onPick={(lat, lng) => {
                  if (adding()) location.set(lat, lng);
                }}
                markers={shown()}
                highlight={p.id || null}
                target={target()}
                focus={church()}
              />
            )}
            hint={`${m.parish_edit_map_hint()} ${m.parish_edit_map_legend()}`}
            searchLabel={m.parish_edit_search()}
            onFound={found}
            error={error()}
            cancelHref={props.cancelHref}
          >
            {/* While a save is in flight the router marks the form aria-busy. */}
            <form
              id="parish-form"
              method="post"
              action={saveParish}
              class="group grid content-start gap-x-4 sm:grid-cols-2"
            >
              <input type="hidden" name="id" value={p.id || ''} />
              <input type="hidden" name="version" value={p.version} />
              <NamePair
                nameRu={nameRu()}
                nameFi={nameFi()}
                invalid={invalid}
                onInput={(field, value) =>
                  field === 'nameRu' ? setNameRu(value) : setNameFi(value)
                }
              />
              <div class="sm:col-span-2">
                <LookupField
                  textName="churchText"
                  linksOnly
                  maxlength={FIELD_MAX.line}
                  idName="churchPlaceId"
                  label={m.parish_church()}
                  text={churchText()}
                  id={churchId()}
                  lookup={churchLookup()}
                  invalid={invalid}
                  onChange={({ text, id }) => {
                    setChurchTyped(text);
                    setChurchLinked(id);
                    setTarget(id);
                  }}
                />
                <Show when={unplaced()}>
                  {(name) => (
                    <p class="mt-1 text-xs text-base-content/60">
                      {m.parish_church_unplaced({ name: name() })}
                    </p>
                  )}
                </Show>
              </div>
              <TextArea
                name="note"
                label={m.form_note()}
                value={p.note}
                rows={4}
                maxlength={FIELD_MAX.text}
                invalid={invalid('note')}
                class="sm:col-span-2"
              />
            </form>
            {/* What belongs to the parish: its localities, listed on the
                localities page narrowed to it, and its sources. */}
            <Show when={p.id && (p.villages || p.sources)}>
              <div class="fieldset">
                <span class="fieldset-legend">{m.parish_edit_belongs()}</span>
                <ul class="menu w-full rounded-box bg-base-200/60 menu-sm">
                  <Show when={p.villages}>
                    <li>
                      <a href={paths.places.villages({ parish: String(p.id) })}>
                        <span class="grow">{m.parish_delete_villages({ count: p.villages })}</span>
                        <ArrowIcon class="size-4" aria-hidden="true" />
                      </a>
                    </li>
                  </Show>
                  <Show when={p.sources}>
                    <li>
                      <span class="pointer-events-none">
                        {m.parish_delete_sources({ count: p.sources })}
                      </span>
                    </li>
                  </Show>
                </ul>
              </div>
            </Show>
            <Show when={p.id}>
              <DeleteSection
                action={deleteParish}
                id={p.id}
                version={p.version}
                title={m.parish_delete()}
                text={m.parish_delete_text()}
                inUse={parishInUse(p)}
                deleted={m.parish_deleted({ name: localName(namesOf(p)) })}
              />
            </Show>
          </MapForm>
        );
      }}
    </Show>
  );
}
