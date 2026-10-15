import { isResponseEnvelope } from '@solidjs/web';
import * as v from 'valibot';
import { describe, expect, test } from 'vite-plus/test';

import { finnishName, refuse, russianName } from './forms';

describe('refuse', () => {
  test('answers with the error and status, and no X-Revalidate header', () => {
    const refused = refuse({ message: 'Check the marked fields.', fields: ['nameRu'] }, 400);

    expect(isResponseEnvelope(refused)).toBe(true);
    expect(refused.value).toEqual({ message: 'Check the marked fields.', fields: ['nameRu'] });
    const response = refused.response!;
    expect(response.status).toBe(400);
    // Any X-Revalidate (even empty) makes the browser transport hand a
    // thrown refusal to the action as its result, so the form shows nothing.
    expect(response.headers.has('X-Revalidate')).toBe(false);
  });
});

describe('name fields', () => {
  test('a Russian name must be in Cyrillic', () => {
    expect(v.parse(russianName(), '  Сало   (Оржевка) ')).toBe('Сало (Оржевка)');
    expect(v.is(russianName(), 'X')).toBe(false);
    expect(v.is(russianName(), '')).toBe(false);
  });

  test('a Finnish name is optional, and in Latin letters', () => {
    expect(v.parse(finnishName(), ' Hevaa ')).toBe('Hevaa');
    expect(v.parse(finnishName(), '')).toBeNull();
    expect(v.is(finnishName(), 'Губаницы')).toBe(false);
  });
});
