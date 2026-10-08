import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import {
  cases,
  customers,
  exercises,
  routineGroups,
  routineItemSets,
  routineItems,
  routineSections,
  routines,
  weeklyPlanDays,
  weeklyPlanEntries,
  weeklyPlanVersions,
  weeklyPlans,
} from "@/db/schema";
import { DEFAULT_PLAN_FILTERS } from "@/lib/plan-params";
import { MAX_ENTRIES_PER_DAY } from "@/lib/plans";
import { listPlansUsingRoutine } from "@/server/routines/hooks";
import { createRoutine, saveRoutine } from "@/server/routines/mutations";
import { saveRoutineSchema } from "@/server/routines/schemas";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import {
  addEntry,
  addNewRoutineEntry,
  copyEntry,
  createPlan,
  makeSeparateCopy,
  moveEntry,
  removeEntry,
  renamePlan,
  setDayNotes,
  setEntryLabel,
  updatePlan,
} from "./mutations";
import { getPlan, listAttachableRoutines, listPlans } from "./queries";

const RANDOM_ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

describe("weekly plans server layer", () => {
  const created: TestPhysio[] = [];
  let a: TestPhysio;
  let b: TestPhysio;

  const fresh = async () => {
    const physio = await createTestPhysio({ onboarded: true });
    created.push(physio);
    return physio;
  };
  const as = <T>(who: TestPhysio, fn: Parameters<typeof runAsPhysio<T>>[1]) =>
    runAsPhysio(who.claims, fn);

  const customer = async (who: TestPhysio, firstName = "Ana") => {
    const [row] = await db
      .insert(customers)
      .values({ physioId: who.id, firstName, locale: "en" })
      .returning({ id: customers.id });
    return row.id;
  };
  const kase = async (who: TestPhysio, customerId: string) => {
    const [row] = await db
      .insert(cases)
      .values({ physioId: who.id, customerId, title: "Knee" })
      .returning({ id: cases.id });
    return row.id;
  };
  const routine = async (
    who: TestPhysio,
    customerId: string,
    name = "Routine",
    overrides: Partial<typeof routines.$inferInsert> = {},
  ) => {
    const [row] = await db
      .insert(routines)
      .values({ physioId: who.id, customerId, name, ...overrides })
      .returning({ id: routines.id });
    return row.id;
  };
  const plan = async (who: TestPhysio, customerId: string, caseId: string | null = null) => {
    const result = await as(who, (tx, id) =>
      createPlan(tx, id, { customerId, name: "Week", caseId }),
    );
    if (!result.ok) throw new Error(result.error);
    return result.data.id;
  };
  const attach = async (who: TestPhysio, planId: string, routineId: string, weekday: number) => {
    const result = await as(who, (tx, id) =>
      addEntry(tx, id, { planId, weekday, routineId, label: null }),
    );
    if (!result.ok) throw new Error(result.error);
    return result.data.entryId;
  };
  const layout = async (planId: string) => {
    const rows = await db
      .select()
      .from(weeklyPlanEntries)
      .where(eq(weeklyPlanEntries.weeklyPlanId, planId));
    const days: Record<number, string[]> = {};
    for (const row of rows.sort((x, y) => x.position - y.position)) {
      (days[row.weekday] ??= []).push(row.id);
    }
    return days;
  };
  const versionOf = async (planId: string) =>
    (await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, planId)))[0].version;

  beforeAll(async () => {
    a = await fresh();
    b = await fresh();
  });
  afterAll(() => deleteTestPhysios(...created));

  describe("createPlan", () => {
    it("creates a draft plan for the customer", async () => {
      const customerId = await customer(a);
      const caseId = await kase(a, customerId);
      const id = await plan(a, customerId, caseId);
      const [row] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, id));
      expect(row).toMatchObject({
        customerId,
        caseId,
        status: "draft",
        version: 1,
        physioId: a.id,
      });
    });

    it("rejects another physio's customer, a malformed id and a case of another customer", async () => {
      const mine = await customer(a);
      const mine2 = await customer(a, "Ivo");
      const theirs = await customer(b, "Bea");
      const foreignCase = await kase(a, mine2);
      const call = (customerId: string, caseId: string | null = null) =>
        as(a, (tx, id) => createPlan(tx, id, { customerId, name: "X", caseId }));
      await expect(call(theirs)).resolves.toEqual({ ok: false, error: "customerNotFound" });
      await expect(call("nope")).resolves.toEqual({ ok: false, error: "customerNotFound" });
      await expect(call(mine, foreignCase)).resolves.toEqual({ ok: false, error: "caseNotFound" });
      await expect(call(mine, RANDOM_ID)).resolves.toEqual({ ok: false, error: "caseNotFound" });
    });
  });

  describe("addEntry", () => {
    it("attaches routines to days in order, with a label, bumping the version", async () => {
      const customerId = await customer(a);
      const planId = await plan(a, customerId);
      const r1 = await routine(a, customerId, "Gym");
      const r2 = await routine(a, customerId, "Rehab");
      const first = await attach(a, planId, r1, 1);
      const second = await as(a, (tx, id) =>
        addEntry(tx, id, { planId, weekday: 1, routineId: r2, label: "Evening" }),
      );
      expect(second.ok).toBe(true);
      const days = await layout(planId);
      expect(days[1]).toEqual([first, (second as { data: { entryId: string } }).data.entryId]);
      const rows = await db
        .select()
        .from(weeklyPlanEntries)
        .where(eq(weeklyPlanEntries.weeklyPlanId, planId));
      expect(rows.find((row) => row.label === "Evening")?.position).toBe(1);
      expect(await versionOf(planId)).toBe(3);
    });

    it("rejects a routine of another customer or another physio (cross-customer attach)", async () => {
      const c1 = await customer(a);
      const c2 = await customer(a, "Ivo");
      const planId = await plan(a, c1);
      const otherCustomersRoutine = await routine(a, c2);
      const otherPhysiosRoutine = await routine(b, await customer(b, "Bea"));
      for (const routineId of [otherCustomersRoutine, otherPhysiosRoutine, RANDOM_ID]) {
        await expect(
          as(a, (tx, id) => addEntry(tx, id, { planId, weekday: 1, routineId, label: null })),
        ).resolves.toEqual({ ok: false, error: "routineNotFound" });
      }
      expect(await layout(planId)).toEqual({});
      expect(await versionOf(planId)).toBe(1);
    });

    it("rejects an archived routine", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const archived = await routine(a, c, "Old", { status: "archived" });
      await expect(
        as(a, (tx, id) =>
          addEntry(tx, id, { planId, weekday: 2, routineId: archived, label: null }),
        ),
      ).resolves.toEqual({ ok: false, error: "routineArchived" });
    });

    it("rejects a seventh routine on a day (rule 4) but not on another day", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const r = await routine(a, c);
      for (let i = 0; i < MAX_ENTRIES_PER_DAY; i++) await attach(a, planId, r, 3);
      await expect(
        as(a, (tx, id) => addEntry(tx, id, { planId, weekday: 3, routineId: r, label: null })),
      ).resolves.toEqual({ ok: false, error: "dayFull" });
      await expect(
        as(a, (tx, id) => addEntry(tx, id, { planId, weekday: 4, routineId: r, label: null })),
      ).resolves.toMatchObject({ ok: true });
    });

    it("rule 1: 'Also show on its own' unticked makes the routine non-standalone", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const r = await routine(a, c);
      const kept = await routine(a, c);
      await as(a, (tx, id) =>
        addEntry(tx, id, { planId, weekday: 1, routineId: r, label: null, standalone: false }),
      );
      await attach(a, planId, kept, 2);
      const rows = await db
        .select()
        .from(routines)
        .where(inArray(routines.id, [r, kept]));
      expect(rows.find((row) => row.id === r)?.isStandalone).toBe(false);
      expect(rows.find((row) => row.id === kept)?.isStandalone).toBe(true);
    });

    it("cannot touch another physio's plan", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const r = await routine(b, await customer(b, "Bea"));
      await expect(
        as(b, (tx, id) => addEntry(tx, id, { planId, weekday: 1, routineId: r, label: null })),
      ).resolves.toEqual({ ok: false, error: "notFound" });
    });
  });

  describe("addNewRoutineEntry", () => {
    it("creates a non-standalone draft routine with the plan's case and attaches it", async () => {
      const c = await customer(a);
      const caseId = await kase(a, c);
      const planId = await plan(a, c, caseId);
      const result = await as(a, (tx, id) =>
        addNewRoutineEntry(tx, id, { planId, weekday: 5, name: "Upper body" }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const [created] = await db
        .select()
        .from(routines)
        .where(eq(routines.id, result.data.routineId));
      expect(created).toMatchObject({
        name: "Upper body",
        isStandalone: false,
        status: "draft",
        customerId: c,
        caseId,
      });
      expect((await layout(planId))[5]).toEqual([result.data.entryId]);
    });

    it("creates nothing when the day is full", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const r = await routine(a, c);
      for (let i = 0; i < MAX_ENTRIES_PER_DAY; i++) await attach(a, planId, r, 6);
      const before = await db.select().from(routines).where(eq(routines.customerId, c));
      await expect(
        as(a, (tx, id) => addNewRoutineEntry(tx, id, { planId, weekday: 6, name: "Extra" })),
      ).resolves.toEqual({ ok: false, error: "dayFull" });
      expect(await db.select().from(routines).where(eq(routines.customerId, c))).toHaveLength(
        before.length,
      );
    });
  });

  describe("moveEntry and copyEntry", () => {
    it("reorders within a day, moves between days, and rewrites positions", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const r = await routine(a, c);
      const [e1, e2, e3] = [
        await attach(a, planId, r, 1),
        await attach(a, planId, r, 1),
        await attach(a, planId, r, 1),
      ];
      await as(a, (tx, id) => moveEntry(tx, id, { planId, entryId: e3, weekday: 1, index: 0 }));
      expect((await layout(planId))[1]).toEqual([e3, e1, e2]);
      await as(a, (tx, id) => moveEntry(tx, id, { planId, entryId: e1, weekday: 2, index: 0 }));
      expect(await layout(planId)).toEqual({ 1: [e3, e2], 2: [e1] });
      const positions = await db
        .select({ position: weeklyPlanEntries.position })
        .from(weeklyPlanEntries)
        .where(and(eq(weeklyPlanEntries.weeklyPlanId, planId), eq(weeklyPlanEntries.weekday, 1)));
      expect(positions.map((row) => row.position).sort()).toEqual([0, 1]);
    });

    it("a no-op move does not bump the version; an unknown entry or full day is refused", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const r = await routine(a, c);
      const e1 = await attach(a, planId, r, 1);
      const before = await versionOf(planId);
      await as(a, (tx, id) => moveEntry(tx, id, { planId, entryId: e1, weekday: 1, index: 0 }));
      expect(await versionOf(planId)).toBe(before);
      await expect(
        as(a, (tx, id) => moveEntry(tx, id, { planId, entryId: RANDOM_ID, weekday: 2, index: 0 })),
      ).resolves.toEqual({ ok: false, error: "entryNotFound" });
      for (let i = 0; i < MAX_ENTRIES_PER_DAY; i++) await attach(a, planId, r, 2);
      await expect(
        as(a, (tx, id) => moveEntry(tx, id, { planId, entryId: e1, weekday: 2, index: 0 })),
      ).resolves.toEqual({ ok: false, error: "dayFull" });
      expect((await layout(planId))[1]).toEqual([e1]);
    });

    it("copy adds another entry for the same routine (by reference), keeping the label", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const r = await routine(a, c);
      const source = await as(a, (tx, id) =>
        addEntry(tx, id, { planId, weekday: 1, routineId: r, label: "Morning" }),
      );
      if (!source.ok) throw new Error(source.error);
      const copy = await as(a, (tx, id) =>
        copyEntry(tx, id, { planId, entryId: source.data.entryId, weekday: 4 }),
      );
      expect(copy.ok).toBe(true);
      if (!copy.ok) return;
      const rows = await db
        .select()
        .from(weeklyPlanEntries)
        .where(eq(weeklyPlanEntries.weeklyPlanId, planId));
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((row) => row.routineId))).toEqual(new Set([r]));
      expect(rows.find((row) => row.id === copy.data.entryId)).toMatchObject({
        weekday: 4,
        label: "Morning",
        position: 0,
      });
      expect(await db.select().from(routines).where(eq(routines.customerId, c))).toHaveLength(1);
    });

    it("copy refuses a full day and an unknown entry", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const r = await routine(a, c);
      const e1 = await attach(a, planId, r, 1);
      for (let i = 0; i < MAX_ENTRIES_PER_DAY; i++) await attach(a, planId, r, 2);
      await expect(
        as(a, (tx, id) => copyEntry(tx, id, { planId, entryId: e1, weekday: 2 })),
      ).resolves.toEqual({ ok: false, error: "dayFull" });
      await expect(
        as(a, (tx, id) => copyEntry(tx, id, { planId, entryId: RANDOM_ID, weekday: 3 })),
      ).resolves.toEqual({ ok: false, error: "entryNotFound" });
    });

    it("an entry of another plan cannot be moved through this plan", async () => {
      const c = await customer(a);
      const planA = await plan(a, c);
      const planB = await plan(a, c);
      const r = await routine(a, c);
      const entry = await attach(a, planA, r, 1);
      await expect(
        as(a, (tx, id) =>
          moveEntry(tx, id, { planId: planB, entryId: entry, weekday: 2, index: 0 }),
        ),
      ).resolves.toEqual({ ok: false, error: "entryNotFound" });
    });
  });

  describe("setEntryLabel", () => {
    it("sets and clears the label", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const entryId = await attach(a, planId, await routine(a, c), 1);
      await as(a, (tx, id) => setEntryLabel(tx, id, { planId, entryId, label: "Morning" }));
      const [set] = await db
        .select()
        .from(weeklyPlanEntries)
        .where(eq(weeklyPlanEntries.id, entryId));
      expect(set.label).toBe("Morning");
      await as(a, (tx, id) => setEntryLabel(tx, id, { planId, entryId, label: null }));
      const [cleared] = await db
        .select()
        .from(weeklyPlanEntries)
        .where(eq(weeklyPlanEntries.id, entryId));
      expect(cleared.label).toBeNull();
      await expect(
        as(a, (tx, id) => setEntryLabel(tx, id, { planId, entryId: RANDOM_ID, label: "x" })),
      ).resolves.toEqual({ ok: false, error: "entryNotFound" });
    });
  });

  describe("setDayNotes", () => {
    it("sets, replaces and clears a day's note, bumping the version", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const set = (weekday: number, notes: string | null) =>
        as(a, (tx, id) => setDayNotes(tx, id, { planId, weekday, notes }));
      const notesOf = async () => (await as(a, (tx, id) => getPlan(tx, id, planId)))?.dayNotes;
      const v = await versionOf(planId);

      await expect(set(3, "Easy day")).resolves.toEqual({ ok: true, data: {} });
      expect(await notesOf()).toEqual({ 3: "Easy day" });
      expect(await versionOf(planId)).toBe(v + 1);

      await set(3, "Rest");
      expect(await notesOf()).toEqual({ 3: "Rest" });
      await set(5, "Pool");
      expect(await notesOf()).toEqual({ 3: "Rest", 5: "Pool" });

      await set(3, null);
      expect(await notesOf()).toEqual({ 5: "Pool" });
      expect(await versionOf(planId)).toBe(v + 4);
    });

    it("refuses another physio's plan", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      await expect(
        as(b, (tx, id) => setDayNotes(tx, id, { planId, weekday: 1, notes: "x" })),
      ).resolves.toEqual({ ok: false, error: "notFound" });
      expect(
        await db.select().from(weeklyPlanDays).where(eq(weeklyPlanDays.weeklyPlanId, planId)),
      ).toEqual([]);
    });
  });

  describe("removeEntry (rule 3)", () => {
    const setup = async (isStandalone: boolean) => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const r = await routine(a, c, "Board routine", { isStandalone });
      return { c, planId, r };
    };
    const exists = async (id: string) =>
      (await db.select().from(routines).where(eq(routines.id, id))).length === 1;

    it("closes the gap in the day's positions", async () => {
      const { planId, r } = await setup(true);
      const [e1, e2, e3] = [
        await attach(a, planId, r, 1),
        await attach(a, planId, r, 1),
        await attach(a, planId, r, 1),
      ];
      await as(a, (tx, id) => removeEntry(tx, id, { planId, entryId: e1 }));
      const rows = await db
        .select()
        .from(weeklyPlanEntries)
        .where(eq(weeklyPlanEntries.weeklyPlanId, planId));
      expect(Object.fromEntries(rows.map((row) => [row.id, row.position]))).toEqual({
        [e2]: 0,
        [e3]: 1,
      });
    });

    it("deletes a non-standalone routine with its last reference when asked", async () => {
      const { planId, r } = await setup(false);
      const entryId = await attach(a, planId, r, 1);
      const result = await as(a, (tx, id) =>
        removeEntry(tx, id, { planId, entryId, deleteRoutine: true }),
      );
      expect(result).toEqual({ ok: true, data: { deletedRoutine: true } });
      expect(await exists(r)).toBe(false);
    });

    it("keeps the routine when not asked, when standalone, or when still referenced", async () => {
      const keep = await setup(false);
      const e = await attach(a, keep.planId, keep.r, 1);
      await expect(
        as(a, (tx, id) => removeEntry(tx, id, { planId: keep.planId, entryId: e })),
      ).resolves.toEqual({ ok: true, data: { deletedRoutine: false } });
      expect(await exists(keep.r)).toBe(true);

      const standalone = await setup(true);
      const e2 = await attach(a, standalone.planId, standalone.r, 1);
      await expect(
        as(a, (tx, id) =>
          removeEntry(tx, id, { planId: standalone.planId, entryId: e2, deleteRoutine: true }),
        ),
      ).resolves.toEqual({ ok: true, data: { deletedRoutine: false } });
      expect(await exists(standalone.r)).toBe(true);

      const shared = await setup(false);
      const first = await attach(a, shared.planId, shared.r, 1);
      await attach(a, shared.planId, shared.r, 2);
      await expect(
        as(a, (tx, id) =>
          removeEntry(tx, id, { planId: shared.planId, entryId: first, deleteRoutine: true }),
        ),
      ).resolves.toEqual({ ok: true, data: { deletedRoutine: false } });
      expect(await exists(shared.r)).toBe(true);
    });

    it("keeps the routine instead of failing when another plan attaches it meanwhile", async () => {
      const { c, planId, r } = await setup(false);
      const entryId = await attach(a, planId, r, 1);
      const otherPlan = await plan(a, c);
      // The other plan's entry appears after this transaction's count: simulate it by inserting
      // from inside the transaction, between the entry delete and the routine delete.
      const result = await as(a, async (tx, id) => {
        const real = tx.transaction.bind(tx);
        (tx as unknown as { transaction: typeof tx.transaction }).transaction = (async (
          fn: Parameters<typeof tx.transaction>[0],
        ) => {
          await db.insert(weeklyPlanEntries).values({
            physioId: a.id,
            weeklyPlanId: otherPlan,
            weekday: 2,
            routineId: r,
            position: 0,
          });
          return real(fn);
        }) as typeof tx.transaction;
        return removeEntry(tx, id, { planId, entryId, deleteRoutine: true });
      });
      expect(result).toEqual({ ok: true, data: { deletedRoutine: false } });
      expect(await exists(r)).toBe(true);
    });

    it("does not delete a routine that another plan still uses", async () => {
      const { c, planId, r } = await setup(false);
      const otherPlan = await plan(a, c);
      await attach(a, otherPlan, r, 1);
      const entryId = await attach(a, planId, r, 1);
      await expect(
        as(a, (tx, id) => removeEntry(tx, id, { planId, entryId, deleteRoutine: true })),
      ).resolves.toEqual({ ok: true, data: { deletedRoutine: false } });
      expect(await exists(r)).toBe(true);
    });
  });

  describe("makeSeparateCopy (rule 2)", () => {
    it("duplicates the routine with items, sets and groups and repoints only that entry", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const [exercise] = await db
        .insert(exercises)
        .values({ physioId: a.id, name: "Bridge" })
        .returning({ id: exercises.id });
      const created = await as(a, (tx, id) =>
        createRoutine(tx, id, { customerId: c, name: "Knee rehab A", caseId: null }),
      );
      if (!created.ok) throw new Error(created.error);
      const original = created.data.id;
      const saved = await as(a, (tx, id) =>
        saveRoutine(
          tx,
          id,
          saveRoutineSchema.parse({
            id: original,
            version: 1,
            name: "Knee rehab A",
            notes: "Slow",
            caseId: null,
            sessionsPerWeek: 3,
            sessionsPerDay: null,
            status: "active",
            sections: [{ key: "s", name: "Main" }],
            groups: [{ key: "g", restSeconds: 45 }],
            items: [
              {
                exerciseId: exercise.id,
                groupKey: "g",
                sectionKey: "s",
                holdSeconds: 5,
                restSeconds: null,
                side: "left",
                notes: "n",
                sets: [
                  { reps: 12, repsMax: null, durationSeconds: null, load: "5 kg" },
                  { reps: 10, repsMax: null, durationSeconds: null, load: null },
                ],
              },
              {
                exerciseId: exercise.id,
                groupKey: "g",
                sectionKey: "s",
                holdSeconds: null,
                restSeconds: null,
                side: null,
                notes: null,
                sets: [
                  { reps: 8, repsMax: 12, durationSeconds: null, load: null },
                  { reps: null, repsMax: null, durationSeconds: 30, load: null },
                ],
              },
            ],
          }),
        ),
      );
      expect(saved.ok).toBe(true);

      const monday = await attach(a, planId, original, 1);
      const friday = await attach(a, planId, original, 5);
      const result = await as(a, (tx, id) =>
        makeSeparateCopy(tx, id, { planId, entryId: friday }, (name) => `${name} (copy)`),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const copyId = result.data.routineId;
      expect(copyId).not.toBe(original);

      const entries = await db
        .select()
        .from(weeklyPlanEntries)
        .where(eq(weeklyPlanEntries.weeklyPlanId, planId));
      expect(entries.find((row) => row.id === monday)?.routineId).toBe(original);
      expect(entries.find((row) => row.id === friday)?.routineId).toBe(copyId);

      const [copy] = await db.select().from(routines).where(eq(routines.id, copyId));
      expect(copy).toMatchObject({
        name: "Knee rehab A (copy)",
        notes: "Slow",
        status: "active",
        isStandalone: false,
        sessionsPerWeek: 3,
        customerId: c,
      });
      const groups = await db
        .select()
        .from(routineGroups)
        .where(eq(routineGroups.routineId, copyId));
      expect(groups.map((row) => row.restSeconds)).toEqual([45]);
      const items = await db
        .select()
        .from(routineItems)
        .where(eq(routineItems.routineId, copyId))
        .orderBy(routineItems.position);
      expect(items).toHaveLength(2);
      expect(items.every((row) => row.groupId === groups[0].id)).toBe(true);
      expect(items[0]).toMatchObject({ holdSeconds: 5, side: "left", notes: "n" });
      // Both items have sets at positions 0 and 1, so order by the item's position as well: sorting
      // by set position alone leaves the tie between items up to Postgres.
      const sets = await db
        .select({
          reps: routineItemSets.reps,
          repsMax: routineItemSets.repsMax,
          durationSeconds: routineItemSets.durationSeconds,
          load: routineItemSets.load,
        })
        .from(routineItemSets)
        .innerJoin(routineItems, eq(routineItemSets.routineItemId, routineItems.id))
        .where(eq(routineItems.routineId, copyId))
        .orderBy(routineItemSets.position, routineItems.position);
      expect(sets.map((row) => [row.reps, row.repsMax, row.durationSeconds, row.load])).toEqual([
        [12, null, null, "5 kg"],
        [8, 12, null, null],
        [10, null, null, null],
        [null, null, 30, null],
      ]);

      // The two routines are independent from now on.
      const reload = await db
        .select()
        .from(routineItems)
        .where(eq(routineItems.routineId, original));
      expect(reload).toHaveLength(2);
      const copyItemIds = new Set(items.map((row) => row.id));
      expect(reload.some((row) => copyItemIds.has(row.id))).toBe(false);
    });

    it("refuses a plan-only routine nothing else uses, but not a standalone one", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const planOnly = await routine(a, c, "Only here", { isStandalone: false });
      const standalone = await routine(a, c, "On its own");
      const e1 = await attach(a, planId, planOnly, 1);
      const e2 = await attach(a, planId, standalone, 2);
      const copyName = (name: string) => `${name} (copy)`;
      await expect(
        as(a, (tx, id) => makeSeparateCopy(tx, id, { planId, entryId: e1 }, copyName)),
      ).resolves.toEqual({ ok: false, error: "notShared" });
      expect((await db.select().from(routines).where(eq(routines.customerId, c))).length).toBe(2);
      await expect(
        as(a, (tx, id) => makeSeparateCopy(tx, id, { planId, entryId: e2 }, copyName)),
      ).resolves.toMatchObject({ ok: true });
    });

    it("an archived routine is copied as a draft", async () => {
      const c = await customer(a);
      const planA = await plan(a, c);
      const planB = await plan(a, c);
      const r = await routine(a, c, "Soon archived");
      await attach(a, planA, r, 1);
      const entry = await attach(a, planB, r, 1);
      await db.update(routines).set({ status: "archived" }).where(eq(routines.id, r));
      const result = await as(a, (tx, id) =>
        makeSeparateCopy(tx, id, { planId: planB, entryId: entry }, (name) => `${name} (copy)`),
      );
      if (!result.ok) throw new Error(result.error);
      const [copy] = await db.select().from(routines).where(eq(routines.id, result.data.routineId));
      expect(copy.status).toBe("draft");
    });

    it("refuses an unknown entry and another physio's plan", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const copyName = (name: string) => `${name} (copy)`;
      await expect(
        as(a, (tx, id) => makeSeparateCopy(tx, id, { planId, entryId: RANDOM_ID }, copyName)),
      ).resolves.toEqual({ ok: false, error: "entryNotFound" });
      await expect(
        as(b, (tx, id) => makeSeparateCopy(tx, id, { planId, entryId: RANDOM_ID }, copyName)),
      ).resolves.toEqual({ ok: false, error: "notFound" });
    });
  });

  describe("updatePlan", () => {
    it("activating needs at least one entry (rule 4), then works", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const input = { id: planId, name: "Week", notes: null, caseId: null };
      await expect(
        as(a, (tx, id) => updatePlan(tx, id, { ...input, status: "active" })),
      ).resolves.toEqual({ ok: false, error: "needsEntries" });
      await attach(a, planId, await routine(a, c), 1);
      const before = await versionOf(planId);
      await expect(
        as(a, (tx, id) => updatePlan(tx, id, { ...input, status: "active" })),
      ).resolves.toEqual({ ok: true, data: { version: before + 1 } });
    });

    it("archiving a plan leaves its routines alone (rule 6) and a case must fit the customer", async () => {
      const c = await customer(a);
      const c2 = await customer(a, "Ivo");
      const planId = await plan(a, c);
      const r = await routine(a, c);
      await attach(a, planId, r, 1);
      const foreignCase = await kase(a, c2);
      const input = {
        id: planId,
        name: "Week",
        notes: "n",
        caseId: null,
        status: "archived",
      } as const;
      await expect(
        as(a, (tx, id) => updatePlan(tx, id, { ...input, caseId: foreignCase })),
      ).resolves.toEqual({ ok: false, error: "caseNotFound" });
      await expect(as(a, (tx, id) => updatePlan(tx, id, input))).resolves.toMatchObject({
        ok: true,
      });
      const [routineRow] = await db.select().from(routines).where(eq(routines.id, r));
      expect(routineRow.status).toBe("draft");
    });

    it("activating refuses a plan that holds an archived routine", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const r = await routine(a, c, "Gone", { status: "archived" });
      // A draft plan can hold it: only active plans block archiving, so it may be archived later.
      await db
        .insert(weeklyPlanEntries)
        .values({ physioId: a.id, weeklyPlanId: planId, weekday: 1, routineId: r, position: 0 });
      await expect(
        as(a, (tx, id) =>
          updatePlan(tx, id, {
            id: planId,
            name: "W",
            notes: null,
            caseId: null,
            status: "active",
          }),
        ),
      ).resolves.toEqual({ ok: false, error: "hasArchivedRoutines" });
      await db.update(routines).set({ status: "active" }).where(eq(routines.id, r));
      await expect(
        as(a, (tx, id) =>
          updatePlan(tx, id, {
            id: planId,
            name: "W",
            notes: null,
            caseId: null,
            status: "active",
          }),
        ),
      ).resolves.toMatchObject({ ok: true });
    });

    it("is not found for another physio's plan", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      await expect(
        as(b, (tx, id) =>
          updatePlan(tx, id, { id: planId, name: "x", notes: null, caseId: null, status: "draft" }),
        ),
      ).resolves.toEqual({ ok: false, error: "notFound" });
    });
  });

  describe("renamePlan", () => {
    it("renames only, bumping the version", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      await as(a, (tx, id) =>
        updatePlan(tx, id, { id: planId, notes: "Keep", caseId: null, status: "draft" }),
      );
      const before = await versionOf(planId);
      await expect(
        as(a, (tx, id) => renamePlan(tx, id, { id: planId, name: "Week 2" })),
      ).resolves.toEqual({ ok: true, data: { version: before + 1 } });
      const [row] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, planId));
      expect(row).toMatchObject({ name: "Week 2", notes: "Keep", status: "draft" });
      // Recorded in the history like any other edit (spec 15).
      const versions = await db
        .select()
        .from(weeklyPlanVersions)
        .where(eq(weeklyPlanVersions.weeklyPlanId, planId));
      const latest = versions.sort((x, y) => y.version - x.version)[0];
      expect(latest).toMatchObject({ version: before + 1, kind: "edited" });
      expect(latest.snapshot).toMatchObject({ plan: { name: "Week 2" } });
    });

    it("saving the details without a name keeps the name", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      await as(a, (tx, id) => renamePlan(tx, id, { id: planId, name: "Renamed" }));
      await as(a, (tx, id) =>
        updatePlan(tx, id, { id: planId, notes: "n", caseId: null, status: "draft" }),
      );
      const [row] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, planId));
      expect(row).toMatchObject({ name: "Renamed", notes: "n" });
    });

    it("is not found for another physio's plan", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      await expect(
        as(b, (tx, id) => renamePlan(tx, id, { id: planId, name: "Mine" })),
      ).resolves.toEqual({ ok: false, error: "notFound" });
      const [row] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, planId));
      expect(row.name).toBe("Week");
    });
  });

  describe("routine hooks (spec 05 rule 4)", () => {
    it("lists only active plans and blocks archiving the routine, naming them", async () => {
      const c = await customer(a);
      const r = await routine(a, c, "Shared", { status: "active" });
      const activePlan = await plan(a, c);
      const draftPlan = await plan(a, c);
      await attach(a, activePlan, r, 1);
      await attach(a, draftPlan, r, 2);
      await as(a, (tx, id) =>
        updatePlan(tx, id, {
          id: activePlan,
          name: "Active week",
          notes: null,
          caseId: null,
          status: "active",
        }),
      );
      await expect(as(a, (tx, id) => listPlansUsingRoutine(tx, id, r))).resolves.toEqual([
        { id: activePlan, name: "Active week" },
      ]);

      const result = await as(a, (tx, id) =>
        saveRoutine(
          tx,
          id,
          saveRoutineSchema.parse({
            id: r,
            version: 1,
            name: "Shared",
            notes: null,
            caseId: null,
            sessionsPerWeek: null,
            sessionsPerDay: null,
            status: "archived",
            sections: [{ key: "s", name: "Main" }],
            groups: [],
            items: [],
          }),
        ),
      );
      expect(result).toEqual({
        ok: false,
        error: "blockedByPlans",
        plans: [{ id: activePlan, name: "Active week" }],
      });
    });
  });

  describe("queries", () => {
    it("getPlan returns ordered entries with exercise counts and use counts", async () => {
      const c = await customer(a);
      const planId = await plan(a, c);
      const [exercise] = await db
        .insert(exercises)
        .values({ physioId: a.id, name: "Squat" })
        .returning({ id: exercises.id });
      const r = await routine(a, c, "Gym");
      const [section] = await db
        .insert(routineSections)
        .values({ physioId: a.id, routineId: r, name: "Main", position: 0 })
        .returning({ id: routineSections.id });
      await db.insert(routineItems).values([
        {
          physioId: a.id,
          routineId: r,
          exerciseId: exercise.id,
          position: 0,
          sectionId: section.id,
        },
        {
          physioId: a.id,
          routineId: r,
          exerciseId: exercise.id,
          position: 1,
          sectionId: section.id,
        },
      ]);
      const rest = await routine(a, c, "Rehab", { isStandalone: false });
      const e1 = await attach(a, planId, r, 4);
      const e2 = await attach(a, planId, rest, 1);
      const e3 = await attach(a, planId, r, 1);
      const detail = await as(a, (tx, id) => getPlan(tx, id, planId));
      expect(detail?.entries.map((row) => row.id)).toEqual([e2, e3, e1]);
      expect(detail?.entries.find((row) => row.id === e1)).toMatchObject({
        routineName: "Gym",
        exerciseCount: 2,
        routineEntryCount: 2,
        routineIsStandalone: true,
        weekday: 4,
      });
      expect(detail?.entries.find((row) => row.id === e2)).toMatchObject({
        exerciseCount: 0,
        routineEntryCount: 1,
        routineIsStandalone: false,
      });
    });

    it("getPlan hides other physios' plans and malformed ids", async () => {
      const planId = await plan(a, await customer(a));
      await expect(as(b, (tx, id) => getPlan(tx, id, planId))).resolves.toBeNull();
      await expect(as(a, (tx, id) => getPlan(tx, id, "nope"))).resolves.toBeNull();
    });

    it("listPlans filters and builds the week strip", async () => {
      const who = await fresh();
      const c = await customer(who);
      const planId = await plan(who, c);
      const empty = await plan(who, c);
      const r = await routine(who, c);
      await attach(who, planId, r, 1);
      await attach(who, planId, r, 1);
      await attach(who, planId, r, 7);
      const all = await as(who, (tx, id) => listPlans(tx, id, DEFAULT_PLAN_FILTERS));
      expect(all.plans.map((row) => row.id).sort()).toEqual([planId, empty].sort());
      expect(all.plans.find((row) => row.id === planId)?.sessionsPerDay).toEqual([
        2, 0, 0, 0, 0, 0, 1,
      ]);
      expect(all.plans.find((row) => row.id === empty)?.sessionsPerDay).toEqual([
        0, 0, 0, 0, 0, 0, 0,
      ]);
      const active = await as(who, (tx, id) =>
        listPlans(tx, id, { ...DEFAULT_PLAN_FILTERS, status: "active" }),
      );
      expect(active.plans).toEqual([]);
      const byCustomer = await as(who, (tx, id) =>
        listPlans(tx, id, { ...DEFAULT_PLAN_FILTERS, customerId: c, q: "WEEK" }),
      );
      expect(byCustomer.plans).toHaveLength(2);
      await expect(
        as(who, (tx, id) => listPlans(tx, id, { ...DEFAULT_PLAN_FILTERS, customerId: "nope" })),
      ).resolves.toEqual({ plans: [], truncated: false });
      await expect(
        as(b, (tx, id) => listPlans(tx, id, DEFAULT_PLAN_FILTERS)),
      ).resolves.toMatchObject({
        plans: [],
      });
    });

    it("listAttachableRoutines excludes archived routines and other customers'", async () => {
      const c = await customer(a);
      const c2 = await customer(a, "Ivo");
      const live = await routine(a, c, "Live");
      await routine(a, c, "Gone", { status: "archived" });
      await routine(a, c2, "Elsewhere");
      const rows = await as(a, (tx, id) => listAttachableRoutines(tx, id, c));
      expect(rows.map((row) => row.id)).toEqual([live]);
      await expect(as(b, (tx, id) => listAttachableRoutines(tx, id, c))).resolves.toEqual([]);
    });
  });
});
