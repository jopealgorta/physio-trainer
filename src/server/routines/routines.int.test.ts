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
} from "@/db/schema";
import type { SaveItem } from "@/lib/routine-editor";
import { DEFAULT_ROUTINE_FILTERS, type RoutineFilters } from "@/lib/routine-params";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { createRoutine, saveRoutine } from "./mutations";
import { getRoutine, listRecentExercises, listRoutines } from "./queries";
import { saveRoutineSchema, type SaveRoutineInput } from "./schemas";

const RANDOM_ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

const filters = (overrides: Partial<RoutineFilters> = {}): RoutineFilters => ({
  ...DEFAULT_ROUTINE_FILTERS,
  ...overrides,
});
const set = (reps: number | null = 10, extra: Record<string, unknown> = {}) => ({
  reps,
  repsMax: null,
  durationSeconds: null,
  load: null,
  distanceMeters: null,
  intensity: null,
  ...extra,
});
const item = (exerciseId: string, overrides: Partial<SaveItem> = {}): SaveItem => ({
  exerciseId,
  groupKey: null,
  holdSeconds: null,
  restSeconds: null,
  side: null,
  notes: null,
  sets: [set()],
  ...overrides,
});

describe("routines server layer", () => {
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

  const customer = async (who: TestPhysio, firstName = "Ana", lastName: string | null = null) => {
    const [row] = await db
      .insert(customers)
      .values({ physioId: who.id, firstName, lastName, locale: "en" })
      .returning({ id: customers.id });
    return row.id;
  };
  const kase = async (who: TestPhysio, customerId: string, title = "Knee") => {
    const [row] = await db
      .insert(cases)
      .values({ physioId: who.id, customerId, title })
      .returning({ id: cases.id });
    return row.id;
  };
  const exercise = async (who: TestPhysio, name = "Bridge", archived = false) => {
    const [row] = await db
      .insert(exercises)
      .values({ physioId: who.id, name, archivedAt: archived ? new Date() : null })
      .returning({ id: exercises.id });
    return row.id;
  };
  const routine = async (
    who: TestPhysio,
    customerId: string,
    name = "Routine",
    caseId: string | null = null,
  ) => {
    const result = await as(who, (tx, id) => createRoutine(tx, id, { customerId, name, caseId }));
    if (!result.ok) throw new Error(result.error);
    return result.data.id;
  };
  const payload = (id: string, overrides: Record<string, unknown> = {}): SaveRoutineInput =>
    saveRoutineSchema.parse({
      id,
      version: 1,
      name: "Saved",
      notes: null,
      caseId: null,
      sessionsPerWeek: null,
      sessionsPerDay: null,
      status: "draft",
      groups: [],
      items: [],
      ...overrides,
    });
  const save = (who: TestPhysio, input: SaveRoutineInput) =>
    as(who, (tx, id) => saveRoutine(tx, id, input));
  const counts = async (routineId: string) => {
    const items = await db.select().from(routineItems).where(eq(routineItems.routineId, routineId));
    const groups = await db
      .select()
      .from(routineGroups)
      .where(eq(routineGroups.routineId, routineId));
    const sets = items.length
      ? await db
          .select()
          .from(routineItemSets)
          .where(
            inArray(
              routineItemSets.routineItemId,
              items.map((row) => row.id),
            ),
          )
      : [];
    return { items: items.length, groups: groups.length, sets: sets.length };
  };

  beforeAll(async () => {
    [a, b] = await Promise.all([fresh(), fresh()]);
  });
  afterAll(() => deleteTestPhysios(...created));

  describe("createRoutine", () => {
    it("creates a standalone draft at version 1 for an own customer", async () => {
      const customerId = await customer(a);
      const id = await routine(a, customerId, "Fresh");
      const [row] = await db.select().from(routines).where(eq(routines.id, id));
      expect(row).toMatchObject({
        physioId: a.id,
        customerId,
        name: "Fresh",
        status: "draft",
        version: 1,
        isStandalone: true,
        caseId: null,
      });
    });

    it("stores an own case of the same customer", async () => {
      const customerId = await customer(a);
      const caseId = await kase(a, customerId);
      const id = await routine(a, customerId, "With case", caseId);
      const [row] = await db.select().from(routines).where(eq(routines.id, id));
      expect(row.caseId).toBe(caseId);
    });

    it("rejects another physio's customer and a case of another customer", async () => {
      const bCustomer = await customer(b);
      expect(
        await as(a, (tx, id) =>
          createRoutine(tx, id, { customerId: bCustomer, name: "X", caseId: null }),
        ),
      ).toEqual({ ok: false, error: "customerNotFound" });

      const own = await customer(a);
      const other = await customer(a, "Other");
      const otherCase = await kase(a, other);
      expect(
        await as(a, (tx, id) =>
          createRoutine(tx, id, { customerId: own, name: "X", caseId: otherCase }),
        ),
      ).toEqual({ ok: false, error: "caseNotFound" });
    });

    it("treats non-uuid ids as not found", async () => {
      expect(
        await as(a, (tx, id) =>
          createRoutine(tx, id, { customerId: "nope", name: "X", caseId: null }),
        ),
      ).toEqual({ ok: false, error: "customerNotFound" });
      const own = await customer(a);
      expect(
        await as(a, (tx, id) =>
          createRoutine(tx, id, { customerId: own, name: "X", caseId: "nope" }),
        ),
      ).toEqual({ ok: false, error: "caseNotFound" });
    });
  });

  describe("saveRoutine", () => {
    let customerId: string;
    let caseId: string;
    let e1: string;
    let e2: string;
    let e3: string;

    beforeAll(async () => {
      customerId = await customer(a, "Save", "Case");
      caseId = await kase(a, customerId, "Shoulder");
      [e1, e2, e3] = await Promise.all([
        exercise(a, "Squat"),
        exercise(a, "Lunge"),
        exercise(a, "Plank"),
      ]);
    });

    const richPayload = (id: string, version: number) =>
      payload(id, {
        version,
        name: "  Leg day ",
        notes: "Stop if sharp pain",
        caseId,
        sessionsPerWeek: 3,
        sessionsPerDay: 2,
        status: "active",
        groups: [{ key: "g1", restSeconds: 90 }],
        items: [
          item(e1, { groupKey: "g1", sets: [set(10), set(12, { load: "5 kg" })] }),
          item(e2, {
            groupKey: "g1",
            sets: [set(8, { repsMax: 12 }), set(null, { durationSeconds: 30 })],
          }),
          item(e3, {
            restSeconds: 45,
            holdSeconds: 20,
            side: "left",
            notes: "Slow",
            sets: [set(5)],
          }),
        ],
      });

    it("writes header, group, items and sets, and getRoutine reads them in order", async () => {
      const id = await routine(a, customerId, "Draft");
      expect(await save(a, richPayload(id, 1))).toEqual({ ok: true, data: { version: 2 } });

      const detail = await as(a, (tx, p) => getRoutine(tx, p, id));
      expect(detail).toMatchObject({
        id,
        version: 2,
        customerId,
        customerFirstName: "Save",
        customerLastName: "Case",
        name: "Leg day",
        notes: "Stop if sharp pain",
        caseId,
        sessionsPerWeek: 3,
        sessionsPerDay: 2,
        status: "active",
        cases: [{ id: caseId, title: "Shoulder", status: "open" }],
      });
      expect(detail!.groups).toHaveLength(1);
      expect(detail!.groups[0].restSeconds).toBe(90);
      expect(detail!.items.map((row) => row.exerciseName)).toEqual(["Squat", "Lunge", "Plank"]);
      const groupId = detail!.groups[0].id;
      expect(detail!.items.map((row) => row.groupId)).toEqual([groupId, groupId, null]);
      expect(detail!.items[0].sets).toEqual([set(10), set(12, { load: "5 kg" })]);
      expect(detail!.items[1].sets).toEqual([
        set(8, { repsMax: 12 }),
        set(null, { durationSeconds: 30 }),
      ]);
      expect(detail!.items[2]).toMatchObject({
        restSeconds: 45,
        holdSeconds: 20,
        side: "left",
        notes: "Slow",
        exerciseArchived: false,
        cover: null,
      });
      const positions = await db
        .select({ position: routineItems.position })
        .from(routineItems)
        .where(eq(routineItems.routineId, id))
        .orderBy(routineItems.position);
      expect(positions.map((row) => row.position)).toEqual([0, 1, 2]);
    });

    it("replaces children on every save and leaves no orphans", async () => {
      const id = await routine(a, customerId, "Replace");
      await save(a, richPayload(id, 1));
      const before = await as(a, (tx, p) => getRoutine(tx, p, id));
      const oldIds = before!.items.map((row) => row.id);
      expect(await counts(id)).toEqual({ items: 3, groups: 1, sets: 5 });

      const next = payload(id, { version: 2, name: "Smaller", items: [item(e1)] });
      expect(await save(a, next)).toEqual({ ok: true, data: { version: 3 } });

      const after = await as(a, (tx, p) => getRoutine(tx, p, id));
      expect(after!.items).toHaveLength(1);
      expect(oldIds).not.toContain(after!.items[0].id);
      expect(after!.groups).toEqual([]);
      expect(await counts(id)).toEqual({ items: 1, groups: 0, sets: 1 });
      const stored = await db
        .select({ id: routineItems.id })
        .from(routineItems)
        .where(inArray(routineItems.id, oldIds));
      expect(stored).toEqual([]);
    });

    it("rejects a stale version and changes nothing", async () => {
      const id = await routine(a, customerId, "Stale");
      await save(a, payload(id, { version: 1, name: "First", items: [item(e1)] }));
      const stale = payload(id, { version: 1, name: "Second", items: [item(e2), item(e3)] });
      expect(await save(a, stale)).toEqual({ ok: false, error: "conflict" });
      const detail = await as(a, (tx, p) => getRoutine(tx, p, id));
      expect(detail).toMatchObject({ name: "First", version: 2 });
      expect(detail!.items).toHaveLength(1);
    });

    it("lets exactly one of two concurrent saves win", async () => {
      const id = await routine(a, customerId, "Race");
      const results = await Promise.all([
        save(a, payload(id, { name: "One", items: [item(e1)] })),
        save(a, payload(id, { name: "Two", items: [item(e2)] })),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "conflict" }]);
      const detail = await as(a, (tx, p) => getRoutine(tx, p, id));
      expect(detail!.version).toBe(2);
      expect(detail!.items).toHaveLength(1);
      expect(await counts(id)).toEqual({ items: 1, groups: 0, sets: 1 });
    });

    it("is scoped to the physio: foreign exercise, case and routine write nothing", async () => {
      const bCustomer = await customer(b);
      const bCase = await kase(b, bCustomer);
      const bExercise = await exercise(b, "B only");
      const bRoutine = await routine(b, bCustomer, "B routine");
      const id = await routine(a, customerId, "Mine");
      const before = await counts(id);

      expect(await save(a, payload(id, { items: [item(bExercise)] }))).toEqual({
        ok: false,
        error: "exerciseNotFound",
      });
      expect(await save(a, payload(id, { caseId: bCase, items: [item(e1)] }))).toEqual({
        ok: false,
        error: "caseNotFound",
      });
      expect(await save(a, payload(bRoutine, { name: "Hijack", items: [item(e1)] }))).toEqual({
        ok: false,
        error: "notFound",
      });
      expect(await counts(id)).toEqual(before);
      expect(await counts(bRoutine)).toEqual({ items: 0, groups: 0, sets: 0 });
      const [row] = await db.select().from(routines).where(eq(routines.id, bRoutine));
      expect(row).toMatchObject({ name: "B routine", version: 1 });
      expect(await as(a, (tx, p) => getRoutine(tx, p, bRoutine))).toBeNull();
    });

    it("rejects a case of another customer of the same physio", async () => {
      const otherCustomer = await customer(a, "Other");
      const otherCase = await kase(a, otherCustomer);
      const id = await routine(a, customerId, "Wrong case");
      expect(await save(a, payload(id, { caseId: otherCase }))).toEqual({
        ok: false,
        error: "caseNotFound",
      });
    });

    it("treats a random routine id as not found", async () => {
      expect(await save(a, payload(RANDOM_ID))).toEqual({ ok: false, error: "notFound" });
    });

    it("needs items to activate, but saves an empty draft and archives freely", async () => {
      const id = await routine(a, customerId, "Rules");
      expect(await save(a, payload(id, { status: "active" }))).toEqual({
        ok: false,
        error: "needsItems",
      });
      expect(await save(a, payload(id, { status: "draft" }))).toEqual({
        ok: true,
        data: { version: 2 },
      });
      expect(await save(a, payload(id, { version: 2, status: "archived" }))).toEqual({
        ok: true,
        data: { version: 3 },
      });
      const detail = await as(a, (tx, p) => getRoutine(tx, p, id));
      expect(detail!.status).toBe("archived");
    });

    it("still resolves an archived exercise", async () => {
      const archived = await exercise(a, "Old move", true);
      const id = await routine(a, customerId, "Archived ex");
      await save(a, payload(id, { items: [item(archived)] }));
      const detail = await as(a, (tx, p) => getRoutine(tx, p, id));
      expect(detail!.items[0]).toMatchObject({ exerciseName: "Old move", exerciseArchived: true });
    });
  });

  describe("getRoutine", () => {
    it("returns null for other physios' routines and malformed ids", async () => {
      const bCustomer = await customer(b);
      const bRoutine = await routine(b, bCustomer);
      expect(await as(a, (tx, p) => getRoutine(tx, p, bRoutine))).toBeNull();
      expect(await as(a, (tx, p) => getRoutine(tx, p, RANDOM_ID))).toBeNull();
      expect(await as(a, (tx, p) => getRoutine(tx, p, "nope"))).toBeNull();
    });
  });

  describe("listRoutines", () => {
    let p: TestPhysio;
    let ana: string;
    let beto: string;
    let knee: string;
    let r: Record<string, string>;

    beforeAll(async () => {
      p = await fresh();
      const q = await fresh();
      ana = await customer(p, "Ana", "Pérez");
      beto = await customer(p, "Beto");
      knee = await kase(p, ana, "Knee");
      const ex = await exercise(p, "Move");
      const mk = async (name: string, customerId: string, extra: Partial<SaveRoutineInput>) => {
        const id = await routine(p, customerId, name);
        const result = await save(
          p,
          payload(id, { name, ...extra, items: extra.items ?? [] }) as SaveRoutineInput,
        );
        if (!result.ok) throw new Error(result.error);
        return id;
      };
      r = {
        rehab: await mk("Rehabilitación rodilla", ana, {
          status: "active",
          caseId: knee,
          sessionsPerWeek: 3,
          items: [item(ex), item(ex)],
        }),
        strength: await mk("Strength", beto, { status: "draft" }),
        percent: await mk("50% effort", beto, { status: "archived" }),
        under: await mk("A_B", ana, { status: "draft" }),
        plain: await mk("AxB", ana, { status: "draft" }),
      };
      // Another physio's data must never show up.
      const qCustomer = await customer(q, "Zed");
      await routine(q, qCustomer, "Rehabilitación ajena");
    });

    const names = async (f: Partial<RoutineFilters>) =>
      (await as(p, (tx, id) => listRoutines(tx, id, filters(f)))).routines.map((row) => row.name);

    it("returns own rows only, with customer, case title and item count", async () => {
      const { routines: rows, truncated } = await as(p, (tx, id) =>
        listRoutines(tx, id, filters()),
      );
      expect(truncated).toBe(false);
      expect(rows).toHaveLength(5);
      const rehab = rows.find((row) => row.id === r.rehab)!;
      expect(rehab).toMatchObject({
        name: "Rehabilitación rodilla",
        status: "active",
        customerId: ana,
        customerFirstName: "Ana",
        customerLastName: "Pérez",
        caseTitle: "Knee",
        itemCount: 2,
        sessionsPerWeek: 3,
      });
      expect(rehab.updatedAt).toBeInstanceOf(Date);
      const strength = rows.find((row) => row.id === r.strength)!;
      expect(strength).toMatchObject({ caseTitle: null, itemCount: 0, sessionsPerWeek: null });
    });

    it("filters by status and customer", async () => {
      expect(await names({ status: "archived" })).toEqual(["50% effort"]);
      expect(await names({ status: "active" })).toEqual(["Rehabilitación rodilla"]);
      expect((await names({ customerId: beto })).sort()).toEqual(["50% effort", "Strength"]);
      expect(await names({ customerId: beto, status: "draft" })).toEqual(["Strength"]);
    });

    it("searches names accent- and case-insensitively, with literal wildcards", async () => {
      expect(await names({ q: "REHABILITACION" })).toEqual(["Rehabilitación rodilla"]);
      expect(await names({ q: "rodi" })).toEqual(["Rehabilitación rodilla"]);
      expect(await names({ q: "50%" })).toEqual(["50% effort"]);
      expect(await names({ q: "a_b" })).toEqual(["A_B"]);
      expect(await names({ q: "zzz" })).toEqual([]);
    });

    it("flags truncation at the limit", async () => {
      const page = await as(p, (tx, id) => listRoutines(tx, id, filters(), 2));
      expect(page.routines).toHaveLength(2);
      expect(page.truncated).toBe(true);
      const exact = await as(p, (tx, id) => listRoutines(tx, id, filters(), 5));
      expect(exact.truncated).toBe(false);
    });
  });

  describe("listRecentExercises", () => {
    it("lists distinct non-archived exercises, most recently added first, within the limit", async () => {
      const p = await fresh();
      const customerId = await customer(p);
      const [x, y, z, gone] = await Promise.all([
        exercise(p, "X"),
        exercise(p, "Y"),
        exercise(p, "Z"),
        exercise(p, "Gone"),
      ]);
      const id = await routine(p, customerId, "Recent");
      await save(p, payload(id, { items: [item(x), item(y), item(gone), item(x)] }));
      // Deterministic recency regardless of the same-transaction timestamps.
      const rows = await db.select().from(routineItems).where(eq(routineItems.routineId, id));
      const at = (exerciseId: string, minute: number) =>
        db
          .update(routineItems)
          .set({ createdAt: new Date(Date.UTC(2026, 0, 1, 10, minute)) })
          .where(
            inArray(
              routineItems.id,
              rows.filter((row) => row.exerciseId === exerciseId).map((row) => row.id),
            ),
          );
      await at(x, 1);
      await at(y, 5);
      await at(gone, 9);
      await db.update(exercises).set({ archivedAt: new Date() }).where(eq(exercises.id, gone));
      const other = await routine(p, customerId, "Later");
      await save(p, payload(other, { items: [item(z)] }));
      await db
        .update(routineItems)
        .set({ createdAt: new Date(Date.UTC(2026, 0, 1, 10, 7)) })
        .where(eq(routineItems.routineId, other));

      const names = (list: { name: string }[]) => list.map((row) => row.name);
      expect(names(await as(p, (tx, pid) => listRecentExercises(tx, pid)))).toEqual([
        "Z",
        "Y",
        "X",
      ]);
      expect(names(await as(p, (tx, pid) => listRecentExercises(tx, pid, 2)))).toEqual(["Z", "Y"]);
      expect(await as(a, (tx, pid) => listRecentExercises(tx, pid))).not.toContainEqual(
        expect.objectContaining({ name: "Z" }),
      );
    });

    it("breaks timestamp ties (one save) by position: the later exercise comes first", async () => {
      const p = await fresh();
      const customerId = await customer(p);
      const [x, y, z] = await Promise.all([exercise(p, "X"), exercise(p, "Y"), exercise(p, "Z")]);
      const id = await routine(p, customerId, "Tie");
      await save(p, payload(id, { items: [item(y), item(z), item(x)] }));
      await db
        .update(routineItems)
        .set({ createdAt: new Date(Date.UTC(2026, 0, 1, 10, 0)) })
        .where(eq(routineItems.routineId, id));

      const names = (await as(p, (tx, pid) => listRecentExercises(tx, pid))).map((row) => row.name);
      expect(names).toEqual(["X", "Z", "Y"]);
    });
  });
});
