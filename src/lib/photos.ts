// Where the photographs of the sources' pages are: each page is a WebP copy
// and its thumbnail in the PHOTOS bucket, named by the copy's hash
// (source_page.key), and served by src/routes/api/photos/[size]/[name].ts.
// A changed photo gets a new hash and so a new URL, which lets browsers keep
// each one for good. Only signed-in users get them. Admins add them in the
// app (src/routes/api/sources/[id]/pages.ts) or with scripts/import-pages.ts,
// which write the same keys and read file names the same way.

export const photoSizes = ['pages', 'thumbs'] as const;
export type PhotoSize = (typeof photoSizes)[number];

/** A copy's key in the bucket: `pages/<hash>.webp` or `thumbs/<hash>.webp`. */
export const photoKey = (size: PhotoSize, hash: string) => `${size}/${hash}.webp`;

/** The URL a page's photo (`pages`) or its thumbnail (`thumbs`) is served at. */
export const photoUrl = (size: PhotoSize, hash: string) => `/api/photos/${photoKey(size, hash)}`;

/** The largest photo the app takes: what Cloudflare Images reads at most. */
export const PAGE_PHOTO_MAX_BYTES = 20 * 1024 * 1024;

/** What one page photo is uploaded as: its file name, its page as the register numbers it, and its SHA-256. */
export interface PagePhotoUpload {
  name: string;
  label: string | null;
  hash: string;
}

/** What an upload answers: the page's position, added or found already there; or why not. */
export type PageUploadResult =
  | { status: 'added' | 'skipped'; position: number }
  | { status: 'refused'; message: string };

/** The URL one page photo of source `sourceId` is uploaded to, its body the photo. */
export const pageUploadUrl = (sourceId: number, photo: PagePhotoUpload) =>
  `/api/sources/${sourceId}/pages?${new URLSearchParams({
    name: photo.name,
    label: photo.label ?? '',
    hash: photo.hash,
  })}`;

// "1903 s. 5.JPG" → "5"; "1904 s. 221об.jpg" → "221об".
const LABEL = /\bs\.\s*(\S+?)\.[^.]+$/i;

/**
 * The page a photo's file name gives, as the register numbers it: what
 * follows "s." (sivu) at the end ("1903 s. 221об.jpg" → "221об"); null for
 * any other name (a cover, "0 vv …").
 */
export const pageLabelOf = (fileName: string) => fileName.match(LABEL)?.[1] ?? null;

const names = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Photos' file names in page order: numbers by value ("1903 s. 2" before "1903 s. 10"). */
export const byFileName = (a: string, b: string) => names.compare(a, b);
