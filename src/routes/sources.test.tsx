import { Loading } from 'solid-js';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { ToastProvider } from '~/components/toaster';
import { Router } from '~/router';

// The sources pages through the real router, with their server functions
// answering from two made-up sources: a baptism register with records and
// an empty taxpayer list.
const { me, sources } = vi.hoisted(() => {
  const me: { current: { isAdmin: boolean } | null } = { current: null };
  const sources = {
    saved: [] as FormData[],
    deleted: [] as FormData[],
    list: () => [
      {
        id: 1,
        title: 'Губаницы: список рожденных и крещенных',
        kind: 'baptisms' as const,
        parish: { ru: 'Губаницы', fi: 'Hevaa' },
        yearFrom: 1892,
        yearTo: 1919,
        language: 'ru',
        archiveReference: 'ЦГИА СПб, ф. 19, оп. 1',
        note: null,
        records: 6630,
      },
      {
        id: 5,
        title: 'Туутари и Хиетамяки: налогоплательщики 1696',
        kind: 'taxpayers' as const,
        parish: null,
        yearFrom: 1696,
        yearTo: 1696,
        language: 'sv',
        archiveReference: null,
        note: null,
        records: 0,
      },
    ],
  };
  return { me, sources };
});

vi.mock('~/data/session', () => ({
  getCurrentUser: vi.fn(async () => me.current),
  requireAdmin: vi.fn(async () => !!me.current?.isAdmin),
}));
vi.mock('~/data/parishes', () => ({
  getParishOptions: vi.fn(async () => [{ id: 5, name: 'Губаницы' }]),
}));
vi.mock('~/data/sources', async () => {
  const { action } = await import('@solidjs/router');
  const { redirect } = await import('@solidjs/web');
  return {
    getSources: vi.fn(async () => sources.list()),
    getSourceEdit: vi.fn(async (id: number) => {
      const row = sources.list().find((s) => s.id === id);
      return row
        ? {
            id: row.id,
            version: 2,
            title: row.title,
            kind: row.kind,
            parishId: row.parish ? 5 : null,
            archiveReference: row.archiveReference,
            yearFrom: row.yearFrom,
            yearTo: row.yearTo,
            language: row.language,
            note: row.note,
            records: row.records,
          }
        : null;
    }),
    saveSource: action(async (form: FormData) => {
      sources.saved.push(form);
      throw redirect('/sources');
    }, 'save-source'),
    deleteSource: action(async (form: FormData) => {
      sources.deleted.push(form);
      throw redirect('/sources');
    }, 'delete-source'),
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

const field = (name: string) =>
  document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | null;

afterEach(() => {
  cleanup();
  me.current = null;
  sources.saved = [];
  sources.deleted = [];
});

describe('/sources', () => {
  test('lists the sources with their type, parish, years, language and records', async () => {
    renderAt('/sources');
    const title = await screen.findByText('Губаницы: список рожденных и крещенных');
    const row = title.closest('tr')!;
    expect(row).toHaveTextContent('ЦГИА СПб, ф. 19, оп. 1');
    expect(row).toHaveTextContent('Baptisms');
    expect(row).toHaveTextContent('Hevaa');
    expect(row).toHaveTextContent('1892–1919');
    expect(row).toHaveTextContent('Russian');
    // The count opens the records of the type.
    expect(screen.getByRole('link', { name: '6630' })).toHaveAttribute('href', '/records');
    const other = screen.getByText('Туутари и Хиетамяки: налогоплательщики 1696').closest('tr')!;
    expect(other).toHaveTextContent('Taxpayers');
    expect(other).toHaveTextContent('Swedish');
    // Only admins add or edit.
    expect(screen.queryByRole('link', { name: 'Add source' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit source' })).toBeNull();
  });

  test('a new source starts empty and is saved with what was typed', async () => {
    me.current = { isAdmin: true };
    renderAt('/sources');
    fireEvent.click(await screen.findByRole('link', { name: 'Add source' }));
    await screen.findByRole('heading', { level: 1, name: 'New source' });
    await waitFor(() => expect(field('title')).toBeTruthy());
    expect(field('id')).toHaveValue('');
    fireEvent.input(field('title')!, { target: { value: 'Губаницы: венчания 1920-х' } });
    fireEvent.change(field('kind')!, { target: { value: 'marriages' } });
    fireEvent.input(field('yearFrom')!, { target: { value: '1920' } });
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);

    await waitFor(() => expect(window.location.pathname).toBe('/sources'));
    const [saved] = sources.saved;
    expect(saved.get('kind')).toBe('marriages');
    expect(saved.get('yearFrom')).toBe('1920');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Source “Губаницы: венчания 1920-х” added.',
    );
  });

  test('a source with records keeps its type and cannot be deleted', async () => {
    me.current = { isAdmin: true };
    renderAt('/sources/1/edit');
    await waitFor(() =>
      expect(field('title')).toHaveValue('Губаницы: список рожденных и крещенных'),
    );
    // The type is shown but fixed; it posts from a hidden field.
    const select = document.querySelector('select:disabled');
    expect(select).toHaveValue('baptisms');
    expect(document.querySelector('input[type=hidden][name=kind]')).toHaveValue('baptisms');
    expect(
      screen.getByText(
        'This source still has 6630 records. Delete them or move them to another source first.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete source' })).toBeDisabled();
  });

  test('an empty source can be deleted', async () => {
    me.current = { isAdmin: true };
    renderAt('/sources/5/edit');
    await waitFor(() => expect(field('title')).toBeTruthy());
    expect(field('kind')).toHaveValue('taxpayers');
    fireEvent.click(screen.getByRole('checkbox', { name: 'I want to delete this source' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete source' }));
    await waitFor(() => expect(window.location.pathname).toBe('/sources'));
    expect(sources.deleted[0].get('id')).toBe('5');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Source “Туутари и Хиетамяки: налогоплательщики 1696” deleted.',
    );
  });
});
