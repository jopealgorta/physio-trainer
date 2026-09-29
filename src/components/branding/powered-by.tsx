import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/** Small app credit on patient-facing surfaces (spec 09: not fully white-label). */
export function PoweredBy({ className }: { className?: string }) {
  const t = useTranslations("Branding");
  return <p className={cn("text-muted-foreground text-xs", className)}>{t("poweredBy")}</p>;
}
