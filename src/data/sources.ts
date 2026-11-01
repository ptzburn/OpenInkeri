// The sources pages' data: server functions ('use server') behind router
// queries and actions, like ./parishes.ts. A source is one register or
// list (a book, an archival file) that records are transcribed from. The
// list is for signed-in users; creating, editing and deleting sources is
// for admins. A save writes the source and a change_log entry in one D1
// batch.
import { action, query } from '@solidjs/router';
import { redirect } from '@solidjs/web';
import { and, count, eq } from 'drizzle-orm';
import * as v from 'valibot';

import { namesOf } from '~/lib/format';
import { type RecordKind, recordKinds, sourceLanguages } from '~/lib/record-kinds';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';
import { db } from '~/server/database';
import { parish, record, source } from '~/server/database/schema';
import {
  type Refusals,
  deleteRow,
  deletionForm,
  logChange,
  lookupRow,
  parseDeletion,
  rowForEdit,
  writing,
} from '~/server/edits';
import {
  line,
  optionalId,
  parseOrRefuse,
  refuse,
  requiredLine,
  rowId,
  text,
  version,
} from '~/server/forms';
import { adminOnly, signedIn } from '~/server/guards';
import {
  type Created,
  createFlag,
  createParish,
  deleteCreated,
  newParish,
  parishNamed,
} from '~/server/linked-rows';

// The read functions' results, spelled out: the pages' types feed the
// routes' and so `paths`, which this module uses, so inferred types would be
// circular (see AccountData in ./account.ts).
export interface SourceRow {
  id: number;
  title: string;
  kind: RecordKind;
  parish: { ru: string; fi: string | null } | null;
  yearFrom: number | null;
  yearTo: number | null;
  language: string | null;
  archiveReference: string | null;
  note: string | null;
  records: number;
}

export interface SourceEditData {
  id: number;
  version: number;
  title: string;
  kind: RecordKind;
  parishId: number | null;
  archiveReference: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  language: string | null;
  note: string | null;
  /** How many records it holds: while any do, its type can't change and it can't be deleted. */
  records: number;
}

