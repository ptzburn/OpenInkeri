import { Loading, flush } from 'solid-js';
import { captureArtifact } from '@solidjs/diagnostics';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { Router } from '~/router';

// The records page through the real router, with getRecords answering from
// a made-up baptism register of 120 entries, 50 a page, searched by child
// name the way the server folds case. Other kinds have no records.
const { getRecords } = vi.hoisted(() => {
  const size = 50;
  const entries = Array.from({ length: 120 }, (_, i) => ({
    id: i + 1,
    lost: false,
    baptismDate: '1895-03-12',
    birthDate: '1895-03',
    stillborn: false,
    multipleBirth: i === 0 ? 2 : null,
    illegitimate: false,
    village: { ru: 'Горки', fi: null },
    villageAsWritten: 'Горкка',
    child: { ru: i === 1 ? 'Мария' : `Ребёнок ${i + 1}`, fi: i === 1 ? 'Maria' : null },
    father: { ru: 'Иоанн Адамов Варис', fi: 'Juhana Aataminp. Waris' },
    mother: null,
    note: null,
  }));
  const counts = { baptisms: 120, marriages: 0, deaths: 0, households: 0, taxpayers: 0 };
  const getRecords = vi.fn(async (kind: string, search: string, page: number) => {
    const found = entries.filter(
      (e) =>
        kind === 'baptisms' &&
        (e.child.ru ?? '').toLowerCase().includes(search.trim().toLowerCase()),
    );
    const pages = Math.max(1, Math.ceil(found.length / size));
    const current = Math.min(Math.max(1, page), pages);
    const records = found.slice((current - 1) * size, current * size).map((e) => ({ ...e }));
    return { kind, counts, total: found.length, page: current, pages, records };
  });
  return { getRecords };
});

vi.mock('~/lib/records', () => ({ getRecords, RECORDS_PAGE_SIZE: 50 }));
// Who is signed in: nobody, unless a test makes them an admin.
const { me, editing } = vi.hoisted(() => {
  const me: { current: { isAdmin: boolean } | null } = { current: null };
  // The edit dialog's server functions: record 2 (Maria's) as stored, the
  // places and clergy to pick from, and a save that records its form and
  // can be made to fail.
  const editing = {
    saved: [] as FormData[],
    failWith: null as null | { message: string; fields?: string[] },
    record: () => ({
      id: 2,
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
        emergencyDate: null,
        multipleBirth: 2,
        illegitimate: false,
        stillborn: false,
      },
      people: {
        child: person({ id: 10, role: 'child', sex: 'female', nameRu: 'Мария', givenRu: 'Мария' }),
        father: person({ id: 11, role: 'father', sex: 'male', nameRu: 'Иоанн Адамов Варис' }),
        mother: null,
      },
    }),
  };
  function person(fields: Record<string, unknown>) {
    const names = ['name', 'given', 'patronymic', 'surname', 'maiden'].flatMap((part) => [
      `${part}Ru`,
      `${part}Fi`,
    ]);
    return {
      ...Object.fromEntries(names.map((name) => [name, null])),
      sex: null,
      deathDate: null,
      origin: null,
      ...fields,
    } as never;
  }
  return { me, editing };
});

vi.mock('~/lib/account', () => ({ getCurrentUser: vi.fn(async () => me.current) }));
vi.mock('~/lib/record-edit', async () => {
  const { action } = await import('@solidjs/router');
  return {
    editedRoles: ['child', 'father', 'mother'],
    getBaptismEdit: vi.fn(async (id: number) => (id === 2 ? editing.record() : null)),
    getEditOptions: vi.fn(async () => ({
      places: [
        { id: 1, name: 'Горки', parish: 'Губаницы' },
        { id: 2, name: 'Волгово', parish: 'Губаницы' },
      ],
      clergy: [{ id: 7, name: 'Берг' }],
    })),
    updateBaptism: action(async (form: FormData) => {
      editing.saved.push(form);
      if (editing.failWith) throw editing.failWith;
    }, 'update-baptism'),
  };
});

