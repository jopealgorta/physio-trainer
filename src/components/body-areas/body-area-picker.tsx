"use client";

import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  BODY_AREA_GROUPS,
  BODY_AREAS,
  type BodyArea,
  type BodyAreaSelection,
  type BodySide,
  bodyAreaSchema,
  bodySideSchema,
  caseBodyAreaSchema,
  coversRegion,
  isPairedArea,
  selectArea,
  toggleArea,
} from "@/lib/body-areas";
import { cn } from "@/lib/utils";

import { BodyAreaBadge } from "./body-area-badge";
import { BodyMap } from "./body-map";
import { BODY_VIEWS, type BodyView, type MapRegion } from "./body-map-regions";

type CommonProps = { name?: string; label?: string; className?: string };

export type MultiBodyAreaPickerProps = CommonProps & {
  mode: "multi";
  value?: BodyArea[];
  defaultValue?: BodyArea[];
  onChange?: (value: BodyArea[]) => void;
};

export type SingleBodyAreaPickerProps = CommonProps & {
  mode: "single";
  /** Record left/right/both for paired areas (injury cases). */
  withSide?: boolean;
  /** Hidden input name for the side. Defaults to `${name}Side`. */
  sideName?: string;
  value?: BodyAreaSelection | null;
  defaultValue?: BodyAreaSelection | null;
  onChange?: (value: BodyAreaSelection | null) => void;
};

export type BodyAreaPickerProps = MultiBodyAreaPickerProps | SingleBodyAreaPickerProps;

/**
 * Body-area picker (spec 02): a compact field that opens a popover (a bottom sheet on phones)
 * with a clickable front/back body map beside chips grouped by region. Multi mode tags
 * exercises; single mode records an injury's area (and side with `withSide`).
 * Renders hidden inputs next to the field when `name` is set, so it works inside a native
 * <form> even though the popover itself is portalled out of it.
 */
export function BodyAreaPicker(props: BodyAreaPickerProps) {
  return props.mode === "multi" ? <MultiPicker {...props} /> : <SinglePicker {...props} />;
}

/** Value state that is controlled when `value` is set. */
function usePickerValue<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void,
): [T, (next: T) => void] {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const set = (next: T) => {
    if (!controlled) setInner(next);
    onChange?.(next);
  };
  return [controlled ? value : inner, set];
}

// Chips: pills that fill with the accent colour when chosen. Radix marks a chosen chip with
// data-state="on" (and aria-pressed in multi mode, aria-checked in single mode).
const CHIP_CLASS =
  "h-7 rounded-full border border-border px-3 text-xs font-normal hover:bg-muted data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground aria-pressed:bg-primary data-[state=on]:hover:bg-primary/90";

const SEGMENT_CLASS =
  "h-7 px-3 text-xs font-normal data-[state=on]:bg-muted data-[state=on]:text-foreground";

// The side is part of the value, so a chosen side fills like a chosen chip; the view toggle above
// the map only changes what is shown, so it stays muted.
const SIDE_CLASS = cn(
  SEGMENT_CLASS,
  "data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90",
);

