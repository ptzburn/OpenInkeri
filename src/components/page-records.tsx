// The records transcribed from one page, compact enough for the column
// beside its photo (src/routes/sources/[id]/pages/[n].tsx): a line naming
// each record by who it is about, and one with its date and the people
// around them. The records list's wide table is ./record-table.tsx.
import { For, Show } from 'solid-js';
import EditIcon from '~icons/ri/pencil-line';

import type { RecordRow } from '~/data/records';
import { formatPartialDate, localName } from '~/lib/format';
import type { RecordKind } from '~/lib/record-kinds';
import { m } from '~/paraglide/messages.js';

/**
 * The list of `rows`, all of `kind`. With `editHref` (admins), each opens
 * its form; `selected` marks the one whose form is open.
 */
export default function PageRecords(props: {
  kind: RecordKind;
  rows: RecordRow[];
  selected?: number;
  editHref?: (row: RecordRow) => string;
}) {
  return (
    <ol class="flex flex-col">
      <For each={props.rows} keyed={(row) => row.id}>
        {(row) => (
          <li
            class={[
              'flex items-start gap-2 border-b border-base-200 py-2 last:border-b-0',
              { 'bg-base-200': row().id === props.selected, 'text-base-content/50': row().lost },
            ]}
          >
            <div class="flex min-w-0 flex-1 flex-col gap-0.5 px-1">
              <span class="flex flex-wrap items-center gap-1 font-medium">
                <Show when={row().lost}>
                  <span class="badge badge-soft badge-sm">{m.records_lost()}</span>
                </Show>
                {title(props.kind, row())}
              </span>
              <Show when={details(props.kind, row())}>
                {(text) => <span class="text-sm text-base-content/70">{text()}</span>}
              </Show>
            </div>
            <Show when={props.editHref}>
              {(href) => (
                <a
                  href={href()(row())}
                  class="btn btn-square btn-ghost btn-sm"
                  aria-label={m.record_edit_open()}
                  title={m.record_edit_open()}
                >
                  <EditIcon class="size-4" aria-hidden="true" />
                </a>
              )}
            </Show>
          </li>
        )}
      </For>
    </ol>
  );
}

const names = (...people: ({ ru: string | null; fi: string | null } | null)[]) =>
  people
    .map((p) => localName(p))
    .filter(Boolean)
    .join(', ');

// Who the record is about: the child, the couple, the deceased, the
// household or farm.
function title(kind: RecordKind, row: RecordRow): string {
  switch (kind) {
    case 'baptisms':
      return localName(row.child) || '—';
    case 'marriages':
      return [localName(row.groom), localName(row.bride)].filter(Boolean).join(' — ') || '—';
    case 'deaths':
      return localName(row.deceased) || '—';
    default:
      return (
        [row.holding?.holdingNo, localName(row.village) || row.villageAsWritten]
          .filter(Boolean)
          .join(' · ') || '—'
      );
  }
}

// The date and the people around them: parents, age, the household's people.
function details(kind: RecordKind, row: RecordRow): string {
  const date = formatPartialDate(row.date);
  switch (kind) {
    case 'baptisms':
      return [date, names(row.father, row.mother)].filter(Boolean).join(' · ');
    case 'deaths':
      return [date, row.deceased?.age].filter(Boolean).join(' · ');
    case 'marriages':
      return date;
    default:
      return names(...row.members);
  }
}
