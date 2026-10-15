import { Loading, flush } from 'solid-js';
import { captureArtifact } from '@solidjs/diagnostics';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

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
  } as Record<string, (typeof baptisms)[number][]>;
  const counts = { baptisms: 120, marriages: 1, deaths: 2, households: 0, taxpayers: 0 };
  const getRecords = vi.fn(async (kind: string, search: string, page: number) => {
    const found = (entries[kind] ?? []).filter(
      (e) =>
        kind !== 'baptisms' ||
        (e.child?.ru ?? '').toLowerCase().includes(search.trim().toLowerCase()),
    );
    const pages = Math.max(1, Math.ceil(found.length / size));
    const current = Math.min(Math.max(1, page), pages);
    const records = found.slice((current - 1) * size, current * size).map((e) => ({ ...e }));
    return { kind, counts, total: found.length, page: current, pages, records };
  });
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
    failWith: null as null | { message: string; fields?: string[] },
    record: () => ({
      id: 2,
      kind: 'baptisms' as const,
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
        father: person({ id: 11, role: 'father', sex: 'male', nameRu: 'Иоанн Адамов Варис' }),
        mother: null,
      },
    }),
    death: () => ({
      id: 301,
      kind: 'deaths' as const,
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
  };
  function person(fields: Record<string, unknown>) {
    const names = ['name', 'given', 'patronymic', 'surname', 'maiden'].flatMap((part) => [
      `${part}Ru`,
      `${part}Fi`,
    ]);
    const other = ['sex', 'deathDate', 'origin', 'ageText', 'rankText', 'religionText'].concat([
      'civilStatusText',
      'residenceText',
      'residenceId',
      'birthplaceText',
      'birthplaceId',
    ]);
    return {
      ...Object.fromEntries([...names, ...other].map((name) => [name, null])),
      ...fields,
    } as never;
  }
  return { me, editing };
});

vi.mock('~/data/session', () => ({ getCurrentUser: vi.fn(async () => me.current) }));
vi.mock('~/data/records', async () => {
  const { action } = await import('@solidjs/router');
  const { redirect } = await import('@solidjs/web');
  return {
    getRecords,
    RECORDS_PAGE_SIZE: 50,
    getRecordEdit: vi.fn(async (id: number) =>
      id === 2 ? editing.record() : id === 301 ? editing.death() : null,
    ),
    getRecordEditOptions: vi.fn(async () => ({
      places: [
        { id: 1, name: 'Горки', parish: 'Губаницы' },
        { id: 2, name: 'Волгово', parish: 'Губаницы' },
      ],
      clergy: [{ id: 7, name: 'Берг' }],
    })),
    // Like the server: a refusal throws its error; a save redirects to the
    // list place the form carried.
    saveRecord: action(async (form: FormData) => {
      editing.saved.push(form);
      if (editing.failWith) throw editing.failWith;
      const back = new URLSearchParams();
      for (const [field, key] of [
        ['returnKind', 'kind'],
        ['returnQ', 'q'],
        ['returnPage', 'page'],
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
    <Router>{(props) => <Loading fallback="Loading">{props.children}</Loading>}</Router>
  ));
}

// The child column's names; English shows the Finnish form when there is one.
const childNames = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody tr .font-medium')].map((el) => el.textContent);

afterEach(() => {
  cleanup();
  me.current = null;
  editing.saved = [];
  editing.failWith = null;
  getRecords.mockClear();
});

describe('/records', () => {
  test('shows the first page, with the dates and names of each entry', async () => {
    const { container } = renderAt('/records');
    await waitFor(() => expect(childNames(container)).toHaveLength(50));
    expect(getRecords).toHaveBeenLastCalledWith('baptisms', '', 1);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    const first = container.querySelector('tbody tr')!;
    expect(first).toHaveTextContent('3.1895'); // born, month only
    expect(first).toHaveTextContent('12.3.1895'); // baptised
    expect(first).toHaveTextContent('Twins');
    // English shows the Finnish form when the register gives one.
    expect(first).toHaveTextContent('Juhana Aataminp. Waris');
    expect(container.querySelector('tbody tr:nth-child(2)')).toHaveTextContent('Maria');
    expect(first.querySelector('[title]')).toHaveAttribute('title', 'In the source: Горкка');
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
    expect(getRecords).toHaveBeenLastCalledWith('baptisms', 'мария', 1);
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

    fireEvent.click(screen.getByRole('link', { name: /Households/ }));
    expect(await screen.findByText('There are no records of this type yet.')).toBeInTheDocument();
    expect(getRecords).toHaveBeenLastCalledWith('households', 'ребёнок', 1);
    expect(screen.getByRole('link', { name: /Households/ })).toHaveClass('tab-active');
    expect(tabs.querySelectorAll('.tab')).toHaveLength(5);
    // The search form sends the kind along, for searching before JavaScript.
    expect(container.querySelector('input[type=hidden][name=kind]')).toHaveValue('households');
  });

  test('marriages show the bride and groom, with their ages and villages', async () => {
    renderAt('/records?kind=marriages');
    const groom = await screen.findByText('Mikkel Skippari');
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['Married', 'Groom', 'Bride', 'Notes']);
    const row = groom.closest('tr')!;
    expect(row).toHaveTextContent('14.1.1918');
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
    expect(row).toHaveTextContent('7.1.1918');
    expect(row).toHaveTextContent('14.1.1918');
    expect(row).toHaveTextContent('3 г. 2 мес. 9 дн.');
    expect(row).toHaveTextContent('Медниково');
    expect(row).toHaveTextContent('воспаление лёгких');
    expect(row.nextElementSibling).toHaveTextContent('Stillborn');
  });

  test('an unknown ?kind= shows baptisms', async () => {
    const { container } = renderAt('/records?kind=nonsense');
    await waitFor(() => expect(childNames(container)).toHaveLength(50));
    expect(getRecords).toHaveBeenLastCalledWith('baptisms', '', 1);
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
    expect(field('date')).toHaveValue('12.3.1895');
    expect(field('birthDate')).toHaveValue('3.1895');
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
    expect(saved.get('date')).toBe('12.3.1895');
    expect(saved.get('returnQ')).toBe('мария');
  });

  test('a refused save stays, says why and marks the fields', async () => {
    editing.failWith = { message: 'Check the marked fields.', fields: ['date'] };
    const form = await openMaria();
    fireEvent.submit(form);

    expect(await screen.findByRole('alert')).toHaveTextContent('Check the marked fields.');
    expect(window.location.pathname).toBe('/records/2/edit');
    expect(field('date')).toHaveAttribute('aria-invalid', 'true');
    expect(field('birthDate')).not.toHaveAttribute('aria-invalid');
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
    expect(field('date')).toHaveValue('7.1.1918');
    expect(screen.getByText('Died')).toBeInTheDocument();
    expect(field('placeId')).toHaveValue('2');
    expect(field('burialDate')).toHaveValue('14.1.1918');
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
