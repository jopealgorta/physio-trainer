import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { sessionLogs, shareLinks, weeklyPlanEntries } from "@/db/schema";
import { insertCustomer, insertExercise, insertPlan, insertRoutine } from "@/test/int/content";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";
import { ensureShareLink } from "@/server/sharing/mutations";

import { getPatientLogs, logSession, type LogSessionInput } from "./log-session";
import { resolveLink } from "./resolve-link";

// Wednesday 7 Oct 2026 in the test physio's time zone (UTC, the column default).
const NOW = new Date("2026-10-07T10:00:00Z");
const TODAY = "2026-10-07";
const YESTERDAY = "2026-10-06";

describe("logSession", () => {
  const created: TestPhysio[] = [];
  let physio: TestPhysio;
  let other: TestPhysio;

  let customerId: string;
  let otherCustomerId: string;
  let standalone: string;
  let inPlan: string;
  let draft: string;
  let foreign: string;
  let entryId: string;
  let planId: string;
  let foreignEntryId: string;
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
  const input = (patch: Partial<LogSessionInput> = {}): LogSessionInput => ({
    routineId: standalone,
    entryId: null,
    performedOn: TODAY,
    completed: true,
    pain: null,
    rpe: null,
    comment: null,
    ...patch,
  });
  const log = async (code: string, patch: Partial<LogSessionInput> = {}) => {
    const { shell, link } = await resolved(code);
    return logSession(shell, link, input(patch), NOW);
  };
  const entryOf = async (weeklyPlanId: string) => {
    const [row] = await db
      .select({ id: weeklyPlanEntries.id })
      .from(weeklyPlanEntries)
      .where(eq(weeklyPlanEntries.weeklyPlanId, weeklyPlanId));
    return row!.id;
  };
  const rows = (routineId: string) =>
    db.select().from(sessionLogs).where(eq(sessionLogs.routineId, routineId));

  beforeAll(async () => {
    physio = await createTestPhysio({ onboarded: true });
    other = await createTestPhysio({ onboarded: true });
    created.push(physio, other);

    customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    otherCustomerId = await insertCustomer(physio.id, { firstName: "Beto" });
    const exercise = await insertExercise(physio.id);
    const items = [{ exerciseId: exercise }];
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
    draft = await insertRoutine(physio.id, customerId, { name: "Draft", items });
    foreign = await insertRoutine(physio.id, otherCustomerId, { status: "active", items });
    planId = await insertPlan(physio.id, customerId, {
      name: "Week",
      status: "active",
      entries: [{ weekday: 5, routineId: inPlan, label: "Morning" }],
    });
    const foreignPlan = await insertPlan(physio.id, otherCustomerId, {
      status: "active",
      entries: [{ weekday: 3, routineId: foreign }],
    });
    entryId = await entryOf(planId);
    foreignEntryId = await entryOf(foreignPlan);
    customerCode = (await linkFor(physio, { target: "customer", customerId })).code;
  });
  afterAll(() => deleteTestPhysios(...created));

  describe("saving", () => {
    it("stores a log for an active standalone routine, then edits the same row", async () => {
      const first = await log(customerCode, { pain: 6, comment: "pinchy" });
      expect(first).toEqual({
        ok: true,
        data: {
          routineId: standalone,
          entryId: null,
          performedOn: TODAY,
          completed: true,
          pain: 6,
          rpe: null,
          comment: "pinchy",
        },
      });

      const second = await log(customerCode, { pain: 3, comment: null });
      expect(second.ok && second.data.pain).toBe(3);
      const stored = await rows(standalone);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ pain: 3, comment: null, physioId: physio.id, customerId });
    });

    it("keeps one row per routine, entry and day, with the entry optional", async () => {
      const withEntry = await log(customerCode, { routineId: inPlan, entryId, pain: 2 });
      expect(withEntry.ok).toBe(true);
      await log(customerCode, { routineId: inPlan, entryId, pain: 4 });
      const stored = await rows(inPlan);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ weeklyPlanEntryId: entryId, pain: 4 });

      // The same routine logged without its entry is its own (NULL) entry slot, still one per day.
      await log(customerCode, { routineId: inPlan, entryId: null, pain: 1 });
      await log(customerCode, { routineId: inPlan, entryId: null, pain: 5 });
      expect(await rows(inPlan)).toHaveLength(2);
    });

    it("refuses yesterday: another day is another session", async () => {
      expect(await log(customerCode, { performedOn: YESTERDAY, pain: 1 })).toEqual({
        ok: false,
        error: "date",
      });
      const days = (await rows(standalone)).map((row) => row.performedOn);
      expect(days).toEqual([TODAY]);
    });

    it("undoes a session by saving it as not completed", async () => {
      await log(customerCode, { pain: 4 });
      const result = await log(customerCode, { completed: false, pain: 4 });
      expect(result.ok && result.data.completed).toBe(false);
      const [row] = await db
        .select()
        .from(sessionLogs)
        .where(and(eq(sessionLogs.routineId, standalone), eq(sessionLogs.performedOn, TODAY)));
      expect(row!.completed).toBe(false);
      await log(customerCode, { completed: true, pain: 4 });
    });

    it("remembers which link was used", async () => {
      const { link } = await resolved(customerCode);
      const [row] = await rows(standalone);
      expect(row!.shareLinkId).toBe(link.id);
    });
  });

  describe("date window", () => {
    it("rejects every day but today", async () => {
      expect(await log(customerCode, { performedOn: YESTERDAY })).toEqual({
        ok: false,
        error: "date",
      });
      expect(await log(customerCode, { performedOn: "2026-10-05" })).toEqual({
        ok: false,
        error: "date",
      });
      expect(await log(customerCode, { performedOn: "2026-10-08" })).toEqual({
        ok: false,
        error: "date",
      });
    });

    it("uses the physio's time zone for today", async () => {
      // 02:00 UTC on the 8th is still the evening of the 7th in Montevideo (UTC-3).
      const { shell, link } = await resolved(customerCode);
      const late = new Date("2026-10-08T02:00:00Z");
      const montevideo = { ...shell, timeZone: "America/Montevideo" };
      expect((await logSession(montevideo, link, input({ performedOn: TODAY }), late)).ok).toBe(
        true,
      );
      expect(
        await logSession(montevideo, link, input({ performedOn: "2026-10-08" }), late),
      ).toEqual({ ok: false, error: "date" });
    });
  });

  describe("reachability", () => {
    it("rejects another customer's routine, whatever id the client sends", async () => {
      expect(await log(customerCode, { routineId: foreign })).toEqual({
        ok: false,
        error: "unreachable",
      });
      expect(await rows(foreign)).toHaveLength(0);
    });

    it("rejects a plan entry of another customer or one that does not hold the routine", async () => {
      expect(await log(customerCode, { routineId: foreign, entryId: foreignEntryId })).toEqual({
        ok: false,
        error: "unreachable",
      });
      expect(await log(customerCode, { routineId: standalone, entryId })).toEqual({
        ok: false,
        error: "unreachable",
      });
      expect(await log(customerCode, { routineId: inPlan, entryId: foreignEntryId })).toEqual({
        ok: false,
        error: "unreachable",
      });
    });

    it("rejects draft routines and routines that are not active on that day", async () => {
      expect((await log(customerCode, { routineId: draft })).ok).toBe(false);
      const later = await insertRoutine(physio.id, customerId, {
        status: "active",
        startsOn: TODAY,
      });
      expect((await log(customerCode, { routineId: later })).ok).toBe(true);
      const tomorrow = await insertRoutine(physio.id, customerId, {
        status: "active",
        startsOn: "2026-10-08",
      });
      expect((await log(customerCode, { routineId: tomorrow })).ok).toBe(false);
      const ended = await insertRoutine(physio.id, customerId, {
        status: "active",
        endsOn: YESTERDAY,
      });
      expect((await log(customerCode, { routineId: ended })).ok).toBe(false);
    });

    it("rejects an entry whose plan is not active that day or whose routine is a draft", async () => {
      const inactivePlan = await insertPlan(physio.id, customerId, {
        status: "active",
        startsOn: "2026-10-20",
        entries: [{ weekday: 3, routineId: inPlan }],
      });
      expect(
        await log(customerCode, { routineId: inPlan, entryId: await entryOf(inactivePlan) }),
      ).toEqual({
        ok: false,
        error: "unreachable",
      });

      const draftPlan = await insertPlan(physio.id, customerId, {
        status: "active",
        entries: [{ weekday: 3, routineId: draft }],
      });
      expect(
        await log(customerCode, { routineId: draft, entryId: await entryOf(draftPlan) }),
      ).toEqual({
        ok: false,
        error: "unreachable",
      });
    });

    it("limits a routine link to its routine and a plan link to its plan's entries", async () => {
      const routineLink = await linkFor(physio, { target: "routine", routineId: standalone });
      expect((await log(routineLink.code, { routineId: standalone })).ok).toBe(true);
      expect((await log(routineLink.code, { routineId: inPlan, entryId })).ok).toBe(false);

      const planLink = await linkFor(physio, { target: "weekly_plan", weeklyPlanId: planId });
      expect((await log(planLink.code, { routineId: inPlan, entryId })).ok).toBe(true);
      expect((await log(planLink.code, { routineId: standalone })).ok).toBe(false);
    });
  });

  describe("physio's view of the log", () => {
    it("resets 'seen' only when the comment changes", async () => {
      await log(customerCode, { pain: 2, comment: "first" });
      await db
        .update(sessionLogs)
        .set({ seenByPhysioAt: new Date() })
        .where(eq(sessionLogs.routineId, standalone));

      await log(customerCode, { pain: 5, comment: "first" });
      const [kept] = await rows(standalone).then((all) =>
        all.filter((r) => r.performedOn === TODAY),
      );
      expect(kept!.seenByPhysioAt).not.toBeNull();

      await log(customerCode, { pain: 5, comment: "second" });
      const [reset] = await rows(standalone).then((all) =>
        all.filter((r) => r.performedOn === TODAY),
      );
      expect(reset!.seenByPhysioAt).toBeNull();
    });

    it("stores rpe and bumps updated_at when only rpe changes", async () => {
      const first = await log(customerCode, { rpe: 6, comment: "rpe" });
      expect(first.ok && first.data.rpe).toBe(6);
      const today = () => rows(standalone).then((all) => all.find((r) => r.performedOn === TODAY)!);
      const before = await today();
      expect(before.rpe).toBe(6);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await log(customerCode, { rpe: 6, comment: "rpe" });
      expect((await today()).updatedAt).toEqual(before.updatedAt);
      await log(customerCode, { rpe: 8, comment: "rpe" });
      const after = await today();
      expect(after.rpe).toBe(8);
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    });

    it("is private to the physio under RLS", async () => {
      await log(customerCode, { pain: 2 });
      const mine = await as(physio, (tx) => tx.select().from(sessionLogs));
      expect(mine.length).toBeGreaterThan(0);
      expect(await as(other, (tx) => tx.select().from(sessionLogs))).toEqual([]);
      await expect(
        as(other, (tx) =>
          tx.insert(sessionLogs).values({
            physioId: other.id,
            customerId,
            routineId: standalone,
            performedOn: TODAY,
          }),
        ),
      ).rejects.toThrow();
      await expect(
        as(other, (tx) =>
          tx.insert(sessionLogs).values({
            physioId: physio.id,
            customerId,
            routineId: standalone,
            performedOn: "2026-01-01",
          }),
        ),
      ).rejects.toThrow();
    });

    it("survives the entry or the link being deleted, without counting as an edit", async () => {
      const entryRoutine = await insertRoutine(physio.id, customerId, { status: "active" });
      const plan = await insertPlan(physio.id, customerId, {
        status: "active",
        entries: [{ weekday: 3, routineId: entryRoutine }],
      });
      const entry = await entryOf(plan);
      await log(customerCode, { routineId: entryRoutine, entryId: entry, pain: 1 });
      await log(customerCode, { routineId: entryRoutine, entryId: null, pain: 1 });
      await db.delete(weeklyPlanEntries).where(eq(weeklyPlanEntries.id, entry));
      expect(await rows(entryRoutine)).toHaveLength(2);

      const linked = await insertRoutine(physio.id, customerId, { status: "active" });
      const disposable = await linkFor(physio, { target: "routine", routineId: linked });
      await log(disposable.code, { routineId: linked, pain: 1 });
      const [before] = await rows(linked);
      await db.delete(shareLinks).where(eq(shareLinks.id, disposable.id));
      const [after] = await rows(linked);
      expect(after!.shareLinkId).toBeNull();
      expect(after!.updatedAt).toEqual(before!.updatedAt);
    });

    it("is deleted with its routine", async () => {
      const routine = await insertRoutine(physio.id, customerId, { status: "active" });
      await log(customerCode, { routineId: routine, pain: 1 });
      expect(await rows(routine)).toHaveLength(1);
      await db.execute(sql`delete from routines where id = ${routine}`);
      expect(await rows(routine)).toHaveLength(0);
    });
  });

  describe("getPatientLogs", () => {
    it("returns only the link's own scope, in the patient's fields", async () => {
      const routineLink = await linkFor(physio, { target: "routine", routineId: standalone });
      const planLink = await linkFor(physio, { target: "weekly_plan", weeklyPlanId: planId });
      await log(customerCode, { routineId: standalone, pain: 2 });
      await log(customerCode, { routineId: inPlan, entryId, pain: 3, comment: "ok" });

      const read = async (code: string, from = YESTERDAY, to = TODAY) => {
        const { shell, link } = await resolved(code);
        return getPatientLogs(shell, link, from, to);
      };
      const all = await read(customerCode);
      const seen = all.map((l) => l.routineId);
      expect(seen).toContain(standalone);
      expect(seen).toContain(inPlan);
      expect(all[0]).not.toHaveProperty("seenByPhysioAt");
      expect(all[0]).not.toHaveProperty("physioId");

      expect((await read(routineLink.code)).every((l) => l.routineId === standalone)).toBe(true);
      expect((await read(planLink.code)).every((l) => l.routineId === inPlan)).toBe(true);
      expect(await read(customerCode, "2026-01-01", "2026-01-02")).toEqual([]);
    });
  });
});
