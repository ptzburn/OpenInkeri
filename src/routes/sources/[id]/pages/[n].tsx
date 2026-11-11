import { Link, Title } from '@solidjs/meta';
import { type RouteProps, useNavigate, useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import type { JSX } from '@solidjs/web';
import { For, Show, createMemo, createSignal, isPending, onSettled } from 'solid-js';
import { env } from 'virtual:solid-env/client';
import AddIcon from '~icons/ri/add-line';
import PrevIcon from '~icons/ri/arrow-left-s-line';
import NextIcon from '~icons/ri/arrow-right-s-line';
import GridIcon from '~icons/ri/layout-grid-line';
import ZoomInIcon from '~icons/ri/zoom-in-line';
import ZoomOutIcon from '~icons/ri/zoom-out-line';

import type { QueryData } from '~/lib/query-data';
import { useCanEdit } from '~/components/list-page';
import PageRecords, { recordTitle } from '~/components/page-records';
import type { RecordRow } from '~/data/records';
import RecordEditForm from '~/components/record-edit-form';
import { getPageRecords } from '~/data/records';
import { getSourcePages } from '~/data/sources';
import { pageName } from '~/lib/format';
import type { RecordKind } from '~/lib/record-kinds';
import { type PhotoMarks, inPhotoOrder, nextMark, photoBands } from '~/lib/photo-bands';
import { photoUrl } from '~/lib/photos';
import { idParam, stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import type { Crumbs } from '~/lib/breadcrumbs';

// One page photograph of a source, for signed-in users (see ../index.tsx): fitted to
// the window, or at its full size to read the hand, by its button or a
// click on the photo. Previous and next, also by the arrow keys; the next
// photo is fetched ahead, so turning the page doesn't wait.
//
// A numbered page has a column beside the photo (under it on a phone) with
// the records transcribed from the page: those whose page is its number.
// Admins transcribe there: ?record=new opens a new record's form in the
// column, starting on this page (?after= the record saved just before with
// Save and add next, which the new one follows), and ?record=<id> a
// record's form. Saving, deleting or cancelling comes back to the list.
// While a form is open, a click on the photo marks where its entry starts,
// and the next one below it where it ends (both are needed); the records
// marked show as bands over the photo, named by who each is
// about, each down to the next mark, lit with their row in the list as the
// pointer is on it. The list follows the page: marked from the top down,
// then the rest.
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
  search: stringParams('record', 'after'),
  preload: ({ params }) => {
    const id = idParam(params.id);
    const n = idParam(params.n);
    if (id) {
      void getSourcePages(id).then((source) => {
        const label = source?.pages.find((p) => p.position === n)?.label;
        if (label) void getPageRecords(id, label);
      });
    }
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
  // The records transcribed from the page, when it is numbered.
  const records = createMemo(
    (): Promise<QueryData<typeof getPageRecords>> | null => {
      const shown = at();
      return shown?.page.label ? getPageRecords(shown.source.id, shown.page.label) : null;
    },
    { name: 'source-page-records' },
  );
  const canEdit = useCanEdit('source-page-me');
  // Read only where they are used (in the JSX), never in a memo made before
  // the page's content: that would break the hydration of a page loaded
  // directly. Untyped: the route's params make its path a function.
  const [search] = useSearchParams<{ record?: string; after?: string }>();
  // Where a record's form opened from here returns: this photo.
  const here = (shown: { source: { id: number }; page: { position: number } }) => ({
    source: String(shown.source.id),
    photo: String(shown.page.position),
  });
  // This photo with a record's form open beside it.
  const formHref = (
    shown: { source: { id: number }; page: { position: number } },
    record: string,
  ) => paths.sources(shown.source.id).pages(String(shown.page.position))({ record });

  // The marks just clicked on the photo for the form open beside it, where
  // its entry starts and ends (nulls: taken off), kept with which form they
  // are for (?record= and ?after=), so the next record's form starts
  // unmarked; they are posted with the form (record.photo_top, photo_bottom).
  const [pending, setPending] = createSignal<{ form: string; marks: PhotoMarks } | null>(null, {
    name: 'source-page-mark',
  });
  // Where the pointer is on the photo while a form is open: the guide line
  // showing what a click there would mark.
  const [pointer, setPointer] = createSignal<number | null>(null, {
    name: 'source-page-pointer',
  });
  // The record pointed at, in the list or on the photo.
  const [hovered, setHovered] = createSignal<number | null>(null, {
    name: 'source-page-hovered',
  });
  // The form open beside the photo, for an admin: which, or undefined.
  const formOpen = () => (canEdit() ? search.record : undefined);
  const formKey = () => `${search.record ?? ''}:${search.after ?? ''}`;
  // The marks just clicked for the open form, if any.
  const marksClicked = () => {
    const mark = pending();
    return mark && mark.form === formKey() ? mark.marks : undefined;
  };
  // The open form's marks: just clicked, else its record's.
  const marksNow = (): PhotoMarks => {
    const clicked = marksClicked();
    if (clicked) return clicked;
    const row = records()?.records.find((r) => String(r.id) === formOpen());
    return { top: row?.photoTop ?? null, bottom: row?.photoBottom ?? null };
  };
  // What a click at `y` marks: the end, below a start that has none; else
  // the start (again, once both are marked).
  const clickMarks = (y: number) => nextMark(marksNow(), y);
  // With a form open, a click on the photo marks its entry's start, then
  // its end; else it zooms.
  const photoClick = (event: MouseEvent & { currentTarget: HTMLImageElement }) => {
    if (!formOpen()) return toggleZoom();
    const y = heightAt(event);
    if (y === null) return;
    const now = marksNow();
    setPending({
      form: formKey(),
      marks: clickMarks(y) === 'end' ? { top: now.top, bottom: y } : { top: y, bottom: null },
    });
  };
  const photoMove = (event: MouseEvent & { currentTarget: HTMLImageElement }) => {
    if (formOpen()) setPointer(heightAt(event));
  };
  const clearMarks = () => {
    setPending({ form: formKey(), marks: { top: null, bottom: null } });
  };
  // The bands over the photo: the records marked on it, each named by who
  // it is about; the one whose form is open as it is being marked, down to
  // the pointer while its end is still to come.
  const bands = () => {
    const page = records();
    const open = formOpen();
    const now = open ? marksNow() : null;
    const awaited = (marks: PhotoMarks) =>
      marks.bottom ?? Math.max(marks.top!, pointer() ?? marks.top!);
    const marks = (page?.records ?? []).flatMap((row) => {
      if (String(row.id) === open && now) {
        return now.top === null
          ? []
          : [
              {
                id: row.id,
                label: bandLabel(page!.kind, row),
                top: now.top,
                bottom: awaited(now),
              },
            ];
      }
      return row.photoTop === null
        ? []
        : [
            {
              id: row.id,
              label: bandLabel(page!.kind, row),
              top: row.photoTop,
              bottom: row.photoBottom,
            },
          ];
    });
    if (open === 'new' && now?.top != null) {
      marks.push({ id: 0, label: m.record_new_title(), top: now.top, bottom: awaited(now) });
    }
    return photoBands(marks);
  };
  const lit = (id: number) =>
    id === hovered() || String(id) === formOpen() || (id === 0 && formOpen() === 'new');

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
    <main class="flex min-w-0 flex-1 flex-col lg:h-[calc(100dvh-4rem)] lg:flex-none lg:flex-row">
      <Show when={at()} fallback={<p class="p-4">{m.source_page_missing()}</p>}>
        {(a) => (
          <>
            <Title>{`${pageName(a().page.position, a().page.label)} · ${a().source.title} - ${env.VITE_APP_NAME}`}</Title>
            <Show when={a().nextKey}>
              {(key) => <Link rel="prefetch" as="image" href={photoUrl('pages', key())} />}
            </Show>
            <section class="flex min-h-0 min-w-0 flex-col gap-3 p-2 lg:flex-1 lg:p-4">
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
                  'min-h-0 rounded-box bg-base-200 transition-opacity lg:flex-1',
                  zoomed()
                    ? 'max-h-[75dvh] overflow-auto lg:max-h-none'
                    : 'flex items-start justify-center overflow-hidden',
                ]}
                style={{ opacity: isPending(source) ? 0.5 : 1 }}
              >
                <div class={['relative', zoomed() ? 'w-max' : 'max-w-full']}>
                  <img
                    src={photoUrl('pages', a().page.key)}
                    alt={`${a().source.title}, ${pageName(a().page.position, a().page.label)}`}
                    width={a().page.width}
                    height={a().page.height}
                    class={[
                      zoomed()
                        ? 'h-auto max-w-none'
                        : 'h-auto max-h-[75dvh] w-auto max-w-full object-contain lg:max-h-[calc(100dvh-9rem)]',
                      formOpen()
                        ? 'cursor-crosshair'
                        : zoomed()
                          ? 'cursor-zoom-out'
                          : 'cursor-zoom-in',
                    ]}
                    onClick={photoClick}
                    onMouseMove={photoMove}
                    onMouseLeave={() => setPointer(null)}
                  />
                  <Show when={formOpen() && pointer() !== null ? { y: pointer()! } : undefined}>
                    {(guide) => (
                      <div
                        class="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-primary"
                        style={{ top: `${guide().y * 100}%` }}
                      >
                        <span class="absolute right-2 -translate-y-1/2 badge badge-sm badge-primary">
                          {clickMarks(guide().y) === 'end'
                            ? m.source_page_mark_end()
                            : m.source_page_mark_here()}
                        </span>
                      </div>
                    )}
                  </Show>
                  <For each={bands()} keyed={(band) => band.id}>
                    {(band) => (
                      // An admin's way to a record from its entry; with a
                      // form open (and for anyone else) the clicks go
                      // through to the photo.
                      <a
                        href={
                          canEdit() && !formOpen() ? formHref(a(), String(band().id)) : undefined
                        }
                        class={[
                          'absolute inset-x-0 border-t-2 border-primary transition-colors',
                          lit(band().id) ? 'bg-primary/25' : 'bg-primary/10',
                          { 'pointer-events-none': !canEdit() || !!formOpen() },
                        ]}
                        style={{
                          top: `${band().top * 100}%`,
                          height: `${(band().bottom - band().top) * 100}%`,
                        }}
                        aria-label={
                          canEdit() && !formOpen()
                            ? `${m.record_edit_open()}: ${band().label}`
                            : undefined
                        }
                        aria-hidden={canEdit() && !formOpen() ? undefined : 'true'}
                        onMouseEnter={() => setHovered(band().id)}
                        onMouseLeave={() => setHovered(null)}
                      >
                        <span class="absolute top-1 left-1 badge max-w-[60%] badge-sm badge-primary">
                          <span class="truncate">{band().label}</span>
                        </span>
                      </a>
                    )}
                  </For>
                </div>
              </div>
            </section>

            <Show when={a().page.label}>
              <aside
                class="flex min-h-0 flex-col border-base-300 max-lg:border-t lg:w-[30rem] lg:shrink-0 lg:border-l"
                aria-label={m.source_page_column()}
              >
                <nav class="tabs-border tabs shrink-0 px-2" aria-label={m.source_page_column()}>
                  <a
                    href={pageHref(a().source.id, a().page.position)}
                    class={['tab gap-2', { 'tab-active': !search.record }]}
                    aria-current={search.record ? undefined : 'page'}
                  >
                    {m.source_page_records()}
                    <span class="badge badge-sm">{records()?.records.length ?? ''}</span>
                  </a>
                  <Show when={canEdit()}>
                    <a
                      href={formHref(a(), 'new')}
                      class={['tab gap-1', { 'tab-active': search.record === 'new' }]}
                      aria-current={search.record === 'new' ? 'page' : undefined}
                    >
                      <AddIcon class="size-4" aria-hidden="true" />
                      {m.records_add()}
                    </a>
                    <Show when={idParam(search.record)}>
                      <span class="tab-active tab" aria-current="page">
                        {m.record_edit_title()}
                      </span>
                    </Show>
                  </Show>
                </nav>
                <div class="min-h-0 flex-1 px-4 pt-4 lg:overflow-y-auto">
                  {/* Keyed: each record (and each next one) gets a fresh form. */}
                  <Show
                    when={canEdit() ? search.record : undefined}
                    keyed
                    fallback={
                      <Show
                        when={records()?.records.length}
                        fallback={<p class="text-base-content/60">{m.source_page_no_records()}</p>}
                      >
                        <div
                          class="transition-opacity"
                          style={{ opacity: isPending(records) ? 0.5 : 1 }}
                        >
                          <PageRecords
                            kind={records()!.kind}
                            rows={inPhotoOrder(records()!.records)}
                            hovered={hovered()}
                            onHover={setHovered}
                            editHref={
                              canEdit() ? (row) => formHref(a(), String(row.id)) : undefined
                            }
                          />
                        </div>
                      </Show>
                    }
                  >
                    {(record) => (
                      <RecordEditForm
                        panel
                        id={idParam(record) ?? undefined}
                        after={idParam(search.after) ?? undefined}
                        returnTo={here(a())}
                        cancelHref={pageHref(a().source.id, a().page.position)}
                        marks={marksClicked()}
                        onClearMarks={clearMarks}
                      />
                    )}
                  </Show>
                </div>
              </aside>
            </Show>
          </>
        )}
      </Show>
    </main>
  );
}

// A band's label: the entry's number, if it has one, and who it is about.
const bandLabel = (kind: RecordKind, row: RecordRow) =>
  [row.entryNo, recordTitle(kind, row)].filter(Boolean).join(' · ');

// Where on the photo an event is, as a fraction of its height from the top;
// null when the photo has no height yet.
function heightAt(event: MouseEvent & { currentTarget: HTMLImageElement }): number | null {
  const box = event.currentTarget.getBoundingClientRect();
  if (!(box.height > 0)) return null;
  return Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
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
