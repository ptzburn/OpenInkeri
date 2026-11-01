import type { RouteProps } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show } from 'solid-js';

import EditPage, { BackLink } from '~/components/edit-page';
import PersonEditForm from '~/components/person-edit-form';
import { getPersonEdit } from '~/data/people';
import { idParam } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Admins only: getPersonEdit redirects anyone else (signed out to sign-in,
// others home).
export const route = defineFileRoute('/people/:id/edit', {
  preload: ({ params }) => {
    const id = idParam(params.id);
    if (id) void getPersonEdit(id);
  },
});

export default function EditPerson(props: RouteProps<'/people/:id/edit'>) {
  return (
    <Show
      when={idParam(props.params.id)}
      fallback={
        <EditPage title={m.person_edit()}>
          <BackLink href={paths.people()} label={m.person_back()} />
          <p>{m.person_missing()}</p>
        </EditPage>
      }
    >
      {(id) => (
        <EditPage title={m.person_edit()}>
          <PersonEditForm id={id()} cancelHref={paths.people(id())()} />
        </EditPage>
      )}
    </Show>
  );
}
