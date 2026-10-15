import { Show } from 'solid-js';
import EditIcon from '~icons/ri/pencil-line';

/**
 * A table row's edit link, in a narrow last column of its own; nothing
 * without `href` (for those who may not edit). The header's matching cell is
 * an <th> holding only a screen-reader label.
 */
export default function EditLinkCell(props: { href?: string; label: string }) {
  return (
    <Show when={props.href}>
      {(href) => (
        <td class="w-0 text-right">
          <a
            href={href()}
            class="btn btn-square btn-ghost btn-xs"
            aria-label={props.label}
            title={props.label}
          >
            <EditIcon class="size-4" aria-hidden="true" />
          </a>
        </td>
      )}
    </Show>
  );
}
