"use client";

import { useTranslations } from "next-intl";

import type { PrescriptionTranslate } from "@/lib/prescription";

/** The `formatPrescription` translator, backed by the `Prescription` messages of the active locale. */
export function useSummaryTranslator(): PrescriptionTranslate {
  const t = useTranslations("Prescription");
  return (key, values) => t(key, values);
}
