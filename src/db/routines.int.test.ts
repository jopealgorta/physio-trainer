import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { isCheckViolation, isForeignKeyViolation } from "@/db/errors";
import { runAsPhysio } from "@/db/rls";
import {
  cases,
  customers,
  exercises,
  routineGroups,
  routineSections,
  routineItems,
  routineItemSets,
  routines,
} from "@/db/schema";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

const rejectsWith = (code: string, constraint_name?: string) => ({
  cause: expect.objectContaining(constraint_name ? { code, constraint_name } : { code }),
});

const wait = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("routines tables", () => {
  let a: TestPhysio;
  let b: TestPhysio;
  let aCustomer: string;
  let aCustomer2: string;
  let aCase: string;
  let aExercise: string;
  let aRoutine: string;
  let aGroup: string;
  let aSection: string;
  let aItem: string;
  let aItem2: string;
  let aSet: string;
  let bCustomer: string;
  let bExercise: string;

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTestPhysio({ onboarded: true }),
      createTestPhysio({ onboarded: true }),
    ]);
    await runAsPhysio(a.claims, async (tx, physioId) => {
      [{ id: aCustomer }, { id: aCustomer2 }] = await tx
        .insert(customers)
        .values([
          { physioId, firstName: "Ana", locale: "es" },
          { physioId, firstName: "Ivo", locale: "es" },
        ])
        .returning({ id: customers.id });
      [{ id: aCase }] = await tx
        .insert(cases)
        .values({ physioId, customerId: aCustomer, title: "Knee sprain" })
        .returning({ id: cases.id });
      [{ id: aExercise }] = await tx
        .insert(exercises)
        .values({ physioId, name: "Bridge" })
        .returning({ id: exercises.id });
      [{ id: aRoutine }] = await tx
        .insert(routines)
        .values({ physioId, customerId: aCustomer, caseId: aCase, name: "Week 1" })
        .returning({ id: routines.id });
      [{ id: aGroup }] = await tx
        .insert(routineGroups)
        .values({ physioId, routineId: aRoutine, restSeconds: 60 })
        .returning({ id: routineGroups.id });
      [{ id: aSection }] = await tx
        .insert(routineSections)
        .values({ physioId, routineId: aRoutine, name: "Main", position: 0 })
        .returning({ id: routineSections.id });
      [{ id: aItem }, { id: aItem2 }] = await tx
        .insert(routineItems)
        .values([
          {
            physioId,
            routineId: aRoutine,
            exerciseId: aExercise,
            position: 0,
            groupId: aGroup,
            sectionId: aSection,
          },
          {
            physioId,
            routineId: aRoutine,
            exerciseId: aExercise,
            position: 1,
            restSeconds: 30,
            sectionId: aSection,
          },
        ])
        .returning({ id: routineItems.id });
      [{ id: aSet }] = await tx
        .insert(routineItemSets)
        .values({ physioId, routineItemId: aItem, position: 0, reps: 10, load: "5 kg" })
        .returning({ id: routineItemSets.id });
    });
    await runAsPhysio(b.claims, async (tx, physioId) => {
      [{ id: bCustomer }] = await tx
        .insert(customers)
        .values({ physioId, firstName: "Bea", locale: "en" })
        .returning({ id: customers.id });
      [{ id: bExercise }] = await tx
        .insert(exercises)
        .values({ physioId, name: "Squat" })
        .returning({ id: exercises.id });
    });
  });

  afterAll(() => deleteTestPhysios(a, b));

  const tables = () =>
    [
      ["routines", routines, () => aRoutine],
      ["routine_groups", routineGroups, () => aGroup],
      ["routine_items", routineItems, () => aItem],
      ["routine_item_sets", routineItemSets, () => aSet],
    ] as const;

  it.each([0, 1, 2, 3])("RLS hides table %#'s rows from other physios", async (index) => {
    const [, table, seeded] = tables()[index];
    expect(await runAsPhysio(b.claims, (tx) => tx.select().from(table))).toEqual([]);
    const visibleToA = await runAsPhysio(a.claims, (tx) => tx.select({ id: table.id }).from(table));
    expect(visibleToA.map((row) => row.id)).toContain(seeded());
  });

  it("RLS blocks updates and deletes of another physio's rows", async () => {
    const results = await runAsPhysio(b.claims, async (tx) => [
      await tx
        .update(routines)
        .set({ name: "Hijacked" })
        .where(eq(routines.id, aRoutine))
        .returning(),
      await tx
        .update(routineGroups)
        .set({ restSeconds: 5 })
        .where(eq(routineGroups.id, aGroup))
        .returning(),
      await tx
        .update(routineItems)
        .set({ notes: "Hijacked" })
        .where(eq(routineItems.id, aItem))
        .returning(),
      await tx
        .update(routineItemSets)
        .set({ reps: 1 })
        .where(eq(routineItemSets.id, aSet))
        .returning(),
      await tx.delete(routineItemSets).where(eq(routineItemSets.id, aSet)).returning(),
      await tx.delete(routineItems).where(eq(routineItems.id, aItem)).returning(),
      await tx.delete(routineGroups).where(eq(routineGroups.id, aGroup)).returning(),
      await tx.delete(routines).where(eq(routines.id, aRoutine)).returning(),
    ]);
    expect(results).toEqual([[], [], [], [], [], [], [], []]);
  });

  it("RLS blocks inserting rows owned by someone else", async () => {
    const attempts = [
      (tx: Parameters<Parameters<typeof runAsPhysio>[1]>[0]) =>
        tx.insert(routines).values({ physioId: a.id, customerId: aCustomer, name: "Planted" }),
      (tx: Parameters<Parameters<typeof runAsPhysio>[1]>[0]) =>
        tx.insert(routineGroups).values({ physioId: a.id, routineId: aRoutine }),
      (tx: Parameters<Parameters<typeof runAsPhysio>[1]>[0]) =>
        tx.insert(routineItems).values({
          physioId: a.id,
          routineId: aRoutine,
          exerciseId: aExercise,
          position: 9,
          sectionId: aSection,
        }),
      (tx: Parameters<Parameters<typeof runAsPhysio>[1]>[0]) =>
        tx.insert(routineItemSets).values({ physioId: a.id, routineItemId: aItem, position: 9 }),
    ];
    for (const attempt of attempts) {
      await expect(runAsPhysio(b.claims, attempt)).rejects.toMatchObject(rejectsWith("42501"));
    }
  });

  describe("composite foreign keys", () => {
    it("rejects a routine for another physio's customer", async () => {
      await expect(
        db.insert(routines).values({ physioId: b.id, customerId: aCustomer, name: "Sneaky" }),
      ).rejects.toSatisfy((error) => isForeignKeyViolation(error, "routines_customer_fk"));
    });

    it("rejects an item pointing at another physio's exercise", async () => {
      await expect(
        db.insert(routineItems).values({
          physioId: a.id,
          routineId: aRoutine,
          exerciseId: bExercise,
          position: 5,
          sectionId: aSection,
        }),
      ).rejects.toSatisfy((error) => isForeignKeyViolation(error, "routine_items_exercise_fk"));
    });

    it("rejects an item whose group belongs to another routine", async () => {
      const [other] = await db
        .insert(routines)
        .values({ physioId: a.id, customerId: aCustomer, name: "Other" })
        .returning();
      const [otherSection] = await db
        .insert(routineSections)
        .values({ physioId: a.id, routineId: other.id, name: "Main", position: 0 })
        .returning();
      await expect(
        db.insert(routineItems).values({
          physioId: a.id,
          routineId: other.id,
          exerciseId: aExercise,
          position: 0,
          groupId: aGroup,
          sectionId: otherSection.id,
        }),
      ).rejects.toSatisfy((error) => isForeignKeyViolation(error, "routine_items_group_fk"));
    });

    it("rejects a group, item or set pointing at another physio's parent", async () => {
      await expect(
        db.insert(routineGroups).values({ physioId: b.id, routineId: aRoutine }),
      ).rejects.toSatisfy((error) => isForeignKeyViolation(error, "routine_groups_routine_fk"));
      await expect(
        db.insert(routineItems).values({
          physioId: b.id,
          routineId: aRoutine,
          exerciseId: bExercise,
          position: 7,
          sectionId: aSection,
        }),
      ).rejects.toSatisfy((error) => isForeignKeyViolation(error, "routine_items_routine_fk"));
      await expect(
        db.insert(routineItemSets).values({ physioId: b.id, routineItemId: aItem, position: 7 }),
      ).rejects.toSatisfy((error) => isForeignKeyViolation(error, "routine_item_sets_item_fk"));
    });

    it("rejects a customer that belongs to another physio even when the case fits", async () => {
      await expect(
        db
          .insert(routines)
          .values({ physioId: b.id, customerId: bCustomer, caseId: aCase, name: "X" }),
      ).rejects.toSatisfy((error) => isForeignKeyViolation(error, "routines_case_fk"));
    });
  });

  describe("case must belong to the customer", () => {
    it("rejects a case of a different customer of the same physio", async () => {
      await expect(
        db
          .insert(routines)
          .values({ physioId: a.id, customerId: aCustomer2, caseId: aCase, name: "Mismatch" }),
      ).rejects.toSatisfy((error) => isForeignKeyViolation(error, "routines_case_fk"));
    });

    it("deleting the case clears only case_id", async () => {
      const [kase] = await db
        .insert(cases)
        .values({ physioId: a.id, customerId: aCustomer, title: "Temp case" })
        .returning();
      const [routine] = await db
        .insert(routines)
        .values({ physioId: a.id, customerId: aCustomer, caseId: kase.id, name: "Linked" })
        .returning();
      await db.delete(cases).where(eq(cases.id, kase.id));
      const [after] = await db.select().from(routines).where(eq(routines.id, routine.id));
      expect(after).toMatchObject({ caseId: null, physioId: a.id, customerId: aCustomer });
    });
  });

  it("restricts deleting an exercise used by an item", async () => {
    await expect(db.delete(exercises).where(eq(exercises.id, aExercise))).rejects.toSatisfy(
      (error) => isForeignKeyViolation(error, "routine_items_exercise_fk"),
    );
  });

  describe("cascades", () => {
    it("deleting a routine deletes its groups, items and sets", async () => {
      const [routine] = await db
        .insert(routines)
        .values({ physioId: a.id, customerId: aCustomer, name: "Cascade" })
        .returning();
      const [group] = await db
        .insert(routineGroups)
        .values({ physioId: a.id, routineId: routine.id })
        .returning();
      const [section] = await db
        .insert(routineSections)
        .values({ physioId: a.id, routineId: routine.id, name: "Main", position: 0 })
        .returning();
      const [item] = await db
        .insert(routineItems)
        .values({
          physioId: a.id,
          routineId: routine.id,
          exerciseId: aExercise,
          position: 0,
          groupId: group.id,
          sectionId: section.id,
        })
        .returning();
      await db
        .insert(routineItemSets)
        .values({ physioId: a.id, routineItemId: item.id, position: 0 });
      await db.delete(routines).where(eq(routines.id, routine.id));
      expect(await db.select().from(routineGroups).where(eq(routineGroups.id, group.id))).toEqual(
        [],
      );
      expect(await db.select().from(routineItems).where(eq(routineItems.id, item.id))).toEqual([]);
      expect(
        await db.select().from(routineItemSets).where(eq(routineItemSets.routineItemId, item.id)),
      ).toEqual([]);
    });

    it("deleting a customer deletes their routines", async () => {
      const [customer] = await db
        .insert(customers)
        .values({ physioId: a.id, firstName: "Temp", locale: "en" })
        .returning();
      const [routine] = await db
        .insert(routines)
        .values({ physioId: a.id, customerId: customer.id, name: "Doomed" })
        .returning();
      await db.delete(customers).where(eq(customers.id, customer.id));
      expect(await db.select().from(routines).where(eq(routines.id, routine.id))).toEqual([]);
    });
  });

  describe("checks", () => {
    const routineValues = () => ({ physioId: a.id, customerId: aCustomer, name: "Check" });
    it.each([
      ["empty name", { name: "" }, "routines_name_length"],
      ["81-char name", { name: "x".repeat(81) }, "routines_name_length"],
      ["notes over the limit", { notes: "x".repeat(2001) }, "routines_notes_length"],
      ["0 sessions per week", { sessionsPerWeek: 0 }, "routines_sessions_per_week"],
      ["15 sessions per week", { sessionsPerWeek: 15 }, "routines_sessions_per_week"],
      ["6 sessions per day", { sessionsPerDay: 6 }, "routines_sessions_per_day"],
      ["version 0", { version: 0 }, "routines_version_positive"],
    ])("rejects a routine with %s", async (_label, values, constraint) => {
      await expect(db.insert(routines).values({ ...routineValues(), ...values })).rejects.toSatisfy(
        (error) => isCheckViolation(error, constraint),
      );
    });

    it("accepts the boundary values", async () => {
      const rows = await db
        .insert(routines)
        .values([
          { ...routineValues(), name: "x".repeat(80), sessionsPerWeek: 14, sessionsPerDay: 5 },
          { ...routineValues(), sessionsPerWeek: 1, sessionsPerDay: 1 },
        ])
        .returning();
      expect(rows).toHaveLength(2);
    });

    const itemValues = (position: number) => ({
      physioId: a.id,
      routineId: aRoutine,
      exerciseId: aExercise,
      position,
      sectionId: aSection,
    });
    it("rejects rest on a grouped item and a negative position", async () => {
      await expect(
        db.insert(routineItems).values({ ...itemValues(20), groupId: aGroup, restSeconds: 30 }),
      ).rejects.toSatisfy((error) => isCheckViolation(error, "routine_items_group_no_rest"));
      await expect(db.insert(routineItems).values(itemValues(-1))).rejects.toSatisfy((error) =>
        isCheckViolation(error, "routine_items_position"),
      );
    });

    it("rejects out-of-range item prescription", async () => {
      await expect(
        db.insert(routineItems).values({ ...itemValues(21), holdSeconds: 0 }),
      ).rejects.toSatisfy((error) => isCheckViolation(error, "routine_items_hold_seconds_range"));
      await expect(
        db.insert(routineItems).values({ ...itemValues(22), notes: "x".repeat(501) }),
      ).rejects.toSatisfy((error) => isCheckViolation(error, "routine_items_notes_length"));
    });

    it("rejects an out-of-range group rest", async () => {
      await expect(
        db.insert(routineGroups).values({ physioId: a.id, routineId: aRoutine, restSeconds: 0 }),
      ).rejects.toSatisfy((error) => isCheckViolation(error, "routine_groups_rest_seconds_range"));
    });

    const setValues = (position: number) => ({
      physioId: a.id,
      routineItemId: aItem2,
      position,
    });
    it.each([
      ["reps_max equal to reps", { reps: 10, repsMax: 10 }, "routine_item_sets_reps_range_order"],
      ["reps_max below reps", { reps: 10, repsMax: 8 }, "routine_item_sets_reps_range_order"],
      ["reps_max without reps", { repsMax: 12 }, "routine_item_sets_reps_range_order"],
      ["load of 41 chars", { load: "x".repeat(41) }, "routine_item_sets_load_length"],
      ["reps 0", { reps: 0 }, "routine_item_sets_reps_range"],
      ["duration 0", { durationSeconds: 0 }, "routine_item_sets_duration_seconds_range"],
    ])("rejects a set with %s", async (_label, values, constraint) => {
      await expect(
        db.insert(routineItemSets).values({ ...setValues(0), ...values }),
      ).rejects.toSatisfy((error) => isCheckViolation(error, constraint));
    });

    it("rejects set positions outside 0-19", async () => {
      await expect(db.insert(routineItemSets).values(setValues(20))).rejects.toSatisfy((error) =>
        isCheckViolation(error, "routine_item_sets_position"),
      );
    });

    it("rejects duplicate positions", async () => {
      await expect(db.insert(routineItems).values(itemValues(0))).rejects.toMatchObject(
        rejectsWith("23505", "routine_items_position_unique"),
      );
      await expect(
        db.insert(routineItemSets).values({ physioId: a.id, routineItemId: aItem, position: 0 }),
      ).rejects.toMatchObject(rejectsWith("23505", "routine_item_sets_position_unique"));
    });
  });

  it("advances updated_at on update for all four tables", async () => {
    const { routine, group, item, set } = await runAsPhysio(a.claims, async (tx, physioId) => {
      const [routine] = await tx
        .insert(routines)
        .values({ physioId, customerId: aCustomer, name: "Clock" })
        .returning();
      const [group] = await tx
        .insert(routineGroups)
        .values({ physioId, routineId: routine.id })
        .returning();
      const [section] = await tx
        .insert(routineSections)
        .values({ physioId, routineId: routine.id, name: "Main", position: 0 })
        .returning();
      const [item] = await tx
        .insert(routineItems)
        .values({
          physioId,
          routineId: routine.id,
          exerciseId: aExercise,
          position: 0,
          sectionId: section.id,
        })
        .returning();
      const [set] = await tx
        .insert(routineItemSets)
        .values({ physioId, routineItemId: item.id, position: 0 })
        .returning();
      return { routine, group, item, set };
    });
    await wait();
    const after = await runAsPhysio(a.claims, async (tx) => ({
      routine: (
        await tx.update(routines).set({ notes: "n" }).where(eq(routines.id, routine.id)).returning()
      )[0],
      group: (
        await tx
          .update(routineGroups)
          .set({ restSeconds: 20 })
          .where(eq(routineGroups.id, group.id))
          .returning()
      )[0],
      item: (
        await tx
          .update(routineItems)
          .set({ notes: "n" })
          .where(eq(routineItems.id, item.id))
          .returning()
      )[0],
      set: (
        await tx
          .update(routineItemSets)
          .set({ reps: 5 })
          .where(eq(routineItemSets.id, set.id))
          .returning()
      )[0],
    }));
    expect(after.routine.updatedAt.getTime()).toBeGreaterThan(routine.updatedAt.getTime());
    expect(after.group.updatedAt.getTime()).toBeGreaterThan(group.updatedAt.getTime());
    expect(after.item.updatedAt.getTime()).toBeGreaterThan(item.updatedAt.getTime());
    expect(after.set.updatedAt.getTime()).toBeGreaterThan(set.updatedAt.getTime());
  });

  it("defaults a new routine to a standalone draft at version 1", async () => {
    const [row] = await db.select().from(routines).where(eq(routines.id, aRoutine));
    expect(row).toMatchObject({ isStandalone: true, status: "draft", version: 1 });
  });
});
