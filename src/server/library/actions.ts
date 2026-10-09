"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { exerciseReturnPath } from "@/lib/exercise-return";
import { withPhysio } from "@/server/auth/session";

import {
  createCategory,
  createExercise,
  deleteCategory,
  deleteExercise,
  renameCategory,
  reorderCategories,
  setExerciseArchived,
  updateExercise,
} from "./mutations";
import {
  categoryInputError,
  createCategorySchema,
  exerciseFieldErrors,
  exerciseFormValues,
  exerciseSchema,
  idSchema,
  renameCategorySchema,
  reorderCategoriesSchema,
  type CategoryError,
  type ExerciseFormState,
  type ExerciseInput,
  type Result,
} from "./schemas";

const revalidateLibrary = () => revalidatePath("/library", "layout");

type ExerciseFieldsResult =
  { ok: true; input: ExerciseInput } | { ok: false; state: ExerciseFormState };

function parseExerciseFields(formData: FormData): ExerciseFieldsResult {
  const parsed = exerciseSchema.safeParse(exerciseFormValues(formData));
  return parsed.success
    ? { ok: true, input: parsed.data }
    : { ok: false, state: { status: "error", fieldErrors: exerciseFieldErrors(parsed.error) } };
}

function mutationErrorState(error: "categoryNotFound" | "notFound"): ExerciseFormState {
  return error === "categoryNotFound"
    ? { status: "error", fieldErrors: { categoryIds: "categoryInvalid" } }
    : { status: "error", fieldErrors: {}, formError: "notFound" };
}

export async function saveExerciseAction(
  _state: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  const rawId = formData.get("id");
  const id = rawId === null || rawId === "" ? null : idSchema.safeParse(rawId);
  if (id && !id.success) return { status: "error", fieldErrors: {}, formError: "notFound" };

  const returnTo = exerciseReturnPath(formData.get("returnTo")?.toString());
  formData.delete("id");
  formData.delete("returnTo");
  const fields = parseExerciseFields(formData);
  if (!fields.ok) return fields.state;

  const result = await withPhysio((tx, physioId) =>
    id
      ? updateExercise(tx, physioId, id.data, fields.input)
      : createExercise(tx, physioId, fields.input),
  );
  if (!result.ok) return mutationErrorState(result.error);
  revalidateLibrary();
  redirect(returnTo as Route);
}

/**
 * Creates an exercise from the routine editor's picker. It is saved to the library like any
 * other; instead of redirecting, the action returns it so the editor can add it to the routine.
 */
export async function createExerciseForRoutineAction(
  _state: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  formData.delete("id");
  const fields = parseExerciseFields(formData);
  if (!fields.ok) return fields.state;

  const { input } = fields;
  const result = await withPhysio((tx, physioId) => createExercise(tx, physioId, input));
  if (!result.ok) return mutationErrorState(result.error);
  revalidateLibrary();
  const [first] = input.media;
  return {
    status: "created",
    exercise: {
      id: result.data.id,
      name: input.name,
      kind: input.kind,
      archived: false,
      cover: first ? { videoId: first.videoId, isShort: first.isShort } : null,
    },
  };
}

export async function setExerciseArchivedAction(
  id: string,
  archived: boolean,
): Promise<Result<null, "notFound">> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const result = await withPhysio((tx, physioId) =>
    setExerciseArchived(tx, physioId, parsed.data, archived === true),
  );
  if (result.ok) revalidateLibrary();
  return result;
}

export async function deleteExerciseAction(
  id: string,
): Promise<Result<null, "notFound" | "inUse">> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const result = await withPhysio((tx, physioId) => deleteExercise(tx, physioId, parsed.data));
  if (!result.ok) return result;
  revalidateLibrary();
  redirect("/library");
}

export async function createCategoryAction(input: {
  name: string;
  parentId: string | null;
}): Promise<Result<{ id: string }, CategoryError>> {
  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: categoryInputError(parsed.error) };
  return revalidated(await withPhysio((tx, physioId) => createCategory(tx, physioId, parsed.data)));
}

export async function renameCategoryAction(input: {
  id: string;
  name: string;
}): Promise<Result<null, CategoryError>> {
  const parsed = renameCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: categoryInputError(parsed.error) };
  return revalidated(await withPhysio((tx, physioId) => renameCategory(tx, physioId, parsed.data)));
}

export async function reorderCategoriesAction(input: {
  parentId: string | null;
  orderedIds: string[];
}): Promise<Result<null, CategoryError>> {
  const parsed = reorderCategoriesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return revalidated(
    await withPhysio((tx, physioId) => reorderCategories(tx, physioId, parsed.data)),
  );
}

export async function deleteCategoryAction(id: string): Promise<Result<null, CategoryError>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return revalidated(await withPhysio((tx, physioId) => deleteCategory(tx, physioId, parsed.data)));
}

function revalidated<R extends { ok: boolean }>(result: R): R {
  if (result.ok) revalidateLibrary();
  return result;
}
