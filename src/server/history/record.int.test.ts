import { and, asc, desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import {
  customers,
  exercises,
  routines,
  routineVersions,
  weeklyPlans,
  weeklyPlanVersions,
} from "@/db/schema";
import type { SaveItem } from "@/lib/routine-editor";
import {
  addEntry,
  addNewRoutineEntry,
  copyEntry,
  createPlan,
  makeSeparateCopy,
  moveEntry,
  removeEntry,
  setEntryLabel,
  updatePlan,
} from "@/server/plans/mutations";
import { copyIntoNextPhase } from "@/server/phases/mutations";
import { createRoutine, duplicateRoutine, saveRoutine } from "@/server/routines/mutations";
import type { SaveRoutineInput } from "@/server/routines/schemas";
import {
  assignTemplate,
  createTemplate,
  duplicateTemplate,
  saveAsTemplate,
} from "@/server/templates/mutations";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";
import { testClaims } from "@/test/int/supabase";

import { buildPlanSnapshot, buildRoutineSnapshot } from "./record";

const item = (exerciseId: string, reps = 10): SaveItem => ({
  exerciseId,
  groupKey: null,
  holdSeconds: null,
  restSeconds: null,
  side: null,
  notes: null,
  sets: [
    {
      reps,
      repsMax: null,
      durationSeconds: null,
      load: null,
      distanceMeters: null,
      intensity: null,
    },
  ],
});

const saveInput = (id: string, version: number, items: SaveItem[]): SaveRoutineInput => ({
  id,
  version,
  name: "Knee",
  notes: null,
  caseId: null,
  sessionsPerWeek: null,
  sessionsPerDay: null,
  status: "draft",
  groups: [],
  items,
});

/** Unwraps a mutation result, failing the test on an error. */
function data<T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`unexpected error: ${String(result.error)}`);
  return result.data;
}

const routineRows = (routineId: string) =>
  db
    .select()
    .from(routineVersions)
    .where(eq(routineVersions.routineId, routineId))
    .orderBy(asc(routineVersions.version));
const planRows = (planId: string) =>
  db
    .select()
    .from(weeklyPlanVersions)
    .where(eq(weeklyPlanVersions.weeklyPlanId, planId))
    .orderBy(asc(weeklyPlanVersions.version));

