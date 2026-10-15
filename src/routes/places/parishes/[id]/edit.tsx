import { Title } from '@solidjs/meta';
import type { RouteProps } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show } from 'solid-js';
import { env } from 'virtual:env/client';
import BackIcon from '~icons/ri/arrow-left-line';

import ParishEditForm from '~/components/parish-edit-form';
import { getParishEdit } from '~/lib/parishes';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// A parish id from the URL, or null when it can't be one (then the page
// says so without asking the server).
const parishId = (id: string | undefined) => {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Admins only: getParishEdit redirects anyone else (signed out to sign-in,
// others home).
export const route = defineFileRoute('/places/parishes/:id/edit', {
  preload: ({ params }) => {
    const id = parishId(params.id);
    if (id) void getParishEdit(id);
  },
});

export default function EditParish(props: RouteProps<'/places/parishes/:id/edit'>) {
  const id = () => parishId(props.params.id);

  return (
    <main class="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-8">
      <Title>{`${m.parish_edit_title()} - ${env.VITE_APP_NAME}`}</Title>
      <a href={paths.places.parishes()} class="btn self-start btn-ghost btn-sm">
        <BackIcon class="size-4" aria-hidden="true" />
        {m.parish_edit_back()}
      </a>
      <h1 class="text-2xl font-bold">{m.parish_edit_title()}</h1>
      <Show when={id()} fallback={<p>{m.parish_edit_missing()}</p>}>
        {(shown) => <ParishEditForm id={shown()} cancelHref={paths.places.parishes()} />}
      </Show>
    </main>
  );
}
