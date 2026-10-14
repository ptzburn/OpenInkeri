import { describe, expect, test } from 'vite-plus/test';

import { describeUserAgent, formatDate } from './format';

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

describe('describeUserAgent', () => {
  test('names the browser and the system', () => {
    const mac =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    const edge =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
    const android =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    expect(describeUserAgent(mac)).toBe('Safari, macOS');
    expect(describeUserAgent(edge)).toBe('Edge, Windows');
    expect(describeUserAgent(android)).toBe('Chrome, Android');
    expect(describeUserAgent(iphone)).toBe('Safari, iOS');
  });

  test('gives up on what it does not know', () => {
    expect(describeUserAgent('curl/8.0')).toBeUndefined();
    expect(describeUserAgent(null)).toBeUndefined();
  });
});
