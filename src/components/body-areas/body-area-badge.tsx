import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { BodyArea, BodySide } from "@/lib/body-areas";

/**
 * Small label for a body area, e.g. "Knee · Left" (spec 02). `withSide` selects on the raw
 * side key so the side phrase agrees whatever the area's grammatical gender (es: "lado …").
 */
export function BodyAreaBadge({
  area,
  side,
  className,
}: {
  area: BodyArea;
  side?: BodySide | null;
  className?: string;
}) {
  const t = useTranslations("BodyAreas");
  const areaLabel = t(`areas.${area}`);
  return (
    <Badge variant="secondary" className={className}>
      {side ? t("withSide", { area: areaLabel, side }) : areaLabel}
    </Badge>
  );
}
