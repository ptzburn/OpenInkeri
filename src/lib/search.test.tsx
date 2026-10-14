import { describe, expect, test } from 'vite-plus/test';

import { stringParams } from './search';

const parse = (raw: unknown) => {
  const outcome = stringParams('q')['~standard'].validate(raw);
  if (outcome instanceof Promise || outcome.issues) throw new Error('expected a value');
  return outcome.value;
};

describe('stringParams', () => {
  test('keeps a listed string param and drops the rest', () => {
    expect(parse({ q: 'mil', page: '2' })).toEqual({ q: 'mil' });
  });

  test('makes a missing or repeated param undefined', () => {
    expect(parse({})).toEqual({});
    expect(parse({ q: ['a', 'b'] })).toEqual({});
    expect(parse(undefined)).toEqual({});
  });
});
