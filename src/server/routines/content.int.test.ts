import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { routineItems, routineSections } from "@/db/schema";
import { insertCustomer, insertExercise, insertRoutine } from "@/test/int/content";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { loadRoutineContent, type RoutineContent } from "./content";

describe("loadRoutineContent", () => {
  const created: TestPhysio[] = [];
  let a: TestPhysio;
  let b: TestPhysio;
  let customerId: string;
  let routineId: string;

  beforeAll(async () => {
    a = await createTestPhysio({ onboarded: true });
    b = await createTestPhysio({ onboarded: true });
    created.push(a, b);
    customerId = await insertCustomer(a.id);
    const exerciseId = await insertExercise(a.id, { youtubeId: "dQw4w9WgXcQ" });
    routineId = await insertRoutine(a.id, customerId, {
      items: [{ exerciseId, group: "g" }, { exerciseId, group: "g" }, { exerciseId }],
    });
  });
  afterAll(() => deleteTestPhysios(...created));

  it("loads grouped and single blocks with media and sets under the physio's RLS", async () => {
    const result = await runAsPhysio(a.claims, (tx, id) =>
      loadRoutineContent(tx, id, customerId, [routineId]),
    );
    expect(result.size).toBe(1);
    const routine = result.get(routineId)!;
    expect(routine.sections).toHaveLength(1);
    const blocks = routine.sections[0]!.blocks;
    expect(blocks.map((block) => block.kind)).toEqual(["group", "single"]);
    const [group, single] = blocks;
    expect(group!.kind === "group" && group!.items).toHaveLength(2);
    const items = [
      ...(group!.kind === "group" ? group!.items : []),
      ...(single!.kind === "single" ? [single!.item] : []),
    ];
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.media[0]!.videoId).toBe("dQw4w9WgXcQ");
      expect(item.sets).toHaveLength(3);
    }
  });

  describe("sections", () => {
    it("orders sections, keeps empty ones, and never groups across a boundary", async () => {
      const exerciseId = await insertExercise(a.id);
      const id = await insertRoutine(a.id, customerId, {
        items: [
          { exerciseId, section: "Warm-up" },
          { exerciseId, section: "Main", group: "g" },
          { exerciseId, section: "Main", group: "g" },
          { exerciseId, section: "Main" },
        ],
      });
      await db
        .insert(routineSections)
        .values({ physioId: a.id, routineId: id, name: "Cool-down", position: 2 });
      const routine = (await loadRoutineContent(db, a.id, customerId, [id])).get(id)!;
      expect(routine.sections.map((s) => s.name)).toEqual(["Warm-up", "Main", "Cool-down"]);
      expect(routine.sections.map((s) => s.blocks.map((b) => b.kind))).toEqual([
        ["single"],
        ["group", "single"],
        [],
      ]);
    });

    it("puts an item with no section in the first one", async () => {
      const exerciseId = await insertExercise(a.id);
      const id = await insertRoutine(a.id, customerId, {
        items: [
          { exerciseId, section: "First" },
          { exerciseId, section: "Second" },
        ],
      });
      await db
        .update(routineItems)
        .set({ sectionId: null })
        .where(and(eq(routineItems.physioId, a.id), eq(routineItems.routineId, id)));
      const routine = (await loadRoutineContent(db, a.id, customerId, [id])).get(id)!;
      expect(routine.sections.map((s) => s.name)).toEqual(["First", "Second"]);
      expect(routine.sections[0]!.blocks).toHaveLength(2);
      expect(routine.sections[1]!.blocks).toHaveLength(0);
    });

    it("gives a routine with items but no sections one implicit section", async () => {
      const exerciseId = await insertExercise(a.id);
      const id = await insertRoutine(a.id, customerId, { items: [{ exerciseId }] });
      // In a transaction that rolls back: a committed routine without sections would be picked
      // up by the migration-backfill test running in parallel.
      const loaded = await db
        .transaction(async (tx) => {
          await tx
            .update(routineItems)
            .set({ sectionId: null })
            .where(and(eq(routineItems.physioId, a.id), eq(routineItems.routineId, id)));
          await tx
            .delete(routineSections)
            .where(and(eq(routineSections.physioId, a.id), eq(routineSections.routineId, id)));
          const routine = (await loadRoutineContent(tx, a.id, customerId, [id])).get(id)!;
          throw Object.assign(new Error("rollback"), { routine });
        })
        .catch((error: Error & { routine?: RoutineContent }) => {
          if (!error.routine) throw error;
          return error.routine;
        });
      expect(loaded.sections).toHaveLength(1);
      expect(loaded.sections[0]).toMatchObject({ key: "default", name: "" });
      expect(loaded.sections[0]!.blocks).toHaveLength(1);
    });
  });

  it("returns nothing to another physio", async () => {
    const result = await runAsPhysio(b.claims, (tx, id) =>
      loadRoutineContent(tx, id, customerId, [routineId]),
    );
    expect(result.size).toBe(0);
  });

  it("returns nothing for another customer's id", async () => {
    const result = await loadRoutineContent(db, a.id, randomUUID(), [routineId]);
    expect(result.size).toBe(0);
  });

  it("returns an empty map for no ids", async () => {
    expect((await loadRoutineContent(db, a.id, customerId, [])).size).toBe(0);
  });
});
