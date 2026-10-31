import { Show, createEffect, createSignal, onSettled, untrack } from 'solid-js';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
// MapLibre finds its worker next to its own module, which bundling moves;
// Vite builds the worker itself and hands over its URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

import { parseCoordinates } from '~/lib/coordinates';
import { m } from '~/paraglide/messages.js';

// OpenFreeMap's hosted styles: no key, attribution in the style.
const STYLE = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
// Ingria, where the parishes are, until a locality has coordinates.
const INGRIA = { center: [29.9, 59.6] as [number, number], zoom: 8 };
const PLACE_ZOOM = 12;

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function webglSupported() {
  if (typeof WebGLRenderingContext === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

// daisyUI's theme-controller box (ThemeSwitcher): checked is dark.
const themeBox = () => document.querySelector<HTMLInputElement>('input.theme-controller');
const styleFor = () => (themeBox()?.checked ? STYLE.dark : STYLE.light);

/**
 * A map to pick a locality's coordinates on: a click sets them, the marker
 * drags, and coordinates typed in the field move the marker. `value` is the
 * field's text ("59.613487, 30.22519"); `onPick` gets what the map chose.
 * MapLibre needs the browser (and WebGL), so it loads after the page
 * settles, only here; without WebGL the map says so and the field is all.
 */
export default function LocationPicker(props: {
  value: string;
  onPick: (lat: number, lng: number) => void;
}) {
  let container: HTMLDivElement | undefined;
  const [map, setMap] = createSignal<MapLibreMap>();
  const [unsupported, setUnsupported] = createSignal(false, { name: 'map-unsupported' });
  let marker: Marker | undefined;
  const coordinates = () => parseCoordinates(props.value) ?? null;
  // The map reports to one handler for its life: read it once.
  const onPick = untrack(() => props.onPick);

  onSettled(() => {
    if (!container) return;
    if (!webglSupported()) {
      setUnsupported(true);
      return;
    }
    let disposed = false;
    let created: MapLibreMap | undefined;
    const box = themeBox();
    const restyle = () => created?.setStyle(styleFor());
    void import('maplibre-gl').then(({ Map, Marker, NavigationControl, setWorkerUrl }) => {
      if (disposed || !container) return;
      setWorkerUrl(workerUrl);
      const at = coordinates();
      created = new Map({
        container,
        style: styleFor(),
        center: at ? [at.lng, at.lat] : INGRIA.center,
        zoom: at ? PLACE_ZOOM : INGRIA.zoom,
        attributionControl: { compact: true },
      });
      created.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      created.on('click', (event) => onPick(round(event.lngLat.lat), round(event.lngLat.lng)));
      const pin = new Marker({ draggable: true });
      pin.on('dragend', () => {
        const { lat, lng } = pin.getLngLat();
        onPick(round(lat), round(lng));
      });
      marker = pin;
      // The style follows the theme switch.
      box?.addEventListener('change', restyle);
      setMap(created);
    });
    return () => {
      disposed = true;
      box?.removeEventListener('change', restyle);
      created?.remove();
    };
  });

  // The marker follows the field: typed coordinates move it (and the view,
  // when they are off it); none takes it off the map.
  createEffect(
    () => ({ map: map(), at: coordinates() }),
    ({ map, at }) => {
      if (!map || !marker) return;
      if (!at) {
        marker.remove();
        return;
      }
      marker.setLngLat([at.lng, at.lat]).addTo(map);
      if (!map.getBounds().contains([at.lng, at.lat])) {
        map.easeTo({ center: [at.lng, at.lat], zoom: Math.max(map.getZoom(), PLACE_ZOOM) });
      }
    },
  );

  return (
    <div class="flex flex-col gap-1">
      <div
        ref={(el) => (container = el)}
        class="h-72 w-full overflow-hidden rounded-box border border-base-300 bg-base-200"
      >
        <Show when={unsupported()}>
          <p class="grid h-full place-items-center p-4 text-center text-sm text-base-content/60">
            {m.map_webgl_unsupported()}
          </p>
        </Show>
      </div>
      <p class="label text-xs">{m.place_edit_map_hint()}</p>
    </div>
  );
}
