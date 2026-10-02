import { createTranslator } from "next-intl";

import type { Locale } from "@/i18n/config";
import type { PrescriptionTranslate } from "@/lib/prescription";

export type ExportKey =
  | "menu.trigger"
  | "menu.pdf"
  | "menu.xlsx"
  | "menu.tracking"
  | "patient.download"
  | "pdf.allTitle"
  | "pdf.forCustomer"
  | "pdf.generatedOn"
  | "pdf.phase"
  | "pdf.dateRange"
  | "pdf.from"
  | "pdf.until"
  | "pdf.week"
  | "pdf.restDay"
  | "pdf.superset"
  | "pdf.supersetRest"
  | "pdf.sessions"
  | "pdf.sessionsPerDay"
  | "pdf.notes"
  | "pdf.track"
  | "pdf.nothing"
  | "pdf.scan"
  | "pdf.page"
  | "xlsx.overview"
  | "xlsx.clinic"
  | "xlsx.customer"
  | "xlsx.generated"
  | "xlsx.day"
  | "xlsx.routines"
  | "xlsx.standalone"
  | "xlsx.sheetFallback"
  | "xlsx.columns.group"
  | "xlsx.columns.exercise"
  | "xlsx.columns.sets"
  | "xlsx.columns.reps"
  | "xlsx.columns.hold"
  | "xlsx.columns.duration"
  | "xlsx.columns.rest"
  | "xlsx.columns.load"
  | "xlsx.columns.side"
  | "xlsx.columns.notes"
  | "xlsx.columns.instructions"
  | "xlsx.columns.video";

export type ExportTranslate = (key: ExportKey, values?: Record<string, string | number>) => string;

/**
 * "3 sessions a week · 2 times a day": the parts that are set (and not zero), joined as on the
 * patient page; null when neither is.
 */
export function frequencyLine(
  routine: { sessionsPerWeek: number | null; sessionsPerDay: number | null },
  t: ExportTranslate,
): string | null {
  const parts = [
    routine.sessionsPerWeek !== null ? t("pdf.sessions", { perWeek: routine.sessionsPerWeek }) : "",
    routine.sessionsPerDay !== null
      ? t("pdf.sessionsPerDay", { perDay: routine.sessionsPerDay })
      : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Translators that work outside a Next request (route handlers, tests): the
 * `Export` namespace and the `Prescription` summary strings.
 */
export async function exportTranslators(
  locale: Locale,
): Promise<{ t: ExportTranslate; summary: PrescriptionTranslate }> {
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  const exportT = createTranslator({ locale, messages, namespace: "Export" });
  const prescriptionT = createTranslator({ locale, messages, namespace: "Prescription" });
  return {
    t: (key, values) => exportT(key, values),
    summary: (key, values) => prescriptionT(key, values),
  };
}
