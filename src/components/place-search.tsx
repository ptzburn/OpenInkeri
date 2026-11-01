import { Errored, For, Show, createMemo, createSignal, isPending, onSettled } from 'solid-js';
import SearchIcon from '~icons/ri/search-line';

import { createCombobox } from '~/components/combobox';
import { gazetteerKindLabels } from '~/components/labels';
import { getGazetteerHits, getMapHits } from '~/data/gazetteer';
import type { GazetteerHit } from '~/lib/gazetteer';
import { FIELD_MAX } from '~/lib/field-limits';
import { localName } from '~/lib/format';
import type { QueryData } from '~/lib/query-data';
import { foldForSearch } from '~/lib/search-text';
import { m } from '~/paraglide/messages.js';

type Hits = GazetteerHit[] | Promise<QueryData<typeof getGazetteerHits>>;

/**
 * The locality form's search: a combobox over the gazetteer (the
 * settlements of Ingria from OpenStreetMap and Wikidata), searching as you
 * type by any name, Russian or Finnish; each hit says what and where it is
 * and which of our parishes has its church nearest. A button asks the whole
 * map (Nominatim) for a settlement the gazetteer lacks. Picking a hit hands
 * it to `onPick`, which fills the form. The input posts nothing: it isn't
 * part of the record, and Enter never submits the form from it.
 */
