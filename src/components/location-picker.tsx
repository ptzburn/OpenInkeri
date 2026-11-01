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

// The localities already in the database: villages as a layer of dots,
// named from PARISH_ZOOM in; parish churches as a church symbol named for
// the parish at every zoom, the map's skeleton. Where a new one sits among
// the known, and whether it is one of them already: pointing at a dot (or
// tapping it) names it, with its parish.
const PLACES = 'places';
const DOTS = `${PLACES}-dots`;
const CHURCHES = `${PLACES}-churches`;
const CHURCH_ICON = 'church';
interface PlaceProperties {
  name: string;
  church: boolean;
  parish: string;
}
const placesData = (markers: PlaceMarker[]): GeoData => ({
  type: 'FeatureCollection',
  features: markers.map((p) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
    properties: {
      name: localName(p.name),
      church: p.church !== null,
      // A church's parish is the one it serves.
      parish: localName(p.church?.name ?? p.parish) ?? '',
    } satisfies PlaceProperties,
  })),
});

// A church: a red disc with a white cross, drawn at twice the size for
// sharp pixels. Not a sprite: the styles come from OpenFreeMap as they are.
function churchIcon() {
  const size = 20;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  const c = size / 2;
  ctx.beginPath();
  ctx.arc(c, c, c - 1, 0, Math.PI * 2);
  ctx.fillStyle = '#b91c1c';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(c - 1.25, 4, 2.5, 12);
  ctx.fillRect(c - 4, 7, 8, 2.5);
  return { image: ctx.getImageData(0, 0, size * scale, size * scale), pixelRatio: scale };
}

function addPlaces(map: MapLibreMap, data: GeoData) {
  if (map.getSource(PLACES)) return;
  if (!map.hasImage(CHURCH_ICON)) {
    const { image, pixelRatio } = churchIcon();
    map.addImage(CHURCH_ICON, image, { pixelRatio });
  }
  map.addSource(PLACES, { type: 'geojson', data });
  const text = {
    'text-font': ['Noto Sans Regular'],
    'text-size': 11,
    'text-anchor': 'top' as const,
    'text-optional': true,
  };
  const textPaint = {
    'text-color': '#1f2937',
    'text-halo-color': '#ffffff',
    'text-halo-width': 1.2,
  };
  map.addLayer({
    id: DOTS,
    type: 'circle',
    source: PLACES,
    filter: ['!', ['get', 'church']],
    paint: {
      'circle-radius': 4,
      'circle-color': '#4b5563',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });
  map.addLayer({
    id: `${PLACES}-names`,
    type: 'symbol',
    source: PLACES,
    filter: ['!', ['get', 'church']],
    minzoom: PARISH_ZOOM,
    layout: { ...text, 'text-field': ['get', 'name'], 'text-offset': [0, 0.8] },
    paint: textPaint,
  });
  map.addLayer({
    id: CHURCHES,
    type: 'symbol',
    source: PLACES,
    filter: ['get', 'church'],
    layout: {
      ...text,
      'icon-image': CHURCH_ICON,
      'icon-allow-overlap': true,
      'text-field': ['get', 'parish'],
      'text-offset': [0, 1.1],
    },
    paint: textPaint,
  });
}

/** What a dot says when pointed at: the locality's name, and its parish, or the parish it is the church of. */
function describePlace(properties: PlaceProperties) {
  const box = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = properties.name;
  box.appendChild(name);
  if (properties.parish) {
    const line = document.createElement('div');
    line.className = 'text-xs opacity-70';
    line.textContent = properties.church
      ? m.map_popup_church({ parish: properties.parish })
      : m.map_popup_parish({ parish: properties.parish });
    box.appendChild(line);
  }
  return box;
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
  // The last point the map itself chose (a click, a drag): the view stays
  // put for it, and goes to any other.
  let picked: Point | null = null;
  const pick = (lat: number, lng: number) => {
    picked = { lat, lng };
    untrack(() => props.onPick(lat, lng));
  };

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
    void import('maplibre-gl').then(({ Map, Marker, NavigationControl, Popup, setWorkerUrl }) => {
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
        attributionControl: { compact: true },
      });
      created.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      // The dots go on with each style, the theme switch's included.
      const withPlaces = created;
      withPlaces.on('style.load', () => addPlaces(withPlaces, places));
      // A dot under the pointer names its locality (a tap does the same, and
      // places nothing: the locality is there already); the pointer says it
      // is something to point at.
      const withPopup = created;
      const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 10 });
      const under = (point: { x: number; y: number }) =>
        withPopup.getLayer(DOTS)
          ? withPopup.queryRenderedFeatures([point.x, point.y], { layers: [DOTS, CHURCHES] })
          : [];
      const name = (feature: ReturnType<typeof under>[number]) => {
        const [lng, lat] = (feature.geometry as { coordinates: [number, number] }).coordinates;
        popup
          .setLngLat([lng, lat])
          .setDOMContent(describePlace(feature.properties as PlaceProperties))
          .addTo(withPopup);
      };
      created.on('mousemove', (event) => {
        const [feature] = under(event.point);
        withPopup.getCanvas().style.cursor = feature ? 'pointer' : '';
        if (feature) name(feature);
        else popup.remove();
      });
      created.on('mouseout', () => popup.remove());
      created.on('click', (event) => {
        const [feature] = under(event.point);
        if (feature) {
          name(feature);
          return;
        }
        popup.remove();
        pick(round(event.lngLat.lat), round(event.lngLat.lng));
      });
      const pin = new Marker({ draggable: true });
      pin.on('dragend', () => {
        const { lat, lng } = pin.getLngLat();
        pick(round(lat), round(lng));
      });
      marker = pin;
      document.addEventListener('change', restyle);
      setMap(created);
    });
    return () => {
      disposed = true;
      document.removeEventListener('change', restyle);
      created?.remove();
    };
  });

  // The marker follows the field. Coordinates from outside (a settlement
  // found in the search, the place as loaded) fly the view to them at the
  // place zoom; the map's own picks leave the view where it is. None takes
  // the marker off the map, and the view goes to the parish church instead,
  // when one is known and out of view.
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
      if (picked && picked.lat === at.lat && picked.lng === at.lng) return;
      map.flyTo({ center: [at.lng, at.lat], zoom: PLACE_ZOOM });
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
