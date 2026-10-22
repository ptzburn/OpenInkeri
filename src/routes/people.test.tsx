import { Loading, flush } from 'solid-js';
import { captureArtifact } from '@solidjs/diagnostics';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import type { FormError } from '~/lib/form-error';
import { ToastProvider } from '~/components/toaster';
import { Router } from '~/router';

// The people pages through the real router, with their server functions
// answering from made-up people: Maria, baptised in 1895, married to Juho
// in 1915, mother of Olga; her mother Anna is in the records but not linked.
const { me, people } = vi.hoisted(() => {
  const me: { current: { isAdmin: boolean } | null } = { current: null };
  const row = (id: number, ru: string, fi: string, sex: 'male' | 'female', born: string) => ({
    id,
    name: { ru, fi },
    sex,
    birthDate: born,
    deathDate: null,
    mentions: 2,
  });
  const people = {
    rows: [
      row(1, 'Мария Иванова', 'Maria Juhontytär', 'female', '1895-03'),
      row(3, 'Юхо Варис', 'Juho Varis', 'male', '1890'),
    ],
    linked: [] as FormData[],
    unlinked: [] as FormData[],
    saved: [] as FormData[],
    failWith: null as null | FormError,
    person: () => ({
      id: 1,
      version: 2,
      sex: 'female' as const,
      name: { ru: 'Мария Иванова', fi: 'Maria Juhontytär' },
      birthDate: '1895-03',
      deathDate: null,
      note: 'Из Горок.',
      mentions: [
        {
          personaId: 10,
          recordId: 2,
          kind: 'baptisms' as const,
          role: 'child' as const,
          date: '1895-03-12',
          birthDate: '1895-03',
          name: { ru: 'Мария', fi: null },
          age: null,
          place: { ru: 'Горки', fi: 'Korkka' },
          placeAsWritten: 'Горкка',
        },
        {
          personaId: 20,
          recordId: 5,
          kind: 'marriages' as const,
          role: 'bride' as const,
          date: '1915-06-01',
          birthDate: null,
          name: { ru: 'Мария Иванова', fi: null },
          age: '20',
          place: null,
          placeAsWritten: null,
        },
      ],
      family: {
        parents: [{ personId: null, name: { ru: 'Анна', fi: null }, recordIds: [2], year: 1895 }],
        spouses: [
          { personId: 3, name: { ru: 'Юхо Варис', fi: 'Juho Varis' }, recordIds: [5], year: 1915 },
        ],
        children: [],
      },
    }),
  };
  return { me, people };
});

// Maria's possible mentions: a mother in 1918, in a village near Горки.
const getPersonSuggestions = vi.hoisted(() =>
  vi.fn(async () => [
    {
      mention: {
        personaId: 30,
        recordId: 8,
        kind: 'baptisms',
        role: 'mother',
        date: '1918-02-01',
        birthDate: null,
        name: { ru: 'Мария Иоанновна', fi: null },
        age: null,
        place: { ru: 'Пекколово', fi: 'Pekkola' },
        placeAsWritten: 'Пеккола',
      },
      score: 6,
      reasons: [
        { kind: 'patronymic' },
        { kind: 'surname' },
        { kind: 'near', name: { ru: 'Горки', fi: 'Korkka' }, km: 4 },
      ],
    },
  ]),
);

vi.mock('~/data/session', () => ({
  getCurrentUser: vi.fn(async () => me.current),
  requireAdmin: vi.fn(async () => !!me.current?.isAdmin),
}));
vi.mock('~/data/people', async () => {
  const { action } = await import('@solidjs/router');
  const { redirect } = await import('@solidjs/web');
  const match = (search: string) =>
    people.rows.filter((r) =>
      `${r.name.ru} ${r.name.fi}`.toLowerCase().includes(search.trim().toLowerCase()),
    );
  return {
    PEOPLE_PAGE_SIZE: 50,
    getPeople: vi.fn(async (search: string) => {
      const rows = match(search);
      return { total: rows.length, page: 1, pages: 1, people: rows };
    }),
    getPerson: vi.fn(async (id: number) => (id === 1 ? people.person() : null)),
    getPersonSuggestions,
    getPersonEdit: vi.fn(async (id: number) =>
      id === 1
        ? {
            id: 1,
            version: 2,
            sex: 'female',
            nameRu: 'Мария Иванова',
            nameFi: 'Maria Juhontytär',
            birthDate: '1895-03',
            deathDate: null,
            note: null,
            mentions: 2,
          }
        : null,
    ),
    getLinkCandidates: vi.fn(async (persona: number, search: string) =>
      persona === 30
        ? {
            mention: {
              personaId: 30,
              recordId: 8,
              kind: 'baptisms',
              role: 'mother',
              date: '1918-02-01',
              birthDate: null,
              name: { ru: 'Мария Иванова', fi: null },
              age: null,
              place: null,
              placeAsWritten: 'Горки',
              personId: null,
            },
            search: search || 'Мария',
            candidates: match(search || 'Мария'),
          }
        : null,
    ),
    savePerson: action(async (form: FormData) => {
      if (people.failWith) throw people.failWith;
      people.saved.push(form);
      throw redirect('/people/1');
    }, 'save-person'),
    deletePerson: action(async () => {
      throw redirect('/people');
    }, 'delete-person'),
    linkPersona: action(async (form: FormData) => {
      if (people.failWith) throw people.failWith;
      people.linked.push(form);
      const person = form.get('person') as string;
      throw redirect(`/people/${person === 'new' ? 1 : person}`);
    }, 'link-persona'),
    unlinkPersona: action(async (form: FormData) => {
      people.unlinked.push(form);
      throw redirect(`/people/${form.get('person') as string}`);
    }, 'unlink-persona'),
  };
});

