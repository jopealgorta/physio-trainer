import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { isCheckViolation, isForeignKeyViolation } from "@/db/errors";
import { runAsPhysio } from "@/db/rls";
import { cases, customers, routines, weeklyPlanEntries, weeklyPlans } from "@/db/schema";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

const rejectsWith = (code: string) => ({ cause: expect.objectContaining({ code }) });

describe("weekly plan tables", () => {
  let a: TestPhysio;
  let b: TestPhysio;
  let aCustomer: string;
  let aCustomer2: string;
  let aCase: string;
  let aRoutine: string;
  let aPlan: string;
  let aEntry: string;
  let bCustomer: string;
  let bRoutine: string;

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
        .values({ physioId, customerId: aCustomer, title: "Knee" })
        .returning({ id: cases.id });
      [{ id: aRoutine }] = await tx
        .insert(routines)
        .values({ physioId, customerId: aCustomer, name: "Rehab A" })
        .returning({ id: routines.id });
      [{ id: aPlan }] = await tx
        .insert(weeklyPlans)
        .values({ physioId, customerId: aCustomer, caseId: aCase, name: "Week" })
        .returning({ id: weeklyPlans.id });
      [{ id: aEntry }] = await tx
        .insert(weeklyPlanEntries)
        .values({ physioId, weeklyPlanId: aPlan, weekday: 1, routineId: aRoutine, position: 0 })
        .returning({ id: weeklyPlanEntries.id });
    });
    await runAsPhysio(b.claims, async (tx, physioId) => {
      [{ id: bCustomer }] = await tx
        .insert(customers)
        .values({ physioId, firstName: "Bea", locale: "en" })
        .returning({ id: customers.id });
      [{ id: bRoutine }] = await tx
        .insert(routines)
        .values({ physioId, customerId: bCustomer, name: "B routine" })
        .returning({ id: routines.id });
    });
  });

  afterAll(() => deleteTestPhysios(a, b));

  it("RLS hides plans and entries from other physios", async () => {
    expect(await runAsPhysio(b.claims, (tx) => tx.select().from(weeklyPlans))).toEqual([]);
    expect(await runAsPhysio(b.claims, (tx) => tx.select().from(weeklyPlanEntries))).toEqual([]);
    const plans = await runAsPhysio(a.claims, (tx) => tx.select().from(weeklyPlans));
    expect(plans.map((row) => row.id)).toContain(aPlan);
    const entries = await runAsPhysio(a.claims, (tx) => tx.select().from(weeklyPlanEntries));
    expect(entries.map((row) => row.id)).toContain(aEntry);
  });

  it("RLS blocks updates and deletes of another physio's rows", async () => {
    const results = await runAsPhysio(b.claims, async (tx) => [
      await tx
        .update(weeklyPlans)
        .set({ name: "Hijacked" })
        .where(eq(weeklyPlans.id, aPlan))
        .returning(),
      await tx
        .update(weeklyPlanEntries)
        .set({ weekday: 2 })
        .where(eq(weeklyPlanEntries.id, aEntry))
        .returning(),
      await tx.delete(weeklyPlanEntries).where(eq(weeklyPlanEntries.id, aEntry)).returning(),
      await tx.delete(weeklyPlans).where(eq(weeklyPlans.id, aPlan)).returning(),
    ]);
    expect(results).toEqual([[], [], [], []]);
  });

  it("RLS blocks inserting rows owned by someone else", async () => {
    await expect(
      runAsPhysio(b.claims, (tx) =>
        tx.insert(weeklyPlans).values({ physioId: a.id, customerId: aCustomer, name: "Planted" }),
      ),
    ).rejects.toMatchObject(rejectsWith("42501"));
    await expect(
      runAsPhysio(b.claims, (tx) =>
        tx.insert(weeklyPlanEntries).values({
          physioId: a.id,
          weeklyPlanId: aPlan,
          weekday: 3,
          routineId: aRoutine,
          position: 0,
        }),
      ),
    ).rejects.toMatchObject(rejectsWith("42501"));
  });

  describe("composite foreign keys", () => {
    it("rejects a plan for another physio's customer", async () => {
      await expect(
        db.insert(weeklyPlans).values({ physioId: b.id, customerId: aCustomer, name: "Sneaky" }),
      ).rejects.toSatisfy((error) => isForeignKeyViolation(error, "weekly_plans_customer_fk"));
    });

    it("rejects an entry pointing at another physio's routine or plan", async () => {
      await expect(
        db.insert(weeklyPlanEntries).values({
          physioId: a.id,
          weeklyPlanId: aPlan,
          weekday: 2,
          routineId: bRoutine,
          position: 0,
        }),
      ).rejects.toSatisfy((error) =>
        isForeignKeyViolation(error, "weekly_plan_entries_routine_fk"),
      );
      await expect(
        db.insert(weeklyPlanEntries).values({
          physioId: b.id,
          weeklyPlanId: aPlan,
          weekday: 2,
          routineId: bRoutine,
          position: 0,
        }),
      ).rejects.toSatisfy((error) => isForeignKeyViolation(error, "weekly_plan_entries_plan_fk"));
    });

    it("rejects a case of a different customer, and a case without a customer", async () => {
      await expect(
        db
          .insert(weeklyPlans)
          .values({ physioId: a.id, customerId: aCustomer2, caseId: aCase, name: "Mismatch" }),
      ).rejects.toSatisfy((error) => isForeignKeyViolation(error, "weekly_plans_case_fk"));
      await expect(
        db
          .insert(weeklyPlans)
          .values({ physioId: a.id, customerId: null, caseId: aCase, name: "T" }),
      ).rejects.toSatisfy(
        (error) =>
          isCheckViolation(error, "weekly_plans_case_needs_customer") ||
          isForeignKeyViolation(error, "weekly_plans_case_fk"),
      );
    });

    it("deleting the case clears only case_id", async () => {
      const [kase] = await db
        .insert(cases)
        .values({ physioId: a.id, customerId: aCustomer, title: "Temp" })
        .returning();
      const [plan] = await db
        .insert(weeklyPlans)
        .values({ physioId: a.id, customerId: aCustomer, caseId: kase.id, name: "Linked" })
        .returning();
      await db.delete(cases).where(eq(cases.id, kase.id));
      const [after] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, plan.id));
      expect(after).toMatchObject({ caseId: null, physioId: a.id, customerId: aCustomer });
    });
  });

  describe("constraints", () => {
    const entry = (overrides: Record<string, unknown>) => ({
      physioId: a.id,
      weeklyPlanId: aPlan,
      weekday: 2,
      routineId: aRoutine,
      position: 0,
      ...overrides,
    });

    it.each([0, 8])("rejects weekday %i", async (weekday) => {
      await expect(db.insert(weeklyPlanEntries).values(entry({ weekday }))).rejects.toSatisfy(
        (error) => isCheckViolation(error, "weekly_plan_entries_weekday"),
      );
    });

    it("rejects a negative position and a blank or over-long label", async () => {
      await expect(db.insert(weeklyPlanEntries).values(entry({ position: -1 }))).rejects.toSatisfy(
        (error) => isCheckViolation(error, "weekly_plan_entries_position"),
      );
      await expect(db.insert(weeklyPlanEntries).values(entry({ label: "" }))).rejects.toSatisfy(
        (error) => isCheckViolation(error, "weekly_plan_entries_label_length"),
      );
      await expect(
        db.insert(weeklyPlanEntries).values(entry({ label: "x".repeat(41) })),
      ).rejects.toSatisfy((error) => isCheckViolation(error, "weekly_plan_entries_label_length"));
    });

    it("rejects a blank plan name", async () => {
      await expect(
        db.insert(weeklyPlans).values({ physioId: a.id, customerId: aCustomer, name: "" }),
      ).rejects.toSatisfy((error) => isCheckViolation(error, "weekly_plans_name_length"));
    });
  });

  describe("deletes", () => {
    it("restricts deleting a routine that a plan uses", async () => {
      await expect(db.delete(routines).where(eq(routines.id, aRoutine))).rejects.toSatisfy(
        (error) => isForeignKeyViolation(error, "weekly_plan_entries_routine_fk"),
      );
    });

    it("deleting a plan deletes its entries; deleting a customer deletes its plans", async () => {
      const [customer] = await db
        .insert(customers)
        .values({ physioId: a.id, firstName: "Temp", locale: "en" })
        .returning();
      const [routine] = await db
        .insert(routines)
        .values({ physioId: a.id, customerId: customer.id, name: "R" })
        .returning();
      const [plan] = await db
        .insert(weeklyPlans)
        .values({ physioId: a.id, customerId: customer.id, name: "P" })
        .returning();
      await db.insert(weeklyPlanEntries).values({
        physioId: a.id,
        weeklyPlanId: plan.id,
        weekday: 1,
        routineId: routine.id,
        position: 0,
      });
      await db.delete(weeklyPlans).where(eq(weeklyPlans.id, plan.id));
      expect(
        await db
          .select()
          .from(weeklyPlanEntries)
          .where(eq(weeklyPlanEntries.weeklyPlanId, plan.id)),
      ).toEqual([]);

      const [plan2] = await db
        .insert(weeklyPlans)
        .values({ physioId: a.id, customerId: customer.id, name: "P2" })
        .returning();
      await db.delete(routines).where(eq(routines.id, routine.id));
      await db.delete(customers).where(eq(customers.id, customer.id));
      expect(await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, plan2.id))).toEqual([]);
    });
  });

  it("updated_at moves on update", async () => {
    const [before] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, aPlan));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await db.update(weeklyPlans).set({ notes: "x" }).where(eq(weeklyPlans.id, aPlan));
    const [after] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, aPlan));
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });
});
