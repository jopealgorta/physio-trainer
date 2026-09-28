import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import {
  MAP_HEIGHT,
  MAP_REGIONS,
  MAP_WIDTH,
  type BodyView,
  type MapRegion,
} from "./body-map-regions";

type BodyMapProps = {
  view: BodyView;
  isSelected: (region: MapRegion) => boolean;
  onRegionClick: (region: MapRegion) => void;
  className?: string;
};

/**
 * One view of the body map. Regions are announced to screen readers but are not tab stops:
 * the picker's list is the keyboard path (spec 02, behaviour rule 3).
 */
export function BodyMap({ view, isSelected, onRegionClick, className }: BodyMapProps) {
  const t = useTranslations("BodyAreas");

  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="group"
      aria-label={t(`picker.${view}`)}
      className={cn("h-auto w-full", className)}
    >
      {MAP_REGIONS.filter((region) => region.view === view).map((region) => {
        const selected = isSelected(region);
        const areaLabel = t(`areas.${region.area}`);
        const label = region.side
          ? t("withSide", { area: areaLabel, side: region.side })
          : areaLabel;
        const props = {
          role: "checkbox" as const,
          "aria-checked": selected,
          "aria-label": label,
          "data-region": region.id,
          onClick: () => onRegionClick(region),
          className: cn(
            "cursor-pointer stroke-1 transition-colors motion-reduce:transition-none",
            selected
              ? "fill-primary stroke-primary"
              : "fill-muted-foreground/15 stroke-muted-foreground/35 hover:fill-primary/30",
          ),
        };
        const { shape } = region;
        return shape.kind === "rect" ? (
          <rect
            key={region.id}
            {...props}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            rx={shape.radius}
          />
        ) : (
          <ellipse
            key={region.id}
            {...props}
            cx={shape.cx}
            cy={shape.cy}
            rx={shape.rx}
            ry={shape.ry}
          />
        );
      })}
    </svg>
  );
}