// jsdom has <dialog> without showModal/close; enough of them for the dialog.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.open = false;
  this.dispatchEvent(new Event('close'));
};

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

    fireEvent.click(screen.getByRole('link', { name: /Marriages/ }));
    expect(await screen.findByText('There are no records of this type yet.')).toBeInTheDocument();
    expect(getRecords).toHaveBeenLastCalledWith('marriages', 'ребёнок', 1);
    expect(screen.getByRole('link', { name: /Marriages/ })).toHaveClass('tab-active');
    expect(tabs.querySelectorAll('.tab')).toHaveLength(5);
    // The search form sends the kind along, for searching before JavaScript.
    expect(container.querySelector('input[type=hidden][name=kind]')).toHaveValue('marriages');
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
  async function openMaria() {
    me.current = { isAdmin: true };
    const { container } = renderAt(`/records?q=${encodeURIComponent('мария')}`);
    await waitFor(() => expect(childNames(container)).toEqual(['Maria']));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit record' }));
    const dialog = screen.getByRole('dialog', { hidden: true }) as HTMLDialogElement;
    await waitFor(() => expect(dialog).toHaveTextContent('Normal'));
    return dialog;
  }
  const field = (dialog: HTMLElement, name: string) =>
    dialog.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;

  test('only admins get the edit button', async () => {
    const { container } = renderAt(`/records?q=${encodeURIComponent('мария')}`);
    await waitFor(() => expect(childNames(container)).toEqual(['Maria']));
    expect(screen.queryByRole('button', { name: 'Edit record' })).toBeNull();
  });

  test('opens with the record as stored, dates as the page shows them', async () => {
    const dialog = await openMaria();
    expect(dialog.open).toBe(true);
    expect(field(dialog, 'date')).toHaveValue('12.3.1895');
    expect(field(dialog, 'birthDate')).toHaveValue('3.1895');
    expect(field(dialog, 'placeId')).toHaveValue('1');
    expect(field(dialog, 'placeText')).toHaveValue('Горкка');
    expect(field(dialog, 'officiantId')).toHaveValue('7');
    expect(field(dialog, 'location')).toHaveValue('pastorate');
    expect(field(dialog, 'multipleBirth')).toHaveValue('2');
    expect(field(dialog, 'child.sex')).toHaveValue('female');
    expect(field(dialog, 'father.nameRu')).toHaveValue('Иоанн Адамов Варис');
    // No mother yet: her fields are there, empty, to add her.
    expect(field(dialog, 'mother.nameRu')).toHaveValue('');
  });

  test('saves the form with the version it was loaded at, then closes', async () => {
    const dialog = await openMaria();
    fireEvent.input(field(dialog, 'mother.nameRu'), { target: { value: 'Анна' } });
    fireEvent.change(field(dialog, 'placeId'), { target: { value: '2' } });
    fireEvent.submit(dialog.querySelector('form:not([method=dialog])')!);

    await waitFor(() => expect(dialog.open).toBe(false));
    const [form] = editing.saved;
    expect(form.get('id')).toBe('2');
    expect(form.get('version')).toBe('4');
    expect(form.get('mother.nameRu')).toBe('Анна');
    expect(form.get('placeId')).toBe('2');
    expect(form.get('date')).toBe('12.3.1895');
  });

  test('a refused save stays open, says why and marks the fields', async () => {
    editing.failWith = { message: 'Check the marked fields.', fields: ['date'] };
    const dialog = await openMaria();
    fireEvent.submit(dialog.querySelector('form:not([method=dialog])')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Check the marked fields.');
    expect(dialog.open).toBe(true);
    expect(field(dialog, 'date')).toHaveAttribute('aria-invalid', 'true');
    expect(field(dialog, 'birthDate')).not.toHaveAttribute('aria-invalid');
  });

  test('Cancel closes without saving', async () => {
    const dialog = await openMaria();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel', hidden: true })[0]!);
    await waitFor(() => expect(dialog.open).toBe(false));
    expect(editing.saved).toEqual([]);
  });
});
