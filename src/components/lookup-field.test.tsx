import { flush } from 'solid-js';
import { captureArtifact } from '~/testing/capture';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, test } from 'vite-plus/test';

import { LookupField, lookupOf } from './lookup-field';

// The lookup field on its own: a combobox over three localities, two of
// which share the spelling "Волково".
const lookup = lookupOf([
  { value: 1, label: 'Горки (Губаницы)', spellings: ['Горки', 'Горка'] },
  { value: 2, label: 'Волгово (Губаницы)', spellings: ['Волгово', 'Волково'] },
  { value: 3, label: 'Вохново (Губаницы)', spellings: ['Вохново', 'Волково'] },
]);

// The same, where a locality not known yet can be added by its Russian name.
const lookupWithCreate = lookupOf(lookup.options, {
  label: 'Add as a new locality',
  fields: (prefix, text) => (
    <>
      <input name={`${prefix}.nameRu`} value={text()} />
      <input name={`${prefix}.nameFi`} aria-label="Finnish name" />
    </>
  ),
});

function renderField(text: string | null = null, id: number | null = null, create = false) {
  render(() => (
    <form>
      <LookupField
        textName="placeText"
        idName="placeId"
        label="Locality"
        text={text}
        id={id}
        lookup={create ? lookupWithCreate : lookup}
        invalid={() => undefined}
      />
    </form>
  ));
  return {
    input: screen.getByRole('combobox', { name: 'Locality' }) as HTMLInputElement,
    id: () =>
      (document.querySelector('[name="placeId"]') as HTMLInputElement | HTMLSelectElement).value,
    // The dropdown's rows (the hidden <select> has options too).
    options: () =>
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
  };
}

afterEach(cleanup);

