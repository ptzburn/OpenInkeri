import { flush } from 'solid-js';
import { expectNoSilentHolds } from '@solidjs/diagnostics';
import { captureArtifact } from '~/testing/capture';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import type { FormError } from '~/lib/form-error';
import { renderAt as renderPage } from '~/testing/render';

// The places pages (villages and parishes) through the real router, with
// their server functions answering from made-up places and parishes.
const { me, places } = vi.hoisted(() => {
  const me: { current: { isAdmin: boolean } | null } = { current: null };
  const places = {
    saved: [] as FormData[],
    failWith: null as null | FormError,
    deleted: [] as FormData[],
    // What links to Горки on its edit page.
    uses: { records: 0, birthplaces: 0, churches: 0 },
    list: () => ({
      places: [
        {
          id: 1,
          kind: 'village' as const,
          nameRu: 'Горки',
          nameFi: 'Gorkka',
          parishId: 5,
          parish: { ru: 'Губаницы', fi: 'Hevaa' },
          latitude: 59.613487,
          longitude: 30.22519,
          coordinateStatus: 'approximate' as const,
          spellings: ['Бедная Горка', 'Горки'],
          records: 331,
        },
        {
          id: 2,
          kind: 'manor' as const,
          nameRu: 'Мыза Кикерино',
          nameFi: null,
          parishId: null,
          parish: null,
          latitude: null,
          longitude: null,
          coordinateStatus: 'unknown' as const,
          spellings: [],
          records: 4,
        },
        {
          id: 3,
          kind: 'village' as const,
          nameRu: 'Ёлкино',
          nameFi: null,
          parishId: null,
          parish: null,
          latitude: null,
          longitude: null,
          coordinateStatus: 'unknown' as const,
          spellings: ['Елкина'],
          records: 0,
        },
      ],
      unlinked: [{ text: 'Серебетта', records: 2 }],
    }),
  };
  return { me, places };
});

