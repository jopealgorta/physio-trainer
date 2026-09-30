"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseLibraryParams } from "@/lib/library-params";
import { withPhysio } from "@/server/auth/session";
import { listExercises, type ExerciseSummary } from "@/server/library/queries";

import { createRoutine, saveRoutine } from "./mutations";
import {
  createRoutineSchema,
  idSchema,
  saveRoutineSchema,
  type CreateRoutineError,
  type Result,
  type SaveRoutineError,
} from "./schemas";

/** Exercises returned per picker search. */
const PICKER_LIMIT = 60;

export type CreateRoutineFormState =
  | { status: "idle" }
  | { status: "error"; fieldErrors: { name?: string }; formError?: CreateRoutineError | "invalid" };

export async function createRoutineAction(
  _state: CreateRoutineFormState,
  formData: FormData,
): Promise<CreateRoutineFormState> {
  if (!idSchema.safeParse(formData.get("customerId")).success) {
    return { status: "error", fieldErrors: {}, formError: "customerNotFound" };
  }
  const parsed = createRoutineSchema.safeParse({
    customerId: formData.get("customerId"),
    name: formData.get("name"),
    caseId: formData.get("caseId"),
  });
  if (!parsed.success) {
    const name = parsed.error.issues.find((issue) => issue.path[0] === "name");
    return name
      ? { status: "error", fieldErrors: { name: name.message } }
      : { status: "error", fieldErrors: {}, formError: "invalid" };
  }

  const result = await withPhysio((tx, physioId) => createRoutine(tx, physioId, parsed.data));
  if (!result.ok) return { status: "error", fieldErrors: {}, formError: result.error };
  revalidatePath("/routines", "layout");
  revalidatePath("/customers", "layout");
  redirect(`/routines/${result.data.id}`);
}

export type SaveRoutineActionError = SaveRoutineError | "invalid";

export async function saveRoutineAction(
  input: unknown,
): Promise<Result<{ version: number }, SaveRoutineActionError>> {
  const parsed = saveRoutineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const result = await withPhysio((tx, physioId) => saveRoutine(tx, physioId, parsed.data));
  if (result.ok) {
    revalidatePath(`/routines/${parsed.data.id}`);
    revalidatePath("/routines", "layout");
    revalidatePath("/customers", "layout");
  }
  return result;
}

export async function searchExercisesAction(params: {
  q?: string;
  category?: string;
  area?: string;
}): Promise<ExerciseSummary[]> {
  const filters = parseLibraryParams({
    q: params?.q,
    category: params?.category,
    area: params?.area,
  });
  // The picker never offers archived exercises, whatever the caller asks for.
  if (filters.category.kind === "archived") filters.category = { kind: "all" };
  const { exercises } = await withPhysio((tx, physioId) =>
    listExercises(tx, physioId, filters, PICKER_LIMIT),
  );
  return exercises;
}
