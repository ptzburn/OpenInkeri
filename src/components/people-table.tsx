import type { JSX } from '@solidjs/web';
import { For, Show } from 'solid-js';

import { sexLabels } from '~/components/labels';
import type { PersonRow } from '~/data/people';
import { lifespan, localName } from '~/lib/format';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

/** People in a table: name (a link to their page), sex, life years and mentions. */
export default function PeopleTable(props: {
  people: PersonRow[];
  /** A last column's content for each row (the link page's Link button). */
  action?: (row: PersonRow) => JSX.Element;
}) {
  return (
    <div class="overflow-x-auto rounded-box border border-base-300">
      <table class="table table-sm">
        <thead>
          <tr>
            <th>{m.people_col_name()}</th>
            <th>{m.record_edit_sex()}</th>
            <th>{m.people_col_lifespan()}</th>
            <th class="text-right">{m.people_col_mentions()}</th>
            <Show when={props.action}>
              <th>
                <span class="sr-only">{m.records_col_actions()}</span>
              </th>
            </Show>
          </tr>
        </thead>
        <tbody>
          <For each={props.people} keyed={(row) => row.id}>
            {(row) => (
              <tr>
                <td>
                  <a href={paths.people(row().id)()} class="link font-medium link-hover">
                    {localName(row().name)}
                  </a>
                </td>
                <td>{row().sex ? sexLabels[row().sex!]() : ''}</td>
                <td class="whitespace-nowrap tabular-nums">
                  {lifespan(row().birthDate, row().deathDate)}
                </td>
                <td class="text-right tabular-nums">{row().mentions}</td>
                <Show when={props.action}>
                  {(action) => <td class="w-0 text-right">{action()(row())}</td>}
                </Show>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
