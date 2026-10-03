import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { exerciseLogs } from "@/db/schema";
import { SET_WEIGHTS_MAX } from "@/lib/session-logs";
import { insertCustomer, insertExercise, insertRoutine } from "@/test/int/content";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

describe("exercise_logs.set_weights_kg", () => {
  let physio: TestPhysio;
  let customerId: string;
  let routineId: string;
  let exerciseId: string;
  let day = 0;

  const insert = async (patch: Partial<typeof exerciseLogs.$inferInsert>) => {
    day += 1;
    const [row] = await db
      .insert(exerciseLogs)
      .values({
        physioId: physio.id,
        customerId,
        routineId,
        exerciseId,
        performedOn: `2026-10-${String(day).padStart(2, "0")}`,
        ...patch,
      })
      .returning();
    return row!;
  };

  beforeAll(async () => {
    physio = await createTestPhysio({ onboarded: true });
    customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    exerciseId = await insertExercise(physio.id);
    routineId = await insertRoutine(physio.id, customerId, {
      status: "active",
      items: [{ exerciseId }],
    });
  });
  afterAll(() => deleteTestPhysios(physio));

  it("round-trips per-set weights as numbers, keeping null gaps", async () => {
    const row = await insert({ setWeightsKg: [20, null, 25.5] });
    expect(row.setWeightsKg).toEqual([20, null, 25.5]);
  });

  it("rejects out-of-range or mis-sized arrays", async () => {
    await expect(insert({ setWeightsKg: [1000] })).rejects.toThrow();
    await expect(insert({ setWeightsKg: [-1] })).rejects.toThrow();
    await expect(insert({ setWeightsKg: [] })).rejects.toThrow();
    await expect(
      insert({ setWeightsKg: Array.from({ length: SET_WEIGHTS_MAX + 1 }, () => 10) }),
    ).rejects.toThrow();
  });

  it("accepts the maximum length", async () => {
    const row = await insert({ setWeightsKg: Array.from({ length: SET_WEIGHTS_MAX }, () => 10) });
    expect(row.setWeightsKg).toHaveLength(SET_WEIGHTS_MAX);
  });

  it("counts set weights as content for the not-empty check", async () => {
    await expect(insert({ setWeightsKg: [5] })).resolves.toBeDefined();
    await expect(insert({})).rejects.toThrow();
  });

  it("bumps updated_at for set weight edits but not for seen_by_physio_at", async () => {
    const row = await insert({ setWeightsKg: [5] });
    const old = new Date("2020-01-01T00:00:00Z");
    await db.execute(
      sql`update exercise_logs set updated_at = ${old.toISOString()}::timestamptz where id = ${row.id}`,
    );

    await db
      .update(exerciseLogs)
      .set({ seenByPhysioAt: new Date() })
      .where(eq(exerciseLogs.id, row.id));
    const [seen] = await db.select().from(exerciseLogs).where(eq(exerciseLogs.id, row.id));
    expect(seen!.updatedAt.getTime()).toBe(old.getTime());

    await db
      .update(exerciseLogs)
      .set({ setWeightsKg: [5, 6] })
      .where(eq(exerciseLogs.id, row.id));
    const [edited] = await db.select().from(exerciseLogs).where(eq(exerciseLogs.id, row.id));
    expect(edited!.updatedAt.getTime()).toBeGreaterThan(old.getTime());
  });

  it("copies an existing single weight into a one-set array (migration statement)", async () => {
    const row = await insert({ weightKg: 12.5 });
    expect(row.setWeightsKg).toBeNull();
    await db.execute(sql`
      update public.exercise_logs
        set set_weights_kg = array[weight_kg]
        where weight_kg is not null and set_weights_kg is null and id = ${row.id}`);
    const [after] = await db.select().from(exerciseLogs).where(eq(exerciseLogs.id, row.id));
    expect(after!.setWeightsKg).toEqual([12.5]);
  });
});
