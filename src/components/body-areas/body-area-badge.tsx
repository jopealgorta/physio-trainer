import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { BodyArea, BodySide } from "@/lib/body-areas";

/** Small label for a body area, e.g. "Knee · Left" (spec 02). */
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
      {side ? t("withSide", { area: areaLabel, side: t(`sides.${side}`) }) : areaLabel}
    </Badge>
  );
}
