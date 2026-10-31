import { Loading, flush } from 'solid-js';
import { captureArtifact } from '@solidjs/diagnostics';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import type { FormError } from '~/lib/form-error';
import { ToastProvider } from '~/components/toaster';
import { Router } from '~/router';

// The records page through the real router, with getRecords answering from
// a made-up baptism register of 120 entries, 50 a page, searched by child
// name the way the server folds case; one marriage and one death. The other
// kinds have no records.
const { getRecords } = vi.hoisted(() => {
  const size = 50;
  const person = (ru: string | null, fi: string | null = null, more = {}) => ({
    ru,
    fi,
    age: null as string | null,
    residence: null as { ru: string | null; fi: string | null } | null,
    residenceAsWritten: null as string | null,
    ...more,
  });
  const row = {
    lost: false,
    date: '1895-03-12',
    birthDate: null as string | null,
    stillborn: false,
    multipleBirth: null as number | null,
    illegitimate: false,
    burialDate: null as string | null,
    cause: null as string | null,
    village: null as { ru: string | null; fi: string | null } | null,
    villageAsWritten: null as string | null,
    child: null as ReturnType<typeof person> | null,
    father: null as ReturnType<typeof person> | null,
    mother: null as ReturnType<typeof person> | null,
    groom: null as ReturnType<typeof person> | null,
    bride: null as ReturnType<typeof person> | null,
    deceased: null as ReturnType<typeof person> | null,
    holding: null as {
      holdingNo: string | null;
      estateText: string | null;
      tenantText: string | null;
    } | null,
    members: [] as {
      id: number;
      ru: string | null;
      fi: string | null;
      relation: { ru: string; fi: string | null; en: string | null } | null;
      relationAsWritten: string | null;
      hasWife: boolean | null;
      birthDate: string | null;
      deathDate: string | null;
      note: string | null;
    }[],
    note: null as string | null,
  };
  const baptisms = Array.from({ length: 120 }, (_, i) => ({
    ...row,
    id: i + 1,
    birthDate: '1895-03',
    multipleBirth: i === 0 ? 2 : null,
    village: { ru: 'Горки', fi: null },
    villageAsWritten: 'Горкка',
    child: person(i === 1 ? 'Мария' : `Ребёнок ${i + 1}`, i === 1 ? 'Maria' : null),
    father: person('Иоанн Адамов Варис', 'Juhana Aataminp. Waris'),
  }));
  const entries = {
    baptisms,
    marriages: [
      {
        ...row,
        id: 201,
        date: '1918-01-14',
        groom: person('Михаил Павлов Скиппарь', 'Mikkel Skippari', {
          age: '39',
          residence: { ru: 'Череповицы', fi: 'Tserepovitsa' },
          residenceAsWritten: 'Череповицы',
        }),
        bride: person('Мария Адамова Кялли', 'Maria Källi', {
          age: '25',
          residenceAsWritten: 'Теретиля (Жеребятки)',
        }),
      },
    ],
    deaths: [
      {
        ...row,
        id: 301,
        date: '1918-01-07',
        burialDate: '1918-01-14',
        cause: 'воспаление лёгких',
        village: { ru: 'Медниково', fi: null },
        villageAsWritten: 'Медниково',
        deceased: person('Александр Иосифов Таттарь', 'Aleksanteri Juosepinp. Tattari', {
          age: '3 г. 2 мес. 9 дн.',
        }),
        father: person('Иосиф Иоаннов Таттарь'),
      },
      { ...row, id: 302, date: '1917-12-18', stillborn: true, deceased: person(null) },
    ],
    households: [
      {
        ...row,
        id: 401,
        date: '1927',
        villageAsWritten: 'Kirkonkylä',
        holding: { holdingNo: '3', estateText: null, tenantText: null },
        members: [
          {
            id: 40,
            ru: null,
            fi: 'Myyry Nikolai Kaarlonp.',
            relation: { ru: 'Глава', fi: null, en: 'Head' },
            relationAsWritten: 'Глава',
            hasWife: null,
            birthDate: '1858-07-28',
            deathDate: '1936-10-09',
            note: 'vihitty 14.05.1878',
          },
          {
            id: 41,
            ru: null,
            fi: 'Waris Maria Aatamint.',
            relation: { ru: 'Жена', fi: null, en: null },
            relationAsWritten: 'Жена',
            hasWife: null,
            birthDate: '1860-04-03',
            deathDate: null,
            note: null,
          },
        ],
      },
    ],
  } as Record<string, (typeof baptisms)[number][]>;
  const counts = { baptisms: 120, marriages: 1, deaths: 2, households: 1, taxpayers: 0 };
  // Source 1 is the baptism register; the made-up entries are all in it.
  const getRecords = vi.fn(
    async (kind: string, search: string, page: number, sourceId: number | null) => {
      const found = (entries[kind] ?? []).filter(
        (e) =>
          kind !== 'baptisms' ||
          (e.child?.ru ?? '').toLowerCase().includes(search.trim().toLowerCase()),
      );
      const pages = Math.max(1, Math.ceil(found.length / size));
      const current = Math.min(Math.max(1, page), pages);
      const records = found.slice((current - 1) * size, current * size).map((e) => ({ ...e }));
      const source =
        sourceId === 1 && kind === 'baptisms' ? { id: 1, title: 'Губаницы: крещения' } : null;
      return { kind, source, counts, total: found.length, page: current, pages, records };
    },
  );
  return { getRecords };
});

