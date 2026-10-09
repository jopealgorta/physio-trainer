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
  /** The region under the pointer, or null when it leaves (for a caption beside the map). */
  onRegionHover?: (region: MapRegion | null) => void;
  className?: string;
};

/**
 * One view of the body map. Regions are announced to screen readers but are not tab stops:
 * the picker's chips are the keyboard path (spec 02, behaviour rule 3).
 * Regions are stroked in the popover colour, so neighbours read as one figure with thin seams.
 */
export function BodyMap({
  view,
  isSelected,
  onRegionClick,
  onRegionHover,
  className,
}: BodyMapProps) {
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
        return (
          <path
            key={region.id}
            d={region.shape.d}
            role="checkbox"
            aria-checked={selected}
            aria-label={label}
            data-region={region.id}
            onClick={() => onRegionClick(region)}
            onPointerEnter={() => onRegionHover?.(region)}
            onPointerLeave={() => onRegionHover?.(null)}
            className={cn(
              "stroke-popover cursor-pointer stroke-2 transition-colors duration-150 [stroke-linejoin:round] motion-reduce:transition-none",
              selected ? "fill-primary" : "fill-muted-foreground/20 hover:fill-primary/40",
            )}
          />
        );
      })}
    </svg>
  );
}
