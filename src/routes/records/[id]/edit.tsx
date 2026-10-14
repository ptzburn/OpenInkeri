import { Title } from '@solidjs/meta';
import { type RouteProps, useNavigate, useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show } from 'solid-js';
import { env } from 'virtual:env/client';
import BackIcon from '~icons/ri/arrow-left-line';

import BaptismEditForm from '~/components/baptism-edit-form';
import { getBaptismEdit, getEditOptions } from '~/lib/record-edit';
import { stringParams } from '~/lib/search';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// A record id from the URL, or null when it can't be one (then the page says
// so without asking the server).
const recordId = (id: string | undefined) => {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Admins only: getBaptismEdit redirects anyone else (signed out to sign-in,
// others home). The list's ?kind=, ?q= and ?page= ride along, so saving or
// cancelling returns to the same place in the list.
export const route = defineFileRoute('/records/:id/edit', {
  search: stringParams('kind', 'q', 'page'),
  preload: ({ params }) => {
    const id = recordId(params.id);
    if (id) {
      void getBaptismEdit(id);
      void getEditOptions();
    }
  },
});

export default function EditRecord(props: RouteProps<'/records/:id/edit'>) {
  const [search] = useSearchParams(paths.records);
  const navigate = useNavigate();
  const listHref = () => paths.records({ kind: search.kind, q: search.q, page: search.page });
  const id = () => recordId(props.params.id);

  return (
    <main class="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-8">
      <Title>{`${m.record_edit_title()} - ${env.VITE_APP_NAME}`}</Title>
      <a href={listHref()} class="btn self-start btn-ghost btn-sm">
        <BackIcon class="size-4" aria-hidden="true" />
        {m.record_edit_back()}
      </a>
      <h1 class="text-2xl font-bold">{m.record_edit_title()}</h1>
      <Show when={id()} fallback={<p>{m.record_edit_missing()}</p>}>
        {(shown) => (
          <BaptismEditForm
            id={shown()}
            cancelHref={listHref()}
            onSaved={() => navigate(listHref())}
          />
        )}
      </Show>
    </main>
  );
}
