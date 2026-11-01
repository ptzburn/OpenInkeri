import { flush } from 'solid-js';
import { captureArtifact } from '~/testing/capture';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import type { GazetteerHit } from '~/lib/gazetteer';

import PlaceSearch from './place-search';

// The search on its own, over a gazetteer of two settlements; the whole map
// answers with a third, or fails.
const { gazetteer } = vi.hoisted(() => ({
  gazetteer: {
    mapAsked: [] as string[],
    mapFails: false,
  },
}));
const hits: GazetteerHit[] = [
  {
    source: 'osm',
    sourceId: 'way/251708753',
    kind: 'village',
    name: 'Губаницы',
    nameRu: 'Губаницы',
    nameFi: 'Kupanitsa',
    names: ['Губаницы', 'Kupanitsa', 'Gubanitsi'],
    latitude: 59.488,
    longitude: 29.535,
    detail: null,
    parish: { id: 5, name: { ru: 'Губаницы', fi: 'Hevaa' }, km: 0.4 },
    existing: null,
    near: null,
  },
  {
    source: 'wikidata',
    sourceId: 'Q14620978',
    kind: 'hamlet',
    name: 'Горки',
    nameRu: 'Горки',
    nameFi: null,
    names: ['Горки', 'Бедная Горка'],
    latitude: 59.55,
    longitude: 29.63,
    detail: null,
    parish: null,
    // No parish in reach: placed by the nearest locality of ours, and it is one already.
    existing: { id: 1, name: { ru: 'Горки', fi: 'Gorkka' } },
    near: { name: { ru: 'Волосово', fi: null }, km: 3.2 },
  },
];
const mapHit: GazetteerHit = {
  source: 'nominatim',
  sourceId: 'node/42',
  kind: 'village',
  name: 'Kupanitsa',
  nameRu: null,
  nameFi: 'Kupanitsa',
  names: ['Kupanitsa'],
  latitude: 61,
  longitude: 25,
  detail: 'Kupanitsa, Lappeenranta, Finland',
  parish: null,
  existing: null,
  near: null,
};
vi.mock('~/data/gazetteer', () => ({
  getGazetteerHits: vi.fn(async (q: string) =>
    hits.filter((h) => h.names.some((n) => n.toLowerCase().includes(q.toLowerCase()))),
  ),
  getMapHits: vi.fn(async (q: string) => {
    gazetteer.mapAsked.push(q);
    if (gazetteer.mapFails) throw new Error('Nominatim answered 503');
    return [mapHit];
  }),
}));

function renderSearch() {
  const picked: GazetteerHit[] = [];
  render(() => <PlaceSearch onPick={(hit) => picked.push(hit)} />);
  return {
    picked,
    input: screen.getByRole('combobox', { name: 'Find the locality' }) as HTMLInputElement,
    options: () =>
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
  };
}

afterEach(() => {
  cleanup();
  gazetteer.mapAsked = [];
  gazetteer.mapFails = false;
});

describe('PlaceSearch', () => {
  // Each capture is one interaction, as the budgets want: a search typed,
  // then a pick with the keys.
  test('lists the settlements named like the text, with the spelling matched; the keys pick one', async () => {
    const { input, picked, options } = renderSearch();
    expect(screen.queryByRole('listbox')).toBeNull();
    // By the Finnish name: the hit shows both names and the nearest church.
    fireEvent.input(input, { target: { value: 'kupa' } });
    await screen.findByRole('listbox');
    expect(options()).toEqual(['ГубаницыKupanitsaVillage · Hevaa (0.4 km)']);

    // By a spelling that is neither name: it shows beside them; a hit that
    // is a locality of ours already says so.
    const typed = await captureArtifact(
      async () => {
        fireEvent.input(input, { target: { value: 'бедная' } });
        await waitFor(() =>
          expect(options()).toEqual([
            'ГоркиБедная ГоркаSmall village · near Волосово (3.2 km)Already added as Gorkka',
          ]),
        );
      },
      { scenario: 'place-search-type' },
    );
    expect(typed.artifact).toHaveNoDiagnostics();

    const picking = await captureArtifact(
      async () => {
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        flush();
        expect(input).toHaveAttribute('aria-activedescendant', 'place-search-option-0');
        expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(input, { key: 'Enter' });
        flush();
        expect(picked.map((h) => h.sourceId)).toEqual(['Q14620978']);
        expect(input).toHaveValue('Горки');
        expect(screen.queryByRole('listbox')).toBeNull();
      },
      { scenario: 'place-search-pick' },
    );
    expect(picking.artifact).toHaveNoDiagnostics();
  });

  test('Enter never submits the form around it; Escape closes the list', async () => {
    const submits: Event[] = [];
    render(() => (
      <form onSubmit={(e) => submits.push(e)}>
        <PlaceSearch onPick={() => {}} />
        <button type="submit">Save</button>
      </form>
    ));
    const input = screen.getByRole('combobox', { name: 'Find the locality' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(submits).toHaveLength(0);
    fireEvent.input(input, { target: { value: 'горк' } });
    await screen.findByRole('listbox');
    fireEvent.keyDown(input, { key: 'Escape' });
    flush();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  test('a text the gazetteer lacks offers the whole map, whose hits say where they are', async () => {
    const { input, picked, options } = renderSearch();
    fireEvent.input(input, { target: { value: 'nowhere' } });
    await screen.findByText('No such settlement in the gazetteer.');
    expect(screen.queryByRole('listbox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search the whole map' }));
    await waitFor(() => expect(options()).toHaveLength(1));
    expect(gazetteer.mapAsked).toEqual(['nowhere']);
    expect(options()[0]).toBe('KupanitsaVillage · Kupanitsa, Lappeenranta, Finland');
    // Asked once: the button is gone until the text changes.
    expect(screen.queryByRole('button', { name: 'Search the whole map' })).toBeNull();
    fireEvent.click(within(screen.getByRole('option')).getByRole('button'));
    expect(picked.map((h) => h.source)).toEqual(['nominatim']);
  });

  test('a map search that fails says so and keeps the gazetteer hits', async () => {
    gazetteer.mapFails = true;
    const { input, options } = renderSearch();
    fireEvent.input(input, { target: { value: 'горк' } });
    await screen.findByRole('listbox');
    fireEvent.click(await screen.findByRole('button', { name: 'Search the whole map' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('The map search did not answer.');
    expect(options()).toHaveLength(1);
  });
});
