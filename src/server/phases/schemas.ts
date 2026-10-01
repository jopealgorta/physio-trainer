import { z } from "zod";

import { isCalendarDate } from "@/lib/calendar-date";
import { PHASE_LABEL_MAX, validateWindow, type WindowError } from "@/lib/phases";
import { idSchema, isUuid, type Result } from "@/server/routines/schemas";

export { idSchema, isUuid, type Result };

const blankToNull = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : value;
  return text === "" || text == null ? null : text;
};

/** What a phase belongs to: a routine or a weekly plan. */
export const PHASE_KINDS = ["routine", "plan"] as const;
export type PhaseKind = (typeof PHASE_KINDS)[number];

const label = z.preprocess(
  blankToNull,
  z.union([z.null(), z.string().trim().max(PHASE_LABEL_MAX, "labelTooLong")], {
    error: "invalid",
  }),
);

const date = (error: WindowError) =>
  z.preprocess(
    blankToNull,
    z.union([z.null(), z.string().refine(isCalendarDate, error)], { error }),
  );

/** Adds `endBeforeStart` when both bounds are valid and reversed (bad dates report themselves). */
const checkWindow = (
  value: { startsOn: string | null; endsOn: string | null },
  ctx: z.RefinementCtx,
) => {
  if (validateWindow(value) === "endBeforeStart") {
    ctx.addIssue({ code: "custom", path: ["endsOn"], message: "endBeforeStart" });
  }
};

export const setPhaseSchema = z
  .object({
    kind: z.enum(PHASE_KINDS),
    id: z.uuid(),
    phaseLabel: label,
    startsOn: date("startsInvalid"),
    endsOn: date("endsInvalid"),
  })
  .superRefine(checkWindow);
export type SetPhaseInput = {
  kind: PhaseKind;
  id: string;
  phaseLabel: string | null;
  startsOn: string | null;
  endsOn: string | null;
};

/** "Copy into next phase": the new item's label and window, and whether to end the current one. */
export const copyPhaseSchema = z
  .object({
    kind: z.enum(PHASE_KINDS),
    id: z.uuid(),
    phaseLabel: label,
    startsOn: z.preprocess(
      blankToNull,
      z.string("startsInvalid").refine(isCalendarDate, "startsInvalid"),
    ),
    endsOn: date("endsInvalid"),
    endCurrent: z.boolean(),
  })
  .superRefine(checkWindow);
export type CopyPhaseInput = {
  kind: PhaseKind;
  id: string;
  phaseLabel: string | null;
  startsOn: string;
  endsOn: string | null;
  endCurrent: boolean;
};

export type PhaseError =
  "notFound" | "notStandalone" | "needsCustomer" | "startBeforePredecessor" | WindowError;
export type PhaseActionError = PhaseError | "labelTooLong" | "invalid";

const WINDOW_ERRORS: readonly string[] = ["startsInvalid", "endsInvalid", "endBeforeStart"];

/** The window error code a failed parse carries, so forms can point at the right field. */
export function windowIssue(error: z.ZodError): WindowError | null {
  const issue = error.issues.find((i) => WINDOW_ERRORS.includes(i.message));
  return (issue?.message as WindowError | undefined) ?? null;
}

// Compile-time guard: parsed output must match the published input types.
type Assert<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export type _SetMatches = Assert<Same<z.output<typeof setPhaseSchema>, SetPhaseInput>>;
export type _CopyMatches = Assert<Same<z.output<typeof copyPhaseSchema>, CopyPhaseInput>>;
