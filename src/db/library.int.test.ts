import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { exerciseCategories, exerciseMedia, exercises } from "@/db/schema";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

const VIDEO = "dQw4w9WgXcQ";
const rejectsWith = (code: string, constraint_name?: string) => ({
  cause: expect.objectContaining(constraint_name ? { code, constraint_name } : { code }),
});

describe("exercise library tables", () => {
  let a: TestPhysio;
  let b: TestPhysio;
  let aCategory: string;
  let aExercise: string;

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTestPhysio({ onboarded: true }),
      createTestPhysio({ onboarded: true }),
    ]);
    await runAsPhysio(a.claims, async (tx, physioId) => {
      [{ id: aCategory }] = await tx
        .insert(exerciseCategories)
        .values({ physioId, name: "Lower limb", position: 0 })
        .returning({ id: exerciseCategories.id });
      [{ id: aExercise }] = await tx
        .insert(exercises)
        .values({
          physioId,
          name: "Bridge",
          categoryId: aCategory,
          bodyAreas: ["glute"],
          tags: ["band"],
        })
        .returning({ id: exercises.id });
      await tx.insert(exerciseMedia).values({
        physioId,
        exerciseId: aExercise,
        kind: "youtube",
        position: 0,
        externalId: VIDEO,
        externalUrl: `https://www.youtube.com/watch?v=${VIDEO}`,
      });
    });
  });

  afterAll(() => deleteTestPhysios(a, b));

  it.each([
    ["exercise_categories", exerciseCategories],
    ["exercises", exercises],
    ["exercise_media", exerciseMedia],
  ] as const)("RLS hides %s rows from other physios", async (_name, table) => {
    expect(await runAsPhysio(b.claims, (tx) => tx.select().from(table))).toEqual([]);
    expect((await runAsPhysio(a.claims, (tx) => tx.select().from(table))).length).toBe(1);
  });

  it("RLS blocks updates and deletes of another physio's rows", async () => {
    const updated = await runAsPhysio(b.claims, (tx) =>
      tx.update(exercises).set({ name: "Hijacked" }).where(eq(exercises.id, aExercise)).returning(),
    );
    const deleted = await runAsPhysio(b.claims, (tx) =>
      tx.delete(exerciseCategories).where(eq(exerciseCategories.id, aCategory)).returning(),
    );
    expect(updated).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it("RLS blocks inserting rows owned by someone else", async () => {
    await expect(
      runAsPhysio(b.claims, (tx) =>
        tx.insert(exercises).values({ physioId: a.id, name: "Intruder" }),
      ),
    ).rejects.toMatchObject(rejectsWith("42501"));
  });

  it("rejects references to another physio's category or exercise", async () => {
    await expect(
      runAsPhysio(b.claims, (tx, physioId) =>
        tx.insert(exercises).values({ physioId, name: "Sneaky", categoryId: aCategory }),
      ),
    ).rejects.toMatchObject(rejectsWith("23503", "exercises_category_fk"));
    await expect(
      runAsPhysio(b.claims, (tx, physioId) =>
        tx
          .insert(exerciseCategories)
          .values({ physioId, name: "Sneaky", parentId: aCategory, position: 0 }),
      ),
    ).rejects.toMatchObject(rejectsWith("23503", "exercise_categories_parent_fk"));
    await expect(
      runAsPhysio(b.claims, (tx, physioId) =>
        tx.insert(exerciseMedia).values({
          physioId,
          exerciseId: aExercise,
          kind: "youtube",
          position: 0, // occupied by A's media: proves uniqueness can't leak existence
          externalId: VIDEO,
          externalUrl: `https://www.youtube.com/watch?v=${VIDEO}`,
        }),
      ),
    ).rejects.toMatchObject(rejectsWith("23503", "exercise_media_exercise_fk"));
  });

  it("limits categories to two levels", async () => {
    await expect(
      runAsPhysio(a.claims, async (tx, physioId) => {
        const [child] = await tx
          .insert(exerciseCategories)
          .values({ physioId, name: "Glutes", parentId: aCategory, position: 0 })
          .returning();
        await tx
          .insert(exerciseCategories)
          .values({ physioId, name: "Too deep", parentId: child.id, position: 0 });
      }),
    ).rejects.toMatchObject(rejectsWith("23514", "exercise_categories_max_depth"));
  });

  it("keeps sibling names unique regardless of case, per parent", async () => {
    await expect(
      runAsPhysio(a.claims, (tx, physioId) =>
        tx.insert(exerciseCategories).values({ physioId, name: "LOWER LIMB", position: 1 }),
      ),
    ).rejects.toMatchObject(rejectsWith("23505", "exercise_categories_name_unique"));
    // The same name is fine for another physio.
    await runAsPhysio(b.claims, (tx, physioId) =>
      tx.insert(exerciseCategories).values({ physioId, name: "Lower limb", position: 0 }),
    );
  });

  it("deleting a category cascades to sub-categories and uncategorises their exercises", async () => {
    const { parent, sub, inSub } = await runAsPhysio(a.claims, async (tx, physioId) => {
      const [parent] = await tx
        .insert(exerciseCategories)
        .values({ physioId, name: "Upper limb", position: 1 })
        .returning();
      const [sub] = await tx
        .insert(exerciseCategories)
        .values({ physioId, name: "Shoulder", parentId: parent.id, position: 0 })
        .returning();
      const [inSub] = await tx
        .insert(exercises)
        .values({ physioId, name: "Pendulum", categoryId: sub.id, archivedAt: new Date() })
        .returning();
      await tx.delete(exerciseCategories).where(eq(exerciseCategories.id, parent.id));
      return { parent, sub, inSub };
    });
    const remaining = await db
      .select()
      .from(exerciseCategories)
      .where(inArray(exerciseCategories.id, [parent.id, sub.id]));
    const [moved] = await db.select().from(exercises).where(eq(exercises.id, inSub.id));
    expect(remaining).toEqual([]);
    expect(moved).toMatchObject({ categoryId: null, physioId: a.id });
  });

  it("enforces prescription and media checks", async () => {
    await expect(
      runAsPhysio(a.claims, (tx, physioId) =>
        tx.insert(exercises).values({ physioId, name: "Bad range", reps: 12, repsMax: 8 }),
      ),
    ).rejects.toMatchObject(rejectsWith("23514", "exercises_reps_range_order"));
    await expect(
      runAsPhysio(a.claims, (tx, physioId) =>
        tx.insert(exerciseMedia).values({
          physioId,
          exerciseId: aExercise,
          kind: "youtube",
          position: 1,
          externalId: "bad",
          externalUrl: "https://youtu.be/bad",
        }),
      ),
    ).rejects.toMatchObject(rejectsWith("23514", "exercise_media_youtube_id"));
  });

  it("has an accent-insensitive search function", async () => {
    const [row] = await db.execute<{ value: string }>(
      sql`select public.f_unaccent(lower('Élévation Ñandú')) as value`,
    );
    expect(row.value).toBe("elevation nandu");
  });
});
