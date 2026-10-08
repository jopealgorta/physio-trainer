import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { physios, routineItems, routineSections } from "@/db/schema";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";
import { insertCustomer, insertExercise, insertRoutine } from "@/test/int/content";

const BACKFILL_MARKER = "-- backfill";

function backfillSql(): string {
  const dir = path.join(process.cwd(), "supabase/migrations");
  const file = readdirSync(dir).find((name) => name.endsWith("_routine-sections-extras.sql"));
  if (!file) throw new Error("routine-sections-extras migration not found");
  const text = readFileSync(path.join(dir, file), "utf8");
  const at = text.indexOf(BACKFILL_MARKER);
  if (at < 0) throw new Error("backfill marker missing");
  return text.slice(at);
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
    await expect(
      db
        .update(routineItems)
        .set({ sectionId: sectionA })
        .where(and(eq(routineItems.id, item!.id))),
    ).rejects.toThrow();
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

  it("backfill gives every legacy routine one localized section", async () => {
    const es = await createTestPhysio({ onboarded: true });
    const en = await createTestPhysio({ onboarded: true });
    try {
      await db.update(physios).set({ locale: "es" }).where(eq(physios.id, es.id));
      const made: { physioId: string; routineId: string; itemId: string; name: string }[] = [];
      for (const [who, name] of [
        [es, "Principal"],
        [en, "Main"],
      ] as const) {
        const customer = await insertCustomer(who.id);
        const exercise = await insertExercise(who.id);
        const routineId = await insertRoutine(who.id, customer, {
          items: [{ exerciseId: exercise }],
        });
        // Simulate a pre-migration routine: no sections, items without section.
        await db
          .update(routineItems)
          .set({ sectionId: null })
          .where(eq(routineItems.routineId, routineId));
        await db.delete(routineSections).where(eq(routineSections.routineId, routineId));
        const [it] = await db
          .select({ id: routineItems.id })
          .from(routineItems)
          .where(eq(routineItems.routineId, routineId));
        made.push({ physioId: who.id, routineId, itemId: it!.id, name });
      }

      await db.execute(sql.raw(backfillSql()));

      for (const m of made) {
        const sections = await db
          .select()
          .from(routineSections)
          .where(eq(routineSections.routineId, m.routineId));
        expect(sections).toHaveLength(1);
        expect(sections[0]).toMatchObject({ name: m.name, position: 0 });
        const [item] = await db.select().from(routineItems).where(eq(routineItems.id, m.itemId));
        expect(item?.sectionId).toBe(sections[0]!.id);
      }

      // Idempotent: running again adds nothing.
      await db.execute(sql.raw(backfillSql()));
      for (const m of made) {
        const sections = await db
          .select()
          .from(routineSections)
          .where(eq(routineSections.routineId, m.routineId));
        expect(sections).toHaveLength(1);
      }
    } finally {
      await deleteTestPhysios(es, en);
    }
  });
});
