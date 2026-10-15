import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

/** The Places section's tabs, above the villages and the parishes lists. */
export default function PlacesTabs(props: { current: 'villages' | 'parishes' }) {
  return (
    <nav aria-label={m.places_tabs_label()} class="tabs tabs-border">
      <a
        href={paths.places.villages()}
        class={['tab', { 'tab-active': props.current === 'villages' }]}
      >
        {m.villages_title()}
      </a>
      <a
        href={paths.places.parishes()}
        class={['tab', { 'tab-active': props.current === 'parishes' }]}
      >
        {m.parishes_title()}
      </a>
    </nav>
  );
}
