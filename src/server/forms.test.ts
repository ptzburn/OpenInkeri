import { isResponseEnvelope } from '@solidjs/web';
import { describe, expect, test } from 'vite-plus/test';

import { refuse } from './forms';

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