// Who is signed in: nobody, unless a test makes them an admin.
const { me, editing } = vi.hoisted(() => {
  const me: { current: { isAdmin: boolean } | null } = { current: null };
  // The edit page's server functions: record 2 (Maria's baptism) and 301
  // (a death) as stored, the places and clergy to pick from, and a save that
  // records its form and can be made to fail.
  const editing = {
    saved: [] as FormData[],
    deleted: [] as FormData[],
    failWith: null as null | FormError,
    record: () => ({
      id: 2,
      kind: 'baptisms' as const,
      sourceId: 1,
      page: '12об',
      language: 'ru',
      holding: null,
      members: [],
      version: 4,
      status: 'ok' as const,
      date: '1895-03-12',
      placeText: 'Горкка',
      placeId: 1,
      note: 'двойня',
      baptism: {
        birthDate: '1895-03',
        officiantText: 'В пасторате пастор Берг',
        officiantId: 7,
        location: 'pastorate' as const,
        locationPlaceId: null,
        emergencyDate: null,
        multipleBirth: 2,
        illegitimate: false,
        stillborn: false,
      },
      death: null,
      people: {
        child: person({ id: 10, role: 'child', sex: 'female', nameRu: 'Мария', givenRu: 'Мария' }),
        father: person({
          id: 11,
          role: 'father',
          sex: 'male',
          nameRu: 'Иоанн Адамов Варис',
          person: { id: 7, name: { ru: 'Иван Варис', fi: 'Juho Varis' } },
        }),
        mother: null,
      },
    }),
    death: () => ({
      id: 301,
      kind: 'deaths' as const,
      sourceId: 2,
      page: null,
      language: 'ru',
      holding: null,
      members: [],
      version: 1,
      status: 'ok' as const,
      date: '1918-01-07',
      placeText: 'Медниково',
      placeId: 2,
      note: 'родители: Иосиф Иоаннов Таттарь, Евва ур. Вальконен',
      baptism: null,
      death: {
        burialDate: '1918-01-14',
        burialPlaceText: 'Губаницкое кладбище',
        causeText: 'воспаление лёгких',
        causeTermId: null,
        stillborn: false,
      },
      people: {
        deceased: person({
          id: 20,
          role: 'deceased',
          sex: 'male',
          nameRu: 'Александр Иосифов Таттарь',
          ageText: '3 г. 2 мес. 9 дн.',
          civilStatusText: 'дитя',
          birthplaceText: 'Медниково',
          birthplaceId: 2,
        }),
        father: person({ id: 21, role: 'father', sex: 'male', nameRu: 'Иосиф Иоаннов Таттарь' }),
        mother: null,
      },
    }),
    household: () => ({
      id: 401,
      kind: 'households' as const,
      sourceId: 3,
      page: null,
      language: 'fi',
      version: 1,
      status: 'ok' as const,
      date: '1927',
      placeText: 'Kirkonkylä',
      placeId: null,
      note: null,
      baptism: null,
      death: null,
      holding: { holdingNo: '3', estateText: null, estatePlaceId: null, tenantText: null },
      people: {},
      members: [
        person({
          id: 40,
          role: 'member',
          sex: 'male',
          nameFi: 'Myyry Nikolai Kaarlonp.',
          relationTermId: 1,
          relationText: 'Глава',
          birthDate: '1858-07-28',
        }),
        person({ id: 41, role: 'member', sex: 'female', nameFi: 'Waris Maria Aatamint.' }),
      ],
    }),
  };
  function person(fields: Record<string, unknown>) {
    const names = ['name', 'given', 'patronymic', 'surname', 'maiden'].flatMap((part) => [
      `${part}Ru`,
      `${part}Fi`,
    ]);
    const other = ['sex', 'birthDate', 'deathDate', 'origin', 'ageText', 'rankText'].concat(
      ['religionText', 'civilStatusText', 'residenceText', 'residenceId', 'birthplaceText'],
      ['birthplaceId', 'relationText', 'relationTermId', 'hasWife', 'note', 'noteOriginal'],
      ['person'],
    );
    return {
      ...Object.fromEntries([...names, ...other].map((name) => [name, null])),
      ...fields,
    } as never;
  }
  return { me, editing };
});

