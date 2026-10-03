import { z } from "zod";

import { distanceDisplay } from "./distance";

/**
 * Prescription fields of routine items (spec 05): per-set and per-item shapes.
 * All optional; the UI shows only what is set. Error messages are i18n keys (Prescription.errors.*).
 */
export const PRESCRIPTION_SIDES = ["left", "right", "both", "alternating"] as const;
export type PrescriptionSide = (typeof PRESCRIPTION_SIDES)[number];

export const PRESCRIPTION_LIMITS = {
  reps: { min: 1, max: 999 },
  repsMax: { min: 1, max: 999 },
  durationSeconds: { min: 1, max: 14_400 },
  distanceMeters: { min: 1, max: 200_000 },
  holdSeconds: { min: 1, max: 3600 },
  restSeconds: { min: 1, max: 3600 },
} as const;
export const LOAD_MAX_LENGTH = 40;
export const INTENSITY_MAX_LENGTH = 40;
export const PRESCRIPTION_NOTES_MAX_LENGTH = 500;

/** The codes a set field can show (Prescription.errors.*); text and side limits never surface. */
export type PrescriptionErrorCode =
  "notAWholeNumber" | "outOfRange" | "repsMaxWithoutReps" | "repsMaxNotAboveReps";

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

const prescriptionShape = {
  reps: optionalInt(PRESCRIPTION_LIMITS.reps),
  repsMax: optionalInt(PRESCRIPTION_LIMITS.repsMax),
  durationSeconds: optionalInt(PRESCRIPTION_LIMITS.durationSeconds),
  holdSeconds: optionalInt(PRESCRIPTION_LIMITS.holdSeconds),
  restSeconds: optionalInt(PRESCRIPTION_LIMITS.restSeconds),
  load: optionalText(LOAD_MAX_LENGTH),
  distanceMeters: optionalInt(PRESCRIPTION_LIMITS.distanceMeters),
  intensity: optionalText(INTENSITY_MAX_LENGTH),
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

/** Per-set fields (spec 05): one row per set. */
export const setShape = {
  reps: prescriptionShape.reps,
  repsMax: prescriptionShape.repsMax,
  durationSeconds: prescriptionShape.durationSeconds,
  load: prescriptionShape.load,
  distanceMeters: prescriptionShape.distanceMeters,
  intensity: prescriptionShape.intensity,
};
export const setSchema = z.object(setShape).superRefine(refinePrescription);
export type SetPrescription = z.output<typeof setSchema>;
export const EMPTY_SET: SetPrescription = {
  reps: null,
  repsMax: null,
  durationSeconds: null,
  load: null,
  distanceMeters: null,
  intensity: null,
};

/** Per-exercise fields of a routine item. */
export const itemShape = {
  holdSeconds: prescriptionShape.holdSeconds,
  restSeconds: prescriptionShape.restSeconds,
  side: prescriptionShape.side,
  notes: prescriptionShape.notes,
};
export const itemPrescriptionSchema = z.object(itemShape);
export type ItemPrescription = z.output<typeof itemPrescriptionSchema>;
export const EMPTY_ITEM_PRESCRIPTION: ItemPrescription = {
  holdSeconds: null,
  restSeconds: null,
  side: null,
  notes: null,
};

export type PrescriptionSummaryKey =
  | "summary.count"
  | "summary.range"
  | "summary.seconds"
  | "summary.minutes"
  | "summary.distanceKm"
  | "summary.distanceM"
  | "summary.sets"
  | "summary.blank"
  | "summary.hold"
  | "summary.rest"
  | `sides.${PrescriptionSide}`;
export type PrescriptionTranslate = (
  key: PrescriptionSummaryKey,
  values?: Record<string, string | number>,
) => string;

const SUMMARY_SEPARATOR = " · ";

function setBase(set: SetPrescription, t: PrescriptionTranslate): string | null {
  const parts: string[] = [];
  if (set.reps !== null) {
    parts.push(
      set.repsMax !== null
        ? t("summary.range", { min: set.reps, max: set.repsMax })
        : t("summary.count", { value: set.reps }),
    );
  }
  if (set.durationSeconds !== null) {
    const seconds = set.durationSeconds;
    parts.push(
      seconds >= 60 && seconds % 60 === 0
        ? t("summary.minutes", { value: seconds / 60 })
        : t("summary.seconds", { value: seconds }),
    );
  }
  if (set.distanceMeters !== null) {
    const { unit, value } = distanceDisplay(set.distanceMeters);
    parts.push(t(unit === "km" ? "summary.distanceKm" : "summary.distanceM", { value }));
  }
  return parts.length ? parts.join(" / ") : null;
}

/**
 * Compact one-line summary of an item's prescription, e.g. "3 × 12 · 5 kg · hold 5 s · left".
 * Pure: the caller supplies the localised strings. Shared by the editor, patient page and exports.
 */
export function formatPrescription(
  item: { sets: SetPrescription[] } & Pick<
    ItemPrescription,
    "holdSeconds" | "restSeconds" | "side"
  >,
  t: PrescriptionTranslate,
): string {
  const { sets } = item;
  const parts: string[] = [];
  // A text field (load, intensity) is shown once when shared, or per set when sets differ.
  const sharedText = (pick: (set: SetPrescription) => string | null) => {
    const values = new Set(sets.map(pick));
    return { shared: values.size <= 1 ? ([...values][0] ?? null) : null, perSet: values.size > 1 };
  };
  const load = sharedText((set) => set.load);
  const intensity = sharedText((set) => set.intensity);
  const labels = sets.map((set) => {
    let label = setBase(set, t);
    for (const [perSet, value] of [
      [load.perSet, set.load],
      [intensity.perSet, set.intensity],
    ] as const) {
      if (!perSet || value === null) continue;
      label = label === null ? value : `${label} × ${value}`;
    }
    return label;
  });

  if (labels.length > 0) {
    const first = labels[0];
    const allEqual = labels.every((label) => label === first);
    if (allEqual && labels.length > 1) {
      parts.push(
        first === null
          ? t("summary.sets", { count: labels.length })
          : `${labels.length} × ${first}`,
      );
    } else if (allEqual) {
      if (first !== null) parts.push(first);
    } else {
      parts.push(labels.map((label) => label ?? t("summary.blank")).join(SUMMARY_SEPARATOR));
    }
  }
  if (load.shared !== null) parts.push(load.shared);
  if (intensity.shared !== null) parts.push(intensity.shared);
  if (item.holdSeconds !== null) parts.push(t("summary.hold", { value: item.holdSeconds }));
  if (item.restSeconds !== null) parts.push(t("summary.rest", { value: item.restSeconds }));
  if (item.side !== null) parts.push(t(`sides.${item.side}`));
  return parts.join(SUMMARY_SEPARATOR);
}