function renderAt(url: string) {
  window.history.replaceState(null, '', url);
  return render(() => (
    <Router>
      {(props) => (
        <ToastProvider>
          <Loading fallback="Loading">{props.children}</Loading>
        </ToastProvider>
      )}
    </Router>
  ));
}

afterEach(() => {
  cleanup();
  me.current = null;
  people.linked = [];
  people.unlinked = [];
  people.saved = [];
  people.failWith = null;
});

describe('/people', () => {
  test('lists people with their life years and mentions, and searches', async () => {
    me.current = { isAdmin: false };
    renderAt('/people');
    // English shows the Finnish names.
    const maria = await screen.findByRole('link', { name: 'Maria Juhontytär' });
    expect(maria).toHaveAttribute('href', '/people/1');
    const row = maria.closest('tr')!;
    expect(within(row).getByText('3.1895–')).toBeInTheDocument();
    expect(within(row).getByText('Female')).toBeInTheDocument();

    fireEvent.input(screen.getByRole('searchbox', { name: 'Search people' }), {
      target: { value: 'varis' },
    });
    await waitFor(() => expect(window.location.search).toBe('?q=varis'));
    await waitFor(() => expect(screen.queryByText('Maria Juhontytär')).toBeNull());
    expect(screen.getByRole('link', { name: 'Juho Varis' })).toBeInTheDocument();
  });

  test('says when nobody matches', async () => {
    me.current = { isAdmin: false };
    renderAt('/people?q=nobody');
    expect(await screen.findByText('No people match “nobody”.')).toBeInTheDocument();
  });
});

