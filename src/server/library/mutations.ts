import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { isCheckViolation, isForeignKeyViolation, isUniqueViolation } from "@/db/errors";
import type { Tx } from "@/db/rls";
import { exerciseCategories, exerciseCategoryLinks, exerciseMedia, exercises } from "@/db/schema";

import type {
  CreateCategoryInput,
  ExerciseInput,
  RenameCategoryInput,
  ReorderCategoriesInput,
  Result,
} from "./schemas";

const ok = <T>(data: T) => ({ ok: true, data }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

const ownCategory = (physioId: string, id: string) =>
  and(eq(exerciseCategories.physioId, physioId), eq(exerciseCategories.id, id));
const siblingsOf = (physioId: string, parentId: string | null) =>
  and(
    eq(exerciseCategories.physioId, physioId),
    parentId === null
      ? isNull(exerciseCategories.parentId)
      : eq(exerciseCategories.parentId, parentId),
  );
const ownExercise = (physioId: string, id: string) =>
  and(eq(exercises.physioId, physioId), eq(exercises.id, id));

export async function createCategory(
  tx: Tx,
  physioId: string,
  input: CreateCategoryInput,
): Promise<Result<{ id: string }, "nameTaken" | "parentNotFound" | "tooDeep">> {
  if (input.parentId) {
    const [parent] = await tx
      .select({ parentId: exerciseCategories.parentId })
      .from(exerciseCategories)
      .where(ownCategory(physioId, input.parentId));
    if (!parent) return fail("parentNotFound");
    if (parent.parentId !== null) return fail("tooDeep");
  }
  const [{ next }] = await tx
    .select({ next: sql<number>`coalesce(max(${exerciseCategories.position}) + 1, 0)::int` })
    .from(exerciseCategories)
    .where(siblingsOf(physioId, input.parentId));
  try {
    // A savepoint, so a constraint violation does not abort the caller's transaction.
    const [row] = await tx.transaction((savepoint) =>
      savepoint
        .insert(exerciseCategories)
        .values({ physioId, parentId: input.parentId, name: input.name, position: next })
        .returning({ id: exerciseCategories.id }),
    );
    return ok(row);
  } catch (error) {
    if (isUniqueViolation(error, "exercise_categories_name_unique")) return fail("nameTaken");
    if (isForeignKeyViolation(error, "exercise_categories_parent_fk"))
      return fail("parentNotFound");
    if (isCheckViolation(error, "exercise_categories_max_depth")) return fail("tooDeep");
    throw error;
  }
}

export async function renameCategory(
  tx: Tx,
  physioId: string,
  input: RenameCategoryInput,
): Promise<Result<null, "nameTaken" | "notFound">> {
  try {
    const rows = await tx.transaction((savepoint) =>
      savepoint
        .update(exerciseCategories)
        .set({ name: input.name })
        .where(ownCategory(physioId, input.id))
        .returning({ id: exerciseCategories.id }),
    );
    return rows.length ? ok(null) : fail("notFound");
  } catch (error) {
    if (isUniqueViolation(error, "exercise_categories_name_unique")) return fail("nameTaken");
    throw error;
  }
}

export async function reorderCategories(
  tx: Tx,
  physioId: string,
  input: ReorderCategoriesInput,
): Promise<Result<null, "mismatch">> {
  const siblings = await tx
    .select({ id: exerciseCategories.id })
    .from(exerciseCategories)
    .where(siblingsOf(physioId, input.parentId));
  const current = new Set(siblings.map((row) => row.id));
  if (
    current.size !== input.orderedIds.length ||
    !input.orderedIds.every((id) => current.has(id))
  ) {
    return fail("mismatch");
  }
  for (const [position, id] of input.orderedIds.entries()) {
    await tx.update(exerciseCategories).set({ position }).where(ownCategory(physioId, id));
  }
  return ok(null);
}

export async function deleteCategory(
  tx: Tx,
  physioId: string,
  id: string,
): Promise<Result<null, "notFound">> {
  const rows = await tx
    .delete(exerciseCategories)
    .where(ownCategory(physioId, id))
    .returning({ id: exerciseCategories.id });
  return rows.length ? ok(null) : fail("notFound");
}

function exerciseValues(input: ExerciseInput) {
  const values: Omit<ExerciseInput, "media" | "categoryIds"> & {
    media?: unknown;
    categoryIds?: unknown;
  } = { ...input };
  delete values.media;
  delete values.categoryIds;
  return values;
}

async function insertCategoryLinks(
  tx: Tx,
  physioId: string,
  exerciseId: string,
  input: ExerciseInput,
) {
  if (input.categoryIds.length === 0) return;
  await tx
    .insert(exerciseCategoryLinks)
    .values(input.categoryIds.map((categoryId) => ({ physioId, exerciseId, categoryId })));
}

async function insertMedia(tx: Tx, physioId: string, exerciseId: string, input: ExerciseInput) {
  if (input.media.length === 0) return;
  await tx.insert(exerciseMedia).values(
    input.media.map((video, position) => ({
      physioId,
      exerciseId,
      kind: "youtube" as const,
      externalUrl: video.url,
      externalId: video.videoId,
      position,
    })),
  );
}

export async function createExercise(
  tx: Tx,
  physioId: string,
  input: ExerciseInput,
): Promise<Result<{ id: string }, "categoryNotFound">> {
  try {
    const row = await tx.transaction(async (savepoint) => {
      const [created] = await savepoint
        .insert(exercises)
        .values({ physioId, ...exerciseValues(input) })
        .returning({ id: exercises.id });
      await insertMedia(savepoint, physioId, created.id, input);
      await insertCategoryLinks(savepoint, physioId, created.id, input);
      return created;
    });
    return ok(row);
  } catch (error) {
    if (isForeignKeyViolation(error, "exercise_category_links_category_fk"))
      return fail("categoryNotFound");
    throw error;
  }
}

export async function updateExercise(
  tx: Tx,
  physioId: string,
  id: string,
  input: ExerciseInput,
): Promise<Result<{ id: string }, "categoryNotFound" | "notFound">> {
  try {
    const found = await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .update(exercises)
        .set(exerciseValues(input))
        .where(ownExercise(physioId, id))
        .returning({ id: exercises.id });
      if (rows.length === 0) return false;
      await savepoint
        .delete(exerciseMedia)
        .where(and(eq(exerciseMedia.physioId, physioId), eq(exerciseMedia.exerciseId, id)));
      await insertMedia(savepoint, physioId, id, input);
      await savepoint
        .delete(exerciseCategoryLinks)
        .where(
          and(
            eq(exerciseCategoryLinks.physioId, physioId),
            eq(exerciseCategoryLinks.exerciseId, id),
          ),
        );
      await insertCategoryLinks(savepoint, physioId, id, input);
      return true;
    });
    return found ? ok({ id }) : fail("notFound");
  } catch (error) {
    if (isForeignKeyViolation(error, "exercise_category_links_category_fk"))
      return fail("categoryNotFound");
    throw error;
  }
}

export async function setExerciseArchived(
  tx: Tx,
  physioId: string,
  id: string,
  archived: boolean,
): Promise<Result<null, "notFound">> {
  const rows = await tx
    .update(exercises)
    .set({ archivedAt: archived ? sql`coalesce(${exercises.archivedAt}, now())` : null })
    .where(ownExercise(physioId, id))
    .returning({ id: exercises.id });
  return rows.length ? ok(null) : fail("notFound");
}

/** An exercise a routine uses cannot be deleted ("inUse"): the UI offers archive instead. */
export async function deleteExercise(
  tx: Tx,
  physioId: string,
  id: string,
): Promise<Result<null, "notFound" | "inUse">> {
  try {
    // A savepoint, so the foreign key violation does not abort the caller's transaction.
    const rows = await tx.transaction((savepoint) =>
      savepoint.delete(exercises).where(ownExercise(physioId, id)).returning({ id: exercises.id }),
    );
    return rows.length ? ok(null) : fail("notFound");
  } catch (error) {
    if (isForeignKeyViolation(error, "routine_items_exercise_fk")) return fail("inUse");
    throw error;
  }
}
