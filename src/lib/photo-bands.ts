// The bands a page photo shows over the entries transcribed from it: each
// record marks where its entry starts (record.photo_top, a fraction of the
// photo's height), and its band runs down to the next mark. The last one has
// no mark below it, so it takes the bands' usual height.

/** A record's mark: where its entry starts, 0 the top of the photo, 1 the bottom. */
export interface PhotoMark {
  id: number;
  top: number;
}

// The height of a band when there is none other to go by: about one entry
// of a register spread.
const ONE_ENTRY = 0.06;

/** The bands of `marks`, from the top of the photo down: each mark with where its band ends. */
export function photoBands<T extends PhotoMark>(marks: T[]): (T & { bottom: number })[] {
  const sorted = [...marks].sort((a, b) => a.top - b.top);
  const heights = sorted.slice(1).map((mark, i) => mark.top - sorted[i].top);
  const usual = heights.length
    ? heights.reduce((sum, h) => sum + h, 0) / heights.length
    : ONE_ENTRY;
  return sorted.map((mark, i) => ({
    ...mark,
    bottom: Math.min(1, sorted[i + 1]?.top ?? mark.top + usual),
  }));
}

/**
 * Records in the order of their page's photo: those marked on it from the
 * top down, then the others as they came (in the order they were typed),
 * so a page transcribed in any order still lists as the page reads.
 */
export function inPhotoOrder<T extends { photoTop: number | null }>(rows: T[]): T[] {
  const marked = rows.filter((row) => row.photoTop !== null);
  const unmarked = rows.filter((row) => row.photoTop === null);
  return [...marked.sort((a, b) => a.photoTop! - b.photoTop!), ...unmarked];
}
