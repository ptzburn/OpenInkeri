import sharp, { type Sharp } from 'sharp';
import { describe, expect, test } from 'vite-plus/test';

import { webpSize, withoutMetadata } from './webp';

// A 30 × 20 photo, as sharp (libwebp, like Cloudflare Images) writes it.
const photo = () => sharp({ create: { width: 30, height: 20, channels: 3, background: '#a33' } });
const webp = async (image: Sharp) => new Uint8Array(await image.toBuffer());
const chunkTypes = (bytes: Uint8Array) => {
  const types: string[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 12; at < bytes.length;) {
    const size = view.getUint32(at + 4, true);
    types.push(String.fromCharCode(...bytes.subarray(at, at + 4)));
    at += 8 + size + (size % 2);
  }
  return types;
};

describe('webpSize', () => {
  test('reads a lossy, a lossless and an extended file', async () => {
    expect(webpSize(await webp(photo().webp()))).toEqual({ width: 30, height: 20 });
    expect(webpSize(await webp(photo().webp({ lossless: true })))).toEqual({
      width: 30,
      height: 20,
    });
    const extended = await webp(
      photo()
        .withExif({ IFD0: { Copyright: 'x' } })
        .webp(),
    );
    expect(chunkTypes(extended)[0]).toBe('VP8X');
    expect(webpSize(extended)).toEqual({ width: 30, height: 20 });
  });

  test('refuses what is not a WebP', async () => {
    const jpeg = new Uint8Array(await photo().jpeg().toBuffer());
    expect(() => webpSize(jpeg)).toThrow('Not a WebP file');
    const webpFile = await webp(photo().webp());
    expect(() => webpSize(webpFile.subarray(0, 20))).toThrow('A truncated WebP file');
  });
});

describe('withoutMetadata', () => {
  test('takes out the EXIF and XMP chunks and their flags, keeping the image', async () => {
    const tagged = await webp(
      photo()
        .withExif({ IFD0: { Copyright: 'x', ImageDescription: 'GPS here' } })
        .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta>')
        .webp(),
    );
    expect(chunkTypes(tagged)).toEqual(['VP8X', 'VP8 ', 'EXIF', 'XMP ']);

    const clean = withoutMetadata(tagged);
    expect(chunkTypes(clean)).toEqual(['VP8X', 'VP8 ']);
    expect(clean[20] & 0x0c).toBe(0); // the VP8X flags for EXIF and XMP
    // The RIFF size is the file's, less its first 8 bytes.
    expect(new DataView(clean.buffer).getUint32(4, true)).toBe(clean.length - 8);
    // Still a WebP of the same picture, with nothing about the photo left.
    const read = await sharp(clean).metadata();
    expect(read).toMatchObject({ format: 'webp', width: 30, height: 20 });
    expect(read.exif).toBeUndefined();
    expect(read.xmp).toBeUndefined();
    expect(await sharp(clean).raw().toBuffer()).toEqual(await sharp(tagged).raw().toBuffer());
  });

  test('leaves a file without metadata as it was', async () => {
    const plain = await webp(photo().webp());
    expect(withoutMetadata(plain)).toEqual(plain);
  });
});