vi.mock('~/data/session', () => ({
  getCurrentUser: vi.fn(async () => me.current),
  requireAdmin: vi.fn(async () => !!me.current?.isAdmin),
}));
// The locality search: one settlement, found by either name, nearest to parish 5's church.
vi.mock('~/data/gazetteer', () => ({
  getGazetteerHits: vi.fn(async (q: string) =>
    /^(губ|kup)/i.test(q)
      ? [
          {
            source: 'osm',
            sourceId: 'way/251708753',
            kind: 'village',
            name: 'Губаницы',
            nameRu: 'Губаницы',
            nameFi: 'Kupanitsa',
            names: ['Губаницы', 'Kupanitsa', 'Gubanitsi'],
            latitude: 59.4880048,
            longitude: 29.5348549,
            detail: null,
            parish: { id: 5, name: { ru: 'Губаницы', fi: 'Hevaa' }, km: 0.4 },
            existing: null,
            near: null,
          },
        ]
      : [],
  ),
  getMapHits: vi.fn(async () => []),
}));
const { parishes } = vi.hoisted(() => ({
  parishes: {
    saved: [] as FormData[],
    deleted: [] as FormData[],
    deleteFailsWith: null as null | { message: string },
    // What belongs to parish 5 on its edit page.
    uses: { villages: 0, sources: 0 },
  },
}));
vi.mock('~/data/parishes', async () => {
  const { action } = await import('@solidjs/router');
  const { redirect } = await import('@solidjs/web');
  return {
    getParishes: vi.fn(async () => [
      { id: 5, nameRu: 'Губаницы', nameFi: 'Hevaa', note: null, villages: 1, sources: 1 },
      { id: 6, nameRu: 'Курляндия', nameFi: null, note: 'Не приход', villages: 0, sources: 0 },
    ]),
    getParishOptions: vi.fn(async () => [
      { id: 5, name: { ru: 'Губаницы', fi: 'Hevaa' }, spellings: ['Губаницы', 'Hevaa'] },
    ]),
    getParishEdit: vi.fn(async (id: number) =>
      id === 5
        ? {
            id: 5,
            version: 2,
            nameRu: 'Губаницы',
            nameFi: 'Hevaa',
            churchPlaceId: 1,
            note: null,
            ...parishes.uses,
          }
        : null,
    ),
    saveParish: action(async (form: FormData) => {
      parishes.saved.push(form);
      throw redirect('/places/parishes');
    }, 'save-parish'),
    // Like the server: a refusal throws its error; a delete redirects to the list.
    deleteParish: action(async (form: FormData) => {
      parishes.deleted.push(form);
      if (parishes.deleteFailsWith) throw parishes.deleteFailsWith;
      throw redirect('/places/parishes');
    }, 'delete-parish'),
  };
});
vi.mock('~/data/places', async () => {
  const { action } = await import('@solidjs/router');
  const { redirect } = await import('@solidjs/web');
  return {
    getPlaces: vi.fn(async () => places.list()),
    getPlaceMarkers: vi.fn(async () => []),
    // The church's choices: Горки in parish 5, Кикерино in another parish.
    getPlaceOptions: vi.fn(async () => [
      {
        id: 2,
        name: { ru: 'Кикерино', fi: null },
        parishId: 7,
        parish: { ru: 'Волосово', fi: null },
        spellings: ['Кикерино'],
      },
      {
        id: 1,
        name: { ru: 'Горки', fi: 'Gorkka' },
        parishId: 5,
        parish: { ru: 'Губаницы', fi: 'Hevaa' },
        spellings: ['Горки', 'Горка'],
      },
    ]),
    getPlaceEdit: vi.fn(async (id: number) =>
      id === 1
        ? {
            id: 1,
            version: 3,
            kind: 'village',
            nameRu: 'Горки',
            nameFi: 'Gorkka',
            parishId: 5,
            latitude: 59.613487,
            longitude: 30.22519,
            coordinateStatus: 'approximate',
            note: null,
            spellings: ['Бедная Горка', 'Горки'],
            ...places.uses,
          }
        : null,
    ),
    // Like the server: a refusal throws its error; a save redirects to the
    // list with the search the form carried.
    savePlace: action(async (form: FormData) => {
      places.saved.push(form);
      if (places.failWith) throw places.failWith;
      const q = form.get('returnQ');
      throw redirect(
        typeof q === 'string' && q
          ? `/places/villages?q=${encodeURIComponent(q)}`
          : '/places/villages',
      );
    }, 'save-place'),
    deletePlace: action(async (form: FormData) => {
      places.deleted.push(form);
      const q = form.get('returnQ');
      throw redirect(
        typeof q === 'string' && q
          ? `/places/villages?q=${encodeURIComponent(q)}`
          : '/places/villages',
      );
    }, 'delete-place'),
  };
});

const renderAt = (url: string) => renderPage(url, { toasts: true });

const names = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody tr .font-medium')].map((el) => el.textContent);
const field = (name: string) =>
  document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;

afterEach(() => {
  cleanup();
  me.current = null;
  places.saved = [];
  places.failWith = null;
  places.deleted = [];
  places.uses = { records: 0, birthplaces: 0, churches: 0 };
  parishes.saved = [];
  parishes.deleted = [];
  parishes.deleteFailsWith = null;
  parishes.uses = { villages: 0, sources: 0 };
});

