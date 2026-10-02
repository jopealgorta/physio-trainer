"use client";

import { useFormatter, useTranslations } from "next-intl";

import type { VersionKind } from "@/lib/history/snapshot";
import { isEmptySummary, type ChangeSummary } from "@/lib/history/summary";

/** Every field a version can report, as named in `History.fields`. */
export const HISTORY_FIELDS = [
  "reps",
  "repsMax",
  "durationSeconds",
  "load",
  "sets",
  "holdSeconds",
  "restSeconds",
  "side",
  "notes",
  "group",
  "label",
  "routine",
  "name",
  "status",
  "caseId",
  "sessionsPerWeek",
  "sessionsPerDay",
  "phaseLabel",
  "startsOn",
  "endsOn",
] as const;
export type HistoryField = (typeof HISTORY_FIELDS)[number];

const isHistoryField = (field: string): field is HistoryField =>
  (HISTORY_FIELDS as readonly string[]).includes(field);

/** The localized name of a changed field (unknown fields, from a newer shape, show as stored). */
export function useFieldLabel(): (field: string) => string {
  const t = useTranslations("History.fields");
  return (field) => (isHistoryField(field) ? t(field) : field);
}

/**
 * One line about a version: "+2 exercises · Reps changed on 1", or what it is when there is
 * nothing to count ("Created"; "First recorded version" for edits saved before history existed).
 */
export function SummaryText({
  target,
  kind,
  summary,
}: {
  target: "routine" | "plan";
  kind: VersionKind;
  summary: ChangeSummary | null;
}) {
  const t = useTranslations("History");
  const format = useFormatter();
  const fieldLabel = useFieldLabel();

  if (kind === "created") return <>{t("created")}</>;
  if (summary === null) return <>{t("firstRecorded")}</>;
  if (isEmptySummary(summary)) return <>{t("noChanges")}</>;

  const routine = target === "routine";
  const parts: string[] = [];
  if (summary.header.length > 0) {
    parts.push(t("summary.header", { fields: format.list(summary.header.map(fieldLabel)) }));
  }
  if (summary.added > 0) {
    const key = routine ? "summary.addedExercises" : "summary.addedRoutines";
    parts.push(t(key, { count: summary.added }));
  }
  if (summary.removed > 0) {
    const key = routine ? "summary.removedExercises" : "summary.removedRoutines";
    parts.push(t(key, { count: summary.removed }));
  }
  for (const [field, count] of Object.entries(summary.fields)) {
    parts.push(t("summary.changedField", { field: fieldLabel(field), count }));
  }
  if (summary.moved > 0) parts.push(t("summary.moved", { count: summary.moved }));
  return <>{parts.join(t("separator"))}</>;
}