describe("recording versions", () => {
  const created: TestPhysio[] = [];
  let a: TestPhysio;
  let customerId: string;
  let exerciseId: string;

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
      .values({ physioId: who.id, name: "Bridge", instructions: "Lift the hips" })
      .returning({ id: exercises.id });
    return row.id;
  };
  const newRoutine = async (who: TestPhysio, forCustomer: string) =>
    data(
      await as(who, (tx, id) =>
        createRoutine(tx, id, { customerId: forCustomer, name: "Knee", caseId: null }),
      ),
    ).id;
  const newPlan = async (who: TestPhysio, forCustomer: string) =>
    data(
      await as(who, (tx, id) =>
        createPlan(tx, id, { customerId: forCustomer, name: "Week", caseId: null }),
      ),
    ).id;

  beforeAll(async () => {
    a = await fresh();
    customerId = await customer(a);
    exerciseId = await exercise(a);
  });
  afterAll(async () => {
    await deleteTestPhysios(...created);
  });

  describe("routines", () => {
    it("records version 1 as created, without a summary", async () => {
      const id = await newRoutine(a, customerId);
      const [row, ...rest] = await routineRows(id);
      expect(rest).toHaveLength(0);
      expect(row).toMatchObject({ version: 1, kind: "created", restoredFrom: null, summary: null });
      expect(row.physioId).toBe(a.id);
      expect(row.snapshot).toMatchObject({ schema: 1, routine: { name: "Knee" }, items: [] });
    });

    it("records each save with its snapshot and a summary against the previous version", async () => {
      const id = await newRoutine(a, customerId);
      const first = await as(a, (tx, physioId) =>
        saveRoutine(tx, physioId, saveInput(id, 1, [item(exerciseId, 10)])),
      );
      expect(data(first).version).toBe(2);
      const second = await as(a, (tx, physioId) =>
        saveRoutine(tx, physioId, saveInput(id, 2, [item(exerciseId, 12)])),
      );
      expect(data(second).version).toBe(3);

      const rows = await routineRows(id);
      expect(rows.map((row) => [row.version, row.kind])).toEqual([
        [1, "created"],
        [2, "edited"],
        [3, "edited"],
      ]);
      expect(rows[1].summary).toMatchObject({ added: 1, removed: 0, changed: 0 });
      expect(rows[2].snapshot.items).toEqual([
        {
          exercise: { id: exerciseId, name: "Bridge", instructions: "Lift the hips" },
          position: 0,
          prescription: {
            groupKey: null,
            holdSeconds: null,
            restSeconds: null,
            side: null,
            notes: null,
            sets: [
              {
                reps: 12,
                repsMax: null,
                durationSeconds: null,
                load: null,
                distanceMeters: null,
                intensity: null,
              },
            ],
          },
        },
      ]);
      expect(rows[2].summary).toEqual({
        added: 0,
        removed: 0,
        moved: 0,
        changed: 1,
        fields: { reps: 1 },
        header: [],
      });
      const [routine] = await db
        .select({ version: routines.version })
        .from(routines)
        .where(eq(routines.id, id));
      expect(routine.version).toBe(rows[2].version);
    });

    it("assigns group keys in order of first appearance", async () => {
      const id = await newRoutine(a, customerId);
      const other = await exercise(a);
      const grouped = (exercise: string, groupKey: string): SaveItem => ({
        ...item(exercise),
        groupKey,
      });
      await as(a, (tx, physioId) =>
        saveRoutine(tx, physioId, {
          ...saveInput(id, 1, [
            item(exerciseId),
            grouped(exerciseId, "later"),
            grouped(other, "later"),
          ]),
          groups: [{ key: "later", restSeconds: 90 }],
        }),
      );
      const snapshot = await as(a, (tx, physioId) => buildRoutineSnapshot(tx, physioId, id));
      expect(snapshot.groups).toEqual([{ key: "g0", restSeconds: 90 }]);
      expect(snapshot.items.map((entry) => entry.prescription.groupKey)).toEqual([
        null,
        "g0",
        "g0",
      ]);
    });

    it("rolls the snapshot back with a failed save", async () => {
      const id = await newRoutine(a, customerId);
      await expect(
        as(a, async (tx, physioId) => {
          data(await saveRoutine(tx, physioId, saveInput(id, 1, [item(exerciseId)])));
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      const rows = await routineRows(id);
      expect(rows.map((row) => row.version)).toEqual([1]);
    });
  });

  describe("plans", () => {
    const backdate = (rowId: string) =>
      db.transaction(async (tx) => {
        // Without the updated_at trigger, which would set it back to now().
        await tx.execute(sql`set local session_replication_role = replica`);
        await tx.execute(
          sql`update weekly_plan_versions set updated_at = now() - interval '6 minutes' where id = ${rowId}`,
        );
      });

    it("coalesces board actions of one session within five minutes", async () => {
      const planId = await newPlan(a, customerId);
      const routineId = await newRoutine(a, customerId);
      expect((await planRows(planId)).map((row) => [row.version, row.kind])).toEqual([
        [1, "created"],
      ]);

      // A created version is never coalesced into.
      const { entryId } = data(
        await as(a, (tx, id) => addEntry(tx, id, { planId, weekday: 1, routineId, label: null })),
      );
      expect((await planRows(planId)).map((row) => [row.version, row.kind])).toEqual([
        [1, "created"],
        [2, "edited"],
      ]);

      // Same session, fresh: the latest row moves to the new version.
      await as(a, (tx, id) => setEntryLabel(tx, id, { planId, entryId, label: "AM" }));
      let rows = await planRows(planId);
      expect(rows.map((row) => [row.version, row.kind])).toEqual([
        [1, "created"],
        [3, "edited"],
      ]);
      expect(rows[1].sessionId).toBe(a.claims.session_id);
      expect(rows[1].snapshot.entries).toMatchObject([{ id: entryId, label: "AM" }]);
      // Diffed against v1 (the row before it), not against the v2 it replaced: still one addition.
      expect(rows[1].summary).toMatchObject({ added: 1, changed: 0, fields: {} });

      // Older than five minutes: a new row.
      await backdate(rows[1].id);
      await as(a, (tx, id) => setEntryLabel(tx, id, { planId, entryId, label: "PM" }));
      rows = await planRows(planId);
      expect(rows.map((row) => row.version)).toEqual([1, 3, 4]);
      expect(rows[2].summary).toMatchObject({ added: 0, changed: 1, fields: { label: 1 } });

      // Another session: a new row, which that session then coalesces into.
      const other = { ...a, claims: testClaims(a.id, a.email) };
      await as(other, (tx, id) => setEntryLabel(tx, id, { planId, entryId, label: "Noon" }));
      await as(other, (tx, id) =>
        updatePlan(tx, id, {
          id: planId,
          name: "Week 2",
          notes: null,
          caseId: null,
          status: "draft",
        }),
      );
      rows = await planRows(planId);
      expect(rows.map((row) => row.version)).toEqual([1, 3, 4, 6]);
      expect(rows[3].sessionId).toBe(other.claims.session_id);
      expect(rows[3].summary).toMatchObject({ changed: 1, header: ["name"] });

      const [plan] = await db
        .select({ version: weeklyPlans.version })
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, planId));
      expect(plan.version).toBe(6);
    });

    it("lists entries by weekday and position with their routine's version", async () => {
      const planId = await newPlan(a, customerId);
      const routineId = await newRoutine(a, customerId);
      const add = (weekday: number) =>
        as(a, (tx, id) => addEntry(tx, id, { planId, weekday, routineId, label: null }));
      const tuesday = data(await add(2)).entryId;
      const monday = data(await add(1)).entryId;
      const mondayLater = data(await add(1)).entryId;
      const snapshot = await as(a, (tx, id) => buildPlanSnapshot(tx, id, planId));
      expect(snapshot.entries.map((entry) => [entry.id, entry.weekday, entry.position])).toEqual([
        [monday, 1, 0],
        [mondayLater, 1, 1],
        [tuesday, 2, 0],
      ]);
      expect(snapshot.entries[0].routine).toEqual({ id: routineId, name: "Knee", version: 1 });
    });
  });

  it("leaves every routine and plan with a version row for its current version", async () => {
    const c = await fresh();
    const me = <T>(fn: Parameters<typeof runAsPhysio<T>>[1]) => runAsPhysio(c.claims, fn);
    const cust = await customer(c);
    const ex = await exercise(c);

    const r1 = await newRoutine(c, cust);
    data(await me((tx, id) => saveRoutine(tx, id, saveInput(r1, 1, [item(ex)]))));
    data(await me((tx, id) => duplicateRoutine(tx, id, r1, { name: "Dup", isStandalone: true })));

    const p1 = await newPlan(c, cust);
    data(
      await me((tx, id) =>
        updatePlan(tx, id, { id: p1, name: "Week A", notes: "n", caseId: null, status: "draft" }),
      ),
    );
    const { entryId: e1 } = data(
      await me((tx, id) =>
        addEntry(tx, id, { planId: p1, weekday: 1, routineId: r1, label: null }),
      ),
    );
    const { entryId: e2 } = data(
      await me((tx, id) => copyEntry(tx, id, { planId: p1, entryId: e1, weekday: 2 })),
    );
    data(
      await me((tx, id) => moveEntry(tx, id, { planId: p1, entryId: e2, weekday: 3, index: 0 })),
    );
    data(await me((tx, id) => setEntryLabel(tx, id, { planId: p1, entryId: e1, label: "AM" })));
    data(
      await me((tx, id) =>
        makeSeparateCopy(tx, id, { planId: p1, entryId: e2 }, (name) => `${name} (copy)`),
      ),
    );
    const { entryId: e3 } = data(
      await me((tx, id) => addNewRoutineEntry(tx, id, { planId: p1, weekday: 4, name: "New" })),
    );
    data(
      await me((tx, id) => removeEntry(tx, id, { planId: p1, entryId: e3, deleteRoutine: true })),
    );

    const tR = data(await me((tx, id) => createTemplate(tx, id, { kind: "routine", name: "TR" })));
    const tP = data(await me((tx, id) => createTemplate(tx, id, { kind: "plan", name: "TP" })));
    data(
      await me((tx, id) => addNewRoutineEntry(tx, id, { planId: tP.id, weekday: 1, name: "TPR" })),
    );
    for (const [kind, sourceId] of [
      ["routine", r1],
      ["plan", p1],
    ] as const) {
      data(await me((tx, id) => saveAsTemplate(tx, id, { kind, sourceId, name: "Saved" })));
    }
    for (const [kind, templateId] of [
      ["routine", tR.id],
      ["plan", tP.id],
    ] as const) {
      data(
        await me((tx, id) =>
          assignTemplate(tx, id, {
            kind,
            templateId,
            customerId: cust,
            caseId: null,
            name: "Assigned",
            status: "draft",
          }),
        ),
      );
      data(await me((tx, id) => duplicateTemplate(tx, id, { kind, templateId, name: "Dup" })));
    }
    for (const [kind, sourceId] of [
      ["routine", r1],
      ["plan", p1],
    ] as const) {
      data(
        await me((tx, id) =>
          copyIntoNextPhase(tx, id, {
            kind,
            id: sourceId,
            phaseLabel: "Phase 2",
            startsOn: "2026-11-01",
            endsOn: null,
            endCurrent: false,
          }),
        ),
      );
    }

    const allRoutines = await db
      .select({ id: routines.id, version: routines.version })
      .from(routines)
      .where(eq(routines.physioId, c.id));
    const allPlans = await db
      .select({ id: weeklyPlans.id, version: weeklyPlans.version })
      .from(weeklyPlans)
      .where(eq(weeklyPlans.physioId, c.id));
    // p1, TP, and one each from save-as, assign, duplicate and next phase.
    expect(allPlans.length).toBe(6);
    expect(allRoutines.length).toBeGreaterThan(10);

    for (const routine of allRoutines) {
      const [latest] = await db
        .select()
        .from(routineVersions)
        .where(and(eq(routineVersions.physioId, c.id), eq(routineVersions.routineId, routine.id)))
        .orderBy(desc(routineVersions.version))
        .limit(1);
      expect(latest?.version, `routine ${routine.id}`).toBe(routine.version);
      const current = await me((tx, id) => buildRoutineSnapshot(tx, id, routine.id));
      expect(latest.snapshot, `routine ${routine.id}`).toEqual(current);
    }
    for (const plan of allPlans) {
      const [latest] = await db
        .select()
        .from(weeklyPlanVersions)
        .where(
          and(eq(weeklyPlanVersions.physioId, c.id), eq(weeklyPlanVersions.weeklyPlanId, plan.id)),
        )
        .orderBy(desc(weeklyPlanVersions.version))
        .limit(1);
      expect(latest?.version, `plan ${plan.id}`).toBe(plan.version);
      const current = await me((tx, id) => buildPlanSnapshot(tx, id, plan.id));
      expect(latest.snapshot, `plan ${plan.id}`).toEqual(current);
    }
  });
});