export default function PlaceSearch(props: { onPick: (hit: GazetteerHit) => void }) {
  // The text in the input; the search, once typing pauses; the search the
  // whole map was asked for.
  const [text, setText] = createSignal('', { name: 'place-search-text' });
  const [search, setSearch] = createSignal('', { name: 'place-search' });
  const [mapSearch, setMapSearch] = createSignal<string | null>(null, {
    name: 'place-search-map',
  });
  let typing: ReturnType<typeof setTimeout> | undefined;
  onSettled(() => () => clearTimeout(typing));

  // The hits start as none, settled, so a search on its way leaves the last
  // list up (marked stale) instead of a fallback; the whole map's hits the
  // same, once asked.
  const term = () => search().trim();
  const hits = createMemo((): Hits => (term().length >= 2 ? getGazetteerHits(term()) : []), {
    name: 'place-search-hits',
  });
  const mapHits = createMemo(
    (): Hits => {
      const q = mapSearch();
      return q ? getMapHits(q) : [];
    },
    { name: 'place-search-map-hits' },
  );
  const found = () => hits() ?? [];
  const foundOnMap = () => mapHits() ?? [];
  const pending = () => isPending(() => hits());
  const mapPending = () => isPending(() => mapHits());
  // Every row the list shows, for the keys. A search that failed shows its
  // error in the list (the Errored boundaries below) and has no rows; read
  // here, in an event handler, the failure throws and is caught.
  const rows = (hits: () => GazetteerHit[]): GazetteerHit[] => {
    try {
      return hits();
    } catch {
      return [];
    }
  };
  const listed = (): GazetteerHit[] => [...rows(found), ...rows(foundOnMap)];

  // The dropdown and the keys, over every row listed (each by its place in
  // the list, which moves as the map's rows follow). Enter never reaches
  // the form: the search isn't a field of it. A hit picked fills the form
  // and becomes the text; no search for that name: its answer would hold
  // this update (the text, the list closing) until it arrived. Typing
  // searches again.
  const box = createCombobox({
    name: () => 'place-search',
    rows: listed,
    keyOf: (_hit, index) => index,
    visible: () => term().length >= 2,
    enterStays: true,
    pick: (hit) => {
      props.onPick(hit);
      setText(hit.name);
      setSearch('');
    },
  });
  const typed = (value: string) => {
    setText(value);
    setMapSearch(null);
    box.typed();
    clearTimeout(typing);
    typing = setTimeout(() => setSearch(value), 300);
  };

  // The spelling the search matched, when it is neither of the hit's names.
  const spelledApart = (hit: GazetteerHit) => {
    const key = foldForSearch(term());
    if (!key) return undefined;
    const shown = [hit.name, hit.nameRu, hit.nameFi].filter((n): n is string => !!n);
    if (shown.some((n) => foldForSearch(n).includes(key))) return undefined;
    return hit.names.find((n) => foldForSearch(n).includes(key));
  };

  // One row, at its place in the list.
  const Option = (option: { hit: GazetteerHit; index: number }) => (
    <li
      id={box.ids.option(option.index)}
      role="option"
      aria-selected={box.isActive(option.index) ? 'true' : 'false'}
    >
      <button
        type="button"
        class={{ 'menu-active': box.isActive(option.index) }}
        onClick={() => box.pick(option.hit)}
      >
        {/* One cell of the menu's grid, so the lines stack: its names (the
            name, the Finnish one, and the spelling matched when it is
            neither); what it is and where, by our parishes and localities
            or by the map; and whether it is in the database already. */}
        <span class="flex flex-col items-start gap-0.5">
          <span class="flex flex-wrap items-baseline gap-x-2">
            <span class="font-medium">{option.hit.name}</span>
            <Show when={option.hit.nameFi && option.hit.nameFi !== option.hit.name}>
              <span class="opacity-70">{option.hit.nameFi}</span>
            </Show>
            <Show when={spelledApart(option.hit)}>
              {(spelling) => <span class="opacity-70 italic">{spelling()}</span>}
            </Show>
          </span>
          <span class="text-xs opacity-70">
            {gazetteerKindLabels[option.hit.kind]()}
            <Show
              when={option.hit.parish}
              fallback={
                <Show when={option.hit.near}>
                  {(near) => (
                    <>
                      {' · '}
                      {m.place_search_near_place({
                        place: localName(near().name),
                        km: String(near().km),
                      })}
                    </>
                  )}
                </Show>
              }
            >
              {(parish) => (
                <>
                  {' · '}
                  {m.place_search_near({
                    parish: localName(parish().name),
                    km: String(parish().km),
                  })}
                </>
              )}
            </Show>
            <Show when={option.hit.detail}>{(detail) => <>{` · ${detail()}`}</>}</Show>
          </span>
          <Show when={option.hit.existing}>
            {(existing) => (
              <span class="text-xs font-medium text-warning">
                {m.place_search_existing({ name: localName(existing().name) })}
              </span>
            )}
          </Show>
        </span>
      </button>
    </li>
  );

  return (
    <div class="fieldset">
      <label for={box.ids.input()} class="fieldset-legend">
        {m.place_search_label()}
      </label>
      <div class="relative">
        <label class="input w-full">
          <SearchIcon class="size-4 opacity-50" aria-hidden="true" />
          <input
            id={box.ids.input()}
            type="search"
            value={text()}
            role="combobox"
            aria-expanded={box.shown() ? 'true' : 'false'}
            aria-controls={box.ids.list()}
            aria-autocomplete="list"
            aria-activedescendant={
              box.active() === null ? undefined : box.ids.option(box.active()!)
            }
            autocomplete="off"
            maxlength={FIELD_MAX.search}
            placeholder={m.place_search_placeholder()}
            onInput={(e) => typed(e.currentTarget.value)}
            onFocus={box.show}
            onClick={box.show}
            onBlur={box.close}
            onKeyDown={box.onKeyDown}
          />
          <Show when={pending() || mapPending()}>
            <span class="loading loading-xs loading-spinner" aria-hidden="true" />
          </Show>
        </label>
        <Show when={box.shown()}>
          {/* Its mousedown keeps the focus (and so the dropdown) in the input. */}
          <div
            class={[
              'absolute top-full left-0 z-20 mt-1 w-full rounded-box border border-base-300 bg-base-100 shadow-lg',
              { 'opacity-60': pending() },
            ]}
            onMouseDown={(e) => e.preventDefault()}
          >
            {/* A gazetteer search that fails says so here, in place of the
                list, and the page stays; the next keystroke asks again. */}
            <Errored
              fallback={
                <p role="alert" class="p-3 text-sm text-error">
                  {m.place_search_failed()}
                </p>
              }
            >
              <ul
                id={box.ids.list()}
                role="listbox"
                aria-label={m.place_search_label()}
                class="menu max-h-80 w-full flex-nowrap overflow-y-auto menu-sm"
              >
                <For each={found()}>{(hit, index) => <Option hit={hit} index={index()} />}</For>
                {/* The whole map's hits follow the gazetteer's; a map search
                    that fails says so here and leaves them. */}
                <Show when={mapSearch()}>
                  <Errored
                    fallback={
                      <li class="menu-disabled">
                        <p role="alert" class="text-error">
                          {m.place_search_map_failed()}
                        </p>
                      </li>
                    }
                  >
                    <For each={foundOnMap()}>
                      {(hit, index) => <Option hit={hit} index={found().length + index()} />}
                    </For>
                    <Show when={!mapPending() && !foundOnMap().length}>
                      <li class="menu-disabled">
                        <p>{m.place_search_map_none()}</p>
                      </li>
                    </Show>
                  </Errored>
                </Show>
              </ul>
              <div class="flex flex-col gap-2 border-t border-base-300 p-3 text-sm">
                <Show when={!pending() && !found().length}>
                  <p class="text-base-content/60">{m.place_search_none()}</p>
                </Show>
                <Show when={!pending() && mapSearch() === null}>
                  <button
                    type="button"
                    class="btn self-start btn-sm"
                    onClick={() => setMapSearch(term())}
                  >
                    {m.place_search_map()}
                  </button>
                </Show>
                <p class="text-xs text-base-content/50">{m.place_search_attribution()}</p>
              </div>
            </Errored>
          </div>
        </Show>
      </div>
    </div>
  );
}