describe('/places/villages', () => {
  test('lists the places with their parish, spellings, records and location', async () => {
    const { container } = renderAt('/places/villages');
    await waitFor(() => expect(names(container)).toEqual(['Горки', 'Мыза Кикерино', 'Ёлкино']));
    const first = container.querySelector('tbody tr')!;
    // English shows the parish's Finnish name.
    expect(first).toHaveTextContent('Hevaa');
    // The spelling that is the name itself isn't repeated.
    expect(first.querySelectorAll('li')).toHaveLength(1);
    expect(first).toHaveTextContent('Бедная Горка');
    expect(first).toHaveTextContent('331');
    expect(screen.getAllByRole('link', { name: /Approximate/ })[0]).toHaveAttribute(
      'href',
      expect.stringContaining('mlat=59.613487'),
    );
    // Every place's type has its own column, villages included.
    const typeColumn = [...container.querySelectorAll('thead th')].findIndex(
      (th) => th.textContent === 'Type',
    );
    expect(typeColumn).toBe(2);
    expect(
      [...container.querySelectorAll('tbody tr')].map((tr) => tr.children[typeColumn].textContent),
    ).toEqual(['Village', 'Manor', 'Village']);
  });

  test('in Russian, only the Russian name is shown', async () => {
    document.cookie = 'PARAGLIDE_LOCALE=ru; path=/';
    try {
      const { container } = renderAt('/places/villages');
      await waitFor(() => expect(names(container)).toHaveLength(3));
      const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
      expect(headers.slice(0, 2)).toEqual(['Название', 'Тип']);
      expect(container.querySelector('tbody tr')!.children).toHaveLength(headers.length);
      expect(container).not.toHaveTextContent('Gorkka');
    } finally {
      document.cookie = 'PARAGLIDE_LOCALE=; path=/; max-age=0';
    }
  });

  test('searches names and spellings, ё as е, without diagnostics', async () => {
    const { container } = renderAt('/places/villages');
    await waitFor(() => expect(names(container)).toHaveLength(3));
    const input = screen.getByRole('searchbox', { name: 'Search localities' });

    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.input(input, { target: { value: 'елк' } });
        await waitFor(() => expect(names(container)).toEqual(['Ёлкино']));
        flush();
      },
      { scenario: 'villages-search' },
    );
    expect(artifact).toHaveNoDiagnostics();
    expect(window.location.search).toBe(`?q=${encodeURIComponent('елк')}`);

    fireEvent.input(input, { target: { value: 'бедная' } });
    await waitFor(() => expect(names(container)).toEqual(['Горки']));
  });

  test('says when nothing matches', async () => {
    renderAt('/places/villages?q=zzz');
    expect(await screen.findByText('No localities match “zzz”.')).toBeInTheDocument();
  });

  test('only admins can add or edit, and see the unlinked spellings', async () => {
    const { container } = renderAt('/places/villages');
    await waitFor(() => expect(names(container)).toHaveLength(3));
    expect(screen.queryByRole('link', { name: 'Add locality' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit locality' })).toBeNull();
    expect(screen.queryByText('Not linked to a locality')).toBeNull();
    cleanup();

    me.current = { isAdmin: true };
    renderAt(`/places/villages?q=${encodeURIComponent('горк')}`);
    expect(await screen.findByRole('link', { name: 'Edit locality' })).toHaveAttribute(
      'href',
      `/places/villages/1/edit?q=${encodeURIComponent('горк')}`,
    );
    expect(screen.getByRole('link', { name: 'Add locality' })).toHaveAttribute(
      'href',
      `/places/villages/new?q=${encodeURIComponent('горк')}`,
    );
    expect(screen.getByText('Not linked to a locality')).toBeInTheDocument();
    expect(screen.getByText('Серебетта')).toBeInTheDocument();
  });
});

describe('editing a village', () => {
  async function openGorki() {
    me.current = { isAdmin: true };
    renderAt(`/places/villages?q=${encodeURIComponent('горк')}`);
    fireEvent.click(await screen.findByRole('link', { name: 'Edit locality' }));
    await screen.findByRole('combobox', { name: 'Find the locality' });
    await waitFor(() => expect(field('nameRu')).toHaveValue('Горки'));
    return document.querySelector('main form') as HTMLFormElement;
  }

  test('opens with the place as stored', async () => {
    await openGorki();
    expect(field('nameFi')).toHaveValue('Gorkka');
    // Its parish shows by name, linked.
    expect(field('parishText')).toHaveValue('Hevaa'); // English shows the Finnish name
    expect(field('parishId')).toHaveValue('5');
    expect(field('coordinates')).toHaveValue('59.613487, 30.22519');
    expect(field('coordinateStatus')).toHaveValue('approximate');
    expect(field('spellings')).toHaveValue('Бедная Горка\nГорки');
  });

  test('saves with the version it was loaded at, then returns to the list', async () => {
    const form = await openGorki();
    fireEvent.input(field('spellings'), { target: { value: 'Бедная Горка\nГорки\nГоркка' } });
    fireEvent.submit(form);

    await waitFor(() => expect(window.location.pathname).toBe('/places/villages'));
    expect(window.location.search).toBe(`?q=${encodeURIComponent('горк')}`);
    const [saved] = places.saved;
    expect(saved.get('id')).toBe('1');
    expect(saved.get('version')).toBe('3');
    expect(saved.get('spellings')).toBe('Бедная Горка\nГорки\nГоркка');
    // The list it lands on says so (English shows the Finnish name).
    expect(await screen.findByRole('status')).toHaveTextContent('Locality Gorkka saved.');
  });

  test('a refused save stays, says why and marks the fields', async () => {
    places.failWith = {
      message: 'Check the marked fields.',
      fields: { nameFi: '', coordinates: 'Not on Earth.' },
    };
    const form = await openGorki();
    fireEvent.submit(form);

    expect(await screen.findByRole('alert')).toHaveTextContent('Check the marked fields.');
    expect(window.location.pathname).toBe('/places/villages/1/edit');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(field('nameFi')).toHaveAttribute('aria-invalid', 'true');
    expect(field('nameRu')).not.toHaveAttribute('aria-invalid');
    // The coordinates have no field to mark: their reason shows under the map.
    expect(screen.getByText('Not on Earth.')).toBeInTheDocument();
  });

  test('a locality that records and birthplaces link to says so and cannot be deleted', async () => {
    places.uses = { records: 331, birthplaces: 2, churches: 1 };
    await openGorki();
    expect(
      screen.getByText(
        'Still linked to this locality: 331 records, 2 birthplaces, and the church of 1 parish. Link them to another locality before deleting it.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete locality' })).toBeDisabled();
  });

  test('deleting a locality returns to the list as it was, with a toast', async () => {
    await openGorki();
    fireEvent.click(screen.getByRole('button', { name: 'Delete locality' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete locality' }),
    );

    await waitFor(() => expect(window.location.pathname).toBe('/places/villages'));
    expect(window.location.search).toBe(`?q=${encodeURIComponent('горк')}`);
    const [deleted] = places.deleted;
    expect(deleted.get('id')).toBe('1');
    expect(deleted.get('version')).toBe('3');
    expect(deleted.get('confirm')).toBe('on');
    expect(deleted.get('returnQ')).toBe('горк');
    // English shows the Finnish name.
    expect(await screen.findByRole('status')).toHaveTextContent('Locality Gorkka deleted.');
  });

  test('a new locality has nothing to delete', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/villages/new');
    await screen.findByRole('combobox', { name: 'Find the locality' });
    await waitFor(() => expect(field('nameRu')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Delete locality' })).toBeNull();
  });

  test('a new village starts empty and sends no id', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/villages');
    fireEvent.click(await screen.findByRole('link', { name: 'Add locality' }));
    await screen.findByRole('combobox', { name: 'Find the locality' });
    await waitFor(() => expect(field('nameRu')).toHaveValue(''));
    expect(field('kind')).toHaveValue('village');
    // Spellings come with records: nothing to edit on a new locality.
    expect(field('spellings')).toBeNull();
    fireEvent.input(field('nameRu'), { target: { value: 'Серебетта' } });
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);

    await waitFor(() => expect(window.location.pathname).toBe('/places/villages'));
    expect(places.saved[0].get('id')).toBe('');
    expect(places.saved[0].get('nameRu')).toBe('Серебетта');
    // No Finnish name, so English shows the Russian one.
    expect(await screen.findByRole('status')).toHaveTextContent('Locality Серебетта added.');
  });

  test('a settlement picked in the search fills the names, type, coordinates and parish', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/villages/new');
    await waitFor(() => expect(field('nameRu')).toHaveValue(''));
    const search = screen.getByRole('combobox', { name: 'Find the locality' });
    fireEvent.input(search, { target: { value: 'kupa' } });
    const option = await screen.findByRole('option', { name: /Губаницы/ });
    expect(option).toHaveTextContent('Kupanitsa');
    expect(option).toHaveTextContent('Village · Hevaa (0.4 km)');
    fireEvent.click(within(option).getByRole('button'));

    await waitFor(() => expect(field('nameRu')).toHaveValue('Губаницы'));
    expect(field('nameFi')).toHaveValue('Kupanitsa');
    expect(field('kind')).toHaveValue('village');
    expect(field('coordinates')).toHaveValue('59.4880048, 29.5348549');
    expect(field('coordinateStatus')).toHaveValue('approximate');
    expect(field('parishId')).toHaveValue('5');
    expect(field('parishText')).toHaveValue('Hevaa');
    expect(screen.queryByRole('listbox')).toBeNull();
    // The pick is posted like anything typed.
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);
    await waitFor(() => expect(places.saved).toHaveLength(1));
    expect(places.saved[0].get('nameFi')).toBe('Kupanitsa');
    expect(places.saved[0].get('coordinates')).toBe('59.4880048, 29.5348549');
    expect(places.saved[0].get('parishId')).toBe('5');
  });

  test('a settlement picked fills the fields the admin had changed by hand too', async () => {
    // The hit's kind is the loaded one (village): the signal's value hasn't
    // moved, only the select had, and the pick must still land on it.
    await openGorki();
    expect(field('kind')).toHaveValue('village');
    fireEvent.change(field('kind'), { target: { value: 'manor' } });
    fireEvent.input(field('nameRu'), { target: { value: 'Горкиии' } });
    const search = screen.getByRole('combobox', { name: 'Find the locality' });
    fireEvent.input(search, { target: { value: 'kupa' } });
    const option = await screen.findByRole('option', { name: /Губаницы/ });
    fireEvent.click(within(option).getByRole('button'));
    await waitFor(() => expect(field('nameFi')).toHaveValue('Kupanitsa'));
    expect(field('nameRu')).toHaveValue('Губаницы');
    expect(field('kind')).toHaveValue('village');
  });

  test('removing the marker unsets the coordinates', async () => {
    await openGorki();
    expect(field('coordinates')).toHaveValue('59.613487, 30.22519');
    expect(screen.getByText('59.613487, 30.22519')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove marker' }));
    await waitFor(() => expect(field('coordinates')).toHaveValue(''));
    expect(screen.getByText('Not located yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove marker' })).not.toBeInTheDocument();
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);
    await waitFor(() => expect(places.saved).toHaveLength(1));
    expect(places.saved[0].get('coordinates')).toBe('');
    expect(places.saved[0].get('coordinateStatus')).toBe('unknown');
  });

  test('ticking the box marks the position verified; unticking it, approximate', async () => {
    await openGorki();
    const box = screen.getByRole('checkbox', { name: 'Position checked against sources' });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    await waitFor(() => expect(field('coordinateStatus')).toHaveValue('verified'));
    fireEvent.click(box);
    await waitFor(() => expect(field('coordinateStatus')).toHaveValue('approximate'));
    fireEvent.click(box);
    await waitFor(() => expect(field('coordinateStatus')).toHaveValue('verified'));
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);
    await waitFor(() => expect(places.saved).toHaveLength(1));
    expect(places.saved[0].get('coordinates')).toBe('59.613487, 30.22519');
    expect(places.saved[0].get('coordinateStatus')).toBe('verified');
  });
});