vi.mock('~/data/session', () => ({
  getCurrentUser: vi.fn(async () => me.current),
  requireAdmin: vi.fn(async () => !!me.current?.isAdmin),
}));
// The people a mention can be linked to, searched by name in the form.
vi.mock('~/data/people', () => ({
  getPeople: vi.fn(async (search: string) => {
    const rows = [
      {
        id: 7,
        name: { ru: 'Иван Варис', fi: 'Juho Varis' },
        sex: 'male',
        birthDate: '1860',
        deathDate: null,
        mentions: 3,
      },
      {
        id: 8,
        name: { ru: 'Мария Варис', fi: 'Maria Varis' },
        sex: 'female',
        birthDate: null,
        deathDate: null,
        mentions: 1,
      },
    ].filter((r) => `${r.name.ru} ${r.name.fi}`.toLowerCase().includes(search.toLowerCase()));
    return { total: rows.length, page: 1, pages: 1, people: rows };
  }),
}));
vi.mock('~/data/records', async () => {
  const { action } = await import('@solidjs/router');
  const { redirect } = await import('@solidjs/web');
  return {
    getRecords,
    RECORDS_PAGE_SIZE: 50,
    getRecordEdit: vi.fn(async (id: number) =>
      id === 2
        ? editing.record()
        : id === 301
          ? editing.death()
          : id === 401
            ? editing.household()
            : null,
    ),
    getRecordEditOptions: vi.fn(async () => ({
      // Горки is also spelled Горка; Волгово and Вохново are both spelled Волково.
      places: [
        { id: 1, name: 'Горки', parish: 'Губаницы', spellings: ['Горки', 'Горка'] },
        { id: 2, name: 'Волгово', parish: 'Губаницы', spellings: ['Волгово', 'Волково'] },
        { id: 3, name: 'Вохново', parish: 'Губаницы', spellings: ['Вохново', 'Волково'] },
      ],
      clergy: [{ id: 7, name: 'Берг', spellings: ['Берг'] }],
      relations: [
        { id: 1, name: 'Глава', spellings: ['Глава', 'isäntä'] },
        { id: 2, name: 'Жена', spellings: ['Жена', 'vaimo'] },
      ],
      sources: [
        { id: 1, title: 'Губаницы: крещения', kind: 'baptisms', language: 'ru', parishId: 5 },
        { id: 2, title: 'Губаницы: умершие', kind: 'deaths', language: 'ru', parishId: 5 },
        {
          id: 3,
          title: 'Губаницы: общий список',
          kind: 'households',
          language: 'fi',
          parishId: null,
        },
      ],
      parishes: [
        { id: 5, name: 'Губаницы' },
        { id: 7, name: 'Волосово' },
      ],
    })),
    // Like the server: a delete redirects to the list place the form carried.
    deleteRecord: action(async (form: FormData) => {
      editing.deleted.push(form);
      throw redirect('/records?kind=deaths');
    }, 'delete-record'),
    // Like the server: a refusal throws its error; a save redirects to the
    // list place the form carried, and Save and add next to a new record
    // after it (a new household is 401 here).
    saveRecord: action(async (form: FormData) => {
      editing.saved.push(form);
      if (editing.failWith) throw editing.failWith;
      if (form.get('next') === 'on') {
        throw redirect(`/records/new?kind=${form.get('returnKind') as string}&after=401`);
      }
      const back = new URLSearchParams();
      for (const [field, key] of [
        ['returnKind', 'kind'],
        ['returnQ', 'q'],
        ['returnPage', 'page'],
        ['returnSource', 'source'],
      ] as const) {
        const value = form.get(field);
        if (typeof value === 'string' && value) back.set(key, value);
      }
      const query = back.toString();
      throw redirect(query ? `/records?${query}` : '/records');
    }, 'save-record'),
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

// The child column's names; English shows the Finnish form when there is one.
const childNames = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody tr .font-medium')].map((el) => el.textContent);

afterEach(() => {
  cleanup();
  me.current = null;
  editing.saved = [];
  editing.deleted = [];
  editing.failWith = null;
  getRecords.mockClear();
});

describe('/records', () => {
  test('shows the first page, with the dates and names of each entry', async () => {
    const { container } = renderAt('/records');
    await waitFor(() => expect(childNames(container)).toHaveLength(50));
    expect(getRecords).toHaveBeenLastCalledWith('baptisms', '', 1, null);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    const first = container.querySelector<HTMLElement>('tbody tr')!;
    expect(first).toHaveTextContent('03.1895'); // born, month only
    expect(first).toHaveTextContent('12.03.1895'); // baptised
    expect(within(first).getByRole('img', { name: 'Twins' })).toBeInTheDocument();
    // English shows the Finnish form when the register gives one.
    expect(first).toHaveTextContent('Juhana Aataminp. Waris');
    expect(container.querySelector('tbody tr:nth-child(2)')).toHaveTextContent('Maria');
    expect(within(first).getByTitle('In the source: Горкка')).toBeInTheDocument();
  });

  test('pages through ?page, and the ends have no link onward', async () => {
    const { container } = renderAt('/records?page=3');
    await waitFor(() => expect(childNames(container)[0]).toBe('Ребёнок 101'));
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/records?page=2',
    );
    expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
  });

  test('searching goes back to the first page, without diagnostics', async () => {
    const { container } = renderAt('/records?page=2');
    await waitFor(() => expect(childNames(container)[0]).toBe('Ребёнок 51'));
    const input = screen.getByRole('searchbox', { name: 'Search records' });

    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.input(input, { target: { value: 'мария' } });
        await waitFor(() => expect(childNames(container)).toEqual(['Maria']));
        flush();
      },
      { scenario: 'records-search' },
    );
    expect(artifact).toHaveNoDiagnostics();
    expect(getRecords).toHaveBeenLastCalledWith('baptisms', 'мария', 1, null);
    expect(window.location.search).toBe(`?q=${encodeURIComponent('мария')}`);
    // One page of results: no pagination.
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
  });

  test('switching the kind keeps the search and starts at the first page', async () => {
    const { container } = renderAt(`/records?q=${encodeURIComponent('ребёнок')}&page=2`);
    // Мария doesn't match, so page 2 starts one entry later.
    await waitFor(() => expect(childNames(container)[0]).toBe('Ребёнок 52'));
    const tabs = screen.getByRole('navigation', { name: 'Record type' });
    const baptisms = screen.getByRole('link', { name: /Baptisms/ });
    expect(baptisms).toHaveClass('tab-active');
    expect(baptisms).toHaveTextContent('120');

    fireEvent.click(screen.getByRole('link', { name: /Taxpayers/ }));
    expect(await screen.findByText('There are no records of this type yet.')).toBeInTheDocument();
    expect(getRecords).toHaveBeenLastCalledWith('taxpayers', 'ребёнок', 1, null);
    expect(screen.getByRole('link', { name: /Taxpayers/ })).toHaveClass('tab-active');
    expect(tabs.querySelectorAll('.tab')).toHaveLength(5);
    // The search form sends the kind along, for searching before JavaScript.
    expect(container.querySelector('input[type=hidden][name=kind]')).toHaveValue('taxpayers');
  });

  test('marriages show the bride and groom, with their ages and villages', async () => {
    renderAt('/records?kind=marriages');
    const groom = await screen.findByText('Mikkel Skippari');
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['Married', 'Groom', 'Bride', 'Notes']);
    const row = groom.closest('tr')!;
    expect(row).toHaveTextContent('14.01.1918');
    // English shows the Finnish name of the village when it has one.
    expect(row).toHaveTextContent('age 39 · Tserepovitsa');
    // A village not resolved to a place shows as written.
    expect(row).toHaveTextContent('Maria Källi');
    expect(row).toHaveTextContent('age 25 · Теретиля (Жеребятки)');
  });

  test('deaths show the dates, age, place and cause', async () => {
    renderAt('/records?kind=deaths');
    const deceased = await screen.findByText('Aleksanteri Juosepinp. Tattari');
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual([
      'Died',
      'Buried',
      'Deceased',
      'Age',
      'Place of death',
      'Cause of death',
      'Notes',
    ]);
    const row = deceased.closest('tr')!;
    expect(row).toHaveTextContent('07.01.1918');
    expect(row).toHaveTextContent('14.01.1918');
    expect(row).toHaveTextContent('3 г. 2 мес. 9 дн.');
    expect(row).toHaveTextContent('Медниково');
    expect(row).toHaveTextContent('воспаление лёгких');
    expect(row.nextElementSibling).toHaveTextContent('Stillborn');
  });

  test('households list their people, with relation, dates and notes', async () => {
    renderAt('/records?kind=households');
    const head = await screen.findByText('Myyry Nikolai Kaarlonp.');
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['Locality', 'Household', 'People']);
    const row = head.closest('tr')!;
    expect(row).toHaveTextContent('Kirkonkylä');
    // The relation in the reader's language, else in Russian.
    expect(head.closest('li')).toHaveTextContent(
      'Myyry Nikolai Kaarlonp. — Head · 28.07.1858 – 09.10.1936vihitty 14.05.1878',
    );
    expect(row.querySelectorAll('li')[1]).toHaveTextContent('Waris Maria Aatamint. — Жена');
  });

  test('an unknown ?kind= shows baptisms', async () => {
    const { container } = renderAt('/records?kind=nonsense');
    await waitFor(() => expect(childNames(container)).toHaveLength(50));
    expect(getRecords).toHaveBeenLastCalledWith('baptisms', '', 1, null);
  });

  test('?source= narrows the list to one source, and All sources widens it again', async () => {
    me.current = { isAdmin: true };
    renderAt('/records?source=1');
    expect(await screen.findByText('Source: Губаницы: крещения')).toBeInTheDocument();
    expect(getRecords).toHaveBeenLastCalledWith('baptisms', '', 1, 1);
    expect(screen.getByRole('link', { name: 'All sources' })).toHaveAttribute('href', '/records');
    // Adding and editing keep the source, to come back to it.
    expect(screen.getByRole('link', { name: 'Add record' })).toHaveAttribute(
      'href',
      '/records/new?source=1',
    );
    expect(screen.getAllByRole('link', { name: 'Edit record' })[0]).toHaveAttribute(
      'href',
      expect.stringMatching(/\/edit\?source=1$/),
    );
    // The next page keeps it; another kind's tab doesn't.
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/records?page=2&source=1',
    );
    expect(screen.getByRole('link', { name: /^Deaths/ })).toHaveAttribute(
      'href',
      '/records?kind=deaths',
    );
  });

  test('says when nothing matches', async () => {
    renderAt('/records?q=zzz');
    expect(await screen.findByText('No records match “zzz”.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('zzz');
  });
});

