import { Link, Title } from '@solidjs/meta';
import { type RouteProps, useNavigate } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import type { JSX } from '@solidjs/web';
import { Show, createMemo, createSignal, isPending, onSettled } from 'solid-js';
import { env } from 'virtual:solid-env/client';
import PrevIcon from '~icons/ri/arrow-left-s-line';
import NextIcon from '~icons/ri/arrow-right-s-line';
import GridIcon from '~icons/ri/layout-grid-line';
import ZoomInIcon from '~icons/ri/zoom-in-line';
import ZoomOutIcon from '~icons/ri/zoom-out-line';

import type { QueryData } from '~/lib/query-data';
import { getSourcePages } from '~/data/sources';
import { pageName } from '~/lib/format';
import { photoUrl } from '~/lib/photos';
import { idParam } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import type { Crumbs } from '~/lib/breadcrumbs';

// One page photograph of a source, for signed-in users (see ../index.tsx): fitted to
// the window, or at its full size to read the hand, by its button or a
// click on the photo. Previous and next, also by the arrow keys; the next
// photo is fetched ahead, so turning the page doesn't wait.
const crumbs: Crumbs = async ({ params }) => {
  const id = idParam(params.id);
  const n = idParam(params.n);
  const source = id ? await getSourcePages(id) : null;
  const page = source?.pages.find((p) => p.position === n);
  return [
    { label: m.sources_title(), href: paths.sources() },
    ...(source ? [{ label: source.title, href: paths.sources(source.id)() }] : []),
    ...(page ? [{ label: pageName(page.position, page.label) }] : []),
  ];
};

export const route = defineFileRoute('/sources/:id/pages/:n', {
  info: { crumbs },
  preload: ({ params }) => {
    const id = idParam(params.id);
    if (id) void getSourcePages(id);
  },
});

export default function SourcePage(props: RouteProps<'/sources/:id/pages/:n'>) {
  const source = createMemo(
    (): Promise<QueryData<typeof getSourcePages>> | null => {
      const id = idParam(props.params.id);
      return id ? getSourcePages(id) : null;
    },
    { name: 'source-page-source' },
  );
  // The page shown, its index among the source's, and its neighbours' links.
  const at = createMemo(
    () => {
      const current = source();
      const n = idParam(props.params.n);
      const index = current?.pages.findIndex((p) => p.position === n) ?? -1;
      if (!current || index < 0) return null;
      const [before, after] = [current.pages[index - 1], current.pages[index + 1]];
      return {
        source: current,
        page: current.pages[index],
        index,
        prev: before && pageHref(current.id, before.position),
        next: after && pageHref(current.id, after.position),
        nextKey: after?.key,
      };
    },
    { name: 'source-page-at' },
  );
  // Kept as the pages turn: one read at full size is likely read so on.
  const [zoomed, setZoomed] = createSignal(false, { name: 'source-page-zoomed' });
  const toggleZoom = () => {
    setZoomed((z) => !z);
  };
  const navigate = useNavigate();

  onSettled(() => {
    const key = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select'))
        return;
      const href =
        event.key === 'ArrowLeft' ? at()?.prev : event.key === 'ArrowRight' ? at()?.next : null;
      if (!href) return;
      event.preventDefault();
      navigate(href);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });

  return (
    <main class="flex min-w-0 flex-1 flex-col gap-3 p-2 lg:p-4">
      <Show when={at()} fallback={<p class="p-2">{m.source_page_missing()}</p>}>
        {(a) => (
          <>
            <Title>{`${pageName(a().page.position, a().page.label)} · ${a().source.title} - ${env.VITE_APP_NAME}`}</Title>
            <Show when={a().nextKey}>
              {(key) => <Link rel="prefetch" as="image" href={photoUrl('pages', key())} />}
            </Show>
            <nav class="flex flex-wrap items-center gap-2" aria-label={m.source_page_nav()}>
              <a
                href={paths.sources(a().source.id)()}
                class="btn btn-ghost btn-sm"
                title={m.source_all_pages()}
              >
                <GridIcon class="size-4" aria-hidden="true" />
                <span class="max-sm:sr-only">{m.source_all_pages()}</span>
              </a>
              <div class="join ml-auto">
                <PageLink href={a().prev} label={m.source_page_prev()}>
                  <PrevIcon class="size-5" aria-hidden="true" />
                </PageLink>
                <span class="join-item flex items-center px-3 text-sm whitespace-nowrap tabular-nums">
                  {pageName(a().page.position, a().page.label)}
                  <span class="ml-2 text-base-content/60">
                    {m.source_photo_of({ n: a().index + 1, count: a().source.pages.length })}
                  </span>
                </span>
                <PageLink href={a().next} label={m.source_page_next()}>
                  <NextIcon class="size-5" aria-hidden="true" />
                </PageLink>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                aria-pressed={zoomed() ? 'true' : 'false'}
                onClick={toggleZoom}
              >
                <Show when={zoomed()} fallback={<ZoomInIcon class="size-4" aria-hidden="true" />}>
                  <ZoomOutIcon class="size-4" aria-hidden="true" />
                </Show>
                <span class="max-sm:sr-only">
                  {zoomed() ? m.source_page_fit() : m.source_page_full()}
                </span>
              </button>
            </nav>
            <div
              class={[
                'min-h-0 flex-1 rounded-box bg-base-200 transition-opacity',
                zoomed() ? 'overflow-auto' : 'flex items-start justify-center overflow-hidden',
              ]}
              style={{ opacity: isPending(source) ? 0.5 : 1 }}
            >
              <img
                src={photoUrl('pages', a().page.key)}
                alt={`${a().source.title}, ${pageName(a().page.position, a().page.label)}`}
                width={a().page.width}
                height={a().page.height}
                class={
                  zoomed()
                    ? 'h-auto max-w-none cursor-zoom-out'
                    : 'h-auto max-h-[calc(100dvh-9rem)] w-auto max-w-full cursor-zoom-in object-contain'
                }
                onClick={toggleZoom}
              />
            </div>
          </>
        )}
      </Show>
    </main>
  );
}

const pageHref = (source: number, position: number) =>
  paths.sources(source).pages(String(position))();

/** Previous or next: a link, disabled (no href) at either end. */
function PageLink(props: { href: string | undefined; label: string; children: JSX.Element }) {
  return (
    <a
      href={props.href}
      class={['btn join-item btn-sm', { 'btn-disabled': !props.href }]}
      role="link"
      aria-disabled={props.href ? undefined : 'true'}
      aria-label={props.label}
      title={props.label}
    >
      {props.children}
    </a>
  );
}
