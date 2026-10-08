import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import {
  cases,
  customers,
  exercises,
  routines,
  routineVersions,
  weeklyPlanDays,
  weeklyPlanEntries,
  weeklyPlans,
  weeklyPlanVersions,
} from "@/db/schema";
import type { RoutineSnapshot } from "@/lib/history/snapshot";
import type { SaveItem } from "@/lib/routine-editor";
import {
  addEntry,
  createPlan,
  removeEntry,
  setDayNotes,
  setEntryLabel,
  updatePlan,
} from "@/server/plans/mutations";
import { createRoutine, saveRoutine } from "@/server/routines/mutations";
import type { SaveRoutineInput } from "@/server/routines/schemas";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";
import { testClaims } from "@/test/int/supabase";

import { restorePlanVersion, restoreRoutineVersion } from "./mutations";
import { getSnapshots, listVersions } from "./queries";

const item = (exerciseId: string, reps = 10): SaveItem => ({
  exerciseId,
  groupKey: null,
  sectionKey: "s0",
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

const saveInput = (
  id: string,
  version: number,
  items: SaveItem[],
  header: Partial<SaveRoutineInput> = {},
): SaveRoutineInput => ({
  id,
  version,
  name: "Knee",
  notes: null,
  caseId: null,
  sessionsPerWeek: null,
  sessionsPerDay: null,
  status: "draft",
  sections: [{ key: "s0", name: "Main" }],
  groups: [],
  items,
  ...header,
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
const planEntries = (planId: string) =>
  db
    .select({
      weekday: weeklyPlanEntries.weekday,
      position: weeklyPlanEntries.position,
      routineId: weeklyPlanEntries.routineId,
    })
    .from(weeklyPlanEntries)
    .where(eq(weeklyPlanEntries.weeklyPlanId, planId))
    .orderBy(asc(weeklyPlanEntries.weekday), asc(weeklyPlanEntries.position));

describe("version history: list, compare and restore", () => {
  const created: TestPhysio[] = [];
  let a: TestPhysio;
  let b: TestPhysio;
  let customerId: string;

  const fresh = async () => {
    const physio = await createTestPhysio({ onboarded: true });
    created.push(physio);
    return physio;
  };
  // A new session per call, so plan edits never coalesce into one version.
  const as = <T>(who: TestPhysio, fn: Parameters<typeof runAsPhysio<T>>[1]) =>
    runAsPhysio(testClaims(who.id, who.email), fn);
  const exercise = async (who: TestPhysio, name = "Bridge") => {
    const [row] = await db
      .insert(exercises)
      .values({ physioId: who.id, name, instructions: null })
      .returning({ id: exercises.id });
    return row.id;
  };
  const newRoutine = async (who: TestPhysio, forCustomer: string, name = "Knee") =>
    data(
      await as(who, (tx, id) =>
        createRoutine(tx, id, { customerId: forCustomer, name, caseId: null }),
      ),
    ).id;
  const newPlan = async (who: TestPhysio, forCustomer: string) =>
    data(
      await as(who, (tx, id) =>
        createPlan(tx, id, { customerId: forCustomer, name: "Week", caseId: null }),
      ),
    ).id;
  const save = (id: string, version: number, items: SaveItem[], header = {}) =>
    as(a, (tx, physioId) => saveRoutine(tx, physioId, saveInput(id, version, items, header)));

  beforeAll(async () => {
    a = await fresh();
    b = await fresh();
    const [row] = await db
      .insert(customers)
      .values({ physioId: a.id, firstName: "Ana", locale: "en" })
      .returning({ id: customers.id });
    customerId = row.id;
  });
  afterAll(async () => {
    await deleteTestPhysios(...created);
  });

  describe("routines", () => {
    it("restores an older version's content as a new version, keeping status and case", async () => {
      const ex = await exercise(a);
      const [kase] = await db
        .insert(cases)
        .values({ physioId: a.id, customerId, title: "Left knee" })
        .returning({ id: cases.id });
      const id = await newRoutine(a, customerId);
      data(await save(id, 1, [item(ex, 10)], { sessionsPerWeek: 3 }));
      data(
        await save(id, 2, [item(ex, 12)], {
          name: "Knee B",
          status: "active",
          caseId: kase.id,
          sessionsPerWeek: 5,
        }),
      );

      const restored = await as(a, (tx, physioId) =>
        restoreRoutineVersion(tx, physioId, { id, version: 2 }, "Main"),
      );
      expect(restored).toEqual({ ok: true, data: { version: 4, dropped: 0 } });

      const rows = await routineRows(id);
      expect(rows.map((row) => [row.version, row.kind, row.restoredFrom])).toEqual([
        [1, "created", null],
        [2, "edited", null],
        [3, "edited", null],
        [4, "restored", 2],
      ]);
      const snapshot = rows[3].snapshot;
      expect(snapshot.items.map((it) => it.prescription.sets[0].reps)).toEqual([10]);
      expect(snapshot.routine).toMatchObject({
        name: "Knee",
        sessionsPerWeek: 3,
        status: "active",
        caseId: kase.id,
      });
      const [routine] = await db.select().from(routines).where(eq(routines.id, id));
      expect(routine).toMatchObject({ version: 4, status: "active", caseId: kase.id });
    });

    it("drops items whose exercise was deleted since", async () => {
      const kept = await exercise(a, "Kept");
      const gone = await exercise(a, "Gone");
      const id = await newRoutine(a, customerId);
      data(await save(id, 1, [item(gone), item(kept)]));
      data(await save(id, 2, [item(kept)]));
      await db.delete(exercises).where(eq(exercises.id, gone));

      const restored = await as(a, (tx, physioId) =>
        restoreRoutineVersion(tx, physioId, { id, version: 2 }, "Main"),
      );
      expect(restored).toEqual({ ok: true, data: { version: 4, dropped: 1 } });
      const rows = await routineRows(id);
      expect(rows[3].snapshot.items.map((it) => it.exercise.id)).toEqual([kept]);
    });

    it("keeps archived exercises", async () => {
      const ex = await exercise(a);
      const id = await newRoutine(a, customerId);
      data(await save(id, 1, [item(ex)]));
      data(await save(id, 2, []));
      await db.update(exercises).set({ archivedAt: new Date() }).where(eq(exercises.id, ex));

      const restored = await as(a, (tx, physioId) =>
        restoreRoutineVersion(tx, physioId, { id, version: 2 }, "Main"),
      );
      expect(restored).toEqual({ ok: true, data: { version: 4, dropped: 0 } });
    });

    it("restores an old snapshot (no sections) into one section with the default name", async () => {
      const ex = await exercise(a);
      const id = await newRoutine(a, customerId);
      data(await save(id, 1, [item(ex), item(ex)]));
      // Make version 2 look as it was stored before sections existed.
      await db.execute(
        sql`update routine_versions set snapshot = (snapshot - 'sections') where routine_id = ${id} and version = 2`,
      );
      const restored = await as(a, (tx, physioId) =>
        restoreRoutineVersion(tx, physioId, { id, version: 2 }, "Principal"),
      );
      expect(restored).toEqual({ ok: true, data: { version: 3, dropped: 0 } });
      const snapshot = (await routineRows(id))[2].snapshot;
      expect(snapshot.sections).toEqual([{ key: "s0", name: "Principal" }]);
      expect(snapshot.items.map((it) => it.prescription.sectionKey)).toEqual(["s0", "s0"]);
    });

    it("restores sections and item membership, keeping a section whose exercises are gone", async () => {
      const kept = await exercise(a, "Kept");
      const gone = await exercise(a, "Gone");
      const id = await newRoutine(a, customerId);
      const inSection = (it: SaveItem, sectionKey: string): SaveItem => ({ ...it, sectionKey });
      data(
        await save(id, 1, [inSection(item(kept), "s0"), inSection(item(gone), "s1")], {
          sections: [
            { key: "s0", name: "Warm-up" },
            { key: "s1", name: "Main" },
          ],
        }),
      );
      data(await save(id, 2, [item(kept)]));
      await db.delete(exercises).where(eq(exercises.id, gone));

      const restored = await as(a, (tx, physioId) =>
        restoreRoutineVersion(tx, physioId, { id, version: 2 }, "Principal"),
      );
      expect(restored).toEqual({ ok: true, data: { version: 4, dropped: 1 } });
      const snapshot = (await routineRows(id))[3].snapshot;
      expect(snapshot.sections).toEqual([
        { key: "s0", name: "Warm-up" },
        { key: "s1", name: "Main" },
      ]);
      expect(snapshot.items.map((it) => [it.exercise.id, it.prescription.sectionKey])).toEqual([
        [kept, "s0"],
      ]);
    });

    it("refuses to leave an active routine empty, without recording a version", async () => {
      const ex = await exercise(a);
      const id = await newRoutine(a, customerId);
      data(await save(id, 1, [item(ex)], { status: "active" }));

      const restored = await as(a, (tx, physioId) =>
        restoreRoutineVersion(tx, physioId, { id, version: 1 }, "Main"),
      );
      expect(restored).toEqual({ ok: false, error: "needsItems" });
      expect((await routineRows(id)).map((row) => row.version)).toEqual([1, 2]);
    });

    it("reports an unknown version", async () => {
      const id = await newRoutine(a, customerId);
      const restored = await as(a, (tx, physioId) =>
        restoreRoutineVersion(tx, physioId, { id, version: 9 }, "Main"),
      );
      expect(restored).toEqual({ ok: false, error: "versionNotFound" });
    });

    it("lists versions newest first with their summaries", async () => {
      const ex = await exercise(a);
      const id = await newRoutine(a, customerId);
      data(await save(id, 1, [item(ex, 10)]));
      data(await save(id, 2, [item(ex, 12)]));
      data(
        await as(a, (tx, physioId) =>
          restoreRoutineVersion(tx, physioId, { id, version: 2 }, "Main"),
        ),
      );

      const versions = await as(a, (tx, physioId) =>
        listVersions(tx, physioId, { kind: "routine", id }),
      );
      expect(versions?.map((v) => [v.version, v.kind, v.restoredFrom])).toEqual([
        [4, "restored", 2],
        [3, "edited", null],
        [2, "edited", null],
        [1, "created", null],
      ]);
      expect(versions?.[0].summary).toMatchObject({ changed: 1, fields: { reps: 1 } });
      expect(versions?.[2].summary).toMatchObject({ added: 1 });
      expect(versions?.[3].summary).toBeNull();
      expect(new Date(versions![0].at).getTime()).not.toBeNaN();

      const snapshots = await as(a, (tx, physioId) =>
        getSnapshots(tx, physioId, { kind: "routine", id }, [2, 3]),
      );
      expect(Object.keys(snapshots).sort()).toEqual(["2", "3"]);
      const reps = (snapshot: RoutineSnapshot) => snapshot.items[0].prescription.sets[0].reps;
      expect(reps(snapshots[2] as RoutineSnapshot)).toBe(10);
      expect(reps(snapshots[3] as RoutineSnapshot)).toBe(12);
    });

    it("keeps another physio out", async () => {
      const ex = await exercise(a);
      const id = await newRoutine(a, customerId);
      data(await save(id, 1, [item(ex)]));

      const target = { kind: "routine", id } as const;
      expect(await as(b, (tx, physioId) => listVersions(tx, physioId, target))).toBeNull();
      expect(await as(b, (tx, physioId) => getSnapshots(tx, physioId, target, [1, 2]))).toEqual({});
      expect(
        await as(b, (tx, physioId) =>
          restoreRoutineVersion(tx, physioId, { id, version: 1 }, "Main"),
        ),
      ).toEqual({ ok: false, error: "notFound" });
      expect((await routineRows(id)).map((row) => row.version)).toEqual([1, 2]);
    });
  });

  describe("plans", () => {
    it("restores entries, name and notes, dropping archived routines", async () => {
      const kept = await newRoutine(a, customerId, "Kept");
      const archived = await newRoutine(a, customerId, "Archived");
      const planId = await newPlan(a, customerId);
      const add = (routineId: string) =>
        as(a, (tx, id) => addEntry(tx, id, { planId, weekday: 1, routineId, label: null }));
      const first = data(await add(archived)).entryId; // v2
      const second = data(await add(kept)).entryId; // v3
      data(
        await as(a, (tx, id) =>
          updatePlan(tx, id, {
            id: planId,
            name: "Week B",
            notes: "n",
            caseId: null,
            status: "draft",
          }),
        ),
      ); // v4
      for (const entryId of [first, second]) {
        data(
          await as(a, (tx, id) => removeEntry(tx, id, { planId, entryId, deleteRoutine: false })),
        );
      } // v6
      await db.update(routines).set({ status: "archived" }).where(eq(routines.id, archived));

      const restored = await as(a, (tx, physioId) =>
        restorePlanVersion(tx, physioId, { id: planId, version: 3 }),
      );
      expect(restored).toEqual({ ok: true, data: { version: 7, dropped: 1 } });
      expect(await planEntries(planId)).toEqual([{ weekday: 1, position: 0, routineId: kept }]);
      const [plan] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, planId));
      expect(plan).toMatchObject({ name: "Week", notes: null, version: 7, status: "draft" });

      const rows = await planRows(planId);
      expect(rows.at(-1)).toMatchObject({ version: 7, kind: "restored", restoredFrom: 3 });
      expect(rows.at(-1)?.snapshot.entries.map((entry) => entry.routine.id)).toEqual([kept]);

      const versions = await as(a, (tx, physioId) =>
        listVersions(tx, physioId, { kind: "plan", id: planId }),
      );
      expect(versions?.map((v) => v.version)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    });

    it("keeps the snapshot's entry ids, so a diff across a restore shows only what differs", async () => {
      const routineId = await newRoutine(a, customerId);
      const planId = await newPlan(a, customerId);
      const add = (weekday: number) =>
        as(a, (tx, id) => addEntry(tx, id, { planId, weekday, routineId, label: null }));
      const monday = data(await add(1)).entryId; // v2
      const tuesday = data(await add(2)).entryId; // v3
      data(
        await as(a, (tx, id) => setEntryLabel(tx, id, { planId, entryId: monday, label: "AM" })),
      ); // v4

      const restored = await as(a, (tx, physioId) =>
        restorePlanVersion(tx, physioId, { id: planId, version: 3 }),
      );
      expect(restored).toEqual({ ok: true, data: { version: 5, dropped: 0 } });
      const ids = await db
        .select({ id: weeklyPlanEntries.id })
        .from(weeklyPlanEntries)
        .where(eq(weeklyPlanEntries.weeklyPlanId, planId))
        .orderBy(asc(weeklyPlanEntries.weekday));
      expect(ids.map((row) => row.id)).toEqual([monday, tuesday]);

      const versions = await as(a, (tx, physioId) =>
        listVersions(tx, physioId, { kind: "plan", id: planId }),
      );
      expect(versions?.[0]).toMatchObject({ version: 5, kind: "restored" });
      expect(versions?.[0].summary).toEqual({
        added: 0,
        removed: 0,
        moved: 0,
        changed: 1,
        fields: { label: 1 },
        header: [],
      });
    });

    it("refuses to leave an active plan without entries", async () => {
      const routineId = await newRoutine(a, customerId);
      const planId = await newPlan(a, customerId);
      data(
        await as(a, (tx, id) => addEntry(tx, id, { planId, weekday: 2, routineId, label: null })),
      );
      data(
        await as(a, (tx, id) =>
          updatePlan(tx, id, {
            id: planId,
            name: "Week",
            notes: null,
            caseId: null,
            status: "active",
          }),
        ),
      );

      const restored = await as(a, (tx, physioId) =>
        restorePlanVersion(tx, physioId, { id: planId, version: 1 }),
      );
      expect(restored).toEqual({ ok: false, error: "needsEntries" });
      expect((await planRows(planId)).map((row) => row.version)).toEqual([1, 2, 3]);
      expect(await planEntries(planId)).toEqual([{ weekday: 2, position: 0, routineId }]);
    });

    it("restores an older version's day notes, and clears them for a snapshot without days", async () => {
      const planId = await newPlan(a, customerId);
      const notes = async () =>
        (await db.select().from(weeklyPlanDays).where(eq(weeklyPlanDays.weeklyPlanId, planId)))
          .map((row) => [row.weekday, row.notes])
          .sort();
      data(await as(a, (tx, id) => setDayNotes(tx, id, { planId, weekday: 2, notes: "Easy" }))); // v2
      data(await as(a, (tx, id) => setDayNotes(tx, id, { planId, weekday: 2, notes: "Hard" }))); // v3
      data(await as(a, (tx, id) => setDayNotes(tx, id, { planId, weekday: 4, notes: "Pool" }))); // v4
      expect(await notes()).toEqual([
        [2, "Hard"],
        [4, "Pool"],
      ]);

      data(await as(a, (tx, id) => restorePlanVersion(tx, id, { id: planId, version: 2 })));
      expect(await notes()).toEqual([[2, "Easy"]]);

      // A snapshot saved before this feature has no days: restoring it clears them.
      const [old] = await planRows(planId);
      const legacy = { ...old.snapshot, days: undefined };
      await db
        .update(weeklyPlanVersions)
        .set({ snapshot: legacy as never })
        .where(eq(weeklyPlanVersions.id, old.id));
      data(await as(a, (tx, id) => restorePlanVersion(tx, id, { id: planId, version: 1 })));
      expect(await notes()).toEqual([]);
    });

    it("keeps another physio out", async () => {
      const planId = await newPlan(a, customerId);
      const target = { kind: "plan", id: planId } as const;
      expect(await as(b, (tx, physioId) => listVersions(tx, physioId, target))).toBeNull();
      expect(await as(b, (tx, physioId) => getSnapshots(tx, physioId, target, [1]))).toEqual({});
      expect(
        await as(b, (tx, physioId) => restorePlanVersion(tx, physioId, { id: planId, version: 1 })),
      ).toEqual({ ok: false, error: "notFound" });
      expect(
        await as(a, (tx, physioId) => restorePlanVersion(tx, physioId, { id: planId, version: 5 })),
      ).toEqual({ ok: false, error: "versionNotFound" });
    });
  });
});
