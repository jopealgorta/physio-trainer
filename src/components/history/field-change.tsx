"use client";

import { useFormatter, useTranslations } from "next-intl";

import type { FieldChange } from "@/lib/history/diff";
import { PRESCRIPTION_SIDES } from "@/lib/prescription";
import { ROUTINE_STATUSES } from "@/lib/routines";

import { useFieldLabel } from "./summary-text";

const SECONDS = new Set(["holdSeconds", "restSeconds", "durationSeconds"]);
const DATES = new Set(["startsOn", "endsOn"]);
/** Values that mean nothing to read (a case id, superset membership): only "changed" shows. */
const OPAQUE = new Set(["caseId", "group"]);

const includes = <T extends string>(list: readonly T[], value: unknown): value is T =>
  (list as readonly unknown[]).includes(value);

/** Formats one field change as "Reps 10 → 12" (or "Superset changed"), in the active locale. */
export function useChangeText(): (change: FieldChange<string>) => string {
  const t = useTranslations("History");
  const tPrescription = useTranslations("Prescription");
  const tStatus = useTranslations("Routines.status");
  const format = useFormatter();
  const fieldLabel = useFieldLabel();

  const value = (field: string, raw: unknown): string => {
    if (raw === null || raw === undefined || raw === "") return tPrescription("summary.blank");
    if (field === "side" && includes(PRESCRIPTION_SIDES, raw)) return tPrescription(`sides.${raw}`);
    if (field === "status" && includes(ROUTINE_STATUSES, raw)) return tStatus(raw);
    if (typeof raw === "number") {
      return SECONDS.has(field)
        ? tPrescription("summary.seconds", { value: raw })
        : format.number(raw);
    }
    if (DATES.has(field) && typeof raw === "string") {
      // Calendar dates: read and shown in UTC so the day never shifts.
      return format.dateTime(new Date(`${raw}T00:00:00Z`), {
        dateStyle: "medium",
        timeZone: "UTC",
      });
    }
    return String(raw);
  };

  return (change) => {
    const field = fieldLabel(change.field);
    if (OPAQUE.has(change.field)) return t("changed", { field });
    return t("change", {
      field,
      from: value(change.field, change.from),
      to: value(change.field, change.to),
    });
  };
}

/** The header (name, notes, status...) changes of a diff, listed before its items. */
export function HeaderChanges({ changes }: { changes: FieldChange<string>[] }) {
  const changeText = useChangeText();
  if (changes.length === 0) return null;
  return (
    <ul className="grid gap-1 text-sm">
      {changes.map((change) => (
        <li key={change.field} className="break-words">
          {changeText(change)}
        </li>
      ))}
    </ul>
  );
}