describe('/places/parishes', () => {
  test('in Russian, only the Russian name is shown', async () => {
    document.cookie = 'PARAGLIDE_LOCALE=ru; path=/';
    try {
      const { container } = renderAt('/places/parishes');
      await waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(2));
      const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
      expect(headers[0]).toBe('Название');
      expect(headers).not.toContain('По-фински');
      expect(container.querySelector('tbody tr')!.children).toHaveLength(headers.length);
      expect(container).not.toHaveTextContent('Hevaa');
    } finally {
      document.cookie = 'PARAGLIDE_LOCALE=; path=/; max-age=0';
    }
  });

  test('lists the parishes; a village count opens their villages', async () => {
    const { container } = renderAt('/places/parishes');
    const tabs = await screen.findByRole('navigation', { name: 'Place type' });
    expect(screen.getByRole('link', { name: 'Parishes' })).toHaveClass('tab-active');
    expect(tabs.querySelectorAll('.tab')).toHaveLength(2);
    await waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(2));
    // No villages: a plain 0, not a link.
    expect(container.querySelector('tbody tr:nth-child(2)')).toHaveTextContent('Не приход');

    fireEvent.click(screen.getByRole('link', { name: '1' }));
    await waitFor(() => expect(window.location.search).toBe('?parish=5'));
    await waitFor(() => expect(names(container)).toEqual(['Горки']));
    expect(screen.getByText('Parish: Hevaa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Show all parishes' })).toHaveAttribute(
      'href',
      '/places/villages',
    );
    // The search form keeps the filter.
    expect(container.querySelector('input[type=hidden][name=parish]')).toHaveValue('5');
  });

  test('only admins can add or edit', async () => {
    const { container } = renderAt('/places/parishes');
    await waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(2));
    expect(screen.queryByRole('link', { name: 'Add parish' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit parish' })).toBeNull();
  });

  test('editing a parish saves with the version it was loaded at', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/parishes');
    fireEvent.click((await screen.findAllByRole('link', { name: 'Edit parish' }))[0]);
    await screen.findByRole('heading', { level: 1, name: 'Edit parish' });
    await waitFor(() => expect(field('nameFi')).toHaveValue('Hevaa'));
    // The church: its locality by name, linked to the one it names; the
    // localities to choose from show their parish.
    await waitFor(() => expect(field('churchPlaceId')).toHaveValue('1'));
    expect(field('churchText')).toHaveValue('Gorkka'); // English shows the Finnish name
    fireEvent.input(field('note'), { target: { value: 'Губаницкий приход' } });
    fireEvent.input(field('churchText'), { target: { value: 'Кикерино' } });
    await waitFor(() => expect(field('churchPlaceId')).toHaveValue('2'));
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);

    await waitFor(() => expect(window.location.pathname).toBe('/places/parishes'));
    const [saved] = parishes.saved;
    expect(saved.get('id')).toBe('5');
    expect(saved.get('version')).toBe('2');
    expect(saved.get('note')).toBe('Губаницкий приход');
    expect(saved.get('churchPlaceId')).toBe('2');
    // The list it lands on says so (English shows the Finnish name).
    expect(await screen.findByRole('status')).toHaveTextContent('Parish Hevaa saved.');
  });

  test('a new parish is confirmed with a toast, named as typed', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/parishes/new');
    await screen.findByRole('heading', { level: 1, name: 'New parish' });
    await waitFor(() => expect(field('nameRu')).toBeInTheDocument());
    fireEvent.input(field('nameRu'), { target: { value: 'Тест' } });
    fireEvent.input(field('nameFi'), { target: { value: '  Testi ' } });
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);

    await waitFor(() => expect(window.location.pathname).toBe('/places/parishes'));
    expect(parishes.saved[0].get('id')).toBe('');
    // English shows the Finnish name.
    expect(await screen.findByRole('status')).toHaveTextContent('Parish Testi added.');
  });

  test('a church locality not known yet is added with the parish', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/parishes/new');
    await waitFor(() => expect(field('churchText')).toBeInTheDocument());
    fireEvent.input(field('nameRu'), { target: { value: 'Тест' } });
    // A locality no spelling names: its fields appear, to add it by its names.
    fireEvent.input(field('churchText'), { target: { value: 'Тест' } });
    await waitFor(() => expect(field('churchNew.nameRu')).toHaveValue('Тест'));
    expect(field('churchPlaceId')).toHaveValue('');
    expect(screen.getByText('Add as a new locality')).toBeInTheDocument();
    expect(field('churchCreate')).toHaveValue('on');
    expect(field('churchNew.nameFi')).toHaveValue('');
    expect(field('churchNew.kind')).toHaveValue('village');
    // No parish to choose: the locality goes in this parish.
    expect(field('churchNew.parishId')).toBeNull();
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);

    await waitFor(() => expect(window.location.pathname).toBe('/places/parishes'));
    const [saved] = parishes.saved;
    expect(saved.get('churchText')).toBe('Тест');
    expect(saved.get('churchPlaceId')).toBe('');
    expect(saved.get('churchCreate')).toBe('on');
    expect(saved.get('churchNew.nameRu')).toBe('Тест');
  });

  test('deleting a parish posts its id and version once confirmed', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/parishes/5/edit');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete parish' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete parish' }),
    );

    await waitFor(() => expect(window.location.pathname).toBe('/places/parishes'));
    const [deleted] = parishes.deleted;
    expect(deleted.get('id')).toBe('5');
    expect(deleted.get('version')).toBe('2');
    expect(deleted.get('confirm')).toBe('on');
    // The list it lands on says so (English shows the Finnish name).
    expect(await screen.findByRole('status')).toHaveTextContent('Parish Hevaa deleted.');
  });

  test('a refused delete says why and stays on the page', async () => {
    me.current = { isAdmin: true };
    parishes.deleteFailsWith = { message: 'The parish still has villages (1) or sources (1).' };
    renderAt('/places/parishes/5/edit');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete parish' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete parish' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('villages (1) or sources (1)');
    expect(window.location.pathname).toBe('/places/parishes/5/edit');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  test('a parish that villages and sources belong to says so and cannot be deleted', async () => {
    me.current = { isAdmin: true };
    parishes.uses = { villages: 3, sources: 1 };
    renderAt('/places/parishes/5/edit');
    const button = await screen.findByRole('button', { name: 'Delete parish' });

    expect(
      screen.getByText(
        'Still in this parish: 3 localities and 1 source. Move them to another parish before deleting it.',
      ),
    ).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  test('the warning names only what belongs to the parish', async () => {
    me.current = { isAdmin: true };
    parishes.uses = { villages: 1, sources: 0 };
    renderAt('/places/parishes/5/edit');
    await screen.findByRole('button', { name: 'Delete parish' });

    expect(screen.getByText(/^Still in this parish: 1 locality\./)).toBeInTheDocument();
  });

  test('a new parish has nothing to delete', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/parishes/new');
    await screen.findByRole('heading', { level: 1, name: 'New parish' });
    await waitFor(() => expect(field('nameRu')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Delete parish' })).toBeNull();
  });

  test('a new village from a filtered list starts in that parish', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/villages?parish=5');
    fireEvent.click(await screen.findByRole('link', { name: 'Add locality' }));
    await screen.findByRole('combobox', { name: 'Find the locality' });
    await waitFor(() => expect(field('parishId')).toHaveValue('5'));
    expect(field('parishText')).toHaveValue('Hevaa'); // English shows the Finnish name
    expect(field('returnParish')).toHaveValue('5');
  });

  test('the parish is typed by name; one not known yet is added with the locality', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/villages/new');
    await waitFor(() => expect(field('parishText')).toBeTruthy());
    expect(field('parishId')).toHaveValue('');
    fireEvent.input(field('nameRu'), { target: { value: 'Серебетта' } });
    // Either name links the parish.
    fireEvent.input(field('parishText'), { target: { value: 'Hevaa' } });
    await waitFor(() => expect(field('parishId')).toHaveValue('5'));
    // A parish no name matches: its fields appear, to add it without a
    // church (the locality being added may well be it).
    fireEvent.input(field('parishText'), { target: { value: 'Туутари' } });
    await waitFor(() => expect(field('parishId')).toHaveValue(''));
    // Nothing says a parish is being added: its other name is just asked for.
    expect(screen.queryByText('Add as a new parish')).toBeNull();
    expect(field('parishNew.nameRu')).toHaveValue('Туутари');
    fireEvent.input(field('parishNew.nameFi'), { target: { value: 'Tuutari' } });
    expect(
      screen.queryByRole('checkbox', { name: 'Also add a locality of this name, as its church' }),
    ).toBeNull();
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);

    await waitFor(() => expect(window.location.pathname).toBe('/places/villages'));
    const [saved] = places.saved;
    expect(saved.get('nameRu')).toBe('Серебетта');
    expect(saved.get('parishText')).toBe('Туутари');
    expect(saved.get('parishId')).toBe('');
    expect(saved.get('parishCreate')).toBe('on');
    expect(saved.get('parishNew.nameRu')).toBe('Туутари');
    expect(saved.get('parishNew.nameFi')).toBe('Tuutari');
    expect(saved.get('parishNew.church')).toBeNull();
  });

  test('a parish typed in Latin letters is the Finnish name; the Russian one is asked for', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/villages/new');
    await waitFor(() => expect(field('parishText')).toBeTruthy());
    fireEvent.input(field('parishText'), { target: { value: 'Tuutari' } });
    await waitFor(() => expect(field('parishNew.nameFi')).toHaveValue('Tuutari'));
    expect(field('parishNew.nameFi')).toHaveAttribute('type', 'hidden');
    expect(field('parishNew.nameRu')).not.toHaveAttribute('type', 'hidden');
    expect(field('parishNew.nameRu')).toHaveValue('');
    expect(field('parishNew.nameRu')).toBeRequired();
  });
});

