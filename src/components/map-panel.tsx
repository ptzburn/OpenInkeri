import type { JSX } from '@solidjs/web';
import { Show, createSignal } from 'solid-js';

// How far the sheet is open below lg, lowest first: its handle and what is
// pinned to its top and bottom (peek); half the map; or all of it but its
// top, the search and the map's attribution under it (full; app.css puts the
// attribution there).
const FULL_GAP_REM = 6;
const snaps = ['peek', 'half', 'full'] as const;
type Snap = (typeof snaps)[number];
const SNAP_HEIGHT: Record<Exclude<Snap, 'peek'>, string> = {
  half: '50%',
  full: `calc(100% - ${FULL_GAP_REM}rem)`,
};
// A pointer moving less than this on the handle is a tap, not a drag.
const DRAG_SLOP = 6;
// A flick carries the sheet on as far as it would travel in this long (ms).
const FLICK_MS = 150;

// The fields a keyboard types into: focusing one opens the sheet fully, for
// the keyboard to leave room around it. Not buttons, boxes or selects: they
// take a tap where they are.
const typesIn = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  target.matches(
    'textarea, input:not([type=hidden], [type=checkbox], [type=radio], [type=button], [type=submit])',
  );

/**
 * A panel over a map, the map being the page (MapPage): the locality's and
 * the parish's forms (MapForm), and the places lists. From lg up the panel
 * is a column along the map's left edge, against the sidebar, the map
 * showing through: `top` at its top, then `head`, the body (`children`)
 * scrolling under them, and `foot` pinned at the bottom, its line level
 * with the sidebar's account corner. Below lg `top` floats at the top of
 * the map and the rest is a sheet at its bottom, starting half open: its
 * handle drags it (it settles at the nearest of peek, half and full, or the
 * next one on a flick), and a tap or the arrow keys on it step it up or
 * down. Focusing a field to type in opens it fully; touching a fully open
 * sheet's map lowers it to half. `hint` says how to use the map, as a chip
 * over it.
 */
