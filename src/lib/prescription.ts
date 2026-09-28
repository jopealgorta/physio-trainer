import { z } from "zod";

/**
 * Prescription fields shared by exercise defaults (spec 03) and routine items (spec 05).
 * All optional; the UI shows only what is set. Error messages are i18n keys (Prescription.errors.*).
 */
export const PRESCRIPTION_SIDES = ["left", "right", "both", "alternating"] as const;
export type PrescriptionSide = (typeof PRESCRIPTION_SIDES)[number];

export const PRESCRIPTION_LIMITS = {
  sets: { min: 1, max: 99 },
  reps: { min: 1, max: 999 },
  repsMax: { min: 1, max: 999 },
  durationSeconds: { min: 1, max: 7200 },
  holdSeconds: { min: 1, max: 3600 },
  restSeconds: { min: 1, max: 3600 },
} as const;
export const LOAD_MAX_LENGTH = 40;
export const PRESCRIPTION_NOTES_MAX_LENGTH = 500;

export type PrescriptionErrorCode =
  | "notAWholeNumber"
  | "outOfRange"
  | "tooLong"
  | "invalidSide"
  | "repsMaxWithoutReps"
  | "repsMaxNotAboveReps";

const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;

function optionalInt({ min, max }: { min: number; max: number }) {
  return z
    .preprocess(
      blankToUndefined,
      z.coerce
        .number({ error: "notAWholeNumber" })
        .int("notAWholeNumber")
        .min(min, "outOfRange")
        .max(max, "outOfRange")
        .optional(),
    )
    .transform((value) => value ?? null);
}

function optionalText(max: number) {
  return z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.string().max(max, "tooLong").optional().nullable(),
    )
    .transform((value) => value || null);
}

export const prescriptionShape = {
  sets: optionalInt(PRESCRIPTION_LIMITS.sets),
  reps: optionalInt(PRESCRIPTION_LIMITS.reps),
  repsMax: optionalInt(PRESCRIPTION_LIMITS.repsMax),
  durationSeconds: optionalInt(PRESCRIPTION_LIMITS.durationSeconds),
  holdSeconds: optionalInt(PRESCRIPTION_LIMITS.holdSeconds),
  restSeconds: optionalInt(PRESCRIPTION_LIMITS.restSeconds),
  load: optionalText(LOAD_MAX_LENGTH),
  side: z
    .preprocess(blankToUndefined, z.enum(PRESCRIPTION_SIDES, { error: "invalidSide" }).optional())
    .transform((value) => value ?? null),
  notes: optionalText(PRESCRIPTION_NOTES_MAX_LENGTH),
};

/** A rep range needs a lower bound below its upper bound ("8–12"). */
export function refinePrescription(
  value: { reps: number | null; repsMax: number | null },
  ctx: z.RefinementCtx,
) {
  if (value.repsMax === null) return;
  if (value.reps === null) {
    ctx.addIssue({ code: "custom", path: ["repsMax"], message: "repsMaxWithoutReps" });
  } else if (value.repsMax <= value.reps) {
    ctx.addIssue({ code: "custom", path: ["repsMax"], message: "repsMaxNotAboveReps" });
  }
}

export const prescriptionSchema = z.object(prescriptionShape).superRefine(refinePrescription);
export type Prescription = z.output<typeof prescriptionSchema>;

export const PRESCRIPTION_FIELDS = Object.keys(prescriptionShape) as (keyof Prescription)[];

export const EMPTY_PRESCRIPTION: Prescription = {
  sets: null,
  reps: null,
  repsMax: null,
  durationSeconds: null,
  holdSeconds: null,
  restSeconds: null,
  load: null,
  side: null,
  notes: null,
};