describe('a person', () => {
  test('shows their summary, family and mentions; no editing for non-admins', async () => {
    me.current = { isAdmin: false };
    renderAt('/people/1');
    await screen.findByRole('heading', { level: 1, name: 'Maria Juhontytär' });
    expect(screen.getByText('Мария Иванова')).toBeInTheDocument();
    expect(screen.getByText('Из Горок.')).toBeInTheDocument();
    // A linked relative is a link; an unlinked one is marked.
    expect(screen.getByRole('link', { name: 'Juho Varis' })).toHaveAttribute('href', '/people/3');
    expect(screen.getByText('Анна')).toHaveAttribute('title', 'not linked to a person yet');
    // Mentions, oldest first, with the role, record type and place.
    const mentions = screen.getByRole('heading', {
      name: 'Mentions in records',
    }).nextElementSibling!;
    const rows = within(mentions as HTMLElement).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Child · Baptisms');
    expect(rows[0]).toHaveTextContent('Korkka');
    expect(rows[1]).toHaveTextContent('Bride · Marriages');
    expect(screen.queryByRole('link', { name: 'Edit person' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unlink' })).toBeNull();
  });

  test('an admin can open a mention’s record and unlink it', async () => {
    me.current = { isAdmin: true };
    renderAt('/people/1');
    await screen.findByRole('heading', { level: 1, name: 'Maria Juhontytär' });
    expect(screen.getByRole('link', { name: 'Edit person' })).toHaveAttribute(
      'href',
      '/people/1/edit',
    );
    expect(screen.getAllByRole('link', { name: 'Record' })[0]).toHaveAttribute(
      'href',
      '/records/2/edit',
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Unlink' })[1]);
    await waitFor(() => expect(people.unlinked).toHaveLength(1));
    expect(people.unlinked[0].get('persona')).toBe('20');
    expect(people.unlinked[0].get('person')).toBe('1');
  });

  test('an admin sees possible mentions with the reasons, and links one', async () => {
    me.current = { isAdmin: true };
    renderAt('/people/1');
    const section = (await screen.findByRole('heading', { name: 'Possible mentions' }))
      .parentElement!;
    const row = (await within(section).findByText('Mother · Baptisms')).closest('li')!;
    expect(row).toHaveTextContent('same patronymic');
    expect(row).toHaveTextContent('same surname');
    expect(row).toHaveTextContent('4 km from Korkka');
    fireEvent.click(within(row).getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(people.linked).toHaveLength(1));
    expect(people.linked[0].get('persona')).toBe('30');
    expect(people.linked[0].get('person')).toBe('1');
  });

  test('others don’t get possible mentions', async () => {
    me.current = { isAdmin: false };
    renderAt('/people/1');
    await screen.findByRole('heading', { level: 1, name: 'Maria Juhontytär' });
    expect(screen.queryByRole('heading', { name: 'Possible mentions' })).toBeNull();
    expect(screen.queryByText('Mother · Baptisms')).toBeNull();
  });

  test('a person who doesn’t exist says so', async () => {
    me.current = { isAdmin: false };
    renderAt('/people/99');
    expect(await screen.findByText("This person doesn't exist.")).toBeInTheDocument();
  });

  test('opening a person from the list causes no diagnostics', async () => {
    // A first visit loads the person page's code; the capture is the second.
    me.current = { isAdmin: true };
    renderAt('/people/1');
    await screen.findByRole('heading', { level: 1, name: 'Maria Juhontytär' });
    cleanup();

    me.current = { isAdmin: true };
    renderAt('/people');
    const link = await screen.findByRole('link', { name: 'Maria Juhontytär' });
    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.click(link);
        await screen.findByRole('heading', { level: 1, name: 'Maria Juhontytär' });
        flush();
      },
      { scenario: 'people-open-person' },
    );
    expect(artifact).toHaveNoDiagnostics();
  });
});

describe('editing a person', () => {
  test('saves what was typed and refuses with reasons under the fields', async () => {
    me.current = { isAdmin: true };
    people.failWith = {
      message: 'Check the marked fields.',
      fields: { nameRu: 'Give a name in Russian or in Finnish.' },
    };
    renderAt('/people/1/edit');
    const name = (await screen.findByRole('textbox', {
      name: /Name in Russian/,
    })) as HTMLInputElement;
    expect(name).toHaveValue('Мария Иванова');
    fireEvent.input(name, { target: { value: '' } });
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the marked fields.');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name.nextElementSibling).toHaveTextContent('Give a name in Russian or in Finnish.');

    people.failWith = null;
    fireEvent.input(name, { target: { value: 'Мария Ивановна' } });
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);
    await waitFor(() => expect(window.location.pathname).toBe('/people/1'));
    expect(people.saved[0].get('nameRu')).toBe('Мария Ивановна');
    expect(people.saved[0].get('birthDate')).toBe('3.1895');
  });
});

describe('linking a mention', () => {
  test('makes a new person from the mention', async () => {
    me.current = { isAdmin: true };
    renderAt('/people/link/30');
    await screen.findByRole('heading', { level: 1, name: 'Link to a person' });
    expect(screen.getByRole('link', { name: 'Back to the record' })).toHaveAttribute(
      'href',
      '/records/8/edit',
    );
    fireEvent.click(screen.getByRole('button', { name: 'New person from this mention' }));
    await waitFor(() => expect(window.location.pathname).toBe('/people/1'));
    expect(people.linked[0].get('persona')).toBe('30');
    expect(people.linked[0].get('person')).toBe('new');
  });

  test('links to someone already here, found by the given name at first', async () => {
    me.current = { isAdmin: true };
    renderAt('/people/link/30');
    // Searched by the mention's given name until something else is typed.
    const row = (await screen.findByRole('link', { name: 'Maria Juhontytär' })).closest('tr')!;
    expect(screen.queryByRole('link', { name: 'Juho Varis' })).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(people.linked).toHaveLength(1));
    expect(people.linked[0].get('person')).toBe('1');
  });

  test('a refused link says why', async () => {
    me.current = { isAdmin: true };
    people.failWith = { message: 'This person is already mentioned in the same record.' };
    renderAt('/people/link/30');
    const row = (await screen.findByRole('link', { name: 'Maria Juhontytär' })).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This person is already mentioned in the same record.',
    );
    expect(window.location.pathname).toBe('/people/link/30');
  });
});
