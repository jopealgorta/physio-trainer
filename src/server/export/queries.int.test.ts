import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { physios, routines, shareLinks } from "@/db/schema";
import { setCustomerArchived } from "@/server/customers/mutations";
import { ensureShareLink, revokeShareLink } from "@/server/sharing/mutations";
import { insertCustomer, insertExercise, insertPlan, insertRoutine } from "@/test/int/content";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { exportShareUrl, getCustomerExport, getPlanExport, getRoutineExport } from "./queries";

// Wednesday 7 Oct 2026.
const NOW = new Date("2026-10-07T10:00:00Z");
const TODAY = "2026-10-07";

describe("physio export loaders", () => {
  const created: TestPhysio[] = [];
  let physio: TestPhysio;
  let other: TestPhysio;
  let handle: string;

  const as = <T>(who: TestPhysio, fn: Parameters<typeof runAsPhysio<T>>[1]) =>
    runAsPhysio(who.claims, fn);

  beforeAll(async () => {
    physio = await createTestPhysio({ onboarded: true });
    other = await createTestPhysio({ onboarded: true });
    created.push(physio, other);
    const [row] = await db
      .select({ handle: physios.handle })
      .from(physios)
      .where(eq(physios.id, physio.id));
    handle = row!.handle!;
  });
  afterAll(() => deleteTestPhysios(...created));

  describe("getRoutineExport", () => {
    it("returns the routine with its items, phase and customer for its owner", async () => {
      const customerId = await insertCustomer(physio.id, { firstName: "Ana", locale: "es" });
      const ex = await insertExercise(physio.id, { name: "Bridge" });
      const routineId = await insertRoutine(physio.id, customerId, {
        name: "Knee rehab",
        status: "draft",
        phaseLabel: "Phase 2",
        startsOn: "2026-10-01",
        items: [{ exerciseId: ex, reps: 12 }],
      });

      const data = await as(physio, (tx, id) => getRoutineExport(tx, id, routineId));
      expect(data).not.toBeNull();
      expect(data!.customer).toEqual({ id: customerId, firstName: "Ana", locale: "es" });
      expect(data!.title).toBe("Knee rehab");
      expect(data!.plans).toEqual([]);
      expect(data!.planRoutines).toEqual([]);
      expect(data!.routines).toHaveLength(1);
      const [routine] = data!.routines;
      expect(routine!.id).toBe(routineId);
      expect(routine!.phase).toEqual({ label: "Phase 2", startsOn: "2026-10-01", endsOn: null });
      expect(routine!.blocks).toHaveLength(1);
      expect(routine!.blocks[0]).toMatchObject({ kind: "single", item: { name: "Bridge" } });
    });

    it("has no phase when the routine has none", async () => {
      const customerId = await insertCustomer(physio.id);
      const routineId = await insertRoutine(physio.id, customerId, { status: "active" });
      const data = await as(physio, (tx, id) => getRoutineExport(tx, id, routineId));
      expect(data!.routines[0]!.phase).toBeNull();
    });

    it("is null for another physio, a template, or an id that is not a UUID", async () => {
      const customerId = await insertCustomer(physio.id);
      const routineId = await insertRoutine(physio.id, customerId, { status: "active" });
      const [template] = await db
        .insert(routines)
        .values({
          physioId: physio.id,
          customerId: null,
          isTemplate: true,
          name: "T",
          status: "active",
        })
        .returning({ id: routines.id });

      expect(await as(other, (tx, id) => getRoutineExport(tx, id, routineId))).toBeNull();
      expect(await as(physio, (tx, id) => getRoutineExport(tx, id, template!.id))).toBeNull();
      expect(await as(physio, (tx, id) => getRoutineExport(tx, id, "not-a-uuid"))).toBeNull();
    });
  });

  describe("getPlanExport", () => {
    it("lists entries by weekday, keeps drafts, drops archived routines, loads each routine once", async () => {
      const customerId = await insertCustomer(physio.id);
      const ex = await insertExercise(physio.id);
      const r1 = await insertRoutine(physio.id, customerId, {
        name: "R1",
        status: "active",
        isStandalone: false,
        items: [{ exerciseId: ex }],
      });
      const r2 = await insertRoutine(physio.id, customerId, {
        name: "R2",
        status: "draft",
        isStandalone: false,
        items: [{ exerciseId: ex }],
      });
      const r3 = await insertRoutine(physio.id, customerId, {
        name: "R3",
        status: "archived",
        isStandalone: false,
        items: [{ exerciseId: ex }],
      });
      const planId = await insertPlan(physio.id, customerId, {
        name: "Week A",
        notes: "Easy",
        status: "active",
        phaseLabel: "Phase 1",
        startsOn: "2026-10-01",
        endsOn: "2026-10-31",
        entries: [
          { weekday: 3, routineId: r1, label: "Morning" },
          { weekday: 1, routineId: r1 },
          { weekday: 3, routineId: r2 },
          { weekday: 5, routineId: r3 },
        ],
      });

      const data = await as(physio, (tx, id) => getPlanExport(tx, id, planId));
      expect(data).not.toBeNull();
      expect(data!.title).toBe("Week A");
      expect(data!.routines).toEqual([]);
      expect(data!.customer.id).toBe(customerId);
      expect(data!.plans).toEqual([
        {
          id: planId,
          name: "Week A",
          notes: "Easy",
          phase: { label: "Phase 1", startsOn: "2026-10-01", endsOn: "2026-10-31" },
          entries: [
            { weekday: 1, label: null, routineId: r1 },
            { weekday: 3, label: "Morning", routineId: r1 },
            { weekday: 3, label: null, routineId: r2 },
          ],
        },
      ]);
      expect(data!.planRoutines.map((routine) => routine.id)).toEqual([r1, r2]);
      expect(data!.planRoutines.every((routine) => routine.phase === null)).toBe(true);
    });

    it("never includes another customer's routine", async () => {
      const customerId = await insertCustomer(physio.id);
      const otherCustomer = await insertCustomer(physio.id, { firstName: "Other" });
      const foreign = await insertRoutine(physio.id, otherCustomer, {
        status: "active",
        isStandalone: false,
      });
      const planId = await insertPlan(physio.id, customerId, {
        status: "active",
        entries: [{ weekday: 1, routineId: foreign }],
      });
      const data = await as(physio, (tx, id) => getPlanExport(tx, id, planId));
      expect(data!.plans[0]!.entries).toEqual([]);
      expect(data!.planRoutines).toEqual([]);
    });

    it("is null for another physio, a template, or an id that is not a UUID", async () => {
      const customerId = await insertCustomer(physio.id);
      const planId = await insertPlan(physio.id, customerId, { status: "active" });
      const templateId = await insertPlan(physio.id, null, { isTemplate: true, status: "active" });

      expect(await as(other, (tx, id) => getPlanExport(tx, id, planId))).toBeNull();
      expect(await as(physio, (tx, id) => getPlanExport(tx, id, templateId))).toBeNull();
      expect(await as(physio, (tx, id) => getPlanExport(tx, id, "not-a-uuid"))).toBeNull();
    });
  });

  describe("getCustomerExport", () => {
    it("exports what is active today: active standalone routines and plans, active entries", async () => {
      const customerId = await insertCustomer(physio.id, { firstName: "Bea" });
      const ex = await insertExercise(physio.id);
      const s1 = await insertRoutine(physio.id, customerId, {
        name: "S1",
        status: "active",
        phaseLabel: "Phase 3",
        items: [{ exerciseId: ex }],
      });
      await insertRoutine(physio.id, customerId, {
        name: "S2",
        status: "active",
        startsOn: "2026-09-01",
        endsOn: "2026-10-06",
        items: [{ exerciseId: ex }],
      });
      const inPlan = await insertRoutine(physio.id, customerId, {
        name: "In plan",
        status: "active",
        isStandalone: false,
        items: [{ exerciseId: ex }],
      });
      const draft = await insertRoutine(physio.id, customerId, {
        name: "Draft",
        status: "draft",
        isStandalone: false,
        items: [{ exerciseId: ex }],
      });
      const p1 = await insertPlan(physio.id, customerId, {
        name: "P1",
        status: "active",
        entries: [
          { weekday: 5, routineId: inPlan },
          { weekday: 2, routineId: draft },
          { weekday: 1, routineId: inPlan },
        ],
      });
      await insertPlan(physio.id, customerId, {
        name: "P2",
        status: "active",
        startsOn: "2026-10-20",
        entries: [{ weekday: 1, routineId: inPlan }],
      });

      const data = await as(physio, (tx, id) => getCustomerExport(tx, id, customerId, TODAY));
      expect(data).not.toBeNull();
      expect(data!.title).toBeNull();
      expect(data!.customer).toEqual({ id: customerId, firstName: "Bea", locale: "en" });
      expect(data!.routines.map((routine) => routine.id)).toEqual([s1]);
      expect(data!.routines[0]!.phase).toEqual({ label: "Phase 3", startsOn: null, endsOn: null });
      expect(data!.plans.map((plan) => plan.id)).toEqual([p1]);
      expect(data!.plans[0]!.entries).toEqual([
        { weekday: 1, label: null, routineId: inPlan },
        { weekday: 5, label: null, routineId: inPlan },
      ]);
      expect(data!.planRoutines.map((routine) => routine.id)).toEqual([inPlan]);
    });

    it("is null for another physio or an id that is not a UUID", async () => {
      const customerId = await insertCustomer(physio.id);
      expect(await as(other, (tx, id) => getCustomerExport(tx, id, customerId, TODAY))).toBeNull();
      expect(
        await as(physio, (tx, id) => getCustomerExport(tx, id, "not-a-uuid", TODAY)),
      ).toBeNull();
    });
  });

  describe("exportShareUrl", () => {
    const linkCount = async (customerId: string) =>
      (await db.select().from(shareLinks).where(eq(shareLinks.customerId, customerId))).length;

    it("creates the customer link on first use and returns its URL", async () => {
      const customerId = await insertCustomer(physio.id, { firstName: "Cleo" });
      const url = await as(physio, (tx, id) => exportShareUrl(tx, id, customerId, NOW));
      expect(url).toContain(`/${handle}/`);
      expect(await linkCount(customerId)).toBe(1);

      const again = await as(physio, (tx, id) => exportShareUrl(tx, id, customerId, NOW));
      expect(again).toBe(url);
      expect(await linkCount(customerId)).toBe(1);
    });

    it("is null once the link is revoked", async () => {
      const customerId = await insertCustomer(physio.id);
      const result = await as(physio, (tx, id) =>
        ensureShareLink(tx, id, { target: "customer", customerId }),
      );
      if (!result.ok) throw new Error(result.error);
      await as(physio, (tx, id) => revokeShareLink(tx, id, result.data.link.id));
      expect(await as(physio, (tx, id) => exportShareUrl(tx, id, customerId, NOW))).toBeNull();
    });

    it("is null for an archived customer, another physio's customer, or a bad id", async () => {
      const customerId = await insertCustomer(physio.id);
      await as(physio, (tx, id) => setCustomerArchived(tx, id, customerId, true));
      expect(await as(physio, (tx, id) => exportShareUrl(tx, id, customerId, NOW))).toBeNull();
      expect(await linkCount(customerId)).toBe(0);

      const mine = await insertCustomer(physio.id);
      expect(await as(other, (tx, id) => exportShareUrl(tx, id, mine, NOW))).toBeNull();
      expect(await as(physio, (tx, id) => exportShareUrl(tx, id, "not-a-uuid", NOW))).toBeNull();
    });
  });
});
