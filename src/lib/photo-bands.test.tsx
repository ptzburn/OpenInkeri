import { describe, expect, test } from 'vite-plus/test';

import { inPhotoOrder, nextMark, photoBands } from './photo-bands';

describe('photoBands', () => {
  test('each band runs down to the next mark, whatever order the marks come in', () => {
    const bands = photoBands([
      { id: 2, top: 0.4 },
      { id: 1, top: 0.2 },
      { id: 3, top: 0.5 },
    ]);
    expect(bands.map((b) => [b.id, b.top, b.bottom])).toEqual([
      [1, 0.2, 0.4],
      [2, 0.4, 0.5],
      // The last takes the usual height: (0.2 + 0.1) / 2.
      [3, 0.5, 0.65],
    ]);
  });

  test('a lone mark gets about one entry, and no band runs off the photo', () => {
    expect(photoBands([{ id: 1, top: 0.3 }])[0].bottom).toBeCloseTo(0.36);
    expect(photoBands([{ id: 1, top: 0.98 }])[0].bottom).toBe(1);
    expect(photoBands([])).toEqual([]);
  });

  test('a marked end is where the band ends, gaps and all', () => {
    const bands = photoBands([
      { id: 1, top: 0.2, bottom: 0.3 },
      { id: 2, top: 0.5, bottom: 0.55 },
    ]);
    expect(bands.map((b) => b.bottom)).toEqual([0.3, 0.55]);
    // A start only (marked before ends were asked for) still runs to the
    // next mark, and the last one takes the marked ends' usual height.
    const old = photoBands([
      { id: 1, top: 0.2 },
      { id: 2, top: 0.5, bottom: 0.6 },
      { id: 3, top: 0.8 },
    ]);
    expect(old.map((b) => b.bottom)).toEqual([0.5, 0.6, expect.closeTo(1, 5)]);
  });

  test("a mark's other fields ride along", () => {
    expect(photoBands([{ id: 7, top: 0.1, n: 3 }])[0]).toMatchObject({ id: 7, n: 3 });
  });
});

describe('inPhotoOrder', () => {
  test('marked records top down, then the unmarked as they came', () => {
    const rows = [
      { id: 1, photoTop: 0.4 },
      { id: 2, photoTop: null },
      { id: 3, photoTop: 0.2 },
      { id: 4, photoTop: null },
    ];
    expect(inPhotoOrder(rows).map((r) => r.id)).toEqual([3, 1, 2, 4]);
    // The rows given are left as they were.
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });
});

describe('nextMark', () => {
  test('the end below a lone start; else the start', () => {
    expect(nextMark({ top: null, bottom: null }, 0.4)).toBe('start');
    expect(nextMark({ top: 0.3, bottom: null }, 0.4)).toBe('end');
    // Above a lone start, the start moves.
    expect(nextMark({ top: 0.3, bottom: null }, 0.2)).toBe('start');
    // Both marked: marking starts again.
    expect(nextMark({ top: 0.3, bottom: 0.4 }, 0.5)).toBe('start');
  });
});
