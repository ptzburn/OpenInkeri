import { Show, createMemo } from 'solid-js';
import MapIcon from '~icons/ri/map-pin-2-line';

import type { QueryData } from '~/lib/query-data';
import { FIELD_MAX } from '~/lib/field-limits';
import { FormActions, Select, TextInput, useFormErrors } from '~/components/form-fields';
import { coordinateStatusLabels, placeKindLabels } from '~/components/labels';
import { COORDINATES_PATTERN, formatCoordinates, mapLink } from '~/lib/coordinates';
import { coordinateStatuses, placeKinds } from '~/lib/place-kinds';
import { getParishOptions } from '~/data/parishes';
import { type PlaceEditData, getPlaceEdit, savePlace } from '~/data/places';
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
};

/**
 * The admin's form for one place, or for a new one without `id`: its names,
 * kind, parish, coordinates, note and the spellings the sources use for it.
 * It posts to the savePlace action (and works before JavaScript loads); a
 * save redirects to the villages list as it was (`returnTo`: its search and
 * parish filter), and Cancel goes to `cancelHref`. A new place starts in the
 * parish the list was narrowed to. A save the server refuses keeps the form as typed,
 * says why and marks the fields at fault.
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
  // This form's refused saves (the latest shown, its fields marked).
  const { error, invalid } = useFormErrors(
    savePlace,
    (form) => form.get('id') === (props.id ? String(props.id) : ''),
  );

  return (
    // Keyed: each place (and each fresh read of it) gets a fresh form.
    <Show when={place()} keyed fallback={<p>{m.place_edit_missing()}</p>}>
      {(p) => (
        // While a save is in flight the router marks the form aria-busy.
        <form method="post" action={savePlace} class="group flex max-w-3xl flex-col gap-6">
          <input type="hidden" name="returnQ" value={props.returnTo.q ?? ''} />
          <input type="hidden" name="returnParish" value={props.returnTo.parish ?? ''} />
          <input type="hidden" name="id" value={p.id || ''} />
          <input type="hidden" name="version" value={p.version} />

          <div class="grid gap-x-4 sm:grid-cols-2">
            <TextInput
              name="nameRu"
              label={m.form_name_ru()}
              value={p.nameRu}
              required
              maxlength={FIELD_MAX.line}
              invalid={invalid('nameRu')}
            />
            <TextInput
              name="nameFi"
              label={m.form_name_fi()}
              value={p.nameFi}
              maxlength={FIELD_MAX.line}
              invalid={invalid('nameFi')}
            />
            <Select
              name="kind"
              label={m.place_edit_kind()}
              value={p.kind}
              options={placeKinds.map((k) => ({ value: k, label: placeKindLabels[k]() }))}
              invalid={invalid('kind')}
            />
            <Select
              name="parishId"
              label={m.place_edit_parish()}
              value={p.parishId}
              none={m.form_none()}
              options={(parishes() ?? []).map((parish) => ({
                value: parish.id,
                label: parish.name,
              }))}
              invalid={invalid('parishId')}
            />
            <TextInput
              name="coordinates"
              label={m.place_edit_coordinates()}
              value={formatCoordinates(p.latitude, p.longitude)}
              pattern={COORDINATES_PATTERN}
              maxlength={60}
              hint={m.place_edit_coordinates_hint()}
              invalid={invalid('coordinates')}
            />
            <Select
              name="coordinateStatus"
              label={m.place_edit_coordinate_status()}
              value={p.coordinateStatus}
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
            <label class="fieldset">
              <span class="fieldset-legend">{m.place_edit_spellings()}</span>
              <textarea
                name="spellings"
                rows={6}
                class={['textarea w-full', { 'textarea-error': invalid('spellings') }]}
                aria-invalid={invalid('spellings') ? 'true' : undefined}
              >
                {p.spellings.join('\n')}
              </textarea>
              <span class="label whitespace-normal">{m.place_edit_spellings_hint()}</span>
            </label>
            <label class="fieldset">
              <span class="fieldset-legend">{m.form_note()}</span>
              <textarea
                name="note"
                maxlength={FIELD_MAX.text}
                rows={6}
                class={['textarea w-full', { 'textarea-error': invalid('note') }]}
                aria-invalid={invalid('note') ? 'true' : undefined}
              >
                {p.note ?? ''}
              </textarea>
            </label>
          </div>

          <FormActions
            error={error()}
            cancelHref={props.cancelHref}
            class="border-t border-base-300 pt-4"
          />
        </form>
      )}
    </Show>
  );
}
