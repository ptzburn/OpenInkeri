import { describe, expect, test } from 'vite-plus/test';

import { formatDate } from './format';

describe('formatDate', () => {
  test('writes day.month.year without leading zeros', () => {
    expect(formatDate(new Date('2026-10-13T12:00:00Z'))).toBe('13.10.2026');
    expect(formatDate(new Date('2026-02-01T12:00:00Z'))).toBe('1.2.2026');
  });

  test('takes the calendar day in UTC', () => {
    expect(formatDate('2026-10-13T23:30:00Z')).toBe('13.10.2026');
    expect(formatDate('2026-10-13T00:30:00Z')).toBe('13.10.2026');
  });
});