export default function MapPanel(props: {
  /** What the page is (the panel's accessible name): there is no heading, the map is the page. */
  title: string;
  /** The sheet's handle's name, e.g. "Locality form". */
  sheet: string;
  /** The map (a LocationPicker), given the frame's `class`. */
  map: (mapClass: string) => JSX.Element;
  hint: string;
  /** Floating over the map below lg (the search), given its `class`. */
  top?: (topClass: string) => JSX.Element;
  /** Pinned to the sheet's top, under its handle. */
  head?: JSX.Element;
  /** Pinned to the sheet's bottom (a form's Cancel and Save). */
  foot?: JSX.Element;
  /** The body's spacing, when not a form's. */
  bodyClass?: string;
  children: JSX.Element;
}) {
  const [snap, setSnap] = createSignal<Snap>('half', { name: 'map-panel-sheet' });
  // The sheet's height while a finger drags it, in pixels.
  const [dragged, setDragged] = createSignal<number | null>(null, {
    name: 'map-panel-sheet-dragged',
  });
  // Peek's height: the handle's row and what is pinned, as tall as they are.
  const [peek, setPeek] = createSignal(0, { name: 'map-panel-sheet-peek' });
  let box: HTMLDivElement | undefined;
  let sheet: HTMLElement | undefined;
  let handle: HTMLButtonElement | undefined;
  let head: HTMLDivElement | undefined;
  let foot: HTMLDivElement | undefined;

  const peekHeight = () =>
    (handle?.offsetHeight ?? 0) + (head?.offsetHeight ?? 0) + (foot?.offsetHeight ?? 0);
  const go = (to: Snap) => {
    if (to === 'peek') setPeek(peekHeight());
    setSnap(to);
  };
  const step = (by: 1 | -1) => {
    const at = snaps.indexOf(snap()) + by;
    go(snaps[Math.max(0, Math.min(snaps.length - 1, at))]);
  };
  const height = () => {
    const px = dragged();
    if (px !== null) return `${px}px`;
    const at = snap();
    return at === 'peek' ? `${peek()}px` : SNAP_HEIGHT[at];
  };

  // A drag on the handle: the sheet follows the pointer, then settles at the
  // snap nearest where it would come to rest. A pointer that barely moved
  // was a tap, which the click handler takes.
  let drag: { y: number; from: number; at: number; time: number; speed: number } | null = null;
  let moved = false;
  const snapHeights = (): Record<Snap, number> => {
    const whole = box?.clientHeight ?? 0;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return { peek: peekHeight(), half: whole / 2, full: whole - FULL_GAP_REM * rem };
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !sheet) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const from = sheet.getBoundingClientRect().height;
    drag = { y: event.clientY, from, at: from, time: event.timeStamp, speed: 0 };
    moved = false;
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag) return;
    const by = drag.y - event.clientY;
    if (!moved && Math.abs(by) < DRAG_SLOP) return;
    moved = true;
    const { peek: low, full: high } = snapHeights();
    const at = Math.max(low, Math.min(high, drag.from + by));
    const elapsed = event.timeStamp - drag.time;
    if (elapsed > 0) drag.speed = (at - drag.at) / elapsed;
    drag.at = at;
    drag.time = event.timeStamp;
    setDragged(at);
  };
  const onPointerUp = () => {
    if (!drag) return;
    if (moved) {
      const rest = drag.at + drag.speed * FLICK_MS;
      const heights = snapHeights();
      const nearest = snaps.reduce((best, s) =>
        Math.abs(heights[s] - rest) < Math.abs(heights[best] - rest) ? s : best,
      );
      go(nearest);
      setDragged(null);
    }
    drag = null;
  };

  return (
    <div
      ref={(el) => (box = el)}
      class="absolute inset-0"
      style={{ '--sheet-height': height() }}
      data-top={props.top ? '' : undefined}
    >
      {/* Touching the map lowers a fully open sheet, for the map to show;
          that tap is only for that, and places nothing. Listened to in the
          capture phase, ahead of the map's own listeners. */}
      <div
        class="contents"
        ref={(el) => {
          let lowering = false;
          el.addEventListener(
            'pointerdown',
            () => {
              lowering = snap() === 'full';
              if (lowering) go('half');
            },
            true,
          );
          el.addEventListener(
            'click',
            (event) => {
              if (!lowering) return;
              lowering = false;
              event.stopPropagation();
            },
            true,
          );
        }}
      >
        {props.map('place-map absolute inset-0 h-full')}
      </div>
      {/* How to use the map and what is on it, as a chip over it: at its
          top left beside the panel (clear of the attribution at the bottom),
          or above the sheet on a phone (while the sheet leaves the map in
          view). */}
      <p
        class={[
          'pointer-events-none absolute z-1 max-w-sm rounded-box bg-base-100/80 px-3 py-1.5 text-xs text-base-content/70 backdrop-blur-sm',
          'max-lg:bottom-[calc(var(--sheet-height)+0.75rem)] max-lg:left-3 max-lg:right-3',
          snap() === 'full' || dragged() !== null ? 'max-lg:hidden' : '',
          'lg:top-3 lg:left-[calc(var(--container-md)+0.75rem)]',
        ]}
      >
        {props.hint}
      </p>
      {/* The panel's column. Below lg it is nothing of its own (taps go
          through to the map): the top and the sheet are placed apart. */}
      <div class="absolute inset-0 max-lg:pointer-events-none lg:right-auto lg:flex lg:w-md lg:flex-col lg:border-r lg:border-base-300 lg:bg-base-100/90 lg:backdrop-blur-md">
        {props.top?.(
          'max-lg:pointer-events-auto max-lg:absolute max-lg:inset-x-3 max-lg:top-3 max-lg:z-2 max-lg:rounded-field max-lg:shadow-lg lg:border-b lg:border-base-300 lg:px-4 lg:py-3',
        )}
        <section
          ref={(el) => (sheet = el)}
          class={[
            'group flex flex-col overflow-hidden max-lg:pointer-events-auto',
            'max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-1 max-lg:h-(--sheet-height) max-lg:rounded-t-box max-lg:border-t max-lg:border-base-300 max-lg:bg-base-100/90 max-lg:shadow-xl max-lg:backdrop-blur-md',
            // Settling animates; following a finger doesn't.
            dragged() === null &&
              'max-lg:transition-[height] max-lg:duration-300 max-lg:ease-out motion-reduce:transition-none',
            'lg:min-h-0 lg:flex-1',
          ]}
          aria-label={props.title}
          onFocusIn={(event) => {
            if (typesIn(event.target)) go('full');
          }}
        >
          {/* The handle: the grabber and the page's title, the part a
              finger drags. touch-none keeps the browser from scrolling the
              page with it. */}
          <button
            ref={(el) => (handle = el)}
            type="button"
            class="flex w-full shrink-0 touch-none flex-col items-center gap-1 pt-2 pb-1 select-none lg:hidden"
            aria-label={props.sheet}
            aria-expanded={snap() === 'full' ? 'true' : 'false'}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            // A tap (or Enter): up a step, and from the top back to half.
            onClick={() => {
              // The click that ends a drag isn't a tap.
              if (moved) {
                moved = false;
                return;
              }
              if (snap() === 'full') go('half');
              else step(1);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') step(1);
              else if (event.key === 'ArrowDown') step(-1);
              else return;
              event.preventDefault();
            }}
          >
            <span class="h-1.5 w-10 rounded-full bg-base-content/30" aria-hidden="true" />
            <span class="text-sm font-semibold" aria-hidden="true">
              {props.title}
            </span>
          </button>
          <Show when={props.head}>
            {(headContent) => (
              <div ref={(el) => (head = el)} class="shrink-0">
                {headContent()}
              </div>
            )}
          </Show>
          <div
            class={[
              'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain',
              props.bodyClass ?? 'gap-6 p-4 max-lg:pt-2',
            ]}
          >
            {props.children}
          </div>
          {/* Fixed under the scrolling body: as see-through as the panel. */}
          <Show when={props.foot}>
            {(footContent) => (
              <div ref={(el) => (foot = el)} class="shrink-0">
                {footContent()}
              </div>
            )}
          </Show>
        </section>
      </div>
    </div>
  );
}