describe('reactivity', () => {
  // Each scenario is one click. Besides Solid's diagnostics, it checks that
  // the click shows at once: the list dims while the next page loads,
  // instead of the old page sitting there unchanged (a "silent hold").
  async function capture(scenario: string, click: () => Promise<void>) {
    const { artifact } = await captureArtifact(
      async () => {
        await click();
        flush();
      },
      { scenario },
    );
    expect(artifact).toHaveNoDiagnostics();
    expectNoSilentHolds(artifact);
  }

  test('following a village count to its villages', async () => {
    const { container } = renderAt('/places/parishes');
    await waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(2));
    await capture('parish-to-villages', async () => {
      fireEvent.click(screen.getByRole('link', { name: '1' }));
      await waitFor(() => expect(names(container)).toEqual(['Горки']));
    });
  });

  test('switching tabs', async () => {
    const { container } = renderAt('/places/villages');
    await waitFor(() => expect(names(container)).toHaveLength(3));
    await capture('places-tabs', async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Parishes' }));
      await waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(2));
    });
  });

  test('opening the edit pages', async () => {
    me.current = { isAdmin: true };
    // A first visit loads each page's code behind the spinner (in the app
    // the server renders a direct visit); the captures are the clicks.
    renderAt('/places/villages/1/edit');
    await waitFor(() => expect(field('nameRu')).toHaveValue('Горки'));
    cleanup();
    renderAt('/places/parishes/5/edit');
    await waitFor(() => expect(field('nameFi')).toHaveValue('Hevaa'));
    cleanup();

    const { container } = renderAt('/places/villages');
    await waitFor(() => expect(names(container)).toHaveLength(3));
    await capture('village-edit-open', async () => {
      fireEvent.click(screen.getAllByRole('link', { name: 'Edit locality' })[0]);
      await waitFor(() => expect(field('spellings')).toHaveValue('Бедная Горка\nГорки'));
    });
    cleanup();

    renderAt('/places/parishes');
    await screen.findAllByRole('link', { name: 'Edit parish' });
    await capture('parish-edit-open', async () => {
      fireEvent.click(screen.getAllByRole('link', { name: 'Edit parish' })[0]);
      await waitFor(() => expect(field('nameFi')).toHaveValue('Hevaa'));
    });
  });

  test('a refused save', async () => {
    me.current = { isAdmin: true };
    places.failWith = { message: 'Check the marked fields.', fields: { coordinates: '' } };
    renderAt('/places/villages/1/edit');
    await waitFor(() => expect(field('nameRu')).toHaveValue('Горки'));
    await capture('village-save-refused', async () => {
      fireEvent.submit(document.querySelector('main form') as HTMLFormElement);
      await screen.findByRole('alert');
    });
  });

  test('a refused delete', async () => {
    me.current = { isAdmin: true };
    parishes.deleteFailsWith = { message: 'The parish still has villages (1) or sources (1).' };
    renderAt('/places/parishes/5/edit');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete parish' }));
    const confirm = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Delete parish',
    });
    await capture('parish-delete-refused', async () => {
      fireEvent.click(confirm);
      await screen.findByRole('alert');
    });
  });

  test('a delete', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/parishes/5/edit');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete parish' }));
    const confirm = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Delete parish',
    });
    await capture('parish-delete', async () => {
      fireEvent.click(confirm);
      await waitFor(() => expect(window.location.pathname).toBe('/places/parishes'));
      await screen.findAllByRole('link', { name: 'Edit parish' });
    });
  });
});