describe('editing a baptism', () => {
  // The edit page for record 2 (Maria's), opened from the list's edit link.
  async function openMaria() {
    me.current = { isAdmin: true };
    const { container } = renderAt(`/records?q=${encodeURIComponent('мария')}`);
    await waitFor(() => expect(childNames(container)).toEqual(['Maria']));
    fireEvent.click(await screen.findByRole('link', { name: 'Edit record' }));
    await screen.findByRole('heading', { level: 1, name: 'Edit record' });
    await waitFor(() => expect(field('status')).toBeTruthy());
    return document.querySelector('main form') as HTMLFormElement;
  }
  const field = (name: string) =>
    document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;

  test('a mention links to its person, or says who it is as the record is saved', async () => {
    await openMaria();
    // The father is linked to a person: shown, not asked again.
    expect(screen.getByRole('link', { name: 'Juho Varis' })).toHaveAttribute('href', '/people/7');
    expect(field('father.personId')).toBeNull();
    // The child isn't yet: nobody, a new person, or someone found by name.
    const choice = field('child.personId') as HTMLInputElement;
    expect(choice).toHaveAttribute('type', 'radio');
    expect(choice.value).toBe('');
    expect(choice).toBeChecked();
    const child = choice.closest('fieldset')!;
    const search = child.querySelector('input[type=search]') as HTMLInputElement;
    fireEvent.input(search, { target: { value: 'Варис' } });
    const found = await within(child).findByRole('radio', { name: /Maria Varis/ });
    expect((found as HTMLInputElement).value).toBe('8');
    expect(
      within(child)
        .getByRole('radio', { name: /Juho Varis/ })
        .closest('label'),
    ).toHaveTextContent('1860–');
    fireEvent.click(found);
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);

    await waitFor(() => expect(window.location.pathname).toBe('/records'));
    const [saved] = editing.saved;
    expect(saved.get('child.personId')).toBe('8');
    expect(saved.get('father.personId')).toBeNull();
    expect(saved.get('mother.personId')).toBe('');
  });

  test('a new person can be made from a mention as the record is saved', async () => {
    me.current = { isAdmin: true };
    renderAt('/records/new?source=1');
    await waitFor(() => expect(field('child.nameRu')).toBeTruthy());
    fireEvent.input(field('child.nameRu'), { target: { value: 'Мария' } });
    fireEvent.click(screen.getAllByRole('radio', { name: 'New person from this mention' })[0]);
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);

    await waitFor(() => expect(editing.saved).toHaveLength(1));
    expect(editing.saved[0].get('child.personId')).toBe('new');
  });

  test('a place is typed once, as written, and says what it is linked to', async () => {
    await openMaria();
    // Stored linked by hand to a place this spelling isn't one of: kept.
    const village = field('placeText');
    expect(village).toHaveValue('Горкка');
    expect(village).toHaveAttribute('role', 'combobox');
    expect(field('placeId')).toHaveValue('1');
    expect(village.closest('.fieldset')).toHaveTextContent('→ Горки (Губаницы)');
    // Focused, the dropdown lists every place once: the text matches none.
    fireEvent.focus(village);
    flush();
    const options = () =>
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent);
    expect(options()).toEqual(['Горки (Губаницы)', 'Волгово (Губаницы)', 'Вохново (Губаницы)']);
    // Typed, it lists the places with a spelling containing the text, the
    // spelling shown when the name doesn't.
    fireEvent.input(village, { target: { value: 'волк' } });
    flush();
    expect(options()).toEqual(['Волгово (Губаницы)Волково', 'Вохново (Губаницы)Волково']);
    fireEvent.keyDown(village, { key: 'ArrowDown' });
    flush();
    fireEvent.keyDown(village, { key: 'Enter' });
    flush();
    expect(village).toHaveValue('Волково');
    expect(field('placeId')).toHaveValue('2');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  test('typing a spelling links it; several to choose from, or none, say so', async () => {
    await openMaria();
    const village = field('placeText');
    const status = () => village.closest('.fieldset')!.querySelector('summary')!;
    const { artifact } = await captureArtifact(
      async () => {
        // Another place's spelling, in another case: linked to it.
        fireEvent.input(village, { target: { value: 'ВОЛГОВО' } });
        flush();
        expect(field('placeId')).toHaveValue('2');
        expect(status()).toHaveTextContent('→ Волгово (Губаницы)');

        // Two places' spelling, one of them the linked one: kept.
        fireEvent.input(village, { target: { value: 'Волково' } });
        flush();
        expect(field('placeId')).toHaveValue('2');

        // A spelling no place has: unlinked, offering to add the place. The
        // box opens its fields, the value as written as its Russian name.
        fireEvent.input(village, { target: { value: 'Неизвестная' } });
        flush();
        expect(field('placeId')).toHaveValue('');
        expect(status()).toHaveTextContent('“Неизвестная” is not known yet. Open to add it.');
        const box = village.closest('.fieldset')!.querySelector('[name="placeCreate"]')!;
        expect(box).not.toBeChecked();
        fireEvent.click(box);
        flush();
        expect(box).toBeChecked();
        expect(status().parentElement).toHaveAttribute('open');
        expect(field('placeNew.nameRu')).toHaveValue('Неизвестная');
        expect(field('placeNew.nameFi')).toHaveValue('');
        expect(field('placeNew.kind')).toHaveValue('village');
        // In the parish of the record's source (Maria's record is in source 1).
        expect(field('placeNew.parishId')).toHaveValue('5');

        // Two places' spelling with neither linked: the choice opens, with
        // them first; nothing is to be added any more.
        fireEvent.input(village, { target: { value: 'Волково' } });
        flush();
        expect(field('placeId')).toHaveValue('');
        expect(box).not.toBeChecked();
        expect(status()).toHaveTextContent('Several match this spelling: choose one');
        expect(status().parentElement).toHaveAttribute('open');
        const choices = [...(field('placeId') as HTMLSelectElement).options].map((o) => o.text);
        expect(choices.slice(0, 3)).toEqual([
          '— none —',
          'Волгово (Губаницы)',
          'Вохново (Губаницы)',
        ]);
        fireEvent.change(field('placeId'), { target: { value: '3' } });
        flush();
        expect(status()).toHaveTextContent('→ Вохново (Губаницы)');
      },
      { scenario: 'record-lookup-typing' },
    );
    expect(artifact).toHaveNoDiagnostics();
  });

  test('a household member’s relation is typed once, in any of its languages', async () => {
    me.current = { isAdmin: true };
    renderAt('/records/new?kind=households');
    await waitFor(() => expect(field('members.0.relationText')).toBeTruthy());
    fireEvent.input(field('members.0.relationText'), { target: { value: 'Vaimo' } });
    await waitFor(() => expect(field('members.0.relationTermId')).toHaveValue('2'));
  });

  test('a name is split as it is typed, and the parts show on one line', async () => {
    await openMaria();
    const summary = () =>
      field('child.givenRu').closest('details')!.querySelector('summary')!.textContent;
    // As stored: the child's given name; the parts' fields folded away.
    expect(summary()).toContain('Russian: Given name Мария');
    expect(field('child.givenRu').closest('details')).not.toHaveAttribute('open');
    expect(field('child.split')).toHaveValue('auto');

    const { artifact } = await captureArtifact(
      async () => {
        // The mother's name, typed: a woman's patronymic in -овна.
        fireEvent.input(field('mother.nameRu'), {
          target: { value: 'Анна Ивановна Варис ур. Лайтинен' },
        });
        flush();
        expect(field('mother.givenRu')).toHaveValue('Анна');
        expect(field('mother.patronymicRu')).toHaveValue('Ивановна');
        expect(field('mother.surnameRu')).toHaveValue('Варис');
        expect(field('mother.maidenRu')).toHaveValue('Лайтинен');
        const line = field('mother.givenRu').closest('details')!.querySelector('summary')!;
        expect(line).toHaveTextContent(
          'Russian: Given name Анна · Patronymic Ивановна · Surname Варис · Maiden name Лайтинен',
        );
        // Text that isn't a name stays whole.
        fireEvent.input(field('mother.nameFi'), { target: { value: 'tuntematon' } });
        flush();
        expect(line).toHaveTextContent('Finnish: not split into parts');
      },
      { scenario: 'record-name-split' },
    );
    expect(artifact).toHaveNoDiagnostics();
  });

  test('a corrected part is kept, and the name is no longer split', async () => {
    await openMaria();
    fireEvent.input(field('father.surnameRu'), { target: { value: 'Адамов Варис' } });
    fireEvent.input(field('father.patronymicRu'), { target: { value: '' } });
    await waitFor(() => expect(field('father.split')).toHaveValue('manual'));
    expect(screen.getAllByText('Corrected by hand')).toHaveLength(1);
    fireEvent.input(field('father.nameRu'), { target: { value: 'Иоанн Адамов Варис-Котти' } });
    flush();
    expect(field('father.surnameRu')).toHaveValue('Адамов Варис');

    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);
    await waitFor(() => expect(editing.saved).toHaveLength(1));
    const [saved] = editing.saved;
    expect(saved.get('father.split')).toBe('manual');
    expect(saved.get('father.surnameRu')).toBe('Адамов Варис');
    expect(saved.get('child.split')).toBe('auto');
  });

  test('opening the edit page from the list causes no diagnostics', async () => {
    // A first visit loads the edit page's code behind the spinner (in the
    // app the server renders a direct visit); the capture is the click.
    await openMaria();
    cleanup();

    me.current = { isAdmin: true };
    const { container } = renderAt(`/records?q=${encodeURIComponent('мария')}`);
    await waitFor(() => expect(childNames(container)).toEqual(['Maria']));
    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.click(await screen.findByRole('link', { name: 'Edit record' }));
        await waitFor(() => expect(field('father.nameRu')).toHaveValue('Иоанн Адамов Варис'));
        flush();
      },
      { scenario: 'record-edit-open' },
    );
    expect(artifact).toHaveNoDiagnostics();
  });

  test('only admins get the edit link', async () => {
    const { container } = renderAt(`/records?q=${encodeURIComponent('мария')}`);
    await waitFor(() => expect(childNames(container)).toEqual(['Maria']));
    expect(screen.queryByRole('link', { name: 'Edit record' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });

  test('the edit link has a column of its own, at the end of the row', async () => {
    me.current = { isAdmin: true };
    const { container } = renderAt(`/records?q=${encodeURIComponent('мария')}`);
    await waitFor(() => expect(childNames(container)).toEqual(['Maria']));
    const link = await screen.findByRole('link', { name: 'Edit record' });
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    const cell = link.closest('td')!;
    expect(cell).toBe(cell.parentElement!.lastElementChild);
    expect(cell).not.toHaveTextContent('Maria');
  });

  test("the edit link carries the list's place", async () => {
    me.current = { isAdmin: true };
    const { container } = renderAt(`/records?q=${encodeURIComponent('мария')}`);
    await waitFor(() => expect(childNames(container)).toEqual(['Maria']));
    expect(await screen.findByRole('link', { name: 'Edit record' })).toHaveAttribute(
      'href',
      `/records/2/edit?q=${encodeURIComponent('мария')}`,
    );
  });

  test('opens with the record as stored, dates as the page shows them', async () => {
    await openMaria();
    expect(window.location.pathname).toBe('/records/2/edit');
    expect(field('date')).toHaveValue('12.03.1895');
    expect(field('birthDate')).toHaveValue('03.1895');
    expect(field('placeId')).toHaveValue('1');
    expect(field('placeText')).toHaveValue('Горкка');
    expect(field('officiantId')).toHaveValue('7');
    expect(field('location')).toHaveValue('pastorate');
    expect(field('multipleBirth')).toHaveValue('2');
    expect(field('child.sex')).toHaveValue('female');
    expect(field('father.nameRu')).toHaveValue('Иоанн Адамов Варис');
    expect(field('child.givenRu')).toHaveValue('Мария');
    // No mother yet: her fields are there, empty, to add her.
    expect(field('mother.nameRu')).toHaveValue('');
  });

  test('saves with the version it was loaded at, then returns to the list', async () => {
    const form = await openMaria();
    fireEvent.input(field('mother.nameRu'), { target: { value: 'Анна' } });
    fireEvent.change(field('placeId'), { target: { value: '2' } });
    fireEvent.submit(form);

    await waitFor(() => expect(window.location.pathname).toBe('/records'));
    expect(window.location.search).toBe(`?q=${encodeURIComponent('мария')}`);
    const [saved] = editing.saved;
    expect(saved.get('id')).toBe('2');
    expect(saved.get('version')).toBe('4');
    expect(saved.get('mother.nameRu')).toBe('Анна');
    expect(saved.get('placeId')).toBe('2');
    expect(saved.get('date')).toBe('12.03.1895');
    expect(saved.get('returnQ')).toBe('мария');
  });

  test('a refused save stays, says why and marks the fields', async () => {
    editing.failWith = {
      message: 'Check the marked fields.',
      fields: { date: '', sourceId: 'That source holds another type of record.' },
    };
    const form = await openMaria();
    fireEvent.submit(form);

    expect(await screen.findByRole('alert')).toHaveTextContent('Check the marked fields.');
    expect(window.location.pathname).toBe('/records/2/edit');
    expect(field('date')).toHaveAttribute('aria-invalid', 'true');
    expect(field('birthDate')).not.toHaveAttribute('aria-invalid');
    // Under each field, why: the server's reason, or to check the value.
    expect(field('sourceId').nextElementSibling).toHaveTextContent(
      'That source holds another type of record.',
    );
    expect(field('date').nextElementSibling).toHaveTextContent('Check this value.');
  });

  test('Cancel and the back link return to the list unsaved', async () => {
    await openMaria();
    const back = `/records?q=${encodeURIComponent('мария')}`;
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', back);
    expect(screen.getByRole('link', { name: 'Back to records' })).toHaveAttribute('href', back);
    expect(editing.saved).toEqual([]);
  });

  test('says so for an id that cannot be a record, without asking the server', async () => {
    me.current = { isAdmin: true };
    renderAt('/records/abc/edit');
    expect(await screen.findByText('The record no longer exists.')).toBeInTheDocument();
  });
});

describe('editing a death', () => {
  const field = (name: string) =>
    document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;

  async function openDeath() {
    me.current = { isAdmin: true };
    renderAt('/records?kind=deaths');
    await screen.findByText('Aleksanteri Juosepinp. Tattari');
    fireEvent.click(screen.getAllByRole('link', { name: 'Edit record' })[0]);
    await waitFor(() => expect(field('deceased.nameRu')).toBeTruthy());
    return document.querySelector('main form') as HTMLFormElement;
  }

  test('opens with its death, burial and people, and no baptism fields', async () => {
    await openDeath();
    expect(window.location.pathname).toBe('/records/301/edit');
    expect(window.location.search).toBe('?kind=deaths');
    expect(field('date')).toHaveValue('07.01.1918');
    expect(screen.getByText('Died')).toBeInTheDocument();
    expect(field('placeId')).toHaveValue('2');
    expect(field('burialDate')).toHaveValue('14.01.1918');
    expect(field('burialPlaceText')).toHaveValue('Губаницкое кладбище');
    expect(field('causeText')).toHaveValue('воспаление лёгких');
    expect(field('deceased.ageText')).toHaveValue('3 г. 2 мес. 9 дн.');
    expect(field('deceased.civilStatusText')).toHaveValue('дитя');
    expect(field('deceased.birthplaceId')).toHaveValue('2');
    expect(field('father.rankText')).toHaveValue('');
    expect(field('mother.nameRu')).toHaveValue('');
    expect(field('birthDate')).toBeNull();
    expect(field('officiantId')).toBeNull();
    expect(field('child.nameRu')).toBeNull();
  });

  test('saves and returns to the deaths list', async () => {
    const form = await openDeath();
    fireEvent.input(field('causeText'), { target: { value: 'дифтерия' } });
    fireEvent.submit(form);

    await waitFor(() => expect(window.location.pathname).toBe('/records'));
    expect(window.location.search).toBe('?kind=deaths');
    const [saved] = editing.saved;
    expect(saved.get('id')).toBe('301');
    expect(saved.get('causeText')).toBe('дифтерия');
    expect(saved.get('returnKind')).toBe('deaths');
  });
});

describe('editing a household', () => {
  const field = (name: string) =>
    document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;

  async function openHousehold() {
    me.current = { isAdmin: true };
    renderAt('/records?kind=households');
    await screen.findByText('Myyry Nikolai Kaarlonp.');
    fireEvent.click(screen.getByRole('link', { name: 'Edit record' }));
    await waitFor(() => expect(field('members.0.nameFi')).toBeTruthy());
    return document.querySelector('main form') as HTMLFormElement;
  }

  test('opens with its people numbered, and one blank to add', async () => {
    await openHousehold();
    expect(field('holdingNo')).toHaveValue('3');
    expect(field('placeText')).toHaveValue('Kirkonkylä');
    expect(field('members.0.id')).toHaveValue('40');
    expect(field('members.0.relationTermId')).toHaveValue('1');
    expect(field('members.0.birthDate')).toHaveValue('28.07.1858');
    expect(field('members.1.nameFi')).toHaveValue('Waris Maria Aatamint.');
    // The blank one has no id: saving it with a name adds the person.
    expect(field('members.2.nameFi')).toHaveValue('');
    expect(field('members.2.id')).toBeNull();
    expect(field('members.3.nameFi')).toBeNull();
    // A register's fields and a farm's aren't here.
    expect(field('child.nameRu')).toBeNull();
    expect(field('estateText')).toBeNull();
  });

  test('opening a household and adding people cause no diagnostics', async () => {
    // A first visit loads the edit page's code behind the spinner; the
    // capture is the second opening, from the list, and Add person.
    await openHousehold();
    cleanup();

    me.current = { isAdmin: true };
    renderAt('/records?kind=households');
    await screen.findByText('Myyry Nikolai Kaarlonp.');
    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.click(screen.getByRole('link', { name: 'Edit record' }));
        await waitFor(() => expect(field('members.2.nameFi')).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: 'Add person' }));
        await waitFor(() => expect(field('members.3.nameFi')).toBeTruthy());
        flush();
      },
      { scenario: 'household-edit-add-person' },
    );
    expect(artifact).toHaveNoDiagnostics();
  });

  test('Add person brings another blank, and a save posts them all', async () => {
    const form = await openHousehold();
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }));
    await waitFor(() => expect(field('members.3.nameFi')).toBeTruthy());
    fireEvent.input(field('members.2.nameFi'), { target: { value: 'Myyry Juho Nikolainp.' } });
    fireEvent.submit(form);

    await waitFor(() => expect(window.location.pathname).toBe('/records'));
    const [saved] = editing.saved;
    expect(saved.get('members.0.id')).toBe('40');
    expect(saved.get('members.2.nameFi')).toBe('Myyry Juho Nikolainp.');
    expect(saved.get('members.3.nameFi')).toBe('');
    expect(saved.get('returnKind')).toBe('households');
  });
});

