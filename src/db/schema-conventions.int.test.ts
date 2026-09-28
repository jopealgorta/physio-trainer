import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";

// Guards for every later spec: see docs/architecture.md (tenancy rule 1, column conventions).
describe("schema conventions", () => {
  it("enables RLS on every public table", async () => {
    const rows = await db.execute<{ table_name: string }>(sql`
      select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows.map((row) => row.table_name)).toEqual([]);
  });

  it("attaches set_updated_at to every table with an updated_at column", async () => {
    const rows = await db.execute<{ table_name: string; has_trigger: boolean }>(sql`
      select c.table_name,
        exists (
          select 1
          from pg_trigger t
          join pg_class r on r.oid = t.tgrelid
          join pg_namespace n on n.oid = r.relnamespace
          join pg_proc p on p.oid = t.tgfoid
          where n.nspname = 'public'
            and r.relname = c.table_name
            and p.proname = 'set_updated_at'
            and not t.tgisinternal
        ) as has_trigger
      from information_schema.columns c
      where c.table_schema = 'public' and c.column_name = 'updated_at'`);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => !row.has_trigger).map((row) => row.table_name)).toEqual([]);
  });
});
