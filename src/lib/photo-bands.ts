// The bands a page photo shows over the entries transcribed from it: each
// record marks where its entry starts and ends (record.photo_top and
// photo_bottom, fractions of the photo's height). A record marked before
// ends were asked for has only its start: its band runs down to the next
// mark, or, the last, takes the bands' usual height.

/** A record's marks: where its entry starts and ends, 0 the top of the photo, 1 the bottom. */
export interface PhotoMark {
  id: number;
  top: number;
  bottom?: number | null;
}

// The height of a band when there is none other to go by: about one entry
// of a register spread.
const ONE_ENTRY = 0.06;

/** The bands of `marks`, from the top of the photo down: each mark with where its band ends. */
export function photoBands<T extends PhotoMark>(marks: T[]): (T & { bottom: number })[] {
  const sorted = [...marks].sort((a, b) => a.top - b.top);
  const heights = sorted
    .map((mark, i) =>
      mark.bottom != null ? mark.bottom - mark.top : (sorted[i + 1]?.top ?? NaN) - mark.top,
    )
    .filter((h) => h > 0);
  const usual = heights.length
    ? heights.reduce((sum, h) => sum + h, 0) / heights.length
    : ONE_ENTRY;
  return sorted.map((mark, i) => ({
    ...mark,
    bottom: Math.min(1, mark.bottom ?? sorted[i + 1]?.top ?? mark.top + usual),
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

/** A record's marks as a form edits them: none, a start only (its end still to come), or both. */
export interface PhotoMarks {
  top: number | null;
  bottom: number | null;
}

/**
 * What a click at `y` marks, given the marks so far: the end, when only a
 * start is marked and `y` is below it; else the start (anew, once both
 * are marked, or moved up).
 */
export function nextMark(marks: PhotoMarks, y: number): 'start' | 'end' {
  return marks.top !== null && marks.bottom === null && y > marks.top ? 'end' : 'start';
}
