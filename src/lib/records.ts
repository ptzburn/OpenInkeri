// The records pages' data: server functions ('use server') behind router
// queries, like ./users.ts. Records are for signed-in users: a signed-out
// visitor is redirected to sign-in, which also makes the read the page's
// guard.
import { query } from '@solidjs/router';
import { getRequestEvent, redirect } from '@solidjs/web';
import { sql } from 'drizzle-orm';

import { foldForSearch } from '~/lib/search-text';
import { paths } from '~/router';
import { db } from '~/server/database';
import { record } from '~/server/database/schema';

export const RECORDS_PAGE_SIZE = 50;

function signedIn() {
  const user = getRequestEvent()?.locals.user;
  if (!user) throw redirect(paths['sign-in']());
  return user;
}

/**
 * One page of records in register order, optionally narrowed to those whose
 * names or village contain `search` (case-insensitive, ё = е). `page` counts
 * from 1 and is clamped to the pages there are.
 */
export const getRecords = query(async (search: string, page: number) => {
  'use server';
  signedIn();
  const folded = foldForSearch(search);
  // %, _ and \ in the search are literal characters, not patterns.
  const pattern = `%${folded.replace(/[\\%_]/g, '\\$&')}%`;
  // The relational query aliases its tables, so the filter takes the table
  // it is applied to.
  const matches = (table: typeof record) => sql`${table.searchText} like ${pattern} escape '\\'`;

  const total = await db.$count(record, folded ? matches(record) : undefined);
  const pages = Math.max(1, Math.ceil(total / RECORDS_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);

  const rows = await db.query.record.findMany({
    ...(folded && { where: { RAW: matches } }),
    orderBy: { id: 'asc' },
    limit: RECORDS_PAGE_SIZE,
    offset: (current - 1) * RECORDS_PAGE_SIZE,
    columns: { id: true, entryNo: true, status: true, date: true, placeText: true, note: true },
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
    total,
    page: current,
    pages,
    records: rows.map((r) => ({
      id: r.id,
      entryNo: r.entryNo,
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
