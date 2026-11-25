import { flush } from 'solid-js';
import { captureArtifact } from '~/testing/capture';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import type { FormError } from '~/lib/form-error';
import { renderAt as renderPage } from '~/testing/render';

// The sources pages through the real router, with their server functions
// answering from two made-up sources: a baptism register with records and
// an empty taxpayer list.
const { me, sources } = vi.hoisted(() => {
  const me: { current: { isAdmin: boolean } | null } = { current: null };
  const sources = {
    saved: [] as FormData[],
    deleted: [] as FormData[],
    removed: [] as FormData[],
    numbered: [] as FormData[],
    failWith: null as null | FormError,
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
        pages: 3,
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
        pages: 0,
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
  getParishOptions: vi.fn(async () => [
    {
      id: 5,
      name: { ru: 'Губаницы', fi: 'Hevaa' },
      spellings: ['Губаницы', 'Hevaa'],
      church: null,
    },
  ]),
}));
// A source with its pages, as a router query, so an upload can revalidate it.
const { sourcePages } = vi.hoisted(() => ({
  sourcePages: { reads: 0 },
}));
vi.mock('~/data/sources', async () => {
  const { formAction, query } = await import('@solidjs/router');
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
    getSourcePages: query(async (id: number) => {
      sourcePages.reads++;
      const row = sources.list().find((s) => s.id === id);
      return row
        ? {
            id: row.id,
            title: row.title,
            kind: row.kind,
            parish: row.parish,
            yearFrom: row.yearFrom,
            yearTo: row.yearTo,
            archiveReference: row.archiveReference,
            // The register's cover (unnumbered), then two numbered pages.
            pages: Array.from({ length: row.pages }, (_, i) => ({
              id: 100 + i,
              position: i + 1,
              label: i === 0 ? null : `${i}об`,
              key: `${i}`.padStart(32, 'a'),
              width: 2500,
              height: 1900,
            })),
          }
        : null;
    }, 'source-pages'),
    // Like the server: a new source opens on its page (here the empty
    // list's, 5), an edit returns to the list.
    saveSource: formAction(async (form: FormData) => {
      if (sources.failWith) throw sources.failWith;
      sources.saved.push(form);
      throw redirect(form.get('id') ? '/sources' : '/sources/5');
    }, 'save-source'),
    deleteSource: formAction(async (form: FormData) => {
      sources.deleted.push(form);
      throw redirect('/sources');
    }, 'delete-source'),
    // Like the server: back to the source's pages.
    deleteSourcePage: formAction(async (form: FormData) => {
      sources.removed.push(form);
      throw redirect('/sources/1');
    }, 'delete-source-page'),
    // Like the server: back to the photo, now numbered.
    numberSourcePage: formAction(async (form: FormData) => {
      sources.numbered.push(form);
      throw redirect('/sources/1/pages/1');
    }, 'number-source-page'),
  };
});

// The records transcribed from a page: two on the register's page "1об".
vi.mock('~/data/records', () => ({
  getPageRecords: vi.fn(async (sourceId: number, label: string) => {
    const row = (id: number, child: string) => ({
      id,
      lost: false,
      date: '1903-01-12',
      birthDate: null,
      stillborn: false,
      multipleBirth: null,
      illegitimate: false,
      burialDate: null,
      cause: null,
      village: null,
      villageAsWritten: null,
      child: { ru: child, fi: null, age: null, residence: null, residenceAsWritten: null },
      father: null,
      mother: null,
      groom: null,
      bride: null,
      deceased: null,
      holding: null,
      members: [],
      note: null,
      // Виктор is marked on the photo, Пётр Адам not yet.
      entryNo: String(id),
      photoTop: id === 41 ? 0.25 : null,
      photoBottom: id === 41 ? 0.35 : null,
    });
    return {
      kind: 'baptisms' as const,
      records: sourceId === 1 && label === '1об' ? [row(41, 'Виктор'), row(42, 'Пётр Адам')] : [],
    };
  }),
}));

const renderAt = (url: string) => renderPage(url, { toasts: true });

const field = (name: string) =>
  document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | null;

