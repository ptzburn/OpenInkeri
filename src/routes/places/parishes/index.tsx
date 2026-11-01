import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo } from 'solid-js';

import type { QueryData } from '~/lib/query-data';
import { finnishNamesShown } from '~/lib/format';
import EditLinkCell from '~/components/edit-link-cell';
import ListPage, {
  ActionsHeader,
  AddLink,
  ListBody,
  NameHeaders,
  TableBox,
  useCanEdit,
  useListBusy,
} from '~/components/list-page';
import PlacesTabs from '~/components/places-tabs';
import { type ParishRow, getParishes } from '~/data/parishes';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Signed-in users only: getParishes redirects a signed-out visitor to
// sign-in (src/data/parishes.ts). A few dozen parishes at most: no search
// and no pages.
export const route = defineFileRoute('/places/parishes/', {
  preload: () => void getParishes(),
});

export default function Parishes() {
  const list = createMemo((): Promise<QueryData<typeof getParishes>> => getParishes(), {
    name: 'parishes-list',
  });
  const busy = useListBusy(list);
  const canEdit = useCanEdit('parishes-me');

  return (
    <ListPage
      title={m.parishes_title()}
      heading={m.places_title()}
      aside={
        <Show when={canEdit()}>
          <AddLink href={paths.places.parishes.new()} label={m.parishes_add()} />
        </Show>
      }
    >
      <PlacesTabs current="parishes" />
      <ListBody busy={busy()} count={list()?.length} empty={m.parishes_empty()}>
        <TableBox>
          <thead>
            <tr>
              <NameHeaders />
              <th class="text-right">{m.parishes_col_villages()}</th>
              <th class="text-right">{m.parishes_col_sources()}</th>
              <th>{m.form_note()}</th>
              <ActionsHeader when={canEdit()} />
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
        </TableBox>
      </ListBody>
    </ListPage>
  );
}

function ParishTableRow(props: { parish: ParishRow; editHref?: string }) {
  return (
    <tr>
      <td class="font-medium">{props.parish.nameRu}</td>
      <Show when={finnishNamesShown()}>
        <td>{props.parish.nameFi}</td>
      </Show>
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
      <EditLinkCell href={props.editHref} label={m.parish_edit_open()} />
    </tr>
  );
}