describe('LookupField', () => {
  test('opens on focus with every row once, filters as typed, picks with the keys', async () => {
    const { input, id, options } = renderField();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();

    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.focus(input);
        flush();
        expect(input).toHaveAttribute('aria-expanded', 'true');
        expect(options()).toEqual(['Горки (Губаницы)', 'Волгово (Губаницы)', 'Вохново (Губаницы)']);

        // Only the rows with a spelling containing the text; the spelling
        // shows when the name doesn't contain it.
        fireEvent.input(input, { target: { value: 'волк' } });
        flush();
        expect(options()).toEqual(['Волгово (Губаницы)Волково', 'Вохново (Губаницы)Волково']);
        expect(id()).toBe('');

        // Arrow down lands on the first row, Enter picks it: the matched
        // spelling becomes the value, linked to that row, the list closed.
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        flush();
        expect(input).toHaveAttribute('aria-activedescendant', 'placeText-option-2');
        expect(
          within(screen.getByRole('listbox')).getByRole('option', { name: /Волгово/ }),
        ).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        flush();
        expect(input).toHaveAttribute('aria-activedescendant', 'placeText-option-3');
        fireEvent.keyDown(input, { key: 'Enter' });
        flush();
        expect(input).toHaveValue('Волково');
        expect(id()).toBe('3');
        expect(screen.queryByRole('listbox')).toBeNull();
      },
      { scenario: 'lookup-keys' },
    );
    expect(artifact).toHaveNoDiagnostics();
  });

  test('a click picks a row; Escape and blur close the list', () => {
    const { input, id, options } = renderField();
    fireEvent.focus(input);
    flush();
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Горки (Губаницы)'));
    flush();
    expect(input).toHaveValue('Горки');
    expect(id()).toBe('1');
    expect(screen.queryByRole('listbox')).toBeNull();

    // Arrow down on the closed field opens every row, to browse.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    flush();
    expect(options()).toEqual(['Горки (Губаницы)', 'Волгово (Губаницы)', 'Вохново (Губаницы)']);
    fireEvent.keyDown(input, { key: 'Escape' });
    flush();
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.focus(input);
    flush();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.blur(input);
    flush();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  test('a text matching nothing lists nothing; the chevron browses every row', () => {
    const { input, id, options } = renderField('Горкка', 1);
    expect(input).toHaveValue('Горкка');
    expect(id()).toBe('1');
    fireEvent.focus(input);
    flush();
    expect(screen.queryByRole('listbox')).toBeNull();
    // Enter with no row chosen leaves the value alone (the form would submit).
    fireEvent.keyDown(input, { key: 'Enter' });
    flush();
    expect(input).toHaveValue('Горкка');
    expect(id()).toBe('1');
    // The chevron opens every row whatever is typed; typing narrows again.
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Locality: show choices' }));
    flush();
    expect(options()).toEqual(['Горки (Губаницы)', 'Волгово (Губаницы)', 'Вохново (Губаницы)']);
    fireEvent.input(input, { target: { value: 'гор' } });
    flush();
    expect(options()).toEqual(['Горки (Губаницы)']);
    fireEvent.input(input, { target: { value: 'горкк' } });
    flush();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  test('a shared spelling opens a choice; a value naming no row shows the fields to add it', async () => {
    const { input, id } = renderField(null, null, true);
    const { artifact } = await captureArtifact(
      async () => {
        // Nothing under the field while the value names one row or none yet.
        fireEvent.input(input, { target: { value: 'Горка' } });
        flush();
        expect(id()).toBe('1');
        expect(screen.queryByRole('combobox', { name: /Several/ })).toBeNull();
        expect(screen.queryByText('Add as a new locality')).toBeNull();
        // Nor while the dropdown still has rows for what is typed so far.
        fireEvent.input(input, { target: { value: 'Го' } });
        flush();
        expect(id()).toBe('');
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        expect(screen.queryByText('Add as a new locality')).toBeNull();

        // Two rows share the spelling: a choice among them, none chosen.
        fireEvent.input(input, { target: { value: 'Волково' } });
        flush();
        expect(id()).toBe('');
        const choice = screen.getByRole('combobox', {
          name: 'Several match this spelling: choose one',
        }) as HTMLInputElement | HTMLSelectElement as HTMLSelectElement;
        expect([...choice.options].map((o) => o.text)).toEqual([
          'Several match this spelling: choose one',
          'Волгово (Губаницы)',
          'Вохново (Губаницы)',
        ]);
        fireEvent.change(choice, { target: { value: '2' } });
        flush();
        expect(id()).toBe('2');
        expect(screen.queryByRole('combobox', { name: /Several/ })).toBeNull();

        // No row has the spelling: the fields to add one, prefilled, and
        // the flag asking for it; back to a known spelling, they go.
        fireEvent.input(input, { target: { value: 'Новая' } });
        flush();
        expect(id()).toBe('');
        expect(screen.getByText('Add as a new locality')).toBeInTheDocument();
        expect(document.querySelector('[name="placeCreate"]')).toHaveValue('on');
        expect(document.querySelector('[name="placeNew.nameRu"]')).toHaveValue('Новая');
        // Typing on keeps the fields, and what was typed in them: only the
        // prefilled value follows.
        const finnish = screen.getByLabelText('Finnish name') as HTMLInputElement;
        fireEvent.input(finnish, { target: { value: 'Uusi' } });
        fireEvent.input(input, { target: { value: 'Новая д' } });
        flush();
        expect(document.querySelector('[name="placeNew.nameRu"]')).toHaveValue('Новая д');
        expect(screen.getByLabelText('Finnish name')).toBe(finnish);
        expect(finnish).toHaveValue('Uusi');
        fireEvent.input(input, { target: { value: 'Горки' } });
        flush();
        expect(id()).toBe('1');
        expect(screen.queryByText('Add as a new locality')).toBeNull();
        expect(document.querySelector('[name="placeCreate"]')).toBeNull();
      },
      { scenario: 'lookup-choice-and-create' },
    );
    expect(artifact).toHaveNoDiagnostics();
  });
});