afterEach(() => {
  cleanup();
  me.current = null;
  sources.saved = [];
  sources.deleted = [];
  sources.removed = [];
  sources.numbered = [];
  sources.failWith = null;
  vi.restoreAllMocks();
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
    // The title and the count open the source's records.
    // The count opens the source's records; the title, the source.
    expect(screen.getByRole('link', { name: '6630' })).toHaveAttribute('href', '/records?source=1');
    expect(
      screen.getByRole('link', { name: 'Губаницы: список рожденных и крещенных' }),
    ).toHaveAttribute('href', '/sources/1');
    const other = screen.getByText('Туутари и Хиетамяки: налогоплательщики 1696').closest('tr')!;
    expect(other).toHaveTextContent('Taxpayers');
    expect(other).toHaveTextContent('Swedish');
    // Only admins add or edit.
    expect(screen.queryByRole('link', { name: 'Add source' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit source' })).toBeNull();
  });

  test('opening a source to edit from the list causes no diagnostics', async () => {
    // A first visit loads the edit page's code; the capture is the second.
    me.current = { isAdmin: true };
    renderAt('/sources/1/edit');
    await waitFor(() => expect(field('title')).toBeTruthy());
    cleanup();

    me.current = { isAdmin: true };
    renderAt('/sources');
    await screen.findByText('Губаницы: список рожденных и крещенных');
    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.click(screen.getAllByRole('link', { name: 'Edit source' })[0]);
        await waitFor(() =>
          expect(field('title')).toHaveValue('Губаницы: список рожденных и крещенных'),
        );
        flush();
      },
      { scenario: 'sources-open-edit' },
    );
    expect(artifact).toHaveNoDiagnostics();
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

    // On to its page, where its photos are added.
    await waitFor(() => expect(window.location.pathname).toBe('/sources/5'));
    expect(await screen.findByRole('button', { name: 'Add photos' })).toBeInTheDocument();
    const [saved] = sources.saved;
    expect(saved.get('kind')).toBe('marriages');
    expect(saved.get('yearFrom')).toBe('1920');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Source “Губаницы: венчания 1920-х” added.',
    );
  });

  test('the parish is typed by name; one not known yet is added with the source', async () => {
    me.current = { isAdmin: true };
    renderAt('/sources/new');
    await waitFor(() => expect(field('parishText')).toBeTruthy());
    expect(field('parishId')).toHaveValue('');
    fireEvent.input(field('title')!, { target: { value: 'Туутари: крещения' } });
    // Either name links the parish.
    fireEvent.input(field('parishText')!, { target: { value: 'Hevaa' } });
    await waitFor(() => expect(field('parishId')).toHaveValue('5'));
    // A parish no name matches: its fields appear, to add it with its church.
    fireEvent.input(field('parishText')!, { target: { value: 'Туутари' } });
    await waitFor(() => expect(field('parishId')).toHaveValue(''));
    expect(screen.getByText('Add as a new parish')).toBeInTheDocument();
    expect(field('parishNew.nameRu')).toHaveValue('Туутари');
    fireEvent.input(field('parishNew.nameFi')!, { target: { value: 'Tuutari' } });
    expect(
      screen.getByRole('checkbox', { name: 'Also add a locality of this name, as its church' }),
    ).toBeChecked();
    fireEvent.submit(field('title')!.closest('form')!);

    await waitFor(() => expect(sources.saved).toHaveLength(1));
    const [saved] = sources.saved;
    expect(saved.get('parishText')).toBe('Туутари');
    expect(saved.get('parishId')).toBe('');
    expect(saved.get('parishCreate')).toBe('on');
    expect(saved.get('parishNew.nameRu')).toBe('Туутари');
    expect(saved.get('parishNew.nameFi')).toBe('Tuutari');
    expect(saved.get('parishNew.church')).toBe('on');
  });

  test('an existing source shows its parish by name, linked', async () => {
    me.current = { isAdmin: true };
    renderAt('/sources/1/edit');
    await waitFor(() => expect(field('title')).toBeTruthy());
    expect(field('parishText')).toHaveValue('Hevaa'); // English shows the Finnish name
    expect(field('parishId')).toHaveValue('5');
  });

  test('a refused save says why under the fields at fault', async () => {
    me.current = { isAdmin: true };
    sources.failWith = {
      message: 'Check the marked fields.',
      fields: { yearTo: 'The first year is after the last.', archiveReference: '' },
    };
    renderAt('/sources/5/edit');
    await waitFor(() => expect(field('title')).toBeTruthy());
    // Each field's error waits, hidden, for the browser or the server.
    expect(field('yearFrom')!.nextElementSibling).toHaveTextContent('Four digits, e.g. 1895');
    expect(field('yearFrom')!.nextElementSibling).toHaveClass('validator-hint', 'hidden');
    fireEvent.submit(document.querySelector('main form') as HTMLFormElement);

    expect(await screen.findByRole('alert')).toHaveTextContent('Check the marked fields.');
    expect(window.location.pathname).toBe('/sources/5/edit');
    expect(field('yearTo')).toHaveAttribute('aria-invalid', 'true');
    expect(field('yearTo')!.nextElementSibling).toHaveTextContent(
      'The first year is after the last.',
    );
    // No reason of the server's own: the field's own error says it.
    expect(field('archiveReference')!.nextElementSibling).toHaveTextContent('Check this value.');
    expect(field('yearFrom')).not.toHaveAttribute('aria-invalid');
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
    fireEvent.click(screen.getByRole('button', { name: 'Delete source' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete source' }),
    );
    await waitFor(() => expect(window.location.pathname).toBe('/sources'));
    expect(sources.deleted[0].get('id')).toBe('5');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Source “Туутари и Хиетамяки: налогоплательщики 1696” deleted.',
    );
  });
});

