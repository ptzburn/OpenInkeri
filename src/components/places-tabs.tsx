import { Show, createMemo } from 'solid-js';

import type { QueryData } from '~/lib/query-data';
import { getPlaceTotals } from '~/data/places';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

/**
 * The Places section's tabs, above the villages and the parishes lists,
 * each with how many there are in all (not how many a search shows: the
 * list's results line says that).
 */
export default function PlacesTabs(props: { current: 'villages' | 'parishes' }) {
  const totals = createMemo((): Promise<QueryData<typeof getPlaceTotals>> => getPlaceTotals(), {
    name: 'place-totals',
  });
  return (
    <nav aria-label={m.places_tabs_label()} class="tabs tabs-border">
      <a
        href={paths.places.villages()}
        class={['tab gap-2', { 'tab-active': props.current === 'villages' }]}
      >
        {m.villages_title()}
        <Show when={totals()}>{(n) => <span class="badge badge-sm">{n().localities}</span>}</Show>
      </a>
      <a
        href={paths.places.parishes()}
        class={['tab gap-2', { 'tab-active': props.current === 'parishes' }]}
      >
        {m.parishes_title()}
        <Show when={totals()}>{(n) => <span class="badge badge-sm">{n().parishes}</span>}</Show>
      </a>
    </nav>
  );
}
