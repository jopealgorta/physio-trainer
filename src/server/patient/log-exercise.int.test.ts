import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { exerciseLogs, weeklyPlanEntries } from "@/db/schema";
import { insertCustomer, insertExercise, insertPlan, insertRoutine } from "@/test/int/content";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";
import { ensureShareLink } from "@/server/sharing/mutations";

import { getPatientExerciseLogs, logExercise } from "./log-exercise";
import type { LogExerciseInput } from "./exercise-log-schema";
import { resolveLink } from "./resolve-link";

const NOW = new Date("2026-10-07T10:00:00Z");
const TODAY = "2026-10-07";

describe("logExercise", () => {
  const created: TestPhysio[] = [];
  let physio: TestPhysio;
  let other: TestPhysio;

  let customerId: string;
  let standalone: string;
  let inPlan: string;
  let foreign: string;
  let exerciseId: string;
  let strangerExercise: string;
  let entryId: string;
  let planId: string;
  let customerCode: string;

  const as = <T>(who: TestPhysio, fn: Parameters<typeof runAsPhysio<T>>[1]) =>
    runAsPhysio(who.claims, fn);
  const linkFor = async (who: TestPhysio, ref: Parameters<typeof ensureShareLink>[2]) => {
    const result = await as(who, (tx, id) => ensureShareLink(tx, id, ref));
    if (!result.ok) throw new Error(result.error);
    return result.data.link;
  };
  const resolved = async (code: string) => {
    const result = await resolveLink(code, NOW);
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
    return result;
  };
  const input = (patch: Partial<LogExerciseInput> = {}): LogExerciseInput => ({
    routineId: standalone,
    entryId: null,
    exerciseId,
    performedOn: TODAY,
    pain: null,
    rpe: null,
    weightKg: null,
    comment: null,
    ...patch,
  });
  const log = async (code: string, patch: Partial<LogExerciseInput> = {}) => {
    const { shell, link } = await resolved(code);
    return logExercise(shell, link, input(patch), NOW);
  };
  const rows = (routineId: string) =>
    db.select().from(exerciseLogs).where(eq(exerciseLogs.routineId, routineId));

  beforeAll(async () => {
    physio = await createTestPhysio({ onboarded: true });
    other = await createTestPhysio({ onboarded: true });
    created.push(physio, other);

    customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    const otherCustomerId = await insertCustomer(physio.id, { firstName: "Beto" });
    exerciseId = await insertExercise(physio.id);
    strangerExercise = await insertExercise(physio.id, { name: "Lunge" });
    const items = [{ exerciseId }];
    standalone = await insertRoutine(physio.id, customerId, {
      name: "Knee",
      status: "active",
      items,
    });
    inPlan = await insertRoutine(physio.id, customerId, {
      name: "Back",
      status: "active",
      isStandalone: false,
      items,
    });
    foreign = await insertRoutine(physio.id, otherCustomerId, { status: "active", items });
    planId = await insertPlan(physio.id, customerId, {
      name: "Week",
      status: "active",
      entries: [{ weekday: 5, routineId: inPlan }],
    });
    const [entry] = await db
      .select({ id: weeklyPlanEntries.id })
      .from(weeklyPlanEntries)
      .where(eq(weeklyPlanEntries.weeklyPlanId, planId));
    entryId = entry!.id;
    customerCode = (await linkFor(physio, { target: "customer", customerId })).code;
  });
  afterAll(() => deleteTestPhysios(...created));

  it("stores a log, then edits the same row", async () => {
    const first = await log(customerCode, { pain: 4, rpe: 6, weightKg: 12.5, comment: "ok" });
    expect(first).toEqual({
      ok: true,
      data: {
        routineId: standalone,
        entryId: null,
        exerciseId,
        performedOn: TODAY,
        pain: 4,
        rpe: 6,
        weightKg: 12.5,
        comment: "ok",
      },
    });
    const second = await log(customerCode, { pain: 4, rpe: 6, weightKg: 15, comment: "ok" });
    expect(second.ok && second.data?.weightKg).toBe(15);
    const stored = await rows(standalone);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ physioId: physio.id, customerId, weightKg: 15 });
  });

  it("deletes the row when every field is cleared, and tolerates no row", async () => {
    expect(await log(customerCode, {})).toEqual({ ok: true, data: null });
    expect(await rows(standalone)).toHaveLength(0);
    expect(await log(customerCode, {})).toEqual({ ok: true, data: null });
  });

  it("rejects an exercise outside the routine, another customer's routine and old days", async () => {
    expect(await log(customerCode, { exerciseId: strangerExercise, pain: 1 })).toEqual({
      ok: false,
      error: "unreachable",
    });
    expect(await log(customerCode, { routineId: foreign, pain: 1 })).toEqual({
      ok: false,
      error: "unreachable",
    });
    expect(await log(customerCode, { performedOn: "2026-10-05", pain: 1 })).toEqual({
      ok: false,
      error: "date",
    });
    expect(await rows(foreign)).toHaveLength(0);
    expect(await rows(standalone)).toHaveLength(0);
  });

  it("rejects an exercise id that belongs to another physio", async () => {
    const alien = await insertExercise(other.id, { name: "Alien" });
    expect(await log(customerCode, { exerciseId: alien, pain: 1 })).toEqual({
      ok: false,
      error: "unreachable",
    });
    expect(
      await db.select().from(exerciseLogs).where(eq(exerciseLogs.exerciseId, alien)),
    ).toHaveLength(0);
  });

  it("rejects a plan entry that does not hold the routine", async () => {
    expect(await log(customerCode, { routineId: standalone, entryId, pain: 1 })).toEqual({
      ok: false,
      error: "unreachable",
    });
  });

  it("keeps the plan entry and standalone logs of the same exercise apart", async () => {
    await log(customerCode, { routineId: inPlan, entryId, pain: 1 });
    await log(customerCode, { routineId: inPlan, entryId: null, pain: 2 });
    expect(await rows(inPlan)).toHaveLength(2);
  });

  it("resets 'seen' only when the comment changes", async () => {
    await log(customerCode, { pain: 2, comment: "first" });
    await db
      .update(exerciseLogs)
      .set({ seenByPhysioAt: new Date() })
      .where(eq(exerciseLogs.routineId, standalone));
    await log(customerCode, { pain: 5, comment: "first" });
    expect((await rows(standalone))[0]!.seenByPhysioAt).not.toBeNull();
    await log(customerCode, { pain: 5, comment: "second" });
    expect((await rows(standalone))[0]!.seenByPhysioAt).toBeNull();
  });

  it("scopes getPatientExerciseLogs to a routine link", async () => {
    const routineLink = await linkFor(physio, { target: "routine", routineId: standalone });
    await log(customerCode, { routineId: inPlan, entryId, pain: 3 });
    const { shell, link } = await resolved(routineLink.code);
    const read = await getPatientExerciseLogs(shell, link, TODAY, TODAY);
    expect(read.length).toBeGreaterThan(0);
    expect(read.every((l) => l.routineId === standalone)).toBe(true);
    expect(read[0]).not.toHaveProperty("physioId");

    const planLink = await linkFor(physio, { target: "weekly_plan", weeklyPlanId: planId });
    const planned = await resolved(planLink.code);
    const planRead = await getPatientExerciseLogs(planned.shell, planned.link, TODAY, TODAY);
    expect(planRead.every((l) => l.routineId === inPlan && l.entryId === entryId)).toBe(true);
    expect(planRead.length).toBeGreaterThan(0);
  });

  it("is private to the physio under RLS", async () => {
    await log(customerCode, { pain: 2 });
    expect((await as(physio, (tx) => tx.select().from(exerciseLogs))).length).toBeGreaterThan(0);
    expect(await as(other, (tx) => tx.select().from(exerciseLogs))).toEqual([]);
  });
});
