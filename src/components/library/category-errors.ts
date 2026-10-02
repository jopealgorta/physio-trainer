"use client";

import { useTranslations } from "next-intl";

import { CATEGORY_NAME_MAX_LENGTH } from "@/lib/library-limits";
import type { CategoryError } from "@/server/library/schemas";

/** Keys of `Library.categories.errors`, shared by the manager and the exercise form's dialog. */
export type CategoryErrorKey =
  "nameRequired" | "nameTooLong" | "nameTaken" | "notFound" | "tooDeep" | "unknown";

export function categoryErrorKey(error: CategoryError): CategoryErrorKey {
  if (error === "parentNotFound") return "notFound";
  if (error === "mismatch" || error === "invalid") return "unknown";
  return error;
}

export function useCategoryErrorText() {
  const t = useTranslations("Library.categories.errors");
  return (key: CategoryErrorKey) =>
    key === "nameTooLong" ? t(key, { max: CATEGORY_NAME_MAX_LENGTH }) : t(key);
}
