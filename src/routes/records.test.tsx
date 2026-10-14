import { Loading, flush } from 'solid-js';
import { captureArtifact } from '@solidjs/diagnostics';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { Router } from '~/router';

// The records page through the real router, with getRecords answering from
// a made-up register of 120 entries, 50 a page, searched by child name the
// way the server folds case.
const { getRecords } = vi.hoisted(() => {
  const size = 50;
  const entries = Array.from({ length: 120 }, (_, i) => ({
    id: i + 1,
    entryNo: String(i + 1),
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
  const getRecords = vi.fn(async (search: string, page: number) => {
    const found = entries.filter((e) =>
      (e.child.ru ?? '').toLowerCase().includes(search.trim().toLowerCase()),
    );
    const pages = Math.max(1, Math.ceil(found.length / size));
    const current = Math.min(Math.max(1, page), pages);
    const records = found.slice((current - 1) * size, current * size).map((e) => ({ ...e }));
    return { total: found.length, page: current, pages, records };
  });
  return { getRecords };
});

vi.mock('~/lib/records', () => ({ getRecords, RECORDS_PAGE_SIZE: 50 }));
vi.mock('~/lib/account', () => ({ getCurrentUser: vi.fn(async () => null) }));

function renderAt(url: string) {
  window.history.replaceState(null, '', url);
  return render(() => (
    <Router>{(props) => <Loading fallback="Loading">{props.children}</Loading>}</Router>
  ));
}

const entryNumbers = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody tr td:first-child')].map((el) => el.textContent);

afterEach(() => {
  cleanup();
  getRecords.mockClear();
});

describe('/records', () => {
  test('shows the first page, with the dates and names of each entry', async () => {
    const { container } = renderAt('/records');
    await waitFor(() => expect(entryNumbers(container)).toHaveLength(50));
    expect(getRecords).toHaveBeenLastCalledWith('', 1);
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
    await waitFor(() => expect(entryNumbers(container)[0]).toBe('101'));
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/records?page=2',
    );
    expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
  });

  test('searching goes back to the first page, without diagnostics', async () => {
    const { container } = renderAt('/records?page=2');
    await waitFor(() => expect(entryNumbers(container)[0]).toBe('51'));
    const input = screen.getByRole('searchbox', { name: 'Search records' });

    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.input(input, { target: { value: 'мария' } });
        await waitFor(() => expect(entryNumbers(container)).toEqual(['2']));
        flush();
      },
      { scenario: 'records-search' },
    );
    expect(artifact).toHaveNoDiagnostics();
    expect(getRecords).toHaveBeenLastCalledWith('мария', 1);
    expect(window.location.search).toBe(`?q=${encodeURIComponent('мария')}`);
    // One page of results: no pagination.
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
  });

  test('says when nothing matches', async () => {
    renderAt('/records?q=zzz');
    expect(await screen.findByText('No records match “zzz”.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('zzz');
  });
});
