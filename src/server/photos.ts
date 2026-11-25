// The PHOTOS bucket (R2), as a server-only module like ./database: the
// sources' page photographs (~/lib/photos). It is declared in wrangler.jsonc
// and typed by `pnpm cf-typegen`.
import 'server-only';
import { env } from 'cloudflare:workers';

/** The bucket, read when asked for (a test that never asks needs no binding). */
export const photos = (): R2Bucket => env.PHOTOS;
