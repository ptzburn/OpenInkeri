// The records table, as the records list shows one kind's page of it and a
// source's page photo shows the records transcribed from that page: one
// row per record, with the kind's columns and, for those who may edit, an
// edit link.
import { For, Show } from 'solid-js';
import { dynamic } from '@solidjs/web';
import TwinsIcon from '~icons/ri/group-line';
import TripletsIcon from '~icons/ri/team-line';
import UnwedIcon from '~icons/ri/link-unlink';

import EditLinkCell from '~/components/edit-link-cell';
import { ActionsHeader, TableBox } from '~/components/list-page';
import type { RecordRow } from '~/data/records';
import { formatPartialDate, localName, localTerm } from '~/lib/format';
import type { RecordKind } from '~/lib/record-kinds';
import { m } from '~/paraglide/messages.js';

/** The table of `rows`, all of `kind`; `editHref` gives a row's edit link, for those who may edit. */
export default function RecordTable(props: {
  kind: RecordKind;
  rows: RecordRow[];
  canEdit: boolean;
  editHref: (row: RecordRow) => string;
}) {
  return (
    <TableBox>
      <thead>
        <tr>
          <For each={columns[props.kind]}>{(label) => <th>{label()}</th>}</For>
          <ActionsHeader when={props.canEdit} />
        </tr>
      </thead>
      <tbody>
        {/* Keyed by id: a row already shown keeps its DOM across pages
            and searches. */}
        <For each={props.rows} keyed={(row) => row.id}>
          {(row) => (
            <RecordTableRow
              kind={props.kind}
              row={row()}
              editHref={props.canEdit ? props.editHref(row()) : undefined}
            />
          )}
        </For>
      </tbody>
    </TableBox>
  );
}

// The columns of each kind's table, before the edit link's.
const columns: Record<RecordKind, (() => string)[]> = {
  baptisms: [
    m.records_col_entry_no,
    m.records_col_born,
    m.records_col_baptised,
    m.records_col_child,
    m.records_col_father,
    m.records_col_mother,
    m.records_col_village,
    m.records_col_note,
  ],
  marriages: [
    m.records_col_entry_no,
    m.records_col_married,
    m.records_col_groom,
    m.records_col_bride,
    m.records_col_note,
  ],
  deaths: [
    m.records_col_entry_no,
    m.records_col_died,
    m.records_col_buried,
    m.records_col_deceased,
    m.records_col_age,
    m.records_col_death_place,
    m.records_col_cause,
    m.records_col_note,
  ],
  households: [m.records_col_village, m.records_col_household, m.records_col_people],
  taxpayers: [
    m.records_col_estate,
    m.records_col_village,
    m.records_col_farm,
    m.records_col_people,
  ],
};

// A status shown as an icon beside the name, its meaning in the tooltip and
// the accessible name, so a row of a parish register stays one line.
function StatusIcon(props: { icon: typeof TwinsIcon; label: string; class?: string }) {
  const Icon = dynamic(() => props.icon);
  return (
    <span class={['inline-flex shrink-0 text-base-content/70', props.class]} title={props.label}>
      <Icon class="size-4" role="img" aria-label={props.label} />
    </span>
  );
}

