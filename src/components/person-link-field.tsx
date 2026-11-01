import { For, Loading, Show, createMemo, createSignal, onSettled } from 'solid-js';

import { getPeople } from '~/data/people';
import type { QueryData } from '~/lib/query-data';
import { FIELD_MAX } from '~/lib/field-limits';
import { lifespan, localName } from '~/lib/format';
import { m } from '~/paraglide/messages.js';

/**
 * Who a mention in a record is, decided as the record is saved: nobody yet
 * (the default), a new person made from the mention, or someone already
 * here, found by name. Posts "<prefix>.personId" as '', 'new' or the id;
 * the save links the mention (src/data/records.ts). The search is a plain
 * input (the record form is a form already), searching as you type; before
 * JavaScript loads the first two choices still work.
 */
export default function PersonLinkField(props: { prefix: string }) {
  const name = () => `${props.prefix}.personId`;
  const [search, setSearch] = createSignal('', { name: 'person-link-search' });
  let typing: ReturnType<typeof setTimeout> | undefined;
  // A search still waiting when the field goes is dropped with it.
  onSettled(() => () => clearTimeout(typing));
  const found = createMemo(
    (): Promise<QueryData<typeof getPeople>> | null => {
      const q = search().trim();
      return q ? getPeople(q, 1) : null;
    },
    { name: 'person-link-found' },
  );

  return (
    <details class="text-sm sm:col-span-2 lg:col-span-4">
      <summary class="cursor-pointer">{m.record_edit_link_person()}</summary>
      <div class="mt-2 flex flex-col gap-2">
        <label class="label cursor-pointer gap-2">
          <input type="radio" name={name()} value="" checked class="radio radio-sm" />
          {m.record_edit_person_none()}
        </label>
        <label class="label cursor-pointer gap-2">
          <input type="radio" name={name()} value="new" class="radio radio-sm" />
          {m.link_new()}
        </label>
        <label class="input input-sm w-full max-w-md">
          <input
            type="search"
            aria-label={m.people_search_label()}
            placeholder={m.people_search_placeholder()}
            maxlength={FIELD_MAX.search}
            onInput={(e) => {
              const value = e.currentTarget.value;
              clearTimeout(typing);
              typing = setTimeout(() => setSearch(value), 300);
            }}
          />
        </label>
        <Show when={search().trim()}>
          <Loading
            fallback={<span class="loading loading-xs loading-spinner" aria-hidden="true" />}
          >
            <Show
              when={found()?.people.length}
              fallback={
                <p class="text-base-content/60">{m.people_no_match({ search: search().trim() })}</p>
              }
            >
              <For each={found()?.people ?? []}>
                {(row) => (
                  <label class="label cursor-pointer gap-2">
                    <input type="radio" name={name()} value={row.id} class="radio radio-sm" />
                    <span class="font-medium">{localName(row.name)}</span>
                    <span class="text-base-content/60 tabular-nums">
                      {lifespan(row.birthDate, row.deathDate)}
                    </span>
                    <span class="text-base-content/60">
                      {m.people_col_mentions()}: {row.mentions}
                    </span>
                  </label>
                )}
              </For>
            </Show>
          </Loading>
        </Show>
      </div>
    </details>
  );
}
