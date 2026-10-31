import { describe, expect, test } from 'vite-plus/test';

import {
  describeUserAgent,
  formatDate,
  formatPartialDate,
  lifespan,
  parsePartialDate,
} from './format';

describe('formatDate', () => {
  test('writes day.month.year without leading zeros', () => {
    expect(formatDate(new Date('2026-10-13T12:00:00Z'))).toBe('13.10.2026');
    expect(formatDate(new Date('2026-02-01T12:00:00Z'))).toBe('01.02.2026');
  });

  test('takes the calendar day in UTC', () => {
    expect(formatDate('2026-10-13T23:30:00Z')).toBe('13.10.2026');
    expect(formatDate('2026-10-13T00:30:00Z')).toBe('13.10.2026');
  });
});

describe('formatPartialDate', () => {
  test('writes only the parts the date has', () => {
    expect(formatPartialDate('1895-03-02')).toBe('02.03.1895');
    expect(formatPartialDate('1895-03')).toBe('03.1895');
    expect(formatPartialDate('1895')).toBe('1895');
    expect(formatPartialDate(null)).toBe('');
  });
});

describe('lifespan', () => {
  test('writes the years known, with a dash between', () => {
    expect(lifespan('1895-03-02', '1960')).toBe('02.03.1895–1960');
    expect(lifespan('1895', null)).toBe('1895–');
    expect(lifespan(null, '1960')).toBe('–1960');
    expect(lifespan(null, null)).toBe('');
  });
});

describe('parsePartialDate', () => {
  test('reads day.month.year, month.year or a year', () => {
    expect(parsePartialDate('2.3.1895')).toBe('1895-03-02');
    expect(parsePartialDate(' 02.03.1895 ')).toBe('1895-03-02');
    expect(parsePartialDate('3.1895')).toBe('1895-03');
    expect(parsePartialDate('1895')).toBe('1895');
    expect(parsePartialDate(formatPartialDate('1895-12-31'))).toBe('1895-12-31');
  });

  test('is null when empty and undefined when unreadable', () => {
    expect(parsePartialDate('')).toBeNull();
    expect(parsePartialDate('31.2.1895')).toBeUndefined();
    expect(parsePartialDate('13.1895')).toBeUndefined();
    expect(parsePartialDate('3ю5')).toBeUndefined();
    expect(parsePartialDate('1895-03-02')).toBeUndefined();
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
