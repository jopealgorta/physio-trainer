import { eq, inArray } from "drizzle-orm";
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
  routines,
  weeklyPlanDays,
  weeklyPlanEntries,
  weeklyPlans,
} from "@/db/schema";
import { addEntry, addNewRoutineEntry, createPlan, updatePlan } from "@/server/plans/mutations";
import { createRoutine, saveRoutine } from "@/server/routines/mutations";
import { saveRoutineSchema } from "@/server/routines/schemas";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { assignTemplate, createTemplate, duplicateTemplate, saveAsTemplate } from "./mutations";

const RANDOM_ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

describe("templates server layer", () => {
  const created: TestPhysio[] = [];
  let a: TestPhysio;
  let b: TestPhysio;
  let exerciseId: string;

  const fresh = async () => {
    const physio = await createTestPhysio({ onboarded: true });
    created.push(physio);
    return physio;
  };
  const as = <T>(who: TestPhysio, fn: Parameters<typeof runAsPhysio<T>>[1]) =>
    runAsPhysio(who.claims, fn);

  const customer = async (who: TestPhysio, firstName = "Ana", archived = false) => {
    const [row] = await db
      .insert(customers)
      .values({
        physioId: who.id,
        firstName,
        locale: "en",
        archivedAt: archived ? new Date() : null,
      })
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

  /** A routine with a superset group, two items with two sets each, and every optional field set. */
  const fullRoutine = async (
    who: TestPhysio,
    customerId: string | null,
    name = "Knee rehab A",
    status: "draft" | "active" = "active",
  ) => {
    let id: string;
    if (customerId === null) {
      const made = await as(who, (tx, pid) => createTemplate(tx, pid, { kind: "routine", name }));
      if (!made.ok) throw new Error(made.error);
      id = made.data.id;
    } else {
      const made = await as(who, (tx, pid) =>
        createRoutine(tx, pid, { customerId, name, caseId: null }),
      );
      if (!made.ok) throw new Error(made.error);
      id = made.data.id;
    }
    const saved = await as(who, (tx, pid) =>
      saveRoutine(
        tx,
        pid,
        saveRoutineSchema.parse({
          id,
          version: 1,
          name,
          notes: "Slow and controlled",
          caseId: null,
          sessionsPerWeek: 3,
          sessionsPerDay: 2,
          status,
          groups: [{ key: "g", restSeconds: 45 }],
          items: [
            {
              exerciseId,
              groupKey: "g",
              holdSeconds: 5,
              restSeconds: null,
              side: "left",
              notes: "keep the knee straight",
              sets: [
                { reps: 12, repsMax: null, durationSeconds: null, load: "5 kg" },
                { reps: 10, repsMax: null, durationSeconds: null, load: null },
                { reps: 8, repsMax: null, durationSeconds: null, load: "6 kg" },
              ],
            },
            {
              exerciseId,
              groupKey: "g",
              holdSeconds: null,
              restSeconds: null,
              side: null,
              notes: null,
              sets: [
                { reps: 8, repsMax: 12, durationSeconds: null, load: null },
                { reps: null, repsMax: null, durationSeconds: 30, load: null },
                { reps: 6, repsMax: null, durationSeconds: null, load: "2 kg" },
              ],
            },
          ],
        }),
      ),
    );
    if (!saved.ok) throw new Error(saved.error);
    return id;
  };

  const routineRow = async (id: string) =>
    (await db.select().from(routines).where(eq(routines.id, id)))[0];
  const planRow = async (id: string) =>
    (await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, id)))[0];

  /** Items with their sets, ordered, ids stripped, plus group rest per item: comparable across copies. */
  const shape = async (routineId: string) => {
    const groups = await db
      .select()
      .from(routineGroups)
      .where(eq(routineGroups.routineId, routineId));
    const items = (
      await db.select().from(routineItems).where(eq(routineItems.routineId, routineId))
    ).sort((x, y) => x.position - y.position);
    const sets = items.length
      ? await db
          .select()
          .from(routineItemSets)
          .where(
            inArray(
              routineItemSets.routineItemId,
              items.map((item) => item.id),
            ),
          )
      : [];
    return {
      groups,
      items,
      shape: items.map((item) => ({
        exerciseId: item.exerciseId,
        position: item.position,
        holdSeconds: item.holdSeconds,
        restSeconds: item.restSeconds,
        side: item.side,
        notes: item.notes,
        grouped: item.groupId !== null,
        groupRest: groups.find((group) => group.id === item.groupId)?.restSeconds ?? null,
        sets: sets
          .filter((set) => set.routineItemId === item.id)
          .sort((x, y) => x.position - y.position)
          .map((set) => ({
            position: set.position,
            reps: set.reps,
            repsMax: set.repsMax,
            durationSeconds: set.durationSeconds,
            load: set.load,
          })),
      })),
    };
  };

  /** A customer plan: routine R1 on all 7 days, plus R2 on Monday; labels on two entries. */
  const customerPlan = async (who: TestPhysio, customerId: string) => {
    const r1 = await fullRoutine(who, customerId, "Mobility");
    const r2 = await fullRoutine(who, customerId, "Strength");
    const made = await as(who, (tx, pid) =>
      createPlan(tx, pid, { customerId, name: "Week", caseId: null }),
    );
    if (!made.ok) throw new Error(made.error);
    const planId = made.data.id;
    for (let weekday = 1; weekday <= 7; weekday++) {
      const result = await as(who, (tx, pid) =>
        addEntry(tx, pid, {
          planId,
          weekday,
          routineId: r1,
          label: weekday === 1 ? "Warm-up" : null,
        }),
      );
      if (!result.ok) throw new Error(result.error);
    }
    const second = await as(who, (tx, pid) =>
      addEntry(tx, pid, { planId, weekday: 1, routineId: r2, label: "Main" }),
    );
    if (!second.ok) throw new Error(second.error);
    await as(who, (tx, pid) =>
      updatePlan(tx, pid, {
        id: planId,
        name: "Week",
        notes: "Patient prefers mornings",
        caseId: null,
        status: "active",
      }),
    );
    return { planId, r1, r2 };
  };

  const entriesOf = async (planId: string) =>
    (await db.select().from(weeklyPlanEntries).where(eq(weeklyPlanEntries.weeklyPlanId, planId)))
      .map((entry) => entry)
      .sort((x, y) => x.weekday - y.weekday || x.position - y.position);

  beforeAll(async () => {
    a = await fresh();
    b = await fresh();
    const [exercise] = await db
      .insert(exercises)
      .values({ physioId: a.id, name: "Bridge" })
      .returning({ id: exercises.id });
    exerciseId = exercise.id;
  });
  afterAll(() => deleteTestPhysios(...created));

  describe("createTemplate", () => {
    it("creates an empty active standalone routine template without a customer", async () => {
      const result = await as(a, (tx, pid) =>
        createTemplate(tx, pid, { kind: "routine", name: "ACL phase 1" }),
      );
      if (!result.ok) throw new Error(result.error);
      expect(await routineRow(result.data.id)).toMatchObject({
        physioId: a.id,
        name: "ACL phase 1",
        isTemplate: true,
        customerId: null,
        caseId: null,
        sourceTemplateId: null,
        status: "active",
        isStandalone: true,
      });
    });

    it("creates an empty active plan template without a customer", async () => {
      const result = await as(a, (tx, pid) =>
        createTemplate(tx, pid, { kind: "plan", name: "Low back general" }),
      );
      if (!result.ok) throw new Error(result.error);
      expect(await planRow(result.data.id)).toMatchObject({
        physioId: a.id,
        name: "Low back general",
        isTemplate: true,
        customerId: null,
        status: "active",
      });
    });
  });

  describe("saveAsTemplate", () => {
    it("deep-copies a customer routine without customer, case or source link", async () => {
      const c = await customer(a);
      const original = await fullRoutine(a, c);
      const before = await shape(original);
      const result = await as(a, (tx, pid) =>
        saveAsTemplate(tx, pid, { kind: "routine", sourceId: original, name: "Knee template" }),
      );
      if (!result.ok) throw new Error(result.error);
      const copy = await routineRow(result.data.id);
      expect(copy).toMatchObject({
        name: "Knee template",
        notes: "Slow and controlled",
        sessionsPerWeek: 3,
        sessionsPerDay: 2,
        isTemplate: true,
        customerId: null,
        caseId: null,
        sourceTemplateId: null,
        status: "active",
        isStandalone: true,
      });
      expect(copy.id).not.toBe(original);

      const after = await shape(copy.id);
      expect(after.shape).toEqual(before.shape);
      expect(after.shape).toHaveLength(2);
      expect(after.shape[0].sets).toHaveLength(3);
      expect(after.shape[0].side).toBe("left");
      expect(after.shape[0].notes).toBe("keep the knee straight");
      // Group membership: both copy items sit in one group that belongs to the copy.
      expect(after.groups).toHaveLength(1);
      expect(after.groups[0].routineId).toBe(copy.id);
      expect(after.items.every((item) => item.groupId === after.groups[0].id)).toBe(true);
      // New ids everywhere.
      expect(after.groups[0].id).not.toBe(before.groups[0].id);
      expect(after.items.map((item) => item.id)).not.toEqual(
        expect.arrayContaining(before.items.map((item) => item.id)),
      );
      // Original untouched.
      expect(await routineRow(original)).toMatchObject({ customerId: c, isTemplate: false });
      expect((await shape(original)).shape).toEqual(before.shape);
    });

    it("copies a plan's day notes into the template and into a plan made from it", async () => {
      const c = await customer(a);
      const { planId } = await customerPlan(a, c);
      await db.insert(weeklyPlanDays).values([
        { physioId: a.id, weeklyPlanId: planId, weekday: 3, notes: "Easy day" },
        { physioId: a.id, weeklyPlanId: planId, weekday: 6, notes: "Long walk" },
      ]);
      const dayNotes = async (id: string) =>
        (await db.select().from(weeklyPlanDays).where(eq(weeklyPlanDays.weeklyPlanId, id)))
          .map((row) => [row.weekday, row.notes])
          .sort();
      const saved = await as(a, (tx, pid) =>
        saveAsTemplate(tx, pid, { kind: "plan", sourceId: planId, name: "T" }),
      );
      if (!saved.ok) throw new Error(saved.error);
      const expected = [
        [3, "Easy day"],
        [6, "Long walk"],
      ];
      expect(await dayNotes(saved.data.id)).toEqual(expected);
      expect(await dayNotes(planId)).toEqual(expected);
      const assigned = await as(a, (tx, pid) =>
        assignTemplate(tx, pid, {
          kind: "plan",
          templateId: saved.data.id,
          customerId: c,
          caseId: null,
          name: "From template",
          status: "draft",
        }),
      );
      if (!assigned.ok) throw new Error(assigned.error);
      expect(await dayNotes(assigned.data.id)).toEqual(expected);
    });

    it("deep-copies a customer plan: shared routines stay shared inside the copy", async () => {
      const c = await customer(a);
      const { planId, r1, r2 } = await customerPlan(a, c);
      const result = await as(a, (tx, pid) =>
        saveAsTemplate(tx, pid, { kind: "plan", sourceId: planId, name: "Week template" }),
      );
      if (!result.ok) throw new Error(result.error);
      const copy = await planRow(result.data.id);
      expect(copy).toMatchObject({
        name: "Week template",
        notes: "Patient prefers mornings",
        isTemplate: true,
        customerId: null,
        caseId: null,
        sourceTemplateId: null,
        status: "active",
      });

      const entries = await entriesOf(copy.id);
      expect(entries).toHaveLength(8);
      const routineIds = [...new Set(entries.map((entry) => entry.routineId))];
      expect(routineIds).toHaveLength(2);
      expect(routineIds).not.toContain(r1);
      expect(routineIds).not.toContain(r2);

      const rows = await db.select().from(routines).where(inArray(routines.id, routineIds));
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).toMatchObject({
          isTemplate: true,
          customerId: null,
          isStandalone: false,
          status: "active",
          sourceTemplateId: null,
        });
      }
      const monday = entries.filter((entry) => entry.weekday === 1);
      expect(monday.map((entry) => entry.label)).toEqual(["Warm-up", "Main"]);
      expect(monday.map((entry) => entry.position)).toEqual([0, 1]);
      // The 7 "Mobility" entries all point at the same copied routine.
      const mobility = rows.find((row) => row.name === "Mobility")!;
      expect(entries.filter((entry) => entry.routineId === mobility.id)).toHaveLength(7);
      expect((await shape(mobility.id)).shape).toEqual((await shape(r1)).shape);
      // Original plan still has its own routines.
      expect((await entriesOf(planId)).every((entry) => [r1, r2].includes(entry.routineId))).toBe(
        true,
      );
    });

    it("refuses a template and another physio's routine or plan", async () => {
      const template = await fullRoutine(a, null, "Already");
      const planTemplate = await as(a, (tx, pid) =>
        createTemplate(tx, pid, { kind: "plan", name: "Plan T" }),
      );
      if (!planTemplate.ok) throw new Error(planTemplate.error);
      const c = await customer(a);
      const mine = await fullRoutine(a, c, "Mine");
      const { planId } = await customerPlan(a, c);

      const run = (who: TestPhysio, kind: "routine" | "plan", sourceId: string) =>
        as(who, (tx, pid) => saveAsTemplate(tx, pid, { kind, sourceId, name: "T" }));
      await expect(run(a, "routine", template)).resolves.toEqual({
        ok: false,
        error: "alreadyTemplate",
      });
      await expect(run(a, "plan", planTemplate.data.id)).resolves.toEqual({
        ok: false,
        error: "alreadyTemplate",
      });
      await expect(run(b, "routine", mine)).resolves.toEqual({ ok: false, error: "notFound" });
      await expect(run(b, "plan", planId)).resolves.toEqual({ ok: false, error: "notFound" });
      await expect(run(a, "routine", RANDOM_ID)).resolves.toEqual({ ok: false, error: "notFound" });
      await expect(run(a, "routine", "nope")).resolves.toEqual({ ok: false, error: "notFound" });
    });
  });

  describe("assignTemplate", () => {
    it("copies a routine template to the customer, independent of the template", async () => {
      const c = await customer(a);
      const caseId = await kase(a, c);
      const template = await fullRoutine(a, null, "Knee template");
      const templateShape = (await shape(template)).shape;

      const result = await as(a, (tx, pid) =>
        assignTemplate(tx, pid, {
          kind: "routine",
          templateId: template,
          customerId: c,
          caseId,
          name: "Ana knee",
          status: "draft",
        }),
      );
      if (!result.ok) throw new Error(result.error);
      expect(await routineRow(result.data.id)).toMatchObject({
        name: "Ana knee",
        customerId: c,
        caseId,
        sourceTemplateId: template,
        isTemplate: false,
        isStandalone: true,
        status: "draft",
        notes: "Slow and controlled",
      });
      expect((await shape(result.data.id)).shape).toEqual(templateShape);

      // Editing the copy leaves the template alone.
      const saved = await as(a, (tx, pid) =>
        saveRoutine(
          tx,
          pid,
          saveRoutineSchema.parse({
            id: result.data.id,
            version: 1,
            name: "Ana knee",
            notes: null,
            caseId,
            sessionsPerWeek: null,
            sessionsPerDay: null,
            status: "draft",
            groups: [],
            items: [],
          }),
        ),
      );
      expect(saved.ok).toBe(true);
      expect((await shape(result.data.id)).items).toHaveLength(0);
      expect((await shape(template)).shape).toEqual(templateShape);
      expect(await routineRow(template)).toMatchObject({ isTemplate: true, version: 2 });
    });

    it("copies a plan template: one copy of a shared routine, provenance on every row", async () => {
      const c = await customer(a);
      const { planId } = await customerPlan(a, c);
      const tpl = await as(a, (tx, pid) =>
        saveAsTemplate(tx, pid, { kind: "plan", sourceId: planId, name: "Week template" }),
      );
      if (!tpl.ok) throw new Error(tpl.error);
      const templateEntries = await entriesOf(tpl.data.id);
      const templateRoutineIds = [...new Set(templateEntries.map((entry) => entry.routineId))];

      const target = await customer(a, "Ivo");
      const result = await as(a, (tx, pid) =>
        assignTemplate(tx, pid, {
          kind: "plan",
          templateId: tpl.data.id,
          customerId: target,
          caseId: null,
          name: "Ivo week",
          status: "active",
        }),
      );
      if (!result.ok) throw new Error(result.error);
      expect(await planRow(result.data.id)).toMatchObject({
        name: "Ivo week",
        customerId: target,
        isTemplate: false,
        sourceTemplateId: tpl.data.id,
        status: "active",
        notes: "Patient prefers mornings",
      });

      const entries = await entriesOf(result.data.id);
      expect(entries).toHaveLength(8);
      expect(entries.map((entry) => [entry.weekday, entry.position, entry.label])).toEqual(
        templateEntries.map((entry) => [entry.weekday, entry.position, entry.label]),
      );
      const routineIds = [...new Set(entries.map((entry) => entry.routineId))];
      expect(routineIds).toHaveLength(2);
      for (const id of routineIds) expect(templateRoutineIds).not.toContain(id);

      const rows = await db.select().from(routines).where(inArray(routines.id, routineIds));
      for (const row of rows) {
        expect(row).toMatchObject({
          customerId: target,
          isTemplate: false,
          isStandalone: false,
          status: "active",
        });
        const source = templateRoutineIds.find((id) => id === row.sourceTemplateId);
        expect(source).toBeDefined();
      }
      expect(new Set(rows.map((row) => row.sourceTemplateId)).size).toBe(2);
      const mobility = rows.find((row) => row.name === "Mobility")!;
      expect(entries.filter((entry) => entry.routineId === mobility.id)).toHaveLength(7);
    });

    it("copies a plan template as a draft with draft routines", async () => {
      const c = await customer(a);
      const { planId } = await customerPlan(a, c);
      const tpl = await as(a, (tx, pid) =>
        saveAsTemplate(tx, pid, { kind: "plan", sourceId: planId, name: "T" }),
      );
      if (!tpl.ok) throw new Error(tpl.error);
      const result = await as(a, (tx, pid) =>
        assignTemplate(tx, pid, {
          kind: "plan",
          templateId: tpl.data.id,
          customerId: c,
          caseId: null,
          name: "Draft week",
          status: "draft",
        }),
      );
      if (!result.ok) throw new Error(result.error);
      expect(await planRow(result.data.id)).toMatchObject({ status: "draft" });
      const ids = (await entriesOf(result.data.id)).map((entry) => entry.routineId);
      const rows = await db.select().from(routines).where(inArray(routines.id, ids));
      expect(rows.every((row) => row.status === "draft")).toBe(true);
    });

    describe("refusals", () => {
      const assign = (
        who: TestPhysio,
        input: Partial<Parameters<typeof assignTemplate>[2]> & {
          kind: "routine" | "plan";
          templateId: string;
          customerId: string;
        },
      ) =>
        as(who, (tx, pid) =>
          assignTemplate(tx, pid, { caseId: null, name: "X", status: "draft", ...input }),
        );
      const archive = async (kind: "routine" | "plan", id: string) => {
        const table = kind === "routine" ? routines : weeklyPlans;
        await db.update(table).set({ status: "archived" }).where(eq(table.id, id));
      };
      const emptyTemplate = async (kind: "routine" | "plan") => {
        const made = await as(a, (tx, pid) => createTemplate(tx, pid, { kind, name: "Empty" }));
        if (!made.ok) throw new Error(made.error);
        return made.data.id;
      };

      it("an archived template", async () => {
        const c = await customer(a);
        const template = await fullRoutine(a, null);
        await archive("routine", template);
        await expect(
          assign(a, { kind: "routine", templateId: template, customerId: c }),
        ).resolves.toEqual({ ok: false, error: "templateArchived" });
        const planTemplate = await emptyTemplate("plan");
        await archive("plan", planTemplate);
        await expect(
          assign(a, { kind: "plan", templateId: planTemplate, customerId: c }),
        ).resolves.toEqual({ ok: false, error: "templateArchived" });
      });

      it("an empty routine template as active, allowed as draft", async () => {
        const c = await customer(a);
        const template = await emptyTemplate("routine");
        await expect(
          assign(a, { kind: "routine", templateId: template, customerId: c, status: "active" }),
        ).resolves.toEqual({ ok: false, error: "needsItems" });
        const draft = await assign(a, {
          kind: "routine",
          templateId: template,
          customerId: c,
          status: "draft",
        });
        expect(draft.ok).toBe(true);
      });

      it("an empty plan template as active, allowed as draft", async () => {
        const c = await customer(a);
        const template = await emptyTemplate("plan");
        await expect(
          assign(a, { kind: "plan", templateId: template, customerId: c, status: "active" }),
        ).resolves.toEqual({ ok: false, error: "needsEntries" });
        const draft = await assign(a, {
          kind: "plan",
          templateId: template,
          customerId: c,
          status: "draft",
        });
        expect(draft.ok).toBe(true);
      });

      it("an active plan whose template routine has no exercises", async () => {
        const c = await customer(a);
        const emptyRoutine = await emptyTemplate("routine");
        const planTemplate = await emptyTemplate("plan");
        // Route the empty routine into the plan template at row level (the plan editor spec 07 UI is later).
        await db.update(routines).set({ isStandalone: false }).where(eq(routines.id, emptyRoutine));
        await db.insert(weeklyPlanEntries).values({
          physioId: a.id,
          weeklyPlanId: planTemplate,
          weekday: 1,
          routineId: emptyRoutine,
          position: 0,
        });
        await expect(
          assign(a, { kind: "plan", templateId: planTemplate, customerId: c, status: "active" }),
        ).resolves.toEqual({ ok: false, error: "needsItems" });
      });

      it("customers and cases that are not valid targets", async () => {
        const template = await fullRoutine(a, null);
        const theirs = await customer(b, "Bea");
        const archivedCustomer = await customer(a, "Old", true);
        const mine = await customer(a);
        const other = await customer(a, "Ivo");
        const foreignCase = await kase(a, other);
        await expect(
          assign(a, { kind: "routine", templateId: template, customerId: theirs }),
        ).resolves.toEqual({ ok: false, error: "customerNotFound" });
        await expect(
          assign(a, { kind: "routine", templateId: template, customerId: RANDOM_ID }),
        ).resolves.toEqual({ ok: false, error: "customerNotFound" });
        await expect(
          assign(a, { kind: "routine", templateId: template, customerId: archivedCustomer }),
        ).resolves.toEqual({ ok: false, error: "customerArchived" });
        await expect(
          assign(a, {
            kind: "routine",
            templateId: template,
            customerId: mine,
            caseId: foreignCase,
          }),
        ).resolves.toEqual({ ok: false, error: "caseNotFound" });
        await expect(
          assign(a, { kind: "routine", templateId: template, customerId: mine, caseId: RANDOM_ID }),
        ).resolves.toEqual({ ok: false, error: "caseNotFound" });
      });

      it("another physio's template, a non-template id and a wrong kind", async () => {
        const c = await customer(b, "Bea");
        const template = await fullRoutine(a, null);
        await expect(
          assign(b, { kind: "routine", templateId: template, customerId: c }),
        ).resolves.toEqual({ ok: false, error: "templateNotFound" });

        const ac = await customer(a);
        const plain = await fullRoutine(a, ac, "Plain");
        await expect(
          assign(a, { kind: "routine", templateId: plain, customerId: ac }),
        ).resolves.toEqual({ ok: false, error: "templateNotFound" });
        await expect(
          assign(a, { kind: "plan", templateId: template, customerId: ac }),
        ).resolves.toEqual({ ok: false, error: "templateNotFound" });
        await expect(
          assign(a, { kind: "routine", templateId: "nope", customerId: ac }),
        ).resolves.toEqual({ ok: false, error: "templateNotFound" });
      });
    });
  });

  describe("duplicateTemplate", () => {
    it("copies a routine template into an independent template, no source link", async () => {
      const template = await fullRoutine(a, null, "Original");
      const result = await as(a, (tx, pid) =>
        duplicateTemplate(tx, pid, {
          kind: "routine",
          templateId: template,
          name: "Original (copy)",
        }),
      );
      if (!result.ok) throw new Error(result.error);
      expect(await routineRow(result.data.id)).toMatchObject({
        name: "Original (copy)",
        isTemplate: true,
        customerId: null,
        sourceTemplateId: null,
        status: "active",
        isStandalone: true,
      });
      expect((await shape(result.data.id)).shape).toEqual((await shape(template)).shape);
      expect(result.data.id).not.toBe(template);
    });

    it("keeps an archived template archived and copies a plan template with its routines", async () => {
      const c = await customer(a);
      const { planId } = await customerPlan(a, c);
      const tpl = await as(a, (tx, pid) =>
        saveAsTemplate(tx, pid, { kind: "plan", sourceId: planId, name: "T" }),
      );
      if (!tpl.ok) throw new Error(tpl.error);
      await db
        .update(weeklyPlans)
        .set({ status: "archived" })
        .where(eq(weeklyPlans.id, tpl.data.id));
      const result = await as(a, (tx, pid) =>
        duplicateTemplate(tx, pid, { kind: "plan", templateId: tpl.data.id, name: "T copy" }),
      );
      if (!result.ok) throw new Error(result.error);
      expect(await planRow(result.data.id)).toMatchObject({
        isTemplate: true,
        customerId: null,
        sourceTemplateId: null,
        status: "archived",
      });
      const entries = await entriesOf(result.data.id);
      expect(entries).toHaveLength(8);
      const ids = [...new Set(entries.map((entry) => entry.routineId))];
      expect(ids).toHaveLength(2);
      const original = await entriesOf(tpl.data.id);
      for (const id of ids) expect(original.map((entry) => entry.routineId)).not.toContain(id);
      const rows = await db.select().from(routines).where(inArray(routines.id, ids));
      expect(rows.every((row) => row.isTemplate && !row.isStandalone)).toBe(true);
    });

    it("refuses a non-template and another physio's template", async () => {
      const c = await customer(a);
      const plain = await fullRoutine(a, c, "Plain");
      const template = await fullRoutine(a, null);
      const run = (who: TestPhysio, templateId: string) =>
        as(who, (tx, pid) =>
          duplicateTemplate(tx, pid, { kind: "routine", templateId, name: "X" }),
        );
      await expect(run(a, plain)).resolves.toEqual({ ok: false, error: "templateNotFound" });
      await expect(run(b, template)).resolves.toEqual({ ok: false, error: "templateNotFound" });
      await expect(run(a, RANDOM_ID)).resolves.toEqual({ ok: false, error: "templateNotFound" });
    });
  });

  describe("a template plan's own routines", () => {
    /** A template plan with one routine created from its board (not standalone). */
    const privateRoutine = async (who: TestPhysio) => {
      const plan = await as(who, (tx, pid) =>
        createTemplate(tx, pid, { kind: "plan", name: "Plan" }),
      );
      if (!plan.ok) throw new Error(plan.error);
      const added = await as(who, (tx, pid) =>
        addNewRoutineEntry(tx, pid, { planId: plan.data.id, weekday: 1, name: "Inner" }),
      );
      if (!added.ok) throw new Error(added.error);
      return added.data.routineId;
    };

    it("cannot be assigned on its own", async () => {
      const inner = await privateRoutine(a);
      const customerId = await customer(a);
      const result = await as(a, (tx, pid) =>
        assignTemplate(tx, pid, {
          kind: "routine",
          templateId: inner,
          customerId,
          caseId: null,
          name: "Inner for Ana",
          status: "draft",
        }),
      );
      expect(result).toMatchObject({ ok: false, error: "templateNotFound" });
    });

    it("cannot be duplicated on its own", async () => {
      const inner = await privateRoutine(a);
      const result = await as(a, (tx, pid) =>
        duplicateTemplate(tx, pid, { kind: "routine", templateId: inner, name: "Inner copy" }),
      );
      expect(result).toMatchObject({ ok: false, error: "templateNotFound" });
    });
  });
});
