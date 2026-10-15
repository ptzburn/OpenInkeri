// The records pages' data: server functions ('use server') behind router
// queries, like ./users.ts. Records are for signed-in users: a signed-out
// visitor is redirected to sign-in, which also makes the read the page's
// guard.
import { query } from '@solidjs/router';
import { and, count, eq, sql } from 'drizzle-orm';
import * as v from 'valibot';

import { type RecordKind, recordKinds } from '~/lib/record-kinds';
import { foldForSearch } from '~/lib/search-text';
import { db } from '~/server/database';
import { signedIn } from '~/server/guards';
import { record, source } from '~/server/database/schema';

export const RECORDS_PAGE_SIZE = 50;

/**
 * One page of records of one kind, in register order, optionally narrowed to
 * those whose names or village contain `search` (case-insensitive, ё = е).
 * `page` counts from 1 and is clamped to the pages there are. Also returns
 * how many records each kind has, whatever the search, for the kind tabs.
 *
 * Only baptisms have columns on the page yet: the other kinds' fields are
 * read here once their registers are imported.
 */
export const getRecords = query(async (kind: RecordKind, search: string, page: number) => {
  'use server';
  signedIn();
  kind = v.parse(v.picklist(recordKinds), kind);
  const folded = foldForSearch(search);
  // %, _ and \ in the search are literal characters, not patterns.
  const pattern = `%${folded.replace(/[\\%_]/g, '\\$&')}%`;
  // The relational query aliases its tables, so the filter takes the table
  // it is applied to.
  const filter = (table: typeof record) =>
    and(
      sql`${table.sourceId} in (select ${source.id} from ${source} where ${source.kind} = ${kind})`,
      folded ? sql`${table.searchText} like ${pattern} escape '\\'` : undefined,
    )!;

  const totals = await db
    .select({ kind: source.kind, records: count() })
    .from(record)
    .innerJoin(source, eq(record.sourceId, source.id))
    .groupBy(source.kind);
  const counts = Object.fromEntries(
    recordKinds.map((k) => [k, totals.find((t) => t.kind === k)?.records ?? 0]),
  ) as Record<RecordKind, number>;

  const total = await db.$count(record, filter(record));
  const pages = Math.max(1, Math.ceil(total / RECORDS_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);

  const rows = await db.query.record.findMany({
    where: { RAW: filter },
    orderBy: { id: 'asc' },
    limit: RECORDS_PAGE_SIZE,
    offset: (current - 1) * RECORDS_PAGE_SIZE,
    columns: { id: true, status: true, date: true, placeText: true, note: true },
    with: {
      place: { columns: { nameRu: true, nameFi: true } },
      baptism: {
        columns: { birthDate: true, stillborn: true, multipleBirth: true, illegitimate: true },
      },
      personas: { columns: { role: true, nameRu: true, nameFi: true }, orderBy: { id: 'asc' } },
    },
  });

  const named = (personas: (typeof rows)[number]['personas'], role: string) => {
    const persona = personas.find((p) => p.role === role);
    return persona ? { ru: persona.nameRu, fi: persona.nameFi } : null;
  };

  return {
    kind,
    counts,
    total,
    page: current,
    pages,
    records: rows.map((r) => ({
      id: r.id,
      lost: r.status === 'lost',
      baptismDate: r.date,
      birthDate: r.baptism?.birthDate ?? null,
      stillborn: r.baptism?.stillborn ?? false,
      multipleBirth: r.baptism?.multipleBirth ?? null,
      illegitimate: r.baptism?.illegitimate ?? false,
      village: r.place ? { ru: r.place.nameRu, fi: r.place.nameFi } : null,
      villageAsWritten: r.placeText,
      child: named(r.personas, 'child'),
      father: named(r.personas, 'father'),
      mother: named(r.personas, 'mother'),
      note: r.note,
    })),
  };
}, 'records');

/**
 * What a component's getRecords read holds: undefined on a server render
 * that redirects a signed-out visitor (see UserList in ./users.ts).
 */
export type RecordList = Awaited<ReturnType<typeof getRecords>> | undefined;
export type RecordRow = NonNullable<RecordList>['records'][number];
