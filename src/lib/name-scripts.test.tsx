import { describe, expect, test } from 'vite-plus/test';

import { CYRILLIC_NAME_PATTERN, LATIN_NAME_PATTERN, matchesPattern } from './name-scripts';

describe('name patterns', () => {
  test.each([
    'Губаницы',
    'Санкт-Петербург',
    'Сало (Оржевка)',
    'Ново-Ивановская',
    'Ёлкино',
    'Бѣлая Горка', // pre-1918 spelling
    'Мыза Кикерино',
    '?',
  ])('a Russian name in Cyrillic: %s', (name) => {
    expect(matchesPattern(CYRILLIC_NAME_PATTERN, name)).toBe(true);
  });

  test.each(['X', 'Test', 'Губаницы X', 'Hevaa', '1895', 'Губаницы!'])(
    'not a Russian name: %s',
    (name) => {
      expect(matchesPattern(CYRILLIC_NAME_PATTERN, name)).toBe(false);
    },
  );

  test.each(['Hevaa', 'Skuoritsa', 'Pietari', 'Kupanitsa (Ylä-)', 'Käkisalmi', "Lempaala's"])(
    'a Finnish name in Latin letters: %s',
    (name) => {
      expect(matchesPattern(LATIN_NAME_PATTERN, name)).toBe(true);
    },
  );

  test.each(['Губаницы', 'Hevaa Губаницы', '1895'])('not a Finnish name: %s', (name) => {
    expect(matchesPattern(LATIN_NAME_PATTERN, name)).toBe(false);
  });
});
