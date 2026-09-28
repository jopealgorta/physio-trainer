"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  BODY_AREAS,
  BODY_SIDES,
  type BodyArea,
  type BodyAreaSelection,
  type BodySide,
  CASE_BODY_AREAS,
  coversRegion,
  isPairedArea,
  selectArea,
  toggleArea,
} from "@/lib/body-areas";
import { cn } from "@/lib/utils";

import { BodyMap } from "./body-map";
import { BODY_VIEWS, type BodyView } from "./body-map-regions";

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
 * Body-area picker (spec 02): a clickable front/back body map plus an always-rendered list.
 * Multi mode tags exercises; single mode records an injury's area (and side with `withSide`).
 * Renders hidden inputs when `name` is set, so it works inside a native <form>.
 */
export function BodyAreaPicker(props: BodyAreaPickerProps) {
  return props.mode === "multi" ? <MultiPicker {...props} /> : <SinglePicker {...props} />;
}

function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void,
): [T, (next: T) => void] {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const set = (next: T) => {
    if (!controlled) setInner(next);
    onChange?.(next);
  };
  return [current, set];
}

function PickerLayout({
  legend,
  className,
  renderMap,
  children,
}: {
  legend: string;
  className?: string;
  renderMap: (view: BodyView) => ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("BodyAreas.picker");
  const [view, setView] = useState<BodyView>("front");

  return (
    <fieldset className={cn("flex min-w-0 flex-col gap-4", className)}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div role="group" aria-label={t("map")} className="flex gap-1 md:hidden">
        {BODY_VIEWS.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={view === option ? "secondary" : "ghost"}
            aria-pressed={view === option}
            onClick={() => setView(option)}
          >
            {t(option)}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-1 justify-items-center gap-6 md:grid-cols-2">
        {BODY_VIEWS.map((option) => (
          <div
            key={option}
            className={cn(
              "w-full max-w-44 flex-col items-center gap-2",
              option === view ? "flex" : "hidden md:flex",
            )}
          >
            {renderMap(option)}
            <span aria-hidden className="text-muted-foreground text-xs">
              {t(option)}
            </span>
          </div>
        ))}
      </div>
      {children}
    </fieldset>
  );
}

const LIST_CLASS = "grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3";

function MultiPicker({
  value,
  defaultValue = [],
  onChange,
  name,
  label,
  className,
}: MultiBodyAreaPickerProps) {
  const t = useTranslations("BodyAreas");
  const id = useId();
  const [areas, setAreas] = useControllable(value, defaultValue, onChange);
  const toggle = (area: BodyArea) => setAreas(toggleArea(areas, area));

  return (
    <PickerLayout
      legend={label ?? t("picker.areasLabel")}
      className={className}
      renderMap={(view) => (
        <BodyMap
          view={view}
          isSelected={(region) => areas.includes(region.area)}
          onRegionClick={(region) => toggle(region.area)}
        />
      )}
    >
      <ul className={LIST_CLASS}>
        {BODY_AREAS.map((area) => (
          <li key={area} className="flex items-center gap-2">
            <Checkbox
              id={`${id}-${area}`}
              checked={areas.includes(area)}
              onCheckedChange={() => toggle(area)}
            />
            <Label htmlFor={`${id}-${area}`}>{t(`areas.${area}`)}</Label>
          </li>
        ))}
      </ul>
      {name && areas.map((area) => <input key={area} type="hidden" name={name} value={area} />)}
    </PickerLayout>
  );
}

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
  const id = useId();
  const [selection, setSelection] = useControllable(value, defaultValue, onChange);
  const legend = label ?? t("picker.areaLabel");
  const showSide = withSide && selection !== null && isPairedArea(selection.area);

  return (
    <PickerLayout
      legend={legend}
      className={className}
      renderMap={(view) => (
        <BodyMap
          view={view}
          isSelected={(region) => coversRegion(selection, region.area, region.side)}
          onRegionClick={(region) =>
            setSelection(selectArea(selection, region.area, region.side, withSide))
          }
        />
      )}
    >
      <RadioGroup
        aria-label={legend}
        value={selection?.area ?? ""}
        onValueChange={(area) =>
          setSelection(selectArea(selection, area as BodyArea, null, withSide))
        }
        className={LIST_CLASS}
      >
        {CASE_BODY_AREAS.map((area) => (
          <div key={area} className="flex items-center gap-2">
            <RadioGroupItem id={`${id}-${area}`} value={area} />
            <Label htmlFor={`${id}-${area}`}>{t(`areas.${area}`)}</Label>
          </div>
        ))}
      </RadioGroup>
      {showSide && (
        <div className="flex flex-col gap-2">
          <span id={`${id}-side`} className="text-sm font-medium">
            {t("picker.sideLabel")}
          </span>
          <RadioGroup
            aria-labelledby={`${id}-side`}
            value={selection.side ?? ""}
            onValueChange={(side) => setSelection({ area: selection.area, side: side as BodySide })}
            className="flex gap-4"
          >
            {BODY_SIDES.map((side) => (
              <div key={side} className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-side-${side}`} value={side} />
                <Label htmlFor={`${id}-side-${side}`}>{t(`sides.${side}`)}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      )}
      {selection && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setSelection(null)}
        >
          {t("picker.clear")}
        </Button>
      )}
      {name && <input type="hidden" name={name} value={selection?.area ?? ""} />}
      {withSide && sideName && (
        <input type="hidden" name={sideName} value={selection?.side ?? ""} />
      )}
    </PickerLayout>
  );
}
