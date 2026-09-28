"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  BODY_AREAS,
  BODY_SIDES,
  type BodyArea,
  type BodyAreaSelection,
  bodySideSchema,
  CASE_BODY_AREAS,
  caseBodyAreaSchema,
  coversRegion,
  isPairedArea,
  selectArea,
  setArea,
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

/**
 * Whether the form around `fieldsetRef` is in the middle of dispatching `reset`.
 *
 * React 19 calls `form.reset()` after every `<form action={fn}>` action, and Radix's Checkbox
 * and RadioGroup answer a reset by calling onCheckedChange/onValueChange with the value they
 * mounted with. The picker keeps its value across a reset, so changes reported during one are
 * ignored. `reset` is dispatched synchronously and bubbles, and the listeners sit on the
 * document: its capture listener runs before every listener on the form and its bubble listener
 * after all of them, whatever order they were added in (Radix adds its own on a later render).
 */
function useFormResetGuard(fieldsetRef: RefObject<HTMLFieldSetElement | null>): () => boolean {
  const resetting = useRef(false);
  useEffect(() => {
    const doc = fieldsetRef.current?.ownerDocument;
    if (!doc) return;
    // Resolved per event, so it follows the fieldset if its form owner changes.
    const isOwnForm = (event: Event) =>
      event.target !== null && event.target === fieldsetRef.current?.form;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      clearTimeout(fallback);
      resetting.current = false;
    };
    const start = (event: Event) => {
      if (!isOwnForm(event)) return;
      resetting.current = true;
      // Backstop for a reset listener that stops propagation before the bubble listener runs.
      fallback = setTimeout(end, 0);
    };
    const finish = (event: Event) => {
      if (isOwnForm(event)) end();
    };
    doc.addEventListener("reset", start, true);
    doc.addEventListener("reset", finish);
    return () => {
      doc.removeEventListener("reset", start, true);
      doc.removeEventListener("reset", finish);
      end();
    };
  }, [fieldsetRef]);
  return () => resetting.current;
}

/** Value state that is controlled when `value` is set, and ignores changes during a form reset. */
function usePickerValue<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void,
): [T, (next: T) => void, RefObject<HTMLFieldSetElement | null>] {
  const [inner, setInner] = useState(defaultValue);
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const isResetting = useFormResetGuard(fieldsetRef);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const set = (next: T) => {
    if (isResetting()) return;
    if (!controlled) setInner(next);
    onChange?.(next);
  };
  return [current, set, fieldsetRef];
}

function PickerLayout({
  fieldsetRef,
  legend,
  className,
  renderMap,
  children,
}: {
  fieldsetRef: RefObject<HTMLFieldSetElement | null>;
  legend: string;
  className?: string;
  renderMap: (view: BodyView) => ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("BodyAreas.picker");
  const [view, setView] = useState<BodyView>("front");

  // Breakpoints follow the picker's own width (container queries), not the viewport, so it lays
  // out the same on a page and inside a narrow sheet or dialog. The container is a plain div:
  // fieldset layout is special-cased in browsers, so it is kept out of the containment.
  return (
    <fieldset ref={fieldsetRef} className={cn("min-w-0", className)}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="@container flex flex-col gap-4">
        <div role="group" aria-label={t("map")} className="flex gap-1 @md:hidden">
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
        <div className="grid grid-cols-1 justify-items-center gap-6 @md:grid-cols-2">
          {BODY_VIEWS.map((option) => (
            <div
              key={option}
              className={cn(
                // One view at a time gets more room, for bigger touch targets.
                "w-full max-w-60 flex-col items-center gap-2 @md:max-w-44",
                option === view ? "flex" : "hidden @md:flex",
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
      </div>
    </fieldset>
  );
}

const LIST_CLASS = "grid grid-cols-1 gap-x-4 gap-y-2 @sm:grid-cols-2 @3xl:grid-cols-3";

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
  const [areas, setAreas, fieldsetRef] = usePickerValue(value, defaultValue, onChange);

  return (
    <PickerLayout
      fieldsetRef={fieldsetRef}
      legend={label ?? t("picker.areasLabel")}
      className={className}
      renderMap={(view) => (
        <BodyMap
          view={view}
          isSelected={(region) => areas.includes(region.area)}
          onRegionClick={(region) => setAreas(toggleArea(areas, region.area))}
        />
      )}
    >
      <ul className={LIST_CLASS}>
        {BODY_AREAS.map((area) => (
          <li key={area} className="flex items-center gap-2">
            <Checkbox
              id={`${id}-${area}`}
              checked={areas.includes(area)}
              // Set, don't toggle: the reported state is the source of truth.
              onCheckedChange={(checked) => setAreas(setArea(areas, area, checked === true))}
            />
            <Label htmlFor={`${id}-${area}`}>{t(`areas.${area}`)}</Label>
          </li>
        ))}
      </ul>
      {name &&
        BODY_AREAS.filter((area) => areas.includes(area)).map((area) => (
          <input key={area} type="hidden" name={name} value={area} />
        ))}
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
  const [selection, setSelection, fieldsetRef] = usePickerValue(value, defaultValue, onChange);
  const showSide = withSide && selection !== null && isPairedArea(selection.area);

  return (
    <PickerLayout
      fieldsetRef={fieldsetRef}
      legend={label ?? t("picker.areaLabel")}
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
      {/* Named by the fieldset's legend. */}
      <RadioGroup
        value={selection?.area ?? ""}
        onValueChange={(raw) => {
          const area = caseBodyAreaSchema.safeParse(raw);
          if (area.success) setSelection(selectArea(selection, area.data, null, withSide));
        }}
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
            onValueChange={(raw) => {
              const side = bodySideSchema.safeParse(raw);
              if (side.success) setSelection({ area: selection.area, side: side.data });
            }}
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
