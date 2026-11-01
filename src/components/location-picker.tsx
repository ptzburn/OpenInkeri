import { Show, createEffect, createSignal, onSettled, untrack } from 'solid-js';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
// MapLibre finds its worker next to its own module, which bundling moves;
// Vite builds the worker itself and hands over its URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

import type { PlaceMarker } from '~/data/places';
import { parseCoordinates } from '~/lib/coordinates';
import { localName } from '~/lib/format';
import { m } from '~/paraglide/messages.js';

// OpenFreeMap's hosted styles: no key, attribution in the style.
const STYLE = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
// Ingria, where the parishes are, until a locality has coordinates.
const INGRIA = { center: [29.9, 59.6] as [number, number], zoom: 8 };
const PLACE_ZOOM = 12;
// Around a parish church: its villages in view.
const PARISH_ZOOM = 11;

const round = (n: number) => Math.round(n * 1e6) / 1e6;

type Point = { lat: number; lng: number };
type GeoData = Parameters<GeoJSONSource['setData']>[0];

// The localities already in the database, as a layer of dots (a parish
// church bigger and red) named from PARISH_ZOOM in: where a new one sits
// among the known, and whether it is one of them already.
const PLACES = 'places';
const placesData = (markers: PlaceMarker[]): GeoData => ({
  type: 'FeatureCollection',
  features: markers.map((p) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
    properties: { name: localName(p.name), church: p.church !== null },
  })),
});
function addPlaces(map: MapLibreMap, data: GeoData) {
  if (map.getSource(PLACES)) return;
  map.addSource(PLACES, { type: 'geojson', data });
  map.addLayer({
    id: `${PLACES}-dots`,
    type: 'circle',
    source: PLACES,
    paint: {
      'circle-radius': ['case', ['get', 'church'], 6, 4],
      'circle-color': ['case', ['get', 'church'], '#dc2626', '#4b5563'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });
  map.addLayer({
    id: `${PLACES}-names`,
    type: 'symbol',
    source: PLACES,
    minzoom: PARISH_ZOOM,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-anchor': 'top',
      'text-offset': [0, 0.8],
      'text-optional': true,
    },
    paint: { 'text-color': '#1f2937', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
  });
}

function webglSupported() {
  if (typeof WebGLRenderingContext === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

// The theme in force, read off the document: daisyUI's dark theme sets
// color-scheme: dark, however it was chosen (here, ThemeSwitcher's box).
const styleFor = () =>
  getComputedStyle(document.documentElement).colorScheme === 'dark' ? STYLE.dark : STYLE.light;

/**
 * A map to pick a locality's coordinates on: a click sets them, the marker
 * drags, and coordinates typed in the field move the marker. `value` is the
 * field's text ("59.613487, 30.22519"); `onPick` gets what the map chose.
 * The localities already known (`markers`) show as dots around it, parish
 * churches among them; without coordinates the view starts at `focus` (the
 * parish church) if there is one, else over Ingria.
 * MapLibre needs the browser (and WebGL), so it loads after the page
 * settles, only here; without WebGL the map says so and the field is all.
 */
export default function LocationPicker(props: {
  value: string;
  onPick: (lat: number, lng: number) => void;
  markers?: PlaceMarker[];
  focus?: Point | null;
  /** The box's classes, its height above all (h-72 unless said otherwise); MapLibre follows the box as it resizes. */
  class?: string;
}) {
  let container: HTMLDivElement | undefined;
  const [map, setMap] = createSignal<MapLibreMap | undefined>(undefined, { name: 'map' });
  const [unsupported, setUnsupported] = createSignal(false, { name: 'map-unsupported' });
  let marker: Marker | undefined;
  // The dots' data as last given, for a style (re)load to draw.
  let places = placesData([]);
  const coordinates = () => parseCoordinates(props.value) ?? null;
  // What the map chose, to the handler as it is when the map fires (its
  // events are no tracking scope: the read is untracked, each time).
  const pick = (lat: number, lng: number) => untrack(() => props.onPick(lat, lng));

  onSettled(() => {
    if (!container) return;
    if (!webglSupported()) {
      setUnsupported(true);
      return;
    }
    let disposed = false;
    let created: MapLibreMap | undefined;
    // The style follows the theme. A control that changes it fires change on
    // the document, as the form's own fields do: only a changed theme restyles.
    let style = styleFor();
    const restyle = () => {
      const next = styleFor();
      if (next !== style) created?.setStyle((style = next));
    };
    void import('maplibre-gl').then(
      ({ AttributionControl, Map, Marker, NavigationControl, setWorkerUrl }) => {
        if (disposed || !container) return;
        setWorkerUrl(workerUrl);
        const at = coordinates();
        const focus = untrack(() => props.focus);
        const start = at ?? focus;
        created = new Map({
          container,
          style,
          center: start ? [start.lng, start.lat] : INGRIA.center,
          zoom: at ? PLACE_ZOOM : focus ? PARISH_ZOOM : INGRIA.zoom,
          attributionControl: false,
        });
        // Top right, under the zoom buttons: the form's panel (or sheet)
        // covers the other corners.
        created.addControl(new NavigationControl({ showCompass: false }), 'top-right');
        created.addControl(new AttributionControl({ compact: true }), 'top-right');
        // The dots go on with each style, the theme switch's included.
        const withPlaces = created;
        withPlaces.on('style.load', () => addPlaces(withPlaces, places));
        created.on('click', (event) => pick(round(event.lngLat.lat), round(event.lngLat.lng)));
        const pin = new Marker({ draggable: true });
        pin.on('dragend', () => {
          const { lat, lng } = pin.getLngLat();
          pick(round(lat), round(lng));
        });
        marker = pin;
        document.addEventListener('change', restyle);
        setMap(created);
      },
    );
    return () => {
      disposed = true;
      document.removeEventListener('change', restyle);
      created?.remove();
    };
  });

  // The marker follows the field: typed coordinates move it (and the view,
  // when they are off it); none takes it off the map, and the view goes to
  // the parish church instead, when one is known and out of view.
  createEffect(
    () => ({ map: map(), at: coordinates(), focus: props.focus ?? null }),
    ({ map, at, focus }) => {
      if (!map || !marker) return;
      const show = (point: Point, zoom: number) => {
        if (!map.getBounds().contains([point.lng, point.lat])) {
          map.easeTo({ center: [point.lng, point.lat], zoom: Math.max(map.getZoom(), zoom) });
        }
      };
      if (!at) {
        marker.remove();
        if (focus) show(focus, PARISH_ZOOM);
        return;
      }
      marker.setLngLat([at.lng, at.lat]).addTo(map);
      show(at, PLACE_ZOOM);
    },
    { name: 'map-marker' },
  );
  // The known localities, as given and whenever they change.
  createEffect(
    () => ({ map: map(), markers: props.markers ?? [] }),
    ({ map, markers }) => {
      places = placesData(markers);
      void (map?.getSource(PLACES) as GeoJSONSource | undefined)?.setData(places);
    },
    { name: 'map-places' },
  );

  return (
    <div
      ref={(el) => (container = el)}
      class={['w-full overflow-hidden bg-base-200', props.class ?? 'h-72']}
    >
      <Show when={unsupported()}>
        <p class="grid h-full place-items-center p-4 text-center text-sm text-base-content/60">
          {m.map_webgl_unsupported()}
        </p>
      </Show>
    </div>
  );
}
