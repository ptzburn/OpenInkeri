import { Title } from '@solidjs/meta';
import type { RouteProps } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo, isPending } from 'solid-js';
import { env } from 'virtual:solid-env/client';

import type { QueryData } from '~/lib/query-data';
import { recordKindLabels } from '~/components/labels';
import { getSourcePages } from '~/data/sources';
import { localName, pageName, yearSpan } from '~/lib/format';
import { photoUrl } from '~/lib/photos';
import { idParam } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import type { Crumbs } from '~/lib/breadcrumbs';

// A source's page photographs, as thumbnails in the source's order; each
// opens its page (./pages/[n].tsx). Signed-in users only: getSourcePages
// redirects a signed-out visitor to sign-in, and the photos' route
// (src/routes/api/photos) refuses one.
const crumbs: Crumbs = async ({ params }) => {
  const id = idParam(params.id);
  const source = id ? await getSourcePages(id) : null;
  return [
    { label: m.sources_title(), href: paths.sources() },
    ...(source ? [{ label: source.title }] : []),
  ];
};

export const route = defineFileRoute('/sources/:id/', {
  info: { crumbs },
  preload: ({ params }) => {
    const id = idParam(params.id);
    if (id) void getSourcePages(id);
  },
});

export default function SourcePages(props: RouteProps<'/sources/:id/'>) {
  const source = createMemo(
    (): Promise<QueryData<typeof getSourcePages>> | null => {
      const id = idParam(props.params.id);
      return id ? getSourcePages(id) : null;
    },
    { name: 'source-pages' },
  );

  return (
    <main class="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-8">
      <Show when={source()} fallback={<p>{m.source_missing()}</p>}>
        {(s) => (
          <div
            class="flex flex-col gap-4 transition-opacity"
            style={{ opacity: isPending(source) ? 0.5 : 1 }}
          >
            <Title>{`${s().title} - ${env.VITE_APP_NAME}`}</Title>
            <header class="flex flex-col gap-1">
              <h1 class="text-2xl font-bold">{s().title}</h1>
              <p class="flex flex-wrap gap-x-3 text-sm text-base-content/70">
                <span>{recordKindLabels[s().kind]()}</span>
                <Show when={localName(s().parish)}>{(name) => <span>{name()}</span>}</Show>
                <span class="tabular-nums">{yearSpan(s().yearFrom, s().yearTo)}</span>
                <Show when={s().archiveReference}>{(reference) => <span>{reference()}</span>}</Show>
              </p>
            </header>
            <Show
              when={s().pages.length}
              fallback={<p class="py-6 text-center text-base-content/60">{m.source_no_pages()}</p>}
            >
              <ul class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
                <For each={s().pages} keyed={(page) => page.position}>
                  {(page) => (
                    <li>
                      <a
                        href={paths.sources(s().id).pages(String(page().position))()}
                        class="group flex flex-col items-center gap-1 rounded-box p-1 hover:bg-base-200"
                      >
                        <img
                          src={photoUrl('thumbs', page().key)}
                          alt={pageName(page().position, page().label)}
                          width={page().width}
                          height={page().height}
                          loading="lazy"
                          class="h-auto w-full rounded-sm border border-base-300 bg-base-200"
                        />
                        <span class="text-xs text-base-content/70 tabular-nums">
                          {pageName(page().position, page().label)}
                        </span>
                      </a>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        )}
      </Show>
    </main>
  );
}
