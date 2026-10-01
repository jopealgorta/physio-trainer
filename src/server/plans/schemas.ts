import { z } from "zod";

import {
  ENTRY_LABEL_MAX,
  MAX_ENTRIES_PER_DAY,
  PLAN_NAME_MAX,
  PLAN_NOTES_MAX,
  WEEKDAYS,
} from "@/lib/plans";
import { ROUTINE_STATUSES, type RoutineStatus } from "@/lib/routines";
import { idSchema, isUuid, type Result } from "@/server/routines/schemas";

export { idSchema, isUuid, type Result };

const blankToNull = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : value;
  return text === "" || text == null ? null : text;
};

const requiredName = z.preprocess(
  (value) => value ?? "",
  z.string().trim().min(1, "nameRequired").max(PLAN_NAME_MAX, "nameTooLong"),
);

const notes = z
  .preprocess((value) => value ?? "", z.string())
  .transform((value) => value.trim())
  .pipe(z.string().max(PLAN_NOTES_MAX, "notesTooLong"))
  .transform((value) => value || null);

const caseId = z.preprocess(blankToNull, z.union([z.null(), z.uuid()], { error: "invalid" }));

const label = z.preprocess(
  blankToNull,
  z.union([z.null(), z.string().trim().max(ENTRY_LABEL_MAX, "labelTooLong")], {
    error: "invalid",
  }),
);

const weekday = z.number().int().min(WEEKDAYS[0]).max(WEEKDAYS[6]);

export const createPlanSchema = z.object({ customerId: z.uuid(), name: requiredName, caseId });
export type CreatePlanInput = { customerId: string; name: string; caseId: string | null };

export const updatePlanSchema = z.object({
  id: z.uuid(),
  name: requiredName,
  notes,
  caseId,
  status: z.enum(ROUTINE_STATUSES),
});
export type UpdatePlanInput = {
  id: string;
  name: string;
  notes: string | null;
  caseId: string | null;
  status: RoutineStatus;
};

/** Attach an existing routine of the plan's customer to a day. */
export const addEntrySchema = z.object({
  planId: z.uuid(),
  weekday,
  routineId: z.uuid(),
  label,
  /** Rule 1: false = "Also show on its own" unticked. Omitted leaves the routine as it is. */
  standalone: z.boolean().optional(),
});
export type AddEntryInput = z.output<typeof addEntrySchema>;

/** Create a draft routine for the plan's customer and attach it to a day (non-standalone). */
export const addNewRoutineEntrySchema = z.object({
  planId: z.uuid(),
  weekday,
  name: requiredName,
});
export type AddNewRoutineEntryInput = z.output<typeof addNewRoutineEntrySchema>;

export const moveEntrySchema = z.object({
  planId: z.uuid(),
  entryId: z.uuid(),
  weekday,
  index: z.number().int().min(0).max(MAX_ENTRIES_PER_DAY),
});
export type MoveEntryInput = z.output<typeof moveEntrySchema>;

export const copyEntrySchema = z.object({
  planId: z.uuid(),
  entryId: z.uuid(),
  weekday,
});
export type CopyEntryInput = z.output<typeof copyEntrySchema>;

export const setLabelSchema = z.object({ planId: z.uuid(), entryId: z.uuid(), label });
export type SetLabelInput = z.output<typeof setLabelSchema>;

export const removeEntrySchema = z.object({
  planId: z.uuid(),
  entryId: z.uuid(),
  /** Delete the routine too when this was its last reference and it is not standalone. */
  deleteRoutine: z.boolean().optional(),
});
export type RemoveEntryInput = z.output<typeof removeEntrySchema>;

export const separateCopySchema = z.object({ planId: z.uuid(), entryId: z.uuid() });
export type SeparateCopyInput = z.output<typeof separateCopySchema>;

export type PlanError =
  | "notFound"
  | "customerNotFound"
  | "caseNotFound"
  | "routineNotFound"
  | "routineArchived"
  | "entryNotFound"
  | "dayFull"
  | "needsEntries"
  | "needsCustomer";
export type PlanActionError = PlanError | "invalid";

// Compile-time guard: parsed output must match the published input types.
type Assert<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export type _CreateMatches = Assert<Same<z.output<typeof createPlanSchema>, CreatePlanInput>>;
export type _UpdateMatches = Assert<Same<z.output<typeof updatePlanSchema>, UpdatePlanInput>>;
