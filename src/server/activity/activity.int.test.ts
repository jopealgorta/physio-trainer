import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { exerciseLogs, sessionLogs, weeklyPlanEntries } from "@/db/schema";
import { insertCustomer, insertExercise, insertPlan, insertRoutine } from "@/test/int/content";
import { insertSessionLog } from "@/test/int/logs";
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

    it("keeps sessions from before the 12 weeks in the feed", async () => {
      const old = await addLog(physio.id, ana, knee, "2026-01-05", { comment: "months ago" });
      const { sessions, unseenIds } = await as(physio, (tx, id) =>
        getCustomerActivity(tx, id, ana, TODAY),
      );
      expect(sessions.map((session) => session.comment)).toContain("months ago");
      expect(sessions.at(-1)!.id).toBe(old);
      expect(unseenIds).toContain(old);
      await db.delete(sessionLogs).where(eq(sessionLogs.id, old));
    });

    it("is empty for a customer with no logs and refuses another physio's customer", async () => {
      const empty = await as(physio, (tx, id) => getCustomerActivity(tx, id, beto, TODAY));
      expect(empty.sessions).toEqual([]);
      expect(empty.pain.overall).toEqual([]);
      expect(empty.summary).toEqual({
        completed: 0,
        lastLoggedOn: null,
        adherence: { planned: 0, completed: 0, ratio: null },
      });

      const foreign = await as(other, (tx, id) => getCustomerActivity(tx, id, ana, TODAY));
      expect(foreign.sessions).toEqual([]);
      expect(foreign.pain.overall).toEqual([]);
    });
  });

  describe("exercise logs", () => {
    let squat: string;
    let kneeRoutine: string;
    let oneId: string;
    let twoId: string;
    let sessionOne: string;
    let sessionTwo: string;
    let lastSessionId = "";
    const addExerciseLog = async (
      customerId: string,
      performedOn: string,
      values: Partial<typeof exerciseLogs.$inferInsert> = {},
      physioId = physio.id,
    ) => {
      const sessionLogId = await insertSessionLog(physioId, {
        customerId,
        routineId: kneeRoutine,
        performedOn,
        weeklyPlanEntryId: values.weeklyPlanEntryId,
      });
      const [row] = await db
        .insert(exerciseLogs)
        .values({
          physioId,
          customerId,
          routineId: kneeRoutine,
          sessionLogId,
          exerciseId: squat,
          performedOn,
          ...values,
        })
        .returning({ id: exerciseLogs.id });
      lastSessionId = sessionLogId;
      return row!.id;
    };

    beforeAll(async () => {
      squat = await insertExercise(physio.id, { name: "Goblet squat" });
      kneeRoutine = await insertRoutine(physio.id, beto, {
        name: "Beto knee",
        status: "active",
        items: [{ exerciseId: squat }],
      });
      oneId = await addExerciseLog(beto, "2026-10-06", {
        pain: 4,
        rpe: 6,
        weightKg: 12.5,
        setWeightsKg: [20, null, 25],
      });
      sessionOne = lastSessionId;
      twoId = await addExerciseLog(beto, "2026-10-07", { comment: "felt ok" });
      sessionTwo = lastSessionId;
    });

    it("lists sessions newest first with their exercises", async () => {
      const { sessions } = await as(physio, (tx, id) => getCustomerActivity(tx, id, beto, TODAY));
      expect(sessions.map((session) => session.performedOn)).toEqual(["2026-10-07", "2026-10-06"]);
      expect(sessions[1]).toEqual({
        id: sessionOne,
        routineName: "Beto knee",
        performedOn: "2026-10-06",
        completed: true,
        pain: null,
        rpe: null,
        comment: null,
        seen: true,
        exercises: [
          {
            id: oneId,
            exerciseName: "Goblet squat",
            pain: 4,
            rpe: 6,
            weightKg: 12.5,
            setWeightsKg: [20, null, 25],
            comment: null,
            seen: true,
          },
        ],
      });
    });

    it("lists a session's exercises in routine order, removed ones last in log order", async () => {
      const lunge = await insertExercise(physio.id, { name: "Lunge" });
      const plank = await insertExercise(physio.id, { name: "Plank" });
      const bridge = await insertExercise(physio.id, { name: "Bridge" });
      const gone = await insertExercise(physio.id, { name: "Removed one" });
      const routine = await insertRoutine(physio.id, beto, {
        name: "Beto order",
        status: "active",
        // Plank (position 0) and Lunge (1) are in the routine; Lunge appears again later.
        items: [{ exerciseId: plank }, { exerciseId: lunge }, { exerciseId: lunge }],
      });
      const sessionLogId = await insertSessionLog(physio.id, {
        customerId: beto,
        routineId: routine,
        performedOn: "2026-10-03",
      });
      const base = { physioId: physio.id, customerId: beto, routineId: routine, sessionLogId };
      const ids: string[] = [];
      // Logged in the opposite order: removed, bridge (also removed), lunge, then plank.
      for (const exerciseId of [gone, bridge, lunge, plank]) {
        const [row] = await db
          .insert(exerciseLogs)
          .values({ ...base, exerciseId, performedOn: "2026-10-03", rpe: 3 })
          .returning({ id: exerciseLogs.id });
        ids.push(row!.id);
      }
      const { sessions } = await as(physio, (tx, id) => getCustomerActivity(tx, id, beto, TODAY));
      const shown = sessions.find((session) => session.id === sessionLogId)!;
      expect(shown.exercises.map((e) => e.exerciseName)).toEqual([
        "Plank",
        "Lunge",
        "Removed one",
        "Bridge",
      ]);
      await db.delete(sessionLogs).where(eq(sessionLogs.id, sessionLogId));
    });

    it("returns unseen ids for the shown session and exercise comments", async () => {
      const sessionId = await insertSessionLog(physio.id, {
        customerId: beto,
        routineId: kneeRoutine,
        performedOn: "2026-10-08",
        comment: "whole session",
      });
      const { sessions, unseenIds, unseenExerciseIds } = await as(physio, (tx, id) =>
        getCustomerActivity(tx, id, beto, TODAY),
      );
      expect(sessions[0]).toMatchObject({ id: sessionId, comment: "whole session", seen: false });
      expect(unseenIds).toEqual([sessionId]);
      expect(unseenExerciseIds).toEqual([twoId]);
      expect(sessions.find((session) => session.id === sessionTwo)!.exercises[0]).toMatchObject({
        comment: "felt ok",
        seen: false,
      });
      await db.delete(sessionLogs).where(eq(sessionLogs.id, sessionId));
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

  describe("session feed", () => {
    it("leaves out sessions with nothing to read", async () => {
      const carla = await insertCustomer(physio.id, { firstName: "Carla" });
      const routine = await insertRoutine(physio.id, carla, { status: "active" });
      await insertSessionLog(physio.id, {
        customerId: carla,
        routineId: routine,
        performedOn: TODAY,
      });
      const { sessions } = await as(physio, (tx, id) => getCustomerActivity(tx, id, carla, TODAY));
      expect(sessions).toEqual([]);
    });

    it("shows an undone session that has exercise logs", async () => {
      const dora = await insertCustomer(physio.id, { firstName: "Dora" });
      const exerciseId = await insertExercise(physio.id, { name: "Plank" });
      const routine = await insertRoutine(physio.id, dora, {
        status: "active",
        items: [{ exerciseId }],
      });
      const sessionLogId = await insertSessionLog(physio.id, {
        customerId: dora,
        routineId: routine,
        performedOn: TODAY,
        completed: false,
      });
      await db.insert(exerciseLogs).values({
        physioId: physio.id,
        customerId: dora,
        routineId: routine,
        sessionLogId,
        exerciseId,
        performedOn: TODAY,
        rpe: 5,
      });
      const { sessions } = await as(physio, (tx, id) => getCustomerActivity(tx, id, dora, TODAY));
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({ id: sessionLogId, completed: false });
      expect(sessions[0]!.exercises.map((e) => e.exerciseName)).toEqual(["Plank"]);
    });

    it("caps the feed at 30 sessions", async () => {
      const eli = await insertCustomer(physio.id, { firstName: "Eli" });
      const routine = await insertRoutine(physio.id, eli, { status: "active" });
      const days = Array.from({ length: 31 }, (_, i) => {
        const date = new Date(Date.UTC(2026, 8, 1 + i));
        return date.toISOString().slice(0, 10);
      });
      const inserted = await db
        .insert(sessionLogs)
        .values(
          days.map((performedOn) => ({
            physioId: physio.id,
            customerId: eli,
            routineId: routine,
            performedOn,
            comment: `on ${performedOn}`,
          })),
        )
        .returning({ id: sessionLogs.id, performedOn: sessionLogs.performedOn });
      const { sessions } = await as(physio, (tx, id) => getCustomerActivity(tx, id, eli, TODAY));
      expect(sessions).toHaveLength(30);
      expect(sessions[0]!.performedOn).toBe(days.at(-1));
      const oldest = inserted.find((row) => row.performedOn === days[0])!;
      expect(sessions.map((session) => session.id)).not.toContain(oldest.id);
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
      const faySession = await insertSessionLog(dash.id, {
        customerId: fay,
        routineId: fayRoutine,
        performedOn: "2026-10-07",
      });
      await db.insert(exerciseLogs).values({
        physioId: dash.id,
        customerId: fay,
        routineId: fayRoutine,
        sessionLogId: faySession,
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
