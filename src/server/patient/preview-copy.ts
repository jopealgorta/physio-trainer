import type { ShareTarget } from "@/lib/share-links";

type MetaKey =
  | "title"
  | "titleWithClinic"
  | "imageAlt"
  | "imageAltTitled"
  | "description.customer"
  | "description.routine"
  | "description.weeklyPlan";
/** The `Patient.meta` translator. */
type Translate = (key: MetaKey, values?: { title?: string; clinic?: string }) => string;

/**
 * The text a patient link unfurls into (spec 11), from the `Patient.meta` translator. The title
 * is the routine's or plan's name followed by the clinic (the display name when the physio has no
 * clinic name, see `getBranding`); the description never names anyone. A customer-level link has
 * no single item, so it stays generic: its "item name" is the patient's.
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
  const clinic = clinicName.trim();
  const headline = title ?? t("title");
  const description = {
    customer: "description.customer",
    routine: "description.routine",
    weekly_plan: "description.weeklyPlan",
  } as const;
  return {
    title: clinic ? t("titleWithClinic", { title: headline, clinic }) : headline,
    description: t(title ? description[target] : "description.customer"),
    imageAlt: title
      ? t("imageAltTitled", { title, clinic: clinicName })
      : t("imageAlt", { clinic: clinicName }),
  };
}
