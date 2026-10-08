import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { isForeignKeyViolation } from "@/db/errors";
import { runAsPhysio } from "@/db/rls";
import { customers, physios, routineItems, routineSections, routines } from "@/db/schema";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";
import { insertCustomer, insertExercise, insertRoutine } from "@/test/int/content";

/** The re-run backfill that precedes `section_id` becoming NOT NULL (the whole migration file). */
function rebackfillSql(): string {
  const dir = path.join(process.cwd(), "supabase/migrations");
  const file = readdirSync(dir).find((name) => name.endsWith("_routine-sections-rebackfill.sql"));
  if (!file) throw new Error("routine-sections-rebackfill migration not found");
  return readFileSync(path.join(dir, file), "utf8");
}

describe("routine sections", () => {
  let a: TestPhysio;
  let b: TestPhysio;
  let routineA: string;
  let routineA2: string;
  let sectionA: string;
  let exerciseA: string;

  beforeAll(async () => {
    a = await createTestPhysio({ onboarded: true });
    b = await createTestPhysio({ onboarded: true });
    const customer = await insertCustomer(a.id);
    exerciseA = await insertExercise(a.id);
    routineA = await insertRoutine(a.id, customer, { items: [{ exerciseId: exerciseA }] });
    routineA2 = await insertRoutine(a.id, customer, { items: [{ exerciseId: exerciseA }] });
    const [section] = await db
      .select({ id: routineSections.id })
      .from(routineSections)
      .where(eq(routineSections.routineId, routineA));
    sectionA = section!.id;
  });
  afterAll(async () => {
    await deleteTestPhysios(a, b);
  });

  it("fixtures create one Main section holding every item", async () => {
    const sections = await db
      .select()
      .from(routineSections)
      .where(eq(routineSections.routineId, routineA));
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ name: "Main", position: 0 });
    const items = await db.select().from(routineItems).where(eq(routineItems.routineId, routineA));
    expect(items.map((i) => i.sectionId)).toEqual([sectionA]);
  });

  it("hides another physio's sections and rejects writes", async () => {
    const seen = await runAsPhysio(b.claims, (tx) => tx.select().from(routineSections));
    expect(seen.filter((s) => s.routineId === routineA)).toEqual([]);

    await expect(
      runAsPhysio(b.claims, (tx) =>
        tx.insert(routineSections).values({
          physioId: a.id,
          routineId: routineA,
          name: "Evil",
          position: 5,
        }),
      ),
    ).rejects.toThrow();

    const updated = await runAsPhysio(b.claims, (tx) =>
      tx
        .update(routineSections)
        .set({ name: "Hacked" })
        .where(eq(routineSections.id, sectionA))
        .returning(),
    );
    expect(updated).toEqual([]);
    const deleted = await runAsPhysio(b.claims, (tx) =>
      tx.delete(routineSections).where(eq(routineSections.id, sectionA)).returning(),
    );
    expect(deleted).toEqual([]);
    const [still] = await db.select().from(routineSections).where(eq(routineSections.id, sectionA));
    expect(still?.name).toBe("Main");
  });

  it("lets the owner manage their sections", async () => {
    const rows = await runAsPhysio(a.claims, async (tx) => {
      await tx
        .insert(routineSections)
        .values({ physioId: a.id, routineId: routineA, name: "Cool-down", position: 1 });
      return tx.select().from(routineSections).where(eq(routineSections.routineId, routineA));
    });
    expect(rows.map((r) => r.name).sort()).toEqual(["Cool-down", "Main"]);
  });

  it("rejects an item pointing at another routine's section", async () => {
    const [item] = await db
      .select({ id: routineItems.id })
      .from(routineItems)
      .where(eq(routineItems.routineId, routineA2));
    const error = await db
      .update(routineItems)
      .set({ sectionId: sectionA })
      .where(eq(routineItems.id, item!.id))
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isForeignKeyViolation(error, "routine_items_section_fk")).toBe(true);
  });

  it("enforces position and name checks", async () => {
    await expect(
      db
        .insert(routineSections)
        .values({ physioId: a.id, routineId: routineA, name: "x", position: -1 }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(routineSections)
        .values({ physioId: a.id, routineId: routineA, name: "", position: 7 }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(routineSections)
        .values({ physioId: a.id, routineId: routineA, name: "x".repeat(61), position: 8 }),
    ).rejects.toThrow();
  });

  it("requires every item to have a section", async () => {
    const error = await db
      .execute(
        sql`insert into routine_items (physio_id, routine_id, exercise_id, position, section_id)
            values (${a.id}, ${routineA}, ${exerciseA}, 99, null)`,
      )
      .then(
        () => null,
        (e: unknown) => e,
      );
    // 23502: not_null_violation (Drizzle wraps the Postgres error in `cause`).
    expect((error as { cause?: { code?: string } } | null)?.cause?.code).toBe("23502");
  });

  it("re-run backfill gives every routine without sections one localized section", async () => {
    const es = await createTestPhysio({ onboarded: true });
    const en = await createTestPhysio({ onboarded: true });
    // The backfill's statements are global: run them in a transaction that rolls back, so they
    // never touch (or lock for long) the rows of integration files running in parallel.
    const rollback = new Error("rollback");
    try {
      await db
        .transaction(async (tx) => {
          await tx.update(physios).set({ locale: "es" }).where(eq(physios.id, es.id));
          const made: { routineId: string; name: string }[] = [];
          for (const [who, name] of [
            [es, "Principal"],
            [en, "Main"],
          ] as const) {
            // A routine the previous app version created: no sections.
            const [customer] = await tx
              .insert(customers)
              .values({ physioId: who.id, firstName: "Ana", locale: "en" })
              .returning({ id: customers.id });
            const [routine] = await tx
              .insert(routines)
              .values({ physioId: who.id, customerId: customer!.id, name: "Legacy" })
              .returning({ id: routines.id });
            made.push({ routineId: routine!.id, name });
          }

          await tx.execute(sql.raw(rebackfillSql()));

          for (const m of made) {
            const sections = await tx
              .select()
              .from(routineSections)
              .where(eq(routineSections.routineId, m.routineId));
            expect(sections).toHaveLength(1);
            expect(sections[0]).toMatchObject({ name: m.name, position: 0 });
          }

          // Idempotent: running again adds nothing.
          await tx.execute(sql.raw(rebackfillSql()));
          for (const m of made) {
            const sections = await tx
              .select()
              .from(routineSections)
              .where(eq(routineSections.routineId, m.routineId));
            expect(sections).toHaveLength(1);
          }
          throw rollback;
        })
        .catch((error: unknown) => {
          if (error !== rollback) throw error;
        });
    } finally {
      await deleteTestPhysios(es, en);
    }
  });
});