function RecordTableRow(props: { kind: RecordKind; row: RecordRow; editHref?: string }) {
  const entryNo = () => <td class="tabular-nums whitespace-nowrap">{props.row.entryNo}</td>;
  const date = (value: string | null) => (
    <td class="tabular-nums whitespace-nowrap">{formatPartialDate(value)}</td>
  );
  const lost = () => (
    <Show when={props.row.lost}>
      <span class="badge shrink-0 badge-soft badge-sm whitespace-nowrap">{m.records_lost()}</span>
    </Show>
  );
  const stillborn = () => (
    <Show when={props.row.stillborn}>
      <span class="text-base-content/60 italic">{m.records_stillborn()}</span>
    </Show>
  );
  const note = () => (
    <td class="max-w-64 truncate text-base-content/70" title={props.row.note ?? undefined}>
      {props.row.note}
    </td>
  );

  return (
    <tr class={props.row.lost ? 'text-base-content/50' : undefined}>
      <Show when={props.kind === 'baptisms'}>
        {entryNo()}
        {date(props.row.birthDate)}
        {date(props.row.date)}
        <td>
          <div class="flex flex-wrap items-center gap-1">
            {lost()}
            {stillborn()}
            <span class="font-medium">{localName(props.row.child)}</span>
            <Show when={props.row.multipleBirth}>
              {(count) => (
                <Show
                  when={count() >= 3}
                  fallback={
                    <StatusIcon icon={TwinsIcon} label={m.records_twins()} class="text-info" />
                  }
                >
                  <StatusIcon icon={TripletsIcon} label={m.records_triplets()} class="text-info" />
                </Show>
              )}
            </Show>
            <Show when={props.row.illegitimate}>
              <StatusIcon icon={UnwedIcon} label={m.records_illegitimate()} />
            </Show>
          </div>
        </td>
        <td>{localName(props.row.father)}</td>
        <td>{localName(props.row.mother)}</td>
        <td>
          <Place place={props.row.village} asWritten={props.row.villageAsWritten} />
        </td>
        {note()}
      </Show>
      <Show when={props.kind === 'marriages'}>
        {entryNo()}
        {date(props.row.date)}
        <td>
          {lost()}
          <Spouse person={props.row.groom} />
        </td>
        <td>
          <Spouse person={props.row.bride} />
        </td>
        {note()}
      </Show>
      <Show when={props.kind === 'deaths'}>
        {entryNo()}
        {date(props.row.date)}
        {date(props.row.burialDate)}
        <td>
          <div class="flex flex-wrap items-center gap-1">
            {lost()}
            {stillborn()}
            <span class="font-medium">{localName(props.row.deceased)}</span>
          </div>
        </td>
        <td class="whitespace-nowrap">{props.row.deceased?.age}</td>
        <td>
          <Place place={props.row.village} asWritten={props.row.villageAsWritten} />
        </td>
        <td>{props.row.cause}</td>
        {note()}
      </Show>
      <Show when={props.kind === 'households'}>
        <td>
          {lost()}
          <Place place={props.row.village} asWritten={props.row.villageAsWritten} />
        </td>
        <td class="tabular-nums">{props.row.holding?.holdingNo}</td>
        <td>
          <Members members={props.row.members} />
        </td>
      </Show>
      <Show when={props.kind === 'taxpayers'}>
        <td>{props.row.holding?.estateText}</td>
        <td>
          {lost()}
          <Place place={props.row.village} asWritten={props.row.villageAsWritten} />
        </td>
        <td class="tabular-nums">{props.row.holding?.holdingNo}</td>
        <td>
          <Members members={props.row.members} />
        </td>
      </Show>
      <EditLinkCell href={props.editHref} label={m.record_edit_open()} />
    </tr>
  );
}

type Names = { ru: string | null; fi: string | null };

// The canonical place; the spelling in the source shows on hover when it
// differs, and stands in for the place when none was resolved.
function Place(props: { place: Names | null; asWritten: string | null }) {
  return (
    <span
      title={
        props.asWritten && props.asWritten !== props.place?.ru
          ? m.records_as_written({ text: props.asWritten })
          : undefined
      }
    >
      {localName(props.place) || props.asWritten}
    </span>
  );
}

// A bride or groom: the name, then their age and where they lived.
function Spouse(props: { person: RecordRow['groom'] }) {
  return (
    <Show when={props.person}>
      {(p) => (
        <div class="flex flex-col">
          <span class="font-medium">{localName(p())}</span>
          <span class="text-xs text-base-content/60">
            <Show when={p().age}>{(age) => m.records_age({ age: age() })}</Show>
            <Show when={p().age && (p().residence || p().residenceAsWritten)}> · </Show>
            <Place place={p().residence} asWritten={p().residenceAsWritten} />
          </span>
        </div>
      )}
    </Show>
  );
}

// A household's or farm's people, one a line: the name, how they belong to
// it, and what the list says of them.
function Members(props: { members: RecordRow['members'] }) {
  return (
    <ul class="flex flex-col gap-0.5">
      <For each={props.members} keyed={(p) => p.id}>
        {(p) => (
          <li>
            <span class="font-medium">{localName(p())}</span>
            <Show when={localTerm(p().relation) || p().relationAsWritten}>
              {(relation) => (
                <span
                  class="text-base-content/60"
                  title={
                    p().relation && p().relationAsWritten !== p().relation?.ru
                      ? (p().relationAsWritten ?? undefined)
                      : undefined
                  }
                >
                  {` — ${relation()}`}
                </span>
              )}
            </Show>
            <Show when={p().hasWife}>
              <span class="text-base-content/60">{`, ${m.records_with_wife()}`}</span>
            </Show>
            <Show when={p().birthDate || p().deathDate}>
              <span class="text-xs whitespace-nowrap text-base-content/60 tabular-nums">
                {` · ${formatPartialDate(p().birthDate)} – ${formatPartialDate(p().deathDate)}`}
              </span>
            </Show>
            <Show when={p().note}>
              {(note) => <span class="block text-xs text-base-content/60">{note()}</span>}
            </Show>
          </li>
        )}
      </For>
    </ul>
  );
}
