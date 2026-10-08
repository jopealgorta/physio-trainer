import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { customers, exercises, routines } from "@/db/schema";
import { DEFAULT_PLAN_FILTERS } from "@/lib/plan-params";
import { DEFAULT_ROUTINE_FILTERS } from "@/lib/routine-params";
import {
  addEntry,
  addNewRoutineEntry,
  createPlan,
  makeSeparateCopy,
  updatePlan,
} from "@/server/plans/mutations";
import { getPlan, listAttachableRoutines, listPlans } from "@/server/plans/queries";
import { createRoutine, saveRoutine } from "@/server/routines/mutations";
import { getRoutine, listRoutines } from "@/server/routines/queries";
import { saveRoutineSchema } from "@/server/routines/schemas";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { assignTemplate, createTemplate } from "./mutations";

// Spec 07, "template-aware" queries and mutations: templates are rows with no customer, and must
// stay out of every customer-facing list and picker.
describe("templates in routine and plan queries and mutations", () => {
  const created: TestPhysio[] = [];
  let a: TestPhysio;
  let b: TestPhysio;
  const exerciseIds = new Map<string, string>();

  /** One exercise per physio (items may only reference the physio's own exercises). */
  const exerciseOf = async (who: TestPhysio) => {
    const existing = exerciseIds.get(who.id);
    if (existing) return existing;
    const [exercise] = await db
      .insert(exercises)
      .values({ physioId: who.id, name: "Bridge" })
      .returning({ id: exercises.id });
    exerciseIds.set(who.id, exercise.id);
    return exercise.id;
  };

  const fresh = async () => {
    const physio = await createTestPhysio({ onboarded: true });
    created.push(physio);
    return physio;
  };
  const as = <T>(who: TestPhysio, fn: Parameters<typeof runAsPhysio<T>>[1]) =>
    runAsPhysio(who.claims, fn);
  const unwrap = <T>(result: { ok: true; data: T } | { ok: false; error: string }): T => {
    if (!result.ok) throw new Error(result.error);
    return result.data;
  };

  const customer = async (who: TestPhysio, firstName = "Ana") => {
    const [row] = await db
      .insert(customers)
      .values({ physioId: who.id, firstName, locale: "en" })
      .returning({ id: customers.id });
    return row.id;
  };

  const template = async (who: TestPhysio, kind: "routine" | "plan", name: string) =>
    unwrap(await as(who, (tx, pid) => createTemplate(tx, pid, { kind, name }))).id;

  /** Saves a routine (template or not) with one exercise, so it can be `active`. */
  const fill = async (
    who: TestPhysio,
    id: string,
    status: "draft" | "active" | "archived",
    version = 1,
    withItem = true,
    name = "Saved",
  ) => {
    const exerciseId = await exerciseOf(who);
    return as(who, (tx, pid) =>
      saveRoutine(
        tx,
        pid,
        saveRoutineSchema.parse({
          id,
          version,
          name,
          notes: null,
          caseId: null,
          sessionsPerWeek: null,
          sessionsPerDay: null,
          status,
          sections: [{ key: "s", name: "Main" }],
          groups: [],
          items: withItem
            ? [
                {
                  exerciseId,
                  groupKey: null,
                  sectionKey: "s",
                  holdSeconds: null,
                  restSeconds: null,
                  side: null,
                  notes: null,
                  sets: [{ reps: 10, repsMax: null, durationSeconds: null, load: null }],
                },
              ]
            : [],
        }),
      ),
    );
  };

  const customerRoutine = async (who: TestPhysio, customerId: string, name = "Mine") =>
    unwrap(await as(who, (tx, pid) => createRoutine(tx, pid, { customerId, name, caseId: null })))
      .id;

  beforeAll(async () => {
    a = await fresh();
    b = await fresh();
  });
  afterAll(() => deleteTestPhysios(...created));

  describe("lists", () => {
    it("keeps templates out of the customers tab and shows only standalone ones in the templates tab", async () => {
      const who = await fresh();
      const customerId = await customer(who);
      const mine = await customerRoutine(who, customerId, "Customer routine");
      const standalone = await template(who, "routine", "Standalone template");
      const planTemplate = await template(who, "plan", "Template plan");
      const inner = unwrap(
        await as(who, (tx, pid) =>
          addNewRoutineEntry(tx, pid, { planId: planTemplate, weekday: 1, name: "Inner" }),
        ),
      ).routineId;

      const customersTab = await as(who, (tx, pid) =>
        listRoutines(tx, pid, DEFAULT_ROUTINE_FILTERS),
      );
      expect(customersTab.routines.map((row) => row.id)).toEqual([mine]);

      const templatesTab = await as(who, (tx, pid) =>
        listRoutines(tx, pid, { ...DEFAULT_ROUTINE_FILTERS, tab: "templates" }),
      );
      expect(templatesTab.routines.map((row) => row.id)).toEqual([standalone]);
      expect(templatesTab.routines[0]).toMatchObject({
        customerId: null,
        customerFirstName: null,
        customerLastName: null,
        caseTitle: null,
      });
      // The plan template's own routine is not a standalone template.
      expect(templatesTab.routines.map((row) => row.id)).not.toContain(inner);
    });

    it("splits plans by tab", async () => {
      const who = await fresh();
      const customerId = await customer(who);
      const customerPlan = unwrap(
        await as(who, (tx, pid) =>
          createPlan(tx, pid, { customerId, name: "Customer plan", caseId: null }),
        ),
      ).id;
      const planTemplate = await template(who, "plan", "Template plan");

      const customersTab = await as(who, (tx, pid) => listPlans(tx, pid, DEFAULT_PLAN_FILTERS));
      expect(customersTab.plans.map((row) => row.id)).toEqual([customerPlan]);

      const templatesTab = await as(who, (tx, pid) =>
        listPlans(tx, pid, { ...DEFAULT_PLAN_FILTERS, tab: "templates" }),
      );
      expect(templatesTab.plans.map((row) => row.id)).toEqual([planTemplate]);
      expect(templatesTab.plans[0]).toMatchObject({ customerId: null, customerFirstName: null });
    });

    it("never lists templates for a customer filter", async () => {
      const who = await fresh();
      const customerId = await customer(who);
      await template(who, "routine", "T");
      await template(who, "plan", "P");
      const mine = await customerRoutine(who, customerId);

      const routinesOf = await as(who, (tx, pid) =>
        listRoutines(tx, pid, { ...DEFAULT_ROUTINE_FILTERS, customerId }),
      );
      expect(routinesOf.routines.map((row) => row.id)).toEqual([mine]);
      const plansOf = await as(who, (tx, pid) =>
        listPlans(tx, pid, { ...DEFAULT_PLAN_FILTERS, customerId }),
      );
      expect(plansOf.plans).toEqual([]);
    });

    it("searches template names accent-insensitively and counts items", async () => {
      const who = await fresh();
      const id = await template(who, "routine", "Rótula ACL");
      unwrap(await fill(who, id, "active", 1, true, "Rótula ACL"));
      const found = await as(who, (tx, pid) =>
        listRoutines(tx, pid, { ...DEFAULT_ROUTINE_FILTERS, tab: "templates", q: "rotula" }),
      );
      expect(found.routines).toHaveLength(1);
      expect(found.routines[0].itemCount).toBe(1);
    });
  });

  describe("details", () => {
    it("reports a template as such, with no customer and no source", async () => {
      const routineId = await template(a, "routine", "R template");
      const planId = await template(a, "plan", "P template");
      const routine = await as(a, (tx, pid) => getRoutine(tx, pid, routineId));
      expect(routine).toMatchObject({
        isTemplate: true,
        isStandalone: true,
        customerId: null,
        customerFirstName: null,
        sourceTemplate: null,
        cases: [],
      });
      const plan = await as(a, (tx, pid) => getPlan(tx, pid, planId));
      expect(plan).toMatchObject({
        isTemplate: true,
        customerId: null,
        sourceTemplate: null,
        cases: [],
      });
    });

    it("reports a template plan's own routine as not standalone", async () => {
      const planId = await template(a, "plan", "Plan with inner");
      const { routineId } = unwrap(
        await as(a, (tx, pid) =>
          addNewRoutineEntry(tx, pid, { planId, weekday: 1, name: "Inner" }),
        ),
      );
      expect(await as(a, (tx, pid) => getRoutine(tx, pid, routineId))).toMatchObject({
        isTemplate: true,
        isStandalone: false,
      });
    });

    it("names the template an assigned copy came from", async () => {
      const customerId = await customer(a);
      const routineTemplate = await template(a, "routine", "ACL phase 1");
      unwrap(await fill(a, routineTemplate, "active", 1, true, "ACL phase 1"));
      const planTemplate = await template(a, "plan", "Week A");
      unwrap(
        await as(a, (tx, pid) =>
          addNewRoutineEntry(tx, pid, { planId: planTemplate, weekday: 1, name: "Day 1" }),
        ),
      );

      const routineCopy = unwrap(
        await as(a, (tx, pid) =>
          assignTemplate(tx, pid, {
            kind: "routine",
            templateId: routineTemplate,
            customerId,
            caseId: null,
            name: "ACL for Ana",
            status: "draft",
          }),
        ),
      ).id;
      const planCopy = unwrap(
        await as(a, (tx, pid) =>
          assignTemplate(tx, pid, {
            kind: "plan",
            templateId: planTemplate,
            customerId,
            caseId: null,
            name: "Week A for Ana",
            status: "draft",
          }),
        ),
      ).id;

      expect(await as(a, (tx, pid) => getRoutine(tx, pid, routineCopy))).toMatchObject({
        isTemplate: false,
        customerId,
        sourceTemplate: { id: routineTemplate, name: "ACL phase 1" },
      });
      expect(await as(a, (tx, pid) => getPlan(tx, pid, planCopy))).toMatchObject({
        isTemplate: false,
        customerId,
        sourceTemplate: { id: planTemplate, name: "Week A" },
      });
    });

    it("does not show another physio's template", async () => {
      const id = await template(a, "routine", "Private");
      expect(await as(b, (tx, pid) => getRoutine(tx, pid, id))).toBeNull();
    });
  });

  describe("listAttachableRoutines", () => {
    it("returns only the customer's routines for a customer, never templates", async () => {
      const who = await fresh();
      const customerId = await customer(who);
      const mine = await customerRoutine(who, customerId);
      await template(who, "routine", "Template");

      const list = await as(who, (tx, pid) => listAttachableRoutines(tx, pid, customerId));
      expect(list.map((row) => row.id)).toEqual([mine]);
    });

    it("returns only non-archived template routines for null, never customer routines", async () => {
      const who = await fresh();
      const customerId = await customer(who);
      await customerRoutine(who, customerId);
      const active = await template(who, "routine", "Active template");
      const archived = await template(who, "routine", "Archived template");
      unwrap(await fill(who, archived, "archived", 1, false));

      const list = await as(who, (tx, pid) => listAttachableRoutines(tx, pid, null));
      expect(list.map((row) => row.id)).toEqual([active]);
    });

    it("does not leak another physio's templates", async () => {
      const mine = await template(a, "routine", "Mine only");
      const list = await as(b, (tx, pid) => listAttachableRoutines(tx, pid, null));
      expect(list.map((row) => row.id)).not.toContain(mine);
    });
  });

  describe("plan board on a template plan", () => {
    it("attaches a template routine, refuses a customer routine and the other way round", async () => {
      const who = await fresh();
      const customerId = await customer(who);
      const planTemplate = await template(who, "plan", "Template plan");
      const templateRoutine = await template(who, "routine", "Template routine");
      const customerRoutineId = await customerRoutine(who, customerId);
      const customerPlan = unwrap(
        await as(who, (tx, pid) =>
          createPlan(tx, pid, { customerId, name: "Customer plan", caseId: null }),
        ),
      ).id;

      expect(
        (
          await as(who, (tx, pid) =>
            addEntry(tx, pid, {
              planId: planTemplate,
              weekday: 1,
              routineId: templateRoutine,
              label: null,
            }),
          )
        ).ok,
      ).toBe(true);
      expect(
        await as(who, (tx, pid) =>
          addEntry(tx, pid, {
            planId: planTemplate,
            weekday: 2,
            routineId: customerRoutineId,
            label: null,
          }),
        ),
      ).toMatchObject({ ok: false, error: "routineNotFound" });
      expect(
        await as(who, (tx, pid) =>
          addEntry(tx, pid, {
            planId: customerPlan,
            weekday: 1,
            routineId: templateRoutine,
            label: null,
          }),
        ),
      ).toMatchObject({ ok: false, error: "routineNotFound" });
    });

    it("creates a non-standalone active template routine for a new entry", async () => {
      const who = await fresh();
      const planTemplate = await template(who, "plan", "Template plan");
      const { routineId } = unwrap(
        await as(who, (tx, pid) =>
          addNewRoutineEntry(tx, pid, { planId: planTemplate, weekday: 3, name: "Day 3" }),
        ),
      );
      const [row] = await db.select().from(routines).where(eq(routines.id, routineId));
      expect(row).toMatchObject({
        isTemplate: true,
        customerId: null,
        caseId: null,
        status: "active",
        isStandalone: false,
        name: "Day 3",
      });
    });

    it("gives a copy of an archived template routine the active status", async () => {
      const who = await fresh();
      const planTemplate = await template(who, "plan", "Template plan");
      const { routineId } = unwrap(
        await as(who, (tx, pid) =>
          addNewRoutineEntry(tx, pid, { planId: planTemplate, weekday: 1, name: "Shared" }),
        ),
      );
      const second = unwrap(
        await as(who, (tx, pid) =>
          addEntry(tx, pid, { planId: planTemplate, weekday: 2, routineId, label: null }),
        ),
      );
      // An archived plan does not block archiving its routine.
      const plan = (await as(who, (tx, pid) => getPlan(tx, pid, planTemplate)))!;
      unwrap(
        await as(who, (tx, pid) =>
          updatePlan(tx, pid, {
            id: planTemplate,
            name: plan.name,
            notes: null,
            caseId: null,
            status: "archived",
          }),
        ),
      );
      unwrap(await fill(who, routineId, "archived", 1, false));

      const { routineId: copyId } = unwrap(
        await as(who, (tx, pid) =>
          makeSeparateCopy(
            tx,
            pid,
            { planId: planTemplate, entryId: second.entryId },
            (name) => `${name} (copy)`,
          ),
        ),
      );
      const [copy] = await db.select().from(routines).where(eq(routines.id, copyId));
      expect(copy).toMatchObject({ isTemplate: true, status: "active", customerId: null });
    });
  });

  describe("saving", () => {
    it("refuses a draft template routine", async () => {
      const id = await template(a, "routine", "No draft");
      expect(await fill(a, id, "draft")).toMatchObject({ ok: false, error: "templateNoDraft" });
    });

    it("lets an empty template routine be active", async () => {
      const id = await template(a, "routine", "Empty but active");
      expect((await fill(a, id, "active", 1, false)).ok).toBe(true);
      // A customer routine still needs items to be active.
      const customerId = await customer(a);
      const mine = await customerRoutine(a, customerId);
      expect(await fill(a, mine, "active", 1, false)).toMatchObject({
        ok: false,
        error: "needsItems",
      });
    });

    it("refuses a case on a template routine", async () => {
      const id = await template(a, "routine", "No case");
      const result = await as(a, (tx, pid) =>
        saveRoutine(
          tx,
          pid,
          saveRoutineSchema.parse({
            id,
            version: 1,
            name: "No case",
            notes: null,
            caseId: RANDOM_ID,
            sessionsPerWeek: null,
            sessionsPerDay: null,
            status: "active",
            sections: [{ key: "s", name: "Main" }],
            groups: [],
            items: [],
          }),
        ),
      );
      expect(result).toMatchObject({ ok: false, error: "caseNotFound" });
    });

    it("refuses a draft template plan and lets an empty one be active", async () => {
      const id = await template(a, "plan", "Plan template");
      expect(
        await as(a, (tx, pid) =>
          updatePlan(tx, pid, {
            id,
            name: "Plan template",
            notes: null,
            caseId: null,
            status: "draft",
          }),
        ),
      ).toMatchObject({ ok: false, error: "templateNoDraft" });
      // Archiving and re-activating an empty template is allowed: "active needs entries" is
      // a customer-plan rule.
      expect(
        (
          await as(a, (tx, pid) =>
            updatePlan(tx, pid, {
              id,
              name: "Plan template",
              notes: null,
              caseId: null,
              status: "archived",
            }),
          )
        ).ok,
      ).toBe(true);
      expect(
        (
          await as(a, (tx, pid) =>
            updatePlan(tx, pid, {
              id,
              name: "Plan template",
              notes: null,
              caseId: null,
              status: "active",
            }),
          )
        ).ok,
      ).toBe(true);
    });

    it("blocks archiving a template routine used by an active template plan", async () => {
      const who = await fresh();
      const planTemplate = await template(who, "plan", "Active template plan");
      const { routineId } = unwrap(
        await as(who, (tx, pid) =>
          addNewRoutineEntry(tx, pid, { planId: planTemplate, weekday: 1, name: "Used" }),
        ),
      );
      const result = await fill(who, routineId, "archived", 1, false);
      expect(result).toMatchObject({
        ok: false,
        error: "blockedByPlans",
        plans: [{ id: planTemplate, name: "Active template plan" }],
      });
    });
  });
});

const RANDOM_ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";
