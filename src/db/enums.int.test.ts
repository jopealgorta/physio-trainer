import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { EXERCISE_MEDIA_KINDS } from "@/db/schema";
import { BODY_AREAS, BODY_SIDES } from "@/lib/body-areas";
import { PRESCRIPTION_SIDES } from "@/lib/prescription";

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

describe("library enums in Postgres", () => {
  it("match the canonical lists in order", async () => {
    const [row] = await db.execute<{ sides: string[]; kinds: string[] }>(sql`
      select enum_range(null::prescription_side)::text[] as sides,
             enum_range(null::exercise_media_kind)::text[] as kinds`);
    expect(row.sides).toEqual([...PRESCRIPTION_SIDES]);
    expect(row.kinds).toEqual([...EXERCISE_MEDIA_KINDS]);
  });
});
