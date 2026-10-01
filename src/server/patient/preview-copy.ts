import type { ShareTarget } from "@/lib/share-links";

type MetaKey =
  | "title"
  | "imageAlt"
  | "imageAltTitled"
  | "description.customer"
  | "description.routine"
  | "description.weeklyPlan";
/** The `Patient.meta` translator. */
type Translate = (key: MetaKey, values?: { title?: string; clinic?: string }) => string;

/**
 * The text a patient link unfurls into (spec 11), from the `Patient.meta` translator. The title
 * is the routine's or plan's name and the text never names the clinic (the card does); a
 * customer-level link has no single item, so it stays generic: its "item name" is the patient's.
 */
export function previewCopy(
  t: Translate,
  {
    target,
    itemTitle,
    clinicName,
  }: { target: ShareTarget; itemTitle: string | null; clinicName: string },
): { title: string; description: string; imageAlt: string } {
  const title = target === "customer" ? null : itemTitle;
  const description = {
    customer: "description.customer",
    routine: "description.routine",
    weekly_plan: "description.weeklyPlan",
  } as const;
  return {
    title: title ?? t("title"),
    description: t(title ? description[target] : "description.customer"),
    imageAlt: title
      ? t("imageAltTitled", { title, clinic: clinicName })
      : t("imageAlt", { clinic: clinicName }),
  };
}
