import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { exerciseLogs, sessionLogs, weeklyPlanEntries } from "@/db/schema";
import { insertCustomer, insertExercise, insertPlan, insertRoutine } from "@/test/int/content";
import { insertSessionLog } from "@/test/int/logs";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";
import { ensureShareLink } from "@/server/sharing/mutations";

import { getPatientExerciseLogs, logExercise } from "./log-exercise";
import { logSession } from "./log-session";
import type { LogExerciseInput } from "./exercise-log-schema";
import { resolveLink } from "./resolve-link";

const NOW = new Date("2026-10-07T10:00:00Z");
const TODAY = "2026-10-07";
const YESTERDAY = "2026-10-06";

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
    rpe: null,
    setWeightsKg: null,
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
    const first = await log(customerCode, { rpe: 6, setWeightsKg: [20, null, 25], comment: "ok" });
    expect(first).toEqual({
      ok: true,
      data: {
        routineId: standalone,
        entryId: null,
        exerciseId,
        performedOn: TODAY,
        rpe: 6,
        setWeightsKg: [20, null, 25],
        comment: "ok",
      },
    });
    const second = await log(customerCode, { rpe: 6, setWeightsKg: [22], comment: "ok" });
    expect(second.ok && second.data?.setWeightsKg).toEqual([22]);
    const stored = await rows(standalone);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ physioId: physio.id, customerId, setWeightsKg: [22] });
  });

  it("replaces a legacy pain/weight log: they end up null", async () => {
    await db.delete(exerciseLogs).where(eq(exerciseLogs.routineId, standalone));
    await db.delete(sessionLogs).where(eq(sessionLogs.routineId, standalone));
    const sessionLogId = await insertSessionLog(physio.id, {
      customerId,
      routineId: standalone,
      performedOn: TODAY,
    });
    await db.insert(exerciseLogs).values({
      physioId: physio.id,
      customerId,
      routineId: standalone,
      sessionLogId,
      weeklyPlanEntryId: null,
      exerciseId,
      performedOn: TODAY,
      pain: 5,
      weightKg: 10,
    });
    await log(customerCode, { setWeightsKg: [12] });
    const stored = await rows(standalone);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ pain: null, weightKg: null, setWeightsKg: [12] });
  });

  it("deletes the row when every field is cleared, and tolerates no row", async () => {
    await log(customerCode, { rpe: 3 });
    expect(await rows(standalone)).toHaveLength(1);
    expect(await log(customerCode, {})).toEqual({ ok: true, data: null });
    expect(await rows(standalone)).toHaveLength(0);
    expect(await log(customerCode, {})).toEqual({ ok: true, data: null });
  });

  it("rejects an exercise outside the routine, another customer's routine and old days", async () => {
    expect(await log(customerCode, { exerciseId: strangerExercise, rpe: 1 })).toEqual({
      ok: false,
      error: "unreachable",
    });
    expect(await log(customerCode, { routineId: foreign, rpe: 1 })).toEqual({
      ok: false,
      error: "unreachable",
    });
    expect(await log(customerCode, { performedOn: "2026-10-05", rpe: 1 })).toEqual({
      ok: false,
      error: "date",
    });
    expect(await rows(foreign)).toHaveLength(0);
    expect(await rows(standalone)).toHaveLength(0);
  });

  it("rejects an exercise id that belongs to another physio", async () => {
    const alien = await insertExercise(other.id, { name: "Alien" });
    expect(await log(customerCode, { exerciseId: alien, rpe: 1 })).toEqual({
      ok: false,
      error: "unreachable",
    });
    expect(
      await db.select().from(exerciseLogs).where(eq(exerciseLogs.exerciseId, alien)),
    ).toHaveLength(0);
  });

  it("rejects a plan entry that does not hold the routine", async () => {
    expect(await log(customerCode, { routineId: standalone, entryId, rpe: 1 })).toEqual({
      ok: false,
      error: "unreachable",
    });
  });

  it("keeps the plan entry and standalone logs of the same exercise apart", async () => {
    await log(customerCode, { routineId: inPlan, entryId, rpe: 1 });
    await log(customerCode, { routineId: inPlan, entryId: null, rpe: 2 });
    expect(await rows(inPlan)).toHaveLength(2);
  });

  it("resets 'seen' only when the comment changes", async () => {
    await log(customerCode, { rpe: 2, comment: "first" });
    await db
      .update(exerciseLogs)
      .set({ seenByPhysioAt: new Date() })
      .where(eq(exerciseLogs.routineId, standalone));
    await log(customerCode, { rpe: 5, comment: "first" });
    expect((await rows(standalone))[0]!.seenByPhysioAt).not.toBeNull();
    await log(customerCode, { rpe: 5, comment: "second" });
    expect((await rows(standalone))[0]!.seenByPhysioAt).toBeNull();
  });

  it("scopes getPatientExerciseLogs to a routine link", async () => {
    const routineLink = await linkFor(physio, { target: "routine", routineId: standalone });
    await log(customerCode, { routineId: inPlan, entryId, rpe: 3 });
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
    await log(customerCode, { rpe: 2 });
    expect((await as(physio, (tx) => tx.select().from(exerciseLogs))).length).toBeGreaterThan(0);
    expect(await as(other, (tx) => tx.select().from(exerciseLogs))).toEqual([]);
  });

  describe("session", () => {
    let secondExercise: string;
    let twoItems: string;

    const sessions = (routineId: string) =>
      db.select().from(sessionLogs).where(eq(sessionLogs.routineId, routineId));
    const reset = async () => {
      const ids = [standalone, inPlan, twoItems];
      await db.delete(exerciseLogs).where(inArray(exerciseLogs.routineId, ids));
      await db.delete(sessionLogs).where(inArray(sessionLogs.routineId, ids));
    };

    beforeAll(async () => {
      secondExercise = await insertExercise(physio.id, { name: "Bridge" });
      twoItems = await insertRoutine(physio.id, customerId, {
        name: "Two",
        status: "active",
        items: [{ exerciseId }, { exerciseId: secondExercise }],
      });
    });
    beforeEach(reset);

    it("creates a done session on the first exercise log", async () => {
      await log(customerCode, { rpe: 4 });
      const found = await sessions(standalone);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        physioId: physio.id,
        customerId,
        weeklyPlanEntryId: null,
        performedOn: TODAY,
        completed: true,
        pain: null,
        rpe: null,
        comment: null,
      });
      expect((await rows(standalone))[0]!.sessionLogId).toBe(found[0]!.id);
    });

    it("attaches later logs to the same session without changing it", async () => {
      await log(customerCode, { routineId: twoItems, rpe: 4 });
      const [before] = await sessions(twoItems);
      await log(customerCode, { routineId: twoItems, exerciseId: secondExercise, rpe: 5 });
      const after = await sessions(twoItems);
      expect(after).toHaveLength(1);
      expect(after[0]!.updatedAt).toEqual(before!.updatedAt);
      const stored = await rows(twoItems);
      expect(stored).toHaveLength(2);
      expect(stored.every((l) => l.sessionLogId === before!.id)).toBe(true);
    });

    it("leaves an undone session undone", async () => {
      const { shell, link } = await resolved(customerCode);
      const done = await logSession(
        shell,
        link,
        {
          routineId: standalone,
          entryId: null,
          performedOn: TODAY,
          completed: false,
          pain: null,
          rpe: null,
          comment: null,
        },
        NOW,
      );
      expect(done.ok).toBe(true);
      await log(customerCode, { rpe: 4 });
      const found = await sessions(standalone);
      expect(found).toHaveLength(1);
      expect(found[0]!.completed).toBe(false);
      expect((await rows(standalone))[0]!.sessionLogId).toBe(found[0]!.id);
    });

    it("creates one session when two logs race", async () => {
      await Promise.all([
        log(customerCode, { routineId: twoItems, rpe: 4 }),
        log(customerCode, { routineId: twoItems, exerciseId: secondExercise, rpe: 5 }),
      ]);
      const found = await sessions(twoItems);
      expect(found).toHaveLength(1);
      const stored = await rows(twoItems);
      expect(stored).toHaveLength(2);
      expect(stored.every((l) => l.sessionLogId === found[0]!.id)).toBe(true);
    });

    it("keeps plan entry and standalone sessions apart", async () => {
      await log(customerCode, { routineId: inPlan, entryId, rpe: 1 });
      await log(customerCode, { routineId: inPlan, entryId: null, rpe: 2 });
      const found = await sessions(inPlan);
      expect(found).toHaveLength(2);
      expect(found.map((s) => s.weeklyPlanEntryId).sort()).toEqual([entryId, null].sort());
    });

    it("refuses yesterday: another day is another session", async () => {
      expect(await log(customerCode, { performedOn: YESTERDAY, rpe: 4 })).toEqual({
        ok: false,
        error: "date",
      });
      expect(await sessions(standalone)).toEqual([]);
    });

    it("deletes the session when its last log is cleared and it is empty", async () => {
      await log(customerCode, { rpe: 4 });
      expect(await sessions(standalone)).toHaveLength(1);
      await log(customerCode, {});
      expect(await sessions(standalone)).toHaveLength(0);
    });

    it("keeps the session when other logs remain", async () => {
      await log(customerCode, { routineId: twoItems, rpe: 4 });
      await log(customerCode, { routineId: twoItems, exerciseId: secondExercise, rpe: 5 });
      await log(customerCode, { routineId: twoItems });
      expect(await sessions(twoItems)).toHaveLength(1);
      expect(await rows(twoItems)).toHaveLength(1);
    });

    it("keeps the session when it has a comment, pain or RPE", async () => {
      for (const extra of [{ comment: "hurt" }, { pain: 3 }, { rpe: 7 }]) {
        await reset();
        await insertSessionLog(physio.id, {
          customerId,
          routineId: standalone,
          performedOn: TODAY,
          ...extra,
        });
        await log(customerCode, { rpe: 4 });
        await log(customerCode, {});
        const found = await sessions(standalone);
        expect(found, JSON.stringify(extra)).toHaveLength(1);
        expect(await rows(standalone)).toHaveLength(0);
      }
    });

    it("keeps a log saved while another is cleared", async () => {
      for (let round = 0; round < 5; round++) {
        await reset();
        await log(customerCode, { routineId: twoItems, rpe: 4 });
        await Promise.all([
          log(customerCode, { routineId: twoItems }),
          log(customerCode, { routineId: twoItems, exerciseId: secondExercise, rpe: 5 }),
        ]);
        const stored = await rows(twoItems);
        expect(stored).toHaveLength(1);
        expect(stored[0]).toMatchObject({ exerciseId: secondExercise });
        const found = await sessions(twoItems);
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ id: stored[0]!.sessionLogId, completed: true });
      }
    });

    it("writes nothing when refused", async () => {
      const unreachable = { ok: false, error: "unreachable" };
      expect(await log(customerCode, { routineId: foreign, rpe: 1 })).toEqual(unreachable);
      expect(await log(customerCode, { exerciseId: strangerExercise, rpe: 1 })).toEqual(
        unreachable,
      );
      expect(await log(customerCode, { performedOn: "2026-10-05", rpe: 1 })).toEqual({
        ok: false,
        error: "date",
      });
      const all = await db
        .select()
        .from(sessionLogs)
        .where(
          and(
            eq(sessionLogs.physioId, physio.id),
            inArray(sessionLogs.routineId, [foreign, standalone]),
          ),
        );
      expect(all).toEqual([]);
    });
  });
});
