"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  type Result,
} from "./schemas";

const revalidateLibrary = () => revalidatePath("/library", "layout");

export async function saveExerciseAction(
  _state: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  const rawId = formData.get("id");
  const id = rawId === null || rawId === "" ? null : idSchema.safeParse(rawId);
  if (id && !id.success) return { status: "error", fieldErrors: {}, formError: "notFound" };

  formData.delete("id");
  const parsed = exerciseSchema.safeParse(exerciseFormValues(formData));
  if (!parsed.success) return { status: "error", fieldErrors: exerciseFieldErrors(parsed.error) };

  const result = await withPhysio((tx, physioId) =>
    id
      ? updateExercise(tx, physioId, id.data, parsed.data)
      : createExercise(tx, physioId, parsed.data),
  );
  if (!result.ok) {
    return result.error === "categoryNotFound"
      ? { status: "error", fieldErrors: { categoryIds: "categoryInvalid" } }
      : { status: "error", fieldErrors: {}, formError: "notFound" };
  }
  revalidateLibrary();
  if (!id) redirect(`/library/${result.data.id}` as Route);
  return { status: "saved" };
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