describe('/sources/:id', () => {
  test("a click on a source's row opens it; the row's own links stay theirs", async () => {
    renderAt('/sources');
    const row = (await screen.findByText('Губаницы: список рожденных и крещенных')).closest('tr')!;
    // The photo count, beside the records count.
    expect(row.cells[6]).toHaveTextContent('3');
    fireEvent.click(within(row).getByText('Baptisms'));
    await waitFor(() => expect(window.location.pathname).toBe('/sources/1'));
    cleanup();

    me.current = { isAdmin: true };
    renderAt('/sources');
    const again = (await screen.findByText('Губаницы: список рожденных и крещенных')).closest(
      'tr',
    )!;
    fireEvent.click(within(again).getByRole('link', { name: 'Edit source' }));
    await waitFor(() => expect(window.location.pathname).toBe('/sources/1/edit'));
  });

  test("a source's pages are thumbnails in order", async () => {
    renderAt('/sources/1');
    await screen.findByRole('heading', {
      level: 1,
      name: 'Губаницы: список рожденных и крещенных',
    });
    const links = screen.getAllByRole('link').filter((a) => a.querySelector('img'));
    expect(links.map((a) => a.textContent)).toEqual(['photo 1', 'p. 1об', 'p. 2об']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/sources/1/pages/1',
      '/sources/1/pages/2',
      '/sources/1/pages/3',
    ]);
    expect(links[1].querySelector('img')).toHaveAttribute(
      'src',
      `/api/photos/thumbs/${'1'.padStart(32, 'a')}.webp`,
    );
  });

  test('opening a page from the thumbnails and zooming it causes no diagnostics', async () => {
    // A first visit loads the page's code; the capture is the second.
    renderAt('/sources/1/pages/1');
    await screen.findByText('1 of 3');
    cleanup();

    renderAt('/sources/1');
    const thumbnail = await screen.findByText('p. 1об');
    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.click(thumbnail.closest('a')!);
        await screen.findByText('2 of 3');
        fireEvent.click(screen.getByRole('button', { name: 'Full size' }));
        await screen.findByRole('button', { name: 'Fit to window' });
        fireEvent.click(screen.getByRole('img', { name: /p\. 1об$/ }));
        await screen.findByRole('button', { name: 'Full size' });
        flush();
      },
      { scenario: 'source-pages-open-zoom' },
    );
    expect(artifact).toHaveNoDiagnostics();
  });

  test('a source without photos says so', async () => {
    renderAt('/sources/5');
    expect(await screen.findByText('This source has no page photos yet.')).toBeInTheDocument();
  });

  test('a page turns by its links and the arrow keys, and zooms to full size', async () => {
    renderAt('/sources/1/pages/2');
    const photo = await screen.findByRole('img', {
      name: 'Губаницы: список рожденных и крещенных, p. 1об',
    });
    expect(photo).toHaveAttribute('src', `/api/photos/pages/${'1'.padStart(32, 'a')}.webp`);
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute(
      'href',
      '/sources/1/pages/1',
    );

    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.keyDown(document.body, { key: 'ArrowRight' });
        await waitFor(() => expect(window.location.pathname).toBe('/sources/1/pages/3'));
        await screen.findByText('3 of 3');
        flush();
      },
      { scenario: 'source-page-next' },
    );
    expect(artifact).toHaveNoDiagnostics();
    // The last page has no next.
    const next = screen.getByRole('link', { name: 'Next page' });
    expect(next).not.toHaveAttribute('href');
    expect(next).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Full size' }));
    expect(await screen.findByRole('button', { name: 'Fit to window' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    await waitFor(() => expect(window.location.pathname).toBe('/sources/1/pages/2'));
  });

  test('a page the source has not says so', async () => {
    renderAt('/sources/1/pages/9');
    expect(await screen.findByText('This source has no such page.')).toBeInTheDocument();
  });

  test('a numbered page lists its records beside it; admins open their forms there', async () => {
    me.current = { isAdmin: true };
    renderAt('/sources/1/pages/2');
    const column = await screen.findByRole('complementary', { name: "This page's records" });
    await within(column).findByText('Виктор');
    expect(within(column).getByText('Пётр Адам')).toBeInTheDocument();
    // The forms open in the column, beside the photo.
    expect(within(column).getByRole('link', { name: 'Add record' })).toHaveAttribute(
      'href',
      '/sources/1/pages/2?record=new',
    );
    expect(within(column).getAllByRole('link', { name: 'Edit record' })[0]).toHaveAttribute(
      'href',
      '/sources/1/pages/2?record=41',
    );
  });

  test('a page with nothing transcribed says so, and only admins may add', async () => {
    renderAt('/sources/1/pages/3');
    expect(
      await screen.findByText('Nothing has been transcribed from this page yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add record' })).toBeNull();
  });

  test('an unnumbered photo (a cover) has no records section', async () => {
    renderAt('/sources/1/pages/1');
    await screen.findByText('1 of 3');
    expect(screen.queryByRole('complementary', { name: "This page's records" })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Page/ })).toBeNull();
  });

  test('an admin gives an unnumbered photo its page number', async () => {
    me.current = { isAdmin: true };
    renderAt('/sources/1/pages/1');
    const column = await screen.findByRole('complementary', { name: "This page's records" });
    expect(column).toHaveTextContent('This photo has no page number');
    const page = within(column).getByRole('textbox', { name: /Page/ });
    expect(page).toBeRequired();
    fireEvent.input(page, { target: { value: '1об' } });
    fireEvent.submit(page.closest('form')!);

    await waitFor(() => expect(sources.numbered).toHaveLength(1));
    const [numbered] = sources.numbered;
    expect(numbered.get('id')).toBe('100');
    expect(numbered.get('key')).toBe('0'.padStart(32, 'a'));
    expect(numbered.get('label')).toBe('1об');
    expect(await screen.findByText('Page number saved.')).toBeInTheDocument();
  });

  test('marked records show as bands named by who they are about; the list follows the page', async () => {
    renderAt('/sources/1/pages/2');
    const column = await screen.findByRole('complementary', { name: "This page's records" });
    const victor = (await within(column).findByText('Виктор')).closest('li')!;
    // Only the marked one has a band, named, where it starts.
    const bands = document.querySelectorAll<HTMLElement>('main section a.absolute');
    expect(bands).toHaveLength(1);
    // Its number as the register gives it, and who it is about.
    expect(bands[0]).toHaveTextContent('41 · Виктор');
    expect(victor).toHaveTextContent('No. 41');
    expect(bands[0].style.top).toBe('25%');
    expect(parseFloat(bands[0].style.height)).toBeCloseTo(10);
    expect(within(victor).getByRole('img', { name: 'Marked on the photo' })).toBeInTheDocument();
    const peter = within(column).getByText('Пётр Адам').closest('li')!;
    expect(
      within(peter).getByRole('img', { name: 'Not marked on the photo yet' }),
    ).toBeInTheDocument();
    // Pointing at the row lights its band, and the band its row.
    fireEvent.mouseEnter(victor);
    await waitFor(() => expect(bands[0]).toHaveClass('bg-primary/25'));
    fireEvent.mouseLeave(victor);
    await waitFor(() => expect(bands[0]).toHaveClass('bg-primary/10'));
    fireEvent.mouseEnter(bands[0]);
    await waitFor(() => expect(victor).toHaveClass('bg-base-200'));
  });

  test('admins add photos: listed in file-name order, with the page each name gives', async () => {
    renderAt('/sources/1');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Add photos' })).toBeNull();
    cleanup();

    me.current = { isAdmin: true };
    renderAt('/sources/1');
    await screen.findByRole('button', { name: 'Add photos' });
    expect(screen.getByRole('button', { name: 'Add a folder' })).toBeInTheDocument();
    const photo = (name: string, type = 'image/jpeg') => new File([name], name, { type });
    // A folder's other files stay out; numbers sort by value.
    fireEvent.change(screen.getByLabelText('Add photos', { selector: 'input' }), {
      target: {
        files: [
          photo('1903 s. 10.jpg'),
          photo('Thumbs.db', ''),
          photo('1903 s. 2.jpg'),
          photo('0 vv kansi.jpg'),
        ],
      },
    });
    const list = await screen.findByRole('region', { name: 'Add photos' });
    const rows = () => [...list.querySelectorAll('tbody tr')] as HTMLTableRowElement[];
    expect(rows().map((r) => r.cells[0].textContent)).toEqual([
      '0 vv kansi.jpg',
      '1903 s. 2.jpg',
      '1903 s. 10.jpg',
    ]);
    // The page a name gives, to correct; a cover has none.
    expect(
      rows().map((r) => (r.cells[1].querySelector('input') as HTMLInputElement).value),
    ).toEqual(['', '2', '10']);
    expect(within(list).getByRole('button', { name: 'Upload photos (3)' })).toBeInTheDocument();
    // Cancel empties the list.
    fireEvent.click(within(list).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Add photos' })).toBeNull());
  });

  test('uploading sends each photo with its page and hash, and says how each went', async () => {
    me.current = { isAdmin: true };
    renderAt('/sources/1');
    await screen.findByRole('button', { name: 'Add photos' });
    // The server: the first is added, the second is there already, the third isn't a photo.
    const answers = [
      { status: 'added', position: 4 },
      { status: 'skipped', position: 2 },
      { status: 'refused', message: 'This file can’t be read as a photo.' },
    ];
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => Response.json(answers.shift()));
    const photo = (name: string) => new File([name], name, { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Add photos', { selector: 'input' }), {
      target: { files: [photo('1903 s. 3.jpg'), photo('1903 s. 1об.jpg'), photo('1903 s. 5.jpg')] },
    });
    const list = await screen.findByRole('region', { name: 'Add photos' });
    // A page corrected before uploading.
    fireEvent.input(within(list).getByRole('textbox', { name: 'Page: 1903 s. 5.jpg' }), {
      target: { value: '5об' },
    });
    const reads = sourcePages.reads;

    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.click(within(list).getByRole('button', { name: 'Upload photos (3)' }));
        await within(list).findByRole('status');
      },
      { scenario: 'page-photos-upload' },
    );
    expect(artifact).toHaveNoDiagnostics();
    expect(within(list).getByRole('status')).toHaveTextContent(
      'Added: 1. Already there: 1. Not added: 1.',
    );
    const rows = [...list.querySelectorAll('tbody tr')] as HTMLTableRowElement[];
    expect(rows.map((r) => r.cells[2].textContent)).toEqual([
      'Added',
      'Already in this source',
      'This file can’t be read as a photo.',
    ]);
    // One at a time, in page order, the photo as the body.
    const calls = fetch.mock.calls as [string, RequestInit][];
    const sent = calls.map(([url, init]) => {
      const query = new URL(url, 'http://localhost').searchParams;
      return { name: query.get('name'), label: query.get('label'), body: (init.body as File).name };
    });
    expect(sent).toEqual([
      { name: '1903 s. 1об.jpg', label: '1об', body: '1903 s. 1об.jpg' },
      { name: '1903 s. 3.jpg', label: '3', body: '1903 s. 3.jpg' },
      { name: '1903 s. 5.jpg', label: '5об', body: '1903 s. 5.jpg' },
    ]);
    const [url, init] = calls[0];
    expect(url).toMatch(/^\/api\/sources\/1\/pages\?.*&hash=[0-9a-f]{64}$/);
    expect(init.method).toBe('POST');
    // The added photo's thumbnail is fetched with the source's pages.
    await waitFor(() => expect(sourcePages.reads).toBeGreaterThan(reads));
  });

  test('admins remove a photo, told what happens to the records on its page', async () => {
    renderAt('/sources/1/pages/2');
    await screen.findByRole('complementary', { name: "This page's records" });
    expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull();
    cleanup();

    me.current = { isAdmin: true };
    renderAt('/sources/1/pages/2');
    const column = await screen.findByRole('complementary', { name: "This page's records" });
    await within(column).findByText('Виктор');
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(
      'Removes this photo and its thumbnail from the source. The pages after it move up by one. ' +
        '2 records were transcribed from this page. They stay, and are edited on their own pages from then on.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove photo' }));

    await waitFor(() => expect(window.location.pathname).toBe('/sources/1'));
    const [removed] = sources.removed;
    expect(removed.get('id')).toBe('101');
    expect(removed.get('key')).toBe('1'.padStart(32, 'a'));
    expect(removed.get('confirm')).toBe('on');
    // A page has no version: the photo's key stands for it.
    expect(removed.has('version')).toBe(false);
    expect(await screen.findByRole('status')).toHaveTextContent('Photo removed.');
  });
});
