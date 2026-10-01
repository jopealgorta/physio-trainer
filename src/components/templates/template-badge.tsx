import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

/** Marks a routine or plan that belongs to no customer. */
export function TemplateBadge() {
  const t = useTranslations("Templates");
  return <Badge variant="outline">{t("badge")}</Badge>;
}
