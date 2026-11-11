// The photographs of the sources' pages, from the PHOTOS bucket (R2):
// /api/photos/pages/<hash>.webp and /api/photos/thumbs/<hash>.webp
// (~/lib/photos). Anyone may see them. A name is its content's hash, so a
// browser and Cloudflare's edge keep each one for a year without asking
// again; a request that names a version it has gets a 304.
import type { APIHandler } from 'filesystem-routing/api';

import { photoKey, photoSizes } from '~/lib/photos';
import { photos } from '~/server/photos';

const NAME = /^([0-9a-f]{16,64})\.webp$/;

export const GET: APIHandler = async ({ request, params }) => {
  const size = photoSizes.find((s) => s === params?.size);
  const hash = params?.name?.match(NAME)?.[1];
  if (!size || !hash) return new Response(null, { status: 404 });
  const object = await photos().get(photoKey(size, hash), { onlyIf: request.headers });
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers({
    'content-type': 'image/webp',
    'cache-control': 'public, max-age=31536000, immutable',
    etag: object.httpEtag,
  });
  // Without a body: the request's If-None-Match matched.
  if (!('body' in object)) return new Response(null, { status: 304, headers });
  headers.set('content-length', String(object.size));
  return new Response(object.body, { headers });
};
