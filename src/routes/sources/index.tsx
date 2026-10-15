import { Title } from '@solidjs/meta';
import { useIsRouting } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo, isPending } from 'solid-js';
import { env } from 'virtual:env/client';
import AddIcon from '~icons/ri/add-line';

import type { QueryData } from '~/lib/query-data';
import { localName } from '~/lib/format';
import { isRecordKind } from '~/lib/record-kinds';
import { recordKindLabels, sourceLanguageLabels } from '~/components/labels';
import EditLinkCell from '~/components/edit-link-cell';
import { getCurrentUser } from '~/data/session';
import { type SourceRow, getSources } from '~/data/sources';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Signed-in users only: getSources redirects a signed-out visitor to
// sign-in (src/data/sources.ts). A few dozen sources at most: no search and
// no pages.
export const route = defineFileRoute('/sources/', {
  preload: () => void getSources(),
});

export default function Sources() {
  const list = createMemo((): Promise<QueryData<typeof getSources>> => getSources(), {
    name: 'sources-list',
  });
  // The list dims while it reloads (after a save) and while a link from
  // it is opening the next page, so a click shows at once.
  const isRouting = useIsRouting();
  const busy = () => isRouting() || isPending(list);
  // Admins add and edit sources; the server functions check the role
  // again, so this only decides what is offered.
  const me = createMemo(() => getCurrentUser(), { name: 'sources-me' });
  const canEdit = () => !!me()?.isAdmin;

  return (
    <main class="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-8">
      <Title>{`${m.sources_title()} - ${env.VITE_APP_NAME}`}</Title>
      <header class="flex flex-wrap items-center gap-2">
        <h1 class="text-2xl font-bold">{m.sources_title()}</h1>
        <Show when={canEdit()}>
          <a href={paths.sources.new()} class="btn ml-auto btn-sm btn-primary">
            <AddIcon class="size-4" aria-hidden="true" />
            {m.sources_add()}
          </a>
        </Show>
      </header>
      <div class="transition-opacity" style={{ opacity: busy() ? 0.5 : 1 }}>
        <Show
          when={list()?.length}
          fallback={<p class="py-6 text-center text-base-content/60">{m.sources_empty()}</p>}
        >
          <div class="overflow-x-auto rounded-box border border-base-300">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>{m.sources_col_title()}</th>
                  <th>{m.sources_col_kind()}</th>
                  <th>{m.sources_col_parish()}</th>
                  <th>{m.sources_col_years()}</th>
                  <th>{m.sources_col_language()}</th>
                  <th class="text-right">{m.sources_col_records()}</th>
                  <th>{m.form_note()}</th>
                  <Show when={canEdit()}>
                    <th>
                      <span class="sr-only">{m.records_col_actions()}</span>
                    </th>
                  </Show>
                </tr>
              </thead>
              <tbody>
                <For each={list() ?? []} keyed={(source) => source.id}>
                  {(source) => (
                    <SourceTableRow
                      source={source()}
                      editHref={canEdit() ? paths.sources(source().id).edit() : undefined}
                    />
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>
    </main>
  );
}

// "1892–1919", or the one year there is.
const years = (from: number | null, to: number | null) =>
  from && to && from !== to ? `${from}–${to}` : String(from ?? to ?? '');

function SourceTableRow(props: { source: SourceRow; editHref?: string }) {
  const language = () => props.source.language;
  return (
    <tr>
      <td>
        <span class="font-medium">{props.source.title}</span>
        <Show when={props.source.archiveReference}>
          {(reference) => <span class="block text-xs text-base-content/60">{reference()}</span>}
        </Show>
      </td>
      <td class="whitespace-nowrap">{recordKindLabels[props.source.kind]()}</td>
      <td>{localName(props.source.parish)}</td>
      <td class="whitespace-nowrap tabular-nums">
        {years(props.source.yearFrom, props.source.yearTo)}
      </td>
      <td>
        {(() => {
          const code = language();
          return code && code in sourceLanguageLabels
            ? sourceLanguageLabels[code as keyof typeof sourceLanguageLabels]()
            : code;
        })()}
      </td>
      {/* The count opens the records of the source's type. */}
      <td class="text-right tabular-nums">
        <Show when={props.source.records && isRecordKind(props.source.kind)} fallback={0}>
          <a
            href={paths.records({
              kind: props.source.kind === 'baptisms' ? undefined : props.source.kind,
            })}
            class="link"
          >
            {props.source.records}
          </a>
        </Show>
      </td>
      <td class="max-w-64 truncate text-base-content/70" title={props.source.note ?? undefined}>
        {props.source.note}
      </td>
      <EditLinkCell href={props.editHref} label={m.source_edit_open()} />
    </tr>
  );
}
