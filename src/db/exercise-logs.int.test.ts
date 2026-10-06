import fs from "node:fs";
import path from "node:path";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { exerciseLogs, sessionLogs } from "@/db/schema";
import { SET_WEIGHTS_MAX } from "@/lib/session-logs";
import { insertCustomer, insertExercise, insertRoutine } from "@/test/int/content";
import { insertSessionLog } from "@/test/int/logs";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

describe("exercise_logs.set_weights_kg", () => {
  let physio: TestPhysio;
  let customerId: string;
  let routineId: string;
  let exerciseId: string;
  let day = 0;

  const insert = async (patch: Partial<typeof exerciseLogs.$inferInsert>) => {
    day += 1;
    const performedOn = `2026-10-${String(day).padStart(2, "0")}`;
    const sessionLogId = await insertSessionLog(physio.id, { customerId, routineId, performedOn });
    const [row] = await db
      .insert(exerciseLogs)
      .values({
        physioId: physio.id,
        customerId,
        routineId,
        sessionLogId,
        exerciseId,
        performedOn,
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

describe("exercise_logs.session_log_id", () => {
  let physio: TestPhysio;
  let other: TestPhysio;
  let customerId: string;
  let routineId: string;
  let exerciseId: string;

  beforeAll(async () => {
    physio = await createTestPhysio({ onboarded: true });
    other = await createTestPhysio({ onboarded: true });
    customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    exerciseId = await insertExercise(physio.id);
    routineId = await insertRoutine(physio.id, customerId, {
      status: "active",
      items: [{ exerciseId }],
    });
  });
  afterAll(() => deleteTestPhysios(physio, other));

  const base = (sessionLogId: string | null, performedOn: string) => ({
    physioId: physio.id,
    customerId,
    routineId,
    sessionLogId: sessionLogId as string,
    exerciseId,
    performedOn,
    rpe: 5,
  });

  it("deletes a session's exercise logs with it", async () => {
    const sessionId = await insertSessionLog(physio.id, {
      customerId,
      routineId,
      performedOn: "2026-11-01",
    });
    const [log] = await db
      .insert(exerciseLogs)
      .values(base(sessionId, "2026-11-01"))
      .returning({ id: exerciseLogs.id });

    await db.delete(sessionLogs).where(eq(sessionLogs.id, sessionId));
    expect(await db.select().from(exerciseLogs).where(eq(exerciseLogs.id, log!.id))).toEqual([]);
  });

  it("rejects a session of another physio", async () => {
    const otherCustomer = await insertCustomer(other.id, { firstName: "Bo" });
    const otherExercise = await insertExercise(other.id);
    const otherRoutine = await insertRoutine(other.id, otherCustomer, {
      status: "active",
      items: [{ exerciseId: otherExercise }],
    });
    const foreignSession = await insertSessionLog(other.id, {
      customerId: otherCustomer,
      routineId: otherRoutine,
      performedOn: "2026-11-02",
    });

    await expect(
      db.insert(exerciseLogs).values(base(foreignSession, "2026-11-02")),
    ).rejects.toThrow();
  });

  it("backfills a done session for an orphan log (migration statements)", async () => {
    const dir = path.join(process.cwd(), "supabase/migrations");
    const file = fs.readdirSync(dir).find((f) => f.endsWith("_exercise-log-session-backfill.sql"));
    const backfill = fs.readFileSync(path.join(dir, file!), "utf8");
    const existing = await insertSessionLog(physio.id, {
      customerId,
      routineId,
      performedOn: "2026-11-04",
      completed: false,
    });

    const rollback = new Error("rollback");
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(
          sql`alter table public.exercise_logs alter column session_log_id drop not null`,
        );
        const [orphan] = await tx
          .insert(exerciseLogs)
          .values({ ...base(null, "2026-11-03"), sessionLogId: null as unknown as string })
          .returning({ id: exerciseLogs.id });
        const [attached] = await tx
          .insert(exerciseLogs)
          .values({ ...base(null, "2026-11-04"), sessionLogId: null as unknown as string })
          .returning({ id: exerciseLogs.id });

        await tx.execute(sql.raw(backfill.replaceAll("--> statement-breakpoint", "")));

        const [orphanRow] = await tx
          .select()
          .from(exerciseLogs)
          .where(eq(exerciseLogs.id, orphan!.id));
        const [session] = await tx
          .select()
          .from(sessionLogs)
          .where(eq(sessionLogs.id, orphanRow!.sessionLogId));
        expect(session).toMatchObject({ completed: true, performedOn: "2026-11-03", routineId });

        const [attachedRow] = await tx
          .select()
          .from(exerciseLogs)
          .where(eq(exerciseLogs.id, attached!.id));
        expect(attachedRow!.sessionLogId).toBe(existing);
        const [kept] = await tx.select().from(sessionLogs).where(eq(sessionLogs.id, existing));
        expect(kept!.completed).toBe(false);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
