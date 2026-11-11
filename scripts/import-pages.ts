// Import of a source's page photographs: one folder of a register's photos
// (as the family's archive keeps them, one folder per register) becomes the
// source's pages (source_page) and their copies in the PHOTOS bucket (R2),
// for the source's pages in the app (src/routes/sources/[id]/).
//
//   node scripts/import-pages.ts --source 7 "temp-data/photos/1903-1916 Syntyneet (Hatsina)"
//   node scripts/import-pages.ts --source 7 --remote "<folder>"
//
// The originals are not uploaded, only what the browser shows (~/lib/photos):
// each photo is turned upright by its EXIF orientation, stripped of its
// metadata (a phone's GPS among it), and saved as WebP, at most 2500 px on
// its long side for reading (about a third of a phone's JPEG) and 400 px for
// the thumbnail. Copies are named by their hash, so an unchanged photo keeps
// its URL and browsers their cached copy.
//
// The photos are ordered by name, numbers by value ("1903 s. 2" before
// "1903 s. 10"), and numbered 1, 2, 3… in that order. A name ending in
// "s. <page>" (sivu, the page as the register numbers it) gives the page its
// label; any other (a cover, "0 vv …") has none. The folder is the whole
// source: a photo already imported (by the original's hash) keeps its copies,
// a new one is added, and pages whose photo has left the folder are removed
// (their copies stay in the bucket; nothing else names them).
//
// Run it on the local database first, then with --remote. Wrangler does the
// writing: the copies with `r2 bulk put`, the rows with `d1 execute`.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

import { photoKey } from '../src/lib/photos.ts';
import { type Row, inserts, sqlValue } from './import-common.ts';

const BUCKET = 'openinkeri-photos';
const PAGE = { size: 2500, quality: 80 };
const THUMB = { size: 400, quality: 70 };
const PHOTO = /\.(jpe?g|png|tiff?|heic|webp)$/i;
// "1903 s. 5.JPG" → "5"; "1904 s. 221об.jpg" → "221об".
const LABEL = /\bs\.\s*(\S+?)\.[^.]+$/i;

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: 'string' },
    remote: { type: 'boolean', default: false },
    work: { type: 'string', default: '.wrangler/import-pages' },
  },
});
const sourceId = Number(args.source);
if (positionals.length !== 1 || !Number.isInteger(sourceId) || sourceId < 1) {
  console.error('Usage: node scripts/import-pages.ts --source <id> [--remote] <folder>');
  process.exit(2);
}
const [folder] = positionals;
const where = args.remote ? '--remote' : '--local';

function wrangler(...rest: string[]): string {
  return execFileSync('pnpm', ['exec', 'wrangler', ...rest], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function select<T>(sql: string): T[] {
  const out = wrangler('d1', 'execute', 'DB', where, '--json', '--command', sql);
  return (JSON.parse(out) as { results: T[] }[])[0].results;
}

// --- The source and its pages so far ----------------------------------------------

const [source] = select<{ id: number; title: string }>(
  `SELECT id, title FROM source WHERE id = ${sourceId}`,
);
if (!source) {
  console.error(
    `There is no source ${sourceId} in the ${args.remote ? 'remote' : 'local'} database.`,
  );
  process.exit(1);
}
interface Known {
  id: number;
  file_hash: string;
  key: string;
  width: number;
  height: number;
  bytes: number;
}
const known = new Map(
  select<Known>(
    `SELECT id, file_hash, key, width, height, bytes FROM source_page WHERE source_id = ${sourceId}`,
  ).map((row) => [row.file_hash, row]),
);

// --- The photos -----------------------------------------------------------------

const byName = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const files = readdirSync(folder)
  .filter((name) => PHOTO.test(name) && !name.startsWith('.'))
  .sort(byName.compare);
if (files.length === 0) {
  console.error(`No photos in ${folder}.`);
  process.exit(1);
}

const work = join(args.work, String(sourceId));
mkdirSync(work, { recursive: true });
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');

const rows: Row[] = [];
const uploads: { key: string; file: string }[] = [];
let bytes = 0;
let originals = 0;
for (const [i, name] of files.entries()) {
  const original = readFileSync(join(folder, name));
  originals += original.length;
  const fileHash = sha(original);
  let page = known.get(fileHash);
  if (!page) {
    const encode = ({ size, quality }: typeof PAGE) =>
      sharp(original)
        .rotate()
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });
    const copy = await encode(PAGE);
    const thumb = await encode(THUMB);
    // 32 hex digits of the copy's hash: unique enough, and a short URL.
    const key = sha(copy.data).slice(0, 32);
    for (const [size, data] of [
      ['pages', copy.data],
      ['thumbs', thumb.data],
    ] as const) {
      const file = join(work, `${size}-${key}.webp`);
      writeFileSync(file, data);
      uploads.push({ key: photoKey(size, key), file });
    }
    page = {
      id: 0,
      file_hash: fileHash,
      key,
      width: copy.info.width,
      height: copy.info.height,
      bytes: copy.data.length + thumb.data.length,
    };
    process.stdout.write(`\r${i + 1}/${files.length} ${name}`.padEnd(70));
  }
  bytes += page.bytes;
  rows.push({
    source_id: sourceId,
    position: i + 1,
    label: name.match(LABEL)?.[1] ?? null,
    file: name,
    file_hash: fileHash,
    key: page.key,
    width: page.width,
    height: page.height,
    bytes: page.bytes,
  });
}
process.stdout.write('\n');

// --- Writing ----------------------------------------------------------------------

if (uploads.length) {
  const manifest = join(work, 'uploads.json');
  writeFileSync(manifest, JSON.stringify(uploads));
  console.log(`Uploading ${uploads.length} copies to ${BUCKET} (${where.slice(2)})…`);
  wrangler(
    'r2',
    'bulk',
    'put',
    BUCKET,
    where,
    '--filename',
    manifest,
    '--content-type',
    'image/webp',
  );
}

// The source's pages are replaced whole, in one file Wrangler runs as one
// transaction: positions shift as photos come and go, and position is unique.
const sql = [
  `DELETE FROM source_page WHERE source_id = ${sqlValue(sourceId)};`,
  ...inserts('source_page', rows),
].join('\n');
const sqlFile = join(work, 'pages.sql');
writeFileSync(sqlFile, sql);
wrangler('d1', 'execute', 'DB', where, '--yes', '--file', sqlFile);

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const added =
  rows.length - [...known.keys()].filter((h) => rows.some((r) => r.file_hash === h)).length;
console.log(
  `${source.title}: ${rows.length} pages (${added} new, ${known.size - (rows.length - added)} removed); ` +
    `${mb(bytes)} in the bucket for ${mb(originals)} of originals.`,
);
