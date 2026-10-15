import { Loading, flush } from 'solid-js';
import { captureArtifact, expectNoSilentHolds } from '@solidjs/diagnostics';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { Router } from '~/router';

// The places pages (villages and parishes) through the real router, with
// their server functions answering from made-up places and parishes.
const { me, places } = vi.hoisted(() => {
  const me: { current: { isAdmin: boolean } | null } = { current: null };
  const places = {
    saved: [] as FormData[],
    failWith: null as null | { message: string; fields?: string[] },
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
const { parishes } = vi.hoisted(() => ({
  parishes: {
    saved: [] as FormData[],
    deleted: [] as FormData[],
    deleteFailsWith: null as null | { message: string },
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
    getParishOptions: vi.fn(async () => [{ id: 5, name: 'Губаницы' }]),
    getParishEdit: vi.fn(async (id: number) =>
      id === 5 ? { id: 5, version: 2, nameRu: 'Губаницы', nameFi: 'Hevaa', note: null } : null,
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
  };
});

function renderAt(url: string) {
  window.history.replaceState(null, '', url);
  return render(() => (
    <Router>{(props) => <Loading fallback="Loading">{props.children}</Loading>}</Router>
  ));
}

const names = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody tr .font-medium')].map((el) => el.textContent);
const field = (name: string) =>
  document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;

afterEach(() => {
  cleanup();
  me.current = null;
  places.saved = [];
  places.failWith = null;
  parishes.saved = [];
  parishes.deleted = [];
  parishes.deleteFailsWith = null;
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
    expect(container.querySelector('tbody tr:nth-child(2)')).toHaveTextContent('Manor');
  });

  test('searches names and spellings, ё as е, without diagnostics', async () => {
    const { container } = renderAt('/places/villages');
    await waitFor(() => expect(names(container)).toHaveLength(3));
    const input = screen.getByRole('searchbox', { name: 'Search villages' });

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
    expect(await screen.findByText('No villages match “zzz”.')).toBeInTheDocument();
  });

  test('only admins can add or edit, and see the unlinked spellings', async () => {
    const { container } = renderAt('/places/villages');
    await waitFor(() => expect(names(container)).toHaveLength(3));
    expect(screen.queryByRole('link', { name: 'Add village' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit village' })).toBeNull();
    expect(screen.queryByText('Not linked to a village')).toBeNull();
    cleanup();

    me.current = { isAdmin: true };
    renderAt(`/places/villages?q=${encodeURIComponent('горк')}`);
    expect(await screen.findByRole('link', { name: 'Edit village' })).toHaveAttribute(
      'href',
      `/places/villages/1/edit?q=${encodeURIComponent('горк')}`,
    );
    expect(screen.getByRole('link', { name: 'Add village' })).toHaveAttribute(
      'href',
      `/places/villages/new?q=${encodeURIComponent('горк')}`,
    );
    expect(screen.getByText('Not linked to a village')).toBeInTheDocument();
    expect(screen.getByText('Серебетта')).toBeInTheDocument();
  });
});

describe('editing a village', () => {
  async function openGorki() {
    me.current = { isAdmin: true };
    renderAt(`/places/villages?q=${encodeURIComponent('горк')}`);
    fireEvent.click(await screen.findByRole('link', { name: 'Edit village' }));
    await screen.findByRole('heading', { level: 1, name: 'Edit village' });
    await waitFor(() => expect(field('nameRu')).toHaveValue('Горки'));
    return document.querySelector('main form') as HTMLFormElement;
  }

  test('opens with the place as stored', async () => {
    await openGorki();
    expect(field('nameFi')).toHaveValue('Gorkka');
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
  });

  test('a refused save stays, says why and marks the fields', async () => {
    places.failWith = { message: 'Check the marked fields.', fields: ['coordinates'] };
    const form = await openGorki();
    fireEvent.submit(form);

    expect(await screen.findByRole('alert')).toHaveTextContent('Check the marked fields.');
    expect(window.location.pathname).toBe('/places/villages/1/edit');
    expect(field('coordinates')).toHaveAttribute('aria-invalid', 'true');
    expect(field('nameRu')).not.toHaveAttribute('aria-invalid');
  });

  test('a new village starts empty and sends no id', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/villages');
    fireEvent.click(await screen.findByRole('link', { name: 'Add village' }));
    await screen.findByRole('heading', { level: 1, name: 'New village' });
    await waitFor(() => expect(field('nameRu')).toHaveValue(''));
    expect(field('kind')).toHaveValue('village');
    fireEvent.input(field('nameRu'), { target: { value: 'Серебетта' } });
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);

    await waitFor(() => expect(window.location.pathname).toBe('/places/villages'));
    expect(places.saved[0].get('id')).toBe('');
    expect(places.saved[0].get('nameRu')).toBe('Серебетта');
  });
});

describe('/places/parishes', () => {
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
    fireEvent.input(field('note'), { target: { value: 'Губаницкий приход' } });
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);

    await waitFor(() => expect(window.location.pathname).toBe('/places/parishes'));
    const [saved] = parishes.saved;
    expect(saved.get('id')).toBe('5');
    expect(saved.get('version')).toBe('2');
    expect(saved.get('note')).toBe('Губаницкий приход');
  });

  test('deleting a parish posts its id and version once confirmed', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/parishes/5/edit');
    const button = await screen.findByRole('button', { name: 'Delete parish' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'I want to delete this parish' }));
    fireEvent.submit(button.closest('form') as HTMLFormElement);

    await waitFor(() => expect(window.location.pathname).toBe('/places/parishes'));
    const [deleted] = parishes.deleted;
    expect(deleted.get('id')).toBe('5');
    expect(deleted.get('version')).toBe('2');
    expect(deleted.get('confirm')).toBe('on');
  });

  test('a refused delete says why and stays on the page', async () => {
    me.current = { isAdmin: true };
    parishes.deleteFailsWith = { message: 'The parish still has villages (1) or sources (1).' };
    renderAt('/places/parishes/5/edit');
    const button = await screen.findByRole('button', { name: 'Delete parish' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'I want to delete this parish' }));
    fireEvent.submit(button.closest('form') as HTMLFormElement);

    expect(await screen.findByRole('alert')).toHaveTextContent('villages (1) or sources (1)');
    expect(window.location.pathname).toBe('/places/parishes/5/edit');
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
    fireEvent.click(await screen.findByRole('link', { name: 'Add village' }));
    await screen.findByRole('heading', { level: 1, name: 'New village' });
    await waitFor(() => expect(field('parishId')).toHaveValue('5'));
    expect(field('returnParish')).toHaveValue('5');
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
      fireEvent.click(screen.getAllByRole('link', { name: 'Edit village' })[0]);
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
    places.failWith = { message: 'Check the marked fields.', fields: ['coordinates'] };
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
    const button = await screen.findByRole('button', { name: 'Delete parish' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'I want to delete this parish' }));
    await capture('parish-delete-refused', async () => {
      fireEvent.submit(button.closest('form') as HTMLFormElement);
      await screen.findByRole('alert');
    });
  });

  test('a delete', async () => {
    me.current = { isAdmin: true };
    renderAt('/places/parishes/5/edit');
    const button = await screen.findByRole('button', { name: 'Delete parish' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'I want to delete this parish' }));
    await capture('parish-delete', async () => {
      fireEvent.submit(button.closest('form') as HTMLFormElement);
      await waitFor(() => expect(window.location.pathname).toBe('/places/parishes'));
      await screen.findAllByRole('link', { name: 'Edit parish' });
    });
  });
});
