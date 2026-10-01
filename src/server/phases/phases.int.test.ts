import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import {
  customers,
  exercises,
  routineItemSets,
  routineItems,
  routines,
  weeklyPlanEntries,
  weeklyPlans,
} from "@/db/schema";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { copyIntoNextPhase, setPhase } from "./mutations";
import type { CopyPhaseInput } from "./schemas";

const RANDOM_ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

describe("phases server layer", () => {
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

  const customer = async (who: TestPhysio) => {
    const [row] = await db
      .insert(customers)
      .values({ physioId: who.id, firstName: "Ana", locale: "en" })
      .returning({ id: customers.id });
    return row.id;
  };
  const exercise = async (who: TestPhysio) => {
    const [row] = await db
      .insert(exercises)
      .values({ physioId: who.id, name: "Squat" })
      .returning({ id: exercises.id });
    return row.id;
  };
  /** A routine with `items` exercises of two sets each. */
  const routine = async (
    who: TestPhysio,
    customerId: string,
    overrides: Partial<typeof routines.$inferInsert> = {},
    items = 1,
  ) => {
    const [row] = await db
      .insert(routines)
      .values({ physioId: who.id, customerId, name: "Knee rehab", status: "active", ...overrides })
      .returning({ id: routines.id });
    if (items > 0) {
      const exerciseId = await exercise(who);
      const itemRows = await db
        .insert(routineItems)
        .values(
          Array.from({ length: items }, (_, position) => ({
            physioId: who.id,
            routineId: row.id,
            exerciseId,
            position,
          })),
        )
        .returning({ id: routineItems.id });
      await db.insert(routineItemSets).values(
        itemRows.flatMap(({ id }) =>
          [0, 1].map((position) => ({
            physioId: who.id,
            routineItemId: id,
            position,
            reps: 10,
          })),
        ),
      );
    }
    return row.id;
  };
  /** A standalone template routine (spec 07): no customer. */
  const templateRoutine = async (who: TestPhysio) => {
    const [row] = await db
      .insert(routines)
      .values({
        physioId: who.id,
        customerId: null,
        isTemplate: true,
        name: "Template",
        status: "active",
      })
      .returning({ id: routines.id });
    return row.id;
  };
  const plan = async (
    who: TestPhysio,
    customerId: string | null,
    overrides: Partial<typeof weeklyPlans.$inferInsert> = {},
  ) => {
    const [row] = await db
      .insert(weeklyPlans)
      .values({ physioId: who.id, customerId, name: "Week", status: "active", ...overrides })
      .returning({ id: weeklyPlans.id });
    return row.id;
  };
  const attach = (who: TestPhysio, planId: string, routineId: string, weekday: number) =>
    db
      .insert(weeklyPlanEntries)
      .values({ physioId: who.id, weeklyPlanId: planId, routineId, weekday, position: 0 });

  const copyInput = (
    kind: "routine" | "plan",
    id: string,
    overrides: Partial<CopyPhaseInput> = {},
  ): CopyPhaseInput => ({
    kind,
    id,
    phaseLabel: "Phase 2",
    startsOn: "2026-10-08",
    endsOn: null,
    endCurrent: true,
    ...overrides,
  });
  const routineRow = async (id: string) =>
    (await db.select().from(routines).where(eq(routines.id, id)))[0];
  const planRow = async (id: string) =>
    (await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, id)))[0];

  beforeAll(async () => {
    a = await fresh();
    b = await fresh();
  });
  afterAll(() => deleteTestPhysios(...created));

  describe("setPhase", () => {
    it("sets and clears a routine's label and window without bumping its version", async () => {
      const r = await routine(a, await customer(a));
      const set = (phaseLabel: string | null, startsOn: string | null, endsOn: string | null) =>
        as(a, (tx, id) =>
          setPhase(tx, id, { kind: "routine", id: r, phaseLabel, startsOn, endsOn }),
        );
      await expect(set("Phase 1", "2026-10-01", "2026-10-31")).resolves.toMatchObject({ ok: true });
      expect(await routineRow(r)).toMatchObject({
        phaseLabel: "Phase 1",
        startsOn: "2026-10-01",
        endsOn: "2026-10-31",
        version: 1,
      });
      await set(null, null, null);
      expect(await routineRow(r)).toMatchObject({ phaseLabel: null, startsOn: null, endsOn: null });
    });

    it("sets a plan's window", async () => {
      const p = await plan(a, await customer(a));
      const result = await as(a, (tx, id) =>
        setPhase(tx, id, {
          kind: "plan",
          id: p,
          phaseLabel: "Phase 1",
          startsOn: "2026-10-01",
          endsOn: null,
        }),
      );
      expect(result.ok).toBe(true);
      expect(await planRow(p)).toMatchObject({ phaseLabel: "Phase 1", startsOn: "2026-10-01" });
    });

    it("refuses a plan-owned routine, a template plan, another physio's rows and bad ids", async () => {
      const c = await customer(a);
      const inPlan = await routine(a, c, { isStandalone: false });
      const template = await plan(a, null, { isTemplate: true });
      const mine = await routine(a, c);
      const call = (who: TestPhysio, kind: "routine" | "plan", id: string) =>
        as(who, (tx, physioId) =>
          setPhase(tx, physioId, { kind, id, phaseLabel: null, startsOn: null, endsOn: null }),
        );
      await expect(call(a, "routine", inPlan)).resolves.toEqual({
        ok: false,
        error: "notStandalone",
      });
      await expect(call(a, "plan", template)).resolves.toEqual({
        ok: false,
        error: "needsCustomer",
      });
      await expect(call(b, "routine", mine)).resolves.toEqual({ ok: false, error: "notFound" });
      await expect(call(a, "routine", RANDOM_ID)).resolves.toEqual({
        ok: false,
        error: "notFound",
      });
      await expect(call(a, "plan", "nope")).resolves.toEqual({ ok: false, error: "notFound" });
    });
  });

  describe("templates carry no phase", () => {
    it("refuses a window on a standalone template routine", async () => {
      const template = await templateRoutine(a);
      await expect(
        as(a, (tx, physioId) =>
          setPhase(tx, physioId, {
            kind: "routine",
            id: template,
            phaseLabel: "Phase 1",
            startsOn: "2026-10-01",
            endsOn: null,
          }),
        ),
      ).resolves.toEqual({ ok: false, error: "needsCustomer" });
      expect((await routineRow(template)).startsOn).toBeNull();
    });

    it("refuses to copy a standalone template routine into a next phase", async () => {
      const template = await templateRoutine(a);
      await expect(
        as(a, (tx, physioId) => copyIntoNextPhase(tx, physioId, copyInput("routine", template))),
      ).resolves.toEqual({ ok: false, error: "needsCustomer" });
    });
  });

  describe("copyIntoNextPhase: routines", () => {
    it("clones the routine with its items and sets, links it and ends the predecessor", async () => {
      const c = await customer(a);
      const source = await routine(a, c, { startsOn: "2026-09-01", notes: "Slow" }, 2);
      const result = await as(a, (tx, id) =>
        copyIntoNextPhase(tx, id, copyInput("routine", source, { endsOn: "2026-11-30" })),
      );
      if (!result.ok) throw new Error(result.error);

      const copy = await routineRow(result.data.id);
      expect(copy).toMatchObject({
        customerId: c,
        name: "Knee rehab",
        notes: "Slow",
        status: "active",
        isStandalone: true,
        phaseLabel: "Phase 2",
        startsOn: "2026-10-08",
        endsOn: "2026-11-30",
        previousId: source,
        version: 1,
      });
      expect(await routineRow(source)).toMatchObject({ endsOn: "2026-10-07", version: 1 });

      const items = await db.select().from(routineItems).where(eq(routineItems.routineId, copy.id));
      expect(items).toHaveLength(2);
      const sets = await db
        .select()
        .from(routineItemSets)
        .where(
          inArray(
            routineItemSets.routineItemId,
            items.map((row) => row.id),
          ),
        );
      expect(sets).toHaveLength(4);
      // Independent rows: none shared with the source.
      const sourceItems = await db
        .select({ id: routineItems.id })
        .from(routineItems)
        .where(eq(routineItems.routineId, source));
      expect(items.some((row) => sourceItems.some((s) => s.id === row.id))).toBe(false);
    });

    it("keeps the predecessor's end when it is earlier and leaves it alone when not ending it", async () => {
      const c = await customer(a);
      const early = await routine(a, c, { endsOn: "2026-10-01" });
      await as(a, (tx, id) => copyIntoNextPhase(tx, id, copyInput("routine", early)));
      expect((await routineRow(early)).endsOn).toBe("2026-10-01");

      const open = await routine(a, c);
      await as(a, (tx, id) =>
        copyIntoNextPhase(tx, id, copyInput("routine", open, { endCurrent: false })),
      );
      expect((await routineRow(open)).endsOn).toBeNull();
    });

    it("refuses to end a predecessor before it starts, changing nothing", async () => {
      const c = await customer(a);
      const source = await routine(a, c, { startsOn: "2026-10-08" });
      const before = await db.select().from(routines).where(eq(routines.customerId, c));
      await expect(
        as(a, (tx, id) => copyIntoNextPhase(tx, id, copyInput("routine", source))),
      ).resolves.toEqual({ ok: false, error: "startBeforePredecessor" });
      const after = await db.select().from(routines).where(eq(routines.customerId, c));
      expect(after).toHaveLength(before.length);
      expect((await routineRow(source)).endsOn).toBeNull();
    });

    it("makes a draft copy of a draft, an archived or an empty routine", async () => {
      const c = await customer(a);
      for (const overrides of [{ status: "draft" as const }, { status: "archived" as const }]) {
        const source = await routine(a, c, overrides);
        const result = await as(a, (tx, id) =>
          copyIntoNextPhase(tx, id, copyInput("routine", source)),
        );
        if (!result.ok) throw new Error(result.error);
        expect((await routineRow(result.data.id)).status).toBe("draft");
        // A source that is not active is not touched.
        expect((await routineRow(source)).endsOn).toBeNull();
      }
      const empty = await routine(a, c, {}, 0);
      const result = await as(a, (tx, id) =>
        copyIntoNextPhase(tx, id, copyInput("routine", empty)),
      );
      if (!result.ok) throw new Error(result.error);
      expect((await routineRow(result.data.id)).status).toBe("draft");
    });

    it("refuses a plan-owned routine, another physio's routine and bad ids", async () => {
      const c = await customer(a);
      const inPlan = await routine(a, c, { isStandalone: false });
      const mine = await routine(a, c);
      const call = (who: TestPhysio, id: string) =>
        as(who, (tx, physioId) => copyIntoNextPhase(tx, physioId, copyInput("routine", id)));
      await expect(call(a, inPlan)).resolves.toEqual({ ok: false, error: "notStandalone" });
      await expect(call(b, mine)).resolves.toEqual({ ok: false, error: "notFound" });
      await expect(call(a, RANDOM_ID)).resolves.toEqual({ ok: false, error: "notFound" });
      await expect(call(a, "nope")).resolves.toEqual({ ok: false, error: "notFound" });
    });
  });

  describe("copyIntoNextPhase: plans", () => {
    it("deep-copies routines so the new phase is independent, keeping shared routines shared", async () => {
      const c = await customer(a);
      const shared = await routine(a, c, { name: "Rehab A", isStandalone: false }, 2);
      const gym = await routine(a, c, { name: "Gym", isStandalone: true }, 1);
      const source = await plan(a, c, { startsOn: "2026-09-01", notes: "Notes" });
      await attach(a, source, shared, 1);
      await attach(a, source, shared, 4);
      await attach(a, source, gym, 4);

      const result = await as(a, (tx, id) => copyIntoNextPhase(tx, id, copyInput("plan", source)));
      if (!result.ok) throw new Error(result.error);

      expect(await planRow(result.data.id)).toMatchObject({
        customerId: c,
        name: "Week",
        notes: "Notes",
        status: "active",
        phaseLabel: "Phase 2",
        startsOn: "2026-10-08",
        previousId: source,
        version: 1,
      });
      expect(await planRow(source)).toMatchObject({ endsOn: "2026-10-07", version: 1 });

      const entries = await db
        .select()
        .from(weeklyPlanEntries)
        .where(eq(weeklyPlanEntries.weeklyPlanId, result.data.id));
      expect(entries).toHaveLength(3);
      const routineIds = new Set(entries.map((row) => row.routineId));
      // Two distinct routines (the shared one stays shared), neither is a source routine.
      expect(routineIds.size).toBe(2);
      expect([...routineIds].some((id) => id === shared || id === gym)).toBe(false);
      const monday = entries.find((row) => row.weekday === 1)!;
      expect(entries.filter((row) => row.routineId === monday.routineId)).toHaveLength(2);

      // Copies belong to the new plan: not standalone, no phase fields, content copied.
      const copies = await db
        .select()
        .from(routines)
        .where(inArray(routines.id, [...routineIds]));
      expect(copies.every((row) => !row.isStandalone && row.startsOn === null)).toBe(true);
      expect(copies.map((row) => row.name).sort()).toEqual(["Gym", "Rehab A"]);
      const copiedItems = await db
        .select({ id: routineItems.id })
        .from(routineItems)
        .where(inArray(routineItems.routineId, [...routineIds]));
      expect(copiedItems).toHaveLength(3);

      // Editing a copy leaves the source untouched.
      await db.update(routines).set({ name: "Changed" }).where(eq(routines.id, monday.routineId));
      expect((await routineRow(shared)).name).toBe("Rehab A");
    });

    it("preserves each entry's day, position and label", async () => {
      const c = await customer(a);
      const r1 = await routine(a, c, {}, 1);
      const r2 = await routine(a, c, { name: "Second" }, 1);
      const source = await plan(a, c);
      await db.insert(weeklyPlanEntries).values([
        {
          physioId: a.id,
          weeklyPlanId: source,
          routineId: r1,
          weekday: 3,
          position: 0,
          label: "AM",
        },
        {
          physioId: a.id,
          weeklyPlanId: source,
          routineId: r2,
          weekday: 3,
          position: 1,
          label: null,
        },
      ]);
      const result = await as(a, (tx, id) => copyIntoNextPhase(tx, id, copyInput("plan", source)));
      if (!result.ok) throw new Error(result.error);
      const entries = await db
        .select({
          weekday: weeklyPlanEntries.weekday,
          position: weeklyPlanEntries.position,
          label: weeklyPlanEntries.label,
          name: routines.name,
        })
        .from(weeklyPlanEntries)
        .innerJoin(routines, eq(routines.id, weeklyPlanEntries.routineId))
        .where(eq(weeklyPlanEntries.weeklyPlanId, result.data.id));
      expect(entries.sort((x, y) => x.position - y.position)).toEqual([
        { weekday: 3, position: 0, label: "AM", name: "Knee rehab" },
        { weekday: 3, position: 1, label: null, name: "Second" },
      ]);
    });

    it("makes a draft copy of an empty plan or one holding an archived routine", async () => {
      const c = await customer(a);
      const empty = await plan(a, c);
      const emptyCopy = await as(a, (tx, id) =>
        copyIntoNextPhase(tx, id, copyInput("plan", empty)),
      );
      if (!emptyCopy.ok) throw new Error(emptyCopy.error);
      expect((await planRow(emptyCopy.data.id)).status).toBe("draft");

      const archived = await routine(a, c, { status: "archived", isStandalone: false });
      const holding = await plan(a, c);
      await attach(a, holding, archived, 2);
      const copy = await as(a, (tx, id) => copyIntoNextPhase(tx, id, copyInput("plan", holding)));
      if (!copy.ok) throw new Error(copy.error);
      expect((await planRow(copy.data.id)).status).toBe("draft");
    });

    it("refuses to end a predecessor before it starts and rolls everything back", async () => {
      const c = await customer(a);
      const r = await routine(a, c, {}, 1);
      const source = await plan(a, c, { startsOn: "2026-10-08" });
      await attach(a, source, r, 1);
      const before = await db.select().from(routines).where(eq(routines.customerId, c));
      await expect(
        as(a, (tx, id) => copyIntoNextPhase(tx, id, copyInput("plan", source))),
      ).resolves.toEqual({ ok: false, error: "startBeforePredecessor" });
      expect(await db.select().from(routines).where(eq(routines.customerId, c))).toHaveLength(
        before.length,
      );
      expect(
        await db
          .select()
          .from(weeklyPlans)
          .where(and(eq(weeklyPlans.customerId, c), eq(weeklyPlans.previousId, source))),
      ).toHaveLength(0);
    });

    it("refuses a template, another physio's plan and bad ids", async () => {
      const template = await plan(a, null, { isTemplate: true });
      const mine = await plan(a, await customer(a));
      const call = (who: TestPhysio, id: string) =>
        as(who, (tx, physioId) => copyIntoNextPhase(tx, physioId, copyInput("plan", id)));
      await expect(call(a, template)).resolves.toEqual({ ok: false, error: "needsCustomer" });
      await expect(call(b, mine)).resolves.toEqual({ ok: false, error: "notFound" });
      await expect(call(a, "nope")).resolves.toEqual({ ok: false, error: "notFound" });
    });
  });

  describe("constraints and RLS", () => {
    it("enforces the window, label and self-link checks", async () => {
      const c = await customer(a);
      const r = await routine(a, c);
      const update = (values: Partial<typeof routines.$inferInsert>) =>
        db.update(routines).set(values).where(eq(routines.id, r));
      await expect(update({ startsOn: "2026-10-02", endsOn: "2026-10-01" })).rejects.toThrow();
      await expect(update({ phaseLabel: "" })).rejects.toThrow();
      await expect(update({ phaseLabel: "x".repeat(41) })).rejects.toThrow();
      await expect(update({ previousId: r })).rejects.toThrow();
      const p = await plan(a, c);
      await expect(
        db
          .update(weeklyPlans)
          .set({ startsOn: "2026-10-02", endsOn: "2026-10-01" })
          .where(eq(weeklyPlans.id, p)),
      ).rejects.toThrow();
    });

    it("cannot link to another physio's row", async () => {
      const mine = await routine(a, await customer(a));
      const theirs = await routine(b, await customer(b));
      await expect(
        db.update(routines).set({ previousId: theirs }).where(eq(routines.id, mine)),
      ).rejects.toThrow();
      const myPlan = await plan(a, await customer(a));
      const theirPlan = await plan(b, await customer(b));
      await expect(
        db.update(weeklyPlans).set({ previousId: theirPlan }).where(eq(weeklyPlans.id, myPlan)),
      ).rejects.toThrow();
    });

    it("clears previous_id (only) when the predecessor is deleted", async () => {
      const c = await customer(a);
      const first = await routine(a, c);
      const second = await routine(a, c, { previousId: first, phaseLabel: "Phase 2" });
      await db.delete(routines).where(eq(routines.id, first));
      expect(await routineRow(second)).toMatchObject({
        previousId: null,
        phaseLabel: "Phase 2",
        physioId: a.id,
      });
    });

    it("hides phase data from other physios and blocks their writes", async () => {
      const c = await customer(a);
      const r = await routine(a, c, { phaseLabel: "Phase 1" });
      const seen = await as(b, (tx) => tx.select().from(routines).where(eq(routines.id, r)));
      expect(seen).toHaveLength(0);
      const updated = await as(b, (tx) =>
        tx.update(routines).set({ phaseLabel: "Hacked" }).where(eq(routines.id, r)).returning(),
      );
      expect(updated).toHaveLength(0);
      expect((await routineRow(r)).phaseLabel).toBe("Phase 1");
    });
  });
});
