import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { BODY_AREAS, BODY_SIDES } from "@/lib/body-areas";

// Proves the generated migration matches the TS lists (spec 02 acceptance criterion).
describe("body enums in Postgres", () => {
  it("match the canonical lists in order", async () => {
    const [row] = await db.execute<{ areas: string[]; sides: string[] }>(sql`
      select enum_range(null::body_area)::text[] as areas,
             enum_range(null::body_side)::text[] as sides`);
    expect(row.areas).toEqual([...BODY_AREAS]);
    expect(row.sides).toEqual([...BODY_SIDES]);
  });
});
