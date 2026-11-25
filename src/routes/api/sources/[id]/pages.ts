// An admin's upload of one page photo of a source (~/lib/photos,
// pageUploadUrl), answered by src/server/page-photos.ts. An API route rather
// than a server function: the photo streams in as the body, straight into
// Cloudflare Images, where a server function would first read all of it
// into memory (and takes 1 MB at most).
import type { APIHandler } from 'filesystem-routing/api';

import { answerPageUpload } from '~/server/page-photos';

export const POST: APIHandler = ({ request, params }) => answerPageUpload(request, params?.id);
