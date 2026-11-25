// A source's page photographs, added and removed by admins in the app, as
// scripts/import-pages.ts adds them from a folder: a WebP copy (at most
// 2500 px on its long side) and a 400 px thumbnail in the PHOTOS bucket,
// named by the copy's hash (~/lib/photos), and a source_page row with its
// change_log entry.
//
// The copies are made by Cloudflare Images (the IMAGES binding), which turns
// the photo upright by its EXIF orientation; the Worker never decodes the
// original. It streams in as the upload's body, straight into the binding,
// so a 20 MB photo costs the Worker next to no CPU (the Free plan allows
// 10 ms a request). The thumbnail is made from the copy. The copies' EXIF
// and XMP (a phone's GPS among them) are taken out here (./webp.ts), since
// the binding can't be told to drop them.
import 'server-only';
import { env } from 'cloudflare:workers';
import { getRequestEvent } from '@solidjs/web';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import * as v from 'valibot';

import { FIELD_MAX } from '~/lib/field-limits';
import { PAGE_PHOTO_MAX_BYTES, type PageUploadResult, photoKey } from '~/lib/photos';
import { m } from '~/paraglide/messages.js';
import { isAdmin } from '~/server/auth';
import { db } from '~/server/database';
import { sourcePage } from '~/server/database/schema';
import { type Writer, logChange, writing } from '~/server/edits';
import { line, refuse, requiredLine, rowId } from '~/server/forms';
import { photos } from '~/server/photos';
import { webpSize, withoutMetadata } from '~/server/webp';

const PAGE = { size: 2500, quality: 80 };
const THUMB = { size: 400, quality: 70 };

// What Cloudflare Images answers when a photo can't be read, and when the
// month's free transformations are used up.
const NOT_AN_IMAGE = [9412, 9520];
const QUOTA = 9422;

const refused = (message: string, status: number) =>
  Response.json({ status: 'refused', message } satisfies PageUploadResult, { status });

const upload = v.object({
  sourceId: v.pipe(v.string(), v.transform(Number), rowId),
  name: requiredLine(),
  label: line(FIELD_MAX.line),
  hash: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
});

/**
 * Answers an upload of one page photo of source `id` (POST
 * /api/sources/:id/pages, the photo as the body, ?name= its file name,
 * ?label= its page as the register numbers it, ?hash= its SHA-256): adds it
 * after the source's last page, or finds it there already (by the
 * original's hash, as the script does), with a PageUploadResult. Admins
 * only, from this site's own pages: the request must come from its origin,
 * which a cross-site form or fetch can't claim.
 */
export async function answerPageUpload(request: Request, id: string | undefined) {
  const user = getRequestEvent()?.locals.user;
  if (!user || !isAdmin(user)) return refused(m.form_failed(), 403);
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return refused(m.form_failed(), 403);
  }
  const query = new URL(request.url).searchParams;
  const parsed = v.safeParse(upload, {
    sourceId: id,
    name: query.get('name') ?? '',
    label: query.get('label') ?? '',
    hash: query.get('hash') ?? '',
  });
  if (!parsed.success || !request.body) return refused(m.form_invalid(), 400);
  if (Number(request.headers.get('content-length')) > PAGE_PHOTO_MAX_BYTES) {
    return refused(m.source_photo_too_large(), 413);
  }
  const { sourceId, name, label, hash } = parsed.output;
  const found = await db.query.source.findFirst({ where: { id: sourceId }, columns: { id: true } });
  if (!found) return refused(m.source_missing(), 404);
  const already = await db.query.sourcePage.findFirst({
    where: { sourceId, fileHash: hash },
    columns: { position: true },
  });
  if (already) return Response.json({ status: 'skipped', position: already.position });

  let copy: Uint8Array<ArrayBuffer>;
  let thumb: Uint8Array<ArrayBuffer>;
  try {
    copy = await webpCopy(request.body, PAGE);
    thumb = await webpCopy(new Blob([copy]).stream(), THUMB);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === QUOTA) return refused(m.source_photo_quota(), 429);
    if (NOT_AN_IMAGE.includes(code as number)) return refused(m.source_photo_not_image(), 415);
    console.error('Making a page photo’s copies failed', error);
    return refused(m.form_failed(), 500);
  }
  try {
    const position = await addPage(
      sourceId,
      { file: name, fileHash: hash, label, copy, thumb },
      { userId: user.id },
    );
    return Response.json({ status: 'added', position } satisfies PageUploadResult);
  } catch (error) {
    // The copies may be in the bucket already, unnamed by any page, as the
    // script leaves a removed page's.
    console.error('Adding a page photo failed', error);
    return refused(m.form_failed(), 500);
  }
}

