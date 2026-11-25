// Reading and trimming a WebP file (RIFF: "RIFF", its size, "WEBP", then
// chunks of a four-letter type, a size and the data, padded to even), for
// the page photos the app makes (./page-photos.ts): their size, and the
// copy without its metadata. Cloudflare Images doesn't let the binding say
// what metadata its output keeps, so the EXIF and XMP chunks (a phone's GPS
// among them) are taken out here.

interface Chunk {
  type: string;
  /** Where its header starts. */
  at: number;
  /** Its data's length, without the padding. */
  size: number;
}

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));

const viewOf = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** The file's chunks; throws when it isn't a well-formed WebP. */
function chunksOf(bytes: Uint8Array): Chunk[] {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    throw new Error('Not a WebP file');
  }
  const view = viewOf(bytes);
  const end = 8 + view.getUint32(4, true);
  if (end > bytes.length) throw new Error('A truncated WebP file');
  const chunks: Chunk[] = [];
  for (let at = 12; at < end;) {
    if (at + 8 > end) throw new Error('A malformed WebP chunk');
    const size = view.getUint32(at + 4, true);
    const next = at + 8 + size + (size % 2);
    if (at + 8 + size > end) throw new Error('A malformed WebP chunk');
    chunks.push({ type: ascii(bytes, at, 4), at, size });
    at = next;
  }
  return chunks;
}

/** A WebP's width and height (its canvas, or its one image); throws when it isn't a WebP. */
export function webpSize(bytes: Uint8Array): { width: number; height: number } {
  const view = viewOf(bytes);
  for (const { type, at, size } of chunksOf(bytes)) {
    const data = at + 8;
    // Extended: the canvas, each side less one, in 24 bits.
    if (type === 'VP8X' && size >= 10) {
      const side = (offset: number) =>
        1 + (view.getUint16(data + offset, true) | (bytes[data + offset + 2] << 16));
      return { width: side(4), height: side(7) };
    }
    // Lossy: after the frame tag and its start code, each side in 14 bits.
    if (type === 'VP8 ' && size >= 10) {
      return {
        width: view.getUint16(data + 6, true) & 0x3fff,
        height: view.getUint16(data + 8, true) & 0x3fff,
      };
    }
    // Lossless: after its signature, each side less one in 14 bits.
    if (type === 'VP8L' && size >= 5) {
      const bits = view.getUint32(data + 1, true);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
    }
  }
  throw new Error('A WebP file without an image');
}

// The VP8X flags that say EXIF and XMP chunks follow.
const EXIF_FLAG = 0x08;
const XMP_FLAG = 0x04;

/** The WebP without its EXIF and XMP chunks, the rest as it was; throws when it isn't a WebP. */
export function withoutMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const kept = chunksOf(bytes).filter((c) => c.type !== 'EXIF' && c.type !== 'XMP ');
  const length = kept.reduce((sum, c) => sum + 8 + c.size + (c.size % 2), 12);
  const out = new Uint8Array(length);
  out.set(bytes.subarray(0, 12));
  viewOf(out).setUint32(4, length - 8, true);
  let at = 12;
  for (const c of kept) {
    const whole = 8 + c.size + (c.size % 2);
    out.set(bytes.subarray(c.at, c.at + whole), at);
    if (c.type === 'VP8X') out[at + 8] &= ~(EXIF_FLAG | XMP_FLAG);
    at += whole;
  }
  return out;
}
