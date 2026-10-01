"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { z } from "zod";

import { ROUTINE_NAME_MAX } from "@/lib/routines";
import { withPhysio } from "@/server/auth/session";
import type { Tx } from "@/db/rls";

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
} from "./mutations";
import {
  addEntrySchema,
  addNewRoutineEntrySchema,
  copyEntrySchema,
  createPlanSchema,
  idSchema,
  moveEntrySchema,
  removeEntrySchema,
  separateCopySchema,
  setLabelSchema,
  updatePlanSchema,
  type PlanActionError,
  type PlanError,
  type Result,
} from "./schemas";

export type CreatePlanFormState =
  | { status: "idle" }
  | {
      status: "error";
      fieldErrors: { name?: string };
      formError?: "customerNotFound" | "caseNotFound" | "invalid";
    };

export async function createPlanAction(
  _state: CreatePlanFormState,
  formData: FormData,
): Promise<CreatePlanFormState> {
  if (!idSchema.safeParse(formData.get("customerId")).success) {
    return { status: "error", fieldErrors: {}, formError: "customerNotFound" };
  }
  const parsed = createPlanSchema.safeParse({
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

  const result = await withPhysio((tx, physioId) => createPlan(tx, physioId, parsed.data));
  if (!result.ok) return { status: "error", fieldErrors: {}, formError: result.error };
  revalidatePath("/plans", "layout");
  revalidatePath("/customers", "layout");
  redirect(`/plans/${result.data.id}`);
}

export type AddNewRoutineFormState =
  | { status: "idle" }
  | { status: "error"; fieldErrors: { name?: string }; formError?: PlanActionError };

/** "New routine" on a day: creates the draft, attaches it and opens the routine editor. */
export async function addNewRoutineEntryAction(
  _state: AddNewRoutineFormState,
  formData: FormData,
): Promise<AddNewRoutineFormState> {
  const parsed = addNewRoutineEntrySchema.safeParse({
    planId: formData.get("planId"),
    weekday: Number(formData.get("weekday")),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    const name = parsed.error.issues.find((issue) => issue.path[0] === "name");
    return name
      ? { status: "error", fieldErrors: { name: name.message } }
      : { status: "error", fieldErrors: {}, formError: "invalid" };
  }

  const result = await withPhysio((tx, physioId) => addNewRoutineEntry(tx, physioId, parsed.data));
  if (!result.ok) return { status: "error", fieldErrors: {}, formError: result.error };
  revalidatePlan(parsed.data.planId);
  revalidatePath("/routines", "layout");
  redirect(`/routines/${result.data.routineId}?plan=${parsed.data.planId}`);
}

function revalidatePlan(planId: string) {
  revalidatePath(`/plans/${planId}`);
  revalidatePath("/plans", "layout");
  revalidatePath("/customers", "layout");
}

/** Parses a JSON payload, runs the mutation and revalidates the plan after a success. */
async function board<S extends z.ZodType<{ planId: string }>, T, E extends PlanError>(
  schema: S,
  input: unknown,
  run: (tx: Tx, physioId: string, data: z.output<S>) => Promise<Result<T, E>>,
  { routines = false }: { routines?: boolean } = {},
): Promise<Result<T, E | "invalid">> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await withPhysio((tx, physioId) => run(tx, physioId, parsed.data));
  if (result.ok) {
    revalidatePlan(parsed.data.planId);
    if (routines) revalidatePath("/routines", "layout");
  }
  return result;
}

export async function updatePlanAction(
  input: unknown,
): Promise<Result<{ version: number }, "notFound" | "caseNotFound" | "needsEntries" | "invalid">> {
  const parsed = updatePlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await withPhysio((tx, physioId) => updatePlan(tx, physioId, parsed.data));
  if (result.ok) revalidatePlan(parsed.data.id);
  return result;
}

export const addEntryAction = (input: unknown) =>
  board(addEntrySchema, input, addEntry, { routines: true });

export const moveEntryAction = (input: unknown) => board(moveEntrySchema, input, moveEntry);

export const copyEntryAction = (input: unknown) => board(copyEntrySchema, input, copyEntry);

export const setEntryLabelAction = (input: unknown) => board(setLabelSchema, input, setEntryLabel);

export const removeEntryAction = (input: unknown) =>
  board(removeEntrySchema, input, removeEntry, { routines: true });

export async function makeSeparateCopyAction(input: unknown) {
  const t = await getTranslations("Plans.board.entry");
  const copyName = (name: string) =>
    [...t("copyName", { name })].slice(0, ROUTINE_NAME_MAX).join("");
  return board(
    separateCopySchema,
    input,
    (tx, physioId, data) => makeSeparateCopy(tx, physioId, data, copyName),
    { routines: true },
  );
}
