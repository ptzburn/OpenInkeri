import { Title } from '@solidjs/meta';
import { useIsRouting } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo, isPending } from 'solid-js';
import { env } from 'virtual:env/client';
import AddIcon from '~icons/ri/add-line';
import EditIcon from '~icons/ri/pencil-line';

import PlacesTabs from '~/components/places-tabs';
import { getCurrentUser } from '~/lib/account';
import { type ParishList, type ParishRow, getParishList } from '~/lib/parishes';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Signed-in users only: getParishList redirects a signed-out visitor to
// sign-in (src/lib/parishes.ts). A few dozen parishes at most: no search
// and no pages.
export const route = defineFileRoute('/places/parishes/', {
  preload: () => void getParishList(),
});

export default function Parishes() {
  const list = createMemo((): Promise<ParishList> => getParishList(), {
    name: 'parishes-list',
  });
  // The list dims while it reloads (after a save) and while a link from
  // it is opening the next page, so a click shows at once.
  const isRouting = useIsRouting();
  const busy = () => isRouting() || isPending(list);
  // Admins add and edit parishes; the server functions check the role
  // again, so this only decides what is offered.
  const me = createMemo(() => getCurrentUser(), { name: 'parishes-me' });
  const canEdit = () => !!me()?.isAdmin;

  return (
    <main class="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-8">
      <Title>{`${m.parishes_title()} - ${env.VITE_APP_NAME}`}</Title>
      <header class="flex flex-wrap items-center gap-2">
        <h1 class="text-2xl font-bold">{m.places_title()}</h1>
        <Show when={canEdit()}>
          <a href={paths.places.parishes.new()} class="btn ml-auto btn-sm btn-primary">
            <AddIcon class="size-4" aria-hidden="true" />
            {m.parishes_add()}
          </a>
        </Show>
      </header>
      <PlacesTabs current="parishes" />
      <div class="transition-opacity" style={{ opacity: busy() ? 0.5 : 1 }}>
        <Show
          when={list()?.length}
          fallback={<p class="py-6 text-center text-base-content/60">{m.parishes_empty()}</p>}
        >
          <div class="overflow-x-auto rounded-box border border-base-300">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>{m.villages_col_ru()}</th>
                  <th>{m.villages_col_fi()}</th>
                  <th class="text-right">{m.parishes_col_villages()}</th>
                  <th class="text-right">{m.parishes_col_sources()}</th>
                  <th>{m.place_edit_note()}</th>
                  <Show when={canEdit()}>
                    <th>
                      <span class="sr-only">{m.records_col_actions()}</span>
                    </th>
                  </Show>
                </tr>
              </thead>
              <tbody>
                <For each={list() ?? []} keyed={(parish) => parish.id}>
                  {(parish) => (
                    <ParishTableRow
                      parish={parish()}
                      editHref={canEdit() ? paths.places.parishes(parish().id).edit() : undefined}
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

function ParishTableRow(props: { parish: ParishRow; editHref?: string }) {
  return (
    <tr>
      <td class="font-medium">{props.parish.nameRu}</td>
      <td>{props.parish.nameFi}</td>
      {/* The count opens the villages list narrowed to this parish. */}
      <td class="text-right tabular-nums">
        <Show when={props.parish.villages} fallback={0}>
          <a
            href={paths.places.villages({ parish: String(props.parish.id) })}
            class="link"
            title={m.parishes_show_villages({ parish: props.parish.nameRu })}
          >
            {props.parish.villages}
          </a>
        </Show>
      </td>
      <td class="text-right tabular-nums">{props.parish.sources}</td>
      <td class="max-w-64 truncate text-base-content/70" title={props.parish.note ?? undefined}>
        {props.parish.note}
      </td>
      {/* Admins only: the parish's edit link, in its own narrow column. */}
      <Show when={props.editHref}>
        {(href) => (
          <td class="w-0 text-right">
            <a
              href={href()}
              class="btn btn-square btn-ghost btn-xs"
              aria-label={m.parish_edit_open()}
              title={m.parish_edit_open()}
            >
              <EditIcon class="size-4" aria-hidden="true" />
            </a>
          </td>
        )}
      </Show>
    </tr>
  );
}