// A WebP copy of `image`, at most `size` px on its long side, without metadata.
async function webpCopy(image: ReadableStream<Uint8Array>, { size, quality }: typeof PAGE) {
  const result = await env.IMAGES.input(image)
    .transform({ width: size, height: size, fit: 'scale-down' })
    .output({ format: 'image/webp', quality });
  return withoutMetadata(new Uint8Array(await result.response().arrayBuffer()));
}

// Stores the copies and adds the page after the source's last; its position.
async function addPage(
  sourceId: number,
  page: {
    file: string;
    fileHash: string;
    label: string | null;
    copy: Uint8Array<ArrayBuffer>;
    thumb: Uint8Array<ArrayBuffer>;
  },
  by: Writer,
) {
  const digest = await crypto.subtle.digest('SHA-256', page.copy);
  // 32 hex digits of the copy's hash: unique enough, and a short URL.
  const key = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  const webp = { httpMetadata: { contentType: 'image/webp' } };
  await Promise.all([
    photos().put(photoKey('pages', key), page.copy, webp),
    photos().put(photoKey('thumbs', key), page.thumb, webp),
  ]);
  const fields = {
    sourceId,
    label: page.label,
    file: page.file,
    fileHash: page.fileHash,
    key,
    ...webpSize(page.copy),
    bytes: page.copy.length + page.thumb.length,
  };
  // The next position, read in the insert itself, so two uploads at once
  // can't take the same one (the second fails on the unique index).
  const [added] = await db
    .insert(sourcePage)
    .values({
      ...fields,
      position: sql`(select coalesce(max(${sourcePage.position}), 0) + 1 from ${sourcePage} where ${sourcePage.sourceId} = ${sourceId})`,
    })
    .returning({ id: sourcePage.id, position: sourcePage.position });
  // The change_log entry needs the new id, so it is written after the insert.
  await logChange(by, 'source_page', added.id, 'create', null, {
    ...fields,
    position: added.position,
  });
  return added.position;
}

/**
 * Removes page `id` of a source, if it is still the photo `key` (positions
 * shift as pages come and go, so an admin's page may have moved), logging
 * it as it was. The pages after it move up by one. Its copies leave the
 * bucket unless another page has the same photo. Records transcribed from
 * it keep their page number and are edited on their own page from then on.
 * Refused when the page is gone or is another photo now. Returns its source.
 */
export async function removePage(id: number, key: string, by: Writer): Promise<number> {
  const before = await db.query.sourcePage.findFirst({ where: { id } });
  if (!before) throw refuse({ message: m.source_photo_missing() }, 404);
  if (before.key !== key) throw refuse({ message: m.source_photo_changed() }, 409);
  const later = and(
    eq(sourcePage.sourceId, before.sourceId),
    gt(sourcePage.position, before.position),
  );
  await writing('Removing a page photo', () =>
    db.batch([
      db.delete(sourcePage).where(eq(sourcePage.id, id)),
      // Up by one, through negatives: position is unique within a source,
      // and SQLite checks that row by row.
      db
        .update(sourcePage)
        .set({ position: sql`-${sourcePage.position}` })
        .where(later),
      db
        .update(sourcePage)
        .set({ position: sql`-${sourcePage.position} - 1` })
        .where(and(eq(sourcePage.sourceId, before.sourceId), lt(sourcePage.position, 0))),
      logChange(by, 'source_page', id, 'delete', before),
    ]),
  );
  const shared = await db.$count(sourcePage, eq(sourcePage.key, before.key));
  if (!shared) {
    await photos().delete([photoKey('pages', before.key), photoKey('thumbs', before.key)]);
  }
  return before.sourceId;
}

/**
 * Gives page `id`, if it is still the photo `key` and has no page number,
 * the number `label`, logging the change. Only a photo without one: records
 * find their photo by its number, so changing one would move them to
 * another photo. Refused when the page is gone, is another photo now, or
 * has a number already. Returns where the page is.
 */
export async function numberPage(id: number, key: string, label: string, by: Writer) {
  const before = await db.query.sourcePage.findFirst({ where: { id } });
  if (!before) throw refuse({ message: m.source_photo_missing() }, 404);
  if (before.key !== key) throw refuse({ message: m.source_photo_changed() }, 409);
  if (before.label !== null) throw refuse({ message: m.source_page_numbered_already() }, 409);
  await writing('Numbering a page photo', () =>
    db.batch([
      db
        .update(sourcePage)
        .set({ label })
        .where(and(eq(sourcePage.id, id), isNull(sourcePage.label))),
      logChange(by, 'source_page', id, 'update', before, { ...before, label }),
    ]),
  );
  return { sourceId: before.sourceId, position: before.position };
}
