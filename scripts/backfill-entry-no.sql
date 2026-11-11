-- Fills record.entry_no, the register's number of each entry, for records
-- imported while the column was gone (2026-10-22 to 2026-11-11): the number
-- is in the row kept as transcribed (record.raw, its "№" cell). A cell that
-- says nothing (empty, a dash, "утрачено") stays empty, as the imports
-- leave it (scripts/import-common.ts, `value`). Records that already have a
-- number keep it, so running this again changes nothing.
--
--   pnpm exec wrangler d1 execute DB --local --file scripts/backfill-entry-no.sql
--   pnpm exec wrangler d1 execute DB --remote --file scripts/backfill-entry-no.sql
UPDATE record
SET entry_no = trim(json_extract(raw, '$."№"'))
WHERE entry_no IS NULL
  AND json_valid(raw)
  AND json_type(raw) = 'object'
  AND trim(coalesce(json_extract(raw, '$."№"'), '')) NOT IN ('', '-', '—', 'утрачено', 'Утрачено');
