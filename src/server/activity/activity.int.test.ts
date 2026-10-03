import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { exerciseLogs, sessionLogs, weeklyPlanEntries } from "@/db/schema";
import { insertCustomer, insertExercise, insertPlan, insertRoutine } from "@/test/int/content";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";
import { ensureShareLink, revokeShareLink } from "@/server/sharing/mutations";
import { setCustomerArchived } from "@/server/customers/mutations";

import { markCommentsSeen, markExerciseCommentsSeen } from "./mutations";
import { getCustomerActivity, getDashboard } from "./queries";

// Thursday 8 Oct 2026 (the test physio's time zone is UTC).
const TODAY = "2026-10-08";
const NOW = new Date("2026-10-08T10:00:00Z");

describe("activity", () => {
  const created: TestPhysio[] = [];
  let physio: TestPhysio;
  let other: TestPhysio;
  let ana: string;
  let beto: string;
  let knee: string;
  let back: string;
  let backMonday: string;

  const as = <T>(who: TestPhysio, fn: Parameters<typeof runAsPhysio<T>>[1]) =>
    runAsPhysio(who.claims, fn);
  const addLog = (
    physioId: string,
    customerId: string,
    routineId: string,
    performedOn: string,
    values: Partial<typeof sessionLogs.$inferInsert> = {},
  ) =>
    db
      .insert(sessionLogs)
      .values({ physioId, customerId, routineId, performedOn, ...values })
      .returning({ id: sessionLogs.id })
      .then(([row]) => row!.id);

  beforeAll(async () => {
    physio = await createTestPhysio({ onboarded: true });
    other = await createTestPhysio({ onboarded: true });
    created.push(physio, other);

    ana = await insertCustomer(physio.id, { firstName: "Ana", lastName: "Lopez" });
    beto = await insertCustomer(physio.id, { firstName: "Beto" });
    const exercise = await insertExercise(physio.id);
    const items = [{ exerciseId: exercise }];
    knee = await insertRoutine(physio.id, ana, { name: "Knee", status: "active", items });
    back = await insertRoutine(physio.id, ana, {
      name: "Back",
      status: "active",
      isStandalone: false,
      items,
    });
    // Back is planned on Mondays and Thursdays.
    const plan = await insertPlan(physio.id, ana, {
      name: "Week",
      status: "active",
      entries: [
        { weekday: 1, routineId: back },
        { weekday: 4, routineId: back },
      ],
    });
    const [monday] = await db
      .select({ id: weeklyPlanEntries.id })
      .from(weeklyPlanEntries)
      .where(eq(weeklyPlanEntries.weeklyPlanId, plan))
      .orderBy(weeklyPlanEntries.weekday);
    backMonday = monday!.id;
    await as(physio, (tx, id) => ensureShareLink(tx, id, { target: "customer", customerId: ana }));
  });
  afterAll(() => deleteTestPhysios(...created));

  describe("getCustomerActivity", () => {
    beforeAll(async () => {
      // Monday, planned (done from its plan entry) ...
      await addLog(physio.id, ana, back, "2026-10-05", { pain: 3, weeklyPlanEntryId: backMonday });
      // ... and a standalone routine the Thursday before, which must not count as the plan's entry.
      await addLog(physio.id, ana, knee, "2026-10-01", { pain: 2 });
      await addLog(physio.id, ana, knee, "2026-10-06", { pain: 5, comment: "pinchy" }); // extra
      await addLog(physio.id, ana, knee, "2026-10-07", { pain: 7 });
      await addLog(physio.id, ana, back, "2026-09-10", { completed: false, pain: 9 });
    });

    it("builds the 12-week heatmap against the plan", async () => {
      const activity = await as(physio, (tx, id) => getCustomerActivity(tx, id, ana, TODAY));
      expect(activity.weeks).toHaveLength(12);
      expect(activity.weeks.at(-1)![0]).toBe("2026-10-05");
      const state = (date: string) => activity.cells.find((cell) => cell.date === date)!.state;
      expect(state("2026-10-05")).toBe("done");
      expect(state("2026-10-06")).toBe("extra");
      expect(state("2026-10-01")).toBe("missed"); // planned Thursday, only a standalone log
      expect(state("2026-10-08")).toBe("planned"); // Thursday today, nothing logged yet
      expect(state("2026-09-28")).toBe("missed"); // last Monday
      expect(activity.cells).toHaveLength(12 * 7);
    });

    it("gives the pain series overall and per routine", async () => {
      const { pain } = await as(physio, (tx, id) => getCustomerActivity(tx, id, ana, TODAY));
      expect(pain.overall.map((point) => point.date)).toEqual([
        "2026-09-10",
        "2026-10-01",
        "2026-10-05",
        "2026-10-06",
        "2026-10-07",
      ]);
      expect(pain.routines.map((routine) => routine.name).sort()).toEqual(["Back", "Knee"]);
      const kneeSeries = pain.routines.find((routine) => routine.id === knee)!;
      expect(kneeSeries.points).toEqual([
        { date: "2026-10-01", pain: 2 },
        { date: "2026-10-06", pain: 5 },
        { date: "2026-10-07", pain: 7 },
      ]);
    });

    it("lists comments newest first with their routine and seen state", async () => {
      const { comments, unseenIds } = await as(physio, (tx, id) =>
        getCustomerActivity(tx, id, ana, TODAY),
      );
      expect(comments).toHaveLength(1);
      expect(comments[0]).toMatchObject({
        comment: "pinchy",
        routineName: "Knee",
        performedOn: "2026-10-06",
        seen: false,
      });
      expect(unseenIds).toEqual([comments[0]!.id]);
    });

    it("sums the last 12 weeks", async () => {
      const { summary } = await as(physio, (tx, id) => getCustomerActivity(tx, id, ana, TODAY));
      // 4 completed sessions, one logged as not completed (and not counted as "last logged").
      expect(summary.completed).toBe(4);
      expect(summary.lastLoggedOn).toBe("2026-10-07");
      // Back is planned Mondays and Thursdays: 8 sessions between 10 Sep and 7 Oct, 4 logged.
      expect(summary.adherence).toEqual({ planned: 8, completed: 4, ratio: 0.5 });
    });

    it("does not date the last log by a session that was undone", async () => {
      const undoneRoutine = await insertRoutine(physio.id, beto, { status: "active" });
      await addLog(physio.id, beto, undoneRoutine, "2026-10-07", { completed: false });
      const { summary } = await as(physio, (tx, id) => getCustomerActivity(tx, id, beto, TODAY));
      expect(summary.lastLoggedOn).toBeNull();
      expect(summary.completed).toBe(0);
    });

    it("keeps comments from before the 12 weeks in the feed", async () => {
      const old = await addLog(physio.id, ana, knee, "2026-01-05", { comment: "months ago" });
      const { comments, unseenIds } = await as(physio, (tx, id) =>
        getCustomerActivity(tx, id, ana, TODAY),
      );
      expect(comments.map((c) => c.comment)).toEqual(["pinchy", "months ago"]);
      expect(unseenIds).toContain(old);
      await db.delete(sessionLogs).where(eq(sessionLogs.id, old));
    });

    it("is empty for a customer with no logs and refuses another physio's customer", async () => {
      const empty = await as(physio, (tx, id) => getCustomerActivity(tx, id, beto, TODAY));
      expect(empty.comments).toEqual([]);
      expect(empty.pain.overall).toEqual([]);
      expect(empty.summary).toEqual({
        completed: 0,
        lastLoggedOn: null,
        adherence: { planned: 0, completed: 0, ratio: null },
      });

      const foreign = await as(other, (tx, id) => getCustomerActivity(tx, id, ana, TODAY));
      expect(foreign.comments).toEqual([]);
      expect(foreign.pain.overall).toEqual([]);
    });
  });

  describe("exercise logs", () => {
    let squat: string;
    let kneeRoutine: string;
    let oneId: string;
    let twoId: string;
    const addExerciseLog = (
      customerId: string,
      performedOn: string,
      values: Partial<typeof exerciseLogs.$inferInsert> = {},
      physioId = physio.id,
    ) =>
      db
        .insert(exerciseLogs)
        .values({
          physioId,
          customerId,
          routineId: kneeRoutine,
          exerciseId: squat,
          performedOn,
          ...values,
        })
        .returning({ id: exerciseLogs.id })
        .then(([row]) => row!.id);

    beforeAll(async () => {
      squat = await insertExercise(physio.id, { name: "Goblet squat" });
      kneeRoutine = await insertRoutine(physio.id, beto, {
        name: "Beto knee",
        status: "active",
        items: [{ exerciseId: squat }],
      });
      oneId = await addExerciseLog(beto, "2026-10-06", { pain: 4, rpe: 6, weightKg: 12.5 });
      twoId = await addExerciseLog(beto, "2026-10-07", { comment: "felt ok" });
    });

    it("returns them newest first with exercise and routine names", async () => {
      const { exerciseLogs: logs, unseenExerciseIds } = await as(physio, (tx, id) =>
        getCustomerActivity(tx, id, beto, TODAY),
      );
      expect(logs.map((log) => log.id)).toEqual([twoId, oneId]);
      expect(logs[1]).toEqual({
        id: oneId,
        performedOn: "2026-10-06",
        routineId: kneeRoutine,
        routineName: "Beto knee",
        exerciseName: "Goblet squat",
        pain: 4,
        rpe: 6,
        weightKg: 12.5,
        comment: null,
        seen: true,
      });
      expect(logs[0]).toMatchObject({ comment: "felt ok", seen: false });
      expect(unseenExerciseIds).toEqual([twoId]);
    });

    it("marks only the given ids of that customer as seen", async () => {
      const mine = await addExerciseLog(beto, "2026-10-05", { comment: "a" });
      const keep = await addExerciseLog(beto, "2026-10-04", { comment: "b" });
      expect(
        await as(other, (tx, pid) => markExerciseCommentsSeen(tx, pid, beto, [mine], NOW)),
      ).toBe(0);
      expect(
        await as(physio, (tx, pid) => markExerciseCommentsSeen(tx, pid, ana, [mine], NOW)),
      ).toBe(0);
      expect(await as(physio, (tx, pid) => markExerciseCommentsSeen(tx, pid, beto, [], NOW))).toBe(
        0,
      );
      expect(
        await as(physio, (tx, pid) => markExerciseCommentsSeen(tx, pid, beto, [mine], NOW)),
      ).toBe(1);
      expect(
        await as(physio, (tx, pid) => markExerciseCommentsSeen(tx, pid, beto, [mine], NOW)),
      ).toBe(0);
      const [kept] = await db.select().from(exerciseLogs).where(eq(exerciseLogs.id, keep));
      expect(kept!.seenByPhysioAt).toBeNull();
      const [done] = await db.select().from(exerciseLogs).where(eq(exerciseLogs.id, mine));
      expect(done!.seenByPhysioAt).toEqual(NOW);
    });
  });

  describe("markCommentsSeen", () => {
    it("marks only the given comments, once, without counting as an edit", async () => {
      const own = await insertRoutine(physio.id, beto, { status: "active" });
      const shown = await addLog(physio.id, beto, own, "2026-10-07", { comment: "hello" });
      const later = await addLog(physio.id, beto, own, "2026-10-06", { comment: "arrived since" });
      const [before] = await db.select().from(sessionLogs).where(eq(sessionLogs.id, shown));

      expect(await as(other, (tx, pid) => markCommentsSeen(tx, pid, beto, [shown], NOW))).toBe(0);
      expect(await as(physio, (tx, pid) => markCommentsSeen(tx, pid, beto, [], NOW))).toBe(0);
      // A log of another customer cannot be marked through this customer's id.
      expect(await as(physio, (tx, pid) => markCommentsSeen(tx, pid, ana, [shown], NOW))).toBe(0);
      expect(await as(physio, (tx, pid) => markCommentsSeen(tx, pid, beto, [shown], NOW))).toBe(1);
      expect(await as(physio, (tx, pid) => markCommentsSeen(tx, pid, beto, [shown], NOW))).toBe(0);

      const [after] = await db.select().from(sessionLogs).where(eq(sessionLogs.id, shown));
      expect(after!.seenByPhysioAt).toEqual(NOW);
      expect(after!.updatedAt).toEqual(before!.updatedAt);
      const [untouched] = await db.select().from(sessionLogs).where(eq(sessionLogs.id, later));
      expect(untouched!.seenByPhysioAt).toBeNull();
    });
  });

  describe("getDashboard", () => {
    let dash: TestPhysio;
    let cara: string;
    let dan: string;
    let eli: string;
    let gone: string;

    const live = (customerId: string) =>
      as(dash, (tx, id) => ensureShareLink(tx, id, { target: "customer", customerId }));

    beforeAll(async () => {
      dash = await createTestPhysio({ onboarded: true });
      created.push(dash);
      const exercise = await insertExercise(dash.id);
      const items = [{ exerciseId: exercise }];
      cara = await insertCustomer(dash.id, { firstName: "Cara" });
      dan = await insertCustomer(dash.id, { firstName: "Dan" });
      eli = await insertCustomer(dash.id, { firstName: "Eli" });
      gone = await insertCustomer(dash.id, { firstName: "Gone" });
      const caraRoutine = await insertRoutine(dash.id, cara, { status: "active", items });
      const danRoutine = await insertRoutine(dash.id, dan, { status: "active", items });
      const goneRoutine = await insertRoutine(dash.id, gone, { status: "active", items });
      await insertRoutine(dash.id, eli, { status: "active", sessionsPerWeek: 4, items });
      await Promise.all([cara, dan, eli, gone].map(live));

      await addLog(dash.id, cara, caraRoutine, "2026-10-07", { pain: 8, comment: "ouch" });
      await addLog(dash.id, dan, danRoutine, "2026-10-07", { pain: 6 });
      await addLog(dash.id, gone, goneRoutine, "2026-10-07", { pain: 9, comment: "gone" });
      // Eli should do 4 a week and did nothing in the last 7 days.
      await as(dash, (tx, id) => setCustomerArchived(tx, id, gone, true));
    });

    it("builds the dashboard lists for the physio's active customers", async () => {
      const result = await as(dash, (tx, id) => getDashboard(tx, id, TODAY, NOW));
      expect(result.totals).toEqual({ activeCustomers: 3, sessionsThisWeek: 2 });
      expect(result.attention.map((entry) => entry.name)).toEqual(["Cara", "Eli"]);
      expect(result.attention[0]!.reasons).toEqual([{ rule: "highPain", pain: 8 }]);
      expect(result.attention[1]!.reasons).toEqual([{ rule: "lowAdherence", percent: 0 }]);
      expect(result.newComments).toEqual([
        {
          customerId: cara,
          name: "Cara",
          count: 1,
          latest: { comment: "ouch", performedOn: "2026-10-07", routineName: "Routine" },
        },
      ]);
      expect(result.recentlyActive.map((entry) => entry.name).sort()).toEqual(["Cara", "Dan"]);
    });

    it("drops adherence flags once the link is revoked, and comments once they are seen", async () => {
      const link = await as(dash, (tx, id) =>
        ensureShareLink(tx, id, { target: "customer", customerId: eli }),
      );
      if (!link.ok) throw new Error(link.error);
      await as(dash, (tx, id) => revokeShareLink(tx, id, link.data.link.id));
      const unseen = await db
        .select({ id: sessionLogs.id })
        .from(sessionLogs)
        .where(eq(sessionLogs.customerId, cara));
      await as(dash, (tx, id) =>
        markCommentsSeen(
          tx,
          id,
          cara,
          unseen.map((row) => row.id),
          NOW,
        ),
      );

      const result = await as(dash, (tx, id) => getDashboard(tx, id, TODAY, NOW));
      expect(result.attention.map((entry) => entry.name)).toEqual(["Cara"]);
      expect(result.newComments).toEqual([]);
    });

    it("counts every unseen comment per customer and does not treat undone sessions as activity", async () => {
      const busy = await insertCustomer(dash.id, { firstName: "Busy" });
      const quiet = await insertCustomer(dash.id, { firstName: "Quiet" });
      const exercise = await insertExercise(dash.id);
      const busyRoutine = await insertRoutine(dash.id, busy, {
        status: "active",
        items: [{ exerciseId: exercise }],
      });
      const quietRoutine = await insertRoutine(dash.id, quiet, { status: "active" });
      // 250 unseen comments over distinct days: more than any fixed cap on the query.
      await db.insert(sessionLogs).values(
        Array.from({ length: 250 }, (_, i) => ({
          physioId: dash.id,
          customerId: busy,
          routineId: busyRoutine,
          performedOn: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
          comment: `c${i}`,
        })),
      );
      await addLog(dash.id, quiet, quietRoutine, "2026-10-07", { completed: false });

      const result = await as(dash, (tx, id) => getDashboard(tx, id, TODAY, NOW));
      const entry = result.newComments.find((item) => item.customerId === busy)!;
      expect(entry.count).toBe(250);
      expect(entry.latest.comment).toBe("c249");
      expect(result.recentlyActive.map((item) => item.customerId)).not.toContain(quiet);
    });

    it("flags exercise pain and lists unseen exercise comments", async () => {
      const fay = await insertCustomer(dash.id, { firstName: "Fay" });
      const squat = await insertExercise(dash.id, { name: "Lunge" });
      const fayRoutine = await insertRoutine(dash.id, fay, {
        name: "Hips",
        status: "active",
        items: [{ exerciseId: squat }],
      });
      await live(fay);
      await db.insert(exerciseLogs).values({
        physioId: dash.id,
        customerId: fay,
        routineId: fayRoutine,
        exerciseId: squat,
        performedOn: "2026-10-07",
        pain: 8,
        comment: "sharp",
      });

      const result = await as(dash, (tx, id) => getDashboard(tx, id, TODAY, NOW));
      const flagged = result.attention.find((entry) => entry.customerId === fay);
      expect(flagged!.reasons).toContainEqual({ rule: "highPain", pain: 8 });
      expect(result.newComments.find((entry) => entry.customerId === fay)).toEqual({
        customerId: fay,
        name: "Fay",
        count: 1,
        latest: {
          comment: "sharp",
          performedOn: "2026-10-07",
          routineName: "Hips",
          exerciseName: "Lunge",
        },
      });
    });

    it("sees nothing of another physio's customers", async () => {
      const result = await as(other, (tx, id) => getDashboard(tx, id, TODAY, NOW));
      expect(result).toEqual({
        totals: { activeCustomers: 0, sessionsThisWeek: 0 },
        attention: [],
        newComments: [],
        recentlyActive: [],
      });
    });
  });
});