describe('adding and deleting records', () => {
  const field = (name: string) =>
    document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;

  test("only admins get Add record, and it opens a new record of the tab's type", async () => {
    renderAt('/records?kind=deaths');
    await screen.findByText('Aleksanteri Juosepinp. Tattari');
    expect(screen.queryByRole('link', { name: 'Add record' })).toBeNull();
    cleanup();

    me.current = { isAdmin: true };
    renderAt('/records?kind=deaths');
    const add = await screen.findByRole('link', { name: 'Add record' });
    expect(add).toHaveAttribute('href', '/records/new?kind=deaths');
    fireEvent.click(add);
    await screen.findByRole('heading', { level: 1, name: 'New record' });
    await waitFor(() => expect(field('deceased.nameRu')).toBeTruthy());
    // Empty, with no id; the sources offered are the type's.
    expect(field('id')).toHaveValue('');
    expect(field('causeText')).toHaveValue('');
    const sources = [...(field('sourceId') as HTMLSelectElement).options].map((o) => o.text);
    expect(sources).toEqual(['Губаницы: умершие']);
    // Nothing to delete yet.
    expect(screen.queryByRole('button', { name: 'Delete record' })).toBeNull();
  });

  test('opening a new record from the list causes no diagnostics', async () => {
    me.current = { isAdmin: true };
    renderAt('/records/new?kind=households');
    await waitFor(() => expect(field('members.0.nameFi')).toBeTruthy());
    cleanup();

    me.current = { isAdmin: true };
    renderAt('/records?kind=households');
    const add = await screen.findByRole('link', { name: 'Add record' });
    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.click(add);
        // A new household: one blank person, none on the record yet.
        await waitFor(() => expect(field('members.0.nameFi')).toBeTruthy());
        expect(field('members.1.nameFi')).toBeNull();
        flush();
      },
      { scenario: 'record-new-open' },
    );
    expect(artifact).toHaveNoDiagnostics();
  });

  test('a new record is saved with its source and page, and confirmed with a toast', async () => {
    me.current = { isAdmin: true };
    renderAt('/records/new?kind=deaths');
    await waitFor(() => expect(field('deceased.nameRu')).toBeTruthy());
    fireEvent.input(field('page'), { target: { value: '15' } });
    fireEvent.input(field('deceased.nameRu'), { target: { value: 'Иван Петров' } });
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);

    await waitFor(() => expect(window.location.pathname).toBe('/records'));
    const [saved] = editing.saved;
    expect(saved.get('id')).toBe('');
    expect(saved.get('sourceId')).toBe('2');
    expect(saved.get('page')).toBe('15');
    expect(saved.get('deceased.nameRu')).toBe('Иван Петров');
    expect(await screen.findByRole('status')).toHaveTextContent('Record added.');
  });

  test('a new record starts in the source the list shows, and stays in it', async () => {
    me.current = { isAdmin: true };
    renderAt('/records/new?kind=deaths&source=2');
    await waitFor(() => expect(field('sourceId')).toHaveValue('2'));
    expect(field('returnSource')).toHaveValue('2');
    // The source isn't asked again: it is shown, and posts hidden.
    expect(field('sourceId').tagName).toBe('INPUT');
    expect(field('sourceId')).toHaveAttribute('type', 'hidden');
    expect(screen.getByText('Губаницы: умершие')).toBeInTheDocument();
    // Transcribing goes on with the next record: Save and add next leads,
    // though Enter still saves.
    const form = document.querySelector('main form') as HTMLFormElement;
    const buttons = [...form.querySelectorAll('button[type="submit"]')];
    expect(buttons[0]).toHaveTextContent('Save');
    expect(buttons[0]).not.toHaveClass('btn-primary');
    expect(buttons[1]).toHaveTextContent('Save and add next');
    expect(buttons[1]).toHaveClass('btn-primary');
  });

  test("a new record in a source is of the source's type, whatever the tab", async () => {
    me.current = { isAdmin: true };
    // From the sources page: the list's kind isn't given.
    renderAt('/records/new?source=3');
    await waitFor(() => expect(field('sourceId')).toHaveValue('3'));
    expect(field('members.0.nameFi')).toBeInTheDocument();
    expect(field('child.nameRu')).toBeNull();
  });

  test('a locality named in a new record is added with it', async () => {
    me.current = { isAdmin: true };
    renderAt('/records/new?source=2');
    await waitFor(() => expect(field('deceased.nameRu')).toBeTruthy());
    fireEvent.input(field('deceased.nameRu'), { target: { value: 'Иван Петров' } });
    fireEvent.input(field('placeText'), { target: { value: 'Новая' } });
    // Each locality field (the place, the deceased's birthplace) has its own box.
    fireEvent.click(field('placeCreate'));
    await waitFor(() => expect(field('placeNew.nameRu')).toHaveValue('Новая'));
    fireEvent.change(field('placeNew.parishId'), { target: { value: '7' } });
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);

    await waitFor(() => expect(window.location.pathname).toBe('/records'));
    const [saved] = editing.saved;
    expect(saved.get('placeText')).toBe('Новая');
    expect(saved.get('placeId')).toBe('');
    expect(saved.get('placeCreate')).toBe('on');
    expect(saved.get('placeNew.nameRu')).toBe('Новая');
    expect(saved.get('placeNew.kind')).toBe('village');
    expect(saved.get('placeNew.parishId')).toBe('7');
  });

  test('Save and add next opens the next record on the same page, village and date', async () => {
    me.current = { isAdmin: true };
    renderAt('/records/new?kind=households');
    await waitFor(() => expect(field('members.0.nameFi')).toBeTruthy());
    // Enter in a field submits with the form's first button: a plain Save.
    const form = document.querySelector('main form') as HTMLFormElement;
    expect(form.querySelector('button[type="submit"]')).toHaveTextContent('Save');
    expect(form.querySelector('button[type="submit"]')).not.toHaveAttribute('name');

    fireEvent.input(field('members.0.nameFi'), { target: { value: 'Matti' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and add next' }));
    await waitFor(() => expect(window.location.search).toBe('?kind=households&after=401'));
    expect(editing.saved[0].get('next')).toBe('on');
    expect(await screen.findByRole('status')).toHaveTextContent('Record added.');

    // A new record (no id) in household 401's source, date and village,
    // with its own number and nobody in it yet.
    await waitFor(() => expect(field('placeText')).toHaveValue('Kirkonkylä'));
    expect(field('id')).toHaveValue('');
    expect(field('sourceId')).toHaveValue('3');
    expect(field('date')).toHaveValue('1927');
    expect(field('holdingNo')).toHaveValue('');
    expect(field('members.0.nameFi')).toHaveValue('');
    expect(field('members.0.id')).toBeNull();
  });

  test('an existing record has no Save and add next', async () => {
    me.current = { isAdmin: true };
    renderAt('/records/2/edit');
    await waitFor(() => expect(field('sourceId')).toHaveValue('1'));
    expect(screen.queryByRole('button', { name: 'Save and add next' })).toBeNull();
  });

  test('a record says when its type has no source yet', async () => {
    me.current = { isAdmin: true };
    renderAt('/records/new?kind=marriages');
    expect(await screen.findByText('Add a source of this type first.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add source' })).toHaveAttribute(
      'href',
      '/sources/new',
    );
  });

  test('an existing record shows its source and page, and can be deleted', async () => {
    me.current = { isAdmin: true };
    renderAt('/records/2/edit');
    await waitFor(() => expect(field('sourceId')).toHaveValue('1'));
    expect(field('page')).toHaveValue('12об');

    fireEvent.click(screen.getByRole('button', { name: 'Delete record' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete record' }),
    );
    await waitFor(() => expect(window.location.pathname).toBe('/records'));
    const [deleted] = editing.deleted;
    expect(deleted.get('id')).toBe('2');
    expect(deleted.get('version')).toBe('4');
    expect(await screen.findByRole('status')).toHaveTextContent('Record deleted.');
  });
});