function PickerShell({
  label,
  placeholder,
  summary,
  summaryText,
  className,
  hiddenInputs,
  isSelected,
  onRegionClick,
  chips,
  extra,
  onClear,
}: {
  label: string;
  placeholder: string;
  /** What the closed field shows; null when nothing is chosen. */
  summary: ReactNode;
  /** The same as text, for the field's accessible name. */
  summaryText: string;
  className?: string;
  hiddenInputs: ReactNode;
  isSelected: (region: MapRegion) => boolean;
  onRegionClick: (region: MapRegion) => void;
  chips: ReactNode;
  extra?: ReactNode;
  /** Shown as "Clear" while something is chosen. */
  onClear?: () => void;
}) {
  const t = useTranslations("BodyAreas");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<BodyView>("front");
  const [hovered, setHovered] = useState<MapRegion | null>(null);
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const regionLabel = (region: MapRegion) => {
    const area = t(`areas.${region.area}`);
    return region.side ? t("withSide", { area, side: region.side }) : area;
  };

  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <Label id={labelId} htmlFor={`${id}-trigger`}>
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={`${id}-trigger`}
            type="button"
            variant="outline"
            aria-labelledby={`${labelId} ${valueId}`}
            className="h-auto min-h-9 w-full justify-between gap-2 py-1.5 font-normal"
          >
            <span id={valueId} className="sr-only">
              {summaryText || placeholder}
            </span>
            <span aria-hidden className="flex min-w-0 flex-1 flex-wrap gap-1">
              {summary ?? <span className="text-muted-foreground">{placeholder}</span>}
            </span>
            <ChevronDownIcon aria-hidden className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="sm:max-h-(--radix-popover-content-available-height) sm:w-[38rem] sm:overflow-y-auto sm:p-4">
          {/* Title and actions share one row: the panel must fit below a field mid-form. */}
          <div className="flex items-center gap-2">
            <PopoverTitle className="mr-auto text-sm">{label}</PopoverTitle>
            {onClear && (
              <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                {t("picker.clear")}
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              {t("picker.done")}
            </Button>
          </div>
          <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
            <div className="flex flex-col items-center gap-3">
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                aria-label={t("picker.map")}
                value={view}
                onValueChange={(raw) => {
                  const next = BODY_VIEWS.find((option) => option === raw);
                  if (next) setView(next);
                }}
              >
                {BODY_VIEWS.map((option) => (
                  <ToggleGroupItem key={option} value={option} className={SEGMENT_CLASS}>
                    {t(`picker.${option}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <BodyMap
                view={view}
                isSelected={isSelected}
                onRegionClick={onRegionClick}
                onRegionHover={setHovered}
              />
              <p aria-hidden className="text-muted-foreground min-h-8 text-center text-xs/4">
                {hovered ? regionLabel(hovered) : t("picker.hint")}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              {chips}
              {extra}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {hiddenInputs}
    </div>
  );
}

/** The chip groups (Upper body, Trunk, …), each a labelled group of `ToggleGroupItem`s. */
function ChipGroups({ areas }: { areas: readonly BodyArea[] }) {
  const t = useTranslations("BodyAreas");
  return BODY_AREA_GROUPS.map((group) => {
    const shown = group.areas.filter((area: BodyArea) => areas.includes(area));
    if (shown.length === 0) return null;
    return (
      <div
        key={group.id}
        role="group"
        aria-label={t(`groups.${group.id}`)}
        className="grid gap-1.5"
      >
        <span aria-hidden className="text-muted-foreground text-[0.6875rem] font-medium">
          {t(`groups.${group.id}`)}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {shown.map((area) => (
            <ToggleGroupItem key={area} value={area} className={CHIP_CLASS}>
              {t(`areas.${area}`)}
            </ToggleGroupItem>
          ))}
        </div>
      </div>
    );
  });
}

// One ToggleGroup holds every chip, so arrow keys move across the groups.
const CHIPS_ROOT_CLASS = "w-full flex-col items-stretch gap-3";

function MultiPicker({
  value,
  defaultValue = [],
  onChange,
  name,
  label,
  className,
}: MultiBodyAreaPickerProps) {
  const t = useTranslations("BodyAreas");
  const [areas, setAreas] = usePickerValue(value, defaultValue, onChange);
  const chosen = BODY_AREAS.filter((area) => areas.includes(area));

  return (
    <PickerShell
      label={label ?? t("picker.areasLabel")}
      placeholder={t("picker.placeholderMulti")}
      summary={
        chosen.length > 0 ? chosen.map((area) => <BodyAreaBadge key={area} area={area} />) : null
      }
      summaryText={chosen.map((area) => t(`areas.${area}`)).join(", ")}
      className={className}
      hiddenInputs={
        name && chosen.map((area) => <input key={area} type="hidden" name={name} value={area} />)
      }
      isSelected={(region) => areas.includes(region.area)}
      onRegionClick={(region) => setAreas(toggleArea(areas, region.area))}
      onClear={chosen.length > 0 ? () => setAreas([]) : undefined}
      chips={
        <ToggleGroup
          type="multiple"
          aria-label={label ?? t("picker.areasLabel")}
          value={chosen}
          onValueChange={(raw) => {
            const next = new Set(raw.flatMap((item) => bodyAreaSchema.safeParse(item).data ?? []));
            setAreas(BODY_AREAS.filter((area) => next.has(area)));
          }}
          className={CHIPS_ROOT_CLASS}
        >
          <ChipGroups areas={BODY_AREAS} />
        </ToggleGroup>
      }
    />
  );
}

// Left, both, right: the order a physio says it in, independent of which way the map faces.
const SIDE_ORDER: readonly BodySide[] = ["left", "both", "right"];

function SinglePicker({
  value,
  defaultValue = null,
  onChange,
  withSide = false,
  name,
  sideName = name ? `${name}Side` : undefined,
  label,
  className,
}: SingleBodyAreaPickerProps) {
  const t = useTranslations("BodyAreas");
  const [selection, setSelection] = usePickerValue(value, defaultValue, onChange);
  const showSide = withSide && selection !== null && isPairedArea(selection.area);
  const summaryText = selection
    ? selection.side && withSide
      ? t("withSide", { area: t(`areas.${selection.area}`), side: selection.side })
      : t(`areas.${selection.area}`)
    : "";

  return (
    <PickerShell
      label={label ?? t("picker.areaLabel")}
      placeholder={t("picker.placeholderSingle")}
      summary={
        selection ? (
          <BodyAreaBadge area={selection.area} side={withSide ? selection.side : null} />
        ) : null
      }
      summaryText={summaryText}
      className={className}
      hiddenInputs={
        <>
          {name && <input type="hidden" name={name} value={selection?.area ?? ""} />}
          {withSide && sideName && (
            <input type="hidden" name={sideName} value={selection?.side ?? ""} />
          )}
        </>
      }
      isSelected={(region) => coversRegion(selection, region.area, region.side)}
      onRegionClick={(region) =>
        setSelection(selectArea(selection, region.area, region.side, withSide))
      }
      onClear={selection ? () => setSelection(null) : undefined}
      chips={
        <ToggleGroup
          type="single"
          aria-label={label ?? t("picker.areaLabel")}
          value={selection?.area ?? ""}
          onValueChange={(raw) => {
            // Choosing the selected chip again reports "": that clears the selection.
            if (raw === "") return setSelection(null);
            const area = caseBodyAreaSchema.safeParse(raw);
            if (area.success) setSelection(selectArea(selection, area.data, null, withSide));
          }}
          className={CHIPS_ROOT_CLASS}
        >
          <ChipGroups areas={BODY_AREAS.filter((area) => area !== "full_body")} />
        </ToggleGroup>
      }
      extra={
        showSide && (
          <div className="grid gap-1.5">
            <span aria-hidden className="text-muted-foreground text-[0.6875rem] font-medium">
              {t("picker.sideLabel")}
            </span>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              aria-label={t("picker.sideLabel")}
              value={selection.side ?? ""}
              onValueChange={(raw) => {
                const side = bodySideSchema.safeParse(raw);
                setSelection({ area: selection.area, side: side.success ? side.data : null });
              }}
            >
              {SIDE_ORDER.map((side) => (
                <ToggleGroupItem key={side} value={side} className={SIDE_CLASS}>
                  {t(`sides.${side}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )
      }
    />
  );
}
