import { flush } from 'solid-js';
import { captureArtifact } from '@solidjs/diagnostics';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, test } from 'vite-plus/test';

import { LookupField, lookupOf } from './lookup-field';

// The lookup field on its own: a combobox over three localities, two of
// which share the spelling "Волково".
const lookup = lookupOf(
  [
    { value: 1, label: 'Горки (Губаницы)', spellings: ['Горки', 'Горка'] },
    { value: 2, label: 'Волгово (Губаницы)', spellings: ['Волгово', 'Волково'] },
    { value: 3, label: 'Вохново (Губаницы)', spellings: ['Вохново', 'Волково'] },
  ],
  'Not linked to a locality',
);

function renderField(text: string | null = null, id: number | null = null) {
  render(() => (
    <form>
      <LookupField
        textName="placeText"
        idName="placeId"
        label="Locality"
        text={text}
        id={id}
        lookup={lookup}
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
        expect(input.closest('.fieldset')).toHaveTextContent('→ Вохново (Губаницы)');
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

    // Arrow down reopens it, narrowed to the value now typed.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    flush();
    expect(options()).toEqual(['Горки (Губаницы)']);
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

  test('a text matching nothing still lists every row, and a stored value is kept', () => {
    const { input, id, options } = renderField('Горкка', 1);
    expect(input).toHaveValue('Горкка');
    expect(id()).toBe('1');
    fireEvent.focus(input);
    flush();
    expect(options()).toEqual(['Горки (Губаницы)', 'Волгово (Губаницы)', 'Вохново (Губаницы)']);
    // Enter with no row chosen leaves the value alone (the form would submit).
    fireEvent.keyDown(input, { key: 'Enter' });
    flush();
    expect(input).toHaveValue('Горкка');
    expect(id()).toBe('1');
  });
});
