import type { RouteProps } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show } from 'solid-js';

import EditPage from '~/components/edit-page';
import PersonEditForm from '~/components/person-edit-form';
import { getPersonEdit } from '~/data/people';
import { idParam } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import { localName, namesOf } from '~/lib/format';
import type { Crumbs } from '~/lib/breadcrumbs';

// Admins only: getPersonEdit redirects anyone else (signed out to sign-in,
// others home).
// Through the person, named from the query the form reads.
const crumbs: Crumbs = async ({ params }) => {
  const id = idParam(params.id);
  const person = id ? await getPersonEdit(id) : null;
  return [
    { label: m.people_title(), href: paths.people() },
    ...(person ? [{ label: localName(namesOf(person)), href: paths.people(person.id)() }] : []),
    { label: m.person_edit() },
  ];
};

export const route = defineFileRoute('/people/:id/edit', {
  info: { crumbs },
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
