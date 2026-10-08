import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { cases, customers, exercises } from "@/db/schema";
import { createRoutine, saveRoutine } from "@/server/routines/mutations";
import { saveRoutineSchema } from "@/server/routines/schemas";
import { addNewRoutineEntry } from "@/server/plans/mutations";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { createTemplate } from "./mutations";
import {
  getTemplateName,
  listAssignableCustomers,
  listCustomerCases,
  listTemplates,
} from "./queries";

describe("template queries", () => {
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
  const make = async (who: TestPhysio, kind: "routine" | "plan", name: string) => {
    const result = await as(who, (tx, pid) => createTemplate(tx, pid, { kind, name }));
    if (!result.ok) throw new Error(result.error);
    return result.data.id;
  };
  /** Rewrites a routine template with `count` exercises and the given status. */
  const fill = async (id: string, name: string, count: number, status: "active" | "archived") => {
    const result = await as(a, (tx, pid) =>
      saveRoutine(
        tx,
        pid,
        saveRoutineSchema.parse({
          id,
          version: 1,
          name,
          notes: null,
          caseId: null,
          sessionsPerWeek: null,
          sessionsPerDay: null,
          status,
          sections: [{ key: "s", name: "Main" }],
          groups: [],
          items: Array.from({ length: count }, () => ({
            exerciseId,
            groupKey: null,
            sectionKey: "s",
            holdSeconds: null,
            restSeconds: null,
            side: null,
            notes: null,
            sets: [{ reps: 10, repsMax: null, durationSeconds: null, load: null }],
          })),
        }),
      ),
    );
    if (!result.ok) throw new Error(result.error);
  };

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

  describe("listTemplates", () => {
    it("lists active routine templates with their exercise count, newest first", async () => {
      const who = await fresh();
      const older = await make(who, "routine", "Older");
      const newer = await make(who, "routine", "Newer");
      const list = await as(who, (tx, pid) => listTemplates(tx, pid, "routine", "", 50));
      expect(list.map((row) => row.id)).toEqual([newer, older]);
      expect(list[0]).toEqual({ id: newer, name: "Newer", detail: 0 });
    });

    it("counts exercises for routines and entries for plans", async () => {
      const routineId = await make(a, "routine", "Counted routine");
      await fill(routineId, "Counted routine", 3, "active");
      const planId = await make(a, "plan", "Counted plan");
      for (const weekday of [1, 3]) {
        const added = await as(a, (tx, pid) =>
          addNewRoutineEntry(tx, pid, { planId, weekday, name: `Day ${weekday}` }),
        );
        if (!added.ok) throw new Error(added.error);
      }
      const routinesFound = await as(a, (tx, pid) =>
        listTemplates(tx, pid, "routine", "counted", 50),
      );
      expect(routinesFound).toEqual([{ id: routineId, name: "Counted routine", detail: 3 }]);
      const plansFound = await as(a, (tx, pid) => listTemplates(tx, pid, "plan", "counted", 50));
      expect(plansFound).toEqual([{ id: planId, name: "Counted plan", detail: 2 }]);
    });

    it("leaves out archived templates, template plans' inner routines and customer rows", async () => {
      const who = await fresh();
      const [{ id: customerId }] = await db
        .insert(customers)
        .values({ physioId: who.id, firstName: "Ana", locale: "en" })
        .returning({ id: customers.id });
      const customerRoutine = await as(who, (tx, pid) =>
        createRoutine(tx, pid, { customerId, name: "Active customer routine", caseId: null }),
      );
      if (!customerRoutine.ok) throw new Error(customerRoutine.error);
      const active = await make(who, "routine", "Active one");
      const archived = await make(who, "routine", "Archived one");
      // `who` owns no exercises, so archive the empty template as it is.
      await as(who, (tx, pid) =>
        saveRoutine(
          tx,
          pid,
          saveRoutineSchema.parse({
            id: archived,
            version: 1,
            name: "Archived one",
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
      const planId = await make(who, "plan", "A plan");
      await as(who, (tx, pid) =>
        addNewRoutineEntry(tx, pid, { planId, weekday: 1, name: "Inner routine" }),
      );

      const routinesFound = await as(who, (tx, pid) => listTemplates(tx, pid, "routine", "", 50));
      expect(routinesFound.map((row) => row.id)).toEqual([active]);
      const plansFound = await as(who, (tx, pid) => listTemplates(tx, pid, "plan", "", 50));
      expect(plansFound.map((row) => row.id)).toEqual([planId]);
    });

    it("matches accent-insensitively and treats LIKE wildcards literally", async () => {
      const who = await fresh();
      const accented = await make(who, "routine", "Rótula 100%");
      await make(who, "routine", "Rotula plain");
      const byAccent = await as(who, (tx, pid) => listTemplates(tx, pid, "routine", "rotula", 50));
      expect(byAccent).toHaveLength(2);
      const byPercent = await as(who, (tx, pid) => listTemplates(tx, pid, "routine", "100%", 50));
      expect(byPercent.map((row) => row.id)).toEqual([accented]);
      const wildcard = await as(who, (tx, pid) => listTemplates(tx, pid, "routine", "%", 50));
      expect(wildcard.map((row) => row.id)).toEqual([accented]);
    });

    it("honours the limit and never returns another physio's templates", async () => {
      await make(a, "routine", "Only mine, limited");
      const forB = await as(b, (tx, pid) => listTemplates(tx, pid, "routine", "only mine", 50));
      expect(forB).toEqual([]);
      const limited = await as(a, (tx, pid) => listTemplates(tx, pid, "routine", "", 1));
      expect(limited).toHaveLength(1);
    });
  });

  describe("getTemplateName", () => {
    it("returns the name of the physio's template, null otherwise", async () => {
      const id = await make(a, "plan", "Named plan");
      expect(await as(a, (tx, pid) => getTemplateName(tx, pid, "plan", id))).toBe("Named plan");
      expect(await as(a, (tx, pid) => getTemplateName(tx, pid, "routine", id))).toBeNull();
      expect(await as(b, (tx, pid) => getTemplateName(tx, pid, "plan", id))).toBeNull();
    });

    it("returns null for a template plan's own routine", async () => {
      const planId = await make(a, "plan", "Plan with inner");
      const added = await as(a, (tx, pid) =>
        addNewRoutineEntry(tx, pid, { planId, weekday: 1, name: "Inner" }),
      );
      if (!added.ok) throw new Error(added.error);
      expect(
        await as(a, (tx, pid) => getTemplateName(tx, pid, "routine", added.data.routineId)),
      ).toBeNull();
    });

    it("returns null for a malformed id", async () => {
      expect(await as(a, (tx, pid) => getTemplateName(tx, pid, "plan", "nope"))).toBeNull();
    });

    it("returns null for a customer's routine", async () => {
      const [{ id: customerId }] = await db
        .insert(customers)
        .values({ physioId: a.id, firstName: "Bea", locale: "en" })
        .returning({ id: customers.id });
      const mine = await as(a, (tx, pid) =>
        createRoutine(tx, pid, { customerId, name: "Not a template", caseId: null }),
      );
      if (!mine.ok) throw new Error(mine.error);
      expect(
        await as(a, (tx, pid) => getTemplateName(tx, pid, "routine", mine.data.id)),
      ).toBeNull();
    });
  });

  describe("listCustomerCases", () => {
    it("lists open cases first and nothing for another physio's customer", async () => {
      const who = await fresh();
      const [{ id: customerId }] = await db
        .insert(customers)
        .values({ physioId: who.id, firstName: "Ana", locale: "en" })
        .returning({ id: customers.id });
      const [closed] = await db
        .insert(cases)
        .values({
          physioId: who.id,
          customerId,
          title: "Old shoulder",
          status: "closed",
          openedOn: "2026-01-01",
          closedOn: "2026-02-01",
        })
        .returning({ id: cases.id });
      const [open] = await db
        .insert(cases)
        .values({ physioId: who.id, customerId, title: "Knee", openedOn: "2025-01-01" })
        .returning({ id: cases.id });

      expect(await as(who, (tx, pid) => listCustomerCases(tx, pid, customerId))).toEqual([
        { id: open.id, title: "Knee" },
        { id: closed.id, title: "Old shoulder" },
      ]);
      expect(await as(b, (tx, pid) => listCustomerCases(tx, pid, customerId))).toEqual([]);
      expect(await as(who, (tx, pid) => listCustomerCases(tx, pid, "nope"))).toEqual([]);
    });
  });

  describe("listAssignableCustomers", () => {
    it("lists the physio's active customers by name, leaving out archived and foreign ones", async () => {
      const who = await fresh();
      await db.insert(customers).values([
        { physioId: who.id, firstName: "Zoe", lastName: "Ruiz", locale: "en" },
        { physioId: who.id, firstName: "Ana", locale: "en" },
        { physioId: who.id, firstName: "Old", locale: "en", archivedAt: new Date() },
      ]);
      const list = await as(who, (tx, pid) => listAssignableCustomers(tx, pid));
      expect(list.map((row) => row.name)).toEqual(["Ana", "Zoe Ruiz"]);
      expect(await as(b, (tx, pid) => listAssignableCustomers(tx, pid))).toEqual([]);
    });
  });
});
