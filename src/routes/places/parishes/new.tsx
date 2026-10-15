import { Title } from '@solidjs/meta';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show, createMemo } from 'solid-js';
import { env } from 'virtual:env/client';
import BackIcon from '~icons/ri/arrow-left-line';

import ParishEditForm from '~/components/parish-edit-form';
import { requireAdmin } from '~/lib/account';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Admins only: the form starts empty, so requireAdmin is the page's read
// and guard (signed out to sign-in, others home). saveParish checks again.
export const route = defineFileRoute('/places/parishes/new', {
  preload: () => void requireAdmin(),
});

export default function NewParish() {
  const allowed = createMemo(() => requireAdmin(), { name: 'parish-new-admin' });

  return (
    <main class="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-8">
      <Title>{`${m.parish_new_title()} - ${env.VITE_APP_NAME}`}</Title>
      <a href={paths.places.parishes()} class="btn self-start btn-ghost btn-sm">
        <BackIcon class="size-4" aria-hidden="true" />
        {m.parish_edit_back()}
      </a>
      <h1 class="text-2xl font-bold">{m.parish_new_title()}</h1>
      <Show when={allowed()}>
        <ParishEditForm cancelHref={paths.places.parishes()} />
      </Show>
    </main>
  );
}
