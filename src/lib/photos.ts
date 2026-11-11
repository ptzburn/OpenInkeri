// Where the photographs of the sources' pages are: each page is a WebP copy
// and its thumbnail in the PHOTOS bucket, named by the copy's hash
// (source_page.key), and served by src/routes/api/photos/[size]/[name].ts.
// A changed photo gets a new hash and so a new URL, which lets browsers keep
// each one for good. Only signed-in users get them. scripts/import-pages.ts
// writes the same keys.

export const photoSizes = ['pages', 'thumbs'] as const;
export type PhotoSize = (typeof photoSizes)[number];

/** A copy's key in the bucket: `pages/<hash>.webp` or `thumbs/<hash>.webp`. */
export const photoKey = (size: PhotoSize, hash: string) => `${size}/${hash}.webp`;

/** The URL a page's photo (`pages`) or its thumbnail (`thumbs`) is served at. */
export const photoUrl = (size: PhotoSize, hash: string) => `/api/photos/${photoKey(size, hash)}`;