/** Every source, by type and title, with its parish and how many records it holds. */
export const getSources = query(async (): Promise<SourceRow[]> => {
  'use server';
  signedIn();
  const [sources, counts] = await Promise.all([
    db.query.source.findMany({
      columns: {
        id: true,
        title: true,
        kind: true,
        yearFrom: true,
        yearTo: true,
        language: true,
        archiveReference: true,
        note: true,
      },
      with: { parish: { columns: { nameRu: true, nameFi: true } } },
    }),
    db.select({ sourceId: record.sourceId, n: count() }).from(record).groupBy(record.sourceId),
  ]);
  const records = new Map(counts.map((row) => [row.sourceId, row.n]));
  return sources
    .map(({ parish, ...s }) => ({
      ...s,
      parish: namesOf(parish),
      records: records.get(s.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        recordKinds.indexOf(a.kind) - recordKinds.indexOf(b.kind) ||
        a.title.localeCompare(b.title, 'ru'),
    );
}, 'sources');

async function loadSource(id: number) {
  return db.query.source.findFirst({
    where: { id },
    columns: {
      id: true,
      version: true,
      title: true,
      kind: true,
      parishId: true,
      archiveReference: true,
      yearFrom: true,
      yearTo: true,
      language: true,
      note: true,
    },
  });
}

const countRecords = (id: number) => db.$count(record, eq(record.sourceId, id));

/** One source for its edit page, with how many records it holds, or null if there is none. */
export const getSourceEdit = query(async (id: number): Promise<SourceEditData | null> => {
  'use server';
  adminOnly();
  const sourceId = v.parse(rowId, id);
  const [row, records] = await Promise.all([loadSource(sourceId), countRecords(sourceId)]);
  return row ? { ...row, records } : null;
}, 'source-edit');

// --- The form ----------------------------------------------------------------------

// A year as typed, or empty.
const year = v.pipe(
  v.optional(v.string(), ''),
  v.transform((s) => s.trim()),
  v.check((s) => s === '' || /^\d{4}$/.test(s)),
  v.transform((s) => (s === '' ? null : Number(s))),
);

const form = v.pipe(
  v.object({
    // Save and add records: the new source's first record's form follows.
    next: v.optional(v.literal('on')),
    id: optionalId, // empty for a new source
    version,
    title: requiredLine(),
    kind: v.picklist(recordKinds),
    // The parish as typed, the one it is linked to, and the box asking to
    // add it (its fields are read apart, see saveSource).
    parishText: line(),
    parishId: optionalId,
    parishCreate: createFlag,
    archiveReference: line(),
    yearFrom: year,
    yearTo: year,
    language: v.pipe(
      v.optional(v.string(), ''),
      v.transform((s) => s || null),
      v.nullable(v.picklist(sourceLanguages)),
    ),
    note: text,
  }),
  v.forward(
    v.check(
      (s) => s.yearFrom === null || s.yearTo === null || s.yearFrom <= s.yearTo,
      () => m.source_years_order(),
    ),
    ['yearTo'],
  ),
);

const sourceRefusals: Refusals = {
  missing: m.source_edit_missing,
  conflict: m.source_edit_conflict,
};

/**
 * Creates a source (no id in the form) or saves the edit page's form over
 * one, then redirects to the sources list, or with Save and add records to
 * the form of its first record. Refused, with the fields at fault, when a
 * value doesn't read (or the years run backwards); when the type would
 * change while records belong to the source (their details are the type's);
 * and when the source changed since the page loaded it.
 *
 * The parish is typed by name and linked to the parish it names (the form
 * does this as the admin types; here for a form posted before JavaScript
 * loaded); a parish not known yet is added when the form asks
 * (src/server/linked-rows.ts), with a locality of its name as its church.
 */
export const saveSource = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const entries = Object.fromEntries(formData);
  const { id, version, next, parishText, parishCreate, ...fields } = parseOrRefuse(form, entries);
  const before = id ? await rowForEdit(loadSource, id, version, sourceRefusals) : null;
  if (before && before.kind !== fields.kind && (await countRecords(before.id))) {
    throw refuse({ message: m.form_invalid(), fields: { kind: m.source_kind_locked() } }, 409);
  }
  // The parish: the one linked, the one the text names, or the one to add.
  const linked = await lookupRow(
    { text: parishText, id: fields.parishId, create: parishCreate },
    {
      idName: 'parishId',
      prefix: 'parishNew',
      table: parish,
      named: parishNamed,
      columns: newParish,
      entries,
    },
  );
  fields.parishId = linked.id;

  const now = new Date();
  const by = { userId: user.id, now };
  const stamp = { updatedAt: now, updatedBy: user.id };
  const added: Created[] = [];
  if (linked.add) {
    const created = await createParish(linked.add, by);
    added.push(created);
    fields.parishId = created.id;
  }

  let sourceId = before?.id;
  await writing(
    'Saving a source',
    async () => {
      if (before) {
        await db.batch([
          db
            .update(source)
            .set({ ...fields, version: before.version + 1, ...stamp })
            .where(and(eq(source.id, before.id), eq(source.version, before.version))),
          logChange(by, 'source', before.id, 'update', before, {
            ...before,
            ...fields,
            version: before.version + 1,
          }),
          ...added.flatMap((row) => row.statements),
        ]);
      } else {
        // The change_log entry needs the new id, so it is written after the
        // insert rather than in one batch with it.
        const [created] = await db
          .insert(source)
          .values({ ...fields, createdBy: user.id, ...stamp })
          .returning({ id: source.id });
        sourceId = created.id;
        await db.batch([
          logChange(by, 'source', created.id, 'create', null, fields),
          ...added.flatMap((row) => row.statements),
        ]);
      }
    },
    { undo: () => deleteCreated(added) },
  );
  if (next) {
    throw redirect(
      paths.records.new({
        kind: fields.kind === 'baptisms' ? undefined : fields.kind,
        source: String(sourceId),
      }),
    );
  }
  throw redirect(paths.sources());
}, 'save-source');

const deletion = deletionForm();

/**
 * Deletes the edit page's source, with its sections, once confirmed in its
 * dialog, then redirects to the sources list. Refused while records
 * belong to it, and, like a save, when it changed since the page loaded it.
 */
export const deleteSource = action(async (formData: FormData) => {
  'use server';
  const user = adminOnly();
  const { id, version } = parseDeletion(deletion, formData, m.source_delete_unconfirmed);
  const before = await rowForEdit(loadSource, id, version, sourceRefusals);
  const records = await countRecords(id);
  if (records) throw refuse({ message: m.source_delete_in_use({ count: records }) }, 409);
  // Its sections go with it (on delete cascade).
  await deleteRow({
    table: source,
    entity: 'source',
    row: before,
    by: { userId: user.id },
    failed: m.source_delete_failed,
  });
  throw redirect(paths.sources());
}, 'delete-source');
