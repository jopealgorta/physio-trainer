import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import {
  customers,
  routines,
  routineVersions,
  weeklyPlans,
  weeklyPlanVersions,
  type NewRoutineVersion,
  type NewWeeklyPlanVersion,
} from "@/db/schema";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

const routineSnapshot = { schema: 1 } as unknown as NewRoutineVersion["snapshot"];
const planSnapshot = { schema: 1 } as unknown as NewWeeklyPlanVersion["snapshot"];

describe("version history tables (RLS)", () => {
  const created: TestPhysio[] = [];
  let a: TestPhysio;
  let b: TestPhysio;
  let routineId: string;
  let planId: string;

  const as = <T>(who: TestPhysio, fn: Parameters<typeof runAsPhysio<T>>[1]) =>
    runAsPhysio(who.claims, fn);

  const routineVersion = (version: number): NewRoutineVersion => ({
    physioId: a.id,
    routineId,
    version,
    kind: "created",
    snapshot: routineSnapshot,
  });
  const planVersion = (version: number): NewWeeklyPlanVersion => ({
    physioId: a.id,
    weeklyPlanId: planId,
    version,
    kind: "created",
    snapshot: planSnapshot,
  });

  beforeAll(async () => {
    a = await createTestPhysio({ onboarded: true });
    b = await createTestPhysio({ onboarded: true });
    created.push(a, b);
    const [c] = await db
      .insert(customers)
      .values({ physioId: a.id, firstName: "Ana", locale: "en" })
      .returning({ id: customers.id });
    const [r] = await db
      .insert(routines)
      .values({ physioId: a.id, customerId: c.id, name: "R" })
      .returning({ id: routines.id });
    routineId = r.id;
    const [p] = await db
      .insert(weeklyPlans)
      .values({ physioId: a.id, customerId: c.id, name: "P" })
      .returning({ id: weeklyPlans.id });
    planId = p.id;
  });
  afterAll(async () => {
    await deleteTestPhysios(...created);
  });

  it("lets the owner insert and read their versions", async () => {
    await as(a, (tx) => tx.insert(routineVersions).values(routineVersion(1)));
    await as(a, (tx) => tx.insert(weeklyPlanVersions).values(planVersion(1)));
    expect(await as(a, (tx) => tx.select().from(routineVersions))).toHaveLength(1);
    expect(await as(a, (tx) => tx.select().from(weeklyPlanVersions))).toHaveLength(1);
  });

  it("hides versions from other physios and blocks inserting as another physio", async () => {
    expect(await as(b, (tx) => tx.select().from(routineVersions))).toHaveLength(0);
    expect(await as(b, (tx) => tx.select().from(weeklyPlanVersions))).toHaveLength(0);
    await expect(
      as(b, (tx) => tx.insert(routineVersions).values(routineVersion(2))),
    ).rejects.toThrow();
    await expect(
      as(b, (tx) => tx.insert(weeklyPlanVersions).values(planVersion(2))),
    ).rejects.toThrow();
  });

  it("makes routine versions immutable and undeletable", async () => {
    const updated = await as(a, (tx) =>
      tx
        .update(routineVersions)
        .set({ kind: "edited" })
        .where(eq(routineVersions.routineId, routineId))
        .returning(),
    );
    expect(updated).toHaveLength(0);
    const deleted = await as(a, (tx) =>
      tx.delete(routineVersions).where(eq(routineVersions.routineId, routineId)).returning(),
    );
    expect(deleted).toHaveLength(0);
    const deletedPlans = await as(a, (tx) =>
      tx.delete(weeklyPlanVersions).where(eq(weeklyPlanVersions.weeklyPlanId, planId)).returning(),
    );
    expect(deletedPlans).toHaveLength(0);
  });

  it("lets only the owner update a plan version", async () => {
    const mine = await as(a, (tx) =>
      tx
        .update(weeklyPlanVersions)
        .set({ sessionId: null, summary: null })
        .where(and(eq(weeklyPlanVersions.weeklyPlanId, planId), eq(weeklyPlanVersions.version, 1)))
        .returning(),
    );
    expect(mine).toHaveLength(1);
    const theirs = await as(b, (tx) =>
      tx
        .update(weeklyPlanVersions)
        .set({ summary: null })
        .where(eq(weeklyPlanVersions.weeklyPlanId, planId))
        .returning(),
    );
    expect(theirs).toHaveLength(0);
  });

  it("rejects duplicate versions and inconsistent restored_from", async () => {
    await expect(
      as(a, (tx) => tx.insert(routineVersions).values(routineVersion(1))),
    ).rejects.toThrow();
    await expect(
      as(a, (tx) => tx.insert(routineVersions).values({ ...routineVersion(5), kind: "restored" })),
    ).rejects.toThrow();
    await expect(
      as(a, (tx) => tx.insert(routineVersions).values({ ...routineVersion(0) })),
    ).rejects.toThrow();
  });

  it("cascades when the routine or plan is deleted", async () => {
    await db.delete(routines).where(eq(routines.id, routineId));
    await db.delete(weeklyPlans).where(eq(weeklyPlans.id, planId));
    expect(
      await db.select().from(routineVersions).where(eq(routineVersions.routineId, routineId)),
    ).toHaveLength(0);
    expect(
      await db.select().from(weeklyPlanVersions).where(eq(weeklyPlanVersions.weeklyPlanId, planId)),
    ).toHaveLength(0);
  });
});
