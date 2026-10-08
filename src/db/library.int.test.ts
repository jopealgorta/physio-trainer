import fs from "node:fs";
import path from "node:path";

import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { exerciseCategories, exerciseCategoryLinks, exerciseMedia, exercises } from "@/db/schema";
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
        .values({ physioId, name: "Bridge", bodyAreas: ["glute"] })
        .returning({ id: exercises.id });
      await tx
        .insert(exerciseCategoryLinks)
        .values({ physioId, exerciseId: aExercise, categoryId: aCategory });
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
    ["exercise_category_links", exerciseCategoryLinks],
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
      runAsPhysio(b.claims, async (tx, physioId) => {
        const [own] = await tx
          .insert(exercises)
          .values({ physioId, name: "Sneaky" })
          .returning({ id: exercises.id });
        await tx
          .insert(exerciseCategoryLinks)
          .values({ physioId, exerciseId: own.id, categoryId: aCategory });
      }),
    ).rejects.toMatchObject(rejectsWith("23503", "exercise_category_links_category_fk"));
    await expect(
      runAsPhysio(b.claims, async (tx, physioId) => {
        const [own] = await tx
          .insert(exerciseCategories)
          .values({ physioId, name: "Sneaky link", position: 0 })
          .returning({ id: exerciseCategories.id });
        await tx
          .insert(exerciseCategoryLinks)
          .values({ physioId, exerciseId: aExercise, categoryId: own.id });
      }),
    ).rejects.toMatchObject(rejectsWith("23503", "exercise_category_links_exercise_fk"));
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

  it("deleting a category cascades to sub-categories and drops only their links", async () => {
    const { parent, sub, inSub, other } = await runAsPhysio(a.claims, async (tx, physioId) => {
      const [parent] = await tx
        .insert(exerciseCategories)
        .values({ physioId, name: "Upper limb", position: 1 })
        .returning();
      const [sub] = await tx
        .insert(exerciseCategories)
        .values({ physioId, name: "Shoulder", parentId: parent.id, position: 0 })
        .returning();
      const [other] = await tx
        .insert(exerciseCategories)
        .values({ physioId, name: "Mobility", position: 2 })
        .returning();
      const [inSub] = await tx
        .insert(exercises)
        .values({ physioId, name: "Pendulum", archivedAt: new Date() })
        .returning();
      await tx.insert(exerciseCategoryLinks).values([
        { physioId, exerciseId: inSub.id, categoryId: sub.id },
        { physioId, exerciseId: inSub.id, categoryId: other.id },
      ]);
      await tx.delete(exerciseCategories).where(eq(exerciseCategories.id, parent.id));
      return { parent, sub, inSub, other };
    });
    const remaining = await db
      .select()
      .from(exerciseCategories)
      .where(inArray(exerciseCategories.id, [parent.id, sub.id]));
    const links = await db
      .select({ categoryId: exerciseCategoryLinks.categoryId })
      .from(exerciseCategoryLinks)
      .where(eq(exerciseCategoryLinks.exerciseId, inSub.id));
    const [kept] = await db.select().from(exercises).where(eq(exercises.id, inSub.id));
    expect(remaining).toEqual([]);
    expect(links).toEqual([{ categoryId: other.id }]);
    expect(kept).toMatchObject({ physioId: a.id });
  });

  it("deleting an exercise deletes its links", async () => {
    const links = await runAsPhysio(a.claims, async (tx, physioId) => {
      const [gone] = await tx
        .insert(exercises)
        .values({ physioId, name: "Short-lived" })
        .returning();
      await tx
        .insert(exerciseCategoryLinks)
        .values({ physioId, exerciseId: gone.id, categoryId: aCategory });
      await tx.delete(exercises).where(eq(exercises.id, gone.id));
      return tx
        .select()
        .from(exerciseCategoryLinks)
        .where(eq(exerciseCategoryLinks.exerciseId, gone.id));
    });
    expect(links).toEqual([]);
  });

  it("links an exercise to a category at most once", async () => {
    await expect(
      runAsPhysio(a.claims, (tx, physioId) =>
        tx
          .insert(exerciseCategoryLinks)
          .values({ physioId, exerciseId: aExercise, categoryId: aCategory }),
      ),
    ).rejects.toMatchObject(rejectsWith("23505"));
  });

  // The original backfill and its re-run in the contract PR (catching categories the previous app
  // version saved during the rollout). `category_id` is gone, so each run re-adds it in a
  // rolled-back transaction.
  it.each(["backfill", "rebackfill"])(
    "%s copies each exercise's old category into a link (migration statements)",
    async (name) => {
      const dir = path.join(process.cwd(), "supabase/migrations");
      const file = fs
        .readdirSync(dir)
        .find((f) => f.endsWith(`_exercise-category-links-${name}.sql`));
      const backfill = fs.readFileSync(path.join(dir, file!), "utf8");
      const rollback = new Error("rollback");
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`alter table public.exercises add column category_id uuid`);
          const [filed, linked, loose] = await tx
            .insert(exercises)
            .values(["Filed", "Linked", "Loose"].map((n) => ({ physioId: a.id, name: n })))
            .returning({ id: exercises.id });
          await tx.execute(sql`
            update public.exercises set category_id = ${aCategory}
            where id in (${filed.id}, ${linked.id})`);
          await tx
            .insert(exerciseCategoryLinks)
            .values({ physioId: a.id, exerciseId: linked.id, categoryId: aCategory });
          await tx.execute(sql.raw(backfill.replaceAll("--> statement-breakpoint", "")));
          const links = await tx
            .select()
            .from(exerciseCategoryLinks)
            .where(inArray(exerciseCategoryLinks.exerciseId, [filed.id, linked.id, loose.id]));
          expect(links).toHaveLength(2);
          expect(links).toEqual(
            expect.arrayContaining([
              { physioId: a.id, exerciseId: filed.id, categoryId: aCategory },
              { physioId: a.id, exerciseId: linked.id, categoryId: aCategory },
            ]),
          );
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    },
  );

  it("has no category_id or tags columns on exercises (contract after several categories)", async () => {
    const columns = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'exercises'
        and column_name in ('category_id', 'tags')`);
    expect(columns.map((row) => row.column_name)).toEqual([]);
  });

  it("has no default-prescription columns or checks on exercises (spec 05)", async () => {
    const columns = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'exercises'
        and column_name in ('sets', 'reps', 'reps_max', 'duration_seconds', 'hold_seconds',
                            'rest_seconds', 'load', 'side', 'notes')`);
    expect(columns.map((row) => row.column_name)).toEqual([]);
    const checks = await db.execute<{ conname: string }>(sql`
      select conname from pg_constraint
      where conrelid = 'public.exercises'::regclass and contype = 'c'
        and (conname like 'exercises\_%\_range' or conname in (
          'exercises_reps_range_order', 'exercises_load_length', 'exercises_notes_length'))`);
    expect(checks.map((row) => row.conname)).toEqual([]);
  });

  it("enforces media checks", async () => {
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
